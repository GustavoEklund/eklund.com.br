import { PT_BR } from './locales/pt-br.js';
import { EN_US } from './locales/en-us.js';

/** Every dictionary the site ships, keyed by locale tag. Adding a language means one entry here and one in Locale.SUPPORTED. */
export class Dictionaries {
  static BY_LOCALE = { 'pt-BR': PT_BR, 'en-US': EN_US };
}
