// One-pole low-pass coefficient for a cutoff in Hz.
const onePole = hz => 1 - Math.exp(-2 * Math.PI * hz / sampleRate);

class StillroomNoise extends AudioWorkletProcessor {
  constructor() {
    super();
    this.kind = 'brown';
    this.stopped = false;
    this.brown = 0;
    this.pink = [0, 0, 0, 0, 0, 0, 0];
    this.deep = { low: 0, body: 0, dc: 0 };
    this.superDeep = { low: 0, body: 0, dc: 0 };
    this.deepRate = onePole(110);
    this.bodyRate = onePole(600);
    this.superRate = onePole(95);
    this.dcRate = onePole(25);
    this.port.onmessage = event => {
      if (event.data === 'stop') this.stopped = true;
      else this.kind = event.data;
    };
  }
  sample() {
    const white = Math.random() * 2 - 1;
    switch (this.kind) {
      case 'brown':
        this.brown = (this.brown + .021 * white) / 1.021;
        return this.brown * 3.6;
      case 'pink': {
        // Paul Kellet's refined pink noise filter.
        const b = this.pink;
        b[0] = .99886 * b[0] + white * .0555179;
        b[1] = .99332 * b[1] + white * .0750759;
        b[2] = .969 * b[2] + white * .153852;
        b[3] = .8665 * b[3] + white * .3104856;
        b[4] = .55 * b[4] + white * .5329522;
        b[5] = -.7616 * b[5] - white * .016898;
        const value = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * .5362) * .17;
        b[6] = white * .115926;
        return value;
      }
      case 'blue': {
        // Not spectral blue noise: a bass-rich bed and softer body, minus sub-bass.
        const d = this.deep;
        d.low += this.deepRate * (white - d.low);
        d.body += this.bodyRate * (white - d.body);
        const bed = d.low * 1.7 + d.body * .4;
        d.dc += this.dcRate * (bed - d.dc);
        return bed - d.dc;
      }
      case 'superblue': {
        // Two cascaded 95 Hz poles, minus sub-bass.
        const d = this.superDeep;
        d.low += this.superRate * (white - d.low);
        d.body += this.superRate * (d.low - d.body);
        d.dc += this.dcRate * (d.body - d.dc);
        return (d.body - d.dc) * 3;
      }
      default:
        return white;
    }
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    const [left, ...others] = outputs[0];
    for (let i = 0; i < left.length; i++) left[i] = this.sample() * .55;
    for (const channel of others) channel.set(left);
    return true;
  }
}
registerProcessor('stillroom-noise', StillroomNoise);
