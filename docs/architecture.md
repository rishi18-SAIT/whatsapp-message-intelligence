# System Architecture

## Overview
The system follows a strict microservice-style separation of concerns, divided into three primary tiers: `wa-connector`, `backend`, and `frontend`, alongside a PostgreSQL `database`.

## Flow Diagram
```
WhatsApp Group 
     ↓ (Puppeteer Web Socket)
[wa-connector] 
     - Handles QR Auth & Persistent Session
     - Filters by Monitored Group ID
     - Downloads Media Payloads
     ↓ (HTTP POST /intake)
[backend]
     - Validates & Deduplicates (via DB Unique Constraint)
     - Stores original message safely
     - Asynchronously invokes AI Service
     ↓ (REST API / Gemini API)
[AI Service] (Gemini 1.5 Flash)
     - Processes Text + Image via structured JSON schema
     - Returns classification, extraction, and confidence
     ↓ 
[backend]
     - Evaluates Uncertainty Policy (Confidence < 0.8 -> NEEDS_REVIEW)
     - Updates message status in DB
     ↓ (HTTP GET Polling)
[frontend]
     - React UI fetching queues
     - Approves/Edits classifications
```

## Key Decisions
1. **Separation of WA Connector**: Keeping the `whatsapp-web.js` library in its own process is critical because browser automation is memory-heavy and crash-prone. Separating it ensures backend API uptime even if WhatsApp Web forces a reconnect.
2. **Database-Level Deduplication**: Enforced via a `UNIQUE` constraint on `whatsapp_message_id`. This guarantees we never double-process messages even if the connector sends retries.
3. **Immutability of Source Data**: The `messages` table stores verbatim input. The `message_analysis` table contains AI opinions. They are joined logically but separated physically.
