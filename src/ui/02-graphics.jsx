/* ---------------------------------------------------------------------- */
/* Screenshots                                                             */
/* ---------------------------------------------------------------------- */

const imageCache = new Map();
/* Wird von der App gesetzt, sobald der Sync aktiv ist: lädt fehlende Screenshots nach */
let REMOTE_IMAGE_LOADER = null;

/* Lädt eine Bibliothek erst, wenn sie gebraucht wird (Excel-Import, KI-Coach) */
const scriptPromises = {};
function loadScriptOnce(srcs, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  const key = globalName;
  if (scriptPromises[key]) return scriptPromises[key];
  scriptPromises[key] = (async () => {
    for (const src of srcs) {
      try {
        await new Promise((resolve, reject) => {
          const el = document.createElement('script');
          el.src = src; el.async = true; el.onload = resolve; el.onerror = reject;
          document.head.appendChild(el);
        });
        if (window[globalName]) return window[globalName];
      } catch (e) { /* nächste Quelle versuchen */ }
    }
    delete scriptPromises[key];
    throw new Error('Bibliothek konnte nicht geladen werden – bist du online?');
  })();
  return scriptPromises[key];
}
const ensureXLSX = () => loadScriptOnce(['vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'], 'XLSX');
const ensureAnthropic = () => loadScriptOnce(['vendor/anthropic-sdk.js', 'https://matsdenninger-ui.github.io/TRADETRACER/vendor/anthropic-sdk.js'], 'AnthropicSDK');

function useImage(id) {
  const [src, setSrc] = useState(() => imageCache.get(id) || null);
  useEffect(() => {
    let alive = true;
    if (!id) return;
    if (imageCache.has(id)) { setSrc(imageCache.get(id)); return; }
    (async () => {
      let v = await window.imageStore.get(id);
      // Nicht auf diesem Gerät? Dann bei Bedarf aus dem Sync laden.
      if (!v && REMOTE_IMAGE_LOADER) {
        try { v = await REMOTE_IMAGE_LOADER(id); if (v) await window.imageStore.set(id, v); } catch (e) { console.warn(e); }
      }
      if (v) imageCache.set(id, v);
      if (alive) setSrc(v || false);
    })();
    return () => { alive = false; };
  }, [id]);
  return src;
}

function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0B0E14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------- */
/* WebGL: Shader-Gradient-Hintergrund                                      */
/* (Portierung des Noise-Displacement-Gradients aus shadergradient)        */
/* ---------------------------------------------------------------------- */

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

const GRADIENT_FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_light;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec3 P) {
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod289(Pi0); Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x); vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z); vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x); vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z); vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  return 2.2 * mix(n_yz.x, n_yz.y, fade_xyz.x);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.045;
  // Wellenfoermige Verschiebung wie beim shadergradient-"plane"
  float d = cnoise(vec3(p * 1.15 + vec2(t * 0.7, -t * 0.35), t));
  float d2 = cnoise(vec3(p * 2.3 - d * 0.55, t * 1.3 + 7.0));
  vec2 q = p + vec2(d, d2) * 0.32;
  vec3 col = mix(mix(u_c1, u_c2, smoothstep(-1.1, 1.1, q.x + q.y * 0.35)), u_c3, smoothstep(-0.35, 0.95, d + q.y * 0.6));
  // Weiches "Licht" auf den Wellenkaemmen
  float ridge = smoothstep(0.25, 0.9, d2 * 0.5 + d * 0.6);
  col += ridge * 0.06 * (u_c3 + vec3(0.25));
  col *= 0.78 + 0.3 * d2;
  // Vignette
  float vig = smoothstep(1.55, 0.15, length(p * vec2(0.85, 1.1) - vec2(0.15, 0.4)));
  col *= mix(mix(0.3, 0.9, u_light), 1.05, vig);
  // Filmkorn gegen Banding
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
  col += (g - 0.5) * 0.022;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const FULLSCREEN_VERT = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

function createProgram(gl, vsSource, fsSource) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(program)); return null; }
  return program;
}

function ShaderBackground({ hue, animated, light = false }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ hue, animated });
  stateRef.current = { hue, animated, light };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas && (canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }));
    if (!gl) return;
    const program = createProgram(gl, FULLSCREEN_VERT, GRADIENT_FRAG);
    if (!program) return;
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {
      res: gl.getUniformLocation(program, 'u_res'), time: gl.getUniformLocation(program, 'u_time'),
      c1: gl.getUniformLocation(program, 'u_c1'), c2: gl.getUniformLocation(program, 'u_c2'), c3: gl.getUniformLocation(program, 'u_c3'), light: gl.getUniformLocation(program, 'u_light')
    };

    const SCALE = 0.4; // der Verlauf ist weich – geringe Aufloesung spart GPU
    const resize = () => {
      canvas.width = Math.max(2, Math.round(window.innerWidth * SCALE));
      canvas.height = Math.max(2, Math.round(window.innerHeight * SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0, time = 12;
    let prev = performance.now();
    const draw = (now) => {
      const { hue: h, animated: anim } = stateRef.current;
      const dt = Math.min(100, now - prev); prev = now;
      if (anim && !reduced) time += dt / 1000;
      if (now - last >= 33 || !last) { // ~30 fps genuegt
        last = now;
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, time);
        const lt = stateRef.current.light;
        gl.uniform1f(u.light, lt ? 1 : 0);
        gl.uniform3fv(u.c1, lt ? hslToRgb(h, 70, 90) : hslToRgb(h, 55, 13));
        gl.uniform3fv(u.c2, lt ? hslToRgb(h + 150, 55, 94) : hslToRgb(h + 150, 45, 9));
        gl.uniform3fv(u.c3, lt ? hslToRgb(h - 25, 85, 80) : hslToRgb(h - 25, 75, 24));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        canvas.classList.add('ready');
      }
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVis = () => { if (!document.hidden) { cancelAnimationFrame(raf); prev = performance.now(); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <div className="bg-layer"><canvas ref={canvasRef} /></div>;
}

/* ---------------------------------------------------------------------- */
/* WebGL2: Liquid-Metal-Logo (Portierung aus liquid-logo)                  */
/* ---------------------------------------------------------------------- */

const LIQUID_VERT = `#version 300 es
precision mediump float;
in vec2 a_position;
out vec2 vUv;
void main() { vUv = .5 * (a_position + 1.); gl_Position = vec4(a_position, 0.0, 1.0); }`;

const LIQUID_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_image_texture;
uniform float u_time;
uniform float u_patternScale;
uniform float u_refraction;
uniform float u_edge;
uniform float u_patternBlur;
uniform float u_liquid;
uniform vec3 u_tint;
#define PI 3.14159265358979323846

vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec2 mod289(vec2 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec3 permute(vec3 x) { return mod289(((x*34.)+1.)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.);
  m = m*m; m = m*m;
  vec3 x = 2. * fract(p * C.www) - 1.;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130. * dot(m, g);
}
vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float get_color_channel(float c1, float c2, float stripe_p, vec3 w, float extra_blur, float b) {
  float ch = c2;
  float border = 0.;
  float blur = u_patternBlur + extra_blur;
  ch = mix(ch, c1, smoothstep(.0, blur, stripe_p));
  border = w[0];
  ch = mix(ch, c2, smoothstep(border - blur, border + blur, stripe_p));
  b = smoothstep(.2, .8, b);
  border = w[0] + .4 * (1. - b) * w[1];
  ch = mix(ch, c1, smoothstep(border - blur, border + blur, stripe_p));
  border = w[0] + .5 * (1. - b) * w[1];
  ch = mix(ch, c2, smoothstep(border - blur, border + blur, stripe_p));
  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border - blur, border + blur, stripe_p));
  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border - blur, border + blur, stripe_p));
  return ch;
}
void main() {
  vec2 uv = vUv;
  uv.y = 1. - uv.y;
  float diagonal = uv.x - uv.y;
  float t = .001 * u_time;
  vec2 img_uv = vUv; img_uv.y = 1. - img_uv.y;
  vec4 img = texture(u_image_texture, img_uv);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, uv.x + uv.y));
  float edge = img.r;
  vec2 grad_uv = uv - .5;
  float dist = length(grad_uv + vec2(0., .2 * diagonal));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagonal) * PI);
  float bulge = pow(1.8 * dist, 1.2);
  bulge = 1. - bulge;
  bulge *= pow(uv.y, .3);
  float cycle_width = u_patternScale;
  float thin_strip_1_ratio = .12 / cycle_width * (1. - .4 * bulge);
  float thin_strip_2_ratio = .07 / cycle_width * (1. + .4 * bulge);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);
  float thin_strip_1_width = cycle_width * thin_strip_1_ratio;
  float thin_strip_2_width = cycle_width * thin_strip_2_ratio;
  float opacity = 1. - smoothstep(.9 - .5 * u_edge, 1. - .5 * u_edge, edge);
  float noise = snoise(uv - t);
  edge += (1. - edge) * u_liquid * noise;
  float refr = clamp(1. - bulge, 0., 1.);
  float dir = grad_uv.x + diagonal;
  dir -= 2. * noise * diagonal * (smoothstep(0., 1., edge) * smoothstep(1., 0., edge));
  bulge *= clamp(pow(uv.y, .1), .3, 1.);
  dir *= (.1 + (1.1 - edge) * bulge);
  dir *= smoothstep(1., .7, edge);
  dir += .18 * (smoothstep(.1, .2, uv.y) * smoothstep(.4, .2, uv.y));
  dir += .03 * (smoothstep(.1, .2, 1. - uv.y) * smoothstep(.4, .2, 1. - uv.y));
  dir *= (.5 + .5 * pow(uv.y, 2.));
  dir *= cycle_width;
  dir -= t;
  float refr_r = refr + .03 * bulge * noise;
  float refr_b = 1.3 * refr;
  refr_r += 5. * (smoothstep(-.1, .2, uv.y) * smoothstep(.5, .1, uv.y)) * (smoothstep(.4, .6, bulge) * smoothstep(1., .4, bulge));
  refr_r -= diagonal;
  refr_b += (smoothstep(0., .4, uv.y) * smoothstep(.8, .1, uv.y)) * (smoothstep(.4, .6, bulge) * smoothstep(.8, .4, bulge));
  refr_b -= .2 * edge;
  refr_r *= u_refraction;
  refr_b *= u_refraction;
  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bulge);
  float r = get_color_channel(color1.r, color2.r, mod(dir + refr_r, 1.), w, 0.02 + .03 * u_refraction * bulge, bulge);
  float g = get_color_channel(color1.g, color2.g, mod(dir, 1.), w, 0.01 / (1. - diagonal), bulge);
  float b = get_color_channel(color1.b, color2.b, mod(dir - refr_b, 1.), w, .01, bulge);
  vec3 color = vec3(r, g, b);
  // Akzentfarbe einmischen (Gold-/Farbton des Themes)
  color = mix(color, color * u_tint * 1.35, 0.55);
  fragColor = vec4(color * opacity, opacity);
}`;

/* Erzeugt die "Bevel"-Kantenkarte des Logos per Poisson-Loesung (wie parse-logo-image.ts) */
function buildLogoEdgeMap(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const s = size / 32;
  ctx.beginPath();
  ctx.moveTo(6 * s, 23 * s); ctx.lineTo(13 * s, 15.5 * s); ctx.lineTo(18 * s, 19.5 * s); ctx.lineTo(26 * s, 9 * s);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.moveTo(27.8 * s, 5.2 * s); ctx.lineTo(28.4 * s, 13.8 * s); ctx.lineTo(20.6 * s, 8.4 * s); ctx.closePath(); ctx.fill();
  const data = ctx.getImageData(0, 0, size, size).data;
  const N = size * size;
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = data[i * 4] < 128 ? 1 : 0;
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1;
  const boundary = new Uint8Array(N);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (!mask[i]) continue;
    if (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1)) boundary[i] = 1;
  }
  let u = new Float32Array(N), nu = new Float32Array(N);
  for (let iter = 0; iter < 160; iter++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!mask[i] || boundary[i]) { nu[i] = 0; continue; }
      nu[i] = (0.01 + u[i + 1] + u[i - 1] + u[i + size] + u[i - size]) / 4;
    }
    const tmp = u; u = nu; nu = tmp;
  }
  let maxV = 0;
  for (let i = 0; i < N; i++) if (u[i] > maxV) maxV = u[i];
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const g = mask[i] ? 255 * (1 - Math.pow(u[i] / (maxV || 1), 2)) : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g; out[i * 4 + 3] = 255;
  }
  return { size, data: out };
}

let LOGO_EDGE_MAP = null;

function LiquidLogo({ hue }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const hueRef = useRef(hue);
  hueRef.current = hue;

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas && canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
    if (!gl) { setFailed(true); return; }
    const program = createProgram(gl, LIQUID_VERT, LIQUID_FRAG);
    if (!program) { setFailed(true); return; }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(program, n);
    gl.uniform1f(U('u_patternScale'), 2);
    gl.uniform1f(U('u_refraction'), 0.015);
    gl.uniform1f(U('u_edge'), 0.4);
    gl.uniform1f(U('u_patternBlur'), 0.005);
    gl.uniform1f(U('u_liquid'), 0.07);
    const uTime = U('u_time'), uTint = U('u_tint');

    if (!LOGO_EDGE_MAP) LOGO_EDGE_MAP = buildLogoEdgeMap(128);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LOGO_EDGE_MAP.size, LOGO_EDGE_MAP.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, LOGO_EDGE_MAP.data);
    gl.uniform1i(U('u_image_texture'), 0);

    const px = Math.round(42 * Math.min(2, window.devicePixelRatio || 1) * 1.5);
    canvas.width = canvas.height = px;
    gl.viewport(0, 0, px, px);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, total = 4000, prev = performance.now();
    const render = (now) => {
      total += (now - prev) * (reduced ? 0 : 0.3); prev = now;
      const [r, g, b] = hslToRgb(hueRef.current, 85, 68);
      gl.uniform3f(uTint, r, g, b);
      gl.uniform1f(uTime, total);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="brand-mark">
      {failed
        ? <div className="brand-fallback"><Icon name="TrendingUp" size={22} strokeWidth={2.6} /></div>
        : <canvas ref={canvasRef} aria-label="TradeTracer Logo" />}
    </div>
  );
}
