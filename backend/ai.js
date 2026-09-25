const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const schema = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      description: "Must be one of: Routine Update, Incident, Change Request, Resource Update, Question, Irrelevant",
    },
    summary: {
      type: SchemaType.STRING,
      description: "A short one-sentence summary of the message",
    },
    severity: {
      type: SchemaType.STRING,
      description: "Low, Medium, or High (if relevant, else Low)",
    },
    extracted: {
      type: SchemaType.OBJECT,
      description: "Key facts extracted (e.g., times, systems, quantities, people)",
      properties: {
        times: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        systems: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        quantities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        people: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
      }
    },
    requires_attention: {
      type: SchemaType.BOOLEAN,
      description: "True if this is an incident, question, or change request requiring human review",
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Confidence score between 0 and 1 of the classification",
    },
  },
  required: ["category", "summary", "severity", "extracted", "requires_attention", "confidence"],
};

const generationConfig = {
  responseMimeType: "application/json",
  responseSchema: schema,
};

// Available active Gemini models
const MODELS = ["gemini-3.7-flash", "gemini-3.8-flash"];

function getModel(modelName) {
  return genAI.getGenerativeModel({ model: modelName, generationConfig });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeMessage(text, mediaBase64, mediaType) {
    const prompt = `Analyze this WhatsApp message from a group context. Extract the details according to the schema.\nMessage text: "${text || '[Media message without text]'}"`;
    
    let content = [prompt];
    
    if (mediaBase64 && mediaType) {
        content.push({
            inlineData: {
                data: mediaBase64,
                mimeType: mediaType
            }
        });
    }

    for (const modelName of MODELS) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[AI] Trying ${modelName} (attempt ${attempt}/3)...`);
                const model = getModel(modelName);
                const result = await model.generateContent(content);
                const responseText = result.response.text();
                const parsed = JSON.parse(responseText);
                console.log(`[AI] Success with ${modelName}: category=${parsed.category}, confidence=${parsed.confidence}`);
                return parsed;
            } catch (error) {
                const isRetryable = error.status === 503 || error.status === 429;
                console.error(`[AI] ${modelName} attempt ${attempt} failed (${error.status || 'unknown'}): ${error.message}`);
                
                if (isRetryable && attempt < 3) {
                    const delay = 1500 * attempt;
                    console.log(`[AI] Retrying in ${delay}ms...`);
                    await sleep(delay);
                } else if (!isRetryable) {
                    break;
                }
            }
        }
        console.log(`[AI] All attempts failed for ${modelName}, trying fallback model...`);
    }
    
    throw new Error("All AI models failed after retries");
}

module.exports = { analyzeMessage };
