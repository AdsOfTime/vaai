const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { logger } = require('../utils/logger');
const OpenAI = require('openai');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function getSheetsClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth })
  };
}

async function createSpreadsheet(user, { title, sheets = ['Sheet1'], folderId }) {
  if (!title) {
    throw new Error('Spreadsheet title is required');
  }

  try {
    const { sheets: sheetsApi, drive } = await getSheetsClient(user);

    const spreadsheet = await sheetsApi.spreadsheets.create({
      requestBody: {
        properties: {
          title
        },
        sheets: sheets.map(sheetTitle => ({
          properties: {
            title: sheetTitle
          }
        }))
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // Move to folder if specified
    if (folderId) {
      try {
        const file = await drive.files.get({
          fileId: spreadsheetId,
          fields: 'parents'
        });
        const previousParents = file.data.parents?.join(',') || '';

        await drive.files.update({
          fileId: spreadsheetId,
          addParents: folderId,
          removeParents: previousParents,
          fields: 'id, parents'
        });
      } catch (error) {
        logger.error('Failed to move spreadsheet to folder:', error.message);
      }
    }

    logger.info('Spreadsheet created successfully', { spreadsheetId, title });

    return {
      spreadsheetId,
      title: spreadsheet.data.properties.title,
      spreadsheetUrl: spreadsheet.data.spreadsheetUrl
    };
  } catch (error) {
    logger.error('Failed to create spreadsheet:', error);
    throw new Error(`Spreadsheet creation failed: ${error.message}`);
  }
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

  try {
    const { sheets } = await getSheetsClient(user);
    
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values
      }
    });

    logger.info('Rows appended to spreadsheet', { 
      spreadsheetId, 
      range, 
      rowsAdded: values.length 
    });

    return { 
      spreadsheetId, 
      range,
      updatedRange: result.data.updates.updatedRange,
      updatedRows: result.data.updates.updatedRows
    };
  } catch (error) {
    logger.error('Failed to append rows:', error);
    throw new Error(`Append operation failed: ${error.message}`);
  }
}

async function updateRange(user, { spreadsheetId, range, values, valueInputOption = 'USER_ENTERED' }) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet id is required');
  }
  if (!range) {
    throw new Error('Target range is required');
  }
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Values array is required');
  }

  try {
    const { sheets } = await getSheetsClient(user);
    
    const result = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: {
        values
      }
    });

    logger.info('Range updated in spreadsheet', { spreadsheetId, range });

    return {
      spreadsheetId,
      range,
      updatedCells: result.data.updatedCells,
      updatedRows: result.data.updatedRows
    };
  } catch (error) {
    logger.error('Failed to update range:', error);
    throw new Error(`Update operation failed: ${error.message}`);
  }
}

async function getRange(user, { spreadsheetId, range }) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet id is required');
  }
  if (!range) {
    throw new Error('Range is required');
  }

  try {
    const { sheets } = await getSheetsClient(user);
    
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    return {
      spreadsheetId,
      range,
      values: result.data.values || []
    };
  } catch (error) {
    logger.error('Failed to get range:', error);
    throw new Error(`Get operation failed: ${error.message}`);
  }
}

async function analyzeDataWithAI(user, { spreadsheetId, range, analysisType = 'summary' }) {
  if (!openaiClient) {
    throw new Error('AI analysis requires OpenAI API key');
  }

  try {
    // Get the data
    const data = await getRange(user, { spreadsheetId, range });
    
    if (!data.values || data.values.length === 0) {
      throw new Error('No data found in specified range');
    }

    // Prepare data for AI analysis
    const dataString = data.values.map(row => row.join('\t')).join('\n');
    
    let prompt;
    switch (analysisType) {
      case 'summary':
        prompt = `Analyze this spreadsheet data and provide a concise summary of key insights:\n\n${dataString}`;
        break;
      case 'trends':
        prompt = `Analyze this spreadsheet data and identify trends, patterns, and anomalies:\n\n${dataString}`;
        break;
      case 'recommendations':
        prompt = `Analyze this spreadsheet data and provide actionable recommendations:\n\n${dataString}`;
        break;
      default:
        prompt = `Analyze this spreadsheet data:\n\n${dataString}`;
    }

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    const analysis = response.choices[0].message.content.trim();

    logger.info('AI analysis completed', { spreadsheetId, range, analysisType });

    return {
      spreadsheetId,
      range,
      analysisType,
      analysis,
      dataRows: data.values.length
    };
  } catch (error) {
    logger.error('Failed to analyze data with AI:', error);
    throw new Error(`AI analysis failed: ${error.message}`);
  }
}

async function generateChartSuggestions(user, { spreadsheetId, range }) {
  if (!openaiClient) {
    throw new Error('Chart suggestions require OpenAI API key');
  }

  try {
    const data = await getRange(user, { spreadsheetId, range });
    
    if (!data.values || data.values.length === 0) {
      throw new Error('No data found in specified range');
    }

    const dataPreview = data.values.slice(0, 10).map(row => row.join('\t')).join('\n');
    
    const prompt = `Based on this spreadsheet data, suggest the most appropriate chart types and configurations:

${dataPreview}

Provide 3 chart suggestions with:
1. Chart type (bar, line, pie, scatter, etc.)
2. Recommended data series
3. Axis labels
4. Why this chart is appropriate

Format as JSON array.`;

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    const suggestions = JSON.parse(response.choices[0].message.content.trim());

    logger.info('Chart suggestions generated', { spreadsheetId, range });

    return {
      spreadsheetId,
      range,
      suggestions
    };
  } catch (error) {
    logger.error('Failed to generate chart suggestions:', error);
    throw new Error(`Chart suggestion failed: ${error.message}`);
  }
}

async function batchUpdate(user, { spreadsheetId, requests }) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet id is required');
  }
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('Requests array is required');
  }

  try {
    const { sheets } = await getSheetsClient(user);
    
    const result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests
      }
    });

    logger.info('Batch update completed', { spreadsheetId, requestCount: requests.length });

    return {
      spreadsheetId,
      replies: result.data.replies
    };
  } catch (error) {
    logger.error('Failed to perform batch update:', error);
    throw new Error(`Batch update failed: ${error.message}`);
  }
}

module.exports = {
  createSpreadsheet,
  appendRows,
  updateRange,
  getRange,
  analyzeDataWithAI,
  generateChartSuggestions,
  batchUpdate
};
