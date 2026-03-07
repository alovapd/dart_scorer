// ─── Dart Scorer — Core SPA ───────────────────────────────

let gameData = null;
let currentGameId = null;
let socket = null;
let selectedGameType = 'x01';
let playerCount = 2;
let selectedPlayMode = 'multiplayer';
let selectedDifficulty = 'average';

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  // Remove and re-add to restart animation
  const clone = toast.cloneNode(true);
  toast.parentNode.replaceChild(clone, toast);
}

function showConfirm(title, message, btnLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    const okBtn = document.getElementById('confirmModalOk');
    okBtn.textContent = btnLabel || 'Confirm';
    modal.classList.add('active');

    function cleanup(result) {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmModalCancel').removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(e) { if (e.target === modal) cleanup(false); }

    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmModalCancel').addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
  });
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
  selectedPlayMode = 'multiplayer';
  selectedDifficulty = 'average';
  // Reset play mode button states
  document.querySelectorAll('.play-mode-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === 'multiplayer');
  });
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.diff === 'average');
  });
  document.getElementById('aiDifficultyCard').classList.add('hidden');
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

function selectPlayMode(mode) {
  selectedPlayMode = mode;
  document.querySelectorAll('.play-mode-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === mode);
  });
  document.getElementById('aiDifficultyCard').classList.toggle('hidden', mode !== 'vs-computer');
  renderSettings();
  renderPlayerInputs();
}

function selectDifficulty(diff) {
  selectedDifficulty = diff;
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.diff === diff);
  });
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
  // Hide team play for solo/vs-computer
  if (selectedPlayMode !== 'multiplayer' && selectedGameType === 'cricket') {
    const teamToggle = document.getElementById('settingTeamPlay');
    if (teamToggle) teamToggle.closest('.setting-row').style.display = 'none';
  }
}

function renderPlayerInputs() {
  const container = document.getElementById('playerInputs');
  const addBtn = document.getElementById('addPlayerBtn');

  if (selectedPlayMode === 'solo' || selectedPlayMode === 'vs-computer') {
    container.innerHTML = `
      <div class="player-input-row">
        <span class="player-number">1</span>
        <input type="text" class="input player-name-input" placeholder="Your Name" maxlength="30" />
      </div>
    `;
    if (addBtn) addBtn.style.display = 'none';
    return;
  }

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
  const defaultName = selectedPlayMode === 'multiplayer' ? 'Player' : 'You';
  const playerNames = Array.from(inputs).map((input, i) => input.value.trim() || `${defaultName}${selectedPlayMode === 'multiplayer' ? ' ' + (i + 1) : ''}`);

  if (selectedPlayMode === 'multiplayer' && playerNames.length < 2) {
    showToast('Need at least 2 players');
    return;
  }

  let settings;
  switch (selectedGameType) {
    case 'x01': settings = X01.getSettings(); break;
    case 'cricket': settings = Cricket.getSettings(); break;
    case 'around-the-clock': settings = AroundTheClock.getSettings(); break;
  }

  // Force team play off for non-multiplayer
  if (selectedPlayMode !== 'multiplayer') {
    settings.teamPlay = false;
  }

  // Validate team play requires even number
  if (selectedGameType === 'cricket' && settings.teamPlay && playerNames.length % 2 !== 0) {
    showToast('Team play needs an even number of players');
    return;
  }

  const payload = { gameType: selectedGameType, playerNames, settings, playMode: selectedPlayMode };
  if (selectedPlayMode === 'vs-computer') {
    payload.aiDifficulty = selectedDifficulty;
  }

  try {
    const response = await fetch('/api/game/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
  } else {
    banner.classList.add('hidden');
  }

  // Virtual player label
  const vpLabel = document.getElementById('virtualPlayerLabel');
  if (gameData.playMode === 'vs-computer') {
    const aiPlayer = gameData.players.find(p => p.isAI);
    const diffLabel = capitalize(gameData.aiDifficulty || 'average');
    vpLabel.textContent = `${aiPlayer ? aiPlayer.name : 'Opponent'} (Virtual \u2014 ${diffLabel})`;
    vpLabel.classList.remove('hidden');
  } else {
    vpLabel.classList.add('hidden');
  }

  // Delegate to game module
  const module = getGameModule();
  module.renderScoreboard(gameData);
  module.renderTurnInput(gameData);

  // Inject kebab game menu into the multiplier row or action bar
  if (gameData.gameActive) {
    const turnInput = document.getElementById('turnInput');
    const target = turnInput.querySelector('.multiplier-row')
      || turnInput.querySelector('.turn-bar-actions')
      || turnInput.querySelector('.atc-dart-buttons')
      || turnInput.querySelector('.turn-actions');
    if (target) {
      target.insertAdjacentHTML('beforeend', getGameMenuButtonHTML());
    }
  }

  // Turn history
  const historyHtml = module.renderHistory(gameData);
  document.getElementById('turnHistory').innerHTML = historyHtml;

  // Check if AI needs to take a turn
  if (typeof AIPlayer !== 'undefined') {
    AIPlayer.handleTurnIfNeeded();
  }
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

// ─── Game Menu (kebab) ───────────────────────────────────

function getGameMenuButtonHTML() {
  return `
    <div class="game-menu-inline">
      <button class="game-menu-toggle" onclick="toggleGameMenu(event)" title="Game options">&#8942;</button>
      <div class="game-menu-dropdown hidden" id="gameMenuDropdown">
        <button onclick="undoTurn(); closeGameMenu();">Undo Last</button>
        <button onclick="endGameEarly(); closeGameMenu();">End Game</button>
        <button class="danger" onclick="deleteGame(); closeGameMenu();">Delete Game</button>
      </div>
    </div>
  `;
}

function toggleGameMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('gameMenuDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');

  // Close on outside click
  if (!dropdown.classList.contains('hidden')) {
    setTimeout(() => {
      document.addEventListener('click', closeGameMenu, { once: true });
    }, 0);
  }
}

function closeGameMenu() {
  const dropdown = document.getElementById('gameMenuDropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

// ─── Game Actions ─────────────────────────────────────────

async function undoTurn() {
  if (!currentGameId) return;
  if (typeof AIPlayer !== 'undefined' && AIPlayer.isAnimating) return;
  try {
    const response = await fetch('/api/game/' + currentGameId + '/undo', { method: 'POST' });
    if (!response.ok) {
      const err = await response.json();
      showToast(err.error || 'Nothing to undo');
      return;
    }
    gameData = await response.json();

    // In vs-computer mode, if we undid to the AI's turn, undo again to get back to human
    if (gameData && gameData.playMode === 'vs-computer' && gameData.turns.length > 0) {
      const current = gameData.players[gameData.currentPlayerIndex];
      if (current && current.isAI) {
        const response2 = await fetch('/api/game/' + currentGameId + '/undo', { method: 'POST' });
        if (response2.ok) {
          gameData = await response2.json();
        }
      }
    }

    getGameModule().resetInput();
    renderGame();
  } catch (e) {
    showToast('Failed to undo');
  }
}

async function endGameEarly() {
  if (!currentGameId) return;
  const ok = await showConfirm('End Game', 'End this game early?', 'End Game');
  if (!ok) return;
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
  if (!currentGameId) return;
  const ok = await showConfirm('Delete Game', 'Delete this game permanently? This cannot be undone.', 'Delete');
  if (!ok) return;
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

// ─── Socket.io ───────────────────────────────────────────

function connectSocket() {
  if (socket) return;

  socket = io();

  socket.on('connect', () => {
    updateConnectionStatus(true);
    if (currentGameId) {
      socket.emit('subscribe', currentGameId);
    }
  });

  socket.on('gameUpdate', (data) => {
    if (!currentGameId) return;
    if (data.deleted) {
      showToast('Game has been deleted');
      removeRecentGame(currentGameId);
      leaveGame();
    } else {
      gameData = data;
      renderGame();
    }
  });

  socket.on('disconnect', () => {
    updateConnectionStatus(false);
  });
}

function subscribeToGame(gameId) {
  if (socket && socket.connected) {
    socket.emit('subscribe', gameId);
  }
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.classList.toggle('connected', connected);
  el.querySelector('.status-text').textContent = connected ? 'Live' : 'Reconnecting...';
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

  updateConnectionStatus(socket && socket.connected);
}

window.addEventListener('hashchange', handleRoute);

// ─── Init ─────────────────────────────────────────────────

window.onload = function() {
  connectSocket();
  renderRecentGames();
  handleRoute();
};

// Handle Enter key on join input
document.getElementById('joinCodeInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') joinGame();
});
