const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getUserByGoogleId } = require('../database/users');
const {
  createTeam,
  getTeamsForUser,
  getTeamMember,
  createTeamInvitation,
  getInvitationByToken,
  markInvitationAccepted,
  addTeamMember,
  getTeamById
} = require('../database/teams');

const router = express.Router();

async function resolveCurrentUser(req, res) {
  const googleId = req.user?.userId;
  if (!googleId) {
    res.status(401).json({ error: 'Invalid authentication context' });
    return null;
  }

  const user = await getUserByGoogleId(googleId);
  if (!user) {
    res.status(404).json({ error: 'User record not found' });
    return null;
  }

  return user;
}

router.use(verifyToken);

router.get('/', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req, res);
    if (!user) return;

    const teams = await getTeamsForUser(user.id);
    res.json({ teams });
  } catch (error) {
    console.error('Failed to list teams:', error);
    res.status(500).json({ error: 'Unable to load teams', message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req, res);
    if (!user) return;

    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const team = await createTeam({
      name: name.trim(),
      ownerUserId: user.id
    });

    res.status(201).json({ team });
  } catch (error) {
    console.error('Failed to create team:', error);
    res.status(500).json({ error: 'Unable to create team', message: error.message });
  }
});

router.post('/:teamId/invite', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req, res);
    if (!user) return;

    const teamId = Number.parseInt(req.params.teamId, 10);
    if (!teamId) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const membership = await getTeamMember(teamId, user.id);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'You do not have access to invite members for this team' });
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to invite members' });
    }

    const { email, role = 'member' } = req.body || {};
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitation = await createTeamInvitation({
      teamId,
      email: email.trim().toLowerCase(),
      role,
      invitedByUserId: user.id,
      expiresAt
    });

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expiresAt
      }
    });
  } catch (error) {
    console.error('Failed to create team invitation:', error);
    res.status(500).json({ error: 'Unable to invite member', message: error.message });
  }
});

router.post('/invitations/accept', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req, res);
    if (!user) return;

    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required' });
    }

    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.accepted_at) {
      return res.status(409).json({ error: 'Invitation already accepted' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    const normalizedEmail = (req.user?.email || '').toLowerCase();
    if (normalizedEmail !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'Invitation email does not match your account email' });
    }

    const existingMember = await getTeamMember(invitation.team_id, user.id);
    if (existingMember && existingMember.status === 'active') {
      await markInvitationAccepted(invitation.id);
      const team = await getTeamById(invitation.team_id);
      return res.json({ team, alreadyMember: true });
    }

    await addTeamMember({
      teamId: invitation.team_id,
      userId: user.id,
      role: invitation.role || 'member',
      status: 'active',
      joinedAt: new Date().toISOString()
    });

    await markInvitationAccepted(invitation.id);
    const team = await getTeamById(invitation.team_id);

    res.json({ team });
  } catch (error) {
    console.error('Failed to accept team invitation:', error);
    res.status(500).json({ error: 'Unable to accept invitation', message: error.message });
  }
});

module.exports = router;
