# Ballchasing Stats

## Run (dev)

Backend + frontend together:

```sh
cd /home/breeze/dev/ballchasing && \
  (cd frontend && npm run dev) & \
  (source venv/bin/activate && uvicorn server:app --reload --port 8000) & \
  wait
```

Backend only: `source venv/bin/activate && uvicorn server:app --reload --port 8000`

Frontend only: `cd frontend && npm run dev` (serves on :3000, proxies /api to :8000)

## Project structure

- `server.py` — FastAPI app, all routes
- `models.py` — Pydantic models
- `db.py` — SQLite helpers
- `ballchasing_client.py` — ballchasing.com API client with rate limiting
- `frontend/` — Lit + Rsbuild SPA
