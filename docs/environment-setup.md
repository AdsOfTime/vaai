# Environment Configuration Guide

This guide provides detailed instructions for configuring all environment variables and external services required by VAAI.

## 📋 Environment Files Overview

VAAI uses multiple environment files across different components:

- `backend/.env` - Backend Node.js server configuration
- `frontend/.env` - Frontend React application configuration (optional)
- `worker/wrangler.toml` - Cloudflare Worker configuration
- Cloudflare Dashboard - Worker environment variables

## 🔧 Backend Configuration (`backend/.env`)

### Required Variables

#### Server Configuration
```env
PORT=3001                    # Backend server port
NODE_ENV=development         # Environment: development|production|test
JWT_SECRET=your-jwt-secret   # Strong random string for JWT signing (min 32 chars)
```

#### Google OAuth Configuration
```env
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
FRONTEND_REDIRECT_URI=http://localhost:3002/
```

#### OpenAI Configuration
```env
OPENAI_API_KEY=sk-your-openai-api-key
```

#### Database Configuration
```env
DATABASE_URL=./vaai.db       # SQLite database path
```

### Optional Variables

#### Background Job Configuration
```env
# Follow-up discovery interval (default: 30 minutes)
FOLLOW_UP_DISCOVERY_INTERVAL_MINUTES=30

# Follow-up scheduler interval (default: 5 minutes)
FOLLOW_UP_SCHEDULER_INTERVAL_MINUTES=5

# Meeting prep generation interval (default: 60 minutes)
MEETING_PREP_INTERVAL_MINUTES=60

# Meeting prep lookahead window (default: 168 hours = 1 week)
MEETING_PREP_LOOKAHEAD_HOURS=168
```

#### CORS Configuration
```env
# Allowed origins for CORS (comma-separated for multiple)
CORS_ORIGINS=http://localhost:3002,https://your-domain.com
```

## 🎨 Frontend Configuration (`frontend/.env`)

All frontend environment variables are optional but provide enhanced functionality:

### API Configuration
```env
# Backend API base URL (auto-detected if not set)
VITE_API_BASE_URL=http://localhost:3001
```

### Google Drive Integration
```env
# Default folder ID for created documents
VITE_DEFAULT_DOCS_FOLDER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms

# Folder ID containing document templates
VITE_DEFAULT_DOC_TEMPLATE_FOLDER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms

# Default folder ID for spreadsheet operations
VITE_DEFAULT_SHEETS_FOLDER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
```

### Content Configuration
```env
# Default format for document creation: markdown|html|plain
VITE_DEFAULT_DOC_CONTENT_FORMAT=markdown
```

### Feature Flags
```env
# Enable worker-based briefings (true|false)
VITE_ENABLE_WORKER_BRIEFINGS=true
```

## ☁️ Cloudflare Worker Configuration

### `wrangler.toml` Configuration
```toml
name = "vaai-backend-worker"
main = "src/index.ts"
compatibility_date = "2024-10-30"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "vaai-db"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "OAUTH_STATE"
id = "your-kv-namespace-id"
```

### Cloudflare Dashboard Environment Variables

Set these in your Cloudflare Worker dashboard:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-worker.your-subdomain.workers.dev/auth/google/callback
OPENAI_API_KEY=sk-your-openai-api-key
JWT_SECRET=your-jwt-secret-same-as-backend
```

## 🔐 Setting Up External Services

### 1. Google Cloud Console Setup

#### Create Project and Enable APIs
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the following APIs:
   - Gmail API
   - Google Calendar API
   - Google Tasks API
   - Google Drive API
   - Google Docs API
   - Google Sheets API

#### OAuth 2.0 Configuration
1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth 2.0 Client IDs**
3. Choose **Web application**
4. Add authorized redirect URIs:
   - `http://localhost:3001/auth/google/callback` (development)
   - `https://your-domain.com/auth/google/callback` (production)
   - `https://your-worker.your-subdomain.workers.dev/auth/google/callback` (worker)

#### OAuth Consent Screen
1. Configure OAuth consent screen
2. Add required scopes:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/tasks
   https://www.googleapis.com/auth/drive.file
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/spreadsheets
   ```
3. Publish the consent screen (required for production)

### 2. OpenAI API Setup

1. Create account at [OpenAI Platform](https://platform.openai.com/)
2. Generate API key from **API Keys** section
3. Set up billing (required for API usage)
4. Monitor usage in **Usage** dashboard

### 3. Cloudflare Setup

#### Create D1 Database
```bash
wrangler d1 create vaai-db
```

#### Create KV Namespace
```bash
wrangler kv:namespace create "OAUTH_STATE"
```

#### Deploy Database Schema
```bash
wrangler d1 execute vaai-db --file=./worker/schema.sql
```

## 🔒 Security Considerations

### JWT Secret Generation
```bash
# Generate secure random string (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment Variable Security
- Never commit `.env` files to version control
- Use different secrets for development/staging/production
- Rotate secrets regularly
- Use environment-specific configurations

### OAuth Security
- Verify redirect URIs exactly match your domains
- Use HTTPS in production
- Regularly review OAuth consent screen settings
- Monitor API usage for anomalies

## 🌍 Environment-Specific Configurations

### Development
```env
NODE_ENV=development
CORS_ORIGINS=http://localhost:3002
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
FRONTEND_REDIRECT_URI=http://localhost:3002/
```

### Production
```env
NODE_ENV=production
CORS_ORIGINS=https://your-domain.com
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback
FRONTEND_REDIRECT_URI=https://your-domain.com/
```

### Worker Production
```env
GOOGLE_REDIRECT_URI=https://your-worker.your-subdomain.workers.dev/auth/google/callback
```

## 🧪 Testing Configuration

### Backend Testing
```env
NODE_ENV=test
DATABASE_URL=./test.db
JWT_SECRET=test-jwt-secret
# Use test Google project or mock APIs
GOOGLE_CLIENT_ID=test-client-id
```

### Test Script Verification
```bash
# Verify backend configuration
node test-setup.js

# Test specific endpoints
curl http://localhost:3001/health
curl http://localhost:3001/auth/google
```

## 🚨 Troubleshooting

### Common Configuration Issues

#### OAuth Errors
- **Redirect URI mismatch**: Ensure URIs match exactly in Google Console
- **Invalid client**: Verify client ID and secret
- **Scope issues**: Check all required scopes are enabled

#### API Errors
- **Rate limiting**: Check Google API quotas
- **OpenAI limits**: Verify billing and usage limits
- **CORS issues**: Ensure frontend origin is allowed

#### Database Issues
- **Permission denied**: Check file system permissions
- **Connection errors**: Verify DATABASE_URL path
- **Schema errors**: Ensure database is initialized

### Environment Debugging
```bash
# Check environment variables are loaded
node -e "require('dotenv').config(); console.log(process.env)"

# Test database connection
node -e "const db = require('./src/database/init'); db.testConnection()"
```

## 📚 Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Environment Variables Best Practices](https://12factor.net/config)

---

For additional support, consult the main README.md or create an issue in the project repository.