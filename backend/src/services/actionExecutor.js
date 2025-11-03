const OpenAI = require('openai');
const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { trimContent } = require('../utils/emailContent');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function getGmailClient(user) {
  const oauth2Client = await getAuthorizedGoogleClient(user);
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function fetchEmail(gmail, messageId) {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const headers = response.data.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from = headers.find(h => h.name === 'From')?.value || '';
  const body = response.data.snippet || '';

  return {
    subject,
    from,
    body,
    raw: response.data
  };
}

async function draftReply(user, { emailId, threadId }) {
  const gmail = await getGmailClient(user);
  const email = await fetchEmail(gmail, emailId);

  if (!openaiClient) {
    const reply = `Hi,\n\nThanks for reaching out regarding "${email.subject}". I'll follow up shortly.\n\nBest,\n${user?.name || 'VAAI Assistant'}`;
    return {
      draft: reply,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      threadId
    };
  }

  const prompt = `
You are an executive assistant. Draft a concise, professional reply that addresses the sender.

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${trimContent(email.body, 800)}

Reply guidelines:
- Keep it under 150 words.
- Maintain a polite and proactive tone.
- Propose next steps if appropriate.

Produce only the reply body text.
  `;

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content: 'You write emails for a busy professional. Replies must be concise and actionable.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const reply = response.choices[0]?.message?.content?.trim() || '';

  return {
    draft: reply,
    subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
    threadId
  };
}

async function suggestMeetingTimes(user, { emailId, preferredDurationMinutes = 30 }) {
  const gmail = await getGmailClient(user);
  const calendar = google.calendar({ version: 'v3', auth: await getAuthorizedGoogleClient(user) });
  await fetchEmail(gmail, emailId); // fetch to potentially parse context later

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      items: [{ id: 'primary' }]
    }
  });

  const busyWindows = freebusy.data.calendars?.primary?.busy || [];
  const suggestions = [];

  let cursor = new Date(now.getTime() + 2 * 60 * 60 * 1000); // start in 2 hours
  while (suggestions.length < 3 && cursor.getTime() < new Date(timeMax).getTime()) {
    const next = new Date(cursor.getTime() + preferredDurationMinutes * 60 * 1000);
    const overlapsBusy = busyWindows.some(window => {
      const start = new Date(window.start);
      const end = new Date(window.end);
      return cursor < end && next > start;
    });

    if (!overlapsBusy) {
      suggestions.push({
        start: cursor.toISOString(),
        end: next.toISOString()
      });
      cursor = new Date(next.getTime() + 60 * 60 * 1000);
    } else {
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
    }
  }

  return suggestions;
}

async function markEmailHandled(user, { emailId, labelName = 'VAAI/Handled' }) {
  const gmail = await getGmailClient(user);

  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const existingLabel = labelsResponse.data.labels?.find(label => label.name === labelName);

  let labelId = existingLabel?.id;
  if (!labelId) {
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    labelId = created.data.id;
  }

  await gmail.users.messages.modify({
    userId: 'me',
    id: emailId,
    requestBody: {
      addLabelIds: [labelId]
    }
  });

  return { labelId, labelName };
}

module.exports = {
  draftReply,
  suggestMeetingTimes,
  markEmailHandled
};
