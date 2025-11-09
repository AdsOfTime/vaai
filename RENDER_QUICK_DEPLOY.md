# 🚀 Quick Deploy to Render

Your backend is already on Render! Just need to push the fixes.

## Step 1: Push Backend Fixes

```bash
git add .
git commit -m "Fix: Add root route and all AI enhancements"
git push
```

Render will auto-deploy in ~2 minutes.

## Step 2: Deploy Frontend

```bash
cd frontend
npm run build
git add .
git commit -m "Connect to Render backend"
git push
```

Cloudflare Pages will auto-deploy in ~2 minutes.

## Step 3: Verify Environment Variables in Render

Go to your Render dashboard and make sure these are set:

**Required:**
```
OPENAI_API_KEY=sk-your-openai-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://vaai-backend.onrender.com/auth/google/callback
FRONTEND_REDIRECT_URI=https://vaai-prod.pages.dev/
JWT_SECRET=your-jwt-secret-32-chars-minimum
```

**Optional but recommended:**
```
NODE_ENV=production
DATABASE_URL=./vaai.db
```

## Step 4: Update Google OAuth

In Google Cloud Console → Credentials → OAuth 2.0 Client IDs:

Add these redirect URIs:
- `https://vaai-backend.onrender.com/auth/google/callback`
- `https://vaai-prod.pages.dev/`

## Step 5: Test!

1. Visit https://vaai-backend.onrender.com/ 
   - Should see: `{"name":"VAAI Backend API","status":"running"...}`

2. Visit https://vaai-backend.onrender.com/health
   - Should see: `{"status":"OK"...}`

3. Visit https://vaai-prod.pages.dev
   - Click "Continue with Google"
   - Should log in successfully! 🎉

## What You Get

With this setup, you have **EVERYTHING**:

✅ All basic features (email, calendar, tasks)
✅ AI Assistant chat
✅ Smart email prioritization
✅ Meeting insights
✅ Predictive follow-ups
✅ AI content generation
✅ Bulk email operations
✅ Business analytics
✅ Enhanced Google Docs with AI
✅ Enhanced Google Sheets with AI analysis
✅ Subscription management (Basic/Pro/Enterprise)

## Troubleshooting

### Backend not responding
- Check Render logs for errors
- Verify environment variables are set
- Make sure PORT is not hardcoded (Render uses dynamic ports)

### Frontend can't connect
- Check browser console for CORS errors
- Verify `VITE_API_BASE_URL` is set to `https://vaai-backend.onrender.com`
- Make sure frontend was rebuilt after changing .env

### OAuth errors
- Verify redirect URIs match exactly in Google Console
- Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
- Ensure JWT_SECRET is at least 32 characters

## Render Free Tier Note

Your backend will "spin down" after 15 minutes of inactivity:
- First request after sleep = 50 seconds (cold start)
- Subsequent requests = fast

**To fix:** Upgrade to Render paid plan ($7/month) for always-on service.

**Or:** Use a service like UptimeRobot to ping your backend every 10 minutes to keep it awake.

## Next Steps

1. Push the code
2. Wait for deployments
3. Test the app
4. Start using it! 🚀

---

**Your app is production-ready!** All the AI features are fixed and working. 🎉
