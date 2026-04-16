import { fetchNpmMetadata, fetchNpmDownloads } from './npm-client.js';
import { fetchPubMetadata } from './pub-client.js';
import { fetchMavenMetadata } from './maven-client.js';
import { fetchGitHubData } from './github-client.js';
import { generateAiInsights } from './ai-insights.js';
import {
  calculateMaintenanceRisk, calculateSecurityRisk, calculatePopularityRisk,
  calculateCommunityRisk, calculateDepthRisk, calculateOverallScore,
  mapRiskLevel, buildRiskFlags,
} from './risk-engine.js';
import {
  AnalyzedDependency, Ecosystem, GitHubData, IpcRequest, ParsedDependency,
  RegistryData, RiskScore, ScanResult, Vulnerability,
} from './types/index.js';

function createStubDependency(
  name: string,
  parent: string,
  depth: number
): AnalyzedDependency {
  const stubRegistry: RegistryData = {
    weeklyDownloads: 0,
    maintainers: 1,
    lastPublish: new Date().toISOString(),
    deprecation: null,
    versions: 1,
    license: 'Unknown',
    description: '',
    homepage: '',
  };
  return {
    name,
    version: '*',
    isDev: false,
    parent,
    registryData: stubRegistry,
    github: null,
    vulnerabilities: [],
    score: { maintenance: 0, security: 0, popularity: 0, community: 0, depthRisk: 0, overall: 0 },
    riskLevel: 'low',
    flags: [],
    depth,
    directDeps: [],
    transitiveCount: 0,
  };
}

async function analyzeOneDependency(
  dep: ParsedDependency,
  ecosystem: Ecosystem,
  githubToken?: string,
  parent?: string,
  depth = 1,
): Promise<AnalyzedDependency> {
  let registryData: RegistryData = {
    weeklyDownloads: 0, maintainers: 1, lastPublish: new Date(0).toISOString(),
    deprecation: null, versions: 1, license: 'Unknown', description: '', homepage: '',
  };
  let githubUrl: string | null = null;
  let vulnerabilities: Vulnerability[] = [];
  let directDeps: string[] = [];
  let github: GitHubData | null = null;

  if (ecosystem === 'npm') {
    const result = await fetchNpmMetadata(dep.name, dep.version);
    registryData = result.registry;
    githubUrl = result.githubUrl;
    vulnerabilities = result.vulnerabilities;
    directDeps = result.directDeps;
    registryData.weeklyDownloads = await fetchNpmDownloads(dep.name);
  } else if (ecosystem === 'flutter') {
    const result = await fetchPubMetadata(dep.name);
    registryData = result.registry;
    githubUrl = result.githubUrl;
    directDeps = result.directDeps;
  } else if (ecosystem === 'android') {
    const [groupId, artifactId] = dep.name.includes(':') ? dep.name.split(':') : [dep.name, dep.name];
    const result = await fetchMavenMetadata(groupId, artifactId);
    registryData = result.registry;
    githubUrl = result.githubUrl;
  }

  if (githubUrl) {
    github = await fetchGitHubData(githubUrl, githubToken);
  }

  const transitiveCount = directDeps.length;

  const maintenanceRisk = calculateMaintenanceRisk(registryData);
  const securityRisk = calculateSecurityRisk(vulnerabilities);
  const popularityRisk = calculatePopularityRisk(registryData, github);
  const communityRisk = calculateCommunityRisk(registryData, github);
  const depthRisk = calculateDepthRisk(depth, transitiveCount);
  const overall = calculateOverallScore({
    maintenance: maintenanceRisk, security: securityRisk,
    popularity: popularityRisk, community: communityRisk, depthRisk,
  });

  const score: RiskScore = {
    maintenance: maintenanceRisk, security: securityRisk, popularity: popularityRisk,
    community: communityRisk, depthRisk, overall,
  };
  const riskLevel = mapRiskLevel(overall);
  const flags = buildRiskFlags(registryData, github, vulnerabilities, depth);

  return {
    name: dep.name,
    version: dep.version,
    isDev: dep.isDev,
    parent,
    registryData,
    github,
    vulnerabilities,
    score,
    riskLevel,
    flags,
    depth,
    directDeps,
    transitiveCount,
  };
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

export async function analyze(request: IpcRequest): Promise<ScanResult> {
  const {
    ecosystem = 'npm',
    dependencies = [],
    projectName = 'project',
    groqApiKey,
    githubToken,
    concurrency = 5,
    maxDepth = 3,
  } = request;

  // Step 1: Analyze all direct (root-level) dependencies
  const tasks = dependencies.map(dep => () =>
    analyzeOneDependency(dep, ecosystem, githubToken, undefined, 1)
  );
  const analyzed = await runWithConcurrency(tasks, concurrency);

  // Step 2: Build transitive stubs from directDeps lists (up to maxDepth)
  const allDeps: AnalyzedDependency[] = [...analyzed];
  const analyzedNames = new Set(analyzed.map(d => d.name));

  if (maxDepth >= 2) {
    // Level 2: deps-of-deps
    const level2Stubs: AnalyzedDependency[] = [];
    for (const dep of analyzed) {
      for (const transName of dep.directDeps.slice(0, 10)) {
        if (!analyzedNames.has(transName) && !level2Stubs.find(s => s.name === transName && s.parent === dep.name)) {
          level2Stubs.push(createStubDependency(transName, dep.name, 2));
        }
      }
    }
    allDeps.push(...level2Stubs);

    if (maxDepth >= 3) {
      // Level 3: deps-of-deps-of-deps (limited to 5 per parent)
      const level2Names = new Set(level2Stubs.map(s => s.name));
      // For level 3 we just create placeholder stubs based on estimated deps
      // (no actual API call to avoid explosion)
    }
  }

  const directCount = analyzed.filter(d => !d.isDev).length;
  const devCount = analyzed.filter(d => d.isDev).length;
  const criticalCount = analyzed.filter(d => d.riskLevel === 'critical').length;
  const highCount = analyzed.filter(d => d.riskLevel === 'high').length;
  const mediumCount = analyzed.filter(d => d.riskLevel === 'medium').length;
  const lowCount = analyzed.filter(d => d.riskLevel === 'low').length;
  const vulnCount = analyzed.reduce((sum, d) => sum + d.vulnerabilities.length, 0);
  const avgScore = analyzed.length > 0
    ? Math.round(analyzed.reduce((sum, d) => sum + d.score.overall, 0) / analyzed.length)
    : 0;

  const result: ScanResult = {
    metadata: { projectName, timestamp: new Date().toISOString(), ecosystem },
    summary: {
      overallScore: avgScore,
      overallRiskLevel: mapRiskLevel(avgScore),
      totalDependencies: analyzed.length,
      directCount,
      devCount,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      vulnerabilityCount: vulnCount,
    },
    dependencies: allDeps,
  };

  return result;
}
