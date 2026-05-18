// Trend data — will be populated from real vulnerability imports
export const MOCK_TRENDS: { month: string; critical: number; high: number; medium: number; low: number }[] = [];

export const MTTR_TRENDS: { month: string; critical: number; high: number }[] = [];

export const ASSET_RISK: { name: string; type: string; riskScore: number; vulnCount: number; patchCompliance: number }[] = [];

export const KPIS = {
  riskScore: 0,
  totalOpen: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  mttrCritical: 0,
  mttrHigh: 0,
  slaCompliance: 0,
  remediationRate: 0,
};
