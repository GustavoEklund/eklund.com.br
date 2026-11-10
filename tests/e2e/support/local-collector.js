import { gunzipSync } from 'node:zlib';
import { ReportEndpoint } from '../../../source/js/shared/report-endpoint.js';

/**
 * Stands in for the collector while the end-to-end tests run. A page served by the test server sends its reports, the chunks
 * of its recordings and the requests to delete them to the collector of `pnpm run edge:dev` (ReportEndpoint), which is not
 * running: this answers for it, as the Worker does, and keeps what each page sent. A request to the collector online is cut
 * off, so no test ever writes to the real data.
 */
export class LocalCollector {
  /** Every request that reached the stand-in: its method, address, headers and body, as text, and as bytes. */
  requests = [];

  async attach(context) {
    await context.route(`${ReportEndpoint.LOCAL_COLLECTOR}/**`, (route) => this.#take(route));
    await context.route(`${ReportEndpoint.COLLECTOR}/**`, (route) =>
      route.abort('blockedbyclient').catch(() => {}),
    );
  }

  /** The reports pages sent, parsed, in the order they arrived. */
  get reports() {
    return this.#sentTo(ReportEndpoint.PATH).map(({ body }) => JSON.parse(body));
  }

  /** The chunks of recordings pages sent, inflated when they came as gzip, parsed, with how each came. */
  get chunks() {
    return this.#sentTo(ReportEndpoint.RECORDING_PATH).map(({ bytes }) => {
      const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
      return {
        gzip,
        chunk: JSON.parse((gzip ? gunzipSync(bytes) : bytes).toString('utf8')),
      };
    });
  }

  /** The requests to delete recordings, parsed. */
  get deletions() {
    return this.#sentTo(ReportEndpoint.DELETION_PATH).map(({ body }) => JSON.parse(body));
  }

  #sentTo(path) {
    return this.requests.filter(({ method, url }) => method === 'POST' && url.endsWith(path));
  }

  async #take(route) {
    const request = route.request();
    const origin = request.headers().origin ?? '';
    const bytes = request.postDataBuffer() ?? Buffer.alloc(0);
    this.requests.push({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      body: bytes.toString('utf8'),
      bytes,
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
