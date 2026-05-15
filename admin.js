const { byId, sendJson, fetchState, formatOdds, autoOfferedDecimal, currency, percent, escapeHtml } = window.Quaich;

const state = {
  data: null,
};

const elements = {
  bettorForm: byId("bettor-form"),
  bettorList: byId("bettor-list"),
  marketForm: byId("market-form"),
  marketOutcomes: byId("market-outcomes"),
  outcomeTemplate: byId("outcome-row-template"),
  addOutcomeBtn: byId("add-outcome-btn"),
  betForm: byId("bet-form"),
  betBettor: byId("bet-bettor"),
  betMarket: byId("bet-market"),
  betOutcome: byId("bet-outcome"),
  betOdds: byId("bet-odds"),
  marketEditorList: byId("market-editor-list"),
  refreshAdmin: byId("refresh-admin"),
};

init();

async function init() {
  bindEvents();
  addOutcomeRow({ name: "Scotland", trueProbability: 52 });
  addOutcomeRow({ name: "USA", trueProbability: 48 });
  await reload();
}

function bindEvents() {
  elements.refreshAdmin.addEventListener("click", reload);
  elements.addOutcomeBtn.addEventListener("click", () => addOutcomeRow());
  elements.marketForm.addEventListener("input", (event) => {
    updateManualPriceFlag(event.target);
    refreshOutcomePricing(elements.marketForm);
  });

  elements.bettorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.bettorForm);
    await submit(async () =>
      sendJson("/api/bettors", "POST", {
        name: formData.get("name"),
        team: formData.get("team"),
        notes: formData.get("notes"),
      })
    );
    elements.bettorForm.reset();
  });

  elements.marketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.marketForm);
    const outcomes = collectOutcomeRows(elements.marketOutcomes);
    await submit(async () =>
      sendJson("/api/markets", "POST", {
        name: formData.get("name"),
        category: formData.get("category"),
        isActive: formData.get("isActive") === "on",
        sortOrder: Number(formData.get("sortOrder")),
        margin: Number(formData.get("margin")),
        defaultStake: Number(formData.get("defaultStake")),
        autoBalance: formData.get("autoBalance") === "on",
        rebalanceSensitivity: Number(formData.get("rebalanceSensitivity")),
        outcomes,
      })
    );
    elements.marketForm.reset();
    elements.marketOutcomes.innerHTML = "";
    addOutcomeRow({ name: "Scotland", trueProbability: 52 });
    addOutcomeRow({ name: "USA", trueProbability: 48 });
  });

  elements.betMarket.addEventListener("change", syncBetOutcomeOptions);
  elements.betOutcome.addEventListener("change", syncBetOddsFromSelection);

  elements.betForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.betForm);
    await submit(async () =>
      sendJson("/api/bets", "POST", {
        bettorId: formData.get("bettorId"),
        marketId: formData.get("marketId"),
        outcomeId: formData.get("outcomeId"),
        stake: Number(formData.get("stake")),
        oddsDecimal: Number(formData.get("oddsDecimal")),
        notes: formData.get("notes"),
      })
    );
    elements.betForm.reset();
    hydrateBetSelectors();
  });

  elements.marketEditorList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const { action, marketId, bettorId, betId } = button.dataset;
    if (action === "delete-market") {
      await submit(() => sendJson(`/api/market?id=${marketId}`, "DELETE"));
    }
    if (action === "delete-bettor") {
      await submit(() => sendJson(`/api/bettor?id=${bettorId}`, "DELETE"));
    }
    if (action === "delete-bet") {
      await submit(() => sendJson(`/api/bet?id=${betId}`, "DELETE"));
    }
    if (action === "save-market") {
      const card = button.closest("[data-market-card]");
      const payload = collectMarketEditor(card, marketId);
      await submit(() => sendJson(`/api/market?id=${marketId}`, "PUT", payload));
    }
    if (action === "add-market-outcome") {
      const card = button.closest("[data-market-card]");
      const outcomeList = card.querySelector("[data-market-outcomes]");
      addOutcomeRow({}, outcomeList);
    }
  });

  elements.marketEditorList.addEventListener("input", (event) => {
    const card = event.target.closest("[data-market-card]");
    if (card) {
      updateManualPriceFlag(event.target);
      refreshOutcomePricing(card);
    }
  });
}

async function reload() {
  state.data = await fetchState();
  render();
}

function render() {
  renderBettors();
  hydrateBetSelectors();
  renderMarketEditors();
  refreshOutcomePricing(elements.marketForm);
}

function renderBettors() {
  elements.bettorList.innerHTML = state.data.bettorExposure.length
    ? state.data.bettorExposure
        .map(
          (bettor) => `
            <div class="entity-row">
              <div>
                <strong>${escapeHtml(bettor.name)}</strong>
                <p>${escapeHtml(bettor.team)} · ${bettor.betCount} bets · ${currency(bettor.totalStaked)} staked</p>
              </div>
              <button class="icon-btn" type="button" data-action="delete-bettor" data-bettor-id="${bettor.id}">Remove</button>
            </div>
          `
        )
        .join("")
    : `<p class="muted-copy">No bettors added yet.</p>`;
}

function hydrateBetSelectors() {
  elements.betBettor.innerHTML = state.data.bettors
    .map((bettor) => `<option value="${bettor.id}">${escapeHtml(bettor.name)} (${bettor.team})</option>`)
    .join("");

  elements.betMarket.innerHTML = state.data.markets
    .map((market) => `<option value="${market.id}">${escapeHtml(market.name)}</option>`)
    .join("");

  syncBetOutcomeOptions();
}

function syncBetOutcomeOptions() {
  const market = state.data.markets.find((entry) => entry.id === elements.betMarket.value) || state.data.markets[0];
  if (!market) {
    elements.betOutcome.innerHTML = "";
    elements.betOdds.value = "";
    return;
  }

  elements.betOutcome.innerHTML = market.outcomes
    .map((outcome) => `<option value="${outcome.id}">${escapeHtml(outcome.name)}</option>`)
    .join("");
  syncBetOddsFromSelection();
}

function syncBetOddsFromSelection() {
  const market = state.data.markets.find((entry) => entry.id === elements.betMarket.value);
  const outcome = market?.outcomes.find((entry) => entry.id === elements.betOutcome.value);
  const liveOdds = outcome?.currentOfferedDecimal ?? outcome?.offeredDecimal ?? outcome?.baseOfferedDecimal;
  elements.betOdds.value = liveOdds ? Number(liveOdds).toFixed(2) : "";
}

function renderMarketEditors() {
  const marketCards = state.data.markets.map((market) => {
    const linkedBets = state.data.betsDetailed.filter((bet) => bet.marketId === market.id);
    return `
      <article class="market-card" data-market-card data-market-id="${market.id}">
        <div class="market-card-head">
          <div>
            <p class="panel-kicker">Market</p>
            <h3>${escapeHtml(market.name)}</h3>
          </div>
          <div class="market-tools">
            <button class="secondary-btn" type="button" data-action="add-market-outcome" data-market-id="${market.id}">Add outcome</button>
            <button class="primary-btn" type="button" data-action="save-market" data-market-id="${market.id}">Save changes</button>
            <button class="icon-btn" type="button" data-action="delete-market" data-market-id="${market.id}">Delete</button>
          </div>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Market name</span>
            <input data-market-field="name" value="${escapeHtml(market.name)}" />
          </label>
          <label class="field">
            <span>Category</span>
            <select data-market-field="category">
              ${renderCategoryOptions(market.category)}
            </select>
          </label>
          <label class="field field-checkbox">
            <span>Show on board</span>
            <input data-market-field="isActive" type="checkbox" ${market.isActive !== false ? "checked" : ""} />
          </label>
          <label class="field">
            <span>Sort order</span>
            <input data-market-field="sortOrder" type="number" step="1" value="${market.sortOrder ?? 0}" />
          </label>
          <label class="field">
            <span>Overround (%)</span>
            <input data-market-field="margin" type="number" step="0.1" value="${market.margin}" />
          </label>
          <label class="field">
            <span>Default stake ($)</span>
            <input data-market-field="defaultStake" type="number" step="1" value="${market.defaultStake}" />
          </label>
          <label class="field field-checkbox">
            <span>Auto-balance from bets</span>
            <input data-market-field="autoBalance" type="checkbox" ${market.autoBalance !== false ? "checked" : ""} />
          </label>
          <label class="field">
            <span>Move sensitivity</span>
            <input data-market-field="rebalanceSensitivity" type="number" min="0" max="5" step="0.01" value="${market.rebalanceSensitivity ?? 0.12}" />
          </label>
        </div>
        <div class="stack" data-market-outcomes>
          ${market.outcomes
            .map(
              (outcome) => `
                <div class="outcome-row">
                  <label class="field">
                    <span>Outcome</span>
                    <input data-outcome-field="name" data-outcome-id="${outcome.id}" value="${escapeHtml(outcome.name)}" />
                  </label>
                  <label class="field">
                    <span>Badge</span>
                    <select data-outcome-field="team" data-outcome-id="${outcome.id}">
                      ${renderOutcomeTeamOptions(outcome.team)}
                    </select>
                  </label>
                  <label class="field">
                    <span>True chance (%)</span>
                    <input data-outcome-field="trueProbability" data-outcome-id="${outcome.id}" type="number" min="0" step="0.01" value="${outcome.trueProbability}" />
                  </label>
                  <label class="field">
                    <span>Base odds (decimal)</span>
                    <input data-outcome-field="offeredDecimal" data-outcome-id="${outcome.id}" type="number" step="0.01" value="${outcome.baseOfferedDecimal ?? outcome.offeredDecimal ?? ""}" />
                  </label>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="stack">
          <h4>Tickets on this market</h4>
          ${
            linkedBets.length
              ? linkedBets
                  .map(
                    (bet) => `
                      <div class="entity-row">
                        <div>
                          <strong>${escapeHtml(bet.bettorName)} on ${escapeHtml(bet.outcomeName)}</strong>
                          <p>${currency(bet.stake)} at ${formatOdds(bet.oddsDecimal, "decimal")} · Profit ${currency(bet.potentialProfit)}</p>
                        </div>
                        <button class="icon-btn" type="button" data-action="delete-bet" data-bet-id="${bet.id}">Void</button>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="muted-copy">No bets recorded on this market yet.</p>`
          }
        </div>
      </article>
    `;
  });

  elements.marketEditorList.innerHTML = marketCards.join("");
}

function addOutcomeRow(seed = {}, parent = elements.marketOutcomes) {
  const fragment = elements.outcomeTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".outcome-row");
  row.querySelector('[data-role="name"]').value = seed.name || "";
  row.querySelector('[data-role="team"]').value = seed.team || "None";
  row.querySelector('[data-role="trueProbability"]').value = seed.trueProbability || "";
  const seededPrice = seed.baseOfferedDecimal ?? seed.offeredDecimal ?? "";
  row.querySelector('[data-role="offeredDecimal"]').value = seededPrice;
  row.dataset.manualPrice = seed.manualPrice ? "true" : "false";
  row.querySelector('[data-role="remove"]').addEventListener("click", () => row.remove());
  parent.appendChild(fragment);
  refreshOutcomePricing(parent.closest("form, [data-market-card]"));
}

function collectOutcomeRows(container) {
  return Array.from(container.querySelectorAll(".outcome-row"))
    .map((row) => ({
      name: row.querySelector('[data-role="name"], [data-outcome-field="name"]').value,
      team: row.querySelector('[data-role="team"], [data-outcome-field="team"]').value,
      trueProbability: Number(row.querySelector('[data-role="trueProbability"], [data-outcome-field="trueProbability"]').value),
      offeredDecimal: optionalNumber(row.querySelector('[data-role="offeredDecimal"], [data-outcome-field="offeredDecimal"]').value),
      id: row.querySelector("[data-outcome-id]")?.dataset.outcomeId,
    }))
    .filter((outcome) => outcome.name);
}

function collectMarketEditor(card) {
  return {
    name: card.querySelector('[data-market-field="name"]').value,
    category: card.querySelector('[data-market-field="category"]').value,
    isActive: card.querySelector('[data-market-field="isActive"]').checked,
    sortOrder: Number(card.querySelector('[data-market-field="sortOrder"]').value),
    margin: Number(card.querySelector('[data-market-field="margin"]').value),
    defaultStake: Number(card.querySelector('[data-market-field="defaultStake"]').value),
    autoBalance: card.querySelector('[data-market-field="autoBalance"]').checked,
    rebalanceSensitivity: Number(card.querySelector('[data-market-field="rebalanceSensitivity"]').value),
    outcomes: collectOutcomeRows(card.querySelector("[data-market-outcomes]")),
  };
}

async function submit(task) {
  try {
    state.data = await task();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

function refreshOutcomePricing(container) {
  if (!container) {
    return;
  }

  const marginInput =
    container.querySelector('[name="margin"]') || container.querySelector('[data-market-field="margin"]');
  const outcomeRows = Array.from(container.querySelectorAll(".outcome-row"));
  const margin = Number(marginInput?.value || 0);
  const probabilities = outcomeRows.map((row) =>
    Number(row.querySelector('[data-role="trueProbability"], [data-outcome-field="trueProbability"]').value || 0)
  );
  const totalProbability = probabilities.reduce((sum, value) => sum + value, 0);

  outcomeRows.forEach((row, index) => {
    const oddsInput = row.querySelector('[data-role="offeredDecimal"], [data-outcome-field="offeredDecimal"]');
    if (row.dataset.manualPrice === "true") {
      return;
    }
    const autoPrice = autoOfferedDecimal(probabilities[index], totalProbability, margin);
    oddsInput.value = autoPrice > 0 ? autoPrice.toFixed(2) : "";
  });
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function updateManualPriceFlag(target) {
  if (!target?.matches?.('[data-role="offeredDecimal"], [data-outcome-field="offeredDecimal"]')) {
    return;
  }

  const row = target.closest(".outcome-row");
  if (!row) {
    return;
  }

  row.dataset.manualPrice = target.value.trim() ? "true" : "false";
}

function renderCategoryOptions(selectedCategory) {
  return ["Outright", "Match Bets", "Individual", "Props"]
    .map(
      (category) => `
        <option value="${category}" ${selectedCategory === category ? "selected" : ""}>${category}</option>
      `
    )
    .join("");
}

function renderOutcomeTeamOptions(selectedTeam) {
  return ["None", "Scotland", "USA"]
    .map(
      (team) => `
        <option value="${team}" ${selectedTeam === team ? "selected" : ""}>${team}</option>
      `
    )
    .join("");
}
