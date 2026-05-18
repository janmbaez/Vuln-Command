import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { getSlaConfig } from "@/lib/slaConfig";
import { getTeamDisplayNames } from "@/lib/teamConfig";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns a compact sortable key like "2025-04" and a display label like "Apr 2025". */
function monthKey(year: number, month: number): { key: string; label: string } {
  return {
    key:   `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${MONTH_NAMES[month]} ${year}`,
  };
}

// ── Single-pass computation ───────────────────────────────────────────────────
// One loop over the vulnerability list fills all three chart datasets.
// This avoids the previous multi-pass approach (4× filter + 4× reduce + 3× full scan)
// and eliminates the crash-inducing toLocaleDateString() call inside a hot loop.

function buildAllMetrics(
  vulns: ReturnType<typeof useVulnerabilities>["vulnerabilities"],
  slaDays: Record<string, number>,
  atRiskWindow: number,
) {
  const today    = new Date();
  const todayY   = today.getFullYear();
  const todayM   = today.getMonth();

  // ── Trend: last 12 months ──────────────────────────────────────────────────
  const trendMap = new Map<string, {
    label: string; critical: number; high: number; medium: number; low: number;
  }>();
  for (let i = 11; i >= 0; i--) {
    const m   = (todayM - i + 120) % 12;         // wrap months
    const y   = todayY - Math.floor((i - todayM + 120) / 12 - 10);
    const { key, label } = monthKey(
      todayY + Math.floor((todayM - i) / 12),    // proper year rollback
      (todayM - i + 120) % 12,
    );
    // Recalculate correctly:
    const d = new Date(todayY, todayM - i, 1);
    const mk = monthKey(d.getFullYear(), d.getMonth());
    if (!trendMap.has(mk.key)) {
      trendMap.set(mk.key, { label: mk.label, critical: 0, high: 0, medium: 0, low: 0 });
    }
  }

  // ── MTTR accumulators ──────────────────────────────────────────────────────
  type SevBucket = { total: number; sumDays: number };
  const mttrBuckets: Record<string, SevBucket> = {
    Critical: { total: 0, sumDays: 0 },
    High:     { total: 0, sumDays: 0 },
    Medium:   { total: 0, sumDays: 0 },
    Low:      { total: 0, sumDays: 0 },
  };

  // ── Team SLA accumulators ──────────────────────────────────────────────────
  const teamBuckets: Record<string, { total: number; breached: number }> = {};

  // ── Single pass ───────────────────────────────────────────────────────────
  for (const v of vulns) {
    // Trend: use integer arithmetic instead of Intl.DateTimeFormat per row
    if (v.daysOpen >= 0) {
      const openTs = today.getTime() - v.daysOpen * 86_400_000;
      const openDate = new Date(openTs);
      const mk = monthKey(openDate.getFullYear(), openDate.getMonth());
      const bucket = trendMap.get(mk.key);
      if (bucket) {
        const sev = v.severity.toLowerCase() as "critical" | "high" | "medium" | "low";
        bucket[sev]++;
      }
    }

    // MTTR: all vulnerabilities with daysOpen > 0
    if (v.daysOpen > 0 && mttrBuckets[v.severity]) {
      mttrBuckets[v.severity].total++;
      mttrBuckets[v.severity].sumDays += v.daysOpen;
    }

    // Team SLA: open only
    if (v.status !== "Resolved" && v.status !== "Risk Accepted") {
      if (!teamBuckets[v.team]) teamBuckets[v.team] = { total: 0, breached: 0 };
      teamBuckets[v.team].total++;
      const limit = slaDays[v.severity] ?? 180;
      if (v.daysOpen > limit) teamBuckets[v.team].breached++;
    }
  }

  // ── Shape outputs ──────────────────────────────────────────────────────────

  const trendData = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => ({ month: v.label, critical: v.critical, high: v.high, medium: v.medium, low: v.low }));

  const SEV_ORDER = ["Critical", "High", "Medium", "Low"] as const;
  const mttrData = SEV_ORDER.map(s => {
    const b = mttrBuckets[s];
    return {
      severity:  s,
      avgDays:   b.total > 0 ? +(b.sumDays / b.total).toFixed(1) : 0,
      slaTarget: slaDays[s] ?? 180,
      count:     b.total,
    };
  });

  const teamSla = Object.entries(teamBuckets)
    .map(([team, { total, breached }]) => ({
      team,
      compliance: total > 0 ? +(((total - breached) / total) * 100).toFixed(1) : 100,
      breached,
      total,
    }))
    .sort((a, b) => a.compliance - b.compliance)
    .slice(0, 12); // cap at 12 teams so the chart stays readable

  return { trendData, mttrData, teamSla };
}

// ── Chart theme ───────────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High:     "#f97316",
  Medium:   "#eab308",
  Low:      "#3b82f6",
};

const TOOLTIP = {
  contentStyle: { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "hsl(var(--foreground))" },
  itemStyle:    { color: "#94a3b8" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Metrics() {
  const { vulnerabilities } = useVulnerabilities();
  const [configVersion, setConfigVersion] = useState(0);

  // Re-compute when SLA or team config changes
  useEffect(() => {
    const handler = () => setConfigVersion(v => v + 1);
    window.addEventListener("sla-config-changed",  handler);
    window.addEventListener("team-config-changed", handler);
    return () => {
      window.removeEventListener("sla-config-changed",  handler);
      window.removeEventListener("team-config-changed", handler);
    };
  }, []);

  // All three datasets computed in a single pass — no per-row Intl formatters,
  // no duplicate array copies, safe for 100k+ row datasets.
  const { trendData, mttrData, teamSla } = useMemo(() => {
    const cfg = getSlaConfig();
    return buildAllMetrics(vulnerabilities, cfg.days as Record<string, number>, cfg.atRiskWindowDays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vulnerabilities, configVersion]);

  const displayNames = useMemo(() => getTeamDisplayNames(), [configVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = vulnerabilities.length > 0;

  function EmptyState({ msg }: { msg: string }) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{msg}</div>
    );
  }

  // Dynamic chart height for team SLA: scale with number of teams
  const teamChartHeight = Math.max(220, Math.min(teamSla.length * 38 + 40, 480));

  return (
    <div className="space-y-6">

      {/* ── Row 1: Trend + MTTR ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Vulnerability Discovery Trend */}
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Vulnerability Discovery by Month</CardTitle>
            <p className="text-xs text-muted-foreground">
              Estimated from days-open field — shows when each vulnerability was introduced.
            </p>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!hasData
              ? <EmptyState msg="No data — import vulnerabilities first." />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip {...TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="critical" name="Critical" stackId="a" fill={SEV_COLORS.Critical} radius={[0,0,0,0]} />
                    <Bar dataKey="high"     name="High"     stackId="a" fill={SEV_COLORS.High}     radius={[0,0,0,0]} />
                    <Bar dataKey="medium"   name="Medium"   stackId="a" fill={SEV_COLORS.Medium}   radius={[0,0,0,0]} />
                    <Bar dataKey="low"      name="Low"      stackId="a" fill={SEV_COLORS.Low}      radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* MTTR Proxy */}
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Avg. Days Open by Severity (MTTR Proxy)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Grey bar = configured SLA target. Lower avg days = faster remediation.
            </p>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!hasData
              ? <EmptyState msg="No data — import vulnerabilities first." />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mttrData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="severity" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} unit="d" />
                    <Tooltip
                      {...TOOLTIP}
                      formatter={(val: unknown, name: string, props: { payload?: { total: number; breached: number } }) => {
                        return [`${val}d`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="avgDays"   name="Avg Days Open" radius={[4,4,0,0]}>
                      {mttrData.map((entry, i) => (
                        <Cell key={i} fill={SEV_COLORS[entry.severity]} />
                      ))}
                    </Bar>
                    <Bar dataKey="slaTarget" name="SLA Target" fill="#334155" radius={[4,4,0,0]} opacity={0.45} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

      </div>

      {/* ── Team SLA Compliance ──────────────────────────────────────────────── */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">SLA Compliance by Team</CardTitle>
          <p className="text-xs text-muted-foreground">
            % of open vulnerabilities within SLA deadline per team. Uses current SLA Rules configuration.
          </p>
        </CardHeader>
        <CardContent style={{ height: teamChartHeight }}>
          {!hasData
            ? <EmptyState msg="No data — import vulnerabilities first." />
            : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={teamSla.map(t => ({ ...t, teamLabel: displayNames[t.team as keyof typeof displayNames] ?? t.team }))}
                  layout="vertical"
                  margin={{ top: 0, right: 60, bottom: 0, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickCount={6} stroke="#475569" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                  <YAxis type="category" dataKey="teamLabel" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={110} />
                  <Tooltip
                    {...TOOLTIP}
                    formatter={(val: unknown, _name: string, props: { payload?: typeof teamSla[number] }) => {
                      const row = props.payload;
                      if (!row) return [`${val}%`, "Compliance"];
                      return [`${val}% (${row.total - row.breached}/${row.total} within SLA)`, "Compliance"];
                    }}
                  />
                  <Bar dataKey="compliance" name="SLA Compliance" radius={[0,4,4,0]}>
                    {teamSla.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.compliance >= 90 ? "#10b981" : entry.compliance >= 70 ? "#eab308" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
        </CardContent>
      </Card>

      {/* ── SLA Performance Detail Table ────────────────────────────────────── */}
      {hasData && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">SLA Performance Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Severity", "Count", "Avg Days Open", "SLA Target", "Status"].map(h => (
                    <th key={h} className={`py-2 px-3 text-muted-foreground font-medium ${h === "Severity" ? "text-left" : "text-center"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mttrData.map(row => {
                  const over = row.count > 0 && row.avgDays > row.slaTarget;
                  return (
                    <tr key={row.severity} className="border-b border-border/50">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold" style={{ color: SEV_COLORS[row.severity] }}>
                          {row.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">{row.count}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className={row.count === 0 ? "text-muted-foreground" : over ? "text-red-400 font-bold" : "text-green-400"}>
                          {row.count === 0 ? "—" : `${row.avgDays}d`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">{row.slaTarget}d</td>
                      <td className="py-2.5 px-3 text-center">
                        {row.count === 0
                          ? <span className="text-muted-foreground">—</span>
                          : over
                          ? <span className="text-red-400 font-medium">⚠ Over SLA</span>
                          : <span className="text-green-400 font-medium">✓ Within SLA</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
