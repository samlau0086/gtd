ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS background_color TEXT NOT NULL DEFAULT '#173F3B',
  ADD COLUMN IF NOT EXISTS text_color TEXT NOT NULL DEFAULT '#D9FFF9',
  ADD COLUMN IF NOT EXISTS border_color TEXT NOT NULL DEFAULT '#69D2C8';

UPDATE projects
SET background_color = color,
    text_color = '#102120',
    border_color = color
WHERE background_color = '#173F3B'
  AND text_color = '#D9FFF9'
  AND border_color = '#69D2C8';

ALTER TABLE projects
  ADD CONSTRAINT projects_background_color_hex CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT projects_text_color_hex CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT projects_border_color_hex CHECK (border_color ~ '^#[0-9A-Fa-f]{6}$');
