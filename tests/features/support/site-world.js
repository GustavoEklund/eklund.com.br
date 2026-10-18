import { World, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber';
import { PixLedger } from './pix-ledger.js';
import { LocaleStubs } from './locale-stubs.js';
import { BrowserSession } from './browser-session.js';

setDefaultTimeout(30_000);

/** What a scenario can hold on to: the Pix ledger for the domain features, the browser page for the UI ones. */
export class SiteWorld extends World {
  ledger = null;
  localeStubs = new LocaleStubs();
  detectedLocale = null;
  context = null;
  page = null;

  async newLedger() {
    this.ledger = await PixLedger.create();
    return this.ledger;
  }

  async openBrowser(options) {
    this.context = await BrowserSession.newContext(options);
    this.page = await this.context.newPage();
  }

  async closeBrowser() {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

setWorldConstructor(SiteWorld);
