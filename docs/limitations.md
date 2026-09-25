# Limitations & Production Risks

1. **WhatsApp Web Fragility**:
   - `whatsapp-web.js` works by injecting scripts into the official WhatsApp Web React application via Puppeteer.
   - **Risk**: Any time WhatsApp updates their UI (e.g. changing Webpack modules), the library breaks (e.g., `Execution context was destroyed`). 
   - **Mitigation**: We hardcoded `webVersionCache` to point to a stable remote HTML cache (`2.2412.54.html`). This acts as an anchor, but eventually, WhatsApp may force deprecation of old clients.

2. **Session / ToS Risk**:
   - Because we are automating a personal/standard WhatsApp account, WhatsApp's automated spam filters may flag the account and issue a ban.
   - **Mitigation**: We only *listen* to messages, we never actively *send* outbound spam, which dramatically reduces the risk profile.

3. **AI Hallucinations**:
   - LLMs can hallucinate classifications or extract incorrect dates/names.
   - **Mitigation**: The system's Human-In-The-Loop (Review Queue) and `confidence` score thresholds ensure uncertain data is manually verified before downstream usage.

4. **Scalability Constraints**:
   - Puppeteer instances consume massive RAM (hundreds of MBs per session). Running this for thousands of accounts is impossible without heavy Kubernetes scaling. It is designed solely for single-tenant or low-volume operation.

5. **Missed Messages During Outage**:
   - If the `wa-connector` crashes and reconnects later, it will only process *newly arriving* messages. It does not retroactively sync missed history.
