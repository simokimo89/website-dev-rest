import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Allow body payload parsed up to 10MB to handle large data requests if needed
app.use(express.json({ limit: '10mb' }));

// Initialize GenAI Client lazily to prevent crashing on boot if key is missing or invalid
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined in your environment variables. Please check Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API endpoint to generate high-quality close-up Italian ingredients or product image
app.post("/api/generate-placeholder", async (req: any, res: any) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "A prompt is required to generate the visual placeholder." });
    }

    const ai = getAiClient();

    // Use gemini-2.5-flash-image for general image generation or editing tasks as dictated by the developer guidelines
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            text: `Professional food photography, ultra close-up organic focus, macro detail. Authentic Italian ingredient: ${prompt}. Beautiful culinary setup, rustic wooden tabletop, natural warm lighting, high-contrast, mouth-watering fine dining style.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "4:3",
        },
      },
    });

    let base64Image = null;

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Image) {
      const explanationText = response.text || "No image part was returned by the model.";
      return res.status(500).json({
        error: "Failure during visual generation",
        details: explanationText
      });
    }

    return res.json({
      success: true,
      imageUrl: `data:image/png;base64,${base64Image}`
    });

  } catch (error: any) {
    console.error("Error generating placeholder image via AI:", error);
    const errorMessage = error.message || String(error);
    const isQuotaExceeded = errorMessage.includes("429") || 
                            errorMessage.includes("quota") || 
                            errorMessage.includes("Quota") || 
                            errorMessage.includes("limit") || 
                            errorMessage.includes("RESOURCE_EXHAUSTED") ||
                            errorMessage.includes("rate-limits");
                            
    const isAuthError = errorMessage.includes("API key") || 
                        errorMessage.includes("key is not defined") || 
                        errorMessage.includes("403") || 
                        errorMessage.includes("401");

    return res.status(500).json({
      success: false,
      error: "Error triggering GenAI model. Ensure you have activated your premium Gemini API credentials or updated your secrets.",
      isQuotaExceeded,
      isAuthError,
      details: errorMessage
    });
  }
});

async function startServer() {
  // Vite middleware for development or static serving for production environments
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to host 0.0.0.0 and Port 3000 strictly according to container parameters
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
