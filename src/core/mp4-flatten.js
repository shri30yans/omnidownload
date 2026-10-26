/**
 * Turn a fragmented MP4 (what mux.js produces: an init segment plus moof/mdat
 * pairs) into a normal MP4: one `moov` with full sample tables, then one `mdat`.
 *
 * Browsers play fragmented files, but Apple's players (QuickTime, Finder
 * previews) only read the first fragment of one that has no index, which shows
 * as a video that is black or a few seconds long. A normal MP4 has none of that.
 *
 * Handles what mux.js emits: one H.264 and/or one AAC track, version-0 header
 * boxes, `trun` with per-sample size, duration, flags and composition offsets.
 */

const text = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** @typedef {{ type: string, start: number, end: number, body: number }} Box */

/** Child boxes of `buf` between `from` and `to`. */
function readBoxes(buf, from = 0, to = buf.length) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const boxes = [];
  for (let i = from; i + 8 <= to; ) {
    const size = view.getUint32(i) || to - i;
    if (size < 8) break;
    boxes.push({ type: text(buf, i + 4), start: i, end: i + size, body: i + 8 });
    i += size;
  }
  return boxes;
}

const find = (boxes, type) => boxes.find((b) => b.type === type);

// ── writing ──────────────────────────────────────────────────────────────────

const u32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** @param {string} type @param {Uint8Array[]} parts */
function box(type, ...parts) {
  const body = concat(parts);
  return concat([u32(body.length + 8), Uint8Array.of(...[...type].map((c) => c.charCodeAt(0))), body]);
}

/** Full box: version/flags header, then a table of 32-bit values. */
function table(type, version, flags, ...words) {
  return box(type, Uint8Array.of(version, 0, 0, flags), ...words.map(u32));
}

const raw = (buf, b) => buf.subarray(b.start, b.end);

// ── reading fragments ────────────────────────────────────────────────────────

/**
 * @typedef {object} Sample
 * @property {number} size
 * @property {number} duration
 * @property {number} cto composition offset
 * @property {boolean} sync
 * @property {Uint8Array} data
 */

/** Pull every sample, per track id, out of a run of moof+mdat boxes. */
function readFragment(buf, tracks) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (const moof of readBoxes(buf).filter((b) => b.type === 'moof')) {
    for (const traf of readBoxes(buf, moof.body, moof.end).filter((b) => b.type === 'traf')) {
      const kids = readBoxes(buf, traf.body, traf.end);
      const tfhd = find(kids, 'tfhd');
      const tfhdFlags = view.getUint32(tfhd.body) & 0xffffff;
      const trackId = view.getUint32(tfhd.body + 4);
      let p = tfhd.body + 8;
      if (tfhdFlags & 0x1) p += 8;
      if (tfhdFlags & 0x2) p += 4;
      const defaults = { duration: 0, size: 0, flags: 0 };
      if (tfhdFlags & 0x8) defaults.duration = view.getUint32((p += 0)), (p += 4);
      if (tfhdFlags & 0x10) defaults.size = view.getUint32(p), (p += 4);
      if (tfhdFlags & 0x20) defaults.flags = view.getUint32(p);

      const track = tracks.get(trackId);
      for (const trun of kids.filter((b) => b.type === 'trun')) {
        const version = buf[trun.body];
        const flags = view.getUint32(trun.body) & 0xffffff;
        const count = view.getUint32(trun.body + 4);
        let q = trun.body + 8;
        let offset = moof.start;
        if (flags & 0x1) offset += view.getInt32(q), (q += 4);
        let firstFlags = null;
        if (flags & 0x4) firstFlags = view.getUint32(q), (q += 4);

        for (let i = 0; i < count; i++) {
          let duration = defaults.duration;
          let size = defaults.size;
          let sflags = i === 0 && firstFlags !== null ? firstFlags : defaults.flags;
          let cto = 0;
          if (flags & 0x100) duration = view.getUint32(q), (q += 4);
          if (flags & 0x200) size = view.getUint32(q), (q += 4);
          if (flags & 0x400) {
            if (!(i === 0 && firstFlags !== null)) sflags = view.getUint32(q);
            q += 4;
          }
          if (flags & 0x800) {
            cto = version === 0 ? view.getUint32(q) : view.getInt32(q);
            q += 4;
          }
          track.samples.push({
            size,
            duration,
            cto,
            sync: !(sflags & 0x10000),
            data: buf.subarray(offset, offset + size),
          });
          offset += size;
        }
        track.chunks.push(track.samples.length);
      }
    }
  }
}

// ── building the sample tables ───────────────────────────────────────────────

const runs = (values) => {
  const out = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
};

/** Presentation time of the earliest picture: smallest decode time + composition offset. */
function firstPresentationTime(samples) {
  let dts = 0;
  let first = Infinity;
  for (const s of samples) {
    first = Math.min(first, dts + s.cto);
    dts += s.duration;
  }
  return first;
}

function sampleTables(track, chunkOffsets) {
  const { samples, chunks } = track;
  const parts = [];

  parts.push(table('stts', 0, 0, runs(samples.map((s) => s.duration)).length, ...runs(samples.map((s) => s.duration)).flat()));

  if (samples.some((s) => s.cto)) {
    const r = runs(samples.map((s) => s.cto));
    parts.push(table('ctts', 0, 0, r.length, ...r.flat()));
  }

  if (!samples.every((s) => s.sync)) {
    const sync = samples.flatMap((s, i) => (s.sync ? [i + 1] : []));
    parts.push(table('stss', 0, 0, sync.length, ...sync));
  }

  // samples per chunk, run-length encoded as (first chunk, samples per chunk, description 1)
  const perChunk = chunks.map((end, i) => end - (chunks[i - 1] ?? 0));
  const stsc = [];
  perChunk.forEach((n, i) => {
    if (!stsc.length || stsc[stsc.length - 1][1] !== n) stsc.push([i + 1, n, 1]);
  });
  parts.push(table('stsc', 0, 0, stsc.length, ...stsc.flat()));
  parts.push(table('stsz', 0, 0, 0, samples.length, ...samples.map((s) => s.size)));
  parts.push(table('stco', 0, 0, chunkOffsets.length, ...chunkOffsets));
  return parts;
}

/** Overwrite a 32-bit field at byte `at` of a copy of box `b` (header boxes are version 0). */
function patched(b, at, value) {
  const copy = b.slice();
  new DataView(copy.buffer).setUint32(at, value);
  return copy;
}

/**
 * @param {Uint8Array} init init segment (ftyp + moov)
 * @param {Uint8Array[]} fragments moof/mdat runs, in order
 * @returns {Uint8Array[]} parts of the finished file
 */
export function flattenFragmentedMp4(init, fragments) {
  const view = new DataView(init.buffer, init.byteOffset, init.byteLength);
  const top = readBoxes(init);
  const ftyp = find(top, 'ftyp');
  const moov = find(top, 'moov');
  const moovKids = readBoxes(init, moov.body, moov.end);
  const mvhd = find(moovKids, 'mvhd');
  const movieTimescale = view.getUint32(mvhd.body + 12);

  // Track ids and sample descriptions from the init segment.
  const tracks = new Map();
  for (const trak of moovKids.filter((b) => b.type === 'trak')) {
    const kids = readBoxes(init, trak.body, trak.end);
    const tkhd = find(kids, 'tkhd');
    const mdia = find(kids, 'mdia');
    const mdiaKids = readBoxes(init, mdia.body, mdia.end);
    const mdhd = find(mdiaKids, 'mdhd');
    const minf = find(mdiaKids, 'minf');
    const minfKids = readBoxes(init, minf.body, minf.end);
    const stsd = find(readBoxes(init, find(minfKids, 'stbl').body, find(minfKids, 'stbl').end), 'stsd');
    tracks.set(view.getUint32(tkhd.body + 12), {
      trak, kids, tkhd, mdia, mdiaKids, mdhd, minf, minfKids, stsd,
      timescale: view.getUint32(mdhd.body + 12),
      handler: text(init, find(mdiaKids, 'hdlr').body + 8),
      samples: [],
      chunks: [],
    });
  }
  for (const f of fragments) readFragment(f, tracks);

  // Interleave chunks the way they arrived: by fragment order of the data.
  const order = [];
  for (const [id, t] of tracks) t.chunks.forEach((_, i) => order.push({ id, i }));
  // fragments were read track by track, so sort chunks by decode time to interleave A/V
  const startOf = (id, i) => {
    const t = tracks.get(id);
    const from = t.chunks[i - 1] ?? 0;
    let at = 0;
    for (let s = 0; s < from; s++) at += t.samples[s].duration;
    return at / t.timescale;
  };
  order.sort((a, b) => startOf(a.id, a.i) - startOf(b.id, b.i));

  const mdatParts = [];
  const offsets = new Map([...tracks.keys()].map((id) => [id, []]));
  let rel = 0;
  for (const { id, i } of order) {
    const t = tracks.get(id);
    offsets.get(id).push(rel);
    for (let s = t.chunks[i - 1] ?? 0; s < t.chunks[i]; s++) {
      mdatParts.push(t.samples[s].data);
      rel += t.samples[s].size;
    }
  }

  const buildMoov = (base) => {
    let longest = 0;
    const traks = [];
    for (const [id, t] of tracks) {
      const media = t.samples.reduce((n, s) => n + s.duration, 0);
      const inMovie = Math.round((media / t.timescale) * movieTimescale);
      longest = Math.max(longest, inMovie);

      const stbl = box('stbl', raw(init, t.stsd), ...sampleTables(t, offsets.get(id).map((o) => o + base)));
      const minf = box('minf', ...t.minfKids.filter((b) => b.type !== 'stbl').map((b) => raw(init, b)), stbl);
      const mdia = box(
        'mdia',
        patched(raw(init, t.mdhd), 24, media),
        raw(init, find(t.mdiaKids, 'hdlr')),
        minf,
      );

      // Video starts a few frames before its first picture (B-frame reordering):
      // an edit list skips that gap so picture and sound stay in sync.
      const lead = t.handler === 'vide' ? firstPresentationTime(t.samples) : 0;
      const edts = lead > 0
        ? box('edts', table('elst', 0, 0, 1, inMovie, lead, 0x00010000))
        : null;
      traks.push(box('trak', patched(raw(init, t.tkhd), 28, inMovie), ...(edts ? [edts] : []), mdia));
    }
    return box('moov', patched(raw(init, mvhd), 24, longest), ...traks);
  };

  const head = raw(init, ftyp);
  const moovSize = buildMoov(0).length;
  const mdatHeader = u32(rel + 8);
  const moovBytes = buildMoov(head.length + moovSize + 8);
  return [head, moovBytes, mdatHeader, Uint8Array.of(0x6d, 0x64, 0x61, 0x74), ...mdatParts];
}
