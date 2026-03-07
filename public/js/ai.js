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
        gameData = await submitResponse.json();
        saveRecentGame(currentGameId, gameData);
      }
    } catch (e) {
      console.error('AI turn failed:', e);
    }

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

      if (i < darts.length) {
        // Wait before revealing next dart
        await this.delay(600);
      }
    }

    // Final pause showing all darts
    await this.delay(800);
  },

  getDartLabel(dart) {
    if (dart.label) return dart.label;
    if ('hit' in dart) return dart.hit ? 'HIT' : 'Miss';
    return '?';
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
