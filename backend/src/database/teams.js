const crypto = require('crypto');
const { getDatabase } = require('./init');

function mapTeamRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    membership: row.role
      ? {
          role: row.role,
          status: row.status,
          invitedAt: row.invited_at,
          joinedAt: row.joined_at
        }
      : undefined
  };
}

function getTeamById(teamId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM teams
      WHERE id = ?
    `;

    db.get(query, [teamId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(mapTeamRow(row));
    });
  });
}

function addTeamMember({ teamId, userId, role = 'member', status = 'pending', joinedAt = null }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      INSERT INTO team_members (team_id, user_id, role, status, invited_at, joined_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(team_id, user_id) DO UPDATE SET
        role = excluded.role,
        status = excluded.status,
        joined_at = COALESCE(excluded.joined_at, team_members.joined_at),
        invited_at = team_members.invited_at
    `;

    db.run(query, [teamId, userId, role, status, joinedAt], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID || null });
    });
  });
}

function createTeam({ name, ownerUserId }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const insertQuery = `
      INSERT INTO teams (name, owner_user_id)
      VALUES (?, ?)
    `;

    db.run(insertQuery, [name, ownerUserId], function(err) {
      if (err) {
        reject(err);
        return;
      }

      const teamId = this.lastID;
      addTeamMember({
        teamId,
        userId: ownerUserId,
        role: 'owner',
        status: 'active',
        joinedAt: new Date().toISOString()
      })
        .then(() => getTeamById(teamId))
        .then(resolve)
        .catch(reject);
    });
  });
}

function getTeamsForUser(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT
        t.id,
        t.name,
        t.owner_user_id,
        t.created_at,
        tm.role,
        tm.status,
        tm.invited_at,
        tm.joined_at
      FROM teams t
      INNER JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.created_at ASC
    `;

    db.all(query, [userId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ? rows.map(mapTeamRow) : []);
    });
  });
}

function getTeamMember(teamId, userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM team_members
      WHERE team_id = ? AND user_id = ?
      LIMIT 1
    `;

    db.get(query, [teamId, userId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function createTeamInvitation({ teamId, email, role = 'member', invitedByUserId, expiresAt }) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const token = crypto.randomBytes(24).toString('hex');
    const query = `
      INSERT INTO team_invitations (team_id, email, role, token, expires_at, invited_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [teamId, email, role, token, expiresAt, invitedByUserId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        id: this.lastID,
        teamId,
        email,
        role,
        token,
        expiresAt
      });
    });
  });
}

function getInvitationByToken(token) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      SELECT *
      FROM team_invitations
      WHERE token = ?
      LIMIT 1
    `;

    db.get(query, [token], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function markInvitationAccepted(invitationId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const query = `
      UPDATE team_invitations
      SET accepted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(query, [invitationId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

function getTeamMembers(teamId, { status = 'active' } = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const conditions = ['team_id = ?'];
    const params = [teamId];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const query = `
      SELECT *
      FROM team_members
      WHERE ${conditions.join(' AND ')}
    `;

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function getAllTeams() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all('SELECT * FROM teams', [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ? rows.map(mapTeamRow) : []);
    });
  });
}

module.exports = {
  createTeam,
  addTeamMember,
  getTeamsForUser,
  getTeamMember,
  createTeamInvitation,
  getInvitationByToken,
  markInvitationAccepted,
  getTeamById,
  getTeamMembers,
  getAllTeams
};
