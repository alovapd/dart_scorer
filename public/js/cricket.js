// ─── Cricket Game Module ──────────────────────────────────

const Cricket = {
  _darts: [null, null, null],
  _activeDart: 0,
  _selectedMult: 1,

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
        <li>Circled X = 3 marks (closed)</li>
      </ul>
    `;
  },

  // Traditional display order: 20 down to 15, then Bull
  _displayOrder: [20, 19, 18, 17, 16, 15, 25],

  _marksHTML(count, hasPending) {
    if (count === 0) return '';
    const cls = hasPending ? 'chalk-mark pending' : 'chalk-mark';
    if (count === 1) return `<span class="${cls}">/</span>`;
    if (count === 2) return `<span class="${cls}">X</span>`;
    return `<span class="${cls} closed-mark"><span class="circle-x">X</span></span>`;
  },

  // Simulate pending darts to get marks + points preview
  _simulatePending(game) {
    const result = { marks: {}, points: 0 };
    const currentPlayer = game.players[game.currentPlayerIndex];
    const scoringMode = game.settings.scoringMode;
    const teamPlay = !!game.teams;

    // Clone current marks for the active player/team
    let marksSource, originalMarks, otherSources;
    if (teamPlay) {
      const team = game.teams.find(t =>
        game.players.filter(p => p.teamId === t.id).some(p => p.id === currentPlayer.id)
      );
      originalMarks = team.marks;
      marksSource = { ...team.marks };
      const otherTeam = game.teams.find(t => t.id !== team.id);
      otherSources = [otherTeam.marks];
    } else {
      originalMarks = currentPlayer.marks;
      marksSource = { ...currentPlayer.marks };
      otherSources = game.players
        .filter(p => p.id !== currentPlayer.id)
        .map(p => p.marks);
    }

    for (const d of this._darts) {
      if (!d || d.number === 0 || !game.numbers.includes(d.number)) continue;
      const num = d.number;
      const dartMarks = d.multiplier;
      const prevMarks = marksSource[num];
      const closedByAll = otherSources.every(s => s[num] >= 3);

      if (prevMarks >= 3 && closedByAll) continue;

      if (prevMarks < 3) {
        const toClose = 3 - prevMarks;
        const added = Math.min(dartMarks, toClose);
        const overflow = dartMarks - added;
        marksSource[num] = prevMarks + added;
        if (scoringMode && overflow > 0 && !closedByAll) {
          result.points += overflow * (num === 25 ? 25 : num);
        }
      } else {
        if (scoringMode && !closedByAll) {
          result.points += dartMarks * (num === 25 ? 25 : num);
        }
      }
    }

    // Calculate mark deltas from original
    for (const n of game.numbers) {
      const delta = marksSource[n] - originalMarks[n];
      if (delta > 0) result.marks[n] = delta;
    }

    return result;
  },

  renderScoreboard(game) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const teamPlay = !!game.teams;
    const scoringMode = game.settings.scoringMode;
    const canTap = game.gameActive && this._darts.includes(null);
    const pending = this._simulatePending(game);

    if (teamPlay) {
      this._renderTeamBoard(game, currentPlayer, scoringMode, canTap, pending);
    } else {
      this._renderPlayerBoard(game, currentPlayer, scoringMode, canTap, pending);
    }
  },

  _renderPlayerBoard(game, currentPlayer, scoringMode, canTap, pending) {
    const players = game.players;
    const order = this._displayOrder;
    const tap = canTap ? n => ` onclick="Cricket.tapNumber(${n})"` : () => '';
    const tapClass = canTap ? ' tappable' : '';
    const pendingPts = pending.points;

    if (players.length === 2) {
      const p1 = players[0], p2 = players[1];
      const p1Active = game.gameActive && p1.id === currentPlayer.id;
      const p2Active = game.gameActive && p2.id === currentPlayer.id;
      const p1Pts = p1.points + (p1.id === currentPlayer.id ? pendingPts : 0);
      const p2Pts = p2.points + (p2.id === currentPlayer.id ? pendingPts : 0);
      const p1HasPendingPts = p1.id === currentPlayer.id && pendingPts > 0;
      const p2HasPendingPts = p2.id === currentPlayer.id && pendingPts > 0;

      let html = '<div class="cricket-board chalk"><table>';

      html += '<tr class="chalk-header-row">';
      html += `<th class="chalk-player-head left ${p1Active ? 'active' : ''}">
        <div class="chalk-name">${escapeHtml(p1.name)}</div>
        ${scoringMode ? `<div class="chalk-pts ${p1HasPendingPts ? 'pending' : ''}">${p1Pts}</div>` : ''}
      </th>`;
      html += '<th class="chalk-number-head"></th>';
      html += `<th class="chalk-player-head right ${p2Active ? 'active' : ''}">
        <div class="chalk-name">${escapeHtml(p2.name)}</div>
        ${scoringMode ? `<div class="chalk-pts ${p2HasPendingPts ? 'pending' : ''}">${p2Pts}</div>` : ''}
      </th>`;
      html += '</tr>';

      for (const n of order) {
        const label = n === 25 ? 'Bull' : String(n);
        const p1Pend = p1.id === currentPlayer.id ? (pending.marks[n] || 0) : 0;
        const p2Pend = p2.id === currentPlayer.id ? (pending.marks[n] || 0) : 0;
        const m1 = p1.marks[n] + p1Pend;
        const m2 = p2.marks[n] + p2Pend;
        html += `<tr class="${tapClass}"${tap(n)}>`;
        html += `<td class="chalk-marks ${p1Active ? 'active' : ''} ${m1 >= 3 ? 'closed' : ''}">${this._marksHTML(m1, p1Pend > 0)}</td>`;
        html += `<td class="chalk-number">${label}</td>`;
        html += `<td class="chalk-marks ${p2Active ? 'active' : ''} ${m2 >= 3 ? 'closed' : ''}">${this._marksHTML(m2, p2Pend > 0)}</td>`;
        html += '</tr>';
      }

      html += '</table></div>';
      document.getElementById('scoreboard').innerHTML = html;
    } else {
      let html = '<div class="cricket-board chalk"><table>';

      html += '<tr class="chalk-header-row"><th class="chalk-number-head">#</th>';
      for (const p of players) {
        const isActive = game.gameActive && p.id === currentPlayer.id;
        const pts = p.points + (p.id === currentPlayer.id ? pendingPts : 0);
        const hasPendingPts = p.id === currentPlayer.id && pendingPts > 0;
        html += `<th class="chalk-player-head ${isActive ? 'active' : ''}">
          <div class="chalk-name">${escapeHtml(p.name)}</div>
          ${scoringMode ? `<div class="chalk-pts ${hasPendingPts ? 'pending' : ''}">${pts}</div>` : ''}
        </th>`;
      }
      html += '</tr>';

      for (const n of order) {
        const label = n === 25 ? 'Bull' : String(n);
        html += `<tr class="${tapClass}"${tap(n)}><td class="chalk-number">${label}</td>`;
        for (const p of players) {
          const pPend = p.id === currentPlayer.id ? (pending.marks[n] || 0) : 0;
          const marks = p.marks[n] + pPend;
          const isActive = game.gameActive && p.id === currentPlayer.id;
          html += `<td class="chalk-marks ${isActive ? 'active' : ''} ${marks >= 3 ? 'closed' : ''}">${this._marksHTML(marks, pPend > 0)}</td>`;
        }
        html += '</tr>';
      }

      html += '</table></div>';
      document.getElementById('scoreboard').innerHTML = html;
    }
  },

  _renderTeamBoard(game, currentPlayer, scoringMode, canTap, pending) {
    const teams = game.teams;
    const order = this._displayOrder;
    const tap = canTap ? n => ` onclick="Cricket.tapNumber(${n})"` : () => '';
    const tapClass = canTap ? ' tappable' : '';
    const pendingPts = pending.points;

    const t1 = teams[0], t2 = teams[1];
    const t1Players = game.players.filter(p => p.teamId === t1.id);
    const t2Players = game.players.filter(p => p.teamId === t2.id);
    const t1Active = t1Players.some(p => p.id === currentPlayer.id);
    const t2Active = t2Players.some(p => p.id === currentPlayer.id);
    const t1Pts = t1.points + (t1Active ? pendingPts : 0);
    const t2Pts = t2.points + (t2Active ? pendingPts : 0);
    const t1HasPendingPts = t1Active && pendingPts > 0;
    const t2HasPendingPts = t2Active && pendingPts > 0;

    let html = '<div class="cricket-board chalk"><table>';

    html += '<tr class="chalk-header-row">';
    html += `<th class="chalk-player-head left ${t1Active ? 'active' : ''}">
      <div class="chalk-name">${escapeHtml(t1.name)}</div>
      <div class="chalk-team-members">${t1Players.map(p => escapeHtml(p.name)).join(', ')}</div>
      ${scoringMode ? `<div class="chalk-pts ${t1HasPendingPts ? 'pending' : ''}">${t1Pts}</div>` : ''}
    </th>`;
    html += '<th class="chalk-number-head"></th>';
    html += `<th class="chalk-player-head right ${t2Active ? 'active' : ''}">
      <div class="chalk-name">${escapeHtml(t2.name)}</div>
      <div class="chalk-team-members">${t2Players.map(p => escapeHtml(p.name)).join(', ')}</div>
      ${scoringMode ? `<div class="chalk-pts ${t2HasPendingPts ? 'pending' : ''}">${t2Pts}</div>` : ''}
    </th>`;
    html += '</tr>';

    for (const n of order) {
      const label = n === 25 ? 'Bull' : String(n);
      const t1Pend = t1Active ? (pending.marks[n] || 0) : 0;
      const t2Pend = t2Active ? (pending.marks[n] || 0) : 0;
      const m1 = t1.marks[n] + t1Pend;
      const m2 = t2.marks[n] + t2Pend;
      html += `<tr class="${tapClass}"${tap(n)}>`;
      html += `<td class="chalk-marks ${t1Active ? 'active' : ''} ${m1 >= 3 ? 'closed' : ''}">${this._marksHTML(m1, t1Pend > 0)}</td>`;
      html += `<td class="chalk-number">${label}</td>`;
      html += `<td class="chalk-marks ${t2Active ? 'active' : ''} ${m2 >= 3 ? 'closed' : ''}">${this._marksHTML(m2, t2Pend > 0)}</td>`;
      html += '</tr>';
    }

    html += '</table></div>';
    document.getElementById('scoreboard').innerHTML = html;
  },

  // ── Tap-to-score: 3 dart slots ─────────────────────────

  setMult(m) {
    this._selectedMult = m;
    if (typeof gameData !== 'undefined') this.renderTurnInput(gameData);
  },

  selectDart(index) {
    this._darts[index] = null;
    this._activeDart = index;
    if (typeof gameData !== 'undefined') {
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
    }
  },

  tapNumber(number) {
    if (!gameData || !gameData.gameActive) return;
    if (!this._darts.includes(null)) return;

    let mult = this._selectedMult;
    // Bull max double
    if (number === 25 && mult === 3) mult = 2;

    const prefixes = { 1: '', 2: 'D', 3: 'T' };
    const label = number === 25
      ? (mult === 2 ? 'D-Bull' : 'Bull')
      : `${prefixes[mult]}${number}`;

    this._darts[this._activeDart] = { number, multiplier: mult, label };
    DartSounds.playForCurrentPlayer();

    // Check if this dart just closed the number
    const currentPlayer = gameData.players[gameData.currentPlayerIndex];
    const baseMarks = currentPlayer.marks[number] || 0;
    let pendingMarks = 0;
    for (const d of this._darts) {
      if (d && d.number === number) pendingMarks += d.multiplier;
    }
    DartAnnouncer.announceDart(label);
    if (baseMarks + pendingMarks - mult < 3 && baseMarks + pendingMarks >= 3) {
      DartAnnouncer.announceCricketClose(number);
    }

    this._selectedMult = 1; // reset after each tap

    // Auto-advance to next empty slot
    const nextEmpty = this._darts.findIndex(d => d === null);
    if (nextEmpty !== -1) {
      this._activeDart = nextEmpty;
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
    } else {
      // Show the final state briefly before submitting
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
      setTimeout(() => this.submitTurn(), 300);
    }
  },

  undoDart() {
    for (let i = 2; i >= 0; i--) {
      if (this._darts[i] !== null) {
        this._darts[i] = null;
        this._activeDart = i;
        break;
      }
    }
    if (typeof gameData !== 'undefined') {
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
    }
  },

  addMiss() {
    if (!this._darts.includes(null)) return;
    this._darts[this._activeDart] = { number: 0, multiplier: 0, label: 'Miss' };
    DartSounds.playForCurrentPlayer();
    DartAnnouncer.announceDart('Miss');
    this._selectedMult = 1;

    const nextEmpty = this._darts.findIndex(d => d === null);
    if (nextEmpty !== -1) {
      this._activeDart = nextEmpty;
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
    } else {
      this.renderScoreboard(gameData);
      this.renderTurnInput(gameData);
      setTimeout(() => this.submitTurn(), 300);
    }
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
        <div class="cricket-turn-bar ai-turn">
          <span class="current-player-name">${escapeHtml(currentPlayer.name)}</span>
          <span class="ai-badge">Virtual</span>
          <div class="ai-thinking">Throwing...</div>
        </div>
      `;
      return;
    }

    const darts = this._darts;
    const active = this._activeDart;
    const anyFilled = darts.some(d => d !== null);
    const hasEmpty = darts.includes(null);
    const mult = this._selectedMult;

    let slotsHtml = '';
    for (let i = 0; i < 3; i++) {
      const isActive = hasEmpty && i === active;
      const filled = darts[i] !== null;
      slotsHtml += `
        <button class="dart-slot ${isActive ? 'active' : ''} ${filled ? 'filled' : ''}"
                onclick="Cricket.selectDart(${i})">
          <span class="dart-slot-num">${i + 1}</span>
          <span class="dart-slot-val">${filled ? darts[i].label : '-'}</span>
        </button>`;
    }

    document.getElementById('turnInput').innerHTML = `
      <div class="cricket-turn-bar">
        <span class="current-player-name">${escapeHtml(currentPlayer.name)}'s Turn</span>
        <div class="dart-slots">${slotsHtml}</div>
        <div class="multiplier-row compact">
          <button class="multiplier-btn ${mult === 1 ? 'selected' : ''}" onclick="Cricket.setMult(1)">S</button>
          <button class="multiplier-btn ${mult === 2 ? 'selected' : ''}" onclick="Cricket.setMult(2)">D</button>
          <button class="multiplier-btn ${mult === 3 ? 'selected' : ''}" onclick="Cricket.setMult(3)">T</button>
          <button class="multiplier-btn miss-btn" onclick="Cricket.addMiss()" ${!hasEmpty ? 'disabled' : ''}>Miss</button>
        </div>
        <div class="turn-bar-actions">
          <button class="btn btn-secondary btn-small" onclick="Cricket.undoDart()" ${!anyFilled ? 'disabled' : ''}>Undo</button>
        </div>
      </div>
    `;
  },

  async submitTurn() {
    const darts = this._darts.filter(d => d !== null);
    if (darts.length === 0) return;
    const currentPlayer = gameData.players[gameData.currentPlayerIndex];

    try {
      const response = await fetch('/api/game/' + currentGameId + '/throw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: currentPlayer.id,
          darts: darts,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        showToast(err.error || 'Error');
        return;
      }
      gameData = await response.json();
      this._darts = [null, null, null];
      this._activeDart = 0;
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
    this._darts = [null, null, null];
    this._activeDart = 0;
    this._selectedMult = 1;
  },
};
