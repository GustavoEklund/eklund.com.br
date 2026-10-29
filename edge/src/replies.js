/** The Worker's answers: never cached, and readable across origins only by the site's own pages. */
export class Replies {
  static accepted(origin) {
    return new Response(null, { status: 204, headers: Replies.#headers(origin) });
  }

  static refused(origin, reason) {
    return Replies.text(400, `${reason}\n`, origin);
  }

  static forbidden() {
    return Replies.text(403, 'This origin may not send reports here.\n');
  }

  static tooLarge(origin) {
    return Replies.text(413, 'the report is too long\n', origin);
  }

  static notFound() {
    return Replies.text(404, 'Not found\n');
  }

  static methodNotAllowed(allow) {
    return Replies.text(405, 'Method not allowed\n', null, { allow });
  }

  /** A browser asks first before sending anything but a plain-text POST. */
  static preflight(origin) {
    return new Response(null, {
      status: 204,
      headers: {
        ...Replies.#headers(origin),
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }

  static text(status, body, origin = null, extra = {}) {
    return new Response(body, {
      status,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        ...Replies.#headers(origin),
        ...extra,
      },
    });
  }

  static #headers(origin) {
    return {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    };
  }
}
