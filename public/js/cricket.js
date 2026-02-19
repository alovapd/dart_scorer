// ─── Cricket Game Module ──────────────────────────────────

const Cricket = {
  currentDarts: [],

  getSettingsHTML() {
    return `
      <h2>Cricket Settings</h2>
      <div class="setting-row">
        <div>
          <div class="setting-label">Scoring Mode</div>
          <div class="setting-desc">Score points on closed numbers</div>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input type="checkbox" id="settingScoringMode">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Team Play</div>
          <div class="setting-desc">Split into 2 teams (needs even players)</div>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input type="checkbox" id="settingTeamPlay">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  },

  getSettings() {
    return {
      scoringMode: document.getElementById('settingScoringMode').checked,
      teamPlay: document.getElementById('settingTeamPlay').checked,
    };
  },

  getRulesHTML(settings) {
    return `
      <h3>Cricket</h3>
      <ul>
        <li>Numbers in play: <strong>15, 16, 17, 18, 19, 20, Bull</strong></li>
        <li>Throw 3 darts per turn</li>
        <li>Hit a number to add marks — you need <strong>3 marks</strong> to close it</li>
        <li>Singles = 1 mark, Doubles = 2 marks, Triples = 3 marks</li>
        ${settings.scoringMode
          ? '<li><strong>Scoring Mode ON:</strong> After you close a number, further hits score points against opponents who haven\'t closed it. Points = face value per mark.</li>'
          : '<li><strong>Scoring Mode OFF:</strong> First to close all 7 numbers wins. No points.</li>'
        }
        ${settings.teamPlay
          ? '<li><strong>Team Play:</strong> Teammates share marks. Players alternate throws within their team.</li>'
          : ''
        }
      </ul>
      <h3>Winning</h3>
      <ul>
        ${settings.scoringMode
          ? '<li>Close all numbers AND have equal or more points than all opponents</li>'
          : '<li>First player (or team) to close all 7 numbers wins</li>'
        }
      </ul>
      <h3>Mark Symbols</h3>
      <ul>
        <li>/ = 1 mark</li>
        <li>X = 2 marks</li>
        <li>&#9421; = 3 marks (closed)</li>
      </ul>
    `;
  },

  _marksSymbol(count) {
    if (count === 0) return '';
    if (count === 1) return '/';
    if (count === 2) return 'X';
    return '\u24D8'; // circled i → using ⊘ style — let's use a clear symbol
  },

  _marksDisplay(count) {
    if (count === 0) return '';
    if (count === 1) return '/';
    if (count === 2) return 'X';
    return '\u2A02'; // Actually let's use simple text
  },

  renderScoreboard(game) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const teamPlay = !!game.teams;
    const scoringMode = game.settings.scoringMode;
    const numbers = game.numbers;
    const numberLabels = numbers.map(n => n === 25 ? 'Bull' : String(n));

    if (teamPlay) {
      this._renderTeamBoard(game, currentPlayer, numberLabels, numbers, scoringMode);
    } else {
      this._renderPlayerBoard(game, currentPlayer, numberLabels, numbers, scoringMode);
    }
  },

  _renderPlayerBoard(game, currentPlayer, numberLabels, numbers, scoringMode) {
    let html = '<div class="cricket-board"><table>';

    // Header: empty | player names
    html += '<tr><th class="number-col">#</th>';
    for (const p of game.players) {
      const isActive = game.gameActive && p.id === currentPlayer.id;
      html += `<th class="${isActive ? 'active-col' : ''}">${escapeHtml(p.name)}</th>`;
    }
    html += '</tr>';

    // Rows: number | marks per player
    for (let i = 0; i < numbers.length; i++) {
      html += `<tr><td class="number-col">${numberLabels[i]}</td>`;
      for (const p of game.players) {
        const marks = p.marks[numbers[i]];
        const isActive = game.gameActive && p.id === currentPlayer.id;
        const closed = marks >= 3;
        let display = '';
        if (marks === 0) display = '';
        else if (marks === 1) display = '/';
        else if (marks === 2) display = 'X';
        else display = '\u{1F5F8}'; // Actually let's use a checkmark ✓
        html += `<td class="marks-cell ${closed ? 'closed' : ''} ${isActive ? 'active-col' : ''}">${marks >= 3 ? '&#10003;' : display}</td>`;
      }
      html += '</tr>';
    }

    // Points row (only if scoring mode)
    if (scoringMode) {
      html += '<tr class="points-row"><td class="number-col">Pts</td>';
      for (const p of game.players) {
        const isActive = game.gameActive && p.id === currentPlayer.id;
        html += `<td class="${isActive ? 'active-col' : ''}">${p.points}</td>`;
      }
      html += '</tr>';
    }

    html += '</table></div>';
    document.getElementById('scoreboard').innerHTML = html;
  },

  _renderTeamBoard(game, currentPlayer, numberLabels, numbers, scoringMode) {
    let html = '<div class="cricket-board"><table>';

    // Header
    html += '<tr><th class="number-col">#</th>';
    for (const team of game.teams) {
      const teamPlayers = game.players.filter(p => p.teamId === team.id);
      const isActiveTeam = teamPlayers.some(p => p.id === currentPlayer.id);
      html += `<th class="${isActiveTeam ? 'active-col' : ''}">${escapeHtml(team.name)}<br><span style="font-size:0.7rem;color:var(--text-muted)">${teamPlayers.map(p => escapeHtml(p.name)).join(', ')}</span></th>`;
    }
    html += '</tr>';

    // Number rows
    for (let i = 0; i < numbers.length; i++) {
      html += `<tr><td class="number-col">${numberLabels[i]}</td>`;
      for (const team of game.teams) {
        const marks = team.marks[numbers[i]];
        const closed = marks >= 3;
        const teamPlayers = game.players.filter(p => p.teamId === team.id);
        const isActiveTeam = teamPlayers.some(p => p.id === currentPlayer.id);
        let display = '';
        if (marks === 0) display = '';
        else if (marks === 1) display = '/';
        else if (marks === 2) display = 'X';
        else display = '&#10003;';
        html += `<td class="marks-cell ${closed ? 'closed' : ''} ${isActiveTeam ? 'active-col' : ''}">${display}</td>`;
      }
      html += '</tr>';
    }

    // Points
    if (scoringMode) {
      html += '<tr class="points-row"><td class="number-col">Pts</td>';
      for (const team of game.teams) {
        html += `<td>${team.points}</td>`;
      }
      html += '</tr>';
    }

    html += '</table></div>';
    document.getElementById('scoreboard').innerHTML = html;
  },

  renderTurnInput(game) {
    if (!game.gameActive) {
      document.getElementById('turnInput').innerHTML = '';
      return;
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    const darts = this.currentDarts;
    const numbers = game.numbers;

    // Dart pills
    let pillsHtml = '';
    for (let i = 0; i < 3; i++) {
      if (darts[i] !== undefined) {
        pillsHtml += `<span class="dart-pill filled">${darts[i].label}</span>`;
      } else {
        pillsHtml += `<span class="dart-pill">-</span>`;
      }
    }

    // Number buttons
    const numberLabels = { 25: 'Bull' };
    let buttonsHtml = '<div class="cricket-number-buttons">';
    for (const n of numbers) {
      const label = numberLabels[n] || n;
      const isBull = n === 25;
      buttonsHtml += `<button class="${isBull ? 'bull-btn' : ''}" onclick="Cricket.addDart(${n})" ${darts.length >= 3 ? 'disabled' : ''}>${label}</button>`;
    }
    buttonsHtml += `<button class="miss-btn" onclick="Cricket.addMiss()" ${darts.length >= 3 ? 'disabled' : ''} style="border-color:var(--danger);color:var(--danger)">Miss</button>`;
    buttonsHtml += '</div>';

    document.getElementById('turnInput').innerHTML = `
      <div class="cricket-input-area">
        <div class="current-turn-info">
          <span class="current-player-name">${escapeHtml(currentPlayer.name)}'s Turn</span>
          <div class="darts-thrown-display">${pillsHtml}</div>
        </div>

        <div class="multiplier-row">
          <button class="multiplier-btn ${this._selectedMult === 1 ? 'selected' : ''}" onclick="Cricket.setMultiplier(1)">Single</button>
          <button class="multiplier-btn ${this._selectedMult === 2 ? 'selected' : ''}" onclick="Cricket.setMultiplier(2)">Double</button>
          <button class="multiplier-btn ${this._selectedMult === 3 ? 'selected' : ''}" onclick="Cricket.setMultiplier(3)">Triple</button>
        </div>

        ${buttonsHtml}

        <div class="turn-actions">
          <button class="btn btn-secondary btn-small" onclick="Cricket.clearDarts()" ${darts.length === 0 ? 'disabled' : ''}>Clear</button>
          <button class="btn btn-primary" onclick="Cricket.submitTurn()" ${darts.length === 0 ? 'disabled' : ''}>Submit Turn</button>
        </div>
      </div>
    `;
  },

  _selectedMult: 1,

  setMultiplier(m) {
    this._selectedMult = m;
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  addDart(number) {
    if (this.currentDarts.length >= 3) return;
    let mult = this._selectedMult;
    // Bull max double
    if (number === 25 && mult === 3) mult = 2;

    const prefixes = { 1: '', 2: 'D', 3: 'T' };
    const label = number === 25
      ? (mult === 2 ? 'D-Bull' : 'Bull')
      : `${prefixes[mult]}${number}`;

    this.currentDarts.push({ number, multiplier: mult, label });
    this._selectedMult = 1;
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  addMiss() {
    if (this.currentDarts.length >= 3) return;
    this.currentDarts.push({ number: 0, multiplier: 0, label: 'Miss' });
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  clearDarts() {
    this.currentDarts = [];
    this._selectedMult = 1;
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
      this._selectedMult = 1;
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
        </div>
      `;
    }
    return html;
  },

  resetInput() {
    this.currentDarts = [];
    this._selectedMult = 1;
  },
};
