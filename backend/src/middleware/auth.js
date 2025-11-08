const jwt = require('jsonwebtoken');
const { SubscriptionManager } = require('../database/subscriptions');
const { AuthenticationError, AuthorizationError } = require('../utils/errorHandler');
const { logger, logSecurityEvent } = require('../utils/logger');

// We'll initialize this when database is ready
let subscriptionManager = null;

function initSubscriptionManager(database) {
  subscriptionManager = new SubscriptionManager(database);
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    logSecurityEvent('missing_token', req);
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logSecurityEvent('invalid_token', req, { error: error.message });
    logger.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Enhanced auth middleware with logging
const requireAuth = (req, res, next) => {
  try {
    verifyToken(req, res, next);
  } catch (error) {
    throw new AuthenticationError('Authentication failed');
  }
};

// Subscription-based access control
const requireSubscription = (allowedTiers = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!subscriptionManager) {
        // Fallback if subscription manager not initialized
        return next();
      }

      const subscription = await subscriptionManager.getUserSubscription(req.user.id);
      
      if (!allowedTiers.includes(subscription.tier)) {
        logSecurityEvent('insufficient_subscription', req, { 
          userTier: subscription.tier,
          requiredTiers: allowedTiers 
        });
        
        return res.status(403).json({
          error: 'Subscription upgrade required',
          message: `This feature requires ${allowedTiers.join(' or ')} subscription`,
          currentTier: subscription.tier,
          upgradeUrl: '/pricing'
        });
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Feature-specific access control
const requireFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!subscriptionManager) {
        // Fallback if subscription manager not initialized
        return next();
      }

      const access = await subscriptionManager.checkFeatureAccess(req.user.id, featureName);
      
      if (!access.allowed) {
        logSecurityEvent('feature_access_denied', req, { 
          feature: featureName,
          reason: access.reason 
        });
        
        return res.status(403).json({
          error: 'Feature access denied',
          message: access.reason,
          feature: featureName,
          upgradeUrl: '/pricing'
        });
      }

      req.featureAccess = access;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Team-based authorization
const requireTeamAccess = async (req, res, next) => {
  try {
    const teamId = req.headers['x-team-id'] || req.params.teamId;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID required' });
    }

    // Check if user has access to this team
    const hasAccess = await checkTeamAccess(req.user.id, teamId);
    
    if (!hasAccess) {
      logSecurityEvent('unauthorized_team_access', req, { teamId });
      throw new AuthorizationError('Access denied to this team');
    }

    req.teamId = teamId;
    next();
  } catch (error) {
    next(error);
  }
};

// Admin-only access
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      logSecurityEvent('admin_access_attempt', req);
      throw new AuthorizationError('Administrator access required');
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Enterprise features middleware
const requireEnterprise = requireSubscription(['enterprise']);

// Pro or higher middleware  
const requirePro = requireSubscription(['pro', 'enterprise']);

// Helper function to check team access
async function checkTeamAccess(userId, teamId) {
  // This would check team membership in database
  // For now, return true (implement based on your team structure)
  return true;
}

module.exports = { 
  verifyToken,
  requireAuth,
  requireSubscription,
  requireFeatureAccess,
  requireTeamAccess,
  requireAdmin,
  requireEnterprise,
  requirePro,
  initSubscriptionManager
};
