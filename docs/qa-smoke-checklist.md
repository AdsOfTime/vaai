# VAAI QA Smoke Checklist

The following scenarios cover the critical user journeys that must be exercised before a staging or production release. Each scenario lists the required preconditions, happy-path actions, and important edge cases to probe manually. Where automation exists, link the relevant script or test command; otherwise mark for exploratory coverage.

---

## 1. Google Authentication

- **Preconditions**
  - `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` valid in the target environment.
  - Browser profile with no cached VAAI tokens.
- **Happy Path**
  1. Open the dashboard and click **Sign in with Google**.
  2. Complete the OAuth consent flow.
  3. Confirm landing on the dashboard with the user avatar/email visible.
  4. Refresh the page; verify the session persists.
- **Edge Cases**
  - Invalid/expired code (inspect `/auth/google/callback` error).
  - Sign out -> sign back in.
  - Verify `vaai.db` has stored access + refresh tokens.

---

## 2. Meeting Prep Generation & Display

- **Preconditions**
  - At least one team with two active members who have completed OAuth.
  - Upcoming meetings on the Google Calendar within the configured look-ahead window (`MEETING_PREP_LOOKAHEAD_HOURS`).
- **Happy Path**
  1. Trigger the job (restart backend or wait for the scheduled interval).
  2. Validate new rows in `meeting_briefs` table.
  3. In the UI, select the team and confirm briefs surface with countdown, status, and attendees.
  4. Use the filter controls (Upcoming/Today/Needs review/Reviewed/All) and confirm the counts adjust.
- **Edge Cases**
  - Meetings without attendees (should still render with a generic placeholder).
  - Meetings past start time (countdown should show *In progress/Completed*).
  - Meeting with `status = reviewed` should no longer trigger the “needs review” alert.

---

## 3. In-App Meeting Detail Editing

- **Preconditions**
  - Existing meeting brief tied to a Google Calendar event.
  - Backend reachable on `PATCH /api/calendar/events/:eventId`.
- **Happy Path**
  1. Open **View Details** and click **Edit event**.
  2. Modify title, time, location, attendees, and notes; save.
  3. Confirm toast success, panel exits edit mode, and values refresh.
  4. Verify the same changes appear in Google Calendar.
- **Edge Cases**
  - Attempt save with empty title (client should prevent it).
  - Invalid datetime values (ensure backend rejects and user receives error toast).
  - Concurrent edit: make a change in Google Calendar, refresh VAAI and re-open panel.

---

## 4. Meeting Brief Actions

- **Preconditions**
  - List of generated briefs spanning multiple statuses.
- **Happy Path**
  1. Click **Open Brief** → modal should show summary/agenda/talking points/intel.
  2. Click **Mark Reviewed** and confirm status updates + list refresh.
- **Edge Cases**
  - Attempt to mark already reviewed brief (button disabled).
  - Brief lacking agenda/talking points/intel should show fallback text, not blank content.
  - Meeting with hangout link present: **Copy Meeting Link** should populate clipboard (check console via `navigator.clipboard.readText()`).

---

## 5. Calendar Widget & Availability

- **Preconditions**
  - Calendar API reachable; user token valid.
- **Happy Path**
  1. Load availability; confirm busy slots render.
  2. Schedule a new event; ensure success toast, event persists in Google Calendar, and meeting prep eventually picks it up.
- **Edge Cases**
  - Attempt overlapping event creation (Calendar should return an error).
  - Remove an event directly from Google Calendar; fetch events to confirm list updates.

---

## 6. Follow-Up Workflow Regression

- **Preconditions**
  - Seeded follow-up tasks with various statuses.
- **Happy Path**
  1. Review follow-up modal -> approve send -> ensure task updates to scheduled/sent.
  2. Use **Regenerate** and **Dismiss** actions; confirm toast messaging and task list updates.
- **Edge Cases**
  - Undo operation on auto-scheduled follow-ups.
  - Ensure meeting prep changes did not break follow-up background jobs (monitor logs after backend restart).

---

## 7. Google Tasks Reminders

- **Preconditions**
  - OAuth consent screen published with the `https://www.googleapis.com/auth/tasks` scope.
  - Google Tasks list contains at least one open item (or be ready to create one during the test).
- **Happy Path**
  1. Open the **Google Tasks** panel; confirm tasks load without errors.
  2. Toggle **Show completed** and verify finished items appear or disappear as expected.
  3. Add a reminder (title, optional notes, optional due date); confirm toast, list refresh, and the task appears in Google Tasks.
  4. Click **Mark Done** on an open task; ensure it moves to completed or disappears when completed tasks are hidden.
- **Edge Cases**
  - Submit the form without a title (client should block with validation messaging).
  - Simulate network/API failure (force offline or revoke token) and confirm error banner plus re-auth guidance.
  - Rapidly refresh the list to ensure no duplication or stale state.

---

## 8. Dashboard Integrity Checks

- Verify all top-level cards (Daily Briefing, Google Tasks, Follow-ups, Meeting Prep, Assistant Metrics) render without console errors.
- Inspect responsive behavior at common breakpoints (1440px, 1024px, 768px, 375px).
- Confirm toast notifications auto-dismiss unless marked persistent.

---

## Automation & Tooling Notes

- Current repository does not expose frontend/unit/integration tests; add Cypress or Playwright smoke suites as time allows.
- Consider scripting API smoke tests using Postman/Newman or k6 for `/auth`, `/api/meeting-briefs`, `/api/calendar/events`.
- Add logging hooks for meeting-prep background jobs—especially failures during OpenAI/Gmail/Calendar calls—to ease triage.

---

Maintain this checklist alongside product requirements; update it whenever new meeting-prep or Google Tasks capabilities land, or when OAuth scopes change.
