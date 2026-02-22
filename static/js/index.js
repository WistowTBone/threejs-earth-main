import * as THREE from "three";
import { step, normalWorldGeometry, output, texture, vec3, vec4, normalize, positionWorld, bumpMap, cameraPosition, color, uniform, mix, uv, max } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Fetch the JSON locations file
let locations = [];
// Global fallback: if a geometry is queried for `uv` and doesn't have it,
// create a zeroed uv attribute so node/materials that expect `uv` don't throw.
;(function(){
  const proto = THREE.BufferGeometry && THREE.BufferGeometry.prototype;
  if (proto && !proto._uvFallbackInstalled) {
    const origGet = proto.getAttribute;
    proto.getAttribute = function(name){
      const attr = origGet.call(this, name);
      if (!attr && name === 'uv') {
        try {
          const pos = origGet.call(this, 'position');
          const count = pos ? pos.count : 0;
          const uvArray = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) { uvArray[i*2] = 0; uvArray[i*2+1] = 0; }
          const bufferAttr = new THREE.BufferAttribute(uvArray, 2);
          this.setAttribute('uv', bufferAttr);
          return bufferAttr;
        } catch (e) {
          console.warn('uv fallback failed:', e);
          return null;
        }
      }
      return attr;
    };
    proto._uvFallbackInstalled = true;
  }
})();
fetch('static/src/locations.json')
  .then(response => response.json())
  .then(async data => {
    locations = data;

    //variable to store last text mesh
    let lastTextMesh = null;
    // currently hovered label index to avoid updating all labels
    let hoveredLabelIndex = -1;
    //set window variables
    //const w = window.innerWidth;
    //const h = window.innerHeight;
    const canvasContainer = document.getElementById("globeCanvas");
    let w = canvasContainer.offsetWidth;
    let h = canvasContainer.offsetHeight;
    let totalEarthRotation = 0;
    //Set up Scene/camera/renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.z = 40;
    let renderer;

    // Use WebGPU renderer unconditionally (from importmap 'three' build)
    renderer = new THREE.WebGPURenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    // Hide the original canvas element (we'll use renderer.domElement)
    try {
      canvasContainer.style.display = 'none';
      const parent = canvasContainer.parentElement || document.body;
      parent.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
    } catch (e) {
      console.warn('Could not append WebGPU renderer DOM element, continuing:', e);
    }
    // Some renderer properties may not exist on WebGPURenderer; guard them
    try { THREE.ColorManagement.enabled = true; } catch (e) {}
    try { renderer.toneMapping = THREE.ACESFilmicToneMapping; } catch (e) {}
    try { renderer.outputColorSpace = THREE.LinearSRGBColorSpace; } catch (e) {}
 

    //mouse and raycaster
    const mouseLoc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    raycaster.camera = camera

    // Create globe using WebGPU node materials (TSL)
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    // Zoom limits (distance from origin)
    const MIN_ZOOM = 21;  // Just above planet surface (radius 20)
    const MAX_ZOOM = 120;
    controls.minDistance = MIN_ZOOM;
    controls.maxDistance = MAX_ZOOM;
    let _zoomNoticeTimeout = null;
    function showZoomNotice(text = 'Maximum zoom reached'){
      let el = document.getElementById('zoomNotice');
      if (!el) {
        el = document.createElement('div');
        el.id = 'zoomNotice';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.bottom = '14px';
        el.style.zIndex = '9999';
        el.style.padding = '8px 12px';
        el.style.background = 'rgba(0,0,0,0.7)';
        el.style.color = '#fff';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.borderRadius = '4px';
        el.style.fontSize = '0.9rem';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = 'block';
      if (_zoomNoticeTimeout) clearTimeout(_zoomNoticeTimeout);
      _zoomNoticeTimeout = setTimeout(()=>{ el.style.display = 'none'; }, 2200);
    }
    controls.addEventListener('change', () => {
      // OrbitControls handles the clamping internally via minDistance/maxDistance
    });

    // Sun (directional light)
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(0, 0, 125);
    scene.add(sun);

    // --- UNIFORMS ---
    // Define colors for atmosphere and surface roughness values
    const atmosphereDayColor = uniform(color('#4db2ff')); // Light blue for daytime atmosphere
    const atmosphereTwilightColor = uniform(color('#bc490b')); // Orange for twilight atmosphere
    const roughnessLow = uniform(0.25); // Minimum surface roughness
    const roughnessHigh = uniform(0.35); // Maximum surface roughness

    // --- TEXTURES ---
    // Load textures for day, night, and bump/roughness/clouds
    const textureLoader = new THREE.TextureLoader();

    // Day texture: Earth's surface during daylight
    const dayTexture = textureLoader.load('textures/planets/earth_day_4096.jpg');
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 8;
    dayTexture.wrapS = THREE.RepeatWrapping;
    dayTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Night texture: Earth's surface during nighttime
    const nightTexture = textureLoader.load('textures/planets/earth_night_4096.jpg');
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;
    nightTexture.wrapS = THREE.RepeatWrapping;
    nightTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Bump/roughness/clouds texture: used for surface detail and cloud strength
    const bumpRoughnessCloudsTexture = textureLoader.load('textures/planets/earth_bump_roughness_clouds_4096.jpg');
    bumpRoughnessCloudsTexture.anisotropy = 8;
    bumpRoughnessCloudsTexture.wrapS = THREE.RepeatWrapping;
    bumpRoughnessCloudsTexture.wrapT = THREE.ClampToEdgeWrapping;


    // --- UV COORDINATE OFFSET ---
    // Offset UV by 0.5 in U coordinate to rotate textures 180 degrees
    const rotatedUV = uv().add(vec3(0.5, 0, 0));

    // --- NODE CALCULATIONS FOR SHADING ---
    // Calculate view direction and fresnel effect for atmosphere shading
    const viewDirection = positionWorld.sub(cameraPosition).normalize();
    // Fresnel: how much the surface faces the camera (for rim lighting/atmosphere)
    const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar();
    // Sun orientation: how much the surface faces the sun (for day/night and atmosphere color)
    const sunOrientation = normalWorldGeometry.dot(normalize(sun.position)).toVar();
    // Blend between twilight and day atmosphere colors based on sun orientation
    const atmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor, sunOrientation.smoothstep(-0.25, 0.75));

    // --- GLOBE MATERIAL SETUP ---
    // Create a node-based material for the globe
    const globeMaterial = new THREE.MeshStandardNodeMaterial();

    // Calculate cloud strength from bump/roughness/clouds texture
    const cloudsStrength = texture(bumpRoughnessCloudsTexture, rotatedUV).b.smoothstep(0.2, 1);
    // Blend day texture with white based on cloud strength
    globeMaterial.colorNode = mix(texture(dayTexture, rotatedUV), vec3(1), cloudsStrength.mul(2));

    // Compute roughness from bump/roughness/clouds texture and cloud strength
    const roughness = max(
      texture(bumpRoughnessCloudsTexture, uv()).g,
      step(0.01, cloudsStrength)
    );
    globeMaterial.roughnessNode = roughness.remap(0, 1, roughnessLow, roughnessHigh);

    // Night texture for the globe
    const night = texture(nightTexture, rotatedUV);
    // How much the surface is in daylight (for blending day/night textures)
    const dayStrength = sunOrientation.smoothstep(-0.25, 0.5);

    // Atmosphere blending based on sun orientation and fresnel
    const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1);
    const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1);

    // Final color output: blend night, day, and atmosphere colors
    let finalOutput = mix(night.rgb, output.rgb, dayStrength);
    finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix);
    globeMaterial.outputNode = vec4(finalOutput, output.a);

    // Bump mapping for globe surface elevation
    const bumpElevation = max(
      texture(bumpRoughnessCloudsTexture, rotatedUV).r,
      cloudsStrength
    );
    const BUMP_SCALE = 1.0; // Increase for more exaggeration
    globeMaterial.normalNode = bumpMap(bumpElevation.mul(BUMP_SCALE));
    
    // Create the globe mesh and add to scene
    const sphereGeometry = new THREE.SphereGeometry(20, 64, 64);
    const globe = new THREE.Mesh(sphereGeometry, globeMaterial);
    scene.add(globe);

    // --- ATMOSPHERE MATERIAL SETUP ---
    // Create a transparent, back-side mesh for the atmosphere
    const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true });
    // Alpha for atmosphere: rim effect and day strength
    let alpha = fresnel.remap(0.73, 1, 1, 0).pow(3);
    alpha = alpha.mul(sunOrientation.smoothstep(-0.5, 1));
    atmosphereMaterial.outputNode = vec4(atmosphereColor, alpha);

    // Create the atmosphere mesh, scale it up, and add to scene
    const atmosphere = new THREE.Mesh(sphereGeometry, atmosphereMaterial);
    atmosphere.scale.setScalar(1.06);
    scene.add(atmosphere);

    // get ISS model
    const gltfloader = new GLTFLoader();
    let iss = null;
    let isslatitude = 0;
    let isslongitude = 0;
    gltfloader.load('static/models/ISS_stationary.glb', async (gltf) => {
      iss = gltf.scene;
      iss.traverse((child) => {
        if (child.isMesh) {
          child.geometry.center();
        }
      });
      iss.scale.set(0.02, 0.02, 0.02);
      setISSPosition(iss);
      await scene.add(iss);
      setInterval(setISSPosition, 5000, iss);
    });

    // Add locations to the earth
    const locationsMesh = [];
    const labels = [];
    const labelHeight = 2;
    const labelColor = 'rgba(0, 255, 255, 1.0)';
    const labelHoverColor = 'rgba(255, 255, 0, 1.0)';

    for (let i = 0; i < locations.length; i++) {
      const coords = getCartesianCoords(locations[i].latitude, locations[i].longitude, 20);
      // Calculate the normal vector to the surface of the sphere at the given point      
      const normal = new THREE.Vector3(coords.x, coords.y, coords.z).normalize();

      const cylinderGeometry = new THREE.CylinderGeometry(.05, .05, labelHeight, 32);
      // Translate the geometry so that the tip is at the origin
      cylinderGeometry.translate(0, labelHeight / 2, 0);

      locationsMesh[i] = new THREE.Mesh(
        cylinderGeometry,
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );

      locationsMesh[i].position.set(coords.x, coords.y, coords.z);

      // Align the cylinder with the surface normal
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      locationsMesh[i].quaternion.copy(quaternion);

      // Translate the cylinder so that the tip is at the surface
      locationsMesh[i].position.add(normal.clone().multiplyScalar(labelHeight / 2)); // labelHeight/2 is half the height of the cylinder
      scene.add(locationsMesh[i]);

      // Add text label
      labels[i] = textLabel(locations[i].name, coords.x, coords.y, coords.z, normal);
      labels[i].position.set(coords.x, coords.y, coords.z);
      scene.add(labels[i]);
      if (labels.length > 1) {
        ajustForOverlappingLabels(labels);
      }
    }

    // Function to check for overlapping labels
    function ajustForOverlappingLabels(labels) {
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const distance = labels[i].position.distanceTo(labels[j].position);
          if (distance < labels[i].scale.y / 2) {
            // Move the labels 
            const overlapAmount = labels[i].scale.y / 2;
            labels[i].position.add(new THREE.Vector3(0, 0, overlapAmount));
            labels[i].userData = { overlap: overlapAmount };
            labels[j].position.add(new THREE.Vector3(0, 0, -overlapAmount));
            labels[j].userData = { overlap: -overlapAmount };
          } else {
            // dont overwrite the overlap value if it is already set
            if (labels[i].userData.overlap === undefined) {
              labels[i].userData = { overlap: 0 };
              labels[j].userData = { overlap: 0 };
            }
          }
        }
      }
    }

    // Calculate the x,y,z coordinates of a point on a sphere
    function getCartesianCoords(lat, lon, radius) {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lon - 0.5) * Math.PI / 180;
      const x = -radius * Math.sin(phi) * Math.cos(theta);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      return { x, y, z };
    }

    //function to create text label
    function textLabel(text, x, y, z, normal) {
      // Create the label
      const labelTexture = new THREE.CanvasTexture(createLabelCanvas(text, labelColor));
      const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
      const label = new THREE.Sprite(labelMaterial);

      // Scale the sprite to make it bigger
      label.scale.set(5, 2.5, 10); // Adjust the scale values as needed to make the label bigger or smaller

      // Position the label at the end of the cylinder + .2 unit along the normal vector
      label.position.set(x, y, z);
      label.position.add(normal.clone().multiplyScalar(labelHeight + .2));
      return label;
    }

    function createLabelCanvas(text, color) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256; // Set canvas width
      canvas.height = 128;// Set canvas height to accommodate multiple lines
      context.font = 'Bold 20px Arial';
      context.fillStyle = color;
      //context.fillText(text, 0, 80);

      // Function to wrap text
      function wrapText(context, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = context.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            const lineWidth = context.measureText(line).width;
            context.fillText(line, (canvas.width - lineWidth) / 2, y); //centre text 
            line = words[n] + ' ';
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        const lineWidth = context.measureText(line).width;
        context.fillText(line, (canvas.width - lineWidth) / 2, y); //centre text
      }

      // Wrap and draw the text
      wrapText(context, text, 10, 50, canvas.width - 20, 20); // Adjust x, y, maxWidth, and lineHeight as needed


      return canvas;
    }

    // Update Label Positions
    function updateLabelPositions(rotationAmount) {
      for (let i = 0; i < locations.length; i++) {
        locations[i].longitude += rotationAmount * 180 / Math.PI;
        const coords = getCartesianCoords(locations[i].latitude, locations[i].longitude, 20);
        locationsMesh[i].position.set(coords.x, coords.y, coords.z);

        // Recalculate the surface normal
        const normal = new THREE.Vector3(coords.x, coords.y, coords.z).normalize();

        // Align the cylinder with the surface normal
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        locationsMesh[i].quaternion.copy(quaternion);

        // Update the label position
        labels[i].position.set(coords.x, coords.y, coords.z);
        labels[i].position.add(normal.clone().multiplyScalar(labelHeight + .2));
        // if labels overlap then move y by overlap amount
        if (labels[i].userData.overlap != 0) {
          labels[i].position.add(new THREE.Vector3(0, 0, labels[i].userData.overlap));
        }
      }
    }

    async function setISSPosition(iss) {
      try {
        const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await response.json();
        const lat = parseFloat(data.latitude);
        const lon = parseFloat(data.longitude);
        const coords = getCartesianCoords(lat, lon, 21.5);
        isslatitude = lat;
        isslongitude = lon + (totalEarthRotation * 180 / Math.PI);
        iss.position.set(coords.x, coords.y, coords.z);
        //console.log(coords);
      } catch (error) {
        console.error('Error loading JSON:', error);
      }
    }
    // Update Label Positions
    function updateISSPosition(rotationAmount) {
      if (iss) {
        isslongitude += rotationAmount * 180 / Math.PI;
        const coords = getCartesianCoords(isslatitude, isslongitude, 21.5);
        iss.position.set(coords.x, coords.y, coords.z);
        //iss face origin
        iss.lookAt(0, 0, 0);
      } else {
        console.log('ISS not loaded yet');
      }
    }


    // Animation Loop (use WebGPU renderer animation loop)
    function animate() {
      const rotationAmount = 0.0002;

      // Check zoom limits and show warnings
      const camDist = camera.position.length();
      if (camDist >= MAX_ZOOM - 0.5) {
        showZoomNotice('Maximum zoom reached');
      }
      if (camDist <= MIN_ZOOM + 0.5) {
        showZoomNotice('You need glasses'); // fun message for minimum zoom
      }

      // Sun stays fixed at world position; as Earth rotates, day/night boundary moves across it

      // Update the total rotation amount
      totalEarthRotation += rotationAmount;
      if (totalEarthRotation > 2 * Math.PI) {
        totalEarthRotation = 0;
      }

      // Animate locations and labels
      updateLabelPositions(rotationAmount);
      updateISSPosition(rotationAmount);

      // Rotate the globe and atmosphere
      if (typeof globe !== 'undefined') globe.rotation.y += rotationAmount;
      if (typeof atmosphere !== 'undefined') atmosphere.rotation.y += rotationAmount;

      // Render the scene
      renderer.render(scene, camera);
    }

    // Mouse over event
    function onMouseMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      mouseLoc.x = (x / w) * 2 - 1;
      mouseLoc.y = - (y / h) * 2 + 1;
      raycaster.setFromCamera(mouseLoc, camera);

      const intersects = raycaster.intersectObjects(labels);
      if (intersects.length > 0) {
        const hitLabel = intersects[0].object;
        const idx = labels.indexOf(hitLabel);
        if (idx !== hoveredLabelIndex) {
          // revert previous hovered label
          if (hoveredLabelIndex >= 0 && labels[hoveredLabelIndex]) {
            const canvas = createLabelCanvas(locations[hoveredLabelIndex].name, labelColor);
            const tex = labels[hoveredLabelIndex].material.map;
            if (tex) { tex.image = canvas; tex.needsUpdate = true; }
          }
          // set new hovered label
          hoveredLabelIndex = idx;
          const canvas = createLabelCanvas(locations[idx].name, labelHoverColor);
          const texNew = labels[idx].material.map;
          if (texNew) { texNew.image = canvas; texNew.needsUpdate = true; }

          // update info box
          let myDiv = document.getElementById("launches");
          myDiv.innerHTML = "<p>" + locations[idx].name + "</p>" +
            "<p># Launches: " + locations[idx].count + "</p>" +
            "<p>Next Launch: " + locations[idx].next_launch + "</p>";
        }
      } else {
        // no intersection -> revert any previously hovered label
        if (hoveredLabelIndex >= 0 && labels[hoveredLabelIndex]) {
          const canvas = createLabelCanvas(locations[hoveredLabelIndex].name, labelColor);
          const tex = labels[hoveredLabelIndex].material.map;
          if (tex) { tex.image = canvas; tex.needsUpdate = true; }
          hoveredLabelIndex = -1;
        }
        // clear info box
        let myDiv = document.getElementById("launches");
        myDiv.innerHTML = "";
      }
    }

    // Mouse Click Event
    function onMouseClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      mouseLoc.x = (x / w) * 2 - 1;
      mouseLoc.y = - (y / h) * 2 + 1;
      raycaster.setFromCamera(mouseLoc, camera);

      const intersects = raycaster.intersectObjects(labels);
      if (intersects.length > 0) {
        const hitLabel = intersects[0].object;
        const i = labels.indexOf(hitLabel);
        if (i >= 0) {
          const canvas = createLabelCanvas(locations[i].name, 'rgba(255, 0, 0, 1.0)');
          const tex = labels[i].material.map;
          if (tex) { tex.image = canvas; tex.needsUpdate = true; }

          const utterance = new SpeechSynthesisUtterance(locations[i].name);
          window.speechSynthesis.speak(utterance);

          let location_url = "https://www.rocketspotter.com/location?id=".concat(locations[i].id);
          window.open(location_url);
        }
      }
    }
    // Mouse up Event
    function onMouseUp(event) {
      // Remove the text label
      if (lastTextMesh) {
        scene.remove(lastTextMesh);
        lastTextMesh = null;
      }
    }

    // Start the renderer animation loop (WebGPU)
    try {
      renderer.setAnimationLoop(animate);
    } catch (e) {
      // fallback to requestAnimationFrame if setAnimationLoop not available
      (function loop(){ requestAnimationFrame(loop); animate(); })();
    }

    // Resize event
    function handleWindowResize() {
      // Set canvas size to the larger of globeContainer's width or height
      const container = document.getElementById('globeContainer');
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;
      const size = Math.max(containerWidth, containerHeight);
      w = size;
      h = size;
      renderer.setSize(w, h, true);
      renderer.domElement.style.width = w + 'px';
      renderer.domElement.style.height = h + 'px';
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      updateLabelPositions(0);
      // Ensure camera and controls are centered on the globe
      if (typeof controls !== 'undefined') {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }
    // Event listeners
    window.addEventListener('resize', handleWindowResize, false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('mouseup', onMouseUp);
  })
  // Catch any errors and log them to the console
  .catch(error => console.error('Error loading JSON:', error));