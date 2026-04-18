import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell } from "recharts";
import { MOCK_VULNERABILITIES } from "@/data/vulnerabilities";

export default function Risk() {
  const data = MOCK_VULNERABILITIES.map(v => ({
    x: v.likelihood,
    y: v.impact,
    z: v.cvss * 10,
    name: v.cveId,
    severity: v.severity
  }));

  const getColor = (severity: string) => {
    switch(severity) {
      case 'Critical': return 'hsl(var(--critical))';
      case 'High': return 'hsl(var(--high))';
      case 'Medium': return 'hsl(var(--medium))';
      case 'Low': return 'hsl(var(--low))';
      default: return '#888';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Risk Heatmap (Likelihood vs Impact)</CardTitle>
        </CardHeader>
        <CardContent className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis type="number" dataKey="x" name="Likelihood" domain={[0, 6]} stroke="#888" label={{ value: 'Likelihood', position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="y" name="Impact" domain={[0, 6]} stroke="#888" label={{ value: 'Impact', angle: -90, position: 'insideLeft' }} />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
              <Scatter name="Vulnerabilities" data={data} opacity={0.6}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.severity)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
