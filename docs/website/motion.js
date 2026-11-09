const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  const header = document.querySelector(".top");
  const progress = document.createElement("div");
  progress.className = "landing-progress";
  progress.setAttribute("aria-hidden", "true");
  header.append(progress);

  let progressFrame = 0;
  function updateProgress() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const fraction = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    progress.style.transform = `scaleX(${fraction})`;
    progressFrame = 0;
  }

  function scheduleProgress() {
    if (!progressFrame) progressFrame = window.requestAnimationFrame(updateProgress);
  }

  window.addEventListener("scroll", scheduleProgress, { passive: true });
  window.addEventListener("resize", scheduleProgress);
  window.addEventListener("pageshow", scheduleProgress);
  updateProgress();

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target.closest("section");
        if (section && section.id !== window.location.hash.slice(1)) {
          entry.target.classList.add("landing-enter");
        }
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });

    const targets = document.querySelectorAll(
      ".landing .hero, .pipeline-page main > section, " +
      ".landing .section :is(.eyebrow, h2, .lede, .story-copy, .story-note, .panel, .actions, .split > a)"
    );
    targets.forEach(target => observer.observe(target));
  }
}
