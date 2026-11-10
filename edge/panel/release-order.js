/** Releases in the order they came out, by their numbers: 1.10.0 after 1.9.2, and 1.2.0-rc.1 before 1.2.0. */
export class ReleaseOrder {
  /** The versions, newest first, each once. */
  static newestFirst(versions) {
    return [...new Set(versions)].sort((a, b) => ReleaseOrder.compare(b, a));
  }

  /** Negative when `a` came out before `b`. */
  static compare(a, b) {
    const [mainA, preA = null] = ReleaseOrder.#split(a);
    const [mainB, preB = null] = ReleaseOrder.#split(b);
    for (let index = 0; index < 3; index += 1)
      if (mainA[index] !== mainB[index]) return mainA[index] - mainB[index];
    if (preA === preB) return 0;
    if (preA === null) return 1;
    if (preB === null) return -1;
    return preA < preB ? -1 : 1;
  }

  static #split(version) {
    const [main, ...pre] = version.split('-');
    return [main.split('.').map(Number), pre.length ? pre.join('-') : null];
  }
}
