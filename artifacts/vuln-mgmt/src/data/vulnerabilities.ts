export type Severity = "Critical" | "High" | "Medium" | "Low";
export type Status = "Open" | "In Progress" | "Resolved" | "Risk Accepted";
export type AssetType = "Server" | "Endpoint" | "Cloud" | "Application" | "Network";
export type Team = "AppSec" | "CloudSec" | "NetSec" | "EndpointSec";

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
  likelihood: number; // 1-5
  impact: number;     // 1-5
}

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const generateVulnerabilities = (count: number): Vulnerability[] => {
  const severities: Severity[] = ["Critical", "High", "Medium", "Low"];
  const statuses: Status[] = ["Open", "In Progress", "Resolved", "Risk Accepted"];
  const assetTypes: AssetType[] = ["Server", "Endpoint", "Cloud", "Application", "Network"];
  const teams: Team[] = ["AppSec", "CloudSec", "NetSec", "EndpointSec"];
  
  const vulns: Vulnerability[] = [];
  
  for (let i = 0; i < count; i++) {
    const isCritical = i < 23;
    const isHigh = i >= 23 && i < 112;
    const isMedium = i >= 112 && i < 299;
    
    let severity: Severity = "Low";
    if (isCritical) severity = "Critical";
    else if (isHigh) severity = "High";
    else if (isMedium) severity = "Medium";
    
    const cvssBase = severity === "Critical" ? 9.0 : severity === "High" ? 7.0 : severity === "Medium" ? 4.0 : 1.0;
    const cvss = Number((cvssBase + Math.random() * 0.9).toFixed(1));
    
    const daysOpen = Math.floor(Math.random() * 120);
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + (30 - daysOpen));
    
    vulns.push({
      id: `VULN-${1000 + i}`,
      cveId: `CVE-202${Math.floor(Math.random() * 5 + 2)}-${Math.floor(Math.random() * 10000 + 1000)}`,
      title: `Vulnerability in Component ${i}`,
      severity,
      cvss,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      asset: `Asset-${Math.floor(Math.random() * 100)}`,
      assetType: assetTypes[Math.floor(Math.random() * assetTypes.length)],
      team: teams[Math.floor(Math.random() * teams.length)],
      daysOpen,
      deadline: deadlineDate.toISOString().split('T')[0],
      description: `Detailed description for VULN-${1000 + i}. Represents a significant risk to the associated asset.`,
      likelihood: Math.floor(Math.random() * 5) + 1,
      impact: Math.floor(Math.random() * 5) + 1,
    });
  }
  
  return vulns;
};

export const MOCK_VULNERABILITIES = generateVulnerabilities(611); // 23+89+187+312
