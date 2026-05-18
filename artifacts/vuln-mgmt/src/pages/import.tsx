import React, { useState, useRef, useCallback } from "react";
import { useVulnerabilities, parseCrowdStrikeCSV, parseExcelStatusUpdates, parseCloseList } from "@/context/VulnerabilityContext";
import { Vulnerability, Severity, Status, AssetType, Team } from "@/data/vulnerabilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Plus, CheckCircle, AlertCircle, FileText, Trash2, RefreshCcw, Info, RefreshCw, Table2, ShieldCheck, GitBranch, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import {
  getAssetMappingConfig, setAssetMappingConfig, resetAssetMappingConfig,
  DEFAULT_RULES, ASSET_TYPES, CONDITION_LABELS, newRuleId,
} from "@/lib/assetMappingConfig";
import type { MappingRule, MatchCondition, AssetMappingConfig } from "@/lib/assetMappingConfig";
import { cn } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/30",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  Low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", SEVERITY_COLORS[severity] || "bg-muted text-muted-foreground")}>
      {severity}
    </span>
  );
}

// ── CrowdStrike Import Tab ────────────────────────────────────────────────────

function CrowdStrikeImport() {
  const { addBulkVulnerabilities } = useVulnerabilities();
  const [dragActive, setDragActive] = useState(false);
  const [parsed, setParsed] = useState<Omit<Vulnerability, "id">[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setImported(false);
    setFileName(file.name);
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setParseError("Please upload a CSV file exported from CrowdStrike Falcon Spotlight.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setParsing(true);
      setProgress(0);
      try {
        const result = await parseCrowdStrikeCSV(text, (done, total) => {
          setProgress(Math.round((done / total) * 100));
        });
        if (result.length === 0) {
          setParseError("No vulnerabilities found. Make sure this is a valid CrowdStrike Falcon Spotlight export.");
          return;
        }
        setParsed(result);
      } catch (err: any) {
        setParseError(`Parse error: ${err?.message ?? err}`);
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const confirmImport = () => {
    if (!parsed) return;
    addBulkVulnerabilities(parsed);
    setImported(true);
    setParsed(null);
    setFileName(null);
  };

  const reset = () => {
    setParsed(null);
    setParseError(null);
    setImported(false);
    setFileName(null);
    setParsing(false);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">How to export from CrowdStrike Falcon Spotlight</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-400/80 text-xs">
            <li>Log in to the CrowdStrike Falcon Console</li>
            <li>Navigate to <strong>Spotlight</strong> &rarr; <strong>Vulnerabilities</strong></li>
            <li>Apply your filters (host group, severity, etc.)</li>
            <li>Click <strong>Export</strong> &rarr; <strong>Export to CSV</strong></li>
            <li>Upload the downloaded CSV file below</li>
          </ol>
          <p className="mt-2 text-xs text-blue-400/60">
            Expected columns: <strong className="text-blue-300">Hostname, Vulnerability ID, ExPRT rating, Exploit status, Remediation, Status, Days open</strong>
          </p>
        </div>
      </div>

      {/* Drop Zone */}
      {!parsed && !imported && !parsing && (
        <div
          data-testid="dropzone-crowdstrike"
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <div className="p-4 rounded-full bg-primary/10">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Drop your CrowdStrike CSV here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            {fileName && <p className="text-xs text-primary mt-2">{fileName}</p>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            data-testid="input-file-crowdstrike"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* Parsing progress */}
      {parsing && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4">
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Parsing {fileName}…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Processing large file — the UI will remain responsive
            </p>
          </div>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{parseError}</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>Try Again</Button>
        </div>
      )}

      {/* Success */}
      {imported && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <p>Vulnerabilities imported successfully. The dashboard and all views now reflect your CrowdStrike data.</p>
          <Button variant="ghost" size="sm" className="ml-auto text-green-400" onClick={reset} data-testid="button-import-another">
            Import Another File
          </Button>
        </div>
      )}

      {/* Preview Table */}
      {parsed && parsed.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{parsed.length} vulnerabilities detected</p>
              <p className="text-xs text-muted-foreground mt-0.5">Review the preview below, then confirm to import.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset} data-testid="button-cancel-import">
                Cancel
              </Button>
              <Button size="sm" onClick={confirmImport} data-testid="button-confirm-import">
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Import ({parsed.length})
              </Button>
            </div>
          </div>

          {/* Severity summary */}
          <div className="grid grid-cols-4 gap-3">
            {(["Critical", "High", "Medium", "Low"] as Severity[]).map(s => {
              const count = parsed.filter(v => v.severity === s).length;
              return (
                <div key={s} className="p-3 rounded-lg bg-card border border-border text-center">
                  <SeverityBadge severity={s} />
                  <p className="text-2xl font-bold mt-2">{count}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border overflow-hidden max-h-80 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>CVE ID</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>CVSS</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Product / Title</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.slice(0, 100).map((v, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs text-blue-400">{v.cveId}</TableCell>
                    <TableCell><SeverityBadge severity={v.severity} /></TableCell>
                    <TableCell>{v.cvss.toFixed(1)}</TableCell>
                    <TableCell className="text-xs">{v.asset}</TableCell>
                    <TableCell className="text-xs">{v.status}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{v.title}</TableCell>
                  </TableRow>
                ))}
                {parsed.length > 100 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-3">
                      … and {parsed.length - 100} more rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Entry Tab ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  cveId: "",
  title: "",
  severity: "High" as Severity,
  cvss: "",
  status: "Open" as Status,
  asset: "",
  assetType: "Server" as AssetType,
  team: "CloudSec" as Team,
  daysOpen: "",
  deadline: "",
  description: "",
};

function ManualEntry() {
  const { addVulnerability } = useVulnerabilities();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.cveId.trim()) e.cveId = "CVE ID is required";
    if (!form.asset.trim()) e.asset = "Asset name is required";
    const cvss = parseFloat(form.cvss);
    if (form.cvss && (isNaN(cvss) || cvss < 0 || cvss > 10)) e.cvss = "CVSS must be 0.0–10.0";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const today = new Date();
    const slaMap: Record<Severity, number> = { Critical: 7, High: 30, Medium: 90, Low: 180 };
    const defaultDeadline = new Date(today);
    defaultDeadline.setDate(today.getDate() + slaMap[form.severity]);

    addVulnerability({
      cveId: form.cveId.trim() || `CVE-MANUAL-${Date.now()}`,
      title: form.title.trim() || form.cveId.trim(),
      severity: form.severity,
      cvss: parseFloat(form.cvss) || 5.0,
      status: form.status,
      asset: form.asset.trim(),
      assetType: form.assetType,
      team: form.team,
      daysOpen: parseInt(form.daysOpen) || 0,
      deadline: form.deadline || defaultDeadline.toISOString().split("T")[0],
      description: form.description.trim() || `${form.severity} severity vulnerability on ${form.asset.trim()}.`,
      likelihood: form.severity === "Critical" ? 5 : form.severity === "High" ? 4 : form.severity === "Medium" ? 3 : 2,
      impact: form.severity === "Critical" ? 5 : form.severity === "High" ? 4 : form.severity === "Medium" ? 3 : 2,
    });
    setSubmitted(true);
    setForm(EMPTY_FORM);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitted && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm" data-testid="status-manual-success">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <p>Vulnerability added successfully. It now appears in the Vulnerability Inventory.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cveId">CVE ID <span className="text-red-500">*</span></Label>
            <Input
              id="cveId"
              data-testid="input-cveId"
              placeholder="CVE-2024-1234"
              value={form.cveId}
              onChange={e => set("cveId", e.target.value)}
              className={errors.cveId ? "border-red-500" : ""}
            />
            {errors.cveId && <p className="text-xs text-red-500">{errors.cveId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Product / Vulnerability Name</Label>
            <Input
              id="title"
              data-testid="input-title"
              placeholder="e.g. Apache Log4j RCE"
              value={form.title}
              onChange={e => set("title", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset">Affected Asset <span className="text-red-500">*</span></Label>
            <Input
              id="asset"
              data-testid="input-asset"
              placeholder="e.g. prod-web-server-01"
              value={form.asset}
              onChange={e => set("asset", e.target.value)}
              className={errors.asset ? "border-red-500" : ""}
            />
            {errors.asset && <p className="text-xs text-red-500">{errors.asset}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Asset Type</Label>
              <Select value={form.assetType} onValueChange={v => set("assetType", v)}>
                <SelectTrigger data-testid="select-assetType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Server", "Endpoint", "Cloud", "Application", "Network"] as AssetType[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Assigned Team</Label>
              <Select value={form.team} onValueChange={v => set("team", v)}>
                <SelectTrigger data-testid="select-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["AppSec", "CloudSec", "NetSec", "EndpointSec"] as Team[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => set("severity", v)}>
                <SelectTrigger data-testid="select-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Critical", "High", "Medium", "Low"] as Severity[]).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cvss">CVSS Score (0.0–10.0)</Label>
              <Input
                id="cvss"
                data-testid="input-cvss"
                type="number"
                step="0.1"
                min="0"
                max="10"
                placeholder="7.5"
                value={form.cvss}
                onChange={e => set("cvss", e.target.value)}
                className={errors.cvss ? "border-red-500" : ""}
              />
              {errors.cvss && <p className="text-xs text-red-500">{errors.cvss}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Open", "In Progress", "Resolved", "Risk Accepted"] as Status[]).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="daysOpen">Days Open</Label>
              <Input
                id="daysOpen"
                data-testid="input-daysOpen"
                type="number"
                min="0"
                placeholder="0"
                value={form.daysOpen}
                onChange={e => set("daysOpen", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deadline">Remediation Deadline</Label>
            <Input
              id="deadline"
              data-testid="input-deadline"
              type="date"
              value={form.deadline}
              onChange={e => set("deadline", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description / Notes</Label>
            <textarea
              id="description"
              data-testid="input-description"
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Describe the vulnerability, affected component, and recommended remediation..."
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" data-testid="button-submit-manual">
          <Plus className="h-4 w-4 mr-2" />
          Add Vulnerability
        </Button>
      </div>
    </form>
  );
}

// ── Excel / CSV Status Update Tab ────────────────────────────────────────────

function ExcelUpdateImport() {
  const { vulnerabilities, mergeBulkVulnerabilities, updateVulnerability } = useVulnerabilities();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; notFound: number; skipped: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      setParseError("Please upload an Excel (.xlsx / .xls) or CSV file.");
      return;
    }
    setLoading(true);
    try {
      const updates = await parseExcelStatusUpdates(file);
      if (updates.length === 0) {
        setParseError("No rows found. Make sure the file has 'CVE ID' and 'Status' columns.");
        return;
      }
      let updated = 0;
      let notFound = 0;
      updates.forEach(u => {
        const match = vulnerabilities.find(v => {
          const cveMatch = v.cveId.toLowerCase() === u.cveId.toLowerCase();
          if (!cveMatch) return false;
          if (u.asset) return v.asset.toLowerCase() === u.asset.toLowerCase();
          return true;
        });
        if (match) {
          updateVulnerability(match.id, { status: u.status });
          updated++;
        } else {
          notFound++;
        }
      });
      setResult({ updated, notFound, skipped: updates.length - updated - notFound });
    } catch (e: any) {
      setParseError(`Failed to parse file: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName(null);
    setResult(null);
    setParseError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs space-y-1">
          <p className="font-medium text-sm">Update vulnerability statuses from Excel or CSV</p>
          <p>Upload a spreadsheet with <strong>CVE ID</strong> and <strong>Status</strong> columns. Optionally include an <strong>Asset</strong> / <strong>Hostname</strong> column to match specific records.</p>
          <p className="text-blue-400/70">Accepted status values: <strong className="text-blue-300">Open, In Progress, Resolved / Closed / Fixed, Risk Accepted</strong></p>
          <p className="text-blue-400/70">Only existing vulnerabilities are updated — new rows are ignored.</p>
        </div>
      </div>

      {!result && (
        <div
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <div className="p-4 rounded-full bg-primary/10">
            <Table2 className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold">{loading ? "Processing…" : "Drop your Excel or CSV file here"}</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse (.xlsx, .xls, .csv)</p>
            {fileName && <p className="text-xs text-primary mt-2">{fileName}</p>}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {parseError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{parseError}</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>Try Again</Button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-green-500/5 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-semibold">
              <CheckCircle className="h-5 w-5" />
              Update complete
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{result.updated}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Statuses updated</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">{result.notFound}</div>
                <div className="text-xs text-muted-foreground mt-0.5">CVEs not found</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Skipped / invalid</div>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" /> Upload Another File
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Close Vulnerabilities from File Tab ─────────────────────────────────────

type CloseMatch = {
  id: string;
  cveId: string;
  asset: string;
  severity: string;
  currentStatus: string;
};

function CloseFromFile() {
  const { vulnerabilities, updateVulnerability } = useVulnerabilities();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [matches, setMatches]       = useState<CloseMatch[] | null>(null);
  const [notFound, setNotFound]     = useState(0);
  const [done, setDone]             = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    setMatches(null);
    setDone(null);
    setNotFound(0);
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "txt", "xlsx", "xls"].includes(ext)) {
      setParseError("Please upload a CSV or Excel file.");
      return;
    }
    setLoading(true);
    try {
      const list = await parseCloseList(file);
      if (!list.length) {
        setParseError("No CVE IDs found. Make sure the file has a 'CVE ID' or 'Vulnerability ID' column.");
        return;
      }

      // Build an index keyed by lowercase cveId → O(n) once, then O(1) per lookup
      const idx = new Map<string, typeof vulnerabilities>();
      for (const v of vulnerabilities) {
        const k = v.cveId.toLowerCase();
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k)!.push(v);
      }

      const found: CloseMatch[] = [];
      let missing = 0;
      for (const item of list) {
        const candidates = idx.get(item.cveId.toLowerCase()) ?? [];
        const hits = item.asset
          ? candidates.filter(v => v.asset.toLowerCase() === item.asset!.toLowerCase())
          : candidates;
        if (hits.length === 0) { missing++; continue; }
        hits.forEach(v => found.push({
          id: v.id,
          cveId: v.cveId,
          asset: v.asset,
          severity: v.severity,
          currentStatus: v.status,
        }));
      }
      setMatches(found);
      setNotFound(missing);
    } catch (e: any) {
      setParseError(`Failed to parse file: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    if (!matches) return;
    matches.forEach(m => updateVulnerability(m.id, { status: "Resolved" }));
    setDone(matches.length);
    setMatches(null);
    setFileName(null);
  };

  const reset = () => {
    setMatches(null);
    setParseError(null);
    setDone(null);
    setNotFound(0);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const alreadyClosed = matches?.filter(m => m.currentStatus === "Resolved").length ?? 0;
  const toClose       = (matches?.length ?? 0) - alreadyClosed;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20 text-sm text-green-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs space-y-1">
          <p className="font-medium text-sm">Close vulnerabilities by uploading a remediation list</p>
          <p>Upload a CSV or Excel file with <strong>CVE ID</strong> (or "Vulnerability ID") and <strong>Hostname</strong> columns. Every row that matches an existing vulnerability will be marked <strong>Resolved</strong>.</p>
          <p className="text-green-400/70">Rows that don't match anything in the inventory are skipped. Already-resolved items are shown but not double-counted.</p>
        </div>
      </div>

      {/* Drop zone */}
      {!matches && done === null && !loading && (
        <div
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
            dragActive ? "border-green-500 bg-green-500/5" : "border-border hover:border-green-500/50 hover:bg-muted/30"
          )}
        >
          <div className="p-4 rounded-full bg-green-500/10">
            <ShieldCheck className="h-8 w-8 text-green-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Drop your remediation list here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse (.csv, .xlsx, .xls)</p>
            {fileName && <p className="text-xs text-green-400 mt-2">{fileName}</p>}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 p-8 text-muted-foreground text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
          Parsing {fileName}…
        </div>
      )}

      {parseError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{parseError}</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>Try Again</Button>
        </div>
      )}

      {/* Preview */}
      {matches && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{toClose}</p>
              <p className="text-xs text-muted-foreground mt-1">Will be marked Resolved</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{alreadyClosed}</p>
              <p className="text-xs text-muted-foreground mt-1">Already Resolved</p>
            </div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 text-center">
              <p className="text-2xl font-bold text-orange-400">{notFound}</p>
              <p className="text-xs text-muted-foreground mt-1">Not found in inventory</p>
            </div>
          </div>

          {/* Match table */}
          {matches.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>CVE ID</TableHead>
                    <TableHead>Hostname / Asset</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Current Status</TableHead>
                    <TableHead>Will become</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m, i) => (
                    <TableRow key={i} className={m.currentStatus === "Resolved" ? "opacity-40" : ""}>
                      <TableCell className="font-mono text-xs text-blue-400">{m.cveId}</TableCell>
                      <TableCell className="text-xs">{m.asset}</TableCell>
                      <TableCell><SeverityBadge severity={m.severity} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.currentStatus}</TableCell>
                      <TableCell>
                        <span className="text-xs font-medium text-green-400">✓ Resolved</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {matches.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No matching vulnerabilities found in the inventory.
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
            {toClose > 0 && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={confirm}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Close {toClose} {toClose === 1 ? "Vulnerability" : "Vulnerabilities"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {done !== null && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{done} {done === 1 ? "vulnerability" : "vulnerabilities"} marked as Resolved.</p>
              <p className="text-xs text-green-400/70 mt-0.5">The dashboard and all metrics have been updated.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" /> Upload Another File
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Data Management Tab ───────────────────────────────────────────────────────

function DataManagement() {
  const { vulnerabilities, importSource, resetToMockData, clearAll } = useVulnerabilities();
  const critical = vulnerabilities.filter(v => v.severity === "Critical").length;
  const high = vulnerabilities.filter(v => v.severity === "High").length;
  const medium = vulnerabilities.filter(v => v.severity === "Medium").length;
  const low = vulnerabilities.filter(v => v.severity === "Low").length;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: vulnerabilities.length },
          { label: "Data Source", value: importSource === "mock" ? "Demo Data" : importSource === "crowdstrike" ? "CrowdStrike" : importSource === "manual" ? "Manual" : "Mixed" },
          { label: "Unique CVEs", value: new Set(vulnerabilities.map(v => v.cveId)).size },
          { label: "Assets Tracked", value: new Set(vulnerabilities.map(v => v.asset)).size },
        ].map(({ label, value }) => (
          <div key={label} className="p-4 rounded-lg bg-card border border-border">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Critical", count: critical, cls: "text-red-400" },
          { label: "High", count: high, cls: "text-orange-400" },
          { label: "Medium", count: medium, cls: "text-yellow-400" },
          { label: "Low", count: low, cls: "text-blue-400" },
        ].map(({ label, count, cls }) => (
          <div key={label} className="p-3 rounded-lg bg-card border border-border text-center">
            <p className={`text-xs font-medium ${cls}`}>{label}</p>
            <p className="text-xl font-bold mt-1">{count}</p>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-sm font-medium text-red-400">Clear All Data</p>
        <p className="text-xs text-muted-foreground">Remove all vulnerability records. This cannot be undone.</p>
        {!confirming ? (
          <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Vulnerabilities
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => { clearAll(); setConfirming(false); }}>
              Confirm — Delete All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mapping Rules Tab ─────────────────────────────────────────────────────────

function MappingRulesTab() {
  const { reclassifyAssets, vulnerabilities } = useVulnerabilities();

  const [config, setConfig]       = useState<AssetMappingConfig>(() => getAssetMappingConfig());
  const [applyResult, setApplyResult] = useState<number | null>(null);
  const [saved, setSaved]         = useState(false);

  const isDefault =
    JSON.stringify(config.rules) === JSON.stringify(DEFAULT_RULES) &&
    config.fallbackAssetType === "Endpoint";

  const updateRule = (id: string, patch: Partial<MappingRule>) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => r.id === id ? { ...r, ...patch } : r),
    }));
  };

  const deleteRule = (id: string) => {
    setConfig(prev => ({ ...prev, rules: prev.rules.filter(r => r.id !== id) }));
  };

  const addRule = () => {
    const newRule: MappingRule = {
      id:        newRuleId(),
      condition: "starts_with",
      value:     "",
      assetType: "Server",
      enabled:   true,
    };
    setConfig(prev => ({ ...prev, rules: [...prev.rules, newRule] }));
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    const next = [...config.rules];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setConfig(prev => ({ ...prev, rules: next }));
  };

  const handleSave = () => {
    // Strip rules with empty value
    const cleaned = { ...config, rules: config.rules.filter(r => r.value.trim() !== "") };
    setAssetMappingConfig(cleaned);
    setConfig(cleaned);
    setSaved(true);
    setApplyResult(null);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    resetAssetMappingConfig();
    setConfig({ rules: [...DEFAULT_RULES], fallbackAssetType: "Endpoint" });
    setApplyResult(null);
  };

  const handleApply = () => {
    const updated = reclassifyAssets();
    setApplyResult(updated);
  };

  const CONDITIONS: MatchCondition[] = ["starts_with", "contains", "ends_with"];

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
        <GitBranch className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Rules are evaluated <strong className="text-foreground">in order</strong> — the first matching rule wins.
            Hostnames that don't match any rule get the <strong className="text-foreground">fallback asset type</strong>.
          </p>
          <p>
            Rules apply automatically on the next CSV import. Use <em>Apply to Existing Data</em> to re-classify already-imported records.
          </p>
        </div>
      </div>

      {/* Rule list */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="py-2 px-3 text-left text-muted-foreground font-medium w-[28px]">#</th>
              <th className="py-2 px-3 text-left text-muted-foreground font-medium">Condition</th>
              <th className="py-2 px-3 text-left text-muted-foreground font-medium">Hostname value</th>
              <th className="py-2 px-3 text-left text-muted-foreground font-medium">Asset Type</th>
              <th className="py-2 px-3 text-center text-muted-foreground font-medium w-[60px]">Active</th>
              <th className="py-2 px-3 text-center text-muted-foreground font-medium w-[80px]">Order</th>
              <th className="py-2 px-3 w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {config.rules.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No rules defined — all hostnames will use the fallback type.
                </td>
              </tr>
            )}
            {config.rules.map((rule, idx) => (
              <tr key={rule.id} className={`border-b border-border/50 ${!rule.enabled ? "opacity-40" : ""}`}>
                <td className="py-2 px-3 text-muted-foreground font-mono">{idx + 1}</td>

                {/* Condition */}
                <td className="py-2 px-3">
                  <select
                    value={rule.condition}
                    onChange={e => updateRule(rule.id, { condition: e.target.value as MatchCondition })}
                    className="text-xs rounded border border-border bg-muted/40 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {CONDITIONS.map(c => (
                      <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                    ))}
                  </select>
                </td>

                {/* Value */}
                <td className="py-2 px-3">
                  <input
                    type="text"
                    value={rule.value}
                    onChange={e => updateRule(rule.id, { value: e.target.value })}
                    placeholder='e.g. "SRV"'
                    className="w-36 text-xs rounded border border-border bg-muted/40 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </td>

                {/* Asset type */}
                <td className="py-2 px-3">
                  <select
                    value={rule.assetType}
                    onChange={e => updateRule(rule.id, { assetType: e.target.value as AssetType })}
                    className="text-xs rounded border border-border bg-muted/40 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>

                {/* Enabled toggle */}
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`w-9 h-5 rounded-full transition-colors relative ${rule.enabled ? "bg-primary" : "bg-muted border border-border"}`}
                    title={rule.enabled ? "Disable rule" : "Enable rule"}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${rule.enabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </td>

                {/* Order buttons */}
                <td className="py-2 px-3">
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      onClick={() => moveRule(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveRule(idx, 1)}
                      disabled={idx === config.rules.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>

                {/* Delete */}
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add rule + fallback */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={addRule}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-dashed border-primary/50 text-primary hover:bg-primary/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Fallback (no match):</span>
          <select
            value={config.fallbackAssetType}
            onChange={e => setConfig(prev => ({ ...prev, fallbackAssetType: e.target.value as AssetType }))}
            className="text-xs rounded border border-border bg-muted/40 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={isDefault}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
          {vulnerabilities.length > 0 && (
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-blue-500/50 hover:text-blue-400 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Apply to Existing Data
            </button>
          )}
          {applyResult !== null && (
            <span className="text-xs text-green-400">
              ✓ {applyResult} record{applyResult !== 1 ? "s" : ""} re-classified
            </span>
          )}
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {saved ? (
            <><CheckCircle className="h-3.5 w-3.5" /> Saved!</>
          ) : "Save Rules"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold">Import & Add Vulnerabilities</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import directly from CrowdStrike Falcon Spotlight exports, or add vulnerabilities manually. All data updates the dashboard in real time.
        </p>
      </div>

      <Tabs defaultValue="crowdstrike">
        <TabsList className="mb-4">
          <TabsTrigger value="crowdstrike">
            <FileText className="h-4 w-4 mr-2" />
            CrowdStrike CSV
          </TabsTrigger>
          <TabsTrigger value="close">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Close Vulnerabilities
          </TabsTrigger>
          <TabsTrigger value="excel">
            <Table2 className="h-4 w-4 mr-2" />
            Excel / CSV Update
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Plus className="h-4 w-4 mr-2" />
            Add Manually
          </TabsTrigger>
          <TabsTrigger value="manage">
            <Trash2 className="h-4 w-4 mr-2" />
            Data Management
          </TabsTrigger>
          <TabsTrigger value="mapping">
            <GitBranch className="h-4 w-4 mr-2" />
            Mapping Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crowdstrike">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                CrowdStrike Falcon Spotlight Import
              </CardTitle>
              <CardDescription>
                Upload a CSV file exported from CrowdStrike Falcon Spotlight. The importer automatically maps all standard Spotlight export columns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CrowdStrikeImport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="close">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-400" />
                Close Vulnerabilities from File
              </CardTitle>
              <CardDescription>
                Upload a list of remediated CVEs. Every entry that matches by CVE ID + Hostname is automatically marked <strong>Resolved</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CloseFromFile />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excel">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-primary" />
                Update Statuses from Excel / CSV
              </CardTitle>
              <CardDescription>
                Upload an Excel or CSV file to bulk-update vulnerability statuses. Matches by CVE ID (and optionally Asset/Hostname).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExcelUpdateImport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Add Vulnerability Manually
              </CardTitle>
              <CardDescription>
                Enter vulnerability details individually. Added entries immediately appear in the Vulnerability Inventory and all metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ManualEntry />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-primary" />
                Data Management
              </CardTitle>
              <CardDescription>
                Overview of your current dataset and options to reset to demonstration data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                Asset Mapping Rules
              </CardTitle>
              <CardDescription>
                Define prefix/substring rules to classify hostnames into asset types during import.
                Rules run in order — the first match wins.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MappingRulesTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
