import lamejs from 'lamejs';

/**
 * Decode any browser-supported audio container and encode MP3 with lamejs.
 * @param {ArrayBuffer} sourceBytes
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<ArrayBuffer>}
 */
export async function encodeMp3(sourceBytes, onProgress) {
  onProgress?.(0.05);
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(sourceBytes.slice(0));
    onProgress?.(0.35);
    const channels = Math.min(2, audio.numberOfChannels);
    const left = floatTo16(audio.getChannelData(0));
    const right = channels > 1 ? floatTo16(audio.getChannelData(1)) : null;
    const kbps = 192;
    const encoder = new lamejs.Mp3Encoder(channels, audio.sampleRate, kbps);
    const block = 1152;
    const parts = [];
    const total = left.length;

    for (let i = 0; i < total; i += block) {
      const end = Math.min(i + block, total);
      const l = left.subarray(i, end);
      const buf =
        channels > 1
          ? encoder.encodeBuffer(l, right.subarray(i, end))
          : encoder.encodeBuffer(l);
      if (buf.length) parts.push(buf);
      if (i % (block * 32) === 0) {
        onProgress?.(0.35 + 0.55 * (i / total));
      }
    }
    const flush = encoder.flush();
    if (flush.length) parts.push(flush);
    onProgress?.(0.95);

    const byteLength = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(byteLength);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out.buffer;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** @param {Float32Array} input */
function floatTo16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
