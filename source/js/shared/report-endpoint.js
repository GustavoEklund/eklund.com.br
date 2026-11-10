/**
 * Where a page sends what it reports about itself (0009): the anonymous measurement to PATH, the chunks of a session recording
 * to RECORDING_PATH and the codes of the recordings to delete to DELETION_PATH (0010). The site's own hosts send to the
 * collector on workers.dev; a page that the development servers serve over plain HTTP on this machine sends to the one
 * `pnpm run edge:dev` runs, with its local database. Anywhere else (the production build that Lighthouse loads over HTTPS,
 * a copy of the site on another host) the page sends nothing. tools/site-headers.mjs allows the same origins in connect-src.
 */
export class ReportEndpoint {
  static COLLECTOR = 'https://eklund.eklund.workers.dev';
  static LOCAL_COLLECTOR = 'http://127.0.0.1:8787';
  static PATH = '/v1/page';
  static RECORDING_PATH = '/v1/session';
  static DELETION_PATH = '/v1/session/delete';
  static SITE_HOSTS = ['eklund.com.br', 'gustavo.eklund.com.br'];
  static LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

  /** The address `path` has for a page at `location`, or null when that page sends nothing. */
  static for({ protocol, hostname }, path = ReportEndpoint.PATH) {
    if (protocol === 'https:' && ReportEndpoint.SITE_HOSTS.includes(hostname))
      return `${ReportEndpoint.COLLECTOR}${path}`;
    if (protocol === 'http:' && ReportEndpoint.LOCAL_HOSTS.includes(hostname))
      return `${ReportEndpoint.LOCAL_COLLECTOR}${path}`;
    return null;
  }
}
