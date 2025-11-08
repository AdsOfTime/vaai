import React, { useState } from 'react';

const SubscriptionUpgradeModal = ({ 
  isOpen, 
  onClose, 
  currentTier = 'basic', 
  targetFeature = null,
  subscriptionTiers = []
}) => {
  const [selectedTier, setSelectedTier] = useState('pro');
  const [billingCycle, setBillingCycle] = useState('monthly');

  if (!isOpen) return null;

  const getFeatureRequiredTier = (feature) => {
    const enterpriseFeatures = ['predictive-followups', 'bulk-actions', 'analytics-dashboard'];
    return enterpriseFeatures.includes(feature) ? 'enterprise' : 'pro';
  };

  const targetTier = targetFeature ? getFeatureRequiredTier(targetFeature) : 'pro';
  const recommendedTier = selectedTier || targetTier;

  const tierBenefits = {
    pro: [
      'Smart Email Prioritization with AI',
      'Meeting Insights & Preparation',
      'Intelligent Content Generation',
      'Advanced Email Classification',
      'Priority Support',
      'Up to 10,000 AI operations/month'
    ],
    enterprise: [
      'All Pro features included',
      'Predictive Follow-up Engine',
      'Bulk AI Email Processing',
      'Advanced Analytics Dashboard',
      'Custom AI Model Training',
      'Dedicated Success Manager',
      'Unlimited AI operations',
      'SSO & Advanced Security'
    ]
  };

  const handleUpgrade = () => {
    // This would integrate with your payment processor
    const upgradeUrl = `/upgrade?tier=${recommendedTier}&billing=${billingCycle}`;
    window.open(upgradeUrl, '_blank');
    onClose();
  };

  return (
    <div className="vaai-modal-overlay">
      <div className="vaai-modal" style={{ maxWidth: '800px' }}>
        <div className="vaai-modal-header">
          <h2 className="vaai-modal-title">
            {targetFeature ? 'Unlock Premium AI Features' : 'Upgrade Your Plan'}
          </h2>
          <button 
            className="vaai-modal-close" 
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <div className="vaai-modal-body">
          {targetFeature && (
            <div className="vaai-card" style={{ 
              marginBottom: '2rem',
              background: 'var(--vaai-gradient-card)',
              border: '1px solid var(--vaai-accent)'
            }}>
              <div className="vaai-card-header">
                <h3 className="vaai-card-title">
                  Feature Unlock Required
                </h3>
              </div>
              <p style={{ margin: 0 }}>
                <strong>{targetFeature.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong> requires a {targetTier} subscription.
                Upgrade now to unlock this premium AI capability and boost your productivity.
              </p>
            </div>
          )}

          {/* Billing Toggle */}
          <div className="vaai-flex vaai-justify-center" style={{ marginBottom: '2rem' }}>
            <div className="vaai-card" style={{ padding: '1rem', display: 'inline-flex', gap: '1rem' }}>
              <label className="vaai-flex vaai-items-center vaai-gap-sm">
                <input
                  type="radio"
                  name="billing"
                  value="monthly"
                  checked={billingCycle === 'monthly'}
                  onChange={(e) => setBillingCycle(e.target.value)}
                />
                <span>Monthly</span>
              </label>
              <label className="vaai-flex vaai-items-center vaai-gap-sm">
                <input
                  type="radio"
                  name="billing"
                  value="annual"
                  checked={billingCycle === 'annual'}
                  onChange={(e) => setBillingCycle(e.target.value)}
                />
                <span>Annual (2 months free!)</span>
              </label>
            </div>
          </div>

          {/* Subscription Tiers */}
          <div className="vaai-flex vaai-gap-lg" style={{ justifyContent: 'center' }}>
            {/* Pro Tier */}
            <div className={`vaai-card ${recommendedTier === 'pro' ? 'vaai-tier-pro' : ''}`} 
                 style={{ 
                   flex: 1, 
                   maxWidth: '300px',
                   cursor: 'pointer',
                   transform: recommendedTier === 'pro' ? 'scale(1.05)' : 'scale(1)',
                   transition: 'transform 0.2s ease'
                 }}
                 onClick={() => setSelectedTier('pro')}>
              <div className="vaai-card-header">
                <div className="vaai-flex vaai-justify-between vaai-items-center">
                  <h3 className="vaai-card-title">Pro</h3>
                  {recommendedTier === 'pro' && (
                    <div className="vaai-badge vaai-badge-success">Recommended</div>
                  )}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--vaai-text-primary)' }}>
                  ${billingCycle === 'monthly' ? '29' : '24'}
                  <span style={{ fontSize: '1rem', fontWeight: '400' }}>
                    /{billingCycle === 'monthly' ? 'mo' : 'mo (billed annually)'}
                  </span>
                </div>
              </div>
              
              <p style={{ color: 'var(--vaai-text-secondary)', marginBottom: '1.5rem' }}>
                Perfect for professionals and small teams
              </p>

              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {tierBenefits.pro.map((benefit, index) => (
                  <li key={index} className="vaai-flex vaai-items-center vaai-gap-sm">
                    <div className="vaai-focus-icon" style={{ fontSize: '0.75rem' }}>✓</div>
                    <span style={{ fontSize: '0.875rem' }}>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprise Tier */}
            <div className={`vaai-card ${recommendedTier === 'enterprise' ? 'vaai-tier-enterprise' : ''}`} 
                 style={{ 
                   flex: 1, 
                   maxWidth: '300px',
                   cursor: 'pointer',
                   transform: recommendedTier === 'enterprise' ? 'scale(1.05)' : 'scale(1)',
                   transition: 'transform 0.2s ease'
                 }}
                 onClick={() => setSelectedTier('enterprise')}>
              <div className="vaai-card-header">
                <div className="vaai-flex vaai-justify-between vaai-items-center">
                  <h3 className="vaai-card-title">Enterprise</h3>
                  {recommendedTier === 'enterprise' && (
                    <div className="vaai-badge vaai-badge-success">Recommended</div>
                  )}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--vaai-text-primary)' }}>
                  ${billingCycle === 'monthly' ? '99' : '82'}
                  <span style={{ fontSize: '1rem', fontWeight: '400' }}>
                    /{billingCycle === 'monthly' ? 'mo' : 'mo (billed annually)'}
                  </span>
                </div>
              </div>
              
              <p style={{ color: 'var(--vaai-text-secondary)', marginBottom: '1.5rem' }}>
                For growing teams and power users
              </p>

              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {tierBenefits.enterprise.map((benefit, index) => (
                  <li key={index} className="vaai-flex vaai-items-center vaai-gap-sm">
                    <div className="vaai-focus-icon" style={{ fontSize: '0.75rem' }}>✓</div>
                    <span style={{ fontSize: '0.875rem' }}>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Value Proposition */}
          <div className="vaai-card" style={{ 
            marginTop: '2rem',
            background: 'var(--vaai-gradient-card)',
            textAlign: 'center'
          }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--vaai-text-primary)' }}>
              🚀 Transform Your Productivity
            </h4>
            <p style={{ margin: 0, color: 'var(--vaai-text-secondary)' }}>
              Join thousands of professionals who save 2+ hours daily with VAAI's intelligent automation.
              30-day money-back guarantee included.
            </p>
          </div>
        </div>

        <div className="vaai-modal-footer">
          <button 
            className="vaai-button vaai-button-ghost"
            onClick={onClose}
          >
            Maybe Later
          </button>
          <button 
            className="vaai-button vaai-button-primary"
            onClick={handleUpgrade}
          >
            Upgrade to {recommendedTier.charAt(0).toUpperCase() + recommendedTier.slice(1)} →
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionUpgradeModal;