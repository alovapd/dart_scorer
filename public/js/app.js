// ─── Dart Scorer — Core SPA ───────────────────────────────

let gameData = null;
let currentGameId = null;
let ws = null;
let wsReconnectTimer = null;
let selectedGameType = 'x01';
let playerCount = 2;

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  // Remove and re-add to restart animation
  const clone = toast.cloneNode(true);
  toast.parentNode.replaceChild(clone, toast);
}

// ─── Screen Navigation ────────────────────────────────────

function showLandingPage() {
  document.getElementById('landingPage').classList.remove('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  window.location.hash = '';
  renderRecentGames();
}

function showSetupScreen() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  selectedGameType = 'x01';
  playerCount = 2;
  renderSetup();
}

function showGameScreen() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');
}

// ─── Setup Screen ─────────────────────────────────────────

function selectGameType(type) {
  selectedGameType = type;
  document.querySelectorAll('.game-type-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });
  renderSettings();
}

function renderSetup() {
  renderSettings();
  renderPlayerInputs();
}

function renderSettings() {
  const container = document.getElementById('gameSettings');
  switch (selectedGameType) {
    case 'x01': container.innerHTML = X01.getSettingsHTML(); break;
    case 'cricket': container.innerHTML = Cricket.getSettingsHTML(); break;
    case 'around-the-clock': container.innerHTML = AroundTheClock.getSettingsHTML(); break;
  }
}

function renderPlayerInputs() {
  const container = document.getElementById('playerInputs');
  let html = '';
  for (let i = 1; i <= playerCount; i++) {
    html += `
      <div class="player-input-row">
        <span class="player-number">${i}</span>
        <input type="text" class="input player-name-input" placeholder="Player ${i}" maxlength="30" />
        ${playerCount > 2 ? `<button class="remove-player-btn" onclick="removePlayer(${i})">&times;</button>` : ''}
      </div>
    `;
  }
  container.innerHTML = html;

  const addBtn = document.getElementById('addPlayerBtn');
  if (addBtn) addBtn.style.display = playerCount >= 8 ? 'none' : '';
}

function addPlayerInput() {
  if (playerCount >= 8) return;
  playerCount++;
  renderPlayerInputs();
}

function removePlayer(index) {
  if (playerCount <= 2) return;
  const inputs = document.querySelectorAll('.player-name-input');
  const names = Array.from(inputs).map(input => input.value);
  names.splice(index - 1, 1);
  playerCount--;
  renderPlayerInputs();
  // Restore names
  const newInputs = document.querySelectorAll('.player-name-input');
  names.forEach((name, i) => { if (newInputs[i]) newInputs[i].value = name; });
}

async function startGame() {
  const inputs = document.querySelectorAll('.player-name-input');
  const playerNames = Array.from(inputs).map((input, i) => input.value.trim() || `Player ${i + 1}`);

  if (playerNames.length < 2) {
    showToast('Need at least 2 players');
    return;
  }

  let settings;
  switch (selectedGameType) {
    case 'x01': settings = X01.getSettings(); break;
    case 'cricket': settings = Cricket.getSettings(); break;
    case 'around-the-clock': settings = AroundTheClock.getSettings(); break;
  }

  // Validate team play requires even number
  if (selectedGameType === 'cricket' && settings.teamPlay && playerNames.length % 2 !== 0) {
    showToast('Team play needs an even number of players');
    return;
  }

  try {
    const response = await fetch('/api/game/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: selectedGameType, playerNames, settings }),
    });
    if (!response.ok) {
      const err = await response.json();
      showToast(err.error || 'Failed to create game');
      return;
    }
    gameData = await response.json();
    currentGameId = gameData.gameId;
    saveRecentGame(currentGameId, gameData);
    subscribeToGame(currentGameId);
    window.location.hash = '/game/' + currentGameId;
    showGameScreen();
    renderGame();
  } catch (e) {
    showToast('Failed to create game');
  }
}

// ─── Join Game ────────────────────────────────────────────

function joinGame() {
  const input = document.getElementById('joinCodeInput');
  let code = input.value.trim();
  if (!code) return;

  // Extract game ID from URL if pasted
  const match = code.match(/[A-Za-z0-9]{8}/);
  if (match) {
    code = match[0].toUpperCase();
  }

  window.location.hash = '/game/' + code;
  input.value = '';
}

// ─── Game Rendering ───────────────────────────────────────

function renderGame() {
  if (!gameData || !currentGameId) {
    showLandingPage();
    return;
  }

  showGameScreen();

  // Game type badge
  const typeNames = { 'x01': 'X01', 'cricket': 'Cricket', 'around-the-clock': 'Around the Clock' };
  document.getElementById('gameTypeBadge').textContent = typeNames[gameData.gameType] || gameData.gameType;
  document.getElementById('gameCodeDisplay').textContent = currentGameId;

  // Winner banner
  const banner = document.getElementById('winnerBanner');
  if (gameData.winner) {
    banner.innerHTML = (gameData.endedEarly ? 'Game Over! ' : 'Winner! ') + escapeHtml(gameData.winner);
    banner.classList.remove('hidden');
    document.getElementById('gameActions').style.display = 'none';
  } else {
    banner.classList.add('hidden');
    document.getElementById('gameActions').style.display = '';
  }

  // Delegate to game module
  const module = getGameModule();
  module.renderScoreboard(gameData);
  module.renderTurnInput(gameData);

  // Turn history
  const historyHtml = module.renderHistory(gameData);
  document.getElementById('turnHistory').innerHTML = historyHtml;
}

function getGameModule() {
  if (!gameData) return X01;
  switch (gameData.gameType) {
    case 'x01': return X01;
    case 'cricket': return Cricket;
    case 'around-the-clock': return AroundTheClock;
    default: return X01;
  }
}

// ─── Game Actions ─────────────────────────────────────────

async function undoTurn() {
  if (!currentGameId) return;
  try {
    const response = await fetch('/api/game/' + currentGameId + '/undo', { method: 'POST' });
    if (!response.ok) {
      const err = await response.json();
      showToast(err.error || 'Nothing to undo');
      return;
    }
    gameData = await response.json();
    getGameModule().resetInput();
    renderGame();
  } catch (e) {
    showToast('Failed to undo');
  }
}

async function endGameEarly() {
  if (!currentGameId || !confirm('End this game early?')) return;
  try {
    const response = await fetch('/api/game/' + currentGameId + '/end', { method: 'POST' });
    if (!response.ok) return;
    gameData = await response.json();
    renderGame();
  } catch (e) {
    showToast('Failed to end game');
  }
}

async function deleteGame() {
  if (!currentGameId || !confirm('Delete this game permanently?')) return;
  try {
    await fetch('/api/game/' + currentGameId, { method: 'DELETE' });
    removeRecentGame(currentGameId);
    leaveGame();
  } catch (e) {
    showToast('Failed to delete');
  }
}

function leaveGame() {
  currentGameId = null;
  gameData = null;
  getGameModule().resetInput();
  showLandingPage();
}

// ─── Share / Copy ─────────────────────────────────────────

function copyGameLink() {
  const url = window.location.origin + '/#/game/' + currentGameId;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
  } else {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('Link copied!');
  }
}

// ─── Rules Modal ──────────────────────────────────────────

function showRulesModal() {
  if (!gameData) return;
  const module = getGameModule();
  const typeNames = { 'x01': 'X01 Rules', 'cricket': 'Cricket Rules', 'around-the-clock': 'Around the Clock Rules' };
  document.getElementById('rulesModalTitle').textContent = typeNames[gameData.gameType] || 'Rules';
  document.getElementById('rulesModalBody').innerHTML = module.getRulesHTML(gameData.settings);
  document.getElementById('rulesModal').classList.add('active');
}

function hideRulesModal() {
  document.getElementById('rulesModal').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('rulesModal').addEventListener('click', function(e) {
  if (e.target === this) hideRulesModal();
});

// ─── Recent Games (localStorage) ──────────────────────────

function getRecentGames() {
  try {
    return JSON.parse(localStorage.getItem('dart_scorer_recent')) || [];
  } catch (e) {
    return [];
  }
}

function saveRecentGame(gameId, game) {
  const recent = getRecentGames().filter(g => g.gameId !== gameId);
  recent.unshift({
    gameId,
    gameType: game.gameType,
    players: game.players.map(p => p.name),
    lastVisited: new Date().toISOString(),
  });
  localStorage.setItem('dart_scorer_recent', JSON.stringify(recent.slice(0, 10)));
}

function removeRecentGame(gameId) {
  const recent = getRecentGames().filter(g => g.gameId !== gameId);
  localStorage.setItem('dart_scorer_recent', JSON.stringify(recent));
}

function renderRecentGames() {
  const recent = getRecentGames();
  const section = document.getElementById('recentGamesSection');
  const list = document.getElementById('recentGamesList');

  if (recent.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  const typeNames = { 'x01': 'X01', 'cricket': 'Cricket', 'around-the-clock': 'Around the Clock' };

  list.innerHTML = recent.map(g => `
    <li onclick="window.location.hash='/game/${escapeHtml(g.gameId)}'">
      <div class="recent-game-info">
        <div class="recent-game-type">${typeNames[g.gameType] || g.gameType}</div>
        <div class="recent-game-players">${g.players.map(n => escapeHtml(n)).join(', ')}</div>
      </div>
      <span class="recent-game-code">${escapeHtml(g.gameId)}</span>
    </li>
  `).join('');
}

// ─── WebSocket ────────────────────────────────────────────

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + window.location.host);

  ws.onopen = function() {
    updateConnectionStatus(true);
    if (currentGameId) {
      ws.send(JSON.stringify({ type: 'subscribe', gameId: currentGameId }));
    }
  };

  ws.onmessage = function(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'gameUpdate' && message.gameId === currentGameId) {
        if (message.data.deleted) {
          showToast('Game has been deleted');
          removeRecentGame(currentGameId);
          leaveGame();
        } else {
          gameData = message.data;
          renderGame();
          showToast('Game updated');
        }
      }
    } catch (e) {
      // ignore
    }
  };

  ws.onclose = function() {
    updateConnectionStatus(false);
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = function() {
    updateConnectionStatus(false);
  };
}

function subscribeToGame(gameId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', gameId }));
  }
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.classList.toggle('connected', connected);
  el.querySelector('.status-text').textContent = connected ? 'Connected' : 'Disconnected';
  // Only show on game screen
  el.style.display = currentGameId ? '' : 'none';
}

// ─── Router ───────────────────────────────────────────────

function getGameIdFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#\/game\/([A-Za-z0-9]{8})$/);
  return match ? match[1].toUpperCase() : null;
}

async function handleRoute() {
  const gameId = getGameIdFromHash();

  if (gameId) {
    currentGameId = gameId;
    try {
      const response = await fetch('/api/game/' + gameId);
      if (!response.ok) throw new Error('Not found');
      gameData = await response.json();
      saveRecentGame(gameId, gameData);
      subscribeToGame(gameId);
      renderGame();
    } catch (e) {
      showToast('Game not found');
      currentGameId = null;
      gameData = null;
      showLandingPage();
    }
  } else {
    currentGameId = null;
    gameData = null;
    // Reset all game module inputs
    X01.resetInput();
    Cricket.resetInput();
    AroundTheClock.resetInput();
    showLandingPage();
  }

  updateConnectionStatus(ws && ws.readyState === WebSocket.OPEN);
}

window.addEventListener('hashchange', handleRoute);

// ─── Init ─────────────────────────────────────────────────

window.onload = function() {
  connectWebSocket();
  renderRecentGames();
  handleRoute();
};

// Handle Enter key on join input
document.getElementById('joinCodeInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') joinGame();
});
