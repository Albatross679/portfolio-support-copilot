# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- The backend architecture, local stack, API contract, and validation commands are authoritative in `README.md`.
- Run `ruff check .` and `pytest -m "not integration and not eval"` for secret-free validation. The Compose E2E and model evaluation commands are documented in `README.md`.
- Add durable project-specific notes here as they are discovered through real work.
- The React console is in `web/`; use `cd web && npm test` and `npm run build`, and see `web/API.md` for its backend contract.
- The stage-one AWS Compose deployment and its lifecycle commands are documented in `deploy/ec2/README.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
