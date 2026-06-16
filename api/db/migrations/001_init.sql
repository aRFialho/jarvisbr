CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(220) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  assistant_name VARCHAR(80) NOT NULL DEFAULT 'Jarvis',
  wake_phrases TEXT[] NOT NULL DEFAULT ARRAY['hey jarvis','ola jarvis'],
  response_tone VARCHAR(80) NOT NULL DEFAULT 'futurista_direto',
  require_confirmation_for_all_actions BOOLEAN NOT NULL DEFAULT TRUE,
  floating_button_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  always_listening_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friendly_name VARCHAR(120) NOT NULL,
  device_type VARCHAR(40) NOT NULL CHECK (device_type IN ('mobile','desktop','notebook','tablet','web')),
  platform VARCHAR(60) NOT NULL,
  public_key TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'offline',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friendly_name)
);

CREATE TABLE IF NOT EXISTS device_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  capability VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(device_id, capability)
);

CREATE TABLE IF NOT EXISTS device_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  requested_device_name VARCHAR(120),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  target_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  interpreted_intent VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  risk_level VARCHAR(40) NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS command_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  tool_name VARCHAR(120) NOT NULL,
  human_summary TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(command_id, step_order)
);

CREATE TABLE IF NOT EXISTS confirmation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  confirmation_phrase VARCHAR(120) NOT NULL DEFAULT 'Confirmo',
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_index_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  local_file_id VARCHAR(240) NOT NULL,
  file_name TEXT NOT NULL,
  file_ext VARCHAR(30),
  file_kind VARCHAR(40),
  file_size BIGINT,
  file_path_hint TEXT,
  modified_at TIMESTAMPTZ,
  thumbnail_token TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_id, local_file_id)
);

CREATE TABLE IF NOT EXISTS file_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id UUID REFERENCES commands(id) ON DELETE SET NULL,
  source_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  destination_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  local_file_id VARCHAR(240) NOT NULL,
  file_name TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  bytes_total BIGINT,
  bytes_sent BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  command_id UUID REFERENCES commands(id) ON DELETE SET NULL,
  action VARCHAR(160) NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
