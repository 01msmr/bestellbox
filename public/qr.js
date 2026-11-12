// Minimaler QR-Encoder: Byte-Modus, Fehlerkorrektur M, Version 1–6 (bis 106 Byte)

// Version: [Gesamt-Codewörter, EC je Block, Blöcke, Ausrichtungsmuster]
const VERSIONS = [
  null,
  [26, 10, 1, []],
  [44, 16, 1, [6, 18]],
  [70, 26, 1, [6, 22]],
  [100, 18, 2, [6, 26]],
  [134, 24, 2, [6, 30]],
  [172, 16, 4, [6, 34]],
];

const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= mul(c, EXP[i]);
    });
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}

/** 15 Formatbits (ECC M, Maske 0–7) samt BCH-Code. */
export function formatBits(mask) {
  const data = mask; // ECC M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function codewords(bytes, version) {
  const [total, ecLen, blocks] = VERSIONS[version];
  const dataLen = total - ecLen * blocks;
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);
  const per = dataLen / blocks;
  const parts = Array.from({ length: blocks }, (_, i) => data.slice(i * per, (i + 1) * per));
  const ecs = parts.map((p) => rsRemainder(p, ecLen));
  const out = [];
  for (let i = 0; i < per; i++) parts.forEach((p) => out.push(p[i]));
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => out.push(e[i]));
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

function penalty(m) {
  const n = m.length;
  let p = 0;
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(m[i], m.map((r) => r[i]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    const s = line.map((v) => (v ? 1 : 0)).join('');
    for (let i = 0; i + 11 <= n; i++) {
      const w = s.slice(i, i + 11);
      if (w === '10111010000' || w === '00001011101') p += 40;
    }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  const dark = m.flat().filter(Boolean).length;
  return p + (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
}

/** QR-Matrix (true = dunkel) für einen Text; wirft bei mehr als 106 Byte. */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const capacity = [0, 14, 26, 42, 62, 84, 106];
  const version = capacity.findIndex((c, i) => i > 0 && bytes.length <= c);
  if (version < 0) throw new Error('Text zu lang für den QR-Code');
  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const pos = VERSIONS[version][3];
  for (const cy of pos) for (const cx of pos) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === pos[1]) || (cx === pos[1] && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatArea = () => {
    for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; }
    for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  };
  formatArea();
  set(8, size - 8, true);

  const data = codewords(bytes, version);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (fn[y][x]) continue;
      mod[y][x] = bit < data.length * 8 ? ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1 : false;
      bit++;
    }
  }

  const build = (mask) => {
    const m = mod.map((row, y) => row.map((v, x) => (fn[y][x] ? v : v !== MASKS[mask](x, y))));
    const f = formatBits(mask);
    const b = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = b(i);
    m[7][8] = b(6); m[8][8] = b(7); m[8][7] = b(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = b(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = b(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = b(i);
    m[size - 8][8] = true;
    return m;
  };
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(mask);
    const p = penalty(m);
    if (p < bestP) { best = m; bestP = p; }
  }
  return best;
}
