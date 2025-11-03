const express = require('express');
const { google } = require('googleapis');
const { verifyToken } = require('../middleware/auth');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { classifyEmail } = require('../services/emailClassifier');
const { autoSortEmails } = require('../services/emailSorter');
const { decodeBase64Url } = require('../utils/emailContent');
const router = express.Router();

// Get Gmail client for user
async function getGmailClient(user) {
  const oauth2Client = await getAuthorizedGoogleClient(user);
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Get emails from Gmail
router.get('/', verifyToken, async (req, res) => {
  try {
    const gmail = await getGmailClient(req.user);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'is:unread'
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const message of messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      
      emails.push({
        id: message.id,
        subject,
        from,
        snippet: email.data.snippet,
        date: new Date(parseInt(email.data.internalDate))
      });
    }

    res.json({ emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Classify and sort emails
router.post('/classify', verifyToken, async (req, res) => {
  try {
    const { emailIds } = req.body;
    const gmail = await getGmailClient(req.user);
    
    const results = [];

    for (const emailId of emailIds) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: emailId
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      
      // Get email body
      let body = '';
      if (email.data.payload.body?.data) {
      }

      const category = await classifyEmail({ subject, from, body });
      
      results.push({
        emailId,
        category,
        subject,
        from
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error classifying emails:', error);
    res.status(500).json({ error: 'Failed to classify emails' });
  }
});

// Auto-sort emails using rules and AI fallback
router.post('/auto-sort', verifyToken, async (req, res) => {
  try {
    const gmail = await getGmailClient(req.user);
    const results = await autoSortEmails(gmail, req.user, {
      limit: req.body.limit,
      query: req.body.query
    });

    res.json({ results });
  } catch (error) {
    console.error('Error auto-sorting emails:', error);
    res.status(500).json({ error: 'Failed to auto-sort emails', message: error.message });
  }
});

// Apply labels to emails
router.post('/apply-labels', verifyToken, async (req, res) => {
  try {
    const { emailId, category } = req.body;
    const gmail = await getGmailClient(req.user);

    // Create label if it doesn't exist
    const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
    const existingLabel = labelsResponse.data.labels.find(
      label => label.name === `VAAI/${category}`
    );

    let labelId;
    if (!existingLabel) {
      const newLabel = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: `VAAI/${category}`,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        }
      });
      labelId = newLabel.data.id;
    } else {
      labelId = existingLabel.id;
    }

    // Apply label to email
    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        addLabelIds: [labelId]
      }
    });

    res.json({ success: true, labelId });
  } catch (error) {
    console.error('Error applying labels:', error);
    res.status(500).json({ error: 'Failed to apply labels' });
  }
});

module.exports = router;
