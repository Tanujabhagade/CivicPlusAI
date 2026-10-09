import type { CivicIssue } from "@/lib/civic-data";

export type SeverityLevel = CivicIssue["priority"];

export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
] as const;

export function normalizeSeverity(raw?: string | null): SeverityLevel {
  if (!raw) return "Medium";
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("crit")) return "Critical";
  if (normalized.includes("high")) return "High";
  if (normalized.includes("low")) return "Low";
  return "Medium";
}

export function estimateSeverityFromText(description: string): SeverityLevel {
  const text = description.toLowerCase();
  const isCritical =
    /life|danger|collapse|electroc|exposed live wire|sinkhole|major fire|gas leak/.test(text);
  if (isCritical) return "Critical";

  const isHigh =
    /accident|crash|blocked road|burst pipe|flooding|severe|deep pothole|overflowing/.test(text);
  if (isHigh) return "High";

  const isLow = /minor|scratch|faded|cosmetic|light litter/.test(text);
  if (isLow) return "Low";

  return "Medium";
}

export function getSeverityStyle(priority: SeverityLevel): string {
  switch (priority) {
    case "Critical":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "High":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "Medium":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "Low":
      return "bg-slate-100 text-slate-700 border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}
