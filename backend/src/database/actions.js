const { getDatabase } = require('./init');

function createAssistantAction({ userId, emailId, threadId, actionType, payload = null }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const query = `
      INSERT INTO assistant_actions (user_id, email_id, thread_id, action_type, payload, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `;

    db.run(query, [userId, emailId, threadId, actionType, payload ? JSON.stringify(payload) : null], function(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        id: this.lastID,
        userId,
        emailId,
        threadId,
        actionType
      });
    });
  });
}

function updateAssistantActionResult(actionId, { status, result = null, feedback = null, undone = false }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const query = `
      UPDATE assistant_actions
      SET status = ?,
          result = COALESCE(?, result),
          feedback = COALESCE(?, feedback),
          updated_at = CURRENT_TIMESTAMP,
          undone_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE undone_at END
      WHERE id = ?
    `;

    db.run(
      query,
      [
        status,
        result ? JSON.stringify(result) : null,
        feedback,
        undone ? 1 : 0,
        actionId
      ],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      }
    );
  });
}

function getAssistantActionById(actionId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `SELECT * FROM assistant_actions WHERE id = ?`;

    db.get(query, [actionId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }

      resolve({
        ...row,
        payload: row.payload ? JSON.parse(row.payload) : null,
        result: row.result ? JSON.parse(row.result) : null
      });
    });
  });
}

function saveAssistantActionFeedback(actionId, { rating, note = null }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const feedback = JSON.stringify({
      rating,
      note: note || null
    });

    const query = `
      UPDATE assistant_actions
      SET feedback = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(query, [feedback, actionId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

function parseFeedback(feedback) {
  if (!feedback) return {};

  try {
    const parsed = JSON.parse(feedback);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return { rating: feedback };
  } catch (error) {
    return { rating: feedback };
  }
}

function getAssistantActionMetrics(userId, { days = 7, limitRecent = 10 } = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    const params = [userId];
    let windowClause = '';

    if (Number.isFinite(days) && days > 0) {
      windowClause = 'AND created_at >= datetime("now", ?)';
      params.push(`-${Math.floor(days)} days`);
    }

    const metricsQuery = `
      SELECT id, action_type, status, feedback, created_at, updated_at, undone_at
      FROM assistant_actions
      WHERE user_id = ?
      ${windowClause}
      ORDER BY created_at DESC
    `;

    db.all(metricsQuery, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      const totals = {
        total: 0,
        completed: 0,
        awaitingConfirmation: 0,
        undone: 0
      };

      const feedbackTotals = {
        helpful: 0,
        notHelpful: 0,
        other: 0
      };

      const byTypeMap = new Map();
      const recent = [];

      rows.forEach((row, index) => {
        totals.total += 1;
        if (row.status === 'completed') totals.completed += 1;
        if (row.status === 'awaiting_confirmation') totals.awaitingConfirmation += 1;
        if (row.status === 'undone' || row.undone_at) totals.undone += 1;

        const feedback = parseFeedback(row.feedback);
        const rating = feedback?.rating;

        if (rating === 'helpful') {
          feedbackTotals.helpful += 1;
        } else if (rating === 'not_helpful') {
          feedbackTotals.notHelpful += 1;
        } else if (rating) {
          feedbackTotals.other += 1;
        }

        const typeKey = row.action_type;
        if (!byTypeMap.has(typeKey)) {
          byTypeMap.set(typeKey, {
            actionType: typeKey,
            total: 0,
            completed: 0,
            awaitingConfirmation: 0,
            undone: 0,
            helpful: 0,
            notHelpful: 0,
            otherFeedback: 0
          });
        }

        const typeMetrics = byTypeMap.get(typeKey);
        typeMetrics.total += 1;
        if (row.status === 'completed') typeMetrics.completed += 1;
        if (row.status === 'awaiting_confirmation') typeMetrics.awaitingConfirmation += 1;
        if (row.status === 'undone' || row.undone_at) typeMetrics.undone += 1;
        if (rating === 'helpful') typeMetrics.helpful += 1;
        if (rating === 'not_helpful') typeMetrics.notHelpful += 1;
        if (rating && rating !== 'helpful' && rating !== 'not_helpful') {
          typeMetrics.otherFeedback += 1;
        }

        if (index < limitRecent) {
          recent.push({
            id: row.id,
            actionType: row.action_type,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            undoneAt: row.undone_at,
            feedback: feedback || null
          });
        }
      });

      resolve({
        timeframeDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
        totals,
        feedback: feedbackTotals,
        byType: Array.from(byTypeMap.values()),
        recent
      });
    });
  });
}

module.exports = {
  createAssistantAction,
  updateAssistantActionResult,
  getAssistantActionById,
  saveAssistantActionFeedback,
  getAssistantActionMetrics
};
