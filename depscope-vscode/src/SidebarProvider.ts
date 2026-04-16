import * as vscode from 'vscode';
import { AnalyzedDependency, ScanResult } from './types';

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

class GroupItem extends vscode.TreeItem {
  constructor(public readonly riskLevel: RiskLevel, public readonly deps: AnalyzedDependency[]) {
    const icons: Record<RiskLevel, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
    super(`${icons[riskLevel]} ${riskLevel.toUpperCase()} (${deps.length})`,
      deps.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'riskGroup';
  }
}

class DepItem extends vscode.TreeItem {
  constructor(public readonly dep: AnalyzedDependency) {
    super(`${dep.name}@${dep.version}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${Math.round(dep.score.overall)}/100`;
    this.tooltip = `${dep.name}@${dep.version}\nRisk: ${dep.riskLevel.toUpperCase()} (${Math.round(dep.score.overall)}/100)\nFlags: ${dep.flags.map(f => f.type).join(', ') || 'none'}`;
    this.command = {
      command: 'depscope.openDashboard',
      title: 'Open Dashboard',
      arguments: [],
    };
    const colors: Record<RiskLevel, string> = {
      critical: 'charts.red', high: 'charts.orange', medium: 'charts.yellow', low: 'charts.green'
    };
    this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(colors[dep.riskLevel as RiskLevel] || 'foreground'));
    this.contextValue = 'dependency';
  }
}

export class SidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private result: ScanResult | null = null;
  private loading = false;

  constructor(private extensionUri: vscode.Uri) {}

  setResult(result: ScanResult): void {
    this.result = result;
    this.loading = false;
    this._onDidChangeTreeData.fire();
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (this.loading) return [Object.assign(new vscode.TreeItem('Analyzing...'), { iconPath: new vscode.ThemeIcon('loading~spin') })];
    if (!this.result) return [new vscode.TreeItem('Run DepScope: Analyze to get started')];
    if (!element) {
      const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
      return levels
        .map(level => new GroupItem(level, this.result!.dependencies.filter(d => d.riskLevel === level)))
        .filter(g => g.deps.length > 0);
    }
    if (element instanceof GroupItem) return element.deps.map(d => new DepItem(d));
    return [];
  }
}
