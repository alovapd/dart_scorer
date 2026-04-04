// Dart Scorer - Stats API Routes
// Serves player stats for the dashboard

const express = require('express');
const { authenticate } = require('./pro-auth');
const stats = require('./stats');

const router = express.Router();

// All stats routes require authentication
router.use(authenticate);

// GET /api/stats — Overall summary
router.get('/', (req, res) => {
  const userId = req.proUser.sub;
  const user = stats.getProUserById(userId);
  const db = stats.getDb();

  // Overall stats
  const overall = db.prepare(`
    SELECT
      COUNT(*) as total_games,
      SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as wins,
      MIN(played_at) as first_game,
      MAX(played_at) as last_game
    FROM game_results WHERE user_id = ?
  `).get(userId);

  // X01 stats
  const x01 = db.prepare(`
    SELECT
      COUNT(*) as games,
      SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(x01_three_dart_avg), 2) as avg_three_dart,
      ROUND(AVG(x01_first_9_avg), 2) as avg_first_9,
      MAX(x01_highest_turn) as best_turn,
      MAX(x01_checkout_score) as best_checkout,
      SUM(x01_count_180) as total_180s,
      SUM(x01_count_140_plus) as total_140_plus,
      SUM(x01_count_100_plus) as total_100_plus,
      SUM(x01_darts_thrown) as total_darts,
      SUM(x01_bust_count) as total_busts,
      SUM(x01_checkout_hits) as checkout_hits,
      SUM(x01_checkout_attempts) as checkout_attempts
    FROM game_results WHERE user_id = ? AND game_type = 'x01'
  `).get(userId);

  // Cricket stats
  const cricket = db.prepare(`
    SELECT
      COUNT(*) as games,
      SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(cricket_marks_per_round), 2) as avg_marks_per_round,
      SUM(cricket_triples) as total_triples,
      SUM(cricket_doubles) as total_doubles,
      SUM(cricket_total_marks) as total_marks
    FROM game_results WHERE user_id = ? AND game_type = 'cricket'
  `).get(userId);

  // Around the Clock stats
  const atc = db.prepare(`
    SELECT
      COUNT(*) as games,
      SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(atc_hit_rate) * 100, 1) as avg_hit_rate_pct,
      MIN(CASE WHEN atc_completed = 1 THEN atc_darts_thrown END) as best_darts_to_finish
    FROM game_results WHERE user_id = ? AND game_type = 'around-the-clock'
  `).get(userId);

  res.json({
    tier: user.tier,
    overall,
    x01: x01.games > 0 ? x01 : null,
    cricket: cricket.games > 0 ? cricket : null,
    atc: atc.games > 0 ? atc : null,
  });
});

// GET /api/stats/games — Game history (paginated)
router.get('/games', (req, res) => {
  const userId = req.proUser.sub;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const gameType = req.query.type;

  let query = 'SELECT * FROM game_results WHERE user_id = ?';
  const params = [userId];

  if (gameType) {
    query += ' AND game_type = ?';
    params.push(gameType);
  }

  query += ' ORDER BY played_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const games = stats.getDb().prepare(query).all(...params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM game_results WHERE user_id = ?';
  const countParams = [userId];
  if (gameType) {
    countQuery += ' AND game_type = ?';
    countParams.push(gameType);
  }
  const total = stats.getDb().prepare(countQuery).get(...countParams).total;

  res.json({ games, total, limit, offset });
});

// GET /api/stats/trends — Improvement trends over time (Pro only)
router.get('/trends', (req, res) => {
  const userId = req.proUser.sub;
  const user = stats.getProUserById(userId);

  if (user.tier !== 'pro') {
    return res.status(403).json({ error: 'Pro subscription required', requiresPro: true });
  }

  const db = stats.getDb();

  // X01 average trend (per game, chronological)
  const x01Trend = db.prepare(`
    SELECT
      game_id,
      played_at,
      x01_three_dart_avg as avg,
      x01_first_9_avg as first_9,
      x01_highest_turn as best_turn,
      x01_darts_thrown as darts,
      x01_checkout_score as checkout,
      won
    FROM game_results
    WHERE user_id = ? AND game_type = 'x01'
    ORDER BY played_at ASC
  `).all(userId);

  // Cricket trend
  const cricketTrend = db.prepare(`
    SELECT
      game_id,
      played_at,
      cricket_marks_per_round as mpr,
      cricket_triples as triples,
      won
    FROM game_results
    WHERE user_id = ? AND game_type = 'cricket'
    ORDER BY played_at ASC
  `).all(userId);

  // Rolling averages (last 5 vs previous 5 for X01)
  let x01Improvement = null;
  if (x01Trend.length >= 4) {
    const recent = x01Trend.slice(-5);
    const earlier = x01Trend.slice(0, Math.min(5, x01Trend.length - 2));
    const recentAvg = recent.reduce((s, g) => s + g.avg, 0) / recent.length;
    const earlierAvg = earlier.reduce((s, g) => s + g.avg, 0) / earlier.length;
    x01Improvement = {
      recentAvg: Math.round(recentAvg * 100) / 100,
      earlierAvg: Math.round(earlierAvg * 100) / 100,
      change: Math.round((recentAvg - earlierAvg) * 100) / 100,
      improving: recentAvg > earlierAvg,
    };
  }

  res.json({
    x01Trend,
    cricketTrend,
    x01Improvement,
  });
});

// GET /api/stats/recent — Get recent games for logged-in user
router.get('/recent', (req, res) => {
  const games = stats.getRecentGames(req.proUser.sub);
  res.json({ games });
});

// POST /api/stats/recent — Save a recent game
router.post('/recent', (req, res) => {
  const { gameId, gameType, players } = req.body;
  if (!gameId || !gameType || !players) {
    return res.status(400).json({ error: 'gameId, gameType, and players required' });
  }
  stats.saveRecentGame(req.proUser.sub, { gameId, gameType, players });
  res.json({ success: true });
});

// DELETE /api/stats/recent/:gameId — Remove a recent game
router.delete('/recent/:gameId', (req, res) => {
  stats.removeRecentGame(req.proUser.sub, req.params.gameId);
  res.json({ success: true });
});

// GET /api/stats/insights — Personalized improvement suggestions (Pro only)
router.get('/insights', (req, res) => {
  const userId = req.proUser.sub;
  const user = stats.getProUserById(userId);

  if (user.tier !== 'pro') {
    return res.status(403).json({ error: 'Pro subscription required', requiresPro: true });
  }

  const db = stats.getDb();
  const insights = [];

  // === X01 Insights ===
  const x01Games = db.prepare(`
    SELECT * FROM game_results
    WHERE user_id = ? AND game_type = 'x01'
    ORDER BY played_at ASC
  `).all(userId);

  if (x01Games.length >= 2) {
    // Average trend
    const recentCount = Math.min(5, x01Games.length);
    const earlierCount = Math.min(5, x01Games.length - 1);
    const recent = x01Games.slice(-recentCount);
    const earlier = x01Games.slice(0, earlierCount);
    const recentAvg = recent.reduce((s, g) => s + (g.x01_three_dart_avg || 0), 0) / recent.length;
    const earlierAvg = earlier.reduce((s, g) => s + (g.x01_three_dart_avg || 0), 0) / earlier.length;
    const avgChange = recentAvg - earlierAvg;

    if (Math.abs(avgChange) >= 1) {
      if (avgChange > 0) {
        insights.push({
          type: 'positive',
          category: 'X01',
          title: 'Average is climbing',
          detail: `Your recent 3-dart average is ${recentAvg.toFixed(1)}, up from ${earlierAvg.toFixed(1)} in your earlier games. Keep it up!`,
        });
      } else {
        insights.push({
          type: 'attention',
          category: 'X01',
          title: 'Average trending down',
          detail: `Your recent 3-dart average is ${recentAvg.toFixed(1)}, down from ${earlierAvg.toFixed(1)}. Focus on consistent scoring — aim for treble 20 and avoid risky shots.`,
        });
      }
    }

    // Checkout analysis
    const totalCheckoutAttempts = x01Games.reduce((s, g) => s + (g.x01_checkout_attempts || 0), 0);
    const totalCheckoutHits = x01Games.reduce((s, g) => s + (g.x01_checkout_hits || 0), 0);
    const checkoutPct = totalCheckoutAttempts > 0 ? (totalCheckoutHits / totalCheckoutAttempts) * 100 : 0;

    if (totalCheckoutAttempts >= 3) {
      if (checkoutPct < 20) {
        insights.push({
          type: 'tip',
          category: 'X01',
          title: 'Checkout practice needed',
          detail: `Your checkout rate is ${checkoutPct.toFixed(0)}% (${totalCheckoutHits}/${totalCheckoutAttempts}). Practice your doubles — D16, D8, and D4 are the most forgiving since a miss still leaves a double.`,
        });
      } else if (checkoutPct >= 40) {
        insights.push({
          type: 'positive',
          category: 'X01',
          title: 'Strong finisher',
          detail: `Your checkout rate is ${checkoutPct.toFixed(0)}% — that's excellent. You're converting when it matters.`,
        });
      } else {
        insights.push({
          type: 'tip',
          category: 'X01',
          title: 'Doubles finishing',
          detail: `Your checkout rate is ${checkoutPct.toFixed(0)}%. Try to set up your favorite double early in the turn — leave yourself D20 or D16 when possible.`,
        });
      }
    }

    // Bust analysis
    const totalBusts = x01Games.reduce((s, g) => s + (g.x01_bust_count || 0), 0);
    const totalTurns = x01Games.reduce((s, g) => s + (g.x01_turns || 0), 0);
    const bustRate = totalTurns > 0 ? (totalBusts / totalTurns) * 100 : 0;

    if (totalBusts > 0 && bustRate > 15) {
      insights.push({
        type: 'attention',
        category: 'X01',
        title: 'Too many busts',
        detail: `You're busting ${bustRate.toFixed(0)}% of your turns (${totalBusts} out of ${totalTurns}). When you're under 100, calculate your out before throwing — don't just go for big scores.`,
      });
    } else if (totalTurns >= 10 && bustRate < 5) {
      insights.push({
        type: 'positive',
        category: 'X01',
        title: 'Clean scoring',
        detail: `Only ${bustRate.toFixed(0)}% bust rate — you're playing smart and avoiding costly mistakes.`,
      });
    }

    // First 9 vs overall comparison
    const avgFirst9 = x01Games.reduce((s, g) => s + (g.x01_first_9_avg || 0), 0) / x01Games.length;
    const avgOverall = x01Games.reduce((s, g) => s + (g.x01_three_dart_avg || 0), 0) / x01Games.length;

    if (x01Games.length >= 3 && avgFirst9 > 0 && avgOverall > 0) {
      const dropoff = avgFirst9 - avgOverall;
      if (dropoff > 8) {
        insights.push({
          type: 'tip',
          category: 'X01',
          title: 'Mid-game focus drop',
          detail: `Your first 9 darts average is ${avgFirst9.toFixed(1)} but your overall is ${avgOverall.toFixed(1)} — you're losing focus as the game goes on. Try to maintain your concentration through the middle legs.`,
        });
      } else if (dropoff < 2 && avgFirst9 > 30) {
        insights.push({
          type: 'positive',
          category: 'X01',
          title: 'Consistent throughout',
          detail: `Your first 9 average (${avgFirst9.toFixed(1)}) is close to your overall (${avgOverall.toFixed(1)}) — you're maintaining focus well across the whole game.`,
        });
      }
    }

    // 180s / high scores
    const total180s = x01Games.reduce((s, g) => s + (g.x01_count_180 || 0), 0);
    const total140 = x01Games.reduce((s, g) => s + (g.x01_count_140_plus || 0), 0);
    const total100 = x01Games.reduce((s, g) => s + (g.x01_count_100_plus || 0), 0);

    if (x01Games.length >= 5 && total100 === 0) {
      insights.push({
        type: 'tip',
        category: 'X01',
        title: 'Push for ton-plus',
        detail: `You haven't hit a 100+ turn yet across ${x01Games.length} games. Focus on hitting treble 20 — even one treble in a turn gets you to 80+. Two gets you over 100.`,
      });
    } else if (total180s > 0) {
      insights.push({
        type: 'positive',
        category: 'X01',
        title: 'Maximum!',
        detail: `You've hit ${total180s} perfect 180${total180s > 1 ? 's' : ''}! That's the mark of a serious player.`,
      });
    }

    // Darts per game efficiency
    const avgDarts = x01Games.reduce((s, g) => s + (g.x01_darts_thrown || 0), 0) / x01Games.length;
    const avgStartScore = x01Games[0].x01_start_score || 501;

    if (x01Games.length >= 3) {
      if (avgStartScore === 501 && avgDarts > 60) {
        insights.push({
          type: 'tip',
          category: 'X01',
          title: 'Work on efficiency',
          detail: `You're averaging ${avgDarts.toFixed(0)} darts per 501 game. Top club players average around 45-55. Focus on hitting trebles consistently to bring this down.`,
        });
      } else if (avgStartScore === 501 && avgDarts <= 40) {
        insights.push({
          type: 'positive',
          category: 'X01',
          title: 'Efficient scorer',
          detail: `Averaging ${avgDarts.toFixed(0)} darts per 501 — that's strong. You're finding the trebles consistently.`,
        });
      }
    }
  }

  // === Cricket Insights ===
  const cricketGames = db.prepare(`
    SELECT * FROM game_results
    WHERE user_id = ? AND game_type = 'cricket'
    ORDER BY played_at ASC
  `).all(userId);

  if (cricketGames.length >= 2) {
    const avgMPR = cricketGames.reduce((s, g) => s + (g.cricket_marks_per_round || 0), 0) / cricketGames.length;
    const totalTriples = cricketGames.reduce((s, g) => s + (g.cricket_triples || 0), 0);
    const totalMarks = cricketGames.reduce((s, g) => s + (g.cricket_total_marks || 0), 0);
    const tripleRate = totalMarks > 0 ? (totalTriples / totalMarks) * 100 : 0;

    if (avgMPR < 1.5) {
      insights.push({
        type: 'tip',
        category: 'Cricket',
        title: 'Marks per round',
        detail: `Your MPR is ${avgMPR.toFixed(2)} — aim for 2.0+. Focus on hitting your target number with all 3 darts rather than spreading across numbers.`,
      });
    } else if (avgMPR >= 2.5) {
      insights.push({
        type: 'positive',
        category: 'Cricket',
        title: 'Strong cricket game',
        detail: `${avgMPR.toFixed(2)} marks per round is solid. You're closing numbers efficiently.`,
      });
    }

    if (cricketGames.length >= 3 && tripleRate < 10) {
      insights.push({
        type: 'tip',
        category: 'Cricket',
        title: 'Go for triples',
        detail: `Only ${tripleRate.toFixed(0)}% of your marks are triples. Hitting triples closes numbers faster — practice your treble accuracy on 20, 19, and 18.`,
      });
    }
  }

  // === Around the Clock Insights ===
  const atcGames = db.prepare(`
    SELECT * FROM game_results
    WHERE user_id = ? AND game_type = 'around-the-clock'
    ORDER BY played_at ASC
  `).all(userId);

  if (atcGames.length >= 2) {
    const avgHitRate = atcGames.reduce((s, g) => s + (g.atc_hit_rate || 0), 0) / atcGames.length;

    if (avgHitRate < 0.3) {
      insights.push({
        type: 'tip',
        category: 'Around the Clock',
        title: 'Accuracy practice',
        detail: `Your hit rate is ${(avgHitRate * 100).toFixed(0)}%. Around the Clock is great practice for accuracy — try to slow down and focus on each target deliberately.`,
      });
    } else if (avgHitRate >= 0.5) {
      insights.push({
        type: 'positive',
        category: 'Around the Clock',
        title: 'Accurate darts',
        detail: `${(avgHitRate * 100).toFixed(0)}% hit rate — your accuracy across the board is strong. This translates directly to better X01 and Cricket performance.`,
      });
    }
  }

  // === General Insights ===
  const totalGames = x01Games.length + cricketGames.length + atcGames.length;

  if (totalGames === 0) {
    insights.push({
      type: 'info',
      category: 'General',
      title: 'Play some games!',
      detail: 'Start playing to get personalized insights and improvement suggestions based on your performance.',
    });
  } else if (totalGames >= 10) {
    const winCount = [...x01Games, ...cricketGames, ...atcGames].filter(g => g.won).length;
    const winRate = (winCount / totalGames) * 100;
    if (winRate >= 60) {
      insights.push({
        type: 'positive',
        category: 'General',
        title: 'Winning player',
        detail: `${winRate.toFixed(0)}% win rate across ${totalGames} games. You're consistently performing well.`,
      });
    }
  }

  // Only show games with few data points as needing more data
  if (totalGames > 0 && totalGames < 5) {
    insights.push({
      type: 'info',
      category: 'General',
      title: 'More data needed',
      detail: `You've played ${totalGames} game${totalGames > 1 ? 's' : ''}. Play a few more to unlock deeper insights and trend analysis.`,
    });
  }

  res.json({ insights });
});

// POST /api/stats/admin/set-tier — Manual tier toggle (for admin/testing)
// Protected by a simple admin key stored in data/.admin-key
router.post('/admin/set-tier', (req, res) => {
  const { email, tier, adminKey } = req.body;

  // Read admin key from file
  const fs = require('fs');
  const path = require('path');
  const keyPath = path.join(__dirname, '..', 'data', '.admin-key');
  if (!fs.existsSync(keyPath)) {
    return res.status(403).json({ error: 'Admin key not configured' });
  }
  const validKey = fs.readFileSync(keyPath, 'utf8').trim();
  if (!adminKey || adminKey !== validKey) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  if (!email || !['free', 'pro'].includes(tier)) {
    return res.status(400).json({ error: 'email and tier (free/pro) required' });
  }

  const user = stats.getProUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  stats.updateProUserTier(user.id, tier);
  res.json({ success: true, email, tier });
});

module.exports = router;
