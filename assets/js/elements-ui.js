/* Pearl Studio — shared "Elements" panel wiring.
   Builds the add-on catalogue (click to add) and the per-added-element
   editor list (text/color/size/rotation/delete). Used identically by
   editor.js (caption templates) and reels.js (Song Reels); each page
   supplies its own state accessors. */

window.PS_buildElementsPanel = function (opts) {
  const { catalogEl, listEl, getElements, addElement, removeElement, onChange } = opts;

  function findCatalogItem(type, variant) {
    for (const group of window.PS_ELEMENT_CATALOG) {
      const item = group.items.find((it) => it.type === type && it.variant === variant);
      if (item) return item;
    }
    return null;
  }

  function renderCatalog() {
    catalogEl.innerHTML = "";
    window.PS_ELEMENT_CATALOG.forEach((group) => {
      const heading = document.createElement("div");
      heading.className = "family-label";
      heading.textContent = group.category;
      catalogEl.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "element-catalog-grid";
      group.items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "element-catalog-btn";
        btn.title = "Add " + item.name;

        const canvas = document.createElement("canvas");
        const aspect = window.PS_ELEMENT_ASPECT[item.type + ":" + item.variant] || 1;
        canvas.width = 160;
        canvas.height = Math.max(60, Math.round(160 * aspect));
        const ctx = canvas.getContext("2d");
        const preview = Object.assign(window.PS_defaultElement(item.type, item.variant, "preview"), {
          x: 0.5,
          y: 0.5,
          width: 0.94,
          rotation: 0,
        });
        window.PS_drawElements(ctx, canvas.width, canvas.height, [preview]);
        btn.appendChild(canvas);

        const label = document.createElement("span");
        label.textContent = item.name;
        btn.appendChild(label);

        btn.addEventListener("click", () => {
          addElement(item.type, item.variant);
          renderList();
          onChange();
        });
        grid.appendChild(btn);
      });
      catalogEl.appendChild(grid);
    });
  }

  function renderList() {
    listEl.innerHTML = "";
    getElements().forEach((elDef) => {
      const item = findCatalogItem(elDef.type, elDef.variant);
      const row = document.createElement("div");
      row.className = "layer-row element-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = (item && item.name) || elDef.type;
      row.appendChild(name);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        removeElement(elDef.id);
        renderList();
        onChange();
      });
      row.appendChild(removeBtn);

      if (elDef.text !== undefined) {
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.value = elDef.text;
        textInput.placeholder = "Text";
        textInput.addEventListener("input", () => {
          elDef.text = textInput.value;
          onChange();
        });
        row.appendChild(textInput);
      }
      if (elDef.text2 !== undefined) {
        const text2Input = document.createElement("input");
        text2Input.type = "text";
        text2Input.value = elDef.text2;
        text2Input.placeholder = "Second line";
        text2Input.addEventListener("input", () => {
          elDef.text2 = text2Input.value;
          onChange();
        });
        row.appendChild(text2Input);
      }

      const controls = document.createElement("div");
      controls.className = "element-row-controls";

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.title = "Color";
      colorInput.value = elDef.color;
      colorInput.addEventListener("input", () => {
        elDef.color = colorInput.value;
        onChange();
      });
      controls.appendChild(colorInput);

      const sizeInput = document.createElement("input");
      sizeInput.type = "range";
      sizeInput.title = "Size";
      sizeInput.min = "0.08";
      sizeInput.max = "0.95";
      sizeInput.step = "0.01";
      sizeInput.value = elDef.width;
      sizeInput.addEventListener("input", () => {
        elDef.width = parseFloat(sizeInput.value) || elDef.width;
        onChange();
      });
      controls.appendChild(sizeInput);

      const rotInput = document.createElement("input");
      rotInput.type = "range";
      rotInput.title = "Rotation";
      rotInput.min = "-45";
      rotInput.max = "45";
      rotInput.step = "1";
      rotInput.value = elDef.rotation || 0;
      rotInput.addEventListener("input", () => {
        elDef.rotation = parseFloat(rotInput.value) || 0;
        onChange();
      });
      controls.appendChild(rotInput);

      row.appendChild(controls);
      listEl.appendChild(row);
    });
  }

  renderCatalog();
  renderList();

  return { renderList };
};
