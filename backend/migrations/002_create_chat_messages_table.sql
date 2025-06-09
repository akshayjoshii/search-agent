-- backend/migrations/002_create_chat_messages_table.sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_history_id INTEGER NOT NULL, -- This will link to chat_history.id
    message_type VARCHAR(20) NOT NULL, -- e.g., 'human', 'ai', 'system', 'tool'
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB, -- For additional data like tool_calls, etc.
    CONSTRAINT fk_chat_history
        FOREIGN KEY(chat_history_id)
        REFERENCES chat_history(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_history_id ON chat_messages (chat_history_id);
