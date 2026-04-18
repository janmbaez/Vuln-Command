import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Dashboard from "./pages/dashboard";
import Vulnerabilities from "./pages/vulnerabilities";
import Metrics from "./pages/metrics";
import Risk from "./pages/risk";
import Remediation from "./pages/remediation";
import Assets from "./pages/assets";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/vulnerabilities" component={Vulnerabilities} />
      <Route path="/metrics" component={Metrics} />
      <Route path="/risk" component={Risk} />
      <Route path="/remediation" component={Remediation} />
      <Route path="/assets" component={Assets} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
