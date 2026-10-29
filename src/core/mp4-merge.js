import { flattenFragmentedMp4 } from './mp4-flatten.js';

/**
 * Join YouTube's separate DASH downloads (a video-only and an audio-only
 * fragmented MP4) into one normal MP4 with both tracks.
 */

const text = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** Top-level children of `buf` between `from` and `to`. */
function readBoxes(buf, from = 0, to = buf.length) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const boxes = [];
  for (let i = from; i + 8 <= to; ) {
    const size = view.getUint32(i) || to - i;
    if (size < 8) break;
    boxes.push({ type: text(buf, i + 4), start: i, end: Math.min(i + size, to), body: i + 8 });
    i += size;
  }
  return boxes;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function header(type, size) {
  const h = new Uint8Array(8);
  new DataView(h.buffer).setUint32(0, size);
  for (let i = 0; i < 4; i++) h[4 + i] = type.charCodeAt(i);
  return h;
}

/** Split a DASH file into its init part (ftyp + moov) and everything from the first moof on. */
function split(buf) {
  const boxes = readBoxes(buf);
  const ftyp = boxes.find((b) => b.type === 'ftyp');
  const moov = boxes.find((b) => b.type === 'moov');
  const firstMoof = boxes.find((b) => b.type === 'moof');
  if (!ftyp || !moov || !firstMoof) throw new Error('Unexpected YouTube file layout.');
  return { buf, ftyp, moov, fragments: buf.subarray(firstMoof.start) };
}

/** Copy of the `moov` child boxes: [mvhd, ...trak]. */
function moovParts({ buf, moov }) {
  const kids = readBoxes(buf, moov.body, moov.end);
  return {
    mvhd: kids.find((b) => b.type === 'mvhd'),
    traks: kids.filter((b) => b.type === 'trak'),
  };
}

/** Track id lives at tkhd body+12 (version 0). */
function setTrackId(trak, buf, id) {
  const copy = buf.slice(trak.start, trak.end);
  const inner = readBoxes(copy, 8, copy.length);
  const tkhd = inner.find((b) => b.type === 'tkhd');
  new DataView(copy.buffer).setUint32(tkhd.body + 12, id);
  return copy;
}

/** Point every `traf` in a run of fragments at a new track id (returns a copy). */
function retargetFragments(frags, id) {
  const copy = frags.slice();
  const view = new DataView(copy.buffer);
  for (const moof of readBoxes(copy).filter((b) => b.type === 'moof')) {
    for (const traf of readBoxes(copy, moof.body, moof.end).filter((b) => b.type === 'traf')) {
      const tfhd = readBoxes(copy, traf.body, traf.end).find((b) => b.type === 'tfhd');
      view.setUint32(tfhd.body + 4, id);
    }
  }
  return copy;
}

/**
 * @param {Uint8Array} video fragmented MP4 with one video track
 * @param {Uint8Array} audio fragmented MP4 with one audio track
 * @returns {Uint8Array[]} parts of one normal MP4
 */
export function mergeDashMp4(video, audio) {
  const v = split(video);
  const a = split(audio);
  const vParts = moovParts(v);
  const aParts = moovParts(a);

  const vTrak = setTrackId(vParts.traks[0], video, 1);
  const aTrak = setTrackId(aParts.traks[0], audio, 2);
  const body = concat([video.subarray(vParts.mvhd.start, vParts.mvhd.end), vTrak, aTrak]);
  const init = concat([
    video.subarray(v.ftyp.start, v.ftyp.end),
    header('moov', body.length + 8),
    body,
  ]);

  // Video fragments keep their own track id only if it was 1 already.
  const vFrags = retargetFragments(v.fragments, 1);
  const aFrags = retargetFragments(a.fragments, 2);
  return flattenFragmentedMp4(init, [vFrags, aFrags]);
}
