import { ReportText } from './report-text.js';

const MILLISECONDS = 86_400_000;
/** The largest layout shift score a report may carry. */
const SHIFT = 100;
const RATINGS = ['good', 'needs-improvement', 'poor'];
const LOAD_STATES = ['loading', 'dom-interactive', 'dom-content-loaded', 'complete'];
const INTERACTION_TYPES = ['pointer', 'keyboard'];
const SUBPARTS = ['input-delay', 'processing-duration', 'presentation-delay'];

/**
 * A Core Web Vital from web-vitals' attribution build, reduced to what a page report keeps: its value, its rating and the
 * fields of its attribution that say what was behind it (the element, the script, the parts of the time), each in the form
 * the collector accepts. The entries and the timing objects stay in the page.
 */
export class VitalSummary {
  static METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

  /** `{ name, value, rating, attribution }`, or null for a metric a report does not carry. */
  static of(metric, origin) {
    if (!VitalSummary.METRICS.includes(metric?.name) || !RATINGS.includes(metric.rating))
      return null;
    const source = metric.attribution ?? {};
    return {
      name: metric.name,
      value: ReportText.number(metric.value, metric.name === 'CLS' ? SHIFT : MILLISECONDS) ?? 0,
      rating: metric.rating,
      attribution: VitalSummary.#defined(VitalSummary.#attribution(metric.name, source, origin)),
    };
  }

  static #attribution(name, source, origin) {
    const label = (value) => (value === undefined ? undefined : ReportText.label(value));
    const path = (value) => (value === undefined ? undefined : ReportText.path(value, origin));
    const duration = (value) => ReportText.number(value, MILLISECONDS) ?? undefined;
    const choice = (value, choices) => (choices.includes(value) ? value : undefined);
    switch (name) {
      case 'LCP':
        return {
          target: label(source.target),
          url: path(source.url),
          timeToFirstByte: duration(source.timeToFirstByte),
          resourceLoadDelay: duration(source.resourceLoadDelay),
          resourceLoadDuration: duration(source.resourceLoadDuration),
          elementRenderDelay: duration(source.elementRenderDelay),
        };
      case 'INP': {
        const script = source.longestScript;
        return {
          interactionTarget: label(source.interactionTarget),
          interactionType: choice(source.interactionType, INTERACTION_TYPES),
          inputDelay: duration(source.inputDelay),
          processingDuration: duration(source.processingDuration),
          presentationDelay: duration(source.presentationDelay),
          loadState: choice(source.loadState, LOAD_STATES),
          scriptUrl: path(script?.entry?.sourceURL),
          scriptFunction: label(script?.entry?.sourceFunctionName),
          scriptInvoker: label(script?.entry?.invoker),
          scriptSubpart: choice(script?.subpart, SUBPARTS),
          scriptDuration: duration(script?.intersectingDuration),
          totalScriptDuration: duration(source.totalScriptDuration),
          totalStyleAndLayoutDuration: duration(source.totalStyleAndLayoutDuration),
          totalPaintDuration: duration(source.totalPaintDuration),
          totalUnattributedDuration: duration(source.totalUnattributedDuration),
        };
      }
      case 'CLS':
        return {
          largestShiftTarget: label(source.largestShiftTarget),
          largestShiftTime: duration(source.largestShiftTime),
          largestShiftValue: ReportText.number(source.largestShiftValue, SHIFT) ?? undefined,
          loadState: choice(source.loadState, LOAD_STATES),
        };
      case 'FCP':
        return {
          timeToFirstByte: duration(source.timeToFirstByte),
          firstByteToFCP: duration(source.firstByteToFCP),
          loadState: choice(source.loadState, LOAD_STATES),
        };
      default:
        return {
          waitingDuration: duration(source.waitingDuration),
          cacheDuration: duration(source.cacheDuration),
          dnsDuration: duration(source.dnsDuration),
          connectionDuration: duration(source.connectionDuration),
          requestDuration: duration(source.requestDuration),
        };
    }
  }

  /** The fields that have a value, in their order. */
  static #defined(fields) {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  }
}
