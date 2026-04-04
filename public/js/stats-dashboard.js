// Dart Scorer - Stats Dashboard
// Renders player stats, game history, and Pro-locked features

function showStatsPage() {
  if (!isProLoggedIn()) {
    showAuthModal('login');
    return;
  }

  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('statsPage').classList.remove('hidden');

  loadStats();
}

async function loadStats() {
  const content = document.getElementById('statsContent');
  content.innerHTML = '<div class="loading-text">Loading stats...</div>';

  try {
    const res = await proFetch('/api/stats');
    if (res.status === 401) {
      clearProAuth();
      showLandingPage();
      showAuthModal('login');
      return;
    }
    const data = await res.json();
    renderStats(data);
  } catch (e) {
    content.innerHTML = '<div class="loading-text">Failed to load stats.</div>';
  }
}

function renderStats(data) {
  const content = document.getElementById('statsContent');
  const isPro = data.tier === 'pro';

  // Overall summary cards — always visible
  const overall = data.overall;
  const winPct = overall.total_games > 0
    ? Math.round((overall.wins / overall.total_games) * 100)
    : 0;

  let html = `
    <div class="stats-summary-grid">
      <div class="stats-card">
        <div class="stats-card-value">${overall.total_games}</div>
        <div class="stats-card-label">Games Played</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${overall.wins}</div>
        <div class="stats-card-label">Wins</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${winPct}%</div>
        <div class="stats-card-label">Win Rate</div>
      </div>
    </div>
  `;

  // No stats yet
  if (!data.x01 && !data.cricket && !data.atc) {
    if (isPro) {
      html += `
        <div class="stats-empty">
          <p>No games recorded yet. Play some games and your stats will appear here!</p>
        </div>
      `;
      content.innerHTML = html;
      return;
    } else {
      // Free user with no games — show Pro upgrade prompt
      html += `
        <div class="stats-section stats-pro-wall" style="position:relative;">
          <div class="stats-empty" style="filter:blur(3px);opacity:0.4;pointer-events:none;">
            <p>Your detailed stats, game history, and improvement insights will appear here.</p>
          </div>
          <div class="stats-pro-wall-overlay" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;">
            <div class="stats-pro-wall-cta">
              <span class="pro-badge" style="font-size:0.85rem;padding:0.3rem 0.6rem;">PRO</span>
              <h3>Unlock Your Full Stats</h3>
              <p>Play games and upgrade to Pro to see detailed averages, game history, personalized insights, and improvement trends.</p>
              <button class="btn btn-accent" onclick="showUpgradeModal()">Start Free Trial</button>
              <p class="stats-locked-price">7 days free, then $5.99/month or $49.99/year</p>
            </div>
          </div>
        </div>
      `;
      content.innerHTML = html;
      return;
    }
  }

  // === Pro-locked section: detailed stats, trends, game history ===
  // Build the inner content (always rendered, blurred if not Pro)

  let proContent = '';

  // X01 Stats
  if (data.x01) {
    const x = data.x01;
    const checkoutPct = x.checkout_attempts > 0
      ? Math.round((x.checkout_hits / x.checkout_attempts) * 100)
      : 0;

    proContent += `
      <div class="stats-section">
        <h2 class="stats-section-title">X01</h2>
        <div class="stats-detail-grid">
          <div class="stats-detail">
            <span class="stats-detail-value">${x.avg_three_dart}</span>
            <span class="stats-detail-label">3-Dart Avg</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.avg_first_9}</span>
            <span class="stats-detail-label">First 9 Avg</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.best_turn}</span>
            <span class="stats-detail-label">Best Turn</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${checkoutPct}%</span>
            <span class="stats-detail-label">Checkout %</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.best_checkout || '-'}</span>
            <span class="stats-detail-label">Best Checkout</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.total_180s}</span>
            <span class="stats-detail-label">180s</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.total_140_plus}</span>
            <span class="stats-detail-label">140+</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.total_100_plus}</span>
            <span class="stats-detail-label">100+</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.games}</span>
            <span class="stats-detail-label">Games</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.wins}</span>
            <span class="stats-detail-label">Wins</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.total_darts}</span>
            <span class="stats-detail-label">Darts Thrown</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${x.total_busts}</span>
            <span class="stats-detail-label">Busts</span>
          </div>
        </div>
      </div>
    `;
  }

  // Cricket Stats
  if (data.cricket) {
    const c = data.cricket;
    proContent += `
      <div class="stats-section">
        <h2 class="stats-section-title">Cricket</h2>
        <div class="stats-detail-grid">
          <div class="stats-detail">
            <span class="stats-detail-value">${c.avg_marks_per_round}</span>
            <span class="stats-detail-label">Marks/Round</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${c.total_triples}</span>
            <span class="stats-detail-label">Triples</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${c.total_doubles}</span>
            <span class="stats-detail-label">Doubles</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${c.games}</span>
            <span class="stats-detail-label">Games</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${c.wins}</span>
            <span class="stats-detail-label">Wins</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${c.total_marks}</span>
            <span class="stats-detail-label">Total Marks</span>
          </div>
        </div>
      </div>
    `;
  }

  // Around the Clock Stats
  if (data.atc) {
    const a = data.atc;
    proContent += `
      <div class="stats-section">
        <h2 class="stats-section-title">Around the Clock</h2>
        <div class="stats-detail-grid">
          <div class="stats-detail">
            <span class="stats-detail-value">${a.avg_hit_rate_pct}%</span>
            <span class="stats-detail-label">Hit Rate</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${a.best_darts_to_finish || '-'}</span>
            <span class="stats-detail-label">Best Finish (darts)</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${a.games}</span>
            <span class="stats-detail-label">Games</span>
          </div>
          <div class="stats-detail">
            <span class="stats-detail-value">${a.wins}</span>
            <span class="stats-detail-label">Wins</span>
          </div>
        </div>
      </div>
    `;
  }

  // Insights & Suggestions
  proContent += `
    <div class="stats-section">
      <h2 class="stats-section-title">Insights &amp; Suggestions</h2>
      <div id="insightsContainer"><div class="loading-text">Analyzing your game...</div></div>
    </div>
  `;

  // Game History
  proContent += `
    <div class="stats-section">
      <h2 class="stats-section-title">Recent Games</h2>
      <div id="gameHistoryList"></div>
    </div>
  `;

  // Wrap in Pro container
  if (isPro) {
    html += proContent;
  } else {
    html += `
      <div class="stats-pro-wall">
        <div class="stats-pro-wall-inner">
          ${proContent}
        </div>
        <div class="stats-pro-wall-overlay">
          <div class="stats-pro-wall-cta">
            <span class="pro-badge" style="font-size:0.85rem;padding:0.3rem 0.6rem;">PRO</span>
            <h3>Unlock Your Full Stats</h3>
            <p>Detailed averages, checkout analysis, game history, personalized insights, and practice suggestions.</p>
            <button class="btn btn-accent" onclick="showUpgradeModal()">Start Free Trial</button>
            <p class="stats-locked-price">7 days free, then $5.99/month or $49.99/year</p>
          </div>
        </div>
      </div>
    `;
  }

  content.innerHTML = html;
  if (isPro) {
    loadGameHistory();
    loadInsights();
  }
}

async function loadGameHistory() {
  const container = document.getElementById('gameHistoryList');
  if (!container) return;

  try {
    const res = await proFetch('/api/stats/games?limit=10');
    const data = await res.json();

    if (data.games.length === 0) {
      container.innerHTML = '<p class="text-muted">No games yet.</p>';
      return;
    }

    const typeLabels = { 'x01': 'X01', 'cricket': 'Cricket', 'around-the-clock': 'Around the Clock' };

    container.innerHTML = data.games.map(g => {
      const date = new Date(g.played_at);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const type = typeLabels[g.game_type] || g.game_type;

      let detail = '';
      if (g.game_type === 'x01') {
        detail = `Avg: ${g.x01_three_dart_avg} | Darts: ${g.x01_darts_thrown}`;
      } else if (g.game_type === 'cricket') {
        detail = `MPR: ${g.cricket_marks_per_round} | Marks: ${g.cricket_total_marks}`;
      } else if (g.game_type === 'around-the-clock') {
        detail = `Hit Rate: ${Math.round(g.atc_hit_rate * 100)}% | Darts: ${g.atc_darts_thrown}`;
      }

      return `
        <div class="game-history-item">
          <div class="game-history-top">
            <span class="game-history-type">${type}</span>
            <span class="game-history-result ${g.won ? 'win' : 'loss'}">${g.won ? 'WIN' : 'LOSS'}</span>
          </div>
          <div class="game-history-detail">${detail}</div>
          <div class="game-history-date">${dateStr}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="text-muted">Failed to load history.</p>';
  }
}

async function loadInsights() {
  const container = document.getElementById('insightsContainer');
  if (!container) return;

  try {
    const res = await proFetch('/api/stats/insights');
    const data = await res.json();

    if (!data.insights || data.insights.length === 0) {
      container.innerHTML = '<p class="text-muted">Play more games to get personalized insights.</p>';
      return;
    }

    const icons = {
      positive: '\u2705',
      attention: '\u26A0\uFE0F',
      tip: '\uD83C\uDFAF',
      info: '\u2139\uFE0F',
    };

    container.innerHTML = data.insights.map(insight => `
      <div class="insight-card insight-${insight.type}">
        <div class="insight-header">
          <span class="insight-icon">${icons[insight.type] || '\uD83C\uDFAF'}</span>
          <div>
            <span class="insight-category">${insight.category}</span>
            <span class="insight-title">${insight.title}</span>
          </div>
        </div>
        <p class="insight-detail">${insight.detail}</p>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="text-muted">Failed to load insights.</p>';
  }
}
