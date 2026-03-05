# Deploy PriceRight (Render API + Vercel Web)

This guide keeps your current local desktop workflow and adds a hosted web version.

## 1) Deploy Backend API to Render

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render, choose **New +** → **Blueprint**.
3. Select the repo (Render reads `render.yaml`).
4. In service env vars, set:
   - `CORS_ORIGIN=https://<your-vercel-domain>`
   - Keep `PORT` as provided by Render runtime.

### Option B: Manual service

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm run start`
- Environment Variables:
  - `NODE_ENV=production`
  - `CORS_ORIGIN=https://<your-vercel-domain>`
  - `AUTO_BACKUP_ENABLED=false`

After deploy, note API URL:
- `https://<your-render-service>.onrender.com`

Health check:
- `https://<your-render-service>.onrender.com/api/health`

---

## 2) Deploy Frontend to Vercel

1. In Vercel, import the same repo.
2. Set **Root Directory** to `client`.
3. Build command (auto-detected): `npm run build`
4. Output directory: `dist`
5. Add Environment Variable:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api`

Then deploy.

`client/vercel.json` already handles SPA routing rewrites.

---

## 3) Wire CORS correctly

After Vercel gives your final domain:
1. Update Render `CORS_ORIGIN` to that exact HTTPS origin.
2. Redeploy/restart Render service.

If needed, include both production and preview domains as comma-separated list:
- `CORS_ORIGIN=https://app.example.com,https://priceright-git-main-yourteam.vercel.app`

---

## 4) Verify end-to-end

1. Open frontend URL from Vercel.
2. Login/use pages (Dashboard, Products, Materials, Customers).
3. Confirm browser console has no CORS errors.
4. Confirm backend health endpoint is healthy.

---

## 5) Keep local desktop mode unchanged

Local mode still works exactly as before:
- Backend: `cd server && npm run dev`
- Frontend: `cd client && npm run dev`
- Frontend uses localhost by default unless `VITE_API_BASE_URL` is set.

---

## Notes

- Current backend uses SQLite (`server/priceright.db`).
- For multi-user production scaling, consider moving to managed Postgres later.
- Render free tier may sleep; paid tier avoids cold starts.
