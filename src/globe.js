import * as THREE from "three";
import { Line2, LineMaterial, LineGeometry } from "three/examples/jsm/Addons.js";
import {BufferGeometryUtils} from "https://cdn.jsdelivr.net/npm/three@0.125.2/examples/jsm/utils/BufferGeometryUtils.js";

// const geometry = new THREE.SphereGeometry(2);
// // const edges = new THREE.EdgesGeometry(geometry, 1);
// // const lineMat = new THREE.LineBasicMaterial({ color: 0x61665E , transparent: true, opacity: 0.6 });

// const material = new THREE.MeshBasicMaterial( { color: 0x61665E, transparent: true, opacity: 0.5 } );
// const globeBase = new THREE.Mesh(geometry, material);

// const geojson = await fetch('./src/assets/ne_110m_admin_0_countries.geojson')
//     .then(response => response.json())


// const globeGroup = [globeBase]
// const materials = new LineMaterial({ color: 0x1C67AD, linewidth: 1 }) // outer ring

// geojson.features.forEach(({ properties, geometry }) => {
    
//     const { type, coordinates } = geometry;

//     // Handle both Polygon and MultiPolygon
//     const polygons = type === 'Polygon' ? [coordinates] : coordinates;
    
//     polygons.forEach((polygon) => {
//         polygon.forEach((ring) => {
//             const positions = [];

//             ring.forEach(([lng, lat]) => {
//                 // Map lon/lat onto 3D coordinates on the sphere
//                 const phi = (90 - lat) * (Math.PI / 180);
//                 const theta = (lng + 180) * (Math.PI / 180);

//                 const radius = 2.001; // slightly above the sphere
//                 const x = -radius * Math.sin(phi) * Math.cos(theta);
//                 const y = radius * Math.cos(phi);
//                 const z = radius * Math.sin(phi) * Math.sin(theta);

//                 positions.push(x, y, z);
//             });

//             // Create proper LineGeometry
//             const lineGeo = new LineGeometry();
//             lineGeo.setPositions(positions);

//             const border = new Line2(lineGeo, materials);
//             border.computeLineDistances();
//             globeGroup.push(border);
//         });
//     });
// });

// export { globeGroup };


export function makeGlobeOfPoints(rad, arcsCount, uniforms, params){
  
    let dummyObj = new THREE.Object3D();
    let p = new THREE.Vector3();
    let sph = new THREE.Spherical();
    let geoms = [];
    
    let tex = new THREE.TextureLoader().load("./src/assets/world_tex.jpg");
    
    // https://web.archive.org/web/20120107030109/http://cgafaq.info/wiki/Evenly_distributed_points_on_sphere#Spirals
    let counter = 75000;

    let r = 0;
    let dlong = Math.PI * (3 - Math.sqrt(5));
    let dz = 2 / counter;
    let long = 0;
    let z = 1 - dz / 2;
  
    for(let i = 0; i < counter; i++){
    
        r = Math.sqrt(1 - z * z);
        p.set( Math.cos(long) * r, z, -Math.sin(long) * r).multiplyScalar(rad);

        z = z - dz;
        long = long + dlong;
        
        sph.setFromVector3(p);
        
        dummyObj.lookAt(p);
        dummyObj.updateMatrix();
        
        let g =  new THREE.PlaneGeometry(1, 1);
        g.applyMatrix4(dummyObj.matrix);
        g.translate(p.x, p.y, p.z);
        let centers = [
            p.x, p.y, p.z, 
            p.x, p.y, p.z, 
            p.x, p.y, p.z, 
            p.x, p.y, p.z
        ];
        let uv = new THREE.Vector2(
            (sph.theta + Math.PI) / (Math.PI * 2),
            1. - sph.phi / Math.PI
        );
        let uvs = [
            uv.x, uv.y,
            uv.x, uv.y,
            uv.x, uv.y,
            uv.x, uv.y
        ];
        g.setAttribute("center", new THREE.Float32BufferAttribute(centers, 3));
        g.setAttribute("baseUv", new THREE.Float32BufferAttribute(uvs, 2));
        geoms.push(g);

    }
    let g = BufferGeometryUtils.mergeBufferGeometries(geoms);
    let m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(params.colors.base),
        //side: THREE.DoubleSide,
        onBeforeCompile: shader => {
            shader.uniforms.impacts = uniforms.impacts;
            shader.uniforms.maxSize = uniforms.maxSize;
            shader.uniforms.minSize = uniforms.minSize;
            shader.uniforms.waveHeight = uniforms.waveHeight;
            shader.uniforms.scaling = uniforms.scaling;
            shader.uniforms.gradInner = uniforms.gradInner;
            shader.uniforms.gradOuter = uniforms.gradOuter;
            shader.uniforms.tex = {value: tex};
            shader.vertexShader = `
                struct impact {
                    vec3 impactPosition;
                    float impactMaxRadius;
                    float impactRatio;
                };
                uniform impact impacts[${arcsCount}];
                uniform sampler2D tex;
                uniform float maxSize;
                uniform float minSize;
                uniform float waveHeight;
                uniform float scaling;
                
                attribute vec3 center;
                attribute vec2 baseUv;
                
                varying float vFinalStep;
                varying float vMap;
                
                ${shader.vertexShader}
            `.replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>
                float finalStep = 0.0;
                for (int i = 0; i < ${arcsCount};i++){

                float dist = distance(center, impacts[i].impactPosition);
                float curRadius = impacts[i].impactMaxRadius * impacts[i].impactRatio;
                float sstep = smoothstep(0., curRadius, dist) - smoothstep(curRadius - ( 0.25 * impacts[i].impactRatio ), curRadius, dist);
                sstep *= 1. - impacts[i].impactRatio;
                finalStep += sstep;

                }
                finalStep = clamp(finalStep, 0., 1.);
                vFinalStep = finalStep;
                
                float map = texture(tex, baseUv).g;
                vMap = map;
                float pSize = map < 0.5 ? maxSize : minSize;
                float scale = scaling;

                transformed = (position - center) * pSize * mix(1., scale * 1.25, finalStep) + center; // scale on wave
                transformed += normal * finalStep * waveHeight; // lift on wave
                `
            );
            shader.fragmentShader = 
            `
                uniform vec3 gradInner;
                uniform vec3 gradOuter;
                
                varying float vFinalStep;
                varying float vMap;
                ${shader.fragmentShader}
                `
                .replace(
                    `vec4 diffuseColor = vec4( diffuse, opacity );`,
                    `
                    // shaping the point, pretty much from The Book of Shaders
                    vec2 hUv = (vUv - 0.5);
                    int N = 8;
                    float a = atan(hUv.x,hUv.y);
                    float r = PI2/float(N);
                    float d = cos(floor(.5+a/r)*r-a)*length(hUv);
                    float f = cos(PI / float(N)) * 0.5;
                    if (d > f) discard;
                    
                    vec3 grad = mix(gradInner, gradOuter, clamp( d / f, 0., 1.)); // gradient
                    vec3 diffuseMap = diffuse * ((vMap > 0.5) ? 0.5 : 1.);
                    vec3 col = mix(diffuseMap, grad, vFinalStep); // color on wave
                    //if (!gl_FrontFacing) col *= 0.25; // moderate the color on backside
                    vec4 diffuseColor = vec4( col , opacity ); 
                    `
                );
        }
    });
  m.defines = {"USE_UV":""};
  const o = new THREE.Mesh(g, m);


  return o
}
