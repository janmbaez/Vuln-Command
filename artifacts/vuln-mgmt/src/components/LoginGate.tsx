import React, { useMemo, useState } from "react";
import { Lock, Shield, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function formatLockout(until: number): string {
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
}

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { enabled, configured, authenticated, lockoutUntil, login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  React.useEffect(() => {
    if (!lockoutUntil) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1_000);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  const locked = !!lockoutUntil && lockoutUntil > Date.now();
  const lockLabel = useMemo(() => locked && lockoutUntil ? formatLockout(lockoutUntil) : "", [locked, lockoutUntil, tick]);

  if (!enabled || authenticated) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || locked) return;
    setLoading(true);
    setError(null);
    const result = await login(password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Login failed.");
      setPassword("");
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">VULN-COMMAND</h1>
            <p className="text-xs text-muted-foreground">Protected vulnerability dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Sign in</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the deployment password to continue.
            </p>
          </div>

          {!configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Login is enabled, but no password hash is configured. Set <code>VITE_AUTH_PASSWORD_HASH</code> before deploying.
              </span>
            </div>
          )}

          {(error || locked) && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{locked ? `Temporarily locked. Try again in ${lockLabel}.` : error}</span>
            </div>
          )}

          <div>
            <label htmlFor="deployment-password" className="text-xs font-medium text-muted-foreground block mb-1">
              Password
            </label>
            <input
              id="deployment-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={!configured || locked || loading}
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={!configured || !password || locked || loading}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          This static login gate protects against casual browsing only. Use private hosting or server-side authentication for sensitive data.
        </p>
      </div>
    </div>
  );
}
