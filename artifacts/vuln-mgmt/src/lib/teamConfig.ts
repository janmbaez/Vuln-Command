const CONFIG_KEY = "team_display_names_v1";

export type TeamId = "AppSec" | "CloudSec" | "NetSec" | "EndpointSec" | "Infrastructure" | "Database" | "Messaging";

export const TEAM_IDS: TeamId[] = [
  "AppSec",
  "CloudSec",
  "NetSec",
  "EndpointSec",
  "Infrastructure",
  "Database",
  "Messaging",
];

// Default human-readable display names for each team ID
export const TEAM_DEFAULTS: Record<TeamId, string> = {
  AppSec:         "Application Security",
  CloudSec:       "Cloud Security",
  NetSec:         "Network Security",
  EndpointSec:    "Endpoint Security",
  Infrastructure: "Infrastructure",
  Database:       "Database",
  Messaging:      "Messaging",
};

/** Returns the current display name map, merged with defaults. */
export function getTeamDisplayNames(): Record<TeamId, string> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<TeamId, string>>;
      return { ...TEAM_DEFAULTS, ...parsed };
    }
  } catch {}
  return { ...TEAM_DEFAULTS };
}

/** Persists a full display name map and notifies listeners. */
export function setTeamDisplayNames(names: Record<TeamId, string>): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(names));
  } catch {}
  window.dispatchEvent(new CustomEvent("team-config-changed"));
}

/** Resets all display names back to defaults and notifies listeners. */
export function resetTeamDisplayNames(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent("team-config-changed"));
}
