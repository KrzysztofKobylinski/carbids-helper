const defaults = {
  shadowed: {},
  opened: {},
  showHidden: false,
};

function countKeys(map) {
  return Object.keys(map || {}).length;
}

async function render() {
  const state = await chrome.storage.local.get(defaults);
  document.getElementById("hidden-count").textContent = String(countKeys(state.shadowed));
  document.getElementById("opened-count").textContent = String(countKeys(state.opened));
  document.getElementById("show-hidden").checked = Boolean(state.showHidden);
}

document.getElementById("show-hidden").addEventListener("change", async (event) => {
  await chrome.storage.local.set({ showHidden: event.target.checked });
  render();
});

document.getElementById("clear-hidden").addEventListener("click", async () => {
  await chrome.storage.local.set({ shadowed: {} });
  render();
});

document.getElementById("clear-opened").addEventListener("click", async () => {
  await chrome.storage.local.set({ opened: {} });
  render();
});

render();
