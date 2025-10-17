import * as THREE from "three";
import { makeGlobeOfPoints } from "./globe.js";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from "@tweenjs/tween.js"
import arcFragmentShader from "./shaders/arcFragmentShader.js";

const RADIUS = 5
const ARCS_COUNT = 10 //first one is for clicking
const INTERACTIVE_ARC_INDEX = 0;
const TOTAL_ARCS = ARCS_COUNT + 1;
// scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 10;
const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );
const rotateXY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1,0,0), 0.001)

// render
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setAnimationLoop(animate);


let params = {
    colors: {
        background: "#F5F6F4",
        base: "#454941", //the dots making up the globe
        gradInner: "#2179d2",
        gradOuter: "#4B8FD1",
        arc: "#76B843"
    },
    reset: () => {controls.reset()}
}

// Clickable arcs
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactiveImpact = { //dummy => redefined whenever user clicks
  impactPosition: new THREE.Vector3().random().subScalar(0.5).setLength(RADIUS),
  impactMaxRadius: 3 * THREE.MathUtils.randFloat(0.5, 0.75),
  impactRatio: 0,
  prevPosition: new THREE.Vector3().random().subScalar(0.5).setLength(RADIUS),
  trailRatio: {value: 0},
  trailLength: {value: 0},
  interactive: true
}
let interactiveArc = makeInteractiveArc() //dummy => redefined whenever user clicks
const interactiveTweenGroup = new TWEEN.Group() //updates whenever user clicks


// add canvas to the body
const container = document.getElementById("root");
if (container) {
  container.appendChild(renderer.domElement);
}
var controls = new OrbitControls(camera, renderer.domElement);

// add objects
let arcs = [interactiveArc]
let impacts = [interactiveImpact]

for (let i = 1; i < TOTAL_ARCS; i++){

  //Generate impact (arc hitting the surface)
  const impact = {
    impactPosition: new THREE.Vector3().random().subScalar(0.5).setLength(RADIUS),
    impactMaxRadius: 1.5 * THREE.MathUtils.randFloat(0.5, 0.75),
    impactRatio: 0,
    prevPosition: new THREE.Vector3().random().subScalar(0.5).setLength(RADIUS),
    trailRatio: {value: 0},
    trailLength: {value: 0},
    interactive: false
  }
  impacts.push(impact);


  //Create arc
  const arcMesh = makeArc(i)
  arcs.push(arcMesh)
}

//UNIFORMS
export const uniforms = {
  impacts: { value: impacts },
  maxSize: {value: 0.04},
  minSize: {value: 0.03},
  waveHeight: {value: 0.125},
  scaling: {value: 2},
  gradInner: {value: new THREE.Color(params.colors.gradInner)},
  gradOuter: {value: new THREE.Color(params.colors.gradOuter)}
}

//Define animation
const arcTweenGroup = new TWEEN.Group();
const impactTweenGroup = new TWEEN.Group();
let tweens = [makeInteractiveTween()];
for (let i = 1; i < TOTAL_ARCS; i++){
  tweens.push(makeTween(i));
}

//Setting the scene
scene.background = new THREE.Color(params.colors.background)
const globe = makeGlobeOfPoints(RADIUS, TOTAL_ARCS, uniforms, params);
arcs.forEach(arc => {globe.add(arc)});
globe.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS - 0.0005, 72, 36), new THREE.MeshBasicMaterial({color: scene.background})));
scene.add(globe);

//Run animation
tweens.forEach( twn => { if (twn) twn.runTween()});

//MAIN LOOP
function animate(time) {

    camera.applyMatrix4(rotateXY)
    arcTweenGroup.update()
    impactTweenGroup.update()
    interactiveTweenGroup.update()
 
    renderer.render(scene, camera)
}


function onPointerClick( event ) {

  //reset click impact
  interactiveImpact.impactRatio = 0;
  interactiveImpact.trailLength.value = 0;
  interactiveImpact.trailRatio.value = 0;
  interactiveTweenGroup.getAll().forEach((tween) => {
    tween.stop()
    interactiveTweenGroup.remove(tween)
  })

	// calculate pointer position in normalized device coordinates
	// (-1 to +1) for both components ([0,1] to [-1,1])
	pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
  raycaster.setFromCamera( pointer, camera );
  const intersects = raycaster.intersectObjects( [globe], false );
  if ( intersects.length <= 0 ) {
      return
  }

  const intersect = intersects[0];

  //set start point and end point
  const startPoint = randomPointOnSphere(RADIUS)
  const endPoint = intersect.point

  //set impact position
  interactiveImpact.prevPosition = startPoint
  interactiveImpact.impactPosition = endPoint

  //recompute path of arc
  setPath(interactiveArc, interactiveImpact.prevPosition,interactiveImpact.impactPosition, 0.7);
  
  //create/run animation
  tweens[0].runTween()
}

function randomPointOnSphere(radius = 1) {
  const u = Math.random();   // random between 0–1
  const v = Math.random();   // random between 0–1

  const theta = 2 * Math.PI * u;      // longitude angle
  const phi = Math.acos(2 * v - 1);   // latitude angle (acos ensures even distribution)

  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi) * Math.sin(theta);
  const z = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Compute the coordinates for a cycloid
function setPath(l, startPoint, endPoint, peak = 1, division = 100, cycle = 1) {

    let pos = l.geometry.attributes.position

    let points = [];
    let radius = startPoint.length();
    let angle = startPoint.angleTo(endPoint);

    let arcLength = radius * angle;
    let diameterMinor = arcLength / Math.PI;
    let radiusMinor = (diameterMinor * 0.5) / cycle;

    let peakRatio = peak / diameterMinor;

    let radiusMajor = startPoint.length() + radiusMinor;
    let basisMajor = new THREE.Vector3().copy(startPoint).setLength(radiusMajor);

    let basisMinor = new THREE.Vector3().copy(startPoint).negate().setLength(radiusMinor);

    // triangle (start, end, center)
    let tri = new THREE.Triangle(startPoint, endPoint, new THREE.Vector3());
    let nrm = new THREE.Vector3(); // normal
    tri.getNormal(nrm);

    // rotate startPoint around normal
    let v3Major = new THREE.Vector3();
    let v3Minor = new THREE.Vector3();
    let v3Inter = new THREE.Vector3();
    let v3Final = new THREE.Vector3();
    for (let i = 0; i <= division; i++) {
        let divisionRatio = i / division;
        let angleValue = angle * divisionRatio;
        v3Major.copy(basisMajor).applyAxisAngle(nrm, angleValue);
        v3Minor.copy(basisMinor).applyAxisAngle(nrm, angleValue + Math.PI * 2 * divisionRatio * cycle);
    
        v3Inter.addVectors(v3Major, v3Minor);
        let newLength = ((v3Inter.length() - radius) * peakRatio) + radius;
    
        v3Final.copy(v3Inter).setLength(newLength)

        pos.setXYZ(i, v3Final.x, v3Final.y, v3Final.z)
        // points.push(new THREE.Vector3().copy(v3Inter).setLength(newLength));
    }

    
    pos.needsUpdate = true;
    l.computeLineDistances();
    l.geometry.attributes.lineDistance.needsUpdate = true;

    if (l.userData.interactive) {
      interactiveImpact.trailLength.value = l.geometry.attributes.lineDistance.array[99];
    } else {
      const id = l.userData.idx
      impacts[id].trailLength.value = l.geometry.attributes.lineDistance.array[99];
    }
    
    // l.material.dashSize = 2;

    // return new THREE.BufferGeometry().setFromPoints(points);
    
}

function makeArc(idx){
  let pts = new Array(100 * 3).fill(0);
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  let m = new THREE.LineDashedMaterial({
    color: params.colors.arc,
    transparent: true,
    onBeforeCompile: shader => {
      shader.uniforms.actionRatio = impacts[idx].trailRatio;
      shader.uniforms.lineLength = impacts[idx].trailLength;
      shader.fragmentShader = arcFragmentShader
    }
  });

  let l = new THREE.Line(g, m);
  //assigned an id to the generated arc
  l.userData.idx = idx
  l.userData.interactive = false;

  //compute actual points
  setPath(l, impacts[idx].prevPosition, impacts[idx].impactPosition, 0.7);

  return l
}

function makeInteractiveArc(){
  let pts = new Array(100 * 3).fill(0);
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  let m = new THREE.LineDashedMaterial({
    color: params.colors.arc,
    transparent: true,
    onBeforeCompile: shader => {
      shader.uniforms.actionRatio = interactiveImpact.trailRatio;
      shader.uniforms.lineLength = interactiveImpact.trailLength;
      shader.fragmentShader = arcFragmentShader
    }
  });

  let l = new THREE.Line(g, m);
  //assigned an id to the generated arc
  l.userData.idx = INTERACTIVE_ARC_INDEX
  l.userData.interactive = true

  //compute actual points
  setPath(l, interactiveImpact.prevPosition,interactiveImpact.impactPosition, 0.7);

  return l
}

function makeTween(idx)  {

  return {
    runTween: () => {
      let arc = arcs[idx];
      let len = arc.geometry.attributes.lineDistance.array[99];
      let speed = 3;
      let dur = len / speed;
      let arcTween = new TWEEN.Tween({value: 0})
        .to({value: 1}, dur * 1000)
        .onUpdate( val => {
          impacts[idx].trailRatio.value = val.value;
        })

      var impactTween = new TWEEN.Tween({ value: 0 })
        .to({ value: 1 }, THREE.MathUtils.randInt(2500, 5000))
        .onUpdate(val => {            
          impacts[idx].impactRatio = val.value;
        }) 
        .onComplete(val => {
          impacts[idx].prevPosition.copy(impacts[idx].impactPosition);
          impacts[idx].impactPosition.random().subScalar(0.5).setLength(RADIUS);
          setPath(arc, impacts[idx].prevPosition, impacts[idx].impactPosition, 1);
          //repeat animation with different impact position
          tweens[idx].runTween(); 
        });

      arcTweenGroup.add(arcTween)
      impactTweenGroup.add(impactTween)
      
      arcTween.chain(impactTween)
      arcTween.start();
    },
    interactive: false
  }
}

function makeInteractiveTween(speed = 5) {

  return {
    runTween: () => {
      let arc = arcs[INTERACTIVE_ARC_INDEX];
      let len = arc.geometry.attributes.lineDistance.array[99];
      let dur = len / speed;
      let arcTween = new TWEEN.Tween({value: 0})
        .to({value: 1}, dur * 1000)
        .onUpdate( val => {
          interactiveImpact.trailRatio.value = val.value
        })

      var impactTween = new TWEEN.Tween({ value: 0 })
        .to({ value: 1 }, THREE.MathUtils.randInt(2500, 5000))
        .onUpdate(val => {
          interactiveImpact.impactRatio = val.value;
        }) 
  
      //if repeat => clicking => we want to remove old tween
      if (interactiveTweenGroup.getAll().length > 0) {
        interactiveTweenGroup.removeAll()
      }
      interactiveTweenGroup.add(arcTween)
      interactiveTweenGroup.add(impactTween)
      arcTween.chain(impactTween)
      arcTween.start()
    },
    interactive: true
  }
}

function handleWindowResize () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', handleWindowResize, false);
window.addEventListener('click', onPointerClick);
