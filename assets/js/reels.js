/* Pearl Studio — song reels page wiring */

(function () {
  const el = (id) => document.getElementById(id);

  const reelTemplateList = el("reelTemplateList");
  const reelCanvas = el("reelCanvas");
  const reelCtx = reelCanvas.getContext("2d");
  const playPauseBtn = el("playPauseBtn");
  const scrubInput = el("scrubInput");
  const reelTimeLabel = el("reelTimeLabel");

  const audioDrop = el("audioDrop");
  const audioInput = el("audioInput");
  const audioStatus = el("audioStatus");
  const songTitleInput = el("songTitleInput");
  const artistInput = el("artistInput");
  const albumArtFieldGroup = el("albumArtFieldGroup");
  const albumArtDrop = el("albumArtDrop");
  const albumArtInput = el("albumArtInput");
  const handleInput = el("handleInput");

  const reelBgColorInput = el("reelBgColorInput");
  const reelAccentColorInput = el("reelAccentColorInput");
  const reelAccent2ColorInput = el("reelAccent2ColorInput");
  const reelAccent2FieldGroup = el("reelAccent2FieldGroup");
  const resetReelColorsBtn = el("resetReelColorsBtn");

  const PHOTO_STYLES = ["vinyl-diary", "cinematic-lyrics"];

  const reelElementCatalog = el("reelElementCatalog");
  const reelElementList = el("reelElementList");

  const lyricsInput = el("lyricsInput");
  const loadLyricsBtn = el("loadLyricsBtn");

  const startSyncBtn = el("startSyncBtn");
  const resyncBtn = el("resyncBtn");
  const tapBtn = el("tapBtn");
  const cueList = el("cueList");

  const clipStartInput = el("clipStartInput");
  const clipEndInput = el("clipEndInput");

  const downloadReelBtn = el("downloadReelBtn");
  const reelProgressBar = el("reelProgressBar");
  const reelProgressBarFill = el("reelProgressBarFill");
  const reelExportStatus = el("reelExportStatus");

  reelCanvas.width = window.PS_REEL_FORMAT.width;
  reelCanvas.height = window.PS_REEL_FORMAT.height;

  const reel = window.PS_defaultReelState();
  handleInput.value = reel.handle;

  const audioEl = document.createElement("audio");
  audioEl.preload = "auto";
  let audioLoaded = false;

  let syncing = false;
  let syncTarget = 0;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function formatTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  }

  // --- template picker ----------------------------------------------------

  function buildTemplateList() {
    reelTemplateList.innerHTML = "";
    window.PS_REEL_STYLES.forEach((s) => {
      const wrap = document.createElement("button");
      wrap.className = "template-thumb" + (reel.style === s.style ? " selected" : "");
      wrap.style.border = "1px solid var(--border)";
      wrap.style.padding = "10px";
      wrap.style.cursor = "pointer";
      wrap.style.textAlign = "left";
      wrap.style.background = s.bg;

      const swatch = document.createElement("div");
      swatch.style.width = "100%";
      swatch.style.height = "36px";
      swatch.style.borderRadius = "6px";
      swatch.style.marginBottom = "8px";
      swatch.style.background = `linear-gradient(120deg, ${s.accent}, ${s.accent2 || s.accent})`;
      wrap.appendChild(swatch);

      const label = document.createElement("div");
      label.className = "label";
      label.style.position = "static";
      label.style.background = "none";
      label.style.color = s.textColor;
      label.textContent = s.name;
      wrap.appendChild(label);

      wrap.addEventListener("click", () => {
        reel.style = s.style;
        reel.bg = s.bg;
        reel.textColor = s.textColor;
        reel.accent = s.accent;
        reel.accent2 = s.accent2 || null;
        albumArtFieldGroup.style.display = PHOTO_STYLES.includes(s.style) ? "block" : "none";
        syncColorInputs();
        buildTemplateList();
      });
      reelTemplateList.appendChild(wrap);
    });
  }

  // --- colors -----------------------------------------------------------

  function syncColorInputs() {
    reelBgColorInput.value = reel.bg;
    reelAccentColorInput.value = reel.accent;
    const hasAccent2 = !!reel.accent2;
    reelAccent2FieldGroup.style.display = hasAccent2 ? "block" : "none";
    if (hasAccent2) reelAccent2ColorInput.value = reel.accent2;
  }

  reelBgColorInput.addEventListener("input", () => {
    reel.bg = reelBgColorInput.value;
  });
  reelAccentColorInput.addEventListener("input", () => {
    reel.accent = reelAccentColorInput.value;
  });
  reelAccent2ColorInput.addEventListener("input", () => {
    reel.accent2 = reelAccent2ColorInput.value;
  });
  resetReelColorsBtn.addEventListener("click", () => {
    const s = window.PS_getReelStyle(reel.style);
    reel.bg = s.bg;
    reel.textColor = s.textColor;
    reel.accent = s.accent;
    reel.accent2 = s.accent2 || null;
    syncColorInputs();
  });

  // --- elements (music player, stickers, tags, doodles) -------------------

  window.PS_buildElementsPanel({
    catalogEl: reelElementCatalog,
    listEl: reelElementList,
    getElements: () => reel.elements || [],
    addElement: (type, variant) => {
      if (!reel.elements) reel.elements = [];
      reel.elements.push(window.PS_defaultElement(type, variant));
    },
    removeElement: (id) => {
      reel.elements = (reel.elements || []).filter((e) => e.id !== id);
    },
    onChange: () => {}, // the render loop below repaints every frame already
  });

  // --- drag-to-reposition an element on the canvas -------------------------

  function pointerToFrac(clientX, clientY) {
    const rect = reelCanvas.getBoundingClientRect();
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  let dragEl = null;
  let dragStart = null;

  reelCanvas.addEventListener("pointerdown", (e) => {
    const { nx, ny } = pointerToFrac(e.clientX, e.clientY);
    const hitEl = window.PS_hitTestElements(reel.elements, nx, ny);
    if (!hitEl) return;
    dragEl = hitEl;
    dragStart = { nx, ny, x: hitEl.x, y: hitEl.y };
    reelCanvas.classList.add("dragging");
    reelCanvas.setPointerCapture(e.pointerId);
  });

  reelCanvas.addEventListener("pointermove", (e) => {
    if (!dragEl) return;
    const { nx, ny } = pointerToFrac(e.clientX, e.clientY);
    dragEl.x = clamp(dragStart.x + (nx - dragStart.nx), 0, 1);
    dragEl.y = clamp(dragStart.y + (ny - dragStart.ny), 0, 1);
  });

  function endReelDrag() {
    dragEl = null;
    reelCanvas.classList.remove("dragging");
  }
  reelCanvas.addEventListener("pointerup", endReelDrag);
  reelCanvas.addEventListener("pointercancel", endReelDrag);

  // --- audio ----------------------------------------------------------

  function loadAudioFile(file) {
    if (!file.type || !file.type.startsWith("audio/")) return;
    audioStatus.textContent = "Loading " + file.name + "…";
    const url = URL.createObjectURL(file);
    audioEl.src = url;
    audioLoaded = false;

    audioEl.addEventListener(
      "loadedmetadata",
      () => {
        audioLoaded = true;
        reel.audioDuration = audioEl.duration || 0;
        reel.clipStart = 0;
        reel.clipEnd = Math.min(30, reel.audioDuration || 30);
        clipStartInput.value = reel.clipStart;
        clipEndInput.value = reel.clipEnd.toFixed(1);
        scrubInput.max = String(reel.audioDuration || 0);
        scrubInput.disabled = false;
        playPauseBtn.disabled = false;
        startSyncBtn.disabled = reel.lyrics.length === 0;
        audioStatus.textContent = `${file.name} · ${formatTime(reel.audioDuration)}`;
      },
      { once: true }
    );

    // Decode for a waveform (best-effort — export/preview still work without it).
    file.arrayBuffer().then((buf) => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ctx.decodeAudioData(
        buf.slice(0),
        (audioBuffer) => {
          reel.waveformPeaks = computeWaveformPeaks(audioBuffer, 120);
          ctx.close();
        },
        () => ctx.close()
      );
    });
  }

  function computeWaveformPeaks(audioBuffer, count) {
    const data = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(data.length / count));
    const peaks = [];
    for (let i = 0; i < count; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(data.length, start + blockSize);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const peak = Math.max(0.05, ...peaks);
    return peaks.map((p) => clamp(p / peak, 0.08, 1));
  }

  audioDrop.addEventListener("click", () => audioInput.click());
  audioDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    audioDrop.style.borderColor = "var(--accent-a)";
  });
  audioDrop.addEventListener("dragleave", () => {
    audioDrop.style.borderColor = "";
  });
  audioDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    audioDrop.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadAudioFile(e.dataTransfer.files[0]);
  });
  audioInput.addEventListener("change", () => {
    if (audioInput.files && audioInput.files[0]) loadAudioFile(audioInput.files[0]);
  });

  albumArtDrop.addEventListener("click", () => albumArtInput.click());
  function loadAlbumArt(file) {
    if (!file.type || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        reel.albumArt = img;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  albumArtDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    albumArtDrop.style.borderColor = "var(--accent-a)";
  });
  albumArtDrop.addEventListener("dragleave", () => {
    albumArtDrop.style.borderColor = "";
  });
  albumArtDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    albumArtDrop.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadAlbumArt(e.dataTransfer.files[0]);
  });
  albumArtInput.addEventListener("change", () => {
    if (albumArtInput.files && albumArtInput.files[0]) loadAlbumArt(albumArtInput.files[0]);
  });

  songTitleInput.addEventListener("input", () => {
    reel.songTitle = songTitleInput.value;
  });
  artistInput.addEventListener("input", () => {
    reel.artist = artistInput.value;
  });
  handleInput.addEventListener("input", () => {
    reel.handle = handleInput.value;
  });

  // --- lyrics & cue list ------------------------------------------------

  function renderCueList() {
    cueList.innerHTML = "";
    const activeIdx = syncing ? syncTarget : window.PS_findCueIndex(reel.lyrics, audioEl.currentTime || 0);
    reel.lyrics.forEach((cue, i) => {
      const row = document.createElement("div");
      row.className = "cue-row" + (i === activeIdx ? " active" : "") + (cue.time != null ? " synced" : "");

      const idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = String(i + 1);
      row.appendChild(idx);

      const text = document.createElement("span");
      text.className = "text";
      text.textContent = cue.text;
      row.appendChild(text);

      const timeInput = document.createElement("input");
      timeInput.className = "time-input";
      timeInput.type = "text";
      timeInput.placeholder = "--:--";
      timeInput.value = cue.time != null ? formatTime(cue.time) : "";
      timeInput.addEventListener("change", () => {
        const parsed = parseTimeInput(timeInput.value);
        cue.time = parsed;
        timeInput.value = parsed != null ? formatTime(parsed) : "";
        row.classList.toggle("synced", parsed != null);
      });
      row.appendChild(timeInput);

      cueList.appendChild(row);
    });
  }

  function parseTimeInput(value) {
    const v = value.trim();
    if (!v) return null;
    if (v.includes(":")) {
      const [m, s] = v.split(":").map((n) => parseFloat(n));
      if (Number.isNaN(m) || Number.isNaN(s)) return null;
      return m * 60 + s;
    }
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }

  loadLyricsBtn.addEventListener("click", () => {
    reel.lyrics = window.PS_lyricsToCues(lyricsInput.value);
    syncing = false;
    syncTarget = 0;
    tapBtn.style.display = "none";
    startSyncBtn.disabled = !audioLoaded || reel.lyrics.length === 0;
    resyncBtn.disabled = reel.lyrics.length === 0;
    renderCueList();
  });

  // --- tap-to-sync --------------------------------------------------------

  startSyncBtn.addEventListener("click", () => {
    if (!audioLoaded || !reel.lyrics.length) return;
    reel.lyrics.forEach((c) => (c.time = null));
    syncing = true;
    syncTarget = 0;
    tapBtn.style.display = "block";
    tapBtn.disabled = false;
    audioEl.currentTime = reel.clipStart || 0;
    audioEl.play();
    renderCueList();
  });

  resyncBtn.addEventListener("click", () => {
    reel.lyrics.forEach((c) => (c.time = null));
    syncing = false;
    syncTarget = 0;
    tapBtn.style.display = "none";
    audioEl.pause();
    renderCueList();
  });

  function tapNextLine() {
    if (!syncing) return;
    if (syncTarget >= reel.lyrics.length) return;
    reel.lyrics[syncTarget].time = audioEl.currentTime;
    syncTarget++;
    if (syncTarget >= reel.lyrics.length) {
      syncing = false;
      tapBtn.style.display = "none";
    }
    renderCueList();
  }
  tapBtn.addEventListener("click", tapNextLine);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && syncing && document.activeElement !== lyricsInput) {
      e.preventDefault();
      tapNextLine();
    }
  });

  // --- transport ------------------------------------------------------

  playPauseBtn.addEventListener("click", () => {
    if (!audioLoaded) return;
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
  });
  audioEl.addEventListener("play", () => (playPauseBtn.textContent = "⏸ Pause"));
  audioEl.addEventListener("pause", () => (playPauseBtn.textContent = "▶ Play"));
  audioEl.addEventListener("ended", () => {
    if (syncing) {
      syncing = false;
      tapBtn.style.display = "none";
      renderCueList();
    }
  });

  scrubInput.addEventListener("input", () => {
    if (!audioLoaded) return;
    audioEl.currentTime = parseFloat(scrubInput.value) || 0;
  });

  clipStartInput.addEventListener("change", () => {
    reel.clipStart = clamp(parseFloat(clipStartInput.value) || 0, 0, reel.audioDuration || 0);
    clipStartInput.value = reel.clipStart;
  });
  clipEndInput.addEventListener("change", () => {
    reel.clipEnd = clamp(parseFloat(clipEndInput.value) || reel.audioDuration, reel.clipStart + 1, reel.audioDuration || 3600);
    clipEndInput.value = reel.clipEnd;
  });

  // --- render loop ------------------------------------------------------

  function loop() {
    const t = audioEl.currentTime || 0;
    window.PS_renderReel(reelCtx, reel, t);
    if (!scrubInput.matches(":active")) scrubInput.value = String(t);
    reelTimeLabel.textContent = `${formatTime(t)} / ${formatTime(reel.audioDuration)}`;
    renderCueList();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // --- export -----------------------------------------------------------

  function setExportStatus(text) {
    reelExportStatus.textContent = text || "";
  }
  function setExportProgress(ratio) {
    if (ratio == null) {
      reelProgressBar.classList.remove("active");
      reelProgressBarFill.style.width = "0%";
      return;
    }
    reelProgressBar.classList.add("active");
    reelProgressBarFill.style.width = Math.round(ratio * 100) + "%";
  }

  downloadReelBtn.addEventListener("click", async () => {
    if (!audioLoaded) {
      setExportStatus("Load an audio file first.");
      return;
    }
    if (!reel.lyrics.length) {
      setExportStatus("Add and split some lyrics first.");
      return;
    }
    downloadReelBtn.disabled = true;
    setExportProgress(0);
    setExportStatus("Rendering…");
    const wasPlaying = !audioEl.paused;
    audioEl.pause();
    try {
      await window.PS_exportReelMP4(reel, audioEl, `${(reel.songTitle || "song-reel").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`, {
        onStatus: setExportStatus,
        onProgress: setExportProgress,
      });
      setExportStatus("Downloaded.");
    } catch (err) {
      setExportStatus("Export failed: " + err.message);
    } finally {
      setTimeout(() => setExportProgress(null), 600);
      downloadReelBtn.disabled = false;
      if (wasPlaying) audioEl.play();
    }
  });

  buildTemplateList();
  renderCueList();
  syncColorInputs();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => window.PS_renderReel(reelCtx, reel, audioEl.currentTime || 0));
  }
})();
