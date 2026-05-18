import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useVulnerabilities } from "@/context/VulnerabilityContext";
import { SLA_DAYS } from "@/context/VulnerabilityContext";
import {
  Plus, Pencil, Trash2, X, Check, AlertTriangle, Clock, CheckCircle2, Circle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type PlanStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";
type PlanPriority = "Critical" | "High" | "Medium" | "Low";

interface RemediationPlan {
  id: string;
  title: string;
  description: string;
  progress: number;          // 0–100
  status: PlanStatus;
  priority: PlanPriority;
  owner: string;
  deadline: string;
  createdAt: string;
}

const STORAGE_KEY = "remediation_plans_v1";

const STATUS_META: Record<PlanStatus, { color: string; icon: React.ReactNode }> = {
  "Not Started": { color: "text-muted-foreground", icon: <Circle className="h-3.5 w-3.5" /> },
  "In Progress": { color: "text-blue-400",         icon: <Clock className="h-3.5 w-3.5" /> },
  "Completed":   { color: "text-green-400",         icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  "Blocked":     { color: "text-red-400",           icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

const PRIORITY_COLOR: Record<PlanPriority, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Medium:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Low:      "bg-green-500/15 text-green-400 border-green-500/30",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function newId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadPlans(): RemediationPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RemediationPlan[];
  } catch {}
  return [];
}

function savePlans(plans: RemediationPlan[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); } catch {}
}

// ── Empty form ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: Omit<RemediationPlan, "id" | "createdAt"> = {
  title: "",
  description: "",
  progress: 0,
  status: "Not Started",
  priority: "High",
  owner: "",
  deadline: "",
};

// ── Modal ──────────────────────────────────────────────────────────────────────

function PlanModal({
  plan,
  onSave,
  onClose,
}: {
  plan: Partial<RemediationPlan> | null;
  onSave: (data: Omit<RemediationPlan, "id" | "createdAt">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<RemediationPlan, "id" | "createdAt">>(
    plan
      ? {
          title: plan.title ?? "",
          description: plan.description ?? "",
          progress: plan.progress ?? 0,
          status: plan.status ?? "Not Started",
          priority: plan.priority ?? "High",
          owner: plan.owner ?? "",
          deadline: plan.deadline ?? "",
        }
      : { ...EMPTY_FORM },
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (form.progress < 0 || form.progress > 100) e.progress = "Must be 0–100";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold">
            {plan?.id ? "Edit Plan" : "New Remediation Plan"}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="e.g. Patch critical Windows servers"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={2}
              placeholder="Optional details about this plan…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Row: Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => set("priority", e.target.value as PlanPriority)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {(["Critical", "High", "Medium", "Low"] as PlanPriority[]).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set("status", e.target.value as PlanStatus)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {(["Not Started", "In Progress", "Completed", "Blocked"] as PlanStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Owner + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Owner / Team</label>
              <input
                value={form.owner}
                onChange={e => set("owner", e.target.value)}
                placeholder="e.g. CloudSec team"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Deadline</label>
              <input
                type="date"
                value={form.deadline}
                onChange={e => set("deadline", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Progress slider */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Progress — <span className="text-foreground font-semibold">{form.progress}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={form.progress}
              onChange={e => set("progress", Number(e.target.value))}
              className="w-full accent-primary"
            />
            {errors.progress && <p className="text-xs text-red-400 mt-1">{errors.progress}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Check className="h-4 w-4" />
              {plan?.id ? "Save Changes" : "Add Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Remediation() {
  const { vulnerabilities } = useVulnerabilities();
  const [plans, setPlans] = useState<RemediationPlan[]>(loadPlans);
  const [modalPlan, setModalPlan] = useState<Partial<RemediationPlan> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<PlanStatus | "All">("All");

  // Persist on every change
  useEffect(() => { savePlans(plans); }, [plans]);

  // ── SLA breach computation from real vulnerability data ──────────────────
  const slaBreaches = (() => {
    const open = vulnerabilities.filter(v => v.status !== "Resolved" && v.status !== "Risk Accepted");
    const breaches: Record<string, number> = {};
    for (const v of open) {
      if (v.daysOpen > SLA_DAYS[v.severity]) {
        breaches[v.team] = (breaches[v.team] ?? 0) + 1;
      }
    }
    return Object.entries(breaches)
      .sort((a, b) => b[1] - a[1])
      .map(([team, count]) => ({ team, count }));
  })();

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  function handleSave(data: Omit<RemediationPlan, "id" | "createdAt">) {
    if (modalPlan?.id) {
      setPlans(prev => prev.map(p => p.id === modalPlan.id ? { ...p, ...data } : p));
    } else {
      const newPlan: RemediationPlan = {
        ...data,
        id: newId(),
        createdAt: new Date().toISOString(),
      };
      setPlans(prev => [newPlan, ...prev]);
    }
    setModalPlan(null);
  }

  function handleDelete(id: string) {
    setPlans(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
  }

  // ── Derived lists ─────────────────────────────────────────────────────────
  const filtered = filterStatus === "All"
    ? plans
    : plans.filter(p => p.status === filterStatus);

  const summaryStats = {
    total: plans.length,
    completed: plans.filter(p => p.status === "Completed").length,
    inProgress: plans.filter(p => p.status === "In Progress").length,
    blocked: plans.filter(p => p.status === "Blocked").length,
    avgProgress: plans.length
      ? Math.round(plans.reduce((s, p) => s + p.progress, 0) / plans.length)
      : 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Remediation Plans</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Track and manage your vulnerability remediation milestones.
          </p>
        </div>
        <button
          onClick={() => setModalPlan({})}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      {/* Summary KPI strip */}
      {plans.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Plans",  value: summaryStats.total,       color: "text-foreground" },
            { label: "Completed",    value: summaryStats.completed,    color: "text-green-400" },
            { label: "In Progress",  value: summaryStats.inProgress,  color: "text-blue-400" },
            { label: "Blocked",      value: summaryStats.blocked,     color: "text-red-400" },
            { label: "Avg Progress", value: `${summaryStats.avgProgress}%`, color: "text-primary" },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Plan list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["All", "Not Started", "In Progress", "Completed", "Blocked"] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                {s}
                {s !== "All" && (
                  <span className="ml-1.5 opacity-60">
                    {plans.filter(p => p.status === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm font-medium text-muted-foreground">
                {plans.length === 0
                  ? "No remediation plans yet"
                  : `No plans with status "${filterStatus}"`}
              </p>
              {plans.length === 0 && (
                <button
                  onClick={() => setModalPlan({})}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add your first plan
                </button>
              )}
            </div>
          )}

          {/* Plan cards */}
          <div className="space-y-3">
            {filtered.map(plan => {
              const sm = STATUS_META[plan.status];
              const isOverdue = plan.deadline && new Date(plan.deadline) < new Date() && plan.status !== "Completed";
              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{plan.title}</span>
                        <span className={`inline-flex items-center gap-1 text-xs border px-2 py-0.5 rounded-full ${PRIORITY_COLOR[plan.priority]}`}>
                          {plan.priority}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs ${sm.color}`}>
                          {sm.icon} {plan.status}
                        </span>
                        {isOverdue && (
                          <span className="text-xs text-red-400 font-medium">⚠ Overdue</span>
                        )}
                      </div>

                      {/* Description */}
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {plan.owner && <span>👤 {plan.owner}</span>}
                        {plan.deadline && (
                          <span className={isOverdue ? "text-red-400" : ""}>
                            📅 {new Date(plan.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Progress</span>
                          <span className={`font-medium ${plan.progress === 100 ? "text-green-400" : "text-foreground"}`}>
                            {plan.progress}%
                          </span>
                        </div>
                        <Progress value={plan.progress} className="h-1.5" />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setModalPlan(plan)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(plan.id)}
                        className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: SLA Breaches */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Team SLA Breaches</CardTitle>
              <p className="text-xs text-muted-foreground">
                Open vulnerabilities past their SLA deadline, by team.
              </p>
            </CardHeader>
            <CardContent>
              {slaBreaches.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {vulnerabilities.length === 0
                    ? "No vulnerability data imported yet."
                    : "✅ No SLA breaches — all teams on track!"}
                </div>
              ) : (
                <div className="space-y-3">
                  {slaBreaches.map(({ team, count }) => (
                    <div
                      key={team}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <span className="text-sm font-medium">{team}</span>
                      <span className={`text-sm font-bold ${
                        count >= 10 ? "text-red-400" : count >= 5 ? "text-orange-400" : "text-yellow-400"
                      }`}>
                        {count} breach{count !== 1 ? "es" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick tips */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>• Set a <strong className="text-foreground">deadline</strong> to track overdue plans automatically.</p>
              <p>• Use the <strong className="text-foreground">progress slider</strong> to update completion as work proceeds.</p>
              <p>• Mark plans as <strong className="text-foreground">Blocked</strong> to flag dependencies or issues.</p>
              <p>• SLA breach counts above update live from your imported vulnerabilities.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add / Edit modal */}
      {modalPlan !== null && (
        <PlanModal
          plan={modalPlan}
          onSave={handleSave}
          onClose={() => setModalPlan(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl p-6">
            <h3 className="text-base font-semibold mb-2">Delete Plan</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete this plan? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
