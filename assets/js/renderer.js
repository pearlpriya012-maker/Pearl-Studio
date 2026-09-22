/* Pearl Studio — canvas rendering engine
 * render(ctx, template, state, t) draws one frame.
 * t is animation progress from 0 (start) to 1 (end); t is always 1 for
 * static PNG export / thumbnails.
 */

(function () {
  // Default animation length in seconds, used when a caller doesn't pass
  // an explicit duration. Looping motifs (falling petals, floating
  // particles...) convert t back to elapsed seconds against the actual
  // duration so they cycle correctly regardless of clip length.
  const ANIM_SECONDS = 3.2;

  function seededRand(seed) {
    const x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Eased 0..1 progress for the idx-th staggered element in a sequence.
  function stagger(t, idx, startFrac, gapFrac, durFrac) {
    const localStart = startFrac + idx * gapFrac;
    const local = (t - localStart) / durFrac;
    return easeOut(Math.max(0, Math.min(1, local)));
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

  function hexToRgb(hex) {
    const num = parseInt(String(hex).replace("#", ""), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ---- plain text wrapping (no emphasis) ----
  function wrapLines(ctx, text, maxWidth) {
    const paragraphs = String(text || "").split("\n");
    const lines = [];
    paragraphs.forEach((para) => {
      const words = para.split(" ").filter(Boolean);
      if (words.length === 0) {
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

  function drawMultiline(ctx, text, cx, cy, maxWidth, lineHeight, align) {
    const lines = wrapLines(ctx, text, maxWidth);
    const totalHeight = lines.length * lineHeight;
    const startY = cy - totalHeight / 2 + lineHeight / 2;
    const x = align === "left" ? cx - maxWidth / 2 : align === "right" ? cx + maxWidth / 2 : cx;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, startY + i * lineHeight);
    });
    return totalHeight;
  }

  // ---- emphasis-aware text: *word* renders in the accent color ----
  function tokenizeEmphasis(text) {
    return String(text || "").split("\n").map((para) => {
      const runs = para.split(/\*(.+?)\*/g).map((t, i) => ({ text: t, em: i % 2 === 1 }));
      const words = [];
      runs.forEach((r) => {
        r.text.split(" ").filter(Boolean).forEach((w) => words.push({ word: w, em: r.em }));
      });
      return words;
    });
  }

  function wrapEmphWords(ctx, words, maxWidth) {
    if (!words.length) return [[]];
    const lines = [];
    let current = [words[0]];
    let currentText = words[0].word;
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      const candidate = currentText + " " + w.word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current.push(w);
        currentText = candidate;
      } else {
        lines.push(current);
        current = [w];
        currentText = w.word;
      }
    }
    lines.push(current);
    return lines;
  }

  function buildEmphLines(ctx, text, maxWidth) {
    const paragraphs = tokenizeEmphasis(text);
    const lines = [];
    paragraphs.forEach((words, pIdx) => {
      wrapEmphWords(ctx, words, maxWidth).forEach((l) => lines.push({ words: l, para: pIdx }));
    });
    return lines;
  }

  function drawEmphLine(ctx, lineWords, cx, y, normalColor, emColor) {
    const spaceWidth = ctx.measureText(" ").width;
    const widths = lineWords.map((w) => ctx.measureText(w.word).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaceWidth * Math.max(0, lineWords.length - 1);
    let x = cx - total / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    lineWords.forEach((w, i) => {
      ctx.fillStyle = w.em ? emColor : normalColor;
      ctx.fillText(w.word, x, y);
      x += widths[i] + spaceWidth;
    });
    ctx.textAlign = prevAlign;
  }

  function drawEmphLineLeft(ctx, lineWords, x, y, normalColor, emColor) {
    const spaceWidth = ctx.measureText(" ").width;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    let cx = x;
    lineWords.forEach((w) => {
      ctx.fillStyle = w.em ? emColor : normalColor;
      ctx.fillText(w.word, cx, y);
      cx += ctx.measureText(w.word).width + spaceWidth;
    });
    ctx.textAlign = prevAlign;
  }

  // Draws one line's words character-by-character, up to `revealChars` of
  // this line, left-to-right starting at the line's centered x position.
  // Returns how many characters were actually drawn and where the "cursor"
  // (the next not-yet-typed position) landed.
  function drawEmphLineTypewriter(ctx, lineWords, cx, y, normalColor, emColor, revealChars, align) {
    const spaceWidth = ctx.measureText(" ").width;
    const widths = lineWords.map((w) => ctx.measureText(w.word).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaceWidth * Math.max(0, lineWords.length - 1);
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    let x = align === "left" ? cx : cx - total / 2;
    let charsDrawn = 0;
    for (let wi = 0; wi < lineWords.length; wi++) {
      const w = lineWords[wi];
      const chars = w.word.split("");
      for (let ci = 0; ci < chars.length; ci++) {
        if (charsDrawn >= revealChars) {
          ctx.textAlign = prevAlign;
          return { charsDrawn, cursorX: x, cursorY: y };
        }
        ctx.fillStyle = w.em ? emColor : normalColor;
        ctx.fillText(chars[ci], x, y);
        x += ctx.measureText(chars[ci]).width;
        charsDrawn++;
      }
      if (wi < lineWords.length - 1) {
        if (charsDrawn >= revealChars) {
          ctx.textAlign = prevAlign;
          return { charsDrawn, cursorX: x, cursorY: y };
        }
        x += spaceWidth;
        charsDrawn++;
      }
    }
    ctx.textAlign = prevAlign;
    return { charsDrawn, cursorX: x, cursorY: y };
  }

  function lineCharCount(line) {
    return line.words.reduce((s, w) => s + w.word.length, 0) + Math.max(0, line.words.length - 1);
  }

  // Reveals multi-paragraph, *emphasis*-aware text one character at a time
  // (a "typewriter" effect) as `progress` goes 0..1, with a blinking
  // cursor at the current typing position.
  function drawMultilineTypewriter(ctx, text, cx, cy, maxWidth, lineHeight, normalColor, emColor, progress, cursorColor) {
    const lines = buildEmphLines(ctx, text, maxWidth);
    const totalHeight = lines.length * lineHeight;
    const startY = cy - totalHeight / 2 + lineHeight / 2;
    const totalChars = lines.reduce((sum, line) => sum + lineCharCount(line) + 1, 0);
    let remaining = Math.round(Math.max(0, Math.min(1, progress)) * totalChars);
    let cursor = null;
    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      const lineTotal = lineCharCount(line);
      if (remaining <= 0) return;
      const showThisLine = Math.min(remaining, lineTotal);
      const result = drawEmphLineTypewriter(ctx, line.words, cx, y, normalColor, emColor, showThisLine);
      if (showThisLine < lineTotal || i === lines.length - 1) cursor = result;
      remaining -= lineTotal + 1;
    });
    if (cursor && progress < 1 && progress > 0) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = cursorColor;
      ctx.globalAlpha = ctx.globalAlpha * (Math.floor(progress * 20) % 2 === 0 ? 1 : 0.15);
      ctx.fillText("|", cursor.cursorX, cursor.cursorY);
      ctx.restore();
    }
    return totalHeight;
  }

  // Draws multi-paragraph, *emphasis*-aware text centered on cx/cy.
  // opts.paraProgress(paraIndex, paraCount) drives per-paragraph fade/rise;
  // defaults to fully revealed. opts.typewriter switches to a
  // character-by-character reveal driven by opts.progress instead.
  function drawMultilineEmph(ctx, text, cx, cy, maxWidth, lineHeight, normalColor, emColor, opts) {
    opts = opts || {};
    if (opts.typewriter) {
      return drawMultilineTypewriter(ctx, text, cx, cy, maxWidth, lineHeight, normalColor, emColor, opts.progress == null ? 1 : opts.progress, opts.cursorColor || emColor);
    }
    const lines = buildEmphLines(ctx, text, maxWidth);
    const paraCount = lines.length ? lines[lines.length - 1].para + 1 : 0;
    const totalHeight = lines.length * lineHeight;
    const startY = cy - totalHeight / 2 + lineHeight / 2;
    const baseAlpha = ctx.globalAlpha;
    lines.forEach((line, i) => {
      const progress = opts.paraProgress ? opts.paraProgress(line.para, paraCount) : 1;
      if (progress <= 0) return;
      ctx.globalAlpha = baseAlpha * progress;
      const rise = opts.rise ? opts.rise(progress) : 0;
      drawEmphLine(ctx, line.words, cx, startY + i * lineHeight + rise, normalColor, emColor);
    });
    ctx.globalAlpha = baseAlpha;
    return totalHeight;
  }

  // Builds the opts object for a title's drawMultilineEmph call: typewriter
  // reveal when textAnim === "typewriter", else the style's own paraProgress
  // timing (per-paragraph fade/stagger, or a constant for whole-block fades).
  function titleOpts(t, textAnim, paraProgressFn) {
    if (textAnim === "typewriter") {
      const progress = Math.max(0, Math.min(1, (t - 0.05) / 0.55));
      return { typewriter: true, progress };
    }
    return { paraProgress: paraProgressFn };
  }

  // Draws `img` covering the w x h box centered at (x,y), like CSS
  // background-size: cover. `zoom` (>=1) adds extra scale for Ken Burns.
  // offsetX/offsetY (-1..1) pan the image within the extra room `zoom`
  // creates beyond the cover-fit box; 0 keeps it centered.
  function drawImageCover(ctx, img, x, y, w, h, zoom, offsetX, offsetY) {
    zoom = zoom || 1;
    offsetX = offsetX || 0;
    offsetY = offsetY || 0;
    const boxRatio = w / h;
    const imgRatio = img.width / img.height;
    let drawW, drawH;
    if (imgRatio > boxRatio) {
      drawH = h * zoom;
      drawW = drawH * imgRatio;
    } else {
      drawW = w * zoom;
      drawH = drawW / imgRatio;
    }
    const maxShiftX = Math.max(0, (drawW - w) / 2);
    const maxShiftY = Math.max(0, (drawH - h) / 2);
    ctx.drawImage(img, x - drawW / 2 + offsetX * maxShiftX, y - drawH / 2 + offsetY * maxShiftY, drawW, drawH);
  }

  // ---- shared decorative motifs ----

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

  function drawCorners(ctx, W, H, color, inset, size, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    const x0 = W * inset, y0 = H * inset, x1 = W * (1 - inset), y1 = H * (1 - inset);
    const s = Math.min(W, H) * size;
    ctx.beginPath(); ctx.moveTo(x0, y0 + s); ctx.lineTo(x0, y0); ctx.lineTo(x0 + s, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - s, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y1 - s); ctx.lineTo(x0, y1); ctx.lineTo(x0 + s, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - s, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - s); ctx.stroke();
    ctx.restore();
  }

  function drawBorderFrame(ctx, W, H, color, inset) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = W * 0.002;
    ctx.strokeRect(W * inset, H * inset, W * (1 - inset * 2), H * (1 - inset * 2));
    ctx.restore();
  }

  function drawWidescreenBars(ctx, W, H, barFrac, bgColor) {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H * barFrac);
    ctx.fillRect(0, H * (1 - barFrac), W, H * barFrac);
    ctx.restore();
  }

  // Falling, rotating petal/blossom shapes that loop within durSec.
  function drawFalling(ctx, W, H, t, color, count, seedBase, opts, durSec) {
    opts = opts || {};
    const elapsed = t * (durSec || ANIM_SECONDS);
    const w = opts.w != null ? opts.w : W * 0.02;
    const h = opts.h != null ? opts.h : W * 0.03;
    for (let i = 0; i < count; i++) {
      const r1 = seededRand(seedBase + i * 12.9898);
      const r2 = seededRand(seedBase + i * 78.233 + 3);
      const r3 = seededRand(seedBase + i * 4.5 + 7);
      const dur = (opts.durMin || 3.2) + r1 * ((opts.durMax || 4.5) - (opts.durMin || 3.2));
      const delay = r2 * dur;
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const x = W * (0.08 + r3 * 0.84) + Math.sin(phase * Math.PI * 2) * (opts.sway || W * 0.02);
      const y = H * -0.06 + phase * H * 1.12;
      const alpha = phase < 0.1 ? phase / 0.1 : phase > 0.85 ? (1 - phase) / 0.15 : 0.55;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(phase * Math.PI * 2);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Small dots rising and fading, looping within durSec.
  function drawFloatingDots(ctx, W, H, t, colors, count, seedBase, opts, durSec) {
    opts = opts || {};
    const elapsed = t * (durSec || ANIM_SECONDS);
    for (let i = 0; i < count; i++) {
      const r1 = seededRand(seedBase + i * 5.17);
      const r2 = seededRand(seedBase + i * 8.63 + 2);
      const r3 = seededRand(seedBase + i * 3.31 + 4);
      const dur = (opts.durMin || 3.5) + r1 * ((opts.durMax || 5) - (opts.durMin || 3.5));
      const delay = r2 * dur;
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const x = W * (0.15 + r3 * 0.7);
      const y = H * 0.85 - phase * H * 0.65;
      const alpha = phase < 0.25 ? phase / 0.25 : phase > 0.75 ? (1 - phase) / 0.25 : 1;
      const size = (opts.sizeMin || W * 0.004) + r1 * ((opts.sizeMax || W * 0.008) - (opts.sizeMin || W * 0.004));
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * (opts.maxAlpha || 0.6);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const STAR_POSITIONS = [
    [0.10, 0.20], [0.85, 0.15], [0.20, 0.80], [0.75, 0.75],
    [0.50, 0.10], [0.90, 0.50], [0.05, 0.50],
  ];

  function drawStars(ctx, W, H, t, color, durSec) {
    const elapsed = t * (durSec || ANIM_SECONDS);
    STAR_POSITIONS.forEach(([lx, ly], i) => {
      const dur = 1.6 + seededRand(i * 2.1) * 0.8;
      const delay = seededRand(i * 3.7 + 1) * dur;
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const pulse = Math.sin(phase * Math.PI);
      ctx.save();
      ctx.globalAlpha = Math.max(0, pulse) * 0.8;
      ctx.fillStyle = color;
      ctx.font = `${W * 0.022 * (0.7 + pulse * 0.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", W * lx, H * ly);
      ctx.restore();
    });
  }

  function drawRipples(ctx, W, H, t, color, cx, cy, durSec) {
    const elapsed = t * (durSec || ANIM_SECONDS);
    for (let i = 0; i < 3; i++) {
      const dur = 4 + i * 0.6;
      const delay = i * 1.3;
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const r = W * (0.12 + phase * 0.34);
      ctx.save();
      ctx.globalAlpha = (1 - phase) * 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = W * 0.002;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawAuroraBlobs(ctx, W, H, t, colors, durSec) {
    const elapsed = t * (durSec || ANIM_SECONDS);
    const specs = [
      { color: colors[0], r: W * 0.32, x: W * 0.15, y: H * 0.2, dur: 6, tx: W * 0.06, ty: H * 0.03 },
      { color: colors[1], r: W * 0.3, x: W * 0.82, y: H * 0.35, dur: 7, tx: -W * 0.05, ty: -H * 0.04 },
      { color: colors[2] || colors[0], r: W * 0.28, x: W * 0.35, y: H * 0.85, dur: 5, tx: W * 0.04, ty: -H * 0.03 },
    ];
    specs.forEach((s) => {
      const phase = (elapsed % s.dur) / s.dur;
      const wobble = Math.sin(phase * Math.PI * 2);
      drawGlowBlob(ctx, s.x + s.tx * wobble, s.y + s.ty * wobble, s.r, s.color, 0.16);
    });
  }

  function drawJournalRules(ctx, W, H, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    [0.3, 0.5, 0.7].forEach((frac) => {
      ctx.beginPath();
      ctx.moveTo(W * 0.08, H * frac);
      ctx.lineTo(W * 0.92, H * frac);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Scattered dots that pop in (scale + fade) and stay put, confined to a
  // top and bottom band so they frame the text instead of covering it.
  function drawConfetti(ctx, W, H, t, colors, count, seedBase) {
    for (let i = 0; i < count; i++) {
      const r1 = seededRand(seedBase + i * 7.3);
      const r2 = seededRand(seedBase + i * 3.1 + 2);
      const r3 = seededRand(seedBase + i * 5.9 + 4);
      const band = i % 2 === 0 ? [0.05, 0.15] : [0.85, 0.95];
      const x = W * (0.08 + r1 * 0.84);
      const y = H * (band[0] + r2 * (band[1] - band[0]));
      const size = W * (0.007 + r3 * 0.009);
      const pop = stagger(t, i, 0.02, 0.02, 0.25);
      if (pop <= 0) continue;
      ctx.save();
      ctx.globalAlpha = pop * 0.9;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, size * (0.4 + 0.6 * pop), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A small chain of twinkling stars connected by faint lines, confined to
  // a top band so it reads as sky rather than covering the title.
  function drawConstellation(ctx, W, H, t, color, count, seedBase, durSec) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const r1 = seededRand(seedBase + i * 6.1);
      const r2 = seededRand(seedBase + i * 4.3 + 3);
      pts.push({ x: W * (0.08 + r1 * 0.84), y: H * (0.04 + r2 * 0.22) });
    }
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.25);
    ctx.lineWidth = W * 0.0012;
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();

    const elapsed = t * (durSec || ANIM_SECONDS);
    pts.forEach((p, i) => {
      const dur = 1.6 + seededRand(seedBase + i * 2.7) * 0.8;
      const delay = seededRand(seedBase + i * 1.9 + 5) * dur;
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const pulse = Math.sin(phase * Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.4 + pulse * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, W * 0.004 * (0.6 + pulse * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function formatToday() {
    return new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  // ══════════════════════ STYLE RENDERERS ══════════════════════

  function drawKdramaFade(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.1, H * 0.05, W * 0.35, "#ff6b9d", 0.2);
    drawGlowBlob(ctx, W * 0.9, H * 0.9, W * 0.2, "#ffd6e7", 0.2);
    drawBorderFrame(ctx, W, H, rgba(accent, 0.2), 0.07);
    drawCorners(ctx, W, H, accent, 0.07, 0.08, W * 0.0015);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.052}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.78, W * 0.075, tpl.textColor, accent,
      titleOpts(t, textAnim, (idx) => stagger(t, idx, 0.1, 0.22, 0.22)));

    ctx.globalAlpha = stagger(t, 0, 0.78, 0, 0.2);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.88 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawKdramaPetals(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawFalling(ctx, W, H, t, accent, 10, 11, { w: W * 0.018, h: W * 0.026 }, durSec);

    if (state.kicker) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.font = `${W * 0.06}px 'Playfair Display', serif`;
      ctx.fillText(state.kicker, W / 2 + tdx, H * 0.3 + tdy);
      ctx.restore();
    }

    const progress = stagger(t, 0, 0.15, 0, 0.3);
    const scale = 0.92 + 0.08 * progress;
    ctx.save();
    ctx.translate(W / 2 + tdx, H * 0.46 + tdy);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2 - tdx, -H * 0.46 - tdy);
    ctx.globalAlpha = progress;
    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.048}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.78, W * 0.07, tpl.textColor, accent, titleOpts(t, textAnim, () => 1));
    ctx.restore();

    ctx.globalAlpha = stagger(t, 0, 0.55, 0, 0.2);
    ctx.textAlign = "center";
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.6);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.68 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawKdramaCine(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const pulse = 0.5 + 0.5 * Math.sin(t * (durSec || ANIM_SECONDS) * 1.5);
    drawGlowBlob(ctx, W / 2, H / 2, W * 0.32, "#ff6b9d", 0.1 + 0.09 * pulse);
    drawWidescreenBars(ctx, W, H, 0.12, bg);

    ctx.globalAlpha = stagger(t, 0, 0.13, 0, 0.35);
    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.055}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.8, W * 0.075, tpl.textColor, accent, titleOpts(t, textAnim, () => 1));
    ctx.globalAlpha = 1;

    ctx.globalAlpha = stagger(t, 0, 0.62, 0, 0.2);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.6);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.83 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawLovePop(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    const accent2 = tpl.accent2 || "#f472b6";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.05, H * 0.05, W * 0.35, "#7c3aed", 0.14);
    drawGlowBlob(ctx, W * 0.95, H * 0.95, W * 0.28, "#db2777", 0.12);

    if (state.kicker) {
      ctx.textAlign = "center";
      ctx.globalAlpha = stagger(t, 0, 0.03, 0, 0.15);
      ctx.font = `600 ${W * 0.018}px 'DM Sans', sans-serif`;
      ctx.fillStyle = rgba(accent, 0.4);
      ctx.fillText(state.kicker.toUpperCase(), W / 2 + tdx, H * 0.22 + tdy);
      ctx.globalAlpha = 1;
    }

    const p1 = stagger(t, 0, 0.16, 0, 0.16);
    if (p1 > 0) {
      const bw = W * 0.82, bh = H * 0.15, bx = W * 0.5 + tdx, by = H * 0.36 + tdy;
      const s = 0.7 + 0.3 * p1;
      ctx.save();
      ctx.globalAlpha = p1;
      ctx.translate(bx, by);
      ctx.scale(s, s);
      ctx.fillStyle = "#1e1030";
      ctx.strokeStyle = rgba(accent, 0.3);
      ctx.lineWidth = 2;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, W * 0.03);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = accent;
      ctx.font = `600 ${W * 0.014}px 'DM Sans', sans-serif`;
      ctx.fillText("BRAIN · 2AM", -bw / 2 + W * 0.03, -bh / 2 + H * 0.03);
      ctx.font = `400 ${W * 0.026}px 'DM Sans', sans-serif`;
      drawMultilineEmph(ctx, state.title, 0, H * 0.015, bw * 0.85, W * 0.034, "#e9d5ff", "#c084fc", titleOpts(t, textAnim, () => 1));
      ctx.restore();
    }

    const p2 = stagger(t, 0, 0.38, 0, 0.16);
    if (p2 > 0 && state.subtitle) {
      const bw = W * 0.62, bh = H * 0.08, bx = W * 0.72 + tdx, by = H * 0.55 + tdy;
      const s = 0.7 + 0.3 * p2;
      ctx.save();
      ctx.globalAlpha = p2;
      ctx.translate(bx, by);
      ctx.scale(s, s);
      ctx.fillStyle = "#1a0a24";
      ctx.strokeStyle = rgba(accent2, 0.5);
      ctx.lineWidth = 2;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, W * 0.03);
      ctx.fill();
      ctx.stroke();
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent2;
      ctx.textAlign = "center";
      drawMultiline(ctx, state.subtitle, 0, 0, bw * 0.85, W * 0.034, "center");
      ctx.restore();
    }

    ctx.textAlign = "center";
    ctx.globalAlpha = stagger(t, 0, 0.62, 0, 0.15);
    ctx.font = `italic 400 ${W * 0.024}px 'Playfair Display', serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText("— we are healing. slowly.", W / 2 + tdx, H * 0.72 + tdy);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = stagger(t, 0, 0.75, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.8 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawLoveParticles(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawFloatingDots(ctx, W, H, t, ["#c084fc", "#f472b6", "#a855f7", "#e879f9"], 8, 21, {}, durSec);

    const elapsed = t * (durSec || ANIM_SECONDS);
    [["💜", 0.15, 0.75, 5, 0.5], ["🩷", 0.75, 0.8, 4.5, 1.5]].forEach(([emoji, lx, ly, dur, delay]) => {
      const phase = (((elapsed - delay) % dur) + dur) % dur / dur;
      const alpha = phase < 0.2 ? phase / 0.2 : phase > 0.8 ? (1 - phase) / 0.2 : 0.5;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `${W * 0.03}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(emoji, W * lx, H * ly - phase * H * 0.55);
      ctx.restore();
    });

    ctx.textAlign = "center";
    ctx.font = `italic 300 ${W * 0.058}px 'Cormorant Garamond', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.48 + tdy, W * 0.76, W * 0.075, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.2, 0, 0.3)));

    ctx.globalAlpha = stagger(t, 0, 0.6, 0, 0.2);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.68 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawLoveCine(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.1, H * 0.05, W * 0.32, "#7c3aed", 0.14);
    drawGlowBlob(ctx, W * 0.92, H * 0.95, W * 0.25, "#db2777", 0.12);
    drawWidescreenBars(ctx, W, H, 0.1, bg);

    ctx.textAlign = "center";
    ctx.globalAlpha = stagger(t, 0, 0.15, 0, 0.4);
    ctx.font = `italic 300 ${W * 0.06}px 'Cormorant Garamond', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.48 + tdy, W * 0.78, W * 0.085, tpl.textColor, accent, titleOpts(t, textAnim, () => 1));
    ctx.globalAlpha = 1;

    ctx.globalAlpha = stagger(t, 0, 0.65, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.8 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawConfFade(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W / 2, H / 2, W * 0.3, accent, 0.06);
    drawGlowBlob(ctx, W * 0.95, H * 0.95, W * 0.2, "#a78bfa", 0.1);

    if (state.kicker) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = accent;
      ctx.font = `italic 700 ${W * 0.26}px 'Playfair Display', serif`;
      ctx.textAlign = "center";
      ctx.fillText(state.kicker, W / 2 + tdx, H * 0.52 + tdy);
      ctx.restore();
    }

    drawCorners(ctx, W, H, accent, 0.07, 0.08, W * 0.0015);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.046}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.4 + tdy, W * 0.78, W * 0.066, tpl.textColor, accent,
      titleOpts(t, textAnim, (idx) => stagger(t, idx, 0.06, 0.2, 0.22)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.68, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      drawMultiline(ctx, state.subtitle, W / 2 + tdx, H * 0.58 + tdy, W * 0.7, W * 0.036, "center");
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.86, 0, 0.14);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.86 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawConfStars(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawStars(ctx, W, H, t, accent, durSec);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.44 + tdy, W * 0.76, W * 0.07, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.15, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.55, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.028}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.75, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.66 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawConfCine(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W / 2, H / 2, W * 0.32, accent, 0.07);
    drawGlowBlob(ctx, W * 0.9, H * 0.95, W * 0.22, "#a78bfa", 0.1);
    drawWidescreenBars(ctx, W, H, 0.1, bg);

    ctx.textAlign = "center";
    ctx.globalAlpha = stagger(t, 0, 0.13, 0, 0.35);
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.45 + tdy, W * 0.78, W * 0.072, tpl.textColor, accent, titleOpts(t, textAnim, () => 1));
    ctx.globalAlpha = 1;

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.6, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.78, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.83 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawJournal(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawJournalRules(ctx, W, H, "rgba(255,255,255,0.03)");

    const leftX = W * 0.12 + tdx;
    ctx.textAlign = "left";
    ctx.globalAlpha = stagger(t, 0, 0.06, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(formatToday().toUpperCase(), leftX, H * 0.36 + tdy);
    ctx.globalAlpha = 1;

    const entryX = leftX + W * 0.035;
    const maxWidth = W - entryX - W * 0.1;
    ctx.font = `italic 300 ${W * 0.048}px 'Cormorant Garamond', serif`;
    const lines = buildEmphLines(ctx, state.title, maxWidth);
    const lineHeight = W * 0.072;
    const startY = H * 0.46 + tdy;
    const progress = stagger(t, 0, 0.22, 0, 0.3);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = W * 0.003;
    ctx.globalAlpha = progress;
    ctx.beginPath();
    ctx.moveTo(leftX, startY - W * 0.02);
    ctx.lineTo(leftX, startY + lines.length * lineHeight);
    ctx.stroke();
    ctx.restore();

    if (textAnim === "typewriter") {
      const typeProgress = Math.max(0, Math.min(1, (t - 0.05) / 0.55));
      const totalChars = lines.reduce((sum, line) => sum + lineCharCount(line) + 1, 0);
      let remaining = Math.round(typeProgress * totalChars);
      let cursor = null;
      lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        const lineTotal = lineCharCount(line);
        if (remaining <= 0) return;
        const showThisLine = Math.min(remaining, lineTotal);
        const result = drawEmphLineTypewriter(ctx, line.words, entryX, y, tpl.textColor, accent, showThisLine, "left");
        if (showThisLine < lineTotal || i === lines.length - 1) cursor = result;
        remaining -= lineTotal + 1;
      });
      if (cursor && typeProgress < 1 && typeProgress > 0) {
        ctx.save();
        ctx.fillStyle = accent;
        ctx.globalAlpha = Math.floor(typeProgress * 20) % 2 === 0 ? 1 : 0.15;
        ctx.fillText("|", cursor.cursorX, cursor.cursorY);
        ctx.restore();
      }
    } else {
      lines.forEach((line, i) => {
        ctx.globalAlpha = progress;
        drawEmphLineLeft(ctx, line.words, entryX, startY + i * lineHeight, tpl.textColor, accent);
      });
      ctx.globalAlpha = 1;
    }

    if (state.kicker) {
      ctx.globalAlpha = stagger(t, 0, 0.58, 0, 0.15);
      ctx.font = `italic 400 ${W * 0.026}px 'Playfair Display', serif`;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText(state.kicker, leftX, startY + lines.length * lineHeight + H * 0.06);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.75, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillText(state.handle, leftX, startY + lines.length * lineHeight + H * 0.1);
    ctx.globalAlpha = 1;
  }

  function drawNeon(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.1, H * 0.1, W * 0.3, accent, 0.14);
    drawGlowBlob(ctx, W * 0.9, H * 0.9, W * 0.25, "#818cf8", 0.12);

    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = W * 0.02;
    ctx.globalAlpha = stagger(t, 0, 0.15, 0, 0.25);
    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.06}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.78, W * 0.08, "#ffffff", accent, titleOpts(t, textAnim, () => 1));
    ctx.restore();

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.5, 0, 0.2);
      ctx.textAlign = "center";
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.69, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.35);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.72 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawGolden(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGlowBlob(ctx, W * 0.3, H * 0.35, W * 0.34, accent, 0.13);
    drawGlowBlob(ctx, W * 0.85, H * 0.9, W * 0.22, "#fb923c", 0.1);

    ctx.textAlign = "center";
    ctx.globalAlpha = stagger(t, 0, 0.09, 0, 0.35);
    ctx.font = `italic 300 ${W * 0.06}px 'Cormorant Garamond', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.42 + tdy, W * 0.76, W * 0.078, tpl.textColor, accent, titleOpts(t, textAnim, () => 1));
    ctx.globalAlpha = 1;

    const decoP = stagger(t, 0, 0.5, 0, 0.15);
    if (decoP > 0) {
      ctx.save();
      ctx.globalAlpha = decoP;
      ctx.strokeStyle = rgba(accent, 0.2);
      ctx.lineWidth = W * 0.002;
      ctx.beginPath(); ctx.moveTo(W * 0.35 + tdx, H * 0.56 + tdy); ctx.lineTo(W * 0.46 + tdx, H * 0.56 + tdy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.54 + tdx, H * 0.56 + tdy); ctx.lineTo(W * 0.65 + tdx, H * 0.56 + tdy); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = `${W * 0.028}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", W / 2 + tdx, H * 0.565 + tdy);
      ctx.restore();
    }

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.62, 0, 0.15);
      ctx.textAlign = "center";
      ctx.font = `italic 400 ${W * 0.028}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.62 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.78, 0, 0.15);
    ctx.textAlign = "center";
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.35);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.72 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawOcean(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawRipples(ctx, W, H, t, accent, W / 2, H * 0.43, durSec);

    ctx.textAlign = "center";
    ctx.font = `italic 300 ${W * 0.058}px 'Cormorant Garamond', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.44 + tdy, W * 0.76, W * 0.076, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.18, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.52, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.72, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.65 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawCherry(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawFalling(ctx, W, H, t, accent, 8, 33, { w: W * 0.02, h: W * 0.028, sway: W * 0.04 }, durSec);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.44 + tdy, W * 0.78, W * 0.07, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.13, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.48, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.56 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.68, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.35);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.63 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawPolaroid(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const drop = stagger(t, 0, 0.08, 0, 0.28);
    const frameW = W * 0.76;
    const frameH = H * 0.58;
    ctx.save();
    ctx.globalAlpha = drop;
    ctx.translate(W / 2, H * 0.44 - (1 - drop) * H * 0.03);
    ctx.rotate(-0.026 * drop);
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = W * 0.02;
    ctx.shadowOffsetY = W * 0.01;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, -frameW / 2, -frameH / 2, frameW, frameH, W * 0.006);
    ctx.fill();
    ctx.shadowColor = "transparent";

    const pad = frameW * 0.06;
    const photoSize = frameW - pad * 2;
    const photoY = -frameH / 2 + pad;
    if (state.image) {
      ctx.save();
      roundRect(ctx, -photoSize / 2, photoY, photoSize, photoSize, 0);
      ctx.clip();
      drawImageCover(ctx, state.image, 0, photoY + photoSize / 2, photoSize, photoSize, state.imageZoom || 1, state.imageOffsetX || 0, state.imageOffsetY || 0);
      ctx.restore();
    } else {
      const grad = ctx.createLinearGradient(-photoSize / 2, photoY, photoSize / 2, photoY + photoSize);
      grad.addColorStop(0, "#ffd6e7");
      grad.addColorStop(1, "#e9d5ff");
      ctx.fillStyle = grad;
      ctx.fillRect(-photoSize / 2, photoY, photoSize, photoSize);
      ctx.font = `${photoSize * 0.28}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("🌸", 0, photoY + photoSize / 2 + photoSize * 0.1);
    }

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.03}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, 0 + tdx, photoY + photoSize + pad * 1.7 + tdy, frameW * 0.84, W * 0.04, "#1a1a2e", accent, titleOpts(t, textAnim, () => 1));

    ctx.font = `600 ${W * 0.014}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(26,26,46,0.3)";
    ctx.fillText(formatToday(), 0, frameH / 2 - pad * 0.35);
    ctx.restore();

    ctx.globalAlpha = stagger(t, 0, 0.42, 0, 0.15);
    ctx.textAlign = "center";
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(26,26,46,0.25)";
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.86 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawAurora(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawAuroraBlobs(ctx, W, H, t, ["#7c3aed", "#0891b2", accent], durSec);

    ctx.textAlign = "center";
    ctx.font = `italic 300 ${W * 0.056}px 'Cormorant Garamond', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.44 + tdy, W * 0.78, W * 0.076, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.16, 0, 0.32)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.52, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.74, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.35);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.66 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawPlaceholder(ctx, x, y, w, h, accent, label) {
    ctx.fillStyle = "#14161d";
    ctx.fillRect(x, y, w, h);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, rgba(accent, 0.35));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    if (label) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `500 ${w * 0.055}px 'DM Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + h / 2);
      ctx.restore();
    }
  }

  function drawFullBleed(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    if (state.image) {
      drawImageCover(ctx, state.image, W / 2, H / 2, W, H, state.imageZoom || 1, state.imageOffsetX || 0, state.imageOffsetY || 0);
    } else {
      drawPlaceholder(ctx, 0, 0, W, H, accent, "Upload a photo");
    }

    const scrim = ctx.createLinearGradient(0, H * 0.5, 0, H);
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    const barP = stagger(t, 0, 0.1, 0, 0.2);
    ctx.save();
    ctx.globalAlpha = barP;
    ctx.fillStyle = accent;
    ctx.fillRect(W * 0.5 - W * 0.05, H * 0.6, W * 0.1, W * 0.006);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.048}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.7 + tdy, W * 0.78, W * 0.068, "#ffffff", accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.15, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.5, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.84 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.68, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.93 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawFramed(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const frameW = W * 0.74;
    const frameH = H * 0.44;
    const frameX = W / 2;
    const frameY = H * 0.36;
    const pop = stagger(t, 0, 0.08, 0, 0.3);

    ctx.save();
    ctx.globalAlpha = pop;
    ctx.translate(frameX, frameY);
    ctx.scale(0.94 + 0.06 * pop, 0.94 + 0.06 * pop);

    if (state.image) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-frameW / 2, -frameH / 2, frameW, frameH);
      ctx.clip();
      drawImageCover(ctx, state.image, 0, 0, frameW, frameH, state.imageZoom || 1, state.imageOffsetX || 0, state.imageOffsetY || 0);
      ctx.restore();
    } else {
      drawPlaceholder(ctx, -frameW / 2, -frameH / 2, frameW, frameH, accent, "Upload a photo");
    }

    ctx.strokeStyle = accent;
    ctx.lineWidth = W * 0.0025;
    ctx.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
    ctx.restore();

    const cs = Math.min(W, H) * 0.05;
    const pad = W * 0.02;
    const fx0 = frameX - frameW / 2 - pad, fy0 = frameY - frameH / 2 - pad;
    const fx1 = frameX + frameW / 2 + pad, fy1 = frameY + frameH / 2 + pad;
    ctx.save();
    ctx.globalAlpha = pop;
    ctx.strokeStyle = accent;
    ctx.lineWidth = W * 0.002;
    ctx.beginPath(); ctx.moveTo(fx0, fy0 + cs); ctx.lineTo(fx0, fy0); ctx.lineTo(fx0 + cs, fy0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx1 - cs, fy0); ctx.lineTo(fx1, fy0); ctx.lineTo(fx1, fy0 + cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx0, fy1 - cs); ctx.lineTo(fx0, fy1); ctx.lineTo(fx0 + cs, fy1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx1 - cs, fy1); ctx.lineTo(fx1, fy1); ctx.lineTo(fx1, fy1 - cs); ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.044}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.72 + tdy, W * 0.76, W * 0.064, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.5, 0, 0.2)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.66, 0, 0.15);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.83 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.78, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.89 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawDuotone(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    const accent2 = tpl.accent2 || "#f59e0b";

    if (state.image) {
      ctx.save();
      ctx.filter = "grayscale(1) contrast(1.05)";
      drawImageCover(ctx, state.image, W / 2, H / 2, W, H, state.imageZoom || 1, state.imageOffsetX || 0, state.imageOffsetY || 0);
      ctx.restore();

      const tint = ctx.createLinearGradient(0, 0, W, H);
      tint.addColorStop(0, accent);
      tint.addColorStop(1, accent2);
      ctx.save();
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.75 + tdy, W * 0.78, W * 0.07, "#ffffff", "#fef08a",
      titleOpts(t, textAnim, () => stagger(t, 0, 0.15, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.5, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || "#ffffff";
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.86 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.68, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.93 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawCircle(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const r = W * 0.28;
    const cx = W / 2;
    const cy = H * 0.34;
    const pop = stagger(t, 0, 0.08, 0, 0.3);

    ctx.save();
    ctx.globalAlpha = pop;
    ctx.translate(cx, cy);
    ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    if (state.image) {
      drawImageCover(ctx, state.image, 0, 0, r * 2, r * 2, state.imageZoom || 1, state.imageOffsetX || 0, state.imageOffsetY || 0);
    } else {
      drawPlaceholder(ctx, -r, -r, r * 2, r * 2, accent, "");
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = W * 0.003;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.7 + tdy, W * 0.76, W * 0.068, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.45, 0, 0.25)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.6, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.81 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.75, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.88 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawRideOrDie(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    const accent2 = tpl.accent2 || "#ffd166";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawConfetti(ctx, W, H, t, [accent, accent2, "#ff9776"], 14, 55);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.45 + tdy, W * 0.76, W * 0.07, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.14, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.5, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.58 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.7, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.7);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.66 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawLettingGo(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const dur = durSec || ANIM_SECONDS;
    const flightT = (t * dur % dur) / dur;
    const px = W * (0.15 + flightT * 0.6);
    const py = H * (0.84 - flightT * 0.58);
    ctx.save();
    ctx.globalAlpha = 0.5 * Math.sin(Math.PI * Math.min(1, flightT * 1.15));
    ctx.font = `${W * 0.045}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.translate(px, py);
    ctx.rotate(-0.4);
    ctx.fillText("✈", 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.76, W * 0.07, tpl.textColor, accent,
      titleOpts(t, textAnim, (idx) => stagger(t, idx, 0.12, 0.2, 0.25)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.55, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.6 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.72, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.68 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawCosmicDiary(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawConstellation(ctx, W, H, t, accent, 7, 77, durSec);

    const ringP = stagger(t, 0, 0.05, 0, 0.3);
    if (ringP > 0) {
      ctx.save();
      ctx.globalAlpha = ringP * 0.12;
      ctx.strokeStyle = accent;
      ctx.lineWidth = W * 0.0015;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.46, W * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const r1 = W * 0.34, r2 = W * 0.355;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(ang) * r1, H * 0.46 + Math.sin(ang) * r1);
        ctx.lineTo(W / 2 + Math.cos(ang) * r2, H * 0.46 + Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.05}px 'Playfair Display', serif`;
    drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.46 + tdy, W * 0.74, W * 0.07, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.2, 0, 0.3)));

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.55, 0, 0.2);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, H * 0.6 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.72, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.fillText(state.handle, W / 2 + tdx, H * 0.68 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawNotesApp(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "left";
    ctx.font = `600 ${W * 0.024}px 'DM Sans', sans-serif`;
    ctx.fillStyle = tpl.textColor;
    ctx.fillText("9:41", W * 0.08, H * 0.055);
    ctx.textAlign = "right";
    ctx.fillText("100%", W * 0.92, H * 0.055);

    ctx.textAlign = "left";
    ctx.font = `400 ${W * 0.026}px 'DM Sans', sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText("‹ Notes", W * 0.06, H * 0.11);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.13);
    ctx.lineTo(W, H * 0.13);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.font = `500 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(242,242,247,0.4)";
    ctx.fillText(formatToday() + " · 2:14 AM", W * 0.08, H * 0.185);

    const leftX = W * 0.08 + tdx;
    const maxWidth = W * 0.84;
    const lineHeight = W * 0.066;
    const startY = H * 0.28 + tdy;
    ctx.font = `400 ${W * 0.044}px 'DM Sans', sans-serif`;

    if (textAnim === "typewriter") {
      const lines = buildEmphLines(ctx, state.title, maxWidth);
      const typeProgress = Math.max(0, Math.min(1, (t - 0.05) / 0.55));
      const totalChars = lines.reduce((sum, line) => sum + lineCharCount(line) + 1, 0);
      let remaining = Math.round(typeProgress * totalChars);
      lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        const lineTotal = lineCharCount(line);
        if (remaining <= 0) return;
        const showThisLine = Math.min(remaining, lineTotal);
        drawEmphLineTypewriter(ctx, line.words, leftX, y, tpl.textColor, accent, showThisLine, "left");
        remaining -= lineTotal + 1;
      });
    } else {
      const lines = buildEmphLines(ctx, state.title, maxWidth);
      const progress = stagger(t, 0, 0.15, 0, 0.3);
      ctx.globalAlpha = progress;
      lines.forEach((line, i) => {
        drawEmphLineLeft(ctx, line.words, leftX, startY + i * lineHeight, tpl.textColor, accent);
      });
      ctx.globalAlpha = 1;
    }

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.55, 0, 0.2);
      ctx.textAlign = "left";
      ctx.font = `400 ${W * 0.024}px 'DM Sans', sans-serif`;
      ctx.fillStyle = "rgba(242,242,247,0.6)";
      ctx.fillText(state.subtitle, leftX, H * 0.62 + tdy);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = stagger(t, 0, 0.72, 0, 0.15);
    ctx.textAlign = "left";
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "rgba(242,242,247,0.35)";
    ctx.fillText(state.handle, leftX, H * 0.9 + tdy);
    ctx.globalAlpha = 1;
  }

  function drawQuoteClassic(ctx, W, H, tpl, state, t, durSec, textAnim) {
    const bg = state.bgColor || tpl.bg;
    const accent = state.accentColor || tpl.accent;
    const tdx = (state.textOffsetX || 0) * W;
    const tdy = (state.textOffsetY || 0) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.font = `italic 400 ${W * 0.062}px 'Playfair Display', serif`;
    const titleH = drawMultilineEmph(ctx, state.title, W / 2 + tdx, H * 0.44 + tdy, W * 0.72, W * 0.086, tpl.textColor, accent,
      titleOpts(t, textAnim, () => stagger(t, 0, 0.1, 0, 0.35)));

    let cursorY = H * 0.44 + tdy + titleH / 2 + H * 0.05;

    const ruleP = stagger(t, 0, 0.5, 0, 0.2);
    if (ruleP > 0) {
      ctx.save();
      ctx.globalAlpha = ruleP;
      ctx.strokeStyle = accent;
      ctx.lineWidth = W * 0.0018;
      ctx.beginPath();
      ctx.moveTo(W / 2 - W * 0.035 + tdx, cursorY);
      ctx.lineTo(W / 2 + W * 0.035 + tdx, cursorY);
      ctx.stroke();
      ctx.restore();
    }
    cursorY += H * 0.04;

    if (state.subtitle) {
      ctx.globalAlpha = stagger(t, 0, 0.58, 0, 0.15);
      ctx.font = `italic 400 ${W * 0.026}px 'DM Sans', sans-serif`;
      ctx.fillStyle = state.subtitleColor || tpl.subtitleColor || accent;
      ctx.fillText(state.subtitle, W / 2 + tdx, cursorY);
      ctx.globalAlpha = 1;
      cursorY += H * 0.045;
    }

    ctx.globalAlpha = stagger(t, 0, 0.7, 0, 0.15);
    ctx.font = `600 ${W * 0.02}px 'DM Sans', sans-serif`;
    ctx.fillStyle = rgba(accent, 0.6);
    ctx.fillText(state.handle, W / 2 + tdx, cursorY);
    ctx.globalAlpha = 1;
  }

  const STYLE_RENDERERS = {
    "kdrama-fade": drawKdramaFade,
    "kdrama-petals": drawKdramaPetals,
    "kdrama-cine": drawKdramaCine,
    "love-pop": drawLovePop,
    "love-particles": drawLoveParticles,
    "love-cine": drawLoveCine,
    "conf-fade": drawConfFade,
    "conf-stars": drawConfStars,
    "conf-cine": drawConfCine,
    journal: drawJournal,
    neon: drawNeon,
    golden: drawGolden,
    ocean: drawOcean,
    cherry: drawCherry,
    polaroid: drawPolaroid,
    aurora: drawAurora,
    "full-bleed": drawFullBleed,
    framed: drawFramed,
    duotone: drawDuotone,
    circle: drawCircle,
    "ride-or-die": drawRideOrDie,
    "letting-go": drawLettingGo,
    "cosmic-diary": drawCosmicDiary,
    "notes-app": drawNotesApp,
    "quote-classic": drawQuoteClassic,
  };

  // User-added photo layers, drawn on top of everything the template itself
  // draws. Each layer's x/y is its center as a 0..1 fraction of W/H, width
  // is a 0..1 fraction of W, and aspect is the image's height/width ratio
  // (captured once when the image loads so layers don't need to re-derive
  // it every frame).
  function drawFreeImages(ctx, W, H, images) {
    (images || []).forEach((layer) => {
      if (!layer.img) return;
      const w = layer.width * W;
      const h = w * layer.aspect;
      ctx.drawImage(layer.img, layer.x * W - w / 2, layer.y * H - h / 2, w, h);
    });
  }

  window.PS_render = function (ctx, template, state, t, durationSec, textAnim, elementsTimeSec) {
    const W = template.width;
    const H = template.height;
    const fn = STYLE_RENDERERS[template.style] || drawKdramaFade;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
    // t is animation progress; default to 1 (fully revealed) for static
    // renders like PNG export and thumbnails. Only the video/preview
    // animation loops intentionally pass small t values near 0.
    fn(ctx, W, H, template, state, t == null ? 1 : t, durationSec || ANIM_SECONDS, textAnim || "default");
    drawFreeImages(ctx, W, H, state.images);
    // elementsTimeSec drives idle element animation (spinning vinyl, EQ
    // bars, twinkling sparkles, ...); omit it to fall back to wall-clock
    // time (live preview), or pass an explicit clip-relative time during
    // MP4 export so motion is smooth regardless of capture speed.
    if (window.PS_drawElements) window.PS_drawElements(ctx, W, H, state.elements, elementsTimeSec);
  };

  window.PS_defaultState = function (template) {
    return {
      title: template.defaults.title,
      subtitle: template.defaults.subtitle,
      handle: template.defaults.handle,
      kicker: template.defaults.kicker || "",
      bgColor: null,
      accentColor: null,
      subtitleColor: null,
      image: null,
      imageZoom: 1,
      imageOffsetX: 0,
      imageOffsetY: 0,
      textOffsetX: 0,
      textOffsetY: 0,
      images: [],
      elements: [],
    };
  };
})();
