import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClickPlaces } from '@site/js/field-report/click-places.js';

const REGIONS = [
  ['privacy', '#privacy-notice'],
  ['status', '#status'],
  ['contato', '#contato'],
];
const WINDOW = { width: 1280, height: 800 };

describe('ClickPlaces', () => {
  /** Gives an element the box the layout would, which happy-dom does not compute. */
  const box = (id, left, top, width, height) =>
    (document.getElementById(id).getBoundingClientRect = () => ({ left, top, width, height }));

  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <section id="status"><button id="send">Enviar <b id="label">agora</b></button></section>
        <section id="contato"><input id="email" value="someone@example.com"></section>
      </main>
      <aside id="privacy-notice"><button id="accept">Aceitar</button></aside>
      <footer><a id="away" href="/">x</a></footer>`;
    box('status', 100, -200, 1000, 1000);
    box('contato', 0, 300, 1280, 400);
    box('privacy-notice', 640, 700, 600, 80);
  });
  afterEach(() => (document.body.innerHTML = ''));

  const place = (id, clientX, clientY, size = WINDOW) =>
    ClickPlaces.of({ target: document.getElementById(id), clientX, clientY }, REGIONS, size);

  it('places a click in the part that holds what was clicked, as a share of its width and height from the top left', () => {
    expect([
      place('label', 350, 300),
      place('email', 320, 400),
      place('accept', 940, 740),
    ]).toStrictEqual([
      { region: 'status', viewport: '1280-1535', x: 0.25, y: 0.5 },
      { region: 'contato', viewport: '1280-1535', x: 0.25, y: 0.25 },
      { region: 'privacy', viewport: '1280-1535', x: 0.5, y: 0.5 },
    ]);
  });

  it('places a click outside every part against the window, and names the range of its width', () => {
    expect([
      place('away', 320, 200),
      place('away', 0, 0, { width: 390, height: 844 }),
    ]).toStrictEqual([
      { region: 'other', viewport: '1280-1535', x: 0.25, y: 0.25 },
      { region: 'other', viewport: '360-413', x: 0, y: 0 },
    ]);
  });

  it('keeps a position to a thousandth, inside its part, and at 0 for a part without size', () => {
    box('contato', 0, 300, 0, 0);
    expect([
      place('label', 100 + 1000 / 3, -300),
      place('label', 2000, 2000),
      place('email', 50, 350),
    ]).toStrictEqual([
      { region: 'status', viewport: '1280-1535', x: 0.333, y: 0 },
      { region: 'status', viewport: '1280-1535', x: 1, y: 1 },
      { region: 'contato', viewport: '1280-1535', x: 0, y: 0 },
    ]);
  });

  it('places a click on something that is not an element, such as the document, against the window', () => {
    expect(
      ClickPlaces.of({ target: document, clientX: 640, clientY: 400 }, REGIONS, WINDOW),
    ).toStrictEqual({ region: 'other', viewport: '1280-1535', x: 0.5, y: 0.5 });
  });
});
