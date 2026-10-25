// Continuous, stereo procedural scenes: no short audio loops or sample downloads.
class NatureChannel {
  constructor(rate, offset) {
    this.rate = rate; this.time = offset; this.low = 0; this.mid = 0; this.high = 0;
    this.lowRate = 1 - Math.exp(-2 * Math.PI * 180 / rate);
    this.midRate = 1 - Math.exp(-2 * Math.PI * 1600 / rate);
    this.highRate = 1 - Math.exp(-2 * Math.PI * 6500 / rate);
    this.pop = 0; this.drop = 0; this.dropPhase = 0; this.dropFrequency = 1000;
    this.popDecay = Math.exp(-1 / (rate * .006));
    this.dropDecay = Math.exp(-1 / (rate * .035));
  }
  next(kind) {
    const t = this.time; this.time += 1 / this.rate;
    const noise = Math.random() * 2 - 1;
    this.low += this.lowRate * (noise - this.low);
    this.mid += this.midRate * (noise - this.mid);
    this.high += this.highRate * (noise - this.high);
    const air = this.high - this.low;
    let value = 0;
    if (kind === 'rain') {
      if (Math.random() < 24 / this.rate) { this.drop = .04 + Math.random() * .13; this.dropFrequency = 1400 + Math.random() * 2200; }
      value = air * (.52 + .06 * Math.sin(t * .29)) + this.mid * .23 + this.droplet();
    } else if (kind === 'ocean') {
      // Broad swells, a softer receding wash, and a distant low surf bed.
      const swell = (.5 + .5 * Math.sin(t * .49 + .3 * Math.sin(t * .13))) ** 2;
      value = this.mid * (.28 + swell * 1.1) + this.low * .5 + air * (.035 + swell * .12);
    } else if (kind === 'campfire') {
      if (Math.random() < 8 / this.rate) this.pop = .15 + Math.random() ** 3 * .6;
      this.pop *= this.popDecay;
      value = this.low * 1.6 + this.mid * (.25 + .07 * Math.sin(t * 1.3)) + noise * this.pop;
    } else if (kind === 'creek') {
      if (Math.random() < 12 / this.rate) { this.drop = .05 + Math.random() * .12; this.dropFrequency = 450 + Math.random() * 1500; }
      value = this.mid * .85 + air * (.15 + .025 * Math.sin(t * .8)) + this.droplet();
    } else if (kind === 'train') {
      const beat = (t % .74) / .74;
      const clack = Math.exp(-beat * 44) + .65 * Math.exp(-((beat + .82) % 1) * 44);
      value = this.low * 1.7 + this.mid * .18 + .028 * Math.sin(t * 2 * Math.PI * 68)
        + clack * (.25 * this.mid + .055 * Math.sin(t * 2 * Math.PI * 110));
    } else if (kind === 'garden') {
      let crickets = 0;
      for (let i = 0; i < 3; i++) {
        const phrase = (t + i * .67) % (2.6 + i * .41);
        const active = phrase < 1.05 ? Math.sin(Math.PI * phrase / 1.05) ** 2 : 0;
        const pulse = Math.max(0, Math.sin(t * 2 * Math.PI * (21 + i * 2))) ** 3;
        crickets += active * pulse * Math.sin(t * 2 * Math.PI * (2350 + i * 430)) * .055;
      }
      value = this.low * .65 + this.mid * .12 + crickets;
    }
    return value;
  }
  droplet() {
    this.drop *= this.dropDecay;
    this.dropPhase += 2 * Math.PI * this.dropFrequency / this.rate;
    if (this.dropPhase > 2 * Math.PI) this.dropPhase -= 2 * Math.PI;
    this.dropFrequency *= .999997;
    return Math.sin(this.dropPhase) * this.drop;
  }
}
class StillroomNature extends AudioWorkletProcessor {
  constructor() {
    super(); this.kind = 'rain'; this.stopped = false;
    this.channels = [new NatureChannel(sampleRate, 0), new NatureChannel(sampleRate, .37)];
    this.port.onmessage = event => { if (event.data === 'stop') this.stopped = true; else this.kind = event.data; };
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    const channels = outputs[0];
    for (let c = 0; c < channels.length; c++) {
      for (let i = 0; i < channels[c].length; i++) channels[c][i] = this.channels[c % 2].next(this.kind);
    }
    return true;
  }
}
registerProcessor('stillroom-nature', StillroomNature);
