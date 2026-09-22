/* Pearl Studio — editor app wiring */

(function () {
  const FORMAT_LABELS = window.PS_FORMATS;
  const el = (id) => document.getElementById(id);

  const formatSwitchEl = el("formatSwitch");
  const templateListEl = el("templateList");
  const previewCanvas = el("previewCanvas");
  const previewCtx = previewCanvas.getContext("2d");

  const titleInput = el("titleInput");
  const subtitleInput = el("subtitleInput");
  const handleInput = el("handleInput");
  const kickerInput = el("kickerInput");
  const kickerFieldGroup = el("kickerFieldGroup");
  const bgColorInput = el("bgColorInput");
  const accentColorInput = el("accentColorInput");
  const subtitleColorInput = el("subtitleColorInput");
  const subtitleColorFieldGroup = el("subtitleColorFieldGroup");
  const imageDrop = el("imageDrop");
  const imageInput = el("imageInput");
  const imageFieldGroup = el("imageFieldGroup");
  const imageAdjustGroup = el("imageAdjustGroup");
  const imageZoomInput = el("imageZoomInput");
  const resetImageBtn = el("resetImageBtn");
  const resetTextPosBtn = el("resetTextPosBtn");
  const extraImageDrop = el("extraImageDrop");
  const extraImageInput = el("extraImageInput");
  const imageLayerList = el("imageLayerList");
  const elementCatalog = el("elementCatalog");
  const elementList = el("elementList");

  const durationSelect = el("durationSelect");
  const textAnimSelect = el("textAnimSelect");
  const previewAnimBtn = el("previewAnimBtn");
  const downloadPngBtn = el("downloadPngBtn");
  const downloadMp4Btn = el("downloadMp4Btn");
  const exportStatus = el("exportStatus");
  const progressBar = el("progressBar");
  const progressBarFill = el("progressBarFill");

  let currentFormat = "post";
  let currentTemplate = null;
  const stateByTemplateId = {};
  let animating = false;

  function getState(template) {
    if (!stateByTemplateId[template.id]) {
      stateByTemplateId[template.id] = window.PS_defaultState(template);
    }
    return stateByTemplateId[template.id];
  }

  function getDurationSeconds() {
    return parseFloat(durationSelect.value) || 3.2;
  }

  function getTextAnim() {
    return textAnimSelect.value || "default";
  }

  function renderPreview(t) {
    if (!currentTemplate) return;
    previewCanvas.width = currentTemplate.width;
    previewCanvas.height = currentTemplate.height;
    // t omitted (or null) means "static, fully revealed" (t=1). Only the
    // animation preview loop passes explicit small t values near 0.
    window.PS_render(previewCtx, currentTemplate, getState(currentTemplate), t == null ? 1 : t, getDurationSeconds(), getTextAnim());
  }

  function renderThumb(canvas, template) {
    const scale = template.width >= 1080 ? 0.25 : 1;
    canvas.width = Math.round(template.width * scale);
    canvas.height = Math.round(template.height * scale);
    const ctx = canvas.getContext("2d");
    const thumbTemplate = Object.assign({}, template, {
      width: canvas.width,
      height: canvas.height,
    });
    window.PS_render(ctx, thumbTemplate, getState(template), 1);
  }

  function buildFormatSwitch() {
    formatSwitchEl.innerHTML = "";
    Object.keys(FORMAT_LABELS).forEach((fmt) => {
      const btn = document.createElement("button");
      btn.textContent = FORMAT_LABELS[fmt].label;
      btn.className = fmt === currentFormat ? "active" : "";
      btn.addEventListener("click", () => {
        currentFormat = fmt;
        buildFormatSwitch();
        buildTemplateList();
        const first = window.PS_TEMPLATES.find((t) => t.format === fmt);
        if (first) selectTemplate(first.id);
      });
      formatSwitchEl.appendChild(btn);
    });
  }

  function buildTemplateList() {
    templateListEl.innerHTML = "";
    const templates = window.PS_TEMPLATES.filter((t) => t.format === currentFormat);
    const families = window.PS_FAMILIES.filter((fam) => templates.some((t) => t.family === fam));

    families.forEach((fam) => {
      const heading = document.createElement("div");
      heading.className = "family-label";
      heading.textContent = fam;
      templateListEl.appendChild(heading);

      templates.filter((t) => t.family === fam).forEach((tpl) => {
        const wrap = document.createElement("button");
        wrap.className = "template-thumb" + (currentTemplate && currentTemplate.id === tpl.id ? " selected" : "");
        wrap.style.border = "1px solid var(--border)";
        wrap.style.padding = "0";
        wrap.style.cursor = "pointer";

        const canvas = document.createElement("canvas");
        wrap.appendChild(canvas);

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = tpl.name;
        wrap.appendChild(label);

        wrap.addEventListener("click", () => selectTemplate(tpl.id));
        templateListEl.appendChild(wrap);
        renderThumb(canvas, tpl);
      });
    });
  }

  function syncFormInputs() {
    const state = getState(currentTemplate);
    titleInput.value = state.title;
    subtitleInput.value = state.subtitle;
    handleInput.value = state.handle;
    kickerInput.value = state.kicker;
    bgColorInput.value = state.bgColor || normalizeColor(currentTemplate.bg);
    accentColorInput.value = state.accentColor || normalizeColor(currentTemplate.accent);
    subtitleColorInput.value = state.subtitleColor || normalizeColor(currentTemplate.subtitleColor || currentTemplate.accent);
    imageZoomInput.value = state.imageZoom || 1;
    imageFieldGroup.style.display = currentTemplate.hasImage ? "block" : "none";
    kickerFieldGroup.style.display = currentTemplate.hasKicker ? "block" : "none";
    subtitleColorFieldGroup.style.display = currentTemplate.defaults.subtitle ? "block" : "none";
    updateImageAdjustVisibility();
    renderLayerList();
    elementsPanel.renderList();
  }

  function updateImageAdjustVisibility() {
    const state = getState(currentTemplate);
    const show = currentTemplate.hasImage && !!state.image;
    imageAdjustGroup.style.display = show ? "block" : "none";
    // The canvas is always draggable: a click either grabs a photo layer,
    // the template's own built-in photo, or falls back to moving the text.
    previewCanvas.classList.add("draggable");
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function normalizeColor(hex) {
    if (!hex) return "#ffffff";
    if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) return hex;
    return "#ffffff";
  }

  function selectTemplate(id) {
    currentTemplate = window.PS_getTemplate(id);
    if (currentTemplate.format !== currentFormat) {
      currentFormat = currentTemplate.format;
      buildFormatSwitch();
    }
    buildTemplateList();
    syncFormInputs();
    renderPreview();
  }

  // --- form wiring -----------------------------------------------------

  function onTextChange() {
    const state = getState(currentTemplate);
    state.title = titleInput.value;
    state.subtitle = subtitleInput.value;
    state.handle = handleInput.value;
    state.kicker = kickerInput.value;
    renderPreview();
  }

  [titleInput, subtitleInput, handleInput, kickerInput].forEach((input) => {
    input.addEventListener("input", onTextChange);
  });

  bgColorInput.addEventListener("input", () => {
    getState(currentTemplate).bgColor = bgColorInput.value;
    renderPreview();
  });

  accentColorInput.addEventListener("input", () => {
    getState(currentTemplate).accentColor = accentColorInput.value;
    renderPreview();
  });

  subtitleColorInput.addEventListener("input", () => {
    getState(currentTemplate).subtitleColor = subtitleColorInput.value;
    renderPreview();
  });

  durationSelect.addEventListener("change", () => renderPreview());
  textAnimSelect.addEventListener("change", () => renderPreview());

  imageDrop.addEventListener("click", () => imageInput.click());
  imageDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    imageDrop.style.borderColor = "var(--accent-a)";
  });
  imageDrop.addEventListener("dragleave", () => {
    imageDrop.style.borderColor = "";
  });
  imageDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    imageDrop.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadImageFile(e.dataTransfer.files[0]);
    }
  });
  imageInput.addEventListener("change", () => {
    if (imageInput.files && imageInput.files[0]) {
      loadImageFile(imageInput.files[0]);
    }
  });

  function loadImageFile(file) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const state = getState(currentTemplate);
        state.image = img;
        state.imageZoom = 1;
        state.imageOffsetX = 0;
        state.imageOffsetY = 0;
        imageZoomInput.value = 1;
        updateImageAdjustVisibility();
        renderPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  imageZoomInput.addEventListener("input", () => {
    if (!currentTemplate) return;
    const state = getState(currentTemplate);
    state.imageZoom = parseFloat(imageZoomInput.value) || 1;
    renderPreview();
  });

  resetImageBtn.addEventListener("click", () => {
    if (!currentTemplate) return;
    const state = getState(currentTemplate);
    state.imageZoom = 1;
    state.imageOffsetX = 0;
    state.imageOffsetY = 0;
    imageZoomInput.value = 1;
    renderPreview();
  });

  resetTextPosBtn.addEventListener("click", () => {
    if (!currentTemplate) return;
    const state = getState(currentTemplate);
    state.textOffsetX = 0;
    state.textOffsetY = 0;
    renderPreview();
  });

  // --- extra photo layers (multiple, freely placed) ---------------------

  let layerIdCounter = 0;

  function addImageLayers(files) {
    if (!currentTemplate) return;
    Array.from(files).forEach((file) => {
      if (!file.type || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const state = getState(currentTemplate);
          state.images.push({
            id: "layer-" + ++layerIdCounter,
            img,
            name: file.name,
            x: 0.5,
            y: 0.5,
            width: 0.35,
            aspect: img.height / img.width,
          });
          renderLayerList();
          renderPreview();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderLayerList() {
    imageLayerList.innerHTML = "";
    if (!currentTemplate) return;
    const state = getState(currentTemplate);
    (state.images || []).forEach((layer) => {
      const row = document.createElement("div");
      row.className = "layer-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = layer.name || "photo";
      row.appendChild(name);

      const sizeInput = document.createElement("input");
      sizeInput.type = "range";
      sizeInput.min = "0.1";
      sizeInput.max = "0.9";
      sizeInput.step = "0.01";
      sizeInput.value = layer.width;
      sizeInput.addEventListener("input", () => {
        layer.width = parseFloat(sizeInput.value) || 0.35;
        renderPreview();
      });
      row.appendChild(sizeInput);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        const st = getState(currentTemplate);
        st.images = st.images.filter((l) => l.id !== layer.id);
        renderLayerList();
        renderPreview();
      });
      row.appendChild(removeBtn);

      imageLayerList.appendChild(row);
    });
  }

  extraImageDrop.addEventListener("click", () => extraImageInput.click());
  extraImageDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    extraImageDrop.style.borderColor = "var(--accent-a)";
  });
  extraImageDrop.addEventListener("dragleave", () => {
    extraImageDrop.style.borderColor = "";
  });
  extraImageDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    extraImageDrop.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      addImageLayers(e.dataTransfer.files);
    }
  });
  extraImageInput.addEventListener("change", () => {
    if (extraImageInput.files && extraImageInput.files.length) {
      addImageLayers(extraImageInput.files);
      extraImageInput.value = "";
    }
  });

  // --- elements (music player, stickers, tags, doodles) -------------------

  const elementsPanel = window.PS_buildElementsPanel({
    catalogEl: elementCatalog,
    listEl: elementList,
    getElements: () => (currentTemplate ? getState(currentTemplate).elements || [] : []),
    addElement: (type, variant) => {
      if (!currentTemplate) return;
      const state = getState(currentTemplate);
      if (!state.elements) state.elements = [];
      state.elements.push(window.PS_defaultElement(type, variant));
    },
    removeElement: (id) => {
      if (!currentTemplate) return;
      const state = getState(currentTemplate);
      state.elements = (state.elements || []).filter((e) => e.id !== id);
    },
    onChange: () => renderPreview(),
  });

  // --- drag-to-reposition on the canvas -----------------------------------
  // Priority on pointerdown: an added element (topmost first) > a photo
  // layer (topmost first) > the template's own built-in photo > fall back
  // to moving the whole text block.

  function pointerToFrac(clientX, clientY) {
    const rect = previewCanvas.getBoundingClientRect();
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  let dragMode = null; // "element" | "layer" | "photo" | "text"
  let dragLayer = null;
  let dragEl = null;
  let dragStart = null;

  previewCanvas.addEventListener("pointerdown", (e) => {
    if (!currentTemplate) return;
    const state = getState(currentTemplate);
    const { nx, ny } = pointerToFrac(e.clientX, e.clientY);

    const hitEl = window.PS_hitTestElements(state.elements, nx, ny);
    if (hitEl) {
      dragMode = "element";
      dragEl = hitEl;
      dragStart = { nx, ny, x: hitEl.x, y: hitEl.y };
      beginDrag(e);
      return;
    }

    const layers = state.images || [];
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const halfW = layer.width / 2;
      const halfH = halfW * layer.aspect;
      if (nx >= layer.x - halfW && nx <= layer.x + halfW && ny >= layer.y - halfH && ny <= layer.y + halfH) {
        dragMode = "layer";
        dragLayer = layer;
        dragStart = { nx, ny, x: layer.x, y: layer.y };
        beginDrag(e);
        return;
      }
    }

    if (currentTemplate.hasImage && state.image) {
      dragMode = "photo";
      dragStart = {
        x: e.clientX,
        y: e.clientY,
        offsetX: state.imageOffsetX || 0,
        offsetY: state.imageOffsetY || 0,
      };
      beginDrag(e);
      return;
    }

    dragMode = "text";
    dragStart = { nx, ny, x: state.textOffsetX || 0, y: state.textOffsetY || 0 };
    beginDrag(e);
  });

  function beginDrag(e) {
    previewCanvas.classList.add("dragging");
    previewCanvas.setPointerCapture(e.pointerId);
  }

  previewCanvas.addEventListener("pointermove", (e) => {
    if (!dragMode || !currentTemplate) return;
    const state = getState(currentTemplate);

    if (dragMode === "element") {
      const { nx, ny } = pointerToFrac(e.clientX, e.clientY);
      dragEl.x = clamp(dragStart.x + (nx - dragStart.nx), 0, 1);
      dragEl.y = clamp(dragStart.y + (ny - dragStart.ny), 0, 1);
      renderPreview();
      return;
    }

    if (dragMode === "layer") {
      const { nx, ny } = pointerToFrac(e.clientX, e.clientY);
      dragLayer.x = clamp(dragStart.x + (nx - dragStart.nx), 0, 1);
      dragLayer.y = clamp(dragStart.y + (ny - dragStart.ny), 0, 1);
      renderPreview();
      return;
    }

    if (dragMode === "photo") {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const sensitivity = previewCanvas.getBoundingClientRect().width * 0.6 || 300;
      state.imageOffsetX = clamp(dragStart.offsetX + dx / sensitivity, -1, 1);
      state.imageOffsetY = clamp(dragStart.offsetY + dy / sensitivity, -1, 1);
      renderPreview();
      return;
    }

    if (dragMode === "text") {
      const { nx, ny } = pointerToFrac(e.clientX, e.clientY);
      state.textOffsetX = clamp(dragStart.x + (nx - dragStart.nx), -0.4, 0.4);
      state.textOffsetY = clamp(dragStart.y + (ny - dragStart.ny), -0.4, 0.4);
      renderPreview();
      return;
    }
  });

  function endDrag() {
    dragMode = null;
    dragLayer = null;
    dragEl = null;
    previewCanvas.classList.remove("dragging");
  }
  previewCanvas.addEventListener("pointerup", endDrag);
  previewCanvas.addEventListener("pointercancel", endDrag);

  // --- animation preview -------------------------------------------------

  previewAnimBtn.addEventListener("click", () => {
    if (animating || !currentTemplate) return;
    animating = true;
    const duration = getDurationSeconds() * 1000;
    const start = performance.now();
    function loop(now) {
      const t = Math.min(1, (now - start) / duration);
      renderPreview(t);
      if (t < 1) {
        requestAnimationFrame(loop);
      } else {
        animating = false;
      }
    }
    requestAnimationFrame(loop);
  });

  // --- idle element animation ---------------------------------------------
  // Elements (vinyl spin, EQ bars, twinkling sparkles, ...) keep animating
  // in the live preview even when nothing else is changing. Only redraws
  // while there's actually an element to animate, and steps aside while the
  // reveal-animation preview above has its own loop running.

  function idleLoop() {
    if (!animating && currentTemplate) {
      const state = getState(currentTemplate);
      if (state.elements && state.elements.length) renderPreview();
    }
    requestAnimationFrame(idleLoop);
  }
  requestAnimationFrame(idleLoop);

  // --- export --------------------------------------------------------

  function setStatus(text) {
    exportStatus.textContent = text || "";
  }

  function setProgress(ratio) {
    if (ratio == null) {
      progressBar.classList.remove("active");
      progressBarFill.style.width = "0%";
      return;
    }
    progressBar.classList.add("active");
    progressBarFill.style.width = Math.round(ratio * 100) + "%";
  }

  downloadPngBtn.addEventListener("click", async () => {
    if (!currentTemplate) return;
    downloadPngBtn.disabled = true;
    setStatus("Preparing PNG…");
    try {
      await window.PS_exportPNG(currentTemplate, getState(currentTemplate), `${currentTemplate.id}.png`);
      setStatus("PNG downloaded.");
    } catch (err) {
      setStatus("PNG export failed: " + err.message);
    } finally {
      downloadPngBtn.disabled = false;
    }
  });

  downloadMp4Btn.addEventListener("click", async () => {
    if (!currentTemplate) return;
    downloadMp4Btn.disabled = true;
    downloadPngBtn.disabled = true;
    setProgress(0);
    try {
      await window.PS_exportMP4(currentTemplate, getState(currentTemplate), `${currentTemplate.id}.mp4`, {
        onStatus: setStatus,
        onProgress: setProgress,
        duration: getDurationSeconds(),
        textAnim: getTextAnim(),
      });
      setStatus("MP4 downloaded.");
    } catch (err) {
      setStatus("MP4 export failed: " + err.message);
    } finally {
      setTimeout(() => setProgress(null), 600);
      downloadMp4Btn.disabled = false;
      downloadPngBtn.disabled = false;
    }
  });

  // --- init ------------------------------------------------------------

  function init() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("template");
    const initial = (requested && window.PS_getTemplate(requested)) || window.PS_TEMPLATES[0];
    currentFormat = initial.format;
    buildFormatSwitch();
    selectTemplate(initial.id);
  }

  init();

  // The templates render with Google Fonts (Playfair Display, DM Sans,
  // Cormorant Garamond) that may still be loading on first paint.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (currentTemplate) selectTemplate(currentTemplate.id);
    });
  }
})();
