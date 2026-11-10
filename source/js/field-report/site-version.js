/**
 * The release of the site this code belongs to, which every page report carries so one release can be compared with the
 * last. `pnpm run changelog release` writes it with package.json, and a contract test keeps the two equal.
 */
export class SiteVersion {
  static NUMBER = '1.1.0';
}
