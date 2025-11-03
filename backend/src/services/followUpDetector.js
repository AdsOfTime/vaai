const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { createOrUpdateFollowUpTask, appendFollowUpEvent, getFollowUpTaskById, updateFollowUpTask } = require('../database/followUps');
const { getUserById } = require('../database/users');
const { generateFollowUpDraft } = require('./followUpGenerator');
const { getTeamMembers } = require('../database/teams');

const DEFAULT_LOOKBACK_DAYS = Number.parseInt(process.env.FOLLOW_UP_LOOKBACK_DAYS, 10) || 14;
const DEFAULT_IDLE_DAYS = Number.parseInt(process.env.FOLLOW_UP_IDLE_DAYS, 10) || 3;
const MAX_THREADS = Number.parseInt(process.env.FOLLOW_UP_MAX_THREADS, 10) || 25;

function getHeader(headers, name) {
  return headers?.find(header => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractEmailAddress(value = '') {
  const match = value.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return value.trim().toLowerCase();
}

async function fetchThreadsNeedingFollowUp(userRecord, { lookbackDays, idleDays, maxThreads }) {
  const oauthClient = await getAuthorizedGoogleClient(userRecord);
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });

  const query = `in:sent -label:chat newer_than:${lookbackDays}d`;
  const threadList = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults: maxThreads
  });

  const candidateThreads = [];
  const userEmail = userRecord.email?.toLowerCase();
  const now = Date.now();
  const idleThresholdMs = idleDays * 24 * 60 * 60 * 1000;

  for (const thread of threadList.data.threads || []) {
    try {
      const threadDetail = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length < 2) continue;

      const lastMessage = messages[messages.length - 1];
      const lastInternalDate = Number.parseInt(lastMessage.internalDate, 10);
      if (!lastInternalDate) continue;

      if (now - lastInternalDate < idleThresholdMs) {
        continue; // not stale yet
      }

      const lastFromHeader = getHeader(lastMessage.payload?.headers || [], 'From');
      const lastFromEmail = extractEmailAddress(lastFromHeader || '');

      if (!lastFromEmail || lastFromEmail !== userEmail) {
        // Last message not from us; skip (either they replied or it's a different thread type)
        continue;
      }

      // Find counterpart from previous message
      const previousMessage = messages[messages.length - 2];
      const prevFromHeader = getHeader(previousMessage.payload?.headers || [], 'From');
      const counterpartEmail = extractEmailAddress(prevFromHeader || '');
      if (!counterpartEmail || counterpartEmail === userEmail) {
        continue;
      }

      const subject = getHeader(lastMessage.payload?.headers || [], 'Subject') || getHeader(previousMessage.payload?.headers || [], 'Subject') || '';
      const summary = lastMessage.snippet || previousMessage.snippet || '';

      candidateThreads.push({
        threadId: thread.id,
        lastMessageId: lastMessage.id,
        subject,
        summary,
        counterpartEmail,
        lastMessageDate: new Date(lastInternalDate)
      });
    } catch (error) {
      console.error(`Failed to evaluate thread ${thread.id}:`, error);
    }
  }

  return candidateThreads;
}

async function discoverFollowUpsForTeam(teamId) {
  const members = await getTeamMembers(teamId, { status: 'active' });
  if (!members.length) return [];

  const createdTasks = [];

  for (const member of members) {
    try {
      const userRecord = await getUserById(member.user_id);
      if (!userRecord?.access_token) {
        continue;
      }

      const threads = await fetchThreadsNeedingFollowUp(userRecord, {
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
        idleDays: DEFAULT_IDLE_DAYS,
        maxThreads: MAX_THREADS
      });

      for (const candidate of threads) {
        const { id, inserted } = await createOrUpdateFollowUpTask({
          teamId,
          ownerUserId: member.user_id,
          threadId: candidate.threadId,
          lastMessageId: candidate.lastMessageId,
          counterpartEmail: candidate.counterpartEmail,
          subject: candidate.subject,
          summary: candidate.summary,
          status: 'pending',
          priority: 1,
          dueAt: new Date(candidate.lastMessageDate.getTime() + DEFAULT_IDLE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          suggestedSendAt: new Date(candidate.lastMessageDate.getTime() + (DEFAULT_IDLE_DAYS * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(),
          toneHint: 'friendly',
          promptVersion: 'v1',
          metadata: {
            idleDays: differenceInDays(candidate.lastMessageDate, new Date()),
            source: 'detector_v1'
          }
        });

        if (id) {
          if (inserted) {
            await appendFollowUpEvent(id, 'discovered', {
              counterpartEmail: candidate.counterpartEmail,
              idleDays: DEFAULT_IDLE_DAYS
            });
          }

          const task = await getFollowUpTaskById(id);
          if (task && (!task.draftBody || inserted)) {
            try {
              const draft = await generateFollowUpDraft({
                userName: userRecord.email?.split('@')[0] || 'Team',
                counterpartName: candidate.counterpartEmail.split('@')[0],
                subject: candidate.subject,
                lastMessageSnippet: candidate.summary,
                contextSummary: candidate.summary,
                idleDays: DEFAULT_IDLE_DAYS,
                tone: 'friendly'
              });

              await updateFollowUpTask(id, {
                draftSubject: draft.subject,
                draftBody: draft.body,
                toneHint: draft.tone
              });
              await appendFollowUpEvent(id, 'draft_created', { model: process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'template' });
            } catch (draftError) {
              console.error('Failed to generate follow-up draft:', draftError);
              await appendFollowUpEvent(id, 'error', { message: draftError.message });
            }
          }

          createdTasks.push(id);
        }
      }
    } catch (error) {
      console.error(`Follow-up discovery failed for team ${teamId}, user ${member.user_id}:`, error);
    }
  }

  return createdTasks;
}

module.exports = {
  discoverFollowUpsForTeam
};
function differenceInDays(start, end) {
  const diffMs = Math.abs(end.getTime() - start.getTime());
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}
