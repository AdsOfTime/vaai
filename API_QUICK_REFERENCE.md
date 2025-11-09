# VAAI API Quick Reference

## 🔐 Authentication

All requests require JWT token:
```
Authorization: Bearer <token>
```

Get token via Google OAuth:
```
GET /auth/google
```

## 🤖 AI Features

### Smart Email Priority
```bash
POST /api/advanced-ai/emails/smart-priority
{
  "emails": [{ "id": "1", "subject": "...", "from": "...", "body": "..." }],
  "userContext": { "role": "...", "industry": "..." }
}
```
**Limits:** Basic: 10/day | Pro: Unlimited

### Meeting Insights
```bash
POST /api/advanced-ai/meetings/insights
{
  "meetingData": { "summary": "...", "start": "...", "attendees": [...] }
}
```
**Requires:** Pro or Enterprise

### Predictive Follow-ups
```bash
POST /api/advanced-ai/followups/predictive
{
  "emailThread": [...],
  "userBehavior": { "avgResponseTime": "...", "communicationStyle": "..." }
}
```
**Limits:** Basic: 5/day | Pro: 50/day | Enterprise: Unlimited

### Content Generation
```bash
POST /api/advanced-ai/content/generate
{
  "contentType": "email|document|presentation",
  "context": { "purpose": "...", "recipient": "...", "tone": "..." }
}
```
**Limits:** Pro: 25/day | Enterprise: 100/day

### Bulk Operations
```bash
POST /api/advanced-ai/bulk/email-actions
{
  "emailIds": ["1", "2", "3"],
  "action": "categorize|prioritize|tag",
  "parameters": { "tier": "pro" }
}
```
**Limits:** Pro: 100/batch | Enterprise: 1000/batch

## 📄 Google Docs

### Create Document
```bash
POST /api/google/docs
{
  "title": "Document Title",
  "content": "Document content...",
  "folderId": "optional_folder_id",
  "aiEnhance": true,
  "contentType": "plain|markdown"
}
```

### Get Document
```bash
GET /api/google/docs/:documentId
```

### Append Content
```bash
POST /api/google/docs/:documentId/append
{
  "content": "Additional content...",
  "aiEnhance": false
}
```

### From Template
```bash
POST /api/google/docs/from-template
{
  "templateId": "template_id",
  "title": "New Document",
  "replacements": { "{{VAR}}": "value" },
  "folderId": "optional"
}
```

## 📊 Google Sheets

### Create Spreadsheet
```bash
POST /api/google/sheets
{
  "title": "Spreadsheet Title",
  "sheets": ["Sheet1", "Sheet2"],
  "folderId": "optional"
}
```

### Append Rows
```bash
POST /api/google/sheets/append
{
  "spreadsheetId": "sheet_id",
  "range": "Sheet1!A1",
  "values": [["A1", "B1"], ["A2", "B2"]]
}
```

### Update Range
```bash
PUT /api/google/sheets/update
{
  "spreadsheetId": "sheet_id",
  "range": "Sheet1!A1:B2",
  "values": [["New", "Values"]]
}
```

### Get Range
```bash
GET /api/google/sheets/:spreadsheetId/range?range=Sheet1!A1:D10
```

### AI Analysis (Pro+)
```bash
POST /api/google/sheets/analyze
{
  "spreadsheetId": "sheet_id",
  "range": "Sheet1!A1:D100",
  "analysisType": "summary|trends|recommendations"
}
```

### Chart Suggestions (Pro+)
```bash
POST /api/google/sheets/chart-suggestions
{
  "spreadsheetId": "sheet_id",
  "range": "Sheet1!A1:D100"
}
```

## 📧 Email Management

### Classify Email
```bash
POST /api/emails/classify
{
  "subject": "Email subject",
  "from": "sender@example.com",
  "body": "Email content..."
}
```

### Smart Sort Inbox
```bash
POST /api/emails/sort
{
  "userId": "user_id"
}
```

### Get Daily Briefing
```bash
GET /api/briefing/daily
```

## 📅 Calendar

### Get Events
```bash
GET /api/calendar/events?timeMin=2025-11-10T00:00:00Z&timeMax=2025-11-17T23:59:59Z
```

### Create Event
```bash
POST /api/calendar/events
{
  "summary": "Meeting Title",
  "start": { "dateTime": "2025-11-15T14:00:00Z" },
  "end": { "dateTime": "2025-11-15T15:00:00Z" },
  "attendees": [{ "email": "attendee@example.com" }]
}
```

### Update Event
```bash
PATCH /api/calendar/events/:eventId
{
  "summary": "Updated Title",
  "start": { "dateTime": "..." }
}
```

## 📋 Tasks

### Get Tasks
```bash
GET /api/tasks
```

### Create Task
```bash
POST /api/tasks
{
  "title": "Task title",
  "notes": "Task details",
  "due": "2025-11-15T00:00:00Z"
}
```

### Complete Task
```bash
PATCH /api/tasks/:taskId
{
  "status": "completed"
}
```

## 👥 Teams

### Create Team
```bash
POST /api/teams
{
  "name": "Team Name"
}
```

### Invite Member
```bash
POST /api/teams/:teamId/invite
{
  "email": "member@example.com",
  "role": "member|admin"
}
```

### Get Team Members
```bash
GET /api/teams/:teamId/members
```

## 💰 Subscriptions

### Get Current Subscription
```bash
GET /api/monetization/subscription
```

### Get Available Tiers
```bash
GET /api/monetization/tiers
```

### Upgrade Subscription
```bash
POST /api/monetization/subscribe
{
  "tier": "pro|enterprise",
  "billingCycle": "monthly|annual",
  "paymentMethodId": "pm_xxx"
}
```

### Cancel Subscription
```bash
POST /api/monetization/cancel
{
  "cancelAtPeriodEnd": true
}
```

### Get Usage Analytics
```bash
GET /api/advanced-ai/usage/analytics?timeframe=7d
```

## 🔍 Meeting Briefs

### Get Meeting Briefs
```bash
GET /api/meeting-briefs
Headers: X-Team-Id: team_id
```

### Get Single Brief
```bash
GET /api/meeting-briefs/:id
Headers: X-Team-Id: team_id
```

### Update Brief Status
```bash
PATCH /api/meeting-briefs/:id
Headers: X-Team-Id: team_id
{
  "status": "reviewed"
}
```

## 🔄 Follow-ups

### Get Follow-up Tasks
```bash
GET /api/follow-ups
Headers: X-Team-Id: team_id
```

### Approve Follow-up
```bash
POST /api/follow-ups/:id/approve
Headers: X-Team-Id: team_id
```

### Regenerate Follow-up
```bash
POST /api/follow-ups/:id/regenerate
Headers: X-Team-Id: team_id
```

### Dismiss Follow-up
```bash
POST /api/follow-ups/:id/dismiss
Headers: X-Team-Id: team_id
```

## 🤖 AI Assistant

### Chat with Assistant
```bash
POST /api/assistant/chat
{
  "message": "Schedule a meeting with John tomorrow at 2pm",
  "context": { "emails": [...], "calendar": [...] }
}
```

## 🏥 Health Check

### Server Health
```bash
GET /health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2025-11-10T15:30:00Z",
  "environment": "production",
  "version": "2.7.0",
  "uptime": 86400
}
```

## 📊 Response Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions/subscription)
- `404` - Not Found
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## 🔑 Common Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-Team-Id: <team_id>
X-Request-ID: <optional_request_id>
```

## 💡 Tips

1. **Rate Limits**: Check subscription tier limits before bulk operations
2. **Caching**: Cache AI responses when appropriate
3. **Error Handling**: Always handle 429 (rate limit) and 403 (subscription) errors
4. **Pagination**: Use query params for large datasets
5. **Webhooks**: Subscribe to events for real-time updates (coming soon)

## 🔗 Full Documentation

- [AI & Google Integrations Guide](./docs/AI_AND_GOOGLE_INTEGRATIONS.md)
- [Environment Setup](./docs/environment-setup.md)
- [Main README](./README.md)

---

**Base URL (Development):** `http://localhost:3001`  
**Base URL (Production):** `https://api.yourdomain.com`
