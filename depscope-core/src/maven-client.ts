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

export async function fetchMavenMetadata(groupId: string, artifactId: string): Promise<{
  registry: RegistryData;
  githubUrl: string | null;
}> {
  const defaultRegistry: RegistryData = {
    weeklyDownloads: 0, maintainers: 1, maintainerNames: [], lastPublish: new Date(0).toISOString(),
    deprecation: null, versions: 1, license: 'Unknown', description: '', homepage: '',
  };
  try {
    const query = encodeURIComponent(`g:${groupId} AND a:${artifactId}`);
    const url = `https://search.maven.org/solrsearch/select?q=${query}&rows=20&wt=json`;
    const data = await httpsGet(url);
    const docs = data.response?.docs || [];
    if (docs.length === 0) return { registry: defaultRegistry, githubUrl: null };

    const latest = docs[0];
    const allVersions = docs.filter((d: any) => d.id.startsWith(`${groupId}:${artifactId}`));

    const registry: RegistryData = {
      weeklyDownloads: 0,
      maintainers: 1,
      maintainerNames: [],
      lastPublish: latest.timestamp ? new Date(latest.timestamp).toISOString() : new Date(0).toISOString(),
      deprecation: null,
      versions: allVersions.length || 1,
      license: latest.license?.[0] || 'Unknown',
      description: `${groupId}:${artifactId}`,
      homepage: `https://search.maven.org/artifact/${groupId}/${artifactId}`,
    };

    return { registry, githubUrl: null };
  } catch {
    return { registry: defaultRegistry, githubUrl: null };
  }
}
