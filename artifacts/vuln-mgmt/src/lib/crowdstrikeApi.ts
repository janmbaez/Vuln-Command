/**
 * CrowdStrike Falcon Spotlight API client.
 *
 * All requests are routed through the Vite dev-server proxy at /cs-api so
 * that browser CORS restrictions don't block calls to api.us-2.crowdstrike.com.
 *
 * Token caching: module-level variables survive React re-renders / page
 * navigations. Tokens are refreshed automatically 60 s before expiry.
 *
 * Hostname resolution:
 *   The Spotlight combined endpoint sometimes returns an empty host_info.hostname
 *   (or the raw AID hex string in that field). After fetching all vuln resources
 *   we collect the unique AIDs, batch-call /devices/entities/devices/v2 to get
 *   the real hostnames, then apply them during the final mapping pass.
 */

import { applyMappingRules, getAssetMappingConfig } from "@/lib/assetMappingConfig";
import { SLA_DAYS } from "@/context/VulnerabilityContext";
import type { Vulnerability, Severity, Status, AssetType, Team } from "@/data/vulnerabilities";

// ── Config ────────────────────────────────────────────────────────────────────

export interface CsApiConfig {
  clientId: string;
  clientSecret: string;
  /** Proxy prefix — never change unless you have a real backend proxy */
  baseUrl: string;
  /** Auto-sync every N minutes (0 = disabled) */
  autoSyncInterval: number;
  /** Replace all existing vulns or merge (update existing + append new) */
  syncMode: "replace" | "merge";
  /** FQL filter applied on the API side */
  fqlFilter: string;
}

// Default: only Critical + High severity, open status
export const CS_CONFIG_DEFAULTS: CsApiConfig = {
  clientId: "",
  clientSecret: "",
  baseUrl: "/cs-api",
  autoSyncInterval: 0,
  syncMode: "replace",
  fqlFilter: 'status:"open"+cve.severity:["CRITICAL","HIGH"]',
};

const CS_CONFIG_KEY = "cs_api_config_v1";
const CS_SECRET_KEY = "cs_api_client_secret_session_v1";
const MAX_FQL_LENGTH = 2_000;

export function isCrowdStrikeLiveEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_CROWDSTRIKE_LIVE === "true";
}

function getSessionSecret(): string {
  try {
    return sessionStorage.getItem(CS_SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

function sanitizeCsConfig(config: Partial<CsApiConfig>): Partial<CsApiConfig> {
  const sanitized: Partial<CsApiConfig> = { ...config };
  sanitized.baseUrl = CS_CONFIG_DEFAULTS.baseUrl;

  if (sanitized.syncMode !== "replace" && sanitized.syncMode !== "merge") {
    sanitized.syncMode = CS_CONFIG_DEFAULTS.syncMode;
  }

  const interval = Number(sanitized.autoSyncInterval);
  sanitized.autoSyncInterval = Number.isFinite(interval)
    ? Math.max(0, Math.min(1_440, Math.floor(interval)))
    : CS_CONFIG_DEFAULTS.autoSyncInterval;

  if (typeof sanitized.fqlFilter !== "string" || sanitized.fqlFilter.length > MAX_FQL_LENGTH) {
    sanitized.fqlFilter = CS_CONFIG_DEFAULTS.fqlFilter;
  }

  return sanitized;
}

export function getCsConfig(): CsApiConfig {
  try {
    const raw = localStorage.getItem(CS_CONFIG_KEY);
    if (raw) {
      const saved = sanitizeCsConfig(JSON.parse(raw) as Partial<CsApiConfig>);
      // Secrets are session-only. If an older version persisted one, remove it
      // before merging config so production demos don't retain credentials.
      if (saved.clientSecret) {
        delete saved.clientSecret;
        localStorage.setItem(CS_CONFIG_KEY, JSON.stringify(saved));
      }
      // If the saved config still has the old permissive filter, upgrade it
      if (saved.fqlFilter === 'status:"open"') {
        saved.fqlFilter = CS_CONFIG_DEFAULTS.fqlFilter;
      }
      const clientSecret = getSessionSecret();
      return { ...CS_CONFIG_DEFAULTS, ...saved, clientSecret };
    }
  } catch {}
  return { ...CS_CONFIG_DEFAULTS, clientSecret: getSessionSecret() };
}

export function setCsConfig(patch: Partial<CsApiConfig>): void {
  const next = { ...getCsConfig(), ...sanitizeCsConfig(patch) };
  if ("clientSecret" in patch) {
    try {
      if (patch.clientSecret) sessionStorage.setItem(CS_SECRET_KEY, patch.clientSecret);
      else sessionStorage.removeItem(CS_SECRET_KEY);
    } catch {}
  }
  const { clientSecret: _clientSecret, ...persistable } = next;
  localStorage.setItem(CS_CONFIG_KEY, JSON.stringify(persistable));
  window.dispatchEvent(new CustomEvent("cs-config-changed"));
}

// ── Token cache ───────────────────────────────────────────────────────────────

let _token: string | null = null;
let _tokenExpiry = 0;

export function clearTokenCache(): void {
  _token = null;
  _tokenExpiry = 0;
}

export async function getAuthToken(cfg: CsApiConfig): Promise<string> {
  if (!isCrowdStrikeLiveEnabled()) {
    throw new Error("Live CrowdStrike API calls are disabled for this deployment.");
  }

  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;

  const res = await fetch(`${cfg.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CrowdStrike auth failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("CrowdStrike auth: server returned 200 but no access_token in response.");
  }
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in ?? 1800) * 1_000;
  return _token;
}

// ── Raw API types ─────────────────────────────────────────────────────────────

interface CsVulnResource {
  id: string;
  aid?: string;
  cve?: {
    id?: string;
    // CVSS numeric scores — v3 preferred, v2 as fallback
    base_score?: number;          // v2 base score (legacy field)
    cvss_v3_score?: number;       // v3 score (if present)
    // Severity labels — CrowdStrike uses several names across API versions
    severity?: string;            // CVSS label: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"NONE"
    base_severity?: string;       // alternate field name seen in some responses
    cvss_v3_severity?: string;    // explicit v3 severity label
    exprt_rating?: string;        // CrowdStrike ExPRT AI rating (NOT CVSS)
    exploit_status?: number;      // 0=Unproven 30=Available 60=Easily 90=Actively
    description?: string;
    published_date?: string;
    remediation_level?: string;
    vector?: string;
  };
  host_info?: {
    hostname?: string;
    local_ip?: string;
    platform_name?: string;
    machine_domain?: string;
    os_version?: string;
  };
  status?: string;            // "open" | "closed" | "reopen" | "expired"
  created_timestamp?: string;
  updated_timestamp?: string;
  apps?: Array<{ product_name_version?: string }>;
  // Allow unknown keys so the raw inspector captures everything
  [key: string]: unknown;
}

interface CsDeviceResource {
  device_id?: string;
  hostname?: string;
  local_ip?: string;
  platform_name?: string;
  os_version?: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

/** 32-char lowercase hex = raw agent ID, not a real hostname */
const AID_RE = /^[0-9a-f]{32}$/i;

function isAid(s: string | undefined): boolean {
  return !!s && AID_RE.test(s.trim());
}

function mapSeverity(raw: string | undefined): Severity {
  const s = (raw ?? "").toUpperCase().trim();
  if (s === "CRITICAL") return "Critical";
  if (s === "HIGH")     return "High";
  if (s === "MEDIUM" || s === "MODERATE") return "Medium";
  return "Low";
}

function mapStatus(raw: string | undefined): Status {
  const s = (raw ?? "").toLowerCase().trim();
  if (s === "closed" || s === "expired") return "Resolved";
  if (s === "reopen") return "In Progress";
  return "Open";
}

function mapExploitStatus(code: number | undefined): string {
  const n = code ?? 0;
  if (n >= 90) return "Actively Used (Critical)";
  if (n >= 60) return "Easily Exploitable";
  if (n >= 30) return "Available";
  return "Unproven";
}

function mapTeam(hostname: string, severity: Severity): Team {
  const h = hostname.toLowerCase();
  if (h.includes("dc") || h.includes("kms") || h.includes("infra")) return "Infrastructure";
  if (h.includes("sql") || h.includes("db"))                          return "Database";
  if (h.includes("exch") || h.includes("mail"))                       return "Messaging";
  if (severity === "Critical") return "CloudSec";
  if (severity === "High")     return "AppSec";
  return "EndpointSec";
}

function cvssFromApi(r: CsVulnResource, severity: Severity, exploitStatus: string): number {
  if (r.cve?.base_score) return r.cve.base_score;
  const e = exploitStatus.toLowerCase();
  if (severity === "Critical") return e.includes("actively") ? 9.8 : e.includes("easily") ? 9.3 : 9.0;
  if (severity === "High")     return e.includes("actively") ? 8.5 : e.includes("easily") ? 7.8 : 7.0;
  if (severity === "Medium")   return e.includes("available") ? 5.5 : 4.5;
  return e.includes("available") ? 3.5 : 2.5;
}

function daysOpenFromTs(ts: string | undefined): number {
  if (!ts) return 0;
  try {
    return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000));
  } catch { return 0; }
}

function isoDateOnly(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

function dateOnlyFromTs(ts: string | undefined): string {
  if (!ts) return isoDateOnly();
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? isoDateOnly() : isoDateOnly(parsed);
}

const CLOSED_STATUSES = new Set<string>(["Resolved", "Closed", "Remediated", "Risk Accepted"]);
const OPEN_STATUSES = new Set<string>(["Open", "Active", "In Progress"]);

/** Returns true only for a persisted closed/remediated status becoming open again. */
export function detectReopen(existing: Vulnerability, incomingStatus: Status | string): boolean {
  return CLOSED_STATUSES.has(existing.status) && OPEN_STATUSES.has(incomingStatus);
}

/**
 * Chooses the SLA clock start date for an incoming sync record.
 * New records start from their original open date, reopened records start today,
 * and ordinary updates keep the existing effective SLA start unchanged.
 */
export function computeEffectiveSlaStart(
  existing: Vulnerability | undefined,
  incoming: Partial<Vulnerability>,
  reopened: boolean,
): string {
  if (!existing) return incoming.originalOpenDate ?? incoming.effectiveSlaStart ?? isoDateOnly();
  if (reopened) return isoDateOnly();
  return existing.effectiveSlaStart ?? existing.originalOpenDate ?? incoming.originalOpenDate ?? isoDateOnly();
}

/**
 * Convert a raw CVSS numeric score to a severity label string.
 * Returns undefined when score is absent so callers can fall through to
 * other fields.
 * CVSS v3 bands: 9.0–10 Critical · 7.0–8.9 High · 4.0–6.9 Medium · <4 Low
 */
function cvssToSeverityLabel(score: number | undefined): string | undefined {
  if (score == null || score <= 0) return undefined;
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  return "LOW";
}

/**
 * Parse the severity values declared in the FQL filter string.
 *
 * Handles both forms:
 *   cve.severity:["CRITICAL","HIGH"]   → ["Critical", "High"]
 *   cve.severity:"CRITICAL"            → ["Critical"]
 *
 * The SEVERITY_ORDER array is used to pick the highest when multiple are present.
 */
const SEVERITY_ORDER: Severity[] = ["Critical", "High", "Medium", "Low"];

export function parseFqlSeverities(fql: string): Severity[] {
  const results: Severity[] = [];

  // Array form: cve.severity:["CRITICAL","HIGH"]
  const arrMatch = fql.match(/cve\.severity:\[([^\]]+)\]/i);
  if (arrMatch) {
    const tokens = arrMatch[1].match(/"([^"]+)"/g) ?? [];
    for (const t of tokens) {
      const s = mapSeverity(t.replace(/"/g, ""));
      if (!results.includes(s)) results.push(s);
    }
  }

  // Single-value form: cve.severity:"CRITICAL"
  const singleMatch = fql.match(/cve\.severity:"([^"]+)"/i);
  if (!arrMatch && singleMatch) {
    const s = mapSeverity(singleMatch[1]);
    if (!results.includes(s)) results.push(s);
  }

  // Return sorted highest → lowest
  return results.sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b));
}

/**
 * Determine the severity for a record.
 *
 * Strategy:
 *   1. If the FQL filter contains EXACTLY ONE severity, every record that
 *      comes back IS that severity — the API already filtered for it.
 *   2. If the FQL filter lists MULTIPLE severities, try all known API fields
 *      (numeric score, text labels). If none yield a non-Low result, fall back
 *      to the highest severity present in the filter.
 *   3. No FQL hint → try API fields, default to Low.
 */
function resolveSeverity(
  cve: CsVulnResource["cve"],
  fqlSeverities: Severity[],
): Severity {
  // Single-severity filter → trust it completely, no field inspection needed
  if (fqlSeverities.length === 1) return fqlSeverities[0];

  // Try numeric scores first
  const fromScore =
    cvssToSeverityLabel(cve?.cvss_v3_score) ||
    cvssToSeverityLabel(cve?.base_score);
  if (fromScore) {
    const s = mapSeverity(fromScore);
    if (s !== "Low" || fqlSeverities.includes("Low")) return s;
  }

  // Try text label fields
  const fromText =
    cve?.cvss_v3_severity ||
    cve?.severity         ||
    cve?.base_severity;
  if (fromText) {
    const s = mapSeverity(fromText);
    if (s !== "Low" || fqlSeverities.includes("Low")) return s;
  }

  // Fall back to highest severity in the FQL filter (guaranteed to be correct)
  if (fqlSeverities.length > 0) return fqlSeverities[0];

  // Last resort
  return mapSeverity(cve?.exprt_rating) ?? "Low";
}

/**
 * Map a single CrowdStrike resource → app Vulnerability shape.
 *
 * hostnameMap: AID → real hostname, resolved via Devices API.
 * Hostname priority:
 *   1. hostnameMap[aid]                   (Device API lookup — most reliable)
 *   2. host_info.hostname  (only if not a raw AID hex string)
 *   3. host_info.machine_domain            (fallback domain name)
 *   4. aid itself                          (last resort, clearly labelled)
 */
export function mapCsResourceToVuln(
  r: CsVulnResource,
  mappingCfg: ReturnType<typeof getAssetMappingConfig>,
  hostnameMap?: Map<string, string>,
  fqlSeverities: Severity[] = [],
): Omit<Vulnerability, "id"> {
  const aid = r.aid ?? "";

  const resolvedFromMap = aid ? (hostnameMap?.get(aid) ?? "") : "";
  const hostFromInfo    = r.host_info?.hostname ?? "";
  const domainFallback  = r.host_info?.machine_domain ?? "";

  // Hostname priority — Device API result (hostnameMap) is always the most
  // reliable source. If we got one, use it exclusively. Only fall through to
  // Spotlight's host_info fields when the Device API had no entry for this AID.
  const hostname =
    (resolvedFromMap && !isAid(resolvedFromMap) ? resolvedFromMap : "") ||
    (hostFromInfo    && !isAid(hostFromInfo)    ? hostFromInfo    : "") ||
    (domainFallback  && !isAid(domainFallback)  ? domainFallback  : "") ||
    (aid ? `AID:${aid}` : "Unknown");

  // Severity derived from FQL filter + API fields (see resolveSeverity).
  const severity = resolveSeverity(r.cve, fqlSeverities);
  const exploitStatus = mapExploitStatus(r.cve?.exploit_status);
  const status        = mapStatus(r.status);
  const cveId         = r.cve?.id ?? `CS-${r.id}`;
  const daysOpen      = daysOpenFromTs(r.created_timestamp);
  const cvss          = cvssFromApi(r, severity, exploitStatus);
  const assetType     = applyMappingRules(hostname, mappingCfg) as AssetType;
  const team          = mapTeam(hostname, severity);
  const slaLimit      = SLA_DAYS[severity] ?? 180;

  const deadlineDate = new Date();
  deadlineDate.setDate(deadlineDate.getDate() + (slaLimit - daysOpen));

  const description = r.cve?.description
    ?? (r.apps?.[0]?.product_name_version
      ? `Vulnerability in ${r.apps[0].product_name_version} on ${hostname}`
      : `${severity} vulnerability on ${hostname}`);

  const title = description.length > 80
    ? description.slice(0, 77) + "..."
    : description || cveId;

  const likelihood = exploitStatus.includes("Actively") ? 9
    : exploitStatus.includes("Easily") ? 7
    : exploitStatus.includes("Available") ? 5 : 3;
  const impact = severity === "Critical" ? 9 : severity === "High" ? 7 : severity === "Medium" ? 5 : 3;
  const originalOpenDate = dateOnlyFromTs(r.created_timestamp);

  return {
    cveId, title, severity, cvss, status,
    asset: hostname, assetType, team,
    daysOpen,
    deadline: deadlineDate.toISOString().split("T")[0],
    description, exploitStatus, likelihood, impact,
    originalOpenDate,
    effectiveSlaStart: originalOpenDate,
    reopenCount: 0,
    previousStatus: status,
    // Store the raw AID so mergeBulkVulnerabilities can match by AID even
    // when the displayed asset name changed (hostname resolved later).
    ...(aid ? { aid } : {}),
  };
}

// ── Hostname resolution via Devices API ───────────────────────────────────────

/**
 * Batch-resolve agent IDs → real hostnames using /devices/entities/devices/v2.
 * Only queries AIDs that are missing a proper hostname in the Spotlight data.
 * Non-fatal: if the Devices API call fails, returns an empty map and callers
 * fall back to whatever partial hostname data is available.
 */
async function resolveHostnames(
  cfg: CsApiConfig,
  resources: CsVulnResource[],
  onStatus?: (msg: string) => void,
): Promise<Map<string, string>> {
  const hostnameMap = new Map<string, string>();

  // Resolve ALL unique AIDs unconditionally — the Devices API is the only
  // reliable source of hostnames. The Spotlight host_info.hostname field is
  // often empty, a raw AID hex string, or a stale value. We always prefer
  // the Device API result in mapCsResourceToVuln (hostnameMap takes priority).
  const aidsToResolve = Array.from(new Set(
    resources.filter(r => !!r.aid).map(r => r.aid!)
  ));

  if (aidsToResolve.length === 0) return hostnameMap;

  onStatus?.(`Resolving ${aidsToResolve.length} hostnames via Devices API…`);

  // POST /devices/entities/devices/v2 supports up to 5 000 IDs per request.
  // GET only supports 100 — using GET with more IDs silently truncates results.
  const DEVICE_BATCH = 5_000;
  for (let i = 0; i < aidsToResolve.length; i += DEVICE_BATCH) {
    const batch = aidsToResolve.slice(i, i + DEVICE_BATCH);

    // Refresh token before every batch — hostname resolution can run for
    // many minutes on large datasets and must not rely on a stale token.
    const batchToken = await getAuthToken(cfg);

    try {
      const res = await fetch(
        `${cfg.baseUrl}/devices/entities/devices/v2`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${batchToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: batch }),
        },
      );

      if (!res.ok) {
        // Non-fatal — just skip this batch
        continue;
      }

      const data = await res.json() as { resources?: CsDeviceResource[] };
      for (const device of data.resources ?? []) {
        if (device.device_id && device.hostname && !isAid(device.hostname)) {
          hostnameMap.set(device.device_id, device.hostname);
        }
      }
    } catch {
      // silently continue — hostname resolution is best-effort
    }

    const resolved = Math.min(i + DEVICE_BATCH, aidsToResolve.length);
    onStatus?.(`Resolving hostnames… ${resolved.toLocaleString()} / ${aidsToResolve.length.toLocaleString()}`);

    // Yield between batches so the UI thread stays alive
    await new Promise<void>(r => setTimeout(r, 0));
  }

  return hostnameMap;
}

// ── Progress type ─────────────────────────────────────────────────────────────

export interface FetchProgress {
  phase: "vulnerabilities" | "hostnames" | "mapping";
  fetched: number;
  total: number | null;
  statusMsg?: string;
}

// ── Main paginated fetch ──────────────────────────────────────────────────────

/**
 * Full sync pipeline:
 *   1. Paginate through /spotlight/combined/vulnerabilities/v1
 *   2. Batch-resolve AIDs → hostnames via /devices/entities/devices/v2
 *   3. Map raw resources → app Vulnerability shape
 */
export async function fetchAllCsVulns(
  cfg: CsApiConfig,
  onProgress?: (p: FetchProgress) => void,
  options?: {
    /** Skip the Devices API hostname-resolution phase (e.g. for closed-vuln syncs) */
    skipHostnames?: boolean;
    /** Stop paginating after this many records (default: unlimited) */
    maxRecords?: number;
    /** AbortSignal — rejects with AbortError when the caller cancels */
    signal?: AbortSignal;
  },
): Promise<Omit<Vulnerability, "id">[]> {
  // Token is fetched fresh before every page — getAuthToken() checks expiry
  // internally and only re-authenticates when within 60 s of expiry, so
  // long-running syncs (500 k records can take 20–30 min) never hit 401.
  const mappingCfg = getAssetMappingConfig(); // read once before hot loop

  // ── Phase 1: Fetch all vulnerability resources ────────────────────────────
  const PAGE_LIMIT = 400;
  let after: string | undefined;
  let knownTotal: number | null = null;
  const rawResources: CsVulnResource[] = [];

  // De-duplication set — keyed on the spotlight resource ID.
  // Critical for the context-expiry restart path: when we reset `after` and
  // re-paginate from the beginning, records already collected are skipped so
  // the final list contains no duplicates.
  const seenIds = new Set<string>();

  // How many times we've restarted pagination after a context expiry.
  // Capped at MAX_RESTARTS to prevent an infinite loop if the API keeps
  // expiring contexts on us.
  let restartCount = 0;
  const MAX_RESTARTS = 5;

  onProgress?.({ phase: "vulnerabilities", fetched: 0, total: null });

  do {
    // Abort check — throw immediately if the caller cancelled
    if (options?.signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

    // Max-records ceiling — stop pagination once we have enough
    if (options?.maxRecords && rawResources.length >= options.maxRecords) break;

    // Re-validate / refresh token before every page request.
    // If the token is still fresh, this returns immediately from cache.
    const token = await getAuthToken(cfg);

    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      sort: "created_timestamp|desc",
    });
    if (cfg.fqlFilter) params.set("filter", cfg.fqlFilter);
    if (after)         params.set("after", after);

    const res = await fetch(
      `${cfg.baseUrl}/spotlight/combined/vulnerabilities/v1?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: options?.signal },
    );

    // ── 401: token expired mid-sync — refresh and retry this page ────────
    if (res.status === 401) {
      clearTokenCache();
      const retryToken = await getAuthToken(cfg);
      const retryRes = await fetch(
        `${cfg.baseUrl}/spotlight/combined/vulnerabilities/v1?${params}`,
        { headers: { Authorization: `Bearer ${retryToken}` }, signal: options?.signal },
      );
      if (!retryRes.ok) {
        const text = await retryRes.text().catch(() => "");
        throw new Error(`CrowdStrike API error after token refresh (${retryRes.status}): ${text}`);
      }
      const retryData = await retryRes.json() as {
        resources?: CsVulnResource[];
        meta?: { pagination?: { total?: number; count?: number; after?: string } };
      };
      knownTotal = retryData.meta?.pagination?.total ?? knownTotal;
      for (const r of retryData.resources ?? []) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); rawResources.push(r); }
      }
      onProgress?.({ phase: "vulnerabilities", fetched: rawResources.length, total: knownTotal });
      after = retryData.meta?.pagination?.after || undefined;
      if (rawResources.length >= 1_000_000) break;
      await new Promise<void>(r => setTimeout(r, 0));
      continue;
    }

    // ── 404: search context expired — restart pagination from page 1 ──────
    // The CrowdStrike Spotlight API issues a new "search context" with each
    // paginated session. If a session runs long enough (typically >10 min),
    // the context is invalidated server-side and subsequent `after` cursors
    // return 404 "Search context expired". We restart from page 1 and rely
    // on the seenIds set to skip records we already collected, so the final
    // list is complete without duplicates.
    if (res.status === 404) {
      const errBody = await res.json().catch(() => null) as {
        errors?: Array<{ code?: number; message?: string }>;
      } | null;
      const isCtxExpired = errBody?.errors?.some(
        e => typeof e.message === "string" && e.message.includes("Search context expired"),
      );

      if (isCtxExpired && restartCount < MAX_RESTARTS) {
        restartCount++;
        after = undefined; // reset to page 1
        onProgress?.({
          phase: "vulnerabilities",
          fetched: rawResources.length,
          total: knownTotal,
          statusMsg: `Pagination context expired — resuming from page 1 (pass ${restartCount} / ${MAX_RESTARTS})…`,
        });
        // Brief pause before restarting so the API can settle
        await new Promise<void>(r => setTimeout(r, 2_000));
        continue;
      }

      // Either not a context-expiry 404 or we've exceeded restart limit
      const errText = errBody ? JSON.stringify(errBody) : await res.text().catch(() => "");
      throw new Error(`CrowdStrike API error (404): ${errText}`);
    }

    // ── Any other non-2xx ─────────────────────────────────────────────────
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CrowdStrike API error (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      resources?: CsVulnResource[];
      meta?: { pagination?: { total?: number; count?: number; after?: string } };
    };

    knownTotal = data.meta?.pagination?.total ?? knownTotal;

    // Deduplicate — noop on a fresh sync, essential on restart passes
    for (const r of data.resources ?? []) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); rawResources.push(r); }
    }

    onProgress?.({ phase: "vulnerabilities", fetched: rawResources.length, total: knownTotal });

    after = data.meta?.pagination?.after || undefined;
    // Safety ceiling: 1 million records (prevents infinite loops on API bugs)
    if (rawResources.length >= 1_000_000) break;
    await new Promise<void>(r => setTimeout(r, 0));
  } while (after);

  // ── Phase 2: Resolve hostnames for any AID-only records ──────────────────
  // Skipped when the caller passes skipHostnames: true (e.g. closed-vuln sync
  // where we only need to match existing records — hostname data is irrelevant).
  let hostnameMap: Map<string, string>;
  if (options?.skipHostnames) {
    hostnameMap = new Map();
  } else {
    onProgress?.({ phase: "hostnames", fetched: 0, total: null, statusMsg: "Resolving hostnames…" });
    hostnameMap = await resolveHostnames(
      cfg,
      rawResources,
      msg => onProgress?.({ phase: "hostnames", fetched: 0, total: null, statusMsg: msg }),
    );
  }

  // ── Phase 3: Map to app Vulnerability shape ───────────────────────────────
  onProgress?.({ phase: "mapping", fetched: 0, total: rawResources.length });

  // Parse severity list from the FQL filter ONCE — used by every record.
  // e.g. cve.severity:["CRITICAL","HIGH"] → ["Critical","High"]
  // If only one severity is listed, every result is guaranteed to be that severity.
  const fqlSeverities = parseFqlSeverities(cfg.fqlFilter ?? "");

  const all: Omit<Vulnerability, "id">[] = [];
  for (const r of rawResources) {
    all.push(mapCsResourceToVuln(r, mappingCfg, hostnameMap, fqlSeverities));
  }

  return all;
}

// ── Standalone AID batch resolver ────────────────────────────────────────────

/**
 * Resolve an arbitrary list of CrowdStrike Agent IDs → real hostnames.
 *
 * This is the same POST-based lookup used inside fetchAllCsVulns, but exported
 * as a standalone function so the UI can call it retroactively (e.g. to fix
 * already-stored vulnerabilities whose asset field is still an AID placeholder).
 *
 * @param aids        Full 32-char hex AIDs to resolve
 * @param onProgress  Optional callback: (resolved, total)
 */
export async function resolveAidBatch(
  cfg: CsApiConfig,
  aids: string[],
  onProgress?: (resolved: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const hostnameMap = new Map<string, string>();
  if (aids.length === 0) return hostnameMap;

  const DEVICE_BATCH = 5_000;
  for (let i = 0; i < aids.length; i += DEVICE_BATCH) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

    const batch = aids.slice(i, i + DEVICE_BATCH);
    const batchToken = await getAuthToken(cfg);

    try {
      const res = await fetch(
        `${cfg.baseUrl}/devices/entities/devices/v2`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${batchToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: batch }),
          signal,
        },
      );

      if (res.ok) {
        const data = await res.json() as { resources?: CsDeviceResource[] };
        for (const device of data.resources ?? []) {
          if (device.device_id && device.hostname && !isAid(device.hostname)) {
            hostnameMap.set(device.device_id, device.hostname);
          }
        }
      }
    } catch (err) {
      // Re-throw abort errors so the caller knows the operation was cancelled
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // Any other error — non-fatal, skip this batch
    }

    onProgress?.(Math.min(i + DEVICE_BATCH, aids.length), aids.length);
    await new Promise<void>(r => setTimeout(r, 0));
  }

  return hostnameMap;
}

// ── Connection test ───────────────────────────────────────────────────────────

/**
 * Quick connectivity test — authenticates and fetches a single vuln.
 * Returns the number of total vulnerabilities reported by the API.
 */
export async function testCsConnection(cfg: CsApiConfig): Promise<{ total: number }> {
  clearTokenCache(); // force fresh token on test
  const token = await getAuthToken(cfg);

  const params = new URLSearchParams({ limit: "1" });
  if (cfg.fqlFilter) params.set("filter", cfg.fqlFilter);

  const res = await fetch(
    `${cfg.baseUrl}/spotlight/queries/vulnerabilities/v1?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CrowdStrike connection test failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { meta?: { pagination?: { total?: number } } };
  return { total: data.meta?.pagination?.total ?? 0 };
}

// ── Raw payload inspector ─────────────────────────────────────────────────────

/**
 * Fetches 1 raw vulnerability resource from the API and returns the unparsed
 * JSON object. Used by the connector UI to show exactly what field names and
 * values the API actually returns, so severity mapping can be verified.
 */
export async function fetchRawSample(cfg: CsApiConfig): Promise<Record<string, unknown>> {
  const token = await getAuthToken(cfg);

  const params = new URLSearchParams({ limit: "1" });
  if (cfg.fqlFilter) params.set("filter", cfg.fqlFilter);

  const res = await fetch(
    `${cfg.baseUrl}/spotlight/combined/vulnerabilities/v1?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Raw sample fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { resources?: Record<string, unknown>[] };
  return data.resources?.[0] ?? {};
}

// ── Hostname debug probe ──────────────────────────────────────────────────────

export interface HostnameDebugResult {
  aid: string;
  /** Raw HTTP status from POST /devices/entities/devices/v2 */
  httpStatus: number;
  /** Full raw response body */
  rawBody: unknown;
  /** Extracted hostname if found */
  hostname: string | null;
  /** Any error message */
  error: string | null;
}

/**
 * Diagnose hostname resolution for a single AID.
 *
 * Steps:
 *  1. Fetch 1 vuln from Spotlight to get a real AID (or use the provided one).
 *  2. POST that AID to /devices/entities/devices/v2.
 *  3. Return the full raw response + extracted hostname so the UI can show
 *     exactly what the API returns and whether the Hosts Read scope is granted.
 */
export async function debugHostnameLookup(
  cfg: CsApiConfig,
  aidOverride?: string,
): Promise<HostnameDebugResult> {
  const token = await getAuthToken(cfg);

  // Step 1 – get a real AID from a vuln record if none provided
  let aid = aidOverride ?? "";
  if (!aid) {
    const params = new URLSearchParams({ limit: "1" });
    if (cfg.fqlFilter) params.set("filter", cfg.fqlFilter);
    const vulnRes = await fetch(
      `${cfg.baseUrl}/spotlight/combined/vulnerabilities/v1?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (vulnRes.ok) {
      const vulnData = await vulnRes.json() as { resources?: Array<{ aid?: string }> };
      aid = vulnData.resources?.[0]?.aid ?? "";
    }
  }

  if (!aid) {
    return { aid: "", httpStatus: 0, rawBody: null, hostname: null, error: "Could not find any AID in vulnerability records." };
  }

  // Step 2 – POST to Devices API
  let httpStatus = 0;
  let rawBody: unknown = null;
  let hostname: string | null = null;
  let error: string | null = null;

  try {
    const devRes = await fetch(
      `${cfg.baseUrl}/devices/entities/devices/v2`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [aid] }),
      },
    );
    httpStatus = devRes.status;
    rawBody = await devRes.json().catch(() => null);

    if (devRes.ok) {
      const typed = rawBody as { resources?: Array<{ device_id?: string; hostname?: string }> };
      hostname = typed.resources?.[0]?.hostname ?? null;
    } else {
      error = `HTTP ${httpStatus} — Hosts Read scope may not be enabled on this API client.`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Network error calling Devices API.";
  }

  return { aid, httpStatus, rawBody, hostname, error };
}
