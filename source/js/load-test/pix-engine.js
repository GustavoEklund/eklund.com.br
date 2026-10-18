/**
 * A toy Pix engine: payload validation, idempotency by EndToEndId, a double-entry
 * ledger over 10,000 accounts and a hash-chained journal. The Web Worker shell
 * (pix-engine.worker.js) drives it with warm / tick / done messages.
 */
const ACCOUNT_COUNT = 10000;
const BATCH_SIZE = 1000;
const WARM_UP_MS = 250;
const TICK_BUDGET_MS = 48;
const DUPLICATE_RATE = 0.005;
const SEEN_SET_LIMIT = 300000;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export class PixEngine {
  static ACCOUNT_COUNT = ACCOUNT_COUNT;
  static BATCH_SIZE = BATCH_SIZE;
  static OUTCOMES = Object.freeze({
    ACCEPTED: 'accepted',
    INVALID: 'invalid',
    DUPLICATE: 'duplicate',
    INSUFFICIENT_FUNDS: 'insufficientFunds',
  });

  balances = new Float64Array(ACCOUNT_COUNT).fill(1e6);
  initialTotal;
  seen = new Set();
  chain = FNV_OFFSET;
  journalEntries = 0;
  lastEndToEndId = 'E0';
  counters = { accepted: 0, insufficientFunds: 0, duplicates: 0, invalid: 0, negativeBalances: 0 };
  #seed = 7;
  #sequence = 0;
  #batchesPerTick = 0;

  constructor() {
    for (let index = 0; index < 40; index++) this.balances[(index * 251) % ACCOUNT_COUNT] = 0; // a few empty accounts
    this.initialTotal = this.#totalBalance();
  }

  warmUp() {
    const startedAt = performance.now();
    let batches = 0;
    while (performance.now() - startedAt < WARM_UP_MS) {
      this.runBatch();
      batches++;
    }
    this.#batchesPerTick = (batches / WARM_UP_MS) * TICK_BUDGET_MS;
    this.counters = {
      accepted: 0,
      insufficientFunds: 0,
      duplicates: 0,
      invalid: 0,
      negativeBalances: 0,
    };
    return this.#batchesPerTick;
  }

  /** Runs batches for one tick at `fraction` of the warm-up budget; returns per-batch durations. */
  tick(fraction) {
    const target = Math.max(1, Math.round(this.#batchesPerTick * fraction));
    const durations = new Float32Array(target);
    const startedAt = performance.now();
    let count = 0;
    while (count < target && performance.now() - startedAt < TICK_BUDGET_MS)
      durations[count++] = this.runBatch();
    return durations.subarray(0, count);
  }

  runBatch() {
    const startedAt = performance.now();
    for (let index = 0; index < BATCH_SIZE; index++) this.processPix(this.#sequence++);
    return performance.now() - startedAt;
  }

  processPix(sequence) {
    const from = (this.#random() * ACCOUNT_COUNT) | 0,
      to = (this.#random() * ACCOUNT_COUNT) | 0;
    const amount = Math.round(this.#random() * 50000) / 100;
    const endToEndId =
      this.#random() < DUPLICATE_RATE
        ? this.lastEndToEndId
        : `E${((this.#random() * 1e9) | 0).toString(36)}${sequence.toString(36)}`;
    return this.handle(JSON.stringify({ endToEndId, from, to, amount, timestamp: sequence })); // the toy pacs.008
  }

  /** Validates, de-duplicates and settles one message; returns which of the four outcomes it had. */
  handle(message) {
    const order = JSON.parse(message);
    const counters = this.counters;
    if (!PixEngine.#isValid(order)) {
      counters.invalid++;
      return PixEngine.OUTCOMES.INVALID;
    }
    if (this.seen.has(order.endToEndId)) {
      counters.duplicates++;
      return PixEngine.OUTCOMES.DUPLICATE;
    }
    if (this.seen.size >= SEEN_SET_LIMIT) this.seen = new Set(); // forget the older ids first, so the one being settled is remembered
    this.seen.add(order.endToEndId);
    this.lastEndToEndId = order.endToEndId;
    if (this.balances[order.from] < order.amount) {
      counters.insufficientFunds++;
      return PixEngine.OUTCOMES.INSUFFICIENT_FUNDS;
    }
    this.balances[order.from] -= order.amount;
    this.balances[order.to] += order.amount;
    if (this.balances[order.from] < 0) counters.negativeBalances++;
    this.chain = this.#hash(this.chain, message);
    this.journalEntries++;
    counters.accepted++;
    return PixEngine.OUTCOMES.ACCEPTED;
  }

  report() {
    let minimum = Infinity;
    for (let index = 0; index < ACCOUNT_COUNT; index++)
      if (this.balances[index] < minimum) minimum = this.balances[index];
    return {
      conserved: Math.abs(this.#totalBalance() - this.initialTotal) < 1e-3,
      minimumBalance: minimum,
      journalEntries: this.journalEntries,
      chain: this.chain.toString(16).padStart(8, '0'),
      ...this.counters,
    };
  }

  /** A positive number, a text id, and two different accounts that exist: anything else is not a payment. */
  static #isValid(order) {
    return (
      order !== null &&
      typeof order === 'object' &&
      typeof order.amount === 'number' &&
      order.amount > 0 &&
      typeof order.endToEndId === 'string' &&
      PixEngine.#isAccount(order.from) &&
      PixEngine.#isAccount(order.to) &&
      order.from !== order.to
    );
  }

  static #isAccount(value) {
    return Number.isInteger(value) && value >= 0 && value < ACCOUNT_COUNT;
  }

  #totalBalance() {
    return this.balances.reduce((sum, balance) => sum + balance, 0);
  }

  #random() {
    return (this.#seed = (Math.imul(this.#seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  #hash(hash, text) {
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash;
  }
}
