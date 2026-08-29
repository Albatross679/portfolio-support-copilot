# Support Copilot console

A small React and TypeScript support console for the portfolio-support-copilot backend. It submits messages, polls individual runs, and lets a human approve or reject paused refund requests. It intentionally remains a thin client over the backend graph, data stores, and worker.

## Run locally

```sh
cd web
npm install
npm run dev
```

The development server prints its local URL. Set `VITE_API_BASE` to the API origin when the backend runs on a different origin, for example `VITE_API_BASE=http://localhost:8000 npm run dev`.

## Mock mode

Run `VITE_MOCK_API=1 npm run dev` to use canned browser-side data for all three views without a backend. Submit a message containing `refund` to create a paused run, then review it in the approval inbox.

## Build and test

```sh
npm run build
npm test
```

The component tests use the same in-memory mock API layer as mock mode. The endpoint shapes consumed by the console are documented in [API.md](API.md).
