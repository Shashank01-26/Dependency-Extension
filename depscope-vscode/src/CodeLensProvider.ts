import * as vscode from 'vscode';
import { AnalyzedDependency } from './types';

export class DepScopeCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private deps: AnalyzedDependency[] = [];

  update(deps: AnalyzedDependency[]): void {
    this.deps = deps;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('depscope');
    if (!config.get<boolean>('showCodeLens')) return [];
    if (this.deps.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (const dep of this.deps) {
      const patterns = [
        new RegExp(`["']${escapeRegex(dep.name)}["']`),
        new RegExp(`^\\s+${escapeRegex(dep.name)}:`),
        new RegExp(`[("'](?:[^:'"]*:){1,2}${escapeRegex(dep.name.split(':').pop() || dep.name)}['":]`),
      ];

      for (let i = 0; i < lines.length; i++) {
        const matched = patterns.some(p => p.test(lines[i]));
        if (matched) {
          const range = new vscode.Range(i, 0, i, lines[i].length);
          const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
          const icon = icons[dep.riskLevel] || '⚪';
          lenses.push(new vscode.CodeLens(range, {
            title: `${icon} Risk: ${Math.round(dep.score.overall)}/100 ${dep.riskLevel.toUpperCase()} — click to view`,
            command: 'depscope.openDashboard',
            arguments: [dep.name],
          }));
          break;
        }
      }
    }
    return lenses;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
