/**
 * Global CrowdStrike sync manager.
 *
 * Lives at the app root (above the router) so the polling loop keeps running
 * regardless of which page the user is on. Pages that died before couldn't
 * auto-sync because the interval was local to crowdstrike.tsx.
 *
 * Incremental sync:
 *   After the first full pull, subsequent syncs (merge mode only) append
 *   `+updated_timestamp:>='<lastSyncAt - 90s>'` to the FQL so only recently
 *   changed records are fetched. This makes 1-minute refresh intervals
 *   practical even for large datasets — a typical incremental page is a few
 *   dozen records instead of 500 k.
 *
 * Full sync is always used when:
 *   - syncMode === "replace"
 *   - No previous successful sync this session
 *   - The caller explicitly requests it (forceFull)
 */

import React, {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, useMemo,
} from "react";
import {
  getCsConfig, fetchAllCsVulns, clearTokenCache, isCrowdStrikeLiveEnabled,
  type FetchProgress,
} from "@/lib/crowdstrikeApi";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { appendLog } from "@/lib/fileStore";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SyncStats {
  added:   number;
  updated: number;
  total:   number;
}

export interface SyncContextType {
  /** True while a sync is running */
  isSyncing:      boolean;
  /** Granular progress from the current sync */
  progress:       FetchProgress | null;
  /** ISO string of the last successful sync, null if never synced this session */
  lastSyncAt:     Date | null;
  /** Error message from the last failed sync, null if last sync succeeded */
  lastSyncError:  string | null;
  /** Record counts from the last completed sync */
  lastSyncStats:  SyncStats | null;
  /** Wall-clock ms the last sync took */
  syncDuration:   number | null;
  /** Whether the last sync was incremental */
  wasIncremental: boolean;
  /** Trigger a sync now (incremental if eligible, full otherwise) */
  syncNow:        () => void;
  /** Force a full (non-incremental) sync regardless of lastSyncAt */
  forceFull:      () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncStatus(): SyncContextType {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncStatus must be used within SyncProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { addBulkVulnerabilities, mergeBulkVulnerabilities } = useVulnerabilities();

  const [isSyncing,      setIsSyncing]      = useState(false);
  const [progress,       setProgress]       = useState<FetchProgress | null>(null);
  const [lastSyncAt,     setLastSyncAt]     = useState<Date | null>(null);
  const [lastSyncError,  setLastSyncError]  = useState<string | null>(null);
  const [lastSyncStats,  setLastSyncStats]  = useState<SyncStats | null>(null);
  const [syncDuration,   setSyncDuration]   = useState<number | null>(null);
  const [wasIncremental, setWasIncremental] = useState(false);

  // Ref-backed guard so the interval callback always sees the live value
  // without being recreated (avoids re-triggering the interval useEffect).
  const isSyncingRef   = useRef(false);
  const lastSyncAtRef  = useRef<Date | null>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Core sync function ────────────────────────────────────────────────────

  const runSync = useCallback(async (forceFullPull = false) => {
    if (isSyncingRef.current) return; // already running

    const cfg = getCsConfig();
    if (!isCrowdStrikeLiveEnabled()) return;
    if (!cfg.clientId?.trim() || !cfg.clientSecret?.trim()) return; // not configured

    // ── Decide incremental vs full ──────────────────────────────────────────
    // Incremental: merge mode + previous sync exists + not forced full
    const canIncremental =
      !forceFullPull &&
      cfg.syncMode === "merge" &&
      lastSyncAtRef.current !== null;

    let fqlFilter = cfg.fqlFilter ?? "";
    let incremental = false;

    if (canIncremental && lastSyncAtRef.current) {
      // Overlap by 90 s to avoid missing records that arrived exactly at the
      // boundary due to clock skew or API indexing delays.
      const since = new Date(lastSyncAtRef.current.getTime() - 90_000);
      const sinceStr = since.toISOString().replace(/\.\d{3}Z$/, "Z"); // trim ms
      // Append the timestamp clause only if it isn't already in the filter
      if (!fqlFilter.includes("updated_timestamp")) {
        fqlFilter = fqlFilter
          ? `${fqlFilter}+updated_timestamp:>='${sinceStr}'`
          : `updated_timestamp:>='${sinceStr}'`;
      }
      incremental = true;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setProgress({ phase: "vulnerabilities", fetched: 0, total: null });
    setLastSyncError(null);
    setWasIncremental(incremental);

    const t0 = Date.now();

    // Log sync start
    appendLog({ type: "sync_start", incremental, filter: fqlFilter });

    try {
      const effectiveCfg = { ...cfg, fqlFilter };
      const vulns = await fetchAllCsVulns(effectiveCfg, p => setProgress(p));

      let added   = 0;
      let updated = 0;

      if (!incremental && cfg.syncMode === "replace") {
        addBulkVulnerabilities(vulns);
        added = vulns.length;
      } else {
        // Incremental or merge-mode full pull
        const result = mergeBulkVulnerabilities(vulns, "crowdstrike");
        added   = result.added;
        updated = result.updated;
      }

      const durationMs = Date.now() - t0;
      const now = new Date();
      lastSyncAtRef.current = now;
      setLastSyncAt(now);
      setLastSyncStats({ added, updated, total: vulns.length });
      setSyncDuration(durationMs);
      setLastSyncError(null);

      // Log sync complete
      appendLog({ type: "sync_complete", incremental, added, updated, total: vulns.length, durationMs });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Sync failed";
      setLastSyncError(error);
      clearTokenCache();
      // Log sync error
      appendLog({ type: "sync_error", incremental, error, durationMs: Date.now() - t0 });
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setProgress(null);
    }
  }, [addBulkVulnerabilities, mergeBulkVulnerabilities]);

  // ── Public triggers ───────────────────────────────────────────────────────

  const syncNow   = useCallback(() => { runSync(false); }, [runSync]);
  const forceFull = useCallback(() => { runSync(true);  }, [runSync]);

  // ── Interval management ───────────────────────────────────────────────────

  const setupInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const cfg = getCsConfig();
    if (isCrowdStrikeLiveEnabled() && cfg.autoSyncInterval > 0 && cfg.clientId && cfg.clientSecret) {
      intervalRef.current = setInterval(
        () => runSync(false),
        cfg.autoSyncInterval * 60_000,
      );
    }
  }, [runSync]);

  useEffect(() => {
    setupInterval();
    const onConfigChange = () => setupInterval();
    window.addEventListener("cs-config-changed", onConfigChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("cs-config-changed", onConfigChange);
    };
  }, [setupInterval]);

  // ── Context value (stable reference) ─────────────────────────────────────

  const value = useMemo<SyncContextType>(() => ({
    isSyncing, progress, lastSyncAt, lastSyncError,
    lastSyncStats, syncDuration, wasIncremental,
    syncNow, forceFull,
  }), [
    isSyncing, progress, lastSyncAt, lastSyncError,
    lastSyncStats, syncDuration, wasIncremental,
    syncNow, forceFull,
  ]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}
