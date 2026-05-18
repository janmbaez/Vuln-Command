import React, { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { LoginGate } from "@/components/LoginGate";
import { AuthProvider } from "@/context/AuthContext";
import { VulnerabilityProvider } from "@/context/VulnerabilityContext";
import { SyncProvider } from "@/context/SyncContext";
import NotFound from "@/pages/not-found";

// Lazy-load all pages — each page bundle is only fetched when first navigated to.
// Reduces initial JS payload by ~40-50%.
const Dashboard     = lazy(() => import("./pages/dashboard"));
const Vulnerabilities = lazy(() => import("./pages/vulnerabilities"));
const Metrics       = lazy(() => import("./pages/metrics"));
const Risk          = lazy(() => import("./pages/risk"));
const Remediation   = lazy(() => import("./pages/remediation"));
const Assets        = lazy(() => import("./pages/assets"));
const ImportPage    = lazy(() => import("./pages/import"));
const CtemPage      = lazy(() => import("./pages/ctem"));
const SLAPage       = lazy(() => import("./pages/sla"));
const TeamsPage       = lazy(() => import("./pages/teams"));
const CveIntelPage    = lazy(() => import("./pages/cve-intel"));
const CrowdStrikePage = lazy(() => import("./pages/crowdstrike"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
      <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Loading…
    </div>
  );
}

const queryClient = new QueryClient();

// ── Error boundary ────────────────────────────────────────────────────────────
// Wraps routes so a crash in one page can't unmount VulnerabilityProvider
// and wipe in-memory data.
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 p-8">
          <p className="text-destructive font-semibold text-lg">Something went wrong on this page.</p>
          <p className="text-sm text-muted-foreground font-mono bg-card border border-border rounded px-3 py-2 max-w-lg break-all">
            {this.state.error.message}
          </p>
          <p className="text-xs text-muted-foreground">Your data is safe. Click below to reload this page.</p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90"
            onClick={() => this.setState({ error: null })}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/vulnerabilities" component={Vulnerabilities} />
      <Route path="/metrics" component={Metrics} />
      <Route path="/risk" component={Risk} />
      <Route path="/remediation" component={Remediation} />
      <Route path="/assets" component={Assets} />
      <Route path="/import" component={ImportPage} />
      <Route path="/ctem" component={CtemPage} />
      <Route path="/sla" component={SLAPage} />
      <Route path="/teams"    component={TeamsPage} />
      <Route path="/cve-intel"    component={CveIntelPage} />
      <Route path="/crowdstrike"  component={CrowdStrikePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LoginGate>
          <VulnerabilityProvider>
            <SyncProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Layout>
                    <PageErrorBoundary>
                      <Suspense fallback={<PageLoader />}>
                        <Router />
                      </Suspense>
                    </PageErrorBoundary>
                  </Layout>
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </SyncProvider>
          </VulnerabilityProvider>
        </LoginGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
