/** Puts the visitor's saved language where the Locale class looks for it (localStorage), and takes it away afterwards. */
export class LocaleStubs {
  #original = null;
  #storage = new Map();

  install({ saved }) {
    if (saved !== '') this.#storage.set('lang', saved);
    this.#original ??= Object.getOwnPropertyDescriptor(globalThis, 'localStorage') ?? null;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key) => this.#storage.get(key) ?? null,
        setItem: (key, value) => this.#storage.set(key, String(value)),
      },
    });
  }

  get savedChoice() {
    return this.#storage.get('lang') ?? null;
  }

  restore() {
    if (this.#original) Object.defineProperty(globalThis, 'localStorage', this.#original);
    else delete globalThis.localStorage;
    this.#original = null;
    this.#storage.clear();
  }
}
