// Premium AI Features Integration for VAAI Frontend
// This file handles integration with the advanced AI backend services

import axios from 'axios';

class PremiumAIService {
  constructor(baseURL = '', getAuthHeaders = () => ({})) {
    this.baseURL = baseURL;
    this.getAuthHeaders = getAuthHeaders;
  }

  /**
   * Smart Email Prioritization (Pro Feature)
   */
  async generateSmartPriority(emails) {
    try {
      const response = await axios.post('/api/advanced-ai/emails/smart-priority', {
        emails: emails.slice(0, 50) // Limit for performance
      }, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage
      };
    } catch (error) {
      return this.handleError(error, 'Smart Email Priority');
    }
  }

  /**
   * Meeting Insights Generation (Pro Feature)
   */
  async generateMeetingInsights(meetingData) {
    try {
      const response = await axios.post('/api/advanced-ai/meetings/insights', {
        calendarEventId: meetingData.id,
        attendees: meetingData.attendees || [],
        agenda: meetingData.agenda || '',
        context: meetingData.context || ''
      }, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage
      };
    } catch (error) {
      return this.handleError(error, 'Meeting Insights');
    }
  }

  /**
   * Predictive Follow-ups (Enterprise Feature)
   */
  async generatePredictiveFollowUps(options = {}) {
    try {
      const response = await axios.post('/api/advanced-ai/followups/predictive', {
        lookbackDays: options.lookbackDays || 30,
        priority: options.priority || 'high',
        includeContext: options.includeContext !== false
      }, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage
      };
    } catch (error) {
      return this.handleError(error, 'Predictive Follow-ups');
    }
  }

  /**
   * Intelligent Content Generation (Pro Feature)
   */
  async generateIntelligentContent(type, context) {
    try {
      const response = await axios.post('/api/advanced-ai/content/generate', {
        type,
        context,
        includePersonalization: true
      }, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage
      };
    } catch (error) {
      return this.handleError(error, 'Content Generation');
    }
  }

  /**
   * Bulk Email Actions (Enterprise Feature)
   */
  async processBulkEmailActions(emails, actions) {
    try {
      const response = await axios.post('/api/advanced-ai/bulk/email-actions', {
        emails: emails.slice(0, 100), // Enterprise limit
        actions,
        batchSize: 10
      }, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage
      };
    } catch (error) {
      return this.handleError(error, 'Bulk Email Actions');
    }
  }

  /**
   * Check feature availability based on subscription
   */
  checkFeatureAvailability(feature, userTier) {
    const featureMap = {
      'smart-priority': ['pro', 'enterprise'],
      'meeting-insights': ['pro', 'enterprise'],
      'predictive-followups': ['enterprise'],
      'bulk-actions': ['enterprise'],
      'content-generation': ['pro', 'enterprise'],
      'analytics-dashboard': ['enterprise']
    };

    return featureMap[feature]?.includes(userTier) || false;
  }

  /**
   * Get usage statistics for current billing period
   */
  async getUsageStats() {
    try {
      const response = await axios.get('/api/advanced-ai/usage/stats', {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error, 'Usage Statistics');
    }
  }

  /**
   * Error handler for AI service calls
   */
  handleError(error, feature) {
    console.error(`Premium AI Service Error - ${feature}:`, error);

    if (error.response?.status === 402) {
      return {
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        message: `${feature} requires a premium subscription. Please upgrade your plan.`,
        upgradeRequired: true
      };
    }

    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: `${feature} usage limit exceeded. Please try again later or upgrade your plan.`,
        rateLimited: true
      };
    }

    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'FEATURE_DISABLED',
        message: `${feature} is not available on your current plan.`,
        upgradeRequired: true
      };
    }

    return {
      success: false,
      error: 'SERVICE_ERROR',
      message: `${feature} is temporarily unavailable. Please try again later.`,
      technical: error.response?.data?.error || error.message
    };
  }
}

/**
 * React Hook for Premium AI Features
 */
export const usePremiumAI = (getAuthHeaders, userTier = 'basic') => {
  // Create service instance directly without memoization to avoid hook issues
  const aiService = new PremiumAIService('', getAuthHeaders);

  const executeFeature = async (featureId, ...args) => {
    // Check if user has access to this feature
    if (!aiService.checkFeatureAvailability(featureId, userTier)) {
      return {
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        message: `This feature requires a ${featureId === 'predictive-followups' || featureId === 'bulk-actions' || featureId === 'analytics-dashboard' ? 'Enterprise' : 'Pro'} subscription.`,
        upgradeRequired: true
      };
    }

    // Execute the feature
    switch (featureId) {
      case 'smart-priority':
        return await aiService.generateSmartPriority(...args);
      case 'meeting-insights':
        return await aiService.generateMeetingInsights(...args);
      case 'predictive-followups':
        return await aiService.generatePredictiveFollowUps(...args);
      case 'content-generation':
        return await aiService.generateIntelligentContent(...args);
      case 'bulk-actions':
        return await aiService.processBulkEmailActions(...args);
      default:
        return {
          success: false,
          error: 'UNKNOWN_FEATURE',
          message: `Feature ${featureId} is not recognized.`
        };
    }
  };

  const checkAccess = (featureId) => {
    return aiService.checkFeatureAvailability(featureId, userTier);
  };

  const getUsage = async () => {
    return await aiService.getUsageStats();
  };

  return {
    executeFeature,
    checkAccess,
    getUsage,
    userTier
  };
};

/**
 * Feature Demo Functions (for showcasing capabilities)
 */
export const demoFeatures = {
  smartPriority: {
    title: 'Smart Email Priority',
    description: 'AI analyzes email content, sender importance, and urgency indicators to automatically prioritize your inbox.',
    demoData: [
      { subject: 'URGENT: Server downtime affecting customers', priority: 'critical', confidence: 0.95 },
      { subject: 'Partnership opportunity - Fortune 500 company', priority: 'high', confidence: 0.88 },
      { subject: 'Weekly newsletter from Marketing', priority: 'low', confidence: 0.92 }
    ]
  },
  
  meetingInsights: {
    title: 'Meeting Insights',
    description: 'Generate intelligent pre-meeting briefs with attendee context, talking points, and follow-up recommendations.',
    demoData: {
      agenda: 'Q1 Strategy Review with Product Team',
      insights: [
        'Recent product metrics show 23% engagement increase',
        'Two key stakeholders have scheduling conflicts next week',
        'Budget discussions may require CFO input'
      ],
      recommendations: [
        'Prepare updated roadmap presentation',
        'Send pre-read materials 24h in advance',
        'Schedule follow-up for action item tracking'
      ]
    }
  },
  
  predictiveFollowups: {
    title: 'Predictive Follow-ups',
    description: 'AI identifies stale conversations and generates contextual follow-up suggestions with optimal timing.',
    demoData: [
      { contact: 'Sarah Chen (Acme Corp)', lastContact: '12 days ago', suggestion: 'Check in on pilot program progress', confidence: 0.87 },
      { contact: 'Marcus Johnson (TechFlow)', lastContact: '8 days ago', suggestion: 'Follow up on pricing discussion', confidence: 0.91 }
    ]
  },
  
  bulkActions: {
    title: 'Bulk AI Actions',
    description: 'Process multiple emails simultaneously with intelligent categorization, response generation, and workflow automation.',
    demoData: {
      processed: 47,
      categorized: { 'customer-support': 12, 'sales-inquiry': 8, 'internal': 15, 'newsletter': 12 },
      autoResponded: 8,
      flaggedForReview: 3
    }
  }
};

export default PremiumAIService;