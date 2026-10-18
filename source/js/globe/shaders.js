/** GLSL ES 3.0 sources for the four globe passes. The shader dialog shows these verbatim. */
export class GlobeShaders {
  static dotsVertex = `#version 300 es
// One vertex per land dot: xyz on the unit sphere plus a random seed.
// Perspective projection: camera at uCameraDistance from the center, looking at the origin.
layout(location = 0) in vec4 aPoint;
uniform mat3  uRotation;         // yaw + pitch
uniform vec2  uScale;            // focal scale already divided by the aspect ratio
uniform float uCameraDistance;
uniform float uIntro;            // 0 → 1 during the entry animation
uniform float uSize;             // base point size in pixels
out float vDepth;
out float vAlpha;
void main() {
  float seed = aPoint.w;
  vec3 position = aPoint.xyz;
  float instance = float(gl_InstanceID);       // stress mode: extra copies jittered along the surface
  if (instance > 0.5) {
    float h1 = fract(sin(seed * 91.7 + instance * 13.1) * 43758.5);
    float h2 = fract(sin(seed * 57.3 + instance * 7.7) * 22578.1);
    vec3 tangent = normalize(cross(position, vec3(0.001, 1.0, 0.0)));
    vec3 bitangent = cross(position, tangent);
    position = normalize(position + (tangent * (h1 - 0.5) + bitangent * (h2 - 0.5)) * 0.035);
  }
  float appear = smoothstep(seed * 0.7, seed * 0.7 + 0.3, uIntro);   // every dot lands in its own window
  vec3 p = uRotation * position;
  p *= 1.0 + (1.0 - appear) * (0.4 + 0.8 * seed);
  float w = uCameraDistance - p.z;
  float horizon = 1.0 / uCameraDistance;        // beyond this the dot is on the far side
  vDepth = p.z;
  vAlpha = appear * smoothstep(horizon - 0.02, horizon + 0.14, p.z);
  gl_Position = vec4(p.xy * uScale / w, 0.0, 1.0);
  gl_PointSize = uSize * mix(0.75, 1.35, clamp(p.z, 0.0, 1.0)) * (0.4 + 0.6 * appear) * (0.8 + 0.4 * seed);
  if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

  static dotsFragment = `#version 300 es
precision mediump float;
in float vDepth;
in float vAlpha;
uniform vec3 uDotColor;         // from the CSS tokens
uniform vec3 uDotHighlight;     // facing the camera
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  float alpha = (1.0 - smoothstep(0.5, 1.0, d)) * vAlpha;
  vec3 color = mix(uDotColor, uDotHighlight, smoothstep(0.3, 1.0, vDepth));
  outColor = vec4(color * alpha, alpha);   // premultiplied alpha
}
`;

  static bodyVertex = `#version 300 es
layout(location = 0) in vec2 aQuad;
uniform float uSilhouetteRadius;   // in NDC
uniform float uAspect;
out vec2 vUv;
void main() { vUv = aQuad * 1.36; gl_Position = vec4(vUv * uSilhouetteRadius * vec2(1.0 / uAspect, 1.0), 0.0, 1.0); }
`;

  static bodyFragment = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform vec3 uBodyColor, uGlowColor;
uniform float uIntro;
out vec4 outColor;
void main() {
  float d = length(vUv);
  float aa = fwidth(d) * 1.2;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  float z = sqrt(max(0.0, 1.0 - d * d));
  vec3 normal = vec3(vUv, z);
  vec3 light = normalize(vec3(-0.5, 0.7, 0.55));
  float lit = pow(dot(normal, light) * 0.5 + 0.5, 1.4);        // soft terminator: no hard dark side
  float rim = pow(1.0 - z, 4.0);
  float paper = smoothstep(0.45, 0.65, dot(uBodyColor, vec3(0.2126, 0.7152, 0.0722)));   // 1 on the light theme

  vec3 darkBody = uBodyColor * (0.5 + 0.8 * lit) + uGlowColor * rim * 0.4;
  vec3 paperBody = mix(uBodyColor * 0.84, vec3(1.0), lit * 0.9) + uGlowColor * rim * 0.1;
  vec3 body = mix(darkBody, paperBody, paper);

  // Outside the sphere: a thin neon halo on the dark theme, a soft contact shadow on the light one.
  // Both die before the quad edge, so no square is ever visible.
  float x = max(d - 1.0, 0.0);
  float reach = (1.0 - smoothstep(1.12, 1.34, d)) * uIntro;
  float towardLight = 0.75 + 0.25 * dot(normalize(vUv + 1e-5), normalize(light.xy));
  float halo = (0.38 * exp(-x * 18.0) + 0.14 * exp(-x * 5.0)) * towardLight * reach;
  vec2 shadowUv = vUv - vec2(0.03, -0.07);                       // pushed down and to the right
  float shadowX = max(length(shadowUv) - 1.0, 0.0);
  float shadow = 0.24 * exp(-shadowX * 6.5) * (1.0 - smoothstep(1.1, 1.3, length(shadowUv))) * uIntro;
  float edge = 0.16 * exp(-x * 24.0) * reach;                    // hairline of accent color on the light theme
  vec4 outside = mix(vec4(uGlowColor * halo, halo), vec4(uBodyColor * 0.3 * shadow + uGlowColor * edge, shadow + edge), paper);

  outColor = vec4(body * inside + outside.rgb * (1.0 - inside), inside + outside.a * (1.0 - inside));
}
`;

  static arcsVertex = `#version 300 es
// Arcs as ribbons: each sample becomes two vertices offset along the screen-space normal.
layout(location = 0) in vec4 aPoint;      // xyz lifted above the surface + t along the arc
layout(location = 1) in vec3 aNext;       // next sample, for the direction
layout(location = 2) in float aSide;
layout(location = 3) in float aArcIndex;
uniform mat3 uRotation; uniform vec2 uScale; uniform vec2 uResolution; uniform float uCameraDistance, uTime, uWidth, uIntro;
out float vAlpha; out float vEdge; out float vHead;
vec2 project(vec3 p) { return p.xy * uScale / (uCameraDistance - p.z); }
void main() {
  vec3 p = uRotation * aPoint.xyz, q = uRotation * aNext;
  vec2 a = project(p), b = project(q);
  vec2 direction = normalize((b - a) * uResolution);
  vec2 normal = vec2(-direction.y, direction.x);
  // every arc gets its own phase, speed and direction, derived from its index
  float phase = fract(aArcIndex * 0.618034), speed = 0.3 + 0.22 * fract(aArcIndex * 0.381966);
  float reversed = step(0.5, fract(aArcIndex * 0.7548776));
  float t = mix(aPoint.w, 1.0 - aPoint.w, reversed);
  float head = fract(uTime * speed + phase) * 1.6;   // > 1 leaves a pause between passes
  float trail = smoothstep(head - 0.45, head, t) * (1.0 - step(head, t));
  float horizon = 1.0 / uCameraDistance;
  vAlpha = trail * smoothstep(horizon - 0.04, horizon + 0.12, p.z) * smoothstep(0.7, 1.0, uIntro);
  vEdge = aSide; vHead = trail;
  gl_Position = vec4(a + normal * aSide * (uWidth * 2.0 / uResolution), 0.0, 1.0);
}
`;

  static arcsFragment = `#version 300 es
precision mediump float;
in float vAlpha; in float vEdge; in float vHead; uniform vec3 uColor; out vec4 outColor;
void main() {
  float alpha = (1.0 - smoothstep(0.35, 1.0, abs(vEdge))) * vAlpha;
  vec3 color = mix(uColor, vec3(1.0), pow(vHead, 6.0) * 0.6);
  outColor = vec4(color * alpha, alpha);
}
`;

  static pinsVertex = `#version 300 es
layout(location = 0) in vec4 aPoint;   // xyz + kind (0 = home, 1 = destination)
uniform mat3 uRotation; uniform vec2 uScale; uniform float uCameraDistance, uSize, uIntro;
out float vAlpha; out float vKind;
void main() {
  vec3 p = uRotation * aPoint.xyz;
  vKind = aPoint.w;
  float horizon = 1.0 / uCameraDistance;
  vAlpha = smoothstep(horizon + 0.02, horizon + 0.2, p.z) * smoothstep(0.6, 1.0, uIntro);
  gl_Position = vec4(p.xy * uScale / (uCameraDistance - p.z), 0.0, 1.0);
  gl_PointSize = uSize * (aPoint.w < 0.5 ? 10.0 : 4.5);
  if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

  static pinsFragment = `#version 300 es
precision mediump float;
in float vAlpha; in float vKind; uniform vec3 uHomeColor, uDestinationColor; uniform float uTime; out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float core = 1.0 - smoothstep(vKind < 0.5 ? 0.16 : 0.2, vKind < 0.5 ? 0.24 : 0.3, d);
  float phase = fract(uTime * 0.5 + vKind * 0.41);
  float ringRadius = 0.2 + phase * 0.75;
  float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - ringRadius))) * (1.0 - phase) * 0.9;
  float alpha = max(core, ring) * vAlpha;
  outColor = vec4((vKind < 0.5 ? uHomeColor : uDestinationColor) * alpha, alpha);
}
`;

  /** The sources shown in the "view shader" dialog, in reading order. */
  static get showcase() {
    return [
      GlobeShaders.dotsVertex,
      GlobeShaders.dotsFragment,
      GlobeShaders.arcsVertex,
      GlobeShaders.bodyFragment,
    ];
  }
}
