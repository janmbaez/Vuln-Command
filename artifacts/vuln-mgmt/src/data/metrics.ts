export const MOCK_TRENDS = [
  { month: "May 2025", critical: 45, high: 120, medium: 200, low: 350 },
  { month: "Jun 2025", critical: 42, high: 115, medium: 210, low: 340 },
  { month: "Jul 2025", critical: 38, high: 110, medium: 205, low: 360 },
  { month: "Aug 2025", critical: 40, high: 105, medium: 190, low: 330 },
  { month: "Sep 2025", critical: 35, high: 100, medium: 185, low: 320 },
  { month: "Oct 2025", critical: 30, high: 95, medium: 195, low: 310 },
  { month: "Nov 2025", critical: 32, high: 90, medium: 180, low: 300 },
  { month: "Dec 2025", critical: 28, high: 92, medium: 175, low: 290 },
  { month: "Jan 2026", critical: 25, high: 85, medium: 170, low: 305 },
  { month: "Feb 2026", critical: 27, high: 80, medium: 185, low: 315 },
  { month: "Mar 2026", critical: 24, high: 88, medium: 190, low: 320 },
  { month: "Apr 2026", critical: 23, high: 89, medium: 187, low: 312 },
];

export const MTTR_TRENDS = [
  { month: "May 2025", critical: 8.5, high: 35.2 },
  { month: "Jun 2025", critical: 8.1, high: 34.0 },
  { month: "Jul 2025", critical: 7.5, high: 32.5 },
  { month: "Aug 2025", critical: 7.8, high: 30.1 },
  { month: "Sep 2025", critical: 6.9, high: 28.5 },
  { month: "Oct 2025", critical: 6.2, high: 26.4 },
  { month: "Nov 2025", critical: 5.8, high: 25.0 },
  { month: "Dec 2025", critical: 5.5, high: 22.8 },
  { month: "Jan 2026", critical: 5.0, high: 21.5 },
  { month: "Feb 2026", critical: 4.8, high: 20.1 },
  { month: "Mar 2026", critical: 4.5, high: 19.5 },
  { month: "Apr 2026", critical: 4.2, high: 18.3 },
];

export const ASSET_RISK = [
  { name: "Payment Gateway", type: "Application", riskScore: 92, vulnCount: 14, patchCompliance: 78 },
  { name: "Core Database Cluster", type: "Server", riskScore: 88, vulnCount: 8, patchCompliance: 82 },
  { name: "Customer Portal", type: "Application", riskScore: 85, vulnCount: 22, patchCompliance: 85 },
  { name: "AWS K8s Nodes", type: "Cloud", riskScore: 76, vulnCount: 35, patchCompliance: 91 },
  { name: "Employee Laptops", type: "Endpoint", riskScore: 65, vulnCount: 120, patchCompliance: 94 },
  { name: "VPN Gateway", type: "Network", riskScore: 62, vulnCount: 5, patchCompliance: 95 },
  { name: "Marketing Site", type: "Application", riskScore: 45, vulnCount: 45, patchCompliance: 88 },
  { name: "Internal Wiki", type: "Application", riskScore: 32, vulnCount: 18, patchCompliance: 96 },
];

export const KPIS = {
  riskScore: 67,
  totalOpen: 423,
  critical: 23,
  high: 89,
  medium: 187,
  low: 312,
  mttrCritical: 4.2,
  mttrHigh: 18.3,
  slaCompliance: 87.3,
  remediationRate: 73
};
