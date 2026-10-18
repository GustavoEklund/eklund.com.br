import { Numbers } from '../shared/math.js';
import { Environment } from '../shared/environment.js';
import { RenderLoop } from '../shared/render-loop.js';

const ATTRACTION_RADIUS = 300;
const BRIGHTNESS_LEVELS = 10;
const BREATH_LEVELS = 3;
const EDGE_FADE_BANDS = 4;
const MAX_PIXEL_RATIO = 1.5;
const IDLE_FRAME_SKIP = 5; // with the cursor far away, draw every 5th frame

/**
 * A field of chevrons that turn toward the pointer and light up near it. Drawn
 * cheaply: glyphs are batched by brightness so a frame costs ~30 strokes, not one per glyph.
 */
export class ChevronField {
  #canvas;
  #context;
  #themeColors;
  #gap;
  #glyphs = [];
  #buckets = Array.from({ length: BRIGHTNESS_LEVELS * BREATH_LEVELS }, () => []);
  #width = 0;
  #height = 0;
  #pixelRatio = 1;
  #top = 0;
  #left = 0;
  #attractorX = -1e4;
  #attractorY = -1e4;
  #pointerX = -1e4;
  #pointerY = -1e4;
  #hasPointer = false;
  #accent = [200, 240, 60];
  #foreground = [200, 200, 200];
  #frameCount = 0;
  #idleFrames = 0;
  #loop;

  constructor(canvas, themeColors) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.#themeColors = themeColors;
    this.#gap = Environment.hasFinePointer ? 54 : 64;
  }

  mount() {
    const canvas = this.#canvas;
    this.recolor();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(canvas);
    addEventListener('scroll', () => this.#measure(), { passive: true });
    // #resize already painted the still frame; the loop only runs while motion is on.
    this.#loop = new RenderLoop(canvas, (now, delta) => this.#frame(now, delta), {
      maxDelta: 0.1,
      shouldRun: () => !Environment.prefersReducedMotion,
    });
    if (Environment.hasFinePointer) {
      addEventListener(
        'pointermove',
        (event) => {
          this.#pointerX = event.clientX;
          this.#pointerY = event.clientY;
          this.#hasPointer = true;
        },
        { passive: true },
      );
      document.addEventListener('mouseleave', () => {
        this.#hasPointer = false;
      });
    }
  }

  /** Starts drawing again when motion is switched back on; switching it off stops the loop on its own. */
  sync() {
    this.#loop.start();
  }

  recolor() {
    this.#accent = this.#themeColors.accentBytes();
    this.#foreground = this.#themeColors.foregroundBytes();
  }

  #measure() {
    const rect = this.#canvas.getBoundingClientRect();
    this.#top = rect.top;
    this.#left = rect.left;
    return rect;
  }

  #resize() {
    const rect = this.#measure();
    this.#pixelRatio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.#width = rect.width;
    this.#height = rect.height;
    this.#canvas.width = Math.round(this.#width * this.#pixelRatio);
    this.#canvas.height = Math.round(this.#height * this.#pixelRatio);
    const gap = this.#gap;
    const columns = Math.ceil(this.#width / gap) + 1,
      rows = Math.ceil(this.#height / gap) + 1;
    const offsetX = (this.#width - (columns - 1) * gap) / 2,
      offsetY = (this.#height - (rows - 1) * gap) / 2;
    this.#glyphs = [];
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const jitterA = Numbers.hashToUnit(column, row),
          jitterB = Numbers.hashToUnit(row, column);
        const y = offsetY + row * gap + (jitterB - 0.5) * 10;
        const edge = Numbers.clamp(Math.min(y, this.#height - y) / (this.#height * 0.14), 0, 1);
        this.#glyphs.push({
          x: offsetX + column * gap + (jitterA - 0.5) * 10,
          y,
          restAngle: jitterA * 6.283,
          angle: jitterA * 6.283,
          glow: 0,
          phase: jitterB * 6.283,
          edgeFade: edge * edge * (3 - 2 * edge),
        });
      }
    if (this.#loop) this.#loop.renderOnce();
    else if (this.#glyphs.length) this.#draw(performance.now(), 0);
  }

  #frame(now, delta) {
    const far =
      this.#hasPointer &&
      (this.#pointerX < this.#left - ATTRACTION_RADIUS ||
        this.#pointerX > this.#left + this.#width + ATTRACTION_RADIUS ||
        this.#pointerY < this.#top - ATTRACTION_RADIUS ||
        this.#pointerY > this.#top + this.#height + ATTRACTION_RADIUS);
    if (far && this.#idleFrames > 0 && ++this.#frameCount % IDLE_FRAME_SKIP) {
      this.#idleFrames++;
      return;
    }
    const activeGlyphs = this.#draw(now, delta);
    this.#idleFrames = activeGlyphs === 0 && far ? this.#idleFrames + 1 : 0;
  }

  #draw(now, delta) {
    const seconds = now / 1000;
    let targetX, targetY;
    if (this.#hasPointer) {
      targetX = this.#pointerX - this.#left;
      targetY = this.#pointerY - this.#top;
    } else {
      targetX = this.#width * (0.5 + 0.38 * Math.sin(seconds * 0.37));
      targetY = this.#height * (0.5 + 0.36 * Math.sin(seconds * 0.53 + 1.3));
    }
    const follow = this.#hasPointer ? 0.35 : 0.08;
    this.#attractorX = Numbers.lerp(this.#attractorX, targetX, follow);
    this.#attractorY = Numbers.lerp(this.#attractorY, targetY, follow);
    for (const bucket of this.#buckets) bucket.length = 0;
    const glowEase = Math.min(1, delta * 9),
      turnFast = Math.min(1, delta * 12),
      turnSlow = Math.min(1, delta * 2.5);
    let active = 0;
    const radiusSquared = ATTRACTION_RADIUS * ATTRACTION_RADIUS;
    this.#glyphs.forEach((glyph, index) => {
      const dx = this.#attractorX - glyph.x,
        dy = this.#attractorY - glyph.y,
        distanceSquared = dx * dx + dy * dy;
      const targetGlow = distanceSquared < radiusSquared ? 1 - distanceSquared / radiusSquared : 0;
      glyph.glow += (targetGlow - glyph.glow) * glowEase;
      const attracted = glyph.glow > 0.01;
      if (attracted) active++;
      const targetAngle = attracted
        ? Math.atan2(dy, dx)
        : glyph.restAngle + Math.sin(seconds * 0.6 + glyph.phase) * 0.25;
      const turn = Math.atan2(
        Math.sin(targetAngle - glyph.angle),
        Math.cos(targetAngle - glyph.angle),
      );
      glyph.angle += turn * (attracted ? turnFast : turnSlow);
      const level = Math.min(
        BRIGHTNESS_LEVELS - 1,
        Math.round(glyph.glow * (BRIGHTNESS_LEVELS - 1)),
      );
      const breath =
        ((Math.sin(seconds * 0.8 + glyph.phase) + 1) * 0.5 * (BREATH_LEVELS - 1) + 0.5) | 0;
      this.#buckets[level * BREATH_LEVELS + breath].push(index);
    });
    this.#paintBuckets();
    if (++this.#frameCount % 60 === 0) this.recolor();
    return active;
  }

  #paintBuckets() {
    const ctx = this.#context,
      ratio = this.#pixelRatio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this.#width, this.#height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.#buckets.forEach((bucket, bucketIndex) => {
      if (!bucket.length) return;
      const glow = ((bucketIndex / BREATH_LEVELS) | 0) / (BRIGHTNESS_LEVELS - 1);
      const breath = 0.05 + 0.03 * (bucketIndex % BREATH_LEVELS);
      const alpha = breath + (1 - breath) * glow * glow;
      const size = 5 + 5 * glow;
      const channel = (i) => Math.round(Numbers.lerp(this.#foreground[i], this.#accent[i], glow));
      ctx.strokeStyle = `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
      ctx.lineWidth = 1.6 + 0.8 * glow;
      for (let band = 0; band < EDGE_FADE_BANDS; band++) {
        ctx.globalAlpha = (alpha * (band + 1)) / EDGE_FADE_BANDS;
        ctx.beginPath();
        let any = false;
        for (const index of bucket) {
          const glyph = this.#glyphs[index];
          const glyphBand = Math.min(EDGE_FADE_BANDS - 1, glyph.edgeFade * EDGE_FADE_BANDS) | 0;
          if (glyphBand !== band) continue;
          any = true;
          const cos = Math.cos(glyph.angle),
            sin = Math.sin(glyph.angle),
            back = -size * 0.45,
            tip = size * 0.45;
          ctx.moveTo(glyph.x + back * cos + size * sin, glyph.y + back * sin - size * cos);
          ctx.lineTo(glyph.x + tip * cos, glyph.y + tip * sin);
          ctx.lineTo(glyph.x + back * cos - size * sin, glyph.y + back * sin + size * cos);
        }
        if (any) ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }
}
