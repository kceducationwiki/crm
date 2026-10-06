// Bộ tạo mã QR tối giản (byte mode, mức sửa lỗi L, version 1–10 ≈ tối đa 271 ký tự)
// Viết tay để không phải thêm thư viện ngoài — dùng cho mã QR thiết lập xác thực 2 bước.

const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];      // tổng codeword theo version
const EC_PER_BLOCK = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18];       // codeword sửa lỗi / block (mức L)
const BLOCKS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4];                      // số block (mức L)
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ----- GF(256) -----
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data: number[], degree: number): number[] {
  // đa thức sinh
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= mul(gen[j], EXP[i]); }
    gen = next;
  }
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1], f);
  }
  return rem;
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Phần dư BCH: chia `value` (đã dịch trái `degree` bit) cho đa thức `poly` */
function bchRemainder(value: number, poly: number, degree: number): number {
  let rem = value;
  for (let i = 0; i < degree; i++) rem = (rem << 1) ^ ((rem >>> (degree - 1)) * poly);
  return rem & ((1 << degree) - 1);
}

/** Trả về ma trận QR (true = ô đen) */
export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8(text);
  let ver = 0;
  for (let v = 1; v <= 10; v++) {
    const dataCw = TOTAL[v - 1] - EC_PER_BLOCK[v - 1] * BLOCKS[v - 1];
    const cap = Math.floor((dataCw * 8 - 4 - (v < 10 ? 8 : 16)) / 8);
    if (bytes.length <= cap) { ver = v; break; }
  }
  if (!ver) throw new Error('Nội dung quá dài cho mã QR');
  const size = ver * 4 + 17;
  const dataCw = TOTAL[ver - 1] - EC_PER_BLOCK[ver - 1] * BLOCKS[ver - 1];

  // ----- chuỗi bit dữ liệu -----
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataCw; pad ^= 0xec ^ 0x11) data.push(pad);

  // ----- chia block + Reed–Solomon + xen kẽ -----
  const nb = BLOCKS[ver - 1], ecLen = EC_PER_BLOCK[ver - 1];
  const shortLen = Math.floor(dataCw / nb), longCount = dataCw % nb;
  const dBlocks: number[][] = [], eBlocks: number[][] = [];
  for (let b = 0, k = 0; b < nb; b++) {
    const len = shortLen + (b >= nb - longCount ? 1 : 0);
    const blk = data.slice(k, k + len); k += len;
    dBlocks.push(blk); eBlocks.push(rsRemainder(blk, ecLen));
  }
  const codewords: number[] = [];
  for (let i = 0; i <= shortLen; i++) for (const blk of dBlocks) if (i < blk.length) codewords.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const blk of eBlocks) codewords.push(blk[i]);

  // ----- ma trận + các mẫu chức năng -----
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, v: boolean) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = v; fn[r][c] = true; } };

  const finder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(r0 + dr, c0 + dc, dark);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver - 1];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // giữ chỗ cho format info + ô đen cố định
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); set(size - 1 - i, 8, false); }
  set(size - 8, 8, true);
  if (ver >= 7) {
    const v = (ver << 12) | bchRemainder(ver, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = ((v >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit); set(b, a, bit);
    }
  }

  // ----- đặt dữ liệu theo đường zigzag -----
  const stream: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) stream.push((cw >>> i) & 1);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j;
      const upward = ((right + 1) & 2) === 0;
      const r = upward ? size - 1 - vert : vert;
      if (!fn[r][c]) { m[r][c] = k < stream.length ? stream[k] === 1 : false; k++; }
    }
  }

  // ----- chọn mask tốt nhất -----
  const maskFn = [
    (r: number, c: number) => (r + c) % 2 === 0, (r: number) => r % 2 === 0, (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0, (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0, (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const withMask = (mask: number): boolean[][] => {
    const out = m.map((row) => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fn[r][c] && maskFn[mask](r, c)) out[r][c] = !out[r][c];
    // format info: mức L = 01
    const fd = (0b01 << 3) | mask;
    const fmt = ((fd << 10) | bchRemainder(fd, 0x537, 10)) ^ 0x5412;
    const bit = (i: number) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) out[i][8] = bit(i);
    out[7][8] = bit(6); out[8][8] = bit(7); out[8][7] = bit(8);
    for (let i = 9; i < 15; i++) out[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) out[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) out[size - 15 + i][8] = bit(i);
    return out;
  };
  const penalty = (g: boolean[][]): number => {
    let p = 0;
    const runs = (line: boolean[]) => {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      const s = line.map((x) => (x ? '1' : '0')).join('');
      for (const pat of ['10111010000', '00001011101']) { let idx = -1; while ((idx = s.indexOf(pat, idx + 1)) >= 0) p += 40; }
    };
    for (let r = 0; r < size; r++) runs(g[r]);
    for (let c = 0; c < size; c++) runs(g.map((row) => row[c]));
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++)
      if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    const dark = g.reduce((s, row) => s + row.filter(Boolean).length, 0);
    p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return p;
  };
  let best = withMask(0), bestP = penalty(best);
  for (let i = 1; i < 8; i++) { const g = withMask(i), p = penalty(g); if (p < bestP) { best = g; bestP = p; } }
  return best;
}

/** Chuỗi path SVG cho ma trận QR (mỗi ô 1 đơn vị, đã cộng lề `margin`) */
export function qrSvgPath(matrix: boolean[][], margin = 4): { d: string; size: number } {
  let d = '';
  matrix.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + margin},${r + margin}h1v1h-1z`; }));
  return { d, size: matrix.length + margin * 2 };
}
