const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { appendRows } = require('../services/googleSheets');

const router = express.Router();

router.post('/append', verifyToken, async (req, res) => {
  try {
    const { spreadsheetId, range, values, valueInputOption } = req.body || {};
    const result = await appendRows(req.user, { spreadsheetId, range, values, valueInputOption });
    res.status(201).json({ success: true, range: result.range, spreadsheetId: result.spreadsheetId });
  } catch (error) {
    console.error('Failed to append rows to Google Sheet:', error);
    res.status(400).json({
      error: 'Failed to append rows to sheet',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

module.exports = router;
