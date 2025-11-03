const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { sendEmail, createDraft, sendDraft, listDrafts } = require('../services/gmailComposer');

const router = express.Router();

router.post('/send', verifyToken, async (req, res) => {
  const { to, subject, textBody, htmlBody } = req.body || {};

  if (!to || !subject || (!textBody && !htmlBody)) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'to, subject, and one of textBody or htmlBody are required.'
    });
  }

  try {
    const message = await sendEmail(req.user, {
      ...req.body
    });
    res.status(201).json({ message });
  } catch (error) {
    console.error('Failed to send email via Gmail:', error);
    res.status(500).json({
      error: 'Failed to send email',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

router.post('/drafts', verifyToken, async (req, res) => {
  const { to, subject, textBody, htmlBody } = req.body || {};

  if (!to || !subject || (!textBody && !htmlBody)) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'to, subject, and one of textBody or htmlBody are required.'
    });
  }

  try {
    const draft = await createDraft(req.user, {
      ...req.body
    });
    res.status(201).json({ draft });
  } catch (error) {
    console.error('Failed to create gmail draft:', error);
    res.status(500).json({
      error: 'Failed to create draft',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

router.get('/drafts', verifyToken, async (req, res) => {
  const maxResults = Number.parseInt(req.query.maxResults, 10) || 10;

  try {
    const drafts = await listDrafts(req.user, maxResults);
    res.json({ drafts });
  } catch (error) {
    console.error('Failed to list gmail drafts:', error);
    res.status(500).json({
      error: 'Failed to list drafts',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

router.post('/drafts/:draftId/send', verifyToken, async (req, res) => {
  const { draftId } = req.params;

  if (!draftId) {
    return res.status(400).json({ error: 'Draft id is required' });
  }

  try {
    const message = await sendDraft(req.user, draftId);
    res.json({ message });
  } catch (error) {
    console.error('Failed to send gmail draft:', error);
    res.status(500).json({
      error: 'Failed to send draft',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

module.exports = router;
