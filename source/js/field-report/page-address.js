/** The pages that run the site's scripts; the legal pages run none. */
const PAGES = ['/', '/en/'];
/** A release folder in front of a page: /1.1.0/en/ is /en/ of release 1.1.0. */
const RELEASE_FOLDER = /^\/\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?(?=\/)/;

/** The page a report or a recording names: the path of a page that runs the site's scripts, without its release folder. */
export class PageAddress {
  /** The page at `pathname`, or null for an address that is not one of the pages that measure and record. */
  static of(pathname) {
    const page = pathname.replace(RELEASE_FOLDER, '').replace(/index\.html$/, '');
    return PAGES.includes(page) ? page : null;
  }
}
