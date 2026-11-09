/** Lab batches for the tests of the collector and of tools/lab-run.mjs: a complete one, and copies of it with one thing changed. */
export class LabBatches {
  static DAY = '2026-11-09';
  static TOKEN = 'a-lab-token-for-the-tests';

  /**
   * One night with a row of every kind: a median and a plain run, a CrUX reading, a row of each engine, and a certificate
   * the lab read and one its connection refused.
   */
  static complete() {
    return {
      v: 1,
      runs: [
        {
          day: LabBatches.DAY,
          page: '/',
          formFactor: 'mobile',
          run: 0,
          median: true,
          score: 0.81,
          lcp: 2_612.5,
          fcp: 1_204,
          cls: 0,
          tbt: 663.25,
          speedIndex: 2_890,
          ttfb: 120,
          report: `${LabBatches.DAY}/home-mobile.json`,
        },
        {
          day: LabBatches.DAY,
          page: '/en/',
          formFactor: 'desktop',
          run: 4,
          median: false,
          score: 0.98,
          lcp: 702,
          fcp: 410,
          cls: 0.002,
          tbt: 0,
          speedIndex: 640,
          ttfb: 95,
          report: null,
        },
      ],
      field: [
        {
          day: LabBatches.DAY,
          scope: 'origin',
          formFactor: 'phone',
          metric: 'LCP',
          p75: 2_350,
          good: 0.79,
          needsImprovement: 0.15,
          poor: 0.06,
        },
      ],
      search: [
        {
          engine: 'google',
          day: '2026-11-06',
          page: 'https://eklund.com.br/',
          query: 'gustavo eklund',
          country: 'bra',
          device: 'mobile',
          clicks: 3,
          impressions: 12,
          position: 1.5,
        },
        {
          engine: 'bing',
          day: '2026-11-06',
          page: '',
          query: '',
          country: '',
          device: '',
          clicks: 1,
          impressions: 4,
          position: null,
        },
      ],
      certificates: [
        {
          day: LabBatches.DAY,
          host: 'eklund.com.br',
          validTo: 1_799_000_000_000,
          issuer: "Let's Encrypt",
          problem: null,
        },
        {
          day: LabBatches.DAY,
          host: 'gustavo.eklund.com.br',
          validTo: null,
          issuer: '',
          problem: 'CERT_HAS_EXPIRED',
        },
      ],
    };
  }

  /** The complete batch with `change` applied to a copy of it. */
  static with(change) {
    const batch = LabBatches.complete();
    change(batch);
    return batch;
  }
}
