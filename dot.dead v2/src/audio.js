// Fully synthesized soundscape (Web Audio API, no asset files):
// - wind: looped noise through a slowly-modulated bandpass filter
// - crows: formant-filtered sawtooth caws, random interval 7–20 s
// - footsteps: short low-passed noise bursts
// Starts on first user gesture (pointer-lock click). M toggles mute.

const Audio3D = (() => {
  let ctx = null;
  let master = null;
  let masterLP = null; // dissolution: closes over the whole mix to muffle it
  let muted = false;
  let crowTimer = null;
  let birdsOn = true; // the finale silences the crows for good

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // --- wind ----------------------------------------------------------------
  function startWind() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;

    // tuned dark and slow: bright sweeping noise reads as "running water",
    // so the wind sits low with a gentle sweep — air, not a stream
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 210;
    bp.Q.value = 0.45;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 560;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    // two slow LFOs at unrelated periods → non-static gusts
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.05;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 55;
    lfo1.connect(lfo1Gain).connect(bp.frequency);

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.043;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.022;
    lfo2.connect(lfo2Gain).connect(gain.gain);

    src.connect(bp).connect(lp).connect(gain).connect(master);
    src.start();
    lfo1.start();
    lfo2.start();
  }

  // --- crows ---------------------------------------------------------------
  // the original caw (v1): a formant-filtered sawtooth sweep
  function caw(when, pan, dist, gainMult) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620 + Math.random() * 120, when);
    osc.frequency.exponentialRampToValueAtTime(380 + Math.random() * 60, when + 0.16);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1100 + Math.random() * 300;
    formant.Q.value = 2.2;

    // distance: farther → darker and quieter
    const far = ctx.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 2600 - dist * 1600;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.11 * (1 - dist * 0.6) * (gainMult || 1), when + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const tail = panner || ctx.createGain();
    if (panner) panner.pan.value = pan;

    osc.connect(formant).connect(far).connect(env).connect(tail).connect(master);
    osc.start(when);
    osc.stop(when + 0.25);
  }

  function crowCall() {
    const t = ctx.currentTime + 0.05;
    const pan = Math.random() * 1.6 - 0.8;
    const dist = 0.4 + Math.random() * 0.6; // always somewhat distant
    const caws = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < caws; i++) {
      caw(t + i * (0.28 + Math.random() * 0.1), pan, dist);
    }
    scheduleCrow();
  }

  // a startled crow taking off nearby: one caw, 70% louder than the background ones
  function crowFlee() {
    if (!ctx || muted || !birdsOn) return;
    caw(ctx.currentTime + 0.03, Math.random() * 0.6 - 0.3, 0.1, 1.7);
  }

  function scheduleCrow() {
    const delay = 7000 + Math.random() * 13000; // 7–20 s
    crowTimer = setTimeout(() => {
      if (ctx && ctx.state === 'running' && !muted && birdsOn) crowCall();
      else scheduleCrow();
    }, delay);
  }

  // the finale's fog: silence the crows (the wind stays as a bare whisper)
  function silenceBirds() { birdsOn = false; }

  // --- footsteps -------------------------------------------------------------
  let stepFlip = 1;
  function step(running) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.1);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // running steps hit harder and brighter
    lp.frequency.value = (running ? 520 : 380) + Math.random() * 220;

    const peak = (running ? 0.13 : 0.105) + Math.random() * 0.04;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (running ? 0.07 : 0.09));

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const tail = panner || ctx.createGain();
    if (panner) panner.pan.value = stepFlip * 0.12;
    stepFlip *= -1;

    src.connect(lp).connect(env).connect(tail).connect(master);
    src.start(t);
  }

  // wading footstep: a wet splash instead of a dry step — brighter filtered
  // noise burst plus a small droplet "plip". Used while the player is in a lake.
  function splash(running) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.22);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (running ? 1500 : 1150) + Math.random() * 400;
    bp.Q.value = 0.7;

    const peak = (running ? 0.12 : 0.09) + Math.random() * 0.03;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (running ? 0.18 : 0.24));

    // a single bright droplet on top, pitch falling
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950 + Math.random() * 350, t + 0.01);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.14);
    const oenv = ctx.createGain();
    oenv.gain.setValueAtTime(0.0001, t + 0.01);
    oenv.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.035);
    oenv.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const tail = panner || ctx.createGain();
    if (panner) panner.pan.value = stepFlip * 0.12;
    stepFlip *= -1;

    src.connect(hp).connect(bp).connect(env).connect(tail).connect(master);
    osc.connect(oenv).connect(tail);
    src.start(t);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // the finale's "puff": a gentle, noticeable soft whoosh as the fog rushes in.
  // A swelling band of filtered noise that rises in pitch then settles.
  function puff() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.4);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(820, t + 0.45);
    bp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1900;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.17, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);

    src.connect(bp).connect(lp).connect(env).connect(master);
    src.start(t);
    src.stop(t + 1.4);
  }

  // landing after a jump: low thump + soft ground crunch
  function land() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    const oenv = ctx.createGain();
    oenv.gain.setValueAtTime(0.0001, t);
    oenv.gain.exponentialRampToValueAtTime(0.17, t + 0.015);
    oenv.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(oenv).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const nenv = ctx.createGain();
    nenv.gain.setValueAtTime(0.0001, t);
    nenv.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    nenv.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(lp).connect(nenv).connect(master);
    src.start(t);
  }

  // --- organ -------------------------------------------------------------------
  // A distant pipe organ marking each uncollected paper. Volume is driven
  // per-frame by the distance to the nearest paper; audible from where the
  // monument's silhouette first appears, clear (but soft) up close.
  // Max volume ≈ 25% louder than a crow call.
  const ORGAN_MAX = 0.085;
  const ORGAN_EDGE = 0.011; // entering the zone: at or just under the wind bed
  const ORGAN_RANGE = 150;  // meters — half the silhouette range
  let organGain = null;
  let organSuppressedUntil = 0;
  let organTimer = null;
  let chordIndex = 0;
  let organLevel = 0; // JS-side mirror of the target gain (AudioParam.value is unreliable)

  // a slow, modal progression — Am, F, C, Em territory, low register
  const CHORDS = [
    [110.0, 164.8, 220.0],   // A2 E3 A3
    [87.3, 130.8, 174.6],    // F2 C3 F3
    [98.0, 146.8, 196.0],    // G2 D3 G3
    [82.4, 123.5, 164.8],    // E2 B2 E3
  ];

  function playChord(freqs) {
    const t = ctx.currentTime;
    const DUR = 6.4;
    for (const f of freqs) {
      for (const [mult, amp] of [[1, 0.5], [2, 0.22], [3, 0.1], [4, 0.05]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * mult * (1 + (Math.random() - 0.5) * 0.0015); // breath
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(amp, t + 1.8);
        env.gain.setValueAtTime(amp, t + DUR - 2.2);
        env.gain.linearRampToValueAtTime(0.0001, t + DUR);
        osc.connect(env).connect(organGain);
        osc.start(t);
        osc.stop(t + DUR + 0.1);
      }
    }
  }

  function startOrgan() {
    organGain = ctx.createGain();
    organGain.gain.value = 0;
    organGain.connect(master);
    const loop = () => {
      if (ctx.state === 'running' && organLevel > 0.0008 && ctx.currentTime >= organSuppressedUntil) {
        playChord(CHORDS[chordIndex % CHORDS.length]);
        chordIndex++;
      }
      organTimer = setTimeout(loop, 6000);
    };
    loop();
  }

  // called every frame with the distance to the nearest uncollected paper
  function updateOrgan(dist) {
    if (!ctx || !organGain || muted) return;
    if (ctx.currentTime < organSuppressedUntil) return;
    let v = 0;
    if (dist !== null && dist < ORGAN_RANGE) {
      // smooth, natural swell: barely-there at the zone's edge (under the
      // wind), growing on an eased curve to full presence at the paper
      const t = 1 - dist / ORGAN_RANGE;
      const s = t * t * (3 - 2 * t); // smoothstep
      v = ORGAN_EDGE + (ORGAN_MAX - ORGAN_EDGE) * Math.pow(s, 1.7);
    }
    organLevel = v;
    organGain.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
  }

  // a paper was taken: the organ fades out smoothly over 5 seconds
  function organFadeOut() {
    if (!ctx || !organGain) return;
    const t = ctx.currentTime;
    organGain.gain.cancelScheduledValues(t);
    organGain.gain.setValueAtTime(organGain.gain.value, t);
    organGain.gain.linearRampToValueAtTime(0, t + 5);
    organSuppressedUntil = t + 5.5;
    organLevel = 0;
  }

  // --- rain ------------------------------------------------------------------
  // A continuous synthesized downpour: a bright hiss layer (the patter on
  // leaves and stone) over a darker body, gently wobbled so it never reads as
  // static noise. The level is driven per-frame by Rain's visual intensity.
  const RAIN_MAX = 0.10;
  let rainGain = null;

  function startRain() {
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainGain.connect(master);

    // slow wobble around 1.0 so the rain breathes
    const mod = ctx.createGain();
    mod.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.16;
    lfo.connect(lfoG).connect(mod.gain);
    mod.connect(rainGain);

    // bright hiss layer
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer(4);
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 950;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7200;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.7;
    hiss.connect(hp).connect(lp).connect(hissG).connect(mod);

    // darker body — the weight of the downpour
    const body = ctx.createBufferSource();
    body.buffer = noiseBuffer(4);
    body.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 430;
    bp.Q.value = 0.6;
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.5;
    body.connect(bp).connect(bodyG).connect(mod);

    hiss.start();
    body.start();
    lfo.start();
  }

  // intensity 0..1, set every frame by Rain (already smoothed on its side)
  function setRain(intensity) {
    if (!rainGain) return;
    rainGain.gain.value = Math.max(0, Math.min(1, intensity)) * RAIN_MAX;
  }

  // --- lifecycle -------------------------------------------------------------
  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    // the whole mix runs through a lowpass; wide open normally, closed down by
    // the dissolution so every sound dulls toward a primitive muffle
    masterLP = ctx.createBiquadFilter();
    masterLP.type = 'lowpass';
    masterLP.frequency.value = 20000;
    master.connect(masterLP).connect(ctx.destination);
    startWind();
    scheduleCrow();
    startOrgan();
    startRain();
  }

  function toggleMute() {
    if (!ctx) return false;
    muted = !muted;
    master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.1);
    return muted;
  }

  // --- dissolution -----------------------------------------------------------
  // level 0..1: muffle the entire soundscape down toward a dull, primitive tone
  function degrade(level) {
    if (!ctx || !masterLP) return;
    const l = Math.max(0, Math.min(1, level));
    const cut = 20000 * Math.pow(120 / 20000, l); // exp sweep 20 kHz → 120 Hz
    masterLP.frequency.setTargetAtTime(cut, ctx.currentTime, 0.3);
  }
  // g 1..0: fade the whole mix to silence as the world disappears
  function setMasterFade(g) {
    if (!ctx || muted) return;
    master.gain.setTargetAtTime(Math.max(0, Math.min(1, g)), ctx.currentTime, 0.3);
  }

  return { start, step, splash, land, puff, crowFlee, silenceBirds, updateOrgan, organFadeOut, setRain, toggleMute, degrade, setMasterFade };
})();
