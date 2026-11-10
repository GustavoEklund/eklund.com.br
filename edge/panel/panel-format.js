const UNITS = ['B', 'kB', 'MB', 'GB'];

/**
 * How the panel writes numbers: in English, with a comma between thousands, and each metric in its own unit. A missing value
 * is a dash, never zero.
 */
export class PanelFormat {
  static NONE = '-';

  static count(value) {
    if (value === null || value === undefined) return PanelFormat.NONE;
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** A share from 0 to 1, as a percentage with up to `digits` decimals. */
  static share(value, digits = 1) {
    if (value === null || value === undefined) return PanelFormat.NONE;
    return `${Number((value * 100).toFixed(digits))}%`;
  }

  /** A Web Vital or a lab number by its name: CLS and the score have no unit, the others are milliseconds. */
  static metric(name, value) {
    if (value === null || value === undefined) return PanelFormat.NONE;
    if (/^cls$/i.test(name)) return String(Number(value.toFixed(3)));
    if (name === 'score') return String(Math.round(value * 100));
    return `${PanelFormat.count(value)} ms`;
  }

  static bytes(value) {
    let size = value;
    let unit = 0;
    while (size >= 1_000 && unit < UNITS.length - 1) {
      size /= 1_000;
      unit += 1;
    }
    return `${unit === 0 ? size : Number(size.toFixed(1))} ${UNITS[unit]}`;
  }

  /** A duration in milliseconds, as minutes and seconds. */
  static duration(milliseconds) {
    const seconds = Math.round(milliseconds / 1_000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  /** An ISO time, as its day and minute in UTC. */
  static time(iso) {
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  }

  /** A p-value, to three decimals, or below a thousandth. */
  static p(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return PanelFormat.NONE;
    return value < 0.001 ? '< 0.001' : value.toFixed(3);
  }
}
