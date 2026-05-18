import type { AssetType } from "@/data/vulnerabilities";

const CONFIG_KEY = "asset_mapping_rules_v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MatchCondition = "starts_with" | "contains" | "ends_with";

export interface MappingRule {
  id: string;
  condition: MatchCondition;
  value: string;       // case-insensitive match value
  assetType: AssetType;
  enabled: boolean;
}

export interface AssetMappingConfig {
  rules: MappingRule[];
  fallbackAssetType: AssetType;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const ASSET_TYPES: AssetType[] = [
  "Server", "Endpoint", "Cloud", "Application", "Network", "Database",
];

export const CONDITION_LABELS: Record<MatchCondition, string> = {
  starts_with: "starts with",
  contains:    "contains",
  ends_with:   "ends with",
};

export const DEFAULT_RULES: MappingRule[] = [
  { id: "rule-srv",  condition: "starts_with", value: "SRV",  assetType: "Server",   enabled: true },
  { id: "rule-sql",  condition: "contains",    value: "sql",  assetType: "Database", enabled: true },
  { id: "rule-dc",   condition: "starts_with", value: "DC",   assetType: "Server",   enabled: true },
  { id: "rule-nfs",  condition: "contains",    value: "nfs",  assetType: "Server",   enabled: true },
  { id: "rule-opaq", condition: "starts_with", value: "OPAQ", assetType: "Endpoint", enabled: true },
];

export const DEFAULT_FALLBACK: AssetType = "Endpoint";

// ── Storage ───────────────────────────────────────────────────────────────────

export function getAssetMappingConfig(): AssetMappingConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AssetMappingConfig>;
      if (parsed.rules && Array.isArray(parsed.rules)) {
        return {
          rules:             parsed.rules,
          fallbackAssetType: parsed.fallbackAssetType ?? DEFAULT_FALLBACK,
        };
      }
    }
  } catch {}
  return { rules: [...DEFAULT_RULES], fallbackAssetType: DEFAULT_FALLBACK };
}

export function setAssetMappingConfig(config: AssetMappingConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
  window.dispatchEvent(new CustomEvent("asset-mapping-changed"));
}

export function resetAssetMappingConfig(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent("asset-mapping-changed"));
}

// ── Rule application ──────────────────────────────────────────────────────────

/**
 * Applies mapping rules to a hostname in priority order (first match wins).
 * Falls back to config.fallbackAssetType when no rule matches.
 * Pass a pre-fetched config to avoid repeated localStorage reads in hot loops.
 */
export function applyMappingRules(
  hostname: string,
  config?: AssetMappingConfig,
): AssetType {
  const cfg = config ?? getAssetMappingConfig();
  const h   = hostname.toLowerCase();

  for (const rule of cfg.rules) {
    if (!rule.enabled) continue;
    const v = rule.value.toLowerCase();
    let match = false;
    switch (rule.condition) {
      case "starts_with": match = h.startsWith(v); break;
      case "contains":    match = h.includes(v);   break;
      case "ends_with":   match = h.endsWith(v);   break;
    }
    if (match) return rule.assetType;
  }

  return cfg.fallbackAssetType;
}

/** Generate a unique rule ID. */
export function newRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
