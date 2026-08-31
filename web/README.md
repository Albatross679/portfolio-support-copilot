# Support Copilot console

A React and TypeScript console for the portfolio-support-copilot backend. The customer portal identifies a demo customer, lists their orders, submits support requests, and sends follow-ups. The employee area at `/employees` monitors recent runs, handles refund approvals, edits demo business data, and sets the daily run limit.

## Run locally

`docker compose up --build` builds the console into the API image and serves the complete product at `http://localhost:8000`. The API documentation is at `/docs`. If port 8000 is busy, use `API_PORT=8001 docker compose up --build` and open `http://localhost:8001`.

For Vite development, start the Compose stack, then run:

```sh
cd web
npm install
npm run dev
```

Leave `VITE_API_BASE` blank to send `/api` requests through the Vite proxy to `http://localhost:8000`. You can instead set `VITE_API_BASE=http://localhost:8000 npm run dev`. FastAPI permits local Vite origins. Use port 8001 for the documented Compose fallback.

## Mock mode

Run `VITE_MOCK_API=1 npm run dev` to use canned browser-side data without a backend. Submit a message containing `refund` to create a paused run, then review it in the employee approval inbox. The mock also supplies recent runs, editable business data, and the daily run limit setting. It uses the same current contract as the backend.

## Build and test

```sh
npm run build
npm test
```

The endpoint shapes consumed by the console are documented in [API.md](API.md). [`api-contract.json`](api-contract.json) is shared with backend contract tests so backend response fields and console types cannot silently drift.
