import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import type { Severity } from "@/data/vulnerabilities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Clock, CheckCircle2, Bell, ShieldAlert, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, FileDown, Presentation, FileText, Settings, RotateCcw, X } from "lucide-react";
import type { SlaReportData } from "@/lib/generateSlaReport";
import { getSlaConfig, setSlaConfig, resetSlaConfig, SLA_CONFIG_DEFAULTS } from "@/lib/slaConfig";
import { downloadCsv } from "@/lib/csv";

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_ORDER: Severity[] = ["Critical", "High", "Medium", "Low"];
const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];
type StatusFilter = "All" | "Breached" | "At Risk" | "Compliant";
type SortKey = "cveId" | "asset" | "severity" | "daysOpen" | "daysLeft";
type SortDir = "asc" | "desc";

const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const SEV_STYLE: Record<string, { badge: string; bar: string; text: string; ring: string }> = {
  Critical: {
    badge: "bg-red-500/15 text-red-400 border border-red-500/30",
    bar:   "bg-red-500",
    text:  "text-red-400",
    ring:  "ring-red-500/40 hover:ring-red-500/70",
  },
  High: {
    badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    bar:   "bg-orange-400",
    text:  "text-orange-400",
    ring:  "ring-orange-500/40 hover:ring-orange-500/70",
  },
  Medium: {
    badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    bar:   "bg-yellow-400",
    text:  "text-yellow-400",
    ring:  "ring-yellow-500/40 hover:ring-yellow-500/70",
  },
  Low: {
    badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    bar:   "bg-blue-400",
    text:  "text-blue-400",
    ring:  "ring-blue-500/40 hover:ring-blue-500/70",
  },
};

function urgencyLabel(daysOverdue: number) {
  if (daysOverdue >= 60) return { label: "Critical", cls: "bg-red-500/15 text-red-400 border border-red-500/30" };
  if (daysOverdue >= 30) return { label: "High",     cls: "bg-orange-500/15 text-orange-400 border border-orange-500/30" };
  if (daysOverdue >= 7)  return { label: "Medium",   cls: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" };
  return                        { label: "Low",      cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" };
}

function isoDateOnly(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

function fallbackStartFromDaysOpen(daysOpen: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, Number.isFinite(daysOpen) ? daysOpen : 0));
  return isoDateOnly(d);
}

function daysSince(start: string | undefined, fallbackDaysOpen: number): number {
  if (!start) return Math.max(0, fallbackDaysOpen);
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return Math.max(0, fallbackDaysOpen);
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichedVuln = {
  id: string; cveId: string; asset: string; assetType: string; severity: string; status: string;
  daysOpen: number; limit: number; daysLeft: number;
  breached: boolean; atRisk: boolean; slaUsedPct: number;
  originalOpenDate: string; effectiveSlaStart: string;
  reopenCount: number; lastReopenDate?: string;
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function SLAWatchlist() {
  const { vulnerabilities } = useVulnerabilities();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("All");
  const [sevFilter,     setSevFilter]     = useState<"All" | string>("All");
  const [search,        setSearch]        = useState("");
  const [sortKey,       setSortKey]       = useState<SortKey>("daysLeft");
  const [sortDir,       setSortDir]       = useState<SortDir>("asc");
  const [page,          setPage]          = useState(1);
  const [pageSize,      setPageSize]      = useState<PageSize>(25);
  const [exporting,       setExporting]       = useState<"pdf" | "pptx" | "csv" | null>(null);
  const [configOpen,      setConfigOpen]      = useState(false);
  const [configVersion,   setConfigVersion]   = useState(0); // bumped on sla-config-changed
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("All");

  // Holds the latest filtered list so handleExportCsv (defined before filtered) can access it
  const filteredRef = useRef<EnrichedVuln[]>([]);

  // Re-render whenever config changes
  useEffect(() => {
    const handler = () => setConfigVersion(v => v + 1);
    window.addEventListener("sla-config-changed", handler);
    return () => window.removeEventListener("sla-config-changed", handler);
  }, []);

  // ── Single-pass enrichment + stats ───────────────────────────────────────
  // One iteration over vulnerabilities produces everything we need.
  const { enriched, sevStats, totalBreached, totalAtRisk, openCount, slaRec, atRiskWindow, assetTypes } = useMemo(() => {
    const cfg          = getSlaConfig();
    const slaRec       = cfg.days as Record<string, number>;
    const atRiskWindow = cfg.atRiskWindowDays;

    const buckets: Record<string, { total: number; breached: number; atRisk: number; compliant: number }> = {};
    for (const sev of SEV_ORDER) buckets[sev] = { total: 0, breached: 0, atRisk: 0, compliant: 0 };

    let breachedCount = 0;
    let atRiskCount   = 0;
    let openCnt       = 0;

    const list: EnrichedVuln[] = [];

    for (const v of vulnerabilities) {
      if (v.status === "Resolved" || v.status === "Risk Accepted") continue;
      openCnt++;

      const effectiveSlaStart = v.effectiveSlaStart ?? v.originalOpenDate ?? fallbackStartFromDaysOpen(v.daysOpen);
      const originalOpenDate = v.originalOpenDate ?? effectiveSlaStart;
      const daysOpen = daysSince(effectiveSlaStart, v.daysOpen);
      const limit      = slaRec[v.severity] ?? 180;
      const daysLeft   = limit - daysOpen;
      const breached   = daysLeft < 0;
      const atRisk     = !breached && daysLeft <= atRiskWindow;
      const slaUsedPct = Math.min(100, Math.round((daysOpen / limit) * 100));

      const b = buckets[v.severity];
      if (b) {
        b.total++;
        if (breached)      b.breached++;
        else if (atRisk)   b.atRisk++;
        else               b.compliant++;
      }

      if (breached) breachedCount++;
      else if (atRisk) atRiskCount++;

      list.push({
        id: v.id, cveId: v.cveId, asset: v.asset, assetType: v.assetType,
        severity: v.severity, status: v.status,
        daysOpen, limit, daysLeft, breached, atRisk, slaUsedPct,
        originalOpenDate, effectiveSlaStart,
        reopenCount: v.reopenCount ?? 0,
        lastReopenDate: v.lastReopenDate,
      });
    }

    const stats = SEV_ORDER.map(sev => {
      const b = buckets[sev];
      const rate = b.total > 0 ? Math.round(((b.total - b.breached) / b.total) * 100) : 100;
      return { sev, limit: slaRec[sev] ?? 180, ...b, rate };
    });

    // Collect unique asset types present in the data
    const assetTypeSet = new Set(list.map(v => v.assetType));
    const assetTypes = Array.from(assetTypeSet).sort();

    return {
      enriched:      list,
      sevStats:      stats,
      totalBreached: breachedCount,
      totalAtRisk:   atRiskCount,
      openCount:     openCnt,
      slaRec,
      atRiskWindow,
      assetTypes,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vulnerabilities, configVersion]);

  // Overall compliance rate
  const overallRate = openCount > 0
    ? Math.round(((openCount - totalBreached) / openCount) * 100)
    : 100;

  // ── Export helpers ────────────────────────────────────────────────────────

  /** Build the report data object from current computed state */
  const buildReportData = useCallback((): SlaReportData => {
    const now = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const breachedSorted = [...enriched]
      .filter(v => v.breached)
      .sort((a, b) => a.daysLeft - b.daysLeft); // most overdue first
    const atRiskSorted = [...enriched]
      .filter(v => v.atRisk)
      .sort((a, b) => a.daysLeft - b.daysLeft); // soonest expiring first
    return {
      generatedAt:   now,
      overallRate,
      openCount,
      totalBreached,
      totalAtRisk,
      sevStats,
      breachedVulns: breachedSorted,
      atRiskVulns:   atRiskSorted,
    };
  }, [enriched, overallRate, openCount, totalBreached, totalAtRisk, sevStats]);

  const handleExportPdf = useCallback(async () => {
    setExporting("pdf");
    try {
      const { generateSlaPdf } = await import("@/lib/generateSlaReport");
      generateSlaPdf(buildReportData());
    } finally {
      setExporting(null);
    }
  }, [buildReportData]);

  const handleExportPptx = useCallback(async () => {
    setExporting("pptx");
    try {
      const { generateSlaPptx } = await import("@/lib/generateSlaReport");
      await generateSlaPptx(buildReportData());
    } finally {
      setExporting(null);
    }
  }, [buildReportData]);

  const handleExportCsv = useCallback(() => {
    setExporting("csv");
    try {
      // Use the ref so we always export exactly what is currently visible in the table
      const data = filteredRef.current;
      const rows: unknown[][] = [[
        "CVE ID", "Asset", "Asset Type", "Severity", "Status", "Original Open Date",
        "Effective SLA Start", "Reopen Count", "Last Reopen Date", "Days Open",
        "SLA Limit (days)", "Days Left / Overdue", "SLA Used %", "Breached", "At Risk", "Urgency",
      ]];
      rows.push(...[...data]
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .map(v => {
          const overdue = v.breached ? Math.abs(v.daysLeft) : 0;
          const urgency = v.breached ? (overdue >= 60 ? "Critical" : overdue >= 30 ? "High" : overdue >= 7 ? "Medium" : "Low")
                        : v.atRisk   ? "At Risk"
                        : "OK";
          return [
            v.cveId,
            v.asset,
            v.assetType,
            v.severity,
            v.status,
            v.originalOpenDate,
            v.effectiveSlaStart,
            v.reopenCount,
            v.lastReopenDate ?? "",
            v.daysOpen,
            v.limit,
            v.breached ? `+${overdue}` : v.daysLeft,
            v.slaUsedPct,
            v.breached ? "Yes" : "No",
            v.atRisk   ? "Yes" : "No",
            urgency,
          ];
        }));
      // Include active filter in filename so exported files are self-describing
      const filterSuffix = assetTypeFilter !== "All" ? `_${assetTypeFilter.replace(/\s+/g, "_")}` : "";
      downloadCsv(`SLA_Watchlist${filterSuffix}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally {
      setExporting(null);
    }
  // filteredRef is a ref — no dep needed; assetTypeFilter is for the filename only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTypeFilter]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortDir("asc"); }
      return key;
    });
    setPage(1);
  }, []);

  // ── Severity card click: quick-filter ─────────────────────────────────────
  const handleSevCard = useCallback((sev: string) => {
    setSevFilter(prev => prev === sev ? "All" : sev);
    setStatusFilter("All");
    setPage(1);
  }, []);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enriched
      .filter(v => {
        if (statusFilter === "Breached"  && !v.breached)              return false;
        if (statusFilter === "At Risk"   && !v.atRisk)                return false;
        if (statusFilter === "Compliant" && (v.breached || v.atRisk)) return false;
        if (sevFilter !== "All"          && v.severity !== sevFilter)  return false;
        if (assetTypeFilter !== "All"    && v.assetType !== assetTypeFilter) return false;
        if (q && !v.cveId.toLowerCase().includes(q) && !v.asset.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "cveId":     cmp = a.cveId.localeCompare(b.cveId); break;
          case "asset":     cmp = a.asset.localeCompare(b.asset); break;
          case "severity":  cmp = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0); break;
          case "daysOpen":  cmp = a.daysOpen - b.daysOpen; break;
          case "daysLeft":  cmp = a.daysLeft - b.daysLeft; break; // most overdue first by default
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [enriched, statusFilter, sevFilter, assetTypeFilter, search, sortKey, sortDir]);

  // Keep ref in sync so handleExportCsv always sees the latest filtered list
  filteredRef.current = filtered;

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageSlice  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Reset page when filters change
  const setStatusFilterAndReset = useCallback((f: StatusFilter) => { setStatusFilter(f); setPage(1); }, []);
  const setSevFilterAndReset    = useCallback((s: string)       => { setSevFilter(s);    setPage(1); }, []);

  // ── Sort icon helper ──────────────────────────────────────────────────────
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground/50 inline" />;
    return sortDir === "asc"
      ? <ChevronUp   className="h-3 w-3 ml-1 text-primary inline" />
      : <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />;
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (vulnerabilities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mb-3 text-green-400" />
        <p className="text-sm font-medium">No vulnerability data yet.</p>
        <p className="text-xs mt-1">Import vulnerabilities to track SLA compliance.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Overall SLA Compliance"
          value={`${overallRate}%`}
          sub={overallRate >= 90 ? "On track ✓" : overallRate >= 80 ? "Needs attention" : "Below target"}
          subCls={overallRate >= 90 ? "text-green-400" : overallRate >= 80 ? "text-yellow-400" : "text-red-400"}
          iconCls="text-primary"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="SLA Breaches"
          value={String(totalBreached)}
          sub={`of ${openCount} open vulnerabilities`}
          subCls={totalBreached === 0 ? "text-green-400" : "text-red-400"}
          iconCls="text-red-400"
          onClick={() => { setStatusFilterAndReset("Breached"); setSevFilter("All"); }}
          active={statusFilter === "Breached" && sevFilter === "All"}
        />
        <KpiCard
          icon={<Bell className="h-5 w-5" />}
          label="Expiring Within 7 Days"
          value={String(totalAtRisk)}
          sub="approaching SLA deadline"
          subCls={totalAtRisk === 0 ? "text-green-400" : "text-yellow-400"}
          iconCls="text-yellow-400"
          onClick={() => { setStatusFilterAndReset("At Risk"); setSevFilter("All"); }}
          active={statusFilter === "At Risk" && sevFilter === "All"}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Compliant Open Vulns"
          value={String(openCount - totalBreached - totalAtRisk)}
          sub="well within SLA window"
          subCls="text-green-400"
          iconCls="text-green-400"
          onClick={() => { setStatusFilterAndReset("Compliant"); setSevFilter("All"); }}
          active={statusFilter === "Compliant" && sevFilter === "All"}
        />
      </div>

      {/* ── Clickable per-severity cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sevStats.map(s => {
          const st = SEV_STYLE[s.sev] ?? SEV_STYLE.Low;
          const isActive = sevFilter === s.sev;
          return (
            <button
              key={s.sev}
              onClick={() => handleSevCard(s.sev)}
              className={`rounded-lg border bg-card px-4 py-3 space-y-2 text-left transition-all ring-2 ${
                isActive
                  ? `border-transparent ${st.ring} ring-offset-0`
                  : `border-border ring-transparent ${st.ring}`
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>
                  {s.sev}
                </span>
                <span className="text-xs text-muted-foreground">{s.limit}d SLA</span>
              </div>
              <div className="flex items-end justify-between">
                <span className={`text-2xl font-bold ${st.text}`}>{s.rate}%</span>
                <span className="text-xs text-muted-foreground text-right leading-tight">
                  {s.breached} breach{s.breached !== 1 ? "es" : ""}<br />
                  {s.atRisk} at risk
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${st.bar}`} style={{ width: `${s.rate}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{s.total} total open</div>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar: search + status filters + page size ─────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-shrink-0">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search CVE or asset…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
          />
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Status filter chips */}
        {(["All", "Breached", "At Risk", "Compliant"] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilterAndReset(f)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              statusFilter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {f}
            {f === "Breached" && totalBreached > 0 && (
              <span className="ml-1.5 bg-red-500/20 text-red-400 px-1.5 rounded-full text-[10px] font-bold">
                {totalBreached}
              </span>
            )}
            {f === "At Risk" && totalAtRisk > 0 && (
              <span className="ml-1.5 bg-yellow-500/20 text-yellow-400 px-1.5 rounded-full text-[10px] font-bold">
                {totalAtRisk}
              </span>
            )}
          </button>
        ))}

        {/* Asset type filter chips — always visible when data has any typed assets */}
        {assetTypes.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            {/* "All" reset chip */}
            <button
              onClick={() => { setAssetTypeFilter("All"); setPage(1); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                assetTypeFilter === "All"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              All types
            </button>
            {assetTypes.map(at => (
              <button
                key={at}
                onClick={() => { setAssetTypeFilter(p => p === at ? "All" : at); setPage(1); }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  assetTypeFilter === at
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {at}
              </button>
            ))}
          </>
        )}

        {/* Active severity pill */}
        {sevFilter !== "All" && (
          <>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => setSevFilterAndReset("All")}
              className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 ${SEV_STYLE[sevFilter]?.badge ?? ""}`}
            >
              {sevFilter} <span className="opacity-60">×</span>
            </button>
          </>
        )}

        {/* Right side: count + page size + exports + config */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value) as PageSize); setPage(1); }}
            className="text-xs rounded-md border border-border bg-muted/40 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>

          <div className="h-4 w-px bg-border" />

          {/* Export buttons */}
          <div className="flex items-center gap-1">
            <ExportBtn
              icon={<FileText className="h-3.5 w-3.5" />}
              label="PDF"
              loading={exporting === "pdf"}
              onClick={handleExportPdf}
              colorCls="hover:border-red-500/50 hover:text-red-400"
            />
            <ExportBtn
              icon={<Presentation className="h-3.5 w-3.5" />}
              label="PPT"
              loading={exporting === "pptx"}
              onClick={handleExportPptx}
              colorCls="hover:border-orange-500/50 hover:text-orange-400"
            />
            <ExportBtn
              icon={<FileDown className="h-3.5 w-3.5" />}
              label="CSV"
              loading={exporting === "csv"}
              onClick={handleExportCsv}
              colorCls="hover:border-green-500/50 hover:text-green-400"
            />
          </div>

          <div className="h-4 w-px bg-border" />

          {/* SLA Config button */}
          <button
            onClick={() => setConfigOpen(true)}
            title="Configure SLA Rules"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            SLA Rules
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[140px] cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("cveId")}
              >
                CVE ID <SortIcon col="cveId" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("asset")}
              >
                Asset <SortIcon col="asset" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("severity")}
              >
                Severity <SortIcon col="severity" />
              </TableHead>
              <TableHead className="text-center w-[80px]">SLA</TableHead>
              <TableHead
                className="text-center w-[90px] cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("daysOpen")}
              >
                Days Open <SortIcon col="daysOpen" />
              </TableHead>
              <TableHead className="text-center w-[110px]">SLA Start</TableHead>
              <TableHead className="text-center w-[110px]">Original Open</TableHead>
              <TableHead className="text-center w-[90px]">Reopen #</TableHead>
              <TableHead className="text-center w-[110px]">Last Reopen</TableHead>
              <TableHead className="w-[140px]">SLA Usage</TableHead>
              <TableHead
                className="text-center cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("daysLeft")}
              >
                Days Left / Overdue <SortIcon col="daysLeft" />
              </TableHead>
              <TableHead className="text-center w-[100px]">Urgency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageSlice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-10 text-muted-foreground text-sm">
                  No vulnerabilities match the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              pageSlice.map(v => {
                const overdue = v.breached ? Math.abs(v.daysLeft) : 0;
                const urg     = v.breached ? urgencyLabel(overdue) : null;
                const st      = SEV_STYLE[v.severity] ?? SEV_STYLE.Low;

                // Bar color: green→yellow→orange→red based on % used
                const barCls = v.slaUsedPct >= 100
                  ? "bg-red-500"
                  : v.slaUsedPct >= 85
                  ? "bg-orange-400"
                  : v.slaUsedPct >= 60
                  ? "bg-yellow-400"
                  : "bg-green-500";

                return (
                  <TableRow
                    key={v.id}
                    className={v.breached ? "bg-red-500/5" : v.atRisk ? "bg-yellow-500/5" : ""}
                  >
                    {/* CVE */}
                    <TableCell className="font-mono text-xs font-medium" title={v.cveId}>
                      {v.cveId.length > 20 ? v.cveId.slice(0, 20) + "…" : v.cveId}
                    </TableCell>

                    {/* Asset */}
                    <TableCell className="text-sm max-w-[180px] truncate" title={v.asset}>
                      {v.asset}
                    </TableCell>

                    {/* Severity badge */}
                    <TableCell>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>
                        {v.severity}
                      </span>
                    </TableCell>

                    {/* SLA limit */}
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {v.limit}d
                    </TableCell>

                    {/* Days open */}
                    <TableCell className="text-center text-sm font-semibold">
                      {v.daysOpen}
                    </TableCell>

                    {/* SLA audit dates */}
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {v.effectiveSlaStart}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {v.originalOpenDate}
                    </TableCell>
                    <TableCell className="text-center text-xs font-semibold">
                      {v.reopenCount}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {v.lastReopenDate ?? "—"}
                    </TableCell>

                    {/* SLA usage mini progress bar */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barCls}`}
                            style={{ width: `${Math.min(100, v.slaUsedPct)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium w-8 text-right ${
                          v.slaUsedPct >= 100 ? "text-red-400" :
                          v.slaUsedPct >= 85  ? "text-orange-400" :
                          v.slaUsedPct >= 60  ? "text-yellow-400" : "text-green-400"
                        }`}>
                          {Math.min(v.slaUsedPct, 999)}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Days left / overdue */}
                    <TableCell className="text-center">
                      {v.breached ? (
                        <span className="text-red-400 font-bold text-sm inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          +{overdue}d overdue
                        </span>
                      ) : v.atRisk ? (
                        <span className="text-yellow-400 font-semibold text-sm inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {v.daysLeft}d left
                        </span>
                      ) : (
                        <span className="text-green-400 text-sm">{v.daysLeft}d left</span>
                      )}
                    </TableCell>

                    {/* Urgency badge */}
                    <TableCell className="text-center">
                      {v.breached && urg ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urg.cls}`}>
                          {urg.label}
                        </span>
                      ) : v.atRisk ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                          At Risk
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> OK
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage(1)}         disabled={safePage === 1}>«</PageBtn>
            <PageBtn onClick={() => setPage(p => p - 1)} disabled={safePage === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </PageBtn>
            {/* Page number pills — show up to 5 around current */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 py-1">…</span>
                ) : (
                  <PageBtn key={p} onClick={() => setPage(p as number)} active={p === safePage}>
                    {p}
                  </PageBtn>
                )
              )}
            <PageBtn onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </PageBtn>
            <PageBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</PageBtn>
          </div>
          <span>Page {safePage} of {totalPages}</span>
        </div>
      )}

      {/* ── SLA reference legend ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            SLA Remediation Windows
          </p>
          <span className="text-xs text-muted-foreground">
            At-risk warning: <strong className="text-foreground">{atRiskWindow}d</strong> before deadline
          </span>
        </div>
        <div className="flex flex-wrap gap-4">
          {SEV_ORDER.map(sev => (
            <div key={sev} className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEV_STYLE[sev].badge}`}>
                {sev}
              </span>
              <span className="text-xs text-muted-foreground">
                must be resolved within{" "}
                <strong className="text-foreground">{slaRec[sev] ?? 180} days</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── SLA Config Modal ─────────────────────────────────────────────────── */}
      {configOpen && (
        <SlaConfigModal onClose={() => setConfigOpen(false)} />
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, subCls, iconCls, onClick, active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  subCls: string;
  iconCls: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => e.key === "Enter" && onClick() : undefined}
      className={`rounded-lg border bg-card px-4 py-3 transition-all ${
        onClick ? "cursor-pointer hover:border-primary/40" : ""
      } ${active ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
    >
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={iconCls}>{icon}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className={`text-xs font-medium mt-1 ${subCls}`}>{sub}</p>
    </div>
  );
}

function PageBtn({
  children, onClick, disabled, active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[28px] h-7 px-1.5 rounded text-xs flex items-center justify-center transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : disabled
          ? "opacity-30 cursor-not-allowed"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ExportBtn({
  icon, label, loading, onClick, colorCls,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
  colorCls: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={`Export ${label}`}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground transition-colors ${
        loading ? "opacity-50 cursor-wait" : `cursor-pointer ${colorCls}`
      }`}
    >
      {loading
        ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        : icon}
      {label}
    </button>
  );
}

// ── SLA Config Modal ──────────────────────────────────────────────────────────

function SlaConfigModal({ onClose }: { onClose: () => void }) {
  const current = getSlaConfig();

  const [days, setDays] = useState({
    Critical: current.days.Critical,
    High:     current.days.High,
    Medium:   current.days.Medium,
    Low:      current.days.Low,
  });
  const [atRiskWindow, setAtRiskWindow] = useState(current.atRiskWindowDays);
  const [saved, setSaved] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    setSlaConfig({ days, atRiskWindowDays: atRiskWindow });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const handleReset = () => {
    resetSlaConfig();
    setDays({ ...SLA_CONFIG_DEFAULTS.days });
    setAtRiskWindow(SLA_CONFIG_DEFAULTS.atRiskWindowDays);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const isDefault =
    days.Critical === SLA_CONFIG_DEFAULTS.days.Critical &&
    days.High     === SLA_CONFIG_DEFAULTS.days.High &&
    days.Medium   === SLA_CONFIG_DEFAULTS.days.Medium &&
    days.Low      === SLA_CONFIG_DEFAULTS.days.Low &&
    atRiskWindow  === SLA_CONFIG_DEFAULTS.atRiskWindowDays;

  const SEV_DESCRIPTIONS: Record<string, string> = {
    Critical: "Actively exploitable, immediate business impact",
    High:     "High likelihood of exploitation, significant risk",
    Medium:   "Moderate risk, exploitable with conditions",
    Low:      "Minimal impact, low exploitation likelihood",
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Configure SLA Rules</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-xs text-muted-foreground">
            Set the maximum number of days allowed to remediate each severity level. Changes apply immediately across all views.
          </p>

          {/* Severity SLA inputs */}
          <div className="space-y-3">
            {SEV_ORDER.map(sev => {
              const st = SEV_STYLE[sev];
              return (
                <div key={sev} className="flex items-center gap-4">
                  <div className="w-24 shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>
                      {sev}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground leading-snug">
                      {SEV_DESCRIPTIONS[sev]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={days[sev]}
                      onChange={e => setDays(prev => ({ ...prev, [sev]: Math.max(1, Math.min(365, Number(e.target.value))) }))}
                      className="w-16 text-xs text-center rounded-md border border-border bg-muted/40 text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* At-risk warning window */}
          <div className="flex items-center gap-4">
            <div className="w-24 shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                At-Risk
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground leading-snug">
                Flag as "at risk" when fewer than this many days remain before SLA breach
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={1}
                max={30}
                value={atRiskWindow}
                onChange={e => setAtRiskWindow(Math.max(1, Math.min(30, Number(e.target.value))))}
                className="w-16 text-xs text-center rounded-md border border-border bg-muted/40 text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>

          {/* Info note */}
          {!isDefault && (
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <Settings className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                You have <span className="text-foreground font-medium">customised</span> SLA rules.
                Click <em>Reset to Defaults</em> to restore the original thresholds.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={handleReset}
            disabled={isDefault}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-70"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved!
                </>
              ) : "Save Rules"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
