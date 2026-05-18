/**
 * File-store client — persists data to disk via the Vite dev-server middleware.
 *
 * Why this exists:
 *   Browser IndexedDB and localStorage are scoped to the browser session/origin.
 *   When Cowork starts a new session the ephemeral /sessions/… directory is
 *   wiped, taking all browser storage with it. Writing to actual files on disk
 *   (in the mounted workspace folder) means data survives session restarts.
 *
 * Endpoints (added by the fileStorePlugin in vite.config.ts):
 *   GET  /data/load   → vuln-data.json   (full dataset)
 *   POST /data/save   → vuln-data.json   (full dataset)
 *   POST /data/log    → sync-log.jsonl   (append one line)
 */

import type { Vulnerability } from "@/data/vulnerabilities";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PersistedStore {
  version:         number;
  savedAt:         string;   // ISO timestamp
  source:          "mock" | "crowdstrike" | "manual" | "mixed";
  vulnerabilities: Vulnerability[];
}

export interface SyncLogEntry {
  timestamp:   string;
  type:        "sync_start" | "sync_complete" | "sync_error" | "session_start";
  incremental?: boolean;
  added?:      number;
  updated?:    number;
  total?:      number;
  durationMs?: number;
  error?:      string;
  filter?:     string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Cached reachability result + timestamp.
 *  On success: cached forever (the Vite server doesn't go away mid-session).
 *  On failure: retried every 30 s so a slow-starting server is eventually found. */
let _serverReachable: boolean | null = null;
let _serverCheckedAt = 0;
const RETRY_AFTER_FAILURE_MS = 30_000;

async function isServerReachable(): Promise<boolean> {
  const now = Date.now();
  if (_serverReachable === true) return true;
  if (_serverReachable === false && now - _serverCheckedAt < RETRY_AFTER_FAILURE_MS) return false;

  try {
    const r = await fetch("/data/load", { method: "GET", signal: AbortSignal.timeout(1_500) });
    _serverReachable = r.ok;
  } catch {
    _serverReachable = false;
  }
  _serverCheckedAt = Date.now();
  return _serverReachable;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Load the persisted dataset from disk.
 * Returns null if the file doesn't exist yet or the server isn't reachable.
 */
export async function loadFromFile(): Promise<PersistedStore | null> {
  try {
    if (!(await isServerReachable())) return null;
    const res = await fetch("/data/load", { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json() as PersistedStore;
    if (!Array.isArray(data.vulnerabilities)) return null;
    if (data.vulnerabilities.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Write the full dataset to disk.
 * Fire-and-forget — the caller shouldn't await this in hot paths.
 * Skips the write if the dataset exceeds 400 MB serialised (safety guard).
 */
export async function saveToFile(
  vulnerabilities: Vulnerability[],
  source: PersistedStore["source"],
): Promise<void> {
  try {
    if (!(await isServerReachable())) return;
    const payload: PersistedStore = {
      version:         1,
      savedAt:         new Date().toISOString(),
      source,
      vulnerabilities,
    };
    const body = JSON.stringify(payload);
    if (body.length > 400 * 1024 * 1024) return; // skip if > 400 MB
    await fetch("/data/save", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal:  AbortSignal.timeout(30_000),
    });
  } catch {
    // Non-fatal — browser storage still provides the in-session fallback
  }
}

/**
 * Append one structured line to sync-log.jsonl on disk.
 * The log file is never truncated — it grows indefinitely and acts as an
 * audit trail of every sync, error, and session start.
 */
export async function appendLog(entry: Omit<SyncLogEntry, "timestamp">): Promise<void> {
  try {
    if (!(await isServerReachable())) return;
    const line: SyncLogEntry = { timestamp: new Date().toISOString(), ...entry };
    await fetch("/data/log", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(line),
      signal:  AbortSignal.timeout(5_000),
    });
  } catch {
    // Non-fatal
  }
}
