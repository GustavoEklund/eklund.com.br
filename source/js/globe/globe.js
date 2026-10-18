import { Numbers } from '../shared/math.js';
import { Environment } from '../shared/environment.js';
import { RenderLoop } from '../shared/render-loop.js';
import { GlobeShaders } from './shaders.js';
import { LandDecoder } from './land-decoder.js';
import { GlobeGeometry } from './geometry.js';
import { WebGlProgram, VertexArray } from './webgl.js';
import { LAND_BITSET_BASE64, LAND_RING_COUNT } from './land-bitset.js';
import { Destinations } from './destinations.js';

const CAMERA_DISTANCE = 3;
const SILHOUETTE_RADIUS = 0.64; // in NDC
const FOCAL = SILHOUETTE_RADIUS * Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - 1);
const INTRO_MS = 1800;
const HOMING_MS = 900;
const MAX_PITCH = 1.2;
const KEY_TURN = 0.12; // radians per arrow key press
const KEY_TURN_SHIFT_MULTIPLIER = 4;
const LOW_FPS = 45;
const FRAME_RATE_SAMPLE_MS = 500;
const FRAME_RATE_GAP_RESET_MS = 2000; // first frame or a tab that was hidden: do not report a bogus rate
const LOW_FPS_SAMPLES_BEFORE_DOWNGRADE = 4;

/**
 * Hand-written WebGL2 globe: analytic sphere body with halo, instanced land dots,
 * ribbon arcs and pulsing pins. Perspective projection, no depth buffer (dots behind
 * the horizon are culled in the vertex shader). Pauses off-screen and lowers the
 * pixel ratio when the frame rate drops.
 */
export class Globe {
  #canvas;
  #gl;
  #themeColors;
  #onFirstFrame;
  #programs;
  #buffers;
  #colors;
  #land;
  #arcs;
  #loop;
  #settings = { speed: 1.5, instances: 1 };
  #pixelRatio = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2);
  #width = 0;
  #height = 0;
  #yaw;
  #pitch;
  #homeYaw;
  #homePitch;
  #yawVelocity = 0;
  #pitchVelocity = 0;
  #spinOffset = 0;
  #kickVelocity = 0;
  #clock = 0;
  #intro = Environment.prefersReducedMotion ? 1 : 0;
  #introStartedAt = 0;
  #introStarted = Environment.prefersReducedMotion;
  #firstFrameMarked = false;
  #homing = null;
  #hovering = false;
  #drag = null;
  #frames = 0;
  #frameRateSampledAt = 0;
  #frameRate = 0;
  #lowFpsStreak = 0;

  static create(canvas, themeColors, options) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    return gl ? new Globe(canvas, gl, themeColors, options) : null;
  }

  constructor(canvas, gl, themeColors, { onFirstFrame } = {}) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#themeColors = themeColors;
    this.#onFirstFrame = onFirstFrame;
    this.#homeYaw = -Numbers.degreesToRadians(Destinations.HOME.longitude) - Math.PI / 2;
    this.#homePitch = Numbers.clamp(
      Numbers.degreesToRadians(Destinations.HOME.latitude) * 0.55,
      -0.6,
      0.6,
    );
    this.#yaw = this.#homeYaw;
    this.#pitch = this.#homePitch;
  }

  get pointCount() {
    return this.#land.count;
  }
  get arcCount() {
    return this.#arcs.arcCount;
  }
  get instanceCount() {
    return this.#settings.instances;
  }
  get pixelRatio() {
    return this.#pixelRatio;
  }
  get canvasSize() {
    return `${this.#width}×${this.#height}`;
  }
  get frameRate() {
    return this.#frameRate;
  }
  get isRunning() {
    return this.#loop?.isRunning ?? false;
  }

  mount() {
    performance.mark('globe:init');
    this.#land = new LandDecoder({
      ringCount: LAND_RING_COUNT,
      bitsetBase64: LAND_BITSET_BASE64,
    }).decode();
    this.#arcs = GlobeGeometry.arcs(
      Destinations.HOME,
      Destinations.DESTINATIONS,
      Destinations.ARC_PAIRS,
    );
    this.#buildPrograms();
    this.#buildBuffers();
    const gl = this.#gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.#colors = this.#themeColors.snapshot();
    performance.mark('globe:ready');
    this.#bindPointer();
    new ResizeObserver(() => {
      this.#resize();
      this.#loop.renderOnce();
    }).observe(this.#canvas);
    this.#resize();
    this.#loop = new RenderLoop(this.#canvas, (now, delta) => this.#frame(now, delta));
    this.#loop.start();
    return this;
  }

  startIntro() {
    if (this.#introStarted) return;
    this.#introStarted = true;
    this.#introStartedAt = performance.now();
  }

  recolor() {
    this.#colors = this.#themeColors.snapshot();
  }

  setSpeed(speed) {
    this.#settings.speed = speed;
  }

  setInstances(instances) {
    this.#settings.instances = instances;
  }

  kick() {
    this.#kickVelocity = -6;
  }

  /** Turns the globe by hand: east and north are positive, the same directions a drag to the right and down gives. */
  rotateBy(yaw, pitch) {
    this.#homing = null;
    this.#yaw += yaw;
    this.#pitch = Numbers.clamp(this.#pitch + pitch, -MAX_PITCH, MAX_PITCH);
  }

  /** Rotates back to the home city, taking the shortest way around. */
  goHome() {
    const turns = Math.round((this.#yaw - this.#homeYaw) / (2 * Math.PI));
    this.#homing = {
      startedAt: performance.now(),
      fromYaw: this.#yaw,
      fromPitch: this.#pitch,
      toYaw: this.#homeYaw + turns * 2 * Math.PI,
      toPitch: this.#homePitch,
    };
  }

  #buildPrograms() {
    const gl = this.#gl;
    this.#programs = {
      body: new WebGlProgram(gl, {
        vertex: GlobeShaders.bodyVertex,
        fragment: GlobeShaders.bodyFragment,
        uniforms: ['uSilhouetteRadius', 'uAspect', 'uBodyColor', 'uGlowColor', 'uIntro'],
      }),
      dots: new WebGlProgram(gl, {
        vertex: GlobeShaders.dotsVertex,
        fragment: GlobeShaders.dotsFragment,
        uniforms: [
          'uRotation',
          'uScale',
          'uCameraDistance',
          'uIntro',
          'uSize',
          'uDotColor',
          'uDotHighlight',
        ],
      }),
      arcs: new WebGlProgram(gl, {
        vertex: GlobeShaders.arcsVertex,
        fragment: GlobeShaders.arcsFragment,
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
      }),
      pins: new WebGlProgram(gl, {
        vertex: GlobeShaders.pinsVertex,
        fragment: GlobeShaders.pinsFragment,
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
      }),
    };
  }

  #buildBuffers() {
    const gl = this.#gl;
    this.#buffers = {
      body: new VertexArray(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), [2]),
      dots: new VertexArray(gl, this.#land.positions, [4]),
      arcs: new VertexArray(gl, this.#arcs.vertices, [4, 3, 1, 1]),
      pins: new VertexArray(
        gl,
        GlobeGeometry.pins(Destinations.HOME, Destinations.DESTINATIONS),
        [4],
      ),
    };
  }

  #resize() {
    const rect = this.#canvas.getBoundingClientRect();
    this.#width = Math.max(1, Math.round(rect.width * this.#pixelRatio));
    this.#height = Math.max(1, Math.round(rect.height * this.#pixelRatio));
    if (this.#canvas.width !== this.#width || this.#canvas.height !== this.#height) {
      this.#canvas.width = this.#width;
      this.#canvas.height = this.#height;
    }
  }

  #bindPointer() {
    const canvas = this.#canvas;
    canvas.addEventListener('pointerdown', (event) => {
      this.#drag = { x: event.clientX, y: event.clientY };
      this.#yawVelocity = this.#pitchVelocity = 0;
      this.#homing = null;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.#drag) return;
      const scale = 2.2 / canvas.clientWidth;
      const dx = (event.clientX - this.#drag.x) * scale,
        dy = (event.clientY - this.#drag.y) * scale;
      this.#drag = { x: event.clientX, y: event.clientY };
      this.#yaw += dx;
      this.#pitch = Numbers.clamp(this.#pitch + dy, -MAX_PITCH, MAX_PITCH);
      this.#yawVelocity = dx;
      this.#pitchVelocity = dy;
    });
    const release = () => {
      this.#drag = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerenter', () => {
      this.#hovering = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.#hovering = false;
      this.#drag = null;
    });
    canvas.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  /** Arrows turn the globe (Shift turns it further), Home brings it back to the home city. */
  #onKeyDown(event) {
    const turn = KEY_TURN * (event.shiftKey ? KEY_TURN_SHIFT_MULTIPLIER : 1);
    const turns = {
      ArrowLeft: [-turn, 0],
      ArrowRight: [turn, 0],
      ArrowUp: [0, -turn],
      ArrowDown: [0, turn],
    };
    if (event.key === 'Home') {
      event.preventDefault();
      this.goHome();
      return;
    }
    if (!turns[event.key]) return;
    event.preventDefault();
    this.rotateBy(...turns[event.key]);
  }

  #rotationMatrix() {
    const a = this.#yaw + this.#spinOffset,
      b = this.#pitch;
    const ca = Math.cos(a),
      sa = Math.sin(a),
      cb = Math.cos(b),
      sb = Math.sin(b);
    return new Float32Array([ca, sb * sa, -cb * sa, 0, cb, sb, sa, -sb * ca, cb * ca]);
  }

  #advanceIntro(now) {
    if (this.#introStarted && this.#intro < 1)
      this.#intro = Math.min(1, (now - this.#introStartedAt) / INTRO_MS);
    const eased = 1 - Math.pow(1 - this.#intro, 4);
    this.#spinOffset = Environment.prefersReducedMotion ? 0 : 1.6 * (1 - eased); // the intro winds in from the west
    return eased;
  }

  #advanceRotation(now, delta, eased) {
    if (this.#drag) return;
    if (this.#homing) {
      const k = Math.min(1, (now - this.#homing.startedAt) / HOMING_MS),
        eased3 = 1 - Math.pow(1 - k, 3);
      this.#yaw = Numbers.lerp(this.#homing.fromYaw, this.#homing.toYaw, eased3);
      this.#pitch = Numbers.lerp(this.#homing.fromPitch, this.#homing.toPitch, eased3);
      if (k >= 1) this.#homing = null;
      return;
    }
    // Eastward: after Brazil comes Africa and Europe, not the empty Pacific.
    const autoSpin = Environment.prefersReducedMotion
      ? 0
      : -0.07 * this.#settings.speed * (this.#hovering ? 0.25 : 1) * eased;
    this.#yaw += (autoSpin + this.#kickVelocity) * delta + this.#yawVelocity;
    this.#pitch = Numbers.clamp(this.#pitch + this.#pitchVelocity, -MAX_PITCH, MAX_PITCH);
    this.#yawVelocity *= 0.93;
    this.#pitchVelocity *= 0.9;
    this.#kickVelocity *= 0.96;
  }

  #frame(now, delta) {
    const eased = this.#advanceIntro(now);
    this.#advanceRotation(now, delta, eased);
    if (!Environment.prefersReducedMotion) this.#clock += delta; // arcs and pins pulse with this clock, which stands still when motion is off
    this.#draw(this.#clock, eased);
    if (!this.#firstFrameMarked) {
      this.#firstFrameMarked = true;
      performance.mark('globe:first-frame');
      this.#onFirstFrame?.();
    }
    this.#sampleFrameRate(now);
  }

  #draw(seconds, intro) {
    const gl = this.#gl,
      { width, height } = { width: this.#width, height: this.#height };
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const aspect = width / height,
      scaleX = FOCAL / aspect,
      scaleY = FOCAL;
    const rotation = this.#rotationMatrix();
    const pointSize = SILHOUETTE_RADIUS * height * 0.5 * this.#land.angularStep * 0.62;
    const colors = this.#colors,
      programs = this.#programs,
      buffers = this.#buffers;

    programs.body
      .use()
      .float('uSilhouetteRadius', SILHOUETTE_RADIUS)
      .float('uAspect', aspect)
      .vec3('uBodyColor', colors.globeBody)
      .vec3('uGlowColor', colors.accent)
      .float('uIntro', intro);
    buffers.body.bind();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    programs.dots
      .use()
      .mat3('uRotation', rotation)
      .vec2('uScale', scaleX, scaleY)
      .float('uCameraDistance', CAMERA_DISTANCE)
      .float('uIntro', intro)
      .float('uSize', pointSize)
      .vec3('uDotColor', colors.globeDot)
      .vec3('uDotHighlight', colors.accent);
    buffers.dots.bind();
    gl.drawArraysInstanced(gl.POINTS, 0, this.#land.count, this.#settings.instances);

    programs.arcs
      .use()
      .mat3('uRotation', rotation)
      .vec2('uScale', scaleX, scaleY)
      .vec2('uResolution', width, height)
      .float('uCameraDistance', CAMERA_DISTANCE)
      .float('uTime', seconds)
      .float('uWidth', 1.1 * this.#pixelRatio)
      .float('uIntro', intro)
      .vec3('uColor', colors.accentSecondary);
    buffers.arcs.bind();
    const ribbonVertices = this.#arcs.segments * 2;
    for (let arc = 0; arc < this.#arcs.arcCount; arc++)
      gl.drawArrays(gl.TRIANGLE_STRIP, arc * ribbonVertices, ribbonVertices);

    programs.pins
      .use()
      .mat3('uRotation', rotation)
      .vec2('uScale', scaleX, scaleY)
      .float('uCameraDistance', CAMERA_DISTANCE)
      .float('uSize', pointSize)
      .float('uIntro', intro)
      .float('uTime', seconds)
      .vec3('uHomeColor', colors.accent)
      .vec3('uDestinationColor', colors.accentSecondary);
    buffers.pins.bind();
    gl.drawArrays(gl.POINTS, 0, 1 + Destinations.DESTINATIONS.length);
  }

  #sampleFrameRate(now) {
    this.#frames++;
    const elapsed = now - this.#frameRateSampledAt;
    if (elapsed > FRAME_RATE_GAP_RESET_MS) {
      this.#frames = 0;
      this.#frameRateSampledAt = now;
      return;
    }
    if (elapsed <= FRAME_RATE_SAMPLE_MS) return;
    this.#frameRate = Math.round((this.#frames * 1000) / (now - this.#frameRateSampledAt));
    this.#frames = 0;
    this.#frameRateSampledAt = now;
    const underStress = this.#settings.instances > 1;
    if (this.#frameRate < LOW_FPS && this.#intro >= 1 && !underStress) {
      if (++this.#lowFpsStreak >= LOW_FPS_SAMPLES_BEFORE_DOWNGRADE && this.#pixelRatio > 1) {
        this.#pixelRatio = 1;
        this.#resize();
        this.#lowFpsStreak = 0;
      }
    } else {
      this.#lowFpsStreak = 0;
    }
  }
}
