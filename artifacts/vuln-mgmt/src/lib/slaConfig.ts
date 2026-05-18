const CONFIG_KEY = "sla_config_v2";

export interface SlaConfig {
  days: { Critical: number; High: number; Medium: number; Low: number };
  atRiskWindowDays: number;
}

export const SLA_CONFIG_DEFAULTS: SlaConfig = {
  days: { Critical: 30, High: 60, Medium: 90, Low: 180 },
  atRiskWindowDays: 7,
};

export function getSlaConfig(): SlaConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SlaConfig>;
      // Merge carefully so partial configs still work
      return {
        days: { ...SLA_CONFIG_DEFAULTS.days, ...parsed.days },
        atRiskWindowDays: parsed.atRiskWindowDays ?? SLA_CONFIG_DEFAULTS.atRiskWindowDays,
      };
    }
  } catch {}
  return { ...SLA_CONFIG_DEFAULTS };
}

export function setSlaConfig(config: SlaConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
  // Dispatch custom event to notify listeners
  window.dispatchEvent(new CustomEvent("sla-config-changed"));
}

export function resetSlaConfig(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {}
  // Dispatch custom event to notify listeners
  window.dispatchEvent(new CustomEvent("sla-config-changed"));
}
