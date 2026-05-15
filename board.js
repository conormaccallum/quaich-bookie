const { byId, fetchState, formatOdds, currency, escapeHtml } = window.Quaich;

const CATEGORY_ORDER = ["Outright", "Match Bets", "Individual", "Props"];

const state = {
  data: null,
  oddsFormat: "american",
  activeCategory: "Outright",
  selectedMarkets: {},
};

const elements = {
  categoryTabs: byId("category-tabs"),
  boardMarkets: byId("board-markets"),
  oddsToggle: byId("odds-format-toggle"),
};

init();

async function init() {
  bindEvents();
  await reload();
  window.setInterval(reload, 15000);
}

function bindEvents() {
  elements.oddsToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-format]");
    if (!button) {
      return;
    }
    state.oddsFormat = button.dataset.format;
    elements.oddsToggle.querySelectorAll("[data-format]").forEach((entry) => {
      entry.classList.toggle("active", entry.dataset.format === state.oddsFormat);
    });
    render();
  });

  elements.categoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) {
      return;
    }
    state.activeCategory = button.dataset.category;
    render();
  });

  elements.boardMarkets.addEventListener("change", (event) => {
    const select = event.target.closest("[data-market-select]");
    if (!select) {
      return;
    }
    state.selectedMarkets[select.dataset.marketSelect] = select.value;
    render();
  });
}

async function reload() {
  state.data = await fetchState();
  ensureSelections();
  render();
}

function ensureSelections() {
  if (!state.data) {
    return;
  }

  const categories = getMarketsByCategory();
  if (!categories[state.activeCategory]?.length) {
    state.activeCategory = CATEGORY_ORDER.find((category) => categories[category]?.length) || "Outright";
  }

  for (const category of CATEGORY_ORDER) {
    const markets = categories[category];
    if (markets?.length && !state.selectedMarkets[category]) {
      state.selectedMarkets[category] = markets[0].id;
    }
  }
}

function render() {
  if (!state.data) {
    return;
  }

  const marketsByCategory = getMarketsByCategory();

  elements.categoryTabs.innerHTML = CATEGORY_ORDER.map((category) => {
    const marketCount = marketsByCategory[category].length;
    return `
      <button class="category-tab ${state.activeCategory === category ? "active" : ""}" type="button" data-category="${category}">
        <span>${category}</span>
        <small>${marketCount}</small>
      </button>
    `;
  }).join("");

  const activeMarkets = marketsByCategory[state.activeCategory];
  if (!activeMarkets.length) {
    elements.boardMarkets.innerHTML = `
      <div class="empty-state">
        <h3>No markets currently active</h3>
        <p>There are no ${escapeHtml(state.activeCategory)} markets on the board at the moment.</p>
      </div>
    `;
    return;
  }

  const selectedMarketId = state.selectedMarkets[state.activeCategory] || activeMarkets[0].id;
  const selectedMarket = activeMarkets.find((market) => market.id === selectedMarketId) || activeMarkets[0];
  state.selectedMarkets[state.activeCategory] = selectedMarket.id;

  elements.boardMarkets.innerHTML = `
    <article class="market-card">
      <div class="market-card-head">
        <div>
          <p class="panel-kicker">${escapeHtml(state.activeCategory)}</p>
          <h3>${escapeHtml(selectedMarket.name)}</h3>
        </div>
        ${renderMarketChooser(activeMarkets, selectedMarket.id)}
      </div>
      <div class="stack">
        ${selectedMarket.outcomes.map((outcome) => renderOutcomeCard(outcome)).join("")}
      </div>
    </article>
  `;
}

function renderMarketChooser(markets, selectedMarketId) {
  if (markets.length <= 1) {
    return "";
  }

  return `
    <label class="field board-select-field">
      <span>Market</span>
      <select class="board-outcome-select" data-market-select="${state.activeCategory}">
        ${markets
          .map(
            (market) => `
              <option value="${market.id}" ${market.id === selectedMarketId ? "selected" : ""}>${escapeHtml(market.name)}</option>
            `
          )
          .join("")}
      </select>
    </label>
  `;
}

function renderOutcomeCard(outcome) {
  const exposure = state.data.exposureByOutcome.find((entry) => entry.outcomeId === outcome.id);
  const displayOdds = outcome.currentOfferedDecimal ?? outcome.offeredDecimal ?? outcome.baseOfferedDecimal;
  return `
    <div class="market-row market-row-compact">
      <div class="market-row-main">
        <div class="market-outcome-main">
          ${renderTeamBadge(outcome.name)}
          <strong>${escapeHtml(outcome.name)}</strong>
          <p>${exposure?.betCount || 0} bets written</p>
        </div>
        <div class="price-pill">${formatOdds(displayOdds, state.oddsFormat)}</div>
      </div>
      <div class="market-footer">
        <span>${currency(exposure?.totalStaked || 0)} staked</span>
      </div>
      <div class="ticket-list">
        ${
          exposure?.bettors.length
            ? exposure.bettors
                .map(
                  (bettor) => `
                    <div class="ticket-row">
                      <span class="ticket-name">
                        ${renderTeamBadge(bettor.bettorTeam)}
                        ${escapeHtml(bettor.bettorName)}
                      </span>
                      <span>${currency(bettor.stake)} at ${formatOdds(bettor.oddsDecimal, state.oddsFormat)}</span>
                    </div>
                  `
                )
                .join("")
            : `<p class="muted-copy">No bets written on this outcome.</p>`
        }
      </div>
    </div>
  `;
}

function getMarketsByCategory() {
  return Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
      category,
      state.data.markets.filter((market) => (market.category || "Outright") === category),
    ])
  );
}

function renderTeamBadge(label) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("scotland") || normalized.includes("scottish")) {
    return '<span class="team-badge"><span class="team-flag flag-scotland" aria-hidden="true"></span>Scotland</span>';
  }

  if (normalized === "usa" || normalized.includes("america") || normalized.includes("american")) {
    return '<span class="team-badge"><span class="team-flag flag-usa" aria-hidden="true"></span>USA</span>';
  }

  return "";
}
