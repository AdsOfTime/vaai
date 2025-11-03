const { getDatabase } = require('./init');

function mapFollowUpRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    ownerUserId: row.owner_user_id,
    threadId: row.thread_id,
    lastMessageId: row.last_message_id,
    counterpartEmail: row.counterpart_email,
    subject: row.subject,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    suggestedSendAt: row.suggested_send_at,
    draftSubject: row.draft_subject,
    draftBody: row.draft_body,
    toneHint: row.tone_hint,
    promptVersion: row.prompt_version,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createOrUpdateFollowUpTask(task) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const metadata = task.metadata ? JSON.stringify(task.metadata) : null;

    const query = `
      INSERT INTO follow_up_tasks (
        team_id, owner_user_id, thread_id, last_message_id, counterpart_email,
        subject, summary, status, priority, due_at, suggested_send_at,
        draft_subject, draft_body, tone_hint, prompt_version, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, owner_user_id, thread_id, last_message_id) DO UPDATE SET
        counterpart_email = COALESCE(excluded.counterpart_email, follow_up_tasks.counterpart_email),
        subject = COALESCE(excluded.subject, follow_up_tasks.subject),
        summary = COALESCE(excluded.summary, follow_up_tasks.summary),
        status = CASE
          WHEN follow_up_tasks.status IN ('pending', 'snoozed')
            THEN excluded.status
          ELSE follow_up_tasks.status
        END,
        priority = MAX(follow_up_tasks.priority, excluded.priority),
        due_at = COALESCE(excluded.due_at, follow_up_tasks.due_at),
        suggested_send_at = COALESCE(excluded.suggested_send_at, follow_up_tasks.suggested_send_at),
        draft_subject = COALESCE(excluded.draft_subject, follow_up_tasks.draft_subject),
        draft_body = COALESCE(excluded.draft_body, follow_up_tasks.draft_body),
        tone_hint = COALESCE(excluded.tone_hint, follow_up_tasks.tone_hint),
        prompt_version = COALESCE(excluded.prompt_version, follow_up_tasks.prompt_version),
        metadata = COALESCE(excluded.metadata, follow_up_tasks.metadata),
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      task.teamId,
      task.ownerUserId,
      task.threadId,
      task.lastMessageId,
      task.counterpartEmail || null,
      task.subject || null,
      task.summary || null,
      task.status || 'pending',
      task.priority ?? 0,
      task.dueAt || null,
      task.suggestedSendAt || null,
      task.draftSubject || null,
      task.draftBody || null,
      task.toneHint || null,
      task.promptVersion || null,
      metadata
    ];

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      if (this.lastID) {
        resolve({ id: this.lastID, inserted: true });
      } else {
        // Existing row updated, fetch ID
        db.get(
          `
            SELECT id FROM follow_up_tasks
            WHERE team_id = ? AND owner_user_id = ? AND thread_id = ? AND last_message_id = ?
          `,
          [task.teamId, task.ownerUserId, task.threadId, task.lastMessageId],
          (selectErr, row) => {
            if (selectErr) {
              reject(selectErr);
              return;
            }
            resolve({
              id: row?.id || null,
              inserted: false
            });
          }
        );
      }
    });
  });
}

function updateFollowUpTask(taskId, fields) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const columns = [];
    const params = [];

    Object.entries(fields).forEach(([key, value]) => {
      if (key === 'metadata' && value !== undefined) {
        columns.push('metadata = ?');
        params.push(value ? JSON.stringify(value) : null);
      } else if (value !== undefined) {
        const columnName = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        columns.push(`${columnName} = ?`);
        params.push(value);
      }
    });

    if (!columns.length) {
      resolve(false);
      return;
    }

    const query = `
      UPDATE follow_up_tasks
      SET ${columns.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(query, [...params, taskId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

function listFollowUpTasks({ teamId, status = null, ownerUserId = null, limit = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const conditions = ['team_id = ?'];
    const params = [teamId];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (ownerUserId) {
      conditions.push('owner_user_id = ?');
      params.push(ownerUserId);
    }

    const query = `
      SELECT *
      FROM follow_up_tasks
      WHERE ${conditions.join(' AND ')}
      ORDER BY priority DESC, COALESCE(due_at, created_at) ASC
      LIMIT ?
    `;

    db.all(query, [...params, limit], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ? rows.map(mapFollowUpRow) : []);
    });
  });
}

function getFollowUpTaskById(taskId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get('SELECT * FROM follow_up_tasks WHERE id = ?', [taskId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(mapFollowUpRow(row));
    });
  });
}

function appendFollowUpEvent(followUpId, eventType, payload = null) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      `
        INSERT INTO follow_up_events (follow_up_id, event_type, payload)
        VALUES (?, ?, ?)
      `,
      [followUpId, eventType, payload ? JSON.stringify(payload) : null],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

function getDueFollowUps(limit = 20) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM follow_up_tasks
      WHERE status = 'scheduled'
        AND suggested_send_at IS NOT NULL
        AND datetime(suggested_send_at) <= datetime('now')
      ORDER BY suggested_send_at ASC
      LIMIT ?
    `;
    db.all(query, [limit], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ? rows.map(mapFollowUpRow) : []);
    });
  });
}

module.exports = {
  createOrUpdateFollowUpTask,
  updateFollowUpTask,
  listFollowUpTasks,
  getFollowUpTaskById,
  appendFollowUpEvent,
  getDueFollowUps
};
