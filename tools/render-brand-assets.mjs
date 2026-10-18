// Renders the raster brand files from source/icon.svg and the self-hosted fonts: the favicon.ico, the touch and
// manifest icons and the social card. The output is committed, so this only runs when the mark or the card changes.
// usage: node tools/render-brand-assets.mjs
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const SOURCE = resolve(fileURLToPath(new URL('../source', import.meta.url)));
const LIME = '#c6f04d';
const INK = '#101218';
const BACKGROUND = '#111318';
const FOREGROUND = '#f2f3ee';

class BrandAssets {
  #page;
  #mark;

  constructor(page, mark) {
    this.#page = page;
    this.#mark = mark;
  }

  /** The outline of the "e" in icon.svg, drawn in a 64 by 64 box. */
  static async readMark() {
    const svg = await readFile(join(SOURCE, 'icon.svg'), 'utf8');
    const outline = svg.match(/<path fill="[^"]+" d="([^"]+)"/);
    if (!outline) throw new Error('source/icon.svg has no <path> outline for the mark');
    return outline[1];
  }

  /** A square of side `size` filled with lime, or a lime disc on transparency, with the mark scaled to `markScale` of the side. */
  #markSvg({ size, shape, markScale }) {
    const scale = (size * markScale) / 64;
    const offset = (size - 64 * scale) / 2;
    const background =
      shape === 'disc'
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.46875}" fill="${LIME}"/>`
        : `<rect width="${size}" height="${size}" fill="${LIME}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}<g transform="translate(${offset} ${offset}) scale(${scale})"><path fill="${INK}" d="${this.#mark}"/></g></svg>`;
  }

  async #renderPng({ size, shape, markScale }) {
    await this.#page.setViewportSize({ width: size, height: size });
    await this.#page.setContent(
      `<body style="margin:0;background:transparent">${this.#markSvg({ size, shape, markScale })}</body>`,
    );
    return this.#page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }

  /** An ICO file holding one PNG image, which every browser since Windows Vista reads. */
  static #ico(png, size) {
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(1, 4); // image count
    header.writeUInt8(size, 6); // width
    header.writeUInt8(size, 7); // height
    header.writeUInt16LE(1, 10); // color planes
    header.writeUInt16LE(32, 12); // bits per pixel
    header.writeUInt32LE(png.length, 14); // image size
    header.writeUInt32LE(22, 18); // image offset
    return Buffer.concat([header, png]);
  }

  async writeIcons() {
    await mkdir(join(SOURCE, 'assets', 'brand'), { recursive: true });
    const files = [
      ['assets/brand/icon-192.png', { size: 192, shape: 'disc', markScale: 1 }],
      ['assets/brand/icon-512.png', { size: 512, shape: 'disc', markScale: 1 }],
      ['assets/brand/icon-maskable-512.png', { size: 512, shape: 'square', markScale: 0.56 }], // the mark stays inside the 80% safe zone
      ['apple-touch-icon.png', { size: 180, shape: 'square', markScale: 0.66 }],
    ];
    for (const [path, options] of files)
      await writeFile(join(SOURCE, path), await this.#renderPng(options));
    await writeFile(
      join(SOURCE, 'favicon.ico'),
      BrandAssets.#ico(await this.#renderPng({ size: 32, shape: 'disc', markScale: 1 }), 32),
    );
    return files.map(([path]) => path).concat('favicon.ico');
  }

  /** 1200 by 630, the size Open Graph and Twitter cards use. Only the name, the domain and words that read the same in both languages. */
  async writeSocialCard() {
    const folder = await mkdtemp(join(tmpdir(), 'social-card-'));
    const fonts = pathToFileURL(join(SOURCE, 'fonts')).href;
    const markSvg = this.#markSvg({ size: 96, shape: 'disc', markScale: 1 });
    const html = `<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: Bricolage; font-weight: 200 800; font-stretch: 75% 100%; src: url(${fonts}/bricolage-grotesque-latin.woff2) format("woff2"); }
      @font-face { font-family: Instrument; font-style: italic; src: url(${fonts}/instrument-serif-italic-latin.woff2) format("woff2"); }
      @font-face { font-family: Mono; font-weight: 400 800; src: url(${fonts}/jetbrains-mono-latin.woff2) format("woff2"); }
      * { margin: 0; box-sizing: border-box; }
      body { width: 1200px; height: 630px; background: ${BACKGROUND}; color: ${FOREGROUND}; position: relative; overflow: hidden; }
      .mark { position: absolute; left: 88px; top: 88px; }
      h1 { position: absolute; left: 84px; top: 236px; white-space: nowrap; font: 800 168px/1 Bricolage; font-variation-settings: "opsz" 96, "wdth" 88; letter-spacing: -0.035em; }
      h1 em { font: italic 400 176px/1 Instrument; letter-spacing: -0.015em; color: ${LIME}; margin-left: 0.08em; }
      .role { position: absolute; left: 88px; top: 452px; font: 500 40px/1 Mono; letter-spacing: -0.01em; }
      .domain { position: absolute; left: 88px; bottom: 64px; font: 500 30px/1 Mono; color: ${LIME}; }
      .line { position: absolute; right: 0; bottom: 0; width: 360px; height: 12px; background: ${LIME}; }
    </style><div class="mark">${markSvg}</div><h1>Gustavo<em>Eklund</em></h1><p class="role">Backend · Pix</p><p class="domain">eklund.com.br</p><div class="line"></div>`;
    try {
      const file = join(folder, 'card.html');
      await writeFile(file, html);
      await this.#page.setViewportSize({ width: 1200, height: 630 });
      await this.#page.goto(pathToFileURL(file).href);
      await this.#page.evaluate(() => document.fonts.ready);
      const png = await this.#page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1200, height: 630 },
      });
      await mkdir(join(SOURCE, 'assets', 'brand'), { recursive: true });
      await writeFile(join(SOURCE, 'assets', 'brand', 'social-card.png'), png);
      return ['assets/brand/social-card.png'];
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const assets = new BrandAssets(page, await BrandAssets.readMark());
  const written = [...(await assets.writeIcons()), ...(await assets.writeSocialCard())];
  console.log(`wrote ${written.join(', ')}`);
} finally {
  await browser.close();
}
