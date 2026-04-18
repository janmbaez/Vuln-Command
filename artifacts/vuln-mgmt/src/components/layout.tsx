import React from "react";
import { Link, useLocation } from "wouter";
import { Shield, LayoutDashboard, List, Activity, Target, Layers, Download, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Executive Summary", icon: LayoutDashboard },
  { path: "/vulnerabilities", label: "Vulnerability Inventory", icon: List },
  { path: "/metrics", label: "Metrics & Trends", icon: Activity },
  { path: "/risk", label: "Risk Heatmap", icon: Target },
  { path: "/remediation", label: "Remediation Plan", icon: Shield },
  { path: "/assets", label: "Asset Risk Profile", icon: Layers },
];

const IMPORT_ITEM = { path: "/import", label: "Import / Add Data", icon: UploadCloud };

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const allItems = [...NAV_ITEMS, IMPORT_ITEM];
  const currentLabel = allItems.find(i => i.path === location)?.label || "Dashboard";

  return (
    <div className="flex min-h-screen bg-background text-foreground dark">
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Shield className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight">VULN-COMMAND</span>
        </div>
        <nav className="flex-1 py-6 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`nav-${item.path.replace("/", "") || "home"}`}
                >
                  <Icon className="h-4 w-4 mr-3" />
                  {item.label}
                </div>
              </Link>
            );
          })}

          <div className="pt-3 pb-1">
            <div className="h-px bg-border mx-1" />
          </div>

          <Link href={IMPORT_ITEM.path}>
            <div
              className={cn(
                "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                location === IMPORT_ITEM.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              data-testid="nav-import"
            >
              <UploadCloud className="h-4 w-4 mr-3" />
              {IMPORT_ITEM.label}
            </div>
          </Link>
        </nav>
        <div className="p-6 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Last updated:<br />
            <span className="text-foreground font-medium">April 18, 2026 09:41 UTC</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-semibold tracking-tight">{currentLabel}</h1>
          <div className="flex items-center space-x-4">
            <button className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-export">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </button>
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-medium text-sm">
              C
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
