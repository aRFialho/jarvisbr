WITH admin_user AS (
  INSERT INTO users(name, email, password_hash)
  VALUES (
    'Super Admin',
    'jarvisbr@admin.com.br',
    '$2a$12$6iwvhdiOE.zMZ6Gk1jtAtulfRqYhqNntkX2me2x29O2r/oN7KWlne'
  )
  ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
  RETURNING id
)
INSERT INTO user_settings(
  user_id,
  assistant_name,
  wake_phrases,
  response_tone,
  require_confirmation_for_all_actions,
  floating_button_enabled,
  always_listening_enabled,
  humor_level,
  slang_level,
  answer_length,
  agent_install_mode
)
SELECT
  id,
  'Jarvis',
  ARRAY['hey jarvis', 'ola jarvis', 'jarvis'],
  'futurista_direto',
  TRUE,
  TRUE,
  FALSE,
  0.200,
  0.350,
  'curta_objetiva',
  'background'
FROM admin_user
ON CONFLICT (user_id) DO UPDATE
  SET assistant_name = EXCLUDED.assistant_name,
      wake_phrases = EXCLUDED.wake_phrases,
      response_tone = EXCLUDED.response_tone,
      require_confirmation_for_all_actions = EXCLUDED.require_confirmation_for_all_actions,
      floating_button_enabled = EXCLUDED.floating_button_enabled,
      always_listening_enabled = EXCLUDED.always_listening_enabled,
      humor_level = EXCLUDED.humor_level,
      slang_level = EXCLUDED.slang_level,
      answer_length = EXCLUDED.answer_length,
      agent_install_mode = EXCLUDED.agent_install_mode,
      updated_at = NOW();

INSERT INTO hologram_presets(user_id, preset_name, primary_color, secondary_color, animation_style, subtitle_style)
SELECT
  users.id,
  'Neon Holograma',
  '#25F4FF',
  '#3DFF9C',
  'hud_sci_fi_particles',
  'typewriter_neon'
FROM users
WHERE users.email = 'jarvisbr@admin.com.br'
  AND NOT EXISTS (
    SELECT 1
    FROM hologram_presets
    WHERE hologram_presets.user_id = users.id
      AND hologram_presets.preset_name = 'Neon Holograma'
  );

INSERT INTO assistant_voice_profiles(user_id, voice_name, gender_style, speed, pitch, enabled)
SELECT users.id, 'female_br_01', 'feminina', 1.00, 1.00, TRUE
FROM users
WHERE users.email = 'jarvisbr@admin.com.br'
  AND NOT EXISTS (
    SELECT 1
    FROM assistant_voice_profiles
    WHERE assistant_voice_profiles.user_id = users.id
      AND assistant_voice_profiles.voice_name = 'female_br_01'
  );
