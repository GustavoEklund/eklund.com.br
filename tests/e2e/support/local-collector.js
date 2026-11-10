import { ReportEndpoint } from '../../../source/js/field-report/report-endpoint.js';

/**
 * Stands in for the collector while the end-to-end tests run. A page served by the test server sends its reports to the
 * collector of `pnpm run edge:dev` (ReportEndpoint), which is not running: this answers for it, as the Worker does, and
 * keeps what each page sent. A request to the collector online is cut off, so no test ever writes to the real data.
 */
export class LocalCollector {
  /** Every request that reached the stand-in: its method, address, headers and body. */
  requests = [];

  async attach(context) {
    await context.route(`${ReportEndpoint.LOCAL_COLLECTOR}/**`, (route) => this.#take(route));
    await context.route(`${ReportEndpoint.COLLECTOR}/**`, (route) =>
      route.abort('blockedbyclient').catch(() => {}),
    );
  }

  /** The reports pages sent, parsed, in the order they arrived. */
  get reports() {
    return this.requests
      .filter(({ method, url }) => method === 'POST' && url.endsWith(ReportEndpoint.PATH))
      .map(({ body }) => JSON.parse(body));
  }

  async #take(route) {
    const request = route.request();
    const origin = request.headers().origin ?? '';
    this.requests.push({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      body: request.postData(),
    });
    // The page may be gone by the time the answer is ready (a report sent as it closes): that is not a failure.
    await route
      .fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'cache-control': 'no-store',
          vary: 'Origin',
        },
      })
      .catch(() => {});
  }
}
