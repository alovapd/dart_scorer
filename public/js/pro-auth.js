// Dart Scorer - Pro Auth Client
// Handles sign in/up, token management, user state

let proUser = null;
let proToken = null;

// Load saved auth on startup
(function initProAuth() {
  try {
    const saved = localStorage.getItem('dart_scorer_auth');
    if (saved) {
      const data = JSON.parse(saved);
      proToken = data.token;
      proUser = data.user;
    }
  } catch (e) {
    localStorage.removeItem('dart_scorer_auth');
  }
})();

function saveProAuth(token, user) {
  proToken = token;
  proUser = user;
  localStorage.setItem('dart_scorer_auth', JSON.stringify({ token, user }));
  document.body.classList.add('is-logged-in');
  renderUserBar();
}

function clearProAuth() {
  proToken = null;
  proUser = null;
  localStorage.removeItem('dart_scorer_auth');
  document.body.classList.remove('is-logged-in');
  renderUserBar();
}

function isProLoggedIn() {
  return !!proToken && !!proUser;
}

// Authenticated fetch helper
function proFetch(url, options = {}) {
  const headers = { ...options.headers };
  if (proToken) {
    headers['Authorization'] = 'Bearer ' + proToken;
  }
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

// Render the user bar on the landing page
function renderUserBar() {
  const rightSlot = document.getElementById('userBarRight');
  const statsBtn = document.getElementById('myStatsBtn');
  const prefsBtn = document.getElementById('myPrefsBtn');
  const anonBanner = document.getElementById('anonBanner');

  // Scrolling banner — show only for anonymous users
  if (anonBanner) {
    const showBanner = !isProLoggedIn();
    anonBanner.style.display = showBanner ? 'flex' : 'none';
    document.body.classList.toggle('has-anon-banner', showBanner);
  }

  if (isProLoggedIn()) {
    const isPro = proUser.tier === 'pro';
    rightSlot.innerHTML = `
      <span class="user-bar-name">${escapeHtmlSafe(proUser.displayName)}</span>
      ${isPro ? '<span class="pro-badge">PRO</span>' : ''}
      <button class="btn btn-small btn-outline" onclick="showAccountModal()">Account</button>
      <button class="btn btn-small btn-outline" onclick="handleProLogout()">Sign Out</button>
    `;
    statsBtn.style.display = '';
    prefsBtn.style.display = '';
  } else {
    rightSlot.innerHTML = `
      <button class="btn btn-small btn-accent" onclick="showAuthModal('register')">Create Account</button>
      <button class="btn btn-small btn-outline" onclick="showAuthModal('login')">Sign In</button>
    `;
    statsBtn.style.display = 'none';
    prefsBtn.style.display = 'none';
  }
}

function escapeHtmlSafe(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Auth modal
function showAuthModal(mode, message) {
  const modal = document.getElementById('authModal');
  const errEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';
  switchAuthMode(mode || 'login');

  // Show contextual message if provided
  if (message) {
    successEl.textContent = message;
    successEl.style.display = '';
  }

  modal.classList.add('active');
}

function hideAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function switchAuthMode(mode) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const title = document.getElementById('authModalTitle');
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authSuccess').style.display = 'none';

  if (mode === 'register') {
    loginForm.style.display = 'none';
    registerForm.style.display = '';
    title.textContent = 'Create Account';
  } else {
    registerForm.style.display = 'none';
    loginForm.style.display = '';
    title.textContent = 'Sign In';
  }
}

// Auth handlers
async function handleProLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.style.display = '';
      return;
    }

    saveProAuth(data.token, data.user);

    syncRecentGames();
    loadAndApplyPreferences();

    if (data.gamesClaimed > 0) {
      successEl.textContent = `Welcome back! ${data.gamesClaimed} game${data.gamesClaimed > 1 ? 's' : ''} added to your profile.`;
      successEl.style.display = '';
      setTimeout(() => hideAuthModal(), 2000);
    } else {
      hideAuthModal();
      showToast('Signed in as ' + data.user.displayName);
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = '';
  }
}

async function handleProRegister(e) {
  e.preventDefault();
  const displayName = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: displayName || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.style.display = '';
      return;
    }

    saveProAuth(data.token, data.user);

    syncRecentGames();
    loadAndApplyPreferences();

    if (data.gamesClaimed > 0) {
      successEl.innerHTML = `Account created! <strong>${data.gamesClaimed} game${data.gamesClaimed > 1 ? 's' : ''}</strong> from your history have been added to your profile.`;
      successEl.style.display = '';
      setTimeout(() => hideAuthModal(), 3000);
    } else {
      hideAuthModal();
      showToast('Account created! Welcome, ' + data.user.displayName);
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = '';
  }
}

function handleProLogout() {
  clearProAuth();
  _serverRecentGames = null;
  renderRecentGames();
  renderAccountBanner();
  showToast('Signed out');
}

// Refresh user state from server (syncs Pro status across devices)
async function refreshProUser() {
  if (!isProLoggedIn()) return;
  try {
    const res = await proFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      const changed = proUser.tier !== data.user.tier || proUser.displayName !== data.user.displayName;
      proUser.tier = data.user.tier;
      proUser.displayName = data.user.displayName;
      saveProAuth(proToken, proUser);
      if (changed) {
        renderUserBar();
        renderAccountBanner();
        renderRecentGames();
      }
    } else if (res.status === 401) {
      clearProAuth();
      renderUserBar();
      renderAccountBanner();
    }
  } catch (e) {
    // Silent fail — offline or server error
  }
}

// === Account Modal ===

async function showAccountModal() {
  if (!isProLoggedIn()) return;

  const modal = document.getElementById('accountModal');
  const body = document.getElementById('accountModalBody');
  body.innerHTML = '<div class="loading-text">Loading...</div>';
  modal.classList.add('active');

  try {
    const [meRes, subRes] = await Promise.all([
      proFetch('/api/auth/me'),
      proFetch('/api/square/subscription'),
    ]);
    const meData = await meRes.json();
    const subData = await subRes.json();
    renderAccountModal(meData.user, subData);
  } catch (e) {
    body.innerHTML = '<div class="loading-text">Failed to load account info.</div>';
  }
}

function hideAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function renderAccountModal(user, sub) {
  const body = document.getElementById('accountModalBody');

  const planNames = { monthly: 'Monthly ($5.99/mo)', annual: 'Annual ($49.99/yr)' };
  const isTrial = sub.subscriptionStatus === 'TRIAL';
  const isActive = sub.subscriptionStatus === 'ACTIVE' || sub.subscriptionStatus === 'PENDING';
  const isCanceled = sub.subscriptionStatus === 'CANCELED';
  const hasSubscription = isTrial || isActive;

  let trialDaysLeft = 0;
  if (isTrial && sub.trialEndsAt) {
    const trialEnd = new Date(sub.trialEndsAt + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    trialDaysLeft = Math.max(0, Math.round((trialEnd - now) / (1000 * 60 * 60 * 24)));
  }

  let subscriptionHtml = '';
  if (isTrial) {
    subscriptionHtml = `
      <div class="account-sub-info">
        <div class="account-sub-status trial">Trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left</div>
        <div class="account-sub-plan">${planNames[sub.subscriptionPlan] || sub.subscriptionPlan} starts after trial</div>
      </div>
    `;
  } else if (isActive) {
    subscriptionHtml = `
      <div class="account-sub-info">
        <div class="account-sub-status active">Pro — Active</div>
        <div class="account-sub-plan">${planNames[sub.subscriptionPlan] || sub.subscriptionPlan}</div>
        <div class="account-sub-since">Since ${new Date(sub.subscriptionStart).toLocaleDateString()}</div>
      </div>
    `;
  } else if (isCanceled) {
    const stillHasAccess = user.tier === 'pro';
    const endDate = sub.subscriptionEnd ? new Date(sub.subscriptionEnd).toLocaleDateString() : null;
    subscriptionHtml = `
      <div class="account-sub-info">
        <div class="account-sub-status canceled">Canceled</div>
        ${stillHasAccess && endDate
          ? `<p class="account-sub-note">You still have Pro access until ${endDate}.</p>`
          : '<p class="account-sub-note">Your Pro access has ended.</p>'
        }
        <button class="btn btn-small btn-accent" onclick="hideAccountModal(); showUpgradeModal();">Resubscribe</button>
      </div>
    `;
  } else {
    subscriptionHtml = `
      <div class="account-sub-info">
        <div class="account-sub-status free">Free Account</div>
        <button class="btn btn-small btn-accent" onclick="hideAccountModal(); showUpgradeModal();">Start Free Trial</button>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="account-section">
      <div class="account-field">
        <span class="account-label">Display Name</span>
        <span class="account-value">${escapeHtmlSafe(user.displayName)}</span>
      </div>
      <div class="account-field">
        <span class="account-label">Email</span>
        <span class="account-value">${escapeHtmlSafe(user.email)}</span>
      </div>
      <div class="account-field">
        <span class="account-label">Member since</span>
        <span class="account-value">${new Date(user.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
    <div class="account-section">
      <h3 class="account-section-title">Subscription</h3>
      ${subscriptionHtml}
    </div>
    <div class="account-faq-link">
      <a href="#" onclick="hideAccountModal(); showFaqPage(); return false;">Help & FAQ</a>
    </div>
  `;
}

function confirmCancelSubscription() {
  const body = document.getElementById('accountModalBody');
  const subInfo = body.querySelector('.account-sub-info');
  if (!subInfo) return;

  subInfo.innerHTML = `
    <div class="account-cancel-confirm">
      <p>Are you sure you want to cancel?</p>
      <p class="account-sub-note">You'll lose access to all Pro features.</p>
      <div class="account-cancel-btns">
        <button class="btn btn-small btn-secondary" onclick="showAccountModal()">Keep Subscription</button>
        <button class="btn btn-small btn-danger" onclick="executeCancelSubscription()">Yes, Cancel</button>
      </div>
    </div>
  `;
}

async function executeCancelSubscription() {
  try {
    const res = await proFetch('/api/square/cancel', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error);
    }

    if (data.immediate) {
      // Trial cancel — lose access now, reload to reset all UI
      proUser.tier = 'free';
      saveProAuth(proToken, proUser);
      hideAccountModal();
      showToast(data.message);
      setTimeout(() => window.location.reload(), 500);
      return;
    }
    // Paid cancel — tier stays 'pro' until period ends

    renderUserBar();
    renderAccountBanner();
    hideAccountModal();
    showToast(data.message);
  } catch (e) {
    showToast('Failed to cancel: ' + e.message);
  }
}

// Close modals on overlay click
document.getElementById('authModal').addEventListener('click', function(e) {
  if (e.target === this) hideAuthModal();
});
document.getElementById('accountModal').addEventListener('click', function(e) {
  if (e.target === this) hideAccountModal();
});
