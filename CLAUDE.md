You are running in WSL on windows. I am developing in Windows with VS code. I am using a windows browser (Chrome).

## Run (dev)

Backend + frontend together: `./dev.sh`

Logs are written to `logs/` with `[backend]`/`[frontend]` prefixes on terminal output. Backend logs rotate on uvicorn hot reloads.

Backend only: `source venv/bin/activate && uvicorn server:app --reload --port 8000`

Frontend only: `cd frontend && npm run dev` (serves on :3000, proxies /api to :8000)

## Project structure

- `server.py` — FastAPI app, all routes
- `models.py` — Pydantic models
- `db.py` — SQLite helpers
- `ballchasing_client.py` — ballchasing.com API client with rate limiting
- `frontend/` — Lit + Rsbuild SPA

## Test

All tests: `source venv/bin/activate && pytest`

Single file: `pytest tests/test_helpers.py`

Single test: `pytest tests/test_helpers.py::test_build_role_lookup_me`

Verbose: `pytest -v`

## Important constants

- Uploader ID `76561197971332940` is hardcoded in `server.py`. All syncs filter to this uploader only.


Write all plans to docs/plans/, not the home directory
