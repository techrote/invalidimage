export function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function hashWords(...words) {
  let h = 0x9e3779b9;
  for (const word of words) {
    const value = typeof word === 'number'
      ? word
      : String(word).split('').reduce((a, c) => mix32(a ^ c.charCodeAt(0)), 0);
    h = mix32(h ^ (value >>> 0));
  }
  return h >>> 0;
}

export function unitHash(...words) {
  return hashWords(...words) / 0xffffffff;
}

export function signedHash(...words) {
  return unitHash(...words) * 2 - 1;
}

export function createRng(seed = 1) {
  let state = mix32(seed || 1);
  return {
    nextUint() {
      state = mix32(state + 0x6d2b79f5);
      return state;
    },
    next() {
      return this.nextUint() / 0xffffffff;
    },
    signed() {
      return this.next() * 2 - 1;
    },
    fork(label) {
      return createRng(hashWords(state, label));
    }
  };
}
