const { getDatabase } = require('./init');

// Store or update user tokens
function storeUserTokens(googleId, email, tokens = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const selectQuery = `
      SELECT id, google_id, email, access_token, refresh_token 
      FROM users 
      WHERE google_id = ?
    `;

    db.get(selectQuery, [googleId], (selectErr, existing) => {
      if (selectErr) {
        reject(selectErr);
        return;
      }

      const accessToken = tokens.access_token || existing?.access_token || null;
      const refreshToken = tokens.refresh_token || existing?.refresh_token || null;

      const upsertQuery = `
        INSERT INTO users (google_id, email, access_token, refresh_token, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(google_id) DO UPDATE SET
          email = excluded.email,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          updated_at = CURRENT_TIMESTAMP
      `;

      db.run(upsertQuery, [
        googleId,
        email,
        accessToken,
        refreshToken
      ], function(runErr) {
        if (runErr) {
          reject(runErr);
          return;
        }

        const fetchQuery = `
          SELECT id, google_id as googleId, email 
          FROM users 
          WHERE google_id = ?
        `;

        db.get(fetchQuery, [googleId], (fetchErr, row) => {
          if (fetchErr) {
            reject(fetchErr);
            return;
          }
          resolve(row || {
            id: this.lastID,
            googleId,
            email
          });
        });
      });
    });
  });
}

// Get user tokens
function getUserTokens(googleId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const query = `
      SELECT * FROM users WHERE google_id = ?
    `;

    db.get(query, [googleId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

// Create default categories for new user
function createDefaultCategories(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    const defaultCategories = [
      { name: 'Work', description: 'Work-related emails', color: '#007bff' },
      { name: 'Personal', description: 'Personal emails', color: '#28a745' },
      { name: 'Newsletter', description: 'Newsletters and subscriptions', color: '#ffc107' },
      { name: 'Receipt', description: 'Purchase receipts and confirmations', color: '#17a2b8' },
      { name: 'Promotion', description: 'Promotional and marketing emails', color: '#fd7e14' },
      { name: 'Social', description: 'Social media notifications', color: '#e83e8c' },
      { name: 'Important', description: 'Important emails requiring attention', color: '#dc3545' }
    ];
    
    const query = `
      INSERT INTO email_categories (user_id, name, description, color)
      VALUES (?, ?, ?, ?)
    `;
    
    let completed = 0;
    defaultCategories.forEach(category => {
      db.run(query, [userId, category.name, category.description, category.color], (err) => {
        if (err) {
          reject(err);
          return;
        }
        completed++;
        if (completed === defaultCategories.length) {
          resolve();
        }
      });
    });
  });
}

function getUserRules(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const query = `
      SELECT *
      FROM email_rules
      WHERE user_id = ? AND is_active = 1
      ORDER BY priority DESC, id ASC
    `;

    db.all(query, [userId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function getCategoryByName(userId, name) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const query = `
      SELECT * FROM email_categories
      WHERE user_id = ? AND LOWER(name) = LOWER(?)
      LIMIT 1
    `;

    db.get(query, [userId, name], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

// Get user categories
function getUserCategories(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    const query = `
      SELECT * FROM email_categories WHERE user_id = ? ORDER BY name
    `;
    
    db.all(query, [userId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Store processed email for learning
function storeProcessedEmail(userId, emailData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    const query = `
      INSERT INTO processed_emails 
      (user_id, gmail_id, sender, subject, snippet, category_id, confidence_score, is_manual_override)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
      userId,
      emailData.gmailId,
      emailData.sender,
      emailData.subject,
      emailData.snippet,
      emailData.categoryId,
      emailData.confidenceScore || 0.8,
      emailData.isManualOverride || 0
    ], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID });
    });
  });
}

function getUserByGoogleId(googleId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM users
      WHERE google_id = ?
      LIMIT 1
    `;

    db.get(query, [googleId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `;

    db.get(query, [userId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

module.exports = {
  storeUserTokens,
  getUserTokens,
  createDefaultCategories,
  getUserCategories,
  storeProcessedEmail,
  getUserRules,
  getCategoryByName,
  getUserByGoogleId,
  getUserById
};
