import type { CivicIssue } from "@/lib/civic-data";

export type DuplicateMatchLevel = "high" | "medium" | "low";

export type DuplicateSignals = {
  geoScore: number; // 0 - 40
  categoryScore: number; // 0 - 25
  textScore: number; // 0 - 25
  timeScore: number; // 0 - 10
  distanceMeters: number;
  sharedKeywords: string[];
};

export type DuplicateSuggestion = {
  issueId: string;
  category: string;
  distance: string;
  location: string;
  status: CivicIssue["status"];
  date: string;
  similarity: number; // 0 - 99
  matchLevel: DuplicateMatchLevel;
  reason: string;
  signals: DuplicateSignals;
};

export type DraftIssueForDuplicateScan = {
  category?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  location?: string;
};

/**
 * Standard Haversine distance in meters between two geographical coordinates
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "with",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  // Civic and reporting boilerplate stop words
  "reported",
  "nearby",
  "resident",
  "residents",
  "issue",
  "issues",
  "problem",
  "problems",
  "affecting",
  "movement",
  "daily",
  "needs",
  "municipal",
  "attention",
  "please",
  "condition",
  "complaint",
  "report",
  "reports",
  "location",
  "found",
  "there",
  "around",
  "place",
  "here",
]);

/**
 * Extracts and stems meaningful tokens from civic text, ignoring common stop words and punctuation.
 */
export function extractKeywords(text?: string): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return words.map((w) => {
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
    if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
    return w;
  });
}

/**
 * Returns a 0.0 - 1.0 category similarity score.
 * Exact match = 1.0
 * Related categories = partial credit (0.35 - 0.65)
 * Unrelated = 0.0
 */
export function getCategorySimilarity(cat1?: string, cat2?: string): number {
  if (!cat1 || !cat2) return 0.0;
  if (cat1.trim().toLowerCase() === cat2.trim().toLowerCase()) return 1.0;

  const c1 = cat1.toLowerCase();
  const c2 = cat2.toLowerCase();

  // Water supply & drainage overlap
  const isWaterOrDrain1 = c1.includes("water") || c1.includes("drain");
  const isWaterOrDrain2 = c2.includes("water") || c2.includes("drain");
  if (isWaterOrDrain1 && isWaterOrDrain2) return 0.65;

  // Road damage & general infrastructure
  const isRoad1 = c1.includes("road") || c1.includes("pothole");
  const isRoad2 = c2.includes("road") || c2.includes("pothole");
  if (isRoad1 && isRoad2) return 1.0;
  if ((isRoad1 && c2.includes("infra")) || (isRoad2 && c1.includes("infra"))) return 0.4;

  // Streetlights & damaged signage
  const isElectricalOrSign1 =
    c1.includes("light") || c1.includes("electric") || c1.includes("sign");
  const isElectricalOrSign2 =
    c2.includes("light") || c2.includes("electric") || c2.includes("sign");
  if (isElectricalOrSign1 && isElectricalOrSign2) return 0.4;

  // Garbage & clogged drainage
  if (
    (c1.includes("garb") || c1.includes("waste")) &&
    (c2.includes("drain") || c2.includes("waste") || c2.includes("garb"))
  ) {
    return 0.35;
  }

  return 0.0;
}

/**
 * Calculates time proximity score between 0.0 and 1.0 based on ticket creation timestamp or age.
 */
export function getTimeProximityScore(createdAt?: string, age?: string): number {
  let diffHours = 48; // default fallback: 2 days
  if (createdAt) {
    const time = new Date(createdAt).getTime();
    if (!Number.isNaN(time)) {
      diffHours = Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
    }
  } else if (age) {
    if (age.includes("min")) diffHours = 0.5;
    else if (age.includes("h")) diffHours = parseFloat(age) || 2;
    else if (age.includes("d")) diffHours = (parseFloat(age) || 1) * 24;
  }

  if (diffHours <= 6) return 1.0;
  if (diffHours <= 24) return 0.9;
  if (diffHours <= 72) return 0.75;
  if (diffHours <= 168) return 0.55; // 1 week
  if (diffHours <= 720) return 0.35; // 1 month
  return 0.15;
}

/**
 * Real client-side dynamic duplicate detection engine.
 * Calculates transparent weighted similarity score based on:
 * - Geographic distance (Haversine): 40%
 * - Category similarity: 25%
 * - Description/keyword similarity: 25%
 * - Time proximity: 10%
 *
 * Thresholds:
 * - High similarity: >= 65% ("Likely duplicate")
 * - Medium similarity: 40% - 64% ("Possible related issue")
 * - Filtered out: < 40%
 */
export function detectDuplicates(
  draft: DraftIssueForDuplicateScan,
  issues: CivicIssue[],
  radiusMeters = 800,
): DuplicateSuggestion[] {
  const draftTokens = extractKeywords(draft.description);
  const draftTokenSet = new Set(draftTokens);

  const results: DuplicateSuggestion[] = [];

  for (const issue of issues) {
    // 1. Geographic distance calculation
    const hasCoordinates =
      draft.latitude != null &&
      draft.longitude != null &&
      issue.latitude != null &&
      issue.longitude != null;

    const distanceMeters = hasCoordinates
      ? calculateDistanceMeters(
          draft.latitude as number,
          draft.longitude as number,
          issue.latitude as number,
          issue.longitude as number,
        )
      : Number.POSITIVE_INFINITY;

    // Hard ceiling: if distance exceeds 2.5x the scan radius or coordinates are in a different municipality (>5km),
    // physical duplicate probability is negligible.
    if (Number.isFinite(distanceMeters) && distanceMeters > Math.max(1500, radiusMeters * 2.5)) {
      continue;
    }

    let geoRatio = 0;
    if (Number.isFinite(distanceMeters)) {
      if (distanceMeters <= radiusMeters) {
        // Continuous smooth decay curve giving high weight to close incidents (<100m)
        geoRatio = Math.max(0, 1 - Math.pow(distanceMeters / radiusMeters, 1.2));
      } else {
        // Soft outer zone between radius and 2.5x radius
        const maxDist = Math.max(1500, radiusMeters * 2.5);
        geoRatio = Math.max(
          0,
          0.25 * (1 - (distanceMeters - radiusMeters) / (maxDist - radiusMeters)),
        );
      }
    } else {
      // Coordinate fallback: check address or city string match
      const draftLoc = (draft.location || "").toLowerCase();
      const issueLoc = (issue.location || "").toLowerCase();
      if (draftLoc && issueLoc && (draftLoc.includes(issueLoc) || issueLoc.includes(draftLoc))) {
        geoRatio = 0.5;
      }
    }
    const geoScore = Math.round(geoRatio * 40 * 10) / 10; // max 40 pts

    // 2. Category similarity (max 25 pts)
    const catRatio = getCategorySimilarity(draft.category, issue.category);
    const categoryScore = Math.round(catRatio * 25 * 10) / 10;

    // 3. Description / Keyword similarity (max 25 pts)
    const issueTokens = extractKeywords(`${issue.title} ${issue.description}`);
    const issueTokenSet = new Set(issueTokens);
    const shared = [...draftTokenSet].filter((token) => issueTokenSet.has(token));

    let textRatio = 0;
    if (draftTokenSet.size > 0 && issueTokenSet.size > 0) {
      const intersectionSize = shared.length;
      const unionSize = new Set([...draftTokenSet, ...issueTokenSet]).size;
      const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0;
      const overlap =
        Math.min(draftTokenSet.size, issueTokenSet.size) > 0
          ? intersectionSize / Math.min(draftTokenSet.size, issueTokenSet.size)
          : 0;
      // Combined Jaccard + Overlap metric
      textRatio = Math.min(1.0, 0.4 * jaccard + 0.6 * overlap);
      // Boost if multiple meaningful civic keywords match
      if (intersectionSize >= 2) {
        textRatio = Math.min(1.0, textRatio + 0.15);
      }
    }
    const textScore = Math.round(textRatio * 25 * 10) / 10;

    // 4. Time proximity (max 10 pts)
    const timeRatio = getTimeProximityScore(issue.createdAt, issue.age);
    const timeScore = Math.round(timeRatio * 10 * 10) / 10;

    // Total transparent weighted similarity percentage (0 - 99)
    // Formula: Geo (40%) + Category (25%) + Text (25%) + Time (10%)
    let rawSimilarity = geoScore + categoryScore + textScore + timeScore;

    // Cross-check: If physical location is very far (>1000m), cap similarity to prevent false positive duplicates
    if (Number.isFinite(distanceMeters) && distanceMeters > 1000) {
      rawSimilarity = Math.min(rawSimilarity, 38);
    }

    const similarity = Math.round(Math.min(99, Math.max(0, rawSimilarity)));

    // Minimum threshold to consider as duplicate candidate
    if (similarity < 40) {
      continue;
    }

    const matchLevel: DuplicateMatchLevel = similarity >= 65 ? "high" : "medium";

    // Build transparent reason string detailing contributing signals
    const reasonParts: string[] = [];
    if (Number.isFinite(distanceMeters)) {
      reasonParts.push(`${distanceMeters}m away`);
    } else {
      reasonParts.push("Nearby area");
    }

    if (catRatio === 1.0) {
      reasonParts.push("Same category");
    } else if (catRatio > 0) {
      reasonParts.push("Related category");
    }

    if (shared.length > 0) {
      reasonParts.push(`Matched keywords: ${shared.slice(0, 3).join(", ")}`);
    }

    if (timeRatio >= 0.8) {
      reasonParts.push("Reported recently");
    }

    const reason = reasonParts.join(" • ");

    results.push({
      issueId: issue.id,
      category: issue.category,
      distance: Number.isFinite(distanceMeters) ? `${distanceMeters} m` : "Nearby",
      location: issue.location,
      status: issue.status,
      date: issue.createdAt ?? issue.age,
      similarity,
      matchLevel,
      reason,
      signals: {
        geoScore,
        categoryScore,
        textScore,
        timeScore,
        distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : -1,
        sharedKeywords: shared,
      },
    });
  }

  // Sort by similarity percentage descending, then by distance ascending
  results.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return a.signals.distanceMeters - b.signals.distanceMeters;
  });

  return results.slice(0, 4);
}
