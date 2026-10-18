const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export class Dom {
  static query(selector, root = document) {
    return root.querySelector(selector);
  }

  static queryAll(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  static require(selector, root = document) {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  static setText(element, text) {
    if (element && element.textContent !== String(text)) element.textContent = text;
  }

  static svg(tagName, attributes = {}, textContent) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (textContent != null) element.textContent = textContent;
    return element;
  }

  static escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  /** Reports true only for a laid-out, intersecting element; content-visibility: auto skips off-screen boxes. */
  static observeVisibility(element, onChange, threshold = 0) {
    const hasBox = (entry) =>
      entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0;
    const observer = new IntersectionObserver(
      ([entry]) => onChange(entry.isIntersecting && hasBox(entry)),
      { threshold },
    );
    observer.observe(element);
    return observer;
  }
}
