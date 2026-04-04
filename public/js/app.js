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
  document.getElementById('statsPage').classList.add('hidden');
  document.getElementById('prefsPage').classList.add('hidden');
  document.getElementById('faqPage').classList.add('hidden');
  window.location.hash = '';
  renderRecentGames();
  renderAccountBanner();
}

function showSetupScreen() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  // Apply saved defaults from preferences
  selectedGameType = (userPrefs && userPrefs.defaultGameType) || 'x01';
  const loggedIn = isProLoggedIn();
  playerCount = loggedIn ? 2 : 1;
  selectedPlayMode = loggedIn ? 'multiplayer' : 'solo';
  selectedDifficulty = 'average';
  // Gate play modes — anonymous users only get Solo
  document.querySelectorAll('.play-mode-btn').forEach(btn => {
    const mode = btn.dataset.mode;
    if (!loggedIn && mode !== 'solo') {
      btn.classList.add('locked-mode');
      btn.classList.remove('selected');
    } else {
      btn.classList.remove('locked-mode');
      btn.classList.toggle('selected', btn.dataset.mode === selectedPlayMode);
    }
  });
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.diff === 'average');
  });
  // Reset game type button states to match preference
  document.querySelectorAll('.game-type-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === selectedGameType);
  });
  document.getElementById('aiDifficultyCard').classList.add('hidden');
  renderSetup();
  // Apply default X01 settings from preferences
  if (userPrefs && selectedGameType === 'x01') {
    const startScoreSelect = document.getElementById('settingStartScore');
    if (startScoreSelect && userPrefs.defaultStartScore) {
      startScoreSelect.value = userPrefs.defaultStartScore;
    }
    const doubleOutToggle = document.getElementById('settingDoubleOut');
    if (doubleOutToggle && userPrefs.defaultDoubleOut !== undefined) {
      doubleOutToggle.checked = userPrefs.defaultDoubleOut;
    }
  }
}

function showGameScreen() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');

  // Hide announcer controls for non-Pro
  const isPro = isProLoggedIn() && proUser.tier === 'pro';
  document.getElementById('muteToggleBtn').style.display = isPro ? '' : 'none';
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
  // Block non-account users from multiplayer and vs-computer
  if (!isProLoggedIn() && mode !== 'solo') {
    const modeNames = { 'multiplayer': 'Multiplayer', 'vs-computer': 'vs Virtual Opponents' };
    showAuthModal('register', `${modeNames[mode] || 'This mode'} requires a free account. Sign up to play with friends, join games, and challenge virtual opponents.`);
    return;
  }
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

  const sounds = DartSounds.getSoundList();
  const defaultSound = sounds[0]; // Classic Thud
  const showSounds = isProLoggedIn() && proUser.tier === 'pro';
  const defaultName = isProLoggedIn() ? proUser.displayName : '';

  const soundBtnHtml = (player, idx, sound) => showSounds
    ? `<button class="sound-picker-btn" data-player="${player}" data-sound-index="${idx}" onclick="openSoundPicker(${typeof player === 'string' ? "'" + player + "'" : player})" title="Dart sound">
        ${sound.emoji} <span class="sound-name">${sound.name}</span>
      </button>`
    : '';

  if (selectedPlayMode === 'solo' || selectedPlayMode === 'vs-computer') {
    // Find the 'whoosh' sound for virtual player default
    const whooshIdx = sounds.findIndex(s => s.id === 'whoosh');
    const virtualDefault = whooshIdx >= 0 ? sounds[whooshIdx] : defaultSound;
    const virtualIdx = whooshIdx >= 0 ? whooshIdx : 0;

    container.innerHTML = `
      <div class="player-input-row">
        <span class="player-number">1</span>
        <input type="text" class="input player-name-input" placeholder="Your Name" maxlength="30" value="${escapeHtml(defaultName)}" />
        ${soundBtnHtml(1, 0, defaultSound)}
      </div>
      ${selectedPlayMode === 'vs-computer' ? `
        <div class="player-input-row virtual-sound-row">
          <span class="player-number">VS</span>
          <span class="input virtual-player-placeholder">Virtual Opponent</span>
          ${soundBtnHtml('virtual', virtualIdx, virtualDefault)}
        </div>
      ` : ''}
    `;
    if (addBtn) addBtn.style.display = 'none';
    return;
  }

  let html = '';
  for (let i = 1; i <= playerCount; i++) {
    html += `
      <div class="player-input-row">
        <span class="player-number">${i}</span>
        <input type="text" class="input player-name-input" placeholder="Player ${i}" maxlength="30" ${i === 1 ? `value="${escapeHtml(defaultName)}"` : ''} />
        ${soundBtnHtml(i, 0, defaultSound)}
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
  const soundBtns = document.querySelectorAll('.sound-picker-btn');
  const soundIndices = Array.from(soundBtns).map(btn => parseInt(btn.dataset.soundIndex) || 0);
  names.splice(index - 1, 1);
  soundIndices.splice(index - 1, 1);
  playerCount--;
  renderPlayerInputs();
  // Restore names and sounds
  const newInputs = document.querySelectorAll('.player-name-input');
  names.forEach((name, i) => { if (newInputs[i]) newInputs[i].value = name; });
  const newBtns = document.querySelectorAll('.sound-picker-btn');
  const sounds = DartSounds.getSoundList();
  soundIndices.forEach((si, i) => {
    if (newBtns[i]) {
      newBtns[i].dataset.soundIndex = si;
      newBtns[i].innerHTML = `${sounds[si].emoji} <span class="sound-name">${sounds[si].name}</span>`;
    }
  });
}

let _soundPickerTarget = null; // which player button opened the modal

function openSoundPicker(playerNum) {
  _soundPickerTarget = playerNum;
  const btn = document.querySelector(`.sound-picker-btn[data-player="${playerNum}"]`);
  const currentIdx = btn ? parseInt(btn.dataset.soundIndex) || 0 : 0;
  const sounds = DartSounds.getSoundList();

  const grid = document.getElementById('soundGrid');
  grid.innerHTML = sounds.map((s, i) => `
    <div class="sound-option ${i === currentIdx ? 'selected' : ''}" data-sound-index="${i}" onclick="pickSound(${i})">
      <span class="sound-emoji">${s.emoji}</span>
      <span class="sound-label">${s.name}</span>
      <span class="sound-check">\u2713</span>
    </div>
  `).join('');

  document.getElementById('soundPickerModal').classList.add('active');
}

function pickSound(idx) {
  const sounds = DartSounds.getSoundList();
  // Update checkmark
  document.querySelectorAll('#soundGrid .sound-option').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
  // Play preview
  DartSounds.playSound(sounds[idx].id);
  // Update the player's button
  if (_soundPickerTarget !== null) {
    const btn = document.querySelector(`.sound-picker-btn[data-player="${_soundPickerTarget}"]`);
    if (btn) {
      btn.dataset.soundIndex = idx;
      btn.innerHTML = `${sounds[idx].emoji} <span class="sound-name">${sounds[idx].name}</span>`;
    }
  }
}

function closeSoundPicker() {
  document.getElementById('soundPickerModal').classList.remove('active');
  _soundPickerTarget = null;
}

// Close sound picker on overlay click
document.addEventListener('click', function(e) {
  if (e.target.id === 'soundPickerModal') closeSoundPicker();
  if (e.target.id === 'voicePickerModal') closeVoicePicker();
});

// ─── Voice Picker ────────────────────────────────────────

function openVoicePicker() {
  const lang = DartAnnouncer._lang;
  document.querySelectorAll('.voice-lang-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.lang === lang);
  });
  renderVoiceList();
  document.getElementById('voicePickerModal').classList.add('active');
}

function closeVoicePicker() {
  document.getElementById('voicePickerModal').classList.remove('active');
}

function setAnnouncerLang(lang) {
  DartAnnouncer.setLanguage(lang);
  document.querySelectorAll('.voice-lang-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.lang === lang);
  });
  renderVoiceList();
}

function renderVoiceList() {
  const voices = DartAnnouncer.getVoiceList();
  const list = document.getElementById('voiceList');
  const currentURI = DartAnnouncer._voiceURI;

  if (voices.length === 0) {
    list.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">No voices available — using browser default.</p>';
    return;
  }

  // Group by accent
  const groups = {};
  for (const v of voices) {
    if (!groups[v.accent]) groups[v.accent] = [];
    groups[v.accent].push(v);
  }

  let html = '';
  for (const [accent, voiceGroup] of Object.entries(groups)) {
    html += `<div class="voice-group-label">${accent}</div>`;
    for (const v of voiceGroup) {
      const selected = v.uri === currentURI;
      html += `
        <div class="voice-option ${selected ? 'selected' : ''}" data-uri="${v.uri}" onclick="pickVoice('${v.uri.replace(/'/g, "\\'")}')">
          <span class="voice-name">${v.name}</span>
          <span class="voice-accent">${v.lang}</span>
          <span class="voice-check">\u2713</span>
        </div>`;
    }
  }
  list.innerHTML = html;
}

function pickVoice(uri) {
  DartAnnouncer.setVoice(uri);
  document.querySelectorAll('#voiceList .voice-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.uri === uri);
  });
}

function previewVoice() {
  const wasMuted = DartAnnouncer.isMuted();
  if (wasMuted) DartAnnouncer._muted = false;
  DartAnnouncer._cancelAndSpeak(DartAnnouncer._getPhrase('oneEighty'), { rate: 0.9, pitch: 1.1 });
  if (wasMuted) setTimeout(() => { DartAnnouncer._muted = true; }, 100);
}

// ─── Mute Toggle ─────────────────────────────────────────

function toggleAnnouncerMute() {
  DartAnnouncer.toggleMute();
  updateMuteButton();
}

function updateMuteButton() {
  const btn = document.getElementById('muteToggleBtn');
  if (!btn) return;
  btn.textContent = DartAnnouncer.isMuted() ? 'Announcer: Off' : 'Announcer: On';
}

function saveSoundPreferences(players) {
  const prefs = {};
  players.forEach(p => { if (p.soundId && !p.isAI) prefs[p.name] = p.soundId; });
  localStorage.setItem('dart_scorer_sounds', JSON.stringify(prefs));
}

function loadSoundPreferences(players) {
  try {
    const prefs = JSON.parse(localStorage.getItem('dart_scorer_sounds')) || {};
    players.forEach(p => {
      if (!p.soundId) p.soundId = prefs[p.name] || (p.isAI ? 'whoosh' : 'thud');
      DartSounds.setPlayerSound(p.id, p.soundId);
    });
  } catch (e) { /* ignore */ }
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
    const headers = { 'Content-Type': 'application/json' };
    if (proToken) headers['Authorization'] = 'Bearer ' + proToken;
    const response = await fetch('/api/game/new', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json();
      showToast(err.error || 'Failed to create game');
      return;
    }
    gameData = await response.json();
    currentGameId = gameData.gameId;

    // Inject client-side sound selections
    const soundBtns = document.querySelectorAll('.sound-picker-btn:not([data-player="virtual"])');
    const virtualBtn = document.querySelector('.sound-picker-btn[data-player="virtual"]');
    const soundList = DartSounds.getSoundList();
    const soundSelections = Array.from(soundBtns).map(btn => {
      const idx = parseInt(btn.dataset.soundIndex) || 0;
      return soundList[idx].id;
    });
    const virtualSoundId = virtualBtn ? soundList[parseInt(virtualBtn.dataset.soundIndex) || 0].id : 'whoosh';
    gameData.players.forEach((player, i) => {
      if (player.isAI) {
        player.soundId = virtualSoundId;
      } else {
        player.soundId = soundSelections[i] || (userPrefs && userPrefs.dartSound) || 'thud';
      }
      DartSounds.setPlayerSound(player.id, player.soundId);
    });
    saveSoundPreferences(gameData.players);

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
    // Announce winner (once)
    if (!renderGame._winnerAnnounced || renderGame._winnerAnnounced !== gameData.winner) {
      renderGame._winnerAnnounced = gameData.winner;
      if (!gameData.endedEarly) {
        DartAnnouncer.announceWinner(gameData.winner);
        DartAnnouncer.playVictoryFanfare();
      }
    }
    // Show post-game pro prompt
    if (!renderGame._proPromptShown) {
      renderGame._proPromptShown = true;
      showPostGamePrompt(gameData);
    }
  } else {
    banner.classList.add('hidden');
    renderGame._winnerAnnounced = null;
    renderGame._proPromptShown = false;
  }

  // Announce turn change
  if (gameData.gameActive) {
    const currentPlayer = gameData.players[gameData.currentPlayerIndex];
    if (currentPlayer && !currentPlayer.isAI) {
      if (renderGame._lastAnnouncedPlayerIdx !== undefined &&
          renderGame._lastAnnouncedPlayerIdx !== gameData.currentPlayerIndex) {
        DartAnnouncer.announceTurnChange(currentPlayer.name);
      }
      renderGame._lastAnnouncedPlayerIdx = gameData.currentPlayerIndex;
    }
  }

  // Update mute button
  updateMuteButton();

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

  // Turn history (Pro only)
  const historyContainer = document.getElementById('turnHistory');
  const isPro = isProLoggedIn() && proUser.tier === 'pro';
  if (isPro) {
    historyContainer.innerHTML = module.renderHistory(gameData);
    historyContainer.className = 'turn-history';
  } else {
    const historyHtml = module.renderHistory(gameData);
    if (historyHtml && historyHtml.trim()) {
      historyContainer.className = 'turn-history';
      historyContainer.innerHTML = `
        <div class="turn-history-locked">
          <div class="turn-history-locked-inner">${historyHtml}</div>
          <div class="turn-history-locked-overlay">
            <span class="pro-badge">PRO</span>
            <span>Turn history</span>
          </div>
        </div>
      `;
    } else {
      historyContainer.innerHTML = '';
    }
  }

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
  const isPro = isProLoggedIn() && proUser.tier === 'pro';
  return `
    <div class="game-menu-inline">
      <button class="game-menu-toggle" onclick="toggleGameMenu(event)" title="Game options">&#8942;</button>
      <div class="game-menu-dropdown hidden" id="gameMenuDropdown">
        <button onclick="undoTurn(); closeGameMenu();">Undo Last</button>
        ${isPro ? '<button onclick="openVoicePicker(); closeGameMenu();">Announcer Voice</button>' : ''}
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

// ─── Recent Games (localStorage + server sync) ───────────

// Cache for server-fetched recent games
let _serverRecentGames = null;

function getRecentGamesLocal() {
  try {
    return JSON.parse(localStorage.getItem('dart_scorer_recent')) || [];
  } catch (e) {
    return [];
  }
}

function getRecentGames() {
  // If we have server-synced games, use those
  if (isProLoggedIn() && _serverRecentGames !== null) {
    return _serverRecentGames;
  }
  return getRecentGamesLocal();
}

function saveRecentGame(gameId, game) {
  // Always save to localStorage
  const recent = getRecentGamesLocal().filter(g => g.gameId !== gameId);
  recent.unshift({
    gameId,
    gameType: game.gameType,
    players: game.players.map(p => p.name),
    lastVisited: new Date().toISOString(),
  });
  localStorage.setItem('dart_scorer_recent', JSON.stringify(recent.slice(0, 10)));

  // Also save to server if logged in
  if (isProLoggedIn()) {
    proFetch('/api/stats/recent', {
      method: 'POST',
      body: JSON.stringify({
        gameId,
        gameType: game.gameType,
        players: game.players.map(p => p.name),
      }),
    }).catch(() => {}); // Silent fail
  }
}

function removeRecentGame(gameId) {
  const recent = getRecentGamesLocal().filter(g => g.gameId !== gameId);
  localStorage.setItem('dart_scorer_recent', JSON.stringify(recent));

  if (isProLoggedIn()) {
    proFetch('/api/stats/recent/' + gameId, { method: 'DELETE' }).catch(() => {});
  }
}

// Fetch recent games from server (called after login and on init)
async function syncRecentGames() {
  if (!isProLoggedIn()) {
    _serverRecentGames = null;
    return;
  }
  try {
    const res = await proFetch('/api/stats/recent');
    if (res.ok) {
      const data = await res.json();
      _serverRecentGames = data.games;

      // Also push any local-only games to server
      const localGames = getRecentGamesLocal();
      const serverIds = new Set(_serverRecentGames.map(g => g.gameId));
      for (const lg of localGames) {
        if (!serverIds.has(lg.gameId)) {
          proFetch('/api/stats/recent', {
            method: 'POST',
            body: JSON.stringify(lg),
          }).catch(() => {});
        }
      }

      renderRecentGames();
    }
  } catch (e) {
    // Fall back to localStorage
  }
}

function renderAccountBanner() {
  const loggedIn = isProLoggedIn();
  const isPro = loggedIn && proUser.tier === 'pro';

  // CSS handles hiding/showing accountBanner, proBanner, multiplayerTeaser, joinGameCard
  // based on is-logged-in class. We just need to show/hide the pro banner for pro vs free.
  const proBanner = document.getElementById('proBanner');
  if (loggedIn) {
    document.getElementById('joinGameCard').style.display = '';
    proBanner.style.display = isPro ? 'none' : '';
  } else {
    document.getElementById('accountBanner').style.display = '';
    document.getElementById('multiplayerTeaser').style.display = '';
  }
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
  const isPro = isProLoggedIn() && proUser.tier === 'pro';
  const typeNames = { 'x01': 'X01', 'cricket': 'Cricket', 'around-the-clock': 'Around the Clock' };

  const listHtml = recent.map(g => `
    <li ${isPro ? `onclick="window.location.hash='/game/${escapeHtml(g.gameId)}'"` : ''}>
      <div class="recent-game-info">
        <div class="recent-game-type">${typeNames[g.gameType] || g.gameType}</div>
        <div class="recent-game-players">${g.players.map(n => escapeHtml(n)).join(', ')}</div>
      </div>
      <span class="recent-game-code">${escapeHtml(g.gameId)}</span>
    </li>
  `).join('');

  if (isPro) {
    list.innerHTML = listHtml;
    list.className = 'recent-games-list';
  } else {
    list.className = 'recent-games-list';
    list.innerHTML = `
      <div class="recent-games-locked">
        <div class="recent-games-locked-inner">${listHtml}</div>
        <div class="recent-games-locked-overlay">
          <span class="pro-badge">PRO</span>
          <p>Access your game history across all devices</p>
          <button class="btn btn-small btn-accent" onclick="${isProLoggedIn() ? 'showUpgradeModal()' : "showAuthModal('register')"}">
            ${isProLoggedIn() ? 'Upgrade to Pro' : 'Create Free Account'}
          </button>
        </div>
      </div>
    `;
  }
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
      loadSoundPreferences(gameData.players);
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
  DartSounds.init();
  DartAnnouncer.init();
  connectSocket();
  renderRecentGames();
  renderUserBar();
  renderAccountBanner();
  refreshProUser();
  syncRecentGames();
  loadAndApplyPreferences();
  handleRoute();
};

// ─── FAQ Page ────────────────────────────────────────────

function showFaqPage() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('statsPage').classList.add('hidden');
  document.getElementById('prefsPage').classList.add('hidden');
  document.getElementById('faqPage').classList.remove('hidden');

  // Show/hide cancel button based on subscription status
  const cancelBtn = document.getElementById('faqCancelBtn');
  if (cancelBtn) {
    const hasSub = isProLoggedIn() && proUser.tier === 'pro';
    cancelBtn.style.display = hasSub ? '' : 'none';
  }
}

function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

async function confirmCancelFromFaq() {
  const btn = document.getElementById('faqCancelBtn');
  if (btn.dataset.confirming === 'true') {
    // Second click — execute cancel
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
    await executeCancelSubscription();
    btn.style.display = 'none';
    return;
  }
  // First click — ask for confirmation
  btn.dataset.confirming = 'true';
  btn.textContent = 'Are you sure? Tap again to confirm';
  btn.className = 'btn btn-small btn-danger';
  setTimeout(() => {
    if (btn.dataset.confirming === 'true') {
      btn.dataset.confirming = '';
      btn.textContent = 'Cancel My Subscription';
      btn.className = 'btn btn-small btn-secondary';
    }
  }, 5000);
}

// ─── Force Refresh (PWA) ─────────────────────────────────

async function forceRefresh() {
  showToast('Checking for updates...');
  try {
    // Unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
    // Clear all caches
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
    }
    // Reload
    window.location.reload(true);
  } catch (e) {
    window.location.reload(true);
  }
}

// Handle Enter key on join input
document.getElementById('joinCodeInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') joinGame();
});

// ─── Post-Game Pro Prompt ────────────────────────────────

function showPostGamePrompt(game) {
  // Find the turn history area to insert the prompt after the winner banner
  const container = document.getElementById('turnHistory');
  if (!container) return;

  // Remove any existing prompt
  const existing = container.querySelector('.pro-prompt');
  if (existing) existing.remove();

  if (isProLoggedIn()) {
    // Logged in — show quick stat + link to dashboard
    let statLine = '';
    if (game.gameType === 'x01') {
      const myTurns = game.turns.filter(t => !game.players.find(p => p.id === t.playerId && p.isAI));
      const nonBust = myTurns.filter(t => !t.bust);
      if (nonBust.length > 0) {
        const avg = Math.round((nonBust.reduce((s, t) => s + t.turnTotal, 0) / nonBust.length) * 100) / 100;
        statLine = `Your 3-dart average this game: <strong>${avg}</strong>`;
      }
    }

    const prompt = document.createElement('div');
    prompt.className = 'pro-prompt';
    prompt.innerHTML = `
      <div class="pro-prompt-title">Game recorded!</div>
      ${statLine ? `<div class="pro-prompt-stat">${statLine}</div>` : ''}
      <button class="btn btn-small btn-accent" onclick="showStatsPage()">View My Stats</button>
    `;
    container.prepend(prompt);
  } else {
    // Not logged in — tease account creation
    const prompt = document.createElement('div');
    prompt.className = 'pro-prompt';
    prompt.innerHTML = `
      <div class="pro-prompt-title">Track your progress</div>
      <div class="pro-prompt-stat">Create a free account to save your game stats, see your averages, and track improvement over time.</div>
      <button class="btn btn-small btn-accent" onclick="showAuthModal('register')">Create Free Account</button>
      <div class="pro-prompt-cta">Already have an account? <a href="#" onclick="showAuthModal('login'); return false;" style="color:var(--accent-green);">Sign in</a></div>
    `;
    container.prepend(prompt);
  }
}
