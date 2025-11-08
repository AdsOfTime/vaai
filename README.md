# VAAI - Virtual Assistant AI

A sophisticated email management and virtual assistant platform that leverages AI to automate email sorting, meeting preparation, follow-ups, and team collaboration.

## 🚀 Features

- **AI-Powered Email Classification**: Automatically categorize emails using OpenAI
- **Smart Meeting Preparation**: Generate meeting briefs with agenda and talking points
- **Automated Follow-ups**: AI-generated follow-up emails with customizable timing
- **Team Collaboration**: Multi-user team management with role-based access
- **Google Workspace Integration**: Gmail, Calendar, Tasks, Docs, and Sheets
- **Automation Shortcuts**: Pre-built workflows for common business tasks
- **Real-time Assistant**: Interactive AI assistant for scheduling and task management

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │ Cloudflare      │
│   (React/Vite)  │◄──►│   (Node.js)     │◄──►│ Worker          │
│   Port: 3002    │    │   Port: 3001    │    │ (TypeScript)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────►│   SQLite DB     │◄─────────────┘
                        │   (Development) │
                        └─────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **React** 18.x with Hooks
- **Vite** for development and building
- **Axios** for API communication
- **CSS** for styling

### Backend
- **Node.js** with Express
- **SQLite** database with custom ORM
- **Google APIs** (Gmail, Calendar, Tasks, Docs, Sheets)
- **OpenAI API** for AI features
- **JWT** authentication
- **bcryptjs** for password hashing

### Worker (Cloudflare)
- **TypeScript** with Hono framework
- **D1 Database** (Cloudflare's SQLite)
- **KV Storage** for OAuth state management
- **Google OAuth** integration

## 📋 Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Google Cloud Console** project with APIs enabled
- **OpenAI API** account and key
- **Cloudflare** account (for worker deployment)

### Required Google APIs
Enable these APIs in your Google Cloud Console:
- Gmail API
- Google Calendar API
- Google Tasks API
- Google Drive API
- Google Docs API
- Google Sheets API

## ⚡ Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/vaai.git
cd vaai
npm run install:all
```

### 2. Backend Configuration

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your credentials:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-here

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
FRONTEND_REDIRECT_URI=http://localhost:3002/

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# Database Configuration
DATABASE_URL=./vaai.db

# Background Job Intervals (optional)
FOLLOW_UP_DISCOVERY_INTERVAL_MINUTES=30
FOLLOW_UP_SCHEDULER_INTERVAL_MINUTES=5
MEETING_PREP_INTERVAL_MINUTES=60
MEETING_PREP_LOOKAHEAD_HOURS=168
```

### 3. Frontend Configuration (Optional)

Create `frontend/.env` for custom configuration:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001

# Google Drive Folder IDs (optional)
VITE_DEFAULT_DOCS_FOLDER_ID=your-docs-folder-id
VITE_DEFAULT_DOC_TEMPLATE_FOLDER_ID=your-templates-folder-id
VITE_DEFAULT_SHEETS_FOLDER_ID=your-sheets-folder-id

# Content Format
VITE_DEFAULT_DOC_CONTENT_FORMAT=markdown

# Worker Features
VITE_ENABLE_WORKER_BRIEFINGS=true
```

### 4. Run Development Servers

```bash
# Run both frontend and backend
npm run dev

# Or run separately
npm run dev:backend  # Backend on port 3001
npm run dev:frontend # Frontend on port 3002
```

### 5. Initial Setup

1. Open `http://localhost:3002`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Create your first team
5. Start managing emails and meetings!

## 🧪 Testing

Run the setup verification script:

```bash
node test-setup.js
```

Follow the comprehensive QA checklist in `docs/qa-smoke-checklist.md` for manual testing.

## 📚 Usage Guide

### Email Management
1. **Connect Gmail**: Sign in with Google to authorize access
2. **Auto-Sort**: Use "Smart Sort Inbox" to automatically categorize emails
3. **Daily Briefing**: Review AI-generated summaries and suggested actions

### Meeting Preparation
1. **Auto-Generation**: Meetings are automatically detected from Calendar
2. **Brief Review**: Access meeting briefs with agenda and talking points
3. **Quick Actions**: Mark as reviewed, copy meeting links, edit details

### Follow-up Management
1. **Detection**: AI automatically identifies emails needing follow-ups
2. **Draft Review**: Approve or edit AI-generated follow-up emails
3. **Scheduling**: Set custom send times or snooze for later

### Team Collaboration
1. **Create Teams**: Set up teams for collaborative email management
2. **Invite Members**: Send email invitations with role assignments
3. **Shared Context**: All team members see shared briefings and follow-ups

## 🚀 Deployment

### Cloudflare Worker Deployment

```bash
cd worker
npm run deploy
```

Configure environment variables in Cloudflare dashboard:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY`
- `JWT_SECRET`

### Production Backend

For production deployment, consider:
- PostgreSQL or MySQL instead of SQLite
- Environment-specific configuration
- Process managers (PM2, systemd)
- Load balancing and scaling
- Monitoring and logging solutions

## 📁 Project Structure

```
vaai/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── database/       # Database models and queries
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic services
│   │   ├── middleware/     # Express middleware
│   │   └── utils/          # Utility functions
│   └── scripts/            # Utility scripts
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # React components (to be organized)
│   │   └── App.jsx         # Main application component
│   └── public/             # Static assets
├── worker/                 # Cloudflare Worker (TypeScript)
│   └── src/
│       ├── index.ts        # Main worker entry point
│       └── google.ts       # Google API integrations
└── docs/                   # Documentation
    ├── meeting-prep-overview.md
    └── qa-smoke-checklist.md
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Backend server port | `3001` |
| `NODE_ENV` | No | Environment mode | `development` |
| `JWT_SECRET` | Yes | JWT signing secret | - |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret | - |
| `OPENAI_API_KEY` | Yes | OpenAI API key | - |
| `DATABASE_URL` | No | Database file path | `./vaai.db` |

### Background Jobs

The system runs several background jobs:

- **Follow-up Discovery**: Scans emails for follow-up opportunities (30min intervals)
- **Follow-up Scheduler**: Processes due follow-ups (5min intervals)
- **Meeting Prep**: Generates meeting briefs (60min intervals)

## 🐛 Troubleshooting

### Common Issues

1. **OAuth Errors**
   - Verify Google Cloud Console configuration
   - Check redirect URI matches exactly
   - Ensure all required APIs are enabled

2. **Database Issues**
   - Check file permissions for SQLite
   - Verify `DATABASE_URL` path exists
   - Run `rm vaai.db` to reset database

3. **API Rate Limits**
   - Monitor Google API quotas
   - Check OpenAI usage limits
   - Review rate limiting settings

4. **Worker Deployment**
   - Verify Cloudflare account setup
   - Check environment variables in dashboard
   - Review D1 database configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Google Cloud Console](https://console.cloud.google.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Cloudflare Workers](https://workers.cloudflare.com/)

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review `docs/qa-smoke-checklist.md`
3. Open an issue on GitHub
4. Contact the development team

---

Built with ❤️ by the VAAI Team