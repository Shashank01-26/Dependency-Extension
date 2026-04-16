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
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

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
    this._panel.webview.postMessage({ type: 'setResult', result });
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
        // Webview JS has loaded and registered its message listener.
        // Replay any intercept state that may have been sent before it was ready.
        if (DashboardPanel.pendingInterceptMsg) {
          DashboardPanel.currentPanel?._panel.webview.postMessage(DashboardPanel.pendingInterceptMsg);
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

  public dispose(): void {
    // If the user closes the panel while an intercept is pending, cancel the
    // install — don't leave the terminal blocked until the 35s timeout.
    const pendingResolve = DashboardPanel.pendingInterceptResolve;
    DashboardPanel.pendingInterceptResolve = null;
    DashboardPanel.pendingInterceptMsg = null;
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
