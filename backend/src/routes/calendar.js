const express = require('express');
const { google } = require('googleapis');
const { verifyToken } = require('../middleware/auth');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');

const router = express.Router();

async function getCalendarClient(user) {
  const oauth2Client = await getAuthorizedGoogleClient(user);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

function getDefaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    return 'UTC';
  }
}

router.get('/events', verifyToken, async (req, res) => {
  try {
    const calendar = await getCalendarClient(req.user);

    const now = new Date();
    const maxDays = Number.parseInt(req.query.days, 10) || 7;
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: Number.parseInt(req.query.limit, 10) || 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = (response.data.items || []).map(event => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      attendees: event.attendees || [],
      hangoutLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null,
      htmlLink: event.htmlLink
    }));

    res.json({ events });
  } catch (error) {
    const statusCode = error.code || error.response?.status || 500;
    const reason =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;

    console.error('Failed to fetch calendar events:', reason);
    res.status(statusCode).json({
      error: 'Failed to fetch calendar events',
      message: reason
    });
  }
});

router.get('/availability', verifyToken, async (req, res) => {
  try {
    const calendar = await getCalendarClient(req.user);

    const days = Number.parseInt(req.query.days, 10) || 7;
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const timeZone = req.query.timeZone || getDefaultTimeZone();

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: 'primary' }]
      }
    });

    const busy = response.data.calendars?.primary?.busy || [];

    res.json({ busy, timeMin, timeMax, timeZone });
  } catch (error) {
    const statusCode = error.code || error.response?.status || 500;
    const reason =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;

    console.error('Failed to fetch calendar availability:', reason);
    res.status(statusCode).json({
      error: 'Failed to fetch availability',
      message: reason
    });
  }
});

router.post('/events', verifyToken, async (req, res) => {
  const { summary, description, start, end, attendees = [], location, createMeetLink, timeZone: suppliedTimeZone } = req.body;

  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
  }

  try {
    const calendar = await getCalendarClient(req.user);

    const timeZone = suppliedTimeZone || getDefaultTimeZone();

    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: start,
        timeZone
      },
      end: {
        dateTime: end,
        timeZone
      },
      attendees: attendees
        .filter(email => !!email)
        .map(email => ({ email }))
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: createMeetLink
        ? {
            ...event,
            conferenceData: {
              createRequest: {
                conferenceSolutionKey: { type: 'hangoutsMeet' },
                requestId: `vaai-${Date.now()}`
              }
            }
          }
        : event,
      ...(createMeetLink && { conferenceDataVersion: 1 })
    });

    res.status(201).json({
      event: {
        id: response.data.id,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end,
        attendees: response.data.attendees || [],
        hangoutLink: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri || null,
        htmlLink: response.data.htmlLink
      }
    });
  } catch (error) {
    const statusCode = error.code || error.response?.status || 500;
    const reason =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;

    console.error('Failed to create calendar event:', reason);
    res.status(statusCode).json({
      error: 'Failed to create calendar event',
      message: reason
    });
  }
});

router.patch('/events/:eventId', verifyToken, async (req, res) => {
  const { eventId } = req.params;

  if (!eventId) {
    return res.status(400).json({ error: 'Missing calendar event id' });
  }

  try {
    const calendar = await getCalendarClient(req.user);
    const {
      summary,
      description,
      start,
      end,
      location,
      attendees,
      timeZone: suppliedTimeZone
    } = req.body || {};

    const eventPatch = {};

    if (summary !== undefined) {
      eventPatch.summary = summary;
    }

    if (description !== undefined) {
      eventPatch.description = description;
    }

    if (location !== undefined) {
      eventPatch.location = location;
    }

    const timeZone = suppliedTimeZone || getDefaultTimeZone();

    if (start) {
      eventPatch.start = {
        dateTime: start,
        timeZone
      };
    }

    if (end) {
      eventPatch.end = {
        dateTime: end,
        timeZone
      };
    }

    if (Array.isArray(attendees)) {
      eventPatch.attendees = attendees
        .map(entry => {
          if (typeof entry === 'string') {
            const trimmed = entry.trim();
            return trimmed ? { email: trimmed } : null;
          }
          if (entry && typeof entry === 'object' && entry.email) {
            return { email: entry.email };
          }
          return null;
        })
        .filter(Boolean);
    }

    if (!Object.keys(eventPatch).length) {
      return res.status(400).json({ error: 'No event fields supplied for update' });
    }

    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: eventPatch
    });

    res.json({
      event: response.data
    });
  } catch (error) {
    const statusCode = error.code || error.response?.status || 500;
    const reason =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;

    console.error('Failed to update calendar event:', reason);
    res.status(statusCode).json({
      error: 'Failed to update calendar event',
      message: reason
    });
  }
});

router.post('/reminders/time-block', verifyToken, async (req, res) => {
  const {
    summary,
    start,
    durationMinutes = 30,
    description,
    attendees = [],
    reminders,
    timeZone: suppliedTimeZone,
    location
  } = req.body || {};

  if (!summary) {
    return res.status(400).json({ error: 'Reminder summary is required' });
  }

  const startDateTime = start ? new Date(start) : new Date();
  if (Number.isNaN(startDateTime.getTime())) {
    return res.status(400).json({ error: 'Invalid start datetime supplied' });
  }

  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
  const timeZone = suppliedTimeZone || getDefaultTimeZone();

  try {
    const calendar = await getCalendarClient(req.user);
    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone
      },
      attendees: (attendees || [])
        .map(email => (typeof email === 'string' ? email.trim() : null))
        .filter(Boolean)
        .map(email => ({ email }))
    };

    if (reminders && Array.isArray(reminders)) {
      event.reminders = {
        useDefault: false,
        overrides: reminders
          .map(item => {
            if (!item) return null;
            const minutes = Number.parseInt(item.minutes, 10);
            if (Number.isNaN(minutes)) return null;
            const method = item.method === 'email' ? 'email' : 'popup';
            return { method, minutes };
          })
          .filter(Boolean)
      };
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 0
    });

    res.status(201).json({
      reminder: {
        id: response.data.id,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end,
        htmlLink: response.data.htmlLink
      }
    });
  } catch (error) {
    const statusCode = error.code || error.response?.status || 500;
    const reason =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;

    console.error('Failed to create calendar reminder:', reason);
    res.status(statusCode).json({
      error: 'Failed to create calendar reminder',
      message: reason
    });
  }
});

module.exports = router;
