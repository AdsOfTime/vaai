const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, '../../vaai.db');

let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
}

async function createTables() {
  return new Promise((resolve, reject) => {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        google_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier TEXT NOT NULL DEFAULT 'basic',
        status TEXT NOT NULL DEFAULT 'active',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        payment_method_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      `CREATE TABLE IF NOT EXISTS feature_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        feature_name TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 1,
        usage_date TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      `CREATE TABLE IF NOT EXISTS billing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subscription_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT NOT NULL,
        payment_provider TEXT,
        provider_payment_id TEXT,
        billing_period_start TEXT NOT NULL,
        billing_period_end TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (subscription_id) REFERENCES user_subscriptions (id)
      )`,
      `CREATE TABLE IF NOT EXISTS email_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#007bff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS email_rules (
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
      )`,
      `CREATE TABLE IF NOT EXISTS processed_emails (
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
      )`,
      `CREATE TABLE IF NOT EXISTS assistant_actions (
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
      )`,
      `CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'pending',
        invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        joined_at DATETIME,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS team_invitations (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique ON team_members (team_id, user_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations (token)`,
      `CREATE TABLE IF NOT EXISTS follow_up_tasks (
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
      )`,
      `CREATE TABLE IF NOT EXISTS follow_up_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follow_up_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (follow_up_id) REFERENCES follow_up_tasks (id) ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_unique ON follow_up_tasks (team_id, owner_user_id, thread_id, last_message_id)`,
      `CREATE INDEX IF NOT EXISTS idx_follow_up_status_due ON follow_up_tasks (status, due_at)`,
      `CREATE TABLE IF NOT EXISTS meeting_briefs (
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
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_briefs_unique ON meeting_briefs (team_id, owner_user_id, calendar_event_id)`
    ];

    db.serialize(() => {
      const runNext = (index) => {
        if (index === queries.length) {
          console.log('All database tables created successfully');
          resolve();
          return;
        }
        db.run(queries[index], (err) => {
          if (err) {
            console.error(`Error creating table ${index}:`, err);
            reject(err);
            return;
          }
          runNext(index + 1);
        });
      };
      runNext(0);
    });
  });
}

function getDatabase() {
  return db;
}

module.exports = {
  initDatabase,
  getDatabase
};