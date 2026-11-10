import { describe, it, expect } from 'vitest';
import { ReadingInputs } from '../../edge/src/reading-inputs.js';

describe('ReadingInputs', () => {
  it('names fourteen readings, each with a description', () => {
    expect([
      ReadingInputs.NAMES,
      ReadingInputs.NAMES.filter((name) => ReadingInputs.TOOLS[name].description.length < 40),
    ]).toStrictEqual([
      [
        'overview',
        'vitals',
        'compare_vitals',
        'events',
        'errors',
        'uptime',
        'lab',
        'compare_lab',
        'lab_change_points',
        'crux',
        'search',
        'certificates',
        'recordings',
        'heat_map',
      ],
      [],
    ]);
  });

  it('accepts a period of up to 400 days, its optional filters, and nothing for the certificates', () => {
    expect([
      ReadingInputs.parse('overview', { from: '2025-10-05', to: '2026-11-09' }),
      ReadingInputs.parse('vitals', {
        from: '2026-11-01',
        to: '2026-11-01',
        page: '/en/',
        device: 'phone',
        version: '1.2.0-rc.1',
      }),
      ReadingInputs.parse('certificates', {}),
    ]).toStrictEqual([
      { ok: true, input: { from: '2025-10-05', to: '2026-11-09' } },
      {
        ok: true,
        input: {
          from: '2026-11-01',
          to: '2026-11-01',
          page: '/en/',
          device: 'phone',
          version: '1.2.0-rc.1',
        },
      },
      { ok: true, input: {} },
    ]);
  });

  it('names each field that is wrong: a day that does not exist, a period backwards or too long, a value off its list', () => {
    expect(
      [
        ['overview', { from: '2026-02-29', to: '2026-03-01' }],
        ['overview', { from: '2026-11-09', to: '2026-11-08' }],
        ['overview', { from: '2025-10-04', to: '2026-11-09' }],
        ['overview', { from: '9 November', to: '2026-11-09' }],
        ['lab', { from: '2026-11-01', to: '2026-11-08', page: '/privacidade/' }],
        ['errors', { from: '2026-11-01', to: '2026-11-08', version: 'latest' }],
        ['compare_lab', { metric: 'lcp', page: '/', form_factor: 'mobile' }],
        ['certificates', { host: 'eklund.com.br' }],
      ].map(([tool, raw]) => ReadingInputs.parse(tool, raw).reason),
    ).toStrictEqual([
      'from: that day does not exist',
      'to: to comes before from',
      'to: a period is at most 400 days long',
      'from: a day is written YYYY-MM-DD',
      'page: Invalid option: expected one of "/"|"/en/"',
      'version: a version is written like 1.2.0',
      [
        'before_from: Invalid input: expected string, received undefined',
        'before_to: Invalid input: expected string, received undefined',
        'after_from: Invalid input: expected string, received undefined',
        'after_to: Invalid input: expected string, received undefined',
      ].join('; '),
      'Unrecognized key: "host"',
    ]);
  });

  it('checks both periods of a comparison', () => {
    expect(
      ReadingInputs.parse('compare_lab', {
        metric: 'score',
        page: '/',
        form_factor: 'desktop',
        before_from: '2026-10-10',
        before_to: '2026-10-01',
        after_from: '2026-10-11',
        after_to: '2026-10-20',
      }),
    ).toStrictEqual({ ok: false, reason: 'before_to: before_to comes before before_from' });
  });

  it('reads the recordings and the heat map of a recorded page, filtered by part and width of the window', () => {
    expect([
      ReadingInputs.parse('recordings', { from: '2026-11-01', to: '2026-11-08', page: '/en/' }),
      ReadingInputs.parse('heat_map', {
        from: '2026-11-01',
        to: '2026-11-08',
        page: '/',
        region: 'contato',
        viewport: '1280-1535',
      }),
      ReadingInputs.parse('recordings', { from: '2026-11-01', to: '2026-11-08', page: '/termos/' })
        .reason,
      ReadingInputs.parse('heat_map', { from: '2026-11-01', to: '2026-11-08', region: 'main' }).ok,
      ReadingInputs.parse('recordings', { from: '2026-11-01', to: '2026-11-08', code: 'x' }).reason,
    ]).toStrictEqual([
      { ok: true, input: { from: '2026-11-01', to: '2026-11-08', page: '/en/' } },
      {
        ok: true,
        input: {
          from: '2026-11-01',
          to: '2026-11-08',
          page: '/',
          region: 'contato',
          viewport: '1280-1535',
        },
      },
      'page: Invalid option: expected one of "/"|"/en/"',
      false,
      'Unrecognized key: "code"',
    ]);
  });
});
