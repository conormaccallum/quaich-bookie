const crypto = require("node:crypto");

function buildMarket(body, marketId = crypto.randomUUID()) {
  const name = requireNonEmpty(body.name, "Market name is required");
  const margin = clampNumber(body.margin, 0, 100, 8);
  const defaultStake = clampNumber(body.defaultStake, 1, 1000000, 10);
  const autoBalance = body.autoBalance !== false && body.autoBalance !== "false";
  const rebalanceSensitivity = clampNumber(body.rebalanceSensitivity, 0, 5, 0.12);
  const rawOutcomes = Array.isArray(body.outcomes) ? body.outcomes : [];
  const validated = rawOutcomes
    .map((outcome, index) => ({
      id: outcome.id || crypto.randomUUID(),
      name: sanitizeText(outcome.name),
      trueProbability: clampNumber(outcome.trueProbability, 0.01, 1000000, 1),
      baseOfferedDecimal: parseOptionalNumber(outcome.baseOfferedDecimal ?? outcome.offeredDecimal),
      positionIndex: clampNumber(outcome.positionIndex, 0, 10000, index),
    }))
    .filter((outcome) => outcome.name);

  if (!validated.length) {
    throw new Error("At least one outcome is required");
  }

  const totalTrue = validated.reduce((sum, outcome) => sum + outcome.trueProbability, 0);
  const outcomes = validated.map((outcome, index) => ({
    ...outcome,
    positionIndex: index,
    baseOfferedDecimal: clampNumber(
      outcome.baseOfferedDecimal,
      1.01,
      10000,
      autoOfferedDecimal(outcome.trueProbability, totalTrue, margin)
    ),
  }));

  return {
    id: marketId,
    name,
    margin,
    defaultStake,
    autoBalance,
    rebalanceSensitivity,
    outcomes,
    createdAt: body.createdAt || new Date().toISOString(),
  };
}

function withDerivedData(store) {
  const pricedMarkets = store.markets.map((market) => deriveCurrentMarket(market, store.bets));
  const lookup = {
    marketById: Object.fromEntries(pricedMarkets.map((market) => [market.id, market])),
    bettorById: Object.fromEntries(store.bettors.map((bettor) => [bettor.id, bettor])),
  };

  const betsDetailed = store.bets.map((bet) => {
    const market = lookup.marketById[bet.marketId];
    const outcome = market?.outcomes.find((entry) => entry.id === bet.outcomeId);
    const bettor = lookup.bettorById[bet.bettorId];
    const potentialProfit = Number(((bet.oddsDecimal - 1) * bet.stake).toFixed(2));
    const potentialPayout = Number((bet.oddsDecimal * bet.stake).toFixed(2));

    return {
      ...bet,
      marketName: market?.name || "Unknown market",
      outcomeName: outcome?.name || "Unknown outcome",
      bettorName: bettor?.name || "Unknown bettor",
      bettorTeam: bettor?.team || "Other",
      potentialProfit,
      potentialPayout,
    };
  });

  const exposureByOutcome = [];
  for (const market of pricedMarkets) {
    for (const outcome of market.outcomes) {
      const bets = betsDetailed.filter((bet) => bet.marketId === market.id && bet.outcomeId === outcome.id);
      exposureByOutcome.push({
        marketId: market.id,
        marketName: market.name,
        outcomeId: outcome.id,
        outcomeName: outcome.name,
        baseOfferedDecimal: outcome.baseOfferedDecimal,
        currentOfferedDecimal: outcome.currentOfferedDecimal,
        totalStaked: round2(bets.reduce((sum, bet) => sum + bet.stake, 0)),
        totalPotentialProfit: round2(bets.reduce((sum, bet) => sum + bet.potentialProfit, 0)),
        betCount: bets.length,
        bettors: bets.map((bet) => ({
          betId: bet.id,
          bettorId: bet.bettorId,
          bettorName: bet.bettorName,
          bettorTeam: bet.bettorTeam,
          stake: bet.stake,
          oddsDecimal: bet.oddsDecimal,
          potentialProfit: bet.potentialProfit,
          notes: bet.notes,
        })),
      });
    }
  }

  const bettorExposure = store.bettors.map((bettor) => {
    const bets = betsDetailed.filter((bet) => bet.bettorId === bettor.id);
    return {
      ...bettor,
      betCount: bets.length,
      totalStaked: round2(bets.reduce((sum, bet) => sum + bet.stake, 0)),
      totalPotentialProfit: round2(bets.reduce((sum, bet) => sum + bet.potentialProfit, 0)),
      bets,
    };
  });

  return {
    ...store,
    markets: pricedMarkets,
    betsDetailed,
    exposureByOutcome,
    bettorExposure,
    summary: {
      marketCount: store.markets.length,
      bettorCount: store.bettors.length,
      betCount: store.bets.length,
      totalHandle: round2(store.bets.reduce((sum, bet) => sum + bet.stake, 0)),
      maxLiability: round2(Math.max(0, ...exposureByOutcome.map((entry) => entry.totalPotentialProfit))),
    },
  };
}

function deriveCurrentMarket(market, bets) {
  const normalizedMarket = {
    ...market,
    autoBalance: market.autoBalance !== false,
    rebalanceSensitivity: clampNumber(market.rebalanceSensitivity, 0, 5, 0.12),
    outcomes: market.outcomes.map((outcome) => ({
      ...outcome,
      baseOfferedDecimal: clampNumber(outcome.baseOfferedDecimal ?? outcome.offeredDecimal, 1.01, 10000, 2),
    })),
  };

  const marketBets = bets.filter((bet) => bet.marketId === market.id);
  const totalStaked = marketBets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalBaseImplied = normalizedMarket.outcomes.reduce((sum, outcome) => sum + 1 / outcome.baseOfferedDecimal, 0);
  const rebalanceAnchor = Math.max(normalizedMarket.defaultStake * normalizedMarket.outcomes.length, 1);
  const marketPressure = normalizedMarket.autoBalance ? Math.min(3, totalStaked / rebalanceAnchor) : 0;
  const stakeByOutcome = Object.fromEntries(
    normalizedMarket.outcomes.map((outcome) => [
      outcome.id,
      marketBets.filter((bet) => bet.outcomeId === outcome.id).reduce((sum, bet) => sum + bet.stake, 0),
    ])
  );

  const weightedOutcomes = normalizedMarket.outcomes.map((outcome) => {
    const baseImplied = 1 / outcome.baseOfferedDecimal;
    const stakeShare = totalStaked > 0 ? stakeByOutcome[outcome.id] / totalStaked : 0;
    const weightMultiplier = 1 + normalizedMarket.rebalanceSensitivity * marketPressure * stakeShare;
    return {
      ...outcome,
      baseImplied,
      stakeShare,
      totalStaked: round2(stakeByOutcome[outcome.id]),
      adjustedWeight: baseImplied * weightMultiplier,
    };
  });

  const adjustedWeightTotal = weightedOutcomes.reduce((sum, outcome) => sum + outcome.adjustedWeight, 0) || totalBaseImplied;
  const outcomes = weightedOutcomes.map((outcome) => {
    const currentImplied = normalizedMarket.autoBalance
      ? (outcome.adjustedWeight / adjustedWeightTotal) * totalBaseImplied
      : outcome.baseImplied;

    return {
      id: outcome.id,
      name: outcome.name,
      trueProbability: outcome.trueProbability,
      baseOfferedDecimal: round4(outcome.baseOfferedDecimal),
      currentOfferedDecimal: round4(1 / currentImplied),
      actionShare: round4(outcome.stakeShare),
      totalStaked: outcome.totalStaked,
    };
  });

  return {
    ...normalizedMarket,
    totalStaked: round2(totalStaked),
    outcomes,
  };
}

function normalizeStore(store) {
  return {
    bettors: Array.isArray(store.bettors) ? store.bettors : [],
    bets: Array.isArray(store.bets) ? store.bets : [],
    markets: Array.isArray(store.markets)
      ? store.markets.map((market) => ({
          ...market,
          autoBalance: market.autoBalance !== false,
          rebalanceSensitivity: clampNumber(market.rebalanceSensitivity, 0, 5, 0.12),
          outcomes: Array.isArray(market.outcomes)
            ? market.outcomes.map((outcome, index) => ({
                ...outcome,
                positionIndex: clampNumber(outcome.positionIndex, 0, 10000, index),
                baseOfferedDecimal: parseOptionalNumber(outcome.baseOfferedDecimal ?? outcome.offeredDecimal),
              }))
            : [],
        }))
      : [],
  };
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function sanitizeTeam(value) {
  return ["Scotland", "USA", "Other"].includes(value) ? value : "Other";
}

function requireNonEmpty(value, message) {
  const sanitized = sanitizeText(value);
  if (!sanitized) {
    throw new Error(message);
  }
  return sanitized;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function autoOfferedDecimal(probability, totalProbability, marginPercent) {
  const normalizedProbability = Math.max(0.0001, probability / Math.max(totalProbability, probability));
  return round4(1 / (normalizedProbability * (1 + marginPercent / 100)));
}

function round2(value) {
  return Number(value.toFixed(2));
}

function round4(value) {
  return Number(value.toFixed(4));
}

module.exports = {
  autoOfferedDecimal,
  buildMarket,
  normalizeStore,
  parseOptionalNumber,
  requireNonEmpty,
  sanitizeTeam,
  sanitizeText,
  withDerivedData,
};
