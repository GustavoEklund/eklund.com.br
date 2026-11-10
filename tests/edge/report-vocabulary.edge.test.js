import { describe, it, expect } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { ReportVocabulary } from '../../edge/src/report-vocabulary.js';
import { SiteSource } from '../support/site-source.js';

const repeated = (list) => list.filter((value, index) => list.indexOf(value) !== index);

describe('ReportVocabulary', () => {
  it('lists every value once', () => {
    expect(
      [
        ReportVocabulary.PAGES,
        ReportVocabulary.VIEWPORT_WIDTHS,
        ReportVocabulary.METRICS,
        ReportVocabulary.PALETTE_COMMANDS,
        ReportVocabulary.ERROR_KINDS,
        ReportVocabulary.RECORDED_PAGES,
        ReportVocabulary.REGIONS,
        Object.keys(ReportVocabulary.EVENTS),
        ...Object.values(ReportVocabulary.EVENTS),
      ].flatMap(repeated),
    ).toStrictEqual([]);
  });

  it('keeps attribution fields for each metric, each field of one kind only', () => {
    expect(
      Object.entries(ReportVocabulary.ATTRIBUTION).map(([metric, { text, number, choice }]) => [
        metric,
        repeated([...text, ...number, ...Object.keys(choice)]),
      ]),
    ).toStrictEqual(ReportVocabulary.METRICS.map((metric) => [metric, []]));
  });

  it('names the sections of the page and the commands of its palette, as the site has them', () => {
    const sections = [...SiteSource.read('index.html').matchAll(/<section[^>]*\sid="([^"]+)"/g)]
      .map(([, id]) => id)
      .filter((id) => id !== 'hero');
    expect([ReportVocabulary.SECTIONS, ReportVocabulary.PALETTE_COMMANDS]).toStrictEqual([
      sections,
      Object.keys(PT_BR.palette.commands),
    ]);
  });

  it('records only pages it reports on, and places clicks in every section of the page, the hero included', () => {
    const sections = [
      ...SiteSource.read('index.html').matchAll(/<section[^>]*\sid="([^"]+)"/g),
    ].map(([, id]) => id);
    expect([
      ReportVocabulary.RECORDED_PAGES.every((page) => ReportVocabulary.PAGES.includes(page)),
      ReportVocabulary.REGIONS.filter((region) => sections.includes(region)),
      ReportVocabulary.REGIONS.filter((region) => !sections.includes(region)),
    ]).toStrictEqual([true, sections, ['header', 'footer', 'privacy', 'other']]);
  });
});
