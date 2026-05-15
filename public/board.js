const { byId, fetchState, formatOdds, currency, escapeHtml } = window.Quaich;

const state = {
  data: null,
  oddsFormat: "american",
};

const elements = {
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
}

async function reload() {
  state.data = await fetchState();
  render();
}

function render() {
  if (!state.data) {
    return;
  }

  elements.boardMarkets.innerHTML = state.data.markets
    .map((market) => `
        <article class="market-card">
          <div class="market-card-head">
            <div>
              <p class="panel-kicker">Market</p>
              <h3>${escapeHtml(market.name)}</h3>
            </div>
          </div>
          ${renderMarketContent(market)}
        </article>
      `)
    .join("");

  bindLargeMarketDropdowns();
}

function renderMarketContent(market) {
  if (market.outcomes.length > 5) {
    const firstOutcome = market.outcomes[0];
    return `
      <div class="stack">
        <label class="field board-select-field">
          <span>Choose outcome</span>
          <select class="board-outcome-select" data-market-select="${market.id}">
            ${market.outcomes
              .map(
                (outcome) => `
                  <option value="${outcome.id}">${escapeHtml(outcome.name)}</option>
                `
              )
              .join("")}
          </select>
        </label>
        <div data-market-detail="${market.id}">
          ${renderOutcomeCard(firstOutcome)}
        </div>
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

function bindLargeMarketDropdowns() {
  document.querySelectorAll("[data-market-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const marketId = event.target.dataset.marketSelect;
      const market = state.data.markets.find((entry) => entry.id === marketId);
      const outcome = market?.outcomes.find((entry) => entry.id === event.target.value);
      const detail = document.querySelector(`[data-market-detail="${marketId}"]`);
      if (!outcome || !detail) {
        return;
      }
      detail.innerHTML = renderOutcomeCard(outcome);
    });
  });
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
