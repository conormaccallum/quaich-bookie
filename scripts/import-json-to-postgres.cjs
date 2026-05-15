const fs = require("node:fs/promises");
const path = require("node:path");
const { createBet, createBettor, createMarket, getState } = require("../lib/store");

async function run() {
  const filePath = path.join(__dirname, "..", "data", "store.json");
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);

  const currentState = await getState();
  if (currentState.summary.marketCount || currentState.summary.bettorCount || currentState.summary.betCount) {
    throw new Error("Database is not empty. Refusing to import over existing data.");
  }

  for (const bettor of data.bettors || []) {
    await createBettor(bettor);
  }

  for (const market of data.markets || []) {
    await createMarket(market);
  }

  const importedState = await getState();
  for (const bet of data.bets || []) {
    const market = importedState.markets.find((entry) => entry.id === bet.marketId);
    const bettor = importedState.bettors.find((entry) => entry.id === bet.bettorId);
    const outcome = market?.outcomes.find((entry) => entry.id === bet.outcomeId);

    if (!market || !bettor || !outcome) {
      continue;
    }

    await createBet({
      marketId: market.id,
      outcomeId: outcome.id,
      bettorId: bettor.id,
      stake: bet.stake,
      oddsDecimal: bet.oddsDecimal,
      notes: bet.notes,
    });
  }

  console.log("Imported local JSON data into Postgres.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
