import type { CivicIssue, CivicStatus, CivicTimelineEvent, CivicTimelineRecord } from "@/lib/civic-data";

/**
 * Formats a timestamp into a human-readable string for timeline milestones.
 */
export function formatTimelineDate(timestamp?: string | number | null): string {
  if (!timestamp) return "Pending";
  if (typeof timestamp === "string") {
    if (timestamp === "Saved" || timestamp === "Pending" || timestamp === "Today" || timestamp === "Next" || timestamp === "Action required") {
      return timestamp;
    }
    if (timestamp.includes("min") || timestamp.includes("ago") || timestamp.includes("Just now")) {
      return timestamp;
    }
  }

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return String(timestamp);
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24 && date.toDateString() === now.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * Determines whether a given target status was reached given the current issue status.
 */
function isStatusReached(currentStatus: CivicStatus, target: CivicStatus): boolean {
  if (currentStatus === target) return true;

  const order: Record<CivicStatus, number> = {
    "NEW": 1,
    "UNDER REVIEW": 2,
    "ASSIGNED": 3,
    "IN PROGRESS": 4,
    "RESOLUTION SUBMITTED": 5,
    "AWAITING CITIZEN VERIFICATION": 5,
    "RESOLVED": 6,
    "REOPENED": 6,
    "REJECTED": 2,
  };

  const currentLevel = order[currentStatus] ?? 1;
  const targetLevel = order[target] ?? 1;
  return currentLevel >= targetLevel;
}

/**
 * Builds a reactive, accurate timeline representing the actual saved issue state.
 * Supports:
 * - Real persisted records from Firestore / local storage
 * - Reactive state updates for all 9 statuses
 * - Graceful fallback derivation for older issues without full history (Task 8)
 */
export function buildIssueTimeline(
  issue: CivicIssue,
  persistedRecords: CivicTimelineRecord[] = [],
): CivicTimelineEvent[] {
  const records = persistedRecords.length > 0 ? persistedRecords : (issue.timelineRecords ?? []);

  // Find most relevant persisted record for each milestone
  const findRecord = (statuses: string[]) =>
    records.slice().reverse().find((r) => statuses.includes(r.status));

  const newRecord = findRecord(["NEW", "REPORTED", "CREATED"]);
  const assignedRecord = findRecord(["ASSIGNED"]);
  const inProgressRecord = findRecord(["IN PROGRESS"]);
  const resolutionRecord = findRecord(["RESOLUTION SUBMITTED", "AWAITING CITIZEN VERIFICATION"]);
  const resolvedRecord = findRecord(["RESOLVED"]);
  const reopenedRecord = findRecord(["REOPENED"]);
  const rejectedRecord = findRecord(["REJECTED"]);

  const currentStatus = issue.status;
  const isRejected = currentStatus === "REJECTED";

  // 1. Report submitted (always done)
  const reportEvent: CivicTimelineEvent = {
    label: "Report submitted",
    detail: newRecord?.note || `Citizen report received by ${issue.citizen || "citizen"}`,
    at: newRecord ? formatTimelineDate(newRecord.timestamp) : formatTimelineDate(issue.createdAt || "Saved"),
    done: true,
  };

  // 2. AI triage complete (automated initial stage)
  const triageEvent: CivicTimelineEvent = {
    label: "AI triage complete",
    detail: `${issue.category} • ${issue.priority} priority (${issue.confidence ?? 85}% confidence)`,
    at: formatTimelineDate(issue.createdAt || "Saved"),
    done: true,
  };

  // 3. Municipal review & assignment
  let reviewDone = false;
  let reviewDetail = "Awaiting assignment to department";
  let reviewAt = "Next";

  if (isRejected) {
    reviewDone = true;
    reviewDetail = rejectedRecord?.note || `Report reviewed and closed: ${issue.notes?.[0] || "Not actionable"}`;
    reviewAt = rejectedRecord ? formatTimelineDate(rejectedRecord.timestamp) : formatTimelineDate(issue.createdAt);
  } else if (currentStatus === "UNDER REVIEW") {
    reviewDone = true;
    reviewDetail = `Under review by ${issue.department || "Municipal Authority"}`;
    reviewAt = formatTimelineDate(issue.createdAt);
  } else if (isStatusReached(currentStatus, "ASSIGNED")) {
    reviewDone = true;
    const officerInfo = issue.assignedOfficer ? ` • Officer: ${issue.assignedOfficer}` : "";
    reviewDetail = assignedRecord?.note || `Assigned to ${issue.department}${officerInfo}`;
    reviewAt = assignedRecord ? formatTimelineDate(assignedRecord.timestamp) : "Saved";
  }

  const reviewEvent: CivicTimelineEvent = {
    label: "Municipal review & assignment",
    detail: reviewDetail,
    at: reviewAt,
    done: reviewDone,
  };

  // If rejected, close out timeline with rejection event
  if (isRejected) {
    return [
      reportEvent,
      triageEvent,
      reviewEvent,
      {
        label: "Outcome",
        detail: "Ticket closed as rejected by municipal authority",
        at: rejectedRecord ? formatTimelineDate(rejectedRecord.timestamp) : "Saved",
        done: true,
      },
    ];
  }

  // 4. Field response / work in progress
  let fieldDone = false;
  let fieldDetail = "Pending field dispatch";
  let fieldAt = "Pending";

  if (currentStatus === "ASSIGNED") {
    fieldDetail = `Scheduled for field inspection • ${issue.department}`;
    fieldAt = "Scheduled";
    fieldDone = false;
  } else if (isStatusReached(currentStatus, "IN PROGRESS")) {
    fieldDone = true;
    const officerText = issue.assignedOfficer ? ` (${issue.assignedOfficer})` : "";
    fieldDetail = inProgressRecord?.note || `Field team active on site${officerText}`;
    fieldAt = inProgressRecord ? formatTimelineDate(inProgressRecord.timestamp) : (currentStatus === "IN PROGRESS" ? "In progress" : "Saved");
  }

  const fieldEvent: CivicTimelineEvent = {
    label: "Field response",
    detail: fieldDetail,
    at: fieldAt,
    done: fieldDone,
  };

  // 5. Resolution evidence
  let resolutionDone = false;
  let resolutionDetail = "Resolution not submitted";
  let resolutionAt = "Pending";

  if (isStatusReached(currentStatus, "AWAITING CITIZEN VERIFICATION")) {
    resolutionDone = true;
    resolutionDetail = issue.resolutionNotes
      ? `Evidence submitted: ${issue.resolutionNotes}`
      : (resolutionRecord?.note || "Resolution evidence submitted for verification");
    resolutionAt = resolutionRecord ? formatTimelineDate(resolutionRecord.timestamp) : "Saved";
  } else if (currentStatus === "RESOLVED") {
    resolutionDone = true;
    resolutionDetail = issue.resolutionNotes
      ? `Repairs complete: ${issue.resolutionNotes}`
      : "Resolution verified";
    resolutionAt = resolutionRecord ? formatTimelineDate(resolutionRecord.timestamp) : "Saved";
  } else if (currentStatus === "REOPENED") {
    resolutionDone = true;
    resolutionDetail = issue.resolutionNotes
      ? `Previous repair: ${issue.resolutionNotes}`
      : "Previous resolution evidence on record";
    resolutionAt = resolutionRecord ? formatTimelineDate(resolutionRecord.timestamp) : "Saved";
  }

  const resolutionEvent: CivicTimelineEvent = {
    label: "Resolution evidence",
    detail: resolutionDetail,
    at: resolutionAt,
    done: resolutionDone,
  };

  // 6. Citizen verification
  let verifyDone = false;
  let verifyLabel = "Citizen verification";
  let verifyDetail = "Pending municipal resolution";
  let verifyAt = "Pending";

  if (currentStatus === "RESOLVED") {
    verifyDone = true;
    verifyLabel = "Citizen verification (Resolved)";
    verifyDetail = resolvedRecord?.note || "Citizen verified: Resolution confirmed successfully";
    verifyAt = resolvedRecord ? formatTimelineDate(resolvedRecord.timestamp) : "Saved";
  } else if (currentStatus === "REOPENED") {
    verifyDone = true;
    verifyLabel = "Citizen verification (Reopened)";
    verifyDetail = reopenedRecord?.note || "Citizen verified: Issue still exists • Reopened for follow-up";
    verifyAt = reopenedRecord ? formatTimelineDate(reopenedRecord.timestamp) : "Saved";
  } else if (currentStatus === "AWAITING CITIZEN VERIFICATION" || currentStatus === "RESOLUTION SUBMITTED") {
    verifyDone = false;
    verifyDetail = "Awaiting citizen confirmation";
    verifyAt = "Action required";
  }

  const verifyEvent: CivicTimelineEvent = {
    label: verifyLabel,
    detail: verifyDetail,
    at: verifyAt,
    done: verifyDone,
  };

  return [reportEvent, triageEvent, reviewEvent, fieldEvent, resolutionEvent, verifyEvent];
}
