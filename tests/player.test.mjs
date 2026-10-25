import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as settings from '../dist/audio-settings.js';

class Element {
  constructor(kind) { this.dataset = { noise: kind }; this.attributes = {}; this.style = {}; this.events = {}; this.textContent = ''; this.classList = { toggle() {}, add() {}, remove() {} }; this.children = {}; }
  querySelector(selector) { return this.children[selector] ??= new Element(); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  async fire(name, value) { return this.events[name]({ target: { value } }); }
}
class Param {
  constructor() { this.value = 0; }
  cancelAndHoldAtTime() {}
  setTargetAtTime(value) { this.value = value; }
}
const sources = [], nodes = [], timers = [];
class Node {
  constructor() { this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.targets = []; nodes.push(this); }
  connect(target) { this.targets.push(target); }
  disconnect() { this.targets = []; }
}
class Worklet extends Node {
  constructor() { super(); this.messages = []; this.port = { postMessage: m => this.messages.push(m), close() {} }; sources.push(this); }
}
class Context {
  constructor() { this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  addEventListener() {}
  async resume() {}
}
const kinds = ['white', 'pink', 'brown', 'grey', 'blue'];
const buttons = kinds.map(kind => new Element(kind));
const elements = new Map();
const el = selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
const sandbox = {
  ...settings, console, AudioWorkletNode: Worklet, navigator: {},
  AudioContext: Context,
  document: { querySelector: el, querySelectorAll: selector => selector === '.sound' ? buttons : [], body: { classList: { toggle() {} } } },
  setTimeout: (callback, delay) => { callback.delay = delay; callback.active = true; timers.push(callback); return callback; },
  clearTimeout: callback => { if (callback) callback.active = false; },
};
const code = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
vm.createContext(sandbox); vm.runInContext(code, sandbox);
assert.equal(el('#volume').value, 22);
assert.equal(el('#softness').value, 60);
await vm.runInContext("choose('white')", sandbox);
assert.equal(sources.length, 1);
assert.equal(el('#play-toggle').attributes['aria-label'], 'Pause sound');
assert.equal(nodes.find(n => n.type === 'lowpass').frequency.value, settings.softnessCutoff(.6));
await el('#volume').fire('input', 35);
await el('#mute').fire('click'); assert.equal(el('#volume').value, 0);
await el('#mute').fire('click'); assert.equal(el('#volume').value, 35);
await el('#play-toggle').fire('click');
assert.equal(el('#track-status').textContent, 'Paused · take your time');
await el('#softness').fire('input', 100);
assert.equal(vm.runInContext('voice.fade.gain.value', sandbox), 0, 'changing softness must not resume paused audio');
await el('#play-toggle').fire('click');
assert.equal(sources.length, 1, 'resume reuses existing voice');
for (const kind of ['pink', 'brown', 'grey', 'blue']) await vm.runInContext(`choose('${kind}')`, sandbox);
assert.equal(sources.length, 5, 'each color has an independent source for crossfades');
assert.equal(vm.runInContext('voice.lowpass.frequency.value', sandbox), settings.softnessCutoff(1, 'blue'), 'softness persists when changing colors');
assert.equal(vm.runInContext('voice.level.gain.value', sandbox), settings.voiceLevel('blue', 1));
for (const timer of timers) if (timer.active && timer.delay === 600) timer();
assert.ok(sources.slice(0, -1).every(source => source.messages.includes('stop') && source.targets.length === 0));
assert.ok(!sources.at(-1).messages.includes('stop'));
assert.equal(buttons.filter(b => b.attributes['aria-pressed'] === 'true')[0].dataset.noise, 'blue');
console.log('Player controls verified: quieter defaults, softness, pause/resume, mute restore, independent crossfades, retired voice cleanup.');

// Reuse the shared player against the nature page's actual scene choices.
const sceneKinds = ['rain', 'ocean', 'campfire', 'creek', 'train', 'garden'];
const sceneButtons = sceneKinds.map(kind => new Element(kind));
const sceneElements = new Map();
const sceneEl = selector => { if (!sceneElements.has(selector)) sceneElements.set(selector, new Element()); return sceneElements.get(selector); };
const sceneSandbox = {
  ...settings, console, AudioWorkletNode: Worklet, navigator: {}, AudioContext: Context,
  document: { querySelector: sceneEl, querySelectorAll: selector => selector === '.sound' ? sceneButtons : [], body: { dataset: { page: 'nature' }, classList: { toggle() {} } } },
  setTimeout: (callback, delay) => { callback.delay = delay; callback.active = true; timers.push(callback); return callback; },
  clearTimeout: callback => { if (callback) callback.active = false; },
};
vm.createContext(sceneSandbox); vm.runInContext(code, sceneSandbox);
assert.equal(sceneEl('#play-toggle').attributes['aria-label'], 'Play Rain');
for (const scene of sceneKinds) {
  await vm.runInContext(`choose('${scene}')`, sceneSandbox);
  assert.ok(!sceneEl('#track-name').textContent.endsWith(' noise'));
  assert.equal(sceneEl('#play-toggle').attributes['aria-label'], 'Pause sound');
  await sceneEl('#play-toggle').fire('click');
  await sceneEl('#softness').fire('input', 85);
  assert.equal(vm.runInContext('voice.fade.gain.value', sceneSandbox), 0);
}
const homeHtml = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const natureHtml = fs.readFileSync(new URL('../dist/nature.html', import.meta.url), 'utf8');
assert.match(homeHtml, /class="page-link" href="nature.html"/);
assert.match(natureHtml, /class="page-link" href="\.\/"/);
for (const scene of sceneKinds) assert.ok(natureHtml.includes(`data-noise="${scene}"`));
console.log('Nature page verified: six scene selections, playback controls, reciprocal footer navigation.');

await vm.runInContext("choose('superblue')", sandbox);
assert.equal(el('#track-name').textContent, 'Deep blue');
assert.equal(vm.runInContext('voice.kind', sandbox), 'superblue');
assert.match(homeHtml, /role="tablist"/);
assert.match(homeHtml, /id="colors" role="tabpanel"/);
assert.match(homeHtml, /id="more-colors" role="tabpanel" aria-labelledby="tab-more" hidden>\n<button class="sound" data-noise="superblue"/);
for (const kind of kinds) assert.ok(!homeHtml.match(/id="more-colors"[\s\S]*?<\/div>/)[0].includes(`data-noise="${kind}"`));
console.log('Deep blue verified: plays from the More colors tab, main five stay on the Colors tab.');
