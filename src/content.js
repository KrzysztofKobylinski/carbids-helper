const STORAGE_DEFAULTS = {
  shadowed: {},
  opened: {},
  showHidden: false,
};

const ICONS = {
  shadow:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/><path d="M3 13 13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  opened:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="m5 8.1 2 2.1 4-4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

let state = { ...STORAGE_DEFAULTS };
let scanTimer = 0;
let autoMarkedLotId = null;

function lotIdFromString(value) {
  const match = String(value || "").match(/(\d+-\d+)/);
  return match ? match[1] : null;
}

function countKeys(map) {
  return Object.keys(map || {}).length;
}

async function loadState() {
  state = await chrome.storage.local.get(STORAGE_DEFAULTS);
  applyShowHiddenClass();
}

function applyShowHiddenClass() {
  const on = Boolean(state.showHidden);
  document.documentElement.classList.toggle("carbids-show-hidden", on);
  document.body.classList.toggle("carbids-show-hidden", on);
}

function persist(partial) {
  Object.assign(state, partial);
  applyShowHiddenClass();
  return chrome.storage.local.set(partial);
}

function isShadowed(lotId) {
  return Boolean(state.shadowed[lotId]);
}

function isOpened(lotId) {
  return Boolean(state.opened[lotId]);
}

async function toggleShadow(lotId) {
  const shadowed = { ...state.shadowed };
  if (shadowed[lotId]) delete shadowed[lotId];
  else shadowed[lotId] = Date.now();
  await persist({ shadowed });
  refresh();
}

async function toggleOpened(lotId) {
  const opened = { ...state.opened };
  if (opened[lotId]) delete opened[lotId];
  else opened[lotId] = Date.now();
  await persist({ opened });
  refresh();
}

async function markOpened(lotId) {
  if (!lotId || state.opened[lotId]) return;
  await persist({ opened: { ...state.opened, [lotId]: Date.now() } });
  refresh();
}

function listingCards() {
  return [...document.querySelectorAll(".item-horizontal.lots-search, .lots-search[id]")];
}

function applyCardState(card, lotId) {
  card.classList.toggle("carbids-shadowed", isShadowed(lotId));
  card.classList.toggle("carbids-opened", isOpened(lotId));
}

function actionLabel(action, lotId) {
  if (action === "shadow") return isShadowed(lotId) ? "Show listing" : "Hide listing";
  return isOpened(lotId) ? "Opened" : "Mark opened";
}

function setButtonState(root, lotId) {
  root.querySelectorAll("[data-carbids-action]").forEach((button) => {
    const action = button.dataset.carbidsAction;
    const active = action === "shadow" ? isShadowed(lotId) : isOpened(lotId);
    const label = actionLabel(action, lotId);
    button.classList.toggle("is-active", active);
    button.title = action === "opened" && active ? "Mark as not opened" : label;
    button.setAttribute("aria-label", button.title);
    const text = button.querySelector("span");
    if (text) text.textContent = label;
  });
}

function makeButton(action, lotId, withLabel) {
  const button = document.createElement("a");
  button.href = "#";
  button.className = withLabel ? "carbids-lot-btn" : "carbids-btn";
  button.dataset.carbidsAction = action;
  button.dataset.lot = lotId;
  button.innerHTML = withLabel ? `${ICONS[action]}<span></span>` : ICONS[action];
  return button;
}

function injectListingButtons(card) {
  const lotId = lotIdFromString(card.id) || lotIdFromString(card.querySelector("a[data-lot]")?.getAttribute("data-lot"));
  if (!lotId) return;

  applyCardState(card, lotId);

  const chooseItem = card.querySelector(".choose-item");
  if (!chooseItem || chooseItem.parentElement?.querySelector(":scope > .carbids-actions")) {
    const existing = card.querySelector(".carbids-actions");
    if (existing) setButtonState(existing, lotId);
    return;
  }

  const actions = document.createElement("div");
  actions.className = "carbids-actions";
  actions.append(makeButton("opened", lotId, false), makeButton("shadow", lotId, false));
  chooseItem.insertAdjacentElement("afterend", actions);
  setButtonState(actions, lotId);
}

function currentLotIdFromUrl() {
  return lotIdFromString(location.pathname.startsWith("/") && /\/lot\//.test(location.pathname) ? location.pathname : "");
}

function injectLotPageButtons(lotId) {
  const chooseItem = document.querySelector(".right-side .choose-item");
  if (!chooseItem) return;

  let actions = chooseItem.parentElement.querySelector(":scope > .carbids-lot-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "carbids-lot-actions";
    actions.append(makeButton("opened", lotId, true), makeButton("shadow", lotId, true));
    chooseItem.insertAdjacentElement("afterend", actions);
  }

  setButtonState(actions, lotId);
}

function renderToolbar() {
  const searchArea = document.querySelector("#search_area");
  if (!searchArea) {
    document.querySelector(".carbids-toolbar")?.remove();
    return;
  }

  let toolbar = document.querySelector(".carbids-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "carbids-toolbar";
    toolbar.innerHTML = `
      <strong>bid.cars Helper</strong>
      <span data-carbids-hidden-count></span>
      <button type="button" class="carbids-toolbar-btn" data-carbids-show-hidden></button>
      <span data-carbids-opened-count></span>
    `;
    searchArea.insertAdjacentElement("beforebegin", toolbar);
  }

  const hiddenOnPage = listingCards().filter((card) => isShadowed(lotIdFromString(card.id))).length;
  const hiddenCount = toolbar.querySelector("[data-carbids-hidden-count]");
  const openedCount = toolbar.querySelector("[data-carbids-opened-count]");
  const button = toolbar.querySelector("[data-carbids-show-hidden]");
  hiddenCount.textContent = `${hiddenOnPage} hidden on this page · ${countKeys(state.shadowed)} total`;
  openedCount.textContent = `${countKeys(state.opened)} opened`;
  button.textContent = state.showHidden ? "Hide shadowed" : "Show shadowed";
  button.classList.toggle("is-on", Boolean(state.showHidden));
}

function refresh() {
  listingCards().forEach((card) => {
    const lotId = lotIdFromString(card.id);
    if (!lotId) return;
    applyCardState(card, lotId);
    const actions = card.querySelector(".carbids-actions");
    if (actions) setButtonState(actions, lotId);
  });

  const lotId = currentLotIdFromUrl();
  if (lotId) injectLotPageButtons(lotId);
  renderToolbar();
}

function scan() {
  listingCards().forEach(injectListingButtons);

  const lotId = currentLotIdFromUrl();
  if (lotId) {
    if (autoMarkedLotId !== lotId) {
      autoMarkedLotId = lotId;
      void markOpened(lotId);
    }
    injectLotPageButtons(lotId);
  }

  renderToolbar();
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scan, 80);
}

document.addEventListener(
  "click",
  (event) => {
    const helperButton = event.target.closest("[data-carbids-action]");
    if (helperButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const lotId = helperButton.dataset.lot;
      if (!lotId) return;
      if (helperButton.dataset.carbidsAction === "shadow") void toggleShadow(lotId);
      else void toggleOpened(lotId);
      return;
    }

    const showHiddenButton = event.target.closest("[data-carbids-show-hidden]");
    if (showHiddenButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void persist({ showHidden: !state.showHidden }).then(refresh);
      return;
    }

    const lotLink = event.target.closest('a[href*="/lot/"]');
    if (!lotLink || lotLink.closest("[data-carbids-action]")) return;
    const lotId = lotIdFromString(lotLink.href);
    if (lotId) void markOpened(lotId);
  },
  true,
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in STORAGE_DEFAULTS) state[key] = newValue ?? STORAGE_DEFAULTS[key];
  }
  applyShowHiddenClass();
  refresh();
});

function isHelperNode(node) {
  return Boolean(
    node?.closest?.(
      ".carbids-toolbar, .carbids-actions, .carbids-lot-actions, .carbids-btn, .carbids-lot-btn",
    ),
  );
}

const observer = new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) => {
    if (isHelperNode(mutation.target)) return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isHelperNode(node));
  });
  if (relevant) scheduleScan();
});
observer.observe(document.body, { childList: true, subtree: true });

loadState().then(scan);
