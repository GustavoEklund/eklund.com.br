/** Reads the browser's top layer, bottom to top, through the DevTools protocol (the DOM has no API for it). */
export class TopLayer {
  #session;

  constructor(session) {
    this.#session = session;
  }

  static async attach(page) {
    return new TopLayer(await page.context().newCDPSession(page));
  }

  /** Elements as `div.cursor-dot` or `dialog#command-palette`, without the ::backdrop pseudo-elements. */
  async elements() {
    await this.#session.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await this.#session.send('DOM.getTopLayerElements');
    const described = [];
    for (const nodeId of nodeIds) {
      const { node } = await this.#session.send('DOM.describeNode', { nodeId });
      if (node.nodeName.startsWith('::')) continue;
      const attributes = Object.fromEntries(
        (node.attributes ?? []).reduce(
          (pairs, value, index, all) => (index % 2 ? pairs : [...pairs, [value, all[index + 1]]]),
          [],
        ),
      );
      described.push(
        attributes.id
          ? `${node.localName}#${attributes.id}`
          : `${node.localName}.${attributes.class.split(' ')[0]}`,
      );
    }
    return described;
  }
}
