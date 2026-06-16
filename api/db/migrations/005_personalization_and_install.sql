ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS humor_level NUMERIC(4,3) NOT NULL DEFAULT 0.200,
  ADD COLUMN IF NOT EXISTS slang_level NUMERIC(4,3) NOT NULL DEFAULT 0.350,
  ADD COLUMN IF NOT EXISTS answer_length VARCHAR(40) NOT NULL DEFAULT 'curta_objetiva',
  ADD COLUMN IF NOT EXISTS assistant_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS agent_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS agent_install_mode VARCHAR(40) NOT NULL DEFAULT 'background';

CREATE TABLE IF NOT EXISTS install_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type VARCHAR(40) NOT NULL CHECK (artifact_type IN ('android_apk','windows_agent')),
  version VARCHAR(80) NOT NULL DEFAULT 'dev',
  download_url TEXT,
  checksum_sha256 TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(artifact_type, version)
);

INSERT INTO install_artifacts(artifact_type, version, download_url)
VALUES ('android_apk', 'dev', NULL), ('windows_agent', 'dev', NULL)
ON CONFLICT (artifact_type, version) DO NOTHING;
