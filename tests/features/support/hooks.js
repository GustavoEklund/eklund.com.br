import { Before, After, AfterAll, Status } from '@cucumber/cucumber';
import { BrowserSession } from './browser-session.js';

After({ tags: '@locale' }, function () {
  this.localeStubs.restore();
});

Before({ tags: '@ui' }, async function () {
  await this.openBrowser({ locale: 'pt-BR' });
});

After({ tags: '@ui' }, async function ({ result }) {
  if (result?.status === Status.FAILED) this.attach(await this.page.screenshot(), 'image/png');
  await this.closeBrowser();
});

AfterAll(async function () {
  await BrowserSession.shutdown();
});
