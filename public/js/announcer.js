// ─── Virtual Announcer Module ─────────────────────────────
// Text-to-speech announcer using Web Speech API

const DartAnnouncer = {
  _muted: false,
  _lang: 'en',
  _voiceURI: null,
  _voices: [],
  _voicesLoaded: false,

  // ── Translations ────────────────────────────────
  PHRASES: {
    en: {
      turnChange: "{0}'s turn",
      scored: "{0} scored {1}",
      scoredRemaining: "{0} scored {1}, {2} remaining",
      oneEighty: "One hundred and eighty!",
      bust: "Bust!",
      checkout: "{0} checks out!",
      single: "Single {0}",
      double: "Double {0}",
      triple: "Triple {0}",
      bull: "Bull",
      doubleBull: "Double Bull",
      miss: "Miss",
      closed: "{0} closed!",
      points: "{0} points on {1}",
      hit: "Hit!",
      missATC: "Miss",
      atcSummary: "{0} hit {1}, now on {2}",
      atcNone: "{0}, no hits",
      finishes: "{0} finishes!",
      wins: "{0} wins!",
    },
    es: {
      turnChange: "Turno de {0}",
      scored: "{0} anotó {1}",
      scoredRemaining: "{0} anotó {1}, {2} restante",
      oneEighty: "¡Ciento ochenta!",
      bust: "¡Nulo!",
      checkout: "¡{0} cierra!",
      single: "Simple {0}",
      double: "Doble {0}",
      triple: "Triple {0}",
      bull: "Diana",
      doubleBull: "Doble Diana",
      miss: "Fallo",
      closed: "¡{0} cerrado!",
      points: "{0} puntos en {1}",
      hit: "¡Acierto!",
      missATC: "Fallo",
      atcSummary: "{0} acertó {1}, ahora en {2}",
      atcNone: "{0}, sin aciertos",
      finishes: "¡{0} termina!",
      wins: "¡{0} gana!",
    },
  },

  // ── Init ────────────────────────────────────────
  init() {
    this._loadVoices();
    this._loadPreferences();
  },

  _loadVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      this._voices = voices;
      this._voicesLoaded = true;
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      this._voices = speechSynthesis.getVoices();
      this._voicesLoaded = true;
    };
  },

  // ── Preferences ─────────────────────────────────
  _savePreferences() {
    try {
      localStorage.setItem('dart_announcer_prefs', JSON.stringify({
        muted: this._muted,
        lang: this._lang,
        voiceURI: this._voiceURI,
      }));
    } catch (e) { /* ignore */ }
  },

  _loadPreferences() {
    try {
      const prefs = JSON.parse(localStorage.getItem('dart_announcer_prefs'));
      if (prefs) {
        this._muted = !!prefs.muted;
        this._lang = prefs.lang || 'en';
        this._voiceURI = prefs.voiceURI || null;
      }
    } catch (e) { /* ignore */ }
  },

  // ── Voice Selection ─────────────────────────────
  setLanguage(lang) {
    this._lang = lang;
    this._voiceURI = null; // reset voice when language changes
    this._savePreferences();
  },

  setVoice(voiceURI) {
    this._voiceURI = voiceURI;
    this._savePreferences();
  },

  _classifyAccent(lang) {
    if (lang.includes('GB') || lang.includes('UK')) return 'British';
    if (lang.includes('AU')) return 'Australian';
    if (lang.includes('IN')) return 'Indian';
    if (lang.startsWith('es')) return 'Spanish';
    return 'US';
  },

  getVoiceList() {
    const targetPrefix = this._lang === 'es' ? 'es' : 'en';
    return this._voices
      .filter(v => v.lang.startsWith(targetPrefix))
      .map(v => ({
        uri: v.voiceURI,
        name: v.name,
        lang: v.lang,
        accent: this._classifyAccent(v.lang),
      }))
      .sort((a, b) => a.accent.localeCompare(b.accent) || a.name.localeCompare(b.name));
  },

  // ── Mute ────────────────────────────────────────
  mute() { this._muted = true; this._savePreferences(); },
  unmute() { this._muted = false; this._savePreferences(); },
  toggleMute() {
    this._muted = !this._muted;
    this._savePreferences();
    return this._muted;
  },
  isMuted() { return this._muted; },

  // ── Core Speech ─────────────────────────────────
  _getPhrase(key, ...args) {
    const phrases = this.PHRASES[this._lang] || this.PHRASES.en;
    let text = phrases[key] || this.PHRASES.en[key] || '';
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, arg);
    });
    return text;
  },

  _makeUtterance(text, options = {}) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this._lang === 'es' ? 'es-ES' : 'en-US';
    if (this._voiceURI) {
      const voice = this._voices.find(v => v.voiceURI === this._voiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    utterance.rate = options.rate || 0.9;
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 1.0;
    return utterance;
  },

  _cancelAndSpeak(text, options = {}) {
    if (typeof isProLoggedIn === 'function' && (!isProLoggedIn() || proUser.tier !== 'pro')) return;
    if (this._muted || !text || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(this._makeUtterance(text, options));
  },

  // Queue without canceling — waits for current speech to finish first
  _queueSpeak(text, options = {}) {
    if (typeof isProLoggedIn === 'function' && (!isProLoggedIn() || proUser.tier !== 'pro')) return;
    if (this._muted || !text || !window.speechSynthesis) return;
    speechSynthesis.speak(this._makeUtterance(text, options));
  },

  // ── Announcement Methods ────────────────────────

  announceTurnChange(playerName) {
    this._cancelAndSpeak(this._getPhrase('turnChange', playerName));
  },

  // X01: after turn submission
  announceX01Turn(lastTurn, player) {
    if (!lastTurn) return;
    if (lastTurn.turnTotal === 180) {
      this._queueSpeak(this._getPhrase('oneEighty'), { rate: 0.85, pitch: 1.1 });
    } else if (lastTurn.bust) {
      this._queueSpeak(this._getPhrase('bust'));
    } else {
      this._queueSpeak(
        this._getPhrase('scoredRemaining', lastTurn.playerName, lastTurn.turnTotal, player.remaining)
      );
    }
  },

  // Per-dart announcement (used by X01, Cricket, etc.)
  announceDart(label) {
    if (!label) return;
    // Parse the label to get the correct phrase
    let text;
    if (label === 'Miss') {
      text = this._getPhrase('miss');
    } else if (label === 'Bull') {
      text = this._getPhrase('bull');
    } else if (label === 'D-Bull') {
      text = this._getPhrase('doubleBull');
    } else if (label.startsWith('T')) {
      text = this._getPhrase('triple', label.substring(1));
    } else if (label.startsWith('D')) {
      text = this._getPhrase('double', label.substring(1));
    } else {
      text = this._getPhrase('single', label);
    }
    this._queueSpeak(text);
  },

  announceCricketClose(number) {
    const label = number === 25 ? 'Bull' : number;
    this._queueSpeak(this._getPhrase('closed', label));
  },

  announceCricketPoints(points, number) {
    const label = number === 25 ? 'Bull' : number;
    this._queueSpeak(this._getPhrase('points', points, label));
  },

  // Around the Clock: per-dart
  announceATCDart(hit) {
    this._queueSpeak(
      hit ? this._getPhrase('hit') : this._getPhrase('missATC')
    );
  },

  // Around the Clock: turn summary
  announceATCSummary(playerName, hitCount, currentTarget) {
    if (hitCount > 0) {
      const label = currentTarget === 21 ? 'Bull' : currentTarget;
      this._queueSpeak(this._getPhrase('atcSummary', playerName, hitCount, label));
    } else {
      this._queueSpeak(this._getPhrase('atcNone', playerName));
    }
  },

  // Winner
  announceWinner(playerName) {
    this._cancelAndSpeak(this._getPhrase('wins', playerName), { rate: 0.9, pitch: 1.1 });
  },

  // Victory fanfare via Web Audio API
  playVictoryFanfare() {
    if (typeof isProLoggedIn === 'function' && (!isProLoggedIn() || proUser.tier !== 'pro')) return;
    try {
      const ctx = DartSounds._getContext();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, start: 0, dur: 0.15 },     // C5
        { freq: 659.25, start: 0.15, dur: 0.15 },   // E5
        { freq: 783.99, start: 0.30, dur: 0.15 },   // G5
        { freq: 1046.5, start: 0.45, dur: 0.45 },   // C6 sustained
        { freq: 523.25, start: 0.45, dur: 0.45 },   // C5 chord
        { freq: 659.25, start: 0.45, dur: 0.45 },   // E5 chord
        { freq: 783.99, start: 0.45, dur: 0.45 },   // G5 chord
      ];
      for (const note of notes) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note.freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + note.start);
        gain.gain.linearRampToValueAtTime(0.2, now + note.start + 0.03);
        gain.gain.setValueAtTime(0.2, now + note.start + note.dur - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.01);
      }
    } catch (e) {
      // Non-critical
    }
  },
};
