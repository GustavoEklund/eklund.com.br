import { describe, it, expect } from 'vitest';
import { ReportEndpoint } from '@site/js/shared/report-endpoint.js';

const at = (address) => ReportEndpoint.for(new URL(address));

describe('ReportEndpoint', () => {
  it('sends from the site and from its mirror to the collector on workers.dev, from every release folder', () => {
    expect([
      at('https://eklund.com.br/'),
      at('https://eklund.com.br/1.1.0/en/'),
      at('https://gustavo.eklund.com.br/en/'),
    ]).toStrictEqual([
      'https://eklund.eklund.workers.dev/v1/page',
      'https://eklund.eklund.workers.dev/v1/page',
      'https://eklund.eklund.workers.dev/v1/page',
    ]);
  });

  it('sends from the development servers on this machine to the collector of edge:dev', () => {
    expect([
      at('http://127.0.0.1:8734/'),
      at('http://127.0.0.1:8735/en/'),
      at('http://localhost:8737/'),
    ]).toStrictEqual([
      'http://127.0.0.1:8787/v1/page',
      'http://127.0.0.1:8787/v1/page',
      'http://127.0.0.1:8787/v1/page',
    ]);
  });

  it('sends nowhere from anywhere else: the build Lighthouse loads over HTTPS, another host, the site over plain HTTP', () => {
    expect([
      at('https://127.0.0.1:8738/'),
      at('https://eklund-com-br.example.net/'),
      at('http://eklund.com.br/'),
      at('https://www.eklund.com.br/'),
    ]).toStrictEqual([null, null, null, null]);
  });

  it('gives the same origins the paths of a recording: its chunks and the request to delete recordings', () => {
    const paths = [ReportEndpoint.RECORDING_PATH, ReportEndpoint.DELETION_PATH];
    expect(
      ['https://eklund.com.br/en/', 'http://127.0.0.1:8737/', 'https://127.0.0.1:8738/'].map(
        (address) => paths.map((path) => ReportEndpoint.for(new URL(address), path)),
      ),
    ).toStrictEqual([
      [
        'https://eklund.eklund.workers.dev/v1/session',
        'https://eklund.eklund.workers.dev/v1/session/delete',
      ],
      ['http://127.0.0.1:8787/v1/session', 'http://127.0.0.1:8787/v1/session/delete'],
      [null, null],
    ]);
  });
});
