#!/bin/bash

echo "🚀 Deploying VAAI Frontend Fixes..."
echo ""

cd frontend

echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"
echo ""
echo "📤 Committing changes..."

cd ..
git add .
git commit -m "Fix: Update frontend to work with Cloudflare Worker API"

echo ""
echo "🚢 Pushing to repository..."
git push

echo ""
echo "✅ Done! Cloudflare Pages will auto-deploy in ~2 minutes."
echo ""
echo "🔗 Check your deployment at: https://vaai-prod.pages.dev"
echo ""
echo "📋 Next steps:"
echo "1. Wait 2 minutes for Cloudflare Pages to deploy"
echo "2. Visit https://vaai-prod.pages.dev"
echo "3. Click 'Continue with Google'"
echo "4. You should be able to log in! 🎉"
echo ""
