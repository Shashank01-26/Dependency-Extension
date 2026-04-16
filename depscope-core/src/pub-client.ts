import * as https from 'https';
import { RegistryData } from './types/index.js';

function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request({
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers: { 'User-Agent': 'depscope/1.0.0', 'Accept': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

export async function fetchPubMetadata(name: string): Promise<{
  registry: RegistryData;
  githubUrl: string | null;
  directDeps: string[];
}> {
  const defaultRegistry: RegistryData = {
    weeklyDownloads: 0, maintainers: 1, maintainerNames: [], lastPublish: new Date(0).toISOString(),
    deprecation: null, versions: 1, license: 'Unknown', description: '', homepage: '',
  };
  try {
    const data = await httpsGet(`https://pub.dev/api/packages/${encodeURIComponent(name)}`);
    const latest = data.latest?.version || '0.0.0';
    const pubspec = data.latest?.pubspec || {};
    const versions = data.versions || [];

    // pub.dev pubspec may carry an authors list (legacy field)
    const rawAuthors: string[] = Array.isArray(pubspec.authors)
      ? pubspec.authors
      : pubspec.author ? [pubspec.author] : [];
    // Strip email addresses — keep just the name part if present
    const maintainerNames = rawAuthors
      .map((a: string) => a.replace(/<[^>]+>/, '').trim())
      .filter(Boolean);

    const registry: RegistryData = {
      weeklyDownloads: Math.floor((data.popularity || 0) * 10000),
      maintainers: maintainerNames.length || 1,
      maintainerNames,
      lastPublish: data.latest?.published || new Date(0).toISOString(),
      deprecation: pubspec.deprecated ? 'This package is deprecated' : null,
      versions: versions.length,
      license: pubspec.license || 'Unknown',
      description: pubspec.description || '',
      homepage: pubspec.homepage || '',
    };

    let githubUrl: string | null = null;
    const repoUrl = pubspec.repository || pubspec.homepage || '';
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (match) githubUrl = `https://github.com/${match[1].replace(/\.git$/, '')}`;

    const directDeps = Object.keys({
      ...pubspec.dependencies,
      ...pubspec.environment,
    }).filter(k => k !== 'flutter' && k !== 'sdk');

    return { registry, githubUrl, directDeps };
  } catch {
    return { registry: defaultRegistry, githubUrl: null, directDeps: [] };
  }
}
