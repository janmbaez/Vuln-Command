import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { getSlaConfig } from "@/lib/slaConfig";
import {
  getTeamDisplayNames, setTeamDisplayNames, resetTeamDisplayNames,
  TEAM_IDS, TEAM_DEFAULTS,
} from "@/lib/teamConfig";
import type { TeamId } from "@/lib/teamConfig";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, ShieldAlert, TrendingDown, AlertTriangle,
  Settings, RotateCcw, X, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMetrics {
  teamId: TeamId;
  displayName: string;
  total: number;
  critCount: number;
  highCount: number;
  medCount: number;
  lowCount: number;
  breached: number;
  atRisk: number;
  slaCompliance: number;
  riskScore: number;
}

type SortKey = Exclude<keyof TeamMetrics, "teamId" | "displayName">;
type SortDir = "asc" | "desc";

// ── Main Component ────────────────────────────────────────────────────────────

export default function Teams() {
  const { vulnerabilities } = useVulnerabilities();

  const [sortKey,      setSortKey]      = useState<SortKey>("riskScore");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [configVersion, setConfigVersion] = useState(0);
  const [renameOpen,   setRenameOpen]   = useState(false);

  // Re-render on SLA or team name changes
  useEffect(() => {
    const handler = () => setConfigVersion(v => v + 1);
    window.addEventListener("sla-config-changed",  handler);
    window.addEventListener("team-config-changed", handler);
    return () => {
      window.removeEventListener("sla-config-changed",  handler);
      window.removeEventListener("team-config-changed", handler);
    };
  }, []);

  // ── Single-pass compute ───────────────────────────────────────────────────
  const teams = useMemo(() => {
    const cfg          = getSlaConfig();
    const slaDays      = cfg.days as Record<string, number>;
    const atRiskWindow = cfg.atRiskWindowDays;
    const displayNames = getTeamDisplayNames();

    // Build per-team buckets — defence: skip vulns with unknown team values
    const buckets: Record<string, {
      total: number; critCount: number; highCount: number;
      medCount: number; lowCount: number; breached: number; atRisk: number;
    }> = {};
    for (const id of TEAM_IDS) {
      buckets[id] = { total: 0, critCount: 0, highCount: 0, medCount: 0, lowCount: 0, breached: 0, atRisk: 0 };
    }

    for (const v of vulnerabilities) {
      if (v.status === "Resolved" || v.status === "Risk Accepted") continue;

      // Guard: skip vulnerabilities whose team is not in our known list
      const b = buckets[v.team];
      if (!b) continue;

      b.total++;
      if      (v.severity === "Critical") b.critCount++;
      else if (v.severity === "High")     b.highCount++;
      else if (v.severity === "Medium")   b.medCount++;
      else                                b.lowCount++;

      const limit = slaDays[v.severity] ?? 180;
      const left  = limit - v.daysOpen;
      if (left < 0)                  b.breached++;
      else if (left <= atRiskWindow) b.atRisk++;
    }

    const result: TeamMetrics[] = TEAM_IDS.map(id => {
      const b = buckets[id];
      const riskScore = Math.min(
        100,
        Math.round(b.critCount * 10 + b.highCount * 6 + b.medCount * 2 + b.lowCount * 0.5),
      );
      const slaCompliance = b.total > 0
        ? Math.round(((b.total - b.breached) / b.total) * 100)
        : 100;
      return {
        teamId: id,
        displayName: displayNames[id] ?? id,
        ...b, riskScore, slaCompliance,
      };
    }).filter(t => t.total > 0);

    // Sort
    result.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vulnerabilities, sortKey, sortDir, configVersion]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d === "desc" ? "asc" : "desc");
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
        <Users className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm font-medium">No team data yet.</p>
        <p className="text-xs mt-1">Import vulnerabilities to see team workload.</p>
      </div>
    );
  }

  const highestRiskTeam  = teams[0] ?? null;
  const worstSlaTeam     = [...teams].sort((a, b) => a.slaCompliance - b.slaCompliance)[0] ?? null;
  const teamsWithBreaches = teams.filter(t => t.breached > 0).length;

  return (
    <div className="space-y-6">

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-2xl font-bold">{teams.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Active Teams</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-lg font-bold text-red-400 truncate" title={highestRiskTeam?.displayName}>
            {highestRiskTeam?.displayName ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Highest Risk Team</div>
          {highestRiskTeam && (
            <div className="text-xs text-red-400 font-medium mt-0.5">Score {highestRiskTeam.riskScore}</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-lg font-bold text-orange-400 truncate" title={worstSlaTeam?.displayName}>
            {worstSlaTeam ? `${worstSlaTeam.displayName}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Worst SLA Compliance</div>
          {worstSlaTeam && (
            <div className="text-xs text-orange-400 font-medium mt-0.5">{worstSlaTeam.slaCompliance}%</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className={`text-2xl font-bold ${teamsWithBreaches > 0 ? "text-red-400" : "text-green-400"}`}>
            {teamsWithBreaches}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Teams With SLA Breaches</div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {teams.length} team{teams.length !== 1 ? "s" : ""} with open vulnerabilities
        </p>
        <button
          onClick={() => setRenameOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Rename Teams
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Team</TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("total")}>
                Open Vulns <SortIcon col="total" />
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("critCount")}>
                Critical <SortIcon col="critCount" />
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("highCount")}>
                High <SortIcon col="highCount" />
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("breached")}>
                Breaches <SortIcon col="breached" />
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("atRisk")}>
                At Risk <SortIcon col="atRisk" />
              </TableHead>
              <TableHead className="cursor-pointer hover:text-foreground select-none w-[200px]" onClick={() => toggleSort("slaCompliance")}>
                SLA Compliance <SortIcon col="slaCompliance" />
              </TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("riskScore")}>
                Risk Score <SortIcon col="riskScore" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  No open vulnerabilities found.
                </TableCell>
              </TableRow>
            ) : teams.map(team => (
              <TableRow key={team.teamId}>
                <TableCell>
                  <div>
                    <div className="font-medium text-sm">{team.displayName}</div>
                    <div className="text-xs text-muted-foreground/60">{team.teamId}</div>
                  </div>
                </TableCell>
                <TableCell className="text-center font-semibold">{team.total}</TableCell>
                <TableCell className="text-center">
                  {team.critCount > 0
                    ? <span className="text-red-400 font-bold">{team.critCount}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {team.highCount > 0
                    ? <span className="text-orange-400 font-semibold">{team.highCount}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {team.breached > 0
                    ? <span className="text-red-400 font-semibold">{team.breached}</span>
                    : <span className="text-green-400 text-xs">✓ None</span>}
                </TableCell>
                <TableCell className="text-center">
                  {team.atRisk > 0
                    ? <span className="text-yellow-400 font-semibold">{team.atRisk}</span>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={team.slaCompliance}
                      className="h-2 flex-1"
                    />
                    <span className={`text-xs font-medium w-9 text-right ${
                      team.slaCompliance >= 90 ? "text-green-400" :
                      team.slaCompliance >= 75 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {team.slaCompliance}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className={`font-bold text-sm ${
                    team.riskScore >= 70 ? "text-red-400" :
                    team.riskScore >= 40 ? "text-orange-400" :
                    team.riskScore >= 15 ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {team.riskScore}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Workload distribution bar ────────────────────────────────────────── */}
      {teams.length > 1 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Vulnerability Distribution by Team
          </p>
          {(() => {
            const maxTotal = Math.max(...teams.map(t => t.total), 1);
            return teams.map(team => (
              <div key={team.teamId} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <span className="text-xs text-muted-foreground truncate block" title={team.displayName}>
                    {team.displayName}
                  </span>
                </div>
                <div className="flex-1 h-5 rounded-sm bg-muted overflow-hidden relative">
                  {/* Crit segment */}
                  {team.critCount > 0 && (
                    <div
                      className="absolute left-0 top-0 h-full bg-red-500"
                      style={{ width: `${(team.critCount / maxTotal) * 100}%` }}
                    />
                  )}
                  {/* High segment */}
                  {team.highCount > 0 && (
                    <div
                      className="absolute top-0 h-full bg-orange-400"
                      style={{
                        left:  `${(team.critCount / maxTotal) * 100}%`,
                        width: `${(team.highCount / maxTotal) * 100}%`,
                      }}
                    />
                  )}
                  {/* Med segment */}
                  {team.medCount > 0 && (
                    <div
                      className="absolute top-0 h-full bg-yellow-400"
                      style={{
                        left:  `${((team.critCount + team.highCount) / maxTotal) * 100}%`,
                        width: `${(team.medCount / maxTotal) * 100}%`,
                      }}
                    />
                  )}
                  {/* Low segment */}
                  {team.lowCount > 0 && (
                    <div
                      className="absolute top-0 h-full bg-blue-400"
                      style={{
                        left:  `${((team.critCount + team.highCount + team.medCount) / maxTotal) * 100}%`,
                        width: `${(team.lowCount / maxTotal) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{team.total}</span>
              </div>
            ));
          })()}
          <div className="flex items-center gap-4 pt-1">
            {[
              { label: "Critical", cls: "bg-red-500" },
              { label: "High",     cls: "bg-orange-400" },
              { label: "Medium",   cls: "bg-yellow-400" },
              { label: "Low",      cls: "bg-blue-400" },
            ].map(({ label, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${cls}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rename Modal ─────────────────────────────────────────────────────── */}
      {renameOpen && <TeamRenameModal onClose={() => setRenameOpen(false)} />}

    </div>
  );
}

// ── Team Rename Modal ─────────────────────────────────────────────────────────

function TeamRenameModal({ onClose }: { onClose: () => void }) {
  const current = getTeamDisplayNames();
  const [names, setNames] = useState<Record<TeamId, string>>({ ...current });
  const [saved, setSaved]  = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isDefault = TEAM_IDS.every(id => names[id] === TEAM_DEFAULTS[id]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    // Trim and fall back to default if left blank
    const sanitised = { ...names };
    for (const id of TEAM_IDS) {
      sanitised[id] = names[id].trim() || TEAM_DEFAULTS[id];
    }
    setTeamDisplayNames(sanitised);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const handleReset = () => {
    resetTeamDisplayNames();
    setNames({ ...TEAM_DEFAULTS });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Rename Teams</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Set custom display names for your security teams. The internal team ID stays the same — only the displayed label changes.
          </p>
          <div className="space-y-3">
            {TEAM_IDS.map(id => (
              <div key={id} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                    {id}
                  </span>
                </div>
                <input
                  type="text"
                  value={names[id]}
                  onChange={e => setNames(prev => ({ ...prev, [id]: e.target.value }))}
                  maxLength={40}
                  placeholder={TEAM_DEFAULTS[id]}
                  className="flex-1 text-xs rounded-md border border-border bg-muted/40 text-foreground px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}
          </div>
          {!isDefault && (
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <Settings className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                You have <span className="text-foreground font-medium">custom team names</span> active. Click <em>Reset</em> to restore original names.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={handleReset}
            disabled={isDefault}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-70"
            >
              {saved ? "Saved!" : "Save Names"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
