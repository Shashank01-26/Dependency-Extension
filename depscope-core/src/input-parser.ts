import { Ecosystem, ParsedDependency } from './types/index.js';

export interface DetectedManifest {
  ecosystem: Ecosystem;
  projectName: string;
  dependencies: ParsedDependency[];
}

export function parsePackageJson(content: string, projectName = 'project'): DetectedManifest {
  try {
    const pkg = JSON.parse(content);
    const deps: ParsedDependency[] = [];

    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      deps.push({ name, version: String(version).replace(/^[\^~>=<]/, ''), isDev: false });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      deps.push({ name, version: String(version).replace(/^[\^~>=<]/, ''), isDev: true });
    }

    return { ecosystem: 'npm', projectName: pkg.name || projectName, dependencies: deps };
  } catch {
    return { ecosystem: 'npm', projectName, dependencies: [] };
  }
}

export function parsePubspecYaml(content: string, projectName = 'flutter-project'): DetectedManifest {
  const deps: ParsedDependency[] = [];
  let inDeps = false;
  let inDevDeps = false;
  let isDev = false;
  let extractedName = projectName;

  for (const line of content.split('\n')) {
    const stripped = line.trimEnd();
    if (stripped.startsWith('name:')) {
      extractedName = stripped.replace('name:', '').trim();
    }
    if (stripped === 'dependencies:') { inDeps = true; inDevDeps = false; isDev = false; continue; }
    if (stripped === 'dev_dependencies:') { inDevDeps = true; inDeps = false; isDev = true; continue; }
    if (stripped.match(/^\w+:/) && !stripped.startsWith(' ') && !stripped.startsWith('\t')) {
      if (stripped !== 'dependencies:' && stripped !== 'dev_dependencies:') {
        inDeps = false; inDevDeps = false;
      }
    }

    if ((inDeps || inDevDeps) && (stripped.startsWith('  ') || stripped.startsWith('\t'))) {
      const match = stripped.trim().match(/^([a-z_][a-z0-9_-]*):\s*(.*)$/);
      if (match) {
        const [, name, rawVer] = match;
        if (name === 'flutter' || name === 'sdk') continue;
        const version = rawVer.replace(/[^0-9.]/g, '') || '0.0.0';
        deps.push({ name, version: version || '0.0.0', isDev });
      }
    }
  }

  return { ecosystem: 'flutter', projectName: extractedName, dependencies: deps };
}

export function parseBuildGradle(content: string, projectName = 'android-project'): DetectedManifest {
  const deps: ParsedDependency[] = [];
  const depPattern = /(?:implementation|api|testImplementation|debugImplementation|compileOnly|runtimeOnly)\s*[('"]([^'"]+)[)'"]/g;
  let match: RegExpExecArray | null;

  while ((match = depPattern.exec(content)) !== null) {
    const dep = match[1];
    const parts = dep.split(':');
    const isDev = match[0].includes('test') || match[0].includes('debug');

    if (parts.length >= 3) {
      const name = `${parts[0]}:${parts[1]}`;
      const version = parts[2] || '0.0.0';
      deps.push({ name, version, isDev });
    } else if (parts.length === 2) {
      deps.push({ name: parts[0], version: parts[1], isDev });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return {
    ecosystem: 'android',
    projectName,
    dependencies: deps.filter(d => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    }),
  };
}

export const SAMPLE_PRESETS: Record<string, { ecosystem: Ecosystem; projectName: string; dependencies: ParsedDependency[] }> = {
  'npm-high-risk': {
    ecosystem: 'npm',
    projectName: 'npm-high-risk-sample',
    dependencies: [
      { name: 'lodash', version: '3.10.1', isDev: false },
      { name: 'request', version: '2.88.2', isDev: false },
      { name: 'event-stream', version: '3.3.4', isDev: false },
      { name: 'left-pad', version: '1.3.0', isDev: false },
      { name: 'node-uuid', version: '1.4.8', isDev: false },
    ],
  },
  'npm-low-risk': {
    ecosystem: 'npm',
    projectName: 'npm-low-risk-sample',
    dependencies: [
      { name: 'react', version: '18.3.0', isDev: false },
      { name: 'typescript', version: '5.4.5', isDev: true },
      { name: 'vite', version: '5.2.0', isDev: true },
      { name: 'tailwindcss', version: '3.4.3', isDev: true },
      { name: 'zod', version: '3.22.4', isDev: false },
    ],
  },
  'flutter-high-risk': {
    ecosystem: 'flutter',
    projectName: 'flutter-high-risk-sample',
    dependencies: [
      { name: 'http', version: '0.12.0', isDev: false },
      { name: 'uuid', version: '3.0.0', isDev: false },
      { name: 'crypto', version: '1.0.0', isDev: false },
      { name: 'intl', version: '0.16.1', isDev: false },
      { name: 'dart_style', version: '1.3.14', isDev: true },
    ],
  },
  'flutter-low-risk': {
    ecosystem: 'flutter',
    projectName: 'flutter-low-risk-sample',
    dependencies: [
      { name: 'flutter_riverpod', version: '2.5.1', isDev: false },
      { name: 'go_router', version: '13.2.0', isDev: false },
      { name: 'freezed', version: '2.5.2', isDev: false },
      { name: 'dio', version: '5.4.3', isDev: false },
      { name: 'shared_preferences', version: '2.2.3', isDev: false },
    ],
  },
  'android-high-risk': {
    ecosystem: 'android',
    projectName: 'android-high-risk-sample',
    dependencies: [
      { name: 'com.google.code.gson:gson', version: '2.8.0', isDev: false },
      { name: 'org.apache.commons:commons-lang3', version: '3.1', isDev: false },
      { name: 'log4j:log4j', version: '1.2.17', isDev: false },
    ],
  },
  'android-low-risk': {
    ecosystem: 'android',
    projectName: 'android-low-risk-sample',
    dependencies: [
      { name: 'com.squareup.retrofit2:retrofit', version: '2.11.0', isDev: false },
      { name: 'com.squareup.okhttp3:okhttp', version: '4.12.0', isDev: false },
      { name: 'org.jetbrains.kotlinx:kotlinx-coroutines-android', version: '1.8.0', isDev: false },
    ],
  },
};
