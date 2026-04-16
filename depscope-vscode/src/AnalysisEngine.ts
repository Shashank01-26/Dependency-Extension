import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { ScanResult } from './types';

export class AnalysisEngine implements vscode.Disposable {
  private lastResult: ScanResult | null = null;
  private _onAnalysisComplete = new vscode.EventEmitter<ScanResult>();
  private _onProgress = new vscode.EventEmitter<string>();
  readonly onAnalysisComplete = this._onAnalysisComplete.event;
  readonly onProgress = this._onProgress.event;

  constructor(private context: vscode.ExtensionContext) {}

  getLastResult(): ScanResult | null { return this.lastResult; }

  async analyze(manifestPath: string): Promise<void> {
    this._onProgress.fire('Reading manifest...');
    const config = vscode.workspace.getConfiguration('depscope');

    let content: string;
    try {
      content = fs.readFileSync(manifestPath, 'utf8');
    } catch {
      vscode.window.showErrorMessage(`DepScope: Could not read ${manifestPath}`);
      return;
    }

    const ecosystem = detectEcosystem(manifestPath);
    const deps = parseDependencies(content, ecosystem);

    if (deps.length === 0) {
      vscode.window.showWarningMessage('DepScope: No dependencies found in the manifest file.');
      return;
    }

    this._onProgress.fire(`Analyzing ${deps.length} dependencies...`);

    const request = {
      type: 'analyze',
      ecosystem,
      dependencies: deps,
      projectName: path.basename(path.dirname(manifestPath)),
      groqApiKey: config.get<string>('groqApiKey') || undefined,
      githubToken: config.get<string>('githubToken') || undefined,
      maxDepth: config.get<number>('maxDepth') || 3,
      concurrency: config.get<number>('concurrency') || 5,
    };

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `DepScope: Analyzing ${deps.length} dependencies...`,
      cancellable: false,
    }, async () => {
      const result = await this.runCore(request);
      if (result) {
        this.lastResult = result;
        this._onAnalysisComplete.fire(result);
      }
    });
  }

  async analyzeSample(sampleName: string): Promise<void> {
    const SAMPLE_DEPS: Record<string, { ecosystem: string; deps: any[] }> = {
      'npm-high-risk': { ecosystem: 'npm', deps: [
        {name:'lodash',version:'3.10.1',isDev:false},{name:'request',version:'2.88.2',isDev:false},
        {name:'event-stream',version:'3.3.4',isDev:false},{name:'left-pad',version:'1.3.0',isDev:false},
        {name:'node-uuid',version:'1.4.8',isDev:false},
      ]},
      'npm-low-risk': { ecosystem: 'npm', deps: [
        {name:'react',version:'18.3.0',isDev:false},{name:'typescript',version:'5.4.5',isDev:true},
        {name:'vite',version:'5.2.0',isDev:true},{name:'tailwindcss',version:'3.4.3',isDev:true},
        {name:'zod',version:'3.22.4',isDev:false},
      ]},
      'flutter-high-risk': { ecosystem: 'flutter', deps: [
        {name:'http',version:'0.12.0',isDev:false},{name:'uuid',version:'3.0.0',isDev:false},
        {name:'crypto',version:'1.0.0',isDev:false},{name:'intl',version:'0.16.1',isDev:false},
        {name:'dart_style',version:'1.3.14',isDev:true},
      ]},
      'flutter-low-risk': { ecosystem: 'flutter', deps: [
        {name:'flutter_riverpod',version:'2.5.1',isDev:false},{name:'go_router',version:'13.2.0',isDev:false},
        {name:'freezed',version:'2.5.2',isDev:false},{name:'dio',version:'5.4.3',isDev:false},
        {name:'shared_preferences',version:'2.2.3',isDev:false},
      ]},
      'android-high-risk': { ecosystem: 'android', deps: [
        {name:'com.google.code.gson:gson',version:'2.8.0',isDev:false},
        {name:'org.apache.commons:commons-lang3',version:'3.1',isDev:false},
        {name:'log4j:log4j',version:'1.2.17',isDev:false},
      ]},
      'android-low-risk': { ecosystem: 'android', deps: [
        {name:'com.squareup.retrofit2:retrofit',version:'2.11.0',isDev:false},
        {name:'com.squareup.okhttp3:okhttp',version:'4.12.0',isDev:false},
        {name:'org.jetbrains.kotlinx:kotlinx-coroutines-android',version:'1.8.0',isDev:false},
      ]},
    };

    const sample = SAMPLE_DEPS[sampleName];
    if (!sample) return;

    const request = {
      type: 'analyze',
      ecosystem: sample.ecosystem,
      dependencies: sample.deps,
      projectName: sampleName,
    };

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `DepScope: Analyzing sample (${sampleName})...`,
      cancellable: false,
    }, async () => {
      const result = await this.runCore(request);
      if (result) {
        this.lastResult = result;
        this._onAnalysisComplete.fire(result);
      }
    });
  }

  private async runCore(request: any): Promise<ScanResult | null> {
    return new Promise((resolve) => {
      const corePath = path.join(this.context.extensionPath, '..', 'depscope-core', 'dist', 'index.js');
      let coreScript = corePath;
      if (!fs.existsSync(coreScript)) {
        // Try bundled path
        coreScript = path.join(this.context.extensionPath, 'dist', 'core', 'index.js');
      }

      const child = child_process.spawn('node', [coreScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          vscode.window.showErrorMessage(`DepScope: Analysis failed. ${stderr}`);
          resolve(null);
          return;
        }
        try {
          const response = JSON.parse(stdout);
          if (response.success && response.result) {
            resolve(response.result as ScanResult);
          } else {
            vscode.window.showErrorMessage(`DepScope: ${response.error || 'Unknown error'}`);
            resolve(null);
          }
        } catch {
          vscode.window.showErrorMessage('DepScope: Failed to parse analysis results');
          resolve(null);
        }
      });

      child.stdin.write(JSON.stringify(request));
      child.stdin.end();
    });
  }

  dispose(): void {
    this._onAnalysisComplete.dispose();
    this._onProgress.dispose();
  }
}

function detectEcosystem(filePath: string): 'npm' | 'flutter' | 'android' {
  const base = path.basename(filePath);
  if (base === 'package.json') return 'npm';
  if (base === 'pubspec.yaml') return 'flutter';
  if (base.startsWith('build.gradle')) return 'android';
  return 'npm';
}

function parseDependencies(content: string, ecosystem: string): any[] {
  if (ecosystem === 'npm') {
    try {
      const pkg = JSON.parse(content);
      const deps: any[] = [];
      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        deps.push({ name, version: String(version).replace(/^[\^~>=<]/, ''), isDev: false });
      }
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        deps.push({ name, version: String(version).replace(/^[\^~>=<]/, ''), isDev: true });
      }
      return deps;
    } catch { return []; }
  }

  if (ecosystem === 'flutter') {
    const deps: any[] = [];
    let inDeps = false; let isDev = false;
    for (const line of content.split('\n')) {
      const s = line.trimEnd();
      if (s === 'dependencies:') { inDeps = true; isDev = false; continue; }
      if (s === 'dev_dependencies:') { inDeps = true; isDev = true; continue; }
      if (s.match(/^\w+:/) && !s.startsWith(' ') && !s.startsWith('\t')) {
        if (s !== 'dependencies:' && s !== 'dev_dependencies:') inDeps = false;
      }
      if (inDeps && (s.startsWith('  ') || s.startsWith('\t'))) {
        const m = s.trim().match(/^([a-z_][a-z0-9_-]*):\s*(.*)$/);
        if (m && m[1] !== 'flutter' && m[1] !== 'sdk') {
          deps.push({ name: m[1], version: m[2].replace(/[^0-9.]/g, '') || '0.0.0', isDev });
        }
      }
    }
    return deps;
  }

  if (ecosystem === 'android') {
    const deps: any[] = [];
    const seen = new Set<string>();
    const re = /(?:implementation|api|testImplementation|debugImplementation)\s*[('"]([^'"]+)[)'"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const parts = m[1].split(':');
      if (parts.length >= 3) {
        const name = `${parts[0]}:${parts[1]}`;
        if (!seen.has(name)) {
          seen.add(name);
          deps.push({ name, version: parts[2], isDev: m[0].includes('test') || m[0].includes('debug') });
        }
      }
    }
    return deps;
  }
  return [];
}
