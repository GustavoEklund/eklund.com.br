const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Everything that goes wrong in the page while a test runs: console errors and warnings (CSP violations are logged as errors), uncaught errors, failed and 4xx/5xx requests, requests to other hosts. */
export class PageHealth {
  #console = [];
  #pageErrors = [];
  #failedRequests = [];
  #badResponses = [];
  #thirdPartyRequests = [];

  constructor(page) {
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        this.#console.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => this.#pageErrors.push(error.message));
    page.on('requestfailed', (request) =>
      this.#failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
      ),
    );
    page.on('request', (request) => {
      if (PageHealth.#isThirdParty(request.url()))
        this.#thirdPartyRequests.push(`${request.method()} ${request.url()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        this.#badResponses.push(`${response.status()} ${response.url()}`);
    });
  }

  /** The whole report as one object, so a test compares it to the exact expected value. */
  get problems() {
    return {
      console: [...this.#console],
      pageErrors: [...this.#pageErrors],
      failedRequests: [...this.#failedRequests],
      badResponses: [...this.#badResponses],
      thirdPartyRequests: [...this.#thirdPartyRequests],
    };
  }

  static get NONE() {
    return {
      console: [],
      pageErrors: [],
      failedRequests: [],
      badResponses: [],
      thirdPartyRequests: [],
    };
  }

  /** True for an http(s) request that leaves the machine the tests run on; data:, blob: and about: never do. */
  static #isThirdParty(url) {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'http:' || protocol === 'https:') && !LOCAL_HOSTS.has(hostname);
  }
}
