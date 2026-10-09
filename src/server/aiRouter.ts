import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import { categories, departments } from "../lib/civic-data";
import { normalizeSeverity } from "../services/severityService";

export type ServerAIRequest = {
  imageData?: string;
  description?: string;
  location?: string;
};

export type ServerAIResponse = {
  category: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  department: string;
  summary: string;
  detectedProblem: string;
  confidence: number;
  reasoning: string;
  recommendedAction: string;
  impact: string;
  usedMock: boolean;
  mockReason?: string | undefined;
};

const ALLOWED_CATEGORIES = [
  "Pothole / Road Damage",
  "Garbage / Waste",
  "Water Leakage",
  "Drainage",
  "Broken Streetlight",
  "Fallen Tree",
  "Damaged Signage",
  "Other Infrastructure",
] as const;

const ALLOWED_DEPARTMENTS = departments;

function normalizeCategory(raw?: string): string {
  if (!raw) return "Pothole / Road Damage";
  const lower = raw.toLowerCase();

  // Water leakage / pipe burst takes absolute priority
  if (
    lower.includes("water") ||
    lower.includes("pipe") ||
    lower.includes("leak") ||
    lower.includes("tap") ||
    lower.includes("burst") ||
    lower.includes("valve")
  ) {
    return "Water Leakage";
  }

  if (
    lower.includes("pothole") ||
    lower.includes("road") ||
    lower.includes("asphalt") ||
    lower.includes("pavement") ||
    lower.includes("crater")
  ) {
    return "Pothole / Road Damage";
  }

  if (
    lower.includes("garb") ||
    lower.includes("waste") ||
    lower.includes("trash") ||
    lower.includes("litter") ||
    lower.includes("dump") ||
    lower.includes("bin")
  ) {
    return "Garbage / Waste";
  }

  if (
    lower.includes("drain") ||
    lower.includes("sewer") ||
    lower.includes("gutter") ||
    lower.includes("clog") ||
    lower.includes("storm")
  ) {
    return "Drainage";
  }

  if (
    lower.includes("light") ||
    lower.includes("lamp") ||
    lower.includes("pole") ||
    lower.includes("streetlight") ||
    lower.includes("electric")
  ) {
    return "Broken Streetlight";
  }

  if (lower.includes("tree") || lower.includes("branch") || lower.includes("fallen")) {
    return "Fallen Tree";
  }

  if (
    lower.includes("sign") ||
    lower.includes("board") ||
    lower.includes("signal") ||
    lower.includes("traffic")
  ) {
    return "Damaged Signage";
  }

  return "Other Infrastructure";
}

function normalizeDepartment(raw?: string, category?: string): string {
  switch (category) {
    case "Water Leakage":
      return "Water Supply";
    case "Pothole / Road Damage":
      return "Road Maintenance";
    case "Garbage / Waste":
      return "Waste Management";
    case "Drainage":
      return "Drainage";
    case "Broken Streetlight":
      return "Electrical";
    case "Fallen Tree":
      return "Parks & Gardens";
    case "Damaged Signage":
      return "Traffic & Signage";
    default:
      return "Infrastructure";
  }
}

export function generateServerMockAnalysis(description: string, reason?: string): ServerAIResponse {
  const text = (description || "").toLowerCase();
  const water = /water|leak|pipe|burst|tap|plumb/.test(text);
  const road = /pothole|road|pavement|asphalt|street|crater/.test(text);
  const garbage = /garbage|waste|bin|overflow|litter|dump|trash/.test(text);
  const drain = /drain|gutter|clog|sewage|storm/.test(text);
  const light = /streetlight|light|dark|pole|wire|lamp/.test(text);
  const tree = /tree|branch|fallen/.test(text);
  const signage = /sign|board|signal/.test(text);

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

  const department = normalizeDepartment(undefined, category);

  const isHigh = /danger|crash|blocked|accident|burst|flooding|severe|deep/.test(text);
  const isCritical = /life|collapse|electroc|sinkhole/.test(text);
  const severity = isCritical ? "Critical" : isHigh ? "High" : "Medium";

  return {
    category,
    severity,
    department,
    summary: `[DEMO AI / FALLBACK] Issue regarding ${category.toLowerCase()} identified via fallback heuristics.`,
    detectedProblem: description || `Reported ${category.toLowerCase()} concern`,
    confidence: 72,
    reasoning:
      "DEMO AI / FALLBACK classification generated from report description. Real Gemini multimodal vision was unavailable or encountered a service error.",
    recommendedAction: `Forward ticket to ${department} for inspection and dispatch.`,
    impact:
      severity === "Critical"
        ? "Severe public hazard requiring emergency response team."
        : severity === "High"
          ? "May disrupt local movement and create pedestrian/vehicle safety risk."
          : "Localized disruption reported by nearby residents.",
    usedMock: true,
    mockReason: reason || "DEMO AI / FALLBACK",
  };
}

function isTransientGeminiError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number | string })?.status;
  const code = (error as { code?: number | string })?.code;

  // Never retry permanent authorization/configuration/bad-request errors
  if (
    /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|unauthorized|forbidden|401|403|INVALID_ARGUMENT|NOT_FOUND|invalid_argument/i.test(
      message,
    )
  ) {
    return false;
  }

  // Transient errors: 503 (high demand/overloaded), 429 (rate limit), 500, 502, 504, network drops
  const statusNum = Number(status) || Number(code) || 0;
  if (
    statusNum === 503 ||
    statusNum === 429 ||
    statusNum === 500 ||
    statusNum === 502 ||
    statusNum === 504
  ) {
    return true;
  }

  return (
    /\b503\b|service unavailable|high demand|overloaded|model is overloaded/i.test(message) ||
    /\b429\b|RESOURCE_EXHAUSTED|rate limit|too many requests|quota exceeded/i.test(message) ||
    /\b500\b|\b502\b|\b504\b|gateway timeout|bad gateway|internal server error|internal error/i.test(
      message,
    ) ||
    /fetch failed|socket hang up|econnreset|etimedout|abort|timeout|network/i.test(message)
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModelWithRetry<T>(
  action: () => Promise<T>,
  modelName: string,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await action();
    } catch (err) {
      attempt++;
      const isTransient = isTransientGeminiError(err);
      if (!isTransient || attempt > maxRetries) {
        if (!isTransient) {
          console.warn(
            `[CivicPulse AI Server] Permanent error on ${modelName} (attempt ${attempt}) - will not retry:`,
            err instanceof Error ? err.message : err,
          );
        } else {
          console.warn(
            `[CivicPulse AI Server] Retries exhausted (${maxRetries}) for temporary error on ${modelName}:`,
            err instanceof Error ? err.message : err,
          );
        }
        throw err;
      }
      const delay = baseDelayMs * attempt; // 1000ms for 1st retry, 2000ms for 2nd retry
      console.warn(
        `[CivicPulse AI Server] Temporary Gemini failure on ${modelName} (${err instanceof Error ? err.message : err}). Retrying in ${delay}ms (retry ${attempt} of ${maxRetries})...`,
      );
      await sleep(delay);
    }
  }
}

function getGeminiApiKey(): string | undefined {
  const key = process.env["GEMINI_API_KEY"]?.trim();
  if (
    !key ||
    key.startsWith("MY_") ||
    key.startsWith("YOUR_") ||
    key.startsWith("TODO") ||
    key.toLowerCase().includes("configured")
  ) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/^GEMINI_API_KEY=(.+)$/m);
        if (match && match[1]) {
          const fileKey = match[1].trim();
          if (
            fileKey &&
            !fileKey.startsWith("MY_") &&
            !fileKey.startsWith("YOUR_") &&
            !fileKey.startsWith("TODO")
          ) {
            return fileKey;
          }
        }
      }
    } catch (e) {
      console.warn("[CivicPulse AI Server] Error reading .env:", e);
    }
  }
  return key;
}

export async function processAiAnalyze(body: ServerAIRequest): Promise<ServerAIResponse> {
  const { imageData, description = "", location = "" } = body;
  const apiKey = getGeminiApiKey();

  // Diagnostic logging without logging sensitive credentials or image payloads
  console.log(
    `[CivicPulse AI Server] /api/ai/analyze request received. HasApiKey: ${Boolean(apiKey && apiKey.trim())}, KeyPrefix: ${apiKey ? apiKey.slice(0, 5) + "..." : "none"}, KeyLen: ${apiKey?.length ?? 0}, HasImage: ${Boolean(imageData && imageData.length > 50)}, DescriptionLength: ${description.length}`,
  );

  if (!apiKey || apiKey.trim() === "") {
    console.warn("[CivicPulse AI Server] No GEMINI_API_KEY configured. Returning fallback.");
    return generateServerMockAnalysis(
      description,
      "No GEMINI_API_KEY configured on server; using Demo AI / Fallback.",
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Parse image if provided
    let mimeType = "image/jpeg";
    let base64Data = "";
    if (imageData && imageData.length > 50) {
      if (imageData.startsWith("data:")) {
        const match = imageData.match(/^data:([^;]+);base64,(.+)$/s);
        if (match && match[1] && match[2]) {
          mimeType = match[1];
          base64Data = match[2].trim();
        }
      } else {
        base64Data = imageData.trim();
      }
    }

    const hasImage = Boolean(base64Data && base64Data.length > 50);
    const contents: Array<string | { inlineData: { mimeType: string; data: string } }> = [];

    if (hasImage) {
      contents.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const promptText = `
You are the senior municipal triage intelligence officer for CivicPulse in Maharashtra, India. Your task is to analyze this civic infrastructure report.
${
  hasImage
    ? `
*** CRITICAL DIRECTIVE: VISUAL EVIDENCE IS PRIMARY AND DEFINITIVE ***
A photograph of the actual physical condition is attached above.
- The visual evidence in the photo MUST ALWAYS OVERRIDE any contradictory citizen text description!
- Citizens often make mistakes, misidentify faults, or submit inaccurate text (e.g., submitting a photo of a burst water pipe or leaking tap, but mistakenly typing "There is a large pothole on the road").
- If the photo clearly depicts leaking water, burst pipeline, flooded road from a water leak, damaged tap, or plumbing:
  * Category MUST BE "Water Leakage"
  * Department MUST BE "Water Supply"
  * Do NOT classify as "Pothole / Road Damage" just because the citizen's text says pothole!
- If the photo depicts road surface damage, crater, broken asphalt: Category MUST be "Pothole / Road Damage" and Department "Road Maintenance".
- If the photo depicts garbage heaps, overflowing bins, plastic waste: Category MUST be "Garbage / Waste" and Department "Waste Management".
- If the photo depicts clogged drains, stagnant sewage, overflowing gutter: Category MUST be "Drainage" and Department "Drainage".
- If the photo depicts a broken/dark streetlight, fallen light pole: Category MUST be "Broken Streetlight" and Department "Electrical".
- If the photo depicts a fallen tree or branch: Category MUST be "Fallen Tree" and Department "Parks & Gardens".
- In your "reasoning" and "detectedProblem", explicitly describe what is visible in the photograph, and if the citizen's description contradicts the visual evidence, note the discrepancy directly.
`
    : ""
}

Analyze the civic issue based on the citizen text description and location context.

Citizen Description (Secondary Context): "${description || "No description provided"}"
Location Context: "${location || "Maharashtra Municipal Area"}"

Allowed Categories (choose EXACTLY ONE):
- Pothole / Road Damage
- Garbage / Waste
- Water Leakage
- Drainage
- Broken Streetlight
- Fallen Tree
- Damaged Signage
- Other Infrastructure

Allowed Departments:
- Road Maintenance
- Waste Management
- Water Supply
- Drainage
- Electrical
- Parks & Gardens
- Traffic & Signage
- Infrastructure

Allowed Severities:
- Critical
- High
- Medium
- Low

Provide your real confidence score (an integer between 50 and 99).
`.trim();

    contents.push(promptText);

    const callModel = async (modelName: string) => {
      console.log(
        `[CivicPulse AI Server] Calling Gemini model: ${modelName} with multimodal payload...`,
      );
      return await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction:
            "You are the senior municipal triage intelligence officer for CivicPulse. Visual evidence in photographs always overrides contradictory citizen text descriptions. Respond ONLY with valid JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: "The primary civic issue category",
              },
              severity: {
                type: Type.STRING,
                description: "Critical, High, Medium, or Low",
              },
              department: {
                type: Type.STRING,
                description: "The municipal department responsible for fixing this",
              },
              summary: {
                type: Type.STRING,
                description: "Concise summary of the civic condition",
              },
              detectedProblem: {
                type: Type.STRING,
                description: "The specific physical fault detected from visual evidence",
              },
              confidence: {
                type: Type.INTEGER,
                description: "Confidence percentage between 50 and 99",
              },
              reasoning: {
                type: Type.STRING,
                description: "Rationale explaining visual evidence vs citizen description",
              },
              recommendedAction: {
                type: Type.STRING,
                description: "Suggested municipal field action",
              },
              impact: {
                type: Type.STRING,
                description: "Impact on citizens, pedestrians, or traffic",
              },
            },
            required: [
              "category",
              "severity",
              "department",
              "summary",
              "detectedProblem",
              "confidence",
              "reasoning",
              "recommendedAction",
              "impact",
            ],
          },
        },
      });
    };

    let response;
    try {
      response = await callModelWithRetry(
        () => callModel("gemini-flash-latest"),
        "gemini-flash-latest",
        2,
        1000,
      );
    } catch (primaryErr) {
      if (!isTransientGeminiError(primaryErr)) {
        // Permanent error (e.g. invalid auth) - do not attempt alternate models
        throw primaryErr;
      }
      console.warn(
        "[CivicPulse AI Server] gemini-flash-latest retries exhausted for temporary failure. Trying gemini-3.1-flash-lite with retry...",
        primaryErr,
      );
      response = await callModelWithRetry(
        () => callModel("gemini-3.1-flash-lite"),
        "gemini-3.1-flash-lite",
        2,
        1000,
      );
    }

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response text from AI model");
    }

    const parsed = JSON.parse(responseText.trim()) as Partial<ServerAIResponse>;
    const category = normalizeCategory(parsed.category);
    const severity = normalizeSeverity(parsed.severity);
    const department = normalizeDepartment(parsed.department, category);
    const confidence = Math.min(99, Math.max(50, Math.round(Number(parsed.confidence) || 88)));

    console.log(
      `[CivicPulse AI Server] Gemini triage success! Category: ${category}, Dept: ${department}, Confidence: ${confidence}%`,
    );

    return {
      category,
      severity,
      department,
      summary: parsed.summary || `Civic issue regarding ${category.toLowerCase()}`,
      detectedProblem: parsed.detectedProblem || description || category,
      confidence,
      reasoning: parsed.reasoning || "Classified using Gemini multimodal vision analysis.",
      recommendedAction: parsed.recommendedAction || `Dispatch to ${department}.`,
      impact: parsed.impact || "Localized disruption in neighborhood.",
      usedMock: false,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "AI service temporarily unavailable";
    console.error(
      "[CivicPulse AI Server] Real AI call failed after retries, falling back to mock:",
      errorMsg,
    );
    return generateServerMockAnalysis(
      description,
      "AI analysis temporarily unavailable. You can continue with assisted classification.",
    );
  }
}
