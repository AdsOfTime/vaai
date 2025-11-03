const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');

function encodeBase64(message) {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildMimeMessage({ from, to, cc, bcc, subject, text, html }) {
  const headers = [];
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: multipart/alternative; boundary="vaai-boundary"');
  if (from) headers.push(`From: ${from}`);
  if (to) headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  if (subject) headers.push(`Subject: ${subject}`);

  const parts = [];
  if (text) {
    parts.push([
      '--vaai-boundary',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text
    ].join('\n'));
  }
  if (html) {
    parts.push([
      '--vaai-boundary',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      html
    ].join('\n'));
  }
  parts.push('--vaai-boundary--');

  return `${headers.join('\n')}\n\n${parts.join('\n')}`;
}

async function getGmailClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return google.gmail({ version: 'v1', auth });
}

async function sendEmail(user, payload) {
  const gmail = await getGmailClient(user);
  const raw = encodeBase64(
    buildMimeMessage({
      from: payload.from,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      text: payload.textBody,
      html: payload.htmlBody
    })
  );

  const requestBody = {
    raw
  };

  if (payload.labelIds && Array.isArray(payload.labelIds)) {
    requestBody.labelIds = payload.labelIds;
  }

  if (payload.sendAt) {
    requestBody.sendAt = payload.sendAt;
  }

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody
  });

  return response.data;
}

async function createDraft(user, payload) {
  const gmail = await getGmailClient(user);
  const raw = encodeBase64(
    buildMimeMessage({
      from: payload.from,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      text: payload.textBody,
      html: payload.htmlBody
    })
  );

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw
      }
    }
  });

  return response.data;
}

async function sendDraft(user, draftId) {
  if (!draftId) {
    throw new Error('Draft id is required');
  }
  const gmail = await getGmailClient(user);
  const response = await gmail.users.drafts.send({
    userId: 'me',
    requestBody: {
      id: draftId
    }
  });
  return response.data;
}

async function listDrafts(user, maxResults = 10) {
  const gmail = await getGmailClient(user);
  const response = await gmail.users.drafts.list({
    userId: 'me',
    maxResults
  });
  const drafts = response.data.drafts || [];

  if (!drafts.length) {
    return [];
  }

  const detailed = [];
  for (const draft of drafts) {
    if (!draft.id) continue;
    const draftDetail = await gmail.users.drafts.get({
      userId: 'me',
      id: draft.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'To', 'Cc', 'Bcc', 'Date']
    });
    detailed.push(draftDetail.data);
  }
  return detailed;
}

module.exports = {
  sendEmail,
  createDraft,
  sendDraft,
  listDrafts
};
