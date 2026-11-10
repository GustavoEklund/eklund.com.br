import { Dom } from '../shared/dom.js';

/** The query that opens the preferences on load: the legal pages link /?preferencias and /en/?preferences. */
const REQUESTS = ['preferencias', 'preferences'];

/**
 * The second layer of the privacy notice (0010), a modal dialog: the site's preferences (always on), anonymous measurement (on,
 * by legitimate interest) and recording with the heat map (off until consented), with buttons to save the choice, accept
 * all, refuse all and delete my recordings. With Global Privacy Control, the browser has refused everything: the switches and
 * the buttons that would allow something are disabled, and a note says why.
 */
export class PrivacyDialog {
  /** What the preferences use where the browser holds no recordings: none to delete. */
  static NO_RECORDINGS = Object.freeze({ held: () => false, deleteAll: () => Promise.resolve() });

  #dialog;
  #choice;
  #translator;
  #announce;
  #recordings;
  #focusAfter;
  #openLinks;
  #measurement;
  #recording;
  #signal;
  #save;
  #accept;
  #delete;
  #held;

  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {import('./privacy-choice.js').PrivacyChoice} options.choice
   * @param {{ t: Function }} options.translator
   * @param {(message: string) => void} options.announce says something through the live region
   * @param {{ held: () => boolean, deleteAll: () => Promise<void> }} [options.recordings] the codes of this browser's
   *   recordings: whether it keeps any, and the request that deletes them, which rejects when it fails
   * @param {HTMLElement} options.focusAfter takes the focus on close when what opened the dialog is gone
   * @param {HTMLAnchorElement[]} [options.openLinks] links that open the dialog on a plain click
   */
  constructor({
    dialog,
    choice,
    translator,
    announce,
    recordings = PrivacyDialog.NO_RECORDINGS,
    focusAfter,
    openLinks = [],
  }) {
    this.#dialog = dialog;
    this.#choice = choice;
    this.#translator = translator;
    this.#announce = announce;
    this.#recordings = recordings;
    this.#focusAfter = focusAfter;
    this.#openLinks = openLinks;
  }

  /** Whether an address asks for the preferences: ?preferencias or ?preferences. */
  static requested(search) {
    const query = new URLSearchParams(search);
    return REQUESTS.some((name) => query.has(name));
  }

  /** The same address without the request for the preferences, so a reload does not open them again. */
  static withoutRequest(address) {
    const url = new URL(address);
    for (const name of REQUESTS) url.searchParams.delete(name);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  mount() {
    this.#measurement = Dom.require('#privacy-measurement', this.#dialog);
    this.#recording = Dom.require('#privacy-recording', this.#dialog);
    this.#signal = Dom.require('#privacy-signal', this.#dialog);
    this.#save = Dom.require('[data-privacy-action="save"]', this.#dialog);
    this.#accept = Dom.require('[data-privacy-action="accept"]', this.#dialog);
    this.#delete = Dom.require('#privacy-delete', this.#dialog);
    this.#held = Dom.require('#privacy-no-recordings', this.#dialog);
    this.#dialog.addEventListener('click', (event) => this.#onClick(event));
    this.#dialog.addEventListener('close', () => this.#handFocusOn());
    for (const link of this.#openLinks)
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        this.open();
      });
    this.#choice.onChange(() => this.#sync());
    return this;
  }

  open() {
    this.#sync();
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  get isOpen() {
    return this.#dialog.open;
  }

  close() {
    this.#dialog.close();
  }

  /** Shows the saved choice, or what refusing through Global Privacy Control leaves. */
  #sync() {
    const signal = this.#choice.globalPrivacyControl;
    this.#measurement.checked = this.#choice.measurementAllowed;
    this.#recording.checked = this.#choice.recordingAllowed;
    for (const control of [this.#measurement, this.#recording, this.#save, this.#accept])
      control.disabled = signal;
    this.#signal.hidden = !signal;
    const held = this.#recordings.held();
    this.#delete.disabled = !held;
    const note = held ? 'privacy.dialog.heldRecordings' : 'privacy.dialog.noRecordings';
    this.#held.dataset.i18n = note;
    this.#held.textContent = this.#translator.t(note);
  }

  #onClick(event) {
    if (event.target === this.#dialog || event.target.closest('#privacy-close')) {
      this.close();
      return;
    }
    if (event.target.closest('#privacy-delete')) {
      this.#deleteRecordings();
      return;
    }
    const action = event.target.closest('[data-privacy-action]')?.dataset.privacyAction;
    if (action === 'save')
      this.#choice.save({
        measurement: this.#measurement.checked,
        recording: this.#recording.checked,
      });
    else if (action === 'accept') this.#choice.acceptAll();
    else if (action === 'refuse') this.#choice.refuseAll();
    else return;
    this.close();
    this.#announce(this.#translator.t('privacy.dialog.saved'));
  }

  /** Deletes them, and says whether it worked; the button is off while the request is on its way. */
  async #deleteRecordings() {
    this.#delete.disabled = true;
    let outcome = 'privacy.dialog.deleted';
    try {
      await this.#recordings.deleteAll();
    } catch {
      outcome = 'privacy.dialog.deleteFailed';
    }
    this.#sync();
    this.#announce(this.#translator.t(outcome));
  }

  /**
   * The browser gives the focus back to what opened the dialog. When that is gone, such as the "Choose" button of a notice
   * that closed with the choice, or the command palette, the focus stays on the closed dialog or falls to the body, and
   * goes to `focusAfter` instead, without scrolling the page.
   */
  #handFocusOn() {
    const focused = this.#dialog.ownerDocument.activeElement;
    if (
      focused === null ||
      focused === this.#dialog.ownerDocument.body ||
      this.#dialog.contains(focused) ||
      !focused.checkVisibility()
    )
      this.#focusAfter.focus({ preventScroll: true });
  }
}
