import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'jsm/loaders/GLTFLoader.js';
//import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";

// Fetch the JSON locations file
let locations = [];
fetch('./database/locations.json')
  .then(response => response.json())
  .then(data => {
    locations = data;
    //variable to store last text mesh
    let lastTextMesh = null;
    //set window variables
    const w = window.innerWidth;
    const h = window.innerHeight;
    //const w = 400;
    //const h = 300;

    //Set up Scene/camera/renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.z = 40;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(w, h);
    document.body.appendChild(renderer.domElement);
    // THREE.ColorManagement.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    //mouse and raycaster
    const mouseLoc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    //Create Earth
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    new OrbitControls(camera, renderer.domElement);
    const detail = 12;
    const loader = new THREE.TextureLoader();
    const geometry = new THREE.IcosahedronGeometry(20, detail);
    
    // Load Textures
    const material = new THREE.MeshPhongMaterial({
      map: loader.load("./textures/BlueMarble.jpg"),
      specularMap: loader.load("./textures/02_earthspec1k.jpg"),
      bumpMap: loader.load("./textures/01_earthbump1k.jpg"),
      bumpScale: 0.04,
    });
    const earthMesh = new THREE.Mesh(geometry, material);
    earthGroup.add(earthMesh);

    // Night Lights on Earth
    const lightsMat = new THREE.MeshBasicMaterial({
      map: loader.load("./textures/SuperEarthLights.jpg"),
      blending: THREE.AdditiveBlending,
    });
    const lightsMesh = new THREE.Mesh(geometry, lightsMat);
    earthGroup.add(lightsMesh);

    // Clouds just above earth
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: loader.load("./textures/04_earthcloudmap.jpg"),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      alphaMap: loader.load('./textures/05_earthcloudmaptrans.jpg'),
      // alphaTest: 0.3,
    });
    const cloudsMesh = new THREE.Mesh(geometry, cloudsMat);
    cloudsMesh.scale.setScalar(1.003);
    earthGroup.add(cloudsMesh);

    // Blue glow around earth
    const fresnelMat = getFresnelMat();
    const glowMesh = new THREE.Mesh(geometry, fresnelMat);
    glowMesh.scale.setScalar(1.01);
    earthGroup.add(glowMesh);

    //Add sunlight 
    const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    sunLight.position.set(-20, 0.5, 1.5);
    scene.add(sunLight);


    // Add locations to the earth
    const locationsMesh = [];
    for (let i = 0; i < locations.length; i++) {
      const coords = getCartesianCoords(locations[i].latitude, locations[i].longitude, 19.9);
      locationsMesh[i] = new THREE.Mesh(
        new THREE.SphereGeometry(.2, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      locationsMesh[i].position.set(coords.x, coords.y, coords.z);
      scene.add(locationsMesh[i]);
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


    //Create text label
    function textLabel(text, x, y, z) {
      // Create a canvas and draw text on it
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = '34px Arial';
      context.textAlign = 'center';
      const textsize = context.measureText(text)
      canvas.width = textsize.width + 50;
      canvas.height = canvas.width / 3;
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'Blue';
      context.fillRect(5, 5, canvas.width - 10, canvas.height - 10);
      context.fillStyle = 'White';
      context.font = '34px Arial';
      context.textAlign = 'center';
      context.measureText(text)
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      // Create a texture from the canvas
      const texture = new THREE.CanvasTexture(canvas);

      // Create a plane geometry and apply the texture as its material
      const geometry = new THREE.PlaneGeometry(5, 2.5);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.8 });
      const textMesh = new THREE.Mesh(geometry, material);
      scene.add(textMesh);
      textMesh.position.set(x, y, z);
      textMesh.lookAt(camera.position);

      // Store the reference to the last added textMesh object lastTextMesh
      lastTextMesh = textMesh;
    }

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);
      const rotationAmount = 0.0002;
      for (let i = 0; i < locations.length; i++) {
        locations[i].longitude += rotationAmount * 180 / Math.PI;
        const coords = getCartesianCoords(locations[i].latitude, locations[i].longitude, 19.9);
        locationsMesh[i].position.set(coords.x, coords.y, coords.z);
      }
      earthMesh.rotation.y += rotationAmount;
      lightsMesh.rotation.y += rotationAmount;
      cloudsMesh.rotation.y += rotationAmount * 1.5;
      glowMesh.rotation.y += rotationAmount;
      if (lastTextMesh != null) {
        lastTextMesh.lookAt(camera.position);
      }

      renderer.render(scene, camera);
    }

    // Mouse over event
    function onMouseMove(event) {
      mouseLoc.x = (event.clientX / w) * 2 - 1;
      mouseLoc.y = -(event.clientY / h) * 2 + 1;
      raycaster.setFromCamera(mouseLoc, camera);
      for (let i = 0; i < locations.length; i++) {
        const intersects = raycaster.intersectObjects([locationsMesh[i]]);
        if (intersects.length > 0) {
          console.log('Mouse over location');
          locationsMesh[i].material.color.set(0x00ff00);
          //woosh.play();
          { break; }
        } else {
          locationsMesh[i].material.color.set(0xff0000);
        }
      }
    }

    // Mouse Click Event
    function onMouseClick(event) {
      mouseLoc.x = (event.clientX / w) * 2 - 1;
      mouseLoc.y = -(event.clientY / h) * 2 + 1;
      raycaster.setFromCamera(mouseLoc, camera);
      for (let i = 0; i < locations.length; i++) {
        const intersects = raycaster.intersectObjects([locationsMesh[i]]);
        if (intersects.length > 0) {
          // Set colour to green
          locationsMesh[i].material.color.set(0x00ff00);

          //Text box with location name and info 
          const halfwayX = ((camera.position.x + locationsMesh[i].position.x) / 2);
          const halfwayY = ((camera.position.y + locationsMesh[i].position.y) / 2);
          const halfwayZ = ((camera.position.z + locationsMesh[i].position.z) / 2);
          textLabel(locations[i].name, halfwayX, halfwayY, halfwayZ);
          
          // Speak Name of Location
          const utterance = new SpeechSynthesisUtterance(locations[i].name);
          window.speechSynthesis.speak(utterance);
          { break; }
        } else {
          locationsMesh[i].material.color.set(0xff0000);
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

    // Start the animation loop
    animate();

    // Resize event
    function handleWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    // Event listeners
    window.addEventListener('resize', handleWindowResize, false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('mouseup', onMouseUp);
  })
  // Catch any errors and log them to the console
  .catch(error => console.error('Error loading JSON:', error));