// Shared between the player and the offline signal checks.
export const DEFAULT_VOLUME = 0.22;
export const DEFAULT_SOFTNESS = 0.6;
export const GREY_EQ = [
  { type: 'lowshelf', frequency: 200, gain: 3, Q: 0.7 },
  { type: 'peaking', frequency: 3200, gain: -9, Q: 0.75 },
  { type: 'highshelf', frequency: 8500, gain: -3, Q: 0.7 },
];
export function softnessCutoff(amount, kind) {
  const high = kind === 'superblue' ? 650 : kind === 'blue' ? 1600 : 8000;
  const low = kind === 'superblue' ? 70 : kind === 'blue' ? 300 : 900;
  return high * Math.pow(low / high, Math.max(0, Math.min(1, amount)));
}
// Calibrated after EQ and treble filtering at five softness positions.
// Linear interpolation keeps adjustments gradual; master volume stays separate.
const levels = {
  superblue: [2.44, 2.4612, 2.5372, 2.7575, 3.2866],
  rain: [0.5442, 0.633, 0.7749, 0.9997, 1.3431],
  ocean: [0.4218, 0.4503, 0.495, 0.565, 0.6727],
  campfire: [0.7232, 0.7416, 0.7673, 0.8027, 0.85],
  creek: [0.5373, 0.5816, 0.6507, 0.7623, 0.943],
  train: [0.7798, 0.7921, 0.8112, 0.8399, 0.8823],
  garden: [1.7869, 1.8275, 1.9007, 2.0061, 2.1394],
  white: [0.5378, 0.695, 0.9067, 1.1865, 1.5568],
  pink: [0.6631, 0.6868, 0.7136, 0.7436, 0.7781],
  brown: [0.8752, 0.8802, 0.8884, 0.9029, 0.9288],
  grey: [0.8472, 1.052, 1.1958, 1.3312, 1.5356],
  blue: [1.7599, 1.8216, 1.9105, 2.0365, 2.2173],
};
export function voiceLevel(kind, softness) {
  const position = Math.max(0, Math.min(1, softness)) * 4;
  const lower = Math.min(3, Math.floor(position));
  const fraction = position - lower;
  return levels[kind][lower] * (1 - fraction) + levels[kind][lower + 1] * fraction;
}
