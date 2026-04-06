// Dart Scorer - Pro Auth Routes
// Independent auth system for Pro player accounts

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const stats = require('./stats');
const { checkServiceByEmail } = require('../../../shared/billing-client');

const router = express.Router();
const SALT_ROUNDS = 12;

// JWT secret — persisted to disk so tokens survive restarts
const SECRET_PATH = path.join(__dirname, '..', 'data', '.jwt-secret');
let jwtSecret;
if (fs.existsSync(SECRET_PATH)) {
  jwtSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  jwtSecret = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(SECRET_PATH, jwtSecret);
}

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.display_name,
      tier: user.tier,
    },
    jwtSecret,
    { expiresIn: '30d' }
  );
}

// Auth middleware — attach to routes that need it
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, jwtSecret);
    req.proUser = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth — sets req.proUser if token present, doesn't fail if missing
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.proUser = jwt.verify(header.slice(7), jwtSecret);
    } catch (e) {
      // Invalid token, proceed without auth
    }
  }
  next();
}

// Check centralized billing and sync tier to local user
async function syncBillingStatus(user) {
  try {
    const billing = await checkServiceByEmail(user.email, 'dart-scorer-pro');
    if (billing.active) {
      const newTier = billing.status === 'trial' ? 'pro' : 'pro';
      if (user.tier !== newTier) {
        stats.updateProUserTier(user.id, newTier);
      }
      return newTier;
    }
  } catch (e) {
    // Centralized billing unreachable — use local tier
  }
  return user.tier;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  const existing = stats.getProUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const visitorId = req.cookies && req.cookies.oz_vid || null;
  const name = displayName || email.split('@')[0];

  const user = stats.createProUser({ email, passwordHash, displayName: name, visitorId });

  // Claim any games from this visitor's cookie
  let gamesClaimed = 0;
  if (visitorId) {
    gamesClaimed = stats.claimGamesForUser(user.id, visitorId);
  }

  const token = generateToken(user);
  stats.updateProUserLogin(user.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      tier: user.tier,
    },
    gamesClaimed,
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = stats.getProUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Link visitor cookie if not already linked
  const visitorId = req.cookies && req.cookies.oz_vid || null;
  let gamesClaimed = 0;
  if (visitorId) {
    // Update visitor on user record if they don't have one
    if (!user.visitor_id) {
      stats.updateProUserVisitor(user.id, visitorId);
    }
    gamesClaimed = stats.claimGamesForUser(user.id, visitorId);
  }

  // Sync tier from centralized billing on login
  const currentTier = await syncBillingStatus(user);
  const userForToken = { ...user, tier: currentTier };
  const token = generateToken(userForToken);
  stats.updateProUserLogin(user.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      tier: currentTier,
    },
    gamesClaimed,
  });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = stats.getProUserById(req.proUser.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Sync tier from centralized billing
  const currentTier = await syncBillingStatus(user);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      tier: currentTier,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan,
      trialEndsAt: user.trial_ends_at,
      createdAt: user.created_at,
    },
  });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  const { displayName, currentPassword, newPassword } = req.body;
  const user = stats.getProUserById(req.proUser.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (displayName) {
    stats.updateProUserProfile(user.id, { displayName });
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change password' });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    stats.getDb().prepare('UPDATE pro_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  }

  const updated = stats.getProUserById(user.id);
  const token = generateToken(updated);

  res.json({
    token,
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.display_name,
      tier: updated.tier,
    },
  });
});

// GET /api/auth/preferences — load user preferences
router.get('/preferences', authenticate, (req, res) => {
  const prefs = stats.getUserPreferences(req.proUser.sub);
  res.json({ preferences: prefs });
});

// PUT /api/auth/preferences — save user preferences
router.put('/preferences', authenticate, (req, res) => {
  const { preferences } = req.body;
  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'preferences object required' });
  }

  // Validate/whitelist allowed keys
  const allowed = [
    'dartSound', 'soundEnabled',
    'announcerEnabled', 'announcerLanguage', 'announcerVoice', 'announcerRate',
    'defaultGameType', 'defaultStartScore', 'defaultDoubleOut',
    'displayName',
  ];
  const clean = {};
  for (const key of allowed) {
    if (key in preferences) clean[key] = preferences[key];
  }

  // If display name changed, update it on the user record too
  if (clean.displayName) {
    stats.updateProUserProfile(req.proUser.sub, { displayName: clean.displayName });
  }

  stats.saveUserPreferences(req.proUser.sub, clean);
  res.json({ preferences: clean });
});

// GET /api/auth/visitor-games — check how many games a visitor has (pre-signup teaser)
router.get('/visitor-games', (req, res) => {
  const visitorId = req.cookies && req.cookies.oz_vid || null;
  const count = stats.countVisitorGames(visitorId);
  res.json({ count });
});

module.exports = router;
module.exports.authenticate = authenticate;
module.exports.optionalAuth = optionalAuth;
