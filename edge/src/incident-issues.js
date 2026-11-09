/**
 * Tells the owner about an outage through an issue in the private operations repository, which GitHub sends by e-mail and to
 * the app. Without a repository and a token, it stays silent and the checks are only stored.
 */
export class IncidentIssues {
  #repository;
  #token;
  #fetch;

  constructor({ repository, token, fetch }) {
    this.#repository = repository;
    this.#token = token;
    this.#fetch = fetch;
  }

  get enabled() {
    return Boolean(this.#repository && this.#token);
  }

  /** Opens the issue of an outage and answers its number. */
  async open({ target, problem, since }) {
    const issue = await this.#request('POST', 'issues', {
      title: `${IncidentIssues.#name(target)} is down`,
      body: [
        'Two checks in a row failed, five minutes apart.',
        '',
        `- Page: ${target}`,
        `- Problem: ${problem}`,
        `- Down since: ${new Date(since).toISOString()}`,
        '',
        'The collector checks the site every five minutes and closes this issue when the page answers again.',
      ].join('\n'),
    });
    return issue.number;
  }

  /** Says when the page came back and how long it was down, and closes the issue. */
  async close({ issue, target, since, until }) {
    const minutes = Math.round((until - since) / 60_000);
    await this.#request('POST', `issues/${issue}/comments`, {
      body: `${IncidentIssues.#name(target)} answered again at ${new Date(until).toISOString()}, after ${minutes} minutes down.`,
    });
    await this.#request('PATCH', `issues/${issue}`, { state: 'closed', state_reason: 'completed' });
  }

  async #request(method, path, body) {
    const response = await this.#fetch(`https://api.github.com/repos/${this.#repository}/${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json',
        'user-agent': 'eklund-uptime (+https://github.com/GustavoEklund/eklund.com.br)',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${method} ${path}`);
    return response.json();
  }

  /** A page by its host and path, the way it reads in a title: eklund.com.br/en/. */
  static #name(target) {
    const { host, pathname } = new URL(target);
    return `${host}${pathname}`;
  }
}
