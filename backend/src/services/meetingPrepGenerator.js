const { google } = require('googleapis');
const OpenAI = require('openai');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { trimContent } = require('../utils/emailContent');
const { upsertMeetingBrief } = require('../database/meetingBriefs');
const { getUserById } = require('../database/users');
const { getTeamMembers } = require('../database/teams');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const DEFAULT_LOOKAHEAD_HOURS = Number.parseInt(process.env.MEETING_PREP_LOOKAHEAD_HOURS, 10) || 48;
const MAX_EVENTS_PER_USER = Number.parseInt(process.env.MEETING_PREP_MAX_EVENTS, 10) || 5;

function normalizeAttendee(attendee) {
  if (!attendee) return null;
  return {
    email: attendee.email || null,
    displayName: attendee.displayName || attendee.email?.split('@')[0] || null,
    responseStatus: attendee.responseStatus || null
  };
}

async function fetchUpcomingEvents(userRecord) {
  const auth = await getAuthorizedGoogleClient(userRecord);
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + DEFAULT_LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const response = await calendar.events.list({
    calendarId: 'primary',
    singleEvents: true,
    orderBy: 'startTime',
    timeMin,
    timeMax,
    maxResults: MAX_EVENTS_PER_USER,
    showDeleted: false
  });

  return (response.data.items || []).filter(event => {
    if (!event.start?.dateTime && !event.start?.date) return false;
    if (event.attendees && !event.attendees.some(att => !att.self)) {
      return event.attendees.length > 1;
    }
    return event.summary && event.summary.length > 0;
  });
}

async function fetchRecentThreadSnippet(userRecord, event) {
  try {
    const auth = await getAuthorizedGoogleClient(userRecord);
    const gmail = google.gmail({ version: 'v1', auth });

    const attendees = event.attendees?.filter(att => !att.self && att.email) || [];
    if (!attendees.length) return null;

    const primaryAttendee = attendees[0].email;
    const queryParts = [
      `newer_than:30d`,
      `to:${primaryAttendee}`
    ];
    if (event.summary) {
      queryParts.push(`subject:"${event.summary.replace(/"/g, '')}"`);
    }

    const threadList = await gmail.users.threads.list({
      userId: 'me',
      q: queryParts.join(' ')
    });

    const firstThread = threadList.data.threads?.[0];
    if (!firstThread) {
      return null;
    }

    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: firstThread.id,
      format: 'full'
    });

    const lastMessage = thread.data.messages?.slice(-1)[0];
    const body = lastMessage?.snippet || '';
    return trimContent(body, 600);
  } catch (error) {
    console.error('Failed to fetch recent thread snippet:', error);
    return null;
  }
}

async function generateBriefContent({ userName, event, recentSnippet }) {
  const attendees = (event.attendees || [])
    .filter(att => !att.self)
    .map(att => `${att.displayName || att.email || 'Unknown'}${att.responseStatus ? ` (${att.responseStatus})` : ''}`)
    .join(', ') || 'Unknown';

  if (!openaiClient) {
    return {
      summary: `Meeting "${event.summary || 'Untitled'}" with ${attendees}.`,
      agenda: `1. Review goals\n2. Discuss open questions\n3. Confirm next steps`,
      talkingPoints: `- Cover key updates for ${event.summary || 'this meeting'}\n- Ask about outstanding items\n- Confirm ownership for next actions`,
      intel: recentSnippet ? `Latest correspondence: ${recentSnippet}` : 'No recent correspondence found.'
    };
  }

  const prompt = `
You are an executive assistant preparing a meeting brief.
Return JSON with keys: summary (2 sentences), agenda (array of bullet strings), talking_points (array of bullet strings), intel (array of bullet strings). Keep each bullet under 160 characters.

Meeting:
- Title: ${event.summary || 'Untitled'}
- Starts at: ${event.start?.dateTime || event.start?.date || 'Unknown'}
- Organizer: ${event.organizer?.email || 'Unknown'}
- Attendees: ${attendees}
- Location: ${event.location || 'Unspecified'}
- Description: ${trimContent(event.description || 'No description', 1200)}
- Latest email context: ${recentSnippet || 'Unavailable'}

Respond with JSON only.
`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: 'You produce concise, structured meeting briefs that help busy professionals prepare quickly.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    let content = completion.choices[0]?.message?.content || '{}';

    // Some models wrap JSON responses in Markdown code fences; strip them if present.
    const fencedJsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedJsonMatch) {
      content = fencedJsonMatch[1];
    }

    const parsed = JSON.parse(content);
    return {
      summary: Array.isArray(parsed.summary) ? parsed.summary.join('\n') : parsed.summary || '',
      agenda: Array.isArray(parsed.agenda) ? parsed.agenda.join('\n') : parsed.agenda || '',
      talkingPoints: Array.isArray(parsed.talking_points) ? parsed.talking_points.join('\n') : parsed.talking_points || '',
      intel: Array.isArray(parsed.intel) ? parsed.intel.join('\n') : parsed.intel || ''
    };
  } catch (error) {
    console.error('Meeting brief generation failed:', error);
    return {
      summary: `Meeting "${event.summary || 'Untitled'}" with ${attendees}.`,
      agenda: `1. Review goals\n2. Discuss open questions\n3. Confirm next steps`,
      talkingPoints: `- Cover key updates for ${event.summary || 'this meeting'}\n- Ask about outstanding items\n- Confirm ownership for next actions`,
      intel: recentSnippet ? `Latest correspondence: ${recentSnippet}` : 'No recent correspondence found.'
    };
  }
}

async function prepareMeetingBriefForEvent(teamId, userRecord, event) {
  const attendees = (event.attendees || []).map(normalizeAttendee).filter(Boolean);
  const recentSnippet = await fetchRecentThreadSnippet(userRecord, event);

  const content = await generateBriefContent({
    userName: userRecord.email?.split('@')[0] || userRecord.email || 'User',
    event,
    recentSnippet
  });

  const calendarStart = event.start?.dateTime || event.start?.date || null;

  return upsertMeetingBrief({
    teamId,
    ownerUserId: userRecord.id,
    calendarEventId: event.id,
    calendarEventStart: calendarStart,
    status: 'ready',
    summary: content.summary,
    agenda: content.agenda,
    talkingPoints: content.talkingPoints,
    intel: content.intel,
    metadata: {
      attendees,
      location: event.location || null,
      hangoutLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null,
      htmlLink: event.htmlLink || null,
      source: 'meeting_prep_v1'
    }
  });
}

async function generateMeetingBriefsForTeam(teamId) {
  const members = await getTeamMembers(teamId, { status: 'active' });
  const created = [];

  for (const member of members) {
    try {
      const userRecord = await getUserById(member.user_id);
      if (!userRecord?.access_token) continue;

      const events = await fetchUpcomingEvents(userRecord);
      for (const event of events) {
        const result = await prepareMeetingBriefForEvent(teamId, userRecord, event);
        if (result?.id) {
          created.push(result.id);
        }
      }
    } catch (error) {
      console.error(`Meeting brief generation failed for team ${teamId}, user ${member.user_id}:`, error);
    }
  }

  return created;
}

module.exports = {
  generateMeetingBriefsForTeam
};
