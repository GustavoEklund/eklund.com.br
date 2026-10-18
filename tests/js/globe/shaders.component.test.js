import { describe, it, expect, beforeAll } from 'vitest';
import { GlobeShaders } from '@site/js/globe/shaders.js';
import { WebGlProgram } from '@site/js/globe/webgl.js';

// The uniform names globe.js asks each program for. A name missing from the shader would read back as null.
const PROGRAMS = {
  body: {
    vertex: 'bodyVertex',
    fragment: 'bodyFragment',
    uniforms: ['uSilhouetteRadius', 'uAspect', 'uBodyColor', 'uGlowColor', 'uIntro'],
  },
  dots: {
    vertex: 'dotsVertex',
    fragment: 'dotsFragment',
    uniforms: [
      'uRotation',
      'uScale',
      'uCameraDistance',
      'uIntro',
      'uSize',
      'uDotColor',
      'uDotHighlight',
    ],
  },
  arcs: {
    vertex: 'arcsVertex',
    fragment: 'arcsFragment',
    uniforms: [
      'uRotation',
      'uScale',
      'uResolution',
      'uCameraDistance',
      'uTime',
      'uWidth',
      'uIntro',
      'uColor',
    ],
  },
  pins: {
    vertex: 'pinsVertex',
    fragment: 'pinsFragment',
    uniforms: [
      'uRotation',
      'uScale',
      'uCameraDistance',
      'uSize',
      'uIntro',
      'uTime',
      'uHomeColor',
      'uDestinationColor',
    ],
  },
};

describe('GlobeShaders', () => {
  let gl;
  beforeAll(() => {
    gl = document.createElement('canvas').getContext('webgl2');
  });

  it('has a WebGL2 context to compile on', () =>
    expect(gl.getParameter(gl.VERSION)).toBe('WebGL 2.0 (OpenGL ES 3.0 Chromium)'));

  it.each(Object.keys(GlobeShaders).filter((name) => /Vertex$|Fragment$/.test(name)))(
    '%s starts with a GLSL ES 3.00 version line',
    (name) => {
      expect(GlobeShaders[name].split('\n')[0]).toBe('#version 300 es');
    },
  );

  it.each(Object.entries(PROGRAMS))(
    'compiles and links the %s program, with every uniform the globe sets',
    (_name, { vertex, fragment, uniforms }) => {
      const program = new WebGlProgram(gl, {
        vertex: GlobeShaders[vertex],
        fragment: GlobeShaders[fragment],
        uniforms,
      });
      expect(Object.keys(program.uniforms)).toStrictEqual(uniforms);
      expect(uniforms.filter((name) => program.uniforms[name] === null)).toStrictEqual([]);
      expect(gl.getProgramParameter(program.handle, gl.LINK_STATUS)).toBe(true);
    },
  );

  it('reports the compiler log for a broken shader', () => {
    expect(
      () =>
        new WebGlProgram(gl, {
          vertex: '#version 300 es\nvoid main() { broken }',
          fragment: GlobeShaders.dotsFragment,
          uniforms: [],
        }),
    ).toThrow(/ERROR/);
  });

  it('shows the dots, then the arcs and body sources in reading order in the dialog', () => {
    expect(GlobeShaders.showcase).toStrictEqual([
      GlobeShaders.dotsVertex,
      GlobeShaders.dotsFragment,
      GlobeShaders.arcsVertex,
      GlobeShaders.bodyFragment,
    ]);
  });
});
