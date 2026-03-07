// ─── Around the Clock Game Module ─────────────────────────

const AroundTheClock = {
  currentDarts: [],

  getSettingsHTML() {
    return `
      <h2>Around the Clock Settings</h2>
      <div class="setting-row">
        <div>
          <div class="setting-label">Include Bull</div>
          <div class="setting-desc">Add Bullseye as the 21st target</div>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input type="checkbox" id="settingIncludeBull">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  },

  getSettings() {
    return {
      includeBull: document.getElementById('settingIncludeBull').checked,
    };
  },

  getRulesHTML(settings) {
    const maxTarget = settings.includeBull ? 21 : 20;
    return `
      <h3>Around the Clock</h3>
      <ul>
        <li>Hit numbers <strong>1 through ${maxTarget === 21 ? '20, then Bull' : '20'}</strong> in order</li>
        <li>Throw 3 darts per turn</li>
        <li>Each dart is either a <strong>Hit</strong> (on your current target) or a <strong>Miss</strong></li>
        <li>Hitting your target advances you to the next number</li>
        <li>You can hit multiple targets in a single turn if your darts are on target</li>
        <li>First player to complete the full sequence wins</li>
      </ul>
      <h3>Tips</h3>
      <ul>
        <li>Any segment of the target number counts (single, double, or triple)</li>
        <li>The number shown is your <strong>current target</strong> — just need to hit that number</li>
      </ul>
    `;
  },

  renderScoreboard(game) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const maxTarget = game.maxTarget;

    let html = '<div class="scoreboard-grid">';
    for (const player of game.players) {
      const isActive = game.gameActive && player.id === currentPlayer.id;
      const isWinner = game.winner === player.name;
      const progress = ((player.currentTarget - 1) / maxTarget * 100).toFixed(0);

      // Number grid
      let numbersHtml = '<div class="atc-numbers-grid">';
      for (let n = 1; n <= maxTarget; n++) {
        const label = n === 21 ? 'Bull' : n;
        const hit = n < player.currentTarget;
        const current = n === player.currentTarget && !player.completed;
        numbersHtml += `<div class="atc-number ${hit ? 'hit' : ''} ${current ? 'current' : ''}">${label}</div>`;
      }
      numbersHtml += '</div>';

      html += `
        <div class="player-card ${isActive ? 'active' : ''} ${isWinner ? 'winner' : ''}">
          <div class="player-name">
            <span class="turn-indicator"></span>
            ${escapeHtml(player.name)}
          </div>
          <div class="player-stats">
            <span>Target: <strong style="color:var(--accent-green)">${player.currentTarget > maxTarget ? 'Done!' : (player.currentTarget === 21 ? 'Bull' : player.currentTarget)}</strong></span>
            <span>Darts: ${player.dartsThrown}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width:${progress}%"></div>
          </div>
          ${numbersHtml}
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
        <div class="atc-input-area ai-turn">
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
    const maxTarget = game.maxTarget;

    // Calculate what the current target would be after the darts entered so far
    let previewTarget = currentPlayer.currentTarget;
    for (const d of darts) {
      if (d.hit && previewTarget <= maxTarget) previewTarget++;
    }

    // Dart pills
    let pillsHtml = '';
    for (let i = 0; i < 3; i++) {
      if (darts[i] !== undefined) {
        pillsHtml += `<span class="dart-pill filled">${darts[i].hit ? 'HIT' : 'Miss'}</span>`;
      } else {
        pillsHtml += `<span class="dart-pill">-</span>`;
      }
    }

    const targetLabel = previewTarget === 21 ? 'Bull' : previewTarget;
    const isComplete = previewTarget > maxTarget;

    document.getElementById('turnInput').innerHTML = `
      <div class="atc-input-area">
        <div class="current-turn-info">
          <span class="current-player-name">${escapeHtml(currentPlayer.name)}'s Turn</span>
          <div class="darts-thrown-display">${pillsHtml}</div>
        </div>

        ${!isComplete ? `
          <div class="text-muted" style="margin-top:0.5rem;">Aiming for:</div>
          <div class="atc-target-display">${targetLabel}</div>
        ` : `
          <div class="atc-target-display" style="font-size:2rem;">Sequence Complete!</div>
        `}

        ${!isComplete && darts.length < 3 ? `
          <div class="atc-dart-buttons">
            <button class="hit-btn" onclick="AroundTheClock.addDart(true)">HIT</button>
            <button class="miss-btn" onclick="AroundTheClock.addDart(false)">MISS</button>
          </div>
        ` : ''}

        <div class="turn-actions" style="margin-top:1rem;">
          <button class="btn btn-secondary btn-small" onclick="AroundTheClock.clearDarts()" ${darts.length === 0 ? 'disabled' : ''}>Clear</button>
          <button class="btn btn-primary" onclick="AroundTheClock.submitTurn()" ${darts.length === 0 ? 'disabled' : ''}>Submit Turn</button>
        </div>
      </div>
    `;
  },

  addDart(hit) {
    if (this.currentDarts.length >= 3) return;
    this.currentDarts.push({ hit });

    // Check if sequence would be complete — auto-stop allowing more darts
    if (typeof gameData !== 'undefined') {
      const player = gameData.players[gameData.currentPlayerIndex];
      let previewTarget = player.currentTarget;
      for (const d of this.currentDarts) {
        if (d.hit && previewTarget <= gameData.maxTarget) previewTarget++;
      }
      // If complete, don't require full 3 darts
      this.renderTurnInput(gameData);
    }
  },

  clearDarts() {
    this.currentDarts = [];
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
      const dartsStr = turn.darts.map(d => d.hit ? 'HIT' : 'Miss').join(', ');
      const hitCount = turn.hits ? turn.hits.length : 0;
      html += `
        <div class="turn-entry">
          <span class="turn-player">${escapeHtml(turn.playerName)}</span>
          <span class="turn-detail">${dartsStr}</span>
          <span class="turn-result">${hitCount > 0 ? '+' + hitCount : '-'}</span>
        </div>
      `;
    }
    return html;
  },

  resetInput() {
    this.currentDarts = [];
  },
};
