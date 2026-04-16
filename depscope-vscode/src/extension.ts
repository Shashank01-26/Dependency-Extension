import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AnalysisEngine } from './AnalysisEngine';
import { DashboardPanel } from './DashboardPanel';
import { SidebarProvider } from './SidebarProvider';
import { DepScopeCodeLensProvider } from './CodeLensProvider';
import { DiagnosticsProvider } from './DiagnosticsProvider';
import { DepScopeStatusBar } from './StatusBarItem';
import { InstallInterceptor } from './InstallInterceptor';

export function activate(context: vscode.ExtensionContext): void {
  const engine = new AnalysisEngine(context);
  const statusBar = new DepScopeStatusBar();
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  const diagnosticsProvider = new DiagnosticsProvider();
  const codeLensProvider = new DepScopeCodeLensProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('depscopeTree', {
    treeDataProvider: sidebarProvider,
    showCollapseAll: true,
  });

  // Register CodeLens provider for manifest files
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    [
      { pattern: '**/package.json' },
      { pattern: '**/pubspec.yaml' },
      { pattern: '**/build.gradle' },
      { pattern: '**/build.gradle.kts' },
    ],
    codeLensProvider
  );

  // Wire up engine events
  engine.onAnalysisComplete((result) => {
    sidebarProvider.setResult(result);
    statusBar.update(result.summary);
    diagnosticsProvider.update(result.dependencies);
    codeLensProvider.update(result.dependencies);
    DashboardPanel.currentResult = result;
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.postResult(result);
    }

    const criticalCount = result.summary.criticalCount;
    if (criticalCount > 0) {
      vscode.window.showWarningMessage(
        `DepScope: ${criticalCount} critical-risk ${criticalCount === 1 ? 'dependency' : 'dependencies'} detected.`,
        'View Dashboard'
      ).then(choice => {
        if (choice === 'View Dashboard') {
          DashboardPanel.createOrShow(context.extensionUri, result);
        }
      });
    }
  });

  engine.onProgress((message) => {
    statusBar.showProgress(message);
  });

  // Commands
  const analyzeCmd = vscode.commands.registerCommand('depscope.analyze', async () => {
    const manifest = await findManifestFile();
    if (!manifest) {
      vscode.window.showErrorMessage('DepScope: No supported manifest file found (package.json, pubspec.yaml, build.gradle)');
      return;
    }
    await engine.analyze(manifest);
  });

  const analyzeFileCmd = vscode.commands.registerCommand('depscope.analyzeFile', async (uri?: vscode.Uri) => {
    const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!filePath) return;
    await engine.analyze(filePath);
  });

  const openDashboardCmd = vscode.commands.registerCommand('depscope.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri, DashboardPanel.currentResult);
  });

  const exportJsonCmd = vscode.commands.registerCommand('depscope.exportJson', async () => {
    const result = DashboardPanel.currentResult || engine.getLastResult();
    if (!result) { vscode.window.showErrorMessage('DepScope: No analysis results available. Run an analysis first.'); return; }
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('depscope-report.json'),
      filters: { 'JSON': ['json'] },
    });
    if (uri) {
      fs.writeFileSync(uri.fsPath, JSON.stringify(result, null, 2));
      vscode.window.showInformationMessage(`DepScope: Report saved to ${uri.fsPath}`);
    }
  });

  const exportCsvCmd = vscode.commands.registerCommand('depscope.exportCsv', async () => {
    const result = DashboardPanel.currentResult || engine.getLastResult();
    if (!result) { vscode.window.showErrorMessage('DepScope: No analysis results available.'); return; }
    const csv = generateCsv(result);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('depscope-report.csv'),
      filters: { 'CSV': ['csv'] },
    });
    if (uri) {
      fs.writeFileSync(uri.fsPath, csv);
      vscode.window.showInformationMessage(`DepScope: CSV saved to ${uri.fsPath}`);
    }
  });

  const refreshCmd = vscode.commands.registerCommand('depscope.refresh', async () => {
    const manifest = await findManifestFile();
    if (manifest) await engine.analyze(manifest);
  });

  const loadSampleCmd = vscode.commands.registerCommand('depscope.loadSample', async () => {
    const samples = [
      'npm-high-risk', 'npm-low-risk',
      'flutter-high-risk', 'flutter-low-risk',
      'android-high-risk', 'android-low-risk',
    ];
    const pick = await vscode.window.showQuickPick(samples, { placeHolder: 'Select a sample preset' });
    if (pick) {
      await engine.analyzeSample(pick);
    }
  });

  // Install intercept gate
  const installInterceptor = new InstallInterceptor(context);
  installInterceptor.activate();

  // Auto-analyze on open
  const config = vscode.workspace.getConfiguration('depscope');
  if (config.get<boolean>('autoAnalyzeOnOpen')) {
    findManifestFile().then(manifest => {
      if (manifest) engine.analyze(manifest);
    });
  }

  context.subscriptions.push(
    treeView, codeLensDisposable, statusBar, diagnosticsProvider,
    analyzeCmd, analyzeFileCmd, openDashboardCmd, exportJsonCmd,
    exportCsvCmd, refreshCmd, loadSampleCmd,
    installInterceptor,
  );
}

async function findManifestFile(): Promise<string | undefined> {
  const patterns = ['**/package.json', '**/pubspec.yaml', '**/build.gradle', '**/build.gradle.kts'];
  const excludes = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];
  for (const pattern of patterns) {
    const files = await vscode.workspace.findFiles(pattern, `{${excludes.join(',')}}`);
    if (files.length > 0) return files[0].fsPath;
  }
  return undefined;
}

function generateCsv(result: any): string {
  const headers = ['name','version','isDev','riskScore','riskLevel','maintenanceRisk','securityRisk','popularityRisk','communityRisk','depthRisk','weeklyDownloads','maintainers','vulnerabilityCount','flags','stars','lastPublish'];
  const rows = result.dependencies.map((d: any) => [
    d.name, d.version, d.isDev,
    d.score.overall, d.riskLevel,
    d.score.maintenance, d.score.security, d.score.popularity, d.score.community, d.score.depthRisk,
    d.registryData.weeklyDownloads, d.registryData.maintainers, d.vulnerabilities.length,
    d.flags.map((f: any) => f.type).join(';'),
    d.github?.stars ?? 0, d.registryData.lastPublish,
  ]);
  return [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function deactivate(): void {}
