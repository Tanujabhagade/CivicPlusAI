import type { CivicIssue } from "@/lib/civic-data";

export type AIAnalysis = {
  category: string;
  severity: CivicIssue["priority"];
  impact: string;
  department: string;
  confidence: number;
  summary: string;
  detectedProblem: string;
  reasoning: string;
  recommendedAction: string;
  duplicateIds: string[];
  usedMock: boolean;
  mockReason?: string | undefined;
};

export type { DuplicateSuggestion, DuplicateMatchLevel } from "./duplicateService";
export { detectDuplicates } from "./duplicateService";

export const isMockMode = (mode?: "mock" | "real") => {
  if (import.meta.env["VITE_MOCK_AI_MODE"] === "false") return false;
  if (import.meta.env["VITE_MOCK_AI_MODE"] === "true") return true;
  return mode === "mock";
};

function mockAnalysis(description: string, location?: string): AIAnalysis {
  const text = description.toLowerCase();
  const water = /water|leak|pipe|burst|tap|plumb/.test(text);
  const road = /pothole|road|pavement|street|crater|asphalt/.test(text);
  const garbage = /garbage|waste|bin|overflow|litter|dump|trash/.test(text);
  const drain = /drain|gutter|clog|sewage|storm/.test(text);
  const light = /streetlight|light|dark|pole|wire|lamp/.test(text);
  const tree = /tree|branch|fallen|leaf/.test(text);
  const signage = /sign|board|signal|traffic/.test(text);

  const category = water
    ? "Water Leakage"
    : road
      ? "Pothole / Road Damage"
      : garbage
        ? "Garbage / Waste"
        : drain
          ? "Drainage"
          : light
            ? "Broken Streetlight"
            : tree
              ? "Fallen Tree"
              : signage
                ? "Damaged Signage"
                : "Other Infrastructure";

  const department =
    category === "Water Leakage"
      ? "Water Supply"
      : category === "Pothole / Road Damage"
        ? "Road Maintenance"
        : category === "Garbage / Waste"
          ? "Waste Management"
          : category === "Drainage"
            ? "Drainage"
            : category === "Broken Streetlight"
              ? "Electrical"
              : category === "Fallen Tree"
                ? "Parks & Gardens"
                : category === "Damaged Signage"
                  ? "Traffic & Signage"
                  : "Infrastructure";

  const severity: CivicIssue["priority"] = /life|collapse|electroc|sinkhole/.test(text)
    ? "Critical"
    : /danger|crash|blocked|accident|burst|flooding|severe|deep/.test(text)
      ? "High"
      : "Medium";

  return {
    category,
    severity,
    impact:
      severity === "Critical"
        ? "Severe public hazard requiring emergency response team."
        : severity === "High"
          ? "May create a public safety risk and disrupt daily movement."
          : "Localized disruption reported by residents.",
    department,
    confidence: 72,
    summary: `[DEMO AI / FALLBACK] Issue regarding ${category.toLowerCase()}${location ? ` near ${location}` : ""} based on text pattern matching.`,
    detectedProblem: description.trim() || `${category} reported`,
    reasoning:
      "DEMO AI / FALLBACK heuristic used. Real multimodal vision was not applied or was unavailable due to a service error.",
    recommendedAction: `Forward ticket to ${department} for inspection and dispatch.`,
    duplicateIds: [],
    usedMock: true,
    mockReason: "DEMO AI / FALLBACK",
  };
}

export async function analyzeImage(
  imageData: string | undefined,
  description: string,
  mode?: "mock" | "real",
  locationContext?: string,
): Promise<AIAnalysis> {
  if (isMockMode(mode)) {
    return mockAnalysis(description, locationContext);
  }

  const maxRetries = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageData,
          description,
          location: locationContext,
        }),
      });

      if (!response.ok) {
        const isTransient =
          response.status === 503 ||
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 504;
        const errBody = await response.text().catch(() => "");
        if (isTransient && attempt < maxRetries) {
          const delay = (attempt + 1) * 1000;
          console.warn(
            `[CivicPulse AI Client] Server status ${response.status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`AI server responded with status ${response.status}: ${errBody}`);
      }

      const result = (await response.json()) as Partial<AIAnalysis>;
      if (!result.category || !result.summary || !result.department || !result.severity) {
        throw new Error("Invalid or incomplete AI response from server");
      }

      return {
        category: result.category,
        severity: result.severity,
        impact: result.impact ?? "Impact requires municipal review.",
        department: result.department,
        confidence: Math.min(99, Math.max(50, Math.round(Number(result.confidence) || 85))),
        summary: result.summary,
        detectedProblem: result.detectedProblem ?? description,
        reasoning: result.reasoning ?? "Classified by Gemini Vision AI.",
        recommendedAction: result.recommendedAction ?? `Dispatch to ${result.department}`,
        duplicateIds: result.duplicateIds ?? [],
        usedMock: Boolean(result.usedMock),
        mockReason: result.mockReason,
      };
    } catch (err) {
      lastError = err;
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && /fetch|network|abort|timeout/i.test(err.message));
      if (isNetwork && attempt < maxRetries) {
        const delay = (attempt + 1) * 1000;
        console.warn(
          `[CivicPulse AI Client] Network error. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`,
          err,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  console.warn(
    "[CivicPulse AI Client] Real vision call failed after retries, activating DEMO AI / FALLBACK:",
    lastError,
  );
  const fallback = mockAnalysis(description, locationContext);
  return {
    ...fallback,
    usedMock: true,
    mockReason:
      lastError instanceof Error
        ? `DEMO AI / FALLBACK (${lastError.message})`
        : "DEMO AI / FALLBACK (AI service unavailable)",
  };
}

export async function analyzeText(
  description: string,
  mode?: "mock" | "real",
  locationContext?: string,
): Promise<AIAnalysis> {
  return analyzeImage(undefined, description, mode, locationContext);
}

export function estimateSeverity(description: string): CivicIssue["priority"] {
  return mockAnalysis(description).severity;
}

export function generateInsights(issues: CivicIssue[]) {
  const roadCount = issues.filter((issue) => issue.category.includes("Road")).length;
  const garbageCount = issues.filter((issue) => issue.category === "Garbage").length;

  return [
    `Multiple road damage reports have appeared in ${issues.find((issue) => issue.category.includes("Road"))?.ward ?? "the busiest ward"}.`,
    `Garbage overflow reports increased this month (${garbageCount} in the demo register).`,
    `Streetlight complaints are recurring near ${roadCount > 0 ? "a supported civic area" : "this location"}.`,
  ];
}
