// Lightweight scrollspy for the fixed #section-nav dots: highlights whichever
// of the two demo sections (full-page background / contained box) is
// currently in view, so the dots double as both a "there's more below" cue
// and a jump-to-section shortcut.
// Observes the full-viewport-tall <section> wrappers (not the shorter
// content inside them, e.g. the compact hero card) - a short child can sit
// entirely outside the shrunk middle band below and never register.
const sections = document.querySelectorAll("section.section[id]");
const dots = document.querySelectorAll("#section-nav .section-nav-dot");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      dots.forEach((dot) => dot.classList.toggle("active", dot.dataset.section === entry.target.id));
    });
  },
  { rootMargin: "-45% 0px -45% 0px" }
);

sections.forEach((section) => observer.observe(section));
