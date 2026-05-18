import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import { useVulnerabilities } from "@/context/VulnerabilityContext";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High:     "#f97316",
  Medium:   "#eab308",
  Low:      "#3b82f6",
};

const ZONE_LABELS = [
  { x: 1, y: 8, text: "High Impact\nLow Likelihood" },
  { x: 8, y: 8, text: "Critical Zone" },
  { x: 1, y: 1, text: "Low Risk" },
  { x: 8, y: 1, text: "High Likelihood\nLow Impact" },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg p-3 text-xs space-y-1 max-w-[200px]">
      <p className="font-mono font-semibold text-blue-400">{d.name}</p>
      <p className="text-muted-foreground truncate">{d.title}</p>
      <p className="text-muted-foreground">{d.asset}</p>
      <div className="flex gap-3 pt-1">
        <span>Likelihood: <strong>{d.x}</strong></span>
        <span>Impact: <strong>{d.y}</strong></span>
      </div>
      <div className="flex gap-3">
        <span>CVSS: <strong>{d.cvss}</strong></span>
        <span
          className="font-semibold"
          style={{ color: SEVERITY_COLORS[d.severity] }}
        >
          {d.severity}
        </span>
      </div>
    </div>
  );
}

// Max scatter points to render — keeps SVG element count manageable for large datasets
const SCATTER_CAP = 500;

/** Stratified random sample — preserves severity proportions */
function sampleData<T extends { severity: string }>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const severities = ["Critical", "High", "Medium", "Low"];
  const result: T[] = [];
  for (const sev of severities) {
    const group = items.filter(d => d.severity === sev);
    const take = Math.max(1, Math.round((group.length / items.length) * cap));
    // Fisher-Yates partial shuffle for a fair sample without full sort
    const arr = [...group];
    for (let i = 0; i < Math.min(take, arr.length); i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    result.push(...arr.slice(0, take));
  }
  return result;
}

export default function Risk() {
  const { vulnerabilities } = useVulnerabilities();

  // Full dataset (for counts and critical zone table)
  const data = useMemo(() =>
    vulnerabilities
      .filter(v => v.status !== "Resolved" && v.status !== "Risk Accepted")
      .map(v => ({
        x: v.likelihood,
        y: v.impact,
        z: Math.max(40, v.cvss * 12),
        name: v.cveId,
        title: v.title,
        asset: v.asset,
        severity: v.severity,
        cvss: v.cvss.toFixed(1),
      })),
    [vulnerabilities]
  );

  // Sampled dataset — fed to the ScatterChart to keep DOM element count low
  const chartData = useMemo(() => sampleData(data, SCATTER_CAP), [data]);
  const isSampled = data.length > SCATTER_CAP;

  const counts = useMemo(() => ({
    Critical: data.filter(d => d.severity === "Critical").length,
    High:     data.filter(d => d.severity === "High").length,
    Medium:   data.filter(d => d.severity === "Medium").length,
    Low:      data.filter(d => d.severity === "Low").length,
  }), [data]);

  return (
    <div className="space-y-6">
      {/* Legend / summary row */}
      <div className="grid grid-cols-4 gap-3">
        {(["Critical", "High", "Medium", "Low"] as const).map(s => (
          <div key={s} className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SEVERITY_COLORS[s] }} />
            <div>
              <div className="text-xs text-muted-foreground">{s}</div>
              <div className="text-xl font-bold" style={{ color: SEVERITY_COLORS[s] }}>{counts[s]}</div>
            </div>
          </div>
        ))}
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Risk Heatmap — Likelihood vs. Impact</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Open vulnerabilities plotted by likelihood (1–10) and impact (1–10). Bubble size represents CVSS score. Resolved and Risk Accepted items are excluded.
          </p>
        </CardHeader>
        <CardContent className="h-[520px]">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No open vulnerability data. Import vulnerabilities to populate this chart.
            </div>
          ) : (
            <div className="flex flex-col h-full gap-1">
              {isSampled && (
                <p className="text-xs text-muted-foreground text-right pr-1">
                  Showing {chartData.length.toLocaleString()} of {data.length.toLocaleString()} vulnerabilities (sampled)
                </p>
              )}
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 30 }}>
                    <defs>
                      <linearGradient id="zoneGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.04} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>

                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Likelihood"
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      stroke="#475569"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      label={{ value: "Likelihood →", position: "insideBottom", offset: -20, fill: "#64748b", fontSize: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Impact"
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      stroke="#475569"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      label={{ value: "Impact →", angle: -90, position: "insideLeft", offset: 15, fill: "#64748b", fontSize: 12 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[40, 400]} />
                    <ReferenceLine x={5} stroke="#334155" strokeDasharray="4 4" />
                    <ReferenceLine y={5} stroke="#334155" strokeDasharray="4 4" />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#475569" }} />
                    <Scatter name="Vulnerabilities" data={chartData} opacity={0.75}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.severity] ?? "#888"} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* High-risk table */}
      {data.filter(d => d.x >= 7 && d.y >= 7).length > 0 && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-red-400">⚠ Critical Zone — High Likelihood & High Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data
                .filter(d => d.x >= 7 && d.y >= 7)
                .sort((a, b) => (b.x + b.y) - (a.x + a.y))
                .slice(0, 10)
                .map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                    <span className="font-mono text-blue-400 w-36 flex-shrink-0">{d.name}</span>
                    <span className="text-muted-foreground flex-1 truncate">{d.asset}</span>
                    <span style={{ color: SEVERITY_COLORS[d.severity] }} className="font-semibold">{d.severity}</span>
                    <span className="text-muted-foreground">L:{d.x} / I:{d.y}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
