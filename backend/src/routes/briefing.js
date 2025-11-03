const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { generateDailyBriefing } = require('../services/dailyBriefing');

const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    const timeframeHours = Number.parseInt(req.query.hours, 10) || 24;
    const maxEmails = Number.parseInt(req.query.limit, 10) || 20;

    const briefing = await generateDailyBriefing(req.user, {
      timeframeHours,
      maxEmails
    });

    res.json(briefing);
  } catch (error) {
    console.error('Failed to generate daily briefing:', error);
    res.status(500).json({
      error: 'Failed to generate daily briefing',
      message: error.message
    });
  }
});

module.exports = router;
