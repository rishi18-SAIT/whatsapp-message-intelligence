CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_message_id VARCHAR UNIQUE NOT NULL,
    sender VARCHAR NOT NULL,
    group_name VARCHAR NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    original_text TEXT,
    media_type VARCHAR,
    media_path VARCHAR,
    processing_status VARCHAR NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    category VARCHAR,
    summary TEXT,
    extracted_data JSONB,
    confidence FLOAT,
    requires_attention BOOLEAN DEFAULT FALSE,
    validation_status VARCHAR,
    reviewed_by VARCHAR,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
