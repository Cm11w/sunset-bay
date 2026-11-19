// Raw WebGL2 engine: one shader, vertex-colour flat-shaded boxes, directional sun +
// hemisphere ambient, distance fog. No library, no textures, no network. Geometry is
// pushed into batches (static city once, dynamic actors every frame) and drawn in a
// handful of draw calls.

const VERT_SHADER = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec2 uFog;
out vec3 vCol;
out float vFog;
void main() {
  vec3 n = normalize(aNorm);
  float diff = max(dot(n, -uSunDir), 0.0);
  vCol = aCol * (uAmb + uSunCol * diff);
  vec4 vp = uView * vec4(aPos, 1.0);
  vFog = clamp((-vp.z - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  gl_Position = uProj * vp;
}`;

const FRAG_SHADER = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vFog;
uniform vec3 uFogColor;
out vec4 outColor;
void main() {
  outColor = vec4(mix(vCol, uFogColor, vFog), 1.0);
}`;

const STRIDE = 9; // pos3 + norm3 + col3

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** Perspective matrix, column-major. */
export function matPerspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** Look-at view matrix, column-major. */
export function matLookAt(ex, ey, ez, tx, ty, tz) {
  const zx = ex - tx, zy = ey - ty, zz = ez - tz;
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  const x = [0, 1, 0];
  // x = up x z
  const xx = 1 * z[2] - 0 * z[1];
  const xy = 0 * z[0] - 0 * z[2];
  const xz = 0 * z[1] - 1 * z[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  const xv = [xx / xl, xy / xl, xz / xl];
  // y = z x x
  const yv = [
    z[1] * xv[2] - z[2] * xv[1],
    z[2] * xv[0] - z[0] * xv[2],
    z[0] * xv[1] - z[1] * xv[0],
  ];
  const out = new Float32Array(16);
  out[0] = xv[0]; out[1] = yv[0]; out[2] = z[0]; out[3] = 0;
  out[4] = xv[1]; out[5] = yv[1]; out[6] = z[1]; out[7] = 0;
  out[8] = xv[2]; out[9] = yv[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -(xv[0] * ex + xv[1] * ey + xv[2] * ez);
  out[13] = -(yv[0] * ex + yv[1] * ey + yv[2] * ez);
  out[14] = -(z[0] * ex + z[1] * ey + z[2] * ez);
  out[15] = 1;
  return out;
}

// One box face: normal, and its four corners (x, y, z) before rotation/scale.
const FACES = [
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], shade: 1.18 },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], shade: 0.45 },
  { n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], shade: 0.82 },
  { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], shade: 0.82 },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], shade: 0.95 },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], shade: 0.7 },
];

export class Batch {
  constructor(maxVerts) {
    this.data = new Float32Array(maxVerts * STRIDE);
    this.count = 0;
    this.max = maxVerts;
  }

  reset() {
    this.count = 0;
  }

  _vert(x, y, z, nx, ny, nz, r, g, b) {
    if (this.count >= this.max) return;
    const o = this.count * STRIDE;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = nx; d[o + 4] = ny; d[o + 5] = nz;
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = b;
    this.count += 1;
  }

  /** Axis-aligned box centred at (cx, cy, cz) with size (sx, sy, sz), rotated ry around Y. */
  box(cx, cy, cz, sx, sy, sz, col, ry = 0, topCol = null) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (const face of FACES) {
      const shade = face.shade;
      let r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
      if (topCol && face.n[1] === 1) { r = topCol[0]; g = topCol[1]; b = topCol[2]; }
      // Rotate the face normal around Y.
      const nx = face.n[0] * cos + face.n[2] * sin;
      const nz = -face.n[0] * sin + face.n[2] * cos;
      const idx = [0, 1, 2, 0, 2, 3];
      for (const k of idx) {
        const c = face.c[k];
        const lx = c[0] * hx, ly = c[1] * hy, lz = c[2] * hz;
        const x = lx * cos + lz * sin;
        const z = -lx * sin + lz * cos;
        this._vert(cx + x, cy + ly, cz + z, nx, face.n[1], nz, r, g, b);
      }
    }
  }

  /** Flat quad on the ground plane, centred at (cx, cz), size (w, d), at height y. */
  quad(cx, y, cz, w, d, col, ry = 0) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const hw = w / 2, hd = d / 2;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    const pts = corners.map(([lx, lz]) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos]);
    const idx = [0, 2, 1, 0, 3, 2]; // CCW viewed from above (+y), else the quad is culled
    for (const k of idx) {
      const p = pts[k];
      this._vert(p[0], y, p[1], 0, 1, 0, col[0], col[1], col[2]);
    }
  }

  /** Vertical quad facing +Z (a wall / billboard), centred, size (w, h). */
  wall(cx, cy, cz, w, h, col, ry = 0) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const hw = w / 2, hh = h / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const pts = corners.map(([lx, ly]) => [cx + lx * cos, cy + ly, cz - lx * sin]);
    const idx = [0, 1, 2, 0, 2, 3];
    for (const k of idx) {
      const p = pts[k];
      this._vert(p[0], p[1], p[2], sin, 0, cos, col[0], col[1], col[2]);
    }
  }
}

export function createEngine(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  const loc = {
    proj: gl.getUniformLocation(program, 'uProj'),
    view: gl.getUniformLocation(program, 'uView'),
    sunDir: gl.getUniformLocation(program, 'uSunDir'),
    sunCol: gl.getUniformLocation(program, 'uSunCol'),
    amb: gl.getUniformLocation(program, 'uAmb'),
    fog: gl.getUniformLocation(program, 'uFog'),
    fogColor: gl.getUniformLocation(program, 'uFogColor'),
  };
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE * 4, 24);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  let width = 0;
  let height = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    if (w !== width || h !== height) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    return { width, height };
  }

  /** Draw one batch with the given camera and lighting. */
  function draw(batch, proj, view, light) {
    if (batch.count === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, batch.data.subarray(0, batch.count * STRIDE), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(loc.proj, false, proj);
    gl.uniformMatrix4fv(loc.view, false, view);
    gl.uniform3fv(loc.sunDir, light.sunDir);
    gl.uniform3fv(loc.sunCol, light.sunCol);
    gl.uniform3fv(loc.amb, light.amb);
    gl.uniform2fv(loc.fog, light.fog);
    gl.uniform3fv(loc.fogColor, light.fogColor);
    gl.drawArrays(gl.TRIANGLES, 0, batch.count);
  }

  function clear(color) {
    gl.clearColor(color[0], color[1], color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  resize();
  window.addEventListener('resize', resize);

  return { gl, draw, clear, resize };
}
