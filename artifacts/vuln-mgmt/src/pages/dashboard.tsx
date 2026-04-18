import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { MOCK_TRENDS } from "@/data/metrics";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ShieldAlert, Target, Activity, Clock } from "lucide-react";
import { Link } from "wouter";

function computeKPIs(vulnerabilities: ReturnType<typeof useVulnerabilities>["vulnerabilities"]) {
  const open = vulnerabilities.filter(v => v.status !== "Resolved");
  const critical = open.filter(v => v.severity === "Critical").length;
  const high = open.filter(v => v.severity === "High").length;
  const medium = open.filter(v => v.severity === "Medium").length;
  const low = open.filter(v => v.severity === "Low").length;
  const totalOpen = critical + high + medium + low;

  const criticalVulns = open.filter(v => v.severity === "Critical");
  const highVulns = open.filter(v => v.severity === "High");
  const mttrCritical = criticalVulns.length > 0
    ? +(criticalVulns.reduce((s, v) => s + v.daysOpen, 0) / criticalVulns.length).toFixed(1)
    : 0;
  const mttrHigh = highVulns.length > 0
    ? +(highVulns.reduce((s, v) => s + v.daysOpen, 0) / highVulns.length).toFixed(1)
    : 0;

  const slaMap: Record<string, number> = { Critical: 30, High: 60, Medium: 90, Low: 180 };
  const withinSLA = open.filter(v => v.daysOpen <= slaMap[v.severity]).length;
  const slaCompliance = totalOpen > 0 ? +((withinSLA / totalOpen) * 100).toFixed(1) : 100;

  const resolved = vulnerabilities.filter(v => v.status === "Resolved").length;
  const remediationRate = vulnerabilities.length > 0
    ? +((resolved / vulnerabilities.length) * 100).toFixed(0)
    : 0;

  const riskScore = Math.min(100, Math.round(
    (critical * 4.0 + high * 1.5 + medium * 0.3 + low * 0.05) / 10
  ));

  return { critical, high, medium, low, totalOpen, mttrCritical, mttrHigh, slaCompliance, remediationRate, riskScore };
}

export default function Dashboard() {
  const { vulnerabilities, importSource } = useVulnerabilities();
  const kpis = computeKPIs(vulnerabilities);

  return (
    <div className="space-y-6">
      {/* Data source banner */}
      {importSource !== "mock" && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          Live data active — showing{" "}
          {importSource === "crowdstrike" ? "CrowdStrike Falcon Spotlight" : importSource === "manual" ? "manually entered" : "combined"} vulnerabilities ({vulnerabilities.length} total)
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          title="Overall Risk Score"
          value={`${kpis.riskScore}/100`}
          sub={kpis.riskScore >= 80 ? "Critical exposure" : kpis.riskScore >= 60 ? "Elevated risk" : "Moderate risk"}
          trendPositive={kpis.riskScore < 70}
          icon={ShieldAlert}
          color="text-primary"
        />
        <KpiCard
          title="SLA Compliance"
          value={`${kpis.slaCompliance}%`}
          sub={`${kpis.slaCompliance >= 90 ? "On track" : kpis.slaCompliance >= 80 ? "Needs attention" : "Below target"}`}
          trendPositive={kpis.slaCompliance >= 85}
          icon={Target}
          color="text-green-500"
        />
        <KpiCard
          title="Remediation Rate"
          value={`${kpis.remediationRate}%`}
          sub="of total closed"
          trendPositive={kpis.remediationRate >= 70}
          icon={Activity}
          color="text-blue-400"
        />
        <KpiCard
          title="Critical MTTR"
          value={kpis.mttrCritical > 0 ? `${kpis.mttrCritical}d` : "—"}
          sub={`Target: 30d${kpis.mttrCritical > 0 && kpis.mttrCritical <= 30 ? " ✓" : kpis.mttrCritical > 30 ? " — over SLA" : ""}`}
          trendPositive={kpis.mttrCritical <= 30 && kpis.mttrCritical > 0}
          icon={Clock}
          color="text-red-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 bg-card">
          <CardHeader>
            <CardTitle>Vulnerability Trend (12 Months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_TRENDS}>
                <defs>
                  <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--critical))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--critical))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--high))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--high))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="critical" stroke="hsl(var(--critical))" fillOpacity={1} fill="url(#colorCritical)" />
                <Area type="monotone" dataKey="high" stroke="hsl(var(--high))" fillOpacity={1} fill="url(#colorHigh)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Open Vulnerabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {[
                { label: "Critical", count: kpis.critical, colorVar: "var(--critical)", cls: "text-red-400" },
                { label: "High", count: kpis.high, colorVar: "var(--high)", cls: "text-orange-400" },
                { label: "Medium", count: kpis.medium, colorVar: "var(--medium)", cls: "text-yellow-400" },
                { label: "Low", count: kpis.low, colorVar: "var(--low)", cls: "text-blue-400" },
              ].map(({ label, count, colorVar, cls }) => (
                <div key={label} className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${colorVar})` }} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className={`text-xl font-bold ${cls}`} data-testid={`count-${label.toLowerCase()}`}>{count}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Total Open</span>
                <span className="text-2xl font-bold" data-testid="count-total">{kpis.totalOpen}</span>
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

function KpiCard({ title, value, sub, trendPositive, icon: Icon, color }: {
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
            <p className="text-3xl font-bold tracking-tight" data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
          </div>
          <div className={`p-2 rounded-md bg-muted ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <span className={`text-xs font-medium ${trendPositive ? "text-green-500" : "text-red-400"}`}>{sub}</span>
        </div>
      </CardContent>
    </Card>
  );
}
