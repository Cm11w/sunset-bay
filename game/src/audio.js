// All sound is synthesised with WebAudio — no audio files, no copyrighted music.
// Three original radio stations (Bay FM synthwave, Harbor Rock, Night Drive) are
// step sequencers of oscillators; SFX are short oscillator/noise bursts. Everything
// is guarded: with no user gesture yet the context stays suspended and calls are no-ops.

export const STATIONS = [
  { name: 'Bay FM — Synthwave', tempo: 112, wave: 'sawtooth', bass: 'triangle', root: 55 },
  { name: 'Harbor Rock', tempo: 132, wave: 'square', bass: 'sawtooth', root: 65.41 },
  { name: 'Night Drive', tempo: 92, wave: 'sine', bass: 'sine', root: 49 },
];

// Chord roots (semitone offsets) and a pentatonic melody, per station.
const PROGRESSIONS = [
  [0, -4, -7, -2], // Am F C G-ish
  [0, 3, -2, 5],
  [0, -2, -4, -7],
];
const MELODIES = [
  [0, 3, 7, 10, 12, 10, 7, 3],
  [0, 5, 7, 12, 10, 7, 5, 0],
  [0, 2, 5, 7, 12, 7, 5, 2],
];

function semitone(root, semis) {
  return root * Math.pow(2, semis / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let station = 0;
  let radioOn = true;
  let nextNoteTime = 0;
  let stepIndex = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  /** Call from any user gesture (click / key) so the context can start. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, wave, vol, when = 0) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  function noiseBurst(dur, vol, lowpass = 1200) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start();
    } catch { /* best-effort */ }
  }

  function note(freq, dur, wave, vol, when) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch { /* best-effort */ }
  }

  /** Schedule the radio a little ahead of time; call every frame. */
  function update(dt) {
    if (!ctx || ctx.state !== 'running' || !radioOn) return;
    const st = STATIONS[station];
    const stepDur = 60 / st.tempo / 2; // eighth notes
    if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const when = nextNoteTime - ctx.currentTime;
      const bar = Math.floor(stepIndex / 8) % 4;
      const root = semitone(st.root, PROGRESSIONS[station][bar]);
      const mel = MELODIES[station][stepIndex % 8];
      if (stepIndex % 2 === 0) note(root, stepDur * 1.8, st.bass, 0.5, when);
      if (stepIndex % 8 === 0) note(root * 2, stepDur * 4, st.wave, 0.16, when);
      if (stepIndex % 4 === 2) note(semitone(root, 7), stepDur * 1.5, st.wave, 0.12, when);
      note(semitone(root * 2, mel), stepDur * 0.9, st.wave, 0.14, when);
      if (stepIndex % 4 === 0) noiseBurst(0.03, 0.05, 4000);
      stepIndex += 1;
      nextNoteTime += stepDur;
    }
    void dt;
  }

  function setStation(next) {
    station = ((next % STATIONS.length) + STATIONS.length) % STATIONS.length;
    stepIndex = 0;
    nextNoteTime = 0;
    return STATIONS[station].name;
  }

  function toggleRadio() {
    radioOn = !radioOn;
    return radioOn;
  }

  /** Step to the next station and return its name. */
  function cycleStation() {
    return setStation(station + 1);
  }

  /** Engine hum follows the player's speed; call every frame. */
  function setEngine(speed01, on) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(sfxGain);
        engineOsc.start();
      }
      const target = on ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 110, ctx.currentTime, 0.08);
    } catch { /* best-effort */ }
  }

  function setSiren(on) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 1.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(sfxGain);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        sirenOsc.stop();
        sirenLfo.stop();
        sirenOsc = null;
        sirenLfo = null;
      }
    } catch { /* best-effort */ }
  }

  function sfx(name, arg) {
    if (!ctx || ctx.state !== 'running') return;
    switch (name) {
      case 'crash': noiseBurst(0.25, 0.5, 900); blip(70, 0.2, 'sawtooth', 0.3); break;
      case 'punch': blip(140, 0.08, 'square', 0.35); noiseBurst(0.06, 0.25, 2000); break;
      case 'pickup': blip(660, 0.09, 'sine', 0.3); blip(880, 0.09, 'sine', 0.3, 0.09); blip(1320, 0.14, 'sine', 0.3, 0.18); break;
      case 'door': blip(220, 0.06, 'square', 0.2); break;
      case 'carjack': blip(180, 0.12, 'sawtooth', 0.3); blip(120, 0.18, 'sawtooth', 0.3, 0.1); break;
      case 'jump': blip(300, 0.12, 'sine', 0.2); break;
      case 'missionStart': [523, 659, 784].forEach((f, i) => blip(f, 0.16, 'sine', 0.28, i * 0.12)); break;
      case 'missionPassed': [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.2, 'sine', 0.28, i * 0.12)); break;
      case 'missionFailed': [392, 330, 262].forEach((f, i) => blip(f, 0.22, 'triangle', 0.28, i * 0.14)); break;
      case 'wasted': [330, 262, 196, 131].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.25, i * 0.18)); break;
      case 'objectiveDone': blip(784, 0.1, 'sine', 0.3); blip(1047, 0.16, 'sine', 0.3, 0.1); break;
      case 'lost': [784, 659, 523].forEach((f, i) => blip(f, 0.14, 'sine', 0.22, i * 0.1)); break;
      case 'siren': break; // siren loop is handled by setSiren
      default: break;
    }
    void arg;
  }

  return {
    unlock, update, setStation, cycleStation, toggleRadio, setEngine, setSiren, sfx,
    get stationName() { return STATIONS[station].name; },
    get radioOn() { return radioOn; },
    get ready() { return !!ctx; },
  };
}
