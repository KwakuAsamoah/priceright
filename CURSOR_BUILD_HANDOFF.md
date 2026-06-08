# PriceRight — Cursor Build Handoff Document

**Purpose:** Hand this document to an engineer who originally built PriceRight from scratch, so they can understand everything that was built, fixed, and shipped **with Cursor AI assistance** after the initial codebase existed.

**As of:** 7 June 2026  
**Current released version (last tagged commit):** **v1.0.12** (`1eb020d`)  
**Repository:** https://github.com/KwakuAsamoah/priceright  
**Local path:** `C:\Users\HP\priceright`

---

## 1. Important context — what Cursor did vs. what existed before

### Before Cursor (engineer-built foundation)

Git history shows substantial application work **before** the first saved Cursor session:

| Milestone | Approx. date | Evidence |
|-----------|--------------|----------|
| Initial project snapshot | 2026-03-05 | Commit `862ad45` |
| Core pricing features | Mar–May 2026 | ~60 commits before Cursor handoff |
| Electron packaging first attempt | May 2026 | `00760ad`, `b872af6` |

**Already built before Cursor (do not assume Cursor created these):**

- Full React + Express + SQLite application
- Materials (primary + intermediate), Products, Price Levels, Settings, Reports, Activity, Dashboard, Help
- Pricing engine logic, BOM / yield costing, margin/markup calculations
- CSV/XLSX import pipelines for materials, intermediates, products
- PIN lock screen and demo mode
- Early Electron wrapper (`electron/main.js`, `electron-builder.yml`)
- Backup/restore API and UI foundations
- Hosted web deployment path (Render/Vercel docs in `README.md`)

### When Cursor work begins (first saved prompt)

The **earliest preserved Cursor transcript** is a **continuation/handoff prompt**, not a greenfield “build the app” prompt:

- **Chat:** [Phase 2 Electron handoff](8906ad62-6e49-4d41-beb8-31840f4f3edd)
- **Date:** 26 May 2026
- **App state at handoff:** v1.0.0, Phase 2 Electron testing, installer built but fixes needed

Cursor’s role from that point: **debugging, hardening, licensing, auto-update, UI polish, onboarding, releases v1.0.1 → v1.0.12**, and operational documentation.

---

## 2. Product summary

**PriceRight** is a desktop-first pricing management application for **food manufacturers in Ghana**, with GHS as the primary currency.

### Core business capabilities

| Domain | What the app does |
|--------|-------------------|
| **Materials** | Primary raw materials + intermediate materials with BOM, yield modes, multi-currency purchase costs |
| **Products** | Product recipes, costing, profit margin, approval workflow, price expiry |
| **Price levels** | Rule-based pricing tiers (multiplier, discount, add/deduct fixed amounts) |
| **Approvals** | Per-product price approval; bulk selection workflows |
| **Reports** | Pricing/margin reports |
| **Activity** | Audit-style activity log |
| **Settings** | General, Pricing Engine, Currencies & Rates, Master Data, Data & Backups |
| **Demo mode** | Packaged `demo.db` for trials; toggle between live and demo database |
| **Security** | PIN gate on launch; optional licence/trial gate in Electron |
| **Desktop** | Windows NSIS installer, auto-update via GitHub Releases |

---

## 3. Technical architecture (current)

```
┌─────────────────────────────────────────────────────────────┐
│  Electron main process (electron/main.js)                     │
│  - Spawns Express server child process                      │
│  - IPC: download, backup save, restore pick, licence, update│
│  - autoUpdater → GitHub Releases                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ localhost:3000
┌──────────────────────────▼──────────────────────────────────┐
│  Express API (server/src/index.ts → server-dist/)           │
│  - Drizzle ORM + better-sqlite3                             │
│  - ~4700+ lines — CRUD, imports, pricing, backups, demo   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP /api
┌──────────────────────────▼──────────────────────────────────┐
│  React 18 + TypeScript + Vite (client/src → client-dist/)     │
│  - Hash router (createHashRouter) — required for Electron     │
│  - Contexts: currency, demo, onboarding, notifications, etc.  │
└─────────────────────────────────────────────────────────────┘
```

### Development vs production

| Mode | Client | Server | Database |
|------|--------|--------|----------|
| **Dev** | Vite `localhost:5173` | `localhost:3000` | `server/priceright.db` |
| **Electron dev** | Vite or built | child process | `%APPDATA%/PriceRight/priceright.db` |
| **Packaged** | `file://` via `loadFile()` | `resources/server-dist/index.js` | `userData/priceright.db` + `userData/demo.db` |

### Packaged resources (`electron-builder.yml`)

- `client-dist/` — built React app
- `server-dist/` — compiled server
- `server/demo.db` — copied to userData on first launch
- `client-dist/templates/` — import templates served by Express `/templates`
- `server/node_modules/` — includes native `better-sqlite3` rebuilt for Electron ABI

### Key native module constraint

`better-sqlite3` **must** be compiled for **Electron’s Node ABI**, not system Node.

- Build scripts: `scripts/install-electron-sqlite.js`, `scripts/verify-packaged-native.js`
- `npm run electron:build` runs `rebuild:native` first
- Failure symptom: `"PriceRight server could not start"` + `NODE_MODULE_VERSION` mismatch in stderr

---

## 4. Database schema (high level)

Defined in `server/src/schema.ts`. Main tables:

- `currencies`, `exchange_rates`, `settings`
- `materials`, `intermediate_material_bom`
- `products`, product BOM tables (see full schema)
- `price_levels`, `price_level_items`
- `activity_log` / audit tables
- PIN and onboarding flags stored in `settings` (e.g. `onboardingCompleted`)

**Demo database:** `server/demo.db` — seeded via `server/src/seedDemo.ts`, versioned so updates force refresh in packaged app.

---

## 5. Application pages & navigation

### Sidebar structure (`client/src/App.tsx`)

| Section | Routes |
|---------|--------|
| — | Dashboard `/` |
| **Setup** | Materials, Products, Price Levels, Settings |
| **Pricing** | Reports, Activity |
| (in nav) | Help (opens side panel, not a route change) |

**Footer strip:** PriceRight label + notification bell + power (lock/exit).

### Page files (`client/src/pages/`)

| File | Purpose |
|------|---------|
| `Dashboard.tsx` | Summary stats, margin health, onboarding entry |
| `MaterialsPage.tsx` | Tab shell: Primary / Intermediate / Analysis |
| `Materials.tsx` | Primary materials list + import |
| `IntermediateMaterials.tsx` | Intermediate materials list + import |
| `IntermediateDetail.tsx` | Full-page intermediate editor |
| `Products.tsx` | Products list + analysis tab |
| `ProductDetail.tsx` | Single product costing + approval |
| `PriceLevels.tsx` | Price level rules + product assignments |
| `Settings.tsx` | 5-tab settings area |
| `Reports.tsx` | Report picker + content |
| `Activity.tsx` | Activity feed |
| `HelpPage.tsx` | Full-page help articles |

### Major shared components (`client/src/components/`)

| Component | Role |
|-----------|------|
| `PINScreen.tsx` | PIN entry/setup gate |
| `LicenceGate.tsx` | Wraps app; trial/licence checks in Electron |
| `ActivationScreen.tsx`, `LockScreen.tsx`, `TrialBanner.tsx`, `LicenceKeyModal.tsx` | Licensing UX |
| `WelcomeModal.tsx` | First-run welcome + onboarding start |
| `OnboardingBar.tsx` | Persistent setup progress bar |
| `UpdateModal.tsx` | Auto-update download + restart |
| `NotificationBell.tsx` | In-sidebar notifications |
| `DemoModeBanner.tsx` | Demo mode indicator |
| `HelpPanel.tsx` | Slide-out help |
| `TableZoomControl.tsx` | +/- zoom on data tables |
| `PriceRightLogoIcon.tsx` | Current sidebar SVG logo (orange gradient **PR**) |
| `ProductFormDrawer.tsx` | Product add/edit drawer |

### React contexts (`client/src/context/`)

| Context | Purpose |
|---------|---------|
| `BaseCurrencyContext` | Base currency state across app |
| `DemoModeContext` | Live vs demo DB toggle |
| `OnboardingContext` | Guided setup steps |
| `NotificationContext` | Update notifications |
| `FormStateContext` | Unsaved form / navigation blocker |
| `MaterialDataSyncContext` | Cross-page material refresh (recent WIP) |
| `RefreshContext` | Page-level refresh registry (recent WIP) |

---

## 6. External services & related repositories

Documented in `RECOVERY.md`:

| Service | Purpose |
|---------|---------|
| **GitHub** `KwakuAsamoah/priceright` | Source + Releases + auto-update |
| **Railway** | Licence server (`priceright-licence-server`) |
| **Paystack** | Payment link on lock/trial screens |
| **Resend** | Licence server email |
| **Hostinger** | Landing page `www.therighthub.com` |

| Repo | URL |
|------|-----|
| Main app | github.com/KwakuAsamoah/priceright |
| Licence server | github.com/KwakuAsamoah/priceright-licence-server |
| Landing page | github.com/KwakuAsamoah/priceright-landing |

**Licence flow (Electron):**

1. `node-machine-id` generates stable machine ID
2. IPC `check-licence`, `activate-trial`, `validate-licence` in `electron/main.js`
3. State cached in `%APPDATA%/PriceRight/licence.json`
4. Server URL fallback: Railway production host (see `RECOVERY.md`)

---

## 7. Build, test, and release workflow (established with Cursor)

### Daily development

```bash
npm run dev          # client only (root package.json)
# OR separately:
npm run dev:client   # Vite :5173
npm run dev:server   # Express :3000
```

### TypeScript checks

```bash
cd server && npx tsc --noEmit
cd client && node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit
```

### Production build

```bash
npm run build:client
npm run build:server
npm run generate:templates   # regenerates xlsx import templates
npm run electron:build       # full Windows installer
```

**Installer output:** `dist-electron/PriceRight-Setup-{version}.exe`

### Release pattern (used for v1.0.0 – v1.0.12)

1. Bump version in **root**, `client/package.json`, `server/package.json`
2. `npm run electron:build`
3. `gh release create v1.0.X` with `.exe`, `latest.yml`, `.blockmap`
4. Commit version bump and push

### Import templates

- Generator: `scripts/generate-templates.js`
- Output: `client/public/templates/*.xlsx` (Instructions + Import Data sheets)
- Templates: Materials, Intermediates, Products
- **Do not** commit stale `client-dist/` without rebuilding if releasing

---

## 8. Chronological work log — Cursor-assisted builds

### Phase 0 — Pre-Cursor foundation (engineer work)

*Summarized from git history `862ad45` → `b872af6`.*

- SQLite schema and full pricing domain model
- All main pages and API endpoints
- Import/export, sample data, Settings downloads UI
- PIN screen, demo mode, welcome modal early versions
- Margin formula corrections (gross margin vs markup clarity)
- Product import, intermediate import, profit columns
- Electron 32.3.3 packaging, ESM fixes, cascade delete, bulk selects
- Catalog page removed; dead routes cleaned
- Base currency enforcement banners
- Sidebar record counts (Materials, Products, Price Levels)
- Form navigation blocker (`useBlocker`)
- Base currency lock once materials exist
- Two-step database reset + PIN clear in Danger Zone
- Price level duplicate; fixed amount add/deduct rules (replaced custom fixed price)
- Intermediate duplicate flow aligned with Materials/Products
- Table zoom, intermediate full-page detail, materials analysis 2-column layout
- `demo.db` packaging + template `/templates` route fix

---

### Phase 1 — Cursor entry: Phase 2 Electron fixes (26 May 2026)

**First Cursor prompt:** Full project handoff at v1.0.0 with four fixes.

| Fix | Delivered | Key commits |
|-----|-----------|-------------|
| **1. Tab defaults** | Materials→Primary, Products→Products, Settings→General (removed localStorage tab memory) | `c22d8a0` |
| **2. Download loading** | `useTemplateDownload` hook; buttons show loading state | `c22d8a0` |
| **3. XLSX templates** | `scripts/generate-templates.js` — two-sheet workbooks | `c22d8a0` |
| **4. Rebuild installer** | Phase D rebuild cycles | multiple |

**Critical bug fixed during this phase:**

- **better-sqlite3 ABI mismatch** in packaged Electron (`NODE_MODULE_VERSION 115` vs `128`)
- Rebuild for Electron before packaging; `051a8ac`, `scripts/install-electron-sqlite.js`

---

### Phase 2 — Stability fixes A–D (26 May 2026)

| Phase | Issue | Fix |
|-------|-------|-----|
| **A** | Base currency red banner didn’t clear until navigation | Immediate re-check after save — `31a9992` |
| **B** | PIN input unfocused after data reset in Electron | Increased focus delay / programmatic focus — `e4b424e` |
| **C** | Thin template instructions | Numbered steps, column guide, sample rows — `4310b40` |
| **D** | Rebuild + verify | Full installer rebuild |
| **Extra** | Notes column unwanted in intermediate/product templates | Removed from generator — `2bf0546` |
| **Extra** | Settings tab link from banner broken in hash router | `useSearchParams` — `79a8c00` |

---

### Phase 3 — Licensing & v1.0.0 production (late May 2026)

| Feature | Details | Commits |
|---------|---------|---------|
| Machine ID | `node-machine-id` in main process | `ba8a14c` |
| Licence IPC | check / trial / validate handlers | `ba8a14c`, `d0d584f` |
| Licence UI | Activation, Lock, Trial banner, key modal | `d0d584f` |
| Railway URL | Correct licence server hostname | `8786852` |
| Paystack | Payment link wired to lock/trial | `02ce531` |
| **v1.0.0 release** | Production installer | `1db2591` |

---

### Phase 4 — Auto-update & post-launch fixes (27–28 May 2026)

| Feature | Commit |
|---------|--------|
| `electron-updater` on launch | `5257744` |
| Update modal + restart | `990536f` |
| Auto-updater diagnostic logging | `5afd41a` |
| Notification bell (nav → later sidebar) | `d43b597` |
| Power icon replaces exit text | `70f315d` |
| **v1.0.1** | `da4b734` |
| Electron number input fix (`requestAnimationFrame`) | `2c5fa0c` |
| Product detail duplicate pricing cards unified | `ad6c7a9` |
| Demo mode `baseCurrency` setting key fix | `8a261b9` |
| `RECOVERY.md` business continuity guide | `74c63d1` |
| `demo.db` version force-update on change | `8450fc5` |

---

### Phase 5 — UI redesign “Concept C” (29 May – 1 Jun 2026)

Major visual overhaul across three sub-phases:

| Phase | Work | Commits |
|-------|------|---------|
| **Concept C** | Navy sidebar, white header, bell in sidebar | `f780986` |
| **UI Phase 1** | Navy tabs, button spacing, remove blue highlights | `9157a16` |
| **UI Phase 2** | Typography, spacing, buttons, input focus ring | `3043186` |
| **UI Phase 3** | Shadows, table headers, badges, scrollbars | `3431bb0` |
| Reports layout fixes | Panel width / bleed fixes | `beed725`, `ace3c83` |
| **v1.0.3 – v1.0.4** | | `94ebf65`, `13c4974` |
| Public repo | Removed GitHub token from auto-updater | `7f1b12e` |
| **v1.0.5** | | `fbf6b3e` |

**Typography:** Plus Jakarta Sans (loaded in `client/index.html` + `index.css`).

**Sidebar color:** `#0F2847` navy (`--color-header-bg`).

---

### Phase 6 — Pricing UX cleanup & density (1 Jun 2026)

| Change | Commit |
|--------|--------|
| Renamed “Update Prices” → “Review Prices” | `db4abf3` |
| Removed Review Prices panel (approval per product) | `a3965a9` |
| **v1.0.6** | `32b639d` |
| Dashboard stat card text overflow fix | `d1ab48c` |
| Compact layout (14px body, tighter cards/tables) | `772ab35` |
| **v1.0.7** | `a6b887a` |

---

### Phase 7 — Onboarding & guided setup (1 Jun 2026)

| Feature | Details | Commits |
|---------|---------|---------|
| Welcome modal | 4-step intro; sets `onboardingCompleted` in settings | `a1f07c5` |
| Onboarding bar | Persistent progress: materials → products → prices → price-levels | `a35fca3` |
| Empty states | Improved on Materials, Products, Price Levels | `a1f07c5` |
| **v1.0.8** | | `dc90b76` |

**Onboarding settings key:** `onboardingCompleted` = `'true'` | `'in_progress'` | unset

**Re-test onboarding:** delete row from `settings` where `setting_key = 'onboardingCompleted'` in `%APPDATA%/PriceRight/demo.db` or `priceright.db`.

---

### Phase 8 — Visual upgrade & sidebar polish (2–3 Jun 2026)

| Change | Commit |
|--------|--------|
| Navy sidebar tokens, colour-coded dashboard stat icons | `461d888` |
| Sidebar spacing/layout (260px width, brand/nav/footer rhythm) | `03eb0f6` |
| Demo pill in sidebar, realistic demo margins | `86ff45a` |
| **v1.0.9** | `58f6fe6` |

**Sidebar layout (post `03eb0f6`):**

- Width **260px**; `.app-main` offset matches
- Brand block → scrollable nav → footer strip (flex column, `100vh`)
- Help moved into Pricing nav group (below Activity)
- Count badges on Materials / Products / Price Levels nav items

---

### Phase 9 — Electron hardening & v1.0.11–1.0.12 (5–7 Jun 2026)

| Change | Commit |
|--------|--------|
| Verify Electron native modules at build time | `d128427` |
| Materials import fix + Electron modal focus | `4ade2ad` |
| TypeScript fix in Electron focus handler | `00a403c` |
| **v1.0.11** | `4ade2ad` |
| Intermediate materials fixes, supplier simplification, tab styling, PR branding | `1eb020d` |
| **v1.0.12** | `1eb020d` |

**Current logo:** `PriceRightLogoIcon.tsx` — orange gradient tile with skewed **PR** monogram.

---

### Phase 10 — Logo exploration (not shipped)

Cursor sessions explored many SVG logo options (acronym, price tag, chevron, 0.00 accuracy motifs). A temporary `#/logo-options` gallery page was created and **later removed** per user request. No gallery code remains in the repo.

A brief PNG logo experiment existed in an earlier chat ([Logo PNG upload](0375e027-36ac-46d8-9c50-c7e9bfa79f18)) and was removed ([Remove PNG logo](a12d55bc-6668-4096-8c2d-070742aa560d)).

---

## 9. Version release matrix

| Version | Tag | Highlights |
|---------|-----|------------|
| 1.0.0 | `v1.0.0` | Licence gate, Paystack, production release |
| 1.0.1 | `v1.0.1` | Auto-updater diagnostics |
| 1.0.3 | `v1.0.3` | Notification bell |
| 1.0.4 | `v1.0.4` | UI Phase 3 complete |
| 1.0.5 | `v1.0.5` | Public repo auto-update |
| 1.0.6 | `v1.0.6` | Review Prices panel removed |
| 1.0.7 | `v1.0.7` | Compact layout |
| 1.0.8 | `v1.0.8` | Onboarding flow |
| 1.0.9 | `v1.0.9` | Demo pill, sidebar polish |
| 1.0.11 | — | Import/focus fixes (commit `4ade2ad`) |
| 1.0.12 | — | Intermediate fixes, PR branding (commit `1eb020d`) |

*Note: v1.0.2, v1.0.10 tags may exist in history; primary release cadence followed `.exe` + `latest.yml` on GitHub.*

---

## 10. IPC surface (`electron/preload.js` → `window.electronAPI`)

| Channel | Purpose |
|---------|---------|
| `download-file` | Native save dialog + HTTP download (templates, exports) |
| `save-backup-file` | Write backup bytes to user-chosen path |
| `select-restore-file` | Open dialog + read backup for restore |
| `get-machine-id` | Licence identification |
| `check-licence` | Server + cached licence state |
| `activate-trial` | Email + machine trial activation |
| `validate-licence` | Licence key validation |
| `restart-and-update` | `autoUpdater.quitAndInstall()` |
| Update events | Forwarded to renderer for `UpdateModal` / notifications |

---

## 11. Pricing & approval concepts (for engineer continuity)

- **Markup vs margin:** Gross margin formula corrected early; UI distinguishes profit on cost vs profit on sales.
- **Price approval:** Per-product on `ProductDetail`; `approvalStatus`, `approvedPrice`, `approvedPriceExpiresAt` (shown as “Valid until”).
- **Price levels:** `adjustmentType` includes add/deduct fixed amounts; `custom_price` type removed (`b42abc1`).
- **Base currency:** Must be set before adding materials/products; locked once materials exist; global red warning banner in `App.tsx`.
- **Intermediate costing:** Yield vs fixed modes; import recalculates unit costs; BOM order fixes applied.

---

## 12. Files the next engineer should read first

| Priority | File | Why |
|----------|------|-----|
| 1 | `electron/main.js` | Server spawn, IPC, licence, auto-update |
| 2 | `server/src/index.ts` | All API behavior |
| 3 | `server/src/schema.ts` | Data model |
| 4 | `client/src/App.tsx` | Router, sidebar, PIN, onboarding, currency banner |
| 5 | `client/src/api.ts` | All frontend API calls |
| 6 | `scripts/generate-templates.js` | Import template format |
| 7 | `electron-builder.yml` | Packaging layout |
| 8 | `RECOVERY.md` | Disaster recovery |
| 9 | `client/src/context/OnboardingContext.tsx` | Setup guide state machine |

---

## 13. Cursor workflow conventions established

These patterns were used consistently across Cursor sessions:

1. **Read before write** — quote existing code before editing
2. **TypeScript check** after client/server changes
3. **`npm run build:client`** before installer builds
4. **Git commit per working fix** with descriptive messages
5. **Structured prompts** — user supplied `FIX 1`, `FIX 2` style instructions with verification steps
6. **Electron-specific testing** — packaged app behavior differed from browser (focus, ABI, hash router)
7. **Do not commit** `electron/main.js` token secrets (public repo uses unauthenticated GitHub releases)

---

## 14. Known issues & local WIP (as of 7 Jun 2026)

**Uncommitted local changes exist** beyond `1eb020d` (v1.0.12):

```
Modified: App.tsx, App.css, many pages, server/src/index.ts, ...
New: MaterialDataSyncContext.tsx, RefreshContext.tsx
```

Engineer should run `git status` and `git diff` before continuing — this handoff document does not describe uncommitted WIP in detail.

**Recurring Electron gotchas:**

- `better-sqlite3` ABI — always run `npm run rebuild:native` before `electron:build`
- PIN input focus after modal/reset — may need `requestAnimationFrame` / delayed `.focus()`
- Hash router — use `useSearchParams`, not `window.location.search` for Settings tabs
- `white-space: nowrap` on `.app-page button` caused dashboard card overflow (fixed in Dashboard with explicit overrides)

---

## 15. Saved Cursor conversation index

| Chat ID | Topic |
|---------|-------|
| [8906ad62-6e49-4d41-beb8-31840f4f3edd](8906ad62-6e49-4d41-beb8-31840f4f3edd) | **Main thread** — Phase 2 fixes through v1.0.12, sidebar, onboarding, releases |
| [0375e027-36ac-46d8-9c50-c7e9bfa79f18](0375e027-36ac-46d8-9c50-c7e9bfa79f18) | PNG logo upload experiment |
| [a12d55bc-6668-4096-8c2d-070742aa560d](a12d55bc-6668-4096-8c2d-070742aa560d) | PNG logo removal + follow-on work |

Transcripts live at:  
`C:\Users\HP\.cursor\projects\c-Users-HP-priceright\agent-transcripts\`

---

## 16. Suggested next steps for the original engineer

1. **Clone fresh** and compare to your last known good state pre-Cursor (`b872af6` or earlier).
2. **Read `git log b872af6..HEAD`** for the full Cursor-era delta (~40+ commits).
3. **Install v1.0.12** from GitHub Releases and run through:
   - PIN → onboarding → materials → products → price levels
   - Demo mode toggle
   - Backup / restore
   - Licence/trial (if Railway server live)
   - Auto-update check
4. **Reconcile uncommitted WIP** in local workspace before new release.
5. **Keep `RECOVERY.md` updated** when credentials or URLs change.

---

## 17. Quick reference commands

```bash
# Dev
npm run dev:client & npm run dev:server

# Typecheck
cd server && npx tsc --noEmit
cd client && node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit

# Templates
node scripts/generate-templates.js

# Full installer
npm run electron:build

# Release (after build)
gh release create v1.0.13 dist-electron/PriceRight-Setup-1.0.13.exe \
  dist-electron/latest.yml dist-electron/PriceRight-Setup-1.0.13.exe.blockmap \
  --title "PriceRight v1.0.13" --notes "..." --repo KwakuAsamoah/priceright
```

---

*Document generated from git history, preserved Cursor transcripts, and current codebase inspection. For operational recovery procedures see `RECOVERY.md`. For deployment modes see `README.md` and `DEPLOY_RENDER_VERCEL.md`.*
