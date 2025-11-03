const express = require('express');
const { verifyToken } = require('../middleware/auth');
const {
  createAssistantAction,
  updateAssistantActionResult,
  getAssistantActionById,
  saveAssistantActionFeedback,
  getAssistantActionMetrics
} = require('../database/actions');
const { draftReply, suggestMeetingTimes, markEmailHandled } = require('../services/actionExecutor');

const router = express.Router();

router.post('/draft-reply', verifyToken, async (req, res) => {
  try {
    const { emailId, threadId } = req.body;
    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }

    const action = await createAssistantAction({
      userId: req.user.userId,
      emailId,
      threadId,
      actionType: 'draft_reply',
      payload: req.body
    });

    const draft = await draftReply(req.user, { emailId, threadId });

    await updateAssistantActionResult(action.id, {
      status: 'completed',
      result: { draft }
    });

    res.json({
      actionId: action.id,
      draft
    });
  } catch (error) {
    console.error('Draft reply action failed:', error);
    res.status(500).json({ error: 'Unable to draft reply', message: error.message });
  }
});

router.post('/schedule-meeting', verifyToken, async (req, res) => {
  try {
    const { emailId, durationMinutes } = req.body;
    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }

    const action = await createAssistantAction({
      userId: req.user.userId,
      emailId,
      threadId: req.body.threadId || null,
      actionType: 'schedule_meeting',
      payload: req.body
    });

    const suggestions = await suggestMeetingTimes(req.user, {
      emailId,
      preferredDurationMinutes: durationMinutes || 30
    });

    await updateAssistantActionResult(action.id, {
      status: 'awaiting_confirmation',
      result: { suggestions }
    });

    res.json({
      actionId: action.id,
      suggestions
    });
  } catch (error) {
    console.error('Schedule meeting action failed:', error);
    res.status(500).json({ error: 'Unable to suggest meeting times', message: error.message });
  }
});

router.post('/mark-handled', verifyToken, async (req, res) => {
  try {
    const { emailId } = req.body;
    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }

    const action = await createAssistantAction({
      userId: req.user.userId,
      emailId,
      threadId: req.body.threadId || null,
      actionType: 'mark_handled',
      payload: req.body
    });

    const result = await markEmailHandled(req.user, { emailId, labelName: req.body.labelName });

    await updateAssistantActionResult(action.id, {
      status: 'completed',
      result
    });

    res.json({
      actionId: action.id,
      result
    });
  } catch (error) {
    console.error('Mark handled action failed:', error);
    res.status(500).json({ error: 'Unable to mark email handled', message: error.message });
  }
});

router.post('/:actionId/undo', verifyToken, async (req, res) => {
  try {
    const actionId = Number.parseInt(req.params.actionId, 10);
    if (!actionId) {
      return res.status(400).json({ error: 'Invalid action id' });
    }

    const action = await getAssistantActionById(actionId);
    if (!action || action.user_id !== req.user.userId) {
      return res.status(404).json({ error: 'Action not found' });
    }

    await updateAssistantActionResult(actionId, {
      status: 'undone',
      undone: true
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Undo action failed:', error);
    res.status(500).json({ error: 'Unable to undo action', message: error.message });
  }
});

router.post('/:actionId/feedback', verifyToken, async (req, res) => {
  try {
    const actionId = Number.parseInt(req.params.actionId, 10);
    if (!actionId) {
      return res.status(400).json({ error: 'Invalid action id' });
    }

    const { rating, note } = req.body || {};
    if (!rating || !['helpful', 'not_helpful', 'needs_follow_up'].includes(rating)) {
      return res.status(400).json({ error: 'rating must be one of helpful, not_helpful, needs_follow_up' });
    }

    const action = await getAssistantActionById(actionId);
    if (!action || action.user_id !== req.user.userId) {
      return res.status(404).json({ error: 'Action not found' });
    }

    await saveAssistantActionFeedback(actionId, { rating, note });

    res.json({ success: true });
  } catch (error) {
    console.error('Saving action feedback failed:', error);
    res.status(500).json({ error: 'Unable to record feedback', message: error.message });
  }
});

router.get('/metrics', verifyToken, async (req, res) => {
  try {
    const days = Number.parseInt(req.query.days, 10);
    const metrics = await getAssistantActionMetrics(req.user.userId, {
      days: Number.isFinite(days) && days > 0 ? days : 7
    });

    res.json(metrics);
  } catch (error) {
    console.error('Fetching action metrics failed:', error);
    res.status(500).json({ error: 'Unable to fetch metrics', message: error.message });
  }
});

module.exports = router;
