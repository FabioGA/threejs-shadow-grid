// Generic control-binding helpers (DOM <-> state) plus the dynamic
// weighted-color-palette row editor, which is built on the same helpers.
import { randColor } from "./random.js";
import { scheduleApply } from "./render.js";
import { state } from "./state.js";

export function bindRange(id, key, format) {
  const input = document.getElementById(id);
  const readout = document.getElementById(`${id}-val`);
  const sync = () => {
    const value = Number(input.value);
    state[key] = value;
    if (readout) readout.textContent = format ? format(value) : String(value);
  };
  input.addEventListener("input", () => {
    sync();
    scheduleApply();
  });
  sync();
}

export function bindNumber(id, key) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    if (Number.isNaN(value)) return;
    state[key] = value;
    scheduleApply();
  });
}

export function bindSelect(id, key, onChange) {
  const input = document.getElementById(id);
  input.addEventListener("change", () => {
    state[key] = input.value;
    if (onChange) onChange(input.value);
    scheduleApply();
  });
}

export function bindCheckbox(id, key) {
  const input = document.getElementById(id);
  input.addEventListener("change", () => {
    state[key] = input.checked;
    scheduleApply();
  });
}

export function bindColor(id, key) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    state[key] = input.value;
    scheduleApply();
  });
}

export function toggleSubgroup(mode, activeValue, activeId, inactiveId) {
  document.getElementById(activeId).classList.toggle("active", mode === activeValue);
  document.getElementById(inactiveId).classList.toggle("active", mode !== activeValue);
}

/** Rebuilds the weighted-color-palette rows from `state.colorPalette`/`colorWeights` - any length, not just a fixed count. */
export function renderColorPaletteRows() {
  const container = document.getElementById("colorPaletteRows");
  container.innerHTML = "";

  state.colorPalette.forEach((color, i) => {
    const row = document.createElement("div");
    row.className = "field palette-row";

    const label = document.createElement("label");
    label.textContent = i === 0 ? "color / weight" : "";
    row.appendChild(label);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = color;
    colorInput.addEventListener("input", (e) => {
      state.colorPalette[i] = e.target.value;
      scheduleApply();
    });
    row.appendChild(colorInput);

    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.className = "weight";
    weightInput.min = "0";
    weightInput.step = "1";
    weightInput.value = state.colorWeights[i];
    weightInput.addEventListener("input", (e) => {
      const value = Number(e.target.value);
      if (Number.isNaN(value)) return;
      state.colorWeights[i] = value;
      scheduleApply();
    });
    row.appendChild(weightInput);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-color-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove color";
    removeBtn.disabled = state.colorPalette.length <= 1;
    removeBtn.addEventListener("click", () => {
      if (state.colorPalette.length <= 1) return;
      state.colorPalette.splice(i, 1);
      state.colorWeights.splice(i, 1);
      renderColorPaletteRows();
      scheduleApply();
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  });
}

document.getElementById("add-color-btn").addEventListener("click", () => {
  state.colorPalette.push(randColor());
  state.colorWeights.push(10);
  renderColorPaletteRows();
  scheduleApply();
});
