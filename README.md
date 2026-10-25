# Stillroom

A cozy, mobile-first background noise app, live at https://stillroom.surge.sh.

Five color circles play continuous white, pink, brown, grey, or blue noise. The player has play/pause, volume, mute, and a Softness slider that runs from Crisp to Mellow. Everything is generated in the browser with AudioWorklets, so there are no recordings, downloads, or accounts.

The **Nature sounds** link in the footer opens `nature.html`, which has six synthesized stereo scenes: rain, ocean, campfire, forest creek, night train, and night garden.

**More colors:** a tab above the circles switches to extra colors. For now that's just Deep blue, a darker take on Blue. A small dot marks the hidden tab when its color is selected.

## Layout

- `dist/` is the whole static site, deployed as is. It has no build step.
  - `app.js`: the player UI and Web Audio graph, shared by both pages.
  - `audio-settings.js`: defaults, the Grey EQ, the Softness cutoffs, and per-sound level calibration.
  - `noise-worklet.js` and `nature-worklet.js`: the sound generators.
- `tests/` contains offline checks that run in Node and need no browser or audio device.

## Sound notes

- Playback starts at 22% volume and 60% Softness. Softness sweeps a low-pass filter from 8 kHz down to 900 Hz.
- Each sound has its own generator, and switching sounds crossfades between them.
- Levels are matched across sounds and Softness positions using the table in `audio-settings.js`.
- Grey uses a gentle equal-loudness-style EQ.
- "Blue" isn't spectral blue noise. It's a custom bass-rich texture with a narrower 1.6 kHz to 300 Hz Softness range. Deep blue (`superblue` in code) is darker still, and its level matches Blue's.

## Develop

```sh
npm start        # http://localhost:8766
npm run check    # syntax check
npm test         # signal + player checks
```

AudioWorklet needs a secure context, so use localhost or HTTPS.

If you change a generator, run `node tests/audio.test.mjs --calibrate` and copy the printed gains into the `levels` table in `audio-settings.js`.

## Deploy

```sh
npm run deploy
```

This runs the checks and tests, then publishes `dist/` to surge.sh. `dist/CNAME` pins the domain to `stillroom.surge.sh`. You need to be logged in first (`npx surge login`).
