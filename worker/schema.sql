-- Cloudflare D1 schema for VAAI backend

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#007bff',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_categories_user_name ON email_categories (user_id, name);

CREATE TABLE IF NOT EXISTS email_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  rule_type TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES email_categories (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processed_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  gmail_id TEXT NOT NULL,
  sender TEXT,
  subject TEXT,
  snippet TEXT,
  category_id INTEGER,
  confidence_score REAL,
  is_manual_override BOOLEAN DEFAULT 0,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES email_categories (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assistant_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email_id TEXT,
  thread_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  undone_at DATETIME,
  feedback TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  joined_at DATETIME,
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  invited_by_user_id INTEGER NOT NULL,
  accepted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique ON team_members (team_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations (token);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  thread_id TEXT NOT NULL,
  last_message_id TEXT NOT NULL,
  counterpart_email TEXT,
  subject TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  due_at DATETIME,
  suggested_send_at DATETIME,
  draft_subject TEXT,
  draft_body TEXT,
  tone_hint TEXT,
  prompt_version TEXT,
  metadata TEXT,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follow_up_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follow_up_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (follow_up_id) REFERENCES follow_up_tasks (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_unique ON follow_up_tasks (team_id, owner_user_id, thread_id, last_message_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_status_due ON follow_up_tasks (status, due_at);

CREATE TABLE IF NOT EXISTS meeting_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  calendar_event_id TEXT NOT NULL,
  calendar_event_start DATETIME,
  status TEXT NOT NULL DEFAULT 'ready',
  summary TEXT,
  agenda TEXT,
  talking_points TEXT,
  intel TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_briefs_unique ON meeting_briefs (team_id, owner_user_id, calendar_event_id);

CREATE TABLE IF NOT EXISTS user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  command TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_favorites_unique ON user_favorites (user_id, command);

-- Seed helper categories
INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Work', 'Work-related emails', '#007bff' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Personal', 'Personal emails', '#28a745' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Newsletter', 'Newsletters and subscriptions', '#ffc107' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Receipt', 'Purchase receipts and confirmations', '#17a2b8' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Promotion', 'Promotional and marketing emails', '#fd7e14' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Social', 'Social media notifications', '#e83e8c' FROM users;

INSERT OR IGNORE INTO email_categories (user_id, name, description, color)
SELECT id, 'Important', 'Important emails requiring attention', '#dc3545' FROM users;
