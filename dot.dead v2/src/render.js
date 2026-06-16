// Pixelation pipeline: render the scene into a low-res target (height 270),
// then upscale with nearest-neighbor through a posterize + Bayer-dither
// shader. This is what produces the pixel-art look.

const PixelRenderer = (() => {
  const RT_HEIGHT = 270;

  const FRAG = `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes; // render-target resolution
    uniform float uVivid; // 0 = muted overcast, 1 = bright clear-day (the summit)
    uniform float uWhite; // dissolution: final mix toward pure white (0..1)
    varying vec2 vUv;

    // compact 4x4 Bayer (no array indexing; WebGL1-safe)
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // muted overcast grade: desaturate a touch, cool the shadows
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.82);
      c = mix(c, c * vec3(0.93, 0.99, 1.08), 0.30 * (1.0 - l));

      // clear-day vividness: on the summit the muted overcast grade gives way to
      // a brighter, more saturated world — green grass, clear blue sky.
      if (uVivid > 0.001) {
        float lv = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 vivid = mix(vec3(lv), c, 1.4);    // boost saturation
        vivid = clamp(vivid * 1.08, 0.0, 1.0); // and a little brightness
        c = mix(c, vivid, uVivid);
      }

      // posterize with ordered dithering, at RT pixel scale
      vec2 p = floor(vUv * uRes);
      float d = bayer4(p) - 0.5;
      float levels = 7.0;
      c = floor(c * levels + d * 0.9 + 0.5) / levels;

      // gentle vignette — eased off on the bright summit so the corners stay open
      float v = distance(vUv, vec2(0.5));
      c *= 1.0 - v * v * 0.35 * (1.0 - uVivid * 0.55);

      // dissolution: the world bleaches out to nothing
      c = mix(c, vec3(1.0), clamp(uWhite, 0.0, 1.0));

      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // trivial upscale: a single texture fetch per screen pixel. All the costly
  // posterize/dither/vignette/heaven math already ran at 480×270, so this final
  // full-resolution pass is nearly free — the key to staying smooth when the
  // GPU is throttled (e.g. a MacBook on battery).
  const COPY_FRAG = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
  `;

  function create(parent) {
    // high-performance picks the discrete GPU on hybrid machines (no-op on
    // single-GPU Apple Silicon, harmless there).
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    parent.appendChild(renderer.domElement);

    // rtScene: the raw scene at low resolution (with depth).
    const rtScene = new THREE.WebGLRenderTarget(480, RT_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    // rtPost: the graded/dithered result, still at low resolution (no depth).
    const rtPost = new THREE.WebGLRenderTarget(480, RT_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });

    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(2, 2);

    // heavy grade pass — runs at 480×270, sampling the raw scene
    const uniforms = {
      tDiffuse: { value: rtScene.texture },
      uRes: { value: new THREE.Vector2(480, RT_HEIGHT) },
      uVivid: { value: 0 },
      uWhite: { value: 0 },
    };
    const postScene = new THREE.Scene();
    postScene.add(new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false })
    ));

    // cheap upscale pass — runs at full screen resolution, one texture fetch
    const copyUniforms = { tDiffuse: { value: rtPost.texture } };
    const copyScene = new THREE.Scene();
    copyScene.add(new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COPY_FRAG, uniforms: copyUniforms, depthTest: false })
    ));

    function resize(width, height, camera) {
      renderer.setSize(width, height);
      const rw = Math.max(2, Math.round(RT_HEIGHT * (width / height)));
      rtScene.setSize(rw, RT_HEIGHT);
      rtPost.setSize(rw, RT_HEIGHT);
      uniforms.uRes.value.set(rw, RT_HEIGHT);
      if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }

    function render(scene, camera) {
      // 1) scene → low-res target
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      // 2) heavy posterize/dither/heaven grade, still at low res
      renderer.setRenderTarget(rtPost);
      renderer.render(postScene, postCam);
      // 3) trivial fetch upscale to the screen
      renderer.setRenderTarget(null);
      renderer.render(copyScene, postCam);
    }

    function setVivid(v) {
      uniforms.uVivid.value = Math.max(0, Math.min(1, v));
    }

    // dissolution: bleach the final frame to pure white. The pixel size and the
    // palette are deliberately left untouched — only the geometry simplifies.
    function setWhiteout(white) {
      uniforms.uWhite.value = Math.max(0, Math.min(1, white));
    }

    return { renderer, resize, render, setVivid, setWhiteout };
  }

  return { create };
})();
