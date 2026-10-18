export class Preferences {
  static read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  static write(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* storage may be unavailable */
    }
  }
}
