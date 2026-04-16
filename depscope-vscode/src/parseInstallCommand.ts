/**
 * Parses a package-manager install command typed in the terminal and extracts
 * the target package name and ecosystem.
 *
 * This module is kept framework-free so it can be imported by unit tests without
 * pulling in the VS Code API.
 */

export type Ecosystem = 'npm' | 'flutter' | 'android';

export interface ParsedInstallCommand {
    /** Package name, version specifier stripped (e.g. "lodash", "@types/node"). */
    packageName: string;
    ecosystem: Ecosystem;
}

/**
 * Strips a version specifier from a package name token.
 *
 * Examples:
 *   "lodash@4.17.21"    → "lodash"
 *   "@types/node@20.0"  → "@types/node"
 *   "lodash"            → "lodash"
 */
export function stripVersion(token: string): string {
    if (token.startsWith('@')) {
        // Scoped package: "@scope/name" or "@scope/name@version"
        // Find the '@' after the first character
        const idx = token.indexOf('@', 1);
        return idx > 0 ? token.slice(0, idx) : token;
    }
    const idx = token.indexOf('@');
    return idx > 0 ? token.slice(0, idx) : token;
}

/**
 * Returns the first token in `args` that doesn't start with '-', or undefined.
 */
export function firstNonFlag(args: string[]): string | undefined {
    return args.find(a => !a.startsWith('-'));
}

/**
 * Attempts to parse a raw command string into a package name + ecosystem.
 *
 * Returns `null` when:
 * - The command is not a recognised install/add sub-command.
 * - No named package argument is present (e.g. bare `npm install` or `npm ci`).
 */
export function parseInstallCommand(command: string): ParsedInstallCommand | null {
    const tokens = command.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;

    const [tool, subcmd, ...rest] = tokens;

    // ── npm / yarn / pnpm ────────────────────────────────────────────────────
    if (tool === 'npm' || tool === 'yarn' || tool === 'pnpm') {
        const validSubcmds: Record<string, string[]> = {
            npm:  ['install', 'i', 'add'],
            yarn: ['add'],
            pnpm: ['add', 'install', 'i'],
        };
        if (!validSubcmds[tool]?.includes(subcmd)) return null;

        const raw = firstNonFlag(rest);
        if (!raw) return null; // e.g. bare `npm install` or `npm install --save-dev`

        return { packageName: stripVersion(raw), ecosystem: 'npm' };
    }

    // ── flutter pub add ───────────────────────────────────────────────────────
    if (tool === 'flutter' && subcmd === 'pub' && tokens[2] === 'add') {
        const raw = firstNonFlag(tokens.slice(3));
        if (!raw) return null;
        return { packageName: raw, ecosystem: 'flutter' };
    }

    return null;
}
