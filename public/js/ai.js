// ─── AI Player Module ─────────────────────────────────────
// Handles AI turn orchestration and dart-by-dart animation

const AIPlayer = {
  isAnimating: false,

  // Called after every renderGame() — checks if it's AI's turn
  async handleTurnIfNeeded() {
    if (!gameData || !gameData.gameActive) return;
    if (gameData.playMode !== 'vs-computer') return;
    if (this.isAnimating) return;

    const currentPlayer = gameData.players[gameData.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isAI) return;

    this.isAnimating = true;

    // Wait for any ongoing announcer speech to finish before AI starts
    await this.waitForAnnouncer();

    try {
      // 1. Request AI darts from server
      const response = await fetch('/api/game/' + currentGameId + '/ai-turn', { method: 'POST' });
      if (!response.ok) {
        this.isAnimating = false;
        return;
      }
      const { darts } = await response.json();

      // 2. Animate darts one by one
      await this.animateDarts(currentPlayer, darts);

      // 3. Submit the turn via normal endpoint
      const submitResponse = await fetch('/api/game/' + currentGameId + '/throw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: currentPlayer.id, darts }),
      });

      if (submitResponse.ok) {
        const prevName = currentPlayer.name;
        gameData = await submitResponse.json();
        saveRecentGame(currentGameId, gameData);

        // Announce AI turn summary
        const lastTurn = gameData.turns.length > 0 ? gameData.turns[gameData.turns.length - 1] : null;
        if (lastTurn && lastTurn.playerName === prevName) {
          if (gameData.gameType === 'x01') {
            const aiPlayer = gameData.players.find(p => p.name === prevName);
            DartAnnouncer.announceX01Turn(lastTurn, aiPlayer || { remaining: 0 });
          } else if (gameData.gameType === 'around-the-clock') {
            const hitCount = lastTurn.hits ? lastTurn.hits.length : 0;
            const aiPlayer = gameData.players.find(p => p.name === prevName);
            DartAnnouncer.announceATCSummary(prevName, hitCount, aiPlayer ? aiPlayer.currentTarget : 1);
          }
        }
      }
    } catch (e) {
      console.error('AI turn failed:', e);
    }

    // Pause after turn summary announcement before switching turns
    await this.delay(1500);

    this.isAnimating = false;
    renderGame();
  },

  async animateDarts(player, darts) {
    const turnInput = document.getElementById('turnInput');

    for (let i = 0; i <= darts.length; i++) {
      // Build pills: revealed darts + currently throwing + pending
      let pillsHtml = '';
      for (let j = 0; j < darts.length; j++) {
        if (j < i) {
          // Already revealed
          const label = this.getDartLabel(darts[j]);
          pillsHtml += `<span class="dart-pill filled ai-revealed">${escapeHtml(label)}</span>`;
        } else if (j === i) {
          // Currently being thrown
          pillsHtml += '<span class="dart-pill ai-revealing">...</span>';
        } else {
          pillsHtml += '<span class="dart-pill">-</span>';
        }
      }

      // Build turn summary for X01
      let summaryHtml = '';
      if (gameData.gameType === 'x01' && i > 0) {
        const revealedScore = darts.slice(0, i).reduce((s, d) => s + (d.score || 0), 0);
        summaryHtml = `<div class="ai-turn-summary">Score: <strong>${revealedScore}</strong></div>`;
      }

      turnInput.innerHTML = `
        <div class="dart-input-area ai-turn">
          <div class="current-turn-info">
            <span class="current-player-name">${escapeHtml(player.name)}</span>
            <span class="ai-badge">Virtual</span>
          </div>
          <div class="darts-thrown-display">${pillsHtml}</div>
          ${summaryHtml}
        </div>
      `;

      // Play sound and announce for newly revealed dart
      if (i > 0 && i <= darts.length) {
        DartSounds.playSound(DartSounds.getPlayerSound(player.id));

        // Announce the revealed dart
        const revealedDart = darts[i - 1];
        if (gameData.gameType === 'cricket') {
          const dartLabel = this.getDartLabel(revealedDart);
          DartAnnouncer.announceCricketDart(dartLabel);

          // Check if this dart closed the number
          if (revealedDart.number && revealedDart.number !== 0) {
            const baseMarks = player.marks[revealedDart.number] || 0;
            let pendingMarks = 0;
            for (let d = 0; d < i; d++) {
              if (darts[d].number === revealedDart.number) pendingMarks += darts[d].multiplier;
            }
            if (baseMarks + pendingMarks - revealedDart.multiplier < 3 && baseMarks + pendingMarks >= 3) {
              setTimeout(() => DartAnnouncer.announceCricketClose(revealedDart.number), 600);
            }
          }

          Cricket._darts = [null, null, null];
          for (let d = 0; d < i; d++) Cricket._darts[d] = darts[d];
          Cricket.renderScoreboard(gameData);
        } else if (gameData.gameType === 'around-the-clock') {
          DartAnnouncer.announceATCDart(revealedDart.hit);
        }
      }

      if (i < darts.length) {
        // Wait before revealing next dart — enough time for announcer to speak
        await this.delay(1200);
      }
    }

    // Reset Cricket pending darts after animation
    if (gameData.gameType === 'cricket') {
      Cricket._darts = [null, null, null];
      Cricket._activeDart = 0;
    }

    // Final pause showing all darts
    await this.delay(1000);
  },

  getDartLabel(dart) {
    if (dart.label) return dart.label;
    if ('hit' in dart) return dart.hit ? 'HIT' : 'Miss';
    return '?';
  },

  async waitForAnnouncer() {
    if (!window.speechSynthesis) return;
    while (speechSynthesis.speaking) {
      await this.delay(100);
    }
    // Small buffer after speech ends
    await this.delay(400);
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
