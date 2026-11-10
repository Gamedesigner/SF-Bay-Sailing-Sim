// Global height-fog: replaces three's fog chunks so every built-in material gets
// the same marine-layer fog (dense near the water, thinning with altitude, thicker
// toward the ocean, with a tongue pushing through the Golden Gate).
import * as THREE from 'three';

export const fogUniforms = {
  // x: haze density, y: marine layer density, z: 1 / layer scale height, w: fog-front world x
  uFogA: { value: new THREE.Vector4(3e-5, 0, 1 / 90, -6000) },
  // xyz: light direction, w: in-scatter strength
  uFogSun: { value: new THREE.Vector4(0, 1, 0, 0.5) },
  uFogSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
};
export const nightUniform = { value: 0 };

export const FOG_GLSL = /* glsl */ `
uniform vec4 uFogA;
uniform vec4 uFogSun;
uniform vec3 uFogSunColor;
float fogExpInt(float k, float t){
  return abs(k) > 1e-6 ? (1.0 - exp(clamp(-k * t, -30.0, 30.0))) / k : t;
}
float bayFogBank(vec2 xz){
  float tongue = exp(-pow((xz.y - 600.0) / 2600.0, 2.0)) * 3500.0;
  return 1.0 - smoothstep(-2200.0, 2200.0, xz.x - uFogA.w - tongue);
}
vec4 bayFog(vec3 wp, vec3 cam, vec3 baseColor){
  vec3 rd = wp - cam;
  float dist = max(length(rd), 1e-3);
  rd /= dist;
  float camY = max(cam.y, 0.0);
  float haze = uFogA.x * exp(-camY / 1500.0) * fogExpInt(rd.y / 1500.0, dist);
  float bank = (bayFogBank(cam.xz) + bayFogBank(mix(cam.xz, wp.xz, 0.5)) + 2.0 * bayFogBank(wp.xz)) * 0.25;
  float layer = uFogA.y * (0.12 + 0.88 * bank) * exp(-uFogA.z * camY) * fogExpInt(uFogA.z * rd.y, dist);
  float f = 1.0 - exp(-(haze + layer));
  float s = pow(max(dot(rd, uFogSun.xyz), 0.0), 8.0) * uFogSun.w;
  return vec4(baseColor + uFogSunColor * s, f);
}
`;

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWP = instanceMatrix * fogWP;
  #endif
  vFogWorldPos = ( modelMatrix * fogWP ).xyz;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  ${FOG_GLSL}
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec4 bayF = bayFog( vFogWorldPos, cameraPosition, fogColor );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, bayF.rgb, bayF.a );
#endif`;

export function attachFog(shader) {
  Object.assign(shader.uniforms, fogUniforms);
}
// every material shares the same fog uniform objects
THREE.Material.prototype.onBeforeCompile = function (shader) {
  attachFog(shader);
};
