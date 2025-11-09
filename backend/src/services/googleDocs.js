const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { logger } = require('../utils/logger');
const OpenAI = require('openai');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function getDocsClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return {
    docs: google.docs({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth })
  };
}

async function createDocument(user, { title, content, folderId, aiEnhance = false, contentType = 'plain' }) {
  if (!title) {
    throw new Error('Document title is required');
  }

  try {
    const { docs, drive } = await getDocsClient(user);

    // AI-enhance content if requested
    let finalContent = content;
    if (aiEnhance && content && openaiClient) {
      try {
        finalContent = await enhanceContentWithAI(content, contentType);
      } catch (aiError) {
        logger.warn('AI enhancement failed, using original content:', aiError.message);
        finalContent = content;
      }
    }

    // Create the document
    const document = await docs.documents.create({
      requestBody: {
        title
      }
    });

    const documentId = document.data.documentId;

    if (!documentId) {
      throw new Error('Failed to obtain document id from Google Docs response');
    }

    // Add content if provided
    if (finalContent) {
      const requests = [];
      
      // Handle markdown formatting
      if (contentType === 'markdown') {
        requests.push({
          insertText: {
            text: finalContent,
            location: { index: 1 }
          }
        });
      } else {
        requests.push({
          insertText: {
            text: finalContent,
            endOfSegmentLocation: {
              segmentId: ''
            }
          }
        });
      }

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      });
    }

    // Move to folder if specified
    if (folderId) {
      try {
        const file = await drive.files.get({
          fileId: documentId,
          fields: 'parents'
        });
        const previousParents = file.data.parents?.join(',') || '';

        await drive.files.update({
          fileId: documentId,
          addParents: folderId,
          removeParents: previousParents,
          fields: 'id, parents'
        });
      } catch (error) {
        logger.error('Failed to move Google Doc into folder:', error.message);
        // Continue even if folder move fails
      }
    }

    logger.info('Document created successfully', { documentId, title });

    return {
      documentId,
      title: document.data.title,
      documentLink: `https://docs.google.com/document/d/${documentId}/edit`,
      aiEnhanced: aiEnhance && openaiClient ? true : false
    };
  } catch (error) {
    logger.error('Failed to create Google Doc:', error);
    throw new Error(`Document creation failed: ${error.message}`);
  }
}

async function appendToDocument(user, { documentId, content, aiEnhance = false }) {
  if (!documentId) {
    throw new Error('Document id is required');
  }
  if (!content) {
    throw new Error('Content is required to append text');
  }

  try {
    const { docs } = await getDocsClient(user);

    // AI-enhance content if requested
    let finalContent = content;
    if (aiEnhance && openaiClient) {
      try {
        finalContent = await enhanceContentWithAI(content, 'plain');
      } catch (aiError) {
        logger.warn('AI enhancement failed, using original content:', aiError.message);
        finalContent = content;
      }
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              text: `\n${finalContent}`,
              endOfSegmentLocation: {
                segmentId: ''
              }
            }
          }
        ]
      }
    });

    logger.info('Content appended to document', { documentId });

    return {
      documentId,
      documentLink: `https://docs.google.com/document/d/${documentId}/edit`,
      aiEnhanced: aiEnhance && openaiClient ? true : false
    };
  } catch (error) {
    logger.error('Failed to append to Google Doc:', error);
    throw new Error(`Append operation failed: ${error.message}`);
  }
}

async function getDocument(user, { documentId }) {
  if (!documentId) {
    throw new Error('Document id is required');
  }

  try {
    const { docs } = await getDocsClient(user);
    
    const document = await docs.documents.get({
      documentId
    });

    // Extract text content
    const content = extractTextFromDocument(document.data);

    return {
      documentId,
      title: document.data.title,
      content,
      documentLink: `https://docs.google.com/document/d/${documentId}/edit`
    };
  } catch (error) {
    logger.error('Failed to get Google Doc:', error);
    throw new Error(`Failed to retrieve document: ${error.message}`);
  }
}

async function createDocumentFromTemplate(user, { templateId, title, replacements = {}, folderId }) {
  if (!templateId) {
    throw new Error('Template id is required');
  }
  if (!title) {
    throw new Error('Document title is required');
  }

  try {
    const { drive, docs } = await getDocsClient(user);

    // Copy the template
    const copiedFile = await drive.files.copy({
      fileId: templateId,
      requestBody: {
        name: title
      }
    });

    const documentId = copiedFile.data.id;

    // Apply replacements
    if (Object.keys(replacements).length > 0) {
      const requests = Object.entries(replacements).map(([placeholder, value]) => ({
        replaceAllText: {
          containsText: {
            text: placeholder,
            matchCase: false
          },
          replaceText: value
        }
      }));

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      });
    }

    // Move to folder if specified
    if (folderId) {
      try {
        const file = await drive.files.get({
          fileId: documentId,
          fields: 'parents'
        });
        const previousParents = file.data.parents?.join(',') || '';

        await drive.files.update({
          fileId: documentId,
          addParents: folderId,
          removeParents: previousParents,
          fields: 'id, parents'
        });
      } catch (error) {
        logger.error('Failed to move document to folder:', error.message);
      }
    }

    logger.info('Document created from template', { documentId, templateId, title });

    return {
      documentId,
      title,
      documentLink: `https://docs.google.com/document/d/${documentId}/edit`
    };
  } catch (error) {
    logger.error('Failed to create document from template:', error);
    throw new Error(`Template creation failed: ${error.message}`);
  }
}

// Helper function to enhance content with AI
async function enhanceContentWithAI(content, contentType) {
  if (!openaiClient) {
    return content;
  }

  const prompt = `Enhance and improve the following ${contentType} content for a professional document. 
Maintain the core message but improve clarity, grammar, and professionalism:

${content}

Return only the enhanced content without explanations.`;

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1500
  });

  return response.choices[0].message.content.trim();
}

// Helper function to extract text from document structure
function extractTextFromDocument(document) {
  let text = '';
  
  if (document.body && document.body.content) {
    for (const element of document.body.content) {
      if (element.paragraph) {
        for (const textElement of element.paragraph.elements || []) {
          if (textElement.textRun) {
            text += textElement.textRun.content;
          }
        }
      }
    }
  }
  
  return text;
}

module.exports = {
  createDocument,
  appendToDocument,
  getDocument,
  createDocumentFromTemplate
};
