const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { 
  createDocument, 
  appendToDocument, 
  getDocument,
  createDocumentFromTemplate 
} = require('../services/googleDocs');
const { asyncHandler } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Create a new document
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const { title, content, folderId, aiEnhance, contentType } = req.body || {};
  
  if (!title) {
    return res.status(400).json({ error: 'Document title is required' });
  }
  
  logger.info('Creating Google Doc', { title, userId: req.user.id });
  
  const document = await createDocument(req.user, { 
    title, 
    content, 
    folderId,
    aiEnhance,
    contentType 
  });
  
  res.status(201).json({ 
    success: true,
    document 
  });
}));

// Get document content
router.get('/:documentId', verifyToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  
  logger.info('Retrieving Google Doc', { documentId, userId: req.user.id });
  
  const document = await getDocument(req.user, { documentId });
  
  res.json({ 
    success: true,
    document 
  });
}));

// Append content to existing document
router.post('/:documentId/append', verifyToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { content, aiEnhance } = req.body || {};
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  logger.info('Appending to Google Doc', { documentId, userId: req.user.id });
  
  const result = await appendToDocument(req.user, { documentId, content, aiEnhance });
  
  res.json({ 
    success: true,
    document: result 
  });
}));

// Create document from template
router.post('/from-template', verifyToken, asyncHandler(async (req, res) => {
  const { templateId, title, replacements, folderId } = req.body || {};
  
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }
  if (!title) {
    return res.status(400).json({ error: 'Document title is required' });
  }
  
  logger.info('Creating document from template', { templateId, title, userId: req.user.id });
  
  const document = await createDocumentFromTemplate(req.user, { 
    templateId, 
    title, 
    replacements,
    folderId 
  });
  
  res.status(201).json({ 
    success: true,
    document 
  });
}));

module.exports = router;
