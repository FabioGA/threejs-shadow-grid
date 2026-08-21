// Scrollspy for the fixed #section-nav dots: highlights whichever demo
// section is in view. Observes the full-viewport-tall <section> wrappers,
// not their shorter inner content, so short children still register.
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
