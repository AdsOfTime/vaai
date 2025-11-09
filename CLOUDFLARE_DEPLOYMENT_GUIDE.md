# 🚀 Cloudflare Deployment Guide for VAAI

## Current Status

✅ **Worker Backend**: Deployed at `https://vaai-backend-worker.dnash29.workers.dev`  
✅ **Frontend**: Deployed at `https://vaai-prod.pages.dev`  
⚠️ **Issue**: Frontend not connecting to worker properly

## What I Just Fixed

1. ✅ Updated frontend to call correct worker endpoints (`/auth/google` not `/api/auth/google`)
2. ✅ Added OAuth callback handling
3. ✅ Added authentication token storage
4. ✅ Created production environment config

## Deploy the Fixes

### Step 1: Rebuild and Deploy Frontend

```bash
cd frontend
npm run build
```

Then push to your git repository. Cloudflare Pages will auto-deploy.

**OR** manually deploy:
```bash
npx wrangler pages deploy dist --project-name=vaai-prod
```

### Step 2: Verify Worker Environment Variables

Make sure these are set in your Cloudflare Worker dashboard:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://vaai-backend-worker.dnash29.workers.dev/auth/google/callback
FRONTEND_REDIRECT_URI=https://vaai-prod.pages.dev/
JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=sk-your-openai-key (optional)
```

### Step 3: Update Google OAuth Settings

In Google Cloud Console:
1. Go to APIs & Services → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add these Authorized redirect URIs:
   - `https://vaai-backend-worker.dnash29.workers.dev/auth/google/callback`
   - `https://vaai-prod.pages.dev/`

### Step 4: Test the Deployment

1. Visit https://vaai-prod.pages.dev
2. Click "Continue with Google"
3. Complete OAuth flow
4. You should be logged in!

## What's Working in Your Worker

Your Cloudflare Worker already has these features:

✅ **Authentication**
- Google OAuth flow
- JWT token generation
- User management

✅ **Email Management**
- List emails
- Classify emails with AI
- Auto-sort inbox
- Apply labels

✅ **Calendar**
- List events
- Create events
- Update events
- Free/busy lookup

✅ **Tasks**
- List tasks
- Create tasks
- Update tasks
- Mark complete

✅ **AI Assistant**
- Chat with AI
- Schedule meetings via chat
- Create tasks via chat

✅ **Teams**
- Create teams
- Invite members
- Team management

✅ **Google Docs & Sheets**
- Create documents
- Create spreadsheets
- Append data

## What's NOT in the Worker (Yet)

The advanced AI features I just fixed are in the **Node.js backend**, not the worker:

❌ Smart email prioritization
❌ Meeting insights
❌ Predictive follow-ups
❌ Content generation
❌ Bulk operations
❌ Business analytics

## Two Deployment Options

### Option A: Use Worker Only (Current Setup)

**Pros:**
- Already deployed
- Serverless, scales automatically
- No server management
- Free tier available

**Cons:**
- Missing advanced AI features
- Limited to what's in worker code

**To use this:**
1. Deploy the frontend fixes I just made
2. Your app will work with basic features
3. Add advanced AI features to worker later

### Option B: Deploy Node.js Backend Too

**Pros:**
- Get ALL features including advanced AI
- Better for complex operations
- More control

**Cons:**
- Need to manage a server
- Additional hosting costs

**To use this:**
1. Deploy Node.js backend to:
   - Railway.app (easiest)
   - Render.com
   - DigitalOcean
   - AWS/GCP
2. Update frontend `VITE_API_BASE_URL` to point to Node backend
3. Get all advanced AI features

## Recommended: Hybrid Approach

Use both!

1. **Worker** for auth, basic email/calendar operations
2. **Node.js Backend** for advanced AI features

Update frontend to call different endpoints:
- Auth: Worker
- Basic operations: Worker  
- AI features: Node.js backend

## Quick Test Commands

### Test Worker Health
```bash
curl https://vaai-backend-worker.dnash29.workers.dev/health
```

### Test Auth Endpoint
```bash
curl https://vaai-backend-worker.dnash29.workers.dev/auth/google
```

### Test with Token
```bash
curl https://vaai-backend-worker.dnash29.workers.dev/api/emails \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### "Failed to get auth URL"
- Check worker is deployed: `wrangler deployments list`
- Check environment variables in Cloudflare dashboard
- Check CORS settings allow your frontend domain

### "Invalid token"
- JWT_SECRET must match between worker and what signed the token
- Token might be expired
- Check token is being sent in Authorization header

### "Google OAuth error"
- Verify redirect URIs in Google Console match exactly
- Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set
- Ensure all required scopes are enabled

### Frontend not loading
- Check Cloudflare Pages build logs
- Verify `dist` folder was created
- Check browser console for errors

## Next Steps

1. **Deploy frontend fixes** (push to git or manual deploy)
2. **Test the app** at https://vaai-prod.pages.dev
3. **Decide on AI features**:
   - Option A: Add to worker (more work)
   - Option B: Deploy Node.js backend (easier)

## Need Advanced AI Features?

If you want the advanced AI features I just fixed:

### Quick Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy backend
cd backend
railway init
railway up

# Get your URL
railway domain
```

Then update frontend:
```bash
# frontend/.env.production
VITE_API_BASE_URL=https://your-app.railway.app
```

## Support

**Worker Issues:**
- Check Cloudflare dashboard logs
- Use `wrangler tail` to see live logs

**Frontend Issues:**
- Check Cloudflare Pages build logs
- Check browser console

**Need help?** Let me know what error you're seeing!

---

**Your app is 95% ready!** Just need to deploy these frontend fixes and you're live! 🚀
