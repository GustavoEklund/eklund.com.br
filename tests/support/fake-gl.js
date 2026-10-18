/**
 * A WebGL2 context that records every call as [name, ...args] and returns identifiable handles.
 * Enum constants (VERTEX_SHADER, TRIANGLE_STRIP...) are returned as their own names, so the call log reads like the code.
 */
export class FakeGl {
  calls = [];
  #counters = {};
  #returns;

  constructor(overrides = {}) {
    this.#returns = {
      createProgram: () => this.#next('program'),
      createShader: (type) => this.#next(`shader:${type}`),
      createVertexArray: () => this.#next('vao'),
      createBuffer: () => this.#next('buffer'),
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getUniformLocation: (_program, name) => `loc:${name}`,
      getShaderInfoLog: () => 'shader log',
      getProgramInfoLog: () => 'program log',
      ...overrides,
    };
    return new Proxy(this, {
      get: (target, name) => {
        if (name in target) return target[name];
        if (typeof name === 'string' && /^[A-Z][A-Z0-9_]+$/.test(name)) return name;
        return (...args) => {
          target.calls.push([name, ...args]);
          return target.#returns[name]?.(...args);
        };
      },
    });
  }

  callsTo(name) {
    return this.calls.filter(([called]) => called === name);
  }

  #next(kind) {
    this.#counters[kind] = (this.#counters[kind] ?? 0) + 1;
    return `${kind}#${this.#counters[kind]}`;
  }
}
