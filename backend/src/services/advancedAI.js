const OpenAI = require('openai');
const { logger, logOpenAiCall, createTimer } = require('../utils/logger');

class AdvancedAIService {
  constructor() {
    this.openaiClient = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    
    // Premium model configurations
    this.models = {
      basic: 'gpt-3.5-turbo',
      pro: 'gpt-4',
      enterprise: 'gpt-4-turbo-preview'
    };
  }

  getModelForTier(subscriptionTier = 'basic') {
    return this.models[subscriptionTier] || this.models.basic;
  }

  async generateSmartEmailPriority(emails, userContext = {}, tier = 'basic') {
    if (!this.openaiClient) {
      return this.fallbackPrioritization(emails);
    }

    const timer = createTimer('email-prioritization');
    
    try {
      const model = this.getModelForTier(tier);
      const emailSummaries = emails.slice(0, 20).map((email, index) => 
        `${index + 1}. From: ${email.from} | Subject: ${email.subject} | Snippet: ${email.body?.substring(0, 100)}...`
      ).join('\n');

      const prompt = `
You are an executive AI assistant specializing in email prioritization. Analyze these emails and provide intelligent prioritization.

User Context:
- Role: ${userContext.role || 'Professional'}
- Industry: ${userContext.industry || 'General Business'}  
- Current Projects: ${userContext.currentProjects || 'Various business initiatives'}
- Priority Keywords: ${userContext.priorityKeywords || 'urgent, meeting, deadline, action required'}

Emails to analyze:
${emailSummaries}

For each email, provide:
1. Priority Score (1-100, where 100 is most urgent)
2. Reasoning (brief explanation)
3. Suggested Action (reply, schedule, delegate, archive, etc.)
4. Estimated Response Time Needed
5. Key Topics/Tags

${tier !== 'basic' ? `
Advanced Analysis (${tier} tier):
6. Sentiment Analysis
7. Relationship Importance (based on sender patterns)
8. Business Impact Assessment
9. Suggested Response Tone
10. Related Email Clusters
` : ''}

Respond in JSON format with an array of email analyses.`;

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: tier === 'basic' ? 1500 : 3000
      });

      const responseTime = timer.end(true);
      logOpenAiCall(model, response.usage?.total_tokens, true, responseTime);

      const aiAnalysis = JSON.parse(response.choices[0].message.content);
      
      return emails.map((email, index) => ({
        ...email,
        aiPriority: aiAnalysis[index] || this.fallbackEmailAnalysis(email)
      }));

    } catch (error) {
      timer.end(false);
      logOpenAiCall('email-prioritization', 0, false, 0, error);
      logger.error('Smart email prioritization failed', { error: error.message });
      return this.fallbackPrioritization(emails);
    }
  }

  async generateMeetingInsights(meetingData, participantHistory = [], tier = 'basic') {
    if (!this.openaiClient) {
      return this.fallbackMeetingInsights(meetingData);
    }

    const timer = createTimer('meeting-insights');
    
    try {
      const model = this.getModelForTier(tier);
      const participantInfo = participantHistory.map(p => 
        `${p.email}: ${p.recentInteractions || 0} recent interactions, ${p.role || 'Unknown role'}`
      ).join('\n');

      const prompt = `
Generate comprehensive meeting insights and preparation materials.

Meeting Details:
- Title: ${meetingData.summary}
- Date/Time: ${meetingData.start}
- Duration: ${meetingData.duration || 'Unknown'}
- Attendees: ${meetingData.attendees?.map(a => a.email).join(', ')}
- Location: ${meetingData.location || 'Not specified'}
- Description: ${meetingData.description || 'No description'}

Participant Context:
${participantInfo}

${tier !== 'basic' ? `
Advanced Context (${tier} tier):
- Recent email threads with participants
- Previous meeting outcomes
- Project relationships
- Decision-making patterns
` : ''}

Provide:
1. Meeting Objectives (inferred from context)
2. Key Discussion Points
3. Potential Decisions/Outcomes
4. Action Items Likely to Emerge
5. Preparation Checklist
6. Success Metrics

${tier === 'pro' || tier === 'enterprise' ? `
7. Participant Communication Styles
8. Potential Conflicts/Challenges
9. Strategic Recommendations
10. Follow-up Strategy
` : ''}

${tier === 'enterprise' ? `
11. Executive Summary for Leadership
12. Risk Assessment
13. Business Impact Analysis
14. Resource Requirements
15. Timeline Dependencies
` : ''}

Format as structured JSON with clear sections.`;

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: tier === 'basic' ? 800 : tier === 'pro' ? 1500 : 2500
      });

      const responseTime = timer.end(true);
      logOpenAiCall(model, response.usage?.total_tokens, true, responseTime);

      return JSON.parse(response.choices[0].message.content);

    } catch (error) {
      timer.end(false);
      logOpenAiCall('meeting-insights', 0, false, 0, error);
      logger.error('Meeting insights generation failed', { error: error.message });
      return this.fallbackMeetingInsights(meetingData);
    }
  }

  async generatePredictiveFollowUps(emailThread, userBehavior = {}, tier = 'basic') {
    if (!this.openaiClient) {
      return this.fallbackFollowUps(emailThread);
    }

    const timer = createTimer('predictive-followups');
    
    try {
      const model = this.getModelForTier(tier);
      const threadSummary = emailThread.slice(-5).map(email => 
        `[${email.date}] ${email.from}: ${email.subject}\n${email.body?.substring(0, 200)}...`
      ).join('\n\n');

      const prompt = `
Analyze this email thread and generate intelligent follow-up predictions and recommendations.

Email Thread (most recent 5 messages):
${threadSummary}

User Behavior Patterns:
- Response Time: ${userBehavior.avgResponseTime || 'Unknown'}
- Communication Style: ${userBehavior.communicationStyle || 'Professional'}
- Follow-up Frequency: ${userBehavior.followUpFrequency || 'Normal'}
- Success Patterns: ${userBehavior.successPatterns || 'Standard business practices'}

${tier !== 'basic' ? `
Advanced Analysis (${tier} tier):
- Historical relationship patterns
- Seasonal business cycles
- Industry-specific timing
- Competitive context
` : ''}

Provide:
1. Follow-up Probability (0-100%)
2. Optimal Timing Recommendations
3. Suggested Follow-up Content (3 variations: brief, detailed, creative)
4. Channel Recommendations (email, call, meeting, etc.)
5. Success Probability Assessment

${tier === 'pro' || tier === 'enterprise' ? `
6. Relationship Impact Analysis  
7. Business Value Assessment
8. Alternative Approach Suggestions
9. Risk Mitigation Strategies
` : ''}

${tier === 'enterprise' ? `
10. Multi-stakeholder Follow-up Orchestration
11. Automated Sequence Recommendations
12. Performance Tracking Metrics
` : ''}

Return structured JSON with actionable insights.`;

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: tier === 'basic' ? 1000 : tier === 'pro' ? 1800 : 2800
      });

      const responseTime = timer.end(true);
      logOpenAiCall(model, response.usage?.total_tokens, true, responseTime);

      return JSON.parse(response.choices[0].message.content);

    } catch (error) {
      timer.end(false);
      logOpenAiCall('predictive-followups', 0, false, 0, error);
      logger.error('Predictive follow-ups failed', { error: error.message });
      return this.fallbackFollowUps(emailThread);
    }
  }

  async generateIntelligentContent(contentType, context = {}, tier = 'basic') {
    if (!this.openaiClient) {
      return this.fallbackContent(contentType, context);
    }

    const timer = createTimer('content-generation');
    
    try {
      const model = this.getModelForTier(tier);
      
      const contentPrompts = {
        email: this.buildEmailPrompt(context, tier),
        document: this.buildDocumentPrompt(context, tier),
        presentation: this.buildPresentationPrompt(context, tier),
        report: this.buildReportPrompt(context, tier),
        proposal: this.buildProposalPrompt(context, tier)
      };

      const prompt = contentPrompts[contentType] || contentPrompts.email;

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: tier === 'basic' ? 1200 : tier === 'pro' ? 2000 : 3500
      });

      const responseTime = timer.end(true);
      logOpenAiCall(model, response.usage?.total_tokens, true, responseTime);

      return {
        content: response.choices[0].message.content,
        metadata: {
          model,
          tier,
          contentType,
          tokens: response.usage?.total_tokens,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      timer.end(false);
      logOpenAiCall('content-generation', 0, false, 0, error);
      logger.error('Content generation failed', { error: error.message, contentType });
      return this.fallbackContent(contentType, context);
    }
  }

  async analyzeBusinessMetrics(data, timeframe = '30d', tier = 'basic') {
    if (!this.openaiClient || tier === 'basic') {
      return this.fallbackMetrics(data);
    }

    const timer = createTimer('business-analytics');
    
    try {
      const model = this.getModelForTier(tier);
      
      const prompt = `
Analyze these business metrics and provide intelligent insights.

Data Summary:
- Email Volume: ${data.emailVolume || 'N/A'}
- Response Rate: ${data.responseRate || 'N/A'}
- Meeting Efficiency: ${data.meetingEfficiency || 'N/A'}
- Follow-up Success: ${data.followUpSuccess || 'N/A'}
- Time Period: ${timeframe}

${tier === 'enterprise' ? `
Advanced Metrics:
- Revenue Impact: ${data.revenueImpact || 'N/A'}
- Customer Satisfaction: ${data.customerSat || 'N/A'}
- Team Performance: ${data.teamPerformance || 'N/A'}
- Process Efficiency: ${data.processEfficiency || 'N/A'}
` : ''}

Provide:
1. Performance Trends Analysis
2. Improvement Opportunities
3. Actionable Recommendations
4. Benchmark Comparisons
5. Forecasting Insights

${tier === 'enterprise' ? `
6. Strategic Business Impact
7. ROI Analysis
8. Risk Assessments
9. Executive Dashboard Metrics
10. Competitive Positioning
` : ''}

Return comprehensive JSON analysis.`;

      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: tier === 'pro' ? 1500 : 2500
      });

      const responseTime = timer.end(true);
      logOpenAiCall(model, response.usage?.total_tokens, true, responseTime);

      return JSON.parse(response.choices[0].message.content);

    } catch (error) {
      timer.end(false);
      logOpenAiCall('business-analytics', 0, false, 0, error);
      logger.error('Business metrics analysis failed', { error: error.message });
      return this.fallbackMetrics(data);
    }
  }

  // Helper methods for building prompts
  buildEmailPrompt(context, tier) {
    return `
Create a professional email based on the following context:

Purpose: ${context.purpose || 'General communication'}
Recipient: ${context.recipient || 'Professional contact'}
Tone: ${context.tone || 'Professional and friendly'}
Key Points: ${context.keyPoints || 'Standard business communication'}
Background: ${context.background || 'Ongoing business relationship'}

${tier !== 'basic' ? `
Advanced Requirements (${tier} tier):
- Personalization based on recipient history
- Industry-specific language
- Strategic messaging alignment
- Psychological persuasion techniques
` : ''}

Generate a compelling, well-structured email that achieves the stated purpose.`;
  }

  buildDocumentPrompt(context, tier) {
    return `
Create a professional document with the following specifications:

Document Type: ${context.docType || 'Business document'}
Title: ${context.title || 'Professional Document'}
Audience: ${context.audience || 'Business stakeholders'}
Purpose: ${context.purpose || 'Information sharing'}
Key Sections: ${context.sections || 'Introduction, main content, conclusion'}
Length: ${context.length || 'Medium length'}

${tier === 'pro' || tier === 'enterprise' ? `
Advanced Features:
- Executive summary
- Data visualization suggestions
- Action items
- Risk considerations
- Implementation timeline
` : ''}

Create comprehensive, well-structured content with clear sections and professional formatting.`;
  }

  buildPresentationPrompt(context, tier) {
    return `
Create presentation content with the following requirements:

Topic: ${context.topic || 'Business presentation'}
Audience: ${context.audience || 'Professional audience'}
Duration: ${context.duration || '15-20 minutes'}
Objective: ${context.objective || 'Inform and engage'}
Key Messages: ${context.keyMessages || 'Core business points'}

${tier === 'enterprise' ? `
Executive-Level Features:
- Strategic narrative arc
- Stakeholder impact analysis  
- Decision framework
- Investment considerations
- Competitive positioning
` : ''}

Generate slide-by-slide content with speaker notes and visual suggestions.`;
  }

  buildReportPrompt(context, tier) {
    return `
Generate a comprehensive business report:

Report Type: ${context.reportType || 'Status report'}
Time Period: ${context.timePeriod || 'Current period'}
Scope: ${context.scope || 'General business activities'}
Audience: ${context.audience || 'Management'}
Data Points: ${context.dataPoints || 'Standard metrics'}

${tier !== 'basic' ? `
Enhanced Analysis:
- Trend analysis with forecasting
- Comparative benchmarking
- Risk and opportunity assessment
- Strategic recommendations
` : ''}

Create a professional report with executive summary, detailed analysis, and actionable insights.`;
  }

  buildProposalPrompt(context, tier) {
    return `
Create a compelling business proposal:

Proposal Type: ${context.proposalType || 'Business proposal'}
Client/Audience: ${context.client || 'Prospective client'}
Solution: ${context.solution || 'Business solution'}
Value Proposition: ${context.valueProposition || 'Key benefits'}
Budget Range: ${context.budget || 'To be determined'}

${tier === 'pro' || tier === 'enterprise' ? `
Advanced Proposal Elements:
- ROI calculations and projections
- Risk mitigation strategies
- Implementation roadmap
- Success metrics and KPIs
- Competitive differentiation
` : ''}

Generate a persuasive proposal with clear value proposition and compelling call-to-action.`;
  }

  // Bulk email processing method
  async processBulkEmailActions(emails, actions = {}) {
    try {
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return {
          success: false,
          message: 'No emails provided for bulk processing',
          processed: 0,
          results: []
        };
      }

      const tier = await this.subscriptionManager.getUserTier();
      const batchSize = tier === 'enterprise' ? 100 : tier === 'pro' ? 50 : 20;
      const results = [];

      // Process emails in batches
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (email, index) => {
            try {
              const result = {
                id: email.id || `email_${i + index}`,
                originalEmail: email,
                processed: true
              };

              // Categorize email
              if (actions.categorize !== false) {
                result.category = await this.categorizeEmail(email);
              }

              // Prioritize email
              if (actions.prioritize !== false) {
                const priorityAnalysis = await this.generateSmartEmailPriority([email]);
                result.priority = priorityAnalysis[0] || this.fallbackEmailAnalysis(email);
              }

              // Generate auto-response if requested
              if (actions.autoResponse) {
                result.autoResponse = await this.generateAutoResponse(email, actions.autoResponse);
              }

              // Suggest actions
              if (actions.suggestActions !== false) {
                result.suggestedActions = await this.suggestEmailActions(email);
              }

              // Tag email
              if (actions.tag) {
                result.tags = await this.generateEmailTags(email);
              }

              return result;
            } catch (error) {
              this.logger.error(`Error processing email ${email.id}:`, error);
              return {
                id: email.id || `email_${i + index}`,
                processed: false,
                error: error.message
              };
            }
          })
        );

        results.push(...batchResults);

        // Add delay between batches to prevent rate limiting
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successCount = results.filter(r => r.processed).length;
      const failureCount = results.filter(r => !r.processed).length;

      return {
        success: true,
        processed: successCount,
        failed: failureCount,
        total: emails.length,
        batchSize,
        tier,
        results,
        summary: {
          categories: this.summarizeCategories(results),
          priorities: this.summarizePriorities(results),
          actions: this.summarizeActions(results)
        }
      };
    } catch (error) {
      this.logger.error('Bulk email processing error:', error);
      return {
        success: false,
        message: 'Bulk processing failed',
        error: error.message,
        processed: 0,
        results: []
      };
    }
  }

  async categorizeEmail(email) {
    const categories = ['work', 'personal', 'promotional', 'newsletter', 'social', 'finance', 'travel', 'other'];
    const content = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
    
    // Simple keyword-based categorization
    if (content.includes('meeting') || content.includes('project') || content.includes('deadline')) return 'work';
    if (content.includes('offer') || content.includes('sale') || content.includes('discount')) return 'promotional';
    if (content.includes('newsletter') || content.includes('unsubscribe')) return 'newsletter';
    if (content.includes('payment') || content.includes('invoice') || content.includes('bank')) return 'finance';
    if (content.includes('flight') || content.includes('hotel') || content.includes('booking')) return 'travel';
    
    return 'other';
  }

  async generateAutoResponse(email, responseConfig) {
    const defaultResponse = {
      subject: `Re: ${email.subject || 'Your message'}`,
      body: `Thank you for your email. I have received your message and will respond within 24 hours.

Best regards,
VAAI Assistant`,
      tone: responseConfig.tone || 'professional',
      generated: true
    };

    if (responseConfig.custom && this.openai) {
      try {
        const prompt = `Generate an auto-response email for:
Subject: ${email.subject}
From: ${email.from}
Content preview: ${email.body?.substring(0, 200)}...

Response requirements:
- Tone: ${responseConfig.tone || 'professional'}
- Acknowledge receipt
- Set expectations
- Be helpful and courteous`;

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.7
        });

        return {
          ...defaultResponse,
          body: completion.choices[0]?.message?.content || defaultResponse.body,
          aiGenerated: true
        };
      } catch (error) {
        this.logger.error('Auto-response generation error:', error);
      }
    }

    return defaultResponse;
  }

  async suggestEmailActions(email) {
    const actions = [];
    const content = `${email.subject || ''} ${email.body || ''}`.toLowerCase();

    if (content.includes('meeting') || content.includes('schedule')) {
      actions.push({ type: 'calendar', action: 'Schedule meeting', priority: 'high' });
    }
    if (content.includes('deadline') || content.includes('urgent')) {
      actions.push({ type: 'task', action: 'Create urgent task', priority: 'high' });
    }
    if (content.includes('invoice') || content.includes('payment')) {
      actions.push({ type: 'finance', action: 'Process payment', priority: 'medium' });
    }
    if (content.includes('document') || content.includes('attachment')) {
      actions.push({ type: 'file', action: 'Review documents', priority: 'medium' });
    }

    actions.push({ type: 'reply', action: 'Send response', priority: 'medium' });

    return actions;
  }

  async generateEmailTags(email) {
    const tags = [];
    const content = `${email.subject || ''} ${email.body || ''}`.toLowerCase();

    if (content.includes('urgent') || content.includes('asap')) tags.push('urgent');
    if (content.includes('meeting')) tags.push('meeting');
    if (content.includes('deadline')) tags.push('deadline');
    if (content.includes('follow-up') || content.includes('followup')) tags.push('follow-up');
    if (content.includes('project')) tags.push('project');
    if (content.includes('client') || content.includes('customer')) tags.push('client');

    return tags.length > 0 ? tags : ['general'];
  }

  summarizeCategories(results) {
    const categories = {};
    results.filter(r => r.category).forEach(r => {
      categories[r.category] = (categories[r.category] || 0) + 1;
    });
    return categories;
  }

  summarizePriorities(results) {
    const priorities = { high: 0, medium: 0, low: 0 };
    results.filter(r => r.priority).forEach(r => {
      const score = r.priority.priorityScore || 50;
      if (score >= 80) priorities.high++;
      else if (score >= 60) priorities.medium++;
      else priorities.low++;
    });
    return priorities;
  }

  summarizeActions(results) {
    const actions = {};
    results.filter(r => r.suggestedActions).forEach(r => {
      r.suggestedActions.forEach(action => {
        actions[action.type] = (actions[action.type] || 0) + 1;
      });
    });
    return actions;
  }

  // Fallback methods for when AI is unavailable
  fallbackPrioritization(emails) {
    return emails.map(email => ({
      ...email,
      aiPriority: this.fallbackEmailAnalysis(email)
    }));
  }

  fallbackEmailAnalysis(email) {
    const urgentKeywords = ['urgent', 'asap', 'immediate', 'deadline', 'meeting'];
    const hasUrgentKeywords = urgentKeywords.some(keyword => 
      email.subject?.toLowerCase().includes(keyword) || 
      email.body?.toLowerCase().includes(keyword)
    );
    
    return {
      priorityScore: hasUrgentKeywords ? 85 : 50,
      reasoning: hasUrgentKeywords ? 'Contains urgent keywords' : 'Standard priority',
      suggestedAction: hasUrgentKeywords ? 'reply' : 'review',
      responseTime: hasUrgentKeywords ? '2 hours' : '1 day',
      tags: hasUrgentKeywords ? ['urgent'] : ['normal']
    };
  }

  fallbackMeetingInsights(meetingData) {
    return {
      objectives: ['Discuss agenda items', 'Make decisions', 'Plan next steps'],
      keyPoints: ['Review current status', 'Address challenges', 'Set priorities'],
      preparation: ['Review agenda', 'Prepare materials', 'Check calendar'],
      successMetrics: ['Clear action items', 'Decisions made', 'Next steps defined']
    };
  }

  fallbackFollowUps(emailThread) {
    return {
      probability: 75,
      timing: '2-3 days',
      content: ['Brief check-in', 'Detailed follow-up', 'Creative approach'],
      channel: 'email',
      successProbability: 65
    };
  }

  fallbackContent(contentType, context) {
    return {
      content: `This is a template ${contentType} generated without AI assistance. Please configure OpenAI API for enhanced content generation.`,
      metadata: {
        model: 'template',
        tier: 'fallback',
        contentType,
        generatedAt: new Date().toISOString()
      }
    };
  }

  fallbackMetrics(data) {
    return {
      trends: 'Basic analysis available with AI features',
      recommendations: ['Enable AI features for detailed insights'],
      benchmarks: 'Upgrade to access benchmark data'
    };
  }
}

module.exports = new AdvancedAIService();