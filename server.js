const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const { trackVisits } = require('../../shared/analytics');
const stats = require('./server/stats');
const proAuthRoutes = require('./server/pro-auth');
const { optionalAuth } = require('./server/pro-auth');
const statsApiRoutes = require('./server/stats-api');
const squareRoutes = require('./server/square');

const PORT = process.env.PORT || 3007;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cookieParser());
app.use(trackVisits('dart-scorer'));
app.use(express.json());

// No cache on sw.js so browser always checks for updates
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'allow',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Game storage — persisted to disk
const DATA_DIR = path.join(__dirname, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const games = new Map();

// Load games from disk on startup
function loadGames() {
  try {
    if (fs.existsSync(GAMES_FILE)) {
      const data = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
      for (const [id, game] of Object.entries(data)) {
        games.set(id, game);
      }
      console.log(`Loaded ${games.size} games from disk`);
    }
  } catch (e) {
    console.error('Failed to load games:', e.message);
  }
}

// Save games to disk
function saveGames() {
  try {
    const obj = Object.fromEntries(games);
    fs.writeFileSync(GAMES_FILE, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save games:', e.message);
  }
}

loadGames();

// Generate 8-char game ID
function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Broadcast game update to all subscribers in the room
function broadcastGameUpdate(gameId, data) {
  io.to(gameId).emit('gameUpdate', data);
}

// ─── Game Logic ───────────────────────────────────────────

function initX01Game(playerNames, settings) {
  const startScore = settings.startScore || 501;
  return {
    players: playerNames.map((name, i) => ({
      id: i + 1,
      name: name.trim().substring(0, 30),
      remaining: startScore,
      dartsThrown: 0,
      totalScore: 0, // total points scored (for averages)
    })),
  };
}

function initCricketGame(playerNames, settings) {
  const numbers = [15, 16, 17, 18, 19, 20, 25]; // 25 = Bull
  const teamPlay = settings.teamPlay && playerNames.length >= 4 && playerNames.length % 2 === 0;
  const teams = teamPlay ? [
    { id: 1, name: 'Team 1', playerIds: [], marks: {}, points: 0 },
    { id: 2, name: 'Team 2', playerIds: [], marks: {}, points: 0 },
  ] : null;

  if (teams) {
    numbers.forEach(n => {
      teams[0].marks[n] = 0;
      teams[1].marks[n] = 0;
    });
    // Alternate players into teams
    playerNames.forEach((_, i) => {
      teams[i % 2].playerIds.push(i + 1);
    });
  }

  return {
    players: playerNames.map((name, i) => ({
      id: i + 1,
      name: name.trim().substring(0, 30),
      marks: numbers.reduce((obj, n) => { obj[n] = 0; return obj; }, {}),
      points: 0,
      teamId: teams ? (i % 2) + 1 : null,
    })),
    teams,
    numbers,
  };
}

function initAroundTheClockGame(playerNames, settings) {
  const maxTarget = settings.includeBull ? 21 : 20;
  return {
    players: playerNames.map((name, i) => ({
      id: i + 1,
      name: name.trim().substring(0, 30),
      currentTarget: 1,
      completed: false,
      dartsThrown: 0,
    })),
    maxTarget,
  };
}

function createGame(gameType, playerNames, settings) {
  let gameSpecific;
  switch (gameType) {
    case 'x01': gameSpecific = initX01Game(playerNames, settings); break;
    case 'cricket': gameSpecific = initCricketGame(playerNames, settings); break;
    case 'around-the-clock': gameSpecific = initAroundTheClockGame(playerNames, settings); break;
    default: throw new Error('Invalid game type');
  }

  return {
    gameType,
    settings,
    ...gameSpecific,
    turns: [],
    currentPlayerIndex: 0,
    gameActive: true,
    winner: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── X01 Turn Processing ──────────────────────────────────

function processX01Turn(game, playerId, darts) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  const turnTotal = darts.reduce((sum, d) => sum + d.score, 0);
  const dartsCount = darts.length;

  // Check bust
  let bust = false;
  const newRemaining = player.remaining - turnTotal;

  if (game.settings.doubleOut) {
    // Must finish on a double, and can't go below 0 or to 1
    if (newRemaining < 0 || newRemaining === 1) {
      bust = true;
    } else if (newRemaining === 0) {
      const lastDart = darts[darts.length - 1];
      if (lastDart.multiplier !== 2) bust = true;
    }
  } else {
    if (newRemaining < 0) bust = true;
  }

  const turn = {
    playerId,
    playerName: player.name,
    darts,
    turnTotal,
    bust,
    previousRemaining: player.remaining,
    timestamp: new Date().toISOString(),
  };

  if (!bust) {
    player.remaining = newRemaining;
    player.totalScore += turnTotal;
  }
  player.dartsThrown += dartsCount;

  game.turns.push(turn);

  // Check winner
  if (!bust && player.remaining === 0) {
    game.gameActive = false;
    game.winner = player.name;
    game.winnerId = player.id;
    game.endedAt = new Date().toISOString();
  } else {
    advancePlayer(game);
  }

  return turn;
}

// ─── Cricket Turn Processing ──────────────────────────────

function processCricketTurn(game, playerId, darts) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  const scoringMode = game.settings.scoringMode;
  const teamPlay = !!game.teams;
  const team = teamPlay ? game.teams.find(t => t.id === player.teamId) : null;

  const turnDetails = [];

  for (const dart of darts) {
    const num = dart.number; // 15-20 or 25
    if (!game.numbers.includes(num)) continue;

    const marks = dart.multiplier || 1; // 1=single, 2=double, 3=triple (bull max 2)

    // Get current marks source (team or player)
    const marksSource = teamPlay ? team.marks : player.marks;
    const prevMarks = marksSource[num];

    // Check if number is already closed by ALL opponents
    let closedByAllOpponents;
    if (teamPlay) {
      const otherTeam = game.teams.find(t => t.id !== team.id);
      closedByAllOpponents = otherTeam.marks[num] >= 3;
    } else {
      closedByAllOpponents = game.players
        .filter(p => p.id !== playerId)
        .every(p => p.marks[num] >= 3);
    }

    if (prevMarks >= 3 && closedByAllOpponents) {
      // Number fully closed — no effect
      turnDetails.push({ number: num, marks: 0, points: 0 });
      continue;
    }

    let marksAdded = 0;
    let pointsScored = 0;

    if (prevMarks < 3) {
      const marksToClose = 3 - prevMarks;
      marksAdded = Math.min(marks, marksToClose);
      const overflow = marks - marksAdded;

      marksSource[num] = prevMarks + marksAdded;

      // Overflow marks score points if scoring mode and opponents haven't closed
      if (scoringMode && overflow > 0 && !closedByAllOpponents) {
        const pointValue = num === 25 ? 25 : num;
        pointsScored = overflow * pointValue;
        if (teamPlay) {
          team.points += pointsScored;
        } else {
          player.points += pointsScored;
        }
      }
    } else {
      // Already closed by us, but not by all opponents
      if (scoringMode && !closedByAllOpponents) {
        const pointValue = num === 25 ? 25 : num;
        pointsScored = marks * pointValue;
        if (teamPlay) {
          team.points += pointsScored;
        } else {
          player.points += pointsScored;
        }
      }
      marksAdded = 0;
    }

    turnDetails.push({ number: num, marks: marksAdded, points: pointsScored });
  }

  const turn = {
    playerId,
    playerName: player.name,
    darts,
    details: turnDetails,
    timestamp: new Date().toISOString(),
  };
  game.turns.push(turn);

  // Check winner
  if (teamPlay) {
    for (const t of game.teams) {
      const allClosed = game.numbers.every(n => t.marks[n] >= 3);
      if (allClosed) {
        if (!scoringMode) {
          game.gameActive = false;
          game.winner = t.name;
          game.endedAt = new Date().toISOString();
          break;
        } else {
          // Must also have >= points than other team
          const otherTeam = game.teams.find(ot => ot.id !== t.id);
          if (t.points >= otherTeam.points) {
            game.gameActive = false;
            game.winner = t.name;
            game.endedAt = new Date().toISOString();
            break;
          }
        }
      }
    }
  } else {
    for (const p of game.players) {
      const allClosed = game.numbers.every(n => p.marks[n] >= 3);
      if (allClosed) {
        if (!scoringMode) {
          game.gameActive = false;
          game.winner = p.name;
          game.winnerId = p.id;
          game.endedAt = new Date().toISOString();
          break;
        } else {
          const maxOtherPoints = Math.max(...game.players.filter(op => op.id !== p.id).map(op => op.points));
          if (p.points >= maxOtherPoints) {
            game.gameActive = false;
            game.winner = p.name;
            game.winnerId = p.id;
            game.endedAt = new Date().toISOString();
            break;
          }
        }
      }
    }
  }

  if (game.gameActive) advancePlayer(game);
  return turn;
}

// ─── Around the Clock Turn Processing ─────────────────────

function processAroundTheClockTurn(game, playerId, darts) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  const hits = [];
  for (const dart of darts) {
    if (dart.hit && player.currentTarget <= game.maxTarget) {
      hits.push(player.currentTarget);
      player.currentTarget++;
    }
    player.dartsThrown++;
  }

  const turn = {
    playerId,
    playerName: player.name,
    darts,
    hits,
    timestamp: new Date().toISOString(),
  };
  game.turns.push(turn);

  // Check winner
  if (player.currentTarget > game.maxTarget) {
    player.completed = true;
    game.gameActive = false;
    game.winner = player.name;
    game.winnerId = player.id;
    game.endedAt = new Date().toISOString();
  } else {
    advancePlayer(game);
  }

  return turn;
}

function advancePlayer(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
}

// ─── Undo Logic ───────────────────────────────────────────

function undoLastTurn(game) {
  if (game.turns.length === 0) return false;

  const lastTurn = game.turns.pop();

  // Re-activate game if it was ended
  if (!game.gameActive) {
    game.gameActive = true;
    game.winner = null;
    game.winnerId = null;
    game.endedAt = null;
  }

  const player = game.players.find(p => p.id === lastTurn.playerId);
  if (!player) return false;

  switch (game.gameType) {
    case 'x01': {
      if (!lastTurn.bust) {
        player.remaining = lastTurn.previousRemaining;
        player.totalScore -= lastTurn.turnTotal;
      }
      player.dartsThrown -= lastTurn.darts.length;
      break;
    }
    case 'cricket': {
      // Reverse marks and points from the turn details
      const teamPlay = !!game.teams;
      const team = teamPlay ? game.teams.find(t => t.id === player.teamId) : null;
      const marksSource = teamPlay ? team.marks : player.marks;
      const pointsSource = teamPlay ? team : player;

      for (const detail of lastTurn.details) {
        marksSource[detail.number] = Math.max(0, marksSource[detail.number] - detail.marks);
        pointsSource.points -= detail.points;
      }
      break;
    }
    case 'around-the-clock': {
      // Reverse hits
      player.currentTarget -= lastTurn.hits.length;
      player.dartsThrown -= lastTurn.darts.length;
      player.completed = false;
      break;
    }
  }

  // Go back to previous player
  game.currentPlayerIndex = game.players.findIndex(p => p.id === lastTurn.playerId);
  return true;
}

// ─── AI Dart Generation ──────────────────────────────────

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const VIRTUAL_NAMES = [
  'Ace', 'Blaze', 'Chip', 'Dash', 'Edge', 'Finn', 'Hawk', 'Jazz',
  'Knox', 'Lance', 'Max', 'Nash', 'Pike', 'Quinn', 'Rex', 'Slate',
  'Troy', 'Vex', 'Wade', 'Zane', 'Arrow', 'Bolt', 'Colt', 'Duke',
  'Flint', 'Griff', 'Hugo', 'Jax', 'Kane', 'Lucky', 'Maverick',
  'Nix', 'Onyx', 'Phoenix', 'Rogue', 'Sage', 'Thorn', 'Viper', 'Wolf',
];

function randomVirtualName() {
  return VIRTUAL_NAMES[Math.floor(Math.random() * VIRTUAL_NAMES.length)];
}

const AI_PROFILES = {
  easy:         { x01Avg: 26, cricketHitRate: 0.30, cricketTripleRate: 0.03, cricketDoubleRate: 0.08, atcHitRate: 0.25, checkoutRate: 0.10 },
  average:      { x01Avg: 42, cricketHitRate: 0.50, cricketTripleRate: 0.08, cricketDoubleRate: 0.15, atcHitRate: 0.45, checkoutRate: 0.25 },
  hard:         { x01Avg: 60, cricketHitRate: 0.70, cricketTripleRate: 0.18, cricketDoubleRate: 0.22, atcHitRate: 0.65, checkoutRate: 0.45 },
  professional: { x01Avg: 80, cricketHitRate: 0.85, cricketTripleRate: 0.30, cricketDoubleRate: 0.25, atcHitRate: 0.80, checkoutRate: 0.65 },
};

function makeDart(number, multiplier) {
  const score = number * multiplier;
  const prefixes = { 0: '', 1: '', 2: 'D', 3: 'T' };
  let label;
  if (number === 0) label = 'Miss';
  else if (number === 25) label = multiplier === 2 ? 'D-Bull' : 'Bull';
  else label = `${prefixes[multiplier]}${number}`;
  return { number, multiplier, score, label };
}

function scoreToDart(targetScore) {
  if (targetScore <= 0) return makeDart(0, 0);
  if (targetScore === 50) return makeDart(25, 2);
  if (targetScore === 25) return makeDart(25, 1);
  // Try triple
  if (targetScore % 3 === 0 && targetScore / 3 <= 20) return makeDart(targetScore / 3, 3);
  // Try double
  if (targetScore % 2 === 0 && targetScore / 2 <= 20) return makeDart(targetScore / 2, 2);
  // Single
  if (targetScore <= 20) return makeDart(targetScore, 1);
  // Larger values: pick closest clean option
  if (targetScore <= 40 && targetScore % 2 === 0) return makeDart(targetScore / 2, 2);
  // Triple range
  if (targetScore <= 60 && targetScore % 3 === 0) return makeDart(targetScore / 3, 3);
  // Fallback: T20
  return makeDart(20, 3);
}

function aiX01ScoringDart(profile) {
  const perDartAvg = profile.x01Avg / 3;
  // Generate score with variance around the per-dart average
  const variance = (Math.random() - 0.5) * perDartAvg * 1.5;
  const raw = Math.round(perDartAvg + variance);
  const score = Math.max(0, Math.min(raw, 60));
  return scoreToDart(score);
}

// Common double-out checkouts for AI
const CHECKOUT_TABLE = {
  170: [{ n: 20, m: 3 }, { n: 20, m: 3 }, { n: 25, m: 2 }],
  164: [{ n: 20, m: 3 }, { n: 18, m: 3 }, { n: 25, m: 2 }],
  160: [{ n: 20, m: 3 }, { n: 20, m: 3 }, { n: 20, m: 2 }],
  // Single-dart finishes (doubles)
};

function aiX01CheckoutDart(remaining, profile, dartsLeft) {
  // Direct double finish
  if (remaining <= 40 && remaining % 2 === 0) {
    if (Math.random() < profile.checkoutRate) {
      return makeDart(remaining / 2, 2);
    }
    // Missed the double — hit single or miss
    const r = Math.random();
    if (r < 0.4) return makeDart(remaining / 2, 1); // hit single instead of double
    if (r < 0.7) return makeDart(0, 0); // miss
    const adj = Math.max(1, remaining / 2 + Math.floor(Math.random() * 5) - 2);
    return makeDart(Math.min(adj, 20), 1);
  }
  // Double bull (50)
  if (remaining === 50) {
    if (Math.random() < profile.checkoutRate * 0.7) {
      return makeDart(25, 2);
    }
    return Math.random() < 0.5 ? makeDart(25, 1) : makeDart(0, 0);
  }
  // Need to set up for a double — reduce to even number ≤40
  if (dartsLeft > 1 && remaining <= 60) {
    const setupTarget = remaining - (remaining % 2 === 0 ? 0 : 1);
    // Aim to leave a double-able number
    if (remaining % 2 === 1) {
      // Hit a single odd number to leave even
      const single = Math.min(remaining - 2, 19);
      if (single > 0 && Math.random() < profile.checkoutRate + 0.3) {
        return makeDart(single, 1);
      }
    }
  }
  // Default: throw a scoring dart that won't bust
  return aiX01SafeDart(remaining, profile);
}

function aiX01SafeDart(remaining, profile) {
  // Throw a scoring dart but don't exceed remaining
  const maxSafe = remaining - 2; // leave at least 2 for a double
  if (maxSafe <= 0) return makeDart(0, 0);
  const dart = aiX01ScoringDart(profile);
  if (dart.score > maxSafe) {
    // Tone it down
    return scoreToDart(Math.min(Math.floor(maxSafe * 0.5), 20));
  }
  return dart;
}

function generateAIX01Darts(game, player, difficulty) {
  const profile = AI_PROFILES[difficulty];
  const darts = [];
  let remaining = player.remaining;
  const doubleOut = game.settings.doubleOut;

  for (let i = 0; i < 3; i++) {
    if (remaining <= 0) {
      darts.push(makeDart(0, 0));
      continue;
    }

    let dart;
    const dartsLeft = 3 - i;

    if (doubleOut && remaining <= 170) {
      dart = aiX01CheckoutDart(remaining, profile, dartsLeft);
    } else if (!doubleOut && remaining <= 60) {
      // Straight out — just try to hit the number
      if (Math.random() < profile.checkoutRate) {
        dart = scoreToDart(remaining);
      } else {
        dart = aiX01ScoringDart(profile);
      }
    } else {
      dart = aiX01ScoringDart(profile);
    }

    // Bust check for double-out: don't let AI go to 1 or below 0
    if (doubleOut) {
      const newRem = remaining - dart.score;
      if (newRem < 0 || newRem === 1) {
        dart = makeDart(0, 0); // miss instead of busting
      }
    } else {
      if (remaining - dart.score < 0) {
        dart = makeDart(0, 0);
      }
    }

    remaining -= dart.score;
    darts.push(dart);
  }

  return darts;
}

function generateAICricketDarts(game, player, difficulty) {
  const profile = AI_PROFILES[difficulty];
  const darts = [];

  // Strategy: close highest unclosed numbers first, then score points
  const unclosed = game.numbers.filter(n => player.marks[n] < 3).sort((a, b) => b - a);
  const scoreable = game.numbers.filter(n => {
    if (player.marks[n] < 3) return false;
    return game.players.some(p => !p.isAI && p.marks[n] < 3);
  }).sort((a, b) => b - a);

  const targets = unclosed.length > 0 ? unclosed : scoreable;

  for (let i = 0; i < 3; i++) {
    const target = targets[i % targets.length] || game.numbers[0];

    if (Math.random() < profile.cricketHitRate) {
      // Hit the target
      let mult = 1;
      if (target !== 25) {
        const r = Math.random();
        if (r < profile.cricketTripleRate) mult = 3;
        else if (r < profile.cricketTripleRate + profile.cricketDoubleRate) mult = 2;
      } else {
        mult = Math.random() < profile.cricketDoubleRate ? 2 : 1;
      }
      const prefixes = { 1: '', 2: 'D', 3: 'T' };
      const label = target === 25
        ? (mult === 2 ? 'D-Bull' : 'Bull')
        : `${prefixes[mult]}${target}`;
      darts.push({ number: target, multiplier: mult, label });
    } else {
      // Miss — either hit a random cricket number or miss entirely
      if (Math.random() < 0.35) {
        const rn = game.numbers[Math.floor(Math.random() * game.numbers.length)];
        const label = rn === 25 ? 'Bull' : `${rn}`;
        darts.push({ number: rn, multiplier: 1, label });
      } else {
        darts.push({ number: 0, multiplier: 0, label: 'Miss' });
      }
    }
  }

  return darts;
}

function generateAIATCDarts(game, player, difficulty) {
  const profile = AI_PROFILES[difficulty];
  const darts = [];
  let target = player.currentTarget;

  for (let i = 0; i < 3; i++) {
    if (target > game.maxTarget) {
      darts.push({ hit: false });
      continue;
    }
    const hit = Math.random() < profile.atcHitRate;
    darts.push({ hit });
    if (hit) target++;
  }

  return darts;
}

function generateAIDarts(game, difficulty) {
  const player = game.players[game.currentPlayerIndex];
  switch (game.gameType) {
    case 'x01': return generateAIX01Darts(game, player, difficulty);
    case 'cricket': return generateAICricketDarts(game, player, difficulty);
    case 'around-the-clock': return generateAIATCDarts(game, player, difficulty);
    default: return [];
  }
}

// ─── Stats Persistence ───────────────────────────────────

function saveGameStats(game) {
  if (game.gameActive || game.turns.length === 0) return;

  const visitorMap = {};
  const visitorId = game.visitorId || null;
  // Use pro user ID from game, or look up from visitor map
  const userId = game.proUserId || (visitorId ? stats.getUserForVisitor(visitorId) : null);

  for (const player of game.players) {
    if (!player.isAI) {
      visitorMap[player.id] = { visitorId, userId };
    }
  }

  stats.extractAndSave(game, visitorMap);
}

// ─── API Routes ───────────────────────────────────────────

// Create new game
app.post('/api/game/new', optionalAuth, (req, res) => {
  const { gameType, playerNames, settings, playMode, aiDifficulty } = req.body;

  if (!gameType || !playerNames || !Array.isArray(playerNames)) {
    return res.status(400).json({ error: 'gameType and playerNames required' });
  }

  const mode = playMode || 'multiplayer';
  const validModes = ['multiplayer', 'solo', 'vs-computer'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: 'Invalid play mode' });
  }

  if (mode === 'solo') {
    if (playerNames.length !== 1) {
      return res.status(400).json({ error: 'Solo mode requires exactly 1 player' });
    }
  } else if (mode === 'vs-computer') {
    if (playerNames.length !== 1) {
      return res.status(400).json({ error: 'vs Computer mode requires exactly 1 player name' });
    }
    const validDiffs = ['easy', 'average', 'hard', 'professional'];
    if (aiDifficulty && !validDiffs.includes(aiDifficulty)) {
      return res.status(400).json({ error: 'Invalid AI difficulty' });
    }
  } else {
    if (playerNames.length < 2 || playerNames.length > 8) {
      return res.status(400).json({ error: '2-8 players required' });
    }
  }

  const validTypes = ['x01', 'cricket', 'around-the-clock'];
  if (!validTypes.includes(gameType)) {
    return res.status(400).json({ error: 'Invalid game type' });
  }

  // For vs-computer, add virtual player with random name
  const diff = aiDifficulty || 'average';
  const virtualName = mode === 'vs-computer' ? randomVirtualName() : null;
  const finalPlayerNames = mode === 'vs-computer'
    ? [...playerNames, virtualName]
    : playerNames;

  let gameId;
  do { gameId = generateGameId(); } while (games.has(gameId));

  try {
    const gameData = createGame(gameType, finalPlayerNames, settings || {});
    gameData.gameId = gameId;
    gameData.playMode = mode;
    gameData.aiDifficulty = mode === 'vs-computer' ? diff : null;

    // Mark AI player
    if (mode === 'vs-computer') {
      gameData.players[1].isAI = true;
    }

    // Tag with visitor ID and pro user for stats tracking
    gameData.visitorId = req.cookies && req.cookies.oz_vid || null;
    gameData.proUserId = req.proUser ? req.proUser.sub : null;

    games.set(gameId, gameData);
    saveGames();
    res.json(gameData);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get game state
app.get('/api/game/:gameId', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Record a throw/turn
app.post('/api/game/:gameId/throw', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!game.gameActive) return res.status(400).json({ error: 'Game is over' });

  const { playerId, darts } = req.body;
  if (!playerId || !darts || !Array.isArray(darts)) {
    return res.status(400).json({ error: 'playerId and darts required' });
  }

  try {
    switch (game.gameType) {
      case 'x01': processX01Turn(game, playerId, darts); break;
      case 'cricket': processCricketTurn(game, playerId, darts); break;
      case 'around-the-clock': processAroundTheClockTurn(game, playerId, darts); break;
    }
    broadcastGameUpdate(req.params.gameId, game);
    saveGames();
    if (!game.gameActive) saveGameStats(game);
    res.json(game);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generate AI darts (returns darts without processing the turn)
app.post('/api/game/:gameId/ai-turn', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!game.gameActive) return res.status(400).json({ error: 'Game is over' });
  if (game.playMode !== 'vs-computer') return res.status(400).json({ error: 'Not a vs-computer game' });

  const currentPlayer = game.players[game.currentPlayerIndex];
  if (!currentPlayer.isAI) return res.status(400).json({ error: 'Not AI turn' });

  const darts = generateAIDarts(game, game.aiDifficulty || 'average');
  res.json({ darts });
});

// Undo last turn
app.post('/api/game/:gameId/undo', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (!undoLastTurn(game)) {
    return res.status(400).json({ error: 'Nothing to undo' });
  }

  broadcastGameUpdate(req.params.gameId, game);
  saveGames();
  res.json(game);
});

// End game early
app.post('/api/game/:gameId/end', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  game.gameActive = false;
  game.endedAt = new Date().toISOString();
  game.endedEarly = true;

  // Determine leader
  switch (game.gameType) {
    case 'x01': {
      const sorted = [...game.players].sort((a, b) => a.remaining - b.remaining);
      game.winner = sorted[0].name;
      game.winnerId = sorted[0].id;
      break;
    }
    case 'cricket': {
      if (game.teams) {
        const sorted = [...game.teams].sort((a, b) => {
          const aClosed = game.numbers.filter(n => a.marks[n] >= 3).length;
          const bClosed = game.numbers.filter(n => b.marks[n] >= 3).length;
          if (bClosed !== aClosed) return bClosed - aClosed;
          return b.points - a.points;
        });
        game.winner = sorted[0].name;
      } else {
        const sorted = [...game.players].sort((a, b) => {
          const aClosed = game.numbers.filter(n => a.marks[n] >= 3).length;
          const bClosed = game.numbers.filter(n => b.marks[n] >= 3).length;
          if (bClosed !== aClosed) return bClosed - aClosed;
          return b.points - a.points;
        });
        game.winner = sorted[0].name;
        game.winnerId = sorted[0].id;
      }
      break;
    }
    case 'around-the-clock': {
      const sorted = [...game.players].sort((a, b) => b.currentTarget - a.currentTarget);
      game.winner = sorted[0].name;
      game.winnerId = sorted[0].id;
      break;
    }
  }

  broadcastGameUpdate(req.params.gameId, game);
  saveGames();
  saveGameStats(game);
  res.json(game);
});

// Delete game
app.delete('/api/game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  if (!games.has(gameId)) return res.status(404).json({ error: 'Game not found' });

  games.delete(gameId);
  saveGames();
  broadcastGameUpdate(gameId, { deleted: true });

  res.json({ ok: true });
});

// ─── Pro Auth & Stats Routes ─────────────────────────────

app.use('/api/auth', proAuthRoutes);
app.use('/api/stats', statsApiRoutes);
// Legacy Square routes (webhook fallback during transition)
app.use('/api/webhooks', squareRoutes);

// Billing proxy — forwards subscribe to portal centralized billing
const { authenticate: proAuth } = require('./server/pro-auth');
app.post('/api/billing/subscribe', proAuth, async (req, res) => {
  const { cardToken } = req.body;
  const user = stats.getProUserById(req.proUser.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    // First, ensure user has an OzAuth account (created during migration)
    const portalUrl = 'http://localhost:5439';
    const apiKey = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'employee', 'data', '.internal-api-key'), 'utf8').trim();

    // Use the portal's internal subscribe endpoint
    const proxyRes = await fetch(portalUrl + '/api/billing/check-by-email?email=' + encodeURIComponent(user.email) + '&service=dart-scorer-pro', {
      headers: { 'X-Internal-API-Key': apiKey },
    });
    const check = await proxyRes.json();

    // If already active, just sync locally
    if (check.active) {
      stats.updateProUserTier(user.id, 'pro');
      return res.json({ success: true, trial: false });
    }

    // Forward subscribe to portal — need OzAuth user ID
    // Find OzAuth user by email
    const findRes = await fetch(portalUrl + '/api/billing/check-by-email?email=' + encodeURIComponent(user.email) + '&service=dart-scorer-pro', {
      headers: { 'X-Internal-API-Key': apiKey },
    });

    // Use admin add-service endpoint via internal key
    const addRes = await fetch(portalUrl + '/api/billing/subscribe-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': apiKey },
      body: JSON.stringify({ email: user.email, serviceSlug: 'dart-scorer-pro', cardToken }),
    });
    const data = await addRes.json();
    if (!addRes.ok) throw new Error(data.error || 'Subscription failed');

    // Sync tier locally
    stats.updateProUserTier(user.id, 'pro');

    res.json({ success: true, trial: data.trial || false, trialEndsAt: data.trialEndsAt });
  } catch (e) {
    console.error('Billing proxy error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Socket.io ───────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('subscribe', (gameId) => {
    // Leave all previous game rooms (keep socket's own room)
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    socket.join(gameId);
  });
});

// ─── Cleanup stale games (no activity for 24h) ───────────

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [gameId, game] of games) {
    const lastActivity = game.turns.length > 0
      ? new Date(game.turns[game.turns.length - 1].timestamp).getTime()
      : new Date(game.createdAt).getTime();
    if (lastActivity < cutoff) {
      games.delete(gameId);
      changed = true;
    }
  }
  if (changed) saveGames();
}, 60 * 60 * 1000); // Check hourly

// ─── Expire cancelled subscriptions past their paid period ─

setInterval(() => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const expired = stats.getDb().prepare(`
      UPDATE pro_users SET tier = 'free'
      WHERE subscription_status = 'CANCELED'
        AND tier = 'pro'
        AND subscription_end IS NOT NULL
        AND subscription_end <= ?
    `).run(today);
    if (expired.changes > 0) {
      console.log(`Downgraded ${expired.changes} expired cancelled subscription(s)`);
    }
  } catch (e) {
    // Non-critical
  }
}, 60 * 60 * 1000); // Check hourly

// ─── Start ────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Dart Scorer running on port ${PORT}`);
});
