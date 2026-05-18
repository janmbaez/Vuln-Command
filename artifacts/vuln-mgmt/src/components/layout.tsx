import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Shield, LayoutDashboard, List, Activity, Target, Layers,
  Download, UploadCloud, TrendingUp, AlarmClock, Users,
  Fingerprint, Radio, RefreshCw, AlertCircle,
  Zap, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStatus } from "@/context/SyncContext";
import { getCsConfig } from "@/lib/crowdstrikeApi";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { path: "/",               label: "Executive Summary",      icon: LayoutDashboard },
  { path: "/vulnerabilities",label: "Vulnerability Inventory",icon: List },
  { path: "/metrics",        label: "Metrics & Trends",       icon: Activity },
  { path: "/risk",           label: "Risk Heatmap",           icon: Target },
  { path: "/remediation",    label: "Remediation Plan",       icon: Shield },
  { path: "/assets",         label: "Asset Risk Profile",     icon: Layers },
  { path: "/ctem",           label: "CTEM Maturity Model",    icon: TrendingUp },
  { path: "/sla",            label: "SLA Watchlist",          icon: AlarmClock },
  { path: "/teams",          label: "Team Workload",          icon: Users },
  { path: "/cve-intel",      label: "CVE Intelligence",       icon: Fingerprint },
  { path: "/crowdstrike",    label: "CrowdStrike Live",       icon: Radio },
];

const IMPORT_ITEM = { path: "/import", label: "Import / Add Data", icon: UploadCloud };

// ── Relative time helper ───────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10)  return "just now";
  if (diff < 60)  return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ── Sync status widget (shown in sidebar footer) ───────────────────────────────

function SyncStatusWidget() {
  const { isSyncing, progress, lastSyncAt, lastSyncError, lastSyncStats, wasIncremental, syncNow, forceFull } = useSyncStatus();
  const [, setTick] = useState(0);

  // Tick every 15 s so "3m ago" updates without a heavy re-render cycle
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Check if credentials are configured
  const cfg = getCsConfig();
  const hasCredentials = !!(cfg.clientId && cfg.clientSecret);

  if (!hasCredentials) {
    return (
      <div className="text-xs text-muted-foreground/60 leading-relaxed">
        <span className="flex items-center gap-1.5 mb-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          CrowdStrike not connected
        </span>
        <Link href="/crowdstrike">
          <span className="text-primary hover:underline cursor-pointer text-[11px]">
            Configure credentials →
          </span>
        </Link>
      </div>
    );
  }

  // ── Syncing state ──────────────────────────────────────────────────────────
  if (isSyncing) {
    const phaseLabel = progress?.phase === "vulnerabilities"
      ? `Fetching${progress.total ? ` ${progress.fetched.toLocaleString()}/${progress.total.toLocaleString()}` : " vulns"}…`
      : progress?.phase === "hostnames"
      ? (progress.statusMsg ?? "Resolving hostnames…")
      : "Mapping data…";

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-primary">
          <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
          <span className="font-medium truncate">{phaseLabel}</span>
        </div>
        {progress?.phase === "vulnerabilities" && progress.total && (
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.round((progress.fetched / progress.total) * 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (lastSyncError) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="font-medium">Sync failed</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
          {lastSyncError}
        </p>
        <button
          onClick={() => syncNow()}
          className="text-[11px] text-primary hover:underline"
        >
          Retry →
        </button>
      </div>
    );
  }

  // ── Idle / success state ───────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Live badge + last sync time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          {lastSyncAt ? (
            <>
              {/* Animated green pulse = live */}
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-green-400 font-semibold">Live</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="text-muted-foreground">Ready</span>
            </>
          )}
        </div>

        {/* Manual sync button */}
        <button
          onClick={() => syncNow()}
          title="Sync now"
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Last sync details */}
      {lastSyncAt ? (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>Updated <span className="text-foreground font-medium">{relativeTime(lastSyncAt)}</span></div>
          {lastSyncStats && (
            <div className="flex items-center gap-2">
              {wasIncremental
                ? <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5 text-yellow-400" /> incremental</span>
                : <span>{lastSyncStats.total.toLocaleString()} records</span>}
              {lastSyncStats.updated > 0 && (
                <span className="text-blue-400">+{lastSyncStats.updated} updated</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Auto-sync {cfg.autoSyncInterval > 0
            ? `every ${cfg.autoSyncInterval}m`
            : "disabled — configure on CrowdStrike page"}
        </p>
      )}

      {/* Force full sync link */}
      {lastSyncAt && (
        <button
          onClick={() => forceFull()}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Force full sync →
        </button>
      )}
    </div>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isSyncing } = useSyncStatus();
  const { enabled: authEnabled, logout } = useAuth();

  const allItems = [...NAV_ITEMS, IMPORT_ITEM];
  const currentLabel = allItems.find(i => i.path === location)?.label || "Dashboard";

  return (
    <div className="flex min-h-screen bg-background text-foreground dark">
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Shield className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight">VULN-COMMAND</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            // Highlight CrowdStrike link when syncing
            const isLive = item.path === "/crowdstrike" && isSyncing;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  data-testid={`nav-${item.path.replace("/", "") || "home"}`}
                >
                  <Icon className={cn("h-4 w-4 mr-3", isLive && "animate-spin text-primary")} />
                  {item.label}
                  {isLive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
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
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              data-testid="nav-import"
            >
              <UploadCloud className="h-4 w-4 mr-3" />
              {IMPORT_ITEM.label}
            </div>
          </Link>
        </nav>

        {/* Live sync status footer */}
        <div className="p-4 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">
            Data Source
          </p>
          <SyncStatusWidget />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{currentLabel}</h1>
            {/* Global syncing badge in header */}
            {isSyncing && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Syncing
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-export"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </button>
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-medium text-sm">
              C
            </div>
            {authEnabled && (
              <button
                onClick={logout}
                title="Sign out"
                className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
