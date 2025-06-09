var log = console.log;

// Get the canvas element and context
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');

// Initialize variables
let image;
let zoomLevel = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastX = 0;
let lastY = 0;

// Set canvas to fill its container (or set your desired dimensions)
canvas.width = canvas.parentElement.clientWidth;
canvas.height = canvas.parentElement.clientHeight;

// Handle paste events
document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();

            reader.onload = (e) => {
                loadImage(e.target.result);
            };

            reader.readAsDataURL(blob);
        }
    }
});

// Handle mouse wheel events for zooming
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = Math.sign(event.deltaY);
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    zoomImage(delta, mouseX, mouseY);
});

// Mouse events for panning
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || !image) return;
    
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    
    offsetX += dx;
    offsetY += dy;
    
    lastX = e.clientX;
    lastY = e.clientY;
    
    drawImage();
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
});

// Set initial cursor style
canvas.style.cursor = 'grab';

// Function to load and display the image
function loadImage(src) {
    image = new Image();
    image.src = src;

    image.onload = () => {
        // Reset position and zoom when new image is loaded
        zoomLevel = 1;
        offsetX = (canvas.width - image.width) / 2; // Center image horizontally
        offsetY = (canvas.height - image.height) / 2; // Center image vertically
        drawImage();
    };
}

// Function to draw the image on the canvas
function drawImage() {
    if (!image) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scaled dimensions
    const scaledWidth = image.width * zoomLevel;
    const scaledHeight = image.height * zoomLevel;

    // Draw the scaled and translated image on the canvas
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, scaledWidth, scaledHeight);
    ctx.restore();
}

// Function to zoom the image
function zoomImage(delta, mouseX, mouseY) {
    if (!image) return;

    // Get canvas position and dimensions
    const canvasRect = canvas.getBoundingClientRect();
    
    // Calculate mouse position relative to canvas
    const mouseCanvasX = mouseX - canvasRect.left;
    const mouseCanvasY = mouseY - canvasRect.top;
    
    // Calculate mouse position relative to image before zoom
    const imageX = (mouseCanvasX - offsetX) / zoomLevel;
    const imageY = (mouseCanvasY - offsetY) / zoomLevel;

    // Adjust the zoom level
    const zoomFactor = delta < 0 ? 1.2 : 0.8;
    const newZoom = zoomLevel * zoomFactor;
    
    // Limit zoom levels if desired
    const minZoom = 0.1;
    const maxZoom = 10;
    if (newZoom < minZoom || newZoom > maxZoom) return;
    
    zoomLevel = newZoom;

    // Adjust offset to zoom toward mouse position
    offsetX = mouseCanvasX - imageX * zoomLevel;
    offsetY = mouseCanvasY - imageY * zoomLevel;

    // Draw the image
    drawImage();
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    if (image) drawImage();
});