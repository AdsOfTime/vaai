const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { handleAssistantMessage } = require('../services/assistant');

const router = express.Router();

router.post('/', verifyToken, async (req, res) => {
  try {
    const { message, context = {} } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const response = await handleAssistantMessage({
      user: {
        userId: req.user.userId,
        email: req.user.email || null,
        teamId: req.headers['x-team-id']
      },
      message,
      context
    });

    res.json(response);
  } catch (error) {
    console.error('Assistant route error:', error);
    res.status(500).json({
      error: 'Assistant failed',
      message: error.message
    });
  }
});

module.exports = router;
