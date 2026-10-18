/**
 * Rebuilds the land dots from the latitude-ring bitset produced by tools/land.py.
 * Ring j holds round(2π·cos(lat)/Δ) samples; odd rings are shifted half a step.
 */
export class LandDecoder {
  #ringCount;
  #bits;

  constructor({ ringCount, bitsetBase64 }) {
    this.#ringCount = ringCount;
    this.#bits = atob(bitsetBase64);
  }

  /** @returns {{ positions: Float32Array, count: number }} xyz + seed per land dot */
  decode() {
    const rings = this.#ringCount,
      step = Math.PI / rings;
    const samplesPerRing = new Int32Array(rings);
    let totalSamples = 0;
    for (let ring = 0; ring < rings; ring++) {
      samplesPerRing[ring] = Math.max(
        1,
        Math.floor((2 * Math.PI * Math.cos(this.#latitude(ring))) / step + 0.5),
      );
      totalSamples += samplesPerRing[ring];
    }
    let count = 0;
    for (let index = 0; index < totalSamples; index++) count += this.#isLand(index);
    const positions = new Float32Array(count * 4);
    let sampleIndex = 0,
      write = 0;
    for (let ring = 0; ring < rings; ring++) {
      const latitude = this.#latitude(ring),
        samples = samplesPerRing[ring],
        offset = ring % 2 ? 0.5 : 0;
      const cosLat = Math.cos(latitude),
        sinLat = Math.sin(latitude);
      for (let slot = 0; slot < samples; slot++, sampleIndex++) {
        if (!this.#isLand(sampleIndex)) continue;
        const longitude = ((slot + offset) * 2 * Math.PI) / samples - Math.PI;
        positions[write++] = cosLat * Math.cos(longitude);
        positions[write++] = sinLat;
        positions[write++] = -cosLat * Math.sin(longitude); // east to the right, seen from outside
        positions[write++] = (Math.imul(sampleIndex, 2654435761) >>> 0) / 4294967296; // stable per-dot seed
      }
    }
    return { positions, count, angularStep: step };
  }

  #latitude(ring) {
    return -Math.PI / 2 + ((ring + 0.5) * Math.PI) / this.#ringCount;
  }

  #isLand(index) {
    return (this.#bits.charCodeAt(index >> 3) >> (index & 7)) & 1;
  }
}
