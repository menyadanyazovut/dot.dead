// Pixelation pipeline: render the scene into a low-res target (height 270),
// then upscale with nearest-neighbor through a posterize + Bayer-dither
// shader. This is what produces the pixel-art look.

const PixelRenderer = (() => {
  const RT_HEIGHT = 270;

  const FRAG = `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes; // render-target resolution
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

      // posterize with ordered dithering, at RT pixel scale
      vec2 p = floor(vUv * uRes);
      float d = bayer4(p) - 0.5;
      float levels = 7.0;
      c = floor(c * levels + d * 0.9 + 0.5) / levels;

      // gentle vignette
      float v = distance(vUv, vec2(0.5));
      c *= 1.0 - v * v * 0.35;

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

  function create(parent) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    parent.appendChild(renderer.domElement);

    const rt = new THREE.WebGLRenderTarget(480, RT_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });

    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postScene = new THREE.Scene();
    const uniforms = {
      tDiffuse: { value: rt.texture },
      uRes: { value: new THREE.Vector2(480, RT_HEIGHT) },
    };
    postScene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false })
      )
    );

    function resize(width, height, camera) {
      renderer.setSize(width, height);
      const rw = Math.max(2, Math.round(RT_HEIGHT * (width / height)));
      rt.setSize(rw, RT_HEIGHT);
      uniforms.uRes.value.set(rw, RT_HEIGHT);
      if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }

    function render(scene, camera) {
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    }

    return { renderer, resize, render };
  }

  return { create };
})();
