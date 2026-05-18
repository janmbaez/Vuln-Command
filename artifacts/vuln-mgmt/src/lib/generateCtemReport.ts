/**
 * CTEM Report Generator
 * Generates PDF and PowerPoint reports from CTEM maturity data using jsPDF and PptxGenJS.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PillarScore {
  key: string;
  label: string;
  score: number;
  color: string;
  description: string;
  levels: string[];
  recommendations: string[];
}

export interface CtemReportData {
  pillars: PillarScore[];
  overallScore: number;
  overallLabel: string;
  totalVulnerabilities: number;
  openCritical: number;
  openHigh: number;
  slaCompliance: number;
  remediationRate: number;
  generatedAt: string;
  organizationName?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MATURITY_LABELS = ["", "Initial", "Developing", "Defined", "Managed", "Optimizing"];

// Dark navy brand colors
const BRAND = {
  dark: "#0f172a",
  navy: "#1e3a5f",
  primary: "#6366f1",
  primaryLight: "#818cf8",
  accent: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  muted: "#64748b",
  light: "#f1f5f9",
  white: "#ffffff",
};

function maturityColor(level: number): string {
  const map: Record<number, string> = {
    1: "#6b7280",
    2: "#f59e0b",
    3: "#3b82f6",
    4: "#10b981",
    5: "#6366f1",
  };
  return map[level] ?? "#64748b";
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ── PDF GENERATION ─────────────────────────────────────────────────────────────

export function generateCtemPdf(data: CtemReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const LM = 18, RM = 18;           // left / right margins
  const CW = W - LM - RM;           // content width  = 174 mm
  const HDR_H = 16;                  // header bar height on content pages
  const FTR_Y = 283;                 // footer line Y
  const BODY_TOP = HDR_H + 9;       // body start Y on content pages
  const BODY_BOT = FTR_Y - 3;       // body end Y on content pages

  // ── Colour system (all RGB, no 8-char hex) ───────────────────────────────
  type RGB = [number, number, number];
  const C: Record<string, RGB> = {
    coverBg:  [11,  22,  39],
    navy:     [15,  27,  56],
    navyMid:  [24,  52,  94],
    indigo:   [99,  102, 241],
    indigoLt: [165, 180, 252],
    dark:     [15,  23,  42],
    text:     [31,  41,  55],
    muted:    [100, 116, 139],
    border:   [226, 232, 240],
    pageBg:   [248, 250, 252],
    white:    [255, 255, 255],
    green:    [16,  185, 129],
    amber:    [245, 158, 11],
    red:      [239, 68,  68],
    orange:   [249, 115, 22],
    strip:    [241, 245, 249],
  };

  // Blend colour with white — replaces invalid 8-char hex opacity tricks
  function tint(color: RGB, opacity: number): RGB {
    return color.map((v, _i) =>
      Math.round(255 * (1 - opacity) + v * opacity)
    ) as RGB;
  }

  function mColor(lvl: number): RGB {
    if (lvl <= 1) return [107, 114, 128];
    if (lvl === 2) return C.amber;
    if (lvl === 3) return [59, 130, 246];
    if (lvl === 4) return C.green;
    return C.indigo;
  }

  function pillarRgb(hex: string): RGB {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  // ── Shared helpers ───────────────────────────────────────────────────────
  function chrome(section: string, pgLabel: string) {
    // Header bar
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, W, HDR_H, "F");
    doc.setFillColor(...C.indigo);
    doc.rect(0, 0, 5, HDR_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text("CTEM MATURITY ASSESSMENT", LM + 2, 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.indigoLt);
    doc.text(section.toUpperCase(), W - RM, 10, { align: "right" });

    // Footer
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(LM, FTR_Y, W - RM, FTR_Y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text("Confidential — For Internal Use Only", LM, FTR_Y + 5.5);
    doc.text(data.generatedAt, W / 2, FTR_Y + 5.5, { align: "center" });
    doc.text(pgLabel, W - RM, FTR_Y + 5.5, { align: "right" });
  }

  function sectionHead(title: string, y: number, accentRgb: RGB = C.indigo): number {
    doc.setFillColor(...accentRgb);
    doc.rect(LM, y, 3, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C.dark);
    doc.text(title, LM + 7, y + 6);
    return y + 14;
  }

  // ── PAGE 1 — COVER ──────────────────────────────────────────────────────
  // Full-page dark background
  doc.setFillColor(...C.coverBg);
  doc.rect(0, 0, W, H, "F");

  // Subtle mid-section lighter panel
  doc.setFillColor(...C.navy);
  doc.rect(0, 55, W, 152, "F");

  // Left accent bar
  doc.setFillColor(...C.indigo);
  doc.rect(0, 0, 7, H, "F");

  // ── Top branding ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.indigoLt);
  doc.text("CYBERSECURITY EXECUTIVE INTELLIGENCE", 18, 22);
  doc.setDrawColor(...C.indigo);
  doc.setLineWidth(0.3);
  doc.line(18, 25, W - RM, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...C.white);
  doc.text("CTEM Maturity", 18, 46);
  doc.setTextColor(...C.indigo);
  doc.text("Assessment Report", 18, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C.muted);
  doc.text("Continuous Threat Exposure Management", 18, 72);

  if (data.organizationName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    doc.text(data.organizationName, 18, 84);
  }

  // ── Score hero box ────────────────────────────────────────────────────────
  const sc = mColor(Math.round(data.overallScore));
  // Card
  doc.setFillColor(...tint(C.navy, 0.7));
  doc.roundedRect(18, 100, 72, 62, 3, 3, "F");
  doc.setDrawColor(...sc);
  doc.setLineWidth(1.2);
  doc.roundedRect(18, 100, 72, 62, 3, 3, "S");
  // Big score number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.setTextColor(...sc);
  doc.text(String(data.overallScore), 54, 138, { align: "center" });
  // /5 annotation
  doc.setFontSize(14);
  doc.setTextColor(...C.muted);
  doc.text("/ 5", 68, 138);
  // Label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...C.white);
  doc.text(data.overallLabel.toUpperCase(), 54, 152, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text("OVERALL MATURITY SCORE", 54, 159, { align: "center" });

  // ── Pillar mini-bars ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("PILLAR SCORES", 103, 107);

  data.pillars.forEach((p, i) => {
    const rowY = 113 + i * 10.5;
    const BAR_W = 56, BAR_H = 4.5;
    const fillW = (p.score / 5) * BAR_W;
    const pc = pillarRgb(p.color);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(p.label, 103, rowY + 3.5);

    doc.setFillColor(...tint(C.white, 0.12));
    doc.roundedRect(140, rowY, BAR_W, BAR_H, 1, 1, "F");

    if (fillW > 0) {
      doc.setFillColor(...pc);
      doc.roundedRect(140, rowY, fillW, BAR_H, 1, 1, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...pc);
    doc.text(`${p.score}/5`, W - RM, rowY + 3.5, { align: "right" });
  });

  // ── Bottom stats strip ────────────────────────────────────────────────────
  doc.setFillColor(...C.coverBg);
  doc.rect(0, 222, W, H - 222, "F");
  doc.setFillColor(...C.indigo);
  doc.rect(0, 222, W, 0.5, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text(`Generated: ${data.generatedAt}  •  Confidential`, 18, 234);

  const kpiStrip = [
    { v: String(data.totalVulnerabilities), l: "Total Vulnerabilities" },
    { v: String(data.openCritical),         l: "Open Critical" },
    { v: `${data.slaCompliance}%`,          l: "SLA Compliance" },
    { v: `${data.remediationRate}%`,        l: "Remediation Rate" },
  ];
  const kW = CW / 4;
  kpiStrip.forEach((k, i) => {
    const x = LM + i * kW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.text(k.v, x + kW / 2, 254, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(k.l, x + kW / 2, 261, { align: "center" });
    if (i < 3) {
      doc.setDrawColor(...tint(C.white, 0.15));
      doc.setLineWidth(0.25);
      doc.line(x + kW, 243, x + kW, 268);
    }
  });

  // ── PAGE 2 — EXECUTIVE SUMMARY ───────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, W, H, "F");
  chrome("Executive Summary", "Page 1");

  let y = BODY_TOP;
  y = sectionHead("Executive Summary", y);

  // Intro paragraph
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  const intro = `This report presents the results of a Continuous Threat Exposure Management (CTEM) maturity assessment across five organizational pillars: Scoping, Discovery, Prioritization, Validation, and Mobilization. Scores combine real vulnerability data with self-assessed process maturity.`;
  const introLines = doc.splitTextToSize(intro, CW);
  doc.text(introLines, LM, y);
  y += introLines.length * 4.6 + 7;

  // KPI cards  (5 across)
  const kpis = [
    { label: "Total Vulnerabilities", value: String(data.totalVulnerabilities), rgb: C.indigo,  sub: "in dataset" },
    { label: "Open Critical",         value: String(data.openCritical),         rgb: C.red,     sub: "immediate action" },
    { label: "Open High",             value: String(data.openHigh),             rgb: C.orange,  sub: "60-day SLA" },
    { label: "SLA Compliance",        value: `${data.slaCompliance}%`,          rgb: C.green,   sub: "Crit. & High within SLA" },
    { label: "Remediation Rate",      value: `${data.remediationRate}%`,        rgb: C.green,   sub: "of total closed" },
  ];
  const kCardW = (CW - 4 * 2) / 5;
  kpis.forEach((kpi, i) => {
    const x = LM + i * (kCardW + 2);
    // Card
    doc.setFillColor(...C.white);
    doc.roundedRect(x, y, kCardW, 28, 2, 2, "F");
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, kCardW, 28, 2, 2, "S");
    // Top accent stripe
    doc.setFillColor(...kpi.rgb);
    doc.roundedRect(x, y, kCardW, 3, 1, 1, "F");
    doc.rect(x, y + 1.5, kCardW, 1.5, "F"); // square off bottom of top stripe
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...kpi.rgb);
    doc.text(kpi.value, x + kCardW / 2, y + 14, { align: "center" });
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...C.dark);
    const ll = doc.splitTextToSize(kpi.label, kCardW - 3);
    doc.text(ll, x + kCardW / 2, y + 20, { align: "center" });
    // Sub
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...C.muted);
    doc.text(kpi.sub, x + kCardW / 2, y + 25.5, { align: "center" });
  });
  y += 35;

  // Pillar scores bar chart
  y = sectionHead("CTEM Pillar Scores vs. Target", y);

  data.pillars.forEach((p, i) => {
    const rowY = y + i * 13.5;
    const BAR_W = 100, BAR_H = 6;
    const fillW = (p.score / 5) * BAR_W;
    const targetX = (4 / 5) * BAR_W;
    const pc = pillarRgb(p.color);
    const gap = 4 - p.score;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    doc.text(p.label, LM, rowY + BAR_H - 0.5);

    // Bar track
    doc.setFillColor(...C.border);
    doc.roundedRect(LM + 30, rowY, BAR_W, BAR_H, 1.5, 1.5, "F");
    // Fill
    if (fillW > 0) {
      doc.setFillColor(...pc);
      doc.roundedRect(LM + 30, rowY, fillW, BAR_H, 1.5, 1.5, "F");
    }
    // Target dashed line (level 4)
    doc.setDrawColor(...C.red);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(LM + 30 + targetX, rowY - 1, LM + 30 + targetX, rowY + BAR_H + 1);
    doc.setLineDashPattern([], 0);

    // Score badge
    doc.setFillColor(...pc);
    doc.roundedRect(LM + 135, rowY, 18, BAR_H + 1, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(`${p.score}/5`, LM + 144, rowY + 5, { align: "center" });

    // Level label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(MATURITY_LABELS[p.score], LM + 156, rowY + 5);

    // Gap indicator
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const gapRgb = gap <= 0 ? C.green : gap === 1 ? C.amber : C.red;
    doc.setTextColor(...gapRgb);
    doc.text(gap <= 0 ? "✓ Met" : `+${gap} lvl`, W - RM, rowY + 5, { align: "right" });
  });
  y += data.pillars.length * 13.5 + 4;

  // Legend
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.text("- - -  Target: Level 4 (Managed)    Right: gap to target", LM + 30, y);
  y += 10;

  // Overall maturity callout
  const scoreRgb = mColor(Math.round(data.overallScore));
  doc.setFillColor(...tint(scoreRgb, 0.08));
  doc.roundedRect(LM, y, CW, 26, 3, 3, "F");
  doc.setFillColor(...scoreRgb);
  doc.rect(LM, y, 4, 26, "F");
  doc.roundedRect(LM, y, 5, 26, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...C.dark);
  const overallLabel = `Overall Maturity: `;
  doc.text(overallLabel, LM + 9, y + 9);
  const oLabelW = doc.getTextWidth(overallLabel);
  doc.setTextColor(...scoreRgb);
  doc.text(`${data.overallScore}/5 — ${data.overallLabel}`, LM + 9 + oLabelW, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.text);
  const summText = `Target is Managed (Level 4). Reaching Optimizing (Level 5) requires AI/ML-driven workflows and full SOAR automation.`;
  doc.text(doc.splitTextToSize(summText, CW - 14), LM + 9, y + 17);

  // ── PAGE 3 — PILLAR SCORECARD ────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, W, H, "F");
  chrome("Pillar Scorecard", "Page 2");

  y = BODY_TOP;
  y = sectionHead("Pillar Scorecard & Roadmap", y);

  autoTable(doc, {
    startY: y,
    margin: { left: LM, right: RM },
    tableWidth: CW,
    head: [["#", "Pillar", "Score", "Level", "Target", "Gap", "Top Priority Action"]],
    body: data.pillars.map((p, idx) => [
      String(idx + 1),
      p.label,
      `${p.score}/5`,
      MATURITY_LABELS[p.score],
      "4",
      p.score >= 4 ? "✓ Met" : `+${4 - p.score}`,
      p.score < 4 ? p.recommendations[0] : "Maintain & optimise current capabilities.",
    ]),
    headStyles: {
      fillColor: C.navy,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.text,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      lineColor: C.border,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center", fontStyle: "bold" },
      1: { cellWidth: 30, fontStyle: "bold" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 26, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: "auto" },
    },
    didDrawCell: (hook) => {
      if (hook.section !== "body") return;
      // Colour the Score column
      if (hook.column.index === 2) {
        const score = data.pillars[hook.row.index]?.score ?? 0;
        const rgb = mColor(score);
        hook.cell.text = [];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...rgb);
        doc.text(`${score}/5`, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        doc.setTextColor(...C.text);
        doc.setFont("helvetica", "normal");
      }
      // Colour the Gap column
      if (hook.column.index === 5) {
        const score = data.pillars[hook.row.index]?.score ?? 0;
        const gap = 4 - score;
        const rgb = gap <= 0 ? C.green : gap === 1 ? C.amber : C.red;
        hook.cell.text = [];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...rgb);
        doc.text(gap <= 0 ? "✓" : `+${gap}`, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
        doc.setTextColor(...C.text);
        doc.setFont("helvetica", "normal");
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Maturity scale legend cards
  y = sectionHead("Maturity Scale Reference", y);
  const lvlDefs = [
    { lvl: 1, label: "Initial",    desc: "Ad hoc, reactive. No formal processes." },
    { lvl: 2, label: "Developing", desc: "Basic processes. Manual and periodic." },
    { lvl: 3, label: "Defined",    desc: "Documented, SLA-enforced, tracked." },
    { lvl: 4, label: "Managed",    desc: "Automated, measured, ownership assigned. ← Target" },
    { lvl: 5, label: "Optimizing", desc: "AI/ML-driven, SOAR-integrated, predictive." },
  ];
  const lW = (CW - 4 * 3) / 5;
  lvlDefs.forEach((l, i) => {
    const x = LM + i * (lW + 3);
    const rgb = mColor(l.lvl);
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, lW, 6, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text(`${l.lvl} — ${l.label}`, x + lW / 2, y + 4, { align: "center" });

    doc.setFillColor(...C.white);
    doc.roundedRect(x, y + 6, lW, 16, 0, 0, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(doc.splitTextToSize(l.desc, lW - 3), x + 2, y + 12);
  });

  // ── PAGES 4-8 — ONE PER PILLAR ───────────────────────────────────────────
  data.pillars.forEach((pillar, idx) => {
    doc.addPage();
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, W, H, "F");
    chrome(`Pillar ${idx + 1}: ${pillar.label}`, `Page ${idx + 3}`);

    y = BODY_TOP;

    const pRgb = pillarRgb(pillar.color);
    const pTint = tint(pRgb, 0.10);

    // Pillar header band
    doc.setFillColor(...pTint);
    doc.roundedRect(LM, y, CW, 30, 3, 3, "F");
    doc.setFillColor(...pRgb);
    doc.roundedRect(LM, y, 5, 30, 2, 2, "F");
    doc.rect(LM + 3, y, 2, 30, "F"); // square off right side of accent bar

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...pRgb);
    doc.text(`${idx + 1}. ${pillar.label}`, LM + 10, y + 10);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.text);
    const dLines = doc.splitTextToSize(pillar.description, CW - 50);
    doc.text(dLines, LM + 10, y + 19);

    // Score badge top-right
    const pScRgb = mColor(pillar.score);
    doc.setFillColor(...pScRgb);
    doc.roundedRect(W - RM - 36, y + 4, 36, 22, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.text(`${pillar.score}/5`, W - RM - 18, y + 14.5, { align: "center" });
    doc.setFontSize(7);
    doc.text(MATURITY_LABELS[pillar.score].toUpperCase(), W - RM - 18, y + 21.5, { align: "center" });

    y += 38;

    // Maturity level descriptions table
    y = sectionHead("Maturity Level Descriptions", y, pRgb);

    autoTable(doc, {
      startY: y,
      margin: { left: LM, right: RM },
      tableWidth: CW,
      head: [["Lvl", "Name", "Description"]],
      body: pillar.levels.map((desc, li) => {
        const lvl = li + 1;
        return [
          String(lvl),
          MATURITY_LABELS[lvl] + (lvl === pillar.score ? "  ← Current" : ""),
          desc.split(":")[1]?.trim() || desc,
        ];
      }),
      headStyles: {
        fillColor: C.navy,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 3.5,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 36 },
        2: { cellWidth: "auto" },
      },
      didDrawCell: (hook) => {
        if (hook.section !== "body") return;
        const lvl = hook.row.index + 1;
        const isCurrent = lvl === pillar.score;

        // Highlight current level row
        if (isCurrent) {
          doc.setFillColor(...tint(pRgb, 0.08));
          doc.rect(hook.cell.x, hook.cell.y, hook.cell.width, hook.cell.height, "F");
        }
        // Level number cell — coloured background
        if (hook.column.index === 0) {
          const rgb = mColor(lvl);
          hook.cell.text = [];
          doc.setFillColor(...rgb);
          doc.rect(hook.cell.x, hook.cell.y, hook.cell.width, hook.cell.height, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...C.white);
          doc.text(String(lvl), hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
          doc.setTextColor(...C.text);
        }
        // Current row name in pillar colour
        if (hook.column.index === 1 && isCurrent) {
          hook.cell.text = [];
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...pRgb);
          doc.text(MATURITY_LABELS[lvl] + "  ← Current", hook.cell.x + 2, hook.cell.y + hook.cell.height / 2 + 1);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.text);
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // Recommendations
    if (y < BODY_BOT - 28) {
      y = sectionHead("Recommendations to Advance", y, pRgb);

      pillar.recommendations.forEach((rec, ri) => {
        if (y >= BODY_BOT - 10) return;
        const recLines = doc.splitTextToSize(rec, CW - 16);
        const boxH = Math.max(11, recLines.length * 4.6 + 5);

        // Card
        doc.setFillColor(...C.white);
        doc.roundedRect(LM, y, CW, boxH, 2, 2, "F");
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.roundedRect(LM, y, CW, boxH, 2, 2, "S");
        // Left accent
        doc.setFillColor(...pRgb);
        doc.roundedRect(LM, y, 4, boxH, 1.5, 1.5, "F");
        doc.rect(LM + 2, y, 2, boxH, "F");
        // Number chip
        doc.setFillColor(...tint(pRgb, 0.15));
        doc.roundedRect(LM + 8, y + boxH / 2 - 4, 8, 8, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...pRgb);
        doc.text(String(ri + 1), LM + 12, y + boxH / 2 + 1, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.text);
        doc.text(recLines, LM + 20, y + 6);
        y += boxH + 3;
      });
    }
  });

  // ── FINAL PAGE — ROADMAP & NEXT STEPS ────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, W, H, "F");
  chrome("Roadmap & Next Steps", `Page ${data.pillars.length + 3}`);

  y = BODY_TOP;
  y = sectionHead("Remediation Roadmap & Next Steps", y);

  const sortedPillars = [...data.pillars].sort((a, b) => (4 - a.score) - (4 - b.score));

  autoTable(doc, {
    startY: y,
    margin: { left: LM, right: RM },
    tableWidth: CW,
    head: [["Pillar", "Current", "Target", "Priority Action", "Effort"]],
    body: sortedPillars.map(p => {
      const gap = 4 - p.score;
      const effort = gap >= 3 ? "High" : gap === 2 ? "Medium" : gap === 1 ? "Low" : "Sustain";
      return [
        p.label,
        `${p.score}/5 — ${MATURITY_LABELS[p.score]}`,
        "4 — Managed",
        p.score < 4 ? p.recommendations[0] : "Maintain and optimise current program.",
        effort,
      ];
    }),
    headStyles: {
      fillColor: C.navy,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.text,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      lineColor: C.border,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold" },
      1: { cellWidth: 36 },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: "auto" },
      4: { cellWidth: 18, halign: "center" },
    },
    didDrawCell: (hook) => {
      if (hook.section !== "body" || hook.column.index !== 4) return;
      const effort = sortedPillars[hook.row.index] ? (() => {
        const g = 4 - sortedPillars[hook.row.index].score;
        return g >= 3 ? "High" : g === 2 ? "Medium" : g === 1 ? "Low" : "Sustain";
      })() : "";
      const effortRgb = effort === "High" ? C.red : effort === "Medium" ? C.amber : effort === "Low" ? C.green : C.muted;
      hook.cell.text = [];
      doc.setFillColor(...tint(effortRgb, 0.15));
      doc.roundedRect(hook.cell.x + 1, hook.cell.y + 1.5, hook.cell.width - 2, hook.cell.height - 3, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...effortRgb);
      doc.text(effort, hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: "center" });
      doc.setTextColor(...C.text);
      doc.setFont("helvetica", "normal");
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Closing summary box
  const closRgb = mColor(Math.round(data.overallScore));
  doc.setFillColor(...C.navy);
  doc.roundedRect(LM, y, CW, 38, 4, 4, "F");
  doc.setFillColor(...closRgb);
  doc.roundedRect(LM, y, 5, 38, 3, 3, "F");
  doc.rect(LM + 3, y, 2, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text(`Overall CTEM Maturity: ${data.overallScore}/5 — ${data.overallLabel}`, LM + 10, y + 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.indigoLt);
  const closingText = `The organisation has reached ${data.overallLabel} maturity in its CTEM programme. Priority focus areas are the pillars with the largest gap to Level 4 (Managed). Sustained investment in tooling, automation, and cross-team coordination is required to achieve full programme maturity.`;
  doc.text(doc.splitTextToSize(closingText, CW - 15), LM + 10, y + 20);

  // ── Save ─────────────────────────────────────────────────────────────────
  doc.save("CTEM_Maturity_Report.pdf");
}

// ── POWERPOINT GENERATION ──────────────────────────────────────────────────────
// Dark navy theme throughout — LAYOUT_16x9 (10" × 7.5")

export async function generateCtemPptx(data: CtemReportData): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10" × 7.5"

  // ── Palette (hex strings, no leading #) ──────────────────────────────────
  const T = {
    pageBg:      "0B1627",   // near-black navy page background
    navy:        "0F1F3D",   // card / header background
    navyMid:     "152B50",   // slightly lighter for alternating rows
    indigo:      "6366F1",   // primary accent
    indigoLt:    "A5B4FC",   // light indigo for labels
    teal:        "14B8A6",   // secondary accent
    green:       "10B981",
    amber:       "F59E0B",
    red:         "EF4444",
    white:       "FFFFFF",
    silver:      "CBD5E1",   // body text on dark
    muted:       "64748B",   // de-emphasised text
    gridLine:    "1E3355",   // subtle separators
  };

  // Maturity level colour (returns hex without #)
  function mHex(level: number): string {
    const map: Record<number, string> = {
      1: "6B7280", 2: "F59E0B", 3: "3B82F6", 4: "10B981", 5: "6366F1",
    };
    return map[level] ?? "64748B";
  }

  // Strip leading # from pillar.color
  const pc = (hex: string) => hex.replace("#", "");

  // ── Shared footer ────────────────────────────────────────────────────────
  function addFooter(slide: PptxGenJS.Slide, pageLabel: string) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 7.18, w: "100%", h: 0.02,
      fill: { color: T.indigo },
    });
    slide.addText(`CTEM Maturity Report  •  ${data.generatedAt}  •  Confidential`, {
      x: 0.3, y: 7.22, w: 7, h: 0.22,
      fontSize: 7, color: T.muted,
    });
    slide.addText(pageLabel, {
      x: 7.3, y: 7.22, w: 2.4, h: 0.22,
      fontSize: 7, color: T.muted, align: "right",
    });
  }

  // ── Slide header bar ────────────────────────────────────────────────────
  function addHeader(
    slide: PptxGenJS.Slide,
    title: string,
    accent?: string,
  ) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 0.72,
      fill: { color: T.navy },
    });
    // accent strip on left edge
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.1, h: 0.72,
      fill: { color: accent ?? T.indigo },
    });
    slide.addText(title, {
      x: 0.22, y: 0.08, w: 9.4, h: 0.58,
      fontSize: 17, bold: true, color: T.white, fontFace: "Calibri",
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 1 — COVER
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    s.background = { color: T.pageBg };

    // Diagonal accent panel
    s.addShape(pptx.ShapeType.rect, {
      x: 6.5, y: 0, w: 3.5, h: 7.5,
      fill: { color: T.navy },
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 6.5, y: 0, w: 0.08, h: 7.5,
      fill: { color: T.indigo },
    });

    // Top accent line
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0.55, w: 6.5, h: 0.05,
      fill: { color: T.indigo },
    });

    // Branding eyebrow
    s.addText("CONTINUOUS THREAT EXPOSURE MANAGEMENT", {
      x: 0.4, y: 0.75, w: 6.0, h: 0.3,
      fontSize: 8, bold: true, color: T.indigoLt, charSpacing: 2,
    });

    // Title
    s.addText("CTEM Maturity\nReport", {
      x: 0.4, y: 1.15, w: 6.0, h: 1.8,
      fontSize: 38, bold: true, color: T.white, fontFace: "Calibri",
      paraSpaceAfter: 4,
    });

    if (data.organizationName) {
      s.addText(data.organizationName, {
        x: 0.4, y: 3.05, w: 6.0, h: 0.45,
        fontSize: 14, color: T.silver, italic: true,
      });
    }

    s.addText(`Generated: ${data.generatedAt}`, {
      x: 0.4, y: 3.6, w: 6.0, h: 0.3,
      fontSize: 9, color: T.muted,
    });

    // Score hero (right panel)
    const sHex = mHex(Math.round(data.overallScore));
    s.addText("OVERALL SCORE", {
      x: 6.7, y: 1.6, w: 3.1, h: 0.3,
      fontSize: 8, bold: true, color: T.indigoLt, align: "center", charSpacing: 2,
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: 7.35, y: 1.95, w: 2.0, h: 1.8,
      fill: { color: T.pageBg }, line: { color: sHex, width: 2 }, rectRadius: 0.12,
    });
    s.addText(`${data.overallScore}/5`, {
      x: 7.35, y: 2.1, w: 2.0, h: 1.0,
      fontSize: 42, bold: true, color: sHex, align: "center",
    });
    s.addText(data.overallLabel, {
      x: 7.35, y: 3.05, w: 2.0, h: 0.5,
      fontSize: 11, color: T.white, align: "center", bold: true,
    });

    // Mini pillar bars (right panel)
    s.addText("PILLAR SCORES", {
      x: 6.7, y: 4.05, w: 3.1, h: 0.28,
      fontSize: 7.5, bold: true, color: T.indigoLt, align: "center", charSpacing: 1.5,
    });
    data.pillars.forEach((p, i) => {
      const ry = 4.4 + i * 0.52;
      const maxW = 2.8;
      const fw = (p.score / 5) * maxW;
      s.addShape(pptx.ShapeType.rect, {
        x: 6.7, y: ry + 0.2, w: maxW, h: 0.15,
        fill: { color: T.navyMid },
      });
      if (fw > 0) {
        s.addShape(pptx.ShapeType.rect, {
          x: 6.7, y: ry + 0.2, w: fw, h: 0.15,
          fill: { color: pc(p.color) },
        });
      }
      s.addText(p.label, {
        x: 6.7, y: ry, w: 2.0, h: 0.22,
        fontSize: 7.5, color: T.silver,
      });
      s.addText(`${p.score}/5`, {
        x: 9.2, y: ry, w: 0.5, h: 0.22,
        fontSize: 7.5, bold: true, color: pc(p.color), align: "right",
      });
    });

    // Bottom confidential bar
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 7.3, w: "100%", h: 0.2,
      fill: { color: T.indigo },
    });
    s.addText("CONFIDENTIAL", {
      x: 0, y: 7.3, w: "100%", h: 0.2,
      fontSize: 7, bold: true, color: T.white, align: "center", charSpacing: 3,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 2 — EXECUTIVE SUMMARY KPIs
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    s.background = { color: T.pageBg };
    addHeader(s, "Executive Summary");
    addFooter(s, "2");

    // KPI metric cards
    const kpis = [
      { label: "Total Vulnerabilities", value: String(data.totalVulnerabilities), color: T.indigo },
      { label: "Open Critical",         value: String(data.openCritical),          color: T.red },
      { label: "Open High",             value: String(data.openHigh),              color: T.amber },
      { label: "SLA Compliance",        value: `${data.slaCompliance}%`,           color: T.green },
      { label: "Remediation Rate",      value: `${data.remediationRate}%`,         color: T.teal },
    ];
    const cardW = 1.82;
    const cardH = 1.3;
    kpis.forEach((kpi, i) => {
      const x = 0.14 + i * (cardW + 0.1);
      s.addShape(pptx.ShapeType.roundRect, {
        x, y: 0.85, w: cardW, h: cardH,
        fill: { color: T.navy }, line: { color: T.gridLine, width: 0.5 }, rectRadius: 0.08,
      });
      // Top accent stripe
      s.addShape(pptx.ShapeType.rect, {
        x, y: 0.85, w: cardW, h: 0.06,
        fill: { color: kpi.color },
      });
      s.addText(kpi.value, {
        x: x + 0.05, y: 1.0, w: cardW - 0.1, h: 0.72,
        fontSize: 28, bold: true, color: kpi.color, align: "center",
      });
      s.addText(kpi.label, {
        x: x + 0.05, y: 1.75, w: cardW - 0.1, h: 0.35,
        fontSize: 8, color: T.silver, align: "center",
      });
    });

    // Pillar bar chart
    s.addText("Pillar Maturity vs. Level 4 Target", {
      x: 0.3, y: 2.38, w: 9.4, h: 0.3,
      fontSize: 11, bold: true, color: T.white,
    });
    // Legend
    s.addShape(pptx.ShapeType.line, {
      x: 7.6, y: 2.51, w: 0.35, h: 0,
      line: { color: T.red, width: 1.5, dashType: "dash" },
    });
    s.addText("Level 4 Target", {
      x: 8.0, y: 2.43, w: 1.7, h: 0.26,
      fontSize: 8, color: T.silver,
    });

    const barAreaX = 1.9;
    const barMaxW  = 7.6;
    const targetX  = barAreaX + (4 / 5) * barMaxW;

    data.pillars.forEach((p, i) => {
      const ry = 2.78 + i * 0.76;
      const fw  = (p.score / 5) * barMaxW;

      // Label
      s.addText(p.label, {
        x: 0.25, y: ry + 0.05, w: 1.6, h: 0.4,
        fontSize: 9, color: T.silver, align: "right",
      });
      // Background track
      s.addShape(pptx.ShapeType.roundRect, {
        x: barAreaX, y: ry + 0.12, w: barMaxW, h: 0.35,
        fill: { color: T.navyMid }, rectRadius: 0.04,
      });
      // Filled bar
      if (fw > 0) {
        s.addShape(pptx.ShapeType.roundRect, {
          x: barAreaX, y: ry + 0.12, w: fw, h: 0.35,
          fill: { color: pc(p.color) }, rectRadius: 0.04,
        });
      }
      // Target dashed line
      s.addShape(pptx.ShapeType.line, {
        x: targetX, y: ry + 0.08, w: 0, h: 0.43,
        line: { color: T.red, width: 1.5, dashType: "dash" },
      });
      // Score label
      s.addText(`${p.score}/5`, {
        x: barAreaX + barMaxW + 0.1, y: ry + 0.1, w: 0.55, h: 0.35,
        fontSize: 9, bold: true, color: pc(p.color),
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDES 3+ — ONE PER PILLAR
  // ══════════════════════════════════════════════════════════════════════════
  data.pillars.forEach((pillar, pi) => {
    const s = pptx.addSlide();
    s.background = { color: T.pageBg };
    addHeader(s, `${pillar.label}  —  CTEM Pillar Detail`, pc(pillar.color));
    addFooter(s, String(pi + 3));

    // Score badge (top-right)
    const scoreHex = mHex(pillar.score);
    s.addShape(pptx.ShapeType.roundRect, {
      x: 8.2, y: 0.08, w: 1.7, h: 0.56,
      fill: { color: T.pageBg }, line: { color: pc(pillar.color), width: 1.5 }, rectRadius: 0.06,
    });
    s.addText(`L${pillar.score}/5  ${MATURITY_LABELS[pillar.score]}`, {
      x: 8.2, y: 0.14, w: 1.7, h: 0.44,
      fontSize: 9.5, bold: true, color: scoreHex, align: "center",
    });

    // Description
    s.addText(pillar.description, {
      x: 0.25, y: 0.82, w: 9.5, h: 0.38,
      fontSize: 9, color: T.silver, italic: true,
    });

    // Left panel — Maturity levels
    s.addText("MATURITY LEVELS", {
      x: 0.25, y: 1.28, w: 4.5, h: 0.26,
      fontSize: 8, bold: true, color: T.indigoLt, charSpacing: 1.5,
    });

    pillar.levels.forEach((desc, idx) => {
      const lvl = idx + 1;
      const isCurrent = lvl === pillar.score;
      const ry = 1.62 + idx * 1.09;
      const bg = isCurrent ? pc(pillar.color) : T.navy;
      const border = isCurrent ? pc(pillar.color) : T.gridLine;

      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.25, y: ry, w: 4.5, h: 0.98,
        fill: { color: bg }, line: { color: border, width: 0.5 }, rectRadius: 0.06,
      });

      // Level number chip
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.32, y: ry + 0.12, w: 0.38, h: 0.38,
        fill: { color: isCurrent ? T.pageBg : T.navyMid }, rectRadius: 0.04,
      });
      s.addText(String(lvl), {
        x: 0.32, y: ry + 0.12, w: 0.38, h: 0.38,
        fontSize: 10, bold: true, color: isCurrent ? pc(pillar.color) : mHex(lvl), align: "center",
      });

      const textColor = isCurrent ? T.white : T.silver;
      const levelLabel = MATURITY_LABELS[lvl] + (isCurrent ? "  ← Current" : "");
      s.addText([
        { text: levelLabel + "\n", options: { bold: true, breakLine: false } },
        { text: desc.split(":")[1]?.trim() || desc, options: { bold: false } },
      ], {
        x: 0.76, y: ry + 0.07, w: 3.9, h: 0.84,
        fontSize: 8, color: textColor, wrap: true,
      });
    });

    // Right panel — Recommendations
    s.addText("RECOMMENDATIONS TO ADVANCE", {
      x: 5.1, y: 1.28, w: 4.7, h: 0.26,
      fontSize: 8, bold: true, color: T.indigoLt, charSpacing: 1.5,
    });

    pillar.recommendations.slice(0, 5).forEach((rec, ri) => {
      const ry = 1.62 + ri * 1.12;
      s.addShape(pptx.ShapeType.roundRect, {
        x: 5.1, y: ry, w: 4.7, h: 1.0,
        fill: { color: T.navy }, line: { color: T.gridLine, width: 0.5 }, rectRadius: 0.06,
      });
      // Left accent stripe
      s.addShape(pptx.ShapeType.rect, {
        x: 5.1, y: ry, w: 0.07, h: 1.0,
        fill: { color: pc(pillar.color) },
      });
      // Number chip
      s.addShape(pptx.ShapeType.roundRect, {
        x: 5.22, y: ry + 0.3, w: 0.34, h: 0.34,
        fill: { color: T.navyMid }, rectRadius: 0.04,
      });
      s.addText(String(ri + 1), {
        x: 5.22, y: ry + 0.3, w: 0.34, h: 0.34,
        fontSize: 9, bold: true, color: pc(pillar.color), align: "center",
      });
      s.addText(rec, {
        x: 5.62, y: ry + 0.1, w: 4.1, h: 0.82,
        fontSize: 8.5, color: T.silver, wrap: true,
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LAST SLIDE — ROADMAP & NEXT STEPS
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    s.background = { color: T.pageBg };
    addHeader(s, "CTEM Maturity Roadmap & Next Steps");
    addFooter(s, String(data.pillars.length + 3));

    const sorted = [...data.pillars].sort((a, b) => (4 - a.score) - (4 - b.score));

    // Table header
    const cols = [
      { label: "Pillar",          w: 1.6  },
      { label: "Current Level",   w: 1.65 },
      { label: "Target",          w: 1.3  },
      { label: "Gap",             w: 0.7  },
      { label: "Priority Action", w: 4.4  },
      { label: "Effort",          w: 0.75 },
    ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const tableX = (10 - tableW) / 2;
    const rowH = 0.86;
    const hdrH = 0.42;
    const startY = 0.84;

    // Header row
    let cx = tableX;
    cols.forEach(col => {
      s.addShape(pptx.ShapeType.rect, {
        x: cx, y: startY, w: col.w, h: hdrH,
        fill: { color: T.navy }, line: { color: T.gridLine, width: 0.5 },
      });
      s.addText(col.label, {
        x: cx + 0.06, y: startY + 0.06, w: col.w - 0.12, h: hdrH - 0.12,
        fontSize: 8.5, bold: true, color: T.indigoLt,
      });
      cx += col.w;
    });

    // Data rows
    sorted.forEach((p, ri) => {
      const gap = 4 - p.score;
      const effort = gap >= 3 ? "High" : gap === 2 ? "Medium" : gap === 1 ? "Low" : "Sustain";
      const effortColor = effort === "High" ? T.red : effort === "Medium" ? T.amber : effort === "Low" ? T.green : T.teal;
      const gapColor = gap === 0 ? T.green : gap === 1 ? T.amber : T.red;
      const ry = startY + hdrH + ri * rowH;
      const rowBg = ri % 2 === 0 ? T.pageBg : T.navyMid;

      // Left pillar accent
      s.addShape(pptx.ShapeType.rect, {
        x: tableX, y: ry, w: 0.07, h: rowH,
        fill: { color: pc(p.color) },
      });

      let rcx = tableX;
      const cells: { text: string; color: string; bold?: boolean; center?: boolean }[] = [
        { text: p.label,                                    color: T.white,              bold: true  },
        { text: `${p.score}/5 — ${MATURITY_LABELS[p.score]}`, color: mHex(p.score),    bold: true  },
        { text: "4 — Managed",                              color: T.silver                          },
        { text: gap === 0 ? "✓ Met" : `+${gap}`,           color: gapColor,             bold: true, center: true },
        { text: p.score < 4 ? p.recommendations[0] : "Maintain and optimize current programme.", color: T.silver },
        { text: effort,                                     color: effortColor,          bold: true, center: true },
      ];

      cells.forEach((cell, ci) => {
        const cw = cols[ci].w;
        s.addShape(pptx.ShapeType.rect, {
          x: rcx, y: ry, w: cw, h: rowH,
          fill: { color: rowBg }, line: { color: T.gridLine, width: 0.3 },
        });
        s.addText(cell.text, {
          x: rcx + (cell.center ? 0 : 0.1), y: ry + 0.06, w: cw - (cell.center ? 0 : 0.1), h: rowH - 0.12,
          fontSize: ci === 4 ? 7.5 : 8.5,
          bold: !!cell.bold,
          color: cell.color,
          align: cell.center ? "center" : "left",
          wrap: true,
        });
        rcx += cw;
      });
    });

    // Closing summary box
    const closingY = startY + hdrH + sorted.length * rowH + 0.2;
    const summaryColor = mHex(Math.round(data.overallScore));
    s.addShape(pptx.ShapeType.roundRect, {
      x: tableX, y: closingY, w: tableW, h: 0.8,
      fill: { color: T.navy }, line: { color: T.gridLine, width: 0.5 }, rectRadius: 0.06,
    });
    s.addShape(pptx.ShapeType.rect, {
      x: tableX, y: closingY, w: 0.07, h: 0.8,
      fill: { color: summaryColor },
    });
    s.addText(
      `Overall CTEM Maturity: ${data.overallScore}/5 — ${data.overallLabel}   |   Target: Managed (Level 4)   |   Focus on pillars with the largest gap to accelerate programme maturity.`,
      {
        x: tableX + 0.15, y: closingY + 0.08, w: tableW - 0.2, h: 0.65,
        fontSize: 8.5, color: T.silver, wrap: true,
      }
    );
  }

  await pptx.writeFile({ fileName: "CTEM_Maturity_Report.pptx" });
}
