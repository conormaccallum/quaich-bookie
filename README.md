# Quaich Bookie

A Vercel-ready golf-trip bookmaking app with:

- static front ends in `public/`
- hosted API functions in `api/`
- Postgres-backed storage for markets, bettors, and bets

## Architecture

- `public/admin.html`: bookmaker admin view
- `public/board.html`: public odds board
- `api/*.js`: Vercel Functions
- `lib/store.js`: Postgres data access
- `lib/book.js`: market pricing and auto-balance logic

## Local development

1. Set one of these environment variables:
   - `POSTGRES_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `DATABASE_URL`
2. Run:

```bash
cd "/Users/conormaccallum/Desktop/Quaich Bookie"
npx vercel dev
```

This will serve:

- `http://localhost:3000/admin`
- `http://localhost:3000/board`

## Import your existing local JSON data

Once your database is set and empty, you can import the current `data/store.json` into Postgres:

```bash
npm run db:import-json
```

## Deploy to Vercel

Recommended flow:

1. Push this project to GitHub
2. Import the repo into Vercel
3. Add a Vercel Postgres database, or point the app at any Postgres database
4. Set the database env vars in Vercel
5. Deploy

This app reads:

- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`
- `DATABASE_URL`

If you use Vercel Postgres, Vercel can provide the Postgres environment variables for you.
