# 9-Step Demo Script

1. **Start app**: Run `npm run dev` in `/backend`, `/frontend`, and `/wa-connector`.
2. **Connect WhatsApp**: Open `http://localhost:5173/`, scan the QR code with a test phone.
3. **Select Group**: Once status is 'Connected', select a group (e.g. "Project Team" or the internal ID) from the dropdown and start monitoring.
4. **Send Examples**: Send messages into that group via WhatsApp:
   - "deployment done"
   - "server down"
   - "DB storage 500GB"
   - "need 2 developers"
   - "deploy tomorrow?"
   - "good morning"
5. **Show Classifications**: Go to the React UI "All Messages" tab. Show all messages stored with sender, time, AI classifications, and extracted info.
6. **Duplicate Test**: Send an identical message payload/ID through API or view the deduplication trigger in backend logs to prove `whatsapp_message_id` UNIQUE constraint catches duplicates.
7. **Review Queue**: Show that uncertain or critical messages (like "server down" or low confidence ones) went to the "Review Queue". Use the UI to edit the category and hit "Approve".
8. **AI Failure & Retry**: Stop the backend process or invalidate the Gemini API key. Send a message -> show it goes to `AI_FAILED` state. Fix the backend, click "Reprocess" in the UI (or API), and show the retry succeeds.
9. **Disconnect**: Stop the `wa-connector` process and watch the UI fallback to offline, then restart it and watch it persist session automatically without QR re-scanning.
