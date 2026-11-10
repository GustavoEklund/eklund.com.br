/**
 * Where a page sends its reports (0009). The site's own hosts send to the collector on workers.dev; a page that the
 * development servers serve over plain HTTP on this machine sends to the one `pnpm run edge:dev` runs, with its local
 * database. Anywhere else (the production build that Lighthouse loads over HTTPS, a copy of the site on another host) the
 * page measures and sends nothing. tools/site-headers.mjs allows the same origins in connect-src.
 */
export class ReportEndpoint {
  static COLLECTOR = 'https://eklund.eklund.workers.dev';
  static LOCAL_COLLECTOR = 'http://127.0.0.1:8787';
  static PATH = '/v1/page';
  static SITE_HOSTS = ['eklund.com.br', 'gustavo.eklund.com.br'];
  static LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

  /** The address reports go to from a page at `location`, or null when it sends them nowhere. */
  static for({ protocol, hostname }) {
    if (protocol === 'https:' && ReportEndpoint.SITE_HOSTS.includes(hostname))
      return `${ReportEndpoint.COLLECTOR}${ReportEndpoint.PATH}`;
    if (protocol === 'http:' && ReportEndpoint.LOCAL_HOSTS.includes(hostname))
      return `${ReportEndpoint.LOCAL_COLLECTOR}${ReportEndpoint.PATH}`;
    return null;
  }
}
