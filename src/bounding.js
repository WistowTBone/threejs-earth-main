// Function to create text label with bounding box
function textLabel(text, x, y, z, normal) {
    // Create the label
    const labelTexture = new THREE.CanvasTexture(createLabelCanvas(text));
    const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
    const label = new THREE.Sprite(labelMaterial);
  
    // Scale the sprite to make it bigger
    label.scale.set(5, 5, 1); // Adjust the scale values as needed to make the label bigger or smaller
    
    // Position the label at the end of the cylinder
    label.position.set(x, y, z);
    label.position.add(normal.clone().multiplyScalar(2)); // 2 is the height of the cylinder
  
    // Create a bounding box for the label
    const boundingBox = new THREE.Box3().setFromObject(label);
    label.userData.boundingBox = boundingBox;
  
    return label;
  }
  
  // Function to check for overlapping labels
  function checkForOverlappingLabels(labels) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        if (labels[i].userData.boundingBox.intersectsBox(labels[j].userData.boundingBox)) {
          console.log(`Label ${i} is overlapping with Label ${j}`);
        }
      }
    }
  }
  
  // Add locations to the earth
  const locationsMesh = [];
  const labels = [];
  for (let i = 0; i < locations.length; i++) {
    const coords = getCartesianCoords(locations[i].latitude, locations[i].longitude, 20);
    // Calculate the normal vector to the surface of the sphere at the given point      
    const normal = new THREE.Vector3(coords.x, coords.y, coords.z).normalize();
  
    const cylinderGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 32);
    // Translate the geometry so that the tip is at the origin
    cylinderGeometry.translate(0, 1, 0);
  
    locationsMesh[i] = new THREE.Mesh(
      cylinderGeometry,
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
  
    locationsMesh[i].position.set(coords.x, coords.y, coords.z);
  
    // Align the cylinder with the surface normal
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    locationsMesh[i].quaternion.copy(quaternion);
  
    // Translate the cylinder so that the tip is at the surface
    locationsMesh[i].position.add(normal.clone().multiplyScalar(1)); // 1 is half the height of the cylinder
    scene.add(locationsMesh[i]);
  
    // Add text label
    labels[i] = textLabel(locations[i].name, coords.x, coords.y, coords.z, normal);
    scene.add(labels[i]);
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
  
  // Function to create a canvas with the label text
  function createLabelCanvas(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256; // Increase canvas width
    canvas.height = 64; // Increase canvas height
    context.fillStyle = 'rgba(0, 0, 0, 1.0)'; // Set background color to black
    context.fillRect(0, 0, canvas.width, canvas.height); // Fill the canvas with the background color
    context.font = 'Bold 40px Arial'; // Increase font size
    context.fillStyle = 'rgba(0, 255, 0, 1.0)'; // Set font color to green
  
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
          context.fillText(line, (canvas.width - lineWidth) / 2, y); // Center the line
          line = words[n] + ' ';
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      const lineWidth = context.measureText(line).width;
      context.fillText(line, (canvas.width - lineWidth) / 2, y); // Center the last line
    }
  
    // Wrap and draw the text
    wrapText(context, text, canvas.width - 20, 40); // Adjust maxWidth and lineHeight as needed
  
    return canvas;
  }
  
  // Call the function to check for overlapping labels
  checkForOverlappingLabels(labels);
  