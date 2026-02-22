import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';

// Fetch the JSON locations file
let locations = [];
fetch('./database/locations.json')
  .then(response => response.json())
  .then(data => {
    locations = data;
    // Create a 3D scene and camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas'),
      antialias: true
    });

    // Add some lights to the scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create a rocket model and animate it along a trajectory
    function createRocket() {
      const rocketGeometry = new THREE.SphereGeometry(0.1, 32, 32);
      const rocketMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const rocket = new THREE.Mesh(rocketGeometry, rocketMaterial);

      // Create a trajectory for the rocket
      function createTrajectory(location) {
        const trajectory = [];
        for (let i = 0; i < 10; i++) {
          const angle = Math.PI * 2 * i / 10;
          const distance = location.distance * i / 10;
          const x = distance * Math.cos(angle);
          const y = distance * Math.sin(angle);
          trajectory.push(new THREE.Vector3(x, y, location.height));
        }
        return trajectory;
      }

      // Create the rocket's initial position
      let currentTrajectoryIndex = 0;
      function updateRocketPosition() {
        if (currentTrajectoryIndex >= trajectory.length) {
          currentTrajectoryIndex = 0;
        }
        const currentLocation = trajectory[currentTrajectoryIndex];
        rocket.position.copy(currentLocation);
        camera.position.copy(location.position);
        renderer.render(scene, camera);
      }

      // Animate the rocket's position
      function animate() {
        requestAnimationFrame(animate);
        updateRocketPosition();
      }

      return { rocket, trajectory };
    }

    // Create a 3D orbit control for the camera
    const controls = new OrbitControls(camera, renderer.domElement);

    // Loop through each location and create a rocket
    locations.forEach((location) => {
      const { rocket, trajectory } = createRocket();
      scene.add(rocket);
      const animationId = requestAnimationFrame(animate);
      location.rocketAnimationId = animationId;
    });

    // Add event listener for mouse clicks on the canvas
    document.getElementById('canvas').addEventListener('click', (event) => {
      if (event.clientX > 0 && event.clientX < window.innerWidth && event.clientY > 0 && event.clientY < window.innerHeight) {
        const raycaster = new THREE.Raycaster();
        const mousePosition = new THREE.Vector2(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
        raycaster.setFromCamera(mousePosition, camera);
        const intersections = raycaster.intersectObjects(scene.children);
        if (intersections.length > 0) {
          const location = locations.find((l) => l.position.x === intersections[0].x && l.position.y === intersections[0].y && l.position.z === intersections[0].z);
          if (location) {
            location.currentTrajectoryIndex = Math.floor(Math.random() * trajectory.length);
            controls.target.copy(location.position);
          }
        }
      }
    });
  });
