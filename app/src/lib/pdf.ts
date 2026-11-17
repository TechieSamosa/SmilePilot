import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { db, getProfile } from "../db";
import type { ClinicProfile, Finding, Patient, Visit } from "../types";
import { ageOf, fmtDate, fmtDateTime, pdfCurrency } from "./format";
import { renderAnnotated } from "./image";
import { labelInfo } from "./labels";
import { PRESET } from "../preset";

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];

/** jsPDF core fonts are Latin-1 only; replace characters they cannot draw. */
function t(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/°/g, " deg")
    .replace(/[^\x00-\xFF\n]/g, "");
}

function header(doc: jsPDF, p: ClinicProfile, title: string): number {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 4, "F");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t(p.clinicName || "Dental Clinic"), 14, 15);
  doc.setFontSize(11);
  doc.text(t(`${p.doctorName}${p.qualification ? `, ${p.qualification}` : ""}`), 14, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const right = [p.registrationNo && `Reg. No: ${p.registrationNo}`, p.phone && `Ph: ${p.phone}`, p.email].filter(Boolean) as string[];
  right.forEach((line, i) => doc.text(t(line), W - 14, 13 + i * 4.5, { align: "right" }));
  if (p.address) doc.text(doc.splitTextToSize(t(p.address), W - 28), 14, 26);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(14, 31, W - 14, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.text(t(title), 14, 38);
  return 42;
}

function patientBlock(doc: jsPDF, patient: Patient, date: number, y: number): number {
  const W = doc.internal.pageSize.getWidth();
  const age = ageOf(patient);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, y, W - 28, 14, 2, 2, "F");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.text(t(patient.name), 18, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(t([age !== undefined ? `${age} y` : "", patient.gender, patient.phone].filter(Boolean).join("  |  ")), 18, y + 11);
  doc.text(`Date: ${t(fmtDate(date))}`, W - 18, y + 6, { align: "right" });
  if (patient.allergies.length) {
    doc.setTextColor(185, 28, 28);
    doc.text(t(`Allergies: ${patient.allergies.join(", ")}`), W - 18, y + 11, { align: "right" });
  }
  return y + 19;
}

function section(doc: jsPDF, title: string, body: string, y: number): number {
  if (!body.trim()) return y;
  const W = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(t(body), W - 28);
  const need = 6 + lines.length * 4.4;
  if (y + need > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 16;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text(t(title.toUpperCase()), 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(lines, 14, y + 5);
  return y + need + 2;
}

function footer(doc: jsPDF, p: ClinicProfile, signature = true) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (signature && i === pages) {
      doc.setDrawColor(...MUTED);
      doc.line(W - 70, H - 26, W - 14, H - 26);
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(t(p.doctorName || "Doctor"), W - 14, H - 21, { align: "right" });
      doc.setTextColor(...MUTED);
      doc.setFontSize(7.5);
      doc.text("Signature", W - 14, H - 17, { align: "right" });
    }
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Generated with ${PRESET.appName} on ${t(fmtDateTime(Date.now()))}  -  Page ${i}/${pages}`, 14, H - 8);
  }
}

async function confirmedFindings(visitId: string): Promise<Finding[]> {
  return (await db.findings.where("visitId").equals(visitId).toArray()).filter(
    (f) => f.status === "confirmed" || f.status === "corrected" || (f.source !== "ai" && f.status !== "rejected"),
  );
}

export async function prescriptionPdf(visit: Visit, patient: Patient): Promise<Blob> {
  const p = await getProfile();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, p, "PRESCRIPTION & CASE SUMMARY");
  y = patientBlock(doc, patient, visit.date, y);
  y = section(doc, "Chief complaint", visit.chiefComplaint, y);
  y = section(doc, "Clinical findings", visit.examination, y);
  const findings = await confirmedFindings(visit.id);
  if (findings.length)
    y = section(
      doc,
      "Radiographic findings",
      findings.map((f) => `- ${labelInfo(f.label).name}${f.tooth ? ` (tooth ${f.tooth})` : ""}${f.note ? `: ${f.note}` : ""}`).join("\n"),
      y,
    );
  y = section(doc, "Diagnosis", visit.diagnosis, y);
  y = section(doc, "Treatment done", visit.treatmentDone, y);
  if (visit.prescriptions.length) {
    doc.setFont("times", "bolditalic");
    doc.setFontSize(18);
    doc.setTextColor(...TEAL);
    doc.text("Rx", 14, y + 4);
    autoTable(doc, {
      startY: y + 7,
      head: [["#", "Medicine", "Dose", "When", "Duration", "Instructions"]],
      body: visit.prescriptions.map((r, i) => [String(i + 1), t(r.drug), t(r.dose), t(r.frequency), t(r.duration), t(r.instructions)]),
      styles: { fontSize: 8.8, cellPadding: 2, textColor: INK },
      headStyles: { fillColor: TEAL, textColor: 255 },
      columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 52, fontStyle: "bold" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("1-0-1 = morning - afternoon - night. SOS = only when needed.", 14, y - 2);
    y += 3;
  }
  const planned = visit.plan.filter((x) => x.status === "planned");
  if (planned.length) y = section(doc, "Treatment plan", planned.map((x) => `- ${x.tooth ? `#${x.tooth} ` : ""}${x.procedure}`).join("\n"), y);
  y = section(doc, "Advice", visit.advice, y);
  const next = await db.appointments
    .where("patientId")
    .equals(patient.id)
    .filter((a) => a.status === "scheduled" && a.start > Date.now())
    .sortBy("start");
  if (next[0]) section(doc, "Next appointment", `${fmtDateTime(next[0].start)} - ${next[0].procedure}`, y);
  footer(doc, p);
  return doc.output("blob");
}

export async function invoicePdf(visit: Visit, patient: Patient): Promise<Blob> {
  const p = await getProfile();
  const cur = pdfCurrency(p.currency);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, p, "TREATMENT ESTIMATE / INVOICE");
  y = patientBlock(doc, patient, visit.date, y);
  const total = visit.plan.reduce((s, x) => s + (x.cost || 0), 0);
  autoTable(doc, {
    startY: y,
    head: [["#", "Tooth", "Procedure", "Status", `Amount (${cur.trim()})`]],
    body: visit.plan.map((x, i) => [String(i + 1), x.tooth ? String(x.tooth) : "-", t(x.procedure), x.status === "done" ? "Done" : "Planned", (x.cost || 0).toLocaleString("en-IN")]),
    foot: [
      ["", "", "", "Total", total.toLocaleString("en-IN")],
      ["", "", "", "Paid", (visit.paid || 0).toLocaleString("en-IN")],
      ["", "", "", "Balance", (total - (visit.paid || 0)).toLocaleString("en-IN")],
    ],
    styles: { fontSize: 9, textColor: INK },
    headStyles: { fillColor: TEAL, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  footer(doc, p);
  return doc.output("blob");
}

export async function xrayReportPdf(visit: Visit, patient: Patient): Promise<Blob> {
  const p = await getProfile();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, p, "RADIOGRAPHIC REPORT");
  y = patientBlock(doc, patient, visit.date, y);
  const W = doc.internal.pageSize.getWidth();
  const images = await db.images.where("visitId").equals(visit.id).toArray();
  const all = await confirmedFindings(visit.id);
  for (const img of images) {
    const f = all.filter((x) => x.imageId === img.id);
    const canvas = await renderAnnotated(img.blob, f, 1600);
    const ratio = canvas.height / canvas.width;
    const w = W - 28;
    const h = Math.min(120, w * ratio);
    const ww = h / ratio;
    if (y + h + 10 > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(t(`${img.kind} - ${fmtDate(img.createdAt)}`), 14, y);
    doc.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 14, y + 2, ww, h);
    y += h + 6;
    if (f.length) {
      autoTable(doc, {
        startY: y,
        head: [["Finding", "Tooth", "Source", "Note"]],
        body: f.map((x) => [t(labelInfo(x.label).name), x.tooth ? String(x.tooth) : "-", x.source === "ai" ? "AI, dentist-verified" : "Dentist", t(x.note)]),
        styles: { fontSize: 8.5, textColor: INK },
        headStyles: { fillColor: TEAL, textColor: 255 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }
  if (visit.report) y = section(doc, "Report", visit.report, y);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("AI-assisted detections were reviewed and verified by the treating dentist.", 14, Math.min(y + 4, doc.internal.pageSize.getHeight() - 32));
  footer(doc, p);
  return doc.output("blob");
}
