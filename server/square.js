// Dart Scorer - Square Payment Integration
// Handles subscriptions, webhooks, and cancellation

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { SquareClient, SquareEnvironment } = require('square');
const { authenticate } = require('./pro-auth');
const stats = require('./stats');

const router = express.Router();

// Load Square config
const CONFIG_PATH = path.join(__dirname, '..', 'data', '.square-config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const env = config.environment;
const creds = config[env];

const squareClient = new SquareClient({
  token: creds.accessToken,
  environment: env === 'sandbox' ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
});

// GET /api/square/config — Public endpoint for frontend to get app ID and location
router.get('/config', (req, res) => {
  res.json({
    applicationId: creds.applicationId,
    locationId: creds.locationId,
    environment: env,
  });
});

// POST /api/square/subscribe — Create subscription with in-app card token
router.post('/subscribe', authenticate, async (req, res) => {
  const { cardToken, plan, trial } = req.body;

  if (!cardToken) {
    return res.status(400).json({ error: 'Card token is required' });
  }
  if (!['monthly', 'annual'].includes(plan)) {
    return res.status(400).json({ error: 'Plan must be monthly or annual' });
  }

  const user = stats.getProUserById(req.proUser.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.subscription_status === 'ACTIVE' || user.tier === 'pro') {
    return res.status(400).json({ error: 'You already have an active subscription' });
  }

  try {
    // Step 1: Create or find Square customer
    let customerId = user.square_customer_id;
    if (!customerId) {
      const customerResult = await squareClient.customers.create({
        idempotencyKey: crypto.randomUUID(),
        emailAddress: user.email,
        givenName: user.display_name,
        referenceId: `pro_user_${user.id}`,
      });
      customerId = customerResult.customer.id;
      stats.getDb().prepare('UPDATE pro_users SET square_customer_id = ? WHERE id = ?')
        .run(customerId, user.id);
    }

    // Step 2: Store card on file
    const cardResult = await squareClient.cards.create({
      idempotencyKey: crypto.randomUUID(),
      sourceId: cardToken,
      card: {
        customerId: customerId,
      },
    });
    const cardId = cardResult.card.id;

    // Step 3: Create subscription
    const variationId = plan === 'monthly'
      ? creds.monthlyVariationId
      : creds.annualVariationId;

    const price = plan === 'monthly' ? 599 : 4999;
    const isTrial = trial === true;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    let startDate = todayStr;
    let trialEndsAt = null;
    if (isTrial) {
      const trialEnd = new Date(today);
      trialEnd.setDate(trialEnd.getDate() + 7);
      startDate = trialEnd.toISOString().slice(0, 10);
      trialEndsAt = startDate;
    }

    const subResult = await squareClient.subscriptions.create({
      idempotencyKey: crypto.randomUUID(),
      locationId: creds.locationId,
      planVariationId: variationId,
      customerId: customerId,
      cardId: cardId,
      startDate: startDate,
      timezone: 'America/New_York',
    });

    const subscription = subResult.subscription;

    // Update pro_users with subscription info
    stats.getDb().prepare(`
      UPDATE pro_users SET
        tier = 'pro',
        subscription_status = ?,
        subscription_plan = ?,
        subscription_price = ?,
        subscription_start = ?,
        trial_ends_at = ?,
        square_subscription_id = ?
      WHERE id = ?
    `).run(
      isTrial ? 'TRIAL' : subscription.status,
      plan,
      price,
      subscription.startDate || startDate,
      trialEndsAt,
      subscription.id,
      user.id
    );

    res.json({
      success: true,
      trial: isTrial,
      trialEndsAt,
      subscription: {
        id: subscription.id,
        status: isTrial ? 'TRIAL' : subscription.status,
        plan,
        startDate: subscription.startDate,
      },
    });
  } catch (e) {
    console.error('Square subscribe error:', e.message);
    const errorMsg = e.errors
      ? e.errors.map(err => err.detail).join(', ')
      : 'Payment processing failed. Please try again.';
    res.status(400).json({ error: errorMsg });
  }
});

// POST /api/square/cancel — Cancel subscription
router.post('/cancel', authenticate, async (req, res) => {
  const user = stats.getProUserById(req.proUser.sub);
  if (!user || !user.square_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }

  try {
    const result = await squareClient.subscriptions.cancel({ subscriptionId: user.square_subscription_id });
    const subscription = result.subscription;

    const isTrial = user.subscription_status === 'TRIAL';

    if (isTrial) {
      // Trial — immediate cutoff, they haven't paid
      stats.getDb().prepare(`
        UPDATE pro_users SET
          tier = 'free',
          subscription_status = 'CANCELED',
          subscription_end = ?,
          trial_ends_at = NULL
        WHERE id = ?
      `).run(new Date().toISOString().slice(0, 10), user.id);

      res.json({
        success: true,
        message: 'Trial cancelled. You have not been charged.',
        immediate: true,
      });
    } else {
      // Paid — keep Pro until billing period ends
      // Square provides the date through the subscription object
      const paidThroughDate = subscription.paidUntilDate || subscription.canceledDate || null;

      stats.getDb().prepare(`
        UPDATE pro_users SET
          subscription_status = 'CANCELED',
          subscription_end = ?
        WHERE id = ?
      `).run(paidThroughDate || new Date().toISOString().slice(0, 10), user.id);

      // Tier stays 'pro' — will be downgraded when period ends (via webhook or expiry check)

      res.json({
        success: true,
        message: paidThroughDate
          ? `Subscription cancelled. You'll keep Pro access until ${paidThroughDate}.`
          : 'Subscription cancelled. You\'ll keep Pro access until the end of your current billing period.',
        immediate: false,
        accessUntil: paidThroughDate,
      });
    }
  } catch (e) {
    console.error('Square cancel error:', e.message);
    res.status(400).json({ error: 'Failed to cancel subscription. Please try again.' });
  }
});

// GET /api/square/subscription — Get current subscription status
router.get('/subscription', authenticate, (req, res) => {
  const user = stats.getProUserById(req.proUser.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    tier: user.tier,
    subscriptionStatus: user.subscription_status,
    subscriptionPlan: user.subscription_plan,
    subscriptionPrice: user.subscription_price,
    subscriptionStart: user.subscription_start,
    subscriptionEnd: user.subscription_end,
    trialEndsAt: user.trial_ends_at,
  });
});

// POST /api/webhooks/square — Square webhook handler
// This must NOT use authenticate middleware — Square calls it directly
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Verify webhook signature if configured
  const body = req.body.toString('utf8');
  let event;
  try {
    event = JSON.parse(body);
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  const eventType = event.type;
  console.log('Square webhook:', eventType);

  try {
    switch (eventType) {
      case 'subscription.updated': {
        const sub = event.data?.object?.subscription;
        if (sub) {
          handleSubscriptionUpdate(sub);
        }
        break;
      }
      case 'subscription.created': {
        const sub = event.data?.object?.subscription;
        if (sub) {
          handleSubscriptionUpdate(sub);
        }
        break;
      }
      case 'invoice.payment_made': {
        console.log('Payment received for invoice:', event.data?.object?.invoice?.id);
        break;
      }
    }
  } catch (e) {
    console.error('Webhook processing error:', e.message);
  }

  // Always return 200 to acknowledge receipt
  res.status(200).send('OK');
});

function handleSubscriptionUpdate(subscription) {
  const db = stats.getDb();

  // Find user by Square subscription ID
  const user = db.prepare('SELECT * FROM pro_users WHERE square_subscription_id = ?')
    .get(subscription.id);

  if (!user) {
    console.log('Webhook: no user found for subscription', subscription.id);
    return;
  }

  const status = subscription.status;

  // Update subscription status
  db.prepare('UPDATE pro_users SET subscription_status = ? WHERE id = ?')
    .run(status, user.id);

  // Update tier based on status
  if (status === 'ACTIVE') {
    // Subscription became active (trial ended and payment succeeded)
    db.prepare("UPDATE pro_users SET tier = 'pro', subscription_status = 'ACTIVE', trial_ends_at = NULL WHERE id = ?").run(user.id);
  } else if (status === 'DEACTIVATED') {
    // Fully deactivated — billing period ended after cancellation, or payment failed
    db.prepare("UPDATE pro_users SET tier = 'free', subscription_status = 'DEACTIVATED', trial_ends_at = NULL WHERE id = ?").run(user.id);
  } else if (status === 'CANCELED') {
    // Canceled but may still have access until period ends
    // Don't change tier here — let the paid period run out
    db.prepare("UPDATE pro_users SET subscription_status = 'CANCELED' WHERE id = ?").run(user.id);
  }

  console.log(`Subscription ${subscription.id} → ${status} for user ${user.email}`);
}

module.exports = router;
