CREATE TABLE IF NOT EXISTS assistant_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL DEFAULT 'local',
  voice_name VARCHAR(120) NOT NULL,
  gender_style VARCHAR(40),
  speed NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  pitch NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assistant_personality_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.700,
  approved_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hologram_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  preset_name VARCHAR(120) NOT NULL,
  primary_color VARCHAR(20) NOT NULL DEFAULT '#00E8FF',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#F5C542',
  animation_style VARCHAR(80) NOT NULL DEFAULT 'iron_hologram_particles',
  subtitle_style VARCHAR(80) NOT NULL DEFAULT 'typewriter_neon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
