/* Pearl Studio — add-on "Elements" canvas drawing engine.
   Self-contained (no shared closure with renderer.js / reels-renderer.js).
   Each element's box is x/y = CENTER (0..1 fraction of canvas W/H),
   width = 0..1 fraction of canvas W, height = width * PS_ELEMENT_ASPECT.

   Elements idle-animate: PS_drawElements takes a `timeSec` clock (seconds).
   Callers thread through whatever clock makes sense for them — Song Reels
   passes the audio's own currentTime (so motion is perfectly in sync with
   playback and export), the template editor passes wall-clock time for a
   live idle preview and the elapsed clip time during MP4 export. Each
   element gets its own phase offset (derived from its id) so identical
   elements don't animate in lockstep. */

(function () {
  function roundRect(ctx, x, y, w, h, r) {
    if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
    const m = Math.min(r.tl, r.tr, r.br, r.bl, w / 2, h / 2);
    r = { tl: Math.min(r.tl, m), tr: Math.min(r.tr, m), br: Math.min(r.br, m), bl: Math.min(r.bl, m) };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    ctx.lineTo(x + r.bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.arcTo(x, y, x + r.tl, y, r.tl);
    ctx.closePath();
  }

  function star(ctx, cx, cy, spikes, outerR, innerR) {
    ctx.beginPath();
    let angle = -Math.PI / 2;
    const step = Math.PI / spikes;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      angle += step;
    }
    ctx.closePath();
  }

  function heart(ctx, cx, cy, size) {
    ctx.beginPath();
    const s = size / 16;
    ctx.moveTo(cx, cy + 5 * s);
    ctx.bezierCurveTo(cx - 8 * s, cy - 3 * s, cx - 4 * s, cy - 10 * s, cx, cy - 4 * s);
    ctx.bezierCurveTo(cx + 4 * s, cy - 10 * s, cx + 8 * s, cy - 3 * s, cx, cy + 5 * s);
    ctx.closePath();
  }

  // FNV-1a: unlike a plain polynomial hash, this avalanches well even for
  // near-identical ids like "el-1"/"el-2" (sequential elementIdCounter
  // values), so consecutive same-type elements don't end up with barely-
  // different phases and visibly pulse in near-lockstep.
  function seedFromId(id) {
    let h = 0x811c9dc5;
    const s = String(id || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h = h >>> 0;
    return (h % 10000) / 10000; // 0..1
  }

  // ---------- music player ----------

  function drawMusicSpotify(ctx, x, y, w, h, el, phase) {
    ctx.fillStyle = "rgba(18,18,18,0.92)";
    roundRect(ctx, x, y, w, h, h * 0.32);
    ctx.fill();
    const pad = h * 0.11;
    const artS = h - pad * 2;
    const artX = x + pad, artY = y + pad;
    const artG = ctx.createLinearGradient(artX, artY, artX + artS, artY + artS);
    artG.addColorStop(0, "#ff8a5c");
    artG.addColorStop(1, "#c026d3");
    ctx.fillStyle = artG;
    roundRect(ctx, artX, artY, artS, artS, h * 0.1);
    ctx.fill();
    const textX = artX + artS + w * 0.045;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.font = "700 " + Math.round(h * 0.22) + "px system-ui, sans-serif";
    ctx.fillText(el.text || "Golden Hour", textX, y + h * 0.38);
    ctx.fillStyle = "#a7a7a7";
    ctx.font = "500 " + Math.round(h * 0.15) + "px system-ui, sans-serif";
    ctx.fillText(el.text2 || "notes unfiltered", textX, y + h * 0.58);
    const barY = y + h * 0.72, barW = w * 0.46;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(ctx, textX, barY, barW, h * 0.035, h * 0.02);
    ctx.fill();
    const progress = (phase * 0.05) % 1;
    ctx.fillStyle = el.color || "#1DB954";
    roundRect(ctx, textX, barY, barW * progress, h * 0.035, h * 0.02);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(textX + barW * progress, barY + h * 0.017, h * 0.045, 0, Math.PI * 2);
    ctx.fill();
    const eqX = x + w - w * 0.09, eqBase = y + h * 0.86;
    [
      [0.11, 3.1],
      [0.2, 4.3],
      [0.07, 2.4],
    ].forEach(([f, freq], i) => {
      const bh = h * f * (0.45 + 0.55 * Math.abs(Math.sin(phase * freq)));
      ctx.fillStyle = el.color || "#1DB954";
      roundRect(ctx, eqX + i * (w * 0.035), eqBase - bh, w * 0.02, bh, w * 0.01);
      ctx.fill();
    });
  }

  function drawMusicGlass(ctx, x, y, w, h, el, phase) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, h * 0.014);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    const artR = h / 2 - h * 0.1;
    const artCx = x + h / 2, artCy = y + h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(artCx, artCy, artR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const artG = ctx.createLinearGradient(artCx - artR, artCy - artR, artCx + artR, artCy + artR);
    artG.addColorStop(0, el.color || "#6d28d9");
    artG.addColorStop(1, "#db2777");
    ctx.fillStyle = artG;
    ctx.fillRect(artCx - artR, artCy - artR, artR * 2, artR * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = Math.round(artR * 0.9) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪", artCx, artCy + artR * 0.05);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#1a1025";
    ctx.font = "700 " + Math.round(h * 0.2) + "px system-ui, sans-serif";
    ctx.fillText(el.text || "overthinking again", x + h, y + h * 0.42);
    ctx.fillStyle = "rgba(26,16,37,0.6)";
    ctx.font = "500 " + Math.round(h * 0.14) + "px system-ui, sans-serif";
    ctx.fillText(el.text2 || "love.notezunfiltered", x + h, y + h * 0.62);
    const eqX = x + w - w * 0.1, eqBase = y + h * 0.78;
    [
      [0.09, 2.8],
      [0.19, 3.7],
      [0.14, 4.6],
      [0.07, 3.1],
    ].forEach(([f, freq], i) => {
      const bh = h * f * (0.45 + 0.55 * Math.abs(Math.sin(phase * freq)));
      ctx.fillStyle = "#1a1025";
      roundRect(ctx, eqX + i * (w * 0.028), eqBase - bh, w * 0.016, bh, w * 0.008);
      ctx.fill();
    });
  }

  function drawMusicVinyl(ctx, x, y, w, h, el, phase) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, h * 0.02);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    const vc = x + h / 2, vcy = y + h / 2, vr = h / 2 - h * 0.14;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(vc, vcy, vr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(vc, vcy, (vr / 4) * i, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Spinning glare mark, orbiting the label so the disc reads as turning.
    const spin = phase * 2.4;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(vc + Math.cos(spin) * vr * 0.6, vcy + Math.sin(spin) * vr * 0.6, vr * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = el.color || "#e879f9";
    ctx.beginPath();
    ctx.arc(vc, vcy, vr * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 " + Math.round(h * 0.32) + "px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("♫  " + (el.text || "golden hour — notes unfiltered"), x + h * 0.95, vcy);
  }

  function drawMusicCassette(ctx, x, y, w, h, el, phase) {
    ctx.fillStyle = el.color || "#fbbf24";
    roundRect(ctx, x, y, w, h, h * 0.09);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = Math.max(1, h * 0.02);
    roundRect(ctx, x, y, w, h, h * 0.09);
    ctx.stroke();
    ctx.fillStyle = "#241708";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 " + Math.round(h * 0.13) + "px monospace";
    ctx.fillText("● NOW PLAYING", x + w * 0.06, y + h * 0.26);
    ctx.font = "700 " + Math.round(h * 0.22) + "px Georgia, serif";
    ctx.fillText(el.text || "Golden Hour", x + w * 0.06, y + h * 0.53);
    ctx.font = "500 " + Math.round(h * 0.14) + "px Georgia, serif";
    ctx.fillText(el.text2 || "notes unfiltered", x + w * 0.06, y + h * 0.72);
    const reelY = y + h * 0.86, r = h * 0.11;
    const spin = phase * 3;
    [x + w * 0.12, x + w * 0.88].forEach((rx) => {
      ctx.fillStyle = "#241708";
      ctx.beginPath();
      ctx.arc(rx, reelY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = el.color || "#fbbf24";
      ctx.lineWidth = Math.max(1, h * 0.014);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + spin;
        ctx.beginPath();
        ctx.moveTo(rx, reelY);
        ctx.lineTo(rx + Math.cos(a) * r * 0.7, reelY + Math.sin(a) * r * 0.7);
        ctx.stroke();
      }
    });
  }

  const MUSIC_PLAYER_DRAWERS = {
    spotify: drawMusicSpotify,
    glass: drawMusicGlass,
    vinyl: drawMusicVinyl,
    cassette: drawMusicCassette,
  };

  function drawMusicPlayer(ctx, x, y, w, h, el, phase) {
    (MUSIC_PLAYER_DRAWERS[el.variant] || drawMusicSpotify)(ctx, x, y, w, h, el, phase);
  }

  // ---------- stickers ----------
  // Box center is always local (0,0) — PS_drawElements already translated
  // (and rotated by el.rotation) to the element's center before calling in.

  function drawSticker(ctx, x, y, w, h, el, phase) {
    const cx = x + w / 2, cy = y + h / 2; // == 0,0
    const size = Math.min(w, h) * 0.42;
    ctx.fillStyle = el.color || "#2dd4bf";
    ctx.save();
    if (el.variant === "heart") {
      const beat = 1 + 0.14 * Math.pow(Math.max(0, Math.sin(phase * 3.4)), 3);
      ctx.translate(cx, cy);
      ctx.scale(beat, beat);
      heart(ctx, 0, 0, size * 2.2);
      ctx.fill();
    } else if (el.variant === "sparkle") {
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.6);
      const tw = 0.82 + 0.18 * Math.abs(Math.sin(phase * 2.2));
      ctx.scale(tw, tw);
      star(ctx, 0, 0, 4, size, size * 0.4);
      ctx.fill();
    } else if (el.variant === "star") {
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.35);
      const tw = 0.85 + 0.15 * Math.abs(Math.sin(phase * 1.8 + 1));
      ctx.scale(tw, tw);
      star(ctx, 0, 0, 5, size * 0.95, size * 0.38);
      ctx.fill();
    } else if (el.variant === "flame") {
      const jitter = Math.sin(phase * 7) * size * 0.05;
      const squash = 1 + 0.08 * Math.sin(phase * 6.2);
      ctx.translate(cx + jitter, cy);
      ctx.scale(1 / squash, squash);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.7, -size * 0.36, size * 0.45, size * 0.36, 0, size);
      ctx.bezierCurveTo(-size * 0.45, size * 0.36, -size * 0.7, -size * 0.18, 0, -size);
      ctx.fill();
    } else if (el.variant === "note") {
      const bob = Math.sin(phase * 2) * h * 0.06;
      ctx.translate(cx, cy + bob);
      ctx.rotate(Math.sin(phase * 1.5) * 0.12);
      ctx.font = Math.round(size * 1.9) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪", 0, size * 0.05);
    } else if (el.variant === "flower") {
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.3);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * size * 0.42, Math.sin(a) * size * 0.42, size * 0.36, size * 0.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- badges ----------

  function drawBadgeNeonPill(ctx, x, y, w, h, el, phase) {
    const text = el.text || "NEW EP OUT NOW";
    ctx.font = "700 " + Math.round(h * 0.42) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glow = h * (0.2 + 0.18 * (0.5 + 0.5 * Math.sin(phase * 2.6)));
    ctx.save();
    ctx.shadowColor = el.color || "#ff2fb0";
    ctx.shadowBlur = glow;
    ctx.strokeStyle = el.color || "#ff2fb0";
    ctx.lineWidth = Math.max(1.5, h * 0.045);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = el.color || "#ff2fb0";
    ctx.lineWidth = Math.max(1.5, h * 0.045);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + w / 2, y + h / 2 + h * 0.02);
  }

  function drawBadgeCircleStamp(ctx, x, y, w, h, el, phase) {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - Math.min(w, h) * 0.04;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(phase * 1.1) * 0.06);
    ctx.strokeStyle = el.color || "#f0c869";
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = el.color || "#f0c869";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 " + Math.round(r * 0.36) + "px system-ui, sans-serif";
    ctx.fillText(el.text || "100%", 0, -r * 0.14);
    ctx.font = "700 " + Math.round(r * 0.24) + "px system-ui, sans-serif";
    ctx.fillText(el.text2 || "MOOD", 0, r * 0.26);
    ctx.restore();
  }

  function drawBadgeDoodleArrow(ctx, x, y, w, h, el, phase) {
    const bob = Math.sin(phase * 2.4) * h * 0.05;
    ctx.save();
    ctx.translate(0, bob);
    ctx.strokeStyle = el.color || "#2dd4bf";
    ctx.lineWidth = Math.max(2, h * 0.06);
    ctx.lineCap = "round";
    const startX = x + w * 0.06, startY = y + h * 0.18;
    const endX = x + w * 0.42, endY = y + h * 0.66;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(x + w * 0.32, y + h * 0.05, x + w * 0.4, y + h * 0.5, endX, endY);
    ctx.stroke();
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(0.9);
    const ah = h * 0.16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ah, -ah * 0.4);
    ctx.moveTo(0, 0);
    ctx.lineTo(-ah * 0.4, -ah);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = el.color || "#2dd4bf";
    ctx.font = "italic 600 " + Math.round(h * 0.28) + "px Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText((el.text || "tap for vibes") + " →", x + w * 0.46, endY);
    ctx.restore();
  }

  const BADGE_DRAWERS = {
    "neon-pill": drawBadgeNeonPill,
    "circle-stamp": drawBadgeCircleStamp,
    "doodle-arrow": drawBadgeDoodleArrow,
  };

  function drawBadge(ctx, x, y, w, h, el, phase) {
    (BADGE_DRAWERS[el.variant] || drawBadgeNeonPill)(ctx, x, y, w, h, el, phase);
  }

  // ---------- doodles ----------

  function drawDoodleHighlighter(ctx, x, y, w, h, el) {
    // Static — a marker stroke animating reads as broken, not lively.
    const text = el.text || "this hits different";
    ctx.font = "700 " + Math.round(h * 0.4) + "px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tw = Math.min(ctx.measureText(text).width, w * 0.92);
    const tx = x + w / 2 - tw / 2, ty = y + h / 2;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = el.color || "#fde68a";
    ctx.beginPath();
    ctx.moveTo(tx - h * 0.12, ty + h * 0.24);
    ctx.lineTo(tx + tw + h * 0.1, ty + h * 0.18);
    ctx.lineTo(tx + tw + h * 0.16, ty - h * 0.3);
    ctx.lineTo(tx - h * 0.16, ty - h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1a1025";
    ctx.fillText(text, tx, ty - h * 0.02);
  }

  function drawDoodleScribbleSparkle(ctx, x, y, w, h, el, phase) {
    const text = el.text || "main character era";
    ctx.font = "700 " + Math.round(h * 0.4) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const cx = x + w / 2, cy = y + h * 0.42;
    ctx.fillText(text, cx, cy);
    const tw = Math.min(ctx.measureText(text).width, w * 0.9);
    ctx.strokeStyle = el.color || "#f472b6";
    ctx.lineWidth = Math.max(2, h * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    const ux = cx - tw / 2, uy = cy + h * 0.26;
    ctx.moveTo(ux, uy);
    const step = Math.max(8, tw / 10);
    for (let i = 0; i <= tw; i += step) {
      ctx.quadraticCurveTo(ux + i + step / 2, uy + (Math.floor(i / step) % 2 === 0 ? h * 0.07 : -h * 0.07), ux + i + step, uy);
    }
    ctx.stroke();
    ctx.fillStyle = el.color || "#f472b6";
    [
      [cx - tw / 2 - h * 0.32, cy - h * 0.36, 1.4],
      [cx + tw / 2 + h * 0.3, cy - h * 0.28, 2.1],
      [cx + tw / 2 + h * 0.1, cy + h * 0.4, 3.0],
    ].forEach(([sx, sy, freq]) => {
      const tws = 0.7 + 0.4 * Math.abs(Math.sin(phase * freq));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(tws, tws);
      star(ctx, 0, 0, 4, h * 0.13, h * 0.045);
      ctx.fill();
      ctx.restore();
    });
  }

  const DOODLE_DRAWERS = {
    highlighter: drawDoodleHighlighter,
    "scribble-sparkle": drawDoodleScribbleSparkle,
  };

  function drawDoodle(ctx, x, y, w, h, el, phase) {
    (DOODLE_DRAWERS[el.variant] || drawDoodleHighlighter)(ctx, x, y, w, h, el, phase);
  }

  // ---------- entry point ----------

  const ELEMENT_DRAWERS = {
    "music-player": drawMusicPlayer,
    sticker: drawSticker,
    badge: drawBadge,
    doodle: drawDoodle,
  };

  function defaultClock() {
    return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  }

  window.PS_drawElements = function (ctx, W, H, elements, timeSec) {
    const clock = timeSec == null ? defaultClock() : timeSec;
    (elements || []).forEach((el) => {
      const fn = ELEMENT_DRAWERS[el.type];
      if (!fn) return;
      const aspect = window.PS_ELEMENT_ASPECT[el.type + ":" + el.variant] || 1;
      const w = (el.width || 0.3) * W;
      const h = w * aspect;
      const phase = clock + seedFromId(el.id) * 50;
      ctx.save();
      ctx.translate(el.x * W, el.y * H);
      if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
      fn(ctx, -w / 2, -h / 2, w, h, el, phase);
      ctx.restore();
    });
  };

  // Hit-test in element-array order, topmost (last-added / last-drawn) first.
  // nx/ny are the pointer position as a 0..1 fraction of canvas W/H.
  window.PS_hitTestElements = function (elements, nx, ny) {
    const list = elements || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const elDef = list[i];
      const aspect = window.PS_ELEMENT_ASPECT[elDef.type + ":" + elDef.variant] || 1;
      const halfW = (elDef.width || 0.3) / 2;
      const halfH = (elDef.width || 0.3) * aspect / 2;
      if (nx >= elDef.x - halfW && nx <= elDef.x + halfW && ny >= elDef.y - halfH && ny <= elDef.y + halfH) {
        return elDef;
      }
    }
    return null;
  };
})();
