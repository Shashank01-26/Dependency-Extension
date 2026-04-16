import * as https from 'https';
import { RegistryData, Vulnerability } from './types/index.js';

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers: {
        'User-Agent': 'depscope/1.0.0',
        'Accept': 'application/json',
        ...headers,
      },
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpsPost(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const bodyStr = JSON.stringify(body);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'POST',
      headers: {
        'User-Agent': 'depscope/1.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

export async function fetchNpmMetadata(name: string, version: string): Promise<{
  registry: RegistryData;
  githubUrl: string | null;
  vulnerabilities: Vulnerability[];
  directDeps: string[];
}> {
  const defaultRegistry: RegistryData = {
    weeklyDownloads: 0, maintainers: 1, maintainerNames: [], lastPublish: new Date(0).toISOString(),
    deprecation: null, versions: 1, license: 'Unknown', description: '', homepage: '',
  };
  try {
    const data = await httpsGet(`https://registry.npmjs.org/${encodeURIComponent(name)}`);

    // npm returns {"error":"Not found"} for unknown packages
    if (data.error || !data['dist-tags']) {
      return { registry: { ...defaultRegistry, notFound: true }, githubUrl: null, vulnerabilities: [], directDeps: [] };
    }

    const latest = data['dist-tags']?.latest || version;
    const versionData = data.versions?.[latest] || {};
    const times = data.time || {};

    const rawMaintainers: Array<{ name?: string; username?: string; email?: string }> =
      Array.isArray(data.maintainers) ? data.maintainers : [];
    const maintainerNames = rawMaintainers
      .map(m => m.name || m.username || m.email || '')
      .filter(Boolean);

    const registry: RegistryData = {
      weeklyDownloads: 0,
      maintainers: rawMaintainers.length || 1,
      maintainerNames,
      lastPublish: times[latest] || times.modified || new Date(0).toISOString(),
      deprecation: versionData.deprecated || null,
      versions: Object.keys(data.versions || {}).length,
      license: versionData.license || data.license || 'Unknown',
      description: data.description || '',
      homepage: versionData.homepage || data.homepage || '',
    };

    // Extract GitHub URL
    let githubUrl: string | null = null;
    const repo = versionData.repository || data.repository;
    if (repo) {
      const repoUrl = typeof repo === 'string' ? repo : repo.url || '';
      const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      if (match) githubUrl = `https://github.com/${match[1].replace(/\.git$/, '')}`;
    }

    // Direct deps
    const directDeps = Object.keys(versionData.dependencies || {});

    // Vulnerabilities
    let vulnerabilities: Vulnerability[] = [];
    try {
      const vulnResp = await httpsPost(
        'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
        { [name]: [latest] }
      );
      const advisories = vulnResp[name] || [];
      vulnerabilities = advisories.map((a: any) => ({
        title: a.title || 'Unknown vulnerability',
        severity: (a.severity || 'low').toLowerCase() as Vulnerability['severity'],
        cve: a.cves?.[0] || a.url || '',
        affectedVersions: a.vulnerable_versions || '*',
      }));
    } catch { /* ignore */ }

    return { registry, githubUrl, vulnerabilities, directDeps };
  } catch {
    return { registry: defaultRegistry, githubUrl: null, vulnerabilities: [], directDeps: [] };
  }
}

export async function fetchNpmDownloads(name: string): Promise<number> {
  try {
    const data = await httpsGet(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`);
    return data.downloads || 0;
  } catch {
    return 0;
  }
}
