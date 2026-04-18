import React from "react";
import { ASSET_RISK } from "@/data/metrics";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export default function Assets() {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Risk Score</TableHead>
              <TableHead>Open Vulns</TableHead>
              <TableHead>Patch Compliance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ASSET_RISK.map((asset, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{asset.name}</TableCell>
                <TableCell>{asset.type}</TableCell>
                <TableCell>
                  <span className={`font-bold ${asset.riskScore > 80 ? 'text-[hsl(var(--critical))]' : asset.riskScore > 60 ? 'text-[hsl(var(--high))]' : 'text-[hsl(var(--medium))]'}`}>
                    {asset.riskScore}
                  </span>
                </TableCell>
                <TableCell>{asset.vulnCount}</TableCell>
                <TableCell className="w-[200px]">
                  <div className="flex items-center space-x-2">
                    <Progress value={asset.patchCompliance} className="h-2" />
                    <span className="text-xs text-muted-foreground w-8">{asset.patchCompliance}%</span>
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
