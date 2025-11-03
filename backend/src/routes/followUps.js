const express = require('express');
const { verifyToken } = require('../middleware/auth');
const {
  listFollowUpTasks,
  getFollowUpTaskById,
  updateFollowUpTask
} = require('../database/followUps');
const { generateFollowUpDraft } = require('../services/followUpGenerator');
const { scheduleFollowUp, snoozeFollowUp, dismissFollowUp, regenerateDraft } = require('../services/followUpScheduler');
const { getUserByGoogleId, getUserById } = require('../database/users');
const { getTeamMember, getTeamById } = require('../database/teams');

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

    req.followUpContext = {
      teamId,
      team,
      userRecord,
      membership
    };

    next();
  } catch (error) {
    console.error('Failed to resolve follow-up context:', error);
    res.status(500).json({ error: 'Unable to load follow-up context', message: error.message });
  }
}

function serializeTask(task) {
  if (!task) return null;
  return {
    id: task.id,
    teamId: task.teamId,
    ownerUserId: task.ownerUserId,
    threadId: task.threadId,
    lastMessageId: task.lastMessageId,
    counterpartEmail: task.counterpartEmail,
    subject: task.subject,
    summary: task.summary,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    suggestedSendAt: task.suggestedSendAt,
    draftSubject: task.draftSubject,
    draftBody: task.draftBody,
    toneHint: task.toneHint,
    metadata: task.metadata,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    sentAt: task.sentAt
  };
}

router.use(verifyToken, loadContext);

router.get('/', async (req, res) => {
  try {
    const { teamId, userRecord } = req.followUpContext;
    const { status, filter } = req.query;

    const ownerUserId = filter === 'mine' ? userRecord.id : null;
    const tasks = await listFollowUpTasks({
      teamId,
      status: status || 'pending',
      ownerUserId,
      limit: 100
    });

    res.json({ tasks: tasks.map(serializeTask) });
  } catch (error) {
    console.error('Failed to list follow-ups:', error);
    res.status(500).json({ error: 'Unable to load follow-up tasks', message: error.message });
  }
});

router.post('/:taskId/approve', async (req, res) => {
  try {
    const { teamId, userRecord } = req.followUpContext;
    const taskId = Number.parseInt(req.params.taskId, 10);
    if (!taskId) {
      return res.status(400).json({ error: 'Invalid follow-up id' });
    }

    const task = await getFollowUpTaskById(taskId);
    if (!task || task.teamId !== teamId) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (task.ownerUserId !== userRecord.id) {
      return res.status(403).json({ error: 'You can only approve your own follow-ups' });
    }

    const { sendAt, draftSubject, draftBody } = req.body || {};
    if (draftSubject || draftBody) {
      await updateFollowUpTask(taskId, {
        draftSubject: draftSubject || task.draftSubject,
        draftBody: draftBody || task.draftBody
      });
    }

    const scheduleTime = sendAt ? new Date(sendAt).toISOString() : new Date().toISOString();
    await scheduleFollowUp(taskId, scheduleTime);

    const updated = await getFollowUpTaskById(taskId);
    res.json({ task: serializeTask(updated) });
  } catch (error) {
    console.error('Failed to approve follow-up:', error);
    res.status(500).json({ error: 'Unable to approve follow-up', message: error.message });
  }
});

router.post('/:taskId/snooze', async (req, res) => {
  try {
    const { teamId, userRecord } = req.followUpContext;
    const taskId = Number.parseInt(req.params.taskId, 10);
    if (!taskId) {
      return res.status(400).json({ error: 'Invalid follow-up id' });
    }

    const task = await getFollowUpTaskById(taskId);
    if (!task || task.teamId !== teamId) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (task.ownerUserId !== userRecord.id) {
      return res.status(403).json({ error: 'You can only snooze your own follow-ups' });
    }

    const minutes = Number.parseInt(req.body?.minutes, 10) || 60 * 24;
    const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await snoozeFollowUp(taskId, dueAt);
    const updated = await getFollowUpTaskById(taskId);
    res.json({ task: serializeTask(updated) });
  } catch (error) {
    console.error('Failed to snooze follow-up:', error);
    res.status(500).json({ error: 'Unable to snooze follow-up', message: error.message });
  }
});

router.post('/:taskId/dismiss', async (req, res) => {
  try {
    const { teamId, userRecord } = req.followUpContext;
    const taskId = Number.parseInt(req.params.taskId, 10);
    if (!taskId) {
      return res.status(400).json({ error: 'Invalid follow-up id' });
    }

    const task = await getFollowUpTaskById(taskId);
    if (!task || task.teamId !== teamId) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (task.ownerUserId !== userRecord.id) {
      return res.status(403).json({ error: 'You can only dismiss your own follow-ups' });
    }

    await dismissFollowUp(taskId, req.body?.reason || null);
    const updated = await getFollowUpTaskById(taskId);
    res.json({ task: serializeTask(updated) });
  } catch (error) {
    console.error('Failed to dismiss follow-up:', error);
    res.status(500).json({ error: 'Unable to dismiss follow-up', message: error.message });
  }
});

router.post('/:taskId/regenerate', async (req, res) => {
  try {
    const { teamId, userRecord } = req.followUpContext;
    const taskId = Number.parseInt(req.params.taskId, 10);
    if (!taskId) {
      return res.status(400).json({ error: 'Invalid follow-up id' });
    }

    const task = await getFollowUpTaskById(taskId);
    if (!task || task.teamId !== teamId) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (task.ownerUserId !== userRecord.id) {
      return res.status(403).json({ error: 'You can only regenerate your own follow-ups' });
    }

    const draft = await generateFollowUpDraft({
      userName: userRecord.email?.split('@')[0] || 'Team',
      counterpartName: task.counterpartEmail?.split('@')[0] || 'there',
      subject: task.subject,
      lastMessageSnippet: task.summary,
      contextSummary: task.metadata?.contextSummary || task.summary,
      tone: task.toneHint || 'friendly',
      idleDays: task.metadata?.idleDays || 3
    });

    const updated = await regenerateDraft(taskId, draft);
    res.json({ task: serializeTask(updated) });
  } catch (error) {
    console.error('Failed to regenerate follow-up draft:', error);
    res.status(500).json({ error: 'Unable to regenerate draft', message: error.message });
  }
});

module.exports = router;
