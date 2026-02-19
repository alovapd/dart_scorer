const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3007;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory game storage
const games = new Map();
const gameClients = new Map(); // gameId -> Set<WebSocket>

// Generate 8-char game ID
function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Broadcast game update to all subscribers
function broadcastGameUpdate(gameId, data) {
  const clients = gameClients.get(gameId);
  if (clients) {
    const message = JSON.stringify({ type: 'gameUpdate', gameId, data });
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
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

// ─── API Routes ───────────────────────────────────────────

// Create new game
app.post('/api/game/new', (req, res) => {
  const { gameType, playerNames, settings } = req.body;

  if (!gameType || !playerNames || !Array.isArray(playerNames)) {
    return res.status(400).json({ error: 'gameType and playerNames required' });
  }
  if (playerNames.length < 2 || playerNames.length > 8) {
    return res.status(400).json({ error: '2-8 players required' });
  }
  const validTypes = ['x01', 'cricket', 'around-the-clock'];
  if (!validTypes.includes(gameType)) {
    return res.status(400).json({ error: 'Invalid game type' });
  }

  let gameId;
  do { gameId = generateGameId(); } while (games.has(gameId));

  try {
    const gameData = createGame(gameType, playerNames, settings || {});
    gameData.gameId = gameId;
    games.set(gameId, gameData);
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
    res.json(game);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Undo last turn
app.post('/api/game/:gameId/undo', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (!undoLastTurn(game)) {
    return res.status(400).json({ error: 'Nothing to undo' });
  }

  broadcastGameUpdate(req.params.gameId, game);
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
  res.json(game);
});

// Delete game
app.delete('/api/game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  if (!games.has(gameId)) return res.status(404).json({ error: 'Game not found' });

  games.delete(gameId);
  broadcastGameUpdate(gameId, { deleted: true });

  // Clean up subscribers
  if (gameClients.has(gameId)) {
    gameClients.delete(gameId);
  }

  res.json({ ok: true });
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── WebSocket ────────────────────────────────────────────

wss.on('connection', (ws) => {
  let currentGameId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'subscribe' && data.gameId) {
        // Unsubscribe from previous
        if (currentGameId && gameClients.has(currentGameId)) {
          gameClients.get(currentGameId).delete(ws);
          if (gameClients.get(currentGameId).size === 0) {
            gameClients.delete(currentGameId);
          }
        }

        currentGameId = data.gameId;
        if (!gameClients.has(currentGameId)) {
          gameClients.set(currentGameId, new Set());
        }
        gameClients.get(currentGameId).add(ws);
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on('close', () => {
    if (currentGameId && gameClients.has(currentGameId)) {
      gameClients.get(currentGameId).delete(ws);
      if (gameClients.get(currentGameId).size === 0) {
        gameClients.delete(currentGameId);
      }
    }
  });
});

// ─── Cleanup stale games (no activity for 24h) ───────────

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [gameId, game] of games) {
    const lastActivity = game.turns.length > 0
      ? new Date(game.turns[game.turns.length - 1].timestamp).getTime()
      : new Date(game.createdAt).getTime();
    if (lastActivity < cutoff) {
      games.delete(gameId);
      if (gameClients.has(gameId)) gameClients.delete(gameId);
    }
  }
}, 60 * 60 * 1000); // Check hourly

// ─── Start ────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Dart Scorer running on port ${PORT}`);
});
