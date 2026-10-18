import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { PixLedger } from '../../support/pix-ledger.js';

const COUNTER_COLUMNS = {
  aceitos: 'accepted',
  'sem saldo': 'insufficientFunds',
  duplicados: 'duplicates',
  inválidos: 'invalid',
};

class Counters {
  static ofReport(report) {
    return {
      accepted: report.accepted,
      insufficientFunds: report.insufficientFunds,
      duplicates: report.duplicates,
      invalid: report.invalid,
    };
  }

  static ofTable(table) {
    const row = table.hashes()[0];
    return Object.fromEntries(
      Object.entries(COUNTER_COLUMNS).map(([column, counter]) => [counter, Number(row[column])]),
    );
  }

  static total(report) {
    return Object.values(Counters.ofReport(report)).reduce((sum, value) => sum + value, 0);
  }
}

Given('um motor Pix novo', async function () {
  await this.newLedger();
});

Given('que a conta {int} está sem saldo', function (account) {
  assert.strictEqual(this.ledger.balance(account), 0);
});

When(
  'a conta {int} paga {reais} para a conta {int} com o EndToEndId {string}',
  function (from, amount, to, endToEndId) {
    this.ledger.pay({ from, to, amount, endToEndId });
  },
);

When(/^chega a mensagem (\{.*\})$/, function (message) {
  this.ledger.send(message);
});

When('o motor processa {int} lote(s) de mil pagamentos', function (batches) {
  this.ledger.runBatches(batches);
});

When('o motor processa {int} pagamentos com EndToEndIds distintos', function (count) {
  for (let index = 0; index < count; index++)
    this.ledger.engine.handle(
      PixLedger.message({
        endToEndId: `S${index}`,
        from: 1,
        to: 2,
        amount: 0.25,
        timestamp: index,
      }),
    );
});

When('um motor novo recebe as mensagens, nesta ordem:', async function (table) {
  await this.newLedger();
  for (const [message] of table.raw()) this.ledger.send(message);
});

Then('o pagamento é {desfecho}', function (outcome) {
  assert.strictEqual(this.ledger.lastOutcome, outcome);
});

Then('o pagamento com o EndToEndId {string} é {desfecho}', function (endToEndId, outcome) {
  assert.strictEqual(this.ledger.pay({ from: 1, to: 2, amount: 0.25, endToEndId }), outcome);
});

Then('a conta {int} fica com {reais}', function (account, expected) {
  assert.strictEqual(this.ledger.balance(account), expected);
});

Then('nenhum saldo mudou', function () {
  const changed = [];
  this.ledger.engine.balances.forEach((balance, account) => {
    if (balance !== this.ledger.balancesBefore[account]) changed.push(account);
  });
  assert.deepStrictEqual(changed, []);
});

Then('o dinheiro total no motor continua o mesmo', function () {
  assert.strictEqual(this.ledger.totalInCents(), this.ledger.openingTotalInCents);
});

Then('o diário tem {int} lançamento(s)', function (entries) {
  assert.strictEqual(this.ledger.report().journalEntries, entries);
});

Then('a cadeia do diário vale {string}', function (chain) {
  assert.strictEqual(this.ledger.report().chain, chain);
});

Then(/^o relatório conta (\d+) (?:mensagem|mensagens) inválidas?$/, function (count) {
  assert.strictEqual(this.ledger.report().invalid, Number(count));
});

Then(/^o relatório conta (\d+) (?:mensagem|mensagens) duplicadas?$/, function (count) {
  assert.strictEqual(this.ledger.report().duplicates, Number(count));
});

Then(/^o relatório conta (\d+) pagamentos? sem saldo$/, function (count) {
  assert.strictEqual(this.ledger.report().insufficientFunds, Number(count));
});

Then('o relatório confirma a conservação', function () {
  assert.strictEqual(this.ledger.report().conserved, true);
});

Then('nenhuma conta ficou negativa', function () {
  const report = this.ledger.report();
  assert.strictEqual(this.ledger.accountsInTheRed(), 0);
  assert.strictEqual(report.negativeBalances, 0);
  assert.strictEqual(
    report.minimumBalance,
    this.ledger.engine.balances.reduce((lowest, balance) => Math.min(lowest, balance), Infinity),
  );
});

Then('o relatório tem os contadores:', function (table) {
  assert.deepStrictEqual(Counters.ofReport(this.ledger.report()), Counters.ofTable(table));
});

Then('o relatório soma {int} desfechos', function (total) {
  assert.strictEqual(Counters.total(this.ledger.report()), total);
});
