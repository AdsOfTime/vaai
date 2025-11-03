const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { getDueFollowUps, updateFollowUpTask, appendFollowUpEvent, getFollowUpTaskById } = require('../database/followUps');
const { getUserById } = require('../database/users');

function buildRawEmail({ to, from, subject, body }) {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sendFollowUp(task) {
  const userRecord = await getUserById(task.ownerUserId);
  if (!userRecord?.access_token) {
    throw new Error('User not authenticated with Gmail');
  }

  if (!task.draftBody || !task.counterpartEmail) {
    throw new Error('Incomplete draft');
  }

  const oauthClient = await getAuthorizedGoogleClient(userRecord);
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });

  const subject = task.draftSubject || (task.subject?.startsWith('Re:') ? task.subject : `Re: ${task.subject || 'Follow up'}`);
  const raw = buildRawEmail({
    to: task.counterpartEmail,
    from: userRecord.email,
    subject,
    body: task.draftBody
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw
    }
  });
}

async function processDueFollowUps() {
  const dueTasks = await getDueFollowUps(20);
  if (!dueTasks.length) {
    return;
  }

  for (const task of dueTasks) {
    try {
      await sendFollowUp(task);
      await updateFollowUpTask(task.id, {
        status: 'sent',
        sentAt: new Date().toISOString()
      });
      await appendFollowUpEvent(task.id, 'sent', {});
    } catch (error) {
      console.error('Failed to send follow-up:', error);
      await updateFollowUpTask(task.id, { status: 'error' });
      await appendFollowUpEvent(task.id, 'error', { message: error.message });
    }
  }
}

async function scheduleFollowUp(taskId, sendAt) {
  await updateFollowUpTask(taskId, {
    status: 'scheduled',
    suggestedSendAt: sendAt
  });
  await appendFollowUpEvent(taskId, 'scheduled', { sendAt });
}

async function snoozeFollowUp(taskId, dueAt) {
  await updateFollowUpTask(taskId, {
    status: 'snoozed',
    dueAt,
    suggestedSendAt: dueAt
  });
  await appendFollowUpEvent(taskId, 'snoozed', { dueAt });
}

async function dismissFollowUp(taskId, reason = null) {
  await updateFollowUpTask(taskId, {
    status: 'dismissed'
  });
  await appendFollowUpEvent(taskId, 'dismissed', { reason });
}

async function regenerateDraft(taskId, draft) {
  await updateFollowUpTask(taskId, {
    draftSubject: draft.subject,
    draftBody: draft.body,
    toneHint: draft.tone || null
  });
  await appendFollowUpEvent(taskId, 'draft_created', { model: process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'template', regenerated: true });
  return getFollowUpTaskById(taskId);
}

module.exports = {
  processDueFollowUps,
  scheduleFollowUp,
  snoozeFollowUp,
  dismissFollowUp,
  regenerateDraft
};
