/* Pearl Studio — song reel rendering engine
 * PS_renderReel(ctx, reel, currentTime) draws one frame of a lyric reel.
 * `currentTime` is the playback position in the full song, in seconds.
 *
 * Kept self-contained (its own small copies of wrap/glow/color helpers)
 * rather than reaching into renderer.js's closure, so the existing 25
 * caption templates stay untouched by this feature.
 */

(function () {
  function hexToRgb(hex) {
    const num = parseInt(String(hex).replace("#", ""), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  }

  function wrapLines(ctx, text, maxWidth) {
    const paragraphs = String(text || "").split("\n");
    const lines = [];
    paragraphs.forEach((para) => {
      const words = para.split(" ").filter(Boolean);
      if (!words.length) {
        lines.push("");
        return;
      }
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const candidate = current + " " + words[i];
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          lines.push(current);
          current = words[i];
        }
      }
      lines.push(current);
    });
    return lines;
  }

  // Centered multi-line text. Returns the total block height.
  function wrapAndDraw(ctx, text, cx, cy, maxWidth, lineHeight) {
    if (!text) return 0;
    const lines = wrapLines(ctx, text, maxWidth);
    const totalH = lines.length * lineHeight;
    const startY = cy - totalH / 2 + lineHeight / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "center";
    lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
    ctx.textAlign = prevAlign;
    return totalH;
  }

  // Left-aligned multi-line text, vertically centered on cy.
  function wrapAndDrawLeft(ctx, text, x, cy, maxWidth, lineHeight) {
    const lines = wrapLines(ctx, text, maxWidth);
    const totalH = lines.length * lineHeight;
    const startY = cy - totalH / 2 + lineHeight / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
    ctx.textAlign = prevAlign;
    return totalH;
  }

  function drawGlowBlob(ctx, cx, cy, r, color, alpha) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, rgba(color, alpha));
    grad.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    const boxRatio = w / h;
    const imgRatio = img.width / img.height;
    let dw, dh;
    if (imgRatio > boxRatio) {
      dh = h;
      dw = dh * imgRatio;
    } else {
      dw = w;
      dh = dw / imgRatio;
    }
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  }

  // Index of the lyric cue currently playing: the last cue (in array
  // order) whose timestamp has passed. -1 if the song hasn't reached the
  // first synced cue yet.
  function findCueIndex(lyrics, currentTime) {
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time != null && lyrics[i].time <= currentTime) idx = i;
    }
    return idx;
  }

  function clipDuration(reel) {
    const end = reel.clipEnd || reel.audioDuration || 1;
    return Math.max(0.01, end - (reel.clipStart || 0));
  }

  function drawTimeline(ctx, W, H, reel, currentTime, y, compact) {
    const x0 = W * 0.1, x1 = W * 0.9;
    const duration = clipDuration(reel);
    const elapsed = Math.max(0, currentTime - (reel.clipStart || 0));
    const frac = Math.max(0, Math.min(1, elapsed / duration));
    const peaks = reel.waveformPeaks;
    const bandH = compact ? H * 0.026 : H * 0.045;

    if (peaks && peaks.length) {
      const barGap = (x1 - x0) / peaks.length;
      peaks.forEach((p, i) => {
        const h = Math.max(2, p * bandH);
        const x = x0 + i * barGap;
        const played = i / peaks.length <= frac;
        ctx.fillStyle = played ? reel.accent : rgba(reel.textColor, 0.22);
        ctx.fillRect(x, y - h / 2, Math.max(1, barGap * 0.6), h);
      });
    } else {
      ctx.strokeStyle = rgba(reel.textColor, 0.2);
      ctx.lineWidth = W * 0.005;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.strokeStyle = reel.accent;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + (x1 - x0) * frac, y);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    ctx.font = `500 ${W * 0.018}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(reel.textColor, 0.4);
    ctx.textAlign = "left";
    ctx.fillText(formatTime(elapsed), x0, y + bandH * 0.9 + W * 0.022);
    ctx.textAlign = "right";
    ctx.fillText(formatTime(duration), x1, y + bandH * 0.9 + W * 0.022);
  }

  function drawHandle(ctx, W, H, reel, y, align) {
    if (!reel.handle) return;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = align || "center";
    ctx.font = `600 ${W * 0.019}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(reel.accent, 0.55);
    ctx.fillText(reel.handle, align === "left" ? W * 0.08 : W / 2, y);
    ctx.textAlign = prevAlign;
  }

  // ══════════════════════ STYLE RENDERERS ══════════════════════

  function drawKaraokeGlow(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.2, H * 0.14, W * 0.55, reel.accent, 0.13);
    drawGlowBlob(ctx, W * 0.82, H * 0.82, W * 0.5, reel.accent2 || reel.accent, 0.1);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const prev = idx > 0 ? reel.lyrics[idx - 1].text : "";
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    const next = idx + 1 < reel.lyrics.length ? reel.lyrics[idx + 1].text : "";
    const lineStart = idx >= 0 && reel.lyrics[idx].time != null ? reel.lyrics[idx].time : 0;
    const fadeIn = Math.max(0, Math.min(1, (currentTime - lineStart) / 0.35));

    ctx.textAlign = "center";
    if (prev) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.font = `italic 400 ${W * 0.034}px 'Cormorant Garamond', serif`;
      ctx.fillStyle = reel.textColor;
      wrapAndDraw(ctx, prev, W / 2, H * 0.34, W * 0.78, W * 0.046);
      ctx.restore();
    }
    if (curr) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * fadeIn;
      ctx.font = `italic 700 ${W * 0.058}px 'Playfair Display', serif`;
      ctx.fillStyle = reel.accent;
      ctx.shadowColor = reel.accent;
      ctx.shadowBlur = W * 0.018;
      wrapAndDraw(ctx, curr, W / 2, H * 0.49, W * 0.82, W * 0.076);
      ctx.restore();
    }
    if (next) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.font = `italic 400 ${W * 0.034}px 'Cormorant Garamond', serif`;
      ctx.fillStyle = reel.textColor;
      wrapAndDraw(ctx, next, W / 2, H * 0.63, W * 0.78, W * 0.046);
      ctx.restore();
    }

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.87);
    drawHandle(ctx, W, H, reel, H * 0.94);
  }

  function drawWaveformPulse(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.5, H * 0.4, W * 0.5, reel.accent, 0.1);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");

    ctx.save();
    ctx.shadowColor = reel.accent;
    ctx.shadowBlur = W * 0.022;
    ctx.font = `italic 700 ${W * 0.056}px 'Playfair Display', serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    wrapAndDraw(ctx, curr, W / 2, H * 0.42, W * 0.82, W * 0.074);
    ctx.restore();

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.86);
    drawHandle(ctx, W, H, reel, H * 0.94);
  }

  function drawVinylDiary(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.5, H * 0.27, W * 0.6, reel.accent, 0.15);

    const r = W * 0.3, cx = W / 2, cy = H * 0.27;
    const angle = currentTime * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    if (reel.albumArt) {
      drawImageCover(ctx, reel.albumArt, 0, 0, r * 2, r * 2);
    } else {
      const grad = ctx.createLinearGradient(-r, -r, r, r);
      grad.addColorStop(0, rgba(reel.accent, 0.45));
      grad.addColorStop(1, "#000000");
      ctx.fillStyle = grad;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = reel.bg;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(reel.accent, 0.5);
    ctx.lineWidth = W * 0.003;
    ctx.stroke();

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Cormorant Garamond', serif`;
    ctx.fillStyle = reel.textColor;
    wrapAndDraw(ctx, curr, W / 2, H * 0.58, W * 0.78, W * 0.068);

    if (reel.songTitle) {
      ctx.font = `600 ${W * 0.024}px 'DM Sans', sans-serif`;
      ctx.fillStyle = rgba(reel.accent, 0.7);
      const label = reel.artist ? `♫ ${reel.songTitle} — ${reel.artist}` : `♫ ${reel.songTitle}`;
      ctx.fillText(label, W / 2, H * 0.86);
    }

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.9, true);
    drawHandle(ctx, W, H, reel, H * 0.95);
  }

  function drawNotesKaraoke(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "left";
    ctx.font = `600 ${W * 0.024}px 'DM Sans', sans-serif`;
    ctx.fillStyle = reel.textColor;
    ctx.fillText("9:41", W * 0.08, H * 0.055);
    ctx.textAlign = "right";
    ctx.fillText("100%", W * 0.92, H * 0.055);

    ctx.textAlign = "left";
    ctx.font = `400 ${W * 0.026}px 'DM Sans', sans-serif`;
    ctx.fillStyle = reel.accent;
    ctx.fillText("‹ Notes", W * 0.06, H * 0.11);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.13);
    ctx.lineTo(W, H * 0.13);
    ctx.stroke();
    ctx.restore();

    const idx = findCueIndex(reel.lyrics, currentTime);
    const cue = idx >= 0 ? reel.lyrics[idx] : reel.lyrics[0];
    const nextCue = idx + 1 < reel.lyrics.length ? reel.lyrics[idx + 1] : null;
    const text = cue ? cue.text : "";
    const cueStart = cue && cue.time != null ? cue.time : 0;
    const cueEnd = nextCue && nextCue.time != null ? nextCue.time : cueStart + 3;
    const typeWindow = Math.max(0.4, (cueEnd - cueStart) * 0.6);
    const typeProgress = Math.max(0, Math.min(1, (currentTime - cueStart) / typeWindow));
    const charsToShow = Math.round(typeProgress * text.length);
    const shown = text.slice(0, charsToShow) + (typeProgress < 1 && text ? "|" : "");

    ctx.font = `400 ${W * 0.046}px 'DM Sans', sans-serif`;
    ctx.fillStyle = reel.textColor;
    wrapAndDrawLeft(ctx, shown, W * 0.08, H * 0.35, W * 0.84, W * 0.066);

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.9, true);
    drawHandle(ctx, W, H, reel, H * 0.95, "left");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A soft "add a photo" placeholder used wherever a template wants
  // reel.albumArt but none has been uploaded yet.
  function drawPlaceholderArt(ctx, x, y, w, h, accent, label) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "#14161d";
    ctx.fillRect(x, y, w, h);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, rgba(accent, 0.35));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    if (label) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `500 ${w * 0.05}px 'DM Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function drawBrickGrid(ctx, W, H, brickColor, mortarColor, seed) {
    const rows = 10;
    const brickH = H / rows;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : brickH * 1.3;
      const cols = Math.ceil(W / (brickH * 2.6)) + 2;
      for (let col = -1; col < cols; col++) {
        const x = col * brickH * 2.6 + offset;
        const y = row * brickH;
        const shade = Math.abs(Math.sin(seed + row * 3.1 + col * 1.7));
        ctx.fillStyle = shade > 0.5 ? brickColor : rgba(brickColor, 0.85);
        ctx.fillRect(x, y, brickH * 2.5, brickH - 3);
      }
    }
    ctx.fillStyle = mortarColor;
    for (let row = 0; row <= rows; row++) {
      ctx.fillRect(0, row * brickH - 1.5, W, 3);
    }
  }

  function drawKenBurns(ctx, W, H, img, currentTime) {
    const zoom = 1 + 0.07 * (0.5 + 0.5 * Math.sin(currentTime * 0.06));
    const panX = Math.sin(currentTime * 0.04) * W * 0.015;
    drawImageCover(ctx, img, W / 2 + panX, H / 2, W * zoom, H * zoom);
  }

  function drawCinematicLyrics(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);

    if (reel.albumArt) {
      drawKenBurns(ctx, W, H, reel.albumArt, currentTime);
    } else {
      drawPlaceholderArt(ctx, 0, 0, W, H, reel.accent, "Add album art for a background photo");
    }

    const scrim = ctx.createLinearGradient(0, H * 0.45, 0, H);
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.88)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);

    const barH = H * 0.07;
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = W * 0.02;
    ctx.font = `italic 700 ${W * 0.054}px 'Playfair Display', serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    wrapAndDraw(ctx, curr, W / 2, H * 0.72, W * 0.82, W * 0.072);
    ctx.restore();

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.88);
    drawHandle(ctx, W, H, reel, H * 0.94);
  }

  function drawNeonPulse(ctx, W, H, reel, currentTime) {
    drawBrickGrid(ctx, W, H, "#241030", "#0e0616", 41);
    ctx.fillStyle = "rgba(10,4,16,0.55)";
    ctx.fillRect(0, 0, W, H);

    // sweeping scan line
    const scanY = H * ((currentTime * 0.12) % 1);
    const scanGrad = ctx.createLinearGradient(0, scanY - H * 0.06, 0, scanY + H * 0.06);
    scanGrad.addColorStop(0, "rgba(34,229,255,0)");
    scanGrad.addColorStop(0.5, "rgba(34,229,255,0.12)");
    scanGrad.addColorStop(1, "rgba(34,229,255,0)");
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, scanY - H * 0.06, W, H * 0.12);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    const flicker = 0.9 + 0.1 * Math.sin(currentTime * 7);
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.shadowColor = reel.accent;
    ctx.shadowBlur = W * 0.03;
    ctx.font = `italic 700 ${W * 0.06}px 'Cormorant Garamond', serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    wrapAndDraw(ctx, curr, W / 2, H * 0.46, W * 0.8, W * 0.08);
    ctx.restore();

    const frameP = 0.55 + 0.15 * Math.sin(currentTime * 2);
    ctx.save();
    ctx.shadowColor = reel.accent2 || reel.accent;
    ctx.shadowBlur = W * 0.018;
    ctx.globalAlpha = frameP;
    ctx.strokeStyle = reel.accent2 || reel.accent;
    ctx.lineWidth = W * 0.004;
    roundRect(ctx, W * 0.12, H * 0.36, W * 0.76, H * 0.2, W * 0.03);
    ctx.stroke();
    ctx.restore();

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.86);
    drawHandle(ctx, W, H, reel, H * 0.94);
  }

  function seededRandLocal(seed) {
    const x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  function easeOutLocal(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function drawTypewriterTicker(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);

    const bandY = H * 0.48;
    const bandH = H * 0.1;
    ctx.fillStyle = reel.textColor;
    ctx.fillRect(W * 0.06, bandY - bandH / 2, W * 0.88, W * 0.012);
    ctx.fillRect(W * 0.06, bandY + bandH / 2, W * 0.88, W * 0.012);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    if (curr) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, bandY - bandH / 2, W, bandH);
      ctx.clip();
      ctx.font = `800 ${W * 0.068}px 'DM Sans', sans-serif`;
      ctx.fillStyle = reel.textColor;
      ctx.textAlign = "left";
      const unit = curr.toUpperCase() + "   •   ";
      const unitW = ctx.measureText(unit).width || 1;
      const speed = W * 0.14;
      let x = -((currentTime * speed) % unitW);
      while (x < W) {
        ctx.fillText(unit, x, bandY + W * 0.022);
        x += unitW;
      }
      ctx.restore();
    }

    ctx.textAlign = "left";
    ctx.font = `700 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(reel.accent, 0.85);
    ctx.fillText("NOW PLAYING", W * 0.08, H * 0.12);

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.86);
    drawHandle(ctx, W, H, reel, H * 0.93);
  }

  function drawConfettiBurst(ctx, W, H, cx, cy, seed, sinceStart, colors) {
    if (sinceStart == null || sinceStart < 0 || sinceStart > 1.3) return;
    const count = 16;
    const life = 1.3;
    const p = sinceStart / life;
    const fade = 1 - p;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + seededRandLocal(seed + i) * 0.6;
      const dist = (0.15 + seededRandLocal(seed + i * 3.1) * 0.35) * Math.min(W, H) * p;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist - p * H * 0.06;
      const size = W * (0.007 + seededRandLocal(seed + i * 2.2) * 0.009);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawConfettiPop(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);

    const idx = findCueIndex(reel.lyrics, currentTime);
    const cue = idx >= 0 ? reel.lyrics[idx] : reel.lyrics[0];
    const curr = cue ? cue.text : "";
    const cueStart = cue && cue.time != null ? cue.time : 0;
    const sinceStart = currentTime - cueStart;

    drawConfettiBurst(ctx, W, H, W / 2, H * 0.42, (idx + 1) * 17.3, sinceStart, [
      reel.accent,
      reel.accent2 || reel.accent,
      "#ff9776",
    ]);

    const pop = Math.min(1, Math.max(0, sinceStart / 0.3));
    const scale = 0.85 + 0.15 * easeOutLocal(pop);
    ctx.save();
    ctx.translate(W / 2, H * 0.46);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H * 0.46);
    ctx.font = `italic 700 ${W * 0.056}px 'Playfair Display', serif`;
    ctx.fillStyle = reel.textColor;
    ctx.textAlign = "center";
    wrapAndDraw(ctx, curr, W / 2, H * 0.46, W * 0.78, W * 0.075);
    ctx.restore();

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.86);
    drawHandle(ctx, W, H, reel, H * 0.93);
  }

  function drawConstellationLocal(ctx, W, H, currentTime, color) {
    const count = 7;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const r1 = seededRandLocal(i * 6.1 + 5);
      const r2 = seededRandLocal(i * 4.3 + 8);
      pts.push({ x: W * (0.08 + r1 * 0.84), y: H * (0.06 + r2 * 0.2) });
    }
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.22);
    ctx.lineWidth = W * 0.0012;
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();
    pts.forEach((p, i) => {
      const dur = 1.6 + seededRandLocal(i * 2.7 + 2) * 0.8;
      const delay = seededRandLocal(i * 1.9 + 9) * dur;
      const phase = (((currentTime - delay) % dur) + dur) % dur / dur;
      const pulse = Math.sin(phase * Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, W * 0.0035 * (0.6 + pulse * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawStarChartKaraoke(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);
    drawConstellationLocal(ctx, W, H, currentTime, reel.accent);

    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = reel.accent;
    ctx.lineWidth = W * 0.0015;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.46, W * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");
    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.052}px 'Playfair Display', serif`;
    ctx.fillStyle = reel.textColor;
    wrapAndDraw(ctx, curr, W / 2, H * 0.46, W * 0.76, W * 0.07);

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.86);
    drawHandle(ctx, W, H, reel, H * 0.93);
  }

  function drawFilmGrainLocal(ctx, W, H, count) {
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const a = Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
  }

  function drawSprocketHoles(ctx, W, H, color) {
    const holeW = W * 0.035, holeH = H * 0.018, gap = H * 0.045;
    const count = Math.ceil(H / gap);
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const y = i * gap;
      roundRect(ctx, W * 0.02, y, holeW, holeH, holeH * 0.3);
      ctx.fill();
      roundRect(ctx, W * 0.98 - holeW, y, holeW, holeH, holeH * 0.3);
      ctx.fill();
    }
  }

  function drawOldFilmReel(ctx, W, H, reel, currentTime) {
    ctx.fillStyle = reel.bg;
    ctx.fillRect(0, 0, W, H);

    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    drawFilmGrainLocal(ctx, W, H, Math.round((W * H) / 4500));
    drawSprocketHoles(ctx, W, H, "#0a0806");

    const idx = findCueIndex(reel.lyrics, currentTime);
    const curr = idx >= 0 ? reel.lyrics[idx].text : (reel.lyrics[0] ? reel.lyrics[0].text : "");

    const barY = H * 0.82, barH = H * 0.14;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, barY - barH / 2, W, barH);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.046}px 'Playfair Display', serif`;
    ctx.fillStyle = reel.textColor;
    wrapAndDraw(ctx, curr, W / 2, barY, W * 0.78, W * 0.062);

    drawTimeline(ctx, W, H, reel, currentTime, H * 0.92);
    drawHandle(ctx, W, H, reel, H * 0.97);
  }

  const REEL_RENDERERS = {
    "karaoke-glow": drawKaraokeGlow,
    "waveform-pulse": drawWaveformPulse,
    "vinyl-diary": drawVinylDiary,
    "notes-karaoke": drawNotesKaraoke,
    "cinematic-lyrics": drawCinematicLyrics,
    "neon-pulse": drawNeonPulse,
    "typewriter-ticker": drawTypewriterTicker,
    "confetti-pop": drawConfettiPop,
    "star-chart-karaoke": drawStarChartKaraoke,
    "old-film-reel": drawOldFilmReel,
  };

  window.PS_renderReel = function (ctx, reel, currentTime) {
    const W = window.PS_REEL_FORMAT.width;
    const H = window.PS_REEL_FORMAT.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
    const fn = REEL_RENDERERS[reel.style] || drawKaraokeGlow;
    fn(ctx, W, H, reel, currentTime || 0);
    // Elements animate off the audio's own currentTime, so motion is
    // perfectly in sync with playback in both the live preview and export.
    if (window.PS_drawElements) window.PS_drawElements(ctx, W, H, reel.elements, currentTime || 0);
  };

  window.PS_findCueIndex = findCueIndex;
})();
