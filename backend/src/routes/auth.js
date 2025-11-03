const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { storeUserTokens, getUserTokens, createDefaultCategories, getUserByGoogleId } = require('../database/users');
const { getTeamsForUser } = require('../database/teams');
const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate auth URL
router.get('/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ authUrl: url });
});

// Redirect Google callback to frontend so the SPA can finish the flow
router.get('/google/callback', (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const redirectBase = process.env.FRONTEND_REDIRECT_URI || 'http://localhost:3002/';
  const redirectUrl = new URL(redirectBase);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  res.redirect(redirectUrl.toString());
});

// Handle OAuth callback
router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Create JWT token
    const jwtToken = jwt.sign(
      { 
        userId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store tokens in database
    const user = await storeUserTokens(userInfo.id, userInfo.email, tokens);
    
    // Create default categories for new users
    await createDefaultCategories(user.id);

    const teams = await getTeamsForUser(user.id);

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      teams
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({ 
      error: 'Authentication failed',
      message: error.message 
    });
  }
});

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userRecord = req.user?.userId ? await getUserByGoogleId(req.user.userId) : null;
    const teams = userRecord ? await getTeamsForUser(userRecord.id) : [];

    res.json({
      user: req.user,
      teams
    });
  } catch (error) {
    console.error('Failed to load user profile:', error);
    res.status(500).json({ error: 'Unable to load profile', message: error.message });
  }
});

module.exports = router;
