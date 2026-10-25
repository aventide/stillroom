import { DEFAULT_VOLUME, DEFAULT_SOFTNESS, GREY_EQ, softnessCutoff, voiceLevel } from './audio-settings.js';

const SOUNDS = {
  white: { name: 'White noise', description: 'Clear & steady' },
  pink: { name: 'Pink noise', description: 'Soft & balanced' },
  brown: { name: 'Brown noise', description: 'Deep & warm' },
  grey: { name: 'Grey noise', description: 'Full & even' },
  blue: { name: 'Blue', description: 'Round & smooth' },
  superblue: { name: 'Deep blue', description: 'Low & velvety' },
  rain: { name: 'Rain', description: 'Steady rain, close by' },
  ocean: { name: 'Ocean', description: 'Waves rolling in' },
  campfire: { name: 'Campfire', description: 'A fire settling in' },
  creek: { name: 'Forest creek', description: 'Water winding through the woods' },
  train: { name: 'Night train', description: 'A window seat to nowhere' },
  garden: { name: 'Night garden', description: 'Crickets under the stars' },
};

const $ = selector => document.querySelector(selector);
const buttons = [...document.querySelectorAll('.sound')];
const tabs = [...document.querySelectorAll('[role="tab"]')];
const naturePage = document.body.dataset?.page === 'nature';
const defaultSound = naturePage ? 'rain' : 'brown';
const idleHint = naturePage ? 'Pick a place. Stay a while.' : 'Pick a color to start.';

let ready, context, master, output, pauseTimer, voice, selected = null, playing = false;
let volume = DEFAULT_VOLUME, lastVolume = DEFAULT_VOLUME, softness = DEFAULT_SOFTNESS;

function paintSlider(input, amount) {
  const percent = amount * 100;
  input.value = Math.round(percent);
  input.style.background = `linear-gradient(to right,#8b967c ${percent}%,#d8dccf ${percent}%)`;
}
function update() {
  const sound = SOUNDS[selected];
  document.body.classList.toggle('playing', playing);
  document.body.classList.toggle('muted', volume === 0);
  for (const button of buttons) {
    const kind = button.dataset.noise;
    button.setAttribute('aria-pressed', String(kind === selected));
  }
  // Dot a hidden tab when the selected color lives in it.
  for (const tab of tabs) {
    const panel = $(`#${tab.getAttribute('aria-controls')}`);
    tab.classList.toggle('has-selected', panel.hidden && !!panel.querySelector(`[data-noise="${selected}"]`));
  }
  $('#track-name').textContent = sound ? sound.name : 'Nothing playing';
  $('#track-status').textContent = !sound ? 'Ready when you are' : playing ? 'Playing · no time limit' : 'Paused · take your time';
  $('#selection-hint').textContent = sound ? `${sound.description}.` : idleHint;
  $('#play-toggle').setAttribute('aria-label', playing ? 'Pause sound' : `Play ${SOUNDS[selected || defaultSound].name}`);
  $('#mute').setAttribute('aria-label', volume === 0 ? 'Unmute sound' : 'Mute sound');
  paintSlider($('#volume'), volume);
  paintSlider($('#softness'), softness);
  $('#volume').setAttribute('aria-valuetext', `${Math.round(volume * 100)} percent`);
  $('#softness').setAttribute('aria-valuetext', `${Math.round(softness * 100)} percent soft`);
  $('#volume-value').textContent = `${Math.round(volume * 100)}%`;
  updateMediaSession();
}

// Lock-screen / notification controls.
let sessionSound;
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = playing ? 'playing' : selected ? 'paused' : 'none';
  if (!selected || selected === sessionSound) return;
  sessionSound = selected;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: SOUNDS[selected].name,
    artist: 'Stillroom',
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => choose(selected || defaultSound));
  navigator.mediaSession.setActionHandler('pause', () => pause());
  try { navigator.mediaSession.setActionHandler('stop', () => pause()); } catch {}
}

// Created lazily, and synchronously up to the worklet load: browsers (iOS
// especially) only allow audio to start inside a user gesture.
function init() {
  if (ready) return ready;
  try {
    context = new AudioContext();
  } catch (error) {
    return Promise.reject(error);
  }
  master = context.createGain();
  master.gain.value = volume;
  // Primary playback audio on Safari 17+: not muted by the silent switch.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  routeOutput();
  context.addEventListener('statechange', () => {
    if (context.state !== 'running' && playing) { playing = false; update(); }
  });
  ready = context.audioWorklet.addModule(naturePage ? 'nature-worklet.js' : 'noise-worklet.js').catch(async error => {
    output?.pause();
    await context.close();
    ready = context = master = output = null;
    throw error;
  });
  return ready;
}
// Playing through a media element rather than straight to the speakers lets
// phones treat Stillroom as media, which can keep playing with the screen locked.
function routeOutput() {
  if (!context.createMediaStreamDestination) { master.connect(context.destination); return; }
  const destination = context.createMediaStreamDestination();
  master.connect(destination);
  output = new Audio();
  output.srcObject = destination.stream;
  // The OS can pause the element itself (calls, other apps, lock-screen controls).
  output.addEventListener('pause', () => {
    if (playing) { playing = false; update(); }
  });
  output.play().catch(() => {
    master.disconnect(destination);
    master.connect(context.destination);
    output = null;
  });
}
function smooth(parameter, value, seconds = .1) {
  const time = context.currentTime;
  // Holding the current value prevents jumps during rapid slider movements.
  if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(time);
  else { parameter.cancelScheduledValues(time); parameter.setValueAtTime(parameter.value, time); }
  parameter.setTargetAtTime(value, time, seconds);
}

// Each sound gets its own generator and filter chain so switching can crossfade.
function connectVoice(kind) {
  const previous = voice;
  const source = new AudioWorkletNode(context, naturePage ? 'stillroom-nature' : 'stillroom-noise', { outputChannelCount: [2] });
  source.port.postMessage(kind);
  const nodes = [source];
  let tail = source;
  const chain = node => { tail.connect(node); tail = node; nodes.push(node); return node; };
  if (kind === 'grey') {
    for (const { type, frequency, gain, Q } of GREY_EQ) {
      const filter = chain(context.createBiquadFilter());
      filter.type = type; filter.frequency.value = frequency; filter.gain.value = gain; filter.Q.value = Q;
    }
  }
  const lowpass = chain(context.createBiquadFilter());
  lowpass.type = 'lowpass';
  lowpass.frequency.value = softnessCutoff(softness, kind);
  // Web Audio lowpass Q is in dB: -3.01 gives a smooth Butterworth response.
  lowpass.Q.value = -3.0103;
  const level = chain(context.createGain());
  level.gain.value = voiceLevel(kind, softness);
  const fade = chain(context.createGain());
  fade.gain.value = 0;
  fade.connect(master);
  voice = { kind, source, lowpass, level, fade, nodes };
  smooth(fade.gain, 1, .12);
  if (previous) {
    smooth(previous.fade.gain, 0, .07);
    setTimeout(() => {
      previous.source.port.postMessage('stop');
      previous.source.port.close();
      previous.nodes.forEach(node => node.disconnect());
    }, 600);
  }
}
// Must be called synchronously from a user gesture, before any await.
function unlock() {
  clearTimeout(pauseTimer);
  output?.play().catch(() => {});
  return init().then(() => context.resume());
}
async function choose(kind) {
  selected = kind;
  try {
    await unlock();
  } catch {
    $('#track-status').textContent = 'Audio could not start. Please try again.';
    return;
  }
  // A later click may have landed while audio was starting; it wins.
  if (selected !== kind) return;
  if (voice?.kind === kind) smooth(voice.fade.gain, 1, .12);
  else connectVoice(kind);
  playing = true; update();
}
function pause() {
  if (!playing) return;
  smooth(voice.fade.gain, 0, .06);
  playing = false; update();
  // Pause the element once faded so the OS shows Stillroom as paused.
  pauseTimer = setTimeout(() => output?.pause(), 400);
}

for (const button of buttons) button.addEventListener('click', () => choose(button.dataset.noise));

// Colors / More colors tabs on the noise page.
function showTab(tab) {
  for (const other of tabs) {
    const active = other === tab;
    other.setAttribute('aria-selected', String(active));
    other.tabIndex = active ? 0 : -1;
    $(`#${other.getAttribute('aria-controls')}`).hidden = !active;
  }
  update();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab));
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    showTab(next);
    next.focus();
  });
}

$('#play-toggle').addEventListener('click', () => playing ? pause() : choose(selected || defaultSound));
$('#volume').addEventListener('input', event => {
  volume = Number(event.target.value) / 100;
  if (volume > 0) lastVolume = volume;
  if (master) smooth(master.gain, volume, .04);
  update();
});
$('#softness').addEventListener('input', event => {
  softness = Number(event.target.value) / 100;
  if (voice) {
    smooth(voice.lowpass.frequency, softnessCutoff(softness, voice.kind));
    smooth(voice.level.gain, voiceLevel(voice.kind, softness));
  }
  update();
});
$('#mute').addEventListener('click', () => {
  volume = volume === 0 ? lastVolume : 0;
  if (master) smooth(master.gain, volume, .04);
  update();
});

const about = $('#about');
$('.about-button').addEventListener('click', () => about.showModal());
$('#close-about').addEventListener('click', () => about.close());
// Clicks on the backdrop target the dialog itself but land outside its box.
about.addEventListener('click', event => {
  if (event.target !== about) return;
  const rect = about.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) about.close();
});

update();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
