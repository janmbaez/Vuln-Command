import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_TRENDS, MTTR_TRENDS } from "@/data/metrics";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

export default function Metrics() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>MTTR by Severity (Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MTTR_TRENDS}>
                <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                <Line type="monotone" dataKey="critical" name="Critical" stroke="hsl(var(--critical))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="high" name="High" stroke="hsl(var(--high))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Vulnerabilities Remediated vs Open</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_TRENDS}>
                <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                <Bar dataKey="critical" name="Critical Open" fill="hsl(var(--critical))" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="high" name="High Open" fill="hsl(var(--high))" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
