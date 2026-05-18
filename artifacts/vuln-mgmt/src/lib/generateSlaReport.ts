/**
 * SLA Compliance Report Generator — executive PDF + PPTX
 * Clean design matching the approved CTEM report aesthetic.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

// ── Shared types ───────────────────────────────────────────────────────────────

export interface SlaVuln {
  cveId: string; asset: string; severity: string; status: string;
  daysOpen: number; limit: number; daysLeft: number;
  breached: boolean; atRisk: boolean; slaUsedPct: number;
  originalOpenDate: string; effectiveSlaStart: string;
  reopenCount: number; lastReopenDate?: string;
}
export interface SlaSevStat {
  sev: string; limit: number; total: number;
  breached: number; atRisk: number; compliant: number; rate: number;
}
export interface SlaReportData {
  generatedAt: string; organizationName?: string;
  overallRate: number; openCount: number;
  totalBreached: number; totalAtRisk: number;
  sevStats: SlaSevStat[];
  breachedVulns: SlaVuln[];
  atRiskVulns: SlaVuln[];
}

// ── Color system (RGB tuples — same as CTEM report) ───────────────────────────

type RGB = [number, number, number];

const C: Record<string, RGB> = {
  pageBg:   [11,  22,  39],
  navy:     [15,  27,  56],
  navyMid:  [21,  43,  80],
  indigo:   [99,  102, 241],
  indigoLt: [165, 180, 252],
  green:    [16,  185, 129],
  amber:    [245, 158, 11],
  red:      [239, 68,  68],
  yellow:   [234, 179, 8],
  blue:     [96,  165, 250],
  white:    [255, 255, 255],
  silver:   [203, 213, 225],
  muted:    [100, 116, 131],
  border:   [30,  51,  85],
  text:     [226, 232, 240],
};

function tint(c: RGB, o: number): RGB {
  return c.map(v => Math.round(255 * (1 - o) + v * o)) as RGB;
}

function sevRgb(sev: string): RGB {
  return ({ Critical: C.red, High: C.amber, Medium: C.yellow, Low: C.blue } as Record<string, RGB>)[sev] ?? C.muted;
}

function urgRgb(overdue: number): RGB {
  if (overdue >= 60) return C.red;
  if (overdue >= 30) return C.amber;
  if (overdue >= 7)  return C.yellow;
  return C.blue;
}
function urgLabel(overdue: number): string {
  if (overdue >= 60) return "Critical";
  if (overdue >= 30) return "High";
  if (overdue >= 7)  return "Medium";
  return "Low";
}

function statusRgb(rate: number): RGB {
  return rate >= 90 ? C.green : rate >= 80 ? C.amber : C.red;
}
function statusLabel(rate: number): string {
  return rate >= 90 ? "On Track" : rate >= 80 ? "Needs Attention" : "Below Target";
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ══════════════════════════════════════════════════════════════════════════════

export function generateSlaPdf(data: SlaReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, LM = 18, RM = 18, CW = 210 - 18 - 18;
  const HDR = 14, FTR = 283, BODY_TOP = HDR + 8, BODY_BOT = FTR - 4;
  let pg = 0;

  // ── Reusable page chrome ────────────────────────────────────────────────────
  function chrome(section: string) {
    pg++;
    // Header band
    doc.setFillColor(...C.navy); doc.rect(0, 0, W, HDR, "F");
    doc.setFillColor(...C.indigo); doc.rect(0, 0, 3, HDR, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.indigoLt);
    doc.text("SLA COMPLIANCE REPORT", LM + 2, 9);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
    doc.text(section, W - RM, 9, { align: "right" });
    // Footer
    doc.setFillColor(...C.navy); doc.rect(0, FTR, W, H - FTR, "F");
    doc.setFillColor(...C.indigo); doc.rect(0, FTR, W, 0.4, "F");
    doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text(`Generated: ${data.generatedAt}  •  Confidential`, LM, FTR + 5);
    doc.text(`Page ${pg}`, W - RM, FTR + 5, { align: "right" });
  }

  // ── Section heading ─────────────────────────────────────────────────────────
  function sectionHead(title: string, y: number, accent: RGB = C.indigo): number {
    doc.setFillColor(...accent); doc.rect(LM, y, 3, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...C.text);
    doc.text(title, LM + 6, y + 5);
    doc.setFillColor(...C.border); doc.rect(LM + 6, y + 6.5, CW - 6, 0.3, "F");
    return y + 12;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...C.pageBg); doc.rect(0, 0, W, H, "F");

  // Left accent stripe
  doc.setFillColor(...C.indigo); doc.rect(0, 0, 5, H, "F");

  // Top rule
  doc.setFillColor(...C.indigo); doc.rect(5, 38, W - 5, 0.6, "F");

  // Eyebrow
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.indigoLt);
  doc.text("VULNERABILITY MANAGEMENT", LM + 2, 32);

  // Main title
  doc.setFont("helvetica", "bold"); doc.setFontSize(34); doc.setTextColor(...C.white);
  doc.text("SLA Compliance", LM + 2, 58);
  doc.text("Report", LM + 2, 73);

  if (data.organizationName) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...C.silver);
    doc.text(data.organizationName, LM + 2, 84);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...C.muted);
  doc.text(`Generated: ${data.generatedAt}`, LM + 2, 93);

  // Overall compliance hero box
  const heroRgb = statusRgb(data.overallRate);
  const heroLbl = statusLabel(data.overallRate);

  doc.setFillColor(...C.navy);
  doc.roundedRect(LM + 2, 106, 54, 42, 3, 3, "F");
  doc.setDrawColor(...heroRgb); doc.setLineWidth(1.2);
  doc.roundedRect(LM + 2, 106, 54, 42, 3, 3, "S");

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...C.indigoLt);
  doc.text("OVERALL COMPLIANCE", LM + 2 + 27, 114, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(28); doc.setTextColor(...heroRgb);
  doc.text(`${data.overallRate}%`, LM + 2 + 27, 130, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...C.white);
  doc.text(heroLbl, LM + 2 + 27, 141, { align: "center" });

  // Three stat boxes (right of hero)
  const stats = [
    { label: "SLA Breaches",      value: String(data.totalBreached), rgb: C.red    },
    { label: "Expiring in 7 days", value: String(data.totalAtRisk),  rgb: C.amber  },
    { label: "Open Vulnerabilities", value: String(data.openCount),  rgb: C.indigo },
  ];
  stats.forEach((s, i) => {
    const bx = LM + 62, by = 106 + i * 14.5;
    doc.setFillColor(...C.navy); doc.roundedRect(bx, by, 112, 12, 2, 2, "F");
    doc.setFillColor(...s.rgb); doc.rect(bx, by, 3, 12, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...s.rgb);
    doc.text(s.value, bx + 22, by + 8.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.silver);
    doc.text(s.label, bx + 40, by + 8.5);
  });

  // Confidential footer
  doc.setFillColor(...C.indigo); doc.rect(0, H - 9, W, 9, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...C.white);
  doc.text("CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY", W / 2, H - 3.5, { align: "center" });

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — COMPLIANCE OVERVIEW
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(...C.pageBg); doc.rect(0, 0, W, H, "F");
  chrome("Compliance Overview");

  let y = BODY_TOP;
  y = sectionHead("SLA Compliance by Severity", y);

  // Severity rows with progress bars
  data.sevStats.forEach(s => {
    const sRgb = sevRgb(s.sev);
    const barX  = LM + 28, barW = CW - 32;
    const targX = barX + (90 / 100) * barW;

    // Severity label + SLA limit
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...sRgb);
    doc.text(s.sev, LM, y + 5.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
    doc.text(`${s.limit}d`, LM, y + 11);

    // Background track
    doc.setFillColor(...tint(sRgb, 0.12)); doc.roundedRect(barX, y + 1, barW, 8, 1, 1, "F");

    // Filled bar
    const fw = Math.max(0, (s.rate / 100) * barW);
    if (fw > 0) { doc.setFillColor(...sRgb); doc.roundedRect(barX, y + 1, fw, 8, 1, 1, "F"); }

    // Target dashed line at 90%
    doc.setDrawColor(...C.red); doc.setLineWidth(0.4);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.line(targX, y, targX, y + 10);
    doc.setLineDashPattern([], 0);

    // Rate label
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...sRgb);
    doc.text(`${s.rate}%`, barX + barW + 3, y + 6.5);

    // Counters
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text(`${s.breached} breach  ${s.atRisk} at-risk  ${s.total} open`, barX + barW + 3, y + 11.5);

    y += 17;
  });

  // 90% target note
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...C.red);
  doc.text("Dashed line = 90% compliance target", LM, y);
  y += 8;

  // ── Summary callout ──────────────────────────────────────────────────────
  const heroRgb2 = statusRgb(data.overallRate);
  doc.setFillColor(...C.navy); doc.roundedRect(LM, y, CW, 26, 3, 3, "F");
  doc.setFillColor(...heroRgb2); doc.rect(LM, y, 4, 26, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...C.white);
  doc.text(`Overall SLA Compliance: ${data.overallRate}%  —  ${statusLabel(data.overallRate)}`, LM + 8, y + 9);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...C.indigoLt);
  const summaryTxt = `${data.totalBreached} vulnerabilities are currently in breach. ${data.totalAtRisk} are expiring within 7 days and require immediate escalation.`;
  doc.text(doc.splitTextToSize(summaryTxt, CW - 12), LM + 8, y + 18);
  y += 34;

  // ── Per-severity mini cards (2×2) ────────────────────────────────────────
  if (y < BODY_BOT - 60) {
    y = sectionHead("Severity Breakdown", y);
    const cw2 = (CW - 4) / 2, ch = 28;
    data.sevStats.forEach((s, i) => {
      const cx = LM + (i % 2) * (cw2 + 4), cy = y + Math.floor(i / 2) * (ch + 4);
      const sRgb = sevRgb(s.sev);
      doc.setFillColor(...C.navy); doc.roundedRect(cx, cy, cw2, ch, 2, 2, "F");
      doc.setFillColor(...sRgb); doc.rect(cx, cy, cw2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...sRgb);
      doc.text(s.sev.toUpperCase(), cx + 4, cy + 8);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.muted);
      doc.text(`${s.limit}d SLA`, cx + cw2 - 4, cy + 8, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...sRgb);
      doc.text(`${s.rate}%`, cx + 4, cy + 21);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.muted);
      doc.text(`${s.breached} breached  •  ${s.atRisk} at risk  •  ${s.total} open`, cx + cw2 - 4, cy + 21, { align: "right" });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — BREACH DETAIL
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(...C.pageBg); doc.rect(0, 0, W, H, "F");
  chrome("SLA Breach Detail");

  y = BODY_TOP;
  y = sectionHead(`SLA Breach Detail  (${data.totalBreached} vulnerabilities)`, y, C.red);

  if (data.breachedVulns.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text("No SLA breaches detected — all open vulnerabilities are within their remediation windows.", LM, y + 6);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: LM, right: RM },
      tableWidth: CW,
      head: [["CVE ID", "Asset", "Sev", "SLA Start", "Orig Open", "Reopen #", "Open", "Overdue", "Urgency"]],
      body: data.breachedVulns.slice(0, 60).map(v => {
        const od = Math.abs(v.daysLeft);
        return [v.cveId, v.asset.slice(0, 24), v.severity, v.effectiveSlaStart, v.originalOpenDate, String(v.reopenCount), String(v.daysOpen), `+${od}d`, urgLabel(od)];
      }),
      headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: "bold", fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: C.text, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2, fillColor: C.pageBg },
      alternateRowStyles: { fillColor: tint(C.navy, 0.5) },
      columnStyles: {
        0: { cellWidth: 32, font: "courier" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 21, halign: "center" },
        4: { cellWidth: 21, halign: "center" },
        5: { cellWidth: 14, halign: "center" },
        6: { cellWidth: 14, halign: "center" },
        7: { cellWidth: 16, halign: "center" },
        8: { cellWidth: 18, halign: "center" },
      },
      didDrawCell: hook => {
        if (hook.section !== "body") return;
        const v = data.breachedVulns[hook.row.index];
        if (!v) return;
        const od = Math.abs(v.daysLeft);
        if (hook.column.index === 2) {
          const rgb = sevRgb(v.severity); hook.cell.text = [];
          doc.setFillColor(...tint(rgb, 0.18));
          doc.roundedRect(hook.cell.x + 1, hook.cell.y + 1, hook.cell.width - 2, hook.cell.height - 2, 1, 1, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...rgb);
          doc.text(v.severity, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        if (hook.column.index === 7) {
          hook.cell.text = []; doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...urgRgb(od));
          doc.text(`+${od}d`, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        if (hook.column.index === 8) {
          const rgb = urgRgb(od); hook.cell.text = [];
          doc.setFillColor(...tint(rgb, 0.18));
          doc.roundedRect(hook.cell.x + 1, hook.cell.y + 1, hook.cell.width - 2, hook.cell.height - 2, 1, 1, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...rgb);
          doc.text(urgLabel(od), hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        doc.setFont("helvetica", "normal"); doc.setTextColor(...C.text);
      },
    });
    const finalY = (doc as any).lastAutoTable.finalY;
    if (data.breachedVulns.length > 60) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...C.muted);
      doc.text(`Showing 60 of ${data.breachedVulns.length} breached vulnerabilities. Export CSV for the full list.`, LM, finalY + 5);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — APPROACHING DEADLINES + ACTION
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(...C.pageBg); doc.rect(0, 0, W, H, "F");
  chrome("Approaching Deadlines");

  y = BODY_TOP;
  y = sectionHead(`Expiring Within 7 Days  (${data.atRiskVulns.length} vulnerabilities)`, y, C.amber);

  if (data.atRiskVulns.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text("No vulnerabilities are expiring within the next 7 days.", LM, y + 6);
    y += 14;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: LM, right: RM },
      tableWidth: CW,
      head: [["CVE ID", "Asset", "Sev", "SLA Start", "Orig Open", "Reopen #", "Days Open", "Days Left", "Used %"]],
      body: data.atRiskVulns.slice(0, 60).map(v => [
        v.cveId, v.asset.slice(0, 24), v.severity, v.effectiveSlaStart, v.originalOpenDate, String(v.reopenCount),
        String(v.daysOpen), `${v.daysLeft}d`, `${v.slaUsedPct}%`,
      ]),
      headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: "bold", fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: C.text, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2, fillColor: C.pageBg },
      alternateRowStyles: { fillColor: tint(C.navy, 0.5) },
      columnStyles: {
        0: { cellWidth: 32, font: "courier" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 21, halign: "center" },
        4: { cellWidth: 21, halign: "center" },
        5: { cellWidth: 14, halign: "center" },
        6: { cellWidth: 16, halign: "center" },
        7: { cellWidth: 16, halign: "center" },
        8: { cellWidth: 16, halign: "center" },
      },
      didDrawCell: hook => {
        if (hook.section !== "body") return;
        const v = data.atRiskVulns[hook.row.index];
        if (!v) return;
        if (hook.column.index === 2) {
          const rgb = sevRgb(v.severity); hook.cell.text = [];
          doc.setFillColor(...tint(rgb, 0.18));
          doc.roundedRect(hook.cell.x + 1, hook.cell.y + 1, hook.cell.width - 2, hook.cell.height - 2, 1, 1, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...rgb);
          doc.text(v.severity, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        if (hook.column.index === 7) {
          hook.cell.text = []; doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.amber);
          doc.text(`${v.daysLeft}d`, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        if (hook.column.index === 8) {
          const pct = v.slaUsedPct; const rgb: RGB = pct >= 85 ? C.red : pct >= 60 ? C.amber : C.green;
          hook.cell.text = [];
          doc.setFillColor(...tint(rgb, 0.18));
          doc.roundedRect(hook.cell.x + 1, hook.cell.y + 1, hook.cell.width - 2, hook.cell.height - 2, 1, 1, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...rgb);
          doc.text(`${pct}%`, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        }
        doc.setFont("helvetica", "normal"); doc.setTextColor(...C.text);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Action callout
  if (y < BODY_BOT - 28) {
    doc.setFillColor(...C.navy); doc.roundedRect(LM, y, CW, 28, 3, 3, "F");
    doc.setFillColor(...C.amber); doc.rect(LM, y, 4, 28, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.white);
    doc.text("Recommended Actions", LM + 9, y + 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...C.indigoLt);
    const actionTxt = `Escalate the ${data.totalBreached} breached and ${data.totalAtRisk} at-risk vulnerabilities to asset owners immediately. Prioritise Critical and High severity items. Target ≥ 90% overall SLA compliance.`;
    doc.text(doc.splitTextToSize(actionTxt, CW - 14), LM + 9, y + 19);
  }

  doc.save("SLA_Compliance_Report.pdf");
}

// ══════════════════════════════════════════════════════════════════════════════
// PPTX GENERATION  (LAYOUT_16x9 — dark navy throughout)
// ══════════════════════════════════════════════════════════════════════════════

export async function generateSlaPptx(data: SlaReportData): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10" × 7.5"

  // Hex palette (no #)
  const T = {
    bg:      "0B1627", navy:    "0F1F3D", navyMid: "152B50",
    indigo:  "6366F1", indigoLt:"A5B4FC",
    green:   "10B981", amber:   "F59E0B", red:     "EF4444",
    yellow:  "EAB308", blue:    "60A5FA",
    white:   "FFFFFF", silver:  "CBD5E1", muted:   "64748B",
    border:  "1E3355",
  };

  function sHex(sev: string) {
    return ({ Critical: T.red, High: T.amber, Medium: T.yellow, Low: T.blue } as Record<string,string>)[sev] ?? T.muted;
  }
  function uHex(od: number) {
    return od >= 60 ? T.red : od >= 30 ? T.amber : od >= 7 ? T.yellow : T.blue;
  }
  function uLbl(od: number) {
    return od >= 60 ? "Critical" : od >= 30 ? "High" : od >= 7 ? "Medium" : "Low";
  }
  function rateHex(r: number) { return r >= 90 ? T.green : r >= 80 ? T.amber : T.red; }
  function rateLbl(r: number) { return r >= 90 ? "On Track" : r >= 80 ? "Needs Attention" : "Below Target"; }

  function footer(s: PptxGenJS.Slide, pg: string) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.18, w: "100%", h: 0.02, fill: { color: T.indigo } });
    s.addText(`SLA Compliance Report  •  ${data.generatedAt}  •  Confidential`, { x: 0.3, y: 7.22, w: 7, h: 0.2, fontSize: 7, color: T.muted });
    s.addText(pg, { x: 7.3, y: 7.22, w: 2.4, h: 0.2, fontSize: 7, color: T.muted, align: "right" });
  }

  function header(s: PptxGenJS.Slide, title: string, accent = T.indigo) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.7, fill: { color: T.navy } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.09, h: 0.7, fill: { color: accent } });
    s.addText(title, { x: 0.2, y: 0.08, w: 9.5, h: 0.55, fontSize: 16, bold: true, color: T.white, fontFace: "Calibri" });
  }

  // ── SLIDE 1: COVER ──────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: T.bg };

    // Left accent stripe
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: T.indigo } });
    // Top rule
    s.addShape(pptx.ShapeType.rect, { x: 0.12, y: 0.7, w: 9.88, h: 0.04, fill: { color: T.indigo } });

    // Title
    s.addText("SLA Compliance\nReport", { x: 0.35, y: 0.9, w: 5.5, h: 2.0, fontSize: 38, bold: true, color: T.white, fontFace: "Calibri" });
    s.addText("Vulnerability Management", { x: 0.35, y: 2.95, w: 5.5, h: 0.4, fontSize: 13, color: T.indigoLt, italic: true });
    if (data.organizationName) {
      s.addText(data.organizationName, { x: 0.35, y: 3.42, w: 5.5, h: 0.38, fontSize: 12, color: T.silver });
    }
    s.addText(`Generated: ${data.generatedAt}`, { x: 0.35, y: 3.9, w: 5.5, h: 0.28, fontSize: 9, color: T.muted });

    // Compliance score card
    const heroHex = rateHex(data.overallRate);
    s.addShape(pptx.ShapeType.roundRect, { x: 6.4, y: 1.0, w: 3.3, h: 2.8, fill: { color: T.navy }, line: { color: heroHex, width: 2 }, rectRadius: 0.1 });
    s.addText("OVERALL COMPLIANCE", { x: 6.4, y: 1.2, w: 3.3, h: 0.32, fontSize: 8, bold: true, color: T.indigoLt, align: "center" });
    s.addText(`${data.overallRate}%`, { x: 6.4, y: 1.52, w: 3.3, h: 1.2, fontSize: 52, bold: true, color: heroHex, align: "center" });
    s.addText(rateLbl(data.overallRate), { x: 6.4, y: 2.7, w: 3.3, h: 0.42, fontSize: 11, bold: true, color: T.white, align: "center" });

    // Three stat rows
    const stats = [
      { label: "SLA Breaches",       value: String(data.totalBreached), hex: T.red   },
      { label: "Expiring in 7 days", value: String(data.totalAtRisk),   hex: T.amber },
      { label: "Open Vulnerabilities",value: String(data.openCount),    hex: T.indigo },
    ];
    stats.forEach((st, i) => {
      const sy = 4.05 + i * 1.0;
      s.addShape(pptx.ShapeType.roundRect, { x: 0.35, y: sy, w: 9.3, h: 0.82, fill: { color: T.navy }, line: { color: T.border, width: 0.5 }, rectRadius: 0.06 });
      s.addShape(pptx.ShapeType.rect, { x: 0.35, y: sy, w: 0.07, h: 0.82, fill: { color: st.hex } });
      s.addText(st.value, { x: 0.5, y: sy + 0.06, w: 1.5, h: 0.7, fontSize: 26, bold: true, color: st.hex });
      s.addText(st.label, { x: 2.1, y: sy + 0.22, w: 7.4, h: 0.38, fontSize: 11, color: T.silver });
    });

    // Bottom bar
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.3, w: "100%", h: 0.2, fill: { color: T.indigo } });
    s.addText("CONFIDENTIAL", { x: 0, y: 7.3, w: "100%", h: 0.2, fontSize: 7, bold: true, color: T.white, align: "center" });
  }

  // ── SLIDE 2: COMPLIANCE DASHBOARD ──────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: T.bg };
    header(s, "SLA Compliance Dashboard");
    footer(s, "2");

    // 4 severity stat cards
    data.sevStats.forEach((st, i) => {
      const x = 0.18 + i * 2.43, hex = sHex(st.sev);
      s.addShape(pptx.ShapeType.roundRect, { x, y: 0.82, w: 2.3, h: 1.55, fill: { color: T.navy }, line: { color: T.border, width: 0.5 }, rectRadius: 0.07 });
      s.addShape(pptx.ShapeType.rect, { x, y: 0.82, w: 2.3, h: 0.06, fill: { color: hex } });
      s.addText(st.sev, { x: x + 0.1, y: 0.97, w: 1.4, h: 0.28, fontSize: 9, bold: true, color: hex });
      s.addText(`${st.limit}d SLA`, { x: x + 0.1, y: 0.97, w: 2.1, h: 0.28, fontSize: 8, color: T.muted, align: "right" });
      s.addText(`${st.rate}%`, { x: x + 0.1, y: 1.25, w: 1.4, h: 0.72, fontSize: 30, bold: true, color: hex });
      s.addText(`${st.breached} breach  •  ${st.atRisk} at risk`, { x: x + 0.1, y: 2.0, w: 2.1, h: 0.28, fontSize: 7.5, color: T.muted });
      // Progress bar
      s.addShape(pptx.ShapeType.roundRect, { x: x + 0.1, y: 2.28, w: 2.1, h: 0.1, fill: { color: T.navyMid }, rectRadius: 0.03 });
      if (st.rate > 0) s.addShape(pptx.ShapeType.roundRect, { x: x + 0.1, y: 2.28, w: 2.1 * (st.rate / 100), h: 0.1, fill: { color: hex }, rectRadius: 0.03 });
    });

    // Horizontal bar chart
    s.addText("Compliance vs. 90% Target", { x: 0.3, y: 2.62, w: 9.4, h: 0.3, fontSize: 11, bold: true, color: T.white });
    // legend
    s.addShape(pptx.ShapeType.line, { x: 7.8, y: 2.74, w: 0.3, h: 0, line: { color: T.red, width: 1.5, dashType: "dash" } });
    s.addText("90% target", { x: 8.15, y: 2.66, w: 1.5, h: 0.24, fontSize: 8, color: T.silver });

    const barX = 1.9, barMax = 7.6, targX = barX + 0.9 * barMax;
    data.sevStats.forEach((st, i) => {
      const ry = 3.0 + i * 0.95, hex = sHex(st.sev), fw = (st.rate / 100) * barMax;
      s.addText(st.sev, { x: 0.2, y: ry + 0.1, w: 1.65, h: 0.44, fontSize: 9.5, color: T.silver, align: "right" });
      s.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + 0.12, w: barMax, h: 0.44, fill: { color: T.navyMid }, rectRadius: 0.04 });
      if (fw > 0) s.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + 0.12, w: fw, h: 0.44, fill: { color: hex }, rectRadius: 0.04 });
      s.addShape(pptx.ShapeType.line, { x: targX, y: ry + 0.06, w: 0, h: 0.56, line: { color: T.red, width: 1.5, dashType: "dash" } });
      s.addText(`${st.rate}%`, { x: barX + barMax + 0.1, y: ry + 0.12, w: 0.7, h: 0.44, fontSize: 9, bold: true, color: hex });
    });
  }

  // ── SLIDE 3: BREACH WATCHLIST ───────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: T.bg };
    header(s, `SLA Breach Watchlist  —  ${data.totalBreached} vulnerabilities`, T.red);
    footer(s, "3");

    const top = data.breachedVulns.slice(0, 16);
    if (top.length === 0) {
      s.addText("No SLA breaches detected — all open vulnerabilities are within their remediation windows.", {
        x: 0.5, y: 3.5, w: 9.0, h: 0.5, fontSize: 12, color: T.muted, align: "center", italic: true,
      });
    } else {
      const tableRows: PptxGenJS.TableRow[] = [
        [
          { text: "CVE ID",    options: { bold: true, color: T.indigoLt, fill: { color: T.navy } } },
          { text: "Asset",     options: { bold: true, color: T.indigoLt, fill: { color: T.navy } } },
          { text: "Severity",  options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "SLA Start", options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Reopens",   options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Days Open", options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Overdue",   options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Urgency",   options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
        ],
        ...top.map((v, ri) => {
          const od  = Math.abs(v.daysLeft);
          const bg  = ri % 2 === 0 ? T.bg : T.navyMid;
          return [
            { text: v.cveId,               options: { color: T.silver, fill: { color: bg }, fontSize: 7.5 } },
            { text: v.asset.slice(0, 28),  options: { color: T.silver, fill: { color: bg } } },
            { text: v.severity,            options: { color: sHex(v.severity), fill: { color: bg }, align: "center", bold: true } },
            { text: v.effectiveSlaStart,   options: { color: T.silver, fill: { color: bg }, align: "center", fontSize: 7.2 } },
            { text: String(v.reopenCount), options: { color: T.silver, fill: { color: bg }, align: "center" } },
            { text: String(v.daysOpen),    options: { color: T.silver, fill: { color: bg }, align: "center" } },
            { text: `+${od}d`,             options: { color: T.red,    fill: { color: bg }, align: "center", bold: true } },
            { text: uLbl(od),              options: { color: uHex(od), fill: { color: bg }, align: "center", bold: true } },
          ] as PptxGenJS.TableRow;
        }),
      ];
      s.addTable(tableRows, {
        x: 0.3, y: 0.82, w: 9.4,
        colW: [1.75, 2.05, 0.8, 1.1, 0.7, 0.85, 0.85, 0.9] as number[],
        border: { type: "solid", color: T.border, pt: 0.4 },
        fontFace: "Calibri", fontSize: 9, rowH: 0.34,
      });
      if (data.breachedVulns.length > 16) {
        s.addText(`Showing top 16 of ${data.breachedVulns.length} breached vulnerabilities — export CSV for the full list.`, {
          x: 0.3, y: 0.82 + 0.38 + top.length * 0.34 + 0.1, w: 9.4, h: 0.22,
          fontSize: 7.5, color: T.muted, italic: true,
        });
      }
    }
  }

  // ── SLIDE 4: APPROACHING DEADLINES ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: T.bg };
    header(s, `Approaching Deadlines  —  ${data.totalAtRisk} expiring within 7 days`, T.amber);
    footer(s, "4");

    const top = data.atRiskVulns.slice(0, 14);
    if (top.length === 0) {
      s.addText("No vulnerabilities are expiring within the next 7 days.", {
        x: 0.5, y: 3.5, w: 9.0, h: 0.5, fontSize: 12, color: T.muted, align: "center", italic: true,
      });
    } else {
      const tableRows: PptxGenJS.TableRow[] = [
        [
          { text: "CVE ID",    options: { bold: true, color: T.indigoLt, fill: { color: T.navy } } },
          { text: "Asset",     options: { bold: true, color: T.indigoLt, fill: { color: T.navy } } },
          { text: "Severity",  options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "SLA Start", options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Reopens",   options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Days Open", options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "Days Left", options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
          { text: "SLA Used",  options: { bold: true, color: T.indigoLt, fill: { color: T.navy }, align: "center" } },
        ],
        ...top.map((v, ri) => {
          const pctHex = v.slaUsedPct >= 85 ? T.red : v.slaUsedPct >= 60 ? T.amber : T.green;
          const bg  = ri % 2 === 0 ? T.bg : T.navyMid;
          return [
            { text: v.cveId,              options: { color: T.silver, fill: { color: bg }, fontSize: 7.5 } },
            { text: v.asset.slice(0, 28), options: { color: T.silver, fill: { color: bg } } },
            { text: v.severity,           options: { color: sHex(v.severity), fill: { color: bg }, align: "center", bold: true } },
            { text: v.effectiveSlaStart,  options: { color: T.silver,  fill: { color: bg }, align: "center", fontSize: 7.2 } },
            { text: String(v.reopenCount),options: { color: T.silver,  fill: { color: bg }, align: "center" } },
            { text: String(v.daysOpen),   options: { color: T.silver,  fill: { color: bg }, align: "center" } },
            { text: `${v.daysLeft}d`,     options: { color: T.amber,   fill: { color: bg }, align: "center", bold: true } },
            { text: `${v.slaUsedPct}%`,   options: { color: pctHex,    fill: { color: bg }, align: "center", bold: true } },
          ] as PptxGenJS.TableRow;
        }),
      ];
      s.addTable(tableRows, {
        x: 0.3, y: 0.82, w: 9.4,
        colW: [1.75, 2.05, 0.8, 1.1, 0.7, 0.85, 0.85, 0.9] as number[],
        border: { type: "solid", color: T.border, pt: 0.4 },
        fontFace: "Calibri", fontSize: 9, rowH: 0.36,
      });
    }

    // Action callout
    const boxY = top.length > 0 ? (0.82 + 0.4 + top.length * 0.36 + 0.18) : 2.5;
    if (boxY < 6.8) {
      s.addShape(pptx.ShapeType.roundRect, { x: 0.3, y: boxY, w: 9.4, h: 0.8, fill: { color: T.navy }, line: { color: T.border, width: 0.5 }, rectRadius: 0.07 });
      s.addShape(pptx.ShapeType.rect, { x: 0.3, y: boxY, w: 0.07, h: 0.8, fill: { color: T.amber } });
      s.addText(
        `Recommended: Escalate the ${data.totalAtRisk} at-risk and ${data.totalBreached} breached vulnerabilities to asset owners immediately. Target ≥ 90% overall SLA compliance.`,
        { x: 0.48, y: boxY + 0.1, w: 9.1, h: 0.62, fontSize: 8.5, color: T.silver, wrap: true },
      );
    }
  }

  await pptx.writeFile({ fileName: "SLA_Compliance_Report.pptx" });
}
