import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WALK_SPEED } from "./config";
import { Person, type Motion } from "./avatar";
import { BODIES } from "./bodies";
import type { ClothesSpec, MapSpec } from "./types";

const GLSL_NOISE = /* glsl */ `
// Sine-free hash: sin() of large arguments loses precision on GPUs (stars vanish, patterns break far from the origin).
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// A sky picture is a window on the sky: its bottom edge is the horizon, its top edge 55 degrees up,
// and sideways it repeats mirrored so there is no seam.
const PHOTO_GLSL = /* glsl */ `
vec3 skyPhoto(sampler2D tex, vec3 d, float aspect, float t) {
  float az = atan(d.x, -d.z) / 6.2831853 * 360.0 / (55.0 * max(aspect, 0.76)) + 0.5 + t * 0.0015; // +0.5: the picture centre, not a mirror seam, faces forward
  float u = abs(fract(az * 0.5) * 2.0 - 1.0);
  float v = clamp(asin(clamp(d.y, 0.0, 1.0)) / 0.9599311, 0.0, 1.0);
  // Stay a little inside the picture: the outermost pixels are often a dark border or JPEG edge, which shows as a line at every mirror fold.
  return texture2D(tex, vec2(0.015 + 0.97 * u, 0.01 + 0.98 * v)).rgb;
}
`;

// Night sky: NASA's deep star map (public domain, see public/sounds/CREDITS.txt) plus the moon, drawn
// additively over the physical sky (which is black at night). The map turns slowly with the hour.
const starMap = new THREE.TextureLoader().load("/sky/starmap.jpg");
starMap.colorSpace = THREE.SRGBColorSpace;
starMap.generateMipmaps = true; // blurred levels give the diffuse Milky Way glow
starMap.minFilter = THREE.LinearMipmapLinearFilter;
starMap.wrapS = THREE.RepeatWrapping;
const moonMap = new THREE.TextureLoader().load("/sky/moon.jpg");
moonMap.colorSpace = THREE.SRGBColorSpace;
const nightMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
  uniforms: {
    uMoon: { value: new THREE.Vector3() }, uMoonSize: { value: 0.09 }, uMoonTint: { value: new THREE.Vector3(0.9, 0.97, 1.1) }, uMoonGlow: { value: new THREE.Vector3(0.45, 0.62, 1.0) }, uStars: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.5 }, uAurora: { value: 0 },
    uMap: { value: starMap }, uMoonMap: { value: moonMap }, uRot: { value: new THREE.Matrix3() },
    uPhoto: { value: null as THREE.Texture | null }, uPhotoOn: { value: 0 }, uPhotoAspect: { value: 1.5 },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uMoon, uMoonTint, uMoonGlow; uniform float uMoonSize, uStars, uNight, uTime, uCloud, uAurora; uniform sampler2D uMap, uMoonMap, uPhoto; uniform mat3 uRot; uniform float uPhotoOn, uPhotoAspect;
    varying vec3 vDir;
    ${GLSL_NOISE}
    ${PHOTO_GLSL}
    // One meteor every PERIOD seconds, streaking for about 1.2 s along a short random arc in the forward sky.
    float meteor(vec3 d, float seed, float period) {
      float x = uTime / period + seed;
      float cyc = floor(x);
      float t = fract(x) * period / 1.2;
      if (t > 1.0) return 0.0;
      vec3 a = normalize(vec3(hash(vec2(cyc, seed + 1.0)) * 2.0 - 1.0, 0.35 + 0.5 * hash(vec2(cyc, seed + 2.0)), -0.3 - hash(vec2(cyc, seed + 3.0))));
      vec3 b = normalize(a + vec3((hash(vec2(cyc, seed + 4.0)) - 0.5) * 0.7, -0.16, 0.0));
      vec3 head = normalize(mix(a, b, t));
      vec3 tail = normalize(mix(a, b, max(t - 0.25, 0.0)));
      vec3 ab = head - tail;
      float h = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dist = length(normalize(tail + ab * h) - d);
      return (1.0 - smoothstep(0.0, 0.004, dist)) * h * sin(t * 3.1416);
    }
    // Point stars on a hash grid: round core plus a soft glow; sparkle > 0 adds a thin cross to the brightest ones.
    vec3 pointStars(vec3 d, float scale, float prob, float sparkle) {
      vec3 sp = d * scale;
      vec3 q = floor(sp);
      vec2 f = fract(sp).xy - 0.5;
      float on = step(1.0 - prob, hash(q.xy + q.z * 17.0 + scale));
      float mag = pow(hash(q.yz + 3.0), 3.0);
      float r = length(f);
      float s = smoothstep(mix(0.1, 0.34, mag), 0.0, r) + 0.22 * mag * exp(-r * 9.0);
      float cross_ = (smoothstep(0.035, 0.0, abs(f.x)) * smoothstep(0.5, 0.0, abs(f.y)) + smoothstep(0.035, 0.0, abs(f.y)) * smoothstep(0.5, 0.0, abs(f.x))) * mag * sparkle;
      float v = on * (s + cross_) * (0.35 + 0.65 * hash(q.zx + 7.0));
      return v * mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.9, 0.75), hash(q.xz + 11.0));
    }
    // The moon: real surface detail, a tint (silver or red) and a glow. Also used over a night picture.
    vec3 addMoon(vec3 col, vec3 d){
      float md = dot(d, uMoon);
      vec3 mz = uMoon;
      vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), mz));
      vec3 my = cross(mz, mx);
      vec2 mp = vec2(dot(d, mx), dot(d, my)) / uMoonSize;
      float mr = length(mp);
      if (md > 0.0 && mr < 1.0) {
        float z = sqrt(1.0 - mr * mr);
        vec3 n = vec3(mp, z);
        vec2 muv = vec2(atan(n.x, n.z) / 6.2831853 + 0.5, asin(clamp(n.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        col = mix(col, texture2D(uMoonMap, muv).rgb * uMoonTint * pow(z, 0.3) * 1.7, smoothstep(1.0, 0.94, mr));
      }
      col += uMoonGlow * (0.55 * exp(-max(mr - 1.0, 0.0) * 5.0) * step(0.0, md) * smoothstep(0.0, 0.2, mr) + 0.12 * pow(max(md, 0.0), 120.0));
      return col;
    }
    void main(){
      vec3 d = normalize(vDir);
      float above = smoothstep(-0.02, 0.05, d.y);
      if (uPhotoOn > 0.5) {
        vec3 ph = skyPhoto(uPhoto, d, uPhotoAspect, uTime);
        ph *= mix(1.0, 0.62, smoothstep(0.12, 0.6, d.y)); // darker overhead
        ph += vec3(0.06, 0.08, 0.15) * pow(1.0 - clamp(d.y * 2.2, 0.0, 1.0), 2.5); // brighter toward the mountains
        ph += vec3(1.0, 0.97, 0.92) * 0.5 * (meteor(d, 0.0, 19.0) + meteor(d, 0.37, 31.0)) * uStars;
        ph = addMoon(ph, d);
        gl_FragColor = vec4(ph * above * uNight * uStars * 1.9, 1.0); // x1.9: the output pass tone-maps the domes too
        #include <colorspace_fragment>
        return;
      }
      vec3 r = uRot * d;
      vec2 uv = vec2(atan(r.z, r.x) / 6.2831853 + 0.5, asin(clamp(r.y, -1.0, 1.0)) / 3.1415927 + 0.5);

      // Milky Way: the star map's blurred glow, colored blue to violet to pink with nebula patches and dark dust lanes.
      float gl = dot(textureLod(uMap, uv, 5.0).rgb, vec3(0.333));
      float broad = dot(textureLod(uMap, uv, 6.5).rgb, vec3(0.333));
      float band = smoothstep(0.012, 0.18, gl);
      float tone = fbm(uv * vec2(14.0, 7.0) + 3.0);
      vec3 blue = vec3(0.28, 0.45, 1.0), violet = vec3(0.62, 0.36, 0.95), pink = vec3(1.0, 0.45, 0.62), warm = vec3(1.0, 0.72, 0.45);
      vec3 hue = mix(mix(blue, violet, smoothstep(0.3, 0.55, tone)), pink, smoothstep(0.52, 0.72, tone) * smoothstep(0.06, 0.3, gl));
      hue = mix(hue, warm, smoothstep(0.2, 0.5, gl) * 0.45);
      vec3 mw = hue * pow(gl, 0.85) * 3.6;
      mw *= clamp((gl - broad) * 7.0 + 0.75, 0.25, 1.0);
      vec3 mapStars = pow(textureLod(uMap, uv, 0.0).rgb, vec3(1.1)) * 2.0;
      vec3 pts = pointStars(d, 300.0, 0.022 * (1.0 + 3.0 * band), 0.0) * 1.5
               + pointStars(d, 620.0, 0.03 * (1.0 + 2.5 * band), 0.0) * 0.8
               + pointStars(d, 85.0, 0.018, 1.0) * 2.2;
      vec3 sky = (mw + mapStars + pts) * uStars;
      sky += vec3(1.0, 0.97, 0.92) * 0.55 * (meteor(d, 0.0, 19.0) + meteor(d, 0.37, 31.0)) * uStars;
      // Aurora (northern maps): slow green-to-violet ribbons low in the forward sky, with fine vertical rays.
      if (uAurora > 0.0) {
        float az = atan(d.x, -d.z);
        float band = smoothstep(0.05, 0.22, d.y) * (1.0 - smoothstep(0.4, 0.9, d.y));
        float front = smoothstep(-0.5, 0.9, -d.z);
        float ribbon = fbm(vec2(az * 2.4 + uTime * 0.04, d.y * 0.9 + uTime * 0.01));
        float rays = 0.55 + 0.45 * noise(vec2(az * 38.0 + sin(uTime * 0.17 + az * 3.0) * 3.0, d.y * 2.0));
        float aur = band * front * smoothstep(0.35, 0.8, ribbon) * rays;
        sky += mix(vec3(0.12, 1.0, 0.5), vec3(0.55, 0.35, 1.0), smoothstep(0.18, 0.6, d.y)) * aur * 1.3 * uAurora;
      }

      // Moonlit clouds low in the sky: dark blue bodies with silver edges toward the moon; they hide the stars behind.
      float md = dot(d, uMoon);
      vec2 cuv = d.xz / (d.y + 0.16) * 0.9 + vec2(uTime * 0.004, 0.0);
      float cn = fbm(cuv);
      float cn2 = fbm(cuv + normalize(uMoon.xz + vec2(1e-4)) * 0.05);
      float cm = smoothstep(mix(0.82, 0.42, uCloud), mix(0.82, 0.42, uCloud) + 0.2, cn) * smoothstep(0.0, 0.07, d.y) * (1.0 - 0.8 * smoothstep(0.22, 0.8, d.y));
      float rim = clamp(0.5 + (cn - cn2) * 9.0, 0.0, 1.0);
      float moonAmt = 0.3 + 0.7 * pow(max(md, 0.0), 3.0);
      vec3 cloudCol = mix(vec3(0.012, 0.026, 0.065), vec3(0.78, 0.84, 1.0), rim * moonAmt * 0.85);
      vec3 col = sky * (1.0 - cm) * 0.7 * mix(1.0, 0.7, smoothstep(0.2, 0.7, d.y)) + cloudCol * cm * 0.9;

      col = addMoon(col, d);

      // Night glow: deep blue overhead, a warm rose haze along the horizon (distant lights on the dust).
      vec3 glow = mix(vec3(0.11, 0.06, 0.08), vec3(0.002, 0.006, 0.02), pow(clamp(d.y * 1.7, 0.0, 1.0), 0.45));
      gl_FragColor = vec4((col * above + glow) * uNight * 1.9, 1.0);
      #include <colorspace_fragment>
    }`,
});

// Daytime sky picture: replaces the physical sky while one is loaded.
const dayMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uPhoto: { value: null as THREE.Texture | null }, uAspect: { value: 1.5 }, uLight: { value: 1 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uPhoto; uniform float uAspect, uLight, uTime; varying vec3 vDir;
    ${PHOTO_GLSL}
    void main(){
      vec3 d = normalize(vDir);
      vec3 c = skyPhoto(uPhoto, d, uAspect, uTime);
      c *= mix(1.0, 0.8, smoothstep(0.2, 0.8, d.y)); // a little darker overhead
      c += vec3(0.1, 0.12, 0.16) * pow(1.0 - clamp(d.y * 2.2, 0.0, 1.0), 2.5) * 0.8; // lighter toward the mountains
      gl_FragColor = vec4(c * uLight * 1.9, 1.0);
      #include <colorspace_fragment>
    }`,
});

// Haze that seeps into the sky above the horizon, so the line between sky and land dissolves.
const hazeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, transparent: true,
  uniforms: { uHaze: { value: new THREE.Color() }, uAmt: { value: 1 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uHaze; uniform float uAmt; varying vec3 vDir;
    void main(){
      float y = max(normalize(vDir).y, 0.0);
      gl_FragColor = vec4(uHaze, 0.8 * uAmt * exp(-y * 7.0));
    }`,
});

const groundShader = {
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uBase: { value: new THREE.Color("#e8f0f4") }, uHaze: { value: new THREE.Color() },
    uReflect: { value: 0.85 }, uCracks: { value: 0.4 }, uLight: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 }, uKind: { value: 0 }, // uKind: 0 salt mirror, 1 meadow, 2 snow, 3 sand, 4 pebbles
    uCam: { value: new THREE.Vector3() }, uOffset: { value: new THREE.Vector2() },
    uGravel: { value: 0 }, // 1: the path is gravel
    uRoad: { value: 0 }, // 1: the path is an asphalt road with lane lines
    uPebble: { value: null as THREE.Texture | null }, uPebbleOn: { value: 0 }, // pebble maps: the stone picture (until it loads, a procedural pattern is used)
    uSea: { value: 0 }, // sand maps: how close the sea on the right comes (0 = none)
    uPath: { value: 0 }, uPathCol: { value: new THREE.Color("#7a6040") }, // half-width of a straight path along the walking direction (0 = none)
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uBase, uCam, uHaze;
    uniform float uReflect, uCracks, uLight, uNight, uTime, uKind, uPath, uSea, uRoad, uGravel, uPebbleOn; uniform vec2 uOffset; uniform vec3 uPathCol; uniform sampler2D uPebble;
    varying vec4 vUv; varying vec3 vWorld;
    ${GLSL_NOISE}
    // Round stones: x = distance to the nearest stone centre, y = gap to the second nearest (small = a seam between stones), z = a random tone per stone.
    vec3 stone(vec2 p){
      vec2 ip = floor(p), fp = fract(p);
      float d1 = 8.0, d2 = 8.0, id = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash(ip + g), hash(ip + g + 17.3));
        float d = length(g + o - fp);
        if (d < d1) { d2 = d1; d1 = d; id = hash(ip + g + 3.7); } else if (d < d2) d2 = d;
      }
      return vec3(d1, d2 - d1, id);
    }
    float edge(vec2 p){
      vec2 ip = floor(p), fp = fract(p);
      float d1 = 8.0, d2 = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash(ip + g), hash(ip + g + 7.3));
        float d = length(g + o - fp);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      return 1.0 - smoothstep(0.0, 0.07, d2 - d1);
    }
    void main(){
      // The world scrolls under the avatar by uOffset, so patterns move while the avatar walks.
      vec2 w = vWorld.xz + uOffset;
      float dist = distance(vWorld.xz, uCam.xz);
      // Thin water film: two scales of ripple distort the mirror, fading out with distance.
      vec2 rip = vec2(noise(w * 1.7 + uTime * 0.15), noise(w * 1.7 - uTime * 0.12)) - 0.5;
      rip += 0.5 * (vec2(noise(w * 6.0 + uTime * 0.3), noise(w * 6.0 - uTime * 0.25)) - 0.5);
      vec4 uv = vUv; uv.xy += rip * 0.014 * uv.w * (1.0 - smoothstep(10.0, 80.0, dist));
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 view = normalize(uCam - vWorld);
      float fres = 0.04 + 0.96 * pow(1.0 - clamp(view.y, 0.0, 1.0), 5.0);
      vec3 base = uBase * uLight;
      float jt = 0.0;
      if (uKind < 0.5) {
        jt = edge(w / 1.3) * uCracks * (1.0 - smoothstep(6.0, 45.0, dist));
        base = mix(base, base * 0.7, jt);
      } else if (uKind < 1.5) {
        // Meadow: broad patches of lighter and darker grass plus fine mottling.
        float n1 = fbm(w * 0.07), n2 = fbm(w * 0.8 + 4.0);
        base = mix(base * vec3(0.95, 1.05, 0.7), base * vec3(1.5, 1.4, 0.8), n1) * (0.9 + 0.3 * n2);
      } else if (uKind < 2.5) {
        // Snow: soft drifts with blue shadows, and a little glitter close by.
        // Wind-sculpted drifts: a height field lit from one side, so ridges catch light and hollows go blue.
        // Clumpy crust: four octaves of height (lumps of ~1.5 m down to grains), each fading out before it can alias.
        float f1 = 1.0 - smoothstep(60.0, 300.0, dist), f2 = 1.0 - smoothstep(25.0, 120.0, dist);
        float f3 = 1.0 - smoothstep(8.0, 45.0, dist), f4 = 1.0 - smoothstep(3.0, 18.0, dist);
        vec2 ld = vec2(0.6, 0.8) * 0.06;
        vec2 p0 = w, p1 = w + ld;
        float h0 = 0.8 * noise(p0 * 0.45) + 0.3 * f2 * noise(p0 * 2.1 + 3.0) + 0.3 * f2 * noise(vec2(p0.x * 0.8, p0.y * 3.6) + 11.0) + 0.22 * f3 * noise(p0 * 6.0 + 9.0) + 0.12 * f4 * noise(p0 * 17.0 + 5.0);
        float h1 = 0.8 * noise(p1 * 0.45) + 0.3 * f2 * noise(p1 * 2.1 + 3.0) + 0.3 * f2 * noise(vec2(p1.x * 0.8, p1.y * 3.6) + 11.0) + 0.22 * f3 * noise(p1 * 6.0 + 9.0) + 0.12 * f4 * noise(p1 * 17.0 + 5.0);
        float sh = clamp((h0 - h1) * 20.0, -1.0, 1.0); // slope toward the sun: positive faces the light
        float ao = smoothstep(0.1, 0.8, h0 / (0.8 + 0.35 * f2 + 0.22 * f3 + 0.12 * f4)); // hollows are darker
        vec3 lit = mix(vec3(0.85, 0.93, 1.1), vec3(1.0, 0.98, 0.93), clamp(uLight, 0.0, 1.0)), shade = vec3(0.58, 0.7, 1.0);
        base = uBase * (uLight * 1.9 + 0.16 + 0.52 * uNight) * mix(shade, lit, clamp(0.55 + 0.5 * sh, 0.0, 1.0)) * (0.8 + 0.3 * ao);
        // Glitter: grains that flash and fade, dense near the player.
        vec2 gc = floor(w * 60.0);
        float sp = step(0.985, hash(gc)) * (0.35 + 0.65 * hash(gc + floor(uTime * 1.5)));
        base += (vec3(1.0, 1.0, 1.1) * 0.7 + 0.5 * vec3(hash(gc + 3.1), hash(gc + 7.7), hash(gc + 1.3))) * sp * (1.0 - smoothstep(1.0, 20.0, dist)) * 1.6 * uLight;
      }
      else {
        float lightK = uLight * 1.7 + 0.14 + 0.5 * uNight;
        if (uKind > 3.5) {
          // Pebbles: small rounded stones close by, larger ones further out, a mottled gravel bed in the distance.
          float n1 = 1.0 - smoothstep(3.0, 22.0, dist), n2 = 1.0 - smoothstep(14.0, 80.0, dist);
          vec3 s1 = stone(w * 15.0), s2 = stone(w * 3.4 + 9.0);
          float dome1 = 1.0 - smoothstep(0.0, 0.62, s1.x), dome2 = 1.0 - smoothstep(0.0, 0.62, s2.x);
          vec3 c1 = uBase * (0.7 + 0.8 * s1.z) * (0.62 + 0.55 * dome1) * (0.55 + 0.45 * smoothstep(0.0, 0.16, s1.y));
          vec3 c2 = uBase * (0.75 + 0.6 * s2.z) * (0.65 + 0.45 * dome2) * (0.6 + 0.4 * smoothstep(0.0, 0.2, s2.y));
          vec3 c3 = uBase * (0.7 + 0.5 * fbm(w * 0.6));
          base = mix(mix(c3, c2, n2), c1, n1) * lightK;
          if (uPebbleOn > 0.5) {
            // The stone picture, mirrored at its edges and sampled at three scales with a turned copy so the repeat does not show.
            vec2 rw = mat2(0.8, -0.6, 0.6, 0.8) * w;
            vec3 pa = texture2D(uPebble, w / 1.3).rgb, pb = texture2D(uPebble, rw / 2.1 + 0.37).rgb, pc = texture2D(uPebble, w / 0.42 + 0.13).rgb;
            vec3 pt = mix(pa, pb, smoothstep(0.35, 0.65, noise(w * 0.13)));
            pt = mix(pt, pt * (0.55 + 0.9 * pc), 0.5 * (1.0 - smoothstep(3.0, 14.0, dist))); // fine stones only close by
            base = pt * uBase * 2.0 * lightK;
          }
        } else {
        // Sand: long wind-built dunes with fine ripples across them, lit from one side so each ridge has a warm bright face and a darker lee.
        float fr = 1.0 - smoothstep(10.0, 90.0, dist), fm = 1.0 - smoothstep(4.0, 30.0, dist);
        vec2 sd = vec2(0.6, 0.8) * 0.08;
        vec2 q0 = w, q1 = w + sd;
        float d0 = 0.9 * noise(vec2(q0.x * 0.07, q0.y * 0.16)) + 0.35 * fr * noise(vec2(q0.x * 0.5, q0.y * 1.4) + 5.0) + 0.14 * fr * noise(vec2(q0.x * 1.1 + 2.0 * noise(q0 * 0.25), q0.y * 7.0)) + 0.05 * fm * noise(q0 * 28.0);
        float d1 = 0.9 * noise(vec2(q1.x * 0.07, q1.y * 0.16)) + 0.35 * fr * noise(vec2(q1.x * 0.5, q1.y * 1.4) + 5.0) + 0.14 * fr * noise(vec2(q1.x * 1.1 + 2.0 * noise(q1 * 0.25), q1.y * 7.0)) + 0.05 * fm * noise(q1 * 28.0);
        float ss = clamp((d0 - d1) * 14.0, -1.0, 1.0);
        vec3 sunny = mix(vec3(0.9, 0.9, 1.0), vec3(1.05, 0.97, 0.86), clamp(uLight, 0.0, 1.0)), lee = vec3(0.62, 0.5, 0.42);
        base = uBase * (uLight * 1.7 + 0.14 + 0.5 * uNight) * mix(lee, sunny, clamp(0.55 + 0.5 * ss, 0.0, 1.0)) * (0.85 + 0.25 * d0);
        vec2 gs = floor(w * 80.0);
        base += vec3(1.0, 0.9, 0.7) * step(0.992, hash(gs)) * (1.0 - smoothstep(1.0, 12.0, dist)) * 0.6 * uLight; // a few glinting grains
        }
        if (uSea > 0.0) {
          // A beach: the sea lies to the right of the walking direction, with a wavering shoreline.
          float shore = mix(9.0, 1.8, uSea) + (noise(vec2(w.y * 0.05, 7.0)) - 0.5) * 3.0 + (noise(vec2(w.y * 0.4, 1.0)) - 0.5) * 0.6;
          float sd = w.x - shore;                       // beyond 0 = water
          float lap = 0.5 + 0.5 * cos(6.2831853 * fract(uTime * 0.07)); // the water creeps up the sand and falls back
          float wet = smoothstep(-2.4 - 0.8 * lap, 0.0, sd);
          base = mix(base, base * vec3(0.58, 0.55, 0.5), wet * (1.0 - smoothstep(0.0, 0.25, sd)));
          float depth = smoothstep(0.0, 1.0, clamp(sd / 16.0, 0.0, 1.0));
          // Swell lines rolling toward the shore, bent by noise so they are not straight stripes.
          float ph = fract(w.x * 0.11 + uTime * 0.1 + noise(vec2(w.x * 0.15, w.y * 0.12)) * 0.6);
          float wave = 0.5 + 0.5 * cos(6.2831853 * ph);
          vec3 water = mix(vec3(0.36, 0.78, 0.76), vec3(0.03, 0.26, 0.5), depth) * (uLight * 1.4 + 0.1 * uNight) * (0.8 + 0.4 * wave);
          water = mix(water, uHaze * 0.9, (0.05 + 0.4 * fres) * (0.3 + 0.7 * depth)); // the sky on the water
          float crest = smoothstep(0.9, 1.0, wave) * smoothstep(0.45, 0.7, noise(w * vec2(0.5, 0.7) + uTime * 0.15)) * (0.3 + 0.7 * (1.0 - depth));
          float foamW = 0.35 + 1.1 * lap + 0.5 * noise(vec2(w.y * 1.3, uTime * 0.2));
          float foam = (1.0 - smoothstep(0.0, foamW, sd)) * (0.6 + 0.4 * noise(w * 3.0));
          water = mix(water, vec3(1.0) * (uLight * 1.5 + 0.1 * uNight), clamp(foam + crest * 0.8, 0.0, 1.0));
          base = mix(base, water, smoothstep(-0.08, 0.08, sd));
        }
      }
      if (uPath > 0.0 && uKind > 0.5 && uRoad > 0.5) {
        // Asphalt: a worn surface, white lines along both edges and a double yellow line down the middle.
        float ax = abs(w.x);
        float pm = 1.0 - smoothstep(-0.04, 0.06, ax - uPath);
        float lit = uLight * 1.4 + 0.1 * uNight;
        vec3 road = uPathCol * lit * (0.82 + 0.22 * noise(w * 18.0)) * (0.9 + 0.2 * noise(vec2(w.x * 0.8, w.y * 0.05)));
        road = mix(road, vec3(0.9) * lit, smoothstep(0.07, 0.03, abs(ax - (uPath - 0.45))) * 0.85);
        road = mix(road, vec3(0.95, 0.75, 0.1) * lit, smoothstep(0.06, 0.02, abs(ax - 0.1)) * 0.9);
        base = mix(base, road, pm);
      } else if (uPath > 0.0 && uKind > 0.5) {
        // A natural track: a width that wanders, soft ragged edges where the grass creeps in, a strip of grass down the
        // middle, patchy color, pebbles, and (gravel) a grain of small stones.
        float lit = uLight * 1.3 + 0.12 * uNight;
        float hw = uPath * (0.8 + 0.4 * noise(vec2(w.y * 0.09, 5.0))) + (noise(vec2(w.y * 0.8, 1.0)) - 0.5) * 0.5;
        float rag = (noise(w * 1.7) - 0.5) * 0.9 + (noise(w * 6.0) - 0.5) * 0.35;
        float d = abs(w.x) - hw - rag;
        float pm = 1.0 - smoothstep(-0.5, 0.45, d);                       // wide, soft transition into the grass
        pm *= 1.0 - 0.5 * smoothstep(0.35, 0.6, noise(w * 3.0 + 9.0)) * smoothstep(-0.9, 0.0, d); // grass patches near the edge
        float mid = smoothstep(0.55, 0.75, noise(vec2(w.x * 2.2 + 4.0, w.y * 0.5))) * (1.0 - smoothstep(0.0, 0.8 * uPath, abs(w.x - 0.0))) * step(1.2, uPath); // a grass strip between the wheel lines
        pm *= 1.0 - 0.7 * mid;
        float rut = 1.0 - 0.22 * exp(-pow((abs(w.x) - 0.5 * min(uPath, 1.1)) / 0.2, 2.0));
        float patchy = 0.78 + 0.35 * noise(w * 0.9) + 0.18 * noise(w * 5.0);
        vec3 pc = uPathCol * patchy * rut;
        vec2 cell = floor(w * 34.0);
        float round = smoothstep(0.42, 0.18, length(fract(w * 34.0) - 0.5 + (vec2(hash(cell + 2.1), hash(cell + 5.9)) - 0.5) * 0.3)); // round, not square
        float pebble = step(0.84, hash(cell)) * (0.6 + 0.8 * hash(cell + 7.7)) * round;
        pc = mix(pc, pc * 1.7 + 0.04, pebble * 0.55);                       // light pebbles
        pc = mix(pc, pc * 0.45, step(0.92, hash(cell + 3.3)) * 0.8 * round);        // dark ones
        if (uGravel > 0.5) {
          vec2 gc = floor(w * 70.0);
          float st = hash(gc) * smoothstep(0.55, 0.2, length(fract(w * 70.0) - 0.5)) + 0.3;
          vec3 stone = mix(vec3(0.55, 0.52, 0.47), vec3(0.78, 0.74, 0.66), hash(gc + 1.3)) * mix(0.55, 1.1, st);
          pc = mix(pc, stone * (uPathCol.r + uPathCol.g + uPathCol.b) * 1.1, 0.75);
        }
        base = mix(base, pc * lit, pm);
      }
      // Salt under a film of water: strong mirror at grazing angles, a bit of salt showing below.
      float k = uKind < 0.5 ? clamp(uReflect * mix(0.55, 1.0, fres) + fres * 0.4, 0.0, 1.0) : clamp(uReflect * fres, 0.0, 0.3);
      vec3 col = mix(base, refl, k);
      // Far away the salt mirrors the sky, a shade darker; meadow and snow dissolve into the haze.
      // A meadow keeps a dark, green horizon (a bright haze would wash it out); salt and snow melt into the pale haze.
      vec3 hz = (uKind > 0.5 && uKind < 1.5) ? mix(base * 0.55, uHaze * 0.35, 0.4) : uHaze;
      vec3 far = uKind < 0.5 ? refl * 0.93 : mix(base, hz * 0.9, 0.55);
      col = mix(col, far, smoothstep(150.0, 900.0, dist));
      // Horizon: a thin bright haze band where the ground meets the sky, so the two never merge.
      col = mix(col, hz, min(1.0, 0.85 * exp(-view.y * 90.0) + 0.45 * exp(-view.y * 26.0)));
      col *= 1.0 - 0.2 * jt; // cracks stay visible through the mirror
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// Rough horizon tint by sun height, used for mountains and ambient light only (the sky itself is physical).
const HORIZON = { day: new THREE.Color("#c9dcee"), dusk: new THREE.Color("#f0a479"), night: new THREE.Color("#141b3a") };

// Real 3D mountain range for snowy maps: a height field around the camera, lit by the sun so faces are bright or blue-shaded,
// with bare rock on steep slopes, snow elsewhere, and fog pooling in the valleys.
const rangeMat = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uHaze: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0.5, 0.7, 0.3) }, uLight: { value: 1 }, uNight: { value: 0 }, uSnow: { value: 1 }, uMeadow: { value: 0 }, uDeep: { value: 0 }, uTrees: { value: 0 }, uTop: { value: 400 }, uFogK: { value: 0.0011 }, uCol1: { value: new THREE.Color() }, uCol2: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normal; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHaze, uSun, uCol1, uCol2; uniform float uLight, uNight, uSnow, uMeadow, uDeep, uTrees, uTop, uFogK; varying vec3 vN; varying vec3 vP;
      ${GLSL_NOISE}
      void main(){
        vec3 n = normalize(vN); if (n.y < 0.0) n = -n;
        float dist = length(vP.xz);
        float grain = fbm(vP.xz * 0.011 + vP.y * 0.02), fine = fbm(vP.xz * 0.06 + vP.y * 0.05);
        float steep = 1.0 - n.y;
        float snowM = smoothstep(0.4, 0.2, steep + (grain - 0.5) * 0.45) * smoothstep(30.0, 140.0, vP.y + grain * 90.0) * uSnow;
        vec3 rock = mix(vec3(0.06, 0.09, 0.15), vec3(0.24, 0.27, 0.34), fine);
        vec3 albedo = mix(rock, vec3(0.97, 0.98, 1.0), snowM);
        // Conifer forest on the gentle lower slopes.
        float treeM = uTrees * smoothstep(130.0, 30.0, vP.y + (grain - 0.5) * 90.0) * (1.0 - smoothstep(0.3, 0.5, steep));
        albedo = mix(albedo, vec3(0.02, 0.05, 0.06) * (0.7 + 0.8 * fine), treeM); // dark, smooth: speckles read as noise at night
        float lit = smoothstep(-0.05, 0.65, dot(n, normalize(uSun)));
        vec3 col = albedo * (vec3(0.2, 0.3, 0.68) * (0.5 + 0.5 * n.y) + vec3(1.0, 0.97, 0.9) * 1.45 * lit);
        col *= 1.7 * uLight + 0.2 * uNight;
        // Layered hills (meadow, salt desert): flat-colored slopes, no snow, and fog thick enough that every layer is paler than the one before.
        if (uMeadow > 0.5) {
          vec3 forest = mix(uCol1, uCol2, fine);
          col = forest * (0.45 + 1.1 * lit) * (mix(1.5, 1.0, uDeep) * uLight + 0.2 * uNight);
          // Snow above the snow line on the high peaks, thinning out on the steep rock faces.
          float line = uTop * (0.78 - 0.3 * uSnow) + (grain - 0.5) * uTop * 0.2;
          float cap = uSnow * smoothstep(line, line + uTop * 0.12, vP.y) * smoothstep(0.7, 0.35, steep + (fine - 0.5) * 0.4);
          vec3 snowCol = vec3(0.97, 0.99, 1.0) * (0.85 + 0.9 * lit) * (mix(1.5, 1.0, uDeep) * uLight + 0.2 * uNight) + vec3(0.0, 0.02, 0.06) * (1.0 - lit);
          col = mix(col, snowCol, cap);
        }
        float fog = 1.0 - exp(-dist * mix(0.00032, mix(uFogK, 0.0016, uDeep), uMeadow));
        fog = max(fog, (1.0 - smoothstep(0.0, 220.0, vP.y)) * (1.0 - exp(-dist * 0.0012)) * mix(0.8, 0.55, uMeadow)); // valley mist
        col = mix(col, uHaze * mix(vec3(1.0), vec3(0.42, 0.54, 0.8), uDeep), clamp(fog, 0.0, mix(0.96, 0.78, uDeep))); // a deep-colored range fades to a darker blue haze, not to white
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

const NIGHT_HAZE = new THREE.Color(0.55, 0.66, 1.1); // band color at night, before tone mapping
const AHEAD = 1.3; // how far in front of the camera pivot the avatar stands, in meters
const SKY_SCALE = 4000;

const printTmp = new THREE.Object3D(); // reused every frame by stepPrints

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.3, 7000);
  yaw = 0;
  pitch = 0.12;
  walking = false;
  sitting = true;
  night = 0;
  windLevel = 0.4;
  dist = 4.4; // camera distance behind the pivot
  private sit = 1;
  private t = 0;
  private gait = 0;
  private amp = 0;
  private pos = new THREE.Vector2();
  private bloom!: UnrealBloomPass;
  private composer!: EffectComposer; // scene -> soft bloom on the brightest parts -> tone mapping and color output
  private sky = new Sky();
  private hazeDome = new THREE.Mesh(new THREE.SphereGeometry(1700, 32, 16), hazeMat);
  private dayDome = new THREE.Mesh(new THREE.SphereGeometry(1790, 32, 16), dayMat);
  private dayLoaded = false;
  sunUp = true;
  private stars = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), nightMat);
  private ground: Reflector; // salt: mirrors the sky
  private plain!: THREE.Mesh; // meadow and snow: the same ground shader without the mirror pass
  private grass!: THREE.Mesh;
  private grassWind!: THREE.IUniform;
  private treeSets: Partial<Record<string, THREE.Mesh>> = {}; // trees on both sides of a path, built when a map first needs the kind
  private treeDens = { value: 0 };
  private treeSide = { value: new THREE.Vector2(0, 0) }; // x: -1 left / 1 right / 0 both sides of the path; y: meters from the path centre where trees start
  private flowerAmt = { value: 1 }; // how many blades are wildflowers (1 = about 3.5%)
  private flowerN = { value: 0 }; // number of custom flower colors (0 = the default mix)
  private flowerCols = { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] };
  private treeCol = { value: new THREE.Color("#2f5d2a") };
  private locked = false; // the map fixes the camera (no turning, no tilting)
  private horizonH = 0.4; // where the horizon sits, as a fraction of the screen height from the bottom
  private printMesh!: THREE.InstancedMesh;
  private flakes!: THREE.Points;
  private snowAmt = { value: 0 }; // snowfall strength, eased toward a random target
  private snowGoal = 0;
  private snowLeft = 0; // seconds until the weather is rolled again
  private prints: { x: number; z: number; yaw: number }[] = [];
  private stride = 0;
  private side = 1;
  private kind = 0; // 0 salt, 1 meadow, 2 snow
  private gu: Record<string, THREE.IUniform>;
  private range!: THREE.Mesh; // the 3D height-field mountain range (every map with mountains)
  private sunLight = new THREE.DirectionalLight(0xffffff, 1);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.2);
  private avatar = new THREE.Group();
  private persons: Record<string, Person> = {};
  private person!: Person;
  private animation = "walk/Standard Walk.fbx";
  private clothes?: ClothesSpec;
  private map?: MapSpec;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.4;

    this.sky.scale.setScalar(SKY_SCALE);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -2;
    this.stars.renderOrder = -1;
    this.hazeDome.renderOrder = 0;
    this.hazeDome.frustumCulled = false;
    this.dayDome.renderOrder = -1.5;
    this.dayDome.frustumCulled = false;
    this.dayDome.visible = false;
    this.stars.frustumCulled = false;
    this.avatar.scale.setScalar(0.7); // keep the person understated
    this.setBody(BODIES[0].id);
    this.scene.add(this.sky, this.dayDome, this.stars, this.hazeDome, this.sunLight, this.hemi, this.avatar);
    this.makeEnvironment();

    this.ground = new Reflector(new THREE.PlaneGeometry(8000, 8000), {
      textureWidth: Math.round(innerWidth * 0.6), textureHeight: Math.round(innerHeight * 0.6), clipBias: 0.003, shader: groundShader,
    });
    this.ground.rotation.x = -Math.PI / 2;
    this.gu = (this.ground.material as THREE.ShaderMaterial).uniforms;
    this.scene.add(this.ground);

    // Meadow and snow have no mirror: a plain plane sharing every uniform of the mirror ground.
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    this.plain = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.ShaderMaterial({ uniforms: { ...this.gu, tDiffuse: { value: blank }, textureMatrix: { value: new THREE.Matrix4() } }, vertexShader: groundShader.vertexShader, fragmentShader: groundShader.fragmentShader }),
    );
    this.plain.rotation.x = -Math.PI / 2;
    this.plain.visible = false;
    this.scene.add(this.plain);
    this.makeGrass();
    this.makePrints();

    const RS = 720, RR = 90;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array((RS + 1) * (RR + 1) * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < RR; j++) for (let i = 0; i < RS; i++) { const a = j * (RS + 1) + i, b = a + RS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    rg.setIndex(idx);
    this.range = new THREE.Mesh(rg, rangeMat());
    this.range.frustumCulled = false;
    this.range.visible = false;
    this.scene.add(this.range);
    this.newScenery();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Only values above the threshold glow: the moon, the sun, bright stars and the horizon haze.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    addEventListener("resize", () => this.resize());
    this.bindDrag();
  }

  // Tens of thousands of grass blades in one draw call. They tile around the avatar and sway in travelling waves of wind.
  private makeGrass() {
    const N = 170000, TILE = 24;
    const g = new THREE.InstancedBufferGeometry();
    // One blade: three tapering segments plus a tip (x = side -1..1, y = height 0..1).
    const verts: number[] = [];
    for (const [t, w] of [[0, 1], [0.34, 0.85], [0.68, 0.55]]) verts.push(-w, t, 0, w, t, 0);
    verts.push(0, 1, 0);
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
    const off = new Float32Array(N * 2), rnd = new Float32Array(N * 3);
    for (let i = 0; i < off.length; i++) off[i] = Math.random() * TILE;
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 2));
    g.setAttribute("aRand", new THREE.InstancedBufferAttribute(rnd, 3));
    g.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uOffset: this.gu.uOffset, uTime: this.gu.uTime, uCol: this.gu.uBase, uLight: this.gu.uLight, uWind: { value: 1 }, uTile: { value: TILE }, uPath: this.gu.uPath, uRoad: this.gu.uRoad, uFlowers: this.flowerAmt, uFlN: this.flowerN, uFl: this.flowerCols },
      vertexShader: /* glsl */ `
        attribute vec2 aOff; attribute vec3 aRand;
        uniform vec2 uOffset; uniform float uTime, uWind, uTile, uPath, uFlowers, uFlN, uRoad; uniform vec3 uFl[4];
        varying float vT; varying float vTone; varying float vDist; varying vec3 vSp; varying vec3 vFc; varying float vPatch;
        void main(){
          // Each blade repeats every uTile meters; this picks the copy nearest to the avatar, which stands at the origin.
          vec2 pat = aOff + uTile * floor((uOffset - aOff) / uTile + 0.5);
          vec2 sc = pat - uOffset;
          float t = position.y;
          // Three kinds of plant: fine grass (70%), broad leaves (23%) and a few tall reeds (7%).
          float sp = fract(aRand.x * 43.7 + aRand.z * 17.3);
          float broad = step(0.7, sp) * step(sp, 0.93), reed = step(0.93, sp) * step(sp, 0.965), flower = (1.0 - step(0.93, sp) * step(sp, 0.965)) * step(fract(aRand.z * 57.3 + aRand.y * 29.1), 0.035 * uFlowers);
          vSp = vec3(broad, reed, flower);
          float hue = fract(aRand.y * 97.3);   // wildflower colour: white, yellow, pink, violet, orange, blue
          vFc = uFlN > 0.5 ? uFl[int(floor(hue * uFlN))] : hue < 0.17 ? vec3(1.0, 0.98, 0.92) : hue < 0.34 ? vec3(1.0, 0.8, 0.08) : hue < 0.51 ? vec3(1.0, 0.38, 0.6) : hue < 0.68 ? vec3(0.6, 0.32, 0.95) : hue < 0.85 ? vec3(1.0, 0.45, 0.08) : vec3(0.3, 0.48, 1.0);
          float height = (0.22 + 0.5 * aRand.x * aRand.x + 0.1 * aRand.y) * mix(1.0, 0.85, broad) * mix(1.0, 2.0, reed) * mix(1.0, 0.8, flower);
          vPatch = 0.5 + 0.5 * sin(pat.x * 0.11 + 1.3) * sin(pat.y * 0.09 + 0.4) + 0.25 * sin(pat.x * 0.043 - pat.y * 0.05);
          float ang = aRand.z * 6.2831853;
          vec3 p = vec3(sc.x, 0.0, sc.y);
          // Thin blades that lean away from the root in a random direction, more the taller they are.
          vec2 lean = vec2(cos(ang + 1.7), sin(ang + 1.7)) * (0.05 + 0.2 * aRand.y) * height * t * t;
          p.xz += vec2(cos(ang), sin(ang)) * position.x * (0.0045 + 0.004 * aRand.y) * mix(1.0, 2.4, broad) * mix(1.0, 0.7, reed) * mix(1.0, mix(1.0, 7.0, step(0.6, t)), flower) * (1.0 - 0.5 * t) + lean; // a flower's top segments swell into the blossom
          p.y = t * height - 0.18 * height * t * t * (0.4 + aRand.y); // the tip droops
          // Wind: waves running across the field plus a faster flutter, bending each tip downwind.
          float wave = sin(uTime * 1.4 + pat.x * 0.22 + pat.y * 0.13) + 0.5 * sin(uTime * 2.9 + pat.x * 0.7 - pat.y * 0.4) + 0.25 * sin(uTime * 5.3 + aRand.z * 40.0);
          float bend = (0.3 + wave * 0.45) * uWind * t * t * height;
          p.xz += vec2(0.9, 0.44) * bend;
          p.y -= abs(bend) * 0.25 * t;
          vT = t; vTone = aRand.y; vDist = length(sc);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          // Thin out toward the edge of the tile instead of ending in a hard border.
          float cut = fract(aRand.x * 91.7 + aRand.y * 37.1 + aRand.z * 13.3);
          // Tufts: slowly varying density leaves thin patches between thick clumps.
          float clump = smoothstep(-1.1, 0.4, sin(pat.x * 0.37) * sin(pat.y * 0.41) + 0.5 * sin(pat.x * 0.9 + pat.y * 0.7));
          if (cut < smoothstep(7.0, 11.5, vDist) || fract(cut * 7.13) > 0.25 + 0.75 * clump || (uPath > 0.0 && abs(pat.x) < uPath * 0.55 + (uRoad > 0.5 ? uPath * 0.45 + 0.35 : 1.1 * fract(cut * 3.7)))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // none on the path
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform float uLight; varying float vT; varying float vTone; varying float vDist; varying vec3 vSp; varying vec3 vFc; varying float vPatch;
        void main(){
          // Dark olive root in shade, rich green blade, sun-lit yellow-green tip; every blade has its own tone.
          vec3 root = uCol * vec3(0.38, 0.5, 0.2), mid = uCol * vec3(0.95, 1.05, 0.5), tip = uCol * vec3(1.55, 1.7, 0.75);
          vec3 c = mix(root, mid, smoothstep(0.0, 0.5, vT));
          c = mix(c, tip, smoothstep(0.45, 1.0, vT));
          c *= mix(vec3(0.82, 1.0, 1.1), vec3(1.25, 1.08, 0.65), vPatch); // whole patches lean blue-green or yellow-green
          c = mix(c, c * vec3(0.7, 0.95, 0.8), vSp.x);                         // broad leaves: deeper green
          c = mix(c, mix(c * vec3(1.1, 1.1, 0.8), vec3(0.62, 0.5, 0.2) * uCol.g * 3.0, smoothstep(0.78, 1.0, vT)), vSp.y); // reeds: pale stems, tan seed heads
          c *= 0.7 + 0.6 * vTone;
          c = mix(c, vFc * (0.9 + 0.5 * uLight), vSp.z * smoothstep(0.5, 0.64, vT)); // blossom on top of a green stem
          c = mix(c, c * vec3(1.15, 1.0, 0.55), step(0.86, vTone) * 0.7); // a few dry, yellowed blades
          c *= 0.55 + 0.45 * smoothstep(0.0, 0.35, vT); // occlusion between the blades near the ground
          c += vec3(0.07, 0.09, 0.0) * pow(vT, 3.0); // light shining through the tips
          gl_FragColor = vec4(c * uLight, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.grassWind = mat.uniforms.uWind;
    this.grass = new THREE.Mesh(g, mat);
    this.grass.frustumCulled = false;
    this.grass.visible = false;
    this.scene.add(this.grass);
  }

  // Trees scattered over a wide tile that repeats around the walker, leaving the path clear. Four kinds: fir (five
  // drooping tiers), spruce (tall and narrow), birch (white trunk with dark marks, light crown) and broadleaf (round crown).
  // Needles and leaves are a noise pattern and the undersides of the tiers or clumps are in shadow.
  private makeTreeSet(type: "fir" | "spruce" | "birch" | "broadleaf") {
    const cfg = { fir: { n: 1300, h0: 4.5, hr: 6, wide: 1 }, spruce: { n: 1300, h0: 8, hr: 12, wide: 0.7 }, birch: { n: 1000, h0: 9, hr: 6, wide: 1 }, broadleaf: { n: 900, h0: 5, hr: 4, wide: 1 } }[type];
    const TILE = 160;
    const piece = (g: THREE.BufferGeometry, part: number, tier: (y: number) => number, shade: (y: number) => number) => {
      const flat = g.index ? g.toNonIndexed() : g;
      const n = flat.attributes.position.count, tiers = new Float32Array(n), shades = new Float32Array(n);
      for (let v = 0; v < n; v++) { const y = flat.attributes.position.getY(v); tiers[v] = tier(y); shades[v] = shade(y); }
      flat.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
      flat.setAttribute("aTier", new THREE.BufferAttribute(tiers, 1));
      flat.setAttribute("aShade", new THREE.BufferAttribute(shades, 1));
      return flat;
    };
    const parts: THREE.BufferGeometry[] = [];
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    const blobs = (list: [number, number, number, number][]) => {
      for (const [x, y, z, r] of list) {
        const blob = new THREE.IcosahedronGeometry(r, 0); blob.translate(x, y, z);
        parts.push(piece(blob, 1, (yy) => clamp01(yy), (yy) => clamp01((yy - (y - r)) / (2 * r))));
      }
    };
    if (type === "fir" || type === "spruce") {
      const tiers = type === "fir" ? 5 : 9;
      const trunk = new THREE.CylinderGeometry(0.03, 0.06, 0.55, 7); trunk.translate(0, 0.27, 0);
      parts.push(piece(trunk, 0, () => 0, () => 1));
      for (let i = 0; i < tiers; i++) {
        const k = i / (tiers - 1);
        const r = (type === "fir" ? 0.52 : 0.34) * (1 - k * 0.8), h = type === "fir" ? 0.46 - i * 0.03 : 0.2, base = type === "fir" ? 0.16 + i * 0.17 : 0.08 + i * 0.1;
        const cone = new THREE.ConeGeometry(r, h, type === "fir" ? 9 : 7, 1, false);
        cone.rotateY(i * 0.7);
        cone.translate(0, base + h / 2, 0);
        parts.push(piece(cone, 1, () => (i + 0.5) / tiers, (y) => clamp01((y - base) / h))); // shade 0 at the rim, 1 at the tip
      }
    } else if (type === "birch") {
      const trunk = new THREE.CylinderGeometry(0.014, 0.03, 0.78, 6); trunk.translate(0, 0.39, 0);
      parts.push(piece(trunk, 0, () => 0, () => 1));
      blobs([[0, 0.82, 0, 0.13], [0.12, 0.7, 0.04, 0.11], [-0.11, 0.72, -0.05, 0.11], [0.03, 0.92, 0.08, 0.1], [-0.06, 0.6, 0.09, 0.1], [0.08, 0.56, -0.07, 0.09], [-0.03, 0.78, -0.1, 0.1]]);
    } else {
      const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.4, 6); trunk.translate(0, 0.2, 0);
      parts.push(piece(trunk, 0, () => 0, () => 1));
      blobs([[0, 0.62, 0, 0.28], [0.2, 0.5, 0.05, 0.2], [-0.2, 0.52, -0.05, 0.21], [0.05, 0.8, 0.08, 0.2], [-0.05, 0.45, 0.16, 0.18]]);
    }
    const merged = mergeGeometries(parts, false)!;
    const g = new THREE.InstancedBufferGeometry();
    g.index = null;
    for (const k of ["position", "normal", "aPart", "aTier", "aShade"]) g.setAttribute(k, merged.getAttribute(k));
    const N = cfg.n;
    const off = new Float32Array(N * 2), rnd = new Float32Array(N * 3);
    for (let i = 0; i < off.length; i++) off[i] = Math.random() * TILE;
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 2));
    g.setAttribute("aRand", new THREE.InstancedBufferAttribute(rnd, 3));
    g.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOffset: this.gu.uOffset, uLight: this.gu.uLight, uHaze: this.gu.uHaze, uPath: this.gu.uPath, uTile: { value: TILE }, uDens: this.treeDens, uTreeCol: this.treeCol, uTime: this.gu.uTime, uHeight: { value: new THREE.Vector2(cfg.h0, cfg.hr) }, uWide: { value: cfg.wide }, uBirch: { value: type === "birch" ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute vec2 aOff; attribute vec3 aRand; attribute float aPart, aTier, aShade;
        uniform vec2 uOffset, uHeight; uniform float uTile, uPath, uDens, uTime, uWide;
        varying float vPart, vDist, vTier, vShade, vLight, vTint; varying vec3 vLocal;
        void main(){
          vec2 pat = aOff + uTile * floor((uOffset - aOff) / uTile + 0.5);
          vec2 sc = pat - uOffset;
          float dist = length(sc);
          float size = uHeight.x + uHeight.y * aRand.x;
          float wide = uWide * (0.8 + 0.5 * fract(aRand.x * 7.3 + aRand.y * 3.1)); // some trees slim, some broad
          // Not on the path, not too many (density), not beyond the view distance.
          float gone = step(uDens, aRand.z) + step(abs(pat.x), uPath + 1.5 + 2.0 * aRand.y + 0.4 * size * wide) /* a bigger crown stays further from the path */ + step(115.0, dist);
          vec3 p = position;
          p.xz *= wide;
          p.x += sin(uTime * 0.8 + aRand.y * 20.0) * 0.012 * p.y; // a very small sway that grows toward the top
          vec3 world = vec3(sc.x, 0.0, sc.y) + p * size * (gone > 0.0 ? 0.0 : 1.0);
          vLight = 0.4 + 0.6 * max(dot(normalize(normal), normalize(vec3(0.4, 0.8, 0.3))), 0.0);
          vPart = aPart; vDist = dist; vTier = aTier; vShade = aShade; vTint = aRand.y; vLocal = position;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTreeCol, uHaze; uniform float uLight, uBirch;
        varying float vPart, vDist, vTier, vShade, vLight, vTint; varying vec3 vLocal;
        ${GLSL_NOISE}
        void main(){
          // Needle or leaf clusters: fine noise across the surface, with dark gaps between the clusters.
          float clump = fbm(vec2(vLocal.x * 26.0 + vLocal.z * 19.0, vLocal.y * 38.0 + vTint * 9.0));
          float tiers = 0.45 + 0.55 * smoothstep(0.0, 0.55, vShade);       // the underside of every tier or clump is in shadow
          float height = 0.7 + 0.5 * vTier;                                 // the crown is lighter than the skirt
          vec3 foliage = uTreeCol * (0.75 + 0.5 * vTint) * mix(0.5, 1.25, clump) * tiers * height;
          foliage = mix(foliage, foliage * vec3(1.25, 1.2, 0.8), smoothstep(0.75, 1.0, vShade) * 0.5); // sunlit tips
          vec3 bark = vec3(0.24, 0.16, 0.1) * (0.7 + 0.5 * fbm(vec2(vLocal.x * 80.0, vLocal.y * 14.0)));
          if (uBirch > 0.5) {
            // White birch bark with dark horizontal scars.
            float scar = smoothstep(0.62, 0.8, noise(vec2(vLocal.y * 55.0, vLocal.x * 30.0 + vTint * 5.0)) * 0.7 + noise(vec2(vLocal.y * 160.0, vLocal.z * 40.0)) * 0.5);
            bark = mix(vec3(0.92, 0.9, 0.84), vec3(0.08, 0.07, 0.06), scar);
          }
          vec3 col = mix(bark, foliage, vPart) * vLight * uLight * 1.7;
          col = mix(col, uHaze, smoothstep(45.0, 115.0, vDist) * 0.65);  // distance haze
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  // Photographic trees: flat cut-outs that always face the camera, scattered like the 3D trees (same tile, same path clearance).
  // They grow and slide past as the world scrolls. Each picture is one mesh; the pictures come from public/trees.
  private photoTrees: THREE.Mesh[] = [];
  private photoTreeInfo: { species: string; mesh: THREE.Mesh; dens: { value: number } }[] = [];
  private static PHOTO_TREE_FILES: Record<string, { files: string[]; h0: number; hr: number }> = {
    birch: { files: ["birch-1", "birch-2"], h0: 9, hr: 6 },
    spruce: { files: ["spruce-1", "spruce-2"], h0: 11, hr: 9 },
    oak: { files: ["oak-1", "oak-2"], h0: 8, hr: 5 },
    pine: { files: ["pine-1"], h0: 12, hr: 8 },
  };
  private makePhotoTrees() {
    const TILE = 160, PER = 150;
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0); // the trunk base sits on the ground
    for (const [species, cfg] of Object.entries(World.PHOTO_TREE_FILES)) {
      for (const file of cfg.files) {
        const g = new THREE.InstancedBufferGeometry();
        g.index = quad.index;
        for (const k of ["position", "uv"]) g.setAttribute(k, quad.getAttribute(k));
        const off = new Float32Array(PER * 2), rnd = new Float32Array(PER * 3);
        for (let i = 0; i < off.length; i++) off[i] = Math.random() * TILE;
        for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
        g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 2));
        g.setAttribute("aRand", new THREE.InstancedBufferAttribute(rnd, 3));
        g.instanceCount = PER;
        const dens = { value: 0 };
        const mat = new THREE.ShaderMaterial({
          uniforms: { uOffset: this.gu.uOffset, uLight: this.gu.uLight, uHaze: this.gu.uHaze, uPath: this.gu.uPath, uSide: this.treeSide, uTile: { value: TILE }, uDens: dens, uTex: { value: null as THREE.Texture | null }, uAspect: { value: 0.6 }, uHeight: { value: new THREE.Vector2(cfg.h0, cfg.hr) } },
          vertexShader: /* glsl */ `
            attribute vec2 aOff; attribute vec3 aRand;
            uniform vec2 uOffset, uHeight, uSide; uniform float uTile, uPath, uDens, uAspect;
            varying vec2 vUv; varying float vDist, vTint, vFade;
            void main(){
              vec2 pat = aOff + uTile * floor((uOffset - aOff) / uTile + 0.5);
              vec2 sc = pat - uOffset;
              float dist = length(sc);
              float h = uHeight.x + uHeight.y * aRand.x;
              float w = h * uAspect;
              // Not on the path (a wide crown keeps further away), not too many (density), not beyond the view distance.
              float gone = step(uDens, aRand.z) + step(abs(pat.x), uPath + 1.5 + 0.3 * w) + step(80.0, dist) + step(0.5, abs(uSide.x)) * step(uSide.x * pat.x, uSide.y); // one-sided forests start uSide.y m from the path; none beyond 80 m: every tree stands in front of the horizon mist
              vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
              vec3 world = vec3(sc.x, 0.0, sc.y) + (right * position.x * w + vec3(0.0, position.y * h, 0.0)) * (gone > 0.0 ? 0.0 : 1.0);
              vUv = vec2(aRand.y > 0.5 ? 1.0 - uv.x : uv.x, uv.y); // half of the trees are mirrored
              vDist = dist; vTint = aRand.y; vFade = smoothstep(3.0, 9.0, dist); // a tree beside the camera fades out instead of cutting through the view
              gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D uTex; uniform vec3 uHaze; uniform float uLight;
            varying vec2 vUv; varying float vDist, vTint, vFade;
            void main(){
              vec4 t = texture2D(uTex, vUv);
              if (t.a * vFade < 0.45) discard;
              vec3 col = t.rgb * (0.85 + 0.3 * vTint) * uLight * 1.5;
              // Far trees only get darker, never whiter: the horizon mist stays behind them.
              col *= 1.0 - 0.4 * smoothstep(30.0, 80.0, vDist);
              gl_FragColor = vec4(col, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        });
        const mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.scene.add(mesh);
        this.photoTrees.push(mesh);
        this.photoTreeInfo.push({ species, mesh, dens });
        new THREE.TextureLoader().load(`/trees/${file}.webp`, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          mat.uniforms.uTex.value = tex;
          mat.uniforms.uAspect.value = tex.image.width / tex.image.height;
        });
      }
    }
  }
  private showPhotoTrees(on: boolean, species: string[]) {
    if (on && this.photoTrees.length === 0) this.makePhotoTrees();
    const wanted = species.length ? species : Object.keys(World.PHOTO_TREE_FILES);
    const active = this.photoTreeInfo.filter((t) => wanted.includes(t.species)).length || 1;
    for (const t of this.photoTreeInfo) {
      t.mesh.visible = on && wanted.includes(t.species);
      t.dens.value = Math.min(1, this.treeDens.value * (this.photoTreeInfo.length / active)); // fewer species = more of each, so the forest keeps its fullness
    }
  }

  // Layered mountain pictures: three cylinders around the view (far, middle, near), each a strip with transparent sky.
  // The strip repeats mirrored so the seams never show. Far layers are lighter and hazier, so the ridges read as depth.
  private photoRanges: Record<string, THREE.Group> = {};
  private photoFog = { value: 0.3 }; // mist at the foot of the mountain pictures: strength of the body of the mist (0.2 light .. 0.4 thick); the lowest meters are always covered
  private showPhotoRange(name: string, mountains: number) {
    for (const [k, grp] of Object.entries(this.photoRanges)) grp.visible = k === name;
    if (!name) return;
    if (!this.photoRanges[name]) {
      const grp = new THREE.Group();
      const ru = (this.range.material as THREE.ShaderMaterial).uniforms;
      // name, radius, extra haze, draw order, height factor (far peaks rise above the nearer ridges), sideways shift, brightness.
      // Far layers are light and hazy, near layers dark and crisp: strong contrast between the layers.
      // The "blue" set is drawn in layered tones already (pale far, cobalt middle, navy near), so it needs no extra haze.
      const T = name === "blue" ? { far: [1.5, 0.15, 1], mid: [1.3, 0, 1], near: [1, 0, 1] } : name === "snow" ? { far: [1.3, 0.45, 1.1], mid: [1.15, 0.12, 1], near: [1, 0, 0.85] } : name === "green" ? { far: [1.25, 0.6, 1.15], mid: [1.15, 0.26, 0.8], near: [1, 0, 0.62] } : name === "rock" ? { far: [1.4, 0.64, 1.2], mid: [1.2, 0.26, 0.85], near: [1, 0, 0.66] } : { far: [1.6, 0.15, 0.5], mid: [1.4, 0.26, 0.85], near: [1, 0, 0.66] };
      const layers: [string, number, number, number, number, number, number][] = [
        ["far", 1500, T.far[1], 0, T.far[0], 0.0, T.far[2]],
        ["mid", 1150, T.mid[1], 1, T.mid[0], 0.37, T.mid[2]],
        ["near", 850, T.near[1], 2, T.near[0], 0.71, T.near[2]],
      ];
      for (const [part, R, haze, order, tall, shift, gain] of layers) {
        if (name === "green" && part === "far") continue; // the far picture is a cut-out of misty sky, not a ridge: the grassland looks better without it
        const mat = new THREE.ShaderMaterial({
          uniforms: { uTex: { value: null as THREE.Texture | null }, uHaze: ru.uHaze, uLight: ru.uLight, uNight: ru.uNight, uMix: { value: haze * 0.5 }, uShift: { value: shift }, uGain: { value: gain }, uFog: this.photoFog },
          vertexShader: `varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D uTex; uniform vec3 uHaze; uniform float uLight, uNight, uMix, uShift, uGain, uFog; varying vec2 vUv; varying float vY;
            void main(){
              // Four mirrored copies around the circle (a custom shader ignores texture.repeat), shifted so the layers' peaks do not line up.
              float f = fract((vUv.x * 4.0 + uShift) * 0.5) * 2.0;
              f = f > 1.0 ? 2.0 - f : f;
              vec4 t = texture2D(uTex, vec2(f, vUv.y));
              vec3 col = t.rgb * uGain * (1.6 * uLight + 0.2 * uNight);
              // Dawn/dusk haze is orange; mixed in it paints the photo like a colored filter. Use its brightness only (neutral, slightly cool).
              vec3 hz = vec3(dot(uHaze, vec3(0.333))) * vec3(0.9, 1.0, 1.15);
              col = mix(col, hz, uMix);
              // Mist rising from the ground: a thick strip hides the cut-off base of the picture, a thinner veil climbs the slopes.
              float mist = max(uFog * (1.0 - smoothstep(0.0, 160.0, vY)), 0.72 * (1.0 - smoothstep(0.0, 26.0, vY)));
              col = mix(col, hz * 1.1, mist);
              col *= 1.0 - 0.85 * uNight; // the photos are daylight pictures: at night they must sink into the dark
              gl_FragColor = vec4(col, max(t.a, mist * step(0.0, vY)));
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
          transparent: true, depthWrite: false, side: THREE.BackSide,
        });
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 96, 1, true), mat);
        mesh.renderOrder = -0.9 + order * 0.1; // after the star and night-sky domes (-2..-1), so they do not shine through the mountains
        mesh.frustumCulled = false;
        mesh.userData.R = R;
        mesh.userData.tall = tall;
        grp.add(mesh);
        new THREE.TextureLoader().load(`/mountains/${name}-${part}.webp`, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          mat.uniforms.uTex.value = tex;
          mesh.userData.aspect = tex.image.width / tex.image.height;
          this.sizePhotoRange(mesh, this.map?.horizon.mountains ?? 0.5);
        });
      }
      this.scene.add(grp);
      this.photoRanges[name] = grp;
    }
    this.photoRanges[name].visible = true;
    for (const mesh of this.photoRanges[name].children as THREE.Mesh[]) this.sizePhotoRange(mesh, mountains);
  }
  /** The strip is 90 degrees of the circle wide; its height follows the picture's shape and the map's mountain size. */
  private sizePhotoRange(mesh: THREE.Mesh, mountains: number) {
    const R = mesh.userData.R as number, aspect = (mesh.userData.aspect as number | undefined) ?? 2.4;
    const height = (((Math.PI / 2) * R) / aspect) * (0.25 + 0.8 * mountains) * ((mesh.userData.tall as number | undefined) ?? 1);
    const SINK = 40; // the bottom edge reaches well below the ground, so no sliver of the background shows where the ground ends
    mesh.scale.y = height + SINK - 3;
    mesh.position.y = (height + SINK - 3) / 2 - SINK;
  }

  // Concave snow impressions with a shaded bowl and a softly raised rim.
  private makePrints() {
    const geo = new THREE.RingGeometry(0, 0.5, 40, 8);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const center = new THREE.Color("#52667f"), middle = new THREE.Color("#c4d3e6"), rim = new THREE.Color("#c3d1e4"), edge = new THREE.Color("#6b7f9c");
    for (let i = 0; i < positions.count; i++) {
      let x = positions.getX(i), z = positions.getZ(i);
      const r = Math.min(1, Math.hypot(x, z) / 0.5);
      // Squeeze the disc into a boot sole: toe at -z (forward), wide ball, narrow waist, rounded heel at +z.
      const tt = z + 0.5, bump = (c: number, w: number) => Math.exp(-(((tt - c) / w) ** 2));
      const half = 0.5 * Math.min(1, 0.8 + 0.2 * bump(0.28, 0.22) + 0.04 * bump(0.82, 0.14) - 0.1 * bump(0.58, 0.12));
      x = (x / Math.sqrt(Math.max(0.25 - z * z, 1e-4))) * half;
      positions.setX(i, x);
      positions.setY(i, 0.002 + smooth(0.62, 0.98, r) * 0.008);
      // A bright frosted lip on the near (heel) edge and a deep blue shadow inside, on the far (toe) side, like a boot print in crust.
      const inside = 1 - smooth(0.62, 0.98, r), far = 0.3 + 0.7 * smooth(0.3, -0.35, z + 0.25 * x);
      const color = rim.clone().lerp(center, inside * far).lerp(middle, inside * (1 - far) * 0.6);
      color.lerp(edge, smooth(0.55, 0.82, r) * (1 - smooth(0.9, 1, r)) * 0.85); // a dark border where the boot cut the crust
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geo.attributes.position.needsUpdate = true;
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.printMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 6);
    this.printMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.printMesh.frustumCulled = false;
    this.printMesh.count = 0;
    this.printMesh.visible = false;
    this.printMesh.renderOrder = 1;
    this.scene.add(this.printMesh);

    // Snowfall: soft flakes recycled inside a box that follows the camera; positions are computed in the vertex shader.
    const seeds = new Float32Array(1400 * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
    this.flakes = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: this.gu.uTime, uCam: this.gu.uCam, uLight: this.gu.uLight, uAmt: this.snowAmt, uNight: this.gu.uNight },
      vertexShader: `
        uniform float uTime, uAmt; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 s = position;
          vec3 q = fract(s + vec3(uTime * 0.012 * (s.z - 0.5), -uTime * (0.025 + 0.03 * s.x), uTime * 0.01));
          vec3 wp = uCam + vec3((q.x - 0.5) * 26.0, q.y * 9.0 - 1.0, (q.z - 0.5) * 26.0);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((3.0 + 6.0 * s.y) * (s.z > 0.93 ? 2.4 : 1.0) * 38.0 / -mv.z, 2.0, 34.0);
          vA = uAmt * (0.25 + 0.5 * s.x) * smoothstep(0.0, 0.15, q.y) * smoothstep(1.0, 0.8, q.y);
        }`,
      fragmentShader: `
        uniform float uLight, uNight; varying float vA;
        // Plain alpha blending: white flakes would vanish against the bright day sky, so by day they are a cool grey-blue.
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; vec3 c = mix(vec3(0.55, 0.68, 0.9), vec3(1.0), uNight); gl_FragColor = vec4(c, min(1.0, vA * 1.8) * smoothstep(1.0, 0.25, d)); }`,
    }));
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
    this.scene.add(this.flakes);
  }

  private stepPrints(moving: boolean, dt: number, fx: number, fz: number) {
    if (this.kind < 2 || this.kind > 3) return;
    if (moving) {
      this.stride += WALK_SPEED * dt;
      if (this.stride >= 0.62) {
        this.stride -= 0.62;
        this.side = -this.side;
        // The avatar in pattern space (the world scrolls by `pos`), nudged to the left or right foot.
        this.prints.push({ x: this.pos.x + fx * AHEAD - fz * 0.11 * this.side, z: this.pos.y + fz * AHEAD + fx * 0.11 * this.side, yaw: this.yaw + this.side * 0.08 }); // toes point slightly outward
        if (this.prints.length > 6)this.prints.shift();
      }
    }
    const o = printTmp;
    let n = 0;
    for (const p of this.prints) {
      const sx = p.x - this.pos.x, sz = p.z - this.pos.y;
      if (sx * sx + sz * sz > 2000) continue;
      o.position.set(sx, 0, sz);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(0.09, 1, 0.213);
      o.updateMatrix();
      this.printMesh.setMatrixAt(n++, o.matrix);
    }
    this.printMesh.count = n;
    this.printMesh.instanceMatrix.needsUpdate = true;
  }

  // Image-based light from a clear daytime sky, so skin and cloth pick up soft sky color.
  private makeEnvironment() {
    const envScene = new THREE.Scene();
    const s = new Sky();
    s.scale.setScalar(50);
    const u = s.material.uniforms;
    u.sunPosition.value.set(0.6, 0.55, 0.3).normalize();
    u.cloudCoverage.value = 0.3;
    u.showSunDisc.value = 0;
    envScene.add(s);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(envScene).texture;
    pm.dispose();
  }

  private bindDrag() {
    let last: { x: number; y: number } | null = null;
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => { last = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
    c.addEventListener("pointermove", (e) => {
      if (!last || this.locked) return;
      this.yaw -= (e.clientX - last.x) * 0.006;
      this.pitch = Math.min(0.7, Math.max(-0.12, this.pitch + (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => (last = null);
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ground?.getRenderTarget().setSize(Math.round(w * 0.6), Math.round(h * 0.6)); // keep the mirror sharp after a window resize
  }

  setMap(m: MapSpec) {
    this.map = m;
    const kind = m.ground.kind === "grass" ? 1 : m.ground.kind === "snow" ? 2 : m.ground.kind === "sand" ? 3 : m.ground.kind === "pebble" ? 4 : 0;
    this.kind = kind;
    this.gu.uKind.value = kind;
    this.ground.visible = kind === 0; // the mirror pass only runs on salt
    this.plain.visible = kind !== 0;
    this.grass.visible = kind === 1;
    this.printMesh.visible = kind === 2 || kind === 3; // footprints stay in snow and sand (not on pebbles)
    (this.printMesh.material as THREE.MeshBasicMaterial).color.set(kind === 3 ? "#d9b48a" : "#ffffff");
    this.flakes.visible = false;
    this.snowLeft = 0;
    this.prints = [];
    this.grassWind.value = 0.35 + m.ambience.wind * 0.9;
    if (kind === 4 && !this.gu.uPebble.value) {
      new THREE.TextureLoader().load("/textures/pebbles.jpg", (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.anisotropy = 8;
        this.gu.uPebble.value = tex;
        this.gu.uPebbleOn.value = 1;
      });
    }
    this.gu.uSea.value = kind >= 3 ? (m.ground.sea ?? 0) : 0;
    this.flowerAmt.value = m.ground.flowers ?? 1;
    const fc = (m.ground.flowerColors ?? []).slice(0, 4);
    this.flowerN.value = fc.length;
    fc.forEach((c, i) => this.flowerCols.value[i].set(c));
    this.gu.uRoad.value = m.ground.pathStyle === "road" ? 1 : 0;
    this.gu.uGravel.value = m.ground.pathStyle === "gravel" ? 1 : 0;
    this.gu.uPath.value = (m.ground.path ?? 0) * 3.5; // half-width in meters: up to 3.5 m
    this.gu.uPathCol.value.set(m.ground.pathColor ?? "#7a6040");
    this.treeDens.value = m.scenery?.trees ?? 0;
    this.treeCol.value.set(m.scenery?.treeColor ?? "#2f5d2a");
    const treeKind = m.scenery?.treeType ?? "fir";
    if (this.treeDens.value > 0 && treeKind !== "photo") this.treeSets[treeKind] ??= this.makeTreeSet(treeKind);
    for (const [k, mesh] of Object.entries(this.treeSets)) mesh!.visible = k === treeKind && this.treeDens.value > 0;
    this.treeSide.value.set(m.scenery?.treeSide === "left" ? -1 : m.scenery?.treeSide === "right" ? 1 : 0, (m.scenery?.treeFrom ?? 0));
    this.showPhotoTrees(treeKind === "photo" && this.treeDens.value > 0, m.scenery?.photoTrees ?? []);
    this.locked = m.view?.locked === true;
    if (this.locked) this.pos.x = 0; // a fixed view walks straight ahead: start in the middle of the path
    this.horizonH = m.horizon.height ?? 0.4;
    this.gu.uBase.value.set(m.ground.color);
    this.gu.uReflect.value = kind >= 3 ? 0.03 : m.ground.reflect;
    this.gu.uCracks.value = kind === 0 ? m.ground.cracks : 0;
    if (m.sky.picture) { this.mapPicture = true; this.setSkyPhoto("day", m.sky.picture); }
    else if (this.mapPicture) { this.mapPicture = false; this.setSkyPhoto("day", null); } // leaving a map with its own sky picture
    nightMat.uniforms.uAurora.value = m.sky.aurora ?? 0;
    const u = this.sky.material.uniforms;
    u.cloudCoverage.value = 0.1 + m.sky.clouds * 0.6;
    u.cloudDensity.value = 0.4 + m.sky.clouds * 0.2;
    u.turbidity.value = 1 + m.sky.haze * 9;
    u.mieCoefficient.value = 0.0025; // less forward glare, so the sun can be looked at without a white-out
    u.mieDirectionalG.value = 0.68;
    u.rayleigh.value = 0.5 + m.sky.blue * 3.5;
    nightMat.uniforms.uStars.value = m.sky.stars;
    nightMat.uniforms.uCloud.value = m.sky.clouds;
    this.windLevel = m.ambience.wind;
    const real = this.usesRange();
    this.showPhotoRange(m.horizon.photo ?? "", m.horizon.mountains);
    this.photoFog.value = m.horizon.fog ?? 0.3;
    this.range.visible = real;
    hazeMat.uniforms.uAmt.value = m.horizon.photo ? 0.08 : 1; // pictures of mountains keep their colors: almost no horizon haze
    this.range.scale.y = m.horizon.mountains / 0.8;
    this.rangeDirty = real; // built in the next frame, so the sky-picture change that follows a map change does not build it twice
  }

  /** The moon is silver, or now and then a red one (a tint over the same surface picture). */
  setMoonRed(red: boolean) {
    nightMat.uniforms.uMoonTint.value.set(...(red ? [1.9, 0.38, 0.26] : [0.9, 0.97, 1.1]) as [number, number, number]);
    nightMat.uniforms.uMoonGlow.value.set(...(red ? [1.0, 0.22, 0.15] : [0.45, 0.62, 1.0]) as [number, number, number]);
  }
  moonOverride?: THREE.Vector3;
  private mapPicture = false;
  private photoUrl: Record<"day" | "night", string | null> = { day: null, night: null };
  /** Use a sky picture for the day or the night phase (null = the procedural sky). */
  setSkyPhoto(kind: "day" | "night", url: string | null) {
    if (url === this.photoUrl[kind]) return;
    this.photoUrl[kind] = url;
    if (!url) {
      if (kind === "night") nightMat.uniforms.uPhotoOn.value = 0;
      else this.dayLoaded = false;
      return;
    }
    new THREE.TextureLoader().load(url, (tex) => {
      if (this.photoUrl[kind] !== url) return; // a newer pick arrived meanwhile
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const aspect = tex.image.width / tex.image.height;
      const slot = kind === "night" ? nightMat.uniforms : dayMat.uniforms;
      const old = slot.uPhoto.value as THREE.Texture | null;
      if (kind === "night") { slot.uPhoto.value = tex; slot.uPhotoAspect.value = aspect; slot.uPhotoOn.value = 1; }
      else { slot.uPhoto.value = tex; slot.uAspect.value = aspect; this.dayLoaded = true; }
      old?.dispose(); // free the previous picture's GPU memory
    }, undefined, () => {
      this.photoUrl[kind] = null;
      if (kind === "night") nightMat.uniforms.uPhotoOn.value = 0; else this.dayLoaded = false; // a failed load must not leave the old picture up
    });
  }

  /** Fill the height field: ridged noise under an angular envelope (high massifs left and right of the first view, a saddle between). */
  private buildRange(seed: number) {
    const meadow = this.map?.ground.kind !== "snow"; // layered hills: rounded, low
    const RS = 720, RR = 90, R0 = 380, R1 = 1550; // stay inside the haze dome (1700), which would otherwise whiten the far layers
    const pos = this.range.geometry.attributes.position as THREE.BufferAttribute;
    const hh = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return s - Math.floor(s); };
    const vn = (x: number, y: number) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return hh(ix, iy) * (1 - u) * (1 - v) + hh(ix + 1, iy) * u * (1 - v) + hh(ix, iy + 1) * (1 - u) * v + hh(ix + 1, iy + 1) * u * v;
    };
    const ridged = (x: number, z: number) => {
      let s = 0, a = 0.5, f = 1 / 1100;
      for (let o = 0; o < 6; o++) { const r = 1 - Math.abs(2 * vn(x * f, z * f) - 1); s += a * r * r; a *= 0.5; f *= 2.1; }
      return s / 0.97;
    };
    let top = 1;
    for (let j = 0; j <= RR; j++) {
      const s = j / RR, r = R0 * Math.pow(R1 / R0, s);
      for (let i = 0; i <= RS; i++) {
        const a = (i / RS) * Math.PI * 2 - Math.PI, x = r * Math.cos(a), z = r * Math.sin(a);
        const front = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
        const ahead = this.map?.horizon.layout === "ahead"; // a mountain straight ahead instead of a valley between two
        const env = ahead
          ? Math.max(0.25, 0.3 + 1.25 * Math.exp(-((front / 0.26) ** 2)) + 0.35 * (Math.exp(-(((front + 0.6) / 0.25) ** 2)) + Math.exp(-(((front - 0.6) / 0.25) ** 2))))
          : Math.max(0.2, 0.3 + 0.85 * Math.exp(-(((front + 0.3) / 0.2) ** 2)) + 0.9 * Math.exp(-(((front - 0.32) / 0.2) ** 2)) - 0.2 * Math.exp(-((front / 0.1) ** 2)));
        const mask = Math.min(1, Math.max(0, (r - R0) / (R0 * 0.8)));
        const h = env * r * (meadow ? 0.11 + 0.15 * s : 0.14 + 0.2 * s) * Math.pow(ridged(x, z), meadow ? 0.95 : 1.4) * mask * 1.5 * (ahead ? 1.7 : 1); // a peak straight ahead is made much taller
        pos.setXYZ(j * (RS + 1) + i, x, h - 2 * (1 - mask), z);
        if (h > top) top = h;
      }
    }
    pos.needsUpdate = true;
    (this.range.material as THREE.ShaderMaterial).uniforms.uTop.value = top; // object space, like vP.y
    this.range.geometry.computeVertexNormals();
  }

  /** A small square JPEG of the current map at noon, for its card. The frame is drawn and read in the same task,
   *  so no preserved drawing buffer is needed; the normal loop redraws the real hour right after. */
  snapshot(size = 200): string {
    const savedYaw = this.yaw, savedPitch = this.pitch;
    this.yaw = 0; this.pitch = 0.12;
    this.update(0, 11);
    const src = this.renderer.domElement;
    const side = Math.min(src.width, src.height * 0.8);
    const out = document.createElement("canvas");
    out.width = out.height = size;
    // Centered on the horizon (about 60% down the frame), so sky, hills and ground all show.
    const sy = Math.max(0, Math.min(src.height - side, src.height * 0.6 - side * 0.5));
    out.getContext("2d")!.drawImage(src, (src.width - side) / 2, sy, side, side, 0, 0, size, size);
    this.yaw = savedYaw; this.pitch = savedPitch;
    return out.toDataURL("image/jpeg", 0.82);
  }

  private usesRange() { return !!this.map && this.map.horizon.mountains > 0 && !this.map.horizon.photo; }

  /** New mountain shapes with a fresh random seed (nothing is fixed, so no two visits look the same). */
  newScenery() {
    this.rangeDirty = false;
    if (this.usesRange()) this.buildRange(Math.random() * 1000);
  }
  private rangeDirty = false;
  setClothes(c: ClothesSpec) {
    this.clothes = c;
    for (const p of Object.values(this.persons)) p.setClothes(c);
  }

  setMotion(m: Motion) { Person.motion = m; }

  setAnimation(file: string) {
    this.animation = file;
    for (const p of Object.values(this.persons)) void p.setAnimation(file);
  }

  /** Choose the person; each body is fetched the first time it is needed. */
  setBody(id: string) {
    const body = BODIES.find((x) => x.id === id) ?? BODIES[0];
    let p = this.persons[body.id];
    if (!p) {
      p = this.persons[body.id] = new Person();
      this.avatar.add(p.group);
      if (this.clothes) p.setClothes(this.clothes);
      void p.setAnimation(this.animation);
      p.load(body.file, body.outfit).catch((e) => console.warn("person model failed", body.file, e));
    }
    this.person = p;
    for (const q of Object.values(this.persons)) q.group.visible = q === p;
  }

  update(dt: number, hour: number) {
    if ((this.map?.sky.hour ?? -1) >= 0) hour = this.map!.sky.hour; // a map can keep one time of day (a sunset that never ends)
    if (this.rangeDirty) this.newScenery();
    if (this.locked) { this.yaw = 0; this.pitch = 0.12; } // a fixed view: always facing straight ahead
    this.t += dt;
    this.sit += ((this.sitting ? 1 : 0) - this.sit) * Math.min(1, dt * 5);
    const moving = this.walking && !this.sitting;
    this.amp += ((moving ? 1 : 0) - this.amp) * Math.min(1, dt * 6);
    if (moving) this.gait += dt * 5.2;

    // The avatar always faces the camera heading, so only its back is ever visible.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (moving) this.pos.x += fx * WALK_SPEED * dt, this.pos.y += fz * WALK_SPEED * dt;
    this.avatar.rotation.y = this.yaw;
    this.avatar.position.set(fx * AHEAD, this.kind >= 2 ? 0.1 * this.sit : 0, fz * AHEAD); // sitting on snow or sand: lift the body so it is not buried
    this.person.pose(this.gait, this.amp, this.sit, this.t);
    this.stepPrints(moving, dt, fx, fz);

    if (this.kind === 2) {
      // Snowfall comes and goes: every 40-120 s roll a new amount, clear (30%) or anything from a flurry to a heavy fall.
      if ((this.snowLeft -= dt) <= 0) {
        this.snowLeft = 40 + Math.random() * 80;
        this.snowGoal = Math.random() < 0.3 ? 0 : 0.15 + 0.85 * Math.random();
      }
      this.snowAmt.value += (this.snowGoal - this.snowAmt.value) * Math.min(1, dt * 0.25);
      this.flakes.visible = this.snowAmt.value > 0.01;
    }
    this.updateSky(hour);

    const d = this.dist, p = this.pitch;
    const bx = Math.sin(this.yaw), bz = Math.cos(this.yaw);
    this.camera.position.set(bx * Math.cos(p) * d, 1.0 + Math.sin(p) * d, bz * Math.cos(p) * d);
    // Look up a little so the horizon sits about a third of the way up the screen and the sky fills the rest.
    // The camera looks up by `tilt`, which puts the horizon `horizonH` of the screen height above the bottom edge (vertical field of view 60 degrees).
    const tilt = Math.atan((1 - 2 * this.horizonH) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) - (p - 0.12) * 0.6;
    const c = this.camera.position;
    this.camera.lookAt(c.x + fx * 10, c.y + Math.tan(tilt) * 10, c.z + fz * 10);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.dayDome.position.copy(this.camera.position);
    this.hazeDome.position.copy(this.camera.position);
    this.range.position.set(this.camera.position.x, 0, this.camera.position.z);

    this.gu.uTime.value = this.t;
    this.gu.uCam.value.copy(this.camera.position);
    this.gu.uOffset.value.copy(this.pos);
    this.composer.render();
  }

  private updateSky(hour: number) {
    const a = ((hour - 6) / 24) * Math.PI * 2;
    // The arc leans toward the front (-z): the sun rises on the right of the view and sets on the left.
    const sun = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.85, -0.6).normalize();
    const e = sun.y;
    const day = smooth(0, 0.35, e);
    const [from, to, t] = e > 0 ? [HORIZON.dusk, HORIZON.day, day] : [HORIZON.dusk, HORIZON.night, smooth(0, -0.25, e)];
    const hor = from.clone().lerp(to, t);
    this.night = e > 0 ? 0 : t;
    const light = 0.28 + 0.72 * smooth(-0.1, 0.3, e);
    this.sunUp = e > 0;
    // A day picture replaces the physical sky until the sun is well below the horizon.
    const showDay = this.dayLoaded && e > -0.12;
    this.dayDome.visible = showDay;
    this.sky.visible = !showDay;
    dayMat.uniforms.uLight.value = smooth(-0.12, 0.25, e);
    dayMat.uniforms.uTime.value = this.t;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sun);
    u.time.value = this.t;
    u.cloudSpeed.value = 0.00002 * (0.5 + this.windLevel * 2);
    nightMat.uniforms.uMoon.value.set(-Math.cos(a), -Math.sin(a) * 0.85, -0.6).normalize();
    if (this.moonOverride) nightMat.uniforms.uMoon.value.copy(this.moonOverride).normalize(); // debugging aid: pin the moon somewhere
    nightMat.uniforms.uNight.value = this.night;
    nightMat.uniforms.uTime.value = this.t;
    // The sky turns about a pole tilted 37 degrees from the horizon, one revolution per day.
    const axis = new THREE.Vector3(0, Math.sin(0.65), -Math.cos(0.65));
    nightMat.uniforms.uRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(axis, -(hour / 24) * Math.PI * 2));

    // Horizon band: scales with daylight, plus a cool glow of its own so the line never disappears at night.
    this.gu.uHaze.value.copy(hor).multiplyScalar(4.6 * (0.12 + 0.88 * light)).add(NIGHT_HAZE.clone().multiplyScalar(this.night));
    hazeMat.uniforms.uHaze.value.copy(this.gu.uHaze.value);
    this.gu.uLight.value = (0.06 + 0.94 * smooth(-0.12, 0.3, e)) * 1.5; // salt turns dark at night
    this.gu.uNight.value = this.night;

    const lightDir = e > -0.05 ? sun : sun.clone().multiplyScalar(-1);
    this.sunLight.position.copy(lightDir).multiplyScalar(50);
    this.sunLight.color.set("#fff0d8").lerp(new THREE.Color("#b8c8ff"), this.night).lerp(new THREE.Color("#ffb27a"), (1 - day) * (e > 0 ? 1 : 0) * 0.8);
    this.sunLight.intensity = 0.3 + 2.4 * smooth(-0.05, 0.4, Math.abs(lightDir.y)) * (e > -0.05 ? 1 : 0.15);
    this.hemi.color.copy(hor);
    // Glow on the moon and stars at night; by day the sky itself is bright everywhere, so it must not bloom.
    // (The daytime sun is thousands of times brighter than the rest, so any bloom would flood the whole screen.)
    this.bloom.enabled = this.night > 0.02;
    this.bloom.strength = 0.1 + 0.2 * this.night;
    this.hemi.intensity = 0.05 + 0.2 * light;
    this.scene.environmentIntensity = 0.1 + 0.6 * light;

    const ru = (this.range.material as THREE.ShaderMaterial).uniforms;
    ru.uHaze.value.copy(hor).multiplyScalar(0.9 + 0.1 * light);
    ru.uSun.value.copy(lightDir).normalize();
    ru.uLight.value = light * (1 - 0.45 * this.night);
    ru.uNight.value = this.night;
    ru.uSnow.value = this.map?.horizon.snow ?? 0;
    const kindName = this.map?.ground.kind ?? "salt", salt = kindName === "salt";
    ru.uDeep.value = salt ? 1 : 0;
    ru.uTrees.value = this.map?.horizon.trees ?? 0;
    ru.uFogK.value = this.map?.horizon.layout === "ahead" ? 0.0004 : 0.0011; // a mountain straight ahead stays clear and colorful
    ru.uMeadow.value = kindName === "snow" ? 0 : 1;
    // Slope colors come from the map's horizon color: dark slopes in front, a lighter tone of it on the upper ridges.
    const hc = new THREE.Color(this.map?.horizon.color ?? "#8a9bb5");
    ru.uCol1.value.copy(hc).multiplyScalar(0.45);
    ru.uCol2.value.copy(hc).multiplyScalar(0.85);
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
