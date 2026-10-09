import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from "@/lib/firebase";
import {
  createDemoIssues,
  type CivicIssue,
  type CivicStatus,
  type CivicTimelineEvent,
} from "@/lib/civic-data";

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
}

export function subscribeToIssues(onUpdate: (issues: CivicIssue[]) => void): Unsubscribe {
  const seeded = createDemoIssues();
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
          firestoreMap.set(data.id || d.id, {
            ...data,
            id: data.id || d.id,
          });
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

export async function saveIssueToFirestore(issue: CreateIssuePayload): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const issueRef = doc(db, "issues", issue.id);
  const now = new Date().toISOString();
  const dataToSave = {
    ...issue,
    updatedAt: now,
    createdAt: issue.createdAt || now,
  };

  try {
    await setDoc(issueRef, dataToSave, { merge: true });

    // Also record initial event in timeline subcollection
    const timelineCol = collection(db, "issues", issue.id, "timeline");
    const eventId = `event-${Date.now()}`;
    await setDoc(doc(timelineCol, eventId), {
      id: eventId,
      issueId: issue.id,
      status: issue.status,
      actorName: issue.citizen,
      actorId: issue.citizenId || "anonymous",
      timestamp: now,
      note: "Complaint submitted into CivicPulse register.",
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `issues/${issue.id}`);
  }
}

export async function updateIssueStatusInFirestore(
  issueId: string,
  newStatus: CivicStatus,
  actor: { name: string; id: string; role: string },
  note?: string,
  evidenceImage?: string,
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const issueRef = doc(db, "issues", issueId);
  const now = new Date().toISOString();

  try {
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updatedAt: now,
    };

    if (newStatus === "RESOLVED") {
      updatePayload["resolvedAt"] = now;
      if (evidenceImage) {
        updatePayload["resolutionEvidence"] = evidenceImage;
      }
    }

    if (newStatus === "AWAITING CITIZEN VERIFICATION") {
      updatePayload["verificationStatus"] = "PENDING";
      if (evidenceImage) {
        updatePayload["resolutionEvidence"] = evidenceImage;
      }
    }

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
      evidenceImage: evidenceImage || null,
      timestamp: now,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `issues/${issueId}`);
  }
}
