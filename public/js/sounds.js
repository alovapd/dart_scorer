// ─── Dart Sounds Module ──────────────────────────────────
// Synthesized dart sounds using Web Audio API — no external files

const DartSounds = {
  _ctx: null,
  _unlocked: false,
  _playerSounds: {}, // { playerId: soundId } — survives gameData overwrites

  // ── Sound Catalog ────────────────────────────────
  SOUNDS: [
    {
      id: 'thud',
      name: 'Classic Thud',
      emoji: '\uD83C\uDFAF',
      synthesize(ctx) {
        const now = ctx.currentTime;
        const dur = 0.15;
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 150;
        filter.Q.value = 1.5;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + dur);
      },
    },
    {
      id: 'sharp',
      name: 'Sharp Hit',
      emoji: '\uD83D\uDCA5',
      synthesize(ctx) {
        const now = ctx.currentTime;

        // Click tone
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        // Noise layer
        const bufSize = Math.floor(ctx.sampleRate * 0.06);
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.3, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        const hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 800;

        osc.connect(gain);
        gain.connect(ctx.destination);
        noise.connect(hpf);
        hpf.connect(nGain);
        nGain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
        noise.start(now);
        noise.stop(now + 0.06);
      },
    },
    {
      id: 'soft',
      name: 'Soft Toss',
      emoji: '\uD83E\uDDF6',
      synthesize(ctx) {
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 80;

        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 200;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(lpf);
        lpf.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      },
    },
    {
      id: 'whoosh',
      name: 'Whoosh',
      emoji: '\uD83D\uDCA8',
      synthesize(ctx) {
        const now = ctx.currentTime;
        const dur = 0.3;
        const bufSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.Q.value = 2;
        bpf.frequency.setValueAtTime(3000, now);
        bpf.frequency.exponentialRampToValueAtTime(200, now + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
        gain.gain.setValueAtTime(0.5, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(bpf);
        bpf.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + dur);
      },
    },
    {
      id: 'laser',
      name: 'Laser Pew',
      emoji: '\uD83D\uDD2B',
      synthesize(ctx) {
        const now = ctx.currentTime;
        const dur = 0.2;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
      },
    },
    {
      id: 'jet',
      name: 'Jet Flyby',
      emoji: '\u2708\uFE0F',
      synthesize(ctx) {
        const now = ctx.currentTime;
        const dur = 0.4;
        const bufSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Doppler sweep — frequency up then down
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.Q.value = 5;
        bpf.frequency.setValueAtTime(300, now);
        bpf.frequency.exponentialRampToValueAtTime(2500, now + dur * 0.4);
        bpf.frequency.exponentialRampToValueAtTime(200, now + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.6, now + dur * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(bpf);
        bpf.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + dur);
      },
    },
    {
      id: 'pop',
      name: 'Pop',
      emoji: '\uD83E\uDEE7',
      synthesize(ctx) {
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.06);
        // Small secondary bump
        gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      },
    },
    {
      id: 'ricochet',
      name: 'Ricochet',
      emoji: '\u2B50',
      synthesize(ctx) {
        const now = ctx.currentTime;
        const dur = 0.35;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(3000, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.2);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        // Echo bounce
        const delay = ctx.createDelay(0.2);
        delay.delayTime.value = 0.1;
        const echoGain = ctx.createGain();
        echoGain.gain.value = 0.3;

        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.connect(delay);
        delay.connect(echoGain);
        echoGain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + dur + 0.15);
      },
    },
    {
      id: 'none',
      name: 'No Sound',
      emoji: '\uD83D\uDD07',
      synthesize() { /* silent */ },
    },
  ],

  // ── AudioContext Management ──────────────────────
  _getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  },

  init() {
    const unlock = () => {
      const ctx = this._getContext();
      if (ctx.state === 'suspended') ctx.resume();
      this._unlocked = true;
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('click', unlock, true);
  },

  // ── Public API ──────────────────────────────────
  getSoundList() {
    return this.SOUNDS.map(s => ({ id: s.id, name: s.name, emoji: s.emoji }));
  },

  playSound(soundId) {
    const sound = this.SOUNDS.find(s => s.id === soundId);
    if (!sound || soundId === 'none') return;
    try {
      const ctx = this._getContext();
      if (ctx.state === 'suspended') ctx.resume();
      sound.synthesize(ctx);
    } catch (e) {
      // Silently fail — sound is non-critical
    }
  },

  setPlayerSound(playerId, soundId) {
    this._playerSounds[playerId] = soundId;
  },

  getPlayerSound(playerId) {
    return this._playerSounds[playerId] || 'thud';
  },

  playForCurrentPlayer() {
    if (typeof gameData === 'undefined' || !gameData) return;
    const player = gameData.players[gameData.currentPlayerIndex];
    if (player) {
      const soundId = this._playerSounds[player.id] || player.soundId || 'thud';
      this.playSound(soundId);
    }
  },
};
