/** Page reports for the tests of the collector: a complete one, and copies of it with one thing changed. */
export class PageReports {
  static VIEW = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

  /** A load of the home page with every kind of content a report can carry. */
  static complete() {
    return {
      v: 1,
      view: PageReports.VIEW,
      seq: 0,
      version: '1.2.0',
      page: '/',
      language: 'pt-BR',
      referrer: 'www.google.com',
      navigation: 'navigate',
      visible: 5_000,
      device: {
        viewport: '360-413',
        pixelRatio: '3+',
        memory: '4',
        cores: '5-8',
        roundTrip: '100-299',
        saveData: false,
        colorScheme: 'dark',
        reducedMotion: false,
      },
      vitals: [
        {
          name: 'LCP',
          value: 2_100.5,
          rating: 'good',
          attribution: {
            target: 'section#hero>h1',
            url: '',
            timeToFirstByte: 120,
            resourceLoadDelay: 0,
            resourceLoadDuration: 0,
            elementRenderDelay: 1_980.5,
          },
        },
        {
          name: 'INP',
          value: 96,
          rating: 'good',
          attribution: {
            interactionTarget: 'button#theme-toggle',
            interactionType: 'pointer',
            inputDelay: 4,
            processingDuration: 60,
            presentationDelay: 32,
            loadState: 'complete',
            scriptUrl: '/assets/main-AbC123.js',
            scriptFunction: 'toggle',
            scriptInvoker: 'BUTTON#theme-toggle.onclick',
            scriptSubpart: 'processing-duration',
            scriptDuration: 55,
          },
        },
        {
          name: 'CLS',
          value: 0,
          rating: 'good',
          attribution: { loadState: 'complete' },
        },
      ],
      events: [
        { name: 'section', detail: 'carga', at: 4_000 },
        { name: 'copy-email', detail: '', at: 4_500 },
        { name: 'load-test', detail: 'finish', value: 30_000, at: 34_500 },
      ],
      errors: [
        {
          kind: 'error',
          message: "TypeError: Cannot read properties of undefined (reading 'width')",
          source: '/assets/main-AbC123.js',
          line: 1,
          column: 2_345,
          at: 1_200,
        },
      ],
    };
  }

  /** The complete report with `change` applied to a copy of it. */
  static with(change) {
    const report = PageReports.complete();
    change(report);
    return report;
  }
}
