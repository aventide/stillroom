import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { GREY_EQ, softnessCutoff, voiceLevel } from '../dist/audio-settings.js';

// Web Audio biquad equations, run offline to check the actual generator with
// the same EQ/cutoffs used by the player. No audio hardware is required.
function biquad(type, frequency, sampleRate, gain = 0, q = Math.SQRT1_2) {
  const w = 2 * Math.PI * frequency / sampleRate;
  const c = Math.cos(w), s = Math.sin(w), A = 10 ** (gain / 40);
  const alpha = s / (2 * q), shelfAlpha = s / 2 * Math.SQRT2;
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') {
    b0 = b2 = (1 - c) / 2; b1 = 1 - c;
    a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
  } else if (type === 'peaking') {
    b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A;
  } else {
    const t = 2 * Math.sqrt(A) * shelfAlpha;
    if (type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * c + t); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - t);
      a0 = (A + 1) + (A - 1) * c + t; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - t;
    } else {
      b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
      a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t;
    }
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}
const scenes = ['rain', 'ocean', 'campfire', 'creek', 'train', 'garden'];
function render(kind, softness, sampleRate) {
  let Processor, seed = 42993;
  const math = Object.create(Math);
  math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  vm.runInNewContext(fs.readFileSync(new URL(scenes.includes(kind) ? '../dist/nature-worklet.js' : '../dist/noise-worklet.js', import.meta.url), 'utf8'), {
    Math: math, sampleRate, AudioWorkletProcessor: class { constructor() { this.port = {}; } },
    registerProcessor: (_, p) => { Processor = p; },
  });
  const generator = new Processor(); generator.port.onmessage({ data: kind });
  const filters = kind === 'grey' ? GREY_EQ.map(f => biquad(f.type, f.frequency, sampleRate, f.gain, f.Q)) : [];
  filters.push(biquad('lowpass', softnessCutoff(softness, kind), sampleRate));
  let sum = 0, peak = 0, difference = 0, previous = 0, count = 0;
  const channels = [new Float32Array(128), new Float32Array(128)];
  for (let block = 0; block < 1200; block++) {
    assert.equal(generator.process([], [channels]), true);
    for (let i = 0; i < 128; i++) {
      if (!scenes.includes(kind)) assert.equal(channels[0][i], channels[1][i]);
      assert.ok(Number.isFinite(channels[1][i]));
      let value = channels[0][i]; for (const filter of filters) value = filter(value);
      value *= voiceLevel(kind, softness);
      assert.ok(Number.isFinite(value));
      if (block > 20) { sum += value ** 2; difference += (value - previous) ** 2; count++; peak = Math.max(peak, Math.abs(value)); }
      previous = value;
    }
  }
  return { rms: Math.sqrt(sum / count), peak, brightness: Math.sqrt(difference / sum) };
}
// `node tests/audio.test.mjs --calibrate` prints voiceLevel gains that would
// bring each sound to 0.1 RMS, for updating the table in audio-settings.js.
if (process.argv.includes('--calibrate')) {
  for (const kind of ['white', 'pink', 'brown', 'grey', 'blue', 'superblue', ...scenes]) {
    console.log(kind, [0, .25, .5, .75, 1].map(s => Number((voiceLevel(kind, s) * .1 / render(kind, s, 48000).rms).toFixed(4))));
  }
} else {
  for (const rate of [44100, 48000]) {
    const deep = render('blue', .6, rate);
    const white = render('white', .6, rate);
    const superdeep = render('superblue', .6, rate);
    assert.ok(superdeep.brightness < deep.brightness * .55, 'Deep blue should be darker than Blue');
    assert.ok(Math.abs(20 * Math.log10(superdeep.rms / deep.rms)) < 1, 'Deep blue should match Blue within 1 dB');
    assert.ok(deep.brightness < white.brightness * .35, `Deep blue must remain substantially darker than white: ${deep.brightness} vs ${white.brightness}`);
    for (const kind of ['white', 'pink', 'brown', 'grey', 'blue', 'superblue', ...scenes]) {
      let first, last;
      for (const softness of [0, .25, .5, .6, .75, 1]) {
        const result = render(kind, softness, rate);
        assert.ok(result.rms > .075 && result.rms < .13, `${kind} at ${softness}: RMS ${result.rms}`);
        assert.ok(result.peak < .7, `${kind}: peak ${result.peak}`);
        if (softness === 0) first = result;
        if (softness === 1) last = result;
      }
      assert.ok(last.brightness < first.brightness * .6, `${kind}: softness should reduce high-frequency energy`);
      console.log(`${rate} Hz ${kind}: balanced level, finite stereo output, treble reduction verified`);
    }
  }
}
