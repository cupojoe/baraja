const tabGroups = document.querySelectorAll("[data-tabs]");

tabGroups.forEach((group) => {
  const buttons = group.querySelectorAll("[data-tab]");
  const panels = group.querySelectorAll("[data-panel]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.tab;

      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.panel === selected);
      });
    });
  });
});
