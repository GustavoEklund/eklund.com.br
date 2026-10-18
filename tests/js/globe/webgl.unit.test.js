import { describe, it, expect } from 'vitest';
import { WebGlProgram, VertexArray } from '@site/js/globe/webgl.js';
import { FakeGl } from '../../support/fake-gl.js';

describe('WebGlProgram', () => {
  const build = (gl = new FakeGl(), uniforms = ['uA', 'uB']) =>
    new WebGlProgram(gl, {
      vertex: '\n  VERTEX SOURCE \n',
      fragment: '  FRAGMENT SOURCE\n',
      uniforms,
    });

  it('compiles both shaders, links, and looks every uniform up, in exactly this order', () => {
    const gl = new FakeGl();
    build(gl);
    expect(gl.calls).toStrictEqual([
      ['createProgram'],
      ['createShader', 'VERTEX_SHADER'],
      ['shaderSource', 'shader:VERTEX_SHADER#1', 'VERTEX SOURCE'],
      ['compileShader', 'shader:VERTEX_SHADER#1'],
      ['getShaderParameter', 'shader:VERTEX_SHADER#1', 'COMPILE_STATUS'],
      ['attachShader', 'program#1', 'shader:VERTEX_SHADER#1'],
      ['createShader', 'FRAGMENT_SHADER'],
      ['shaderSource', 'shader:FRAGMENT_SHADER#1', 'FRAGMENT SOURCE'],
      ['compileShader', 'shader:FRAGMENT_SHADER#1'],
      ['getShaderParameter', 'shader:FRAGMENT_SHADER#1', 'COMPILE_STATUS'],
      ['attachShader', 'program#1', 'shader:FRAGMENT_SHADER#1'],
      ['linkProgram', 'program#1'],
      ['getProgramParameter', 'program#1', 'LINK_STATUS'],
      ['getUniformLocation', 'program#1', 'uA'],
      ['getUniformLocation', 'program#1', 'uB'],
    ]);
  });

  it('keeps the program handle, the context and a map of uniform locations', () => {
    const gl = new FakeGl();
    const program = build(gl);
    expect([program.handle, program.gl === gl, program.uniforms]).toStrictEqual([
      'program#1',
      true,
      { uA: 'loc:uA', uB: 'loc:uB' },
    ]);
  });

  it('works without uniforms', () => expect(build(new FakeGl(), []).uniforms).toStrictEqual({}));

  it('throws the shader log when a shader does not compile, before linking anything', () => {
    const gl = new FakeGl({
      getShaderParameter: () => false,
      getShaderInfoLog: () => 'ERROR: 0:3: syntax',
    });
    expect(() => build(gl)).toThrow(new Error('ERROR: 0:3: syntax'));
    expect(gl.callsTo('linkProgram')).toStrictEqual([]);
    expect(gl.callsTo('createShader')).toStrictEqual([['createShader', 'VERTEX_SHADER']]);
  });

  it('throws the program log when linking fails', () => {
    const gl = new FakeGl({
      getProgramParameter: () => false,
      getProgramInfoLog: () => 'link error',
    });
    expect(() => build(gl)).toThrow(new Error('link error'));
    expect(gl.callsTo('getUniformLocation')).toStrictEqual([]);
  });

  describe('setting state', () => {
    const calls = (act) => {
      const gl = new FakeGl();
      const program = build(gl);
      gl.calls = [];
      const result = act(program);
      return [gl.calls, result === program];
    };

    it('use() makes it the current program and returns itself', () =>
      expect(calls((program) => program.use())).toStrictEqual([
        [['useProgram', 'program#1']],
        true,
      ]));
    it('float() sets one number', () =>
      expect(calls((program) => program.float('uA', 1.5))).toStrictEqual([
        [['uniform1f', 'loc:uA', 1.5]],
        true,
      ]));
    it('vec2() sets two numbers', () =>
      expect(calls((program) => program.vec2('uA', 3, 4))).toStrictEqual([
        [['uniform2f', 'loc:uA', 3, 4]],
        true,
      ]));
    it('vec3() sets a color array', () =>
      expect(calls((program) => program.vec3('uB', [0.1, 0.2, 0.3]))).toStrictEqual([
        [['uniform3fv', 'loc:uB', [0.1, 0.2, 0.3]]],
        true,
      ]));
    it('mat3() sets a matrix without transposing it', () => {
      const matrix = new Float32Array(9);
      expect(calls((program) => program.mat3('uB', matrix))).toStrictEqual([
        [['uniformMatrix3fv', 'loc:uB', false, matrix]],
        true,
      ]);
    });

    it('chains: one call sets several uniforms in order', () => {
      const gl = new FakeGl();
      const program = build(gl);
      gl.calls = [];
      program.use().float('uA', 1).vec2('uB', 2, 3);
      expect(gl.calls).toStrictEqual([
        ['useProgram', 'program#1'],
        ['uniform1f', 'loc:uA', 1],
        ['uniform2f', 'loc:uB', 2, 3],
      ]);
    });
  });
});

describe('VertexArray', () => {
  it('uploads the data and describes each attribute by its float count, packed one after another', () => {
    const gl = new FakeGl();
    const data = new Float32Array(36);
    new VertexArray(gl, data, [4, 3, 1, 1]);
    expect(gl.calls).toStrictEqual([
      ['createVertexArray'],
      ['bindVertexArray', 'vao#1'],
      ['createBuffer'],
      ['bindBuffer', 'ARRAY_BUFFER', 'buffer#1'],
      ['bufferData', 'ARRAY_BUFFER', data, 'STATIC_DRAW'],
      ['enableVertexAttribArray', 0],
      ['vertexAttribPointer', 0, 4, 'FLOAT', false, 36, 0],
      ['enableVertexAttribArray', 1],
      ['vertexAttribPointer', 1, 3, 'FLOAT', false, 36, 16],
      ['enableVertexAttribArray', 2],
      ['vertexAttribPointer', 2, 1, 'FLOAT', false, 36, 28],
      ['enableVertexAttribArray', 3],
      ['vertexAttribPointer', 3, 1, 'FLOAT', false, 36, 32],
      ['bindVertexArray', null],
    ]);
  });

  it('handles a single two-float attribute, as the quad does', () => {
    const gl = new FakeGl();
    new VertexArray(gl, new Float32Array(8), [2]);
    expect(gl.callsTo('vertexAttribPointer')).toStrictEqual([
      ['vertexAttribPointer', 0, 2, 'FLOAT', false, 8, 0],
    ]);
  });

  it('binds its own array on bind() and returns itself', () => {
    const gl = new FakeGl();
    const array = new VertexArray(gl, new Float32Array(4), [4]);
    gl.calls = [];
    expect([array.bind() === array, gl.calls]).toStrictEqual([
      true,
      [['bindVertexArray', 'vao#1']],
    ]);
  });

  it('gives each array its own handle', () => {
    const gl = new FakeGl();
    new VertexArray(gl, new Float32Array(4), [4]).bind();
    new VertexArray(gl, new Float32Array(4), [4]).bind();
    expect(gl.callsTo('bindVertexArray')).toStrictEqual([
      ['bindVertexArray', 'vao#1'],
      ['bindVertexArray', null],
      ['bindVertexArray', 'vao#1'],
      ['bindVertexArray', 'vao#2'],
      ['bindVertexArray', null],
      ['bindVertexArray', 'vao#2'],
    ]);
  });
});
