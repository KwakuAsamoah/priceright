# PriceRight — Project Progress

**Last updated:** 9 June 2026
**Current version:** 1.0.18
**Active branch:** main

---

## Project Overview

PriceRight is a desktop pricing management
application for product manufacturers.
Built with Electron 32.3.3, React 18,
TypeScript, Node.js/Express, SQLite.

**Company:** TheRightHub
**Website:** www.therighthub.com
**Support:** hello@therighthub.com
**Payment:** https://paystack.shop/pay/4bsuzaofbj

---

## Repository Structure

| Repo | URL | Purpose |
|------|-----|---------|
| Main app | github.com/KwakuAsamoah/priceright | Desktop app (PUBLIC) |
| Licence server | github.com/KwakuAsamoah/priceright-licence-server | Trial and licence backend |
| Landing page | github.com/KwakuAsamoah/priceright-landing | Website |

---

## Live Services

| Service | URL | Status |
|---------|-----|--------|
| Licence server | web-production-136f6.up.railway.app | Live |
| Admin dashboard | web-production-136f6.up.railway.app/admin?key=SECRET | Live |
| Landing page | www.therighthub.com | NOT YET DEPLOYED |

---

## Current Version History

| Version | Date | Key changes |
|---------|------|-------------|
| v1.0.0 | May 2026 | Initial release |
| v1.0.1 | May 2026 | Version display in Settings |
| v1.0.2 | May 2026 | Notification bell |
| v1.0.3 | May 2026 | Licence gate UI |
| v1.0.4 | May 2026 | Token removed, repo public |
| v1.0.5 | May 2026 | Auto-updater test |
| v1.0.6 | May 2026 | Review Prices panel removed |
| v1.0.7 | May 2026 | Compact layout |
| v1.0.8 | May 2026 | Onboarding welcome modal |
| v1.0.9 | May 2026 | Visual upgrade — navy, Plus Jakarta Sans |
| v1.0.10 | May 2026 | Sidebar spacing |
| v1.0.11 | Jun 2026 | Materials import fix, Electron modal focus |
| v1.0.12 | Jun 2026 | PR branding, supplier simplification, tab styling |
| v1.0.13 | Jun 2026 | Version bump |
| v1.0.14 | Jun 2026 | Intermediate material auto-recalc cascade fix |
| v1.0.15 | Jun 2026 | Drawer/modal button UX, tab highlights |
| v1.0.16 | Jun 2026 | New app icon, branding updates |
| v1.0.17 | Jun 2026 | Hotfix — sidebar logo path for Electron `file://` |
| v1.0.18 | Jun 2026 | Maintenance — API_BASE fix, PNG cleanup, console.log removal |

---

## What Is Built

### Core Features
- [x] Materials CRUD (primary and intermediate)
- [x] Intermediate material BOM with cascade cost recalc
- [x] Products CRUD with bill of materials
- [x] Production cost calculation per unit
- [x] Price approval workflow (per product and bulk)
- [x] Price levels with rules and product overrides
- [x] Price approval wizard
- [x] 5 analytical reports with Excel/PDF export
- [x] Activity log
- [x] Import/Export (CSV and XLSX templates)
- [x] Backup and restore
- [x] Demo mode with realistic seed data
- [x] Multi-currency support with exchange rates

### Settings
- [x] General settings
- [x] Pricing engine configuration
- [x] Currencies and exchange rates
- [x] Master data management
- [x] Data and backups
- [x] Advanced settings

### Licence System
- [x] 14-day trial activation via email
- [x] Trial countdown banner
- [x] Lock screen on expiry with data export
- [x] Paystack payment integration
- [x] Licence key generation via webhook
- [x] Licence key email delivery (Resend)
- [x] Licence validation and machine binding
- [x] Offline grace period (3 launches)
- [x] Admin dashboard on Railway

### Electron Desktop
- [x] Windows installer (NSIS)
- [x] Auto-updater with notification bell
- [x] PIN security screen
- [x] Native file save dialogs
- [x] Demo database packaging
- [x] Native module verification pipeline
- [x] IPC handlers for licence, download, backup

### UI and UX
- [x] Dark navy sidebar (#0F2847)
- [x] Plus Jakarta Sans typography
- [x] Compact layout throughout
- [x] Colour-coded dashboard stat cards
- [x] Onboarding welcome modal
- [x] 4-step persistent onboarding guide
- [x] Notification bell for app updates
- [x] Demo pill in sidebar footer
- [x] Power button exit
- [x] Red arrow app icon (sidebar, favicon, Windows taskbar via `icon.ico`)

---

## Pending — High Priority

- [ ] Deploy landing page to Hostinger
- [x] Commit and release new logo (v1.0.16)
- [ ] Paystack live mode — complete business verification
- [ ] Code obfuscation — protect business logic
- [x] Fix hardcoded localhost:3000 in Settings and LockScreen
- [x] Compress logo PNG assets (~2MB in client/public)

## Pending — Medium Priority

- [ ] Privacy policy and terms of service
- [ ] WhatsApp number in website footer
- [ ] Backup reminder — periodic prompt in app
- [ ] Restore backup — full end to end test
- [ ] Trial expiry — test day 15 lock screen
- [ ] Crash/error reporting (Sentry)
- [ ] Rate limiting on licence server endpoints

## Pending — Low Priority

- [ ] Keyboard shortcuts guide in Help page
- [ ] Print/PDF export of price lists
- [ ] Refactor monolithic page files (2000+ lines)
- [ ] Clean up dead schema tables (customers, special_pricing)
- [ ] Multi-user/network version planning
- [ ] Cloud version architecture planning
- [x] Final logo decision and implementation

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Hardcoded localhost:3000 in Settings backup/restore | Medium | Fixed v1.0.17 |
| Hardcoded localhost:3000 in LockScreen | Medium | Fixed v1.0.17 |
| Logo PNG assets ~2MB in client/public | Low | Fixed v1.0.18 |
| Products.tsx 2525 lines — maintenance risk | Low | Future refactor |
| Materials.tsx 2458 lines — maintenance risk | Low | Future refactor |
| console.log in download.ts line 11 | Low | Fixed v1.0.18 |
| demo-mode.json committed as local state | Low | Fixed v1.0.18 |
| v1.0.16 sidebar logo broken in packaged app | High | **Fixed in v1.0.17** (`1109771`) |

---

## Engineer Handoff — v1.0.16 → v1.0.17 Logo Regression

**Reported:** 9 Jun 2026 — sidebar showed broken-image placeholder after v1.0.16 install.

**Symptom:** `PriceRightLogoIcon` `<img>` failed to load in production Electron only; dev via Vite (`localhost:5173`) could appear fine.

**Root cause:**
- `client/vite.config.ts` sets `base: './'` (required for `loadFile()` / hash router in Electron).
- v1.0.16 introduced `src="/priceright-icon.png"` (absolute URL).
- Packaged app loads `file:///.../client-dist/index.html`; absolute `/priceright-icon.png` resolves to filesystem root, not `client-dist/`.
- Asset file **was** present in `client-dist/priceright-icon.png` (copied from `client/public/` by Vite) — path resolution was wrong, not a missing file.

**Fix (commit `1109771`):**
```tsx
// client/src/components/PriceRightLogoIcon.tsx
const brandIconUrl = `${import.meta.env.BASE_URL}priceright-icon.png`;
```
Also `client/index.html` favicon → `./priceright-icon.png`.

**Prevention:** For any static asset in Electron + Vite builds, always use `import.meta.env.BASE_URL` or import from `src/assets/` — never root-absolute `/...` paths.

**Releases:**
| Version | GitHub | Notes |
|---------|--------|-------|
| v1.0.16 | github.com/KwakuAsamoah/priceright/releases/tag/v1.0.16 | Logo assets added; **broken sidebar in prod** |
| v1.0.17 | github.com/KwakuAsamoah/priceright/releases/tag/v1.0.17 | Hotfix; mark **Latest** |

**Installer:** `dist-electron/PriceRight-Setup-1.0.17.exe` (~105 MB)

**Open follow-ups for engineering:**
1. Replace hardcoded `localhost:3000` in Settings/LockScreen with `API_BASE` or IPC.
2. ~~Optimise/remove legacy 1 MB `priceright-logo-icon.png` / wordmark in `client/public/`.~~ Done — files removed.
3. Add smoke test: launch packaged build and assert sidebar logo image `naturalWidth > 0`.

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Electron + Express (not cloud-first) | Works offline, no server costs for users, simpler for food manufacturers |
| SQLite over PostgreSQL for app data | Single user, no network, zero config for end users |
| Licence server on Railway | Separate from app, always available, easy to manage |
| GitHub releases for auto-updates | Free, reliable, integrates with electron-updater |
| Resend for email | Free tier sufficient, verified domain support |
| Paystack for payments | Ghana-first, supports mobile money, no USD fees |
| Public GitHub repo | Required for auto-updater to work without token management |
| Vite `base: './'` for Electron | Relative asset URLs required when using `loadFile()`; absolute `/` paths break `file://` |

---

## Architecture Notes

### Database paths (production Electron)
- Live data: `%APPDATA%\PriceRight\priceright.db`
- Demo data: `%APPDATA%\PriceRight\demo.db`
- Licence state: `%APPDATA%\PriceRight\licence.json`
- Demo version: `%APPDATA%\PriceRight\demo.db.version`

### Ports
- Express server: `localhost:3000`
- Vite dev server: `localhost:5173`

### Build commands
- Dev: `npm run dev`
- Client build: `npm run build:client`
- Server build: `npm run build:server`
- Full installer: `npm run electron:build`

### Release command (always include all 3 files)
gh release create vX.X.X
"dist-electron\PriceRight-Setup-X.X.X.exe"
"dist-electron\latest.yml"
"dist-electron\PriceRight-Setup-X.X.X.exe.blockmap"
--title "PriceRight vX.X.X"
--notes "Release notes"
--repo KwakuAsamoah/priceright

### Demo DB versioning
- `DEMO_DB_VERSION` in `electron/main.js`
- Bump this constant whenever `server/demo.db` changes
- Forces reinstall of demo database on next app launch

---

## How to Update This File

Update PROGRESS.md whenever:
- A new feature is completed — move from Pending to Built
- A bug is fixed — update Known Issues
- A new issue is discovered — add to Known Issues
- A key decision is made — add to Key Technical Decisions
- A new version is released — add to Version History

---
