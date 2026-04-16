import * as vscode from 'vscode';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { ScanResult } from './types';
import { DashboardPanel } from './DashboardPanel';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const RISK_ICON: Record<RiskLevel, string> = {
    low:      '$(pass-filled)',
    medium:   '$(warning)',
    high:     '$(error)',
    critical: '$(flame)',
};

// ── Persistent core process ───────────────────────────────────────────────────
//
// Instead of spawning a new `node depscope-core` process per intercept (which
// adds ~500-800 ms of cold-start latency), we keep one process alive.  It reads
// newline-delimited JSON requests from stdin and writes newline-delimited JSON
// responses to stdout, staying alive between requests.

class WarmCoreProcess {
    private child: child_process.ChildProcess | null = null;
    private buffer = '';
    private pending: ((result: ScanResult | null) => void) | null = null;

    constructor(private readonly coreScript: string) {}

    /** Spawn the process and send a ping so Node.js JIT-compiles the modules. */
    start(): void {
        if (this.child) return;

        this.child = child_process.spawn('node', [this.coreScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.child.stdout!.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString();
            // Each response is one JSON line
            const nl = this.buffer.indexOf('\n');
            if (nl === -1) return;
            const line = this.buffer.slice(0, nl);
            this.buffer = this.buffer.slice(nl + 1);

            if (!this.pending) return; // ping warmup response — discard
            const resolve = this.pending;
            this.pending = null;
            try {
                const res = JSON.parse(line);
                resolve(res.success && res.result ? (res.result as ScanResult) : null);
            } catch { resolve(null); }
        });

        const onDead = () => {
            this.child = null;
            this.pending?.(null);
            this.pending = null;
        };
        this.child.on('close', onDead);
        this.child.on('error', onDead);

        // Warmup ping — causes Node to load and JIT all modules now, not at first intercept
        this.child.stdin!.write(JSON.stringify({ type: 'ping' }) + '\n');
    }

    async request(req: unknown): Promise<ScanResult | null> {
        // Restart if dead
        if (!this.child) {
            this.start();
            if (!this.child) return null;
        }
        return new Promise(resolve => {
            this.pending = resolve;
            this.child!.stdin!.write(JSON.stringify(req) + '\n');
        });
    }

    stop(): void {
        this.child?.stdin?.end();
        this.child = null;
        this.pending = null;
    }
}

// ── InstallInterceptor ────────────────────────────────────────────────────────

/** Intercepts package-manager install commands typed in VS Code terminals.
 *
 * Flow:
 *  1. At activation a TCP server starts and a warm core process is pre-spawned.
 *  2. Shim scripts (npm/yarn/pnpm/flutter) are written to /tmp/depscope-bin/.
 *  3. ZDOTDIR is pointed at /tmp/depscope-zdotdir/ via environmentVariableCollection.
 *     Our .zshrc stub sources ~/.zshrc (which runs path_helper) and THEN prepends
 *     /tmp/depscope-bin to PATH — correct ordering, path_helper can't undo it.
 *  4. onDidOpenTerminal + 800ms delay injects the same PATH prepend for bash
 *     terminals and as a belt-and-suspenders fallback.
 *  5. On `npm install <pkg>` our shim calls intercept-helper.js → TCP server.
 *  6. The dashboard is opened immediately and shows an "Analyzing…" spinner.
 *  7. Analysis runs via the already-warm core process (no cold start).
 *  8. The result is pushed to the dashboard; user clicks Continue or Cancel.
 *  9. The socket receives the decision: shim exits 0 (proceed) or 1 (cancel).
 */
export class InstallInterceptor implements vscode.Disposable {
    private server: net.Server | null = null;
    private port = 0;
    private warmCore: WarmCoreProcess | null = null;
    private readonly helperScriptPath: string;
    /** Directory containing shim executables. */
    private readonly shimDir: string;
    /** ZDOTDIR used to inject PATH prepend into zsh at startup. */
    private readonly zdotdir: string;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.helperScriptPath = path.join(
            context.extensionPath,
            'src',
            'intercept-helper.js',
        );
        this.shimDir  = path.join(os.tmpdir(), 'depscope-bin');
        this.zdotdir  = path.join(os.tmpdir(), 'depscope-zdotdir');
    }

    // ── Public API ────────────────────────────────────────────────────────────

    activate(): void {
        const cfg = vscode.workspace.getConfiguration('depscope');
        if (!cfg.get<boolean>('interceptInstalls', true)) return;

        this.prewarmCore();          // start node process NOW — no cold start on first intercept

        this.startServer().then(() => {
            this.writeShims();
            this.writeZdotdir();
            this.setupEnvironmentCollection();
            // sendText catch-up for terminals already open when we activated
            for (const t of vscode.window.terminals) {
                this.injectIntoTerminal(t);
            }
        });

        // 800 ms delay: shell needs to finish sourcing its startup files
        // (including /etc/zprofile → path_helper) before our PATH export runs.
        // Also handles bash terminals where ZDOTDIR has no effect.
        this.disposables.push(
            vscode.window.onDidOpenTerminal(t => {
                setTimeout(() => this.injectIntoTerminal(t), 800);
            }),
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (!e.affectsConfiguration('depscope.interceptInstalls')) return;
                const enabled = vscode.workspace.getConfiguration('depscope')
                    .get<boolean>('interceptInstalls', true);
                if (enabled) {
                    this.prewarmCore();
                    this.startServer().then(() => {
                        this.writeShims();
                        this.writeZdotdir();
                        this.setupEnvironmentCollection();
                        vscode.window.terminals.forEach(t => this.injectIntoTerminal(t));
                    });
                } else {
                    this.warmCore?.stop();
                    this.warmCore = null;
                    this.stopServer();
                    this.context.environmentVariableCollection.clear();
                }
            }),
        );
    }

    dispose(): void {
        this.warmCore?.stop();
        this.warmCore = null;
        this.stopServer();
        this.context.environmentVariableCollection.clear();
        this.disposables.forEach(d => d.dispose());
    }

    // ── Core process ──────────────────────────────────────────────────────────

    private prewarmCore(): void {
        const coreScript = this.resolveCoreScript();
        if (!coreScript) return;
        this.warmCore = new WarmCoreProcess(coreScript);
        this.warmCore.start();
    }

    private resolveCoreScript(): string | null {
        const candidates = [
            path.join(this.context.extensionPath, '..', 'depscope-core', 'dist', 'index.js'),
            path.join(this.context.extensionPath, 'dist', 'core', 'index.js'),
        ];
        return candidates.find(p => fs.existsSync(p)) ?? null;
    }

    // ── Server lifecycle ──────────────────────────────────────────────────────

    private startServer(): Promise<void> {
        if (this.server) return Promise.resolve();
        return new Promise(resolve => {
            // allowHalfOpen: true is critical.  The helper calls client.end() to
            // half-close its write side (sends TCP FIN) immediately after writing
            // the request.  With the default allowHalfOpen:false the server would
            // automatically close its own write side upon receiving that FIN —
            // before analysis completes — giving the helper an empty response and
            // unblocking the install immediately.  allowHalfOpen:true lets the
            // server keep its write side open so it can send the proceed/cancel
            // reply after the user makes a decision.
            this.server = net.createServer({ allowHalfOpen: true }, (socket: net.Socket) => this.handleConnection(socket));
            this.server.on('error', () => { this.server = null; resolve(); });
            this.server.listen(0, '127.0.0.1', () => {
                this.port = (this.server!.address() as net.AddressInfo).port;
                resolve();
            });
        });
    }

    private stopServer(): void {
        this.server?.close();
        this.server = null;
        this.port = 0;
    }

    // ── Shim scripts ──────────────────────────────────────────────────────────

    /**
     * Writes tiny executable shim scripts to shimDir.
     *
     * Each shim:
     *  1. Strips shimDir from PATH so `exec … npm "$@"` finds the REAL binary.
     *  2. For install subcommands with a named package, calls intercept-helper.js
     *     via Node.js and exits 1 if the user cancels.
     *  3. exec's the real binary with the original arguments.
     *
     * This works for every shell (bash, zsh, fish, sh…) because we're hooking at
     * the filesystem PATH level, not at the shell-function level.
     */
    private writeShims(): void {
        if (!fs.existsSync(this.shimDir)) fs.mkdirSync(this.shimDir, { recursive: true });

        this.writeShim('npm',  'npm',     ['install', 'i', 'add'], 'npm');
        this.writeShim('yarn', 'yarn',    ['add'],                  'npm');
        this.writeShim('pnpm', 'pnpm',    ['add', 'install', 'i'], 'npm');
        this.writeFlutterShim();
    }

    private writeShim(
        filename: string,
        cmd: string,
        installSubcmds: string[],
        ecosystem: string,
    ): void {
        const pattern = installSubcmds.map(s => `"${s}"`).join('|');
        // NOTE: TypeScript template literal rules:
        //   ${var}  → TS interpolation   (cmd, ecosystem, pattern)
        //   \${...} → literal bash ${...}
        //   $var    → literal bash $var  (no braces = not TS interpolation)
        const script = `#!/usr/bin/env bash
# DepScope shim for ${cmd} — written by VS Code extension, do not edit manually

# Strip this shim directory from PATH so the real ${cmd} is found below
_DS_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
_DS_PATH=""
while IFS= read -r -d ':' _DS_E; do
    [[ "$_DS_E" != "$_DS_DIR" ]] && _DS_PATH="$_DS_PATH:$_DS_E"
done <<< "\${PATH}:"
_DS_PATH="\${_DS_PATH#:}"

case "\${1:-}" in
    ${pattern})
        for _DS_A in "\${@:2}"; do
            [[ "$_DS_A" == -* ]] && continue
            # Found the package name — ask DepScope before proceeding
            if [[ -n "\${DEPSCOPE_PORT:-}" ]] \\
                && [[ -n "\${DEPSCOPE_HELPER_SCRIPT:-}" ]] \\
                && [[ -f "\${DEPSCOPE_HELPER_SCRIPT}" ]]; then
                node "\${DEPSCOPE_HELPER_SCRIPT}" "\${DEPSCOPE_PORT}" "$_DS_A" "${ecosystem}"
                _DS_RC=$?
                [[ $_DS_RC -eq 1 ]] && exit 1   # user cancelled
            fi
            break
        done
        ;;
esac

exec env PATH="$_DS_PATH" ${cmd} "$@"
`;
        const shimPath = path.join(this.shimDir, filename);
        fs.writeFileSync(shimPath, script);
        fs.chmodSync(shimPath, 0o755);
    }

    private writeFlutterShim(): void {
        const script = `#!/usr/bin/env bash
# DepScope shim for flutter — written by VS Code extension, do not edit manually

_DS_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
_DS_PATH=""
while IFS= read -r -d ':' _DS_E; do
    [[ "$_DS_E" != "$_DS_DIR" ]] && _DS_PATH="$_DS_PATH:$_DS_E"
done <<< "\${PATH}:"
_DS_PATH="\${_DS_PATH#:}"

if [[ "\${1:-}" == "pub" ]] && [[ "\${2:-}" == "add" ]]; then
    for _DS_A in "\${@:3}"; do
        [[ "$_DS_A" == -* ]] && continue
        if [[ -n "\${DEPSCOPE_PORT:-}" ]] \\
            && [[ -n "\${DEPSCOPE_HELPER_SCRIPT:-}" ]] \\
            && [[ -f "\${DEPSCOPE_HELPER_SCRIPT}" ]]; then
            node "\${DEPSCOPE_HELPER_SCRIPT}" "\${DEPSCOPE_PORT}" "$_DS_A" "flutter"
            _DS_RC=$?
            [[ $_DS_RC -eq 1 ]] && exit 1
        fi
        break
    done
fi

exec env PATH="$_DS_PATH" flutter "$@"
`;
        const shimPath = path.join(this.shimDir, 'flutter');
        fs.writeFileSync(shimPath, script);
        fs.chmodSync(shimPath, 0o755);
    }

    /**
     * Writes ZDOTDIR startup file stubs to /tmp/depscope-zdotdir/.
     *
     * Why ZDOTDIR instead of environmentVariableCollection PATH prepend:
     *   macOS /etc/zprofile calls `path_helper` which REBUILDS PATH from
     *   /etc/paths, pushing any pre-set dir to the END.  We must prepend
     *   AFTER path_helper runs.  Our .zshrc stub sources the real ~/.zshrc
     *   (which executes after .zprofile/path_helper) and THEN prepends the
     *   shim dir — so it reliably ends up first.
     */
    private writeZdotdir(): void {
        if (!fs.existsSync(this.zdotdir)) fs.mkdirSync(this.zdotdir, { recursive: true });

        const home = os.homedir();
        const sq   = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
        const sd   = sq(this.shimDir);

        // .zshenv — do NOT unset ZDOTDIR here; zsh still needs it for .zshrc
        fs.writeFileSync(path.join(this.zdotdir, '.zshenv'),
            `[[ -f ${sq(home + '/.zshenv')} ]] && source ${sq(home + '/.zshenv')}\n`);

        // .zprofile — path_helper runs inside ~/.zprofile on macOS
        fs.writeFileSync(path.join(this.zdotdir, '.zprofile'),
            `[[ -f ${sq(home + '/.zprofile')} ]] && source ${sq(home + '/.zprofile')}\n`);

        // .zshrc — unset ZDOTDIR, source user rc, THEN prepend shim dir
        fs.writeFileSync(path.join(this.zdotdir, '.zshrc'), [
            '# DepScope — injected by VS Code extension',
            'unset ZDOTDIR   # restore for child processes',
            `[[ -f ${sq(home + '/.zshrc')} ]] && source ${sq(home + '/.zshrc')}`,
            `export PATH=${sd}:"$PATH"   # prepend AFTER path_helper has run`,
        ].join('\n') + '\n');

        // .zlogin — sourced last in login shells
        fs.writeFileSync(path.join(this.zdotdir, '.zlogin'),
            `[[ -f ${sq(home + '/.zlogin')} ]] && source ${sq(home + '/.zlogin')}\n`);
    }

    /**
     * Sets ZDOTDIR, DEPSCOPE_PORT, and DEPSCOPE_HELPER_SCRIPT via
     * environmentVariableCollection so they are present in the process
     * environment before any new terminal's shell starts.
     * PATH is NOT touched here — path_helper would reorder it.
     */
    private setupEnvironmentCollection(): void {
        if (!this.port) return;

        const env = this.context.environmentVariableCollection;
        env.replace('ZDOTDIR',                this.zdotdir);
        env.replace('DEPSCOPE_PORT',          this.port.toString());
        env.replace('DEPSCOPE_HELPER_SCRIPT', this.helperScriptPath);
    }

    /**
     * Sends PATH prepend to a terminal via sendText.
     * For already-open terminals and for bash (where ZDOTDIR has no effect).
     * The 800ms delay in onDidOpenTerminal ensures the shell has finished
     * sourcing startup files (path_helper etc.) before this runs.
     */
    private injectIntoTerminal(terminal: vscode.Terminal): void {
        if (!this.port) return;
        const esc = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
        terminal.sendText(
            `export PATH=${esc(this.shimDir)}:"$PATH" ` +
            `DEPSCOPE_PORT=${this.port} ` +
            `DEPSCOPE_HELPER_SCRIPT=${esc(this.helperScriptPath)}`,
            true,
        );
    }

    // ── Socket handler ────────────────────────────────────────────────────────

    private handleConnection(socket: net.Socket): void {
        let buf = '';
        let handled = false;

        const handle = () => {
            if (handled) return;
            handled = true;
            this.processRequest(buf.trim(), socket);
        };

        socket.on('data', chunk => {
            buf += chunk.toString();
            // Process as soon as we have a complete JSON line — don't wait for EOF.
            // This is the primary trigger; 'end' below is a safety fallback.
            if (buf.includes('\n')) handle();
        });
        socket.on('end',   handle);   // fallback: client sent EOF without \n
        socket.on('error', () => {});
    }

    private async processRequest(raw: string, socket: net.Socket): Promise<void> {
        const reply = (proceed: boolean) => {
            try { socket.write(JSON.stringify({ proceed }) + '\n'); socket.end(); } catch {}
        };

        let pkgName: string;
        let ecosystem: string;
        try {
            const req = JSON.parse(raw);
            pkgName   = req.package;
            ecosystem = req.ecosystem || 'npm';
        } catch { return reply(true); }

        if (!pkgName) return reply(true);

        // ── 1. Open dashboard and post interceptStart immediately ─────────────
        DashboardPanel.createOrShow(this.context.extensionUri);
        DashboardPanel.postToWebview({ type: 'interceptStart', package: pkgName, ecosystem });

        // ── 2. Analyse via the already-warm core process ───────────────────────
        const result = await this.runSinglePackageAnalysis(pkgName, ecosystem);
        const dep = result?.dependencies?.find((d: any) => d.depth === 0)
                 ?? result?.dependencies?.[0]
                 ?? null;

        if (!dep) {
            // Analysis failed — do NOT auto-proceed. Ask the user explicitly.
            DashboardPanel.postToWebview({ type: 'interceptDismiss' });
            const choice = await vscode.window.showWarningMessage(
                `DepScope could not analyze "${pkgName}". Do you want to proceed with installation?`,
                { modal: true },
                'Continue Install',
                'Cancel Install',
            );
            return reply(choice === 'Continue Install');
        }

        // ── 3. Push result to webview and wait for user decision ──────────────
        DashboardPanel.postToWebview({ type: 'interceptReady', package: pkgName, dep });

        const proceed = await new Promise<boolean>(resolve => {
            DashboardPanel.pendingInterceptResolve = resolve;
            // Safety timeout: never block a terminal indefinitely.
            // The helper itself has a 30s hard limit, so 35s here lets the
            // helper's timer fire first and surface the right UX.
            setTimeout(() => {
                if (DashboardPanel.pendingInterceptResolve === resolve) {
                    DashboardPanel.pendingInterceptResolve = null;
                    resolve(false); // default to cancel on timeout
                }
            }, 35_000);
        });

        if (!proceed) DashboardPanel.postToWebview({ type: 'interceptDismiss' });
        reply(proceed);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private runSinglePackageAnalysis(packageName: string, ecosystem: string): Promise<ScanResult | null> {
        const cfg = vscode.workspace.getConfiguration('depscope');
        const req = {
            type:         'analyze',
            ecosystem,
            dependencies: [{ name: packageName, version: 'latest', isDev: false }],
            projectName:  packageName,
            maxDepth:     1,
            concurrency:  1,
            groqApiKey:   cfg.get<string>('groqApiKey')  || undefined,
            githubToken:  cfg.get<string>('githubToken') || undefined,
        };

        // Use the warm process when available; fall back to cold spawn
        if (this.warmCore) return this.warmCore.request(req);

        // Cold-start fallback (first run before prewarm finishes, or after crash)
        return new Promise(resolve => {
            const coreScript = this.resolveCoreScript();
            if (!coreScript) return resolve(null);
            const child = child_process.spawn('node', [coreScript], { stdio: ['pipe', 'pipe', 'pipe'] });
            let out = '';
            child.stdout.on('data', d => { out += d; });
            child.on('close', code => {
                if (code !== 0) return resolve(null);
                try {
                    const res = JSON.parse(out);
                    resolve(res.success && res.result ? res.result : null);
                } catch { resolve(null); }
            });
            child.on('error', () => resolve(null));
            child.stdin.write(JSON.stringify(req));
            child.stdin.end();
        });
    }
}
