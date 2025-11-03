const express = require('express');

const router = express.Router();

const SUBSCRIPTION_TIERS = {
  solo: {
    name: 'Solo',
    monthly_price: 29,
    annual_price: 290,
    seats_included: 1,
    best_for: 'Individual operators who need AI assistance with inbox triage and follow-ups.',
    highlights: [
      'Daily briefing and AI follow-up queue',
      'Google Calendar & Tasks sync',
      'Up to 100 automated actions per month',
      'Email summaries, meeting prep, and task creation',
      'Standard email support'
    ],
    limits: {
      assistant_actions: '100 / month',
      teams: 1,
      storage_days: 30
    }
  },
  business: {
    name: 'Business',
    monthly_price: 99,
    annual_price: 990,
    seats_included: 5,
    best_for: 'Teams that need shared workflows, reporting, and higher automation limits.',
    highlights: [
      'Everything in Solo, plus shared follow-up queue',
      'Team dashboards & revenue analytics',
      '1,000 automated actions pooled per month',
      'Priority support and onboarding session',
      'Optional seat add-ons'
    ],
    limits: {
      assistant_actions: '1,000 pooled / month',
      teams: 'Unlimited',
      storage_days: 180
    }
  }
};

router.get('/subscription-tiers', (req, res) => {
  res.json({
    currency: 'USD',
    billing_options: ['monthly', 'annual'],
    tiers: SUBSCRIPTION_TIERS
  });
});

module.exports = router;
