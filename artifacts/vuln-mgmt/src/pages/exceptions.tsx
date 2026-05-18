import React, { useMemo, useState, useCallback } from "react";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { getTeamDisplayNames } from "@/lib/teamConfig";
import { downloadCsv } from "@/lib/csv";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShieldOff, AlertTriangle, Clock, CheckCircle2, Search,
  ChevronUp, ChevronDown, ChevronsUpDown, FileDown, RefreshCw,
} from "lucide-react";
import type { Severity } from "@/data/vulnerabilities";

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_DAYS = 90; // exceptions older than this are flagged for review

const SEV_STYLE: Record<string, { badge: string; text: string }> = {
  Critical: { badge: "bg-red-500/15 text-red-400 border border-red-500/30",    text: "text-red-400" },
  High:     { badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30", text: "text-orange-400" },
  Medium:   { badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30", text: "text-yellow-400" },
  Low:      { badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30",   text: "text-blue-400" },
};

const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const SEV_ORDER: Severity[] = ["Critical", "High", "Medium", "Low"];

type SortKey = "cveId" | "asset" | "severity" | "team" | "daysOpen";
type SortDir  = "asc" | "desc";

// ── Main Component ────────────────────────────────────────────────────────────

export default function Exceptions() {
  const { vulnerabilities, updateVulnerability } = useVulnerabilities();

  const [search,     setSearch]     = useState("");
  const [sevFilter,  setSevFilter]  = useState<"All" | string>("All");
  const [teamFilter, setTeamFilter] = useState<"All" | string>("All");
  const [staleOnly,  setStaleOnly]  = useState(false);
  const [sortKey,    setSortKey]    = useState<SortKey>("daysOpen");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");

  const displayNames = useMemo(() => getTeamDisplayNames(), []);

  // ── Compute ───────────────────────────────────────────────────────────────
  const { exceptions, sevCounts, teamCounts, staleCount, totalOpen } = useMemo(() => {
    const list = vulnerabilities.filter(v => v.status === "Risk Accepted");
    const staleCount = list.filter(v => v.daysOpen >= STALE_THRESHOLD_DAYS).length;
    const totalOpen  = vulnerabilities.filter(v =>
      v.status !== "Resolved" && v.status !== "Risk Accepted"
    ).length;

    const sevCounts: Record<string, number> = {};
    const teamCounts: Record<string, number> = {};
    for (const v of list) {
      sevCounts[v.severity]  = (sevCounts[v.severity]  ?? 0) + 1;
      teamCounts[v.team]     = (teamCounts[v.team]     ?? 0) + 1;
    }

    return { exceptions: list, sevCounts, teamCounts, staleCount, totalOpen };
  }, [vulnerabilities]);

  // Unique teams with exceptions
  const teamsWithExceptions = useMemo(
    () => Object.keys(teamCounts).sort(),
    [teamCounts],
  );

  // ── Filtered + sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exceptions
      .filter(v => {
        if (sevFilter  !== "All" && v.severity !== sevFilter)       return false;
        if (teamFilter !== "All" && v.team     !== teamFilter)      return false;
        if (staleOnly  && v.daysOpen < STALE_THRESHOLD_DAYS)        return false;
        if (q && !v.cveId.toLowerCase().includes(q) &&
                 !v.asset.toLowerCase().includes(q))                return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "cveId":    cmp = a.cveId.localeCompare(b.cveId); break;
          case "asset":    cmp = a.asset.localeCompare(b.asset); break;
          case "severity": cmp = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0); break;
          case "team":     cmp = a.team.localeCompare(b.team); break;
          case "daysOpen": cmp = a.daysOpen - b.daysOpen; break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [exceptions, search, sevFilter, teamFilter, staleOnly, sortKey, sortDir]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleReopen = useCallback((id: string, asInProgress?: boolean) => {
    updateVulnerability(id, { status: asInProgress ? "In Progress" : "Open" });
  }, [updateVulnerability]);

  const handleExportCsv = useCallback(() => {
    const rows = [
      ["CVE ID", "Asset", "Severity", "Team", "Days Open", "Stale?", "Description"],
      ...filtered.map(v => [
        v.cveId,
        v.asset,
        v.severity,
        displayNames[v.team as keyof typeof displayNames] ?? v.team,
        v.daysOpen,
        v.daysOpen >= STALE_THRESHOLD_DAYS ? "Yes" : "No",
        v.description,
      ]),
    ];
    downloadCsv(`Risk_Exceptions_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }, [filtered, displayNames]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d === "asc" ? "desc" : "asc");
      else              setSortDir("desc");
      return key;
    });
  }, []);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    return sortDir === "desc"
      ? <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />
      : <ChevronUp   className="h-3 w-3 ml-1 text-primary inline" />;
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (vulnerabilities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <ShieldOff className="h-10 w-10 mb-3 opacity-50" />
        <p className="text-sm font-medium">No vulnerability data yet.</p>
        <p className="text-xs mt-1">Import vulnerabilities to manage risk exceptions.</p>
      </div>
    );
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mb-3 text-green-400" />
        <p className="text-sm font-medium">No risk exceptions recorded.</p>
        <p className="text-xs mt-1">
          Vulnerabilities marked <em>Risk Accepted</em> will appear here for tracking and review.
        </p>
      </div>
    );
  }

  const exceptionRate = totalOpen + exceptions.length > 0
    ? Math.round((exceptions.length / (totalOpen + exceptions.length)) * 100)
    : 0;

  return (
    <div className="space-y-5">

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-2xl font-bold">{exceptions.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Exceptions</div>
          <div className="text-xs text-muted-foreground mt-0.5">{exceptionRate}% of all vulnerabilities</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className={`text-2xl font-bold ${(sevCounts["Critical"] ?? 0) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {sevCounts["Critical"] ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Critical Exceptions</div>
          <div className="text-xs text-orange-400 mt-0.5">{sevCounts["High"] ?? 0} High</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className={`text-2xl font-bold ${staleCount > 0 ? "text-orange-400" : "text-green-400"}`}>
            {staleCount}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Stale Exceptions</div>
          <div className="text-xs text-muted-foreground mt-0.5">Over {STALE_THRESHOLD_DAYS} days old</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-2xl font-bold">{teamsWithExceptions.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Teams with Exceptions</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {Math.max(...Object.values(sevCounts))} max per severity
          </div>
        </div>
      </div>

      {/* ── Per-severity mini cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SEV_ORDER.map(sev => {
          const st    = SEV_STYLE[sev];
          const count = sevCounts[sev] ?? 0;
          const isActive = sevFilter === sev;
          return (
            <button
              key={sev}
              onClick={() => setSevFilter(p => p === sev ? "All" : sev)}
              className={`rounded-lg border bg-card px-4 py-3 text-left transition-all ring-2 ${
                isActive ? "border-transparent ring-primary/60" : "border-border ring-transparent hover:border-primary/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>{sev}</span>
              </div>
              <div className={`text-2xl font-bold ${st.text}`}>{count}</div>
              <div className="text-xs text-muted-foreground">
                {count === 1 ? "exception" : "exceptions"}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search CVE or asset…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
          />
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Team filter */}
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="text-xs rounded-md border border-border bg-muted/40 text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="All">All Teams</option>
          {teamsWithExceptions.map(team => (
            <option key={team} value={team}>
              {displayNames[team as keyof typeof displayNames] ?? team} ({teamCounts[team] ?? 0})
            </option>
          ))}
        </select>

        {/* Stale toggle */}
        <button
          onClick={() => setStaleOnly(p => !p)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
            staleOnly
              ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
              : "border-border text-muted-foreground hover:border-orange-500/30 hover:text-orange-400"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Stale Only ({staleCount})
        </button>

        {/* Active sev pill */}
        {sevFilter !== "All" && (
          <>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => setSevFilter("All")}
              className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 ${SEV_STYLE[sevFilter]?.badge ?? ""}`}
            >
              {sevFilter} <span className="opacity-60">×</span>
            </button>
          </>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-green-500/50 hover:text-green-400 transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px] cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cveId")}>
                CVE ID <SortIcon col="cveId" />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("asset")}>
                Asset <SortIcon col="asset" />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("severity")}>
                Severity <SortIcon col="severity" />
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("team")}>
                Team <SortIcon col="team" />
              </TableHead>
              <TableHead className="text-center cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("daysOpen")}>
                Age <SortIcon col="daysOpen" />
              </TableHead>
              <TableHead className="text-center w-[80px]">Status</TableHead>
              <TableHead className="text-right w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  No exceptions match the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(v => {
                const st    = SEV_STYLE[v.severity] ?? SEV_STYLE.Low;
                const stale = v.daysOpen >= STALE_THRESHOLD_DAYS;
                const teamLabel = displayNames[v.team as keyof typeof displayNames] ?? v.team;
                return (
                  <TableRow key={v.id} className={stale ? "bg-orange-500/5" : ""}>
                    <TableCell className="font-mono text-xs font-medium" title={v.cveId}>
                      {v.cveId.length > 20 ? v.cveId.slice(0, 20) + "…" : v.cveId}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate" title={v.asset}>
                      {v.asset}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>
                        {v.severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={teamLabel}>
                      {teamLabel}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-semibold ${stale ? "text-orange-400" : "text-muted-foreground"}`}>
                        {v.daysOpen}d
                      </span>
                      {stale && (
                        <div className="text-[10px] text-orange-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Stale
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        Accepted
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleReopen(v.id, false)}
                          title="Re-open as Open"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Re-open
                        </button>
                        <button
                          onClick={() => handleReopen(v.id, true)}
                          title="Mark as In Progress"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:border-blue-500/50 hover:text-blue-400 transition-colors"
                        >
                          In Progress
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Guidance footer ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Risk Exception Policy
            </p>
            <p className="text-xs text-muted-foreground">
              Exceptions should be reviewed every <strong className="text-foreground">90 days</strong>.
              Stale exceptions (flagged in orange) indicate accepted risks that may no longer reflect current threat context.
              Use <em>Re-open</em> to return a vulnerability to the active remediation queue, or <em>In Progress</em> to begin remediation immediately.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
