CREATE INDEX IF NOT EXISTS idx_devices_user_status ON devices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_commands_user_status ON commands(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_confirmations_user_status ON confirmation_requests(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_file_cache_device_name ON file_index_cache(device_id, lower(file_name));
CREATE INDEX IF NOT EXISTS idx_file_cache_user_kind ON file_index_cache(user_id, file_kind, modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);

-- Opcional no Neon: habilite pg_trgm se quiser busca de similaridade no banco.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_file_cache_name_trgm ON file_index_cache USING gin (lower(file_name) gin_trgm_ops);
