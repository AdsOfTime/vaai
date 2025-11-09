# 🚀 Deploy VAAI Backend to Render

## Quick Deploy (10 minutes)

### Step 1: Create Web Service

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `vaai-backend`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (or `Starter` for production)

### Step 2: Add Environment Variables

In the Render dashboard, add these environment variables:

```
NODE_ENV=production
PORT=3001
JWT_SECRET=your-32-char-secret-here
OPENAI_API_KEY=sk-your-openai-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://vaai-backend.onrender.com/auth/google/callback
FRONTEND_REDIRECT_URI=https://vaai-prod.pages.dev/
DATABASE_URL=./vaai.db
```

**Important:** Replace `vaai-backend` in the URLs with your actual Render service name.

### Step 3: Deploy

Click **"Create Web Service"** - Render will automatically deploy!

### Step 4: Update Frontend

Once deployed, get your Render URL (e.g., `https://vaai-backend.onrender.com`)

Update `frontend/.env.production`:
```env
VITE_API_BASE_URL=https://vaai-backend.onrender.com
```

Then rebuild and deploy frontend:
```bash
cd frontend
npm run build
git add .
git commit -m "Update API URL to Render backend"
git push
```

### Step 5: Update Google OAuth

Add your Render URL to Google Cloud Console:
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client ID
3. Add redirect URI: `https://vaai-backend.onrender.com/auth/google/callback`

## What You Get

With Render backend deployed, you'll have:

✅ **All Basic Features** (from worker)
- Email management
- Calendar operations
- Task management
- Teams

✅ **Advanced AI Features** (from Node.js backend)
- Smart email prioritization
- Meeting insights with AI
- Predictive follow-ups
- AI content generation
- Bulk email operations
- Business analytics
- AI-enhanced Google Docs
- AI-powered Sheets analysis

## Architecture

```
Frontend (Cloudflare Pages)
    ↓
Node.js Backend (Render) ← Your advanced AI features
    ↓
SQLite Database (on Render disk)
```

## Render Free Tier Limits

- ✅ 750 hours/month (enough for 1 service 24/7)
- ✅ Automatic SSL
- ✅ Automatic deploys from Git
- ⚠️ Spins down after 15 min inactivity (first request takes ~30s)
- ⚠️ 512 MB RAM

**For production:** Upgrade to Starter ($7/mo) for:
- No spin-down
- More RAM
- Better performance

## Upgrade to PostgreSQL (Optional)

For production with multiple users, upgrade from SQLite:

1. In Render dashboard: **New +** → **PostgreSQL**
2. Create database
3. Copy the **Internal Database URL**
4. Update environment variable:
   ```
   DATABASE_URL=postgresql://user:pass@host/db
   ```
5. Update backend code to use PostgreSQL (I can help with this)

## Testing Your Deployment

### Test Backend Health
```bash
curl https://vaai-backend.onrender.com/health
```

Should return:
```json
{
  "status": "OK",
  "timestamp": "2025-11-10T...",
  "environment": "production"
}
```

### Test AI Features
```bash
# Get auth token first by logging in, then:
curl -X POST https://vaai-backend.onrender.com/api/advanced-ai/emails/smart-priority \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emails":[{"id":"1","subject":"Test","from":"test@example.com","body":"Test email"}]}'
```

## Monitoring

Render provides:
- **Logs**: View in dashboard or use `render logs`
- **Metrics**: CPU, memory, request count
- **Alerts**: Set up email/Slack notifications

## Troubleshooting

### "Service failed to start"
- Check logs in Render dashboard
- Verify all environment variables are set
- Check `npm start` works locally

### "Database error"
- SQLite file permissions issue
- Consider upgrading to PostgreSQL
- Check DATABASE_URL path

### "OpenAI API error"
- Verify OPENAI_API_KEY is set correctly
- Check OpenAI account has credits
- Review API usage limits

### "Slow first request"
- Normal on free tier (cold start)
- Upgrade to Starter plan to eliminate
- Or keep worker for fast responses

## Hybrid Architecture (Recommended)

Use both Cloudflare Worker AND Render backend:

**Cloudflare Worker** (fast, always on):
- Authentication
- Basic email/calendar operations
- Quick responses

**Render Backend** (powerful, AI features):
- Advanced AI prioritization
- Meeting insights
- Content generation
- Analytics

Update frontend to route requests:
```javascript
// Fast operations → Worker
const WORKER_URL = 'https://vaai-backend-worker.dnash29.workers.dev';

// AI operations → Render
const AI_URL = 'https://vaai-backend.onrender.com';
```

## Cost Comparison

### Free Tier
- Cloudflare Worker: Free (100k requests/day)
- Cloudflare Pages: Free
- Render: Free (with spin-down)
- **Total: $0/month**

### Production
- Cloudflare Worker: $5/month (10M requests)
- Cloudflare Pages: Free
- Render Starter: $7/month
- **Total: $12/month**

### With Database
- Add Render PostgreSQL: $7/month
- **Total: $19/month**

## Next Steps

1. **Deploy to Render** (follow steps above)
2. **Test the backend** (health check + AI endpoints)
3. **Update frontend** (point to Render URL)
4. **Deploy frontend** (push to git)
5. **Test full app** (login + AI features)

## Need Help?

Common issues:
- **Build fails**: Check `package.json` scripts
- **Start fails**: Verify `npm start` works locally
- **Env vars**: Double-check all are set in Render
- **Database**: Consider PostgreSQL for production

---

**You're almost there!** Deploy to Render and you'll have all the AI features working! 🚀
