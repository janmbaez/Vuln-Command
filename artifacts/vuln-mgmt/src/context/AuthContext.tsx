import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AUTH_SESSION_KEY = "vuln_command_auth_session_v1";
const AUTH_LOCK_KEY = "vuln_command_auth_lock_v1";
const AUTH_ACTIVITY_KEY = "vuln_command_auth_activity_v1";

const SHA256_HEX = /^[a-f0-9]{64}$/;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const SESSION_MINUTES = positiveInt(import.meta.env.VITE_AUTH_SESSION_MINUTES, 30);
const MAX_ATTEMPTS = positiveInt(import.meta.env.VITE_AUTH_MAX_ATTEMPTS, 5);
const LOCKOUT_MINUTES = positiveInt(import.meta.env.VITE_AUTH_LOCKOUT_MINUTES, 10);

interface AuthContextType {
  enabled: boolean;
  configured: boolean;
  authenticated: boolean;
  lockoutUntil: number | null;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

interface LockState {
  attempts: number;
  until: number | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

function authEnabled(): boolean {
  return import.meta.env.VITE_AUTH_ENABLED !== "false";
}

function expectedHash(): string {
  return (import.meta.env.VITE_AUTH_PASSWORD_HASH ?? "").toString().trim().toLowerCase();
}

function salt(): string {
  return (import.meta.env.VITE_AUTH_SALT ?? "vuln-command").toString();
}

function now(): number {
  return Date.now();
}

function sessionMs(): number {
  return Math.max(1, SESSION_MINUTES) * 60_000;
}

function lockoutMs(): number {
  return Math.max(1, LOCKOUT_MINUTES) * 60_000;
}

function readLock(): LockState {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_LOCK_KEY) ?? "{}") as Partial<LockState>;
    return { attempts: parsed.attempts ?? 0, until: parsed.until ?? null };
  } catch {
    return { attempts: 0, until: null };
  }
}

function writeLock(lock: LockState): void {
  try {
    localStorage.setItem(AUTH_LOCK_KEY, JSON.stringify(lock));
  } catch {}
}

function clearLock(): void {
  try {
    localStorage.removeItem(AUTH_LOCK_KEY);
  } catch {}
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sessionIsValid(): boolean {
  try {
    const session = sessionStorage.getItem(AUTH_SESSION_KEY);
    const activity = Number(sessionStorage.getItem(AUTH_ACTIVITY_KEY) ?? 0);
    return session === "authenticated" && Number.isFinite(activity) && now() - activity < sessionMs();
  } catch {
    return false;
  }
}

function markActivity(): void {
  try {
    sessionStorage.setItem(AUTH_ACTIVITY_KEY, String(now()));
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = authEnabled();
  const configured = !enabled || SHA256_HEX.test(expectedHash());
  const [authenticated, setAuthenticated] = useState(() => !enabled || sessionIsValid());
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const lock = readLock();
    return lock.until && lock.until > now() ? lock.until : null;
  });

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(AUTH_ACTIVITY_KEY);
    } catch {}
    setAuthenticated(!enabled);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !authenticated) return;
    const onActivity = () => markActivity();
    const interval = window.setInterval(() => {
      if (!sessionIsValid()) logout();
    }, 15_000);

    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("touchstart", onActivity);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [authenticated, enabled, logout]);

  const login = useCallback(async (password: string) => {
    if (!enabled) {
      setAuthenticated(true);
      return { ok: true };
    }
    if (!configured) {
      return { ok: false, error: "Login is enabled but VITE_AUTH_PASSWORD_HASH is not configured." };
    }

    const currentLock = readLock();
    if (currentLock.until && currentLock.until > now()) {
      setLockoutUntil(currentLock.until);
      return { ok: false, error: "Too many attempts. Try again after the lockout expires." };
    }

    let candidate = "";
    try {
      candidate = await sha256Hex(`${salt()}:${password}`);
    } catch {
      return { ok: false, error: "Secure password verification is not available in this browser context." };
    }
    if (safeEqual(candidate, expectedHash())) {
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, "authenticated");
        markActivity();
      } catch {}
      clearLock();
      setLockoutUntil(null);
      setAuthenticated(true);
      return { ok: true };
    }

    const attempts = currentLock.until && currentLock.until <= now() ? 1 : currentLock.attempts + 1;
    const until = attempts >= MAX_ATTEMPTS ? now() + lockoutMs() : null;
    writeLock({ attempts, until });
    setLockoutUntil(until);
    return {
      ok: false,
      error: until
        ? "Too many failed attempts. Login is temporarily locked."
        : "Invalid password.",
    };
  }, [configured, enabled]);

  const value = useMemo<AuthContextType>(() => ({
    enabled,
    configured,
    authenticated,
    lockoutUntil,
    login,
    logout,
  }), [authenticated, configured, enabled, lockoutUntil, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
