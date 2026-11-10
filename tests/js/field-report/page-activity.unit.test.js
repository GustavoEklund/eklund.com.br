import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageActivity } from '@site/js/field-report/page-activity.js';
import { FakeIntersectionObserver } from '../../support/fake-observers.js';

const GITHUB = 'https://github.com/GustavoEklund';
const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';

describe('PageActivity', () => {
  let activity, onEvent, time;
  const click = (element, { x = 10, y = 10 } = {}) =>
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
    );
  const events = () => onEvent.mock.calls;
  const stay = (event) => event.preventDefault();

  beforeEach(() => {
    document.body.innerHTML = `
      <header><a id="logo" href="/">eklund</a><a id="repo" href="${REPOSITORY}">source</a></header>
      <main>
        <section id="hero"><div id="globe"><canvas id="canvas"></canvas></div></section>
        <section id="status"><p id="status-text">ok</p></section>
        <section id="contato">
          <a id="email" href="mailto:gustavo@eklund.com.br">email</a>
          <a id="copy" href="mailto:gustavo@eklund.com.br" data-copy="gustavo@eklund.com.br">copy</a>
          <a id="github" href="${GITHUB}">github</a>
          <a id="linkedin" href="https://www.linkedin.com/in/gustavo-eklund/">linkedin</a>
          <div id="history"><button id="history-button">2019</button></div>
        </section>
      </main>
      <footer><p id="footer-text">footer</p></footer>`;
    document.getElementById('copy').addEventListener('click', (event) => event.preventDefault());
    // The links go nowhere in the test: the window cancels them after the document has heard the click.
    window.addEventListener('click', stay);
    FakeIntersectionObserver.instances = [];
    time = 0;
    onEvent = vi.fn();
    activity = new PageActivity({
      document,
      sections: ['status', 'perfil', 'contato'],
      links: [
        ['source', REPOSITORY],
        ['github', GITHUB],
        ['linkedin', 'https://www.linkedin.com/in/gustavo-eklund'],
      ],
      regions: [
        ['globe', '#globe'],
        ['history', '#history'],
      ],
      onEvent,
      now: () => time,
      IntersectionObserver: FakeIntersectionObserver,
    }).install();
  });

  afterEach(() => {
    activity.stop();
    window.removeEventListener('click', stay);
  });

  it('watches the sections it was given that exist, across the middle of the window and for half of each', () => {
    expect(
      FakeIntersectionObserver.instances.map((observer) => [
        observer.options,
        observer.observed.map((section) => section.id),
      ]),
    ).toStrictEqual([
      [{ rootMargin: '-50% 0px -50% 0px' }, ['status', 'contato']],
      [{ threshold: 0.5 }, ['status', 'contato']],
    ]);
  });

  it('says a section arrived when it crosses the middle or shows half of itself, and not when it leaves or shows less', () => {
    const [middle, half] = FakeIntersectionObserver.instances;
    const status = document.getElementById('status');
    const contato = document.getElementById('contato');
    middle.callback([{ isIntersecting: true, intersectionRatio: 0.01, target: status }]);
    middle.callback([{ isIntersecting: false, intersectionRatio: 0, target: status }]);
    half.callback([{ isIntersecting: true, intersectionRatio: 0.2, target: contato }]);
    half.callback([{ isIntersecting: true, intersectionRatio: 0.5, target: contato }]);
    half.callback([{ isIntersecting: false, intersectionRatio: 0.5, target: status }]);
    expect(events()).toStrictEqual([
      ['section', 'status'],
      ['section', 'contato'],
    ]);
  });

  it('names the links that leave the site, the repository before the profile it is under', () => {
    for (const [index, id] of ['repo', 'github', 'linkedin', 'logo'].entries())
      click(document.getElementById(id), { x: index * 100 });
    expect(events()).toStrictEqual([
      ['outbound', 'source'],
      ['outbound', 'github'],
      ['outbound', 'linkedin'],
    ]);
  });

  it('counts a mailto: link as email, unless the page took over its click to copy the address', () => {
    click(document.getElementById('copy'));
    click(document.getElementById('email'), { x: 500 });
    expect(events()).toStrictEqual([['outbound', 'email']]);
  });

  it('says a part was touched when the pointer goes down inside it', () => {
    for (const id of ['canvas', 'history-button', 'status-text'])
      document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(events()).toStrictEqual([
      ['interact', 'globe'],
      ['interact', 'history'],
    ]);
  });

  it('calls three clicks within a second and 30 pixels a rage click, in the section where they landed', () => {
    const text = document.getElementById('status-text');
    click(text, { x: 100, y: 100 });
    time = 400;
    click(text, { x: 120, y: 110 });
    time = 900;
    click(text, { x: 110, y: 125 });
    expect(events()).toStrictEqual([['rage-click', 'status']]);
  });

  it('starts counting again after a rage click, after a pause and after a click far away', () => {
    const text = document.getElementById('footer-text');
    for (const [at, x] of [
      [0, 10],
      [100, 10],
      [200, 10],
      [300, 10],
      [1_500, 10],
      [1_600, 10],
      [1_700, 400],
      [1_800, 400],
    ]) {
      time = at;
      click(text, { x, y: 10 });
    }
    expect(events()).toStrictEqual([['rage-click', 'footer']]);
  });

  it('places a rage click in the header, the footer, or else other', () => {
    const rage = (element) => {
      for (const at of [0, 1, 2]) {
        time += at;
        click(element);
      }
      time += 5_000;
    };
    rage(document.getElementById('logo'));
    rage(document.getElementById('footer-text'));
    rage(document.getElementById('canvas'));
    expect(events().filter(([name]) => name === 'rage-click')).toStrictEqual([
      ['rage-click', 'header'],
      ['rage-click', 'footer'],
      ['rage-click', 'other'],
    ]);
  });

  it('hears nothing after it stops', () => {
    activity.stop();
    click(document.getElementById('github'));
    document
      .getElementById('canvas')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(events()).toStrictEqual([]);
  });

  it('works without IntersectionObserver, with only the clicks', () => {
    activity.stop();
    activity = new PageActivity({
      document,
      sections: ['status'],
      links: [],
      regions: [],
      onEvent,
      now: () => time,
      IntersectionObserver: undefined,
    }).install();
    click(document.getElementById('email'));
    expect(events()).toStrictEqual([['outbound', 'email']]);
  });
});
