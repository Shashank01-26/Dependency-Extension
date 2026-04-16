import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ScanResult } from './types';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  public static currentResult: ScanResult | null = null;
  /** Resolved by the webview when the user picks Continue or Cancel. */
  public static pendingInterceptResolve: ((proceed: boolean) => void) | null = null;
  /**
   * Last intercept message (interceptStart or interceptReady) that should be
   * replayed when the webview signals it is ready. Cleared on interceptDismiss.
   */
  public static pendingInterceptMsg: unknown | null = null;
  /** Last insights message (loading/result/error) to replay on webviewReady. */
  public static pendingInsightsMsg: unknown | null = null;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  /** Prevents duplicate concurrent Groq calls. */
  private _generatingInsights = false;

  public static createOrShow(extensionUri: vscode.Uri, result?: ScanResult | null): void {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(column);
      if (result) DashboardPanel.currentPanel.postResult(result);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'depscopeDashboard',
      'DepScope Dashboard',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );
    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    if (result) DashboardPanel.currentPanel.postResult(result);
  }

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(this._handleMessage.bind(this), null, this._disposables);
  }

  public postResult(result: ScanResult): void {
    // Reset any cached insights from a previous scan
    DashboardPanel.pendingInsightsMsg = null;
    this._generatingInsights = false;
    this._panel.webview.postMessage({ type: 'setResult', result });
    // Kick off AI generation immediately — runs concurrently with the user browsing
    this._generateInsights(result).catch(() => {});
  }

  /** Post any message to the webview. No-op if dashboard is not open. */
  public static postToWebview(message: any): void {
    // Track the latest intercept state so it can be replayed when the webview
    // signals it has finished loading (avoids the race where interceptStart /
    // interceptReady are posted before the React listener is registered).
    if (message.type === 'interceptStart' || message.type === 'interceptReady') {
      DashboardPanel.pendingInterceptMsg = message;
    } else if (message.type === 'interceptDismiss') {
      DashboardPanel.pendingInterceptMsg = null;
    }
    DashboardPanel.currentPanel?._panel.webview.postMessage(message);
  }

  private _handleMessage(message: any): void {
    switch (message.type) {
      case 'openFile':
        if (message.path) vscode.workspace.openTextDocument(message.path).then(doc => vscode.window.showTextDocument(doc));
        break;
      case 'requestInsights':
        this._generateInsights(message.result).catch(err => {
          this._panel.webview.postMessage({
            type: 'insightsError', code: 'api_error',
            message: err?.message || 'Unknown error',
          });
        });
        break;
      case 'analyze':
        vscode.commands.executeCommand('depscope.analyze');
        break;
      case 'exportJson':
        vscode.commands.executeCommand('depscope.exportJson');
        break;
      case 'exportCsv':
        vscode.commands.executeCommand('depscope.exportCsv');
        break;
      case 'loadSample':
        vscode.commands.executeCommand('depscope.loadSample');
        break;
      case 'webviewReady':
        // Replay any state that may have arrived before the React listener was ready.
        if (DashboardPanel.pendingInterceptMsg) {
          DashboardPanel.currentPanel?._panel.webview.postMessage(DashboardPanel.pendingInterceptMsg);
        }
        if (DashboardPanel.pendingInsightsMsg) {
          DashboardPanel.currentPanel?._panel.webview.postMessage(DashboardPanel.pendingInsightsMsg);
        }
        break;
      case 'interceptDecision':
        if (DashboardPanel.pendingInterceptResolve) {
          DashboardPanel.pendingInterceptResolve(message.proceed === true);
          DashboardPanel.pendingInterceptResolve = null;
        }
        break;
    }
  }

  private _getHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}'; img-src data: https:;">
  <title>DepScope Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0f14; color: #e2e8f0; font-family: 'Plus Jakarta Sans', sans-serif; height: 100vh; overflow: hidden; }
    #root { height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _generateInsights(result: ScanResult): Promise<void> {
    if (this._generatingInsights) return; // already in-flight
    this._generatingInsights = true;

    const config = vscode.workspace.getConfiguration('depscope');
    const groqApiKey = config.get<string>('groqApiKey')?.trim();

    if (!groqApiKey) {
      const msg = { type: 'insightsError', code: 'no_api_key' };
      DashboardPanel.pendingInsightsMsg = msg;
      this._panel.webview.postMessage(msg);
      this._generatingInsights = false;
      return;
    }

    const loadingMsg = { type: 'insightsLoading' };
    DashboardPanel.pendingInsightsMsg = loadingMsg;
    this._panel.webview.postMessage(loadingMsg);

    try {
    const prompt = buildInsightsPrompt(result);
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert software security auditor specializing in dependency risk analysis. ' +
            'Provide detailed, actionable insights based on real scan data. Be specific about package names, ' +
            'versions, CVE IDs, and concrete remediation commands. Return only valid JSON — no markdown fences, no preamble.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    // Use the built-in https module (always available in VS Code's Node runtime)
    const https = await import('https');
    const responseText = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if ((res.statusCode ?? 0) >= 400) {
              reject(new Error(`Groq API ${res.statusCode}: ${data.slice(0, 300)}`));
            } else {
              resolve(data);
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(responseText);
    const content: string = parsed.choices?.[0]?.message?.content ?? '{}';

    let insights: Record<string, string>;
    try {
      insights = JSON.parse(content);
    } catch {
      insights = { summary: content, riskAnalysis: '', recommendations: '', alternatives: '' };
    }

    const resultMsg = { type: 'insightsResult', insights };
    DashboardPanel.pendingInsightsMsg = resultMsg;
    this._panel.webview.postMessage(resultMsg);
    } catch (err: any) {
      const errMsg = { type: 'insightsError', code: 'api_error', message: err?.message || 'Failed' };
      DashboardPanel.pendingInsightsMsg = errMsg;
      this._panel.webview.postMessage(errMsg);
    } finally {
      this._generatingInsights = false;
    }
  }

  public dispose(): void {
    // If the user closes the panel while an intercept is pending, cancel the
    // install — don't leave the terminal blocked until the 35s timeout.
    const pendingResolve = DashboardPanel.pendingInterceptResolve;
    DashboardPanel.pendingInterceptResolve = null;
    DashboardPanel.pendingInterceptMsg = null;
    DashboardPanel.pendingInsightsMsg = null;
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    if (pendingResolve) {
      pendingResolve(false); // cancel the blocked install
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function buildInsightsPrompt(result: ScanResult): string {
  const { summary, dependencies, metadata } = result;
  const critical = dependencies.filter((d: any) => d.riskLevel === 'critical');
  const high = dependencies.filter((d: any) => d.riskLevel === 'high');
  const vulnerable = dependencies.filter((d: any) => d.vulnerabilities?.length > 0);
  const deprecated = dependencies.filter((d: any) =>
    d.flags?.some((f: any) => f.type === 'deprecated'),
  );

  const depLine = (d: any) =>
    `- ${d.name}@${d.version} | score=${d.score?.overall ?? '?'}/100` +
    ` | maintenance=${d.score?.maintenance ?? '?'} security=${d.score?.security ?? '?'}` +
    ` popularity=${d.score?.popularity ?? '?'}` +
    ` | maintainers=${d.registryData?.maintainers ?? '?'}` +
    ` downloads/wk=${d.registryData?.weeklyDownloads?.toLocaleString() ?? '?'}` +
    ` lastPublish=${d.registryData?.lastPublish ?? '?'}` +
    ` stars=${d.github?.stars ?? '?'}` +
    (d.vulnerabilities?.length
      ? ` | CVEs: ${d.vulnerabilities.map((v: any) => `${v.severity}:${v.cve || 'N/A'} "${v.title}"`).join('; ')}`
      : '') +
    (d.flags?.length ? ` | flags: ${d.flags.map((f: any) => f.type).join(',')}` : '');

  return `Analyze this ${metadata.ecosystem} project "${metadata.projectName}" dependency scan.

OVERVIEW
- Total deps: ${summary.totalDependencies} (${summary.directCount} direct)
- Overall risk score: ${summary.overallScore}/100 — ${summary.overallRiskLevel.toUpperCase()}
- Breakdown: critical=${summary.criticalCount} high=${summary.highCount} medium=${summary.mediumCount} low=${summary.lowCount}
- Known vulnerabilities: ${summary.vulnerabilityCount}

CRITICAL PACKAGES (${critical.length})
${critical.map(depLine).join('\n') || 'none'}

HIGH-RISK PACKAGES (${high.length > 8 ? 'top 8 shown' : high.length})
${high.slice(0, 8).map(depLine).join('\n') || 'none'}

PACKAGES WITH KNOWN CVEs (${vulnerable.length})
${
    vulnerable
      .slice(0, 6)
      .map(
        (d: any) =>
          `- ${d.name}@${d.version}: ` +
          d.vulnerabilities
            .map((v: any) => `${v.severity.toUpperCase()} ${v.cve || ''} "${v.title}" affects ${v.affectedVersions || '?'}`)
            .join('; '),
      )
      .join('\n') || 'none'
  }

DEPRECATED PACKAGES (${deprecated.length})
${deprecated.map((d: any) => `- ${d.name}@${d.version}`).join('\n') || 'none'}

Return ONLY this JSON object (no markdown, no extra keys):
{
  "summary": "3–4 paragraph executive summary. Paragraph 1: interpret the ${summary.overallScore}/100 score — what it means in practice for a ${metadata.ecosystem} project. Paragraph 2: call out the most dangerous specific packages by name and explain the compounded risk. Paragraph 3: describe the realistic worst-case exploitation scenario given the vulnerabilities found. Paragraph 4: give an honest overall verdict.",
  "riskAnalysis": "Per-package deep-dive for every critical and high-risk package. For each: (a) what the package does in one sentence, (b) the exact risk signals (low maintenance score, single maintainer, specific CVE IDs), (c) what an attacker could do if it were compromised, (d) whether the currently installed version is in the affected range. Use numbered entries.",
  "recommendations": "Prioritized numbered action plan. Each item must include: the exact package name, the precise action (update / replace / audit / pin), the exact CLI command to run (e.g. npm install lodash@4.17.21, flutter pub upgrade provider), the urgency (CRITICAL / HIGH / MEDIUM), and a one-sentence reason. Order by urgency.",
  "alternatives": "For every deprecated or critically risky package: (a) 1–2 specific maintained drop-in or near-drop-in alternatives, (b) migration effort (trivial / easy / moderate / significant), (c) key API differences to watch out for, (d) install command. Skip packages that have no better alternatives."
}`;
}
