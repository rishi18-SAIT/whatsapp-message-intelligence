# AI Approach and Model Choice

## Model Selection
We chose **Google Gemini 1.5 Flash** (via `@google/generative-ai`).
- **Why?** It natively supports **Multimodal Input** (meaning it can ingest both Text and Images simultaneously without requiring a separate OCR pipeline). It is incredibly fast, heavily optimized for structured output, and extremely cost-effective.

## Structured Output Enforcement
Instead of relying on prompt engineering ("Please return JSON format..."), we enforce absolute structured output by passing a strict JSON Schema directly into Gemini's `generationConfig` as `responseSchema`, setting `responseMimeType: "application/json"`. This guarantees the output strictly adheres to our Category enum, Severity enums, and nested Extracted data schemas. No manual regex or JSON cleaning is required.

## Image Handling
If a message contains media (`message.hasMedia`), the `wa-connector` downloads the base64 payload. The backend saves it to disk (for UI display) and forwards the raw base64 buffer directly into Gemini's `inlineData` parameter alongside the text prompt. This allows Gemini to seamlessly OCR and semantically understand screenshots, whiteboards, or error logs sent in the chat.

## Validation & Uncertainty Policy
- **Validation**: Enforced strongly by the schema constraints provided to the LLM. 
- **Uncertainty**: 
  - If `confidence >= 0.80` AND `requires_attention == false` -> `AUTO_ACCEPTED`.
  - If `confidence < 0.80` OR `requires_attention == true` -> `NEEDS_REVIEW`.
  - Malformed/Missing output -> `AI_FAILED` (with a UI-triggered Reprocess capability).
