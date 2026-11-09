// The legal pages (0014): privacy, cookies and terms of use, each written by hand in Portuguese and in English. Their head
// carries the inline script of index.html, byte for byte, so the one hash the Content-Security-Policy names allows it on every
// page. `node tools/i18n-check.mjs --fix-html` copies that script into them, and the check fails while one of them differs.

/** A classic inline script: no src and no type, so the JSON-LD and other data blocks are left out. */
const INLINE_SCRIPT = /(<script(?![^>]*\s(?:src|type)=)[^>]*>)([\s\S]*?)(<\/script>)/;

export class LegalPages {
  /** Each page, by its file under source/, with its language and the file of the same page in the other language. */
  static PAGES = [
    { file: 'privacidade/index.html', language: 'pt-BR', counterpart: 'en/privacy/index.html' },
    { file: 'cookies/index.html', language: 'pt-BR', counterpart: 'en/cookies/index.html' },
    { file: 'termos/index.html', language: 'pt-BR', counterpart: 'en/terms/index.html' },
    { file: 'en/privacy/index.html', language: 'en-US', counterpart: 'privacidade/index.html' },
    { file: 'en/cookies/index.html', language: 'en-US', counterpart: 'cookies/index.html' },
    { file: 'en/terms/index.html', language: 'en-US', counterpart: 'termos/index.html' },
  ];

  /** The address a page is served at: its folder, with the slash at the end. */
  static address(file) {
    return `/${file.replace(/index\.html$/, '')}`;
  }

  /** The code of the first classic inline script of a page, or null when it has none. */
  static headScript(html) {
    return INLINE_SCRIPT.exec(html)?.[2] ?? null;
  }

  /** The page with the code of its first classic inline script replaced by `script`. */
  static withHeadScript(html, script) {
    if (LegalPages.headScript(html) === null) throw new Error('the page has no inline script');
    return html.replace(INLINE_SCRIPT, (_match, open, _code, close) => `${open}${script}${close}`);
  }
}
