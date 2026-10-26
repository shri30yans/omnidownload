/**
 * mux.js writes the 32-bit maximum as the duration of every track in the init
 * segment, which tools read as a 27-hour video. In a fragmented MP4 the real
 * duration comes from the fragments, so mark the header durations "unknown" (0).
 *
 * Boxes patched (all version 0): mvhd, tkhd, mdhd.
 *
 * @param {Uint8Array} init
 * @returns {Uint8Array} the same buffer, patched in place
 */
export function clearInitDurations(init) {
  const view = new DataView(init.buffer, init.byteOffset, init.byteLength);
  // Offset of the duration field from the start of the box type, per box.
  const durationAt = { mvhd: 4 + 16, tkhd: 4 + 20, mdhd: 4 + 16 };
  const type = (i) => String.fromCharCode(...init.subarray(i, i + 4));

  for (let i = 4; i + 8 < init.length; i++) {
    const offset = durationAt[type(i)];
    if (offset === undefined) continue;
    const version = init[i + 4];
    if (version !== 0) continue;
    view.setUint32(i + offset, 0);
  }
  return init;
}
