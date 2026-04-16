import * as vscode from 'vscode';
import { AnalyzedDependency } from './types';

export class DiagnosticsProvider implements vscode.Disposable {
  private collection = vscode.languages.createDiagnosticCollection('depscope');

  update(deps: AnalyzedDependency[]): void {
    this.collection.clear();

    // Group diagnostics by open document
    for (const editor of vscode.window.visibleTextEditors) {
      const doc = editor.document;
      const isManifest = /(?:package\.json|pubspec\.yaml|build\.gradle(?:\.kts)?)$/.test(doc.fileName);
      if (!isManifest) continue;

      const diagnostics: vscode.Diagnostic[] = [];
      const text = doc.getText();
      const lines = text.split('\n');

      for (const dep of deps) {
        if (dep.riskLevel !== 'critical' && dep.riskLevel !== 'high') continue;
        const pattern = new RegExp(`["']?${escapeRegex(dep.name)}["']?`);
        for (let i = 0; i < lines.length; i++) {
          if (!pattern.test(lines[i])) continue;
          const match = lines[i].match(pattern);
          if (!match) continue;
          const col = lines[i].indexOf(match[0]);
          const range = new vscode.Range(i, col, i, col + match[0].length);
          const severity = dep.riskLevel === 'critical'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
          const flagsStr = dep.flags.map(f => f.type).join(', ');
          const diag = new vscode.Diagnostic(
            range,
            `depscope: ${dep.name} scored ${Math.round(dep.score.overall)}/100 (${dep.riskLevel.toUpperCase()}). Flags: ${flagsStr || 'none'}`,
            severity
          );
          diag.source = 'depscope';
          diag.code = dep.riskLevel;
          diagnostics.push(diag);
          break;
        }
      }

      if (diagnostics.length > 0) {
        this.collection.set(doc.uri, diagnostics);
      }
    }
  }

  dispose(): void { this.collection.dispose(); }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
