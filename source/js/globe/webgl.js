/** Thin wrappers around the WebGL2 calls the globe needs: programs with uniform maps and vertex arrays. */
export class WebGlProgram {
  gl;
  handle;
  uniforms = {};

  constructor(gl, { vertex, fragment, uniforms }) {
    this.gl = gl;
    this.handle = gl.createProgram();
    gl.attachShader(this.handle, WebGlProgram.#compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(this.handle, WebGlProgram.#compile(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(this.handle);
    if (!gl.getProgramParameter(this.handle, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.handle));
    for (const name of uniforms) this.uniforms[name] = gl.getUniformLocation(this.handle, name);
  }

  use() {
    this.gl.useProgram(this.handle);
    return this;
  }

  float(name, value) {
    this.gl.uniform1f(this.uniforms[name], value);
    return this;
  }

  vec2(name, x, y) {
    this.gl.uniform2f(this.uniforms[name], x, y);
    return this;
  }

  vec3(name, rgb) {
    this.gl.uniform3fv(this.uniforms[name], rgb);
    return this;
  }

  mat3(name, matrix) {
    this.gl.uniformMatrix3fv(this.uniforms[name], false, matrix);
    return this;
  }

  static #compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
}

export class VertexArray {
  #gl;
  #handle;

  /** `layout` lists the float count of each attribute, in location order. */
  constructor(gl, data, layout) {
    this.#gl = gl;
    this.#handle = gl.createVertexArray();
    gl.bindVertexArray(this.#handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = layout.reduce((sum, size) => sum + size, 0) * 4;
    let offset = 0;
    layout.forEach((size, location) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      offset += size * 4;
    });
    gl.bindVertexArray(null);
  }

  bind() {
    this.#gl.bindVertexArray(this.#handle);
    return this;
  }
}
