import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import fc from 'fast-check';
import { LabBatch } from '../../edge/src/lab-batch.js';
import { LabBatches } from '../support/lab-batches.js';

const SCHEMA = JSON.parse(
  readFileSync(new URL('./schemas/lab-batch.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(SCHEMA);
/** [what the schema says, what the collector says] about one batch. */
const verdicts = (batch) => [validate(batch), LabBatch.parse(JSON.stringify(batch)).ok];
const itemsOf = (list) => SCHEMA.properties[list].items.properties;
const { WORDS, LIMITS } = LabBatch;

const DAYS = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2099-12-31'), noInvalidDate: true })
  .map((date) => date.toISOString().slice(0, 10));
const TIMES = fc.double({ min: 0, max: LIMITS.milliseconds, noNaN: true });
const SHARES = fc.double({ min: 0, max: 1, noNaN: true });

/** Batches the schema allows, built only from the closed lists and the limits of the contract. */
const BATCHES = fc.record({
  v: fc.constant(1),
  runs: fc.array(
    fc
      .record({
        day: DAYS,
        page: fc.constantFrom(...WORDS.PAGES),
        formFactor: fc.constantFrom(...WORDS.FORM_FACTORS),
        run: fc.nat(LIMITS.run),
        median: fc.boolean(),
        score: SHARES,
        lcp: TIMES,
        fcp: TIMES,
        cls: fc.double({ min: 0, max: LIMITS.shift, noNaN: true }),
        tbt: TIMES,
        speedIndex: TIMES,
        ttfb: TIMES,
      })
      .map((run) => ({
        ...run,
        report: run.median
          ? `${run.day}/${run.page === '/' ? 'home' : 'en'}-${run.formFactor}.json`
          : null,
      })),
    { maxLength: 10 },
  ),
  field: fc.array(
    fc.record({
      day: DAYS,
      scope: fc.constantFrom(...WORDS.SCOPES),
      formFactor: fc.constantFrom(...WORDS.FIELD_FORM_FACTORS),
      metric: fc.constantFrom(...WORDS.FIELD_METRICS),
      p75: fc.double({ min: 0, max: LIMITS.shift, noNaN: true }),
      good: SHARES,
      needsImprovement: SHARES,
      poor: SHARES,
    }),
    { maxLength: 10 },
  ),
  search: fc.array(
    fc.record({
      engine: fc.constantFrom(...WORDS.ENGINES),
      day: DAYS,
      page: fc.constantFrom('', 'https://eklund.com.br/', 'https://gustavo.eklund.com.br/en/'),
      query: fc.string({ maxLength: 60 }).filter((text) => !/\p{Cc}/u.test(text)),
      country: fc.constantFrom('', 'bra', 'usa', 'prt'),
      device: fc.constantFrom(...WORDS.DEVICES),
      clicks: fc.nat(LIMITS.count),
      impressions: fc.nat(LIMITS.count),
      position: fc.option(fc.double({ min: 0, max: LIMITS.position, noNaN: true }), {
        nil: null,
      }),
    }),
    { maxLength: 20 },
  ),
  certificates: fc.array(
    fc
      .record({
        day: DAYS,
        host: fc.constantFrom(...WORDS.HOSTS),
        validTo: fc.nat(LIMITS.validTo),
        issuer: fc.string({ maxLength: 40 }).filter((text) => !/\p{Cc}/u.test(text)),
        problem: fc.option(
          fc.constantFrom(
            'CERT_HAS_EXPIRED',
            'DEPTH_ZERO_SELF_SIGNED_CERT',
            'ERR_TLS_CERT_ALTNAME_INVALID',
          ),
          { nil: null },
        ),
      })
      .map((certificate) =>
        certificate.problem ? { ...certificate, validTo: null, issuer: '' } : certificate,
      ),
    { maxLength: 2 },
  ),
});

describe('the lab batch contract, against the collector that reads it', () => {
  it('has the closed lists and the limits of the collector, value for value', () => {
    expect([
      itemsOf('runs').page.enum,
      itemsOf('runs').formFactor.enum,
      itemsOf('field').scope.enum,
      itemsOf('field').formFactor.enum,
      itemsOf('field').metric.enum,
      itemsOf('search').engine.enum,
      itemsOf('search').device.enum,
      itemsOf('certificates').host.enum,
      ['runs', 'field', 'search', 'certificates'].map((list) => SCHEMA.properties[list].maxItems),
      itemsOf('runs').report.pattern,
    ]).toStrictEqual([
      WORDS.PAGES,
      WORDS.FORM_FACTORS,
      WORDS.SCOPES,
      WORDS.FIELD_FORM_FACTORS,
      WORDS.FIELD_METRICS,
      WORDS.ENGINES,
      WORDS.DEVICES,
      WORDS.HOSTS,
      [LIMITS.runs, LIMITS.field, LIMITS.search, LIMITS.certificates],
      LabBatch.REPORT.source,
    ]);
  });

  it('allows the complete batch, and so does the collector', () => {
    expect(verdicts(LabBatches.complete())).toStrictEqual([true, true]);
  });

  it('refuses, with the collector, every batch outside the contract', () => {
    const outside = [
      (batch) => (batch.v = 2),
      (batch) => (batch.visitors = []),
      (batch) => delete batch.field,
      (batch) => (batch.runs[0].page = '/admin/'),
      (batch) => (batch.runs[0].score = 1.5),
      (batch) => (batch.runs[0].report = null),
      (batch) => (batch.runs[1].report = `${LabBatches.DAY}/en-desktop.json`),
      (batch) => (batch.field[0].metric = 'FID'),
      (batch) => Object.assign(batch.field[0], { metric: 'CLS', p75: 150 }),
      (batch) => (batch.search[0].page = 'https://example.com/'),
      (batch) => (batch.search[0].query = 'one\ntwo'),
      (batch) => (batch.search[0].country = 'BRA'),
      (batch) => (batch.search[0].ip = '203.0.113.7'),
      (batch) => (batch.certificates[0].host = 'example.com'),
      (batch) => (batch.certificates[0].problem = 'CERT_HAS_EXPIRED'),
      (batch) => (batch.certificates[1].validTo = 1_799_000_000_000),
      (batch) => (batch.certificates[1].problem = null),
      (batch) => (batch.certificates[1].problem = 'expired!'),
      (batch) => (batch.certificates = Array(11).fill(batch.certificates[0])),
    ].map((change) => verdicts(LabBatches.with(change)));
    expect(outside).toStrictEqual(outside.map(() => [false, false]));
  });

  it('agrees with the collector on any batch built from the closed lists', () => {
    fc.assert(
      fc.property(BATCHES, (batch) => {
        expect(verdicts(batch)).toStrictEqual([true, true]);
      }),
      { numRuns: 300 },
    );
  });
});
