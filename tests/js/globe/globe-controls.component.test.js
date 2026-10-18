import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scrubber, GlobeControls } from '@site/js/globe/globe-controls.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';

const pointer = (type, init = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 4, ...init });

describe('Scrubber', () => {
  let element, onChange, scrubber;
  const make = (data = {}, options = {}) => {
    element.dataset.min = data.min ?? '0';
    element.dataset.max = data.max ?? '100';
    element.dataset.step = data.step ?? '5';
    element.dataset.pixelsPerStep = data.pixelsPerStep ?? '10';
    element.dataset.nudge = data.nudge ?? '20';
    element.dataset.default = data.default ?? '50';
    scrubber = new Scrubber(element, { format: (value) => `<${value}>`, onChange, ...options });
    return scrubber.mount();
  };

  beforeEach(() => {
    document.body.innerHTML = '<span id="scrubber" tabindex="0"></span>';
    element = document.getElementById('scrubber');
    element.setPointerCapture = vi.fn();
    onChange = vi.fn();
  });

  describe('mount', () => {
    it('shows the default value, formatted, and exposes it as aria-valuenow, without notifying', () => {
      expect(make()).toBe(scrubber);
      expect([
        element.textContent,
        element.getAttribute('aria-valuenow'),
        scrubber.value,
        onChange.mock.calls.length,
      ]).toStrictEqual(['<50>', '50', 50, 0]);
    });

    it('says the value as the visitor reads it in aria-valuetext, with its unit', () => {
      make();
      expect(element.getAttribute('aria-valuetext')).toBe('<50>');
    });

    it('starts from an initial value when it is given', () => {
      make({}, { initialValue: 75 });
      expect([element.textContent, scrubber.value]).toStrictEqual(['<75>', 75]);
    });

    it('rounds an initial value that is not on a step, and clamps it into range', () => {
      make({}, { initialValue: 53 });
      expect(scrubber.value).toBe(55);
      make({}, { initialValue: 500 });
      expect(scrubber.value).toBe(100);
    });

    it('starts from zero when an initial value of 0 is given, not from the default', () => {
      make({}, { initialValue: 0 });
      expect(scrubber.value).toBe(0);
    });
  });

  describe('set', () => {
    beforeEach(() => make());

    it('rounds to the step, clamps to the range, writes aria-valuenow and notifies once with the new value', () => {
      scrubber.set(62);
      expect([
        scrubber.value,
        element.getAttribute('aria-valuenow'),
        element.textContent,
      ]).toStrictEqual([60, '60', '<60>']);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenNthCalledWith(1, 60);
    });

    it.each([
      [-40, 0],
      [140, 100],
      [2.4, 0],
      [2.6, 5],
      [97.4, 95],
    ])('turns %f into %d', (value, expected) => {
      scrubber.set(value);
      expect(scrubber.value).toBe(expected);
    });

    it('keeps aria-valuetext in step with the value', () => {
      scrubber.set(62);
      expect(element.getAttribute('aria-valuetext')).toBe('<60>');
    });

    it('keeps the value free of floating point noise: 31 steps of .05 is 1.55, not 1.5500000000000003', () => {
      make({ min: '0', max: '4', step: '.05', default: '1.5' });
      scrubber.set(1.5 + 0.05);
      expect([scrubber.value, element.getAttribute('aria-valuenow')]).toStrictEqual([1.55, '1.55']);
    });

    it('can change the value without telling anyone', () => {
      scrubber.set(20, false);
      expect([scrubber.value, onChange.mock.calls.length]).toStrictEqual([20, 0]);
    });

    it('redraws with the format of the moment', () => {
      scrubber.set(20, false);
      expect(element.textContent).toBe('<20>');
    });
  });

  describe('dragging', () => {
    beforeEach(() => make());

    it('captures the pointer, marks the element, and stops the browser from selecting text', () => {
      const event = pointer('pointerdown', { clientX: 100 });
      element.dispatchEvent(event);
      expect([event.defaultPrevented, element.classList.contains('is-active')]).toStrictEqual([
        true,
        true,
      ]);
      expect(element.setPointerCapture).toHaveBeenCalledTimes(1);
      expect(element.setPointerCapture).toHaveBeenNthCalledWith(1, 4);
    });

    it('changes the value by one step per pixelsPerStep dragged: 30 px at 10 px per step of 5 adds 15', () => {
      element.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      element.dispatchEvent(pointer('pointermove', { clientX: 130 }));
      expect([scrubber.value, onChange.mock.calls]).toStrictEqual([65, [[65]]]);
    });

    it('measures from where the drag began, so going back returns to the start', () => {
      element.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      element.dispatchEvent(pointer('pointermove', { clientX: 130 }));
      element.dispatchEvent(pointer('pointermove', { clientX: 100 }));
      expect(onChange.mock.calls).toStrictEqual([[65], [50]]);
    });

    it('moves ten times faster with Shift', () => {
      element.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      element.dispatchEvent(pointer('pointermove', { clientX: 104, shiftKey: true }));
      expect(scrubber.value).toBe(70);
    });

    it('drags to the left', () => {
      element.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      element.dispatchEvent(pointer('pointermove', { clientX: 80 }));
      expect(scrubber.value).toBe(40);
    });

    it.each([['pointerup'], ['pointercancel']])('stops on %s', (type) => {
      element.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      element.dispatchEvent(pointer(type));
      element.dispatchEvent(pointer('pointermove', { clientX: 200 }));
      expect([element.classList.contains('is-active'), onChange.mock.calls.length]).toStrictEqual([
        false,
        0,
      ]);
    });

    it('ignores pointer moves when no drag began', () => {
      element.dispatchEvent(pointer('pointermove', { clientX: 200 }));
      expect(onChange.mock.calls.length).toBe(0);
    });

    it('goes back to the default on double click', () => {
      scrubber.set(80);
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect([scrubber.value, onChange.mock.calls]).toStrictEqual([50, [[80], [50]]]);
    });
  });

  describe('keyboard', () => {
    beforeEach(() => make());
    const press = (key, init = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      element.dispatchEvent(event);
      return event;
    };

    it.each([
      ['ArrowRight', 55],
      ['ArrowUp', 55],
      ['ArrowLeft', 45],
      ['ArrowDown', 45],
    ])('%s moves by one step to %d and stops the page from scrolling', (key, expected) => {
      const event = press(key);
      expect([scrubber.value, event.defaultPrevented, onChange.mock.calls]).toStrictEqual([
        expected,
        true,
        [[expected]],
      ]);
    });

    it('moves ten steps with Shift', () => {
      press('ArrowRight', { shiftKey: true });
      expect(scrubber.value).toBe(100);
    });

    it('stops at the ends of the range', () => {
      for (let press_ = 0; press_ < 30; press_++) press('ArrowRight');
      expect(scrubber.value).toBe(100);
      for (let press_ = 0; press_ < 30; press_++) press('ArrowLeft');
      expect(scrubber.value).toBe(0);
    });

    it('ignores other keys and leaves them to the browser', () => {
      const event = press('a');
      expect([event.defaultPrevented, scrubber.value, onChange.mock.calls.length]).toStrictEqual([
        false,
        50,
        0,
      ]);
    });

    it.each([
      ['PageUp', 70],
      ['PageDown', 30],
    ])('%s moves by the coarse step of 20 to %d', (key, expected) => {
      const event = press(key);
      expect([scrubber.value, event.defaultPrevented, onChange.mock.calls]).toStrictEqual([
        expected,
        true,
        [[expected]],
      ]);
    });

    it('does not make the coarse step bigger with Shift', () => {
      press('PageUp', { shiftKey: true });
      expect(scrubber.value).toBe(70);
    });

    it.each([
      ['Home', 0],
      ['End', 100],
    ])('%s jumps to the end of the range, %d', (key, expected) => {
      const event = press(key);
      expect([scrubber.value, event.defaultPrevented, onChange.mock.calls]).toStrictEqual([
        expected,
        true,
        [[expected]],
      ]);
    });
  });

  describe('nudge', () => {
    beforeEach(() => make());

    it('moves one coarse step up or down, and tells the listener', () => {
      scrubber.nudge(1);
      scrubber.nudge(-1);
      scrubber.nudge(-1);
      expect([scrubber.value, onChange.mock.calls]).toStrictEqual([30, [[70], [50], [30]]]);
    });

    it('stops at the ends of the range', () => {
      for (let count = 0; count < 8; count++) scrubber.nudge(1);
      expect(scrubber.value).toBe(100);
      for (let count = 0; count < 8; count++) scrubber.nudge(-1);
      expect(scrubber.value).toBe(0);
    });
  });

  describe('wheel', () => {
    const roll = (deltaY) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event;
    };

    it('scrolling down lowers the value by one step, and scrolling up raises it, without scrolling the page', () => {
      make();
      const down = roll(120);
      expect([scrubber.value, down.defaultPrevented]).toStrictEqual([45, true]);
      roll(-120);
      roll(-3);
      expect(scrubber.value).toBe(55);
    });

    it('moves a full-circle range five steps at a time', () => {
      make({ max: '360', step: '1', default: '128', pixelsPerStep: '2' });
      roll(120);
      expect(scrubber.value).toBe(123);
      roll(-120);
      roll(-120);
      expect(scrubber.value).toBe(133);
    });
  });
});

describe('GlobeControls', () => {
  let root, theme, globe, translator, onInstancesChange, controls;
  const scrubber = (key, data) =>
    `<span class="scrubber" tabindex="0" data-control="${key}" data-min="${data.min}" data-max="${data.max}" data-step="${data.step}" data-pixels-per-step="4" data-nudge="${data.nudge}" data-default="${data.default}"></span>`;
  const text = (key) => root.querySelector(`[data-control=${key}]`).textContent;
  const click = (key, name) =>
    root
      .querySelector(`[data-control=${key}]`)
      .dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  const mount = (overrides = {}) => {
    controls = new GlobeControls({
      root,
      globe,
      theme,
      onInstancesChange,
      translator,
      ...overrides,
    });
    return controls.mount();
  };

  beforeEach(() => {
    document.body.innerHTML = `<div id="root">${scrubber('hue', { min: 0, max: 360, step: 1, nudge: 30, default: 128 })}${scrubber('speed', { min: 0, max: 4, step: 0.25, nudge: 0.5, default: 1.5 })}${scrubber('instances', { min: 1, max: 20, step: 1, nudge: 4, default: 1 })}</div>`;
    root = document.getElementById('root');
    theme = { hue: 200, setHue: vi.fn(), randomizeHue: vi.fn(() => 77) };
    globe = { setSpeed: vi.fn(), setInstances: vi.fn(), kick: vi.fn() };
    onInstancesChange = vi.fn();
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    Formatter.use('pt-BR');
  });

  afterEach(() => Formatter.use('pt-BR'));

  it('shows the hue the theme has, the default speed and one instance, each in its own format', () => {
    expect(mount()).toBe(controls);
    expect([text('hue'), text('speed'), text('instances')]).toStrictEqual(['200°', '1,5×', '×1']);
  });

  it('starts quiet: nobody is told about the initial values', () => {
    mount();
    expect([
      theme.setHue.mock.calls.length,
      globe.setSpeed.mock.calls.length,
      globe.setInstances.mock.calls.length,
      onInstancesChange.mock.calls.length,
    ]).toStrictEqual([0, 0, 0, 0]);
  });

  it('sends a hue change to the theme', () => {
    mount();
    click('hue', 'ArrowRight');
    expect(theme.setHue.mock.calls).toStrictEqual([[201]]);
    expect(text('hue')).toBe('201°');
  });

  it('sends a speed change to the globe', () => {
    mount();
    click('speed', 'ArrowRight');
    expect(globe.setSpeed.mock.calls).toStrictEqual([[1.75]]);
    expect(text('speed')).toBe('1,75×');
  });

  it('sends an instance change to the globe and to the callback, in that order', () => {
    const order = [];
    globe.setInstances.mockImplementation(() => order.push('globe'));
    onInstancesChange.mockImplementation(() => order.push('callback'));
    mount();
    click('instances', 'ArrowRight');
    expect([
      globe.setInstances.mock.calls,
      onInstancesChange.mock.calls,
      order,
      text('instances'),
    ]).toStrictEqual([[[2]], [[2]], ['globe', 'callback'], '×2']);
  });

  it('works without a globe and without an instance callback', () => {
    mount({ globe: null, onInstancesChange: undefined });
    click('speed', 'ArrowRight');
    click('instances', 'ArrowRight');
    expect([text('speed'), text('instances')]).toStrictEqual(['1,75×', '×2']);
  });

  it.each([
    ['hue', 1, 'setHue', 230, '230°'],
    ['hue', -1, 'setHue', 170, '170°'],
    ['speed', 1, 'setSpeed', 2, '2×'],
    ['speed', -1, 'setSpeed', 1, '1×'],
  ])(
    'nudges %s by %d for people who cannot drag: %s receives %d',
    (key, direction, method, expected, shown) => {
      mount();
      controls.nudge(key, direction);
      expect([(key === 'hue' ? theme : globe)[method].mock.calls, text(key)]).toStrictEqual([
        [[expected]],
        shown,
      ]);
    },
  );

  it('nudges the instances by 4 and tells the callback', () => {
    mount();
    controls.nudge('instances', 1);
    expect([
      globe.setInstances.mock.calls,
      onInstancesChange.mock.calls,
      text('instances'),
    ]).toStrictEqual([[[5]], [[5]], '×5']);
  });

  it('picks a random hue through the theme, shows it, applies it once and kicks the globe', () => {
    mount();
    controls.randomizeHue();
    expect([
      text('hue'),
      theme.randomizeHue.mock.calls.length,
      theme.setHue.mock.calls,
      globe.kick.mock.calls.length,
    ]).toStrictEqual(['77°', 1, [[77]], 1]);
  });

  it('redraws the numbers in the new language when the visitor switches', () => {
    mount();
    Formatter.use('en-US');
    translator.setLocale('en-US');
    expect([text('hue'), text('speed'), text('instances')]).toStrictEqual(['200°', '1.5×', '×1']);
  });
});
