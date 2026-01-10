const appContainer = document.getElementById("appContainer");
const addWindowBtn = document.getElementById("addWindowBtn");
const darkModeBtn = document.getElementById("darkModeBtn");
const collectionBtn = document.getElementById("collectionBtn");
const collectionPanel = document.getElementById("collectionPanel");
const closeCollectionBtn = document.getElementById("closeCollectionBtn");

const toast = document.getElementById("toast");
const settingsBtn = document.getElementById("settingsBtn");

let isAdvancedSettings = true; // Auto-enabled for now

// Settings Toggle
settingsBtn.addEventListener("click", () => {
  isAdvancedSettings = !isAdvancedSettings;
  settingsBtn.style.transform = isAdvancedSettings ? "rotate(90deg)" : "rotate(0deg)";
  // State: Selected (White + Border) vs Unselected (Standard)
  settingsBtn.style.backgroundColor = isAdvancedSettings ? "#ffffff" : "#ffffffcc";
  settingsBtn.style.border = isAdvancedSettings ? "2px solid white" : "none";
  rebuildMenu();
});

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
    this.selectionEndX = 0;
    this.selectionEndY = 0;

    // Advanced Modes
    this.currentMode = null; // 'crop', 'blur', 'focus', 'draw', 'text', 'color'
    this.drawColor = "#ff0000"; // Default Red
    this.brushSize = 10; // Default Brush Size (was 5px)
    this.isDrawing = false;
    this.isDrawing = false;
    this.shapeType = null; // 'circle', 'square', null

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

      // Handle File Drop (from PC)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.loadImage(evt.target.result, true); // Add to history
            setActiveWindow(this);
          };
          reader.readAsDataURL(file);
        }
        return;
      }

      // Handle URL/Text Drop (Internal History)
      const imageUrl = e.dataTransfer.getData("text/plain");
      if (imageUrl) {
        // If dragging from history, we can choose to move to top (true) or leave as is (false).
        // User said "add any image that appears... in history". 
        // Let's set to true to ensure it's always in history/refreshed.
        this.loadImage(imageUrl, true);
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

  loadImage(src, addToHistory = true, preserveView = false) {
    if (addToHistory) {
      // Save current state to undo stack before loading new image
      if (this.image) {
        this.undoStack.push(this.image.src);
        this.redoStack = []; // Clear redo on new action
      }
      addToCollection(src);
    }
    this._applyImage(src, preserveView);

    // Show settings button when image is loaded
    settingsBtn.style.display = "block";
  }

  _applyImage(src, preserveView = false) {
    this.image = new Image();
    this.image.src = src;
    this.image.onload = () => {
      if (!preserveView) {
        // Only reset view for new images, not edits
        this.zoomLevel = 1;
        this.offsetX = (this.canvas.width - this.image.width) / 2;
        this.offsetY = (this.canvas.height - this.image.height) / 2;
      }
      this.drawImage();
    };
  }

  undo() {
    if (this.undoStack.length === 0) return;
    if (this.image) this.redoStack.push(this.image.src);
    const prevSrc = this.undoStack.pop();
    this._applyImage(prevSrc, true); // Preserve view
    showToast("Undo");
  }

  redo() {
    if (this.redoStack.length === 0) return;
    if (this.image) this.undoStack.push(this.image.src);
    const nextSrc = this.redoStack.pop();
    this._applyImage(nextSrc, true); // Preserve view
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
      // Draw shape preview for circle/square, or selection rect for crop/blur/focus
      if (this.shapeType === 'circle') {
        this.drawShapePreview('circle');
      } else if (this.shapeType === 'square') {
        this.drawShapePreview('square');
      } else {
        this.drawSelectionRect();
      }
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

    if (e.button === 2) return;



    if (this.currentMode === 'color') {
      const rect = this.canvas.getBoundingClientRect();
      this.pickColor(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }

    if (this.currentMode === 'draw') {
      const rect = this.canvas.getBoundingClientRect();

      // Circle/Square mode: center-based (like Paint)
      if (this.shapeType === 'circle' || this.shapeType === 'square') {
        // First click sets the center
        this.isSelecting = true;
        this.selectionStartX = e.clientX - rect.left; // Center point (screen coords)
        this.selectionStartY = e.clientY - rect.top;
        this.selectionEndX = this.selectionStartX; // Will track mouse position
        this.selectionEndY = this.selectionStartY;
        this.drawImage();
        return;
      }

      // Freehand drawing (no shape)
      this.isDrawing = true;
      this.currentPath = [];
      const x = (e.clientX - rect.left - this.offsetX) / this.zoomLevel;
      const y = (e.clientY - rect.top - this.offsetY) / this.zoomLevel;
      this.currentPath.push({ x, y });

      // Visual feedback start
      this.ctx.beginPath();
      // Draw in screen coords
      this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }

    // If in Selection Mode (Crop, Blur, Focus), start selection
    if (this.currentMode === 'crop' || this.currentMode === 'blur' || this.currentMode === 'focus') {
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
    // Drawing mode (freehand)
    if (this.currentMode === 'draw' && this.isDrawing && !this.shapeType) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const x = (mouseX - this.offsetX) / this.zoomLevel;
      const y = (mouseY - this.offsetY) / this.zoomLevel;
      this.currentPath.push({ x, y });

      this.ctx.lineTo(mouseX, mouseY);
      this.ctx.strokeStyle = this.drawColor;
      this.ctx.lineWidth = this.brushSize * this.zoomLevel; // Scale with zoom
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();
      return;
    }

    // Shape drawing mode (circle/square) - update selection
    if (this.currentMode === 'draw' && this.isSelecting && (this.shapeType === 'circle' || this.shapeType === 'square')) {
      const rect = this.canvas.getBoundingClientRect();
      this.selectionEndX = e.clientX - rect.left;
      this.selectionEndY = e.clientY - rect.top;
      this.drawImage(); // Redraw with preview
      return;
    }

    // Selection Modes OR Color Picker
    if (['crop', 'blur', 'focus', 'color'].includes(this.currentMode)) {
      // Update Magnifier
      this.updateMagnifier(e.clientX, e.clientY);

      // Handle Selection Drag
      if (this.isSelecting) {
        const rect = this.canvas.getBoundingClientRect();
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
    } catch (e) { }

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
    // Shape drawing (circle/square) - check isSelecting
    if (this.currentMode === 'draw' && this.isSelecting && (this.shapeType === 'circle' || this.shapeType === 'square')) {
      // Calculate center and radius in image coordinates
      const centerX = (this.selectionStartX - this.offsetX) / this.zoomLevel;
      const centerY = (this.selectionStartY - this.offsetY) / this.zoomLevel;

      const screenRadius = Math.sqrt(
        Math.pow(this.selectionEndX - this.selectionStartX, 2) +
        Math.pow(this.selectionEndY - this.selectionStartY, 2)
      );
      const radius = screenRadius / this.zoomLevel;

      if (radius > 1) { // Minimum size check
        const shapeData = { centerX, centerY, radius };
        if (this.shapeType === 'circle') {
          this.drawCircle(shapeData);
        } else if (this.shapeType === 'square') {
          this.drawSquare(shapeData);
        }
      }
      this.isSelecting = false;
      this.shapeType = null;
      this.disableMode();
      return;
    }

    // Freehand drawing
    if (this.currentMode === 'draw' && this.isDrawing) {
      this.isDrawing = false;
      this.commitChanges();
      return;
    }

    if (['crop', 'blur', 'focus'].includes(this.currentMode)) {
      // Usually keep it while moving.
    }

    if (['crop', 'blur', 'focus'].includes(this.currentMode) && this.isSelecting) {
      // Execute Action
      if (this.currentMode === 'crop') this.cropSelection();
      if (this.currentMode === 'blur') this.applyBlur();
      if (this.currentMode === 'focus') this.applyFocus();

      this.disableMode();
      return;
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    }
  }

  handleMouseLeave() {
    this.isDragging = false;
    this.isSelecting = false;
    this.isDrawing = false;
    if (!this.currentMode) {
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

  // Disable All Modes
  disableMode() {
    this.currentMode = null;
    this.isSelecting = false;
    this.isDrawing = false;
    this.canvas.style.cursor = "grab";
    this.drawImage(); // Clear UI overlays
    const magnifier = document.getElementById("magnifier");
    if (magnifier) magnifier.style.display = "none";
  }

  setMode(mode) {
    this.currentMode = mode;
    if (mode === 'draw') this.canvas.style.cursor = "crosshair";
    else if (mode === 'color') this.canvas.style.cursor = "crosshair"; // Precise cursor for color picking
    else if (['crop', 'blur', 'focus'].includes(mode)) this.canvas.style.cursor = "crosshair";
    else this.canvas.style.cursor = "grab";
  }

  // --- New Features Logic ---

  handleContextMenu(e) {
    e.preventDefault();
    menuTargetWindow = this;
    showCustomContextMenu(e.clientX, e.clientY, !!this.image);
  }

  commitChanges() {
    if (this.currentMode === 'draw' && this.currentPath) {
      const temp = document.createElement('canvas');
      temp.width = this.image.width;
      temp.height = this.image.height;
      const tCtx = temp.getContext('2d');
      tCtx.drawImage(this.image, 0, 0);

      tCtx.beginPath();
      if (this.currentPath.length > 0) {
        tCtx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        for (let p of this.currentPath) {
          tCtx.lineTo(p.x, p.y);
        }
      }
      tCtx.strokeStyle = this.drawColor;
      tCtx.lineWidth = this.brushSize; // Fixed size on image
      tCtx.lineCap = 'round';
      tCtx.lineJoin = 'round';
      tCtx.stroke();

      this.loadImage(temp.toDataURL(), true, true); // Save to undo stack, preserve view
      this.currentPath = null;
    }
  }

  pickColor(screenX, screenY) {
    const pixel = this.ctx.getImageData(screenX, screenY, 1, 1).data;
    const hex = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);
    showToast(`Hex: ${hex} Copied to clipboard`);
    navigator.clipboard.writeText(hex);
    this.disableMode();
  }



  applyBlur() {
    const r = this.getSelectionRectOnImage();
    if (!r) return;

    const temp = document.createElement('canvas');
    temp.width = this.image.width;
    temp.height = this.image.height;
    const tCtx = temp.getContext('2d');
    tCtx.drawImage(this.image, 0, 0);

    // Use pixelation approach - more effective than blur for obscuring text
    const pixelSize = 3; // Pixel block size (smaller = more detail, larger = more obscured)

    // Create small canvas (downscale)
    const smallW = Math.max(1, Math.floor(r.w / pixelSize));
    const smallH = Math.max(1, Math.floor(r.h / pixelSize));
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = smallW;
    smallCanvas.height = smallH;
    const smallCtx = smallCanvas.getContext('2d');

    // Disable image smoothing for pixelated effect
    smallCtx.imageSmoothingEnabled = false;

    // Draw region to small canvas (downscale)
    smallCtx.drawImage(temp, r.x, r.y, r.w, r.h, 0, 0, smallW, smallH);

    // Draw small canvas back to original size (upscale with pixelation)
    tCtx.imageSmoothingEnabled = false;
    tCtx.drawImage(smallCanvas, 0, 0, smallW, smallH, r.x, r.y, r.w, r.h);

    this.loadImage(temp.toDataURL(), false, true); // Preserve zoom/offset
  }

  applyFocus() {
    const r = this.getSelectionRectOnImage();
    if (!r) return;

    const temp = document.createElement('canvas');
    temp.width = this.image.width;
    temp.height = this.image.height;
    const tCtx = temp.getContext('2d');
    tCtx.drawImage(this.image, 0, 0);

    tCtx.fillStyle = "rgba(0, 0, 0, 0.6)";

    tCtx.fillRect(0, 0, temp.width, r.y);
    tCtx.fillRect(0, r.y + r.h, temp.width, temp.height - (r.y + r.h));
    tCtx.fillRect(0, r.y, r.x, r.h);
    tCtx.fillRect(r.x + r.w, r.y, temp.width - (r.x + r.w), r.h);

    this.loadImage(temp.toDataURL(), false, true); // Preserve zoom/offset
  }

  getSelectionRectOnImage() {
    if (!this.image) return null;
    const rectLeft = Math.min(this.selectionStartX, this.selectionEndX);
    const rectTop = Math.min(this.selectionStartY, this.selectionEndY);
    const rectWidth = Math.abs(this.selectionEndX - this.selectionStartX);
    const rectHeight = Math.abs(this.selectionEndY - this.selectionStartY);

    if (rectWidth < 1 || rectHeight < 1) return null;

    const x = (rectLeft - this.offsetX) / this.zoomLevel;
    const y = (rectTop - this.offsetY) / this.zoomLevel;
    const w = rectWidth / this.zoomLevel;
    const h = rectHeight / this.zoomLevel;

    return { x, y, w, h };
  }

  drawCircle(r) {
    const temp = document.createElement('canvas');
    temp.width = this.image.width;
    temp.height = this.image.height;
    const tCtx = temp.getContext('2d');
    tCtx.drawImage(this.image, 0, 0);

    // r contains center and radius in image coordinates
    tCtx.beginPath();
    tCtx.arc(r.centerX, r.centerY, r.radius, 0, 2 * Math.PI);
    tCtx.strokeStyle = this.drawColor;
    tCtx.lineWidth = this.brushSize;
    tCtx.stroke();

    this.loadImage(temp.toDataURL(), true, true); // Save to undo stack, preserve view
  }

  drawSquare(r) {
    const temp = document.createElement('canvas');
    temp.width = this.image.width;
    temp.height = this.image.height;
    const tCtx = temp.getContext('2d');
    tCtx.drawImage(this.image, 0, 0);

    // Draw square from center
    const halfSize = r.radius;
    tCtx.strokeStyle = this.drawColor;
    tCtx.lineWidth = this.brushSize;
    tCtx.lineCap = 'butt';
    tCtx.lineJoin = 'miter';
    tCtx.strokeRect(
      r.centerX - halfSize,
      r.centerY - halfSize,
      halfSize * 2,
      halfSize * 2
    );

    this.loadImage(temp.toDataURL(), true, true); // Save to undo stack, preserve view
  }





  drawSelectionRect() {
    const x = Math.min(this.selectionStartX, this.selectionEndX);
    const y = Math.min(this.selectionStartY, this.selectionEndY);
    const w = Math.abs(this.selectionEndX - this.selectionStartX);
    const h = Math.abs(this.selectionEndY - this.selectionStartY);

    this.ctx.save();
    this.ctx.strokeStyle = "#ff0000ff";
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([8]);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  drawShapePreview(shapeType) {
    // Center is selectionStart, current mouse is selectionEnd
    const centerX = this.selectionStartX;
    const centerY = this.selectionStartY;
    const radius = Math.sqrt(
      Math.pow(this.selectionEndX - centerX, 2) +
      Math.pow(this.selectionEndY - centerY, 2)
    );

    this.ctx.save();
    this.ctx.strokeStyle = this.drawColor;
    this.ctx.lineWidth = this.brushSize * this.zoomLevel; // Actual size on screen
    this.ctx.lineCap = shapeType === 'square' ? 'butt' : 'round';
    this.ctx.lineJoin = shapeType === 'square' ? 'miter' : 'round';
    // this.ctx.setLineDash([8]); // Removed dashed line for solid preview

    if (shapeType === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      this.ctx.stroke();
    } else if (shapeType === 'square') {
      // Draw square from center with side length = 2*radius
      const halfSize = radius;
      this.ctx.strokeRect(
        centerX - halfSize,
        centerY - halfSize,
        halfSize * 2,
        halfSize * 2
      );
    }

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

  // Helper for Draw Visualization (Screen Space)
  // This needs to be called inside drawImage or after it?
  // Actually, we just drew to ctx in HandleMouseMove. 
  // But if drawImage runs (e.g. from some other event), it wipes the line.
  // So we should ideally store current drawing path in state and `drawImage` should render it if exists.
  // But simplified 'draw to ctx' works if no other reflow happens during drag.
  // We'll stick to 'draw to ctx' for now.


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
  updateSettingsButtonVisibility();
}

function updateSettingsButtonVisibility() {
  // Check if any window has an image
  const hasAnyImage = windows.some(win => win.image !== null);
  settingsBtn.style.display = hasAnyImage ? "block" : "none";
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
// === Context Menu ===
let menuItems = [
  { text: "Copy", action: () => performAction("copy") },
  { text: "Paste", action: () => performAction("paste") },
  { text: "Crop", action: () => performAction("crop") },
  { text: "Refresh", action: () => location.reload() },
  { text: "Download", action: () => performAction("download") },
  { text: "Reset Zoom", action: () => performAction("reset") },
  { text: "Advanced", action: () => performAction("toggleAdvanced") },
];

const advancedItems = [
  { text: "Blur", action: () => performAction("blur") },
  { text: "Focus", action: () => performAction("focus") },
  { text: "Get Color", action: () => performAction("getColor") },

  // Draw is handled specially
];

function rebuildMenu() {
  customMenu.innerHTML = "";
  menuItems.forEach((item) => {
    const div = document.createElement("div");
    div.style.padding = "4px 8px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "15px";
    div.style.borderRadius = "10px";

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
        icon.className = "fa-solid fa-crop-simple";
        break;
      case "Reset Zoom":
        icon.className = "fa-solid fa-compress";
        break;
      case "Advanced":
        icon.className = isAdvancedSettings ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off";
        break;
      case "Blur": icon.className = "fa-solid fa-droplet"; break;
      case "Focus": icon.className = "fa-solid fa-eye"; break;
      case "Get Color": icon.className = "fa-solid fa-eye-dropper"; break;

      case "Draw Red": icon.className = "fa-solid fa-pencil"; icon.style.color = "red"; break;
      case "Draw Blue": icon.className = "fa-solid fa-pencil"; icon.style.color = "blue"; break;
      case "Draw Yellow": icon.className = "fa-solid fa-pencil"; icon.style.color = "gold"; break;
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

  if (isAdvancedSettings) {
    // Divider
    const hr = document.createElement("hr");
    hr.style.borderColor = "rgba(255,255,255,0.1)";
    hr.style.margin = "4px 0";
    customMenu.appendChild(hr);

    advancedItems.forEach((item) => {
      const div = document.createElement("div");
      div.style.padding = "4px 8px";
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.gap = "15px";
      div.style.borderRadius = "10px";

      const icon = document.createElement("i");
      icon.style.textAlign = "center";
      icon.style.width = "16px";

      switch (item.text) {
        case "Blur": icon.className = "fa-solid fa-droplet"; break;
        case "Focus": icon.className = "fa-solid fa-eye"; break;
        case "Get Color": icon.className = "fa-solid fa-eye-dropper"; break;

        case "Draw Red": icon.className = "fa-solid fa-pencil"; icon.style.color = "red"; break;
        case "Draw Blue": icon.className = "fa-solid fa-pencil"; icon.style.color = "blue"; break;
        case "Draw Yellow": icon.className = "fa-solid fa-pencil"; icon.style.color = "gold"; break;
      }

      div.appendChild(icon);
      div.appendChild(document.createTextNode(item.text));

      div.addEventListener("click", () => {
        hideCustomContextMenu();
        item.action();
      });

      div.addEventListener("mouseenter", () => (div.style.background = "#444"));
      div.addEventListener("mouseleave", () => (div.style.background = "transparent"));

      customMenu.appendChild(div);
    });

    // Custom Draw UI
    const drawContainer = document.createElement("div");
    drawContainer.style.padding = "0"; // Removed padding to align with other items
    drawContainer.style.display = "flex";
    drawContainer.style.flexDirection = "column";
    drawContainer.style.gap = "8px";

    // Title row
    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "15px";
    titleRow.style.paddingLeft = "8px";
    titleRow.style.cursor = "pointer";
    titleRow.style.padding = "4px 8px";
    titleRow.style.borderRadius = "10px";

    const drawIcon = document.createElement("i");
    drawIcon.className = "fa-solid fa-pencil";
    drawIcon.style.width = "16px";
    titleRow.appendChild(drawIcon);
    titleRow.appendChild(document.createTextNode("Draw"));

    // Make title row clickable - activates draw mode with defaults
    titleRow.addEventListener("click", () => {
      hideCustomContextMenu();
      if (menuTargetWindow) {
        // Use default color (red) and brush size (10px)
        menuTargetWindow.drawColor = "#ff0000";
        menuTargetWindow.brushSize = 10;
        menuTargetWindow.setMode('draw');
      }
    });

    // Hover effect
    titleRow.addEventListener("mouseenter", () => (titleRow.style.background = "#444"));
    titleRow.addEventListener("mouseleave", () => (titleRow.style.background = "transparent"));

    drawContainer.appendChild(titleRow);

    // Color Dots (Red, Blue, Yellow)
    const dotsRow = document.createElement("div");
    dotsRow.style.display = "flex";
    dotsRow.style.gap = "15px";
    dotsRow.style.paddingLeft = "38px"; // align with text start

    const colors = [
      { name: 'red', hex: '#ff0000' },
      { name: 'blue', hex: '#0000ff' },
      { name: 'gold', hex: '#ffd700' }
    ];

    colors.forEach(c => {
      const dot = document.createElement("div");
      dot.style.width = "20px";
      dot.style.height = "20px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = c.hex;
      dot.style.cursor = "pointer";
      dot.style.border = "2px solid rgba(255,255,255,0.2)";

      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        // Don't close menu, just update settings
        // hideCustomContextMenu(); 
        if (menuTargetWindow) {
          menuTargetWindow.drawColor = c.hex;
          menuTargetWindow.setMode('draw');
          // Update slider color immediately
          const slider = drawContainer.querySelector("input[type=range]");
          if (slider) {
            slider.style.setProperty('--thumb-color', c.hex);
            menuTargetWindow.brushSize = parseInt(slider.value); // Re-trigger update if needed to sync
          }
        }
      });

      // Hover effect helper
      dot.onmouseenter = () => dot.style.transform = "scale(1.2)";
      dot.onmouseleave = () => dot.style.transform = "scale(1.0)";

      dotsRow.appendChild(dot);
    });
    drawContainer.appendChild(dotsRow);

    // Shape Icons (Circle, Square, Arrow)
    const shapesRow = document.createElement("div");
    shapesRow.style.display = "flex";
    shapesRow.style.gap = "15px";
    shapesRow.style.paddingLeft = "38px";
    shapesRow.style.marginTop = "4px";

    const shapes = [
      { type: 'circle', icon: 'fa-circle' },
      { type: 'square', icon: 'fa-square' }
    ];

    shapes.forEach(s => {
      const shapeBtn = document.createElement("div");
      shapeBtn.style.width = "24px";
      shapeBtn.style.height = "24px";
      shapeBtn.style.display = "flex";
      shapeBtn.style.alignItems = "center";
      shapeBtn.style.justifyContent = "center";
      shapeBtn.style.cursor = "pointer";
      shapeBtn.style.border = "2px solid rgba(255,255,255,0.2)";
      // Make the border circular for the circle tool, otherwise rounded square
      shapeBtn.style.borderRadius = s.type === 'circle' ? "50%" : "4px";
      shapeBtn.style.backgroundColor = "rgba(255,255,255,0.1)";

      const icon = document.createElement("i");
      icon.className = `fa-solid ${s.icon}`;
      icon.style.fontSize = "12px";
      shapeBtn.appendChild(icon);

      shapeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hideCustomContextMenu();
        if (menuTargetWindow) {
          menuTargetWindow.shapeType = s.type;
          menuTargetWindow.setMode('draw');
        }
      });

      shapeBtn.onmouseenter = () => {
        shapeBtn.style.backgroundColor = "rgba(255,255,255,0.2)";
        shapeBtn.style.transform = "scale(1.1)";
      };
      shapeBtn.onmouseleave = () => {
        shapeBtn.style.backgroundColor = "rgba(255,255,255,0.1)";
        shapeBtn.style.transform = "scale(1.0)";
      };

      shapesRow.appendChild(shapeBtn);
    });
    drawContainer.appendChild(shapesRow);

    // Brush Size Slider
    const sliderRow = document.createElement("div");
    sliderRow.style.paddingLeft = "38px";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "custom-slider"; // Use new CSS class
    slider.min = "5"; // Min size 5px
    slider.max = "50";
    slider.value = menuTargetWindow ? menuTargetWindow.brushSize : "10";
    slider.style.width = "calc(100% - 20px)"; // Full width minus padding

    // Initial State
    const initialColor = menuTargetWindow ? menuTargetWindow.drawColor : "#ff0000";
    const initialSize = menuTargetWindow ? menuTargetWindow.brushSize : 10;

    // Helper to set fill percent
    const updateFill = (val, min, max) => {
      const percentage = ((val - min) / (max - min)) * 100;
      slider.style.setProperty('--track-fill-percent', percentage + "%");
    };

    slider.style.setProperty('--thumb-color', initialColor);
    slider.style.setProperty('--thumb-size', initialSize + "px");
    updateFill(initialSize, 5, 50);

    // Prevent menu closing when interacting with slider
    slider.addEventListener("click", (e) => e.stopPropagation());

    slider.addEventListener("input", (e) => {
      if (menuTargetWindow) {
        const size = parseInt(e.target.value);
        menuTargetWindow.brushSize = size;

        // Update Thumb Scaling & Track Fill
        slider.style.setProperty('--thumb-size', size + "px");
        updateFill(size, 5, 50);
      }
    });

    // If there is an active window, sync slider
    if (menuTargetWindow) {
      slider.value = menuTargetWindow.brushSize;
    }

    sliderRow.appendChild(slider);
    drawContainer.appendChild(sliderRow);

    customMenu.appendChild(drawContainer);
  }
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
        text === "Reset Zoom" ||
        text === "Advanced") &&
      !hasImage
    ) {
      child.style.display = "none";
    } else {
      child.style.display = "flex";
    }
  });

  // Temporarily position to measure dimensions
  customMenu.style.top = y + "px";
  customMenu.style.left = x + "px";
  customMenu.style.display = "block";

  // Get menu dimensions
  const menuRect = customMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust horizontal position if menu would overflow right edge
  let finalX = x;
  if (x + menuRect.width > viewportWidth) {
    finalX = viewportWidth - menuRect.width - 10; // 10px padding from edge
  }

  // Adjust vertical position if menu would overflow bottom edge
  let finalY = y;
  if (y + menuRect.height > viewportHeight) {
    finalY = viewportHeight - menuRect.height - 10; // 10px padding from edge
  }

  // Apply final position
  customMenu.style.top = finalY + "px";
  customMenu.style.left = finalX + "px";
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
      menuTargetWindow.setMode('crop');
      break;
    case "blur":
      menuTargetWindow.setMode('blur');
      break;
    case "focus":
      menuTargetWindow.setMode('focus');
      break;
    case "getColor":
      menuTargetWindow.setMode('color');
      break;

    case "drawRed":
      // Legacy fallback or remove
      break;
    case "toggleAdvanced":
      isAdvancedSettings = !isAdvancedSettings;
      settingsBtn.style.transform = isAdvancedSettings ? "rotate(90deg)" : "rotate(0deg)";
      settingsBtn.style.backgroundColor = isAdvancedSettings ? "#ffffff" : "#ffffffcc";
      settingsBtn.style.border = isAdvancedSettings ? "2px solid white" : "none";
      showToast(isAdvancedSettings ? "Advanced Settings ON" : "Advanced Settings OFF");
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
  } catch (err) { }
}

rebuildMenu();

// Init Settings Button Style
settingsBtn.style.transform = isAdvancedSettings ? "rotate(90deg)" : "rotate(0deg)";
settingsBtn.style.backgroundColor = isAdvancedSettings ? "#ffffff" : "#ffffffcc";
settingsBtn.style.border = isAdvancedSettings ? "2px solid white" : "none";

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
