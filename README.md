# Ether
## A gesture-controlled instrument you play from the air.

> *"In the early 1920s, Leon Theremin built the etherphone — an instrument played without touch. A century later, your webcam is the stage."*

Ether is a browser-based, real-time musical instrument controlled entirely by hand gestures. No keyboard. No mouse. No MIDI controller. Just your hands, your webcam, and the air between you and the screen. Using computer vision to track hand landmarks and a synthesizer engine to produce sound, Ether maps the position, shape, and movement of your hands to musical parameters — pitch, volume, timbre, and effects.

---

## ✨ What It Looks Like

A dark, minimal UI opens in the browser. The webcam feed is mirrored in the background, dimmed. Glowing landmark points trace over your hands in real time. As your right hand rises, a tone climbs. As your left hand opens and closes, the volume swells and fades. Pinch two fingers together and a note locks in. The sound is ambient, ethereal — like a theremin crossed with a synthesizer.

It looks like magic. That's the point.

---

## 🎯 MVP (Minimum Viable Product)

The MVP is a single-page browser app that does the following and nothing more:

- [ ] Detects both hands via webcam using MediaPipe Hands
- [ ] Right hand Y-position controls pitch (mapped to a pentatonic scale)
- [ ] Left hand Y-position controls volume
- [ ] Tone.js oscillator produces continuous sound
- [ ] Landmark skeleton renders visually on a canvas overlay
- [ ] Works in Chrome with no install, no backend, no login

**Definition of done for MVP:** A person who has never seen the app can open it, hold up their hands, and immediately understand what's happening and how to interact with it.

---

## 🗺️ Full Feature Scope

### Core Gestures
| Gesture | Hand | Effect |
|---|---|---|
| Hand height (Y-axis) | Right | Pitch — maps to musical scale |
| Hand height (Y-axis) | Left | Volume — amplitude of oscillator |
| Finger spread (distance between index + pinky) | Right | Octave — wide spread = higher octave |
| Pinch (thumb + index close) | Either | Sustain / note lock — freezes pitch |
| Fist | Left | Mute — cuts audio instantly |
| Both hands raised | Both | Reverb intensity — distance between hands controls wet/dry mix |

### Audio Engine
- **Oscillator types:** Sine (default), Triangle, Sawtooth, Square — selectable via UI
- **Scale quantization:** Pentatonic (default), Major, Minor, Chromatic — keeps notes musical
- **Effects chain:** Reverb → Delay → Limiter (prevents clipping)
- **Root note selector:** A, B, C, D, E, F, G — sets the key you're playing in

### Visual Layer
- Webcam feed: dimmed, mirrored background
- Hand skeleton: glowing joint landmarks with connecting bones
- Pitch indicator: a vertical bar or glowing orb that shows the current note name
- Volume indicator: pulse/glow intensity on the hand that matches amplitude
- Active note display: large centered text showing the note name (e.g. "A4")

### UI Controls (minimal sidebar or bottom bar)
- [ ] Scale selector (Pentatonic / Major / Minor / Chromatic)
- [ ] Root note selector (A–G)
- [ ] Oscillator type (Sine / Triangle / Saw / Square)
- [ ] Reverb toggle
- [ ] Mute button (keyboard shortcut: Space)
- [ ] "How to play" overlay (keyboard shortcut: ?)

---

## 🏗️ Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Hand Tracking | [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) | Best-in-class browser CV, 21 landmarks per hand, 30fps+ |
| Audio Synthesis | [Tone.js](https://tonejs.github.io/) | Clean API for oscillators, effects, scheduling |
| Rendering | HTML5 Canvas | Overlay landmark skeleton on video feed |
| UI | Vanilla HTML/CSS/JS | No framework overhead — ships as a single file |
| Hosting | GitHub Pages / Vercel | Zero config, shareable link |

No backend. No server. No dependencies to install. Open the file, allow webcam, play.

---

## 📅 7-Day Build Plan

### Day 1 — Hand Tracking Foundation
- [ ] Set up project structure (index.html, style.css, app.js)
- [ ] Integrate MediaPipe Hands via CDN
- [ ] Render webcam feed to canvas
- [ ] Draw landmark skeleton (joints + bones) over video
- [ ] Console.log hand Y-position for both hands
- **End of day goal:** See glowing dots on your hands in the browser

### Day 2 — First Sound
- [ ] Integrate Tone.js via CDN
- [ ] Create a basic Synth oscillator
- [ ] Map right hand Y-position to raw frequency
- [ ] Gate audio on/off when hand is detected / not detected
- **End of day goal:** Moving your hand changes the pitch of a sound

### Day 3 — Make It Musical
- [ ] Implement scale quantization (snap frequency to nearest scale note)
- [ ] Default to A pentatonic minor
- [ ] Map left hand Y-position to volume
- [ ] Add octave switching via finger spread
- **End of day goal:** Playing up and down sounds like actual music, not noise

### Day 4 — Gesture Refinement
- [ ] Implement pinch detection (thumb + index fingertip distance)
- [ ] Pinch = sustain / note lock
- [ ] Fist detection = mute
- [ ] Smooth out jitter with a rolling average on landmark positions
- **End of day goal:** Gestures feel intentional, not accidental

### Day 5 — Effects & Audio Polish
- [ ] Add Reverb effect (Tone.Reverb)
- [ ] Add Delay effect (Tone.FeedbackDelay)
- [ ] Wire both-hands distance to reverb wet/dry mix
- [ ] Add Limiter to prevent clipping
- [ ] Test multiple oscillator types
- **End of day goal:** The sound feels ambient, lush, and professional

### Day 6 — UI & Visual Polish
- [ ] Design the dark, minimal UI
- [ ] Add scale / root note / oscillator selectors
- [ ] Show active note name on screen
- [ ] Add visual feedback for volume (glow intensity)
- [ ] Add "How to play" overlay
- [ ] Make it look good enough to screenshot
- **End of day goal:** You'd be proud to show someone a screenshot

### Day 7 — Ship It
- [ ] Cross-browser test (Chrome primary, Firefox secondary)
- [ ] Write the README (use this doc as the base)
- [ ] Record a 60-second demo video
- [ ] Deploy to GitHub Pages or Vercel
- [ ] Share it
- **End of day goal:** The project has a public URL and a demo anyone can watch

---

## 🚧 Known Challenges & How to Handle Them

**Jitter / hand tremor causing pitch to wobble**
→ Apply a rolling average (last 5–10 frames) to landmark Y values before mapping to pitch. This smooths the output without adding noticeable lag.

**Pitch sounds chaotic and atonal**
→ Never map raw Y-position to raw frequency. Always quantize to a scale. This is the single most important decision in the whole project.

**Audio doesn't start until user interacts**
→ Browsers block autoplay audio. Gate Tone.js start behind a button click or keypress. A simple "Tap to begin" overlay solves this cleanly.

**MediaPipe loses tracking when hands overlap**
→ This is a known limitation. Design the UX so hands operate in separate vertical zones (left hand stays left, right hand stays right).

**Latency between gesture and sound**
→ Keep the audio buffer size small. Tone.js defaults are fine. Avoid processing-heavy effects chains that add latency.

---

## 🔮 Post-MVP Ideas (don't touch until week 2+)

- **Chord mode:** Both hands each play a note simultaneously → intervals/harmonics
- **Loop recorder:** Pinch + hold records a gesture loop, release plays it back
- **Drum layer:** Specific gestures trigger percussive samples (snap, clap detection)
- **Visualizer mode:** Audio-reactive particle system instead of landmark skeleton
- **Preset system:** Save/load named gesture-to-sound mappings
- **Multiplayer (wildest idea):** Two users' webcam feeds mixed — duet mode over WebRTC
- **Worship mode:** Ambient drone pads, slower attack/release, built for contemplative use

---

## 📁 Project Structure

```
ether/
├── index.html          # Entry point — imports everything
├── style.css           # Dark minimal UI styles
├── app.js              # Main logic — camera, CV, audio wiring
├── hands.js            # MediaPipe setup + landmark extraction
├── audio.js            # Tone.js synth, effects chain, scale mapping
├── gestures.js         # Gesture detection (pinch, fist, spread)
├── ui.js               # DOM updates, note display, controls
└── README.md           # This document
```

---

## 🎵 Scale Reference

Scales available in Ether (notes relative to root):

| Scale | Intervals | Vibe |
|---|---|---|
| Pentatonic Minor | 0, 3, 5, 7, 10 | Ambient, emotional, forgiving |
| Pentatonic Major | 0, 2, 4, 7, 9 | Bright, uplifting |
| Natural Minor | 0, 2, 3, 5, 7, 8, 10 | Dark, expressive |
| Major | 0, 2, 4, 5, 7, 9, 11 | Classic, resolved |
| Chromatic | All 12 | Maximum control, maximum chaos |

Default: **A Pentatonic Minor.** It's almost impossible to play a wrong note.

---

## 🙌 Inspiration

- **Leon Theremin** (1920) — the original contactless instrument
- **Google's Body Synth** — early browser gesture + audio experiments  
- **HandsFree.js** — community work on browser hand tracking music
- The TikTok that started this whole thing

---

*Built in one week. Played with two hands. Powered by the air.*