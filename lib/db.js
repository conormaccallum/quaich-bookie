const postgres = require("postgres");

let sqlClient;
let schemaPromise;

function getSql() {
  if (!sqlClient) {
    const connectionString =
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "Missing database connection. Set POSTGRES_URL, POSTGRES_URL_NON_POOLING, or DATABASE_URL."
      );
    }

    sqlClient = postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

  return sqlClient;
}

async function ensureSchema() {
  if (!schemaPromise) {
    const sql = getSql();
    schemaPromise = (async () => {
      await sql`
        create table if not exists bettors (
          id text primary key,
          name text not null,
          team text not null default 'Other',
          notes text not null default '',
          created_at timestamptz not null default now()
        )
      `;

      await sql`
        create table if not exists markets (
          id text primary key,
          name text not null,
          category text not null default 'Outright',
          sort_order integer not null default 0,
          is_active boolean not null default true,
          margin numeric not null,
          default_stake numeric not null,
          auto_balance boolean not null default true,
          rebalance_sensitivity numeric not null default 0.12,
          created_at timestamptz not null default now()
        )
      `;

      await sql`
        alter table markets
        add column if not exists category text not null default 'Outright'
      `;

      await sql`
        alter table markets
        add column if not exists sort_order integer not null default 0
      `;

      await sql`
        alter table markets
        add column if not exists is_active boolean not null default true
      `;

      await sql`
        create table if not exists outcomes (
          id text primary key,
          market_id text not null references markets(id) on delete cascade,
          name text not null,
          team text not null default 'None',
          true_probability numeric not null,
          base_offered_decimal numeric not null,
          position_index integer not null default 0
        )
      `;

      await sql`
        create table if not exists bets (
          id text primary key,
          market_id text not null references markets(id) on delete cascade,
          outcome_id text not null references outcomes(id) on delete restrict,
          bettor_id text not null references bettors(id) on delete cascade,
          stake numeric not null,
          odds_decimal numeric not null,
          notes text not null default '',
          placed_at timestamptz not null default now()
        )
      `;

      await sql`create index if not exists idx_outcomes_market_id on outcomes(market_id, position_index)`;
      await sql`
        alter table outcomes
        add column if not exists team text not null default 'None'
      `;
      await sql`create index if not exists idx_bets_market_id on bets(market_id)`;
      await sql`create index if not exists idx_bets_outcome_id on bets(outcome_id)`;
      await sql`create index if not exists idx_bets_bettor_id on bets(bettor_id)`;
    })();
  }

  return schemaPromise;
}

module.exports = {
  ensureSchema,
  getSql,
};
