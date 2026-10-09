import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { processAiAnalyze, type ServerAIRequest } from "./src/server/aiRouter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "50mb" }));

  // Server-side AI analysis endpoint powered by Gemini
  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const body = req.body as ServerAIRequest;
      const result = await processAiAnalyze(body);
      res.json(result);
    } catch (err) {
      console.error("[CivicPulse API Error]:", err);
      res.status(500).json({ error: "Failed to process AI analysis" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist/index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: Number(PORT) },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`CivicPulse server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
