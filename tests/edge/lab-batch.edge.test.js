import { describe, it, expect } from 'vitest';
import { LabBatch } from '../../edge/src/lab-batch.js';
import { LabBatches } from '../support/lab-batches.js';

const parse = (batch) => LabBatch.parse(JSON.stringify(batch));
const reasonFor = (change) => parse(LabBatches.with(change)).reason;

describe('LabBatch.parse', () => {
  it('reads a complete batch into the lists the store writes, without the version', () => {
    const { v, ...lists } = LabBatches.complete();
    expect([v, parse(LabBatches.complete())]).toStrictEqual([1, { ok: true, batch: lists }]);
  });

  it('reads a night with nothing to say: every list empty', () => {
    expect(parse({ v: 1, runs: [], field: [], search: [], certificates: [] })).toStrictEqual({
      ok: true,
      batch: { runs: [], field: [], search: [], certificates: [] },
    });
  });

  it('refuses what is not a batch of version 1, with its lists and nothing else', () => {
    expect([
      LabBatch.parse('{'),
      LabBatch.parse(' '.repeat(LabBatch.LIMITS.characters + 1)),
      parse([]),
      reasonFor((batch) => (batch.v = 2)),
      reasonFor((batch) => delete batch.certificates),
      reasonFor((batch) => (batch.visits = [])),
      reasonFor((batch) => (batch.search = {})),
      reasonFor((batch) => (batch.search = Array(501).fill(batch.search[0]))),
    ]).toStrictEqual([
      { ok: false, reason: 'the batch is not JSON' },
      { ok: false, reason: 'the batch is too long' },
      { ok: false, reason: 'the batch is not an object' },
      'v is not a version this collector reads',
      'the batch has no certificates',
      'the batch has an unknown field, visits',
      'search is not a list',
      'search has more than 500 items',
    ]);
  });

  it('refuses a run with a page, a form factor or a number outside the contract', () => {
    expect([
      reasonFor((batch) => (batch.runs[0].page = '/1.2.0/')),
      reasonFor((batch) => (batch.runs[0].formFactor = 'tablet')),
      reasonFor((batch) => (batch.runs[0].day = '2026-13-01')),
      reasonFor((batch) => (batch.runs[0].run = 10)),
      reasonFor((batch) => (batch.runs[0].score = 81)),
      reasonFor((batch) => (batch.runs[0].lcp = -1)),
      reasonFor((batch) => (batch.runs[0].cls = Number.MAX_VALUE)),
      reasonFor((batch) => (batch.runs[0].median = 'yes')),
      reasonFor((batch) => (batch.runs[0].lighthouse = '12.0')),
    ]).toStrictEqual([
      'runs[0].page is not one of the allowed values',
      'runs[0].formFactor is not one of the allowed values',
      'runs[0].day does not have the expected form',
      'runs[0].run is not a whole number between 0 and 9',
      'runs[0].score is not a number between 0 and 1',
      'runs[0].lcp is not a number between 0 and 600000',
      'runs[0].cls is not a number between 0 and 100',
      'runs[0].median is not true or false',
      'runs[0] has an unknown field, lighthouse',
    ]);
  });

  it('keeps a report key for the median run alone, in the form of the R2 keys', () => {
    expect([
      reasonFor((batch) => (batch.runs[0].report = null)),
      reasonFor((batch) => (batch.runs[1].report = `${LabBatches.DAY}/en-desktop.json`)),
      reasonFor((batch) => (batch.runs[0].report = '../secrets.json')),
      reasonFor((batch) => (batch.runs[0].report = `${LabBatches.DAY}/home-mobile.html`)),
    ]).toStrictEqual([
      'runs[0].report is kept for the median run, and only for it',
      'runs[1].report is kept for the median run, and only for it',
      'runs[0].report does not have the expected form',
      'runs[0].report does not have the expected form',
    ]);
  });

  it('refuses a CrUX reading of another scope or metric, or with a share above one', () => {
    expect([
      reasonFor((batch) => (batch.field[0].scope = 'https://eklund.com.br/')),
      reasonFor((batch) => (batch.field[0].formFactor = 'mobile')),
      reasonFor((batch) => (batch.field[0].metric = 'FID')),
      reasonFor((batch) => (batch.field[0].good = 1.5)),
      reasonFor((batch) => (batch.field[0].p75 = 600_001)),
    ]).toStrictEqual([
      'field[0].scope is not one of the allowed values',
      'field[0].formFactor is not one of the allowed values',
      'field[0].metric is not one of the allowed values',
      'field[0].good is not a number between 0 and 1',
      'field[0].p75 is not a number between 0 and 600000',
    ]);
  });

  it('allows the shift of a CrUX layout reading only up to the limit of a shift', () => {
    expect([
      parse(LabBatches.with((batch) => Object.assign(batch.field[0], { metric: 'CLS', p75: 0.05 })))
        .ok,
      reasonFor((batch) => Object.assign(batch.field[0], { metric: 'CLS', p75: 101 })),
    ]).toStrictEqual([true, 'field[0].p75 is not a number between 0 and 100']);
  });

  it('refuses a search row of another engine or site, or with a control character or a bad count', () => {
    expect([
      reasonFor((batch) => (batch.search[0].engine = 'duckduckgo')),
      reasonFor((batch) => (batch.search[0].page = 'https://example.com/')),
      reasonFor((batch) => (batch.search[0].page = 'https://eklund.com.br/a b')),
      reasonFor((batch) => (batch.search[0].query = 'line\nbreak')),
      reasonFor((batch) => (batch.search[0].query = 'q'.repeat(201))),
      reasonFor((batch) => (batch.search[0].country = 'BR')),
      reasonFor((batch) => (batch.search[0].device = 'watch')),
      reasonFor((batch) => (batch.search[0].clicks = 1.5)),
      reasonFor((batch) => (batch.search[0].position = -1)),
    ]).toStrictEqual([
      'search[0].engine is not one of the allowed values',
      'search[0].page does not have the expected form',
      'search[0].page does not have the expected form',
      'search[0].query does not have the expected form',
      'search[0].query does not have the expected form',
      'search[0].country does not have the expected form',
      'search[0].device is not one of the allowed values',
      'search[0].clicks is not a whole number between 0 and 1000000000',
      'search[0].position is not a number between 0 and 1000',
    ]);
  });

  it('reads a query in any script, and a page of the mirror', () => {
    const batch = LabBatches.with((change) =>
      Object.assign(change.search[0], {
        query: 'engenheiro de software são paulo 東京',
        page: 'https://gustavo.eklund.com.br/en/',
      }),
    );
    expect(parse(batch).batch.search[0]).toStrictEqual(batch.search[0]);
  });

  it('refuses a certificate of another host or with a date past 2100', () => {
    expect([
      reasonFor((batch) => (batch.certificates[0].host = 'www.eklund.com.br')),
      reasonFor((batch) => (batch.certificates[0].validTo = 4_102_444_800_001)),
      reasonFor((batch) => (batch.certificates[0].issuer = 7)),
    ]).toStrictEqual([
      'certificates[0].host is not one of the allowed values',
      'certificates[0].validTo is not a whole number between 0 and 4102444800000',
      'certificates[0].issuer does not have the expected form',
    ]);
  });

  it('takes a certificate with an expiry or with the problem that refused it, never both or neither', () => {
    expect([
      reasonFor((batch) => (batch.certificates[0].problem = 'CERT_HAS_EXPIRED')),
      reasonFor((batch) => (batch.certificates[1].problem = null)),
      reasonFor((batch) => (batch.certificates[1].problem = 'certificate has expired')),
      reasonFor((batch) => delete batch.certificates[1].problem),
    ]).toStrictEqual([
      'certificates[0] has an expiry or a problem, never both and never neither',
      'certificates[1] has an expiry or a problem, never both and never neither',
      'certificates[1].problem does not have the expected form',
      'certificates[1] has no problem',
    ]);
  });
});
