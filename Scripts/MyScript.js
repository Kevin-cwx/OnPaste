var log = console.log;

// Get the canvas element and context
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');

// Initialize variables for image and zoom level
let image;
let zoomLevel = 1;

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
document.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = Math.sign(event.deltaY);
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    zoomImage(delta, mouseX, mouseY);
});

// Function to load and display the image
function loadImage(src) {
    image = new Image();
    image.src = src;

    image.onload = () => {
        // Draw the image on the canvas
        drawImage();
    };
}

// Function to draw the image on the canvas
function drawImage() {
    const imageWidth = image.width * zoomLevel;
    const imageHeight = image.height * zoomLevel;

    // Set canvas dimensions based on the image size and zoom level
    canvas.width = imageWidth;
    canvas.height = imageHeight;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the scaled and translated image on the canvas
    ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
}

// Function to zoom the image
function zoomImage(delta, mouseX, mouseY) {
    if (!image) return;

    // Calculate the position of the mouse relative to the canvas
    const canvasRect = canvas.getBoundingClientRect();
    const mouseCanvasX = mouseX - canvasRect.left;
    const mouseCanvasY = mouseY - canvasRect.top;

    // Adjust the zoom level based on the zoom direction
    zoomLevel *= delta > 0 ? 1.2 : 0.8;

    // Draw the image on the canvas
    drawImage();
}