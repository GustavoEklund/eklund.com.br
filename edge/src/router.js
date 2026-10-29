import { Replies } from './replies.js';

/** What anyone who opens the Worker's address reads: what it is, what it keeps and where its code is. */
const ABOUT = `Este é o coletor de eklund.com.br. Ele recebe medições anônimas do site (como ele carrega, o que quebra e que partes são usadas), não guarda endereço IP nem nada que ligue uma visita a outra, e o código dele é público:
This is the collector of eklund.com.br. It receives anonymous measurements of the site (how it loads, what breaks and which parts are used), stores no IP address and nothing that links one visit to another, and its code is public:
https://github.com/GustavoEklund/eklund.com.br/tree/main/edge
`;

/** Sends each request to what answers it. */
export class Router {
  #origins;
  #collector;

  constructor({ origins, collector }) {
    this.#origins = origins;
    this.#collector = collector;
  }

  async handle(request) {
    const { pathname } = new URL(request.url);
    const { method } = request;
    if (method === 'OPTIONS') {
      const origin = request.headers.get('origin');
      return this.#origins.includes(origin) ? Replies.preflight(origin) : Replies.forbidden();
    }
    switch (pathname) {
      case '/v1/page':
        return method === 'POST'
          ? this.#collector.take(request)
          : Replies.methodNotAllowed('POST, OPTIONS');
      case '/':
        return Router.#read(method, ABOUT);
      case '/robots.txt':
        return Router.#read(method, 'User-agent: *\nDisallow: /\n');
      default:
        return Replies.notFound();
    }
  }

  static #read(method, body) {
    return method === 'GET' || method === 'HEAD'
      ? Replies.text(200, body)
      : Replies.methodNotAllowed('GET, HEAD');
  }
}
