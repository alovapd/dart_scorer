// Dart Scorer - Upgrade/Payment Module
// In-app card form via Square Web Payments SDK

let squarePayments = null;
let squareCard = null;
let selectedPlan = 'monthly';
let squareConfig = null;
let squareScriptLoaded = false;
let upgradeIsTrial = true;

function selectPlan(plan) {
  selectedPlan = plan;
  document.querySelectorAll('.plan-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.plan === plan);
  });
}

async function loadSquareConfig() {
  if (squareConfig) return squareConfig;
  const res = await fetch('/api/square/config');
  squareConfig = await res.json();
  return squareConfig;
}

function loadSquareScript(environment) {
  return new Promise((resolve, reject) => {
    if (squareScriptLoaded) { resolve(); return; }
    const src = environment === 'sandbox'
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js';
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => { squareScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Square payments'));
    document.head.appendChild(script);
  });
}

async function showUpgradeModal() {
  if (!isProLoggedIn()) {
    showAuthModal('login');
    return;
  }

  const modal = document.getElementById('upgradeModal');
  const errEl = document.getElementById('upgradeError');
  const payBtn = document.getElementById('upgradePayBtn');
  const title = document.getElementById('upgradeModalTitle');
  const trialBanner = document.getElementById('upgradeTrialBanner');
  const planLabel = document.querySelector('.upgrade-plan-label');

  errEl.style.display = 'none';
  payBtn.disabled = true;

  // Determine if this is a trial or direct subscribe
  const subRes = await proFetch('/api/square/subscription');
  const subData = await subRes.json();
  const hadTrial = subData.subscriptionStatus === 'TRIAL' || subData.subscriptionStatus === 'ACTIVE' || subData.subscriptionStatus === 'CANCELED' || subData.subscriptionStatus === 'PENDING';

  if (hadTrial) {
    upgradeIsTrial = false;
    title.textContent = 'Upgrade to Pro';
    trialBanner.style.display = 'none';
    if (planLabel) planLabel.textContent = 'Select your plan:';
    payBtn.textContent = 'Loading payment form...';
  } else {
    upgradeIsTrial = true;
    title.textContent = 'Try Pro Free';
    trialBanner.style.display = '';
    if (planLabel) planLabel.textContent = 'Select plan after trial:';
    payBtn.textContent = 'Loading payment form...';
  }

  modal.classList.add('active');

  try {
    const config = await loadSquareConfig();
    await loadSquareScript(config.environment);

    if (!squarePayments) {
      squarePayments = window.Square.payments(config.applicationId, config.locationId);
    }

    if (squareCard) {
      await squareCard.destroy();
      squareCard = null;
    }

    const container = document.getElementById('cardContainer');
    container.innerHTML = '';

    squareCard = await squarePayments.card({
      style: {
        '.input-container': {
          borderColor: '#2a3a5c',
          borderRadius: '8px',
        },
        '.input-container.is-focus': {
          borderColor: '#00d48a',
        },
        input: {
          backgroundColor: '#16213e',
          color: '#ffffff',
          fontFamily: 'Segoe UI, Arial, sans-serif',
          fontSize: '14px',
        },
        'input::placeholder': {
          color: '#a0a0a0',
        },
      },
    });
    await squareCard.attach('#cardContainer');

    payBtn.disabled = false;
    payBtn.textContent = upgradeIsTrial ? 'Start Free Trial' : 'Subscribe';
  } catch (e) {
    console.error('Square init error:', e);
    errEl.textContent = 'Failed to load payment form. Please try again.';
    errEl.style.display = '';
    payBtn.textContent = upgradeIsTrial ? 'Start Free Trial' : 'Subscribe';
  }
}

function hideUpgradeModal() {
  document.getElementById('upgradeModal').classList.remove('active');
}

async function handleUpgrade() {
  if (!squareCard || !isProLoggedIn()) return;

  const payBtn = document.getElementById('upgradePayBtn');
  const errEl = document.getElementById('upgradeError');
  errEl.style.display = 'none';
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    const tokenResult = await squareCard.tokenize();
    if (tokenResult.status !== 'OK') {
      throw new Error(tokenResult.errors?.[0]?.message || 'Card verification failed');
    }
    const cardToken = tokenResult.token;

    const res = await proFetch('/api/square/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        cardToken: cardToken,
        plan: selectedPlan,
        trial: upgradeIsTrial,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Subscription failed');
    }

    // Update local user state
    proUser.tier = 'pro';
    proUser.trialEndsAt = data.trialEndsAt || null;
    saveProAuth(proToken, proUser);

    hideUpgradeModal();

    if (data.trial) {
      showToast('Trial started! You have 7 days of full Pro access.');
    } else {
      showToast('Welcome to Pro! Your stats are now fully unlocked.');
    }

    renderUserBar();
    renderAccountBanner();
    if (!document.getElementById('statsPage').classList.contains('hidden')) {
      loadStats();
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
    payBtn.disabled = false;
    payBtn.textContent = upgradeIsTrial ? 'Start Free Trial' : 'Subscribe';
  }
}

// Close upgrade modal on overlay click
document.getElementById('upgradeModal').addEventListener('click', function(e) {
  if (e.target === this) hideUpgradeModal();
});
