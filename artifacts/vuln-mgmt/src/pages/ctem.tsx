import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { SLA_DAYS } from "@/context/VulnerabilityContext";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid,
} from "recharts";
import {
  Shield, Search, Target, Zap, Users, ChevronRight, Info,
  Download, FileText, Presentation, FileBarChart2,
} from "lucide-react";
// Type-only import — the actual jsPDF/PptxGenJS code is dynamically imported
// inside handleGenerateReport so the ~600 KB bundle only loads when the user
// clicks "Generate Report", not when the CTEM page first renders.
import type { CtemReportData } from "@/lib/generateCtemReport";

const EMPTY_DATA_SCORES: Record<string, number> = {
  scoping:        1,
  discovery:      1,
  prioritization: 1,
  validation:     1,
  mobilization:   1,
};

// ── Strategic roadmap items ───────────────────────────────────────────────────
const ROADMAP_ITEMS = [
  {
    quarter:    "Q2 2026",
    initiative: "Exploit-Based Prioritization",
    pillar:     "prioritization",
    effort:     "High",
    impact:     "Critical",
    phase:      "Immediate",
    detail:     "Deploy ExPRT ratings from CrowdStrike Falcon; stop relying on CVSS alone. Map top-100 CVEs to business-critical assets.",
  },
  {
    quarter:    "Q2 2026",
    initiative: "SLA Breach Automation",
    pillar:     "mobilization",
    effort:     "Medium",
    impact:     "High",
    phase:      "Immediate",
    detail:     "Auto-escalate SLA breaches to team leads via Jira/ServiceNow. Define tier-based ownership with RACI.",
  },
  {
    quarter:    "Q3 2026",
    initiative: "Continuous Control Validation",
    pillar:     "validation",
    effort:     "High",
    impact:     "High",
    phase:      "Near-Term",
    detail:     "Implement breach-and-attack simulation. Add quarterly red-team exercises targeting Priority 1 assets.",
  },
  {
    quarter:    "Q3 2026",
    initiative: "Cloud Asset Discovery",
    pillar:     "scoping",
    effort:     "Medium",
    impact:     "Medium",
    phase:      "Near-Term",
    detail:     "Deploy CSPM tooling for AWS/Azure; auto-tag all cloud resources and feed into vulnerability scanner.",
  },
  {
    quarter:    "Q4 2026",
    initiative: "Agent-Based Daily Scanning",
    pillar:     "discovery",
    effort:     "High",
    impact:     "High",
    phase:      "Strategic",
    detail:     "Roll out sensor agents to all Tier-1 assets for real-time detection; reduce scan latency from 7d to <24h.",
  },
] as const;

const PHASE_COLORS: Record<string, string> = {
  "Immediate": "bg-red-500/15 border-red-500/40 text-red-400",
  "Near-Term": "bg-amber-500/15 border-amber-500/40 text-amber-400",
  "Strategic": "bg-blue-500/15 border-blue-500/40 text-blue-400",
};
const EFFORT_COLORS: Record<string, string> = {
  High:   "text-red-400",
  Medium: "text-amber-400",
  Low:    "text-green-400",
};
const IMPACT_COLORS: Record<string, string> = {
  Critical: "text-red-400",
  High:     "text-orange-400",
  Medium:   "text-amber-400",
  Low:      "text-green-400",
};

// ── Pillar metadata ───────────────────────────────────────────────────────────
const PILLAR_META = [
  {
    key: "scoping",
    label: "Scoping",
    icon: Target,
    color: "#6366f1",
    description: "Define and continuously update the scope of your attack surface, including all assets, identities, and data flows.",
    levels: [
      "Ad hoc: No formal asset inventory. Scope defined reactively.",
      "Developing: Basic asset inventory exists. Manual updates quarterly.",
      "Defined: Comprehensive CMDB with automated discovery. Updated monthly.",
      "Managed: Real-time asset inventory with risk classification and ownership.",
      "Optimizing: Dynamic attack surface map with continuous external exposure monitoring.",
    ],
    recommendations: [
      "Establish a complete CMDB covering all servers, endpoints, cloud, and network devices",
      "Integrate CrowdStrike Falcon Discover for automated asset discovery",
      "Define asset criticality tiers aligned to business function",
      "Extend scope to include third-party and supply chain attack surface",
    ],
  },
  {
    key: "discovery",
    label: "Discovery",
    icon: Search,
    color: "#f59e0b",
    description: "Continuously identify vulnerabilities, misconfigurations, and exposures across the full attack surface.",
    levels: [
      "Ad hoc: Irregular scanning, many blind spots, no coverage tracking.",
      "Developing: Periodic scans (monthly). Basic coverage of critical assets.",
      "Defined: Weekly scanning with SLA on remediation. Coverage metrics tracked.",
      "Managed: Continuous scanning with near-real-time detection. Agent-based coverage >95%.",
      "Optimizing: AI-driven discovery with automatic prioritization and business context.",
    ],
    recommendations: [
      "Deploy CrowdStrike Falcon Spotlight agents on all endpoints and servers",
      "Achieve >95% scan coverage across all asset categories",
      "Implement authenticated scanning for deeper vulnerability detection",
      "Add external attack surface management (EASM) for internet-facing assets",
    ],
  },
  {
    key: "prioritization",
    label: "Prioritization",
    icon: Zap,
    color: "#ef4444",
    description: "Use threat intelligence and business context to prioritize exposures that pose the greatest actual risk.",
    levels: [
      "Ad hoc: CVSS score only. No threat intel or business context applied.",
      "Developing: Severity + patch availability considered. High/Critical prioritized.",
      "Defined: Exploit status (ExPRT) used. SLA enforced by severity tier.",
      "Managed: Threat intel correlated with asset criticality and active exploitation data.",
      "Optimizing: AI-driven risk scoring with real-time threat feed integration and EPSS scores.",
    ],
    recommendations: [
      "Apply ExPRT ratings alongside severity for true risk-based ordering",
      "Enforce SLA: 30 days for Critical, 60 days for High vulnerabilities",
      "Correlate with CISA KEV (Known Exploited Vulnerabilities) catalog",
      "Factor in asset business value and exposure level for final prioritization",
    ],
  },
  {
    key: "validation",
    label: "Validation",
    icon: Shield,
    color: "#10b981",
    description: "Test and confirm which exposures are actually exploitable in your environment to avoid wasted remediation effort.",
    levels: [
      "Ad hoc: No validation. All vulnerabilities treated equally.",
      "Developing: Manual pen testing annually. Limited scope.",
      "Defined: Automated exploit validation on critical findings. BAS annually.",
      "Managed: Continuous breach and attack simulation. Compensating controls verified.",
      "Optimizing: Automated adversary emulation with real-time compensating control validation.",
    ],
    recommendations: [
      "Prioritize 'Actively used (critical)' exploit status CVEs for immediate validation",
      "Deploy breach and attack simulation (BAS) tools quarterly",
      "Test compensating controls against critical CVEs before accepting risk",
      "Integrate validation results into remediation priority workflow",
    ],
  },
  {
    key: "mobilization",
    label: "Mobilization",
    icon: Users,
    color: "#3b82f6",
    description: "Ensure that prioritized findings translate into timely, tracked remediation actions across teams.",
    levels: [
      "Ad hoc: Remediation handled informally via email. No tracking.",
      "Developing: Ticket-based tracking. Manual assignment per team.",
      "Defined: ITSM integration. SLA tracked. Monthly reporting to leadership.",
      "Managed: Automated ticket creation with owner assignment. Dashboard-driven accountability.",
      "Optimizing: Full SOAR integration. Predictive remediation capacity planning. Exec reporting automated.",
    ],
    recommendations: [
      "Integrate vulnerability findings with your ITSM (ServiceNow, Jira) automatically",
      "Assign remediation ownership per asset team with SLA accountability",
      "Report SLA compliance to leadership weekly on Critical/High items",
      "Automate patch deployment workflows for known-good patches",
    ],
  },
];

const MATURITY_LABELS = ["", "Initial", "Developing", "Defined", "Managed", "Optimizing"];
const MATURITY_COLORS = ["", "#6b7280", "#f59e0b", "#3b82f6", "#10b981", "#6366f1"];
const MATURITY_BG = [
  "",
  "bg-gray-500/10 border-gray-500/30 text-gray-400",
  "bg-amber-500/10 border-amber-500/30 text-amber-400",
  "bg-blue-500/10 border-blue-500/30 text-blue-400",
  "bg-green-500/10 border-green-500/30 text-green-400",
  "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
];

function computeDataDrivenScores(vulns: ReturnType<typeof useVulnerabilities>["vulnerabilities"]) {
  const total = vulns.length;
  if (total === 0) return null;

  const open = vulns.filter(v => v.status !== "Resolved" && v.status !== "Risk Accepted");
  const resolved = vulns.filter(v => v.status === "Resolved");

  // Scoping: unique asset count diversity
  const uniqueAssets = new Set(vulns.map(v => v.asset)).size;
  const scoping = uniqueAssets >= 50 ? 4 : uniqueAssets >= 20 ? 3 : 2;

  // Discovery: coverage proxy — if we have all severity tiers represented
  const tierCount = ["Critical", "High", "Medium", "Low"].filter(s => vulns.some(v => v.severity === s)).length;
  const discovery = tierCount === 4 ? 3 : tierCount === 3 ? 3 : 2;

  // Prioritization: % using exploit-status-based scoring
  const withExploit = vulns.filter(v => v.exploitStatus && v.exploitStatus !== "Unproven");
  const exploitPct = withExploit.length / total;
  const prioritization = exploitPct >= 0.7 ? 3 : exploitPct >= 0.4 ? 2 : 2;

  // Validation: SLA compliance for Critical + High
  const critHigh = open.filter(v => v.severity === "Critical" || v.severity === "High");
  const withinSLA = critHigh.filter(v => v.daysOpen <= SLA_DAYS[v.severity]).length;
  const slaPct = critHigh.length > 0 ? withinSLA / critHigh.length : 1;
  const validation = slaPct >= 0.85 ? 4 : slaPct >= 0.70 ? 3 : slaPct >= 0.50 ? 2 : 1;

  // Mobilization: remediation velocity
  const remPct = resolved.length / total;
  const mobilization = remPct >= 0.50 ? 3 : remPct >= 0.25 ? 2 : 1;

  return { scoping, discovery, prioritization, validation, mobilization };
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div className="h-1.5 w-full bg-muted rounded-full mt-1 overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MaturityBadge({ level }: { level: number }) {
  const idx = Math.min(5, Math.max(1, Math.floor(level + 0.5))); // round to nearest
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${MATURITY_BG[idx]}`}>
      {MATURITY_LABELS[idx]}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CtemPage() {
  const { vulnerabilities } = useVulnerabilities();
  const derived = useMemo(() => computeDataDrivenScores(vulnerabilities), [vulnerabilities]);

  const [scores, setScores] = useState<Record<string, number>>(
    () => (derived ? { ...derived } : EMPTY_DATA_SCORES),
  );
  const [sourceLabel, setSourceLabel] = useState<"derived" | "manual">(derived ? "derived" : "manual");
  const [activeTab, setActiveTab] = useState<string>("scoping");
  const [isGenerating, setIsGenerating] = useState<"pdf" | "pptx" | "both" | null>(null);

  const overallScore = +(Object.values(scores).reduce((a, b) => a + b, 0) / 5).toFixed(1);
  const overallLabel =
    overallScore >= 4.5 ? "Optimizing"
    : overallScore >= 3.5 ? "Managed"
    : overallScore >= 3.0 ? "Defined"
    : overallScore >= 2.0 ? "Developing"
    : "Initial";
  const overallLevel = Math.min(5, Math.max(1, Math.floor(overallScore + 0.5)));

  function handleLoadDerived() {
    if (!derived) return;
    setScores(derived as Record<string, number>);
    setSourceLabel("derived");
  }

  function handleScoreChange(key: string, val: number) {
    setScores(prev => ({ ...prev, [key]: +val.toFixed(1) }));
    setSourceLabel("manual");
    setActiveTab(key);
  }

  function buildReportData(): CtemReportData {
    const open = vulnerabilities.filter(v => v.status !== "Resolved" && v.status !== "Risk Accepted");
    const critH = open.filter(v => v.severity === "Critical" || v.severity === "High");
    const withinSLA = critH.filter(v => v.daysOpen <= SLA_DAYS[v.severity]).length;
    const slaCompliance = critH.length > 0 ? +((withinSLA / critH.length) * 100).toFixed(1) : 100;
    const resolved = vulnerabilities.filter(v => v.status === "Resolved").length;
    const remediationRate = vulnerabilities.length > 0 ? +((resolved / vulnerabilities.length) * 100).toFixed(0) : 0;

    return {
      pillars: PILLAR_META.map(p => ({
        key: p.key,
        label: p.label,
        score: scores[p.key],
        color: p.color,
        description: p.description,
        levels: p.levels,
        recommendations: p.recommendations,
      })),
      overallScore,
      overallLabel,
      totalVulnerabilities: vulnerabilities.length,
      openCritical: open.filter(v => v.severity === "Critical").length,
      openHigh: open.filter(v => v.severity === "High").length,
      slaCompliance,
      remediationRate,
      generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    };
  }

  async function handleGenerateReport(format: "pdf" | "pptx" | "both") {
    setIsGenerating(format);
    try {
      const data = buildReportData();
      const { generateCtemPdf, generateCtemPptx } = await import("@/lib/generateCtemReport");
      if (format === "pdf" || format === "both") generateCtemPdf(data);
      if (format === "pptx" || format === "both") await generateCtemPptx(data);
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setIsGenerating(null);
    }
  }

  const radarData = PILLAR_META.map(p => ({
    pillar: p.label,
    current: scores[p.key],
    target: 4,
    fullMark: 5,
  }));

  const barData = PILLAR_META.map(p => ({
    name: p.label,
    current: scores[p.key],
    gap: Math.max(0, 4 - scores[p.key]),
    color: p.color,
  }));

  const activePillar = PILLAR_META.find(p => p.key === activeTab)!;

  // Group roadmap by quarter for display
  const roadmapByQuarter = ROADMAP_ITEMS.reduce<Record<string, typeof ROADMAP_ITEMS[number][]>>((acc, item) => {
    if (!acc[item.quarter]) acc[item.quarter] = [];
    acc[item.quarter].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">CTEM Maturity Model</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Continuous Threat Exposure Management — assess and advance your organization's maturity across the 5 CTEM pillars.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Score badge */}
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{overallScore}/5</div>
            <MaturityBadge level={overallLevel} />
          </div>
          {/* Generate Report dropdown */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => handleGenerateReport("both")}
              disabled={isGenerating !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              {isGenerating === "both" ? "Generating…" : "Generate Report"}
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => handleGenerateReport("pdf")}
                disabled={isGenerating !== null}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs font-medium hover:border-primary/50 disabled:opacity-60 transition-colors"
              >
                <FileText className="h-3.5 w-3.5 text-red-400" />
                {isGenerating === "pdf" ? "…" : "PDF only"}
              </button>
              <button
                onClick={() => handleGenerateReport("pptx")}
                disabled={isGenerating !== null}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs font-medium hover:border-primary/50 disabled:opacity-60 transition-colors"
              >
                <Presentation className="h-3.5 w-3.5 text-orange-400" />
                {isGenerating === "pptx" ? "…" : "PPTX only"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Source banner */}
      <div className={`flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg border text-xs ${
        sourceLabel === "derived"
          ? "bg-blue-500/10 border-blue-500/30"
          : "bg-muted/40 border-border"
      }`}>
        <div className="flex items-center gap-2">
          <FileBarChart2 className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
          {sourceLabel === "derived" && (
            <span className="text-muted-foreground">
              Scores computed from your <span className="font-semibold text-foreground">imported vulnerability data</span>. Adjust sliders to refine.
            </span>
          )}
          {sourceLabel === "manual" && (
            <span className="text-muted-foreground">
              {derived
                ? "Scores manually adjusted from imported vulnerability data."
                : "Import vulnerability data to calculate CTEM scores automatically."}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {derived && (
            <button
              onClick={handleLoadDerived}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                sourceLabel === "derived"
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : "border-border text-muted-foreground hover:border-blue-500/40 hover:text-blue-300"
              }`}
            >
              Load from Data
            </button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PILLAR_META.map(p => {
          const Icon = p.icon;
          const score = scores[p.key];
          return (
            <button
              key={p.key}
              onClick={() => setActiveTab(p.key)}
              className={`text-left p-4 rounded-lg border transition-all ${
                activeTab === p.key
                  ? "bg-primary/10 border-primary/40"
                  : "bg-card border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4" style={{ color: p.color }} />
                <span className="text-xs font-medium text-muted-foreground">{p.label}</span>
              </div>
              <div className="text-2xl font-bold mb-1">
                {score.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/5</span>
              </div>
              <ScoreBar score={score} />
              <div className="mt-2">
                <MaturityBadge level={score} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Current vs. Target Maturity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="pillar" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} tick={{ fill: "#64748b", fontSize: 10 }} />
                <Radar name="Target (Level 4)" dataKey="target" stroke="#334155" fill="#334155" fillOpacity={0.2} />
                <Radar name="Current" dataKey="current" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#94a3b8" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gap Analysis Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Gap to Target Level 4 (Managed)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" domain={[0, 5]} tickCount={6} tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} width={90} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#94a3b8" }}
                  formatter={(val: number) => val.toFixed(1)}
                />
                <Bar dataKey="current" name="Current" stackId="a" radius={[0, 0, 0, 0]}>
                  {barData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Bar dataKey="gap" name="Gap to Level 4" stackId="a" fill="#1e293b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pillar Detail & Self-Assessment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Self-assessment sliders */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Self-Assessment</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drag each slider to reflect your current state. Values support decimal precision (0.1 steps).
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {PILLAR_META.map(p => {
              const Icon = p.icon;
              const score = scores[p.key];
              return (
                <div
                  key={p.key}
                  className={`rounded-lg p-3 border cursor-pointer transition-all ${
                    activeTab === p.key ? "border-primary/40 bg-primary/5" : "border-border bg-transparent"
                  }`}
                  onClick={() => setActiveTab(p.key)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                      <span className="text-xs font-medium">{p.label}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{score.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={score}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleScoreChange(p.key, parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 cursor-pointer"
                    style={{ accentColor: p.color }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground/60 mt-0.5 px-0.5">
                    <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                  </div>
                  <div className="mt-1.5">
                    <MaturityBadge level={score} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right: Pillar detail */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <activePillar.icon className="h-5 w-5" style={{ color: activePillar.color }} />
              <CardTitle className="text-base font-semibold">{activePillar.label}</CardTitle>
              <MaturityBadge level={scores[activePillar.key]} />
              <span className="ml-auto text-xs text-muted-foreground tabular-nums font-semibold">
                {scores[activePillar.key].toFixed(1)} / 5.0
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{activePillar.description}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Level descriptions */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Maturity Level Descriptions</h4>
              <div className="space-y-2">
                {activePillar.levels.map((desc, idx) => {
                  const lvl = idx + 1;
                  const isCurrent = Math.floor(scores[activePillar.key] + 0.5) === lvl;
                  return (
                    <div
                      key={lvl}
                      className={`flex gap-3 p-2.5 rounded-lg text-xs transition-colors ${
                        isCurrent ? "bg-primary/10 border border-primary/25" : "border border-transparent"
                      }`}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {lvl}
                      </div>
                      <div>
                        <span className={`font-semibold ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                          {MATURITY_LABELS[lvl]}{isCurrent && " ← Current"}
                        </span>
                        <span className={`ml-1 ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                          — {desc.split(":")[1]?.trim() || desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Recommendations to Advance
              </h4>
              <ul className="space-y-2">
                {activePillar.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Maturity Roadmap Summary Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">CTEM Maturity Roadmap Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Pillar</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Current</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Target</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Gap</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Priority Action</th>
                </tr>
              </thead>
              <tbody>
                {PILLAR_META.map((p, idx) => {
                  const score = scores[p.key];
                  const gap = +(4 - score).toFixed(1);
                  const Icon = p.icon;
                  return (
                    <tr key={p.key} className={`border-b border-border/50 ${idx % 2 === 0 ? "bg-muted/5" : ""}`}>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                          <span className="font-medium">{p.label}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <MaturityBadge level={score} />
                        <span className="block text-xs text-muted-foreground mt-0.5">{score.toFixed(1)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <MaturityBadge level={4} />
                        <span className="block text-xs text-muted-foreground mt-0.5">4.0</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-bold ${gap <= 0 ? "text-green-400" : gap <= 0.5 ? "text-amber-400" : gap <= 1.5 ? "text-orange-400" : "text-red-400"}`}>
                          {gap <= 0 ? "✓ Met" : `+${gap}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {gap > 0 ? p.recommendations[0] : "Maintain and optimize current capabilities."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 p-4 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Overall CTEM Maturity: {overallScore}/5 — {overallLabel}. </span>
              Scores are sourced from imported vulnerability data and can be refined via the sliders above.
              The target level of <strong className="text-foreground">Managed (4)</strong> reflects industry best practice for mature vulnerability management programs.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Strategic Roadmap ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Strategic Roadmap to Level 4</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Q2–Q4 2026 initiatives required to reach Managed (Level 4) across all CTEM pillars.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(roadmapByQuarter).map(([quarter, items]) => (
              <div key={quarter}>
                {/* Quarter header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-bold text-foreground px-2 py-0.5 rounded bg-muted border border-border">
                    {quarter}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((item) => {
                    const pillarMeta = PILLAR_META.find(p => p.key === item.pillar);
                    const PillarIcon = pillarMeta?.icon ?? Shield;
                    return (
                      <div
                        key={item.initiative}
                        className="rounded-lg border border-border bg-card p-4 space-y-3"
                      >
                        {/* Top row: title + phase badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <PillarIcon
                              className="h-4 w-4 flex-shrink-0"
                              style={{ color: pillarMeta?.color ?? "#6366f1" }}
                            />
                            <span className="text-sm font-semibold leading-tight">{item.initiative}</span>
                          </div>
                          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${PHASE_COLORS[item.phase]}`}>
                            {item.phase}
                          </span>
                        </div>

                        {/* Detail */}
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>

                        {/* Footer: pillar + effort + impact */}
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">
                            Pillar:{" "}
                            <span className="font-medium text-foreground capitalize">{item.pillar}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Effort:{" "}
                            <span className={`font-medium ${EFFORT_COLORS[item.effort]}`}>{item.effort}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Impact:{" "}
                            <span className={`font-medium ${IMPACT_COLORS[item.impact]}`}>{item.impact}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Executive asks from slide 9 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { num: "1", title: "Approve Q2 Prioritization Sprint", body: "Authorize the ExPRT integration project and assign 2 FTE from AppSec for a 6-week sprint." },
              { num: "2", title: "Fund Red Team Program", body: "Allocate budget for quarterly red-team exercises starting Q3 2026 (estimated $85K/year)." },
              { num: "3", title: "Mandate SLA Accountability", body: "Require team leads to sign off on all Critical SLA breaches within 48 hours via exec dashboard." },
              { num: "4", title: "30-Day Progress Review", body: "Schedule a leadership checkpoint in 30 days to review closure rates on immediate-phase initiatives." },
            ].map(ask => (
              <div key={ask.num} className="flex gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  {ask.num}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{ask.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ask.body}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
