# PriceRight - Desktop + Web Modes

This project supports **both**:

1. **Local desktop-style usage** (run frontend + backend on one Windows PC)
2. **Hosted web app usage** (deploy backend + frontend and access via browser/mobile)

## Architecture

- `client/` = React + Vite frontend
- `server/` = Express API + SQLite
- Frontend API target is controlled by `VITE_API_BASE_URL`
- Backend port and CORS are controlled by environment variables

---

## Mode A: Local Desktop (current workflow)

### 1) Backend

In `server/`:

```bash
npm install
npm run dev
```

Default backend URL: `http://localhost:3000`

### 2) Frontend

In `client/`:

```bash
npm install
npm run dev
```

Default frontend URL: `http://localhost:5173`

### 3) Environment files (optional)

- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.example` to `client/.env`

For local mode, defaults already point to localhost.

---

## Mode B: Hosted Web App

### 1) Deploy backend (`server/`)

- Start command: `npm run start`
- Set env vars:
  - `PORT` provided by host platform
  - `CORS_ORIGIN=https://your-frontend-domain.com`

### 2) Deploy frontend (`client/`)

- Build command: `npm run build`
- Set env var:
  - `VITE_API_BASE_URL=https://your-api-domain.com/api`

### 3) Verify

- Open hosted frontend URL
- Confirm API calls succeed and no CORS errors

---

## Recommended Production Direction

To support many users across desktop + web with shared data:

- Keep one hosted API as source of truth
- Migrate DB from local SQLite to managed Postgres when scaling
- Keep desktop users on browser (or package later), but point them to hosted API

## Quick Provider Setup

For a concrete deployment path using Render (API) + Vercel (frontend), see:

- [DEPLOY_RENDER_VERCEL.md](DEPLOY_RENDER_VERCEL.md)

---

## Environment Variables

### Frontend (`client/.env`)

- `VITE_API_BASE_URL` (default: `http://localhost:3000/api`)

### Backend (`server/.env`)

- `PORT` (default: `3000`)
- `CORS_ORIGIN` (default includes localhost dev frontend)
- `CSP_CONNECT_SRC` (optional; default: `'self'`, comma-separated CSP `connect-src` sources)
- backup-related vars in `server/.env.example`
