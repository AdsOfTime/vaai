const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getUserByGoogleId } = require('../database/users');
const { getTeamById, getTeamMember } = require('../database/teams');
const { listMeetingBriefs, getMeetingBriefById, updateMeetingBrief } = require('../database/meetingBriefs');

const router = express.Router();

async function loadContext(req, res, next) {
  try {
    const googleId = req.user?.userId;
    if (!googleId) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userRecord = await getUserByGoogleId(googleId);
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const teamHeader = req.headers['x-team-id'];
    if (!teamHeader) {
      return res.status(400).json({ error: 'Missing X-Team-Id header' });
    }

    const teamId = Number.parseInt(teamHeader, 10);
    if (!teamId) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const membership = await getTeamMember(teamId, userRecord.id);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'You do not belong to this team' });
    }

    req.meetingContext = {
      teamId,
      team,
      userRecord
    };

    next();
  } catch (error) {
    console.error('Failed to load meeting brief context:', error);
    res.status(500).json({ error: 'Unable to load meeting brief context', message: error.message });
  }
}

function serializeBrief(brief) {
  if (!brief) return null;
  return {
    id: brief.id,
    teamId: brief.teamId,
    ownerUserId: brief.ownerUserId,
    calendarEventId: brief.calendarEventId,
    calendarEventStart: brief.calendarEventStart,
    status: brief.status,
    summary: brief.summary,
    agenda: brief.agenda,
    talkingPoints: brief.talkingPoints,
    intel: brief.intel,
    metadata: brief.metadata,
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt
  };
}

router.use(verifyToken, loadContext);

router.get('/', async (req, res) => {
  try {
    const { teamId, userRecord } = req.meetingContext;
    const { scope = 'team', days = 7 } = req.query;

    const ownerUserId = scope === 'mine' ? userRecord.id : null;
    const fromDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();

    const briefs = await listMeetingBriefs({
      teamId,
      ownerUserId,
      fromDate,
      limit: 50
    });

    res.json({ briefs: briefs.map(serializeBrief) });
  } catch (error) {
    console.error('Failed to list meeting briefs:', error);
    res.status(500).json({ error: 'Unable to load meeting briefs', message: error.message });
  }
});

router.get('/:briefId', async (req, res) => {
  try {
    const { teamId } = req.meetingContext;
    const briefId = Number.parseInt(req.params.briefId, 10);
    if (!briefId) {
      return res.status(400).json({ error: 'Invalid meeting brief id' });
    }

    const brief = await getMeetingBriefById(briefId);
    if (!brief || brief.teamId !== teamId) {
      return res.status(404).json({ error: 'Meeting brief not found' });
    }

    res.json({ brief: serializeBrief(brief) });
  } catch (error) {
    console.error('Failed to load meeting brief:', error);
    res.status(500).json({ error: 'Unable to load meeting brief', message: error.message });
  }
});

router.patch('/:briefId', async (req, res) => {
  try {
    const { teamId } = req.meetingContext;
    const briefId = Number.parseInt(req.params.briefId, 10);
    if (!briefId) {
      return res.status(400).json({ error: 'Invalid meeting brief id' });
    }

    const brief = await getMeetingBriefById(briefId);
    if (!brief || brief.teamId !== teamId) {
      return res.status(404).json({ error: 'Meeting brief not found' });
    }

    const { status, metadata } = req.body || {};
    await updateMeetingBrief(briefId, {
      status,
      metadata: metadata !== undefined ? metadata : brief.metadata
    });

    const updated = await getMeetingBriefById(briefId);
    res.json({ brief: serializeBrief(updated) });
  } catch (error) {
    console.error('Failed to update meeting brief:', error);
    res.status(500).json({ error: 'Unable to update meeting brief', message: error.message });
  }
});

module.exports = router;
