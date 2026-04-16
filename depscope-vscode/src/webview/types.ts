export interface Vulnerability {
  title: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  cve: string;
  affectedVersions: string;
}

export interface RiskFlag {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface GitHubData {
  stars: number;
  forks: number;
  openIssues: number;
  lastCommit: string;
  archived: boolean;
}

export interface RegistryData {
  weeklyDownloads: number;
  maintainers: number;
  maintainerNames: string[];
  lastPublish: string;
  deprecation: string | null;
  versions: number;
  license: string;
  description: string;
  homepage: string;
}

export interface RiskScore {
  maintenance: number;
  security: number;
  popularity: number;
  community: number;
  depthRisk: number;
  overall: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AnalyzedDependency {
  name: string;
  version: string;
  isDev: boolean;
  registryData: RegistryData;
  github: GitHubData | null;
  vulnerabilities: Vulnerability[];
  score: RiskScore;
  riskLevel: RiskLevel;
  flags: RiskFlag[];
  depth: number;
  directDeps: string[];
  transitiveCount: number;
  parent?: string;
}

export type AiInsightsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AiInsightsData {
  summary: string;
  riskAnalysis: string;
  recommendations: string;
  alternatives: string;
}

export interface ScanResult {
  metadata: {
    projectName: string;
    timestamp: string;
    ecosystem: string;
  };
  summary: {
    overallScore: number;
    overallRiskLevel: string;
    totalDependencies: number;
    directCount: number;
    devCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    vulnerabilityCount: number;
  };
  dependencies: AnalyzedDependency[];
}
