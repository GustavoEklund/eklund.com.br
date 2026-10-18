import { Numbers } from '../shared/math.js';

const ARC_SEGMENTS = 96;
const ARC_VERTEX_STRIDE = 9; // xyz, t, next xyz, side, arc index

/** Pins and ribbon arcs (spherical interpolation lifted above the surface) as GPU buffers. */
export class GlobeGeometry {
  static toUnitVector({ latitude, longitude }) {
    const lat = Numbers.degreesToRadians(latitude),
      lon = Numbers.degreesToRadians(longitude);
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]; // same handedness as LandDecoder
  }

  static pins(home, destinations) {
    return new Float32Array([
      ...GlobeGeometry.toUnitVector(home),
      0,
      ...destinations.flatMap((place) => [...GlobeGeometry.toUnitVector(place), 1]),
    ]);
  }

  static arcs(home, destinations, pairs) {
    const homeVector = GlobeGeometry.toUnitVector(home);
    const vertices = new Float32Array(pairs.length * ARC_SEGMENTS * 2 * ARC_VERTEX_STRIDE);
    pairs.forEach(([fromIndex, toIndex], arcIndex) => {
      const from = fromIndex < 0 ? homeVector : GlobeGeometry.toUnitVector(destinations[fromIndex]);
      const to = GlobeGeometry.toUnitVector(destinations[toIndex]);
      const angle = Math.acos(
        Numbers.clamp(from[0] * to[0] + from[1] * to[1] + from[2] * to[2], -1, 1),
      );
      const lift = 0.06 + 0.3 * (angle / Math.PI);
      const pointAt = (t) => {
        const w0 = Math.sin((1 - t) * angle) / Math.sin(angle),
          w1 = Math.sin(t * angle) / Math.sin(angle);
        const height = 1 + lift * Math.sin(Math.PI * t);
        return [
          (from[0] * w0 + to[0] * w1) * height,
          (from[1] * w0 + to[1] * w1) * height,
          (from[2] * w0 + to[2] * w1) * height,
        ];
      };
      for (let segment = 0; segment < ARC_SEGMENTS; segment++) {
        const t = segment / (ARC_SEGMENTS - 1),
          point = pointAt(t);
        const next =
          segment < ARC_SEGMENTS - 1
            ? pointAt((segment + 1) / (ARC_SEGMENTS - 1))
            : point.map(
                (value, axis) => 2 * value - pointAt((segment - 1) / (ARC_SEGMENTS - 1))[axis],
              );
        for (let side = 0; side < 2; side++) {
          const offset = ((arcIndex * ARC_SEGMENTS + segment) * 2 + side) * ARC_VERTEX_STRIDE;
          vertices.set(
            [point[0], point[1], point[2], t, next[0], next[1], next[2], side ? 1 : -1, arcIndex],
            offset,
          );
        }
      }
    });
    return { vertices, segments: ARC_SEGMENTS, arcCount: pairs.length };
  }
}
