const { getDatabase } = require('./init');

function mapBriefRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    ownerUserId: row.owner_user_id,
    calendarEventId: row.calendar_event_id,
    calendarEventStart: row.calendar_event_start,
    status: row.status,
    summary: row.summary,
    agenda: row.agenda,
    talkingPoints: row.talking_points,
    intel: row.intel,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function upsertMeetingBrief(brief) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const metadata = brief.metadata ? JSON.stringify(brief.metadata) : null;

    const query = `
      INSERT INTO meeting_briefs (
        team_id,
        owner_user_id,
        calendar_event_id,
        calendar_event_start,
        status,
        summary,
        agenda,
        talking_points,
        intel,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, owner_user_id, calendar_event_id) DO UPDATE SET
        calendar_event_start = COALESCE(excluded.calendar_event_start, meeting_briefs.calendar_event_start),
        status = excluded.status,
        summary = COALESCE(excluded.summary, meeting_briefs.summary),
        agenda = COALESCE(excluded.agenda, meeting_briefs.agenda),
        talking_points = COALESCE(excluded.talking_points, meeting_briefs.talking_points),
        intel = COALESCE(excluded.intel, meeting_briefs.intel),
        metadata = COALESCE(excluded.metadata, meeting_briefs.metadata),
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      brief.teamId,
      brief.ownerUserId,
      brief.calendarEventId,
      brief.calendarEventStart || null,
      brief.status || 'ready',
      brief.summary || null,
      brief.agenda || null,
      brief.talkingPoints || null,
      brief.intel || null,
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
        db.get(
          `SELECT id FROM meeting_briefs WHERE team_id = ? AND owner_user_id = ? AND calendar_event_id = ?`,
          [brief.teamId, brief.ownerUserId, brief.calendarEventId],
          (selectErr, row) => {
            if (selectErr) {
              reject(selectErr);
              return;
            }
            resolve({ id: row?.id || null, inserted: false });
          }
        );
      }
    });
  });
}

function updateMeetingBrief(briefId, fields) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const sets = [];
    const params = [];

    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined) return;
      const column = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (key === 'metadata') {
        sets.push('metadata = ?');
        params.push(value ? JSON.stringify(value) : null);
      } else {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    });

    if (!sets.length) {
      resolve(false);
      return;
    }

    const query = `
      UPDATE meeting_briefs
      SET ${sets.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(query, [...params, briefId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

function listMeetingBriefs({ teamId, ownerUserId = null, fromDate = null, limit = 20 } = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const conditions = ['team_id = ?'];
    const params = [teamId];

    if (ownerUserId) {
      conditions.push('owner_user_id = ?');
      params.push(ownerUserId);
    }

    if (fromDate) {
      conditions.push('(calendar_event_start IS NULL OR calendar_event_start >= ?)');
      params.push(fromDate);
    }

    const query = `
      SELECT *
      FROM meeting_briefs
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(calendar_event_start, created_at) ASC
      LIMIT ?
    `;

    db.all(query, [...params, limit], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ? rows.map(mapBriefRow) : []);
    });
  });
}

function getMeetingBriefById(id) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get('SELECT * FROM meeting_briefs WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(mapBriefRow(row));
    });
  });
}

module.exports = {
  upsertMeetingBrief,
  updateMeetingBrief,
  listMeetingBriefs,
  getMeetingBriefById
};
