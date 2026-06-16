CREATE TABLE IF NOT EXISTS execution_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_id UUID NOT NULL REFERENCES confirmation_requests(id) ON DELETE CASCADE,
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  permission_scope VARCHAR(80) NOT NULL,
  permission_value TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_id, permission_scope, permission_value)
);

CREATE TABLE IF NOT EXISTS file_search_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  target_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  requested_kind VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
