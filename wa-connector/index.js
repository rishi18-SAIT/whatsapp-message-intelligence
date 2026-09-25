const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3002;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const AUTH_PATH = path.join(__dirname, '.wwebjs_auth');
const CACHE_PATH = path.join(__dirname, '.wwebjs_cache');

let currentQR = null;
let status = 'disconnected'; // 'disconnected' | 'initializing' | 'qr_ready' | 'authenticating' | 'connected'
let monitoredGroupId = 'ALL'; // Default to 'ALL' so messages are never dropped
let seenGroups = {}; // { [groupId]: groupName }
let client = null;
const processedMessageIds = new Set();

function cleanStaleLocks() {
    try {
        const sessionPath = path.join(AUTH_PATH, 'session');
        const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
        lockFiles.forEach(f => {
            const lockPath = path.join(sessionPath, f);
            try { fs.unlinkSync(lockPath); } catch (e) {}
        });
    } catch (e) {}
}

function createClient() {
    cleanStaleLocks();
    
    const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ];

    const puppeteerOptions = {
        headless: true,
        args: puppeteerArgs
    };

    // Use system Chromium if PUPPETEER_EXECUTABLE_PATH is set (Docker/Render)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log(`[WA] Using system Chromium: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }

    return new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
        puppeteer: puppeteerOptions
    });
}

function normalizeGroupId(id) {
    if (!id) return '';
    return id.replace('@g.us', '').replace('@c.us', '').trim();
}

function extractGroupId(message) {
    if (!message) return null;
    if (message.from && message.from.endsWith('@g.us')) return message.from;
    if (message.to && message.to.endsWith('@g.us')) return message.to;
    if (message.id && message.id.remote && message.id.remote.endsWith('@g.us')) return message.id.remote;
    if (message._data && message._data.to && message._data.to.endsWith('@g.us')) return message._data.to;
    if (message._data && message._data.from && message._data.from.endsWith('@g.us')) return message._data.from;
    if (message._data && message._data.id && message._data.id.remote && message._data.id.remote.endsWith('@g.us')) return message._data.id.remote;
    return null;
}

function discoverGroup(groupId, groupName) {
    if (!groupId) return;
    if (!seenGroups[groupId] || (groupName && seenGroups[groupId] === groupId)) {
        seenGroups[groupId] = groupName || groupId.replace('@g.us', '');
        console.log(`[WA] Discovered/Updated group: "${seenGroups[groupId]}" (${groupId})`);
    }
}

async function populateGroups(c) {
    try {
        // Attempt 1: getChats
        const chats = await Promise.race([
            c.getChats(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('getChats timeout')), 5000))
        ]);
        const groups = chats.filter(chat => chat.isGroup);
        groups.forEach(g => {
            seenGroups[g.id._serialized] = g.name || g.id.user || 'Group';
        });
        console.log(`[WA] getChats loaded ${groups.length} groups.`);
    } catch (e) {
        console.log('[WA] Standard getChats not available, will discover groups dynamically.');
    }

    // Attempt 2: Puppeteer evaluate fallback
    try {
        if (c.pupPage && !c.pupPage.isClosed()) {
            const pageGroups = await c.pupPage.evaluate(() => {
                const results = [];
                try {
                    if (window.Store && window.Store.Chat) {
                        const models = window.Store.Chat.models || (window.Store.Chat.getModelsArray ? window.Store.Chat.getModelsArray() : []);
                        for (const m of models) {
                            if (m.isGroup || (m.id && m.id._serialized && m.id._serialized.endsWith('@g.us'))) {
                                results.push({
                                    id: m.id._serialized || m.id,
                                    name: m.name || m.formattedTitle || m.contact?.name || 'Group'
                                });
                            }
                        }
                    }
                } catch (err) {}
                return results;
            });
            if (pageGroups && pageGroups.length > 0) {
                pageGroups.forEach(g => {
                    if (g.id) seenGroups[g.id] = g.name;
                });
                console.log(`[WA] Puppeteer evaluate loaded ${pageGroups.length} groups.`);
            }
        }
    } catch (e) {}
}

function setupClientEvents(c) {
    c.on('qr', (qr) => {
        currentQR = qr;
        status = 'qr_ready';
        console.log('[WA] QR Code generated. Scan with WhatsApp.');
        qrcode.generate(qr, { small: true });
    });

    c.on('authenticated', () => {
        console.log('[WA] Authentication successful!');
        status = 'authenticating';
    });

    c.on('ready', async () => {
        console.log('[WA] WhatsApp Client is READY & CONNECTED!');
        currentQR = null;
        status = 'connected';
        await populateGroups(c);
    });

    c.on('disconnected', (reason) => {
        console.log('[WA] Client Disconnected:', reason);
        status = 'disconnected';
        currentQR = null;
    });

    c.on('auth_failure', (msg) => {
        console.error('[WA] Auth failure:', msg);
        status = 'disconnected';
        currentQR = null;
    });

    // Incoming messages from others
    c.on('message', async (message) => {
        console.log(`[MSG-IN] from=${message.from} to=${message.to} body="${(message.body || '').substring(0, 40)}"`);
        await handleMessage(message, false);
    });

    // Messages sent by this account or created locally
    c.on('message_create', async (message) => {
        console.log(`[MSG-CREATE] fromMe=${message.fromMe} from=${message.from} to=${message.to} body="${(message.body || '').substring(0, 40)}"`);
        await handleMessage(message, message.fromMe);
    });
}

async function handleMessage(message, isFromMe) {
    if (status !== 'connected') return;

    const groupId = extractGroupId(message);
    if (!groupId) {
        // Not a group message
        return;
    }

    // Extract message ID with strong fallback
    let msgId = null;
    try {
        if (message.id) {
            msgId = message.id._serialized || message.id.id || (typeof message.id === 'string' ? message.id : null);
        }
    } catch (e) {}
    if (!msgId && message._data && message._data.id) {
        msgId = message._data.id._serialized || message._data.id.id;
    }
    if (!msgId) {
        msgId = `wa_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    // Deduplication check
    if (processedMessageIds.has(msgId)) {
        return;
    }
    processedMessageIds.add(msgId);
    if (processedMessageIds.size > 1000) {
        const first = processedMessageIds.values().next().value;
        processedMessageIds.delete(first);
    }

    // Extract group name
    let groupName = seenGroups[groupId] || (message._data && message._data.chat && message._data.chat.name) || null;
    if (!groupName) {
        try {
            const chat = await Promise.race([
                message.getChat(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
            if (chat && chat.name) groupName = chat.name;
        } catch (e) {}
    }
    if (!groupName) groupName = groupId.replace('@g.us', '');
    discoverGroup(groupId, groupName);

    // Filter check: Are we monitoring this group?
    const isMonitoringAll = !monitoredGroupId || monitoredGroupId === 'ALL' || monitoredGroupId === '';
    const isMatchingGroup = normalizeGroupId(groupId) === normalizeGroupId(monitoredGroupId);

    console.log(`[MSG] Group: "${groupName}" (${groupId}) | Monitored: "${monitoredGroupId}" | Match: ${isMonitoringAll || isMatchingGroup}`);

    if (!isMonitoringAll && !isMatchingGroup) {
        console.log(`[MSG] Skipped because monitored group is ${monitoredGroupId}`);
        return;
    }

    // Extract sender name
    let senderName = 'Unknown';
    if (isFromMe) {
        senderName = 'You';
    } else if (message._data && message._data.notifyName) {
        senderName = message._data.notifyName;
    } else if (message.author) {
        senderName = message.author.replace('@c.us', '').replace('@lid', '');
    } else if (message.from && !message.from.endsWith('@g.us')) {
        senderName = message.from.replace('@c.us', '').replace('@lid', '');
    }

    if (senderName === 'Unknown' || /^\d+$/.test(senderName)) {
        try {
            const contact = await Promise.race([
                message.getContact(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
            if (contact) {
                senderName = contact.pushname || contact.name || contact.number || senderName;
            }
        } catch (e) {}
    }

    // Extract media if present
    let mediaBase64 = null;
    let mediaMimeType = null;
    if (message.hasMedia) {
        try {
            const media = await Promise.race([
                message.downloadMedia(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('media timeout')), 5000))
            ]);
            if (media && media.data) {
                mediaBase64 = media.data;
                mediaMimeType = media.mimetype;
            }
        } catch (err) {
            console.error('[MSG] Media download failed:', err.message);
        }
    }

    const payload = {
        whatsapp_message_id: msgId,
        sender: senderName,
        group_name: groupName,
        timestamp: new Date((message.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        original_text: message.body || (message._data && message._data.caption) || '',
        media_type: mediaMimeType,
        media_base64: mediaBase64
    };

    console.log(`[MSG] 📦 Forwarding message "${payload.original_text.substring(0, 30)}..." to Backend...`);

    try {
        const response = await axios.post(`${BACKEND_URL}/api/messages/intake`, payload, { timeout: 10000 });
        console.log(`[MSG] ✓ Forwarded successfully to backend:`, response.data);
    } catch (error) {
        console.error(`[MSG] ✗ Backend forwarding error:`, error.response?.data || error.message);
    }
}

// ─── HTTP Endpoints ───

app.get('/api/wa-connector/status', (req, res) => {
    const groupsList = Object.entries(seenGroups).map(([id, name]) => ({ id, name }));
    res.json({
        status,
        qr: currentQR,
        monitoredGroup: monitoredGroupId,
        groupCount: groupsList.length,
        groups: groupsList
    });
});

app.get('/api/wa-connector/groups', (req, res) => {
    const groupsList = Object.entries(seenGroups).map(([id, name]) => ({ id, name }));
    res.json({ groups: groupsList });
});

app.post('/api/wa-connector/monitor', (req, res) => {
    const { groupId } = req.body;
    monitoredGroupId = groupId || 'ALL';
    const name = seenGroups[groupId] || (monitoredGroupId === 'ALL' ? 'All Groups' : groupId);
    console.log(`[WA] Monitoring set to: ${name} (${monitoredGroupId})`);
    res.json({ success: true, monitoredGroupId });
});

app.post('/api/wa-connector/connect', async (req, res) => {
    if (status === 'connected') {
        return res.json({ success: true, status });
    }
    
    if (status === 'initializing' || status === 'qr_ready' || status === 'authenticating') {
        return res.json({ success: true, status, qr: currentQR });
    }

    console.log('[WA] Starting WhatsApp Client connection...');
    try {
        if (client) {
            try { await client.destroy(); } catch (e) {}
        }
        cleanStaleLocks();
        client = createClient();
        setupClientEvents(client);
        status = 'initializing';
        
        res.json({ success: true, status });
        
        client.initialize().catch(err => {
            console.error('[WA] Initialize error:', err.message);
            status = 'disconnected';
            currentQR = null;
        });
    } catch (e) {
        console.error('[WA] Connect error:', e.message);
        status = 'disconnected';
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/wa-connector/disconnect', async (req, res) => {
    console.log('[WA] Disconnecting and resetting session...');
    try {
        if (client) {
            try { await client.logout(); } catch (e) {}
            try { await client.destroy(); } catch (e) {}
        }
    } catch (e) {
        console.log('[WA] Cleanup error:', e.message);
    }

    // Remove saved auth & cache to ensure clean login with next WhatsApp
    try { fs.rmSync(AUTH_PATH, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(CACHE_PATH, { recursive: true, force: true }); } catch (e) {}

    status = 'disconnected';
    currentQR = null;
    monitoredGroupId = 'ALL';
    seenGroups = {};
    client = null;
    processedMessageIds.clear();

    console.log('[WA] Disconnected. Session cleared.');
    res.json({ success: true, message: 'Disconnected' });
});

app.listen(PORT, () => {
    console.log(`[WA] wa-connector listening on http://localhost:${PORT}`);
});
