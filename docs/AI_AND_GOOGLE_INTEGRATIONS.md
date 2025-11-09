# AI & Google Workspace Integrations Guide

## Overview

VAAI now includes production-ready AI and Google Workspace integrations that provide premium features for email management, document creation, and data analysis.

## 🤖 AI Features

### Smart Email Prioritization

Automatically prioritize emails using AI analysis of content, sender patterns, and context.

**Endpoint:** `POST /api/advanced-ai/emails/smart-priority`

**Request:**
```json
{
  "emails": [
    {
      "id": "email_123",
      "subject": "Urgent: Project deadline",
      "from": "boss@company.com",
      "body": "We need to finish by tomorrow..."
    }
  ],
  "userContext": {
    "role": "Product Manager",
    "industry": "Technology",
    "priorityKeywords": "urgent, deadline, meeting"
  }
}
```

**Response:**
```json
{
  "emails": [
    {
      "id": "email_123",
      "subject": "Urgent: Project deadline",
      "aiPriority": {
        "priorityScore": 95,
        "reasoning": "Contains urgent keywords and deadline mention",
        "suggestedAction": "reply",
        "responseTime": "2 hours",
        "tags": ["urgent", "deadline"]
      }
    }
  ],
  "metadata": {
    "tier": "pro",
    "processed": 1,
    "responseTime": 1234
  }
}
```

**Subscription Requirements:**
- Basic: 10 emails/day
- Pro: Unlimited
- Enterprise: Unlimited with advanced analysis

### Meeting Insights

Generate intelligent meeting preparation materials with AI analysis.

**Endpoint:** `POST /api/advanced-ai/meetings/insights`

**Request:**
```json
{
  "meetingData": {
    "summary": "Q4 Planning Meeting",
    "start": "2025-11-15T14:00:00Z",
    "duration": "60 minutes",
    "attendees": [
      { "email": "john@company.com" },
      { "email": "sarah@company.com" }
    ],
    "description": "Quarterly planning and budget review"
  },
  "participantHistory": [
    {
      "email": "john@company.com",
      "recentInteractions": 5,
      "role": "VP Engineering"
    }
  ]
}
```

**Response:**
```json
{
  "insights": {
    "objectives": ["Review Q4 goals", "Allocate budget", "Set priorities"],
    "keyPoints": ["Engineering capacity", "Budget constraints", "Timeline"],
    "preparation": ["Review Q3 results", "Prepare budget proposal"],
    "successMetrics": ["Clear action items", "Budget approval"]
  },
  "metadata": {
    "tier": "pro",
    "responseTime": 2345
  }
}
```

**Subscription Requirements:**
- Pro or Enterprise only

### Predictive Follow-ups

AI-powered follow-up recommendations with optimal timing.

**Endpoint:** `POST /api/advanced-ai/followups/predictive`

**Request:**
```json
{
  "emailThread": [
    {
      "date": "2025-11-10T10:00:00Z",
      "from": "client@company.com",
      "subject": "Project proposal",
      "body": "We're interested in your proposal..."
    }
  ],
  "userBehavior": {
    "avgResponseTime": "4 hours",
    "communicationStyle": "Professional",
    "followUpFrequency": "Normal"
  }
}
```

**Response:**
```json
{
  "predictions": {
    "probability": 85,
    "timing": "2-3 days",
    "content": [
      "Brief check-in on proposal",
      "Detailed follow-up with additional info",
      "Creative approach with case study"
    ],
    "channel": "email",
    "successProbability": 75
  }
}
```

**Subscription Requirements:**
- Basic: 5/day
- Pro: 50/day
- Enterprise: Unlimited

### Content Generation

AI-powered content creation for emails, documents, and presentations.

**Endpoint:** `POST /api/advanced-ai/content/generate`

**Request:**
```json
{
  "contentType": "email",
  "context": {
    "purpose": "Follow-up after meeting",
    "recipient": "Client stakeholder",
    "tone": "Professional and friendly",
    "keyPoints": "Thank them, summarize decisions, next steps"
  }
}
```

**Response:**
```json
{
  "content": "Dear [Name],\n\nThank you for taking the time...",
  "metadata": {
    "model": "gpt-4",
    "tier": "pro",
    "contentType": "email",
    "tokens": 250,
    "generatedAt": "2025-11-10T15:30:00Z"
  }
}
```

**Subscription Requirements:**
- Pro: 25/day
- Enterprise: 100/day

### Bulk Email Operations

Process multiple emails simultaneously with AI categorization and prioritization.

**Endpoint:** `POST /api/advanced-ai/bulk/email-actions`

**Request:**
```json
{
  "emailIds": ["email_1", "email_2", "email_3"],
  "action": "categorize",
  "parameters": {
    "tier": "pro"
  }
}
```

**Response:**
```json
{
  "results": {
    "processed": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "id": "email_1",
        "category": "work",
        "priority": { "priorityScore": 75 },
        "tags": ["project", "deadline"]
      }
    ]
  },
  "metadata": {
    "tier": "pro",
    "processed": 3,
    "responseTime": 3456
  }
}
```

**Subscription Requirements:**
- Pro: 100 emails/batch
- Enterprise: 1000 emails/batch

## 📄 Google Docs Integration

### Create Document

Create a new Google Doc with optional AI enhancement.

**Endpoint:** `POST /api/google/docs`

**Request:**
```json
{
  "title": "Meeting Notes - Q4 Planning",
  "content": "Meeting attendees:\n- John Smith\n- Sarah Johnson\n\nKey decisions:\n...",
  "folderId": "folder_id_here",
  "aiEnhance": true,
  "contentType": "markdown"
}
```

**Response:**
```json
{
  "success": true,
  "document": {
    "documentId": "doc_123abc",
    "title": "Meeting Notes - Q4 Planning",
    "documentLink": "https://docs.google.com/document/d/doc_123abc/edit",
    "aiEnhanced": true
  }
}
```

### Append to Document

Add content to an existing document.

**Endpoint:** `POST /api/google/docs/:documentId/append`

**Request:**
```json
{
  "content": "\n\nAction Items:\n- Review budget proposal\n- Schedule follow-up",
  "aiEnhance": false
}
```

### Get Document

Retrieve document content.

**Endpoint:** `GET /api/google/docs/:documentId`

**Response:**
```json
{
  "success": true,
  "document": {
    "documentId": "doc_123abc",
    "title": "Meeting Notes",
    "content": "Full document text...",
    "documentLink": "https://docs.google.com/document/d/doc_123abc/edit"
  }
}
```

### Create from Template

Create a document from a template with variable replacement.

**Endpoint:** `POST /api/google/docs/from-template`

**Request:**
```json
{
  "templateId": "template_123",
  "title": "Client Proposal - Acme Corp",
  "replacements": {
    "{{CLIENT_NAME}}": "Acme Corporation",
    "{{PROJECT_NAME}}": "Website Redesign",
    "{{DATE}}": "November 10, 2025"
  },
  "folderId": "folder_id"
}
```

## 📊 Google Sheets Integration

### Create Spreadsheet

Create a new Google Sheet.

**Endpoint:** `POST /api/google/sheets`

**Request:**
```json
{
  "title": "Q4 Sales Data",
  "sheets": ["Sales", "Expenses", "Summary"],
  "folderId": "folder_id"
}
```

**Response:**
```json
{
  "success": true,
  "spreadsheet": {
    "spreadsheetId": "sheet_123abc",
    "title": "Q4 Sales Data",
    "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/sheet_123abc"
  }
}
```

### Append Rows

Add rows to a spreadsheet.

**Endpoint:** `POST /api/google/sheets/append`

**Request:**
```json
{
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!A1",
  "values": [
    ["Date", "Product", "Amount", "Customer"],
    ["2025-11-10", "Widget A", "$500", "Acme Corp"]
  ],
  "valueInputOption": "USER_ENTERED"
}
```

### Update Range

Update specific cells in a spreadsheet.

**Endpoint:** `PUT /api/google/sheets/update`

**Request:**
```json
{
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!B2:C2",
  "values": [
    ["Widget B", "$750"]
  ]
}
```

### Get Range

Retrieve data from a spreadsheet.

**Endpoint:** `GET /api/google/sheets/:spreadsheetId/range?range=Sales!A1:D10`

**Response:**
```json
{
  "success": true,
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!A1:D10",
  "values": [
    ["Date", "Product", "Amount", "Customer"],
    ["2025-11-10", "Widget A", "$500", "Acme Corp"]
  ]
}
```

### AI Data Analysis (Pro+)

Analyze spreadsheet data with AI.

**Endpoint:** `POST /api/google/sheets/analyze`

**Request:**
```json
{
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!A1:D100",
  "analysisType": "trends"
}
```

**Response:**
```json
{
  "success": true,
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!A1:D100",
  "analysisType": "trends",
  "analysis": "Sales show a 15% increase over the previous quarter. Widget A is the top performer with $45,000 in revenue. Notable trend: Enterprise customers increased by 25%...",
  "dataRows": 100
}
```

**Analysis Types:**
- `summary`: Concise overview of key insights
- `trends`: Identify patterns and anomalies
- `recommendations`: Actionable suggestions

### Chart Suggestions (Pro+)

Get AI-powered chart recommendations.

**Endpoint:** `POST /api/google/sheets/chart-suggestions`

**Request:**
```json
{
  "spreadsheetId": "sheet_123abc",
  "range": "Sales!A1:D100"
}
```

**Response:**
```json
{
  "success": true,
  "suggestions": [
    {
      "chartType": "line",
      "dataSeries": "Sales over time",
      "axisLabels": { "x": "Date", "y": "Amount" },
      "reasoning": "Line chart best shows sales trends over time"
    },
    {
      "chartType": "pie",
      "dataSeries": "Product distribution",
      "reasoning": "Pie chart effectively shows product mix"
    }
  ]
}
```

## 🔐 Authentication

All endpoints require authentication via JWT token:

```
Authorization: Bearer <your_jwt_token>
```

For team-scoped operations, also include:

```
X-Team-Id: <team_id>
```

## 💰 Subscription Tiers

### Basic (Free)
- Email classification
- Basic meeting prep
- Simple follow-ups
- Smart priority: 10/day
- No AI insights
- No content generation

### Pro ($29/month)
- All Basic features
- Unlimited smart priority
- AI meeting insights
- Predictive follow-ups: 50/day
- Content generation: 25/day
- Bulk operations: 100/batch
- Google Sheets AI analysis
- Priority support

### Enterprise ($99/month)
- All Pro features
- Unlimited predictive follow-ups
- Content generation: 100/day
- Bulk operations: 1000/batch
- Business analytics
- Custom AI models
- API access
- SSO integration
- Dedicated manager

## 🧪 Testing

Run the integration test suite:

```bash
cd backend
node test-ai-integrations.js
```

This will verify:
- Environment configuration
- AI service initialization
- Google service setup
- Database connectivity
- Route loading
- Middleware configuration

## 🚀 Getting Started

1. **Configure Environment Variables**

```bash
# Required
OPENAI_API_KEY=sk-your-key-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=your-secret-key-min-32-chars

# Optional
PORT=3001
NODE_ENV=development
DATABASE_URL=./vaai.db
```

2. **Initialize Database**

The subscription tables are automatically created on first run.

3. **Test the Setup**

```bash
npm run dev
node backend/test-ai-integrations.js
```

4. **Make Your First API Call**

```bash
curl -X POST http://localhost:3001/api/advanced-ai/emails/smart-priority \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [{
      "id": "1",
      "subject": "Test email",
      "from": "test@example.com",
      "body": "This is a test"
    }]
  }'
```

## 📚 Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google Docs API](https://developers.google.com/docs/api)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [VAAI Main README](../README.md)
- [Environment Setup Guide](./environment-setup.md)

## 🐛 Troubleshooting

### OpenAI Errors

**Issue:** "OpenAI API key not configured"
**Solution:** Set `OPENAI_API_KEY` in your `.env` file

**Issue:** Rate limit exceeded
**Solution:** Check your OpenAI usage dashboard and upgrade plan if needed

### Google API Errors

**Issue:** "Invalid authentication token"
**Solution:** User needs to re-authenticate via Google OAuth

**Issue:** "Insufficient permissions"
**Solution:** Verify all required scopes are enabled in Google Cloud Console

### Subscription Errors

**Issue:** "Subscription upgrade required"
**Solution:** User needs to upgrade their subscription tier

**Issue:** "Daily limit reached"
**Solution:** Wait for limit reset or upgrade subscription

## 💡 Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Rate Limiting**: Respect subscription tier limits
3. **Caching**: Cache AI responses when appropriate
4. **Logging**: Monitor AI usage and costs
5. **User Feedback**: Collect feedback on AI quality
6. **Fallbacks**: Provide non-AI alternatives when API is unavailable

## 🔄 Updates & Maintenance

- Monitor OpenAI model updates and deprecations
- Keep Google API client libraries up to date
- Review and optimize AI prompts regularly
- Track usage patterns and adjust limits
- Collect user feedback for improvements

---

**Need Help?** Open an issue on GitHub or contact support@vaai.com
