import assert from 'node:assert/strict';
import { When, Then } from '@cucumber/cucumber';
import { SiteSource } from '../../support/site-source.js';

const { RampScenario } = await SiteSource.load('js/load-test/ramp-scenario.js');

Then('a rampa dura {int} segundos', function (seconds) {
  assert.strictEqual(RampScenario.totalSeconds, seconds);
});

Then('a rampa tem os estágios:', function (table) {
  const stages = table.hashes().map((row) => [Number(row.duração), Number(row.alvo)]);
  assert.deepStrictEqual(RampScenario.STAGES, stages);
});

When('se passam {decimal} segundos de teste', function (seconds) {
  this.elapsedSeconds = seconds;
});

Then('a carga está em {decimal}% do pico', function (percent) {
  assert.strictEqual(RampScenario.fractionAt(this.elapsedSeconds), percent / 100);
});
