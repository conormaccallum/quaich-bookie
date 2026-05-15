const { byId, fetchState, formatOdds, currency, escapeHtml } = window.Quaich;

const CATEGORY_ORDER = ["Outright", "Match Bets", "Individual", "Props"];

const state = {
  data: null,
  oddsFormat: "american",
  activeCategory: "Outright",
  selectedMarkets: {},
  selectedOutcomes: {},
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
    if (select) {
      state.selectedMarkets[select.dataset.marketSelect] = select.value;
      render();
      return;
    }

    const outcomeSelect = event.target.closest("[data-outcome-select]");
    if (!outcomeSelect) {
      return;
    }
    state.selectedOutcomes[outcomeSelect.dataset.outcomeSelect] = outcomeSelect.value;
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

  for (const market of state.data.markets) {
    if (market.outcomes?.length && !state.selectedOutcomes[market.id]) {
      state.selectedOutcomes[market.id] = market.outcomes[0].id;
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
      <article class="market-card">
        <div class="empty-state">
          <h3>No markets currently active</h3>
          <p>There are no ${escapeHtml(state.activeCategory)} markets on the board at the moment.</p>
        </div>
      </article>
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
      ${renderOutcomesSection(selectedMarket)}
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

function renderOutcomesSection(market) {
  if (market.outcomes.length > 4) {
    const selectedOutcomeId = state.selectedOutcomes[market.id] || market.outcomes[0].id;
    const selectedOutcome = market.outcomes.find((outcome) => outcome.id === selectedOutcomeId) || market.outcomes[0];
    state.selectedOutcomes[market.id] = selectedOutcome.id;

    return `
      <div class="stack">
        <label class="field board-select-field">
          <span>Outcome</span>
          <select class="board-outcome-select" data-outcome-select="${market.id}">
            ${market.outcomes
              .map(
                (outcome) => `
                  <option value="${outcome.id}" ${outcome.id === selectedOutcome.id ? "selected" : ""}>${escapeHtml(outcome.name)}</option>
                `
              )
              .join("")}
          </select>
        </label>
        ${renderOutcomeCard(selectedOutcome)}
      </div>
    `;
  }

  return `
    <div class="stack">
      ${market.outcomes.map((outcome) => renderOutcomeCard(outcome)).join("")}
    </div>
  `;
}

function renderOutcomeCard(outcome) {
  const exposure = state.data.exposureByOutcome.find((entry) => entry.outcomeId === outcome.id);
  const displayOdds = outcome.currentOfferedDecimal ?? outcome.offeredDecimal ?? outcome.baseOfferedDecimal;
  return `
    <div class="market-row market-row-compact">
      <div class="market-row-main">
        <div class="market-outcome-main">
          ${renderTeamBadge(outcome.team || outcome.name)}
          <strong>${escapeHtml(outcome.name)}</strong>
        </div>
        <div class="price-pill">${formatOdds(displayOdds, state.oddsFormat)}</div>
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
      state.data.markets
        .filter((market) => market.isActive !== false && (market.category || "Outright") === category)
        .sort((a, b) => {
          const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (orderDiff !== 0) {
            return orderDiff;
          }
          return a.name.localeCompare(b.name);
        }),
    ])
  );
}

function renderTeamBadge(label) {
  if (label === "Scotland") {
    return '<span class="team-badge"><span class="team-flag flag-scotland" aria-hidden="true"></span>Scotland</span>';
  }

  if (label === "USA") {
    return '<span class="team-badge"><span class="team-flag flag-usa" aria-hidden="true"></span>USA</span>';
  }

  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("scotland") || normalized.includes("scottish")) {
    return '<span class="team-badge"><span class="team-flag flag-scotland" aria-hidden="true"></span>Scotland</span>';
  }

  if (normalized === "usa" || normalized.includes("america") || normalized.includes("american")) {
    return '<span class="team-badge"><span class="team-flag flag-usa" aria-hidden="true"></span>USA</span>';
  }

  return "";
}
