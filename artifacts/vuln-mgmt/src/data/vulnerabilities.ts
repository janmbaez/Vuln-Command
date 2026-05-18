export type Severity = "Critical" | "High" | "Medium" | "Low";
export type Status = "Open" | "In Progress" | "Resolved" | "Risk Accepted";
export type AssetType = "Server" | "Endpoint" | "Cloud" | "Application" | "Network" | "Database";
export type Team = "AppSec" | "CloudSec" | "NetSec" | "EndpointSec" | "Infrastructure" | "Database" | "Messaging";

export interface Vulnerability {
  id: string;
  cveId: string;
  title: string;
  severity: Severity;
  cvss: number;
  status: Status;
  asset: string;
  assetType: AssetType;
  team: Team;
  daysOpen: number;
  deadline: string;
  description: string;
  exploitStatus?: string;
  likelihood: number;
  impact: number;
  /** Immutable first-seen/open date from CrowdStrike or the original import, used for audit history. */
  originalOpenDate?: string;
  /** Mutable SLA clock start date. Resets only when a previously closed vuln re-opens. */
  effectiveSlaStart?: string;
  /** Number of closed -> open transitions detected locally across sync cycles. */
  reopenCount?: number;
  /** ISO date when the most recent re-open transition was detected. */
  lastReopenDate?: string;
  /** Last persisted status before the most recent merge, used to audit transition handling. */
  previousStatus?: Status;
  /** CrowdStrike Agent ID — stored when imported from Falcon Spotlight.
   *  Used as a secondary merge key so that closed-vuln syncs can match
   *  records even when the displayed asset name changed (e.g. after
   *  hostname resolution). */
  aid?: string;
}

// No demo data — import real vulnerabilities via the Import page (CrowdStrike CSV or manual entry)
export const MOCK_VULNERABILITIES: Vulnerability[] = [];
