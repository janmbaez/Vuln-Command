import React, { useState, useRef, useCallback } from "react";
import { useVulnerabilities, parseCrowdStrikeCSV } from "@/context/VulnerabilityContext";
import { Vulnerability, Severity, Status, AssetType, Team } from "@/data/vulnerabilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Plus, CheckCircle, AlertCircle, FileText, Trash2, RefreshCcw, Info } from "lucide-react";
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
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCrowdStrikeCSV(text);
      if (result.length === 0) {
        setParseError("No vulnerabilities found. Make sure this is a valid CrowdStrike Falcon Spotlight export.");
        return;
      }
      setParsed(result);
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
      {!parsed && !imported && (
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

// ── Data Management Tab ───────────────────────────────────────────────────────

function DataManagement() {
  const { vulnerabilities, importSource, resetToMockData } = useVulnerabilities();
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

      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <p className="text-sm font-medium">Reset to Demo Data</p>
        <p className="text-xs text-muted-foreground">This will replace all current vulnerability data with the built-in demonstration dataset. Any imported or manually added vulnerabilities will be lost.</p>
        {!confirming ? (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)} data-testid="button-reset-prompt">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Reset to Demo Data
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => { resetToMockData(); setConfirming(false); }} data-testid="button-confirm-reset">
              Confirm Reset
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
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
          <TabsTrigger value="crowdstrike" data-testid="tab-crowdstrike">
            <FileText className="h-4 w-4 mr-2" />
            CrowdStrike Import
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual">
            <Plus className="h-4 w-4 mr-2" />
            Add Manually
          </TabsTrigger>
          <TabsTrigger value="manage" data-testid="tab-manage">
            <Trash2 className="h-4 w-4 mr-2" />
            Data Management
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
      </Tabs>
    </div>
  );
}
