import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  createDemoIssues,
  type CivicIssue,
  type CivicStatus,
  type CivicTimelineEvent,
  type CivicTimelineRecord,
} from "@/lib/civic-data";
import { sanitizeImageUrl, isDurableImageUrl } from "./firebaseStorageService";

export interface CreateIssuePayload extends Partial<CivicIssue> {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  ward: string;
  department: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: CivicStatus;
  citizen: string;
  citizenId?: string;
  citizenEmail?: string;
  confidence: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  area?: string;
  image?: string;
  aiSummary?: string;
  impact?: string;
  duplicateIds?: string[];
  timeline?: CivicTimelineEvent[];
  timelineRecords?: CivicTimelineRecord[];
}

export function formatTimelineTimestamp(ts?: string): string {
  if (!ts) return "Saved";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

/**
 * Derives reactive, accurate milestone states for any CivicIssue.
 * Works seamlessly with both persisted timeline events and older issues that
 * only have current status without historical event logs.
 */
export function deriveMilestonesForIssue(
  issue: Partial<CivicIssue>,
  records?: CivicTimelineRecord[],
): CivicTimelineEvent[] {
  const effectiveRecords =
    records && records.length > 0 ? records : (issue.timelineRecords ?? []);

  // Find specific events if available
  const reportEvent = effectiveRecords.find(
    (r) => r.status === "NEW" || r.note?.toLowerCase().includes("submitted"),
  );
  const assignedEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "ASSIGNED" || r.note?.toLowerCase().includes("assigned"));
  const underReviewEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "UNDER REVIEW");
  const inProgressEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "IN PROGRESS");
  const resolutionSubmittedEvent = [...effectiveRecords]
    .reverse()
    .find(
      (r) =>
        r.status === "RESOLUTION SUBMITTED" ||
        r.status === "AWAITING CITIZEN VERIFICATION" ||
        r.note?.toLowerCase().includes("resolution submitted"),
    );
  const resolvedEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "RESOLVED");
  const reopenedEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "REOPENED");
  const rejectedEvent = [...effectiveRecords]
    .reverse()
    .find((r) => r.status === "REJECTED");

  const currentStatus = issue.status || "NEW";

  // Milestone 1: Report Submission
  const m1Time = formatTimelineTimestamp(reportEvent?.timestamp || issue.createdAt);
  const m1: CivicTimelineEvent = {
    label: "Report submitted",
    detail: issue.citizen
      ? `Citizen report received • Reported by ${issue.citizen}`
      : "Citizen report received",
    at: m1Time,
    done: true,
  };

  // Milestone 2: AI Triage
  const m2Time = formatTimelineTimestamp(issue.createdAt || reportEvent?.timestamp);
  const m2: CivicTimelineEvent = {
    label: "AI triage complete",
    detail: `${issue.category || "General"} • ${issue.priority || "Medium"} priority`,
    at: m2Time,
    done: true,
  };

  // Milestone 3: Municipal Review & Action
  let m3: CivicTimelineEvent;
  switch (currentStatus) {
    case "NEW":
      m3 = {
        label: "Municipal review",
        detail: "Awaiting assignment",
        at: "Next",
        done: false,
      };
      break;
    case "UNDER REVIEW":
      m3 = {
        label: "Municipal review",
        detail: issue.assignedOfficer
          ? `Under review by ${issue.assignedOfficer}`
          : `Review underway by ${issue.department || "Municipal department"}`,
        at: underReviewEvent ? formatTimelineTimestamp(underReviewEvent.timestamp) : "In review",
        done: true,
      };
      break;
    case "ASSIGNED":
      m3 = {
        label: "Assigned to officer",
        detail: issue.assignedOfficer
          ? `Assigned to ${issue.assignedOfficer} (${issue.department || "Municipal department"})`
          : `Assigned to ${issue.department || "Municipal department"}`,
        at: assignedEvent ? formatTimelineTimestamp(assignedEvent.timestamp) : "Assigned",
        done: true,
      };
      break;
    case "IN PROGRESS":
      m3 = {
        label: "Field action in progress",
        detail: issue.assignedOfficer
          ? `Work underway by ${issue.assignedOfficer}`
          : `Field action underway by ${issue.department || "Municipal department"}`,
        at: inProgressEvent ? formatTimelineTimestamp(inProgressEvent.timestamp) : "In progress",
        done: true,
      };
      break;
    case "REJECTED":
      m3 = {
        label: "Municipal review completed",
        detail: "Report rejected by authority after inspection",
        at: rejectedEvent ? formatTimelineTimestamp(rejectedEvent.timestamp) : "Rejected",
        done: true,
      };
      break;
    case "RESOLUTION SUBMITTED":
    case "AWAITING CITIZEN VERIFICATION":
    case "RESOLVED":
    case "REOPENED":
    default:
      m3 = {
        label: "Municipal review & assignment",
        detail: issue.assignedOfficer
          ? `Handled by ${issue.assignedOfficer} (${issue.department || "Municipal department"})`
          : `Actioned by ${issue.department || "Municipal department"}`,
        at: inProgressEvent
          ? formatTimelineTimestamp(inProgressEvent.timestamp)
          : assignedEvent
            ? formatTimelineTimestamp(assignedEvent.timestamp)
            : "Completed",
        done: true,
      };
      break;
  }

  // Milestone 4: Resolution & Verification
  let m4: CivicTimelineEvent;
  switch (currentStatus) {
    case "NEW":
    case "UNDER REVIEW":
    case "ASSIGNED":
      m4 = {
        label: "Resolution",
        detail: "Not submitted",
        at: "Pending",
        done: false,
      };
      break;
    case "IN PROGRESS":
      m4 = {
        label: "Resolution",
        detail: "Work in progress • Awaiting resolution evidence",
        at: "Pending",
        done: false,
      };
      break;
    case "RESOLUTION SUBMITTED":
      m4 = {
        label: "Resolution submitted",
        detail: issue.resolutionNotes
          ? `Evidence provided: "${issue.resolutionNotes}"`
          : "Evidence submitted • Awaiting verification",
        at: resolutionSubmittedEvent
          ? formatTimelineTimestamp(resolutionSubmittedEvent.timestamp)
          : "Submitted",
        done: true,
      };
      break;
    case "AWAITING CITIZEN VERIFICATION":
      m4 = {
        label: "Citizen verification pending",
        detail: issue.resolutionNotes
          ? `Evidence submitted: "${issue.resolutionNotes}" • Awaiting verification`
          : "Resolution evidence submitted • Awaiting citizen verification",
        at: resolutionSubmittedEvent
          ? formatTimelineTimestamp(resolutionSubmittedEvent.timestamp)
          : "Awaiting verification",
        done: false,
      };
      break;
    case "RESOLVED":
      m4 = {
        label: "Resolved & verified",
        detail: issue.resolutionNotes
          ? `Verified resolved: "${issue.resolutionNotes}"`
          : "Resolution confirmed by citizen • Closed",
        at: resolvedEvent
          ? formatTimelineTimestamp(resolvedEvent.timestamp)
          : issue.resolvedAt
            ? formatTimelineTimestamp(issue.resolvedAt)
            : "Resolved",
        done: true,
      };
      break;
    case "REOPENED":
      m4 = {
        label: "Issue reopened",
        detail: "Citizen indicated issue still exists • Sent back for review",
        at: reopenedEvent ? formatTimelineTimestamp(reopenedEvent.timestamp) : "Reopened",
        done: false,
      };
      break;
    case "REJECTED":
      m4 = {
        label: "Closed without resolution",
        detail: "Report rejected by authority",
        at: rejectedEvent ? formatTimelineTimestamp(rejectedEvent.timestamp) : "Closed",
        done: false,
      };
      break;
    default:
      m4 = {
        label: "Resolution",
        detail: "Pending",
        at: "Pending",
        done: false,
      };
      break;
  }

  return [m1, m2, m3, m4];
}

export function subscribeToIssues(onUpdate: (issues: CivicIssue[]) => void): Unsubscribe {
  const seeded = createDemoIssues().map((demo) => ({
    ...demo,
    timeline: deriveMilestonesForIssue(demo, demo.timelineRecords),
  }));

  if (!isFirebaseConfigured || !db) {
    onUpdate(seeded);
    return () => {};
  }

  const issuesCol = collection(db, "issues");
  const q = query(issuesCol, orderBy("createdAt", "desc"), limit(150));

  try {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          // If Firestore is empty, provide seeded demo issues
          onUpdate(seeded);
          return;
        }

        const firestoreMap = new Map<string, CivicIssue>();
        snapshot.docs.forEach((d) => {
          const data = d.data() as CivicIssue;
          const image = sanitizeImageUrl(data.image);
          const beforeImage = sanitizeImageUrl(data.beforeImage);
          const afterImage = sanitizeImageUrl(data.afterImage);
          const resolutionEvidence = sanitizeImageUrl(data.resolutionEvidence);

          const normalized: CivicIssue = {
            ...data,
            id: data.id || d.id,
            image,
            beforeImage,
            afterImage,
            resolutionEvidence,
          };
          normalized.timeline = deriveMilestonesForIssue(normalized, normalized.timelineRecords);
          firestoreMap.set(normalized.id, normalized);
        });

        // Merge: Persistent Firestore issues first, plus any seeded issues not overridden
        const merged: CivicIssue[] = [...firestoreMap.values()];
        for (const s of seeded) {
          if (!firestoreMap.has(s.id)) {
            merged.push(s);
          }
        }
        onUpdate(merged);
      },
      (error) => {
        console.warn(
          "[CivicPulse] Firestore live listener error, falling back to cached/seeded:",
          error,
        );
        onUpdate(seeded);
      },
    );

    return unsubscribe;
  } catch (err) {
    console.warn("[CivicPulse] Failed to attach Firestore live query, using seeded data:", err);
    onUpdate(seeded);
    return () => {};
  }
}

/**
 * Real-time listener for an issue's timeline events subcollection.
 */
export function subscribeToIssueTimeline(
  issueId: string,
  onUpdate: (records: CivicTimelineRecord[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !issueId) {
    onUpdate([]);
    return () => {};
  }

  const timelineCol = collection(db, "issues", issueId, "timeline");
  const q = query(timelineCol, orderBy("timestamp", "asc"));

  try {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: CivicTimelineRecord[] = [];
        snapshot.docs.forEach((docSnap) => {
          const recData = docSnap.data() as Omit<CivicTimelineRecord, "id">;
          records.push({
            id: docSnap.id,
            ...recData,
            evidenceImage: sanitizeImageUrl(recData.evidenceImage) || null,
          });
        });
        onUpdate(records);
      },
      (error) => {
        console.warn(`[CivicPulse] Timeline listener error for issue ${issueId}:`, error);
      },
    );
    return unsubscribe;
  } catch (err) {
    console.warn(`[CivicPulse] Failed to attach timeline listener for ${issueId}:`, err);
    return () => {};
  }
}

/**
 * Fetches an issue's timeline records once.
 */
export async function fetchIssueTimeline(issueId: string): Promise<CivicTimelineRecord[]> {
  if (!isFirebaseConfigured || !db || !issueId) {
    return [];
  }
  try {
    const timelineCol = collection(db, "issues", issueId, "timeline");
    const q = query(timelineCol, orderBy("timestamp", "asc"));
    const snapshot = await getDocs(q);
    const records: CivicTimelineRecord[] = [];
    snapshot.docs.forEach((docSnap) => {
      const recData = docSnap.data() as Omit<CivicTimelineRecord, "id">;
      records.push({
        id: docSnap.id,
        ...recData,
        evidenceImage: sanitizeImageUrl(recData.evidenceImage) || null,
      });
    });
    return records;
  } catch (err) {
    console.warn(`[CivicPulse] fetchIssueTimeline error for ${issueId}:`, err);
    return [];
  }
}

/**
 * Creates a new issue in Firestore and appends its initial submission timeline event.
 */
export async function saveIssueToFirestore(issue: CreateIssuePayload): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const issueRef = doc(db, "issues", issue.id);
  const now = new Date().toISOString();
  const { timeline, timelineRecords, ...issuePayload } = issue as unknown as Record<string, unknown>;
  const dataToSave: Record<string, unknown> = {
    ...issuePayload,
    updatedAt: now,
    createdAt: (issuePayload["createdAt"] as string) || now,
  };

  // Ensure no temporary blob URLs are stored in Firestore
  if (typeof dataToSave["image"] === "string" && !isDurableImageUrl(dataToSave["image"] as string)) {
    delete dataToSave["image"];
  }
  if (typeof dataToSave["beforeImage"] === "string" && !isDurableImageUrl(dataToSave["beforeImage"] as string)) {
    delete dataToSave["beforeImage"];
  }
  if (typeof dataToSave["afterImage"] === "string" && !isDurableImageUrl(dataToSave["afterImage"] as string)) {
    delete dataToSave["afterImage"];
  }
  if (
    typeof dataToSave["resolutionEvidence"] === "string" &&
    !isDurableImageUrl(dataToSave["resolutionEvidence"] as string)
  ) {
    delete dataToSave["resolutionEvidence"];
  }

  try {
    await setDoc(issueRef, dataToSave, { merge: true });

    // Also record initial event in timeline subcollection
    const timelineCol = collection(db, "issues", issue.id, "timeline");
    const eventId = `event-${Date.now()}`;
    await setDoc(doc(timelineCol, eventId), {
      id: eventId,
      issueId: issue.id,
      status: issue.status || "NEW",
      actorName: issue.citizen || "Citizen",
      actorId: issue.citizenId || "anonymous",
      actorRole: "citizen",
      timestamp: now,
      note: "Complaint submitted into CivicPulse register.",
      evidenceImage: (dataToSave["image"] as string) || null,
    });
  } catch (err) {
    console.warn(`[CivicPulse] saveIssueToFirestore notice for ${issue.id}:`, err);
  }
}

/**
 * Updates an issue in Firestore without recreating initial submission events.
 * Appends an assignment or update timeline record if appropriate.
 */
export async function updateIssueInFirestore(
  issueId: string,
  patch: Partial<CivicIssue>,
  actor?: { name: string; id: string; role: string },
  timelineNote?: string,
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const issueRef = doc(db, "issues", issueId);
  const now = new Date().toISOString();

  try {
    const { timeline, timelineRecords, ...dataToSave } = patch as Record<string, unknown>;
    // Sanitize image fields to prevent storing blob: URLs
    if (typeof dataToSave["image"] === "string" && !isDurableImageUrl(dataToSave["image"] as string)) {
      delete dataToSave["image"];
    }
    if (typeof dataToSave["beforeImage"] === "string" && !isDurableImageUrl(dataToSave["beforeImage"] as string)) {
      delete dataToSave["beforeImage"];
    }
    if (typeof dataToSave["afterImage"] === "string" && !isDurableImageUrl(dataToSave["afterImage"] as string)) {
      delete dataToSave["afterImage"];
    }
    if (
      typeof dataToSave["resolutionEvidence"] === "string" &&
      !isDurableImageUrl(dataToSave["resolutionEvidence"] as string)
    ) {
      delete dataToSave["resolutionEvidence"];
    }

    await updateDoc(issueRef, {
      ...dataToSave,
      updatedAt: now,
    });

    if (timelineNote || patch.assignedOfficer || patch.status) {
      const timelineCol = collection(db, "issues", issueId, "timeline");
      const eventId = `event-${Date.now()}`;
      await setDoc(doc(timelineCol, eventId), {
        id: eventId,
        issueId,
        status: (patch.status as string) || "ASSIGNED",
        actorName: actor?.name || "Municipal Officer",
        actorId: actor?.id || "authority",
        actorRole: actor?.role || "officer",
        note:
          timelineNote ||
          (patch.assignedOfficer
            ? `Assigned to ${patch.assignedOfficer} (${(patch.department as string) || "department"})`
            : `Issue details updated`),
        timestamp: now,
      });
    }
  } catch (err) {
    console.warn(`[CivicPulse] updateIssueInFirestore notice for ${issueId}:`, err);
  }
}

/**
 * Updates issue status and records a milestone status change in the timeline subcollection.
 */
export async function updateIssueStatusInFirestore(
  issueId: string,
  newStatus: CivicStatus,
  actor: { name: string; id: string; role: string },
  note?: string,
  evidenceImage?: string,
  patchData?: Partial<CivicIssue>,
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const issueRef = doc(db, "issues", issueId);
  const now = new Date().toISOString();

  try {
    const sanitizedPatch: Record<string, unknown> = { ...(patchData || {}) };
    if (typeof sanitizedPatch["image"] === "string" && !isDurableImageUrl(sanitizedPatch["image"] as string)) {
      delete sanitizedPatch["image"];
    }
    if (typeof sanitizedPatch["beforeImage"] === "string" && !isDurableImageUrl(sanitizedPatch["beforeImage"] as string)) {
      delete sanitizedPatch["beforeImage"];
    }
    if (typeof sanitizedPatch["afterImage"] === "string" && !isDurableImageUrl(sanitizedPatch["afterImage"] as string)) {
      delete sanitizedPatch["afterImage"];
    }
    if (
      typeof sanitizedPatch["resolutionEvidence"] === "string" &&
      !isDurableImageUrl(sanitizedPatch["resolutionEvidence"] as string)
    ) {
      delete sanitizedPatch["resolutionEvidence"];
    }

    const durableEvidence = sanitizeImageUrl(evidenceImage);

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updatedAt: now,
      ...sanitizedPatch,
    };

    if (newStatus === "RESOLVED") {
      updatePayload["resolvedAt"] = now;
      updatePayload["verificationStatus"] = "VERIFIED";
      if (durableEvidence) {
        updatePayload["resolutionEvidence"] = durableEvidence;
      }
    }

    if (newStatus === "AWAITING CITIZEN VERIFICATION" || newStatus === "RESOLUTION SUBMITTED") {
      updatePayload["verificationStatus"] = "PENDING";
      if (durableEvidence) {
        updatePayload["resolutionEvidence"] = durableEvidence;
      }
    }

    if (newStatus === "REOPENED") {
      updatePayload["verificationStatus"] = "REJECTED";
    }

    delete updatePayload["timeline"];
    delete updatePayload["timelineRecords"];

    await updateDoc(issueRef, updatePayload);

    // Append to timeline subcollection
    const timelineCol = collection(db, "issues", issueId, "timeline");
    const eventId = `event-${Date.now()}`;
    await setDoc(doc(timelineCol, eventId), {
      id: eventId,
      issueId,
      status: newStatus,
      actorName: actor.name,
      actorId: actor.id,
      actorRole: actor.role,
      note: note || `Status updated to ${newStatus}`,
      evidenceImage: durableEvidence || null,
      timestamp: now,
    });
  } catch (err) {
    console.warn(`[CivicPulse] updateIssueStatusInFirestore notice for ${issueId}:`, err);
  }
}

