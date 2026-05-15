const crypto = require("node:crypto");
const { ensureSchema, getSql } = require("./db");
const {
  buildMarket,
  normalizeStore,
  requireNonEmpty,
  sanitizeTeam,
  sanitizeText,
  withDerivedData,
} = require("./book");

async function getState() {
  await ensureSchema();
  const sql = getSql();

  const [bettorsRows, marketsRows, outcomesRows, betsRows] = await Promise.all([
    sql`select id, name, team, notes, created_at from bettors order by created_at desc, name asc`,
    sql`
      select id, name, margin, default_stake, auto_balance, rebalance_sensitivity, created_at
      from markets
      order by created_at desc, name asc
    `,
    sql`
      select id, market_id, name, true_probability, base_offered_decimal, position_index
      from outcomes
      order by market_id asc, position_index asc, name asc
    `,
    sql`
      select id, market_id, outcome_id, bettor_id, stake, odds_decimal, notes, placed_at
      from bets
      order by placed_at desc, id desc
    `,
  ]);

  const markets = marketsRows.map((market) => ({
    id: market.id,
    name: market.name,
    margin: Number(market.margin),
    defaultStake: Number(market.default_stake),
    autoBalance: market.auto_balance,
    rebalanceSensitivity: Number(market.rebalance_sensitivity),
    createdAt: new Date(market.created_at).toISOString(),
    outcomes: outcomesRows
      .filter((outcome) => outcome.market_id === market.id)
      .map((outcome) => ({
        id: outcome.id,
        name: outcome.name,
        trueProbability: Number(outcome.true_probability),
        baseOfferedDecimal: Number(outcome.base_offered_decimal),
        positionIndex: Number(outcome.position_index),
      })),
  }));

  const store = normalizeStore({
    bettors: bettorsRows.map((bettor) => ({
      id: bettor.id,
      name: bettor.name,
      team: bettor.team,
      notes: bettor.notes,
      createdAt: new Date(bettor.created_at).toISOString(),
    })),
    markets,
    bets: betsRows.map((bet) => ({
      id: bet.id,
      marketId: bet.market_id,
      outcomeId: bet.outcome_id,
      bettorId: bet.bettor_id,
      stake: Number(bet.stake),
      oddsDecimal: Number(bet.odds_decimal),
      notes: bet.notes,
      placedAt: new Date(bet.placed_at).toISOString(),
    })),
  });

  return withDerivedData(store);
}

async function createBettor(body) {
  await ensureSchema();
  const sql = getSql();
  const bettor = {
    id: body.id || crypto.randomUUID(),
    name: requireNonEmpty(body.name, "Bettor name is required"),
    team: sanitizeTeam(body.team),
    notes: sanitizeText(body.notes),
    createdAt: body.createdAt || new Date().toISOString(),
  };

  await sql`
    insert into bettors (id, name, team, notes, created_at)
    values (${bettor.id}, ${bettor.name}, ${bettor.team}, ${bettor.notes}, ${bettor.createdAt})
  `;
}

async function deleteBettor(id) {
  await ensureSchema();
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`delete from bets where bettor_id = ${id}`;
    await tx`delete from bettors where id = ${id}`;
  });
}

async function createMarket(body) {
  await ensureSchema();
  const sql = getSql();
  const market = buildMarket(body, body.id || crypto.randomUUID());

  await sql.begin(async (tx) => {
    await tx`
      insert into markets (id, name, margin, default_stake, auto_balance, rebalance_sensitivity, created_at)
      values (
        ${market.id},
        ${market.name},
        ${market.margin},
        ${market.defaultStake},
        ${market.autoBalance},
        ${market.rebalanceSensitivity},
        ${market.createdAt}
      )
    `;

    for (const outcome of market.outcomes) {
      await tx`
        insert into outcomes (id, market_id, name, true_probability, base_offered_decimal, position_index)
        values (
          ${outcome.id},
          ${market.id},
          ${outcome.name},
          ${outcome.trueProbability},
          ${outcome.baseOfferedDecimal},
          ${outcome.positionIndex}
        )
      `;
    }
  });
}

async function updateMarket(id, body) {
  await ensureSchema();
  const sql = getSql();
  const existing = await sql`select id, created_at from markets where id = ${id}`;
  if (!existing.length) {
    throw new Error("Market not found");
  }

  const market = buildMarket({ ...body, createdAt: new Date(existing[0].created_at).toISOString() }, id);
  const keepOutcomeIds = market.outcomes.map((outcome) => outcome.id);

  await sql.begin(async (tx) => {
    await tx`
      update markets
      set
        name = ${market.name},
        margin = ${market.margin},
        default_stake = ${market.defaultStake},
        auto_balance = ${market.autoBalance},
        rebalance_sensitivity = ${market.rebalanceSensitivity}
      where id = ${id}
    `;

    for (const outcome of market.outcomes) {
      await tx`
        insert into outcomes (id, market_id, name, true_probability, base_offered_decimal, position_index)
        values (
          ${outcome.id},
          ${market.id},
          ${outcome.name},
          ${outcome.trueProbability},
          ${outcome.baseOfferedDecimal},
          ${outcome.positionIndex}
        )
        on conflict (id) do update set
          name = excluded.name,
          true_probability = excluded.true_probability,
          base_offered_decimal = excluded.base_offered_decimal,
          position_index = excluded.position_index
      `;
    }

    if (keepOutcomeIds.length) {
      await tx`
        delete from outcomes
        where market_id = ${id}
          and id not in ${tx(keepOutcomeIds)}
          and id not in (select outcome_id from bets where market_id = ${id})
      `;
    }
  });
}

async function deleteMarket(id) {
  await ensureSchema();
  const sql = getSql();
  await sql`delete from markets where id = ${id}`;
}

async function createBet(body) {
  await ensureSchema();
  const sql = getSql();
  const state = await getState();
  const market = state.markets.find((entry) => entry.id === body.marketId);
  const bettor = state.bettors.find((entry) => entry.id === body.bettorId);
  const outcome = market?.outcomes.find((entry) => entry.id === body.outcomeId);

  if (!market || !bettor || !outcome) {
    throw new Error("Select a valid market, outcome, and bettor");
  }

  const bet = {
    id: body.id || crypto.randomUUID(),
    marketId: market.id,
    outcomeId: outcome.id,
    bettorId: bettor.id,
    stake: clampNumber(body.stake, 1, 1000000, market.defaultStake || 10),
    oddsDecimal: clampNumber(body.oddsDecimal, 1.01, 10000, outcome.currentOfferedDecimal),
    notes: sanitizeText(body.notes),
    placedAt: body.placedAt || new Date().toISOString(),
  };

  await sql`
    insert into bets (id, market_id, outcome_id, bettor_id, stake, odds_decimal, notes, placed_at)
    values (
      ${bet.id},
      ${bet.marketId},
      ${bet.outcomeId},
      ${bet.bettorId},
      ${bet.stake},
      ${bet.oddsDecimal},
      ${bet.notes},
      ${bet.placedAt}
    )
  `;
}

async function deleteBet(id) {
  await ensureSchema();
  const sql = getSql();
  await sql`delete from bets where id = ${id}`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

module.exports = {
  createBet,
  createBettor,
  createMarket,
  deleteBet,
  deleteBettor,
  deleteMarket,
  getState,
  updateMarket,
};
