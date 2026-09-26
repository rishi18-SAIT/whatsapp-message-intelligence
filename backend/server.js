const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const supabase = require('./db');
const { analyzeMessage } = require('./ai');
require('dotenv').config({ path: path.join(__dirname, 'env') });

const app = express();
const port = process.env.PORT || 3001;
const WA_CONNECTOR_URL = process.env.WA_CONNECTOR_URL || 'http://localhost:3002';

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://whatsapp-message-intelligence.vercel.app',
    'https://whatsapp-message-intelligence-cw12.vercel.app'
  ]
}));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── WA-Connector Proxy Routes ───

app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const response = await axios.get(`${WA_CONNECTOR_URL}/api/wa-connector/status`, { timeout: 4000 });
        res.json(response.data);
    } catch (err) {
        res.json({ status: 'offline', error: 'WA Connector offline' });
    }
});

app.post('/api/whatsapp/connect', async (req, res) => {
    try {
        const response = await axios.post(`${WA_CONNECTOR_URL}/api/wa-connector/connect`, {}, { timeout: 10000 });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to start WA connector connection' });
    }
});

app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        const response = await axios.get(`${WA_CONNECTOR_URL}/api/wa-connector/groups`, { timeout: 5000 });
        res.json(response.data);
    } catch (err) {
        res.json({ groups: [] });
    }
});

app.post('/api/whatsapp/monitor', async (req, res) => {
    try {
        const response = await axios.post(`${WA_CONNECTOR_URL}/api/wa-connector/monitor`, req.body, { timeout: 5000 });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to set monitor group' });
    }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        const response = await axios.post(`${WA_CONNECTOR_URL}/api/wa-connector/disconnect`, {}, { timeout: 10000 });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to disconnect WhatsApp' });
    }
});

// ─── Message Intake from wa-connector ───

app.post('/api/messages/intake', async (req, res) => {
    const { whatsapp_message_id, sender, group_name, timestamp, original_text, media_type, media_base64 } = req.body;

    try {
        let mediaPath = null;
        if (media_base64 && media_type) {
            const uploadsDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            
            const ext = (media_type.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '');
            const filename = `${crypto.randomUUID()}.${ext}`;
            mediaPath = path.join('uploads', filename);
            
            fs.writeFileSync(path.join(__dirname, mediaPath), Buffer.from(media_base64, 'base64'));
        }

        const safeMsgId = whatsapp_message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const safeSender = sender || 'Unknown';
        const safeGroupName = group_name || 'General';
        const safeTimestamp = timestamp || new Date().toISOString();

        const { data: msgData, error: msgError } = await supabase
            .from('messages')
            .insert([{
                whatsapp_message_id: safeMsgId,
                sender: safeSender,
                group_name: safeGroupName,
                timestamp: safeTimestamp,
                original_text: original_text || '',
                media_type: media_type || null,
                media_path: mediaPath,
                processing_status: 'RECEIVED'
            }])
            .select()
            .single();

        if (msgError) {
            if (msgError.code === '23505') {
                console.log(`[INTAKE] Duplicate message ignored: ${safeMsgId}`);
                return res.json({ success: true, message: 'Duplicate ignored' });
            }
            console.error('[INTAKE] Supabase insert error:', msgError);
            return res.status(500).json({ error: msgError.message });
        }

        console.log(`[INTAKE] ✓ Message saved to DB: ${msgData.id} from "${safeSender}" in "${safeGroupName}"`);
        res.json({ success: true, id: msgData.id });

        // Process message with AI asynchronously
        processMessageAI(msgData, media_base64);

    } catch (error) {
        console.error('[INTAKE] Error:', error);
        res.status(500).json({ error: error.message || 'Intake failed' });
    }
});

async function processMessageAI(msgData, mediaBase64) {
    try {
        await supabase.from('messages').update({ processing_status: 'PROCESSING' }).eq('id', msgData.id);

        let textToAnalyze = msgData.original_text || '';
        if (!textToAnalyze && !mediaBase64) {
            textToAnalyze = '[Media/Empty message]';
        }

        const aiResult = await analyzeMessage(textToAnalyze, mediaBase64, msgData.media_type);

        let validationStatus = 'CONFIDENT';
        let finalProcessingStatus = 'AUTO_ACCEPTED';

        if (!aiResult || !aiResult.category || !aiResult.summary) {
            finalProcessingStatus = 'AI_FAILED';
            validationStatus = 'INVALID_OUTPUT';
        } else if (aiResult.confidence < 0.80 || aiResult.requires_attention) {
            finalProcessingStatus = 'NEEDS_REVIEW';
            validationStatus = 'UNCERTAIN';
        } else {
            finalProcessingStatus = 'AUTO_ACCEPTED';
            validationStatus = 'CONFIDENT';
        }

        // Delete any prior analysis to prevent duplicate records
        await supabase.from('message_analysis').delete().eq('message_id', msgData.id);

        const { error: analysisError } = await supabase.from('message_analysis').insert([{
            message_id: msgData.id,
            category: aiResult.category || 'Irrelevant',
            summary: aiResult.summary || 'No summary available',
            extracted_data: aiResult.extracted || {},
            confidence: typeof aiResult.confidence === 'number' ? aiResult.confidence : 0.5,
            requires_attention: Boolean(aiResult.requires_attention),
            validation_status: validationStatus
        }]);

        if (analysisError) {
            console.error('[AI] Error inserting message_analysis:', analysisError);
        }

        await supabase.from('messages').update({ processing_status: finalProcessingStatus }).eq('id', msgData.id);
        console.log(`[AI] ✓ Finished processing ${msgData.id} -> ${finalProcessingStatus} (${aiResult.category})`);

    } catch (error) {
        console.error('[AI] Processing failed:', error.message || error);
        await supabase.from('messages').update({ processing_status: 'AI_FAILED' }).eq('id', msgData.id);
    }
}

// ─── Frontend APIs ───

app.get('/api/messages', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*, message_analysis(*)')
            .order('timestamp', { ascending: false });
        
        if (error) {
            console.error('Fetch messages error:', error);
            return res.status(500).json({ error: error.message });
        }
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/messages/review', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*, message_analysis(*)')
            .eq('processing_status', 'NEEDS_REVIEW')
            .order('timestamp', { ascending: false });
        
        if (error) {
            console.error('Fetch review messages error:', error);
            return res.status(500).json({ error: error.message });
        }
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/messages/:id/review', async (req, res) => {
    const { id } = req.params;
    const { category, summary, extracted_data, reviewer } = req.body;

    try {
        await supabase.from('message_analysis')
            .update({ 
                category, 
                summary, 
                extracted_data, 
                validation_status: 'HUMAN_CORRECTED',
                reviewed_by: reviewer || 'Human Admin',
                reviewed_at: new Date().toISOString()
            })
            .eq('message_id', id);

        await supabase.from('messages')
            .update({ processing_status: 'APPROVED' })
            .eq('id', id);

        res.json({ success: true });
    } catch (error) {
        console.error('Review update error:', error);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/api/messages/:id/reprocess', async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase.from('messages').select('*').eq('id', id).single();
        if (error || !data) return res.status(404).json({ error: 'Not found' });
        
        res.json({ success: true, message: 'Reprocessing started' });
        processMessageAI(data, null);
    } catch (error) {
        res.status(500).json({ error: 'Retry failed' });
    }
});

app.delete('/api/messages/cleanup/all', async (req, res) => {
    try {
        await supabase.from('message_analysis').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        res.json({ success: true, message: 'All messages deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Express 5 Error Handler ───

app.use((err, req, res, next) => {
    console.error('[SERVER] Unhandled error:', err.message || err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
