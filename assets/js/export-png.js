/* Pearl Studio — PNG export + shared download helper */

(function () {
  window.PS_downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // Renders a fresh static (t=0) frame at full template resolution and
  // triggers a PNG download. Does not touch the live preview canvas.
  window.PS_exportPNG = async function (template, state, filename) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d");
    window.PS_render(ctx, template, state, 1);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("PNG export failed"));
        window.PS_downloadBlob(blob, filename);
        resolve(blob);
      }, "image/png");
    });
  };
})();
