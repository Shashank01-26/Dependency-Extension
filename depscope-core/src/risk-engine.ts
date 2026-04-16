import { GitHubData, RegistryData, RiskFlag, RiskLevel, RiskScore, Vulnerability } from './types/index.js';

function clamp(val: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, val));
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 9999;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateMaintenanceRisk(registry: RegistryData): number {
  let score = 0;
  const days = daysSince(registry.lastPublish);

  if (days >= 1095) score += 40;
  else if (days >= 730) score += 30;
  else if (days >= 365) score += 20;
  else if (days >= 180) score += 10;

  if (registry.deprecation) score += 30;
  if (registry.versions <= 2) score += 10;

  if (registry.versions > 1) {
    const totalDays = days;
    const avgInterval = totalDays / (registry.versions - 1);
    if (avgInterval > 365) score += 20;
    else if (avgInterval > 180) score += 15;
    else if (avgInterval > 90) score += 10;
    else if (avgInterval > 30) score += 5;
  }

  return clamp(score);
}

export function calculateSecurityRisk(vulnerabilities: Vulnerability[]): number {
  let score = 0;
  for (const v of vulnerabilities) {
    if (v.severity === 'critical') score += 40;
    else if (v.severity === 'high') score += 25;
    else if (v.severity === 'moderate') score += 12;
    else if (v.severity === 'low') score += 5;
  }
  return clamp(score);
}

export function calculatePopularityRisk(registry: RegistryData, github: GitHubData | null): number {
  let score = 0;
  const dl = registry.weeklyDownloads;

  if (dl < 100) score += 35;
  else if (dl < 1000) score += 25;
  else if (dl < 10000) score += 15;
  else if (dl < 100000) score += 5;

  if (!github) {
    score += 15;
  } else {
    const stars = github.stars;
    if (stars < 10) score += 25;
    else if (stars < 100) score += 15;
    else if (stars < 1000) score += 8;
    else if (stars < 10000) score += 3;

    if (github.archived) score += 20;
  }

  return clamp(score);
}

export function calculateCommunityRisk(registry: RegistryData, github: GitHubData | null): number {
  let score = 0;

  if (registry.maintainers === 1) score += 30;
  else if (registry.maintainers === 2) score += 15;

  if (!github) {
    score += 15;
  } else {
    const issueRatio = github.openIssues / Math.max(github.stars, 1);
    if (issueRatio > 0.5) score += 25;

    const daysSinceCommit = daysSince(github.lastCommit);
    if (github.stars > 1000 && daysSinceCommit > 365) score += 20;
  }

  return clamp(score);
}

export function calculateDepthRisk(depth: number, transitiveCount: number): number {
  let score = 0;

  if (depth >= 8) score += 40;
  else if (depth >= 6) score += 30;
  else if (depth >= 4) score += 20;
  else if (depth >= 3) score += 10;

  if (transitiveCount > 100) score += 30;
  else if (transitiveCount > 50) score += 20;
  else if (transitiveCount > 20) score += 15;
  else if (transitiveCount > 10) score += 8;

  return clamp(score);
}

export function calculateOverallScore(scores: Omit<RiskScore, 'overall'>): number {
  return clamp(
    scores.maintenance * 0.25 +
    scores.security * 0.30 +
    scores.popularity * 0.15 +
    scores.community * 0.15 +
    scores.depthRisk * 0.15
  );
}

export function mapRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function buildRiskFlags(
  registry: RegistryData,
  github: GitHubData | null,
  vulnerabilities: Vulnerability[],
  depth: number
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const days = daysSince(registry.lastPublish);

  if (registry.deprecation) {
    flags.push({ type: 'deprecated', severity: 'critical', message: `Package is deprecated: ${registry.deprecation}` });
  }

  if (days > 730) {
    flags.push({ type: 'unmaintained', severity: days > 1095 ? 'critical' : 'high', message: `No updates in ${Math.floor(days / 365)} years` });
  } else if (days > 365) {
    flags.push({ type: 'stale', severity: 'medium', message: `No updates in over a year (${Math.floor(days / 30)}mo)` });
  }

  if (vulnerabilities.length > 0) {
    const hasCritical = vulnerabilities.some(v => v.severity === 'critical');
    const hasHigh = vulnerabilities.some(v => v.severity === 'high');
    flags.push({
      type: 'vulnerable',
      severity: hasCritical ? 'critical' : hasHigh ? 'high' : 'medium',
      message: `${vulnerabilities.length} known vulnerability${vulnerabilities.length > 1 ? 'ies' : 'y'}`,
    });
  }

  if (registry.weeklyDownloads < 1000) {
    flags.push({ type: 'low-popularity', severity: 'low', message: `Only ${registry.weeklyDownloads} weekly downloads` });
  }

  if (registry.maintainers === 1) {
    flags.push({ type: 'single-maintainer', severity: 'medium', message: 'Single maintainer — bus factor risk' });
  }

  if (depth >= 5) {
    flags.push({ type: 'deep-chain', severity: depth >= 7 ? 'high' : 'medium', message: `Deep dependency chain (depth ${depth})` });
  }

  if (github?.archived) {
    flags.push({ type: 'archived', severity: 'critical', message: 'GitHub repository is archived' });
  }

  return flags;
}
