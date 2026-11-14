// Ether: hand tracking (MediaPipe Hands) wired to a synth (Tone.js).
// MediaPipe and Tone are loaded as globals from the CDN scripts in index.html.

const $ = (id) => document.getElementById(id);
const rootStyle = document.documentElement.style;

const video = $('webcam');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

// MediaPipe processes the webcam at this size
const VIDEO_W = 640;
const VIDEO_H = 480;

// Canvas colors (same values as the tokens in style.css)
const COLORS = { night: '#10122b', filament: '#ffb35c', ice: '#8fd3ff' };

// ---------- Music settings ----------

// Intervals in semitones from the root (see the Scale Reference in the README)
const SCALES = {
  pentatonicMinor: [0, 3, 5, 7, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Root notes as MIDI numbers, all in octave 3 so every key sits in a similar range
const ROOTS = { C: 48, D: 50, E: 52, F: 53, G: 55, A: 57, B: 59 };
const OCTAVE_SPAN = 2; // the right hand covers 2 octaves

// Hands rarely reach the very top or bottom of the frame, so only this band of
// the frame is used. Above/below it just holds the highest/lowest value.
const ZONE_TOP = 0.15;
const ZONE_BOTTOM = 0.85;

let scaleName = 'pentatonicMinor';
let rootMidi = ROOTS.A;
let notes = []; // every playable note (MIDI numbers), lowest first
let noteIndex = 0;

function buildNotes() {
  const scale = SCALES[scaleName];
  notes = [];
  for (let octave = 0; octave < OCTAVE_SPAN; octave++) {
    for (const interval of scale) notes.push(rootMidi + octave * 12 + interval);
  }
  notes.push(rootMidi + OCTAVE_SPAN * 12); // finish on the root at the top
  noteIndex = Math.min(noteIndex, notes.length - 1);
  renderLadder();
}

// 0 at the bottom of the zone, 1 at the top
function heightInZone(y) {
  const t = (ZONE_BOTTOM - y) / (ZONE_BOTTOM - ZONE_TOP);
  return Math.min(Math.max(t, 0), 1);
}

// ---------- Audio ----------

const DEFAULT_LEVEL = 0.7; // volume used when the left hand isn't in view
const DEFAULT_REVERB = 0.3; // reverb mix until both hands are in view

// Signal chain: synth -> reverb -> delay -> volume -> limiter -> speakers.
// Volume sits after the effects so a fist mutes the reverb/delay tails too,
// instead of letting them ring out for seconds.
const limiter = new Tone.Limiter(-1).toDestination(); // stops clipping
const volume = new Tone.Gain(DEFAULT_LEVEL ** 2).connect(limiter);
const delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35, wet: 0.2 }).connect(volume);
const reverb = new Tone.Reverb({ decay: 5, preDelay: 0.02, wet: DEFAULT_REVERB }).connect(delay);

// Low-pass filter in front of the effects. Wide open (no effect) for most
// sounds; the pad closes it down to take the harsh edge off.
const filter = new Tone.Filter(20000, 'lowpass').connect(reverb);

// The sounds, in the same order as the Sound menu and keys 1-5.
// Saw and square are much brighter and louder than sine, so they get turned
// down to sit at roughly the same loudness.
const BASE_ENVELOPE = { attack: 0.1, decay: 0, sustain: 1, release: 0.6 };
const OPEN_FILTER = 20000;
const SOUNDS = [
  { oscillator: { type: 'sine' }, volume: -6 },
  { oscillator: { type: 'triangle' }, volume: -7 },
  { oscillator: { type: 'sawtooth' }, volume: -16 },
  { oscillator: { type: 'square' }, volume: -18 },
  // Pad: three slightly detuned saws for a wide, shimmering tone, filtered
  // soft, swelling in slowly and fading out long. Notes slide into each other.
  {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
    volume: -18,
    envelope: { attack: 0.8, release: 3 },
    filter: 1400,
    glide: 0.25,
  },
];
let sound = SOUNDS[0];

const synth = new Tone.Synth({
  oscillator: sound.oscillator,
  envelope: BASE_ENVELOPE,
  volume: sound.volume,
}).connect(filter);

let isPlaying = false;
let currentMidi = null;
let muteToggled = false; // the Mute button / Space (a left fist mutes separately)
let reverbOn = true;
let reverbMix = DEFAULT_REVERB;

function setSound(index) {
  sound = SOUNDS[index];
  synth.set({
    oscillator: sound.oscillator,
    envelope: { ...BASE_ENVELOPE, ...sound.envelope },
  });
  synth.volume.rampTo(sound.volume, 0.05);
  filter.frequency.rampTo(sound.filter ?? OPEN_FILTER, 0.1);
  $('sound').value = String(index);
}

function setReverbOn(on) {
  reverbOn = on;
  reverb.wet.rampTo(on ? reverbMix : 0, 0.2);
  $('reverb-toggle').setAttribute('aria-pressed', String(on));
}

function setMuteToggled(on) {
  muteToggled = on;
  $('mute-toggle').setAttribute('aria-pressed', String(on));
}

// Both hands in view: the horizontal distance between them sets the reverb
// mix. Hands close together = dry, far apart = drenched.
const REVERB_NEAR = 0.2; // fraction of the frame width
const REVERB_FAR = 0.8;
const REVERB_MIN = 0.05;
const REVERB_MAX = 0.9;

function updateReverb(rightHand, leftHand) {
  // With only one hand in view, keep whatever mix was last set
  if (!reverbOn || !rightHand || !leftHand) return;
  const apart = Math.abs(rightHand.x - leftHand.x);
  const t = Math.min(Math.max((apart - REVERB_NEAR) / (REVERB_FAR - REVERB_NEAR), 0), 1);
  reverbMix = REVERB_MIN + t * (REVERB_MAX - REVERB_MIN);
  reverb.wet.rampTo(reverbMix, 0.1);
}

// Picks a note from the right hand's height. A little hysteresis stops the note
// flickering when the hand sits right on the line between two notes.
function pickNoteIndex(y) {
  const position = heightInZone(y) * (notes.length - 1);
  if (Math.abs(position - noteIndex) > 0.65) {
    noteIndex = Math.round(position);
  }
  return noteIndex;
}

function updateSound({ rightHand, leftHand }) {
  // Pinch on either hand locks the note. Fist on the left hand mutes.
  const locked = Boolean(rightHand?.pinch || leftHand?.pinch);
  const muted = Boolean(leftHand?.fist) || muteToggled;

  // Left hand height sets volume; squared so the fade sounds even to the ear
  const level = leftHand ? heightInZone(leftHand.y) : DEFAULT_LEVEL;
  volume.gain.rampTo(muted ? 0 : level ** 2, muted ? 0.02 : 0.05);

  updateReverb(rightHand, leftHand);

  let spread = false;

  if (locked && isPlaying) {
    // Hold the current note, even if the right hand leaves the frame
    // (as long as the left hand is still pinching)
  } else if (!rightHand) {
    // Right hand gone: let the note fade out
    if (isPlaying) {
      synth.triggerRelease();
      isPlaying = false;
    }
    currentMidi = null;
  } else {
    spread = rightHand.spread;
    currentMidi = notes[pickNoteIndex(rightHand.y)] + (spread ? 12 : 0);
    const freq = Tone.Frequency(currentMidi, 'midi').toFrequency();
    if (!isPlaying) {
      synth.triggerAttack(freq);
      isPlaying = true;
    } else {
      synth.frequency.rampTo(freq, sound.glide ?? 0.05); // glide between notes
    }
  }

  return { level, muted, locked, spread };
}

// ---------- Gestures ----------

// Landmark indices: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_BASE = 9; // base of the middle finger, a stable point near the palm center
const PINKY_TIP = 20;
const FINGERTIPS = [4, 8, 12, 16, 20];
// [fingertip, middle knuckle] for index, middle, ring and pinky
const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];

// Distance in camera pixels (landmarks are 0..1 in each axis, and the frame isn't square)
function distance(a, b) {
  return Math.hypot((a.x - b.x) * VIDEO_W, (a.y - b.y) * VIDEO_H);
}

// Distances are divided by palm length (wrist to middle-finger base) so the
// gestures work the same whether the hand is close to the camera or far away.
function palmLength(landmarks) {
  return distance(landmarks[WRIST], landmarks[MIDDLE_BASE]);
}

// Each gesture has a separate "on" and "off" threshold so it doesn't flicker
// when the hand sits right at the edge.

// Finger spread: index-to-pinky tip distance. ~0.5 with fingers together, 1.5+ spread wide.
const SPREAD_ON = 1.15;
const SPREAD_OFF = 0.95;

// Pinch: thumb-to-index tip distance. ~0.1-0.2 touching, 0.6+ relaxed.
const PINCH_ON = 0.25;
const PINCH_OFF = 0.4;

function detectSpread(landmarks, state) {
  const ratio = distance(landmarks[INDEX_TIP], landmarks[PINKY_TIP]) / palmLength(landmarks);
  if (state.spread && ratio < SPREAD_OFF) state.spread = false;
  else if (!state.spread && ratio > SPREAD_ON) state.spread = true;
  return state.spread;
}

function detectPinch(landmarks, state) {
  const ratio = distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palmLength(landmarks);
  if (state.pinch && ratio > PINCH_OFF) state.pinch = false;
  else if (!state.pinch && ratio < PINCH_ON) state.pinch = true;
  return state.pinch;
}

// Fist: every finger is curled, i.e. each fingertip is closer to the wrist
// than that finger's middle knuckle is.
function detectFist(landmarks) {
  const wrist = landmarks[WRIST];
  return FINGERS.every(([tip, knuckle]) =>
    distance(landmarks[tip], wrist) < distance(landmarks[knuckle], wrist));
}

// ---------- Smoothing ----------

// Rolling average of the last few frames to take the wobble out of the
// tracking. 5 frames is ~170ms at 30fps, which smooths without feeling laggy.
const SMOOTHING_FRAMES = 5;

function smooth(state, point) {
  state.history.push({ x: point.x, y: point.y });
  if (state.history.length > SMOOTHING_FRAMES) state.history.shift();
  const n = state.history.length;
  return {
    x: state.history.reduce((sum, p) => sum + p.x, 0) / n,
    y: state.history.reduce((sum, p) => sum + p.y, 0) / n,
  };
}

// Per-hand memory between frames (smoothing history + gesture on/off states)
function freshHandState() {
  return { history: [], spread: false, pinch: false };
}
const handStates = { Left: freshHandState(), Right: freshHandState() };

// ---------- Layout ----------

// Where the camera frame is drawn on screen, in CSS pixels. The frame is scaled
// to the full window height so the whole playable band is visible; on wide
// windows it's centered with the sides fading into the background.
let frame = { x: 0, y: 0, w: VIDEO_W, h: VIDEO_H };
let dpr = 1;

function layout() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);

  const h = innerHeight;
  const w = (h * VIDEO_W) / VIDEO_H;
  frame = { x: (innerWidth - w) / 2, y: 0, w, h };

  // Line the volume meter and note ladder up with the playable band
  rootStyle.setProperty('--zone-top', `${frame.y + ZONE_TOP * frame.h}px`);
  rootStyle.setProperty('--zone-height', `${(ZONE_BOTTOM - ZONE_TOP) * frame.h}px`);
}

function toScreen(point) {
  return [frame.x + point.x * frame.w, frame.y + point.y * frame.h];
}

// ---------- Drawing ----------

function drawBackground(image) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Dimmed camera feed, tinted by the night background underneath
  ctx.globalAlpha = 0.32;
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);
  ctx.globalAlpha = 1;

  // Fade the frame's left and right edges into the background
  const fade = Math.min(140, frame.w * 0.15);
  for (const [from, to] of [[frame.x, frame.x + fade], [frame.x + frame.w, frame.x + frame.w - fade]]) {
    const gradient = ctx.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, COLORS.night);
    gradient.addColorStop(1, 'rgba(16, 18, 43, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(from, to), 0, fade, innerHeight);
  }
}

// Glowing skeleton. `glow` (0-1) follows how loud the note is.
function drawHand(hand, color, glow) {
  const points = hand.landmarks.map(toScreen);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 + glow * 28;
  ctx.globalAlpha = hand.fist ? 0.35 : 0.55 + glow * 0.45;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(...points[a]);
    ctx.lineTo(...points[b]);
  }
  ctx.stroke();

  points.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(x, y, FINGERTIPS.includes(i) ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ring around the pinch point while a note is held
  if (hand.pinch) {
    const [tx, ty] = points[THUMB_TIP];
    const [ix, iy] = points[INDEX_TIP];
    ctx.beginPath();
    ctx.arc((tx + ix) / 2, (ty + iy) / 2, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Dotted line between the palms; brighter = more reverb
function drawReverbLink(rightHand, leftHand) {
  const [ax, ay] = toScreen(rightHand);
  const [bx, by] = toScreen(leftHand);
  const gradient = ctx.createLinearGradient(ax, ay, bx, by);
  gradient.addColorStop(0, COLORS.filament);
  gradient.addColorStop(1, COLORS.ice);

  ctx.save();
  ctx.globalAlpha = 0.15 + reverbMix * 0.55;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
}

// ---------- Display ----------

const noteDisplay = $('note-display');
const noteName = $('note-name');
const noteOctave = $('note-octave');
const noteState = $('note-state');
const ladder = $('ladder');
let activeRung = -1;

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// One rung per playable note; only the root notes get a label
function renderLadder() {
  const rungs = notes.map((midi, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--pos', 1 - i / (notes.length - 1));
    if ((midi - rootMidi) % 12 === 0) {
      li.className = 'is-root';
      const label = document.createElement('span');
      label.className = 'rung-label';
      label.textContent = Tone.Frequency(midi, 'midi').toNote();
      li.append(label);
    }
    return li;
  });
  ladder.replaceChildren(...rungs);
  activeRung = -1;
}

function setActiveRung(index) {
  if (index === activeRung) return;
  ladder.children[activeRung]?.classList.remove('is-active');
  ladder.children[index]?.classList.add('is-active');
  activeRung = index;
}

function updateDisplay({ level, muted, locked, spread }) {
  const volumeShown = muted ? 0 : level;
  rootStyle.setProperty('--volume', volumeShown.toFixed(2));
  rootStyle.setProperty('--level', (isPlaying ? volumeShown : 0).toFixed(2));
  noteDisplay.classList.toggle('is-muted', muted);

  if (currentMidi === null) {
    setText(noteName, '');
    setText(noteOctave, '');
    setText(noteState, muted ? 'Muted' : 'Raise your right hand to play');
    setActiveRung(-1);
    return;
  }

  // "C#4" -> big "C#", small "4"
  const [, name, octave] = Tone.Frequency(currentMidi, 'midi').toNote().match(/^(.+?)(-?\d+)$/);
  setText(noteName, name);
  setText(noteOctave, octave);

  const states = [];
  if (muted) states.push('muted');
  if (locked) states.push('held');
  if (spread) states.push('octave up');
  const text = states.join(', ');
  setText(noteState, text.charAt(0).toUpperCase() + text.slice(1));

  setActiveRung(noteIndex);
}

// ---------- Hand tracking ----------

const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

let tracking = false; // becomes true once the first frame has been processed

hands.onResults((results) => {
  tracking = true;
  const seen = { Left: null, Right: null };

  (results.multiHandLandmarks || []).forEach((landmarks, index) => {
    // MediaPipe assumes a mirrored (selfie) image. We feed it the raw webcam
    // frame, so its labels come out swapped and we flip them back.
    const handedness = results.multiHandedness[index].label === 'Left' ? 'Right' : 'Left';
    if (seen[handedness]) return; // occasionally both hands get the same label

    const state = handStates[handedness];
    const fist = detectFist(landmarks);
    seen[handedness] = {
      ...smooth(state, landmarks[MIDDLE_BASE]), // x, y
      spread: detectSpread(landmarks, state),
      // A fist also brings the thumb near the index finger, so it doesn't count as a pinch
      pinch: !fist && detectPinch(landmarks, state),
      fist,
      landmarks,
    };
  });

  // Forget a hand's history once it leaves the frame
  for (const hand of ['Left', 'Right']) {
    if (!seen[hand]) handStates[hand] = freshHandState();
  }

  const playing = updateSound({ rightHand: seen.Right, leftHand: seen.Left });
  updateDisplay(playing);

  drawBackground(results.image);
  if (reverbOn && seen.Right && seen.Left) drawReverbLink(seen.Right, seen.Left);
  const glow = isPlaying && !playing.muted ? playing.level : 0;
  if (seen.Right) drawHand(seen.Right, COLORS.filament, glow);
  if (seen.Left) drawHand(seen.Left, COLORS.ice, glow);
});

const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: VIDEO_W,
  height: VIDEO_H,
});

// ---------- Guide, controls and keyboard ----------

const guide = $('guide');
const guideButton = $('guide-close');
const helpButton = $('help-button');
let started = false;

async function start() {
  started = true;
  guideButton.textContent = 'Back to playing';
  setText(noteState, 'Starting camera…');

  await Tone.start(); // unlocks audio; must run inside a user gesture
  await reverb.ready; // the reverb builds its sound in the background
  try {
    await camera.start();
    if (!tracking) setText(noteState, 'Loading hand tracking…');
  } catch (error) {
    console.error(error);
    setText(noteState, 'Camera access is blocked. Allow it in your browser’s site settings, then reload.');
  }
}

function openGuide() {
  guide.hidden = false;
  guideButton.focus();
}

function closeGuide() {
  guide.hidden = true;
  if (started) helpButton.focus();
  else start();
}

guideButton.addEventListener('click', closeGuide);
helpButton.addEventListener('click', openGuide);

$('scale').addEventListener('change', (e) => { scaleName = e.target.value; buildNotes(); });
$('root').addEventListener('change', (e) => { rootMidi = ROOTS[e.target.value]; buildNotes(); });
$('sound').addEventListener('change', (e) => setSound(Number(e.target.value)));
$('reverb-toggle').addEventListener('click', () => setReverbOn(!reverbOn));
$('mute-toggle').addEventListener('click', () => setMuteToggled(!muteToggled));

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || !started) return;

  if (event.key === '?') {
    event.preventDefault();
    guide.hidden ? openGuide() : closeGuide();
    return;
  }
  if (!guide.hidden) {
    if (event.key === 'Escape') closeGuide();
    return;
  }

  // Leave Space and number keys alone while a button or menu has focus,
  // so they keep their normal behavior there
  if (event.target.closest('button, select')) return;

  if (event.key === ' ') {
    event.preventDefault();
    setMuteToggled(!muteToggled);
    return;
  }
  const index = Number(event.key) - 1;
  if (index >= 0 && index < SOUNDS.length) setSound(index);
});

// ---------- Init ----------

window.addEventListener('resize', layout);
layout();
buildNotes();
