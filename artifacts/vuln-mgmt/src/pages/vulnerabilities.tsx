import React, { useState, useEffect } from "react";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { Vulnerability, Status } from "@/data/vulnerabilities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, ChevronUp, ChevronDown, X, CheckCircle2, Clock, ShieldOff, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/30",
  High:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  Low:      "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  "Open":          "bg-red-500/10 text-red-400",
  "In Progress":   "bg-yellow-500/10 text-yellow-400",
  "Resolved":      "bg-green-500/10 text-green-400",
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

const STATUS_ACTIONS: { status: Status; label: string; icon: React.ReactNode; cls: string }[] = [
  { status: "Resolved",      label: "Mark Resolved",      icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-green-400 border-green-500/30 hover:bg-green-500/10" },
  { status: "In Progress",   label: "Mark In Progress",   icon: <Clock className="h-3.5 w-3.5" />,        cls: "text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10" },
  { status: "Risk Accepted", label: "Accept Risk",        icon: <ShieldOff className="h-3.5 w-3.5" />,    cls: "text-gray-400 border-gray-500/30 hover:bg-gray-500/10" },
  { status: "Open",          label: "Reopen",             icon: <RotateCcw className="h-3.5 w-3.5" />,    cls: "text-red-400 border-red-500/30 hover:bg-red-500/10" },
];

export default function Vulnerabilities() {
  const { vulnerabilities, deleteVulnerability, updateVulnerability } = useVulnerabilities();
  const [search, setSearch]             = useState("");
  const [severityFilter, setSeverity]   = useState("All");
  const [statusFilter, setStatus]       = useState("All");
  const [sortKey, setSortKey]           = useState<SortKey>("severity");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [page, setPage]                 = useState(1);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const filtered = vulnerabilities
    .filter(v => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        v.cveId.toLowerCase().includes(q) ||
        v.asset.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.team.toLowerCase().includes(q);
      return matchSearch
        && (severityFilter === "All" || v.severity === severityFilter)
        && (statusFilter   === "All" || v.status   === statusFilter);
    })
    .sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (sortKey === "severity") { av = SEVERITY_ORDER[a.severity] ?? 99; bv = SEVERITY_ORDER[b.severity] ?? 99; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Re-derive selected from context so it updates after status changes
  const selected = selectedId ? vulnerabilities.find(v => v.id === selectedId) ?? null : null;

  // Close panel if vulnerability was deleted
  useEffect(() => {
    if (selectedId && !vulnerabilities.find(v => v.id === selectedId)) setSelectedId(null);
  }, [vulnerabilities, selectedId]);

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

  function handleStatusChange(id: string, newStatus: Status) {
    updateVulnerability(id, { status: newStatus });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search CVE, asset, title, team…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-72"
          />
          <Select value={severityFilter} onValueChange={v => { setSeverity(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Severities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
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
          <Button size="sm">
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
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cveId")}>CVE ID <SortIcon k="cveId" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("severity")}>Severity <SortIcon k="severity" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cvss")}>CVSS <SortIcon k="cvss" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("asset")}>Asset <SortIcon k="asset" /></TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("daysOpen")}>Days Open <SortIcon k="daysOpen" /></TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    {vulnerabilities.length === 0
                      ? "No vulnerabilities yet. Use Import to add data."
                      : "No vulnerabilities match your filters."}
                  </TableCell>
                </TableRow>
              )}
              {paginated.map(vuln => (
                <TableRow
                  key={vuln.id}
                  className={cn("cursor-pointer hover:bg-muted/30 transition-colors", selectedId === vuln.id && "bg-primary/5 border-l-2 border-l-primary")}
                  onClick={() => setSelectedId(s => s === vuln.id ? null : vuln.id)}
                >
                  <TableCell className="font-mono text-xs text-blue-400">{vuln.cveId}</TableCell>
                  <TableCell><SeverityBadge severity={vuln.severity} /></TableCell>
                  <TableCell>
                    <span className={cn("font-semibold text-sm", vuln.cvss >= 9 ? "text-red-400" : vuln.cvss >= 7 ? "text-orange-400" : vuln.cvss >= 4 ? "text-yellow-400" : "text-blue-400")}>
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

        {/* ── Detail Panel ───────────────────────────────────── */}
        {selected && (
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-5 space-y-5 self-start sticky top-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-sm text-blue-400 font-semibold">{selected.cveId}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{selected.title}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <SeverityBadge severity={selected.severity} />
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", STATUS_COLORS[selected.status])}>
                {selected.status}
              </span>
            </div>

            {/* Meta */}
            <div className="space-y-1.5 text-xs">
              {[
                { label: "CVSS Score",  value: selected.cvss.toFixed(1) },
                { label: "Asset",       value: selected.asset },
                { label: "Asset Type",  value: selected.assetType },
                { label: "Team",        value: selected.team },
                { label: "Days Open",   value: `${selected.daysOpen}d` },
                { label: "Deadline",    value: selected.deadline },
                ...(selected.exploitStatus ? [{ label: "Exploit Status", value: selected.exploitStatus }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">{label}</span>
                  <span className="font-medium text-right truncate max-w-[160px]" title={value}>{value}</span>
                </div>
              ))}
            </div>

            {/* Description */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Description</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{selected.description}</p>
            </div>

            {/* ── Status Actions ── */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Update Status</p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_ACTIONS.filter(a => a.status !== selected.status).map(action => (
                  <button
                    key={action.status}
                    onClick={() => handleStatusChange(selected.id, action.status)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors",
                      action.cls
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => { deleteVulnerability(selected.id); }}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors w-full justify-center py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete entry
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages} ({filtered.length} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
