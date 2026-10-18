const CORNER_RADIUS = 9;

/** Builds an SVG path through axis-aligned points with rounded corners. */
export class OrthogonalPath {
  static build(points) {
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let index = 1; index < points.length - 1; index++) {
      const [previousX, previousY] = points[index - 1],
        [x, y] = points[index],
        [nextX, nextY] = points[index + 1];
      const inX = Math.sign(x - previousX),
        inY = Math.sign(y - previousY),
        outX = Math.sign(nextX - x),
        outY = Math.sign(nextY - y);
      const incomingLength = Math.abs(x - previousX) + Math.abs(y - previousY),
        outgoingLength = Math.abs(nextX - x) + Math.abs(nextY - y); // one term of each is 0: the legs are axis-aligned
      const radius = Math.min(CORNER_RADIUS, incomingLength / 2, outgoingLength / 2);
      path += `L${x - inX * radius},${y - inY * radius} Q${x},${y} ${x + outX * radius},${y + outY * radius}`;
    }
    const [lastX, lastY] = points.at(-1);
    return `${path}L${lastX},${lastY}`;
  }
}
