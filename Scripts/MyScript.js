var log = console.log;

// Get the canvas element and context
const canvas = document.getElementById("imageCanvas");
const ctx = canvas.getContext("2d");

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
document.addEventListener("paste", (event) => {
  const items = (event.clipboardData || event.originalEvent.clipboardData)
    .items;

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
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
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();

  const delta = Math.sign(event.deltaY);
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  zoomImage(delta, mouseX, mouseY);
});

// Mouse events for panning
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !image) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;

  offsetX += dx;
  offsetY += dy;

  lastX = e.clientX;
  lastY = e.clientY;

  drawImage();
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.style.cursor = "grab";
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
  canvas.style.cursor = "default";
});

// Set initial cursor style
canvas.style.cursor = "grab";

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
  ctx.drawImage(
    image,
    0,
    0,
    image.width,
    image.height,
    0,
    0,
    scaledWidth,
    scaledHeight
  );
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
window.addEventListener("resize", () => {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  if (image) drawImage();
});

// Create custom context menu element
const customMenu = document.createElement("div");
customMenu.style.position = "fixed";
customMenu.style.background = "#333";
customMenu.style.color = "white";
customMenu.style.padding = "8px 12px";
customMenu.style.borderRadius = "4px";
customMenu.style.fontFamily = "Arial, sans-serif";
customMenu.style.fontSize = "14px";
customMenu.style.cursor = "pointer";
customMenu.style.userSelect = "none";
customMenu.style.zIndex = 10000;
customMenu.style.display = "none";
document.body.appendChild(customMenu);

// Menu options
const menuItems = [
  { text: "Copy", action: copyImageToClipboard },
  { text: "Paste", action: triggerPaste },
  { text: "Download", action: saveImageAsFile },
  { text: "Refresh", action: refreshPage },
];

// Populate menu
// Populate menu with icons + text side by side
menuItems.forEach((item) => {
  const div = document.createElement("div");
  div.style.padding = "4px 8px";
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.gap = "8px"; // space between icon and text
  div.style.userSelect = "none";

  // Create icon element depending on item text
  const icon = document.createElement("i");
  icon.style.width = "16px";  // consistent icon space
  icon.style.textAlign = "center";
  icon.style.fontSize = "14px";

  switch (item.text) {
    case "Copy":
      icon.className = "fa-solid fa-copy";
      break;
    case "Paste":
      icon.className = "fa-solid fa-paste";
      break;
    case "Download":
      icon.className = "fa-solid fa-download";
      break;
    case "Refresh":
      icon.className = "fa-solid fa-arrows-rotate";
      break;
    default:
      icon.className = ""; // no icon
  }

  // Append icon only if className set (to avoid empty <i>)
  if (icon.className) {
    div.appendChild(icon);
  }

  // Text span
  const textNode = document.createElement("span");
  textNode.textContent = item.text;
  div.appendChild(textNode);

  div.addEventListener("click", () => {
    hideCustomContextMenu();
    item.action();
  });

  customMenu.appendChild(div);
});







// Show custom menu on right-click
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showCustomContextMenu(e.clientX, e.clientY);
});

function showCustomContextMenu(x, y) {
  customMenu.style.top = y + "px";
  customMenu.style.left = x + "px";
  customMenu.style.display = "block";
}

function hideCustomContextMenu() {
  customMenu.style.display = "none";
}

// Hide menu on clicking anywhere else
document.addEventListener("click", () => {
  hideCustomContextMenu();
});

// === Action implementations ===

// Copy canvas image to clipboard
async function copyImageToClipboard() {
  if (!image) return;

  const croppedCanvas = getCroppedCanvas();
  if (!croppedCanvas) return;

  croppedCanvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      log("Image copied without extra transparent background");
    } catch (err) {
      log("Failed to copy image:", err);
    }
  });
}

// Paste image from clipboard (focus hidden contenteditable)
async function triggerPaste() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    return;
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const clipboardItem of clipboardItems) {
      for (const type of clipboardItem.types) {
        if (type.startsWith("image/")) {
          const blob = await clipboardItem.getType(type);
          const reader = new FileReader();
          reader.onload = (e) => {
            loadImage(e.target.result);
          };
          reader.readAsDataURL(blob);
          return; // stop after first image
        }
      }
    }
  } catch (err) {}
}

// Save current canvas image as PNG file
function saveImageAsFile() {
  if (!image) return;

  const croppedCanvas = getCroppedCanvas();
  if (!croppedCanvas) return;

  croppedCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cropped-image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

function refreshPage() {
  location.reload();
}

// Only show download option if image is loaded
const downloadMenuItem = Array.from(customMenu.children).find(
  (child) => child.textContent === "Download"
);

// Modify showCustomContextMenu to toggle "Download" visibility:
function showCustomContextMenu(x, y) {
  if (downloadMenuItem) {
    downloadMenuItem.style.display = image ? "block" : "none";
  }
  customMenu.style.top = y + "px";
  customMenu.style.left = x + "px";
  customMenu.style.display = "block";
}

function getCroppedCanvas() {
  if (!image) return null;

  const scaledWidth = image.width * zoomLevel;
  const scaledHeight = image.height * zoomLevel;

  // Create temporary canvas of exact image size
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = scaledWidth;
  tempCanvas.height = scaledHeight;

  const tempCtx = tempCanvas.getContext("2d");

  // Clear temp canvas (transparent background)
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw the image scaled at (0,0) ignoring offset (crop canvas is exactly image size)
  tempCtx.drawImage(
    image,
    0,
    0,
    image.width,
    image.height,
    0,
    0,
    scaledWidth,
    scaledHeight
  );

  return tempCanvas;
}