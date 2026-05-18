import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { getSlaConfig } from "@/lib/slaConfig";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ShieldAlert, Target, Activity, Clock } from "lucide-react";
import { Link } from "wouter";

// ── Month key helper — avoids Intl.DateTimeFormat allocation per call ──────────
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function mkLabel(year: number, month: number) {
  return `${MONTH_ABBR[month]} ${year}`;
}

// ── Single-pass computation ────────────────────────────────────────────────────
// One loop over vulnerabilities fills KPIs + 12-month trend simultaneously.
// This replaces 7 separate .filter() passes and eliminates per-row
// Intl.DateTimeFormat allocation (the crash root cause on large datasets).
function computeAll(
  vulns: ReturnType<typeof useVulnerabilities>["vulnerabilities"],
  slaDays: Record<string, number>,
) {
  // Build empty 12-month trend buckets using integer arithmetic only
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayMs = today.getTime();

  const trendMap = new Map<string, { label: string; critical: number; high: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(todayY, todayM - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    trendMap.set(key, { label: mkLabel(d.getFullYear(), d.getMonth()), critical: 0, high: 0 });
  }

  // KPI accumulators
  let critical = 0, high = 0, medium = 0, low = 0;
  let critSumDays = 0;
  let resolved = 0;
  let withinSLA = 0;
  let totalOpen = 0; // non-resolved

  for (const v of vulns) {
    const isResolved     = v.status === "Resolved";
    const isRiskAccepted = v.status === "Risk Accepted";

    if (isResolved) { resolved++; continue; }

    // All non-resolved count as open for KPI purposes
    totalOpen++;
    const limit = slaDays[v.severity] ?? 180;
    if (v.daysOpen <= limit) withinSLA++;

    if      (v.severity === "Critical") { critical++; critSumDays += v.daysOpen; }
    else if (v.severity === "High")     { high++; }
    else if (v.severity === "Medium")   { medium++; }
    else                                { low++; }

    // Trend: compute which month this was opened using ms arithmetic — no Intl
    if (!isRiskAccepted && (v.severity === "Critical" || v.severity === "High")) {
      const openMs   = todayMs - v.daysOpen * 86_400_000;
      const openDate = new Date(openMs);
      const key = `${openDate.getFullYear()}-${String(openDate.getMonth()).padStart(2, "0")}`;
      const bucket = trendMap.get(key);
      if (bucket) {
        if (v.severity === "Critical") bucket.critical++;
        else                           bucket.high++;
      }
    }
  }

  const total = vulns.length;
  const slaCompliance = totalOpen > 0
    ? +((withinSLA / totalOpen) * 100).toFixed(1)
    : 100;
  const remediationRate = total > 0
    ? +((resolved / total) * 100).toFixed(0)
    : 0;
  const mttrCritical = critical > 0
    ? +(critSumDays / critical).toFixed(1)
    : 0;
  const riskScore = Math.min(100, Math.round(
    (critical * 4.0 + high * 1.5 + medium * 0.3 + low * 0.05) / 10,
  ));

  const trendData = Array.from(trendMap.values());

  return {
    kpis: { critical, high, medium, low, totalOpen, mttrCritical, slaCompliance, remediationRate, riskScore },
    trendData,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { vulnerabilities, importSource } = useVulnerabilities();

  const { kpis, trendData } = useMemo(() => {
    const cfg = getSlaConfig();
    return computeAll(vulnerabilities, cfg.days as Record<string, number>);
  }, [vulnerabilities]);

  const { critical, high, medium, low, totalOpen, mttrCritical, slaCompliance, remediationRate, riskScore } = kpis;

  return (
    <div className="space-y-6">
      {/* Data source banner */}
      {importSource !== "mock" && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          Live data active — showing{" "}
          {importSource === "crowdstrike"
            ? "CrowdStrike Falcon Spotlight"
            : importSource === "manual"
            ? "manually entered"
            : "combined"}{" "}
          vulnerabilities ({vulnerabilities.length.toLocaleString()} total)
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          title="Overall Risk Score"
          value={`${riskScore}/100`}
          sub={riskScore >= 80 ? "Critical exposure" : riskScore >= 60 ? "Elevated risk" : "Moderate risk"}
          trendPositive={riskScore < 70}
          icon={ShieldAlert}
          color="text-primary"
        />
        <KpiCard
          title="SLA Compliance"
          value={`${slaCompliance}%`}
          sub={slaCompliance >= 90 ? "On track" : slaCompliance >= 80 ? "Needs attention" : "Below target"}
          trendPositive={slaCompliance >= 85}
          icon={Target}
          color="text-green-500"
        />
        <KpiCard
          title="Remediation Rate"
          value={`${remediationRate}%`}
          sub="of total closed"
          trendPositive={remediationRate >= 70}
          icon={Activity}
          color="text-blue-400"
        />
        <KpiCard
          title="Critical MTTR"
          value={mttrCritical > 0 ? `${mttrCritical}d` : "—"}
          sub={`Target: 30d${mttrCritical > 0 && mttrCritical <= 30 ? " ✓" : mttrCritical > 30 ? " — over SLA" : ""}`}
          trendPositive={mttrCritical <= 30 && mttrCritical > 0}
          icon={Clock}
          color="text-red-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <Card className="col-span-2 bg-card">
          <CardHeader>
            <CardTitle>Critical &amp; High Trend (12 Months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: "#94a3b8" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="critical" name="Critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCritical)" />
                <Area type="monotone" dataKey="high"     name="High"     stroke="#f97316" fillOpacity={1} fill="url(#colorHigh)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Open breakdown */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Open Vulnerabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {[
                { label: "Critical", count: critical, color: "#ef4444", cls: "text-red-400" },
                { label: "High",     count: high,     color: "#f97316", cls: "text-orange-400" },
                { label: "Medium",   count: medium,   color: "#eab308", cls: "text-yellow-400" },
                { label: "Low",      count: low,      color: "#3b82f6", cls: "text-blue-400" },
              ].map(({ label, count, color, cls }) => (
                <div key={label} className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className={`text-xl font-bold ${cls}`} data-testid={`count-${label.toLowerCase()}`}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Total Open</span>
                <span className="text-2xl font-bold" data-testid="count-total">
                  {totalOpen.toLocaleString()}
                </span>
              </div>
              <Link href="/import">
                <div className="text-xs text-primary hover:underline cursor-pointer text-center pt-1">
                  Import from CrowdStrike or add manually
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, trendPositive, icon: Icon, color,
}: {
  title: string;
  value: string;
  sub: string;
  trendPositive: boolean;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p
              className="text-3xl font-bold tracking-tight"
              data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {value}
            </p>
          </div>
          <div className={`p-2 rounded-md bg-muted ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <span className={`text-xs font-medium ${trendPositive ? "text-green-500" : "text-red-400"}`}>
            {sub}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
