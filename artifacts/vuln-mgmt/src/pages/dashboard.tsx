import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPIS, MOCK_TRENDS } from "@/data/metrics";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ShieldAlert, Target, Activity, Clock } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard 
          title="Overall Risk Score" 
          value={`${KPIS.riskScore}/100`} 
          trend="-3 points vs last month"
          trendPositive={true}
          icon={ShieldAlert}
          color="text-primary"
        />
        <KpiCard 
          title="SLA Compliance" 
          value={`${KPIS.slaCompliance}%`} 
          trend="+2.1% vs last month"
          trendPositive={true}
          icon={Target}
          color="text-green-500"
        />
        <KpiCard 
          title="Remediation Rate" 
          value={`${KPIS.remediationRate}%`} 
          trend="+5% this quarter"
          trendPositive={true}
          icon={Activity}
          color="text-blue-400"
        />
        <KpiCard 
          title="Critical MTTR" 
          value={`${KPIS.mttrCritical}d`} 
          trend="Target: 7d"
          trendPositive={true}
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
                    <stop offset="5%" stopColor="hsl(var(--critical))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--critical))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--high))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--high))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
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
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(var(--critical))]" />
                  <span className="text-sm font-medium">Critical</span>
                </div>
                <span className="text-xl font-bold">{KPIS.critical}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(var(--high))]" />
                  <span className="text-sm font-medium">High</span>
                </div>
                <span className="text-xl font-bold">{KPIS.high}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(var(--medium))]" />
                  <span className="text-sm font-medium">Medium</span>
                </div>
                <span className="text-xl font-bold">{KPIS.medium}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(var(--low))]" />
                  <span className="text-sm font-medium">Low</span>
                </div>
                <span className="text-xl font-bold">{KPIS.low}</span>
              </div>
              <div className="pt-4 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Total Open</span>
                <span className="text-2xl font-bold">{KPIS.totalOpen}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, trend, trendPositive, icon: Icon, color }: any) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`p-2 rounded-md bg-muted ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <span className={`text-xs font-medium ${trendPositive ? "text-green-500" : "text-red-500"}`}>
            {trend}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
