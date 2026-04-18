import React, { useState } from "react";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { Vulnerability } from "@/data/vulnerabilities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Plus, ChevronUp, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/30",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  Low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  "Open": "bg-red-500/10 text-red-400",
  "In Progress": "bg-yellow-500/10 text-yellow-400",
  "Resolved": "bg-green-500/10 text-green-400",
  "Risk Accepted": "bg-gray-500/10 text-gray-400",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", SEVERITY_COLORS[severity] || "bg-muted text-muted-foreground")}>
      {severity}
    </span>
  );
}

type SortKey = keyof Vulnerability;
type SortDir = "asc" | "desc";

export default function Vulnerabilities() {
  const { vulnerabilities, deleteVulnerability } = useVulnerabilities();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Vulnerability | null>(null);
  const PAGE_SIZE = 50;

  const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const filtered = vulnerabilities
    .filter(v => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        v.cveId.toLowerCase().includes(q) ||
        v.asset.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.team.toLowerCase().includes(q);
      const matchesSeverity = severityFilter === "All" || v.severity === severityFilter;
      const matchesStatus = statusFilter === "All" || v.status === statusFilter;
      return matchesSearch && matchesSeverity && matchesStatus;
    })
    .sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (sortKey === "severity") {
        av = SEVERITY_ORDER[a.severity] ?? 99;
        bv = SEVERITY_ORDER[b.severity] ?? 99;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp className="inline h-3 w-3 ml-1" />
      : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search CVE, asset, title, team..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-72"
            data-testid="input-search"
          />
          <Select value={severityFilter} onValueChange={v => { setSeverityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="select-severity-filter">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Severities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
              <SelectItem value="Risk Accepted">Risk Accepted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} results</span>
        </div>
        <Link href="/import">
          <Button size="sm" data-testid="button-add-vulnerability">
            <Plus className="h-4 w-4 mr-2" />
            Add / Import
          </Button>
        </Link>
      </div>

      {/* Table + Detail panel */}
      <div className="flex gap-4">
        <div className={cn("rounded-md border border-border overflow-hidden transition-all", selected ? "flex-1" : "w-full")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cveId")}>
                  CVE ID <SortIcon k="cveId" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("severity")}>
                  Severity <SortIcon k="severity" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cvss")}>
                  CVSS <SortIcon k="cvss" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("asset")}>
                  Asset <SortIcon k="asset" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("daysOpen")}>
                  Days Open <SortIcon k="daysOpen" />
                </TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    No vulnerabilities match your filters.
                  </TableCell>
                </TableRow>
              )}
              {paginated.map((vuln) => (
                <TableRow
                  key={vuln.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setSelected(s => s?.id === vuln.id ? null : vuln)}
                  data-testid={`row-vuln-${vuln.id}`}
                >
                  <TableCell className="font-mono text-xs text-blue-400">{vuln.cveId}</TableCell>
                  <TableCell><SeverityBadge severity={vuln.severity} /></TableCell>
                  <TableCell>
                    <span className={cn("font-semibold", vuln.cvss >= 9 ? "text-red-400" : vuln.cvss >= 7 ? "text-orange-400" : vuln.cvss >= 4 ? "text-yellow-400" : "text-blue-400")}>
                      {vuln.cvss.toFixed(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-[140px] truncate">{vuln.asset}</TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded text-xs", STATUS_COLORS[vuln.status])}>
                      {vuln.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-xs font-medium", vuln.daysOpen > 60 ? "text-red-400" : vuln.daysOpen > 30 ? "text-orange-400" : "text-foreground")}>
                      {vuln.daysOpen}d
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{vuln.team}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{vuln.deadline}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-72 shrink-0 rounded-md border border-border bg-card p-4 space-y-4 self-start sticky top-0" data-testid="panel-vuln-detail">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm text-blue-400 font-medium">{selected.cveId}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.title}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground shrink-0" data-testid="button-close-detail">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <SeverityBadge severity={selected.severity} />
              <span className={cn("px-2 py-0.5 rounded text-xs", STATUS_COLORS[selected.status])}>{selected.status}</span>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { label: "CVSS Score", value: selected.cvss.toFixed(1) },
                { label: "Asset", value: selected.asset },
                { label: "Asset Type", value: selected.assetType },
                { label: "Team", value: selected.team },
                { label: "Days Open", value: `${selected.daysOpen}d` },
                { label: "Deadline", value: selected.deadline },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right max-w-[140px] truncate">{value}</span>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-xs leading-relaxed">{selected.description}</p>
            </div>

            <button
              onClick={() => { deleteVulnerability(selected.id); setSelected(null); }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
              data-testid="button-delete-vuln"
            >
              <X className="h-3 w-3" /> Remove entry
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages} ({filtered.length} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
