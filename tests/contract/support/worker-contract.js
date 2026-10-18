import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const SCHEMA_NAMES = [
  'command-warm',
  'command-tick',
  'command-done',
  'reply-warm',
  'reply-tick',
  'reply-done',
];

/** The JSON Schemas of the worker protocol, compiled once, and the one place that validates a message against them. */
export class WorkerContract {
  static #schemas = new Map(
    SCHEMA_NAMES.map((name) => [
      name,
      JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8')),
    ]),
  );
  static #validators = new Map();

  static get names() {
    return [...WorkerContract.#schemas.keys()];
  }

  static schema(name) {
    return WorkerContract.#schemas.get(name);
  }

  /** Schema name for a command message, so each command is validated against its own schema and errors stay specific. */
  static commandSchemaName(message) {
    return `command-${message.command}`;
  }

  /** @returns {{ valid: boolean, errors: object[] | null }} errors is null for a valid message, exactly as Ajv reports it. */
  static validate(name, message) {
    const validate = WorkerContract.#validatorFor(name);
    const valid = validate(WorkerContract.#asJson(message));
    return { valid, errors: validate.errors };
  }

  static #validatorFor(name) {
    if (!WorkerContract.#validators.has(name)) {
      const ajv = new Ajv({ allErrors: true, strict: true });
      WorkerContract.#validators.set(name, ajv.compile(WorkerContract.#schemas.get(name)));
    }
    return WorkerContract.#validators.get(name);
  }

  /** JSON Schema has no typed arrays: a view such as Float32Array is checked as the array of its numbers. */
  static #asJson(message) {
    return Object.fromEntries(
      Object.entries(message).map(([key, value]) => [
        key,
        ArrayBuffer.isView(value) ? Array.from(value) : value,
      ]),
    );
  }
}
