const { google } = require('googleapis');
const OpenAI = require('openai');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');
const { createTask: createGoogleTask } = require('./googleTasks');
const { getUserByGoogleId } = require('../database/users');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const systemPrompt = `
You are VAAI, an executive assistant that helps manage email, meetings, and follow-ups.
Keep replies short and actionable. You can ask follow-up questions if details are missing.
If scheduling a meeting, capture title, start and end time (ISO 8601 preferred), location, attendees, and description when possible.
When the user asks for a meeting, prefer calling the create_calendar_event tool instead of responding with plain text.
If you cannot fulfil a request, explain what additional information you need.
`;

const calendarEventTool = {
  type: 'function',
  function: {
    name: 'create_calendar_event',
    description: 'Schedule a calendar meeting for the user in Google Calendar',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A short descriptive title for the meeting'
        },
        start: {
          type: 'string',
          description: 'Start time in ISO 8601 format (e.g. 2025-05-15T15:30:00Z)'
        },
        end: {
          type: 'string',
          description: 'End time in ISO 8601 format'
        },
        attendees: {
          type: 'array',
          description: 'Email addresses of the attendees',
          items: { type: 'string' }
        },
        location: {
          type: 'string',
          description: 'Meeting location or conferencing link'
        },
        description: {
          type: 'string',
          description: 'Optional meeting agenda or notes'
        }
      },
      required: ['summary', 'start', 'end'],
      additionalProperties: false
    }
  }
};

const createTaskTool = {
  type: 'function',
  function: {
    name: 'create_task',
    description: 'Create a Google Tasks reminder for the user',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short task description'
        },
        notes: {
          type: 'string',
          description: 'Additional details or context about the task'
        },
        due: {
          type: 'string',
          description: 'Due date/time in ISO 8601 format'
        }
      },
      required: ['title'],
      additionalProperties: false
    }
  }
};

async function scheduleCalendarEvent({ userContext, args }) {
  const { summary, start, end, attendees = [], location, description } = args || {};

  if (!summary || !start || !end) {
    return {
      reply:
        'I need a meeting title along with both a start and end time to schedule that. Please provide those details and try again.'
    };
  }

  const userRecord = await getUserByGoogleId(userContext.userId);
  if (!userRecord) {
    return {
      reply: 'I could not find your Google account. Please sign in again and retry.'
    };
  }

  const auth = await getAuthorizedGoogleClient({
    userId: userContext.userId,
    googleId: userContext.userId,
    email: userRecord.email
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const normalisedAttendees = Array.isArray(attendees)
    ? attendees
        .map((email) => (typeof email === 'string' ? email.trim() : null))
        .filter(Boolean)
        .map((email) => ({ email }))
    : [];

  const requestBody = {
    summary,
    description: description || '',
    location: location || '',
    start: {
      dateTime: start
    },
    end: {
      dateTime: end
    },
    attendees: normalisedAttendees
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody
    });

    const event = response.data;
    return {
      reply: `All set! I scheduled **${event.summary || summary}** on ${
        event.start?.dateTime || start
      }.`,
      event: {
        id: event.id,
        summary: event.summary || summary,
        start: event.start || { dateTime: start },
        end: event.end || { dateTime: end },
        location: event.location || location || '',
        hangoutLink:
          event.hangoutLink ||
          event.conferenceData?.entryPoints?.[0]?.uri ||
          null
      },
      eventCreated: true
    };
  } catch (error) {
    console.error('Assistant failed to schedule calendar event:', error);
    return {
      reply:
        'I tried to schedule that meeting but something went wrong. Please check the details and try again.',
      error: error.message
    };
  }
}

async function createTask({ userContext, args }) {
  const { title, notes, due } = args || {};
  if (!title || !title.trim()) {
    return {
      reply: 'I need a short title to create that reminder. Please provide one and try again.'
    };
  }

  try {
    const task = await createGoogleTask(
      {
        userId: userContext.userId,
        email: userContext.email,
        googleId: userContext.userId
      },
      {
        title,
        notes,
        due
      }
    );

    return {
      reply: `Got it — I created the task **${task.title}**${task.due ? ` due ${task.due}` : ''}.`,
      task,
      taskCreated: true
    };
  } catch (error) {
    console.error('Assistant failed to create task:', error);
    return {
      reply: 'I could not create that task. Please double-check the details and try again.',
      error: error.message
    };
  }
}

async function handleAssistantMessage({ user, message }) {
  if (!message || !message.trim()) {
    return { reply: 'Please tell me how I can help.' };
  }

  if (!openaiClient) {
    return {
      reply:
        'The assistant is not available right now because the OpenAI key is missing.'
    };
  }

  const userContext = {
    userId: user.userId,
    email: user.email,
    teamId: user.teamId || null
  };

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.trim() }
      ],
      tools: [calendarEventTool, createTaskTool],
      tool_choice: 'auto'
    });

    const choice = completion.choices?.[0];
    const assistantMessage = choice?.message;

    if (assistantMessage?.tool_calls?.length) {
      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: argsText } = toolCall.function || {};
        if (name === 'create_calendar_event') {
          let args = {};
          try {
            args = argsText ? JSON.parse(argsText) : {};
          } catch (parseError) {
            console.error('Assistant tool argument parse error:', parseError);
            return {
              reply:
                'I had trouble understanding some of the event details. Could you restate the date and time?'
            };
          }
          return await scheduleCalendarEvent({
            userContext,
            args
          });
        }

        if (name === 'create_task') {
          let args = {};
          try {
            args = argsText ? JSON.parse(argsText) : {};
          } catch (parseError) {
            console.error('Assistant task tool parse error:', parseError);
            return {
              reply:
                'I had trouble understanding the reminder details. Can you restate what you need me to remember?'
            };
          }
          return await createTask({
            userContext,
            args
          });
        }
      }
    }

    const content = assistantMessage?.content?.trim();
    if (content) {
      return { reply: content };
    }

    return {
      reply:
        'I’m not certain how to help with that yet. Try asking me to schedule a meeting or summarise an email.'
    };
  } catch (error) {
    console.error('Assistant OpenAI failure:', error);
    return {
      reply:
        'Something went wrong while thinking about that. Please try again in a moment.',
      error: error.message
    };
  }
}

module.exports = {
  handleAssistantMessage
};
