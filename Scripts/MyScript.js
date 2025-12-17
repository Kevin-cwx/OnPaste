const appContainer = document.getElementById("appContainer");
const addWindowBtn = document.getElementById("addWindowBtn");
const darkModeBtn = document.getElementById("darkModeBtn");
const collectionBtn = document.getElementById("collectionBtn");
const collectionPanel = document.getElementById("collectionPanel");
const closeCollectionBtn = document.getElementById("closeCollectionBtn");
const collectionList = document.getElementById("collectionList");
const toast = document.getElementById("toast");

// Global Collection History
let imageHistory = [];

// Dark Mode
darkModeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  darkModeBtn.innerHTML = isDark
    ? '<i class="fa-solid fa-sun"></i>'
    : '<i class="fa-solid fa-moon"></i>';
});

// Collection Toggle
collectionBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent immediate closing
  collectionPanel.classList.toggle("open");
});

closeCollectionBtn.addEventListener("click", () => {
  collectionPanel.classList.remove("open");
});

// Close collection when clicking outside
document.addEventListener("click", (e) => {
  const isClickInsidePanel = collectionPanel.contains(e.target);
  const isClickOnToggle = collectionBtn.contains(e.target);
  const isOpen = collectionPanel.classList.contains("open");

  if (isOpen && !isClickInsidePanel && !isClickOnToggle) {
    collectionPanel.classList.remove("open");
  }
});

// Global State
let windows = [];
let activeWindow = null;
let windowIdCounter = 0;

// Context Menu    (Right Click)
const customMenu = document.createElement("div");
customMenu.style.position = "fixed";
customMenu.style.background = "rgba(22, 22, 22, 0.87)";
customMenu.style.color = "white";
customMenu.style.padding = "10px 4px";
customMenu.style.borderRadius = "20px";
customMenu.style.fontFamily = "'Quicksand', sans-serif"; // Updated Font
customMenu.style.fontSize = "18px";
customMenu.style.cursor = "pointer";
customMenu.style.userSelect = "none";
customMenu.style.border = "1px solid rgba(255,255,255,0.08)";
customMenu.style.backdropFilter = "blur(12px)"; // NEW
customMenu.style.webkitBackdropFilter = "blur(12px)";

customMenu.style.transform = "translateY(4px) scale(0.98)";

customMenu.style.zIndex = 10000;
customMenu.style.display = "none";
document.body.appendChild(customMenu);

let menuTargetWindow = null;

class ImageWindow {
  constructor(id) {
    this.id = id;
    this.container = document.createElement("div");
    this.container.className = "window";
    this.container.dataset.id = id;

    // Canvas Setup
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.container.appendChild(this.canvas);

    // Close Button
    this.closeBtn = document.createElement("button");
    this.closeBtn.className = "close-btn";
    this.closeBtn.innerHTML = "<i class='fa-solid fa-xmark'></i>";
    this.container.appendChild(this.closeBtn);

    // State
    this.image = null;
    this.zoomLevel = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;

    // Undo/Redo Stacks
    this.undoStack = [];
    this.redoStack = [];

    // Crop Mode State
    this.isInCropMode = false;
    this.isSelecting = false;
    this.selectionStartX = 0;
    this.selectionStartY = 0;
    this.selectionEndX = 0;
    this.selectionEndY = 0;

    this.initEvents();
  }

  initEvents() {
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.container);

    this.container.addEventListener("mousedown", () => setActiveWindow(this));

    this.closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeWindow(this);
    });

    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e));
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("mouseup", (e) => this.handleMouseUp(e));
    this.canvas.addEventListener("mouseleave", (e) => this.handleMouseLeave(e));
    this.canvas.addEventListener("contextmenu", (e) =>
      this.handleContextMenu(e)
    );

    // Drag and Drop Events
    this.container.addEventListener("dragover", (e) => {
      e.preventDefault(); // Allow drop
      this.container.style.boxShadow = "inset 0 0 0 4px #007acc";
    });

    this.container.addEventListener("dragleave", (e) => {
      this.container.style.boxShadow = "";
    });

    this.container.addEventListener("drop", (e) => {
      e.preventDefault();
      this.container.style.boxShadow = "";
      const imageUrl = e.dataTransfer.getData("text/plain");
      if (imageUrl) {
        this.loadImage(imageUrl, false); // Don't duplicate history
        setActiveWindow(this);
      }
    });
  }

  setCloseButtonVisible(visible) {
    this.closeBtn.style.display = visible ? "flex" : "none";
  }

  resizeCanvas() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    if (this.image) this.drawImage();
  }

  loadImage(src, addToHistory = true) {
    // Save to undo stack
    if (this.image) {
      this.undoStack.push(this.image.src);
      if (this.undoStack.length > 20) this.undoStack.shift();
    }
    this.redoStack = [];

    this._applyImage(src);

    if (addToHistory) {
      addToCollection(src);
    }
  }

  _applyImage(src) {
    this.image = new Image();
    this.image.src = src;
    this.image.onload = () => {
      this.zoomLevel = 1;
      this.offsetX = (this.canvas.width - this.image.width) / 2;
      this.offsetY = (this.canvas.height - this.image.height) / 2;
      this.drawImage();
    };
  }

  undo() {
    if (this.undoStack.length === 0) return;
    if (this.image) this.redoStack.push(this.image.src);
    const prevSrc = this.undoStack.pop();
    this._applyImage(prevSrc);
    showToast("Undo");
  }

  redo() {
    if (this.redoStack.length === 0) return;
    if (this.image) this.undoStack.push(this.image.src);
    const nextSrc = this.redoStack.pop();
    this._applyImage(nextSrc);
    showToast("Redo");
  }

  drawImage() {
    if (!this.image) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const scaledWidth = this.image.width * this.zoomLevel;
    const scaledHeight = this.image.height * this.zoomLevel;

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.drawImage(
      this.image,
      0,
      0,
      this.image.width,
      this.image.height,
      0,
      0,
      scaledWidth,
      scaledHeight
    );
    this.ctx.restore();

    if (this.isSelecting) {
      this.drawSelectionRect();
    }
  }

  handleWheel(event) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    this.zoomImage(delta, event.clientX, event.clientY);
  }

  zoomImage(delta, mouseX, mouseY) {
    if (!this.image) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseCanvasX = mouseX - rect.left;
    const mouseCanvasY = mouseY - rect.top;

    const imageX = (mouseCanvasX - this.offsetX) / this.zoomLevel;
    const imageY = (mouseCanvasY - this.offsetY) / this.zoomLevel;

    const zoomFactor = delta < 0 ? 1.2 : 0.8;
    let newZoom = this.zoomLevel * zoomFactor;

    //Zoom limits
    //if (newZoom < 0.1) newZoom = 0.1;
    //if (newZoom > 10) newZoom = 10;

    this.zoomLevel = newZoom;
    this.offsetX = mouseCanvasX - imageX * this.zoomLevel;
    this.offsetY = mouseCanvasY - imageY * this.zoomLevel;

    this.drawImage();
  }

  handleMouseDown(e) {
    if (e.button === 2) return;

    // If in Crop Mode, start selection
    if (this.isInCropMode) {
      this.isSelecting = true;
      const rect = this.canvas.getBoundingClientRect();
      this.selectionStartX = e.clientX - rect.left;
      this.selectionStartY = e.clientY - rect.top;
      this.selectionEndX = this.selectionStartX;
      this.selectionEndY = this.selectionStartY;
      this.drawImage();
      return;
    }

    // Normal Pan
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.style.cursor = "grabbing";
  }

  handleMouseMove(e) {
    // Crop Selection
    if (this.isInCropMode) {
      const rect = this.canvas.getBoundingClientRect();
      // Update Magnifier
      this.updateMagnifier(e.clientX, e.clientY);

      // Handle Selection Drag
      if (this.isSelecting) {
        this.selectionEndX = e.clientX - rect.left;
        this.selectionEndY = e.clientY - rect.top;
        this.drawImage();
      }
      return;
    }

    // Panning
    if (this.isDragging && this.image) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.drawImage();
    }
  }

  updateMagnifier(mouseX, mouseY) {
    if (!this.image) return;

    // Ensure element exists
    let magnifier = document.getElementById("magnifier");
    if (!magnifier) {
      magnifier = document.createElement("canvas");
      magnifier.id = "magnifier";
      magnifier.width = 150;
      magnifier.height = 150;
      // Apply essential styles immediately
      Object.assign(magnifier.style, {
        position: "fixed",
        borderRadius: "12px",
        border: "3px solid #333",
        pointerEvents: "none",
        zIndex: "5000",
        boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
        backgroundColor: "white",
      });
      document.body.appendChild(magnifier);
    }

    magnifier.style.display = "block";
    const mCtx = magnifier.getContext("2d");
    const size = magnifier.width;
    const halfSize = size / 2;

    // Position Magnifier
    // Move closer to cursor
    magnifier.style.left = mouseX + 15 + "px";
    magnifier.style.top = mouseY + 15 + "px";

    // Calculate image coordinates
    const rect = this.canvas.getBoundingClientRect();
    const cursorCanvasX = mouseX - rect.left;
    const cursorCanvasY = mouseY - rect.top;

    const imageX = (cursorCanvasX - this.offsetX) / this.zoomLevel;
    const imageY = (cursorCanvasY - this.offsetY) / this.zoomLevel;

    // Zoom Settings: 2x zoom
    const zoom = 2;
    const sourceSize = size / zoom;
    const halfSource = sourceSize / 2;

    // Draw
    mCtx.clearRect(0, 0, size, size);

    // Background
    mCtx.fillStyle = "white";
    mCtx.fillRect(0, 0, size, size);

    // Draw Image Portion
    try {
      mCtx.drawImage(
        this.image,
        imageX - halfSource,
        imageY - halfSource,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size
      );
    } catch (e) {}

    // Draw Crosshair
    mCtx.strokeStyle = "rgba(0,0,0,0.5)";
    mCtx.lineWidth = 1;
    mCtx.beginPath();

    // Horizontal
    mCtx.moveTo(0, halfSize);
    mCtx.lineTo(size, halfSize);

    // Vertical
    mCtx.moveTo(halfSize, 0);
    mCtx.lineTo(halfSize, size);

    mCtx.stroke();
  }

  handleMouseUp() {
    if (this.isInCropMode) {
      // Hide magnifier on release if we want, or keep it until mode ends?
      // Usually keep it while moving.
    }

    if (this.isInCropMode && this.isSelecting) {
      // Execute Crop
      this.cropSelection();
      this.disableCropMode();
      return;
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    }
  }

  handleMouseLeave() {
    this.isDragging = false;
    this.isSelecting = false; // Cancel crop if left?
    if (!this.isInCropMode) {
      this.canvas.style.cursor = "default";
    }
    // Hide Magnifier
    const magnifier = document.getElementById("magnifier");
    if (magnifier) magnifier.style.display = "none";
  }

  // Also hide on disableCropMode
  disableCropMode() {
    this.isInCropMode = false;
    this.isSelecting = false;
    this.canvas.style.cursor = "grab";
    this.drawImage(); // Clear rect
    const magnifier = document.getElementById("magnifier");
    if (magnifier) magnifier.style.display = "none";
  }

  handleContextMenu(e) {
    e.preventDefault();
    menuTargetWindow = this;
    showCustomContextMenu(e.clientX, e.clientY, !!this.image);
  }

  enableCropMode() {
    this.isInCropMode = true;
    this.canvas.style.cursor = "crosshair";
  }

  disableCropMode() {
    this.isInCropMode = false;
    this.isSelecting = false;
    this.canvas.style.cursor = "grab";
    this.drawImage(); // Clear rect
    const magnifier = document.getElementById("magnifier");
    if (magnifier) magnifier.style.display = "none";
  }

  drawSelectionRect() {
    const x = Math.min(this.selectionStartX, this.selectionEndX);
    const y = Math.min(this.selectionStartY, this.selectionEndY);
    const w = Math.abs(this.selectionEndX - this.selectionStartX);
    const h = Math.abs(this.selectionEndY - this.selectionStartY);

    this.ctx.save();
    this.ctx.strokeStyle = "#ff0000ff";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5]);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  cropSelection() {
    if (!this.image) return;

    const rectLeft = Math.min(this.selectionStartX, this.selectionEndX);
    const rectTop = Math.min(this.selectionStartY, this.selectionEndY);
    const rectWidth = Math.abs(this.selectionEndX - this.selectionStartX);
    const rectHeight = Math.abs(this.selectionEndY - this.selectionStartY);

    // Minimum size check (e.g. accidentally clicked without drag)
    if (rectWidth < 5 || rectHeight < 5) {
      return;
    }

    const cropX = (rectLeft - this.offsetX) / this.zoomLevel;
    const cropY = (rectTop - this.offsetY) / this.zoomLevel;
    const cropW = rectWidth / this.zoomLevel;
    const cropH = rectHeight / this.zoomLevel;

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const croppedCtx = croppedCanvas.getContext("2d");

    croppedCtx.drawImage(
      this.image,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const newSrc = croppedCanvas.toDataURL();
    this.loadImage(newSrc, false); // Don't add cropped version to history? Usually no, unless requested.
    // Let's stick to original requirements: "Collection of whatever the user pasted".
    // So crop result doesn't necessarily go to history, but the pasted original does.

    this.isSelecting = false;
  }

  getCroppedCanvas() {
    if (!this.image) return null;
    const tempCanvas = document.createElement("canvas");
    const scaledWidth = this.image.width * this.zoomLevel;
    const scaledHeight = this.image.height * this.zoomLevel;
    tempCanvas.width = scaledWidth;
    tempCanvas.height = scaledHeight;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(
      this.image,
      0,
      0,
      this.image.width,
      this.image.height,
      0,
      0,
      scaledWidth,
      scaledHeight
    );
    return tempCanvas;
  }
}

// === Global Helper Functions ===

function addToCollection(src) {
  if (imageHistory.includes(src)) {
    const idx = imageHistory.indexOf(src);
    imageHistory.splice(idx, 1);
  }
  imageHistory.unshift(src);
  renderCollection();
}

function renderCollection() {
  collectionList.innerHTML = "";
  imageHistory.forEach((src) => {
    // Container
    const container = document.createElement("div");
    container.className = "collection-item-container";

    // Image
    const img = document.createElement("img");
    img.src = src;
    img.className = "collection-item";
    //img.title = "Drag to window or Click to copy";
    img.draggable = true;

    // Drag Events
    img.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", src);
      e.dataTransfer.effectAllowed = "copy";
    });

    // Click to Copy (Original behavior)
    img.addEventListener("click", () => {
      copyToClipboard(src);
    });

    // Quick Paste Button
    const pasteBtn = document.createElement("button");
    pasteBtn.className = "quick-paste-btn";
    pasteBtn.innerHTML =
      "<i class='fa-solid fa-paste'></i>";
    //pasteBtn.title = "Paste to Window";
    pasteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent copy logic
      if (activeWindow) {
        activeWindow.loadImage(src, false); // Load without adding duplicate to history
        showToast("Pasted to active window");
      } else {
        showToast("No active window to paste into");
      }
    });

    container.appendChild(img);
    container.appendChild(pasteBtn);
    collectionList.appendChild(container);
  });
}

function copyToClipboard(src) {
  // We need to convert base64/dataURL back to blob
  fetch(src)
    .then((res) => res.blob())
    .then((blob) => {
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => showToast("Image copied to clipboard"))
        .catch((err) => console.error("Copy failed", err));
    });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

// === Window Management ===
function addWindow() {
  windowIdCounter++;
  const win = new ImageWindow(windowIdCounter);
  windows.push(win);
  appContainer.appendChild(win.container);
  win.resizeCanvas();
  setActiveWindow(win);
  updateLayout();
}

function removeWindow(winInstance) {
  const index = windows.indexOf(winInstance);
  if (index > -1) {
    windows.splice(index, 1);
    winInstance.container.remove();
    if (activeWindow === winInstance) {
      activeWindow = windows.length > 0 ? windows[windows.length - 1] : null;
      if (activeWindow) setActiveWindow(activeWindow);
    }
  }
  updateLayout();
}

function setActiveWindow(winInstance) {
  if (activeWindow) {
    activeWindow.container.classList.remove("active");
  }
  activeWindow = winInstance;
  if (activeWindow) {
    activeWindow.container.classList.add("active");
  }
}

function updateLayout() {
  const hideClose = windows.length <= 1;
  windows.forEach((win) => {
    win.setCloseButtonVisible(!hideClose);
  });
}

// === Init ===
addWindowBtn.addEventListener("click", addWindow);
addWindow(); // Default one

// === Global Paste ===
document.addEventListener("paste", (event) => {
  if (!activeWindow && windows.length > 0) {
    setActiveWindow(windows[0]);
  }
  if (!activeWindow) return;

  const items = (event.clipboardData || event.originalEvent.clipboardData)
    .items;
  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (e) => {
        activeWindow.loadImage(e.target.result, true); // Add to history
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});

// === Context Menu ===
const menuItems = [
  { text: "Copy", action: () => performAction("copy") },
  { text: "Paste", action: () => performAction("paste") },
  { text: "Crop", action: () => performAction("crop") },
  { text: "Refresh", action: () => location.reload() },
  { text: "Download", action: () => performAction("download") },
  { text: "Reset Zoom", action: () => performAction("reset") },
];

function rebuildMenu() {
  customMenu.innerHTML = "";
  menuItems.forEach((item) => {
    const div = document.createElement("div");
    div.style.padding = "4px 8px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";

    const icon = document.createElement("i");
    icon.style.textAlign = "center";
    icon.style.width = "16px";

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
      case "Crop":
        icon.className = "fa-solid fa-crop";
        break;
      case "Reset Zoom":
        icon.className = "fa-solid fa-compress";
        break;
    }

    div.appendChild(icon);
    div.appendChild(document.createTextNode(item.text));

    div.addEventListener("click", () => {
      hideCustomContextMenu();
      item.action();
    });

    div.addEventListener("mouseenter", () => (div.style.background = "#444"));
    div.addEventListener(
      "mouseleave",
      () => (div.style.background = "transparent")
    );

    customMenu.appendChild(div);
  });
}

function showCustomContextMenu(x, y, hasImage) {
  rebuildMenu();
  const children = Array.from(customMenu.children);
  children.forEach((child) => {
    const text = child.textContent;
    // If no image, hide context-specific actions
    if (
      (text === "Copy" ||
        text === "Download" ||
        text === "Crop" ||
        text === "Reset Zoom") &&
      !hasImage
    ) {
      child.style.display = "none";
    } else {
      child.style.display = "flex";
    }
  });

  customMenu.style.top = y + "px";
  customMenu.style.left = x + "px";
  customMenu.style.display = "block";
}

function hideCustomContextMenu() {
  customMenu.style.display = "none";
}

document.addEventListener("click", () => {
  hideCustomContextMenu();
});

function performAction(actionName) {
  if (!menuTargetWindow) return;

  switch (actionName) {
    case "copy":
      if (menuTargetWindow.image) {
        const canvas = menuTargetWindow.getCroppedCanvas();
        if (canvas) {
          // Add to History
          const dataUrl = canvas.toDataURL();
          addToCollection(dataUrl);

          // Copy to Clipboard
          canvas.toBlob((blob) => {
            navigator.clipboard
              .write([new ClipboardItem({ "image/png": blob })])
              .then(() => showToast("Copied to clipboard & History"))
              .catch((err) => console.error("Copy failed", err));
          });
        }
      }
      break;
    case "paste":
      triggerPaste();
      break;
    case "download":
      if (menuTargetWindow.image) {
        const canvas = menuTargetWindow.getCroppedCanvas();
        if (canvas) {
          canvas.toBlob((blob) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "image.png";
            document.body.appendChild(a);
            a.click();
            a.remove();
          });
        }
      }
      break;
    case "crop":
      // Trigger Crop Mode
      menuTargetWindow.enableCropMode();
      break;
    case "reset":
      // Reset Zoom Logic
      if (menuTargetWindow.image) {
        menuTargetWindow.zoomLevel = 1;
        // Recenter
        menuTargetWindow.offsetX =
          (menuTargetWindow.canvas.width - menuTargetWindow.image.width) / 2;
        menuTargetWindow.offsetY =
          (menuTargetWindow.canvas.height - menuTargetWindow.image.height) / 2;
        menuTargetWindow.drawImage();
      }
      break;
  }
}

async function triggerPaste() {
  if (!navigator.clipboard || !navigator.clipboard.read) return;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          const reader = new FileReader();
          reader.onload = (e) => {
            if (menuTargetWindow) {
              menuTargetWindow.loadImage(e.target.result, true);
            } else if (activeWindow) {
              activeWindow.loadImage(e.target.result, true);
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    }
  } catch (err) {}
}

rebuildMenu();

// === Global Keyboard Shortcuts ===
document.addEventListener("keydown", (e) => {
  if (!activeWindow) return;

  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    activeWindow.undo();
  }

  if (
    (e.ctrlKey && e.key === "y") ||
    (e.ctrlKey && e.shiftKey && e.key === "z")
  ) {
    // Support both standard Redo shortcuts
    e.preventDefault();
    activeWindow.redo();
  }
});
