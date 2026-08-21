// Expands/collapses the hero's extra feature chips - starts collapsed so
// the hero stays compact, with the full list one click away.
const toggle = document.getElementById("features-toggle");
const extras = document.querySelectorAll(".feature-chip-extra");
const collapsedLabel = toggle.textContent;

let expanded = false;
toggle.addEventListener("click", () => {
  expanded = !expanded;
  extras.forEach((chip) => chip.classList.toggle("is-hidden", !expanded));
  toggle.textContent = expanded ? "Show fewer" : collapsedLabel;
});
