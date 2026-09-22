/* Pearl Studio — MP4 export
 *
 * Strategy: render the template's built-in animation to an offscreen
 * canvas in real time, capture it with MediaRecorder, then:
 *  - if the browser can record 'video/mp4' directly (Safari), use that
 *  - otherwise record 'video/webm' and transcode to .mp4 client-side with
 *    ffmpeg.wasm (loaded lazily from a CDN, only when needed)
 *
 * Everything happens in the browser so this works on a static GitHub
 * Pages host with no backend.
 */

(function () {
  const FFMPEG_JS = "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
  const FFMPEG_CORE = "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve);
        if (existing.dataset.loaded) resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function pickMimeType() {
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const type of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }

  // Records the template's animation loop for `duration` seconds and
  // resolves with a raw Blob (mp4 if the browser supports it natively,
  // otherwise webm).
  async function recordAnimation(template, state, { duration, fps, textAnim, onProgress }) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return new Promise((resolve, reject) => {
      const mimeType = pickMimeType();
      if (!mimeType) {
        reject(new Error("This browser does not support video recording."));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = template.width;
      canvas.height = template.height;
      const ctx = canvas.getContext("2d");

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 10_000_000,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = (e) => reject(e.error || new Error("Recording failed"));
      recorder.onstop = () => {
        resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
      };

      window.PS_render(ctx, template, state, 0, duration, textAnim, 0);
      recorder.start();

      const startTime = performance.now();
      function loop(now) {
        const t = Math.min(1, (now - startTime) / (duration * 1000));
        window.PS_render(ctx, template, state, t, duration, textAnim, t * duration);
        if (onProgress) onProgress(Math.min(0.7, t * 0.7));
        if (t < 1) {
          requestAnimationFrame(loop);
        } else {
          // Hold the final frame briefly so the recorder flushes it.
          setTimeout(() => recorder.stop(), 150);
        }
      }
      requestAnimationFrame(loop);
    });
  }

  async function transcodeToMp4(webmBlob, onProgress) {
    if (!window.FFmpeg) {
      await loadScript(FFMPEG_JS);
    }
    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const ffmpeg = createFFmpeg({ log: false, corePath: FFMPEG_CORE });
    ffmpeg.setProgress(({ ratio }) => {
      if (onProgress && ratio >= 0) onProgress(0.7 + Math.min(1, ratio) * 0.3);
    });
    await ffmpeg.load();
    ffmpeg.FS("writeFile", "input.webm", await fetchFile(webmBlob));
    await ffmpeg.run(
      "-i", "input.webm",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "output.mp4"
    );
    const data = ffmpeg.FS("readFile", "output.mp4");
    return new Blob([data.buffer], { type: "video/mp4" });
  }

  // Public entry point.
  // options: { duration=3.2, fps=30, textAnim="default", onProgress(0..1), onStatus(text) }
  window.PS_exportMP4 = async function (template, state, filename, options) {
    const opts = options || {};
    const duration = opts.duration || 3.2;
    const fps = opts.fps || 30;
    const textAnim = opts.textAnim || "default";
    const onProgress = opts.onProgress || function () {};
    const onStatus = opts.onStatus || function () {};

    onStatus("Rendering animation…");
    const { blob, mimeType } = await recordAnimation(template, state, {
      duration,
      fps,
      textAnim,
      onProgress,
    });

    let finalBlob = blob;
    if (mimeType.startsWith("video/mp4")) {
      onProgress(1);
    } else {
      onStatus("Converting to MP4…");
      finalBlob = await transcodeToMp4(blob, onProgress);
      onProgress(1);
    }

    onStatus("Done");
    window.PS_downloadBlob(finalBlob, filename);
    return finalBlob;
  };
})();
