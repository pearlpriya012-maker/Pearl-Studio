/* Pearl Studio — song reel export (canvas video + real audio track)
 *
 * Unlike export-video.js (silent, canvas-only), this combines a canvas
 * video stream with an actual audio track: the song is decoded through the
 * Web Audio API into a MediaStreamAudioDestinationNode, merged with the
 * canvas's captureStream(), and recorded together with MediaRecorder. The
 * draw loop is driven by the audio element's own currentTime rather than a
 * synthetic timer, so lyric timing can't drift out of sync with playback.
 *
 * Falls back to the same webm->mp4 ffmpeg.wasm transcode as export-video.js
 * when the browser can't record video/mp4 directly.
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

  async function transcodeToMp4(webmBlob, onProgress) {
    if (!window.FFmpeg) {
      await loadScript(FFMPEG_JS);
    }
    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const ffmpeg = createFFmpeg({ log: false, corePath: FFMPEG_CORE });
    ffmpeg.setProgress(({ ratio }) => {
      if (onProgress && ratio >= 0) onProgress(0.65 + Math.min(1, ratio) * 0.35);
    });
    await ffmpeg.load();
    ffmpeg.FS("writeFile", "input.webm", await fetchFile(webmBlob));
    await ffmpeg.run(
      "-i", "input.webm",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "output.mp4"
    );
    const data = ffmpeg.FS("readFile", "output.mp4");
    return new Blob([data.buffer], { type: "video/mp4" });
  }

  function pickMimeType() {
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const type of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }

  // Records the clip range from a fresh <audio> element (never the live
  // preview element — createMediaElementSource can only be attached once
  // per element, and export may be run more than once per session).
  function recordReel(reel, sourceAudioUrl, mimeType, onProgress) {
    return new Promise((resolve, reject) => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        reject(new Error("This browser does not support the Web Audio API needed to export audio."));
        return;
      }

      const W = window.PS_REEL_FORMAT.width;
      const H = window.PS_REEL_FORMAT.height;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      const clipStart = reel.clipStart || 0;
      const clipEnd = reel.clipEnd || reel.audioDuration || clipStart + 1;
      const duration = Math.max(0.5, clipEnd - clipStart);

      const audioCtx = new Ctx();
      const exportAudio = document.createElement("audio");
      exportAudio.src = sourceAudioUrl;

      const cleanup = () => {
        try {
          exportAudio.pause();
        } catch (err) {
          // ignore
        }
        audioCtx.close().catch(() => {});
      };

      exportAudio.addEventListener(
        "error",
        () => {
          cleanup();
          reject(new Error("Could not reload the audio file for export."));
        },
        { once: true }
      );

      exportAudio.addEventListener(
        "loadedmetadata",
        () => {
          let srcNode, dest, recorder;
          try {
            srcNode = audioCtx.createMediaElementSource(exportAudio);
            dest = audioCtx.createMediaStreamDestination();
            srcNode.connect(dest);

            const videoStream = canvas.captureStream(30);
            const combined = new MediaStream([
              ...videoStream.getVideoTracks(),
              ...dest.stream.getAudioTracks(),
            ]);
            recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 10_000_000 });
          } catch (err) {
            cleanup();
            reject(err);
            return;
          }

          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onerror = (e) => {
            cleanup();
            reject(e.error || new Error("Recording failed"));
          };
          recorder.onstop = () => {
            cleanup();
            resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
          };

          exportAudio.currentTime = clipStart;

          function drawFrame() {
            const t = exportAudio.currentTime;
            window.PS_renderReel(ctx, reel, t);
            if (onProgress) onProgress(Math.min(0.6, Math.max(0, (t - clipStart) / duration) * 0.6));
            if (t < clipEnd && !exportAudio.ended) {
              requestAnimationFrame(drawFrame);
            } else {
              setTimeout(() => recorder.stop(), 150);
            }
          }

          exportAudio
            .play()
            .then(() => {
              recorder.start();
              requestAnimationFrame(drawFrame);
            })
            .catch((err) => {
              cleanup();
              reject(err);
            });
        },
        { once: true }
      );
    });
  }

  // Public entry point.
  // previewAudioEl: the <audio> element already holding the loaded song
  // (its .src is reused; the element itself is never touched).
  window.PS_exportReelMP4 = async function (reel, previewAudioEl, filename, options) {
    const opts = options || {};
    const onStatus = opts.onStatus || function () {};
    const onProgress = opts.onProgress || function () {};

    if (!previewAudioEl || !previewAudioEl.src) {
      throw new Error("No audio loaded.");
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const mimeType = pickMimeType();
    if (!mimeType) throw new Error("This browser does not support video recording.");

    onStatus("Recording…");
    const { blob, mimeType: recordedType } = await recordReel(reel, previewAudioEl.src, mimeType, onProgress);

    let finalBlob = blob;
    if (recordedType.startsWith("video/mp4")) {
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
