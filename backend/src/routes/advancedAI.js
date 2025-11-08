const express = require('express');
const { asyncHandler, validateRequired } = require('../utils/errorHandler');
const { logApiCall, createTimer } = require('../utils/logger');
const advancedAI = require('../services/advancedAI');
const { requireAuth, requireSubscription } = require('../middleware/auth');
const { getUserSubscription, recordUsage } = require('../database/subscriptions');

const router = express.Router();

// Smart Email Prioritization (Basic: 10/day, Pro: unlimited)
router.post('/emails/smart-priority', requireAuth, asyncHandler(async (req, res) => {
  const timer = createTimer('smart-email-priority');
  const { emails, userContext } = req.body;
  
  validateRequired(emails, 'emails');
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  // Check usage limits for basic tier
  if (subscription.tier === 'basic') {
    const todayUsage = await getFeatureUsage(user.id, 'smart-priority', 'today');
    if (todayUsage >= 10) {
      return res.status(429).json({
        error: 'Daily limit reached',
        message: 'Upgrade to Pro for unlimited smart prioritization',
        upgradeUrl: '/pricing'
      });
    }
  }
  
  logApiCall(req, 'smart-email-priority', { 
    emailCount: emails.length, 
    tier: subscription.tier 
  });
  
  const prioritizedEmails = await advancedAI.generateSmartEmailPriority(
    emails, 
    userContext, 
    subscription.tier
  );
  
  await recordUsage(user.id, 'smart-priority', emails.length);
  
  const responseTime = timer.end(true);
  
  res.json({
    emails: prioritizedEmails,
    metadata: {
      tier: subscription.tier,
      processed: emails.length,
      responseTime,
      usageRemaining: subscription.tier === 'basic' ? Math.max(0, 10 - todayUsage - 1) : 'unlimited'
    }
  });
}));

// Advanced Meeting Insights (Pro+ only)
router.post('/meetings/insights', requireAuth, requireSubscription(['pro', 'enterprise']), asyncHandler(async (req, res) => {
  const timer = createTimer('meeting-insights');
  const { meetingData, participantHistory } = req.body;
  
  validateRequired(meetingData, 'meetingData');
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  logApiCall(req, 'meeting-insights', { 
    meetingId: meetingData.id,
    tier: subscription.tier 
  });
  
  const insights = await advancedAI.generateMeetingInsights(
    meetingData,
    participantHistory,
    subscription.tier
  );
  
  await recordUsage(user.id, 'meeting-insights', 1);
  
  const responseTime = timer.end(true);
  
  res.json({
    insights,
    metadata: {
      tier: subscription.tier,
      responseTime,
      generatedAt: new Date().toISOString()
    }
  });
}));

// Predictive Follow-ups (Basic: 5/day, Pro: 50/day, Enterprise: unlimited)
router.post('/followups/predictive', requireAuth, asyncHandler(async (req, res) => {
  const timer = createTimer('predictive-followups');
  const { emailThread, userBehavior } = req.body;
  
  validateRequired(emailThread, 'emailThread');
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  // Check usage limits
  const limits = { basic: 5, pro: 50, enterprise: Infinity };
  const todayUsage = await getFeatureUsage(user.id, 'predictive-followups', 'today');
  
  if (todayUsage >= limits[subscription.tier]) {
    return res.status(429).json({
      error: 'Daily limit reached',
      message: `Upgrade for more predictive follow-ups`,
      currentTier: subscription.tier,
      upgradeUrl: '/pricing'
    });
  }
  
  logApiCall(req, 'predictive-followups', { 
    threadLength: emailThread.length,
    tier: subscription.tier 
  });
  
  const predictions = await advancedAI.generatePredictiveFollowUps(
    emailThread,
    userBehavior,
    subscription.tier
  );
  
  await recordUsage(user.id, 'predictive-followups', 1);
  
  const responseTime = timer.end(true);
  
  res.json({
    predictions,
    metadata: {
      tier: subscription.tier,
      responseTime,
      usageRemaining: limits[subscription.tier] - todayUsage - 1
    }
  });
}));

// Intelligent Content Generation (Pro+ only, with usage limits)
router.post('/content/generate', requireAuth, requireSubscription(['pro', 'enterprise']), asyncHandler(async (req, res) => {
  const timer = createTimer('content-generation');
  const { contentType, context } = req.body;
  
  validateRequired(contentType, 'contentType');
  validateRequired(context, 'context');
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  // Usage limits: Pro: 25/day, Enterprise: 100/day
  const limits = { pro: 25, enterprise: 100 };
  const todayUsage = await getFeatureUsage(user.id, 'content-generation', 'today');
  
  if (todayUsage >= limits[subscription.tier]) {
    return res.status(429).json({
      error: 'Daily generation limit reached',
      message: subscription.tier === 'pro' ? 'Upgrade to Enterprise for higher limits' : 'Daily limit reached',
      upgradeUrl: '/pricing'
    });
  }
  
  logApiCall(req, 'content-generation', { 
    contentType,
    tier: subscription.tier 
  });
  
  const generatedContent = await advancedAI.generateIntelligentContent(
    contentType,
    context,
    subscription.tier
  );
  
  await recordUsage(user.id, 'content-generation', 1);
  
  const responseTime = timer.end(true);
  
  res.json({
    ...generatedContent,
    metadata: {
      ...generatedContent.metadata,
      responseTime,
      usageRemaining: limits[subscription.tier] - todayUsage - 1
    }
  });
}));

// Business Analytics (Enterprise only)
router.get('/analytics/business', requireAuth, requireSubscription(['enterprise']), asyncHandler(async (req, res) => {
  const timer = createTimer('business-analytics');
  const { timeframe = '30d' } = req.query;
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  logApiCall(req, 'business-analytics', { 
    timeframe,
    tier: subscription.tier 
  });
  
  // Fetch user's business data
  const businessData = await getBusinessMetrics(user.id, timeframe);
  
  const analytics = await advancedAI.analyzeBusinessMetrics(
    businessData,
    timeframe,
    subscription.tier
  );
  
  await recordUsage(user.id, 'business-analytics', 1);
  
  const responseTime = timer.end(true);
  
  res.json({
    analytics,
    rawData: businessData,
    metadata: {
      tier: subscription.tier,
      timeframe,
      responseTime,
      generatedAt: new Date().toISOString()
    }
  });
}));

// Bulk Operations (Pro+ only)
router.post('/bulk/email-actions', requireAuth, requireSubscription(['pro', 'enterprise']), asyncHandler(async (req, res) => {
  const timer = createTimer('bulk-operations');
  const { emailIds, action, parameters } = req.body;
  
  validateRequired(emailIds, 'emailIds');
  validateRequired(action, 'action');
  
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  
  // Limits: Pro: 100 emails/batch, Enterprise: 1000 emails/batch
  const limits = { pro: 100, enterprise: 1000 };
  
  if (emailIds.length > limits[subscription.tier]) {
    return res.status(400).json({
      error: 'Batch size limit exceeded',
      limit: limits[subscription.tier],
      requested: emailIds.length
    });
  }
  
  logApiCall(req, 'bulk-operations', { 
    action,
    emailCount: emailIds.length,
    tier: subscription.tier 
  });
  
  const results = await processBulkEmailAction(emailIds, action, parameters, user.id);
  
  await recordUsage(user.id, 'bulk-operations', emailIds.length);
  
  const responseTime = timer.end(true);
  
  res.json({
    results,
    metadata: {
      tier: subscription.tier,
      processed: emailIds.length,
      responseTime,
      action
    }
  });
}));

// AI Model Customization (Enterprise only)
router.post('/ai/custom-model', requireAuth, requireSubscription(['enterprise']), asyncHandler(async (req, res) => {
  const timer = createTimer('custom-model');
  const { modelType, trainingData, parameters } = req.body;
  
  validateRequired(modelType, 'modelType');
  validateRequired(trainingData, 'trainingData');
  
  const user = req.user;
  
  logApiCall(req, 'custom-model', { 
    modelType,
    trainingDataSize: trainingData.length 
  });
  
  // This would integrate with fine-tuning APIs
  const customModel = await createCustomModel(user.id, modelType, trainingData, parameters);
  
  await recordUsage(user.id, 'custom-model', 1);
  
  const responseTime = timer.end(true);
  
  res.json({
    model: customModel,
    metadata: {
      responseTime,
      status: 'training_started',
      estimatedCompletion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  });
}));

// Usage Analytics
router.get('/usage/analytics', requireAuth, asyncHandler(async (req, res) => {
  const { timeframe = '7d' } = req.query;
  const user = req.user;
  
  const usage = await getUserUsageAnalytics(user.id, timeframe);
  const subscription = await getUserSubscription(user.id);
  
  res.json({
    usage,
    subscription,
    recommendations: generateUsageRecommendations(usage, subscription)
  });
}));

// Helper functions (these would be implemented in separate modules)
async function getFeatureUsage(userId, feature, period) {
  // Implementation would query usage database
  return 0; // Placeholder
}

async function getBusinessMetrics(userId, timeframe) {
  // Implementation would aggregate user's business data
  return {
    emailVolume: 150,
    responseRate: 0.85,
    meetingEfficiency: 0.78,
    followUpSuccess: 0.92
  };
}

async function processBulkEmailAction(emailIds, action, parameters, userId) {
  // Implementation would process bulk operations
  return {
    processed: emailIds.length,
    successful: emailIds.length - 2,
    failed: 2,
    errors: []
  };
}

async function createCustomModel(userId, modelType, trainingData, parameters) {
  // Implementation would handle custom model training
  return {
    id: `custom_${Date.now()}`,
    type: modelType,
    status: 'training',
    accuracy: null
  };
}

async function getUserUsageAnalytics(userId, timeframe) {
  // Implementation would return usage statistics
  return {
    smartPriority: 45,
    meetingInsights: 12,
    contentGeneration: 8,
    totalRequests: 65
  };
}

function generateUsageRecommendations(usage, subscription) {
  const recommendations = [];
  
  if (subscription.tier === 'basic' && usage.smartPriority > 8) {
    recommendations.push({
      type: 'upgrade',
      message: 'You\'re close to your smart prioritization limit. Upgrade to Pro for unlimited access.',
      action: 'upgrade_to_pro'
    });
  }
  
  if (usage.contentGeneration === 0 && subscription.tier !== 'basic') {
    recommendations.push({
      type: 'feature',
      message: 'Try AI content generation to create emails, documents, and presentations faster.',
      action: 'try_content_generation'
    });
  }
  
  return recommendations;
}

module.exports = router;