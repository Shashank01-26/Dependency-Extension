import * as https from 'https';
import { GitHubData } from './types/index.js';

function httpsGet(url: string, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const headers: Record<string, string> = {
      'User-Agent': 'depscope/1.0.0',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) headers['Authorization'] = `token ${token}`;
    const req = https.request({
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers,
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

export async function fetchGitHubData(githubUrl: string, token?: string): Promise<GitHubData | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, '');

    const [repoData, commitsData] = await Promise.all([
      httpsGet(`https://api.github.com/repos/${owner}/${cleanRepo}`, token),
      httpsGet(`https://api.github.com/repos/${owner}/${cleanRepo}/commits?per_page=1`, token),
    ]);

    if (repoData.message === 'Not Found') return null;

    const lastCommit = Array.isArray(commitsData) && commitsData[0]
      ? commitsData[0].commit?.committer?.date || commitsData[0].commit?.author?.date || new Date(0).toISOString()
      : new Date(0).toISOString();

    return {
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      openIssues: repoData.open_issues_count || 0,
      lastCommit,
      archived: repoData.archived || false,
    };
  } catch {
    return null;
  }
}
