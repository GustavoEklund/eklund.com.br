import { describe, it, expect } from 'vitest';
import { VitalSummary } from '@site/js/field-report/vital-summary.js';

const ORIGIN = 'https://eklund.com.br';
/** What web-vitals passes besides the attribution, which a report leaves out. */
const metric = (name, value, attribution, rating = 'good') => ({
  name,
  value,
  rating,
  delta: value,
  id: 'v6-1700000000000-1234567890',
  entries: [{ startTime: 1 }],
  navigationType: 'navigate',
  attribution,
});

describe('VitalSummary', () => {
  it('keeps the LCP element, the path of its resource and the four parts of its time', () => {
    expect(
      VitalSummary.of(
        metric('LCP', 1_840.2, {
          target: 'section#hero>h1',
          url: 'https://eklund.com.br/assets/hero-AbC.webp?w=2',
          timeToFirstByte: 120,
          resourceLoadDelay: 10,
          resourceLoadDuration: 300,
          elementRenderDelay: 1_410.2,
          navigationEntry: { name: 'https://eklund.com.br/' },
          lcpEntry: { element: {} },
          lcpResourceEntry: { name: 'x' },
        }),
        ORIGIN,
      ),
    ).toStrictEqual({
      name: 'LCP',
      value: 1_840.2,
      rating: 'good',
      attribution: {
        target: 'section#hero>h1',
        url: '/assets/hero-AbC.webp',
        timeToFirstByte: 120,
        resourceLoadDelay: 10,
        resourceLoadDuration: 300,
        elementRenderDelay: 1_410.2,
      },
    });
  });

  it('keeps the INP target, its parts, the load state and the longest script, by its path, function and invoker', () => {
    expect(
      VitalSummary.of(
        metric(
          'INP',
          232,
          {
            interactionTarget: 'button#theme-toggle',
            interactionTime: 5_000,
            interactionType: 'pointer',
            nextPaintTime: 5_232,
            processedEventEntries: [{}],
            inputDelay: 12,
            processingDuration: 180,
            presentationDelay: 40,
            loadState: 'complete',
            longAnimationFrameEntries: [{}],
            longestScript: {
              entry: {
                sourceURL: 'https://eklund.com.br/assets/main-AbC123.js',
                sourceFunctionName: 'toggle',
                invoker: 'BUTTON#theme-toggle.onclick',
              },
              subpart: 'processing-duration',
              intersectingDuration: 150,
            },
            totalScriptDuration: 160,
            totalStyleAndLayoutDuration: 30,
            totalPaintDuration: 8,
            totalUnattributedDuration: 2,
          },
          'needs-improvement',
        ),
        ORIGIN,
      ),
    ).toStrictEqual({
      name: 'INP',
      value: 232,
      rating: 'needs-improvement',
      attribution: {
        interactionTarget: 'button#theme-toggle',
        interactionType: 'pointer',
        inputDelay: 12,
        processingDuration: 180,
        presentationDelay: 40,
        loadState: 'complete',
        scriptUrl: '/assets/main-AbC123.js',
        scriptFunction: 'toggle',
        scriptInvoker: 'BUTTON#theme-toggle.onclick',
        scriptSubpart: 'processing-duration',
        scriptDuration: 150,
        totalScriptDuration: 160,
        totalStyleAndLayoutDuration: 30,
        totalPaintDuration: 8,
        totalUnattributedDuration: 2,
      },
    });
  });

  it('leaves out of INP what the browser did not measure: no target, no script', () => {
    expect(
      VitalSummary.of(
        metric('INP', 16, {
          processedEventEntries: [],
          inputDelay: 1,
          processingDuration: 5,
          presentationDelay: 10,
          loadState: 'dom-interactive',
          longAnimationFrameEntries: [],
        }),
        ORIGIN,
      ),
    ).toStrictEqual({
      name: 'INP',
      value: 16,
      rating: 'good',
      attribution: {
        inputDelay: 1,
        processingDuration: 5,
        presentationDelay: 10,
        loadState: 'dom-interactive',
      },
    });
  });

  it('keeps the largest layout shift of CLS, its time, its score and the load state', () => {
    expect(
      VitalSummary.of(
        metric('CLS', 0.12, {
          largestShiftTarget: 'footer>p',
          largestShiftTime: 3_200,
          largestShiftValue: 0.1,
          largestShiftEntry: {},
          largestShiftSource: {},
          loadState: 'complete',
        }),
        ORIGIN,
      ),
    ).toStrictEqual({
      name: 'CLS',
      value: 0.12,
      rating: 'good',
      attribution: {
        largestShiftTarget: 'footer>p',
        largestShiftTime: 3_200,
        largestShiftValue: 0.1,
        loadState: 'complete',
      },
    });
  });

  it('keeps the parts of FCP and of TTFB', () => {
    expect([
      VitalSummary.of(
        metric('FCP', 900, {
          timeToFirstByte: 100,
          firstByteToFCP: 800,
          loadState: 'dom-content-loaded',
          fcpEntry: {},
          navigationEntry: {},
        }),
        ORIGIN,
      ),
      VitalSummary.of(
        metric('TTFB', 100, {
          waitingDuration: 5,
          cacheDuration: 0,
          dnsDuration: 20,
          connectionDuration: 30,
          requestDuration: 45,
          navigationEntry: {},
        }),
        ORIGIN,
      ),
    ]).toStrictEqual([
      {
        name: 'FCP',
        value: 900,
        rating: 'good',
        attribution: { timeToFirstByte: 100, firstByteToFCP: 800, loadState: 'dom-content-loaded' },
      },
      {
        name: 'TTFB',
        value: 100,
        rating: 'good',
        attribution: {
          waitingDuration: 5,
          cacheDuration: 0,
          dnsDuration: 20,
          connectionDuration: 30,
          requestDuration: 45,
        },
      },
    ]);
  });

  it('puts every value in the form the collector accepts: other origins, odd characters, values out of range, unknown choices', () => {
    expect([
      VitalSummary.of(
        metric('LCP', 90_000_000, {
          target: 'img.foto-ç',
          url: 'https://images.example.com/a.png',
          timeToFirstByte: -5,
        }),
        ORIGIN,
      ),
      VitalSummary.of(
        metric('CLS', 250, { largestShiftValue: 250, loadState: 'prerendering' }),
        ORIGIN,
      ),
      VitalSummary.of(
        metric('INP', 40, { interactionType: 'gesture', longestScript: { subpart: 'other' } }),
        ORIGIN,
      ),
    ]).toStrictEqual([
      {
        name: 'LCP',
        value: 86_400_000,
        rating: 'good',
        attribution: { target: 'img.foto-?', url: 'other', timeToFirstByte: 0 },
      },
      { name: 'CLS', value: 100, rating: 'good', attribution: { largestShiftValue: 100 } },
      { name: 'INP', value: 40, rating: 'good', attribution: {} },
    ]);
  });

  it('carries no metric outside the five, nor one with a rating it does not know', () => {
    expect([
      VitalSummary.of(metric('FID', 10, {}), ORIGIN),
      VitalSummary.of(metric('LCP', 10, {}, 'excellent'), ORIGIN),
      VitalSummary.of(null, ORIGIN),
      VitalSummary.of({ name: 'TTFB', value: 1, rating: 'good' }, ORIGIN),
    ]).toStrictEqual([
      null,
      null,
      null,
      { name: 'TTFB', value: 1, rating: 'good', attribution: {} },
    ]);
  });
});
