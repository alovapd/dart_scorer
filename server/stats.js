// Dart Scorer - Player Stats Module
// Extracts and persists game statistics for Pro player profiles

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'player_stats.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        visitor_id TEXT,
        user_id INTEGER,
        player_name TEXT NOT NULL,
        game_type TEXT NOT NULL,
        game_settings TEXT,
        play_mode TEXT,
        played_at TEXT NOT NULL,
        won INTEGER NOT NULL DEFAULT 0,

        -- X01
        x01_start_score INTEGER,
        x01_three_dart_avg REAL,
        x01_first_9_avg REAL,
        x01_darts_thrown INTEGER,
        x01_turns INTEGER,
        x01_highest_turn INTEGER,
        x01_count_180 INTEGER,
        x01_count_140_plus INTEGER,
        x01_count_100_plus INTEGER,
        x01_count_60_plus INTEGER,
        x01_checkout_score INTEGER,
        x01_checkout_attempts INTEGER,
        x01_checkout_hits INTEGER,
        x01_bust_count INTEGER,

        -- Cricket
        cricket_marks_per_round REAL,
        cricket_total_marks INTEGER,
        cricket_triples INTEGER,
        cricket_doubles INTEGER,
        cricket_points INTEGER,
        cricket_turns INTEGER,

        -- Around the Clock
        atc_darts_thrown INTEGER,
        atc_hit_rate REAL,
        atc_completed INTEGER,

        UNIQUE(game_id, player_name)
      );

      CREATE INDEX IF NOT EXISTS idx_results_visitor ON game_results(visitor_id);
      CREATE INDEX IF NOT EXISTS idx_results_user ON game_results(user_id);
      CREATE INDEX IF NOT EXISTS idx_results_played ON game_results(played_at);

      CREATE TABLE IF NOT EXISTS visitor_user_map (
        visitor_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pro_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT,
        visitor_id TEXT,

        -- Account tier
        tier TEXT NOT NULL DEFAULT 'free',

        -- Subscription (for future Square integration)
        subscription_status TEXT,
        subscription_plan TEXT,
        subscription_price INTEGER,
        subscription_start TEXT,
        subscription_end TEXT,
        trial_ends_at TEXT,
        square_customer_id TEXT,
        square_subscription_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pro_users_email ON pro_users(email);
      CREATE INDEX IF NOT EXISTS idx_pro_users_visitor ON pro_users(visitor_id);

      CREATE TABLE IF NOT EXISTS recent_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        game_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        players TEXT NOT NULL,
        last_visited TEXT NOT NULL,
        UNIQUE(user_id, game_id)
      );
      CREATE INDEX IF NOT EXISTS idx_recent_user ON recent_games(user_id);

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY,
        prefs TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS pending_subscriptions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        plan TEXT NOT NULL,
        price INTEGER NOT NULL,
        trial INTEGER NOT NULL DEFAULT 0,
        customer_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

// Extract stats from a completed game and persist them
function extractAndSave(game, visitorMap) {
  const d = getDb();

  // visitorMap: { playerId: { visitorId, userId } }
  // Skip AI players
  const humanPlayers = game.players.filter(p => !p.isAI);

  const insert = d.prepare(`
    INSERT OR IGNORE INTO game_results (
      game_id, visitor_id, user_id, player_name, game_type, game_settings,
      play_mode, played_at, won,
      x01_start_score, x01_three_dart_avg, x01_first_9_avg,
      x01_darts_thrown, x01_turns, x01_highest_turn,
      x01_count_180, x01_count_140_plus, x01_count_100_plus, x01_count_60_plus,
      x01_checkout_score, x01_checkout_attempts, x01_checkout_hits, x01_bust_count,
      cricket_marks_per_round, cricket_total_marks, cricket_triples, cricket_doubles,
      cricket_points, cricket_turns,
      atc_darts_thrown, atc_hit_rate, atc_completed
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?
    )
  `);

  const saveAll = d.transaction(() => {
    for (const player of humanPlayers) {
      const mapping = visitorMap[player.id] || {};
      const stats = extractPlayerStats(game, player);

      insert.run(
        game.gameId,
        mapping.visitorId || null,
        mapping.userId || null,
        player.name,
        game.gameType,
        JSON.stringify(game.settings || {}),
        game.playMode || 'multiplayer',
        game.endedAt || game.createdAt,
        stats.won ? 1 : 0,
        // X01
        stats.x01StartScore, stats.x01ThreeDartAvg, stats.x01First9Avg,
        stats.x01DartsThrown, stats.x01Turns, stats.x01HighestTurn,
        stats.x01Count180, stats.x01Count140Plus, stats.x01Count100Plus, stats.x01Count60Plus,
        stats.x01CheckoutScore, stats.x01CheckoutAttempts, stats.x01CheckoutHits, stats.x01BustCount,
        // Cricket
        stats.cricketMarksPerRound, stats.cricketTotalMarks, stats.cricketTriples,
        stats.cricketDoubles, stats.cricketPoints, stats.cricketTurns,
        // ATC
        stats.atcDartsThrown, stats.atcHitRate, stats.atcCompleted
      );
    }
  });

  try {
    saveAll();
  } catch (e) {
    console.error('Stats save error:', e.message);
  }
}

function extractPlayerStats(game, player) {
  const playerTurns = game.turns.filter(t => t.playerId === player.id);
  const won = game.winner === player.name;

  const base = {
    won,
    x01StartScore: null, x01ThreeDartAvg: null, x01First9Avg: null,
    x01DartsThrown: null, x01Turns: null, x01HighestTurn: null,
    x01Count180: null, x01Count140Plus: null, x01Count100Plus: null, x01Count60Plus: null,
    x01CheckoutScore: null, x01CheckoutAttempts: null, x01CheckoutHits: null, x01BustCount: null,
    cricketMarksPerRound: null, cricketTotalMarks: null, cricketTriples: null,
    cricketDoubles: null, cricketPoints: null, cricketTurns: null,
    atcDartsThrown: null, atcHitRate: null, atcCompleted: null,
  };

  if (game.gameType === 'x01') {
    return { ...base, ...extractX01Stats(game, player, playerTurns, won) };
  } else if (game.gameType === 'cricket') {
    return { ...base, ...extractCricketStats(game, player, playerTurns, won) };
  } else if (game.gameType === 'around-the-clock') {
    return { ...base, ...extractATCStats(game, player, playerTurns, won) };
  }

  return base;
}

function extractX01Stats(game, player, turns, won) {
  const startScore = game.settings.startScore || 501;
  let totalDarts = 0;
  let totalScore = 0;
  let highestTurn = 0;
  let count180 = 0, count140 = 0, count100 = 0, count60 = 0;
  let bustCount = 0;
  let checkoutAttempts = 0, checkoutHits = 0;
  let checkoutScore = null;
  let first9Score = 0, first9Darts = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const dartCount = turn.darts.length;
    totalDarts += dartCount;

    if (turn.bust) {
      bustCount++;
      // Still count first-9 darts even on busts
      if (i < 3) {
        first9Darts += dartCount;
      }
      continue;
    }

    const score = turn.turnTotal;
    totalScore += score;

    if (score > highestTurn) highestTurn = score;
    if (score === 180) count180++;
    if (score >= 140) count140++;
    if (score >= 100) count100++;
    if (score >= 60) count60++;

    // First 9 darts (first 3 turns)
    if (i < 3) {
      first9Score += score;
      first9Darts += dartCount;
    }

    // Checkout tracking: was the player in finishing range?
    const remaining = turn.previousRemaining;
    if (game.settings.doubleOut && remaining <= 170) {
      checkoutAttempts++;
      if (remaining - score === 0) {
        checkoutHits++;
        checkoutScore = remaining;
      }
    } else if (!game.settings.doubleOut && remaining <= 60) {
      checkoutAttempts++;
      if (remaining - score === 0) {
        checkoutHits++;
        checkoutScore = remaining;
      }
    }
  }

  const threeDartAvg = turns.length > 0 ? Math.round((totalScore / turns.length) * 100) / 100 : 0;
  const first9Avg = first9Darts > 0 ? Math.round((first9Score / Math.min(3, turns.length)) * 100) / 100 : 0;

  return {
    x01StartScore: startScore,
    x01ThreeDartAvg: threeDartAvg,
    x01First9Avg: first9Avg,
    x01DartsThrown: totalDarts,
    x01Turns: turns.length,
    x01HighestTurn: highestTurn,
    x01Count180: count180,
    x01Count140Plus: count140,
    x01Count100Plus: count100,
    x01Count60Plus: count60,
    x01CheckoutScore: checkoutScore,
    x01CheckoutAttempts: checkoutAttempts,
    x01CheckoutHits: checkoutHits,
    x01BustCount: bustCount,
  };
}

function extractCricketStats(game, player, turns, won) {
  let totalMarks = 0;
  let triples = 0, doubles = 0;

  for (const turn of turns) {
    if (!turn.details) continue;
    for (const detail of turn.details) {
      totalMarks += detail.marks;
    }
    for (const dart of turn.darts) {
      if (dart.multiplier === 3) triples++;
      if (dart.multiplier === 2) doubles++;
    }
  }

  const marksPerRound = turns.length > 0 ? Math.round((totalMarks / turns.length) * 100) / 100 : 0;

  return {
    cricketMarksPerRound: marksPerRound,
    cricketTotalMarks: totalMarks,
    cricketTriples: triples,
    cricketDoubles: doubles,
    cricketPoints: player.points || 0,
    cricketTurns: turns.length,
  };
}

function extractATCStats(game, player, turns, won) {
  let totalDarts = 0;
  let totalHits = 0;

  for (const turn of turns) {
    totalDarts += turn.darts.length;
    totalHits += turn.hits ? turn.hits.length : 0;
  }

  const hitRate = totalDarts > 0 ? Math.round((totalHits / totalDarts) * 10000) / 10000 : 0;

  return {
    atcDartsThrown: totalDarts,
    atcHitRate: hitRate,
    atcCompleted: player.completed ? 1 : 0,
  };
}

// Link a visitor to a user account (called when user signs in)
function linkVisitorToUser(visitorId, userId) {
  const d = getDb();
  d.prepare('INSERT OR REPLACE INTO visitor_user_map (visitor_id, user_id) VALUES (?, ?)').run(visitorId, userId);
  d.prepare('UPDATE game_results SET user_id = ? WHERE visitor_id = ? AND user_id IS NULL').run(userId, visitorId);
}

// Get user ID for a visitor (if mapped)
function getUserForVisitor(visitorId) {
  const d = getDb();
  const row = d.prepare('SELECT user_id FROM visitor_user_map WHERE visitor_id = ?').get(visitorId);
  return row ? row.user_id : null;
}

// Query stats for a user
function getPlayerStats(userId) {
  const d = getDb();
  return d.prepare('SELECT * FROM game_results WHERE user_id = ? ORDER BY played_at DESC').all(userId);
}

// === Pro User Management ===

function createProUser({ email, passwordHash, displayName, visitorId }) {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO pro_users (email, password_hash, display_name, visitor_id)
    VALUES (?, ?, ?, ?)
  `).run(email, passwordHash, displayName, visitorId || null);
  return getProUserById(result.lastInsertRowid);
}

function getProUserByEmail(email) {
  return getDb().prepare('SELECT * FROM pro_users WHERE email = ?').get(email);
}

function getProUserById(id) {
  return getDb().prepare('SELECT * FROM pro_users WHERE id = ?').get(id);
}

function updateProUserLogin(id) {
  getDb().prepare("UPDATE pro_users SET last_login = datetime('now') WHERE id = ?").run(id);
}

function updateProUserVisitor(id, visitorId) {
  getDb().prepare('UPDATE pro_users SET visitor_id = ? WHERE id = ?').run(visitorId, id);
}

function updateProUserProfile(id, { displayName }) {
  getDb().prepare('UPDATE pro_users SET display_name = ? WHERE id = ?').run(displayName, id);
}

function updateProUserTier(id, tier) {
  getDb().prepare('UPDATE pro_users SET tier = ? WHERE id = ?').run(tier, id);
}

// Claim games: link visitor's games to pro user account
function claimGamesForUser(userId, visitorId) {
  const d = getDb();
  // Update visitor_user_map
  d.prepare('INSERT OR REPLACE INTO visitor_user_map (visitor_id, user_id) VALUES (?, ?)').run(visitorId, userId);
  // Claim any unlinked games from this visitor
  const result = d.prepare('UPDATE game_results SET user_id = ? WHERE visitor_id = ? AND user_id IS NULL').run(userId, visitorId);
  return result.changes;
}

// Count games for a visitor (for pre-signup teaser)
function countVisitorGames(visitorId) {
  if (!visitorId) return 0;
  const row = getDb().prepare('SELECT COUNT(*) as count FROM game_results WHERE visitor_id = ?').get(visitorId);
  return row ? row.count : 0;
}

// === Recent Games (server-synced) ===

function saveRecentGame(userId, { gameId, gameType, players }) {
  const d = getDb();
  d.prepare(`
    INSERT INTO recent_games (user_id, game_id, game_type, players, last_visited)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, game_id) DO UPDATE SET last_visited = datetime('now')
  `).run(userId, gameId, gameType, JSON.stringify(players));

  // Keep only last 20
  d.prepare(`
    DELETE FROM recent_games WHERE user_id = ? AND id NOT IN (
      SELECT id FROM recent_games WHERE user_id = ? ORDER BY last_visited DESC LIMIT 20
    )
  `).run(userId, userId);
}

function getRecentGames(userId) {
  return getDb().prepare(`
    SELECT game_id, game_type, players, last_visited
    FROM recent_games
    WHERE user_id = ?
    ORDER BY last_visited DESC
    LIMIT 20
  `).all(userId).map(row => ({
    gameId: row.game_id,
    gameType: row.game_type,
    players: JSON.parse(row.players),
    lastVisited: row.last_visited,
  }));
}

function removeRecentGame(userId, gameId) {
  getDb().prepare('DELETE FROM recent_games WHERE user_id = ? AND game_id = ?').run(userId, gameId);
}

// === User Preferences ===

function getUserPreferences(userId) {
  const d = getDb();
  const row = d.prepare('SELECT prefs FROM user_preferences WHERE user_id = ?').get(userId);
  if (!row) return {};
  try { return JSON.parse(row.prefs); } catch (e) { return {}; }
}

function saveUserPreferences(userId, prefs) {
  const d = getDb();
  d.prepare(`
    INSERT INTO user_preferences (user_id, prefs) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs
  `).run(userId, JSON.stringify(prefs));
}

module.exports = {
  extractAndSave,
  linkVisitorToUser,
  getUserForVisitor,
  getPlayerStats,
  getDb,
  createProUser,
  getProUserByEmail,
  getProUserById,
  updateProUserLogin,
  updateProUserVisitor,
  updateProUserProfile,
  updateProUserTier,
  claimGamesForUser,
  countVisitorGames,
  saveRecentGame,
  getRecentGames,
  removeRecentGame,
  getUserPreferences,
  saveUserPreferences,
};
