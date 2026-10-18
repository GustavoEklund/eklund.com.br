import { SiteSource } from './site-source.js';

/** One PixEngine plus what the scenarios need to look at it: balances before and after, the outcome of the last message, and the chain. */
export class PixLedger {
  engine;
  outcomes;
  lastOutcome = null;
  balancesBefore = null;
  chainBefore = null;
  openingTotalInCents;

  static async create() {
    const { PixEngine } = await SiteSource.load('js/load-test/pix-engine.js');
    return new PixLedger(new PixEngine(), PixEngine.OUTCOMES);
  }

  constructor(engine, outcomes) {
    this.engine = engine;
    this.outcomes = outcomes;
    this.openingTotalInCents = this.totalInCents();
  }

  /** Message in the exact shape the engine hashes: endToEndId, from, to, amount, timestamp. */
  static message({ endToEndId, from, to, amount, timestamp = 1 }) {
    return JSON.stringify({ endToEndId, from, to, amount, timestamp });
  }

  send(message) {
    this.balancesBefore = Float64Array.from(this.engine.balances);
    this.chainBefore = this.report().chain;
    this.lastOutcome = this.engine.handle(message);
    return this.lastOutcome;
  }

  pay({ from, to, amount, endToEndId }) {
    return this.send(PixLedger.message({ endToEndId, from, to, amount }));
  }

  balance(account) {
    return this.engine.balances[account];
  }

  report() {
    return this.engine.report();
  }

  /** Whole cents, so a sum of doubles can be compared exactly. */
  totalInCents() {
    return Math.round(this.engine.balances.reduce((sum, balance) => sum + balance, 0) * 100);
  }

  accountsInTheRed() {
    return this.engine.balances.filter((balance) => balance < 0).length;
  }

  runBatches(count) {
    for (let batch = 0; batch < count; batch++) this.engine.runBatch();
  }
}
