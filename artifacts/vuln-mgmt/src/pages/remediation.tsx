import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function Remediation() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Q2 2026 Milestone Tracker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Log4j Zero-Day Eradication</span>
                <span className="text-sm text-muted-foreground">85%</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Legacy Windows Server Patches</span>
                <span className="text-sm text-muted-foreground">42%</span>
              </div>
              <Progress value={42} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">AWS Container Upgrades</span>
                <span className="text-sm text-muted-foreground">100%</span>
              </div>
              <Progress value={100} className="h-2 bg-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Team SLA Breaches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-border rounded-md">
              <div className="font-medium">AppSec</div>
              <div className="text-red-500 font-bold">12</div>
            </div>
            <div className="flex items-center justify-between p-4 border border-border rounded-md">
              <div className="font-medium">CloudSec</div>
              <div className="text-yellow-500 font-bold">4</div>
            </div>
            <div className="flex items-center justify-between p-4 border border-border rounded-md">
              <div className="font-medium">NetSec</div>
              <div className="text-green-500 font-bold">0</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
