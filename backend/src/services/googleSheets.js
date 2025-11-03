const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');

async function getSheetsClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return google.sheets({ version: 'v4', auth });
}

async function appendRows(user, { spreadsheetId, range, values, valueInputOption = 'USER_ENTERED' }) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet id is required');
  }
  if (!range) {
    throw new Error('Target range (e.g., Sheet1!A1) is required');
  }
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Values array is required');
  }

  const sheets = await getSheetsClient(user);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption,
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values
    }
  });

  return { spreadsheetId, range };
}

module.exports = {
  appendRows
};
