// The pages a missing address answers with (0016), in Portuguese and in English, written by hand like the legal pages (0014)
// and carrying the same inline script of the head. In production the .htaccess files name them with ErrorDocument, so Apache
// serves the page and keeps the status 404; tools/serve.mjs and tools/production-server.mjs answer the same way.

export class NotFoundPages {
  /** Each page, by its file under source/, with its language and the file of the page in the other language. */
  static PAGES = [
    { file: '404.html', language: 'pt-BR', counterpart: 'en/404.html' },
    { file: 'en/404.html', language: 'en-US', counterpart: '404.html' },
  ];

  /**
   * The page that answers for a missing address, given the deepest folder of that address that exists, relative to the root
   * of the site with slashes ('' for the root itself). Apache reads the .htaccess of every folder down to that one, so the
   * ErrorDocument of en/.htaccess applies inside an en/ folder and below it, in the copy of a version (1.1.0/en/) too, and
   * the one of the root applies everywhere else.
   */
  static fileFor(folder) {
    return /(?:^|\/)en(?:\/|$)/.test(folder) ? 'en/404.html' : '404.html';
  }
}
