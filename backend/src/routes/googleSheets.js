const express = require('express');
const { verifyToken, requirePro } = require('../middleware/auth');
const { 
  createSpreadsheet,
  appendRows, 
  updateRange,
  getRange,
  analyzeDataWithAI,
  generateChartSuggestions,
  batchUpdate
} = require('../services/googleSheets');
const { asyncHandler } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Create a new spreadsheet
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const { title, sheets, folderId } = req.body || {};
  
  if (!title) {
    return res.status(400).json({ error: 'Spreadsheet title is required' });
  }
  
  logger.info('Creating Google Sheet', { title, userId: req.user.id });
  
  const spreadsheet = await createSpreadsheet(req.user, { title, sheets, folderId });
  
  res.status(201).json({ 
    success: true,
    spreadsheet 
  });
}));

// Append rows to spreadsheet
router.post('/append', verifyToken, asyncHandler(async (req, res) => {
  const { spreadsheetId, range, values, valueInputOption } = req.body || {};
  
  if (!spreadsheetId || !range || !values) {
    return res.status(400).json({ 
      error: 'spreadsheetId, range, and values are required' 
    });
  }
  
  logger.info('Appending rows to Google Sheet', { spreadsheetId, userId: req.user.id });
  
  const result = await appendRows(req.user, { spreadsheetId, range, values, valueInputOption });
  
  res.status(201).json({ 
    success: true, 
    ...result 
  });
}));

// Update range in spreadsheet
router.put('/update', verifyToken, asyncHandler(async (req, res) => {
  const { spreadsheetId, range, values, valueInputOption } = req.body || {};
  
  if (!spreadsheetId || !range || !values) {
    return res.status(400).json({ 
      error: 'spreadsheetId, range, and values are required' 
    });
  }
  
  logger.info('Updating range in Google Sheet', { spreadsheetId, range, userId: req.user.id });
  
  const result = await updateRange(req.user, { spreadsheetId, range, values, valueInputOption });
  
  res.json({ 
    success: true,
    ...result 
  });
}));

// Get range from spreadsheet
router.get('/:spreadsheetId/range', verifyToken, asyncHandler(async (req, res) => {
  const { spreadsheetId } = req.params;
  const { range } = req.query;
  
  if (!range) {
    return res.status(400).json({ error: 'Range query parameter is required' });
  }
  
  logger.info('Getting range from Google Sheet', { spreadsheetId, range, userId: req.user.id });
  
  const result = await getRange(req.user, { spreadsheetId, range });
  
  res.json({ 
    success: true,
    ...result 
  });
}));

// AI analysis of spreadsheet data (Pro+ feature)
router.post('/analyze', verifyToken, requirePro, asyncHandler(async (req, res) => {
  const { spreadsheetId, range, analysisType } = req.body || {};
  
  if (!spreadsheetId || !range) {
    return res.status(400).json({ 
      error: 'spreadsheetId and range are required' 
    });
  }
  
  logger.info('Analyzing Google Sheet with AI', { 
    spreadsheetId, 
    range, 
    analysisType,
    userId: req.user.id 
  });
  
  const result = await analyzeDataWithAI(req.user, { spreadsheetId, range, analysisType });
  
  res.json({ 
    success: true,
    ...result 
  });
}));

// Generate chart suggestions (Pro+ feature)
router.post('/chart-suggestions', verifyToken, requirePro, asyncHandler(async (req, res) => {
  const { spreadsheetId, range } = req.body || {};
  
  if (!spreadsheetId || !range) {
    return res.status(400).json({ 
      error: 'spreadsheetId and range are required' 
    });
  }
  
  logger.info('Generating chart suggestions', { spreadsheetId, range, userId: req.user.id });
  
  const result = await generateChartSuggestions(req.user, { spreadsheetId, range });
  
  res.json({ 
    success: true,
    ...result 
  });
}));

// Batch update operations
router.post('/batch-update', verifyToken, asyncHandler(async (req, res) => {
  const { spreadsheetId, requests } = req.body || {};
  
  if (!spreadsheetId || !requests) {
    return res.status(400).json({ 
      error: 'spreadsheetId and requests array are required' 
    });
  }
  
  logger.info('Performing batch update on Google Sheet', { 
    spreadsheetId, 
    requestCount: requests.length,
    userId: req.user.id 
  });
  
  const result = await batchUpdate(req.user, { spreadsheetId, requests });
  
  res.json({ 
    success: true,
    ...result 
  });
}));

module.exports = router;
