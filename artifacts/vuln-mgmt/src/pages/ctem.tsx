import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { SLA_DAYS } from "@/context/VulnerabilityContext";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid,
} from "recharts";
import { TrendingUp, Shield, Search, Target, Zap, Users, ChevronRight, Info } from "lucide-react";

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
const MATURITY_BG = ["", "bg-gray-500/10 border-gray-500/30 text-gray-400",
  "bg-amber-500/10 border-amber-500/30 text-amber-400",
  "bg-blue-500/10 border-blue-500/30 text-blue-400",
  "bg-green-500/10 border-green-500/30 text-green-400",
  "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"];

function computeDataDrivenScores(vulns: ReturnType<typeof useVulnerabilities>["vulnerabilities"]) {
  const total = vulns.length;
  if (total === 0) return { scoping: 2, discovery: 2, prioritization: 2, validation: 2, mobilization: 2 };

  const open = vulns.filter(v => v.status !== "Resolved" && v.status !== "Risk Accepted");
  const resolved = vulns.filter(v => v.status === "Resolved");
  const inProgress = vulns.filter(v => v.status === "In Progress");

  // Scoping: unique asset count diversity
  const uniqueAssets = new Set(vulns.map(v => v.asset)).size;
  const scoping = uniqueAssets >= 50 ? 4 : uniqueAssets >= 20 ? 3 : uniqueAssets >= 10 ? 2 : 2;

  // Discovery: coverage proxy — if we have all severity tiers represented
  const hasCritical = vulns.some(v => v.severity === "Critical");
  const hasHigh = vulns.some(v => v.severity === "High");
  const hasMedium = vulns.some(v => v.severity === "Medium");
  const hasLow = vulns.some(v => v.severity === "Low");
  const tierCount = [hasCritical, hasHigh, hasMedium, hasLow].filter(Boolean).length;
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
  const remPct = (resolved.length + inProgress.length) / total;
  const mobilization = remPct >= 0.50 ? 3 : remPct >= 0.25 ? 2 : 1;

  return { scoping, discovery, prioritization, validation, mobilization };
}

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex gap-1 mt-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < score ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function MaturityBadge({ level }: { level: number }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${MATURITY_BG[level]}`}>
      {MATURITY_LABELS[level]}
    </span>
  );
}

export default function CtemPage() {
  const { vulnerabilities } = useVulnerabilities();
  const derived = useMemo(() => computeDataDrivenScores(vulnerabilities), [vulnerabilities]);

  const [scores, setScores] = useState<Record<string, number>>({
    scoping: derived.scoping,
    discovery: derived.discovery,
    prioritization: derived.prioritization,
    validation: derived.validation,
    mobilization: derived.mobilization,
  });
  const [activeTab, setActiveTab] = useState<string>("scoping");

  const overallScore = +(Object.values(scores).reduce((a, b) => a + b, 0) / 5).toFixed(1);
  const overallLabel = overallScore >= 4.5 ? "Optimizing" : overallScore >= 3.5 ? "Managed" : overallScore >= 2.5 ? "Defined" : overallScore >= 1.5 ? "Developing" : "Initial";
  const overallLevel = Math.round(overallScore);

  const radarData = PILLAR_META.map(p => ({
    pillar: p.label,
    current: scores[p.key],
    target: 4,
    fullMark: 5,
  }));

  const barData = PILLAR_META.map(p => ({
    name: p.label,
    current: scores[p.key],
    gap: 4 - scores[p.key],
    color: p.color,
  }));

  const activePillar = PILLAR_META.find(p => p.key === activeTab)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">CTEM Maturity Model</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Continuous Threat Exposure Management — assess and advance your organization's maturity across the 5 CTEM pillars.
            Scores are derived from your vulnerability data and refined via self-assessment below.
          </p>
        </div>
        <div className={`text-right`}>
          <div className="text-3xl font-bold text-primary">{overallScore}/5</div>
          <MaturityBadge level={overallLevel} />
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
              <div className="text-2xl font-bold mb-1">{score}<span className="text-sm font-normal text-muted-foreground">/5</span></div>
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
                <PolarAngleAxis
                  dataKey="pillar"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 5]}
                  tickCount={6}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                />
                <Radar
                  name="Target (Level 4)"
                  dataKey="target"
                  stroke="#334155"
                  fill="#334155"
                  fillOpacity={0.2}
                />
                <Radar
                  name="Current"
                  dataKey="current"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.35}
                />
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
        {/* Left: Pillar selector + self-assessment */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Self-Assessment</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adjust each pillar score to reflect your current state. Data-driven estimates are pre-filled.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {PILLAR_META.map(p => {
              const Icon = p.icon;
              const score = scores[p.key];
              return (
                <div key={p.key}
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
                    <span className="text-xs font-bold">{MATURITY_LABELS[score]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(lvl => (
                      <button
                        key={lvl}
                        onClick={e => {
                          e.stopPropagation();
                          setScores(prev => ({ ...prev, [p.key]: lvl }));
                          setActiveTab(p.key);
                        }}
                        title={MATURITY_LABELS[lvl]}
                        className={`h-6 w-6 rounded text-xs font-bold transition-all border ${
                          lvl === score
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
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
                  const isCurrent = lvl === scores[activePillar.key];
                  return (
                    <div
                      key={lvl}
                      className={`flex gap-3 p-2.5 rounded-lg text-xs transition-colors ${
                        isCurrent
                          ? "bg-primary/10 border border-primary/25"
                          : "border border-transparent"
                      }`}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {lvl}
                      </div>
                      <div>
                        <span className={`font-semibold ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                          {MATURITY_LABELS[lvl]}
                          {isCurrent && " ← Current"}
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

      {/* Maturity Roadmap Summary */}
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
                  const gap = 4 - score;
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
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <MaturityBadge level={4} />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-bold ${gap === 0 ? "text-green-400" : gap === 1 ? "text-amber-400" : "text-red-400"}`}>
                          {gap === 0 ? "✓ Met" : `+${gap} level${gap > 1 ? "s" : ""}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {score < 4 ? p.recommendations[0] : "Maintain and optimize current capabilities."}
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
              Scores are pre-computed from your CrowdStrike Falcon Spotlight data and can be refined via self-assessment above.
              The target level of <strong className="text-foreground">Managed (4)</strong> reflects industry best practice for mature vulnerability management programs.
              Advancing to <strong className="text-foreground">Optimizing (5)</strong> requires continuous improvement, AI/ML integration, and full SOAR automation.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
