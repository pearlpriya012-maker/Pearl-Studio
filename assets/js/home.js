/* Pearl Studio — landing page template gallery */

(function () {
  const tabsEl = document.getElementById("formatTabs");
  const gridEl = document.getElementById("templateGrid");
  if (!tabsEl || !gridEl) return;

  let activeFormat = "post";

  function renderThumb(canvas, template) {
    const scale = 0.28;
    canvas.width = Math.round(template.width * scale);
    canvas.height = Math.round(template.height * scale);
    const ctx = canvas.getContext("2d");
    const state = window.PS_defaultState(template);
    const thumbTemplate = Object.assign({}, template, {
      width: canvas.width,
      height: canvas.height,
    });
    window.PS_render(ctx, thumbTemplate, state, 1);
  }

  function buildGrid() {
    gridEl.innerHTML = "";
    const templates = window.PS_TEMPLATES.filter((t) => t.format === activeFormat);
    const families = window.PS_FAMILIES.filter((fam) => templates.some((t) => t.family === fam));

    families.forEach((fam) => {
      const group = document.createElement("div");
      group.className = "template-family";

      const heading = document.createElement("h3");
      heading.className = "family-heading";
      heading.textContent = fam;
      group.appendChild(heading);

      const row = document.createElement("div");
      row.className = "template-grid";
      templates.filter((t) => t.family === fam).forEach((tpl) => {
        const card = document.createElement("a");
        card.className = "template-card";
        card.href = `editor.html?template=${tpl.id}`;

        const canvas = document.createElement("canvas");
        card.appendChild(canvas);

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.innerHTML = `<span class="name">${tpl.name}</span><span class="fmt">${window.PS_FORMATS[tpl.format].label}</span>`;
        card.appendChild(meta);

        row.appendChild(card);
        renderThumb(canvas, tpl);
      });
      group.appendChild(row);
      gridEl.appendChild(group);
    });
  }

  function buildTabs() {
    tabsEl.innerHTML = "";
    Object.keys(window.PS_FORMATS).forEach((fmt) => {
      const btn = document.createElement("button");
      btn.className = "format-tab" + (fmt === activeFormat ? " active" : "");
      btn.textContent = window.PS_FORMATS[fmt].label;
      btn.addEventListener("click", () => {
        activeFormat = fmt;
        buildTabs();
        buildGrid();
      });
      tabsEl.appendChild(btn);
    });
  }

  buildTabs();
  buildGrid();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(buildGrid);
  }
})();
