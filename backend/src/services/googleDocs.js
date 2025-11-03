const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');

async function getDocsClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return {
    docs: google.docs({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth })
  };
}

async function createDocument(user, { title, content, folderId }) {
  if (!title) {
    throw new Error('Document title is required');
  }

  const { docs, drive } = await getDocsClient(user);

  const document = await docs.documents.create({
    requestBody: {
      title
    }
  });

  const documentId = document.data.documentId;

  if (!documentId) {
    throw new Error('Failed to obtain document id from Google Docs response');
  }

  if (content) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              text: content,
              endOfSegmentLocation: {
                segmentId: ''
              }
            }
          }
        ]
      }
    });
  }

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
      console.error('Failed to move Google Doc into folder:', error.message);
      // Continue even if folder move fails to avoid throwing away document creation.
    }
  }

  return {
    documentId,
    title: document.data.title,
    documentLink: `https://docs.google.com/document/d/${documentId}/edit`
  };
}

async function appendToDocument(user, { documentId, content }) {
  if (!documentId) {
    throw new Error('Document id is required');
  }
  if (!content) {
    throw new Error('Content is required to append text');
  }

  const { docs } = await getDocsClient(user);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            text: `\n${content}`,
            endOfSegmentLocation: {
              segmentId: ''
            }
          }
        }
      ]
    }
  });

  return {
    documentId,
    documentLink: `https://docs.google.com/document/d/${documentId}/edit`
  };
}

module.exports = {
  createDocument,
  appendToDocument
};
