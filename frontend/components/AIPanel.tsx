"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Section } from "@/types";
import { authFetch } from "@/lib/auth-fetch";
import { fetchOneCOverview, type OneCOverview } from "@/lib/onec";
import { getSupabase } from "@/lib/supabase";
import { getClientWorkspaceId } from "@/lib/client-settings";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  X,
  Send,
  Sparkles,
  Loader2,
  User,
  Trash2,
  Download,
  Plus,
  Search,
  Pin,
  PinOff,
  MessageSquareText,
  Bot,
  Settings2,
  Paperclip,
  FileText,
  Mic,
  Square,
} from "lucide-react";
import { useI18n } from "@/components/i18n/LanguageProvider";

interface MessageAttachment {
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  content_excerpt?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[];
  report?: {
    fileName: string;
    url: string;
  };
}

interface Props {
  isOpen: boolean;
  section: Section;
  onClose: () => void;
  onSectionChange?: (section: Section) => void;
}

interface PendingAttachment extends MessageAttachment {
  id: string;
  text_content?: string;
  base64_data?: string | null;
  encoding?: "base64";
}

interface BrowserSpeechRecognitionResultEntry {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResultEntry>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const SECTION_CONTEXT: Record<Section, { label: string; icon: string; prompts: string[] }> = {
  dashboard:    { label: "Dashboard",    icon: "⊞", prompts: ["Give me a business health summary", "Which module needs attention?", "What are the top risks this week?"] },
  projects:     { label: "Projects",     icon: "📋", prompts: ["Summarize tasks by status", "Which tasks are overdue?", "Who is assigned the most work?"] },
  finance:      { label: "Finance",      icon: "💰", prompts: ["Analyze our cash flow this month", "Flag any unusual transactions", "What's our profit margin?"] },
  hr:           { label: "HR",           icon: "👥", prompts: ["Who is late today?", "Summarize attendance this month", "Estimate payroll for this month"] },
  sales:        { label: "Sales",        icon: "📈", prompts: ["Which deals are at risk?", "What's our pipeline coverage?", "Draft a follow-up for Acme Corp"] },
  support:      { label: "Support",      icon: "🎧", prompts: ["What are the most common issues?", "Summarize open tickets", "Draft a response for an angry customer"] },
  legal:        { label: "Legal",        icon: "⚖️", prompts: ["Any compliance risks this week?", "Summarize pending contracts", "Flag overdue reviews"] },
  marketing:    { label: "Marketing",    icon: "📣", prompts: ["What's our best performing channel?", "Suggest a campaign idea", "Analyze this month's ROI"] },
  supply_chain: { label: "Supply Chain", icon: "🚚", prompts: ["Which products are low on stock?", "Flag any supplier risks", "Forecast demand for next month"] },
  procurement:  { label: "Procurement",  icon: "🛒", prompts: ["List pending purchase orders", "Compare vendor quotes", "Flag overdue approvals"] },
  insights:     { label: "Insights",     icon: "📊", prompts: ["Give me an executive summary", "What trends should I know about?", "Compare this quarter vs last"] },
  settings:     { label: "Settings",     icon: "⚙️", prompts: ["How do I change my password?", "Where are notification preferences?", "Export my data"] },
  marketplace:  { label: "Marketplace",  icon: "📦", prompts: ["What integrations are available?", "How do I install an add-on?", "List popular integrations"] },
};

const ONEC_QUICK_QUERIES = [
  "What's our current bank balance?",
  "Who are our top 5 debtors?",
  "Show low stock alerts",
  "Compare this month vs last month revenue",
  "What's our payroll cost this month?",
  "Cash flow forecast for next 30 days",
];

const stripAssistantMarkdown = (content: string): string =>
  content
    .replace(/#{1,3} /g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();

const REPORT_REQUEST_PATTERN =
  /\b(report|pdf|export|financial statement|income statement|balance sheet|cash flow statement|executive summary|performance report|conclusion)\b/i;
const INCOME_STATEMENT_REQUEST_PATTERN =
  /\b(financial statement|income statement|profit and loss|p&l|statement of operations)\b/i;

const isReportRequest = (text: string): boolean => REPORT_REQUEST_PATTERN.test(text);
const isIncomeStatementRequest = (text: string, sectionName: Section): boolean =>
  sectionName === "finance" && INCOME_STATEMENT_REQUEST_PATTERN.test(text);

type RgbColor = [number, number, number];
type YearValues = [number, number, number];
type NullableYearValues = [number | null, number | null, number | null];

type IncomeMetricKey =
  | "sales"
  | "salesReturn"
  | "discounts"
  | "netSales"
  | "materials"
  | "labor"
  | "overhead"
  | "totalCOGS"
  | "grossProfit"
  | "wages"
  | "advertising"
  | "repairsMaintenance"
  | "travel"
  | "rentLease"
  | "deliveryFreight"
  | "utilitiesTelephone"
  | "insurance"
  | "mileage"
  | "officeSupplies"
  | "depreciation"
  | "interestExpense"
  | "otherExpenses"
  | "totalOperatingExpenses"
  | "operatingProfit"
  | "interestIncome"
  | "otherIncome"
  | "profitBeforeTaxes"
  | "taxExpense"
  | "netProfit";

interface IncomeStatementData {
  companyName: string;
  address: string;
  createdDate: string;
  issuedDate: string;
  values: Record<IncomeMetricKey, YearValues>;
}

interface IncomeMetricDefinition {
  key: IncomeMetricKey;
  keywords: string[];
}

interface IncomeStatementRow {
  kind: "section" | "line";
  label: string;
  key?: IncomeMetricKey;
  yearHeader?: boolean;
  indent?: number;
  bold?: boolean;
  italic?: boolean;
  fill?: RgbColor;
  lineWidth?: number;
}

const INCOME_METRIC_KEYS: IncomeMetricKey[] = [
  "sales",
  "salesReturn",
  "discounts",
  "netSales",
  "materials",
  "labor",
  "overhead",
  "totalCOGS",
  "grossProfit",
  "wages",
  "advertising",
  "repairsMaintenance",
  "travel",
  "rentLease",
  "deliveryFreight",
  "utilitiesTelephone",
  "insurance",
  "mileage",
  "officeSupplies",
  "depreciation",
  "interestExpense",
  "otherExpenses",
  "totalOperatingExpenses",
  "operatingProfit",
  "interestIncome",
  "otherIncome",
  "profitBeforeTaxes",
  "taxExpense",
  "netProfit",
];

const INCOME_METRIC_DEFINITIONS: IncomeMetricDefinition[] = [
  { key: "sales", keywords: ["sales"] },
  { key: "salesReturn", keywords: ["sales return", "returns"] },
  { key: "discounts", keywords: ["discounts", "allowances"] },
  { key: "netSales", keywords: ["net sales"] },
  { key: "materials", keywords: ["materials"] },
  { key: "labor", keywords: ["labor", "labour"] },
  { key: "overhead", keywords: ["overhead"] },
  { key: "totalCOGS", keywords: ["total cost of goods sold", "total cogs"] },
  { key: "grossProfit", keywords: ["gross profit"] },
  { key: "wages", keywords: ["wages", "salary"] },
  { key: "advertising", keywords: ["advertising", "marketing spend"] },
  { key: "repairsMaintenance", keywords: ["repairs", "maintenance"] },
  { key: "travel", keywords: ["travel"] },
  { key: "rentLease", keywords: ["rent", "lease"] },
  { key: "deliveryFreight", keywords: ["delivery", "freight"] },
  { key: "utilitiesTelephone", keywords: ["utilities", "telephone"] },
  { key: "insurance", keywords: ["insurance"] },
  { key: "mileage", keywords: ["mileage"] },
  { key: "officeSupplies", keywords: ["office supplies", "supplies"] },
  { key: "depreciation", keywords: ["depreciation"] },
  { key: "interestExpense", keywords: ["interest expense"] },
  { key: "otherExpenses", keywords: ["other expenses", "misc expense"] },
  { key: "totalOperatingExpenses", keywords: ["total operating expenses", "total opex"] },
  { key: "operatingProfit", keywords: ["operating profit", "operating income"] },
  { key: "interestIncome", keywords: ["interest income"] },
  { key: "otherIncome", keywords: ["other income"] },
  { key: "profitBeforeTaxes", keywords: ["profit before taxes", "profit before tax"] },
  { key: "taxExpense", keywords: ["tax expense", "taxes"] },
  { key: "netProfit", keywords: ["net profit", "net income"] },
];

const INCOME_STATEMENT_ROWS: IncomeStatementRow[] = [
  { kind: "section", label: "Revenue", yearHeader: true },
  { kind: "line", label: "Sales", key: "sales" },
  { kind: "line", label: "Less: Sales Return", key: "salesReturn", indent: 10, italic: true },
  { kind: "line", label: "Less: Discounts and Allowances", key: "discounts", indent: 10, italic: true },
  { kind: "line", label: "Net Sales", key: "netSales", bold: true, fill: [230, 239, 251] },
  { kind: "section", label: "Cost of Goods Sold" },
  { kind: "line", label: "Materials", key: "materials" },
  { kind: "line", label: "Labor", key: "labor" },
  { kind: "line", label: "Overhead", key: "overhead" },
  { kind: "line", label: "Total Cost of Goods Sold", key: "totalCOGS", bold: true, fill: [230, 239, 251] },
  { kind: "line", label: "Gross Profit", key: "grossProfit", bold: true, fill: [221, 233, 249] },
  { kind: "section", label: "Operating Expenses" },
  { kind: "line", label: "Wages", key: "wages" },
  { kind: "line", label: "Advertising", key: "advertising" },
  { kind: "line", label: "Repairs & Maintenance", key: "repairsMaintenance" },
  { kind: "line", label: "Travel", key: "travel" },
  { kind: "line", label: "Rent/Lease", key: "rentLease" },
  { kind: "line", label: "Delivery/Freight Expense", key: "deliveryFreight" },
  { kind: "line", label: "Utilities/Telephone Expenses", key: "utilitiesTelephone" },
  { kind: "line", label: "Insurance", key: "insurance" },
  { kind: "line", label: "Mileage", key: "mileage" },
  { kind: "line", label: "Office Supplies", key: "officeSupplies" },
  { kind: "line", label: "Depreciation", key: "depreciation" },
  { kind: "line", label: "Interest", key: "interestExpense" },
  { kind: "line", label: "Other Expenses", key: "otherExpenses" },
  { kind: "line", label: "Total Operating Expenses", key: "totalOperatingExpenses", bold: true, fill: [230, 239, 251] },
  { kind: "line", label: "Operating Profit (Loss)", key: "operatingProfit", bold: true, fill: [221, 233, 249] },
  { kind: "line", label: "Add: Other Income", indent: 10, italic: true },
  { kind: "line", label: "Interest Income", key: "interestIncome" },
  { kind: "line", label: "Other Income", key: "otherIncome" },
  { kind: "line", label: "Profit (Loss) Before Taxes", key: "profitBeforeTaxes", bold: true, fill: [221, 233, 249] },
  { kind: "line", label: "Less: Tax Expense", key: "taxExpense", indent: 10, italic: true },
  { kind: "line", label: "Net Profit (Loss)", key: "netProfit", bold: true, fill: [212, 227, 246], lineWidth: 1.2 },
];

const cleanLabel = (value: string): string =>
  value.replace(/[_*`#>]/g, "").replace(/\s+/g, " ").trim();

const formatReportDate = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);

const createIncomeRecord = <T,>(initializer: () => T): Record<IncomeMetricKey, T> => {
  const record = {} as Record<IncomeMetricKey, T>;
  for (const key of INCOME_METRIC_KEYS) {
    record[key] = initializer();
  }
  return record;
};

const MONEY_TOKEN_PATTERN = /\(?-?\$?\s*\d[\d,]*(?:\.\d{1,2})?\)?/g;

function parseMoneyToken(token: string): { value: number; hasHint: boolean; digitsLength: number } | null {
  const compact = token.replace(/\s+/g, "");
  if (!compact) return null;
  const isParentheticalNegative = compact.startsWith("(") && compact.endsWith(")");
  const numericPortion = compact.replace(/[()$]/g, "").replace(/,/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(numericPortion)) return null;
  const parsed = Number(numericPortion);
  if (!Number.isFinite(parsed)) return null;
  const value = isParentheticalNegative ? -Math.abs(parsed) : parsed;
  const digitsLength = compact.replace(/\D/g, "").length;
  const hasHint = /[$,().-]/.test(compact) || digitsLength > 3;
  return { value, hasHint, digitsLength };
}

function extractYearValuesFromLine(line: string): NullableYearValues {
  const matches = line.match(MONEY_TOKEN_PATTERN) ?? [];
  const parsed = matches
    .map((token) => parseMoneyToken(token))
    .filter((item): item is NonNullable<ReturnType<typeof parseMoneyToken>> => Boolean(item));
  if (!parsed.length) return [null, null, null];

  const candidates = parsed.some((item) => item.hasHint)
    ? parsed.filter((item) => item.hasHint)
    : parsed;
  const withoutLikelyYears = candidates.filter(
    (item) => !(item.digitsLength >= 4 && item.value >= 1900 && item.value <= 2100),
  );
  const selected = (withoutLikelyYears.length ? withoutLikelyYears : candidates).slice(0, 3);
  const values = selected.map((item) => item.value);
  return [
    values[0] ?? null,
    values[1] ?? values[0] ?? null,
    values[2] ?? values[1] ?? values[0] ?? null,
  ];
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `($${formatted})` : `$${formatted}`;
}

function extractCompanyName(userRequest: string, assistantResponse: string): string {
  const directMatch = assistantResponse.match(/company(?:\s+name)?\s*[:\-]\s*([^\n]+)/i);
  if (directMatch?.[1]) {
    const value = cleanLabel(directMatch[1]).slice(0, 70);
    if (value) return value;
  }

  const requestMatch = userRequest.match(/\bfor\s+([A-Za-z0-9&.,' -]{3,70})/i);
  if (requestMatch?.[1]) {
    const value = cleanLabel(requestMatch[1])
      .replace(/\b(income statement|financial statement|report)\b.*$/i, "")
      .trim();
    const blocked = new Set(["the company", "company", "our company", "this company", "my company"]);
    if (value && !blocked.has(value.toLowerCase())) return value.slice(0, 70);
  }

  return "Company Name";
}

function extractAddress(userRequest: string, assistantResponse: string): string {
  const sources = [assistantResponse, userRequest];
  for (const source of sources) {
    const match = source.match(/address\s*[:\-]\s*([^\n]+)/i);
    if (match?.[1]) {
      const value = cleanLabel(match[1]).slice(0, 110);
      if (value) return value;
    }
  }
  return "Address not provided";
}

function parseIncomeStatementValues(text: string): Record<IncomeMetricKey, NullableYearValues> {
  const lines = text
    .split(/\r?\n/)
    .map((raw) => ({
      raw: raw.trim(),
      normalized: cleanLabel(raw).toLowerCase(),
    }))
    .filter((line) => line.normalized.length > 0);

  const parsed = createIncomeRecord<NullableYearValues>(() => [null, null, null]);
  for (const definition of INCOME_METRIC_DEFINITIONS) {
    const matchingLine = lines.find((line) =>
      definition.keywords.some((keyword) => line.normalized.includes(keyword)),
    );
    if (!matchingLine) continue;
    parsed[definition.key] = extractYearValuesFromLine(matchingLine.raw);
  }
  return parsed;
}

function buildIncomeStatementData(
  sectionLabel: string,
  userRequest: string,
  assistantResponse: string,
): IncomeStatementData {
  const parsed = parseIncomeStatementValues(assistantResponse);
  const values = createIncomeRecord<YearValues>(() => [0, 0, 0]);
  const directKeys: IncomeMetricKey[] = [
    "sales",
    "salesReturn",
    "discounts",
    "materials",
    "labor",
    "overhead",
    "wages",
    "advertising",
    "repairsMaintenance",
    "travel",
    "rentLease",
    "deliveryFreight",
    "utilitiesTelephone",
    "insurance",
    "mileage",
    "officeSupplies",
    "depreciation",
    "interestExpense",
    "otherExpenses",
    "interestIncome",
    "otherIncome",
    "taxExpense",
  ];

  for (let index = 0; index < 3; index += 1) {
    for (const key of directKeys) {
      values[key][index] = parsed[key][index] ?? 0;
    }

    const hasRevenueInputs =
      parsed.sales[index] !== null ||
      parsed.salesReturn[index] !== null ||
      parsed.discounts[index] !== null;
    values.netSales[index] =
      parsed.netSales[index] ??
      (hasRevenueInputs
        ? values.sales[index] - values.salesReturn[index] - values.discounts[index]
        : 0);

    const hasCogsInputs =
      parsed.materials[index] !== null ||
      parsed.labor[index] !== null ||
      parsed.overhead[index] !== null;
    values.totalCOGS[index] =
      parsed.totalCOGS[index] ??
      (hasCogsInputs
        ? values.materials[index] + values.labor[index] + values.overhead[index]
        : 0);

    values.grossProfit[index] =
      parsed.grossProfit[index] ?? values.netSales[index] - values.totalCOGS[index];

    const hasOperatingExpenseInputs = [
      parsed.wages[index],
      parsed.advertising[index],
      parsed.repairsMaintenance[index],
      parsed.travel[index],
      parsed.rentLease[index],
      parsed.deliveryFreight[index],
      parsed.utilitiesTelephone[index],
      parsed.insurance[index],
      parsed.mileage[index],
      parsed.officeSupplies[index],
      parsed.depreciation[index],
      parsed.interestExpense[index],
      parsed.otherExpenses[index],
    ].some((value) => value !== null);

    values.totalOperatingExpenses[index] =
      parsed.totalOperatingExpenses[index] ??
      (hasOperatingExpenseInputs
        ? values.wages[index] +
          values.advertising[index] +
          values.repairsMaintenance[index] +
          values.travel[index] +
          values.rentLease[index] +
          values.deliveryFreight[index] +
          values.utilitiesTelephone[index] +
          values.insurance[index] +
          values.mileage[index] +
          values.officeSupplies[index] +
          values.depreciation[index] +
          values.interestExpense[index] +
          values.otherExpenses[index]
        : 0);

    values.operatingProfit[index] =
      parsed.operatingProfit[index] ??
      values.grossProfit[index] - values.totalOperatingExpenses[index];

    values.profitBeforeTaxes[index] =
      parsed.profitBeforeTaxes[index] ??
      values.operatingProfit[index] + values.interestIncome[index] + values.otherIncome[index];

    values.netProfit[index] =
      parsed.netProfit[index] ??
      values.profitBeforeTaxes[index] - values.taxExpense[index];
  }

  const now = new Date();
  const today = formatReportDate(now);
  return {
    companyName: extractCompanyName(userRequest, assistantResponse) || sectionLabel,
    address: extractAddress(userRequest, assistantResponse),
    createdDate: today,
    issuedDate: today,
    values,
  };
}

const slugifyFileName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48) || "export";

const timestampForFileName = (): string =>
  new Date().toISOString().replace(/[:.]/g, "-");

function downloadBlob(blob: Blob, fileName: string): string {
  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return url;
}

function buildReportBody(sectionLabel: string, userRequest: string, assistantResponse: string): string {
  const cleaned = stripAssistantMarkdown(assistantResponse);
  const generatedAt = new Date().toLocaleString();
  return [
    "REPORT OVERVIEW",
    `Module: ${sectionLabel}`,
    `Generated: ${generatedAt}`,
    "",
    "REQUEST",
    userRequest.trim() || "N/A",
    "",
    "FINDINGS & ANALYSIS",
    cleaned || "No response content available.",
    "",
    "RECOMMENDED NEXT ACTIONS",
    "1. Validate key figures and assumptions against source records.",
    "2. Assign owners and deadlines for the most urgent actions.",
    "3. Review progress in the next operational checkpoint.",
  ].join("\n");
}

async function generatePdfBlob(
  title: string,
  subtitle: string,
  body: string,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 17;
  let y = margin;

  const ensureSpace = (requiredHeight: number = lineHeight) => {
    if (y + requiredHeight <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(title, maxWidth);
  for (const line of titleLines) {
    ensureSpace(22);
    doc.text(line, margin, y);
    y += 22;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const subtitleLines = doc.splitTextToSize(subtitle, maxWidth);
  for (const line of subtitleLines) {
    ensureSpace(14);
    doc.text(line, margin, y);
    y += 14;
  }

  y += 8;
  ensureSpace(12);
  doc.setDrawColor(170, 170, 180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(body || "No content available.", maxWidth);
  for (const line of bodyLines) {
    ensureSpace();
    doc.text(line, margin, y);
    y += lineHeight;
  }

  return doc.output("blob");
}

async function generateIncomeStatementPdfBlob(data: IncomeStatementData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const descWidth = contentWidth * 0.62;
  const yearWidth = (contentWidth - descWidth) / 3;
  const xYear1 = margin + descWidth;
  const xYear2 = xYear1 + yearWidth;
  const xYear3 = xYear2 + yearWidth;
  const tableBottomPadding = 4;

  const colors = {
    headerBlue: [135, 166, 203] as RgbColor,
    sectionBlue: [73, 121, 188] as RgbColor,
    border: [182, 194, 210] as RgbColor,
    darkText: [27, 37, 51] as RgbColor,
    mutedText: [74, 86, 102] as RgbColor,
  };

  const applyTextColor = (color: RgbColor) => {
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const drawCenteredText = (text: string, x: number, width: number, y: number) => {
    const textWidth = doc.getTextWidth(text);
    doc.text(text, x + (width - textWidth) / 2, y);
  };

  const drawRightText = (text: string, rightX: number, y: number) => {
    doc.text(text, rightX - doc.getTextWidth(text), y);
  };

  let y = margin;

  const headerHeight = 78;
  doc.setFillColor(colors.headerBlue[0], colors.headerBlue[1], colors.headerBlue[2]);
  doc.rect(margin, y, contentWidth, headerHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(data.companyName, margin + 12, y + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Address: ${data.address}`, margin + 12, y + 52, { maxWidth: contentWidth * 0.52 });

  const title = "Income Statement";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  drawRightText(title, margin + contentWidth - 12, y + 34);

  y += headerHeight;

  const dateBlockHeight = 56;
  const dateLabelHeight = 24;
  doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
  doc.setLineWidth(0.8);
  doc.rect(margin, y, contentWidth, dateBlockHeight, "S");
  doc.line(margin, y + dateLabelHeight, margin + contentWidth, y + dateLabelHeight);

  const dateColWidth = contentWidth / 4;
  doc.line(margin + dateColWidth, y, margin + dateColWidth, y + dateBlockHeight);
  doc.line(margin + dateColWidth * 2, y, margin + dateColWidth * 2, y + dateBlockHeight);
  doc.line(margin + dateColWidth * 3, y, margin + dateColWidth * 3, y + dateBlockHeight);

  applyTextColor(colors.darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  drawCenteredText("Date Created:", margin, dateColWidth, y + 16);
  drawCenteredText("Date Issued:", margin + dateColWidth, dateColWidth, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  drawCenteredText(data.createdDate, margin, dateColWidth, y + 41);
  drawCenteredText(data.issuedDate, margin + dateColWidth, dateColWidth, y + 41);

  y += dateBlockHeight + 16;
  doc.setDrawColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + contentWidth, y);
  y += 12;

  const statementHeaderHeight = 24;
  doc.setFillColor(colors.sectionBlue[0], colors.sectionBlue[1], colors.sectionBlue[2]);
  doc.rect(margin, y, contentWidth, statementHeaderHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Income Statement", margin + 8, y + 16);
  y += statementHeaderHeight;

  const drawColumnGrid = (rowTop: number, rowHeight: number) => {
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.7);
    doc.line(xYear1, rowTop, xYear1, rowTop + rowHeight);
    doc.line(xYear2, rowTop, xYear2, rowTop + rowHeight);
    doc.line(xYear3, rowTop, xYear3, rowTop + rowHeight);
  };

  const drawContinuationHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    applyTextColor(colors.darkText);
    doc.text("Income Statement (continued)", margin, margin + 10);
    y = margin + 18;

    doc.setFillColor(colors.sectionBlue[0], colors.sectionBlue[1], colors.sectionBlue[2]);
    doc.rect(margin, y, contentWidth, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("Description", margin + 8, y + 12);
    drawCenteredText("Year 1", xYear1, yearWidth, y + 12);
    drawCenteredText("Year 2", xYear2, yearWidth, y + 12);
    drawCenteredText("Year 3", xYear3, yearWidth, y + 12);
    y += 18;
  };

  for (const row of INCOME_STATEMENT_ROWS) {
    const rowHeight = row.kind === "section" ? 18 : 16;
    if (y + rowHeight > pageHeight - margin - tableBottomPadding) {
      doc.addPage();
      drawContinuationHeader();
    }

    if (row.kind === "section") {
      doc.setFillColor(colors.sectionBlue[0], colors.sectionBlue[1], colors.sectionBlue[2]);
      doc.rect(margin, y, contentWidth, rowHeight, "FD");
      drawColumnGrid(y, rowHeight);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(row.label, margin + 8, y + 12);
      if (row.yearHeader) {
        drawCenteredText("Year 1", xYear1, yearWidth, y + 12);
        drawCenteredText("Year 2", xYear2, yearWidth, y + 12);
        drawCenteredText("Year 3", xYear3, yearWidth, y + 12);
      }
      y += rowHeight;
      continue;
    }

    const fill = row.fill ?? ([255, 255, 255] as RgbColor);
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");
    drawColumnGrid(y, rowHeight);

    const fontStyle = row.bold ? (row.italic ? "bolditalic" : "bold") : row.italic ? "italic" : "normal";
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(10);
    applyTextColor(colors.darkText);
    doc.text(row.label, margin + 8 + (row.indent ?? 0), y + 11);

    if (row.key) {
      const rowValues = data.values[row.key];
      const textY = y + 11;
      drawRightText(formatCurrency(rowValues[0]), xYear1 + yearWidth - 8, textY);
      drawRightText(formatCurrency(rowValues[1]), xYear2 + yearWidth - 8, textY);
      drawRightText(formatCurrency(rowValues[2]), xYear3 + yearWidth - 8, textY);
    }

    if (row.lineWidth) {
      doc.setDrawColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);
      doc.setLineWidth(row.lineWidth);
      doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
      doc.setLineWidth(0.7);
    }

    y += rowHeight;
  }

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  applyTextColor(colors.mutedText);
  doc.text("Generated by Benela AI Financial Assistant", margin, Math.min(y, pageHeight - margin + 4));

  return doc.output("blob");
}

type ModelProvider = "anthropic" | "openai";
type AssistantModelId = string;

interface AssistantModelOption {
  id: AssistantModelId;
  label: string;
  description: string;
  provider: ModelProvider;
}

interface ChatThread {
  id: string;
  section: Section;
  sessionId: string;
  title: string;
  preview: string;
  model: AssistantModelId;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RemoteChatSession {
  session_id: string;
  section: Section;
  last_message_preview: string;
  last_message_at: string;
  message_count: number;
}

const MODEL_OPTIONS: AssistantModelOption[] = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fastest responses for routine operational prompts.",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    description: "Balanced depth and speed for most business analysis.",
    provider: "anthropic",
  },
  {
    id: "claude-opus-4-1-20250805",
    label: "Claude Opus 4.1",
    description: "Highest reasoning depth for complex strategic tasks.",
    provider: "anthropic",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    description: "Efficient OpenAI model for quick, cost-optimized responses.",
    provider: "openai",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "High-quality OpenAI reasoning for complex enterprise workflows.",
    provider: "openai",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    description: "Fast multimodal OpenAI model for daily assistant tasks.",
    provider: "openai",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Flagship OpenAI model for advanced analysis and generation.",
    provider: "openai",
  },
];

const DEFAULT_MODEL: AssistantModelId = "claude-haiku-4-5-20251001";
const THREADS_STORAGE_PREFIX = "benela_ai_threads_v1";
const ACTIVE_THREAD_STORAGE_PREFIX = "benela_ai_active_thread_v1";
const MAX_FILE_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_TEXT_CHARS = 12000;
const MAX_FILE_EXCERPT_CHARS = 320;
const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "html",
  "htm",
  "log",
  "tsv",
  "yaml",
  "yml",
]);
const TEXT_ATTACHMENT_MIME_PREFIXES = ["text/"];
const TEXT_ATTACHMENT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "text/csv",
  "application/csv",
  "application/javascript",
  "application/x-javascript",
  "application/x-yaml",
  "application/vnd.ms-excel",
]);

const storageIdentityKey = (userId: string, workspaceId: string): string =>
  `${userId || "anon"}__${workspaceId || "default-workspace"}`;

const threadStorageKey = (section: Section, identity: string) =>
  `${THREADS_STORAGE_PREFIX}_${identity}_${section}`;
const activeThreadStorageKey = (section: Section, identity: string) =>
  `${ACTIVE_THREAD_STORAGE_PREFIX}_${identity}_${section}`;

const makeThreadId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildSessionPrefix = (section: Section, userId: string, workspaceId: string): string =>
  `u:${userId}:w:${workspaceId}:s:${section}:t:`;

const buildSessionId = (
  section: Section,
  threadId: string,
  userId?: string,
  workspaceId?: string,
): string => {
  if (userId && workspaceId) {
    return `${buildSessionPrefix(section, userId, workspaceId)}${threadId}`;
  }
  return `legacy:${section}:${threadId}`;
};

const parseThreadIdFromSessionId = (sessionId: string): string => {
  const marker = ":t:";
  const index = sessionId.lastIndexOf(marker);
  if (index < 0) return sessionId;
  return sessionId.slice(index + marker.length) || sessionId;
};

const defaultThreadTitle = (section: Section, sectionLabel?: string): string =>
  `${sectionLabel ?? SECTION_CONTEXT[section]?.label ?? "Workspace"} Chat`;

const deriveThreadTitle = (input: string, fallback: string): string => {
  const normalized = cleanLabel(input)
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.length > 52 ? `${normalized.slice(0, 52)}...` : normalized;
};

const buildNewThread = (
  section: Section,
  model: AssistantModelId,
  userId?: string,
  workspaceId?: string,
  sectionLabel?: string,
): ChatThread => {
  const id = makeThreadId();
  const now = new Date().toISOString();
  return {
    id,
    section,
    sessionId: buildSessionId(section, id, userId, workspaceId),
    title: defaultThreadTitle(section, sectionLabel),
    preview: "",
    model,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
};

const sortThreads = (threads: ChatThread[]): ChatThread[] =>
  [...threads].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const extensionOf = (name: string): string =>
  name.toLowerCase().split(".").pop() || "";

const isLikelyTextAttachment = (file: File): boolean => {
  const ext = extensionOf(file.name);
  if (TEXT_ATTACHMENT_EXTENSIONS.has(ext)) return true;
  if (file.type && TEXT_ATTACHMENT_MIME_EXACT.has(file.type)) return true;
  if (file.type && TEXT_ATTACHMENT_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  return false;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const buildPendingAttachment = async (file: File): Promise<PendingAttachment> => {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${file.name} exceeds ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
  }
  const isText = isLikelyTextAttachment(file);
  let normalizedText = "";
  let base64Data: string | null = null;
  let excerpt: string | null = null;

  if (isText) {
    try {
      const raw = await file.text();
      normalizedText = raw.replace(/\u0000/g, "").trim();
      if (normalizedText) {
        excerpt = normalizedText.slice(0, MAX_FILE_EXCERPT_CHARS);
      }
    } catch {
      normalizedText = "";
    }
  }

  if (!normalizedText) {
    const buffer = await file.arrayBuffer();
    base64Data = arrayBufferToBase64(buffer);
    const mimeLabel = file.type || "application/octet-stream";
    excerpt = `[Binary attachment: ${mimeLabel}]`;
  }

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    text_content: normalizedText ? normalizedText.slice(0, MAX_FILE_TEXT_CHARS) : undefined,
    base64_data: base64Data,
    encoding: base64Data ? "base64" : undefined,
    content_excerpt: excerpt,
  };
};

const readStoredThreads = (section: Section, identity: string): ChatThread[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(threadStorageKey(section, identity));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return parsed
      .filter((thread) => thread.section === section && thread.sessionId && thread.id)
      .map((thread) => ({
        ...thread,
        model:
          MODEL_OPTIONS.some((option) => option.id === thread.model)
            ? thread.model
            : DEFAULT_MODEL,
        title: thread.title || defaultThreadTitle(section),
        preview: thread.preview || "",
      }));
  } catch {
    return [];
  }
};

const writeStoredThreads = (section: Section, identity: string, threads: ChatThread[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(threadStorageKey(section, identity), JSON.stringify(threads));
};

const readStoredActiveThreadId = (section: Section, identity: string): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(activeThreadStorageKey(section, identity));
};

const writeStoredActiveThreadId = (section: Section, identity: string, threadId: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(activeThreadStorageKey(section, identity), threadId);
};

const findModelOption = (modelId: AssistantModelId): AssistantModelOption =>
  MODEL_OPTIONS.find((model) => model.id === modelId) ?? MODEL_OPTIONS[0];

export default function AIPanel({ isOpen, section, onClose, onSectionChange }: Props) {
  const { t, getValue } = useI18n();
  const isMobile = useIsMobile(980);
  const [authUserId, setAuthUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [identityReady, setIdentityReady] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsReady, setThreadsReady] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AssistantModelId>(DEFAULT_MODEL);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfNotice, setPdfNotice] = useState("");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [hasSpeechFallback, setHasSpeechFallback] = useState(false);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const [onecOverview, setOnecOverview] = useState<OneCOverview | null>(null);
  const [onecOverviewLoading, setOnecOverviewLoading] = useState(false);
  const [financeDataSource, setFinanceDataSource] = useState<"combined" | "benela">("combined");

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportUrlsRef = useRef<string[]>([]);
  const historyRequestRef = useRef(0);
  const threadsRef = useRef<ChatThread[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef("");
  const speechErrorRef = useRef<string | null>(null);
  const translatedSectionContext = getValue<Partial<Record<Section, { label?: string; prompts?: string[] }>>>(
    "ai.sectionContext",
    {},
  );
  const ctxBase = SECTION_CONTEXT[section] ?? SECTION_CONTEXT.dashboard;
  const ctxLocale = translatedSectionContext?.[section];
  const ctx = {
    ...ctxBase,
    label: typeof ctxLocale?.label === "string" ? ctxLocale.label : ctxBase.label,
    prompts:
      Array.isArray(ctxLocale?.prompts) && ctxLocale.prompts.every((item) => typeof item === "string")
        ? ctxLocale.prompts
        : ctxBase.prompts,
  };
  const hasOneCData = section === "finance" && Boolean(onecOverview?.has_data);
  const financePromptSet = useMemo(() => {
    if (!hasOneCData) return ctx.prompts;
    return [...ONEC_QUICK_QUERIES, ...ctx.prompts].filter(
      (value, index, collection) => collection.indexOf(value) === index,
    );
  }, [ctx.prompts, hasOneCData]);
  const activePrompts = hasOneCData ? financePromptSet : ctx.prompts;
  const formatThreadTimeLabel = (isoValue: string): string => {
    const timestamp = new Date(isoValue).getTime();
    if (!Number.isFinite(timestamp)) return "";
    const deltaMs = Date.now() - timestamp;
    if (deltaMs < 60_000) return t("ai.shell.now", {}, "now");
    if (deltaMs < 3_600_000) return t("ai.shell.minutesAgo", { count: Math.floor(deltaMs / 60_000) }, "{{count}}m");
    if (deltaMs < 86_400_000) return t("ai.shell.hoursAgo", { count: Math.floor(deltaMs / 3_600_000) }, "{{count}}h");
    if (deltaMs < 7 * 86_400_000) return t("ai.shell.daysAgo", { count: Math.floor(deltaMs / 86_400_000) }, "{{count}}d");
    return new Date(isoValue).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const lastOneCSyncText = onecOverview?.last_sync_at
    ? formatThreadTimeLabel(onecOverview.last_sync_at)
    : "";
  const financePlaceholder =
    hasOneCData && financeDataSource === "combined"
      ? `Ask anything about your 1C data${lastOneCSyncText ? ` (last synced ${lastOneCSyncText})` : ""}...`
      : t("ai.shell.askAnything", { section: ctx.label });
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const selectedModel = findModelOption(model);
  const storageIdentity = storageIdentityKey(authUserId, workspaceId);
  const sectionOptions = useMemo(
    () =>
      (Object.keys(SECTION_CONTEXT) as Section[]).map((value) => {
        const item = translatedSectionContext?.[value];
        return {
          value,
          label: typeof item?.label === "string" ? item.label : SECTION_CONTEXT[value].label,
        };
      }),
    [translatedSectionContext],
  );

  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) return sortThreads(threads);
    return sortThreads(threads).filter((thread) => {
      const haystack = `${thread.title} ${thread.preview}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [threads, threadSearch]);

  const clearReportUrls = () => {
    for (const url of reportUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    reportUrlsRef.current = [];
  };

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  };

  const stopSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // ignore stop errors from inactive recognition instances
    } finally {
      speechRecognitionRef.current = null;
    }
  };

  const startSpeechRecognition = (): boolean => {
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) return false;

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      speechTranscriptRef.current = "";
      speechErrorRef.current = null;

      recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
        let finalChunk = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = (result[0]?.transcript || "").trim();
          if (!transcript) continue;
          if (result.isFinal) {
            finalChunk += `${transcript} `;
          }
        }
        if (finalChunk) {
          speechTranscriptRef.current = `${speechTranscriptRef.current} ${finalChunk}`.trim();
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        speechErrorRef.current = event.error || "speech-recognition-error";
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
      return true;
    } catch {
      speechRecognitionRef.current = null;
      speechErrorRef.current = "speech-recognition-init-failed";
      return false;
    }
  };

  const transcribeAudioBlob = async (blob: Blob) => {
    const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
      type: blob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.append("file", file);
    const response = await authFetch(`${apiUrl}/agents/transcribe`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      text?: string;
      detail?: string;
    };
    if (!response.ok) {
      throw new Error(payload.detail || "Audio transcription failed.");
    }
    const transcript = (payload.text || "").trim();
    if (!transcript) {
      throw new Error("No speech could be transcribed from the recording.");
    }
    return transcript;
  };

  const updateThread = (threadId: string, updates: Partial<ChatThread>) => {
    setThreads((prev) =>
      sortThreads(
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                ...updates,
              }
            : thread,
        ),
      ),
    );
  };

  const ensureThread = (): ChatThread => {
    const existing = threadsRef.current.find((thread) => thread.id === activeThreadId);
    if (existing) return existing;
    const created = buildNewThread(section, model, authUserId || undefined, workspaceId || undefined, ctx.label);
    setThreads((prev) => sortThreads([created, ...prev]));
    setActiveThreadId(created.id);
    return created;
  };

  const loadRemoteThreads = async (
    sectionName: Section,
    userId: string,
    workspace: string,
    localThreads: ChatThread[],
  ): Promise<ChatThread[]> => {
    const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    const query = new URLSearchParams({
      user_id: userId,
      workspace_id: workspace,
      limit: "120",
    });
    const res = await authFetch(`${apiUrl}/chat/${sectionName}/sessions?${query.toString()}`);
    if (!res.ok) {
      throw new Error(t("ai.shell.cloudSessionsError", {}, "Could not load cloud chat sessions."));
    }
    const remote = (await res.json()) as RemoteChatSession[];
    const localBySession = new Map(localThreads.map((thread) => [thread.sessionId, thread]));
    const remoteSessions = new Set(remote.map((item) => item.session_id));
    const remotePrefix = buildSessionPrefix(sectionName, userId, workspace);

    const hydrated = remote.map((item) => {
      const local = localBySession.get(item.session_id);
      const threadId = local?.id || parseThreadIdFromSessionId(item.session_id);
      const fallbackTitle =
        item.message_count > 0
          ? deriveThreadTitle(item.last_message_preview, defaultThreadTitle(sectionName, ctx.label))
          : defaultThreadTitle(sectionName, ctx.label);
      return {
        id: threadId,
        section: sectionName,
        sessionId: item.session_id,
        title: local?.title || fallbackTitle,
        preview: item.last_message_preview || local?.preview || "",
        model: local?.model || DEFAULT_MODEL,
        pinned: Boolean(local?.pinned),
        createdAt: local?.createdAt || item.last_message_at || new Date().toISOString(),
        updatedAt: item.last_message_at || local?.updatedAt || new Date().toISOString(),
      } as ChatThread;
    });

    const unsyncedLocal = localThreads.filter(
      (thread) => thread.sessionId.startsWith(remotePrefix) && !remoteSessions.has(thread.sessionId),
    );

    return sortThreads([...hydrated, ...unsyncedLocal]);
  };

  const loadHistory = async (thread: ChatThread) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setMessages([]);
    try {
      const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
      const res = await authFetch(
        `${apiUrl}/chat/${section}?session_id=${encodeURIComponent(thread.sessionId)}&limit=100`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as Array<{
        id: number;
        role: "user" | "assistant";
        content: string;
        attachments?: Array<{
          file_name: string;
          mime_type?: string | null;
          size_bytes: number;
          content_excerpt?: string | null;
        }>;
        created_at?: string;
      }>;
      if (requestId !== historyRequestRef.current) return;

      setMessages(
        data.map((msg) => ({
          id: String(msg.id),
          role: msg.role,
          content: msg.content,
          attachments: (msg.attachments || []).map((attachment) => ({
            file_name: attachment.file_name,
            mime_type: attachment.mime_type || null,
            size_bytes: attachment.size_bytes,
            content_excerpt: attachment.content_excerpt || null,
          })),
        })),
      );

      const latest = data[data.length - 1];
      if (!latest) return;
      const preview =
        latest.role === "assistant"
          ? stripAssistantMarkdown(latest.content)
          : cleanLabel(latest.content);
      updateThread(thread.id, {
        preview: preview.slice(0, 120),
        updatedAt: latest.created_at ?? new Date().toISOString(),
      });
    } catch {
      // keep workspace usable even if history fetch fails
    } finally {
      if (requestId === historyRequestRef.current) {
        setHistoryLoading(false);
      }
    }
  };

  const saveMessages = async (
    sessionId: string,
    userText: string,
    assistantText: string,
    attachments: MessageAttachment[] = [],
  ) => {
    const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    await authFetch(`${apiUrl}/chat/${section}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        section,
        role: "user",
        content: userText,
        attachments: attachments.map((attachment) => ({
          file_name: attachment.file_name,
          mime_type: attachment.mime_type || null,
          size_bytes: attachment.size_bytes,
          content_excerpt: attachment.content_excerpt || null,
        })),
      }),
    });
    await authFetch(`${apiUrl}/chat/${section}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        section,
        role: "assistant",
        content: assistantText,
      }),
    });
  };

  const clearActiveConversation = async () => {
    const thread = activeThread;
    if (!thread) return;
    try {
      const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
      await authFetch(`${apiUrl}/chat/${section}?session_id=${encodeURIComponent(thread.sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore and still clear local view
    }

    clearReportUrls();
    setMessages([]);
    setShowClearConfirm(false);
    setPdfNotice("");
    updateThread(thread.id, {
      preview: "",
      updatedAt: new Date().toISOString(),
    });
  };

  const createNewThread = () => {
    stopMediaStream();
    stopSpeechRecognition();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    speechTranscriptRef.current = "";
    speechErrorRef.current = null;
    const created = buildNewThread(section, model, authUserId || undefined, workspaceId || undefined, ctx.label);
    setThreads((prev) => sortThreads([created, ...prev]));
    setActiveThreadId(created.id);
    setMessages([]);
    setInput("");
    setPendingAttachments([]);
    setAttachmentNotice("");
    setPdfNotice("");
    setShowClearConfirm(false);
    setIsRecordingAudio(false);
    setIsTranscribingAudio(false);
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleAttachmentInput = async (event: { target: HTMLInputElement; currentTarget: HTMLInputElement }) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;

    const existing = [...pendingAttachments];
    const availableSlots = MAX_FILE_ATTACHMENTS - existing.length;
    if (availableSlots <= 0) {
      setAttachmentNotice(
        t("ai.shell.attachmentLimit", { max: MAX_FILE_ATTACHMENTS }, "You can attach up to {{max}} files per prompt."),
      );
      return;
    }

    const next = [...existing];
    const errors: string[] = [];
    for (const file of files.slice(0, availableSlots)) {
      try {
        const parsed = await buildPendingAttachment(file);
        const duplicate = next.some(
          (item) => item.file_name === parsed.file_name && item.size_bytes === parsed.size_bytes,
        );
        if (duplicate) continue;
        next.push(parsed);
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : t("ai.shell.fileAttachError", { file: file.name }, "{{file}} could not be attached."),
        );
      }
    }

    if (files.length > availableSlots) {
      errors.push(
        t(
          "ai.shell.fileAttachOnlyMore",
          { count: availableSlots },
          "Only {{count}} more file(s) could be attached in this prompt.",
        ),
      );
    }

    setPendingAttachments(next);
    setAttachmentNotice(errors.join(" "));
  };

  const startRecordingAudio = async () => {
    if (loading || historyLoading || isTranscribingAudio || isRecordingAudio) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setAttachmentNotice(
        t("ai.shell.audioUnavailable", {}, "Audio recording is not available in this environment."),
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setAttachmentNotice(
        t("ai.shell.microphoneUnsupported", {}, "This browser does not support microphone recording."),
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      speechTranscriptRef.current = "";
      speechErrorRef.current = null;

      const mimeType =
        AUDIO_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunk = audioChunksRef.current;
        audioChunksRef.current = [];
        const audioBlob = new Blob(chunk, {
          type: recorder.mimeType || "audio/webm",
        });
        stopSpeechRecognition();
        stopMediaStream();
        setIsRecordingAudio(false);

        if (!audioBlob.size) {
          setAttachmentNotice(
            t("ai.shell.recordingEmpty", {}, "The recording was empty. Please try again."),
          );
          return;
        }

        setIsTranscribingAudio(true);
        setAttachmentNotice(t("ai.shell.transcribingAudioNotice", {}, "Transcribing audio..."));
        void (async () => {
          const fallbackTranscript = speechTranscriptRef.current.trim();
          try {
            const transcript = await transcribeAudioBlob(audioBlob);
            setAttachmentNotice("");
            setInput(transcript);
            await send(transcript);
          } catch (error) {
            if (fallbackTranscript) {
              setAttachmentNotice(
                t(
                  "ai.shell.providerFallbackUsed",
                  {},
                  "Provider transcription unavailable. Used browser speech recognition fallback.",
                ),
              );
              setInput(fallbackTranscript);
              await send(fallbackTranscript);
              return;
            }

            const providerMessage =
              error instanceof Error
                ? error.message
                : t("ai.shell.audioTranscriptionFailed", {}, "Audio transcription failed. Please try again.");
            if (speechErrorRef.current) {
              setAttachmentNotice(
                t(
                  "ai.shell.browserFallbackFailed",
                  { message: providerMessage, fallback: speechErrorRef.current },
                  "{{message}} Browser fallback also failed ({{fallback}}).",
                ),
              );
            } else {
              setAttachmentNotice(providerMessage);
            }
          } finally {
            setIsTranscribingAudio(false);
            speechTranscriptRef.current = "";
            speechErrorRef.current = null;
          }
        })();
      };

      recorder.onerror = () => {
        setIsRecordingAudio(false);
        stopSpeechRecognition();
        stopMediaStream();
        setAttachmentNotice(
          t("ai.shell.audioRecordingFailed", {}, "Audio recording failed. Please try again."),
        );
      };

      recorder.start();
      const speechFallbackEnabled = startSpeechRecognition();
      setHasSpeechFallback(speechFallbackEnabled);
      setAttachmentNotice(
        speechFallbackEnabled
          ? t(
              "ai.shell.recordingWithFallback",
              {},
              "Recording... click stop when finished. Browser speech fallback is active.",
            )
          : t("ai.shell.recording", {}, "Recording... click stop when finished."),
      );
      setIsRecordingAudio(true);
    } catch {
      setAttachmentNotice(
        t("ai.shell.microphoneDenied", {}, "Microphone permission denied or unavailable."),
      );
      setIsRecordingAudio(false);
      stopSpeechRecognition();
      stopMediaStream();
    }
  };

  const stopRecordingAudio = () => {
    stopSpeechRecognition();
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.stop();
    }
  };

  const deleteThread = async (threadId: string) => {
    const target = threadsRef.current.find((thread) => thread.id === threadId);
    if (!target) return;
    const approved = window.confirm(
      t(
        "ai.shell.deleteChatConfirm",
        { title: target.title },
        'Delete chat "{{title}}"? This removes its history.',
      ),
    );
    if (!approved) return;

    try {
      const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
      await authFetch(`${apiUrl}/chat/${section}?session_id=${encodeURIComponent(target.sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore and continue local cleanup
    }

    const remaining = sortThreads(threadsRef.current.filter((thread) => thread.id !== threadId));
    if (!remaining.length) {
      const fallback = buildNewThread(section, model, authUserId || undefined, workspaceId || undefined, ctx.label);
      setThreads([fallback]);
      setActiveThreadId(fallback.id);
      setMessages([]);
      return;
    }

    setThreads(remaining);
    if (threadId === activeThreadId) {
      setActiveThreadId(remaining[0].id);
    }
  };

  const send = async (
    rawText: string,
    attachmentDrafts: PendingAttachment[] = pendingAttachments,
  ) => {
    const text = rawText.trim();
    const attachmentsForSend = attachmentDrafts.slice(0, MAX_FILE_ATTACHMENTS);
    const hasAttachments = attachmentsForSend.length > 0;
    if ((!text && !hasAttachments) || loading || historyLoading || isRecordingAudio || isTranscribingAudio) return;

    const displayText =
      text ||
      t(
        "ai.shell.analyzeAttachedFiles",
        { count: attachmentsForSend.length },
        "Analyze {{count}} attached file(s).",
      );
    const effectiveMessage =
      text ||
      t(
        "ai.shell.analyzeFilesPrompt",
        {},
        "Please analyze the attached files and provide clear, practical insights.",
      );
    const thread = ensureThread();
    const selectedModelId = model;
    const selectedModel = MODEL_OPTIONS.find((option) => option.id === selectedModelId);
    const wantsReport = isReportRequest(effectiveMessage);
    const wantsIncomeStatement = isIncomeStatementRequest(effectiveMessage, section);

    const userAttachments: MessageAttachment[] = attachmentsForSend.map((attachment) => ({
      file_name: attachment.file_name,
      mime_type: attachment.mime_type || null,
      size_bytes: attachment.size_bytes,
      content_excerpt: attachment.content_excerpt || null,
    }));

    const userMsg: Message = {
      id: `${Date.now()}-u`,
      role: "user",
      content: displayText,
      attachments: userAttachments,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingAttachments([]);
    setAttachmentNotice("");
    setLoading(true);
    setPdfNotice("");

    try {
      const apiUrl = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
      const readAgentDiagnostics = async () => {
        try {
          const healthRes = await authFetch(`${apiUrl}/agents/health`);
          if (!healthRes.ok) return "";
          const health = (await healthRes.json().catch(() => null)) as
            | {
                providers?: {
                  openai?: { configured?: boolean; https_reachable?: boolean };
                  anthropic?: { configured?: boolean; https_reachable?: boolean };
                };
              }
            | null;
          const openai = health?.providers?.openai;
          const anthropic = health?.providers?.anthropic;
          if (!openai && !anthropic) return "";

          const toLabel = (item?: { configured?: boolean; https_reachable?: boolean }) => {
            if (!item) return "unknown";
            const configured = item.configured ? "configured" : "not configured";
            const reachability = item.https_reachable ? "reachable" : "unreachable";
            return `${configured}, ${reachability}`;
          };

          return `Diagnostics: OpenAI ${toLabel(openai)} | Anthropic ${toLabel(anthropic)}.`;
        } catch {
          return "";
        }
      };

      const res = await authFetch(`${apiUrl}/agents/${section}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: effectiveMessage,
          model: selectedModelId,
          provider: selectedModel?.provider,
          data_source:
            section === "finance" && hasOneCData
              ? financeDataSource === "combined"
                ? "onec_combined"
                : "benela"
              : undefined,
          attachments: attachmentsForSend.map((attachment) => ({
            file_name: attachment.file_name,
            mime_type: attachment.mime_type || null,
            size_bytes: attachment.size_bytes,
            text_content: attachment.text_content || null,
            base64_data: attachment.base64_data || null,
            encoding: attachment.encoding || null,
          })),
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        response?: string;
        detail?: string;
      };
      if (!res.ok) {
        let fallback = payload.detail || "";
        if (!fallback && res.status === 504) {
          fallback = t(
            "ai.shell.timeoutCloud",
            {},
            "AI backend timed out in cloud. Check backend health and provider connectivity.",
          );
        } else if (!fallback && (res.status === 502 || res.status === 503)) {
          fallback = t(
            "ai.shell.backendTempUnavailable",
            {},
            "AI backend is temporarily unavailable. Please retry shortly.",
          );
        } else if (!fallback) {
          fallback = t(
            "ai.shell.assistantRequestFailed",
            { status: res.status },
            "Assistant request failed (HTTP {{status}}).",
          );
        }

        if (res.status === 502 || res.status === 503 || res.status === 504) {
          const diagnostics = await readAgentDiagnostics();
          if (diagnostics) {
            fallback = `${fallback}\n${diagnostics}`;
          }
        }
        throw new Error(fallback);
      }

      let assistantText = payload.response ?? payload.detail ?? t("ai.shell.somethingWentWrong", {}, "Something went wrong.");
      const refusalAboutFiles =
        /\b(can'?t|cannot|unable|do not have)\b/i.test(assistantText) &&
        /\b(pdf|file|download)\b/i.test(assistantText);
      if (wantsReport && refusalAboutFiles) {
        assistantText +=
          `\n\n${t(
            "ai.shell.reportGenerationAvailable",
            {},
            "PDF report generation is available in this workspace. I will generate a downloadable report for this request.",
          )}`;
      }

      const assistantMsg: Message = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: assistantText,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      saveMessages(thread.sessionId, displayText, assistantText, userAttachments).catch(console.error);

      const defaultTitle = defaultThreadTitle(section, ctx.label);
      const shouldRetitle =
        !thread.title ||
        thread.title === defaultTitle ||
        thread.title.toLowerCase() === t("ai.shell.newChat", {}, "New chat").toLowerCase();
      const preview = stripAssistantMarkdown(assistantText).slice(0, 120);
      const titleSeed = text || attachmentsForSend[0]?.file_name || t("ai.shell.fileAnalysis", {}, "File Analysis");
      updateThread(thread.id, {
        title: shouldRetitle ? deriveThreadTitle(titleSeed, defaultTitle) : thread.title,
        preview,
        model: selectedModelId,
        updatedAt: new Date().toISOString(),
      });

      if (wantsReport) {
        setPdfLoading(true);
        try {
          let fileName = `${slugifyFileName(ctx.label)}-report-${timestampForFileName()}.pdf`;
          let blob: Blob;

          if (wantsIncomeStatement) {
            const statementData = buildIncomeStatementData(ctx.label, effectiveMessage, assistantText);
            const companySlug = slugifyFileName(statementData.companyName);
            fileName = `${companySlug}-income-statement-${timestampForFileName()}.pdf`;
            blob = await generateIncomeStatementPdfBlob(statementData);
          } else {
            const reportTitle = t("ai.shell.reportTitle", { section: ctx.label }, "{{section}} Report");
            const reportSubtitle = t(
              "ai.shell.reportPreparedOn",
              { date: new Date().toLocaleString() },
              "Prepared by Benela AI on {{date}}",
            );
            const reportBody = buildReportBody(ctx.label, text, assistantText);
            blob = await generatePdfBlob(reportTitle, reportSubtitle, reportBody);
          }

          const url = downloadBlob(blob, fileName);
          reportUrlsRef.current.push(url);
          const reportMsg: Message = {
            id: `${Date.now()}-r`,
            role: "assistant",
            content: wantsIncomeStatement
              ? t(
                  "ai.shell.incomeStatementGenerated",
                  { fileName },
                  "Income statement generated and downloaded: {{fileName}}",
                )
              : t(
                  "ai.shell.reportGenerated",
                  { fileName },
                  "Report generated and downloaded: {{fileName}}",
                ),
            report: { fileName, url },
          };
          setMessages((prev) => [...prev, reportMsg]);
        } catch {
          setPdfNotice(
            wantsIncomeStatement
              ? t(
                  "ai.shell.incomeStatementPdfError",
                  {},
                  "Could not generate the income statement PDF for this request.",
                )
              : t(
                  "ai.shell.reportPdfError",
                  {},
                  "Could not generate the report PDF for this request.",
                ),
          );
        } finally {
          setPdfLoading(false);
        }
      }
    } catch (error) {
      if (attachmentsForSend.length) {
        setPendingAttachments(attachmentsForSend);
      }
      const errMsg =
        error instanceof Error
          ? error.message
          : t("ai.shell.backendNotConnected", {}, "Backend not connected. Check your API configuration.");
      const assistantMsg: Message = {
        id: `${Date.now()}-e`,
        role: "assistant",
        content: errMsg,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      updateThread(thread.id, {
        preview: cleanLabel(errMsg).slice(0, 120),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const exportFullConversation = async () => {
    if (!messages.length || pdfLoading || historyLoading) return;
    setPdfLoading(true);
    setPdfNotice("");
    try {
      const now = new Date().toLocaleString();
      const conversation = messages
        .map((msg) => {
          const role = msg.role === "assistant" ? t("ai.shell.assistantRole", {}, "AI Assistant") : t("ai.shell.userRole", {}, "User");
          const text =
            msg.role === "assistant" ? stripAssistantMarkdown(msg.content) : msg.content;
          return `${role}:\n${text}`;
        })
        .join("\n\n");

      const fileName = `${slugifyFileName(ctx.label)}-ai-chat-${timestampForFileName()}.pdf`;
      const blob = await generatePdfBlob(
        t("ai.shell.conversationTitle", { section: ctx.label }, "{{section}} AI Conversation"),
        t("ai.shell.generatedAt", { date: now }, "Generated from Benela AI on {{date}}"),
        conversation,
      );
      const url = downloadBlob(blob, fileName);
      reportUrlsRef.current.push(url);
    } catch {
      setPdfNotice(t("ai.shell.exportPdfError", {}, "Could not export PDF right now. Please try again."));
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    setHasSpeechFallback(Boolean(getSpeechRecognitionConstructor()));
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        if (!mounted) return;
        setAuthUserId(data.user?.id || "");
      } catch {
        if (!mounted) return;
        setAuthUserId("");
      } finally {
        if (!mounted) return;
        setWorkspaceId(getClientWorkspaceId());
        setIdentityReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearReportUrls();
      stopMediaStream();
      stopSpeechRecognition();
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, historyLoading]);

  useEffect(() => {
    if (!isOpen || !identityReady) return;
    let cancelled = false;

    setThreadsReady(false);
    setThreadSearch("");
    setInput("");
    setPendingAttachments([]);
    setAttachmentNotice("");
    setPdfNotice("");
    setShowClearConfirm(false);
    setIsRecordingAudio(false);
    setIsTranscribingAudio(false);
    stopMediaStream();
    stopSpeechRecognition();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    speechTranscriptRef.current = "";
    speechErrorRef.current = null;
    clearReportUrls();

    const init = async () => {
      const storedRaw = sortThreads(readStoredThreads(section, storageIdentity));
      const expectedPrefix =
        authUserId && workspaceId ? buildSessionPrefix(section, authUserId, workspaceId) : "";
      const stored = storedRaw.map((thread) => {
        if (!expectedPrefix) return thread;
        if (thread.sessionId.startsWith(expectedPrefix)) return thread;
        return {
          ...thread,
          sessionId: buildSessionId(section, thread.id, authUserId, workspaceId),
        };
      });
      let initialThreads = stored;

      if (authUserId) {
        try {
          const remote = await loadRemoteThreads(section, authUserId, workspaceId, stored);
          if (remote.length) {
            initialThreads = remote;
          }
        } catch {
          // fallback to local cache
        }
      }

      if (!initialThreads.length) {
        initialThreads = [buildNewThread(section, DEFAULT_MODEL, authUserId || undefined, workspaceId || undefined, ctx.label)];
      }

      const storedActiveId = readStoredActiveThreadId(section, storageIdentity);
      const nextActiveId =
        storedActiveId && initialThreads.some((thread) => thread.id === storedActiveId)
          ? storedActiveId
          : initialThreads[0].id;

      if (cancelled) return;
      setThreads(initialThreads);
      setActiveThreadId(nextActiveId);
      setModel(initialThreads.find((thread) => thread.id === nextActiveId)?.model ?? DEFAULT_MODEL);
      setThreadsReady(true);
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [section, isOpen, identityReady, storageIdentity, authUserId, workspaceId]);

  useEffect(() => {
    if (!isOpen || !threadsReady) return;
    writeStoredThreads(section, storageIdentity, threads);
  }, [threads, section, isOpen, threadsReady, storageIdentity]);

  useEffect(() => {
    if (!isOpen || !threadsReady || !activeThread) return;
    writeStoredActiveThreadId(section, storageIdentity, activeThread.id);
    setModel(activeThread.model);
    setPendingAttachments([]);
    setAttachmentNotice("");
    void loadHistory(activeThread);
  }, [activeThread?.sessionId, activeThreadId, section, isOpen, threadsReady, storageIdentity]);

  useEffect(() => {
    if (!isOpen) {
      setMobileThreadsOpen(false);
      return;
    }
    if (!isMobile) {
      setMobileThreadsOpen(false);
    }
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen || section !== "finance") {
      setOnecOverview(null);
      setOnecOverviewLoading(false);
      return;
    }

    let cancelled = false;
    setOnecOverviewLoading(true);
    void (async () => {
      try {
        const overview = await fetchOneCOverview();
        if (cancelled) return;
        setOnecOverview(overview);
      } catch {
        if (cancelled) return;
        setOnecOverview(null);
      } finally {
        if (!cancelled) {
          setOnecOverviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, section]);

  useEffect(() => {
    setFinanceDataSource(hasOneCData ? "combined" : "benela");
  }, [hasOneCData]);

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, var(--overlay-backdrop) 78%, var(--bg-canvas) 22%)",
            zIndex: 48,
          }}
        />
      )}

      <div
        className="ai-panel-shell"
        style={{
          "--ai-bg-panel": "color-mix(in srgb, var(--bg-canvas) 86%, var(--bg-panel) 14%)",
          "--ai-bg-surface": "color-mix(in srgb, var(--bg-canvas) 80%, var(--bg-surface) 20%)",
          "--ai-bg-elevated": "color-mix(in srgb, var(--bg-canvas) 74%, var(--bg-elevated) 26%)",
          "--ai-border-default": "color-mix(in srgb, var(--border-default) 72%, var(--text-quiet) 28%)",
          "--ai-overlay-backdrop": "color-mix(in srgb, var(--overlay-backdrop) 78%, var(--bg-canvas) 22%)",
          position: "fixed",
          top: isMobile ? "0" : "12px",
          right: isMobile ? "0" : "12px",
          left: isMobile ? "0" : "auto",
          width: isMobile ? "100vw" : "min(980px, calc(100vw - 24px))",
          height: isMobile ? "100vh" : "calc(100vh - 24px)",
          background: "var(--ai-bg-panel)",
          border: "1px solid var(--ai-border-default)",
          borderRadius: isMobile ? "0" : "16px",
          overflow: "hidden",
          display: "flex",
          zIndex: 50,
          transform: isOpen ? "translateX(0)" : "translateX(calc(100% + 24px))",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isOpen ? "var(--drawer-shadow)" : "none",
          pointerEvents: isOpen ? "auto" : "none",
        } as CSSProperties}
      >
        <aside
          className="ai-panel-thread-list"
          style={{
            width: isMobile ? "min(88vw, 320px)" : "clamp(240px, 28%, 296px)",
            borderRight: "1px solid var(--ai-border-default)",
            background: "linear-gradient(180deg, var(--ai-bg-panel), var(--ai-bg-surface))",
            display: "flex",
            flexDirection: "column",
            position: isMobile ? "absolute" : "relative",
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: isMobile ? 3 : "auto",
            transform: isMobile ? (mobileThreadsOpen ? "translateX(0)" : "translateX(-104%)") : "none",
            transition: isMobile ? "transform 0.22s ease" : "none",
            boxShadow: isMobile ? "0 22px 42px rgba(0, 0, 0, 0.28)" : "none",
          }}
        >
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--ai-border-default)" }}>
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "10px",
                    background: "var(--accent-soft)",
                    border: "1px solid color-mix(in srgb, var(--accent) 36%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bot size={14} color="var(--accent)" />
                </div>
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em" }}>BENELA AI</p>
                  <p style={{ fontSize: "10px", color: "var(--text-subtle)" }}>{t("ai.shell.conversations")}</p>
                </div>
              </div>

              <button
                onClick={createNewThread}
                title={t("ai.shell.newChat")}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "9px",
                  background: "var(--ai-bg-elevated)",
                  border: "1px solid var(--ai-border-default)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={14} />
              </button>
              {isMobile ? (
                <button
                  onClick={() => setMobileThreadsOpen(false)}
                  title={t("ai.shell.closeChats")}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "9px",
                    background: "var(--ai-bg-elevated)",
                    border: "1px solid var(--ai-border-default)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div
              style={{
                border: "1px solid var(--ai-border-default)",
                borderRadius: "10px",
                background: "var(--ai-bg-surface)",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Search size={13} color="var(--text-subtle)" />
              <input
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder={t("ai.shell.searchChats")}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  fontFamily: "Geist, sans-serif",
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
            {filteredThreads.length === 0 ? (
              <div
                style={{
                  border: "1px dashed var(--ai-border-default)",
                  borderRadius: "10px",
                  padding: "14px",
                  color: "var(--text-subtle)",
                  fontSize: "12px",
                }}
              >
                {t("ai.shell.noChatsMatch")}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                return (
                  <button
                    key={thread.id}
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      setPdfNotice("");
                      setShowClearConfirm(false);
                      if (isMobile) {
                        setMobileThreadsOpen(false);
                      }
                    }}
                    style={{
                      width: "100%",
                      marginBottom: "8px",
                      textAlign: "left",
                      borderRadius: "11px",
                      border: isActive
                        ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--ai-border-default))"
                        : "1px solid var(--ai-border-default)",
                      background: isActive ? "var(--accent-soft)" : "var(--ai-bg-surface)",
                      padding: "10px",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                      <MessageSquareText size={13} color={isActive ? "var(--accent)" : "var(--text-subtle)"} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "12px",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {thread.title}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>
                        {formatThreadTimeLabel(thread.updatedAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: "11px",
                        color: "var(--text-subtle)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: "8px",
                      }}
                    >
                      {thread.preview || t("ai.shell.noMessagesYet")}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "9px",
                          border: "1px solid var(--ai-border-default)",
                          borderRadius: "999px",
                          padding: "2px 6px",
                          color: "var(--text-muted)",
                          background: "var(--ai-bg-panel)",
                        }}
                      >
                        {findModelOption(thread.model).label}
                      </span>
                      <div style={{ display: "inline-flex", gap: "4px" }}>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            updateThread(thread.id, { pinned: !thread.pinned });
                          }}
                          title={thread.pinned ? t("ai.shell.unpinChat", {}, "Unpin chat") : t("ai.shell.pinChat", {}, "Pin chat")}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "7px",
                            border: "1px solid var(--ai-border-default)",
                            background: "var(--ai-bg-panel)",
                            color: "var(--text-subtle)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {thread.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                        </span>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteThread(thread.id);
                          }}
                          title={t("ai.shell.deleteChat", {}, "Delete chat")}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "7px",
                            border: "1px solid var(--danger-soft-border)",
                            background: "var(--danger-soft-bg)",
                            color: "var(--danger)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Trash2 size={11} />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--ai-border-default)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", color: "var(--text-subtle)" }}>{t("ai.shell.chats")}</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                {threads.length}
              </span>
            </div>
          </div>
        </aside>

        {isMobile && mobileThreadsOpen ? (
          <button
            type="button"
            aria-label={t("ai.shell.closeChats")}
            onClick={() => setMobileThreadsOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              background: "var(--ai-overlay-backdrop)",
              border: "none",
              cursor: "pointer",
            }}
          />
        ) : null}

        <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ borderBottom: "1px solid var(--ai-border-default)", padding: "12px 14px" }}>
            <div className="ai-panel-toolbar" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {isMobile ? (
                <button
                  onClick={() => setMobileThreadsOpen(true)}
                  title={t("ai.shell.openChats")}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    border: "1px solid var(--ai-border-default)",
                    background: "var(--ai-bg-elevated)",
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MessageSquareText size={13} />
                </button>
              ) : null}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px solid var(--ai-border-default)",
                  borderRadius: "9px",
                  background: "var(--ai-bg-elevated)",
                  padding: "5px 8px",
                }}
              >
                <Settings2 size={12} color="var(--text-subtle)" />
                <select
                  value={section}
                  onChange={(event) => {
                    const nextSection = event.target.value as Section;
                    if (nextSection === section) return;
                    onSectionChange?.(nextSection);
                  }}
                  disabled={!onSectionChange}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: onSectionChange ? "var(--text-primary)" : "var(--text-quiet)",
                    fontSize: "11px",
                    fontFamily: "Geist, sans-serif",
                    cursor: onSectionChange ? "pointer" : "not-allowed",
                  }}
                >
                  {sectionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px solid var(--ai-border-default)",
                  borderRadius: "9px",
                  background: "var(--ai-bg-elevated)",
                  padding: "5px 8px",
                }}
              >
                <Sparkles size={12} color="var(--accent)" />
                <select
                  value={model}
                  onChange={(event) => {
                    const nextModel = event.target.value as AssistantModelId;
                    setModel(nextModel);
                    if (activeThreadId) {
                      updateThread(activeThreadId, { model: nextModel });
                    }
                  }}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    fontFamily: "Geist, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  <optgroup label={t("ai.shell.anthropicGroup")}>
                    {MODEL_OPTIONS.filter((option) => option.provider === "anthropic").map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("ai.shell.openaiGroup")}>
                    {MODEL_OPTIONS.filter((option) => option.provider === "openai").map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="ai-panel-toolbar-actions" style={{ marginLeft: "auto", display: "inline-flex", gap: "6px" }}>
                <button
                  onClick={() => void exportFullConversation()}
                  disabled={!messages.length || historyLoading || pdfLoading}
                  title={t("ai.shell.exportPdf")}
                  style={{
                    height: "30px",
                    borderRadius: "8px",
                    padding: "0 10px",
                    border: "1px solid var(--ai-border-default)",
                    background:
                      messages.length && !historyLoading && !pdfLoading
                        ? "var(--ai-bg-elevated)"
                        : "transparent",
                    color:
                      messages.length && !historyLoading && !pdfLoading
                        ? "var(--text-primary)"
                        : "var(--text-quiet)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    cursor:
                      messages.length && !historyLoading && !pdfLoading ? "pointer" : "not-allowed",
                  }}
                >
                  {pdfLoading ? (
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Download size={12} />
                  )}
                  PDF
                </button>

                <button
                  onClick={() => setShowClearConfirm((prev) => !prev)}
                  title={t("ai.shell.clearChat")}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    border: `1px solid ${showClearConfirm ? "var(--danger-soft-border)" : "var(--ai-border-default)"}`,
                    background: "transparent",
                    color: showClearConfirm ? "var(--danger)" : "var(--text-subtle)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trash2 size={12} />
                </button>

                <button
                  onClick={onClose}
                  title={t("ai.shell.close")}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    border: "1px solid var(--ai-border-default)",
                    background: "transparent",
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeThread?.title ?? defaultThreadTitle(section, ctx.label)}
              </p>
              <span
                style={{
                  fontSize: "10px",
                  border: "1px solid var(--ai-border-default)",
                  borderRadius: "999px",
                  padding: "2px 7px",
                  color: "var(--text-subtle)",
                  background: "var(--ai-bg-surface)",
                }}
              >
                {selectedModel.label}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)", marginLeft: "auto" }}>
                {ctx.icon} {ctx.label}
              </span>
            </div>
          </div>

          {showClearConfirm && (
            <div
              style={{
                padding: "9px 14px",
                borderBottom: "1px solid var(--danger-soft-border)",
                background: "var(--danger-soft-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <p style={{ fontSize: "12px", color: "var(--danger)" }}>
                {t("ai.shell.clearConfirm")}
              </p>
              <div style={{ display: "inline-flex", gap: "8px" }}>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    fontSize: "11px",
                    borderRadius: "7px",
                    padding: "4px 10px",
                    border: "1px solid var(--ai-border-default)",
                    background: "transparent",
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                  }}
                >
                  {t("ai.shell.cancel")}
                </button>
                <button
                  onClick={() => void clearActiveConversation()}
                  style={{
                    fontSize: "11px",
                    borderRadius: "7px",
                    padding: "4px 10px",
                    border: "none",
                    background: "var(--danger)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {t("ai.shell.clear")}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
            {historyLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  padding: "45px 10px",
                  color: "var(--text-subtle)",
                  fontSize: "12px",
                }}
              >
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                {t("ai.shell.loadingHistory")}
              </div>
            ) : messages.length === 0 ? (
              <div style={{ maxWidth: "620px", margin: "18px auto 0" }}>
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "14px",
                    border: "1px solid var(--ai-border-default)",
                    background: "linear-gradient(130deg, var(--ai-bg-surface), var(--ai-bg-elevated))",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                    {t("ai.shell.workspaceTitle", { section: ctx.label }, "{{section}} Intelligence Workspace")}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.6 }}>
                    {t("ai.shell.workspaceDescription")}
                  </p>
                  {section === "finance" ? (
                    <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          border: "1px solid var(--ai-border-default)",
                          background: hasOneCData
                            ? "color-mix(in srgb, var(--accent) 14%, var(--ai-bg-elevated))"
                            : "var(--ai-bg-elevated)",
                          color: hasOneCData ? "var(--accent)" : "var(--text-subtle)",
                          fontSize: "10px",
                          fontFamily: "monospace",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {hasOneCData ? "1C + BENELA DATA" : "BENELA DATA"}
                      </span>
                      {hasOneCData && lastOneCSyncText ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 9px",
                            borderRadius: "999px",
                            border: "1px solid var(--ai-border-default)",
                            background: "var(--ai-bg-elevated)",
                            color: "var(--text-subtle)",
                            fontSize: "10px",
                            fontFamily: "monospace",
                            letterSpacing: "0.08em",
                          }}
                        >
                          last sync {lastOneCSyncText}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--text-quiet)",
                    letterSpacing: "0.14em",
                    fontFamily: "monospace",
                    marginBottom: "9px",
                  }}
                >
                  {t("ai.shell.suggestedPrompts")}
                </p>

                {activePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: "10px",
                      border: "1px solid var(--ai-border-default)",
                      background: "var(--ai-bg-surface)",
                      color: "var(--text-muted)",
                      padding: "10px 12px",
                      marginBottom: "7px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px", margin: "0 auto" }}>
                {messages.map((msg) => {
                  const rendered =
                    msg.role === "assistant" ? stripAssistantMarkdown(msg.content) : msg.content;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexDirection: msg.role === "user" ? "row-reverse" : "row",
                      }}
                    >
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "9px",
                          border: "1px solid var(--ai-border-default)",
                          background:
                            msg.role === "user"
                              ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                              : "var(--ai-bg-surface)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {msg.role === "user" ? (
                          <User size={13} color="var(--accent)" />
                        ) : (
                          <Sparkles size={13} color="var(--text-subtle)" />
                        )}
                      </div>

                      <div
                        style={{
                          maxWidth: "86%",
                          padding: msg.role === "assistant" ? "13px 14px" : "11px 12px",
                          borderRadius:
                            msg.role === "assistant" ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                          border: "1px solid var(--ai-border-default)",
                          background:
                            msg.role === "assistant"
                              ? "var(--ai-bg-surface)"
                              : "color-mix(in srgb, var(--accent) 16%, var(--ai-bg-surface))",
                          color: "var(--text-primary)",
                          fontSize: "12.5px",
                          lineHeight: 1.58,
                        }}
                      >
                        <span style={{ whiteSpace: "pre-wrap" }}>{rendered}</span>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={{ marginTop: "9px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {msg.attachments.map((attachment, index) => (
                              <span
                                key={`${msg.id}-att-${index}-${attachment.file_name}`}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontSize: "10px",
                                  border: "1px solid var(--ai-border-default)",
                                  borderRadius: "999px",
                                  padding: "3px 8px",
                                  background: "var(--ai-bg-elevated)",
                                  color: "var(--text-subtle)",
                                  maxWidth: "100%",
                                }}
                                title={attachment.file_name}
                              >
                                <FileText size={10} />
                                <span
                                  style={{
                                    maxWidth: "180px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {attachment.file_name}
                                </span>
                                <span style={{ color: "var(--text-quiet)" }}>
                                  {formatBytes(attachment.size_bytes)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        {msg.role === "assistant" && msg.report && (
                          <div style={{ marginTop: "9px" }}>
                            <a
                              href={msg.report.url}
                              download={msg.report.fileName}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                textDecoration: "none",
                                fontSize: "10px",
                                border: "1px solid var(--ai-border-default)",
                                borderRadius: "8px",
                                padding: "4px 9px",
                                background: "var(--ai-bg-elevated)",
                                color: "var(--text-subtle)",
                              }}
                            >
                              <Download size={10} />
                              {t("ai.shell.downloadReport")}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <div
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "9px",
                        border: "1px solid var(--ai-border-default)",
                        background: "var(--ai-bg-surface)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Sparkles size={13} color="var(--text-subtle)" />
                    </div>
                    <div
                      style={{
                        border: "1px solid var(--ai-border-default)",
                        background: "var(--ai-bg-surface)",
                        borderRadius: "4px 12px 12px 12px",
                        padding: "10px 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--text-subtle)",
                        fontSize: "12px",
                      }}
                    >
                      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      {t("ai.shell.thinking")}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div style={{ borderTop: "1px solid var(--ai-border-default)", padding: "12px 14px" }}>
            {attachmentNotice && (
              <div
                style={{
                  marginBottom: "10px",
                  padding: "8px 10px",
                  borderRadius: "9px",
                  border: "1px solid var(--danger-soft-border)",
                  background: "var(--danger-soft-bg)",
                  color: "var(--danger)",
                  fontSize: "11px",
                }}
              >
                {attachmentNotice}
              </div>
            )}

            {pdfNotice && (
              <div
                style={{
                  marginBottom: "10px",
                  padding: "8px 10px",
                  borderRadius: "9px",
                  border: "1px solid var(--danger-soft-border)",
                  background: "var(--danger-soft-bg)",
                  color: "var(--danger)",
                  fontSize: "11px",
                }}
              >
                {pdfNotice}
              </div>
            )}

            <div
              style={{
                border: "1px solid var(--ai-border-default)",
                borderRadius: "12px",
                background: "var(--ai-bg-surface)",
                padding: "10px 10px 8px",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(event) => {
                  void handleAttachmentInput(event);
                }}
                style={{ display: "none" }}
              />

              {pendingAttachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {pendingAttachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        border: "1px solid var(--ai-border-default)",
                        background: "var(--ai-bg-elevated)",
                        color: "var(--text-subtle)",
                        borderRadius: "999px",
                        padding: "4px 8px",
                        fontSize: "10px",
                        maxWidth: "100%",
                      }}
                      title={attachment.file_name}
                    >
                      <FileText size={10} />
                      <span
                        style={{
                          maxWidth: "160px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {attachment.file_name}
                      </span>
                      <span style={{ color: "var(--text-quiet)" }}>{formatBytes(attachment.size_bytes)}</span>
                      <button
                        onClick={() => removePendingAttachment(attachment.id)}
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title={t("ai.shell.removeAttachment")}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {section === "finance" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setFinanceDataSource("benela")}
                    style={{
                      height: "26px",
                      borderRadius: "999px",
                      border: "1px solid var(--ai-border-default)",
                      background:
                        financeDataSource === "benela"
                          ? "var(--ai-bg-elevated)"
                          : "transparent",
                      color:
                        financeDataSource === "benela"
                          ? "var(--text-primary)"
                          : "var(--text-subtle)",
                      padding: "0 10px",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      letterSpacing: "0.08em",
                      cursor: "pointer",
                    }}
                  >
                    Benela Data
                  </button>
                  <button
                    type="button"
                    onClick={() => hasOneCData && setFinanceDataSource("combined")}
                    disabled={!hasOneCData}
                    style={{
                      height: "26px",
                      borderRadius: "999px",
                      border: "1px solid var(--ai-border-default)",
                      background:
                        financeDataSource === "combined" && hasOneCData
                          ? "color-mix(in srgb, var(--accent) 16%, var(--ai-bg-elevated))"
                          : "transparent",
                      color:
                        financeDataSource === "combined" && hasOneCData
                          ? "var(--accent)"
                          : "var(--text-subtle)",
                      padding: "0 10px",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      letterSpacing: "0.08em",
                      cursor: hasOneCData ? "pointer" : "not-allowed",
                      opacity: hasOneCData ? 1 : 0.55,
                    }}
                    title={
                      hasOneCData
                        ? onecOverviewLoading
                          ? "Loading 1C source state..."
                          : lastOneCSyncText
                            ? `1C + Benela data • last synced ${lastOneCSyncText}`
                            : "1C + Benela data"
                        : "No 1C data has been imported yet."
                    }
                  >
                    1C + Benela
                  </button>
                </div>
              ) : null}

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                placeholder={section === "finance" ? financePlaceholder : t("ai.shell.askAnything", { section: ctx.label })}
                style={{
                  width: "100%",
                  minHeight: "46px",
                  maxHeight: "140px",
                  resize: "vertical",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  fontFamily: "Geist, sans-serif",
                }}
              />

              <div className="ai-panel-composer-meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                <div className="ai-panel-composer-hints" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-quiet)", fontSize: "10px" }}>
                  {section === "finance" ? (
                    <span
                      className="ai-panel-hint-text"
                      style={{
                        fontFamily: "monospace",
                        color:
                          hasOneCData && financeDataSource === "combined"
                            ? "var(--accent)"
                            : "var(--text-quiet)",
                      }}
                    >
                      {hasOneCData && financeDataSource === "combined"
                        ? `1C source ${lastOneCSyncText ? `· ${lastOneCSyncText}` : "active"}`
                        : "Benela source active"}
                    </span>
                  ) : null}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={
                      loading ||
                      historyLoading ||
                      isRecordingAudio ||
                      isTranscribingAudio ||
                      pendingAttachments.length >= MAX_FILE_ATTACHMENTS
                    }
                    style={{
                      height: "24px",
                      borderRadius: "7px",
                      border: "1px solid var(--ai-border-default)",
                      background: "var(--ai-bg-elevated)",
                      color: "var(--text-subtle)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "10px",
                      padding: "0 7px",
                      cursor:
                        loading ||
                        historyLoading ||
                        isRecordingAudio ||
                        isTranscribingAudio ||
                        pendingAttachments.length >= MAX_FILE_ATTACHMENTS
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        loading ||
                        historyLoading ||
                        isRecordingAudio ||
                        isTranscribingAudio ||
                        pendingAttachments.length >= MAX_FILE_ATTACHMENTS
                          ? 0.6
                          : 1,
                    }}
                    title={t("ai.shell.attachTitle", { max: MAX_FILE_ATTACHMENTS })}
                  >
                    <Paperclip size={10} />
                    {t("ai.shell.attach")}
                  </button>
                  <button
                    onClick={() => {
                      if (isRecordingAudio) {
                        stopRecordingAudio();
                      } else {
                        void startRecordingAudio();
                      }
                    }}
                    disabled={loading || historyLoading || isTranscribingAudio}
                    style={{
                      height: "24px",
                      borderRadius: "7px",
                      border: "1px solid var(--ai-border-default)",
                      background: isRecordingAudio
                        ? "color-mix(in srgb, var(--danger) 16%, var(--ai-bg-elevated))"
                        : "var(--ai-bg-elevated)",
                      color: isRecordingAudio ? "var(--danger)" : "var(--text-subtle)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "10px",
                      padding: "0 7px",
                      cursor: loading || historyLoading || isTranscribingAudio ? "not-allowed" : "pointer",
                      opacity: loading || historyLoading || isTranscribingAudio ? 0.6 : 1,
                    }}
                    title={isRecordingAudio ? t("ai.shell.stopRecording") : t("ai.shell.recordAudioPrompt")}
                  >
                    {isRecordingAudio ? <Square size={10} /> : <Mic size={10} />}
                    {isRecordingAudio ? t("ai.shell.stop") : t("ai.shell.record")}
                  </button>
                  <span className="ai-panel-hint-text" style={{ fontFamily: "monospace" }}>{t("ai.shell.enterSend")}</span>
                  <span className="ai-panel-hint-text" style={{ fontFamily: "monospace" }}>{t("ai.shell.shiftEnter")}</span>
                  <span className="ai-panel-hint-text" style={{ fontFamily: "monospace" }}>
                    {isTranscribingAudio
                      ? t("ai.shell.transcribingAudio")
                      : hasSpeechFallback
                        ? t("ai.shell.voiceFallbackEnabled")
                        : t("ai.shell.voiceEnabled")}
                  </span>
                  <span className="ai-panel-hint-text" style={{ fontFamily: "monospace" }}>{t("ai.shell.autoReportEnabled")}</span>
                </div>

                <button
                  onClick={() => void send(input)}
                  disabled={
                    (!input.trim() && pendingAttachments.length === 0) ||
                    loading ||
                    historyLoading ||
                    isRecordingAudio ||
                    isTranscribingAudio
                  }
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      (input.trim() || pendingAttachments.length > 0) &&
                      !loading &&
                      !historyLoading &&
                      !isRecordingAudio &&
                      !isTranscribingAudio
                        ? "var(--accent)"
                        : "var(--ai-bg-elevated)",
                    color:
                      (input.trim() || pendingAttachments.length > 0) &&
                      !loading &&
                      !historyLoading &&
                      !isRecordingAudio &&
                      !isTranscribingAudio
                        ? "white"
                        : "var(--text-quiet)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor:
                      (input.trim() || pendingAttachments.length > 0) &&
                      !loading &&
                      !historyLoading &&
                      !isRecordingAudio &&
                      !isTranscribingAudio
                        ? "pointer"
                        : "not-allowed",
                  }}
                  title={t("ai.shell.sendMessage", {}, "Send message")}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>

            <p style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-quiet)" }}>
              {selectedModel.description}
            </p>
          </div>
        </section>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}
