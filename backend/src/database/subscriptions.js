const sqlite3 = require('sqlite3').verbose();
const { logDatabaseOperation } = require('../utils/logger');

// Subscription tiers with enhanced AI features
const SUBSCRIPTION_TIERS = {
  basic: {
    name: 'Basic',
    monthlyPrice: 0,
    annualPrice: 0,
    features: {
      emailClassification: true,
      basicMeetingPrep: true,
      simpleFollowUps: true,
      smartPriority: { limit: 10, period: 'daily' },
      aiInsights: false,
      contentGeneration: false,
      bulkOperations: false,
      customModels: false,
      prioritySupport: false,
      analytics: 'basic'
    },
    limits: {
      teamsPerUser: 3,
      emailsPerMonth: 1000,
      storageGB: 1
    }
  },
  pro: {
    name: 'Professional',
    monthlyPrice: 29,
    annualPrice: 290,
    features: {
      emailClassification: true,
      basicMeetingPrep: true,
      simpleFollowUps: true,
      smartPriority: { limit: 'unlimited' },
      aiInsights: true,
      meetingInsights: true,
      predictiveFollowUps: { limit: 50, period: 'daily' },
      contentGeneration: { limit: 25, period: 'daily' },
      bulkOperations: { limit: 100, period: 'batch' },
      customModels: false,
      prioritySupport: true,
      analytics: 'advanced'
    },
    limits: {
      teamsPerUser: 10,
      emailsPerMonth: 10000,
      storageGB: 10
    }
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 99,
    annualPrice: 990,
    features: {
      emailClassification: true,
      basicMeetingPrep: true,
      simpleFollowUps: true,
      smartPriority: { limit: 'unlimited' },
      aiInsights: true,
      meetingInsights: true,
      predictiveFollowUps: { limit: 'unlimited' },
      contentGeneration: { limit: 100, period: 'daily' },
      bulkOperations: { limit: 1000, period: 'batch' },
      businessAnalytics: true,
      customModels: true,
      apiAccess: true,
      ssoIntegration: true,
      prioritySupport: true,
      dedicatedManager: true,
      analytics: 'enterprise'
    },
    limits: {
      teamsPerUser: 'unlimited',
      emailsPerMonth: 'unlimited',
      storageGB: 100
    }
  }
};

class SubscriptionManager {
  constructor(db) {
    this.db = db;
  }

  async createSubscriptionTables() {
    const createSubscriptionsTable = `
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier TEXT NOT NULL DEFAULT 'basic',
        status TEXT NOT NULL DEFAULT 'active',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        payment_method_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createUsageTable = `
      CREATE TABLE IF NOT EXISTS feature_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        feature_name TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 1,
        usage_date TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createBillingTable = `
      CREATE TABLE IF NOT EXISTS billing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subscription_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT NOT NULL,
        payment_provider TEXT,
        provider_payment_id TEXT,
        billing_period_start TEXT NOT NULL,
        billing_period_end TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (subscription_id) REFERENCES user_subscriptions (id)
      )
    `;

    await this.db.exec(createSubscriptionsTable);
    await this.db.exec(createUsageTable);
    await this.db.exec(createBillingTable);
  }

  async getUserSubscription(userId) {
    const startTime = Date.now();
    
    try {
      const subscription = await new Promise((resolve, reject) => {
        this.db.get(
          'SELECT * FROM user_subscriptions WHERE user_id = ? AND status = "active" ORDER BY created_at DESC LIMIT 1',
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'user_subscriptions', true, responseTime);

      // Return basic tier if no subscription found
      if (!subscription) {
        return {
          tier: 'basic',
          status: 'active',
          features: SUBSCRIPTION_TIERS.basic.features,
          limits: SUBSCRIPTION_TIERS.basic.limits,
          isTrialUser: true
        };
      }

      return {
        ...subscription,
        features: SUBSCRIPTION_TIERS[subscription.tier].features,
        limits: SUBSCRIPTION_TIERS[subscription.tier].limits
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'user_subscriptions', false, responseTime, error);
      throw error;
    }
  }

  async createOrUpdateSubscription(userId, tier, billingCycle = 'monthly', paymentMethodId = null) {
    const startTime = Date.now();
    
    try {
      const now = new Date();
      const periodEnd = new Date(now);
      
      if (billingCycle === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Check if user has existing subscription
      const existing = await this.getUserSubscription(userId);
      
      if (existing && !existing.isTrialUser) {
        // Update existing subscription
        await new Promise((resolve, reject) => {
          this.db.run(
            `UPDATE user_subscriptions 
             SET tier = ?, billing_cycle = ?, payment_method_id = ?, 
                 current_period_start = ?, current_period_end = ?, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND status = 'active'`,
            [tier, billingCycle, paymentMethodId, now.toISOString(), periodEnd.toISOString(), userId],
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        });
      } else {
        // Create new subscription
        await new Promise((resolve, reject) => {
          this.db.run(
            `INSERT INTO user_subscriptions 
             (user_id, tier, billing_cycle, payment_method_id, current_period_start, current_period_end)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, tier, billingCycle, paymentMethodId, now.toISOString(), periodEnd.toISOString()],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
      }

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('INSERT/UPDATE', 'user_subscriptions', true, responseTime);

      return await this.getUserSubscription(userId);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('INSERT/UPDATE', 'user_subscriptions', false, responseTime, error);
      throw error;
    }
  }

  async recordUsage(userId, featureName, count = 1, metadata = {}) {
    const startTime = Date.now();
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO feature_usage (user_id, feature_name, usage_count, usage_date, metadata)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, featureName, count, today, JSON.stringify(metadata)],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('INSERT', 'feature_usage', true, responseTime);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('INSERT', 'feature_usage', false, responseTime, error);
      throw error;
    }
  }

  async getFeatureUsage(userId, featureName, period = 'today') {
    const startTime = Date.now();
    
    try {
      let dateCondition;
      const now = new Date();
      
      switch (period) {
        case 'today':
          dateCondition = now.toISOString().split('T')[0];
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateCondition = weekAgo.toISOString().split('T')[0];
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          dateCondition = monthAgo.toISOString().split('T')[0];
          break;
        default:
          dateCondition = now.toISOString().split('T')[0];
      }

      const usage = await new Promise((resolve, reject) => {
        const query = period === 'today' 
          ? 'SELECT SUM(usage_count) as total FROM feature_usage WHERE user_id = ? AND feature_name = ? AND usage_date = ?'
          : 'SELECT SUM(usage_count) as total FROM feature_usage WHERE user_id = ? AND feature_name = ? AND usage_date >= ?';
        
        this.db.get(query, [userId, featureName, dateCondition], (err, row) => {
          if (err) reject(err);
          else resolve(row?.total || 0);
        });
      });

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'feature_usage', true, responseTime);

      return usage;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'feature_usage', false, responseTime, error);
      throw error;
    }
  }

  async getUserUsageAnalytics(userId, timeframe = '7d') {
    const startTime = Date.now();
    
    try {
      const days = parseInt(timeframe.replace('d', ''));
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const usage = await new Promise((resolve, reject) => {
        this.db.all(
          `SELECT feature_name, SUM(usage_count) as total, COUNT(DISTINCT usage_date) as active_days
           FROM feature_usage 
           WHERE user_id = ? AND usage_date >= ?
           GROUP BY feature_name`,
          [userId, dateFrom],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      const analytics = {};
      usage.forEach(row => {
        analytics[row.feature_name] = {
          total: row.total,
          activeDays: row.active_days,
          avgPerDay: Math.round(row.total / days * 100) / 100
        };
      });

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'feature_usage', true, responseTime);

      return analytics;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('SELECT', 'feature_usage', false, responseTime, error);
      throw error;
    }
  }

  async checkFeatureAccess(userId, featureName) {
    const subscription = await this.getUserSubscription(userId);
    const tierFeatures = SUBSCRIPTION_TIERS[subscription.tier].features;
    
    // Check if feature exists in tier
    if (!tierFeatures.hasOwnProperty(featureName)) {
      return { allowed: false, reason: 'Feature not available in current tier' };
    }

    const featureConfig = tierFeatures[featureName];
    
    // Simple boolean features
    if (typeof featureConfig === 'boolean') {
      return { allowed: featureConfig, reason: featureConfig ? null : 'Feature not included in current tier' };
    }

    // Features with limits
    if (typeof featureConfig === 'object' && featureConfig.limit) {
      if (featureConfig.limit === 'unlimited') {
        return { allowed: true, remaining: 'unlimited' };
      }

      const currentUsage = await this.getFeatureUsage(userId, featureName, featureConfig.period);
      const remaining = Math.max(0, featureConfig.limit - currentUsage);
      
      return {
        allowed: remaining > 0,
        remaining,
        limit: featureConfig.limit,
        current: currentUsage,
        reason: remaining === 0 ? `${featureConfig.period} limit reached` : null
      };
    }

    return { allowed: true };
  }

  async getSubscriptionTiers() {
    return SUBSCRIPTION_TIERS;
  }

  async cancelSubscription(userId, cancelAtPeriodEnd = true) {
    const startTime = Date.now();
    
    try {
      await new Promise((resolve, reject) => {
        this.db.run(
          `UPDATE user_subscriptions 
           SET cancel_at_period_end = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND status = 'active'`,
          [cancelAtPeriodEnd, userId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      const responseTime = Date.now() - startTime;
      logDatabaseOperation('UPDATE', 'user_subscriptions', true, responseTime);

      return await this.getUserSubscription(userId);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logDatabaseOperation('UPDATE', 'user_subscriptions', false, responseTime, error);
      throw error;
    }
  }
}

// Export helper functions for routes
async function getUserSubscription(userId) {
  const { getDatabase } = require('./init');
  const db = getDatabase();
  const manager = new SubscriptionManager(db);
  return await manager.getUserSubscription(userId);
}

async function recordUsage(userId, featureName, count = 1, metadata = {}) {
  const { getDatabase } = require('./init');
  const db = getDatabase();
  const manager = new SubscriptionManager(db);
  return await manager.recordUsage(userId, featureName, count, metadata);
}

async function getFeatureUsage(userId, featureName, period = 'today') {
  const { getDatabase } = require('./init');
  const db = getDatabase();
  const manager = new SubscriptionManager(db);
  return await manager.getFeatureUsage(userId, featureName, period);
}

module.exports = {
  SubscriptionManager,
  SUBSCRIPTION_TIERS,
  getUserSubscription,
  recordUsage,
  getFeatureUsage
};