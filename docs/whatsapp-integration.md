# WhatsApp Integration Approach

## Library Choice
We chose `whatsapp-web.js` running over `puppeteer-core`. 
- **Why not Business API?** The assignment explicitly forbid it, mimicking a scrappy startup environment.
- **Why this library?** It injects directly into the WhatsApp Web React app, allowing us to seamlessly capture group messages, download media (images), and maintain local session auth without reverse-engineering mobile protocols.

## Session Persistence
We use the built-in `LocalAuth` strategy provided by `whatsapp-web.js`. This creates a `.wwebjs_auth` folder containing the Chromium user data directory. This allows the bot to restart, crash, or reboot without forcing the user to re-scan the QR code.

## Group Discovery
Because `whatsapp-web.js`'s `client.getChats()` API is frequently broken by WhatsApp UI updates (yielding `Execution context was destroyed`), we implemented a **Dynamic Event-Driven Discovery** fallback. When any message arrives globally, the bot records the Group ID internally. The frontend dropdown is populated dynamically by these observed groups.

## Routing Logic
We uniquely identify the group via:
```javascript
const actualGroupId = message.from.endsWith('@g.us') ? message.from : message.to;
```
This safely standardizes the ID regardless of whether the user sent the message from their own phone or received it from a group member.
