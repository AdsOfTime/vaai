const { google } = require('googleapis');
const { getUserTokens, storeUserTokens } = require('../database/users');

async function getAuthorizedGoogleClient(user) {
  const googleId = user?.userId || user?.googleId || user?.google_id;

  if (!googleId) {
    throw new Error('Missing user context for Google client');
  }

  const userTokens = await getUserTokens(googleId);
  if (!userTokens) {
    throw new Error('User tokens not found');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  let currentTokens = {
    access_token: userTokens.access_token,
    refresh_token: userTokens.refresh_token
  };

  oauth2Client.setCredentials({
    access_token: currentTokens.access_token,
    refresh_token: currentTokens.refresh_token
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      if (!tokens.access_token && !tokens.refresh_token) {
        return;
      }

      currentTokens = {
        access_token: tokens.access_token || currentTokens.access_token,
        refresh_token: tokens.refresh_token || currentTokens.refresh_token
      };

      await storeUserTokens(googleId, user.email, currentTokens);
    } catch (error) {
      console.error('Failed to persist refreshed Google tokens:', error);
    }
  });

  return oauth2Client;
}

module.exports = {
  getAuthorizedGoogleClient
};
