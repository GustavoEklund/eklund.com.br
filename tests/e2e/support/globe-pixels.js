/**
 * Reads the pixels of the globe's WebGL canvas. A WebGL canvas empties its buffer once the page is composited, so the
 * context is created with preserveDrawingBuffer on, which keeps the last frame readable.
 */
export class GlobePixels {
  static async install(page) {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attributes) {
        return getContext.call(
          this,
          type,
          type.startsWith('webgl') ? { ...attributes, preserveDrawingBuffer: true } : attributes,
        );
      };
    });
  }

  /** The RGBA of a pixel in the top-left corner (outside the sphere) and of one at the centre (on it). */
  static corners(page) {
    return page.evaluate(() => {
      const canvas = document.querySelector('#globe-canvas');
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d');
      context.drawImage(canvas, 0, 0);
      const pixel = (x, y) =>
        Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data);
      return { corner: pixel(2, 2), center: pixel(copy.width / 2, copy.height / 2) };
    });
  }
}
