# PriceRight — Business Continuity & Recovery

## If you need to set up on a new machine

### Prerequisites — install these first
- Git: https://git-scm.com
- Node.js 22: https://nodejs.org
- VS Code or Cursor: https://cursor.com

### Clone and run in development

  git clone https://github.com/KwakuAsamoah/priceright
  cd priceright
  npm install
  cd client && npm install && cd ..
  cd server && npm install && cd ..
  npm run dev

App runs at http://localhost:5173

### Build the Electron installer

  npm run electron:build

Installer output:
  dist-electron/PriceRight-Setup-1.0.0.exe

### Publish a new release (triggers auto-update)

  gh release create v1.0.X \
    "dist-electron\PriceRight-Setup-1.0.X.exe" \
    --title "PriceRight v1.0.X" \
    --notes "Release notes here" \
    --repo KwakuAsamoah/priceright

---

## Services and credentials needed

| Service | URL | Purpose |
|---------|-----|---------|
| GitHub | github.com/KwakuAsamoah | Source code |
| Railway | railway.app | Licence server hosting |
| Resend | resend.com | Email delivery |
| Paystack | dashboard.paystack.com | Payments |
| Hostinger | hostinger.com | Domain and website |

---

## Repositories

| Repo | URL | Purpose |
|------|-----|---------|
| Main app | github.com/KwakuAsamoah/priceright | Desktop app |
| Licence server | github.com/KwakuAsamoah/priceright-licence-server | Trial and licence backend |
| Landing page | github.com/KwakuAsamoah/priceright-landing | Website |

---

## Licence server recovery

If Railway project is lost:

  git clone https://github.com/KwakuAsamoah/priceright-licence-server
  cd priceright-licence-server

1. Create new Railway project from this repo
2. Add PostgreSQL database
3. Set environment variables (see below)
4. Run migrations: railway run npm run db:migrate

### Environment variables for Railway

Retrieve current values from Railway dashboard.
Variables needed:
  DATABASE_URL        — provided by Railway PostgreSQL
  RESEND_API_KEY      — from resend.com dashboard
  PAYSTACK_SECRET_KEY — from Paystack dashboard
  INTERNAL_SECRET     — custom secret string
  ALLOWED_ORIGINS     — comma separated allowed domains
  NODE_ENV            — production

---

## Landing page recovery

  git clone https://github.com/KwakuAsamoah/priceright-landing

Deploy: upload index.html and assets/ folder
to Hostinger File Manager → public_html

---

## Key URLs

  App download:
    github.com/KwakuAsamoah/priceright/releases

  Licence server:
    web-production-136f6.up.railway.app

  Payment page:
    paystack.shop/pay/4bsuzaofbj

  Website:
    www.therighthub.com

---

## Weekly backup reminder

In PriceRight app:
  Settings → Data and Backups → Create manual backup
Save backup file to Google Drive or Dropbox.

---

## Recovery time estimate

Fresh machine to fully operational: 30 minutes
- Clone and install dependencies: 10 min
- Configure environment: 10 min
- Build installer: 10 min
