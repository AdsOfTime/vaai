# Meeting Prep System Overview

## Purpose
The meeting-prep subsystem keeps teammates ahead of their calendar by drafting actionable briefs for upcoming meetings. A background worker fetches each active teammate’s upcoming events, gathers recent email context, and uses OpenAI (when available) to assemble summaries, agendas, talking points, and intel. The results are stored in SQLite so the frontend can surface them inside the assistant workspace.

## Key Components
- **Background job scheduler** (`backend/src/index.js`): boots the app, initialises the database, and starts the periodic `runMeetingPrep()` worker alongside the follow-up jobs.
- **Meeting brief generator service** (`backend/src/services/meetingPrepGenerator.js`): orchestrates Google Calendar and Gmail access, prompts OpenAI, and upserts results.
- **Database access layer** (`backend/src/database/meetingBriefs.js`): reads/writes the `meeting_briefs` table and enforces the `(team_id, owner_user_id, calendar_event_id)` uniqueness constraint.
- **HTTP routes** (`backend/src/routes/meetingBriefs.js`): exposes `GET /api/meeting-briefs`, `GET /api/meeting-briefs/:id`, and `PATCH /api/meeting-briefs/:id` behind auth + team membership checks.
- **Frontend integration** (`frontend/src/App.jsx`): fetches briefs for the active team, renders a list + modal, and lets users mark briefs as reviewed.

## Data Flow
1. `startBackgroundJobs()` schedules `runMeetingPrep()` on boot (default every 60 minutes). Frequency is controlled via `MEETING_PREP_INTERVAL_MINUTES`.
2. For each team (`database/teams.js#getTeamMembers`), the generator pulls active members and their Google tokens (`database/users.js`).
3. For each user:
   - Calendar events are fetched from Google Calendar for the next `MEETING_PREP_LOOKAHEAD_HOURS` (default 48) and capped by `MEETING_PREP_MAX_EVENTS` (default 5).
   - Recent email thread context is collected via Gmail (latest message snippets with overlapping attendees).
   - OpenAI (`gpt-4o-mini`) is asked to produce structured brief content when `OPENAI_API_KEY` is configured; it falls back to stock copy otherwise.
4. Output is written through `upsertMeetingBrief()`, which preserves existing content when new data is unavailable.
5. The frontend calls `GET /api/meeting-briefs` with an `X-Team-Id` header and renders the summaries. Marking a brief as reviewed issues a `PATCH` to update the status/metadata.

## External Dependencies
- **Google OAuth scopes**: `calendar.events`, `calendar.readonly`, `userinfo.email`, `userinfo.profile`, `gmail.readonly`, `gmail.modify`, `gmail.send` (future send-on-behalf actions), and `https://www.googleapis.com/auth/tasks` (Google Tasks reminders). Tokens are stored via `database/users.storeUserTokens`.
- **OpenAI**: optional but recommended. Missing API keys still return usable briefs, but with generic copy.
- **SQLite**: default persistence (`DATABASE_URL` env var). Migration happens automatically on boot (`initDatabase()`).

## Environment Variables
| Variable | Purpose | Default |
| --- | --- | --- |
| `MEETING_PREP_INTERVAL_MINUTES` | Background worker cadence | `60` |
| `MEETING_PREP_LOOKAHEAD_HOURS` | Calendar window for upcoming meetings | `48` |
| `MEETING_PREP_MAX_EVENTS` | Max meetings per user per run | `5` |
| `FOLLOW_UP_DISCOVERY_INTERVAL_MINUTES` | (Related job) controls follow-up discovery cadence | `30` |
| `FOLLOW_UP_SCHEDULER_INTERVAL_MINUTES` | (Related job) controls follow-up execution cadence | `5` |
| `OPENAI_API_KEY` | Enables AI-authored briefs | _unset => static templates_ |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_REDIRECT_URI` | OAuth handshake |
| `JWT_SECRET` | Signs API tokens | — |

## Database Schema Highlights
`backend/src/database/init.js` seeds the `meeting_briefs` table with:
- `team_id`, `owner_user_id` foreign keys (team ownership + access control)
- `calendar_event_id`, `calendar_event_start` (Google event linkage)
- Text fields for `summary`, `agenda`, `talking_points`, `intel`
- JSON `metadata` (attendees, location, Meet link, etc.)
- Indexed uniqueness on `(team_id, owner_user_id, calendar_event_id)` to avoid dupes

## Access Control
- Endpoints require a `Bearer` JWT (issued during `/auth/google` flow) and an `X-Team-Id` header.
- `loadContext` in `routes/meetingBriefs.js` validates team membership (`status === 'active'`) before allowing reads or updates.
- The frontend reuses the same JWT + header conventions that other team-scoped endpoints use.

## Operational Checklist
1. **OAuth**: Verify Google Cloud Console credentials include every listed scope and that consent screen is published.
2. **Environment**: Ensure the backend has `OPENAI_API_KEY` (if AI output is desired) and that optional cadence env vars are tuned for staging/prod.
3. **Tokens**: Complete a Google login in each environment so access/refresh tokens are stored in SQLite for at least one user.
4. **Jobs running**: Confirm port 3001 backend stays alive; watch logs for `Meeting brief generation failed` messages.
5. **Frontend routing**: Check that `/api/meeting-briefs` requests carry `X-Team-Id` (see `getAuthHeaders()` in `App.jsx`).
6. **Permissions**: Verify teams exist and users are in an `active` membership state; otherwise the API returns 403s.

## Troubleshooting Tips
- **`Invalid authentication token`**: JWT missing/expired—prompt the user to re-login.
- **`User tokens not found`**: Google refresh tokens may be absent (user never completed OAuth) or revoked; prompt re-auth.
- **`Meeting brief generation failed` logs**: Inspect Google API quotas, OpenAI responses, or database connectivity.
- **No briefs after login**: Check `MEETING_PREP_LOOKAHEAD_HOURS` (events might be outside the window) and confirm the background job interval elapsed; you can also invoke `runMeetingPrep()` manually in a REPL.

## Next Improvements
- Better observability (structured logs, metrics per team).
- Slack/email nudges for new briefs.
- Fine-grained filters (mine vs. team) exposed in the frontend UI.
- Automated tests covering the new endpoints and the React meeting-prep widgets.
