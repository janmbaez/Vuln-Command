import React, { useState } from "react";
import { MOCK_VULNERABILITIES } from "@/data/vulnerabilities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function Vulnerabilities() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");

  const filtered = MOCK_VULNERABILITIES.filter(v => {
    const matchesSearch = v.cveId.toLowerCase().includes(search.toLowerCase()) || 
                          v.asset.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = severityFilter === "All" || v.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  }).slice(0, 50); // Pagination mock

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4 w-full max-w-2xl">
          <Input 
            placeholder="Search CVE or Asset..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-80"
          />
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Severities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CVE ID</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>CVSS</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Days Open</TableHead>
              <TableHead>Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((vuln) => (
              <TableRow key={vuln.id}>
                <TableCell className="font-medium text-blue-400 hover:underline cursor-pointer">{vuln.cveId}</TableCell>
                <TableCell>
                  <SeverityBadge severity={vuln.severity} />
                </TableCell>
                <TableCell>{vuln.cvss}</TableCell>
                <TableCell>{vuln.asset}</TableCell>
                <TableCell>{vuln.status}</TableCell>
                <TableCell>{vuln.daysOpen}</TableCell>
                <TableCell>{vuln.team}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    Critical: "bg-[hsl(var(--critical))]/10 text-[hsl(var(--critical))] border-[hsl(var(--critical))]/20",
    High: "bg-[hsl(var(--high))]/10 text-[hsl(var(--high))] border-[hsl(var(--high))]/20",
    Medium: "bg-[hsl(var(--medium))]/10 text-[hsl(var(--medium))] border-[hsl(var(--medium))]/20",
    Low: "bg-[hsl(var(--low))]/10 text-[hsl(var(--low))] border-[hsl(var(--low))]/20",
  };
  
  const className = colors[severity as keyof typeof colors] || "bg-gray-500/10 text-gray-500";
  
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${className}`}>
      {severity}
    </span>
  );
}
