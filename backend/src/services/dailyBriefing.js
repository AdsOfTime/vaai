const OpenAI = require('openai');
const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { decodeBase64Url, extractBody, trimContent } = require('../utils/emailContent');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalize(text) {
  return (text || '').toLowerCase();
}

function quickIntentHeuristic(email) {
  const subject = normalize(email.subject);
  const body = normalize(email.body);

  if (subject.includes('invoice') || body.includes('invoice')) return 'invoice';
  if (subject.includes('receipt') || body.includes('receipt')) return 'expense';
  if (subject.includes('meeting') || body.includes('meet') || body.includes('schedule')) return 'meeting_request';
  if (subject.includes('follow up') || body.includes('follow up')) return 'follow_up';
  if (subject.includes('thank') || body.includes('thank you')) return 'gratitude';
  if (subject.includes('urgent') || body.includes('asap')) return 'urgent';
  return null;
}

async function classifyIntentWithAI(email) {
  if (!openaiClient) {
    return {
      intent: 'general',
      suggestedAction: 'Review and respond as needed.'
    };
  }

  const prompt = `
You are an AI assistant that classifies email intent and suggests the next action.

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${trimContent(email.body, 1000)}

Respond in JSON with keys:
- intent: one of [meeting_request, follow_up, invoice, expense, urgent, newsletter, spam, general]
- suggestedAction: concise action recommendation (max 20 words)
  `;

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'You output strict JSON responses for intent classification.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response');
    }

    const parsed = JSON.parse(content);
    return {
      intent: parsed.intent || 'general',
      suggestedAction: parsed.suggestedAction || 'Review as needed.'
    };
  } catch (error) {
    console.error('Intent classification via AI failed:', error);
    return {
      intent: 'general',
      suggestedAction: 'Review and respond as needed.'
    };
  }
}

async function summarizeBriefing(items) {
  if (!items.length) {
    return 'No new emails in the last 24 hours.';
  }

  if (!openaiClient) {
    const intentCounts = items.reduce((acc, item) => {
      acc[item.intent] = (acc[item.intent] || 0) + 1;
      return acc;
    }, {});

    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intent, count]) => `${count} ${intent.replace('_', ' ')} email${count > 1 ? 's' : ''}`);

    return `Processed ${items.length} emails. Top categories: ${topIntents.join(', ') || 'general updates'}.`;
  }

  const prompt = `
You summarize key emails for the day.

Email snippets:
${items.map((item, idx) => `
Email ${idx + 1}:
From: ${item.from}
Subject: ${item.subject}
Intent: ${item.intent}
Suggested action: ${item.suggestedAction}
Snippet: ${trimContent(item.body, 400)}
`).join('\n')}

Write a short summary (max 4 bullet points) highlighting priorities. Output plain text with bullets.`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'You are an executive assistant producing concise bullet summaries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const text = response.choices[0]?.message?.content;
    return text?.trim() || 'Review the highlighted emails below.';
  } catch (error) {
    console.error('Briefing summary failed:', error);
    return 'Review the highlighted emails below.';
  }
}

async function fetchEmailDetails(gmail, messageId) {
  const fullMessage = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const headers = fullMessage.data.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
  const from = headers.find(h => h.name === 'From')?.value || '(Unknown sender)';
  const body = trimContent(extractBody(fullMessage.data.payload) || fullMessage.data.snippet || '', 2000);
  const internalDate = fullMessage.data.internalDate ? Number.parseInt(fullMessage.data.internalDate, 10) : Date.now();

  return {
    id: messageId,
    threadId: fullMessage.data.threadId,
    subject,
    from,
    body,
    snippet: fullMessage.data.snippet || '',
    internalDate,
    labelIds: fullMessage.data.labelIds || []
  };
}

function buildActions(intent, details) {
  const baseContext = {
    emailId: details.id,
    threadId: details.threadId,
    subject: details.subject,
    from: details.from
  };

  const actions = [
    {
      type: 'draft_reply',
      label: 'Draft Reply',
      payload: baseContext
    }
  ];

  if (intent === 'meeting_request') {
    actions.push({
      type: 'schedule_meeting',
      label: 'Suggest Meeting Times',
      payload: {
        ...baseContext,
        durationMinutes: 30
      }
    });
  }

  if (['invoice', 'expense', 'newsletter', 'general'].includes(intent)) {
    actions.push({
      type: 'mark_handled',
      label: 'Mark Handled',
      payload: baseContext
    });
  }

  return actions;
}

function defaultSuggestedAction(intent) {
  switch (intent) {
    case 'meeting_request':
      return 'Propose meeting times from calendar availability.';
    case 'follow_up':
      return 'Send follow-up reply or set reminder.';
    case 'invoice':
    case 'expense':
      return 'Forward to finance or mark as paid.';
    case 'urgent':
      return 'Respond immediately or escalate.';
    case 'newsletter':
      return 'Skim and archive if not critical.';
    default:
      return 'Review and respond as needed.';
  }
}

async function generateDailyBriefing(user, { timeframeHours = 24, maxEmails = 20 } = {}) {
  const oauth2Client = await getAuthorizedGoogleClient(user);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const queryParts = [`newer_than:${Math.max(timeframeHours, 1)}h`];
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: queryParts.join(' '),
    maxResults: maxEmails
  });

  const messageIds = listResponse.data.messages || [];
  if (!messageIds.length) {
    return {
      summary: 'No new emails in the selected timeframe.',
      items: [],
      generatedAt: new Date().toISOString()
    };
  }

  const items = [];
  for (const message of messageIds) {
    try {
      const details = await fetchEmailDetails(gmail, message.id);
      const heuristicIntent = quickIntentHeuristic(details);

      let intent = heuristicIntent;
      let suggestedAction = heuristicIntent ? defaultSuggestedAction(heuristicIntent) : null;

      if (!intent) {
        const aiResult = await classifyIntentWithAI(details);
        intent = aiResult.intent;
        suggestedAction = aiResult.suggestedAction;
      }

      const actions = buildActions(intent, details);

      items.push({
        emailId: details.id,
        threadId: details.threadId,
        subject: details.subject,
        from: details.from,
        snippet: details.snippet,
        body: details.body,
        receivedAt: new Date(details.internalDate).toISOString(),
        intent,
        suggestedAction,
        labels: details.labelIds,
        actions
      });
    } catch (error) {
      console.error(`Failed to process message ${message.id}:`, error);
    }
  }

  const summary = await summarizeBriefing(items);

  return {
    summary,
    items,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateDailyBriefing
};
