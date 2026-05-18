import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { useSyncStatus } from "@/context/SyncContext";
import {
  getCsConfig, setCsConfig, clearTokenCache,
  testCsConnection, fetchRawSample, debugHostnameLookup, resolveAidBatch,
  fetchAllCsVulns, isCrowdStrikeLiveEnabled,
  type CsApiConfig, type HostnameDebugResult, type FetchProgress,
} from "@/lib/crowdstrikeApi";
import {
  Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Eye, EyeOff, Settings, Play, Pause, Info, Database, Shield,
  ChevronDown, ChevronUp, Zap, FlaskConical, Server, Tags, XCircle,
} from "lucide-react";
import type { Vulnerability } from "@/data/vulnerabilities";

// ── Types ────────────────────────────────────────────────────────────────────

/** Only covers the connection-test lifecycle — sync state lives in SyncContext */
type ConnStatus = "idle" | "testing" | "connected" | "error";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const SYNC_INTERVALS = [
  { label: "Disabled",     value: 0  },
  { label: "Every 1 min",  value: 1  },
  { label: "Every 2 min",  value: 2  },
  { label: "Every 5 min",  value: 5  },
  { label: "Every 15 min", value: 15 },
  { label: "Every 30 min", value: 30 },
  { label: "Every 60 min", value: 60 },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CrowdStrikePage() {
  const { vulnerabilities, remapAssetHostnames, reclassifyAssets, mergeBulkVulnerabilities } = useVulnerabilities();
  const liveEnabled = isCrowdStrikeLiveEnabled();

  // Global sync state — lives in SyncContext so it survives page navigation
  const {
    isSyncing, progress, lastSyncAt, lastSyncError,
    lastSyncStats, syncDuration, wasIncremental,
    syncNow, forceFull,
  } = useSyncStatus();

  // ── Config state ────────────────────────────────────────────────────────
  const [cfg, setCfgState] = useState<CsApiConfig>(getCsConfig);
  const [showSecret, setShowSecret] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  // ── Connection test state (separate from sync) ──────────────────────────
  const [status, setStatus]         = useState<ConnStatus>("idle");
  const [statusMsg, setStatusMsg]   = useState<string>("");
  const [testTotal, setTestTotal]   = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Raw payload inspector ───────────────────────────────────────────────
  const [rawSample, setRawSample]   = useState<Record<string, unknown> | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError]     = useState<string | null>(null);

  // ── Hostname debug probe ────────────────────────────────────────────────
  const [debugResult, setDebugResult]     = useState<HostnameDebugResult | null>(null);
  const [debugLoading, setDebugLoading]   = useState(false);
  const [debugAidInput, setDebugAidInput] = useState("");

  // ── Retroactive hostname resolution ────────────────────────────────────
  const [retroLoading, setRetroLoading]   = useState(false);
  const [retroProgress, setRetroProgress] = useState<{ resolved: number; total: number } | null>(null);
  const [retroResult, setRetroResult]     = useState<{ updated: number; notFound: number } | null>(null);
  const [retroError, setRetroError]       = useState<string | null>(null);

  // ── Asset type reclassification ─────────────────────────────────────────
  const [reclassifyResult, setReclassifyResult] = useState<number | null>(null);

  // ── Closed vulnerability sync ────────────────────────────────────────────
  const ALL_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  type CloseSeverity = typeof ALL_SEVERITIES[number];
  const [closeSeverities, setCloseSeverities]   = useState<CloseSeverity[]>(["CRITICAL", "HIGH"]);
  const [closeSyncing,    setCloseSyncing]       = useState(false);
  const [closeProgress,   setCloseProgress]      = useState<FetchProgress | null>(null);
  const [closeResult,     setCloseResult]        = useState<{ closed: number; added: number; total: number } | null>(null);
  const [closeError,      setCloseError]         = useState<string | null>(null);
  const closeAbortRef = React.useRef<AbortController | null>(null);

  // ── Persist config edits ─────────────────────────────────────────────────
  function patchCfg(patch: Partial<CsApiConfig>) {
    setCfgState(prev => ({ ...prev, ...patch }));
    setConfigDirty(true);
  }

  function saveConfig() {
    if (!liveEnabled) {
      setStatus("error");
      setStatusMsg("Live CrowdStrike API calls are disabled for this production build.");
      return;
    }
    if (!cfg.clientId.trim() || !cfg.clientSecret.trim()) {
      setStatus("error");
      setStatusMsg("Both Client ID and Client Secret are required before saving.");
      return;
    }
    setCsConfig(cfg);
    setConfigDirty(false);
    clearTokenCache();
    setStatus("idle");
    setStatusMsg("Configuration saved ✓ — click Test Connection to verify your credentials.");
  }

  // ── Test connection ──────────────────────────────────────────────────────
  const handleTest = useCallback(async () => {
    if (!liveEnabled) {
      setStatus("error");
      setStatusMsg("Live CrowdStrike API calls are disabled for this production build.");
      return;
    }
    if (!cfg.clientId.trim()) {
      setStatus("error");
      setStatusMsg("Client ID is missing. Enter it in the API Credentials card and click Save Configuration.");
      return;
    }
    if (!cfg.clientSecret.trim()) {
      setStatus("error");
      setStatusMsg("Client Secret is missing. Enter it in the API Credentials card and click Save Configuration.");
      return;
    }
    setStatus("testing");
    setStatusMsg("Authenticating…");
    setTestTotal(null);
    try {
      const result = await testCsConnection(cfg);
      setTestTotal(result.total);
      setStatus("connected");
      setStatusMsg(`Connected ✓ — ${result.total.toLocaleString()} vulnerabilities available.`);
    } catch (err: unknown) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "Connection failed.");
      clearTokenCache();
    }
  }, [cfg, liveEnabled]);

  // Sync is handled globally by SyncContext — no local sync loop needed.

  // ── Retroactive hostname resolution ──────────────────────────────────────
  // AID placeholders are stored as "AID:<full-32-char-hex>" in the asset field
  const AID_ASSET_RE = /^AID:([0-9a-f]{32})$/i;

  const aidVulns = vulnerabilities.filter(v => AID_ASSET_RE.test(v.asset));
  const uniqueAids = Array.from(new Set(aidVulns.map(v => v.asset.slice(4)))); // strip "AID:"

  const handleRetroResolve = useCallback(async () => {
    if (uniqueAids.length === 0 || retroLoading) return;
    if (!liveEnabled) {
      setRetroError("Live CrowdStrike API calls are disabled for this production build.");
      return;
    }

    setRetroLoading(true);
    setRetroProgress({ resolved: 0, total: uniqueAids.length });
    setRetroResult(null);
    setRetroError(null);

    try {
      const hostnameMap = await resolveAidBatch(
        cfg,
        uniqueAids,
        (resolved, total) => setRetroProgress({ resolved, total }),
      );

      // Build asset-level map: "AID:<full-aid>" → "real-hostname"
      const assetMap = new Map<string, string>();
      for (const [aid, hostname] of hostnameMap) {
        assetMap.set(`AID:${aid}`, hostname);
      }

      const updated = remapAssetHostnames(assetMap);
      const notFound = uniqueAids.length - hostnameMap.size;
      setRetroResult({ updated, notFound });
    } catch (err) {
      setRetroError(err instanceof Error ? err.message : "Hostname resolution failed.");
    } finally {
      setRetroLoading(false);
      setRetroProgress(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, liveEnabled, uniqueAids, retroLoading, remapAssetHostnames]);

  // ── Closed vulnerability sync handler ────────────────────────────────────
  // Strategy: instead of fetching ALL closed vulns from CrowdStrike (unbounded),
  // we extract the CVE IDs of the open records already in the dashboard and
  // query CrowdStrike specifically for those — status:"closed"+cve.id:[...batch].
  // This guarantees every fetched record is relevant and scales with the
  // dashboard size, not CrowdStrike's total closed-vuln history.
  const handleClosedSync = useCallback(async () => {
    if (closeSyncing) return;
    if (!liveEnabled) {
      setCloseError("Live CrowdStrike API calls are disabled for this production build.");
      return;
    }
    if (!cfg.clientId?.trim() || !cfg.clientSecret?.trim()) {
      setCloseError("Save your API credentials first.");
      return;
    }

    // ── Build target set from open dashboard vulns ──────────────────────
    const openVulns = vulnerabilities.filter(
      v => v.status === "Open" || v.status === "In Progress",
    );
    if (openVulns.length === 0) {
      setCloseError("No open or in-progress vulnerabilities in the dashboard to check.");
      return;
    }

    // Apply severity filter against the LOCAL dashboard records
    const sevSet = closeSeverities.length > 0 && closeSeverities.length < 4
      ? new Set(closeSeverities.map(s => (s[0] + s.slice(1).toLowerCase()) as string))
      : null;
    const targetVulns = sevSet ? openVulns.filter(v => sevSet.has(v.severity)) : openVulns;
    const uniqueCveIds = Array.from(new Set(targetVulns.map(v => v.cveId)));
    const uniqueAids = Array.from(new Set(
      targetVulns
        .map(v => v.aid ?? (v.asset.toLowerCase().startsWith("aid:") ? v.asset.slice(4) : ""))
        .filter(Boolean),
    ));

    if (uniqueCveIds.length === 0) {
      setCloseError("No open vulnerabilities match the selected severities.");
      return;
    }

    const abort = new AbortController();
    closeAbortRef.current = abort;

    setCloseSyncing(true);
    setCloseResult(null);
    setCloseError(null);

    const targetByCveAsset = new Map<string, Vulnerability>();
    const targetByCveAid = new Map<string, Vulnerability>();
    for (const v of targetVulns) {
      targetByCveAsset.set(`${v.cveId}::${v.asset}`.toLowerCase(), v);
      if (v.aid) targetByCveAid.set(`${v.cveId}::${v.aid}`.toLowerCase(), v);
      if (v.asset.toLowerCase().startsWith("aid:")) {
        targetByCveAid.set(`${v.cveId}::${v.asset.slice(4)}`.toLowerCase(), v);
      }
    }

    // Batch CVE/AID filters to keep URLs under control. Closed sync must
    // update existing dashboard records only; it should not import unrelated
    // closed history.
    const CVE_BATCH = 50;
    const AID_BATCH = 100;
    const totalBatches = Math.ceil(uniqueCveIds.length / CVE_BATCH);
    const matchedClosedVulns: Omit<Vulnerability, "id">[] = [];
    let fetchedClosed = 0;

    setCloseProgress({
      phase: "vulnerabilities",
      fetched: 0,
      total: uniqueCveIds.length,
      statusMsg: `Targeting ${uniqueCveIds.length.toLocaleString()} CVEs${uniqueAids.length ? ` on ${uniqueAids.length.toLocaleString()} known agents` : ""} across ${targetVulns.length.toLocaleString()} open records…`,
    });

    try {
      const matchedTargetIds = new Set<string>();
      for (let i = 0; i < uniqueCveIds.length; i += CVE_BATCH) {
        if (abort.signal.aborted) throw new DOMException("Sync cancelled", "AbortError");

        const batch      = uniqueCveIds.slice(i, i + CVE_BATCH);
        const batchNum   = Math.floor(i / CVE_BATCH) + 1;
        const cveFilter  = `cve.id:[${batch.map(id => `"${id}"`).join(",")}]`;
        const batchSet = new Set(batch);
        const batchTargets = targetVulns.filter(v => batchSet.has(v.cveId));
        const batchAids = Array.from(new Set(
          batchTargets
            .map(v => v.aid ?? (v.asset.toLowerCase().startsWith("aid:") ? v.asset.slice(4) : ""))
            .filter(Boolean),
        ));
        const hasAidlessTargets = batchTargets.some(v =>
          !v.aid && !v.asset.toLowerCase().startsWith("aid:"),
        );
        const aidChunks = [
          ...Array.from({ length: Math.ceil(batchAids.length / AID_BATCH) }, (_, chunkIdx) =>
            batchAids.slice(chunkIdx * AID_BATCH, (chunkIdx + 1) * AID_BATCH),
          ),
          ...(batchAids.length === 0 || hasAidlessTargets ? [[]] : []),
        ];

        for (const aidChunk of aidChunks) {
          if (abort.signal.aborted) throw new DOMException("Sync cancelled", "AbortError");

          const aidFilter = aidChunk.length
            ? `+aid:[${aidChunk.map(id => `"${id}"`).join(",")}]`
            : "";
          const fql = `status:"closed"+${cveFilter}${aidFilter}`;
          const effectiveCfg: CsApiConfig = { ...cfg, fqlFilter: fql, syncMode: "merge" };

          const batchVulns = await fetchAllCsVulns(
            effectiveCfg,
            p => setCloseProgress({
              phase: p.phase,
              fetched: Math.min(i + batch.length, uniqueCveIds.length),
              total: uniqueCveIds.length,
              statusMsg: p.statusMsg
                ?? `Batch ${batchNum}/${totalBatches} — ${fetchedClosed.toLocaleString()} closed records fetched, ${matchedClosedVulns.length.toLocaleString()} matched to dashboard`,
            }),
            { skipHostnames: true, signal: abort.signal },
          );

          fetchedClosed += batchVulns.length;

          for (const closed of batchVulns) {
            const target =
              targetByCveAsset.get(`${closed.cveId}::${closed.asset}`.toLowerCase()) ??
              (closed.aid ? targetByCveAid.get(`${closed.cveId}::${closed.aid}`.toLowerCase()) : undefined);

            if (!target || matchedTargetIds.has(target.id)) continue;
            matchedTargetIds.add(target.id);

            const { id: _id, ...targetWithoutId } = target;
            matchedClosedVulns.push({
              ...targetWithoutId,
              ...closed,
              cveId: target.cveId,
              asset: target.asset,
              aid: target.aid ?? closed.aid,
              status: "Resolved",
            });
          }
        }
      }

      const { updated, added } = mergeBulkVulnerabilities(matchedClosedVulns, "crowdstrike");
      setCloseResult({ closed: updated, added, total: fetchedClosed });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setCloseError(null); // user cancelled — not an error
      } else {
        setCloseError(err instanceof Error ? err.message : "Closed sync failed.");
        clearTokenCache();
      }
    } finally {
      closeAbortRef.current = null;
      setCloseSyncing(false);
      setCloseProgress(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, closeSeverities, closeSyncing, liveEnabled, mergeBulkVulnerabilities, vulnerabilities]);

  const handleCancelClosedSync = useCallback(() => {
    closeAbortRef.current?.abort();
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const pct = progress?.total
    ? Math.round((progress.fetched / progress.total) * 100)
    : null;

  // Effective display status: "syncing" when global sync running, else local test status
  const displayStatus = isSyncing ? "syncing" : lastSyncError ? "error" : status;

  const statusIcon = {
    idle:      <Wifi className="h-4 w-4 text-muted-foreground" />,
    testing:   <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />,
    connected: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    error:     <AlertCircle className="h-4 w-4 text-red-400" />,
    syncing:   <RefreshCw className="h-4 w-4 text-primary animate-spin" />,
  }[displayStatus];

  const statusColor = {
    idle:      "border-border text-muted-foreground",
    testing:   "border-blue-500/40 text-blue-300 bg-blue-500/5",
    connected: "border-green-500/40 text-green-300 bg-green-500/5",
    error:     "border-red-500/40 text-red-300 bg-red-500/5",
    syncing:   "border-primary/40 text-primary bg-primary/5",
  }[displayStatus];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <img
              src="https://www.crowdstrike.com/wp-content/uploads/2020/10/crowdstrike-favicon.png"
              alt=""
              className="h-6 w-6 rounded"
              onError={e => (e.currentTarget.style.display = "none")}
            />
            CrowdStrike Live Connector
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Pull real-time vulnerabilities from CrowdStrike Falcon Spotlight into the dashboard.
            Connects via OAuth2 to <code className="text-xs bg-muted px-1.5 py-0.5 rounded">api.us-2.crowdstrike.com</code>.
          </p>
        </div>

        {/* Status pill */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium ${statusColor}`}>
          {statusIcon}
          <span className="capitalize">{status === "idle" ? "Not connected" : status}</span>
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      {statusMsg && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs ${statusColor}`}>
          {statusIcon}
          <span className="flex-1">{statusMsg}</span>
        </div>
      )}

      {/* ── 3-phase progress indicator ──────────────────────────────────── */}
      {isSyncing && progress && (
        <div className="space-y-2 p-4 rounded-lg border border-primary/20 bg-primary/5">
          {/* Phase steps */}
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {(["vulnerabilities", "hostnames", "mapping"] as const).map((ph, idx) => {
              const order = ["vulnerabilities", "hostnames", "mapping"];
              const phaseIdx = order.indexOf(progress.phase);
              const done   = idx < phaseIdx;
              const active = idx === phaseIdx;
              const labels = ["Fetching vulnerabilities", "Resolving hostnames", "Mapping data"];
              return (
                <React.Fragment key={ph}>
                  {idx > 0 && <div className="h-px w-6 bg-border flex-shrink-0" />}
                  <span className={`flex items-center gap-1 ${
                    done   ? "text-green-400"
                    : active ? "text-primary"
                    : "text-muted-foreground/40"
                  }`}>
                    {done
                      ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      : active
                      ? <RefreshCw className="h-3 w-3 flex-shrink-0 animate-spin" />
                      : <span className="h-3 w-3 rounded-full border border-current flex-shrink-0 inline-block" />}
                    {idx + 1}. {labels[idx]}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: pct != null ? `${pct}%` : "25%" }}
            />
          </div>

          {/* Detail line */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.statusMsg ?? (
                progress.phase === "vulnerabilities"
                  ? `${progress.fetched.toLocaleString()}${progress.total ? ` / ${progress.total.toLocaleString()}` : ""} vulnerabilities fetched`
                  : progress.phase === "hostnames"
                  ? "Calling Devices API to resolve agent IDs → hostnames…"
                  : `Mapping ${(progress.total ?? 0).toLocaleString()} records`
              )}
            </span>
            {pct != null && <span>{pct}%</span>}
          </div>
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Vulnerabilities in Dashboard</p>
          <p className="text-2xl font-bold">{vulnerabilities.length.toLocaleString()}</p>
        </div>
        {lastSyncStats ? (
          <>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">
                {wasIncremental ? "Incremental Added" : "Last Sync Added"}
              </p>
              <p className="text-2xl font-bold text-green-400">+{lastSyncStats.added.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Last Sync Updated</p>
              <p className="text-2xl font-bold text-blue-400">{lastSyncStats.updated.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Last Sync At</p>
              <p className="text-sm font-semibold mt-1">
                {lastSyncAt ? fmtTime(lastSyncAt) : "—"}
              </p>
              {syncDuration != null && (
                <p className="text-xs text-muted-foreground">{fmtMs(syncDuration)}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Available in CrowdStrike</p>
              <p className="text-2xl font-bold">{testTotal != null ? testTotal.toLocaleString() : "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Auto-sync interval</p>
              <p className="text-sm font-semibold mt-1">
                {cfg.autoSyncInterval > 0
                  ? `Every ${cfg.autoSyncInterval} min${cfg.autoSyncInterval === 1 ? "" : "s"}`
                  : "Disabled — set interval below"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Sync error banner (from global sync) ───────────────────────── */}
      {lastSyncError && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg border border-red-500/40 bg-red-500/5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{lastSyncError}</span>
          <button onClick={() => syncNow()} disabled={!liveEnabled} className="underline shrink-0 disabled:opacity-40">Retry</button>
        </div>
      )}

      {!liveEnabled && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Live CrowdStrike API calls are disabled in this production build. This keeps public GitHub/LinkedIn demos from handling API secrets.
            Enable only on a trusted deployment with <code className="text-[11px]">VITE_ENABLE_CROWDSTRIKE_LIVE=true</code> and a real backend proxy.
          </span>
        </div>
      )}

      {/* ── Main layout: credentials left, sync right ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Credentials card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">API Credentials</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              OAuth2 credentials from your CrowdStrike Falcon console.
              Client secrets are held in session storage only and never persisted to disk.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Client ID */}
            {/* Missing-credentials banner */}
            {(!cfg.clientId || !cfg.clientSecret) && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Enter your <strong>Client ID</strong> and <strong>Client Secret</strong> below, then click
                  {" "}<strong>Save Configuration</strong> before testing or syncing.
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Client ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Paste your CrowdStrike Client ID here"
                value={cfg.clientId}
                onChange={e => patchCfg({ clientId: e.target.value.trim() })}
                disabled={!liveEnabled}
                className={`w-full text-sm rounded-md border bg-muted/40 px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                  !cfg.clientId ? "border-amber-500/50" : "border-border"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            </div>

            {/* Client Secret */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Client Secret <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  placeholder="Paste your CrowdStrike Client Secret here"
                  value={cfg.clientSecret}
                  onChange={e => patchCfg({ clientSecret: e.target.value.trim() })}
                  disabled={!liveEnabled}
                  className={`w-full text-sm rounded-md border bg-muted/40 px-3 py-2 pr-10 font-mono focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                    !cfg.clientSecret ? "border-amber-500/50" : "border-border"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  disabled={!liveEnabled}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Advanced section */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setAdvancedOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Advanced Settings
                </span>
                {advancedOpen
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {advancedOpen && (
                <div className="px-3 py-3 space-y-3 border-t border-border bg-muted/20">
                  {/* FQL filter */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      FQL Filter <span className="font-normal">(sent to Spotlight API)</span>
                    </label>
                    <input
                      type="text"
                      value={cfg.fqlFilter}
                      onChange={e => patchCfg({ fqlFilter: e.target.value })}
                      disabled={!liveEnabled}
                      className="w-full text-xs rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default: <code className="text-[11px]">status:"open"+cve.severity:["CRITICAL","HIGH"]</code>
                      {" "}— remove the severity clause to pull all severities.
                    </p>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      API Proxy Prefix
                    </label>
                    <input
                      type="text"
                      value={cfg.baseUrl}
                      onChange={e => patchCfg({ baseUrl: e.target.value.trim() })}
                      disabled={!liveEnabled}
                      className="w-full text-xs rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Keep <code className="text-[11px]">/cs-api</code> (proxied by Vite). Only change for a custom backend.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Save */}
            <button
              onClick={saveConfig}
              disabled={!liveEnabled || !configDirty}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {configDirty ? "Save Configuration" : "Configuration Saved ✓"}
            </button>
          </CardContent>
        </Card>

        {/* Sync controls card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Sync Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Sync mode */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">Sync Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {(["replace", "merge"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => patchCfg({ syncMode: m })}
                    disabled={!liveEnabled}
                    className={`px-3 py-2.5 rounded-lg border text-xs text-left transition-all ${
                      cfg.syncMode === m
                        ? "bg-primary/10 border-primary/40 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-semibold capitalize mb-0.5">{m}</div>
                    <div className="text-muted-foreground text-[11px]">
                      {m === "replace"
                        ? "Clear all existing data and load fresh from CrowdStrike."
                        : "Update existing records, append new ones. Keeps manual changes."}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-sync interval */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                Auto-Sync Interval
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SYNC_INTERVALS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => patchCfg({ autoSyncInterval: opt.value })}
                    disabled={!liveEnabled}
                    className={`px-2 py-1.5 rounded border text-xs text-center transition-all ${
                      cfg.autoSyncInterval === opt.value
                        ? "bg-primary/10 border-primary/40 text-foreground font-medium"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {cfg.autoSyncInterval === opt.value && opt.value > 0 && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 align-middle" />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
              {cfg.autoSyncInterval > 0 && (
                <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                  <Pause className="h-3 w-3" />
                  Auto-sync active every {cfg.autoSyncInterval} minutes.
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={!liveEnabled || status === "testing" || isSyncing}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === "testing"
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Wifi className="h-4 w-4" />}
                Test Connection
              </button>
              <button
                onClick={() => syncNow()}
                disabled={!liveEnabled || isSyncing || status === "testing"}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSyncing
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Play className="h-4 w-4" />}
                {isSyncing ? "Syncing…" : "Sync Now"}
              </button>
            </div>

            {/* Force full sync */}
            {lastSyncAt && !isSyncing && (
              <button
                onClick={() => forceFull()}
                disabled={!liveEnabled}
                className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
              >
                Force full sync (bypasses incremental) →
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Closed Vulnerability Sync ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-400" />
              <CardTitle className="text-sm font-semibold">Closed Vulnerability Sync</CardTitle>
            </div>
            {closeResult && !closeSyncing && (
              <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                {closeResult.closed.toLocaleString()} resolved ✓
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fetches vulnerabilities marked <strong>closed</strong> in CrowdStrike and automatically marks the
            matching open records in your dashboard as <strong>Resolved</strong>. It updates existing dashboard
            records only, so unrelated closed history is ignored.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Target summary */}
          {(() => {
            const openVulns = vulnerabilities.filter(v => v.status === "Open" || v.status === "In Progress");
            const sevSet = closeSeverities.length > 0 && closeSeverities.length < 4
              ? new Set(closeSeverities.map(s => s[0] + s.slice(1).toLowerCase()))
              : null;
            const targeted = sevSet ? openVulns.filter(v => sevSet.has(v.severity)) : openVulns;
            const uniqueCves = new Set(targeted.map(v => v.cveId)).size;
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Open records to check</p>
                  <p className="text-xl font-bold">{targeted.length.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Unique CVE IDs to query</p>
                  <p className="text-xl font-bold">{uniqueCves.toLocaleString()}</p>
                </div>
              </div>
            );
          })()}

          {/* Severity selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Target severities <span className="font-normal">(filters which open dashboard records are checked)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SEVERITIES.map(sev => {
                const selected = closeSeverities.includes(sev);
                const colors: Record<string, string> = {
                  CRITICAL: selected ? "bg-red-500/15 border-red-500/50 text-red-300"         : "border-border text-muted-foreground hover:border-red-500/30",
                  HIGH:     selected ? "bg-orange-500/15 border-orange-500/50 text-orange-300" : "border-border text-muted-foreground hover:border-orange-500/30",
                  MEDIUM:   selected ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-300" : "border-border text-muted-foreground hover:border-yellow-500/30",
                  LOW:      selected ? "bg-blue-500/15 border-blue-500/50 text-blue-300"       : "border-border text-muted-foreground hover:border-blue-500/30",
                };
                return (
                  <button
                    key={sev}
                    onClick={() => {
                      setCloseSeverities(prev =>
                        prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev],
                      );
                      setCloseResult(null);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${colors[sev]}`}
                  >
                    {selected && <CheckCircle2 className="inline h-3 w-3 mr-1 align-[-1px]" />}
                    {sev}
                  </button>
                );
              })}
            </div>

            {/* Strategy note */}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Queries CrowdStrike as <span className="font-mono text-foreground/60">status:"closed"+cve.id:[…]+aid:[…]</span> when AIDs are available, then updates only matching dashboard rows by CVE+asset or CVE+AID.
            </p>
          </div>

          {/* Progress bar while running */}
          {closeSyncing && closeProgress && (
            <div className="space-y-1.5 p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {closeProgress.statusMsg ?? (
                    closeProgress.phase === "vulnerabilities"
                      ? `Fetching closed records… ${closeProgress.fetched.toLocaleString()}${closeProgress.total ? ` / ${closeProgress.total.toLocaleString()}` : ""}`
                      : closeProgress.phase === "hostnames"
                      ? "Resolving hostnames…"
                      : "Mapping data…"
                  )}
                </span>
                {closeProgress.total && (
                  <span>{Math.round((closeProgress.fetched / closeProgress.total) * 100)}%</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{
                    width: closeProgress.total
                      ? `${Math.round((closeProgress.fetched / closeProgress.total) * 100)}%`
                      : "20%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {closeResult && !closeSyncing && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-green-500/25 bg-green-500/5 px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Resolved in Dashboard</p>
                <p className="text-2xl font-bold text-green-400">{closeResult.closed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Unexpected Adds</p>
                <p className="text-2xl font-bold text-blue-400">{closeResult.added.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total from API</p>
                <p className="text-2xl font-bold">{closeResult.total.toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* No matches hint */}
          {closeResult && !closeSyncing && closeResult.closed === 0 && closeResult.added === 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {closeResult.total === 0
                  ? "No closed vulnerabilities found for the selected severities in CrowdStrike."
                  : `Fetched ${closeResult.total.toLocaleString()} closed records but none matched existing dashboard entries. The match uses CVE+asset name or AID — make sure you've synced the same assets as open vulns first.`}
              </span>
            </div>
          )}

          {/* Error */}
          {closeError && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {closeError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleClosedSync}
              disabled={!liveEnabled || closeSyncing || isSyncing || closeSeverities.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {closeSyncing
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <XCircle className="h-4 w-4" />}
              {closeSyncing ? "Fetching…" : "Fetch & Resolve Closed Vulnerabilities"}
            </button>
            {closeSyncing && (
              <button
                onClick={handleCancelClosedSync}
                className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>


          <p className="text-xs text-muted-foreground">
            Always runs in <strong>Merge</strong> mode — existing open records are preserved; only matched ones are
            updated to Resolved. Match uses CVE ID + asset name or CVE ID + AID, so unrelated closed records are ignored.
          </p>
        </CardContent>
      </Card>

      {/* ── Raw payload inspector ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Raw API Payload Inspector
              </CardTitle>
            </div>
            <button
              onClick={async () => {
                setRawLoading(true);
                setRawError(null);
                setRawSample(null);
                try {
                  const sample = await fetchRawSample(cfg);
                  setRawSample(sample);
                } catch (err) {
                  setRawError(err instanceof Error ? err.message : "Failed to fetch sample.");
                } finally {
                  setRawLoading(false);
                }
              }}
              disabled={!liveEnabled || rawLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {rawLoading
                ? <RefreshCw className="h-3 w-3 animate-spin" />
                : <FlaskConical className="h-3 w-3" />}
              Fetch 1 raw record
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fetches one vulnerability from the API and shows the exact JSON — use this to identify the correct severity field name.
          </p>
        </CardHeader>
        {(rawSample || rawError) && (
          <CardContent>
            {rawError && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {rawError}
              </div>
            )}
            {rawSample && (
              <div className="space-y-3">
                {/* Severity fields highlighted */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-300 mb-2">CVE / Severity fields in this record:</p>
                  {(() => {
                    const cve = rawSample.cve as Record<string, unknown> | undefined;
                    if (!cve) return <p className="text-xs text-muted-foreground">No cve object found.</p>;
                    const fields = Object.entries(cve).filter(([k]) =>
                      k.toLowerCase().includes("sever") ||
                      k.toLowerCase().includes("score") ||
                      k.toLowerCase().includes("rating") ||
                      k.toLowerCase().includes("cvss") ||
                      k === "id"
                    );
                    return fields.length > 0
                      ? fields.map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs font-mono">
                            <span className="text-amber-300/80 min-w-[180px]">{k}:</span>
                            <span className="text-foreground">{JSON.stringify(v)}</span>
                          </div>
                        ))
                      : <p className="text-xs text-muted-foreground">No severity/score fields found in cve object.</p>;
                  })()}
                </div>

                {/* Full raw JSON */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                    Show full raw JSON ▶
                  </summary>
                  <pre className="mt-2 text-[11px] font-mono bg-muted/40 border border-border rounded p-3 overflow-x-auto max-h-96 leading-relaxed">
                    {JSON.stringify(rawSample, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Hostname debug probe ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-sm font-semibold">Hostname Resolution Debugger</CardTitle>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tests whether <code className="text-[11px]">POST /devices/entities/devices/v2</code> can resolve an AID → hostname.
            Enter a specific AID or leave blank to auto-pick one from your vulnerability data.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="AID (leave blank to auto-detect from vulns)"
              value={debugAidInput}
              onChange={e => setDebugAidInput(e.target.value.trim())}
              disabled={!liveEnabled}
              className="flex-1 text-xs font-mono rounded border border-border bg-muted/40 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={async () => {
                setDebugLoading(true);
                setDebugResult(null);
                try {
                  const result = await debugHostnameLookup(cfg, debugAidInput || undefined);
                  setDebugResult(result);
                } catch (err) {
                  setDebugResult({
                    aid: debugAidInput,
                    httpStatus: 0,
                    rawBody: null,
                    hostname: null,
                    error: err instanceof Error ? err.message : "Unknown error",
                  });
                } finally {
                  setDebugLoading(false);
                }
              }}
              disabled={!liveEnabled || debugLoading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {debugLoading
                ? <RefreshCw className="h-3 w-3 animate-spin" />
                : <Zap className="h-3 w-3" />}
              Test Hostname Lookup
            </button>
          </div>

          {debugResult && (
            <div className="space-y-2">
              {/* Result summary */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
                debugResult.hostname
                  ? "border-green-500/30 bg-green-500/5 text-green-300"
                  : "border-red-500/30 bg-red-500/5 text-red-400"
              }`}>
                {debugResult.hostname
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <div className="space-y-1">
                  <div className="font-semibold">
                    {debugResult.hostname
                      ? `✓ Hostname resolved: "${debugResult.hostname}"`
                      : `✗ Hostname NOT resolved`}
                  </div>
                  <div className="font-mono text-[11px] opacity-80">AID tested: {debugResult.aid || "none"}</div>
                  <div className="font-mono text-[11px] opacity-80">HTTP status: {debugResult.httpStatus || "N/A"}</div>
                  {debugResult.error && (
                    <div className="text-red-300 mt-1">{debugResult.error}</div>
                  )}
                  {!debugResult.hostname && debugResult.httpStatus === 403 && (
                    <div className="text-amber-300 font-semibold mt-1">
                      → 403 Forbidden: The API client is missing the <strong>Hosts → Read</strong> scope.
                      Go to CrowdStrike console → API Clients → edit this client → enable Hosts Read.
                    </div>
                  )}
                  {!debugResult.hostname && debugResult.httpStatus === 200 && (
                    <div className="text-amber-300 mt-1">
                      → API returned 200 but no hostname in response. The device may be offline or not enrolled.
                    </div>
                  )}
                </div>
              </div>

              {/* Raw response */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  Show raw Devices API response ▶
                </summary>
                <pre className="mt-2 text-[11px] font-mono bg-muted/40 border border-border rounded p-3 overflow-x-auto max-h-64 leading-relaxed">
                  {JSON.stringify(debugResult.rawBody, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Retroactive Hostname Resolution ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-sm font-semibold">Retroactive Hostname Resolution</CardTitle>
            </div>
            {/* AID count badge */}
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              aidVulns.length > 0
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "bg-green-500/10 text-green-400 border border-green-500/20"
            }`}>
              {aidVulns.length > 0
                ? `${aidVulns.length.toLocaleString()} unresolved`
                : "All hostnames resolved ✓"}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Finds all vulnerabilities stored with an unresolved <code className="text-[11px]">AID:</code> placeholder
            as their asset name, then calls the Devices API to look up the real hostnames and updates them in place —
            no re-sync required.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary stats */}
          {aidVulns.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Vulnerabilities needing resolution</p>
                <p className="text-2xl font-bold text-amber-400">{aidVulns.length.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Unique device AIDs to resolve</p>
                <p className="text-2xl font-bold">{uniqueAids.length.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/25 bg-green-500/5 text-xs text-green-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>
                No AID placeholders found in your {vulnerabilities.length.toLocaleString()} loaded vulnerabilities.
                All assets already have real hostnames.
              </span>
            </div>
          )}

          {/* Progress bar while running */}
          {retroProgress && (
            <div className="space-y-1.5 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Querying Devices API… {retroProgress.resolved.toLocaleString()} / {retroProgress.total.toLocaleString()} AIDs</span>
                <span>{Math.round((retroProgress.resolved / retroProgress.total) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((retroProgress.resolved / retroProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {retroResult && !retroLoading && (
            <div className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
              retroResult.updated > 0
                ? "border-green-500/30 bg-green-500/5 text-green-300"
                : "border-amber-500/30 bg-amber-500/5 text-amber-300"
            }`}>
              {retroResult.updated > 0
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-semibold">
                  {retroResult.updated > 0
                    ? `✓ ${retroResult.updated.toLocaleString()} vulnerabilities updated with real hostnames`
                    : "No hostnames resolved — devices may not be enrolled or Hosts Read scope is missing."}
                </p>
                {retroResult.notFound > 0 && (
                  <p className="mt-0.5 opacity-80">
                    {retroResult.notFound.toLocaleString()} AID{retroResult.notFound !== 1 ? "s" : ""} had no matching device record.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {retroError && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {retroError}
            </div>
          )}

          {/* Action button */}
          <button
            onClick={handleRetroResolve}
            disabled={!liveEnabled || retroLoading || aidVulns.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {retroLoading
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <Server className="h-4 w-4" />}
            {retroLoading
              ? "Resolving Hostnames…"
              : aidVulns.length === 0
              ? "No Unresolved Assets"
              : `Resolve ${uniqueAids.length.toLocaleString()} Hostname${uniqueAids.length !== 1 ? "s" : ""}`}
          </button>

          <p className="text-xs text-muted-foreground">
            Uses the same <code className="text-[11px]">POST /devices/entities/devices/v2</code> call (batches of 5,000 AIDs)
            as the main sync. Requires the <strong>Hosts → Read</strong> scope on your API client.
          </p>

          {/* ── Reclassify asset types ───────────────────────────────────── */}
          <div className="h-px bg-border" />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-purple-400" />
              <p className="text-sm font-semibold">Fix Asset Type Classification</p>
            </div>
            <p className="text-xs text-muted-foreground">
              After hostname resolution, asset types (Server / Endpoint / Cloud…) may be stale because they
              were classified from the old AID placeholder names. Run this to re-apply your mapping rules
              to all current hostnames and fix the SLA Watchlist filters.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const changed = reclassifyAssets();
                  setReclassifyResult(changed);
                }}
                disabled={vulnerabilities.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-500/40 bg-purple-500/10 text-xs text-purple-300 hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Tags className="h-3.5 w-3.5" />
                Reclassify Asset Types
              </button>

              {reclassifyResult !== null && (
                <span className={`text-xs flex items-center gap-1.5 ${
                  reclassifyResult > 0 ? "text-green-400" : "text-muted-foreground"
                }`}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {reclassifyResult > 0
                    ? `${reclassifyResult.toLocaleString()} asset${reclassifyResult !== 1 ? "s" : ""} reclassified`
                    : "All asset types already up to date"}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-muted-foreground">How the Connector Works</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                icon: Shield,
                title: "1. OAuth2 Auth",
                body: "Obtains a 30-minute bearer token from CrowdStrike using your Client ID + Secret. Tokens refresh automatically.",
              },
              {
                icon: Database,
                title: "2. Paginated Fetch",
                body: "Calls /spotlight/combined/vulnerabilities/v1 with your FQL filter. Fetches up to 400 records per page until all are retrieved.",
              },
              {
                icon: Zap,
                title: "3. Data Mapping",
                body: "Maps ExPRT rating → severity, exploit_status → risk score, hostname → asset type using your configured rules.",
              },
              {
                icon: RefreshCw,
                title: "4. Live Updates",
                body: "With auto-sync enabled, the dashboard refreshes automatically on your chosen interval — no manual imports needed.",
              },
            ].map(step => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-0.5">{step.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proxy note */}
          <div className="mt-5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="text-amber-400 font-medium">Proxy mode: </span>
              API calls are routed through <code className="text-[11px]">/cs-api</code> → Vite dev-server → <code className="text-[11px]">api.us-2.crowdstrike.com</code>, bypassing browser CORS restrictions.
              In production, configure a backend reverse proxy to forward <code className="text-[11px]">/cs-api/*</code> to CrowdStrike.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
