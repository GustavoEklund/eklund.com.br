/** The response headers an .htaccess file sets, read the way Apache reads `Header` directives. */
export class HtaccessHeaders {
  /** Every `Header [always] set Name "Value"` outside a <FilesMatch>, as a name-to-value object. */
  static global(htaccess) {
    const outsideFilesMatch = htaccess.replace(/<FilesMatch[\s\S]*?<\/FilesMatch>/g, '');
    return HtaccessHeaders.#set(outsideFilesMatch);
  }

  /** The headers set for files whose name matches `pattern` (the text between the quotes of <FilesMatch "…">). */
  static forFilesMatching(htaccess, pattern) {
    const blocks = [...htaccess.matchAll(/<FilesMatch "([^"]+)">([\s\S]*?)<\/FilesMatch>/g)].filter(
      ([, matcher]) => matcher === pattern,
    );
    return HtaccessHeaders.#set(blocks.map(([, , body]) => body).join('\n'));
  }

  static #set(text) {
    const headers = {};
    for (const [, name, value] of text.matchAll(
      /^\s*Header (?:always )?set ([\w-]+) "([^"\n]*)"\s*$/gm,
    ))
      headers[name] = value;
    return headers;
  }
}
