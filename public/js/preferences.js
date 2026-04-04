// Dart Scorer - Preferences Module
// Pro-only settings that persist across devices

let userPrefs = {};

function showPrefsPage() {
  if (!isProLoggedIn()) {
    showAuthModal('login');
    return;
  }

  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('statsPage').classList.add('hidden');
  document.getElementById('prefsPage').classList.remove('hidden');

  if (proUser.tier === 'pro') {
    loadPrefs();
  } else {
    showLockedPrefs();
  }
}

function showLockedPrefs() {
  const content = document.getElementById('prefsContent');
  content.innerHTML = `
    <div class="stats-pro-wall">
      <div class="stats-pro-wall-inner">
        <div class="prefs-section">
          <h2 class="prefs-section-title">Profile</h2>
          <div class="prefs-row">
            <label class="prefs-label">Display Name</label>
            <span style="color:var(--text-light);">Your Name</span>
          </div>
        </div>
        <div class="prefs-section">
          <h2 class="prefs-section-title">Sounds</h2>
          <div class="prefs-row">
            <label class="prefs-label">Dart Sounds</label>
            <span style="color:var(--accent-green);">On</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Default Sound</label>
            <span style="color:var(--text-light);">Classic Thud</span>
          </div>
        </div>
        <div class="prefs-section">
          <h2 class="prefs-section-title">Announcer</h2>
          <div class="prefs-row">
            <label class="prefs-label">Announcer</label>
            <span style="color:var(--accent-green);">On</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Language</label>
            <span style="color:var(--text-light);">English</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Voice</label>
            <span style="color:var(--text-light);">Default</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Speed</label>
            <span style="color:var(--text-light);">1.0x</span>
          </div>
        </div>
        <div class="prefs-section">
          <h2 class="prefs-section-title">Gameplay Defaults</h2>
          <div class="prefs-row">
            <label class="prefs-label">Default Game</label>
            <span style="color:var(--text-light);">X01</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Starting Score</label>
            <span style="color:var(--text-light);">501</span>
          </div>
          <div class="prefs-row">
            <label class="prefs-label">Double Out</label>
            <span style="color:var(--accent-green);">On</span>
          </div>
        </div>
      </div>
      <div class="stats-pro-wall-overlay">
        <div class="stats-pro-wall-cta">
          <span class="pro-badge" style="font-size:0.85rem;padding:0.3rem 0.6rem;">PRO</span>
          <h3>Customize Your Experience</h3>
          <p>Choose your dart sounds, set up the announcer with your preferred language and voice, and save your default game settings across all devices.</p>
          <button class="btn btn-accent" onclick="showUpgradeModal()">Start Free Trial</button>
          <p class="stats-locked-price">7 days free, then $5.99/month or $49.99/year</p>
        </div>
      </div>
    </div>
  `;
}

async function loadPrefs() {
  const content = document.getElementById('prefsContent');
  content.innerHTML = '<div class="loading-text">Loading preferences...</div>';

  try {
    const res = await proFetch('/api/auth/preferences');
    if (!res.ok) throw new Error();
    const data = await res.json();
    userPrefs = data.preferences || {};
    renderPrefs();
  } catch (e) {
    content.innerHTML = '<div class="loading-text">Failed to load preferences.</div>';
  }
}

function renderPrefs() {
  const content = document.getElementById('prefsContent');
  const sounds = DartSounds.getSoundList();
  const currentSound = userPrefs.dartSound || 'thud';
  const soundEnabled = userPrefs.soundEnabled !== false;
  const announcerEnabled = userPrefs.announcerEnabled !== false;
  const announcerLang = userPrefs.announcerLanguage || 'en';
  const announcerVoice = userPrefs.announcerVoice || '';
  const announcerRate = userPrefs.announcerRate || 1.0;
  const defaultGameType = userPrefs.defaultGameType || 'x01';
  const defaultStartScore = userPrefs.defaultStartScore || 501;
  const defaultDoubleOut = userPrefs.defaultDoubleOut !== false;
  const displayName = userPrefs.displayName || (proUser ? proUser.displayName : '');

  // Get available voices
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const langVoices = voices.filter(v => v.lang.startsWith(announcerLang));

  content.innerHTML = `
    <!-- Profile -->
    <div class="prefs-section">
      <h2 class="prefs-section-title">Profile</h2>
      <div class="prefs-row">
        <label class="prefs-label" for="prefDisplayName">Display Name</label>
        <input type="text" id="prefDisplayName" class="input prefs-input" value="${escapeHtml(displayName)}" maxlength="30" />
      </div>
    </div>

    <!-- Sounds -->
    <div class="prefs-section">
      <h2 class="prefs-section-title">Sounds</h2>
      <div class="prefs-row">
        <label class="prefs-label">Dart Sounds</label>
        <label class="toggle">
          <input type="checkbox" id="prefSoundEnabled" ${soundEnabled ? 'checked' : ''} onchange="previewPrefToggle()">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="prefs-row">
        <label class="prefs-label" for="prefDartSound">Default Sound</label>
        <select id="prefDartSound" class="input prefs-select" onchange="previewSound()">
          ${sounds.map(s => `<option value="${s.id}" ${s.id === currentSound ? 'selected' : ''}>${s.emoji} ${s.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Announcer -->
    <div class="prefs-section">
      <h2 class="prefs-section-title">Announcer</h2>
      <div class="prefs-row">
        <label class="prefs-label">Announcer</label>
        <label class="toggle">
          <input type="checkbox" id="prefAnnouncerEnabled" ${announcerEnabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="prefs-row">
        <label class="prefs-label" for="prefAnnouncerLang">Language</label>
        <select id="prefAnnouncerLang" class="input prefs-select" onchange="updateVoiceList()">
          <option value="en" ${announcerLang === 'en' ? 'selected' : ''}>English</option>
          <option value="es" ${announcerLang === 'es' ? 'selected' : ''}>Espa\u00f1ol</option>
        </select>
      </div>
      <div class="prefs-row">
        <label class="prefs-label" for="prefAnnouncerVoice">Voice</label>
        <select id="prefAnnouncerVoice" class="input prefs-select"
          ${renderVoiceOptions(announcerLang, announcerVoice)}
        </select>
      </div>
      <div class="prefs-row">
        <label class="prefs-label" for="prefAnnouncerRate">Speed</label>
        <div class="prefs-range-row">
          <input type="range" id="prefAnnouncerRate" min="0.5" max="1.5" step="0.1" value="${announcerRate}" oninput="updateRateLabel()">
          <span id="prefRateLabel" class="prefs-range-label">${announcerRate}x</span>
        </div>
      </div>
      <button class="btn btn-accent" onclick="previewAnnouncer()" style="margin-top:0.75rem;width:100%;">Preview Voice</button>
    </div>

    <!-- Gameplay Defaults -->
    <div class="prefs-section">
      <h2 class="prefs-section-title">Gameplay Defaults</h2>
      <div class="prefs-row">
        <label class="prefs-label" for="prefDefaultGame">Default Game</label>
        <select id="prefDefaultGame" class="input prefs-select">
          <option value="x01" ${defaultGameType === 'x01' ? 'selected' : ''}>X01</option>
          <option value="cricket" ${defaultGameType === 'cricket' ? 'selected' : ''}>Cricket</option>
          <option value="around-the-clock" ${defaultGameType === 'around-the-clock' ? 'selected' : ''}>Around the Clock</option>
        </select>
      </div>
      <div class="prefs-row">
        <label class="prefs-label" for="prefStartScore">X01 Starting Score</label>
        <select id="prefStartScore" class="input prefs-select">
          <option value="301" ${defaultStartScore === 301 ? 'selected' : ''}>301</option>
          <option value="501" ${defaultStartScore === 501 ? 'selected' : ''}>501</option>
          <option value="701" ${defaultStartScore === 701 ? 'selected' : ''}>701</option>
        </select>
      </div>
      <div class="prefs-row">
        <label class="prefs-label">Double Out</label>
        <label class="toggle">
          <input type="checkbox" id="prefDoubleOut" ${defaultDoubleOut ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <button class="btn btn-primary" onclick="savePrefs()" style="width:100%;margin-top:0.5rem;">Save Preferences</button>
    <div id="prefsSaveStatus" class="prefs-save-status" style="display:none;"></div>
  `;

  // Ensure voices are loaded (sometimes async)
  if (voices.length === 0 && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function() {
      updateVoiceList();
    };
  }
}

function renderVoiceOptions(lang, selectedVoice) {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const filtered = voices.filter(v => v.lang.startsWith(lang));
  if (filtered.length === 0) {
    return '<option value="">Default</option>';
  }
  return '<option value="">Default</option>' +
    filtered.map(v => {
      const label = v.name + (v.localService ? '' : ' (online)');
      return `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === selectedVoice ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function updateVoiceList() {
  const lang = document.getElementById('prefAnnouncerLang').value;
  const voiceSelect = document.getElementById('prefAnnouncerVoice');
  voiceSelect.innerHTML = renderVoiceOptions(lang, '');
}

function updateRateLabel() {
  const rate = document.getElementById('prefAnnouncerRate').value;
  document.getElementById('prefRateLabel').textContent = rate + 'x';
}

function previewSound() {
  const soundId = document.getElementById('prefDartSound').value;
  DartSounds.playSound(soundId);
}

function previewPrefToggle() {
  // Just a visual toggle, actual effect on save
}

function previewAnnouncer() {
  const lang = document.getElementById('prefAnnouncerLang').value;
  const voiceURI = document.getElementById('prefAnnouncerVoice').value;
  const rate = parseFloat(document.getElementById('prefAnnouncerRate').value) || 1.0;

  if (!window.speechSynthesis) return;

  const text = lang === 'es' ? 'Ciento ochenta!' : 'One hundred and eighty!';
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;

  if (voiceURI) {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.voiceURI === voiceURI);
    if (voice) utter.voice = voice;
  }

  speechSynthesis.speak(utter);
}

async function savePrefs() {
  const prefs = {
    displayName: document.getElementById('prefDisplayName').value.trim(),
    soundEnabled: document.getElementById('prefSoundEnabled').checked,
    dartSound: document.getElementById('prefDartSound').value,
    announcerEnabled: document.getElementById('prefAnnouncerEnabled').checked,
    announcerLanguage: document.getElementById('prefAnnouncerLang').value,
    announcerVoice: document.getElementById('prefAnnouncerVoice').value,
    announcerRate: parseFloat(document.getElementById('prefAnnouncerRate').value) || 1.0,
    defaultGameType: document.getElementById('prefDefaultGame').value,
    defaultStartScore: parseInt(document.getElementById('prefStartScore').value),
    defaultDoubleOut: document.getElementById('prefDoubleOut').checked,
  };

  try {
    const res = await proFetch('/api/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences: prefs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    userPrefs = data.preferences;

    // Update display name in local state
    if (prefs.displayName && proUser) {
      proUser.displayName = prefs.displayName;
      saveProAuth(proToken, proUser);
      renderUserBar();
    }

    // Apply preferences immediately
    applyPreferences(userPrefs);

    const status = document.getElementById('prefsSaveStatus');
    status.textContent = 'Preferences saved!';
    status.style.display = '';
    status.className = 'prefs-save-status success';
    setTimeout(() => { status.style.display = 'none'; }, 2000);
  } catch (e) {
    const status = document.getElementById('prefsSaveStatus');
    status.textContent = 'Failed to save: ' + e.message;
    status.style.display = '';
    status.className = 'prefs-save-status error';
  }
}

// Apply preferences to the app
function applyPreferences(prefs) {
  // Announcer settings
  if (typeof DartAnnouncer !== 'undefined') {
    if (prefs.announcerEnabled === false) {
      DartAnnouncer._muted = true;
    } else {
      DartAnnouncer._muted = false;
    }
    if (prefs.announcerLanguage) {
      DartAnnouncer.setLanguage(prefs.announcerLanguage);
    }
    if (prefs.announcerVoice) {
      DartAnnouncer.setVoice(prefs.announcerVoice);
    }
    if (prefs.announcerRate) {
      DartAnnouncer._rate = prefs.announcerRate;
    }
  }
}

// Load and apply preferences on startup
async function loadAndApplyPreferences() {
  if (!isProLoggedIn() || proUser.tier !== 'pro') return;
  try {
    const res = await proFetch('/api/auth/preferences');
    if (res.ok) {
      const data = await res.json();
      userPrefs = data.preferences || {};
      applyPreferences(userPrefs);
    }
  } catch (e) {
    // Silent fail
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
