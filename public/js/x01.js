// ─── X01 Game Module ──────────────────────────────────────

const X01 = {
  currentDarts: [],
  selectedMultiplier: 1,

  getSettingsHTML() {
    return `
      <h2>X01 Settings</h2>
      <div class="setting-row">
        <div>
          <div class="setting-label">Starting Score</div>
          <div class="setting-desc">Count down from this number</div>
        </div>
        <div class="setting-control">
          <select id="settingStartScore">
            <option value="301">301</option>
            <option value="501" selected>501</option>
            <option value="701">701</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Double Out</div>
          <div class="setting-desc">Must finish on a double</div>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input type="checkbox" id="settingDoubleOut">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  },

  getSettings() {
    return {
      startScore: parseInt(document.getElementById('settingStartScore').value),
      doubleOut: document.getElementById('settingDoubleOut').checked,
    };
  },

  getRulesHTML(settings) {
    return `
      <h3>X01 (${settings.startScore || 501})</h3>
      <ul>
        <li>Each player starts at <strong>${settings.startScore || 501}</strong> points</li>
        <li>Throw 3 darts per turn</li>
        <li>Your turn total is subtracted from your remaining score</li>
        <li>First player to reach exactly <strong>0</strong> wins</li>
        <li><strong>Bust:</strong> If your remaining would go below zero, the turn doesn't count</li>
        ${settings.doubleOut ? '<li><strong>Double Out:</strong> Your final dart must land on a double to win. Going to 1 remaining is also a bust (can\'t finish on a double from 1).</li>' : ''}
      </ul>
      <h3>Scoring</h3>
      <ul>
        <li>Single: face value (1-20)</li>
        <li>Double: 2x face value</li>
        <li>Triple: 3x face value</li>
        <li>Single Bull: 25 points</li>
        <li>Double Bull (Bullseye): 50 points</li>
        <li>Miss: 0 points</li>
      </ul>
    `;
  },

  renderScoreboard(game) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    let html = '<div class="scoreboard-grid">';
    for (const player of game.players) {
      const isActive = game.gameActive && player.id === currentPlayer.id;
      const isWinner = game.winner === player.name;
      const avg = player.dartsThrown > 0
        ? ((player.totalScore / player.dartsThrown) * 3).toFixed(1)
        : '0.0';

      html += `
        <div class="player-card ${isActive ? 'active' : ''} ${isWinner ? 'winner' : ''}">
          <div class="player-name">
            <span class="turn-indicator"></span>
            ${escapeHtml(player.name)}
          </div>
          <div class="player-score-big">${player.remaining}</div>
          <div class="player-stats">
            <span>3-dart avg: ${avg}</span>
            <span>Darts: ${player.dartsThrown}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
    document.getElementById('scoreboard').innerHTML = html;
  },

  renderTurnInput(game) {
    if (!game.gameActive) {
      document.getElementById('turnInput').innerHTML = '';
      return;
    }

    const currentPlayer = game.players[game.currentPlayerIndex];

    // If AI's turn, show placeholder — AIPlayer module handles the rest
    if (currentPlayer.isAI) {
      document.getElementById('turnInput').innerHTML = `
        <div class="dart-input-area ai-turn">
          <div class="current-turn-info">
            <span class="current-player-name">${escapeHtml(currentPlayer.name)}</span>
            <span class="ai-badge">Virtual</span>
          </div>
          <div class="ai-thinking">Throwing...</div>
        </div>
      `;
      return;
    }

    const darts = this.currentDarts;

    // Dart pills
    let pillsHtml = '';
    for (let i = 0; i < 3; i++) {
      if (darts[i] !== undefined) {
        const d = darts[i];
        const label = d.score === 0 ? 'Miss' : d.label;
        pillsHtml += `<span class="dart-pill filled">${label}</span>`;
      } else {
        pillsHtml += `<span class="dart-pill">-</span>`;
      }
    }

    // Check bust
    const turnTotal = darts.reduce((sum, d) => sum + d.score, 0);
    const newRemaining = currentPlayer.remaining - turnTotal;
    let bust = false;
    if (newRemaining < 0) bust = true;
    if (game.settings.doubleOut && newRemaining === 1) bust = true;
    if (game.settings.doubleOut && newRemaining === 0 && darts.length > 0) {
      const lastDart = darts[darts.length - 1];
      if (lastDart.multiplier !== 2) bust = true;
    }

    // Number pad
    let numberPadHtml = '<div class="number-pad">';
    for (let n = 1; n <= 20; n++) {
      numberPadHtml += `<button onclick="X01.addDart(${n})" ${darts.length >= 3 ? 'disabled' : ''}>${n}</button>`;
    }
    numberPadHtml += `<button class="bull-btn" onclick="X01.addDart(25)" ${darts.length >= 3 ? 'disabled' : ''}>Bull</button>`;
    numberPadHtml += `<button class="miss-btn" onclick="X01.addMiss()" ${darts.length >= 3 ? 'disabled' : ''}>Miss</button>`;
    numberPadHtml += '</div>';

    document.getElementById('turnInput').innerHTML = `
      <div class="dart-input-area">
        <div class="current-turn-info">
          <span class="current-player-name">${escapeHtml(currentPlayer.name)}'s Turn</span>
          <div class="darts-thrown-display">${pillsHtml}</div>
        </div>

        <div class="multiplier-row">
          <button class="multiplier-btn ${this.selectedMultiplier === 1 ? 'selected' : ''}" onclick="X01.setMultiplier(1)">Single</button>
          <button class="multiplier-btn ${this.selectedMultiplier === 2 ? 'selected' : ''}" onclick="X01.setMultiplier(2)">Double</button>
          <button class="multiplier-btn ${this.selectedMultiplier === 3 ? 'selected' : ''}" onclick="X01.setMultiplier(3)">Triple</button>
        </div>

        ${numberPadHtml}

        <div class="turn-total">
          Turn: <strong>${turnTotal}</strong>
          ${bust ? ' <span style="color:var(--danger);font-weight:600;">BUST</span>' : ''}
          ${!bust && darts.length > 0 ? ` (${currentPlayer.remaining} &rarr; ${newRemaining})` : ''}
        </div>

        <div class="turn-actions">
          <button class="btn btn-secondary btn-small" onclick="X01.clearDarts()" ${darts.length === 0 ? 'disabled' : ''}>Clear</button>
          <button class="btn btn-primary" onclick="X01.submitTurn()" ${darts.length === 0 ? 'disabled' : ''}>Submit Turn</button>
        </div>
      </div>
    `;
  },

  setMultiplier(m) {
    this.selectedMultiplier = m;
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  addDart(number) {
    if (this.currentDarts.length >= 3) return;
    let mult = this.selectedMultiplier;
    // Bull can only be single (25) or double (50)
    if (number === 25 && mult === 3) mult = 2;

    const score = number * mult;
    const prefixes = { 1: '', 2: 'D', 3: 'T' };
    const label = number === 25
      ? (mult === 2 ? 'D-Bull' : 'Bull')
      : `${prefixes[mult]}${number}`;

    this.currentDarts.push({ number, multiplier: mult, score, label });
    DartSounds.playForCurrentPlayer();

    // Auto-submit if 3 darts or if player just won
    if (typeof gameData !== 'undefined') {
      this.renderTurnInput(gameData);
    }

    // Reset multiplier to single after each dart
    this.selectedMultiplier = 1;
  },

  addMiss() {
    if (this.currentDarts.length >= 3) return;
    this.currentDarts.push({ number: 0, multiplier: 0, score: 0, label: 'Miss' });
    DartSounds.playForCurrentPlayer();
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  clearDarts() {
    this.currentDarts = [];
    this.selectedMultiplier = 1;
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  async submitTurn() {
    if (this.currentDarts.length === 0) return;
    const currentPlayer = gameData.players[gameData.currentPlayerIndex];

    try {
      const response = await fetch('/api/game/' + currentGameId + '/throw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: currentPlayer.id,
          darts: this.currentDarts,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        showToast(err.error || 'Error');
        return;
      }
      gameData = await response.json();
      this.currentDarts = [];
      this.selectedMultiplier = 1;
      saveRecentGame(currentGameId, gameData);
      renderGame();
    } catch (e) {
      showToast('Failed to submit turn');
    }
  },

  renderHistory(game) {
    if (game.turns.length === 0) return '';
    let html = '<h3>Turn History</h3>';
    const recent = game.turns.slice().reverse().slice(0, 20);
    for (const turn of recent) {
      const dartsStr = turn.darts.map(d => d.label).join(', ');
      html += `
        <div class="turn-entry">
          <span class="turn-player">${escapeHtml(turn.playerName)}</span>
          <span class="turn-detail">${dartsStr}</span>
          <span class="turn-result ${turn.bust ? 'bust' : ''}">${turn.bust ? 'BUST' : turn.turnTotal}</span>
        </div>
      `;
    }
    return html;
  },

  resetInput() {
    this.currentDarts = [];
    this.selectedMultiplier = 1;
  },
};
