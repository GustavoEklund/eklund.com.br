import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentIssues } from '../../edge/src/incident-issues.js';

const REPOSITORY = 'GustavoEklund/eklund.com.br-operations';
const HEADERS = {
  accept: 'application/vnd.github+json',
  authorization: 'Bearer a-token',
  'content-type': 'application/json',
  'user-agent': 'eklund-uptime (+https://github.com/GustavoEklund/eklund.com.br)',
  'x-github-api-version': '2022-11-28',
};
const SINCE = Date.parse('2026-10-29T03:05:00Z');

describe('IncidentIssues', () => {
  let requests;
  let issues;

  /** A fetch that records each request and answers what GitHub would, with `status`. */
  const githubAnswering = (status) => async (url, init) => {
    requests.push([url, init.method, init.headers, JSON.parse(init.body)]);
    return new Response(JSON.stringify({ number: 7 }), { status });
  };

  beforeEach(() => {
    requests = [];
    issues = new IncidentIssues({
      repository: REPOSITORY,
      token: 'a-token',
      fetch: githubAnswering(201),
    });
  });

  it('is on only with both a repository and a token', () => {
    expect([
      issues.enabled,
      new IncidentIssues({ repository: REPOSITORY, token: undefined, fetch }).enabled,
      new IncidentIssues({ repository: '', token: 'a-token', fetch }).enabled,
    ]).toStrictEqual([true, false, false]);
  });

  it('opens an issue that names the page, the problem and the time, and answers its number', async () => {
    const number = await issues.open({
      target: 'https://eklund.com.br/en/',
      problem: 'status 503',
      since: SINCE,
    });
    expect([number, requests]).toStrictEqual([
      7,
      [
        [
          `https://api.github.com/repos/${REPOSITORY}/issues`,
          'POST',
          HEADERS,
          {
            title: 'eklund.com.br/en/ is down',
            body: [
              'Two checks in a row failed, five minutes apart.',
              '',
              '- Page: https://eklund.com.br/en/',
              '- Problem: status 503',
              '- Down since: 2026-10-29T03:05:00.000Z',
              '',
              'The collector checks the site every five minutes and closes this issue when the page answers again.',
            ].join('\n'),
          },
        ],
      ],
    ]);
  });

  it('says how long the page was down, then closes the issue', async () => {
    await issues.close({
      issue: 7,
      target: 'https://gustavo.eklund.com.br/',
      since: SINCE,
      until: SINCE + 25 * 60_000,
    });
    expect(requests).toStrictEqual([
      [
        `https://api.github.com/repos/${REPOSITORY}/issues/7/comments`,
        'POST',
        HEADERS,
        {
          body: 'gustavo.eklund.com.br/ answered again at 2026-10-29T03:30:00.000Z, after 25 minutes down.',
        },
      ],
      [
        `https://api.github.com/repos/${REPOSITORY}/issues/7`,
        'PATCH',
        HEADERS,
        { state: 'closed', state_reason: 'completed' },
      ],
    ]);
  });

  it('fails loudly when GitHub refuses, so the next check tries again', async () => {
    const refused = new IncidentIssues({
      repository: REPOSITORY,
      token: 'a-token',
      fetch: githubAnswering(401),
    });
    await expect(
      refused.open({ target: 'https://eklund.com.br/', problem: 'status 500', since: SINCE }),
    ).rejects.toThrow('GitHub answered 401 to POST issues');
  });
});
