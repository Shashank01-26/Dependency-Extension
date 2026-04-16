import * as vscode from 'vscode';

export class DepScopeStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'depscope.openDashboard';
    this.item.text = '$(shield) DepScope';
    this.item.tooltip = 'Open DepScope Dashboard';
    this.item.show();
  }

  update(summary: { overallScore: number; overallRiskLevel: string }): void {
    const icons: Record<string, string> = {
      critical: '$(error)', high: '$(warning)', medium: '$(info)', low: '$(pass)',
    };
    const icon = icons[summary.overallRiskLevel] || '$(shield)';
    this.item.text = `${icon} DepScope: ${Math.round(summary.overallScore)}/100 ${summary.overallRiskLevel.toUpperCase()}`;
    this.item.tooltip = `DepScope Risk Score: ${Math.round(summary.overallScore)}/100 — Click to open dashboard`;
    const colors: Record<string, string> = {
      critical: 'statusBarItem.errorBackground',
      high: 'statusBarItem.warningBackground',
    };
    this.item.backgroundColor = summary.overallRiskLevel in colors
      ? new vscode.ThemeColor(colors[summary.overallRiskLevel])
      : undefined;
  }

  showProgress(message: string): void {
    this.item.text = `$(sync~spin) DepScope: ${message}`;
  }

  dispose(): void { this.item.dispose(); }
}
