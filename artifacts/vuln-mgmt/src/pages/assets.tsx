import React, { useMemo } from "react";
import { useVulnerabilities, getSlaDays } from "@/context/VulnerabilityContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

function computeAssets(vulns: ReturnType<typeof useVulnerabilities>["vulnerabilities"]) {
  const assetMap: Record<string, {
    name: string; type: string;
    total: number; open: number;
    critCount: number; highCount: number; medCount: number; lowCount: number;
    breached: number;
  }> = {};

  for (const v of vulns) {
    if (!assetMap[v.asset]) {
      assetMap[v.asset] = {
        name: v.asset, type: v.assetType,
        total: 0, open: 0,
        critCount: 0, highCount: 0, medCount: 0, lowCount: 0,
        breached: 0,
      };
    }
    const a = assetMap[v.asset];
    a.total++;
    if (v.status !== "Resolved" && v.status !== "Risk Accepted") {
      a.open++;
      if (v.severity === "Critical") a.critCount++;
      else if (v.severity === "High") a.highCount++;
      else if (v.severity === "Medium") a.medCount++;
      else a.lowCount++;
      if (v.daysOpen > (getSlaDays() as Record<string,number>)[v.severity]) a.breached++;
    }
  }

  return Object.values(assetMap)
    .map(a => {
      // Risk score: weighted by severity + SLA breach ratio
      const rawRisk = (a.critCount * 10 + a.highCount * 6 + a.medCount * 2 + a.lowCount * 0.5);
      const riskScore = Math.min(100, Math.round(rawRisk));
      const patchCompliance = a.total > 0
        ? Math.round(((a.total - a.open) / a.total) * 100)
        : 100;
      return { ...a, riskScore, patchCompliance };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export default function Assets() {
  const { vulnerabilities } = useVulnerabilities();
  const assets = useMemo(() => computeAssets(vulnerabilities), [vulnerabilities]);

  if (vulnerabilities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <div className="text-4xl mb-3">🖥</div>
        <p className="text-sm font-medium">No asset data yet.</p>
        <p className="text-xs mt-1">Import vulnerabilities to see asset risk profiles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Assets",    value: assets.length },
          { label: "High-Risk Assets (score ≥ 50)", value: assets.filter(a => a.riskScore >= 50).length, cls: "text-red-400" },
          { label: "Assets with SLA Breaches", value: assets.filter(a => a.breached > 0).length, cls: "text-orange-400" },
          { label: "Fully Patched",   value: assets.filter(a => a.patchCompliance === 100).length, cls: "text-green-400" },
        ].map(k => (
          <div key={k.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className={`text-2xl font-bold ${k.cls ?? ""}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-center">Risk Score</TableHead>
              <TableHead className="text-center">Open Vulns</TableHead>
              <TableHead className="text-center">Critical</TableHead>
              <TableHead className="text-center">High</TableHead>
              <TableHead className="text-center">SLA Breaches</TableHead>
              <TableHead>Patch Compliance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((a, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.type}</TableCell>
                <TableCell className="text-center">
                  <span className={`font-bold text-sm ${
                    a.riskScore >= 50 ? "text-red-400" :
                    a.riskScore >= 20 ? "text-orange-400" :
                    a.riskScore >= 5  ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {a.riskScore}
                  </span>
                </TableCell>
                <TableCell className="text-center font-semibold">{a.open}</TableCell>
                <TableCell className="text-center">
                  {a.critCount > 0
                    ? <span className="text-red-400 font-bold">{a.critCount}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {a.highCount > 0
                    ? <span className="text-orange-400 font-semibold">{a.highCount}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {a.breached > 0
                    ? <span className="text-red-400 font-semibold">{a.breached}</span>
                    : <span className="text-green-400 text-xs">✓ None</span>}
                </TableCell>
                <TableCell className="w-[200px]">
                  <div className="flex items-center gap-2">
                    <Progress value={a.patchCompliance} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground w-9 text-right">{a.patchCompliance}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
