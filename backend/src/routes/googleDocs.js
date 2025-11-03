const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { createDocument, appendToDocument } = require('../services/googleDocs');

const router = express.Router();

router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, content, folderId } = req.body || {};
    const document = await createDocument(req.user, { title, content, folderId });
    res.status(201).json({ document });
  } catch (error) {
    console.error('Failed to create Google Doc:', error);
    res.status(400).json({
      error: 'Failed to create Google Doc',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

router.post('/:documentId/append', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { content } = req.body || {};
    const result = await appendToDocument(req.user, { documentId, content });
    res.json({ document: result });
  } catch (error) {
    console.error('Failed to append content to Google Doc:', error);
    res.status(400).json({
      error: 'Failed to append content',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

module.exports = router;
