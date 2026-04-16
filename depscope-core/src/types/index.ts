export type Ecosystem = 'npm' | 'flutter' | 'android';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type VulnSeverity = 'critical' | 'high' | 'moderate' | 'low';
export type FlagSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Vulnerability {
  title: string;
  severity: VulnSeverity;
  cve: string;
  affectedVersions: string;
}

export interface RiskFlag {
  type: string;
  severity: FlagSeverity;
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

export interface ScanSummary {
  overallScore: number;
  overallRiskLevel: RiskLevel;
  totalDependencies: number;
  directCount: number;
  devCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  vulnerabilityCount: number;
}

export interface ScanResult {
  metadata: {
    projectName: string;
    timestamp: string;
    ecosystem: Ecosystem;
  };
  summary: ScanSummary;
  dependencies: AnalyzedDependency[];
}

export interface ParsedDependency {
  name: string;
  version: string;
  isDev: boolean;
}

export interface IpcRequest {
  type: 'analyze' | 'ping';
  ecosystem?: Ecosystem;
  dependencies?: ParsedDependency[];
  projectName?: string;
  groqApiKey?: string;
  githubToken?: string;
  maxDepth?: number;
  concurrency?: number;
}

export interface IpcResponse {
  success: boolean;
  result?: ScanResult;
  error?: string;
}
