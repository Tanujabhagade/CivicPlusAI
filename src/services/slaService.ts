import type { CivicIssue, CivicSettings } from "@/lib/civic-data";

export type SlaStatus = "on-track" | "due-soon" | "breached";

export function getSlaHours(priority: CivicIssue["priority"], settings?: CivicSettings) {
  return settings?.slaHours[priority] ?? { Critical: 24, High: 48, Medium: 72, Low: 168 }[priority];
}

export function getSlaStatus(issue: CivicIssue, settings?: CivicSettings, now = Date.now()) {
  const createdAt = issue.createdAt ? Date.parse(issue.createdAt) : now;
  const dueAt = createdAt + getSlaHours(issue.priority, settings) * 60 * 60 * 1000;
  const remainingMs = dueAt - now;
  const totalMs = Math.max(dueAt - createdAt, 1);
  const status: SlaStatus =
    remainingMs <= 0 ? "breached" : remainingMs <= totalMs * 0.2 ? "due-soon" : "on-track";
  const remainingHours = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));

  return {
    status,
    dueAt,
    remainingMs,
    remainingHours,
    label:
      status === "breached"
        ? "SLA breached"
        : status === "due-soon"
          ? `${remainingHours}h left • due soon`
          : `${remainingHours}h left • on track`,
  };
}
