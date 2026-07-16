# PriceRight — Project Progress

**Last updated:** 16 July 2026
**Current version:** 1.0.42
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
| v1.0.20 | Jun 2026 | Sticky headers, Markup/Gross Margin rename, tooltips |
| v1.0.22 | Jun 2026 | Help centre overhaul, UI consistency phases 1-3 |
| v1.0.23 | Jun 2026 | Activity log userId/userName for future multi-user support |
| v1.0.24 | Jun 2026 | Backup/restore fixes, lock screen UX, demo mode guards |
| v1.0.25 | Jun 2026 | Print/PDF export, privacy policy, backup reminder, lock screen fixes |
| v1.0.26 | Jun 2026 | Fix Batch Yield decimal values |
| v1.0.27 | Jun 2026 | Product Detail UX — independent panel scroll, prominent approval buttons, unified cost breakdown |
| v1.0.28 | Jun 2026 | Optimal vs Actual Markup/Margin labeling, Products column selector |
| v1.0.29 | Jun 2026 | Column selector on all tables, removed broken Table Settings menu |
| v1.0.30 | Jun 2026 | New brand mark, landing page redesign |
| v1.0.31 | Jul 2026 | Global currency support, multi-currency price levels, pack quantity pricing, prev/next drawer navigation, price level fixes, table/report alignment and font standardisation, input freeze fix |
| v1.0.32 | Jul 2026 | Reports and Analysis overhaul, ten new reports, Material Detail page, creation overlays, price level UX, approval workflow redesign, UI standardisation, settings reorganisation, styled modals, help centre expansion |
| v1.0.33 | Jul 2026 | Comprehensive audit pass (Groups 1–18): export fixes, markup terminology, demo data, Electron improvements, UI consistency, Material Detail usage tab, Markup Health popover, price level cost-change warnings |
| v1.0.34 | Jul 2026 | Most polished release — calculation safety, data safety, export standardisation, performance (N+1 fixes, chunked Excel), error handling, auto-updater timeout and rollback path, help centre overhaul (65 articles), UI polish |
| v1.0.35 | Jul 2026 | React error #31 fixes, Electron print, export column cleanup, 2dp formatting, error boundaries, Help article print, undo toast fix, price level Excel alignment |
| v1.0.36 | Jul 2026 | Professional jsPDF exports, company name in PDF headers, export consistency, error boundaries and help article, UI polish, 66 help articles |
| v1.0.37 | Jul 2026 | Window stability (bounds validation, atomic state write, single instance lock), BOM search/select alignment, content clipping fixes, table font standardisation |
| v1.0.38 | Jul 2026 | Visual compacting fix (zoom/density removed), creation panel layout and BOM column fixes — see v1.0.39 note below |
| v1.0.39 | Jul 2026 | Corrected release — fixes v1.0.38 version conflict; confirms zoom removal and all v1.0.38 fixes in one build |
| v1.0.40 | Jul 2026 | Direct Labor Cost, Other Direct Costs UI, unified intermediate costing, sub-recipe BOM preview, needs_review for labor, help article updates |
| v1.0.41 | Jul 2026 | Unskippable base currency gate, currency/empty-state bug fixes, dynamic Help currency, costing guide article, UI polish |
| v1.0.42 | Jul 2026 | Export toolbar consolidation — CSV/Excel/PDF under single Export menu; Print stays standalone |

---

## v1.0.42 — Detailed Changes

**Released:** 16 July 2026

### Cleaner export toolbar

- Export buttons (CSV, Excel, PDF) are now grouped into a single Export menu on Products, Materials, Intermediate Materials, and Reports — reducing toolbar clutter
- Print remains its own one-click button on every page, unchanged
- Price Levels keeps its Export Selected to Excel action separate from the format picker, since it does something different (exports only your checked rows)
- No changes to what any export actually contains — same data, same formatting, just fewer buttons to scan

---

## v1.0.41 — Detailed Changes

**Released:** 16 July 2026

Base currency safeguard on first launch, bug fixes it surfaced, Help documentation improvements, and small UI polish.

### New: unskippable base currency setup
- App requires a base currency before use — closes gaps that let a currency-less state slip through
- Fixed: Intermediate Materials saved with hardcoded, potentially incorrect currency ID
- Fixed: Add buttons on Products and Intermediate Materials reachable before currency was set
- Server fails clearly instead of silently guessing currency when none is configured

### Help documentation
- Help articles display amounts in the user's configured base currency (not a fixed code)
- New article: *Simple or detailed costing: which should you use?* — labor vs flat overhead guidance

### Polish
- Missing close button on product delete confirmation modal
- Discard confirmation when closing new Intermediate Material create panel
- Consistent Save Intermediate / Save Product button labeling
- Reports page header layout aligned with Products (MarkupHealthPopover beside help)

### Infrastructure note
- Northflank licence server migration in progress — database addon created, backup schedule and app service deployment still pending

---

## v1.0.40 — Detailed Changes

**Released:** 11 July 2026

Direct Labor Cost, simplified Intermediate recipe costing, Other Direct Costs UI, BOM improvements, and help documentation updates shipped after v1.0.39.

### New: Direct Labor Cost
- Products and Intermediate Materials now have a Direct Labor Cost field, distinct from Overhead
- Overhead is calculated on Materials plus Direct Labor combined
- Editing Direct Labor Cost on an approved product correctly triggers Needs review

### New: Other Direct Costs (Products)
- One-off product-specific costs (packaging, certification, per-batch consumables) added after overhead
- Input field on Product creation panel and edit drawer (previously display-only on detail when non-zero)

### Simplified: Intermediate Material recipe costing
- Replaced Completed Output vs Yield-based toggle with a single question: how much finished product did this batch make
- Exact quantity or percentage — kept in sync automatically

### Improved: Bill of Materials
- Unified search-and-select flow for Products and Intermediate Materials
- Edit button on every BOM row in both places
- Sub-recipe badge for Intermediate Materials nested in Product BOMs — inline expand preview with View full details →
- Nested Intermediate cost changes correctly flag products for review
- Creation panel layout fixes (names, actions, alignment)

### Fixed / removed (carry-forward confirmation)
- **Zoom/density toggle feature removed entirely — do not reintroduce without addressing the original minimize/restore visual bug it caused**
- **Bulk CSV import removed for Products and Intermediate Materials — Materials (raw/primary) only going forward, unless revisited**
- Add button on Products and Intermediate Materials opens creation form with a single click
- Random window resizing between sessions fixed earlier; still in effect
- Help articles updated for BOM flow, Direct Labor / Other Direct Costs, sub-recipe badge, Add button, and needs_review triggers

---

## v1.0.39 — Detailed Changes

**Released:** 10 July 2026

### Why v1.0.39 exists

v1.0.38 was published twice under the same version number. The first build (9 July) did not include the zoom removal fix. A second build was uploaded to the same GitHub release tag (10 July), but the auto-updater compares version numbers only — users already on v1.0.38 were not offered the corrected build. **v1.0.39 is the definitive release** with a new version number so the auto-updater can detect it.

**Lesson learned:** Never republish assets to an existing release tag after making additional code changes. Always bump the version number for any new build.

### Confirmed included (everything from v1.0.38)

**Fixed: App visual compacting bug**
- In-app table zoom feature removed entirely
- Density toggle (compact/comfortable view) removed entirely
- App renders at consistent visual size after minimize/restore
- Users can use standard Electron zoom with Ctrl+scroll if needed

**New Product and Intermediate Material creation panels**
- Right panel width fixed to fit BOM table comfortably
- Search box, BOM table, and Cost Summary aligned at the same width
- BOM table column widths fixed — material names no longer wrap awkwardly
- Delete button no longer overflows the panel border
- Production Mode toggle shows green for active state
- SKU field removed from New Product form
- Cost Summary in Intermediate Material panel labelled Markup instead of Profit
- Edit button added to Intermediate Material BOM rows
- Showing X of X materials text only appears when searching

**Window stability**
- Saved window bounds validated against current screen before applying
- Window position clamped to visible screen area
- Window dimensions clamped to minimum 800×600 on restore
- Window state file uses atomic write — prevents corruption
- Single instance lock — opening PriceRight twice focuses existing window

---

## v1.0.38 — Detailed Changes

**Released:** 10 July 2026

Critical stability fix, creation panel improvements, and window stability shipped after v1.0.37.

### Fixed: App visual compacting bug
- Removed the in-app table zoom feature that caused the app to appear compacted after minimizing and restoring the window
- Removed the density toggle (compact/comfortable view) feature
- The app now renders at a consistent visual size at all times
- Users who want to zoom can use standard Electron zoom with Ctrl+scroll

### New Product creation panel
- Right panel width adjusted to fit BOM table comfortably — no more overflow
- Search box, BOM table, and Cost Summary all aligned to the same width
- BOM table headers no longer overflow their container
- Production Mode toggle now shows green for active state
- SKU field removed from creation form — less clutter
- Description field reduced to 2 rows
- BOM table column widths fixed — material names no longer wrap awkwardly
- Delete button no longer overflows the panel border

### New Intermediate Material creation panel
- Same right panel alignment fixes applied
- Showing X of X materials text only appears when user is searching
- Cost Summary now correctly shows Markup instead of Profit
- Completed Output Quantity field has amber hint — must be greater than zero
- Edit button added to BOM rows — consistent with Products panel

### BOM interaction improvements
- Both creation panels now use the same search and select pattern
- Type to search — results appear as dropdown
- Click to add immediately — quantity input appears inline
- Edit and Delete buttons on every BOM row in both panels

### Window stability
- Saved window bounds validated against current screen before applying
- Window position clamped to visible screen area — handles monitor changes gracefully
- Window dimensions clamped to minimum 800×600 on restore
- Window state file uses atomic write — prevents corruption during rapid resizing
- Single instance lock — opening PriceRight twice focuses the existing window

### Font standardisation
- Table header cells standardised to 12px across all pages
- Table body cells standardised to 13px across all pages

---

## v1.0.37 — Detailed Changes

**Released:** 9 July 2026

Window stability, BOM improvements, and UI polish shipped after v1.0.36.

### Window resizing fix
- Window no longer resizes randomly between sessions
- Saved window bounds validated against current screen displays before applying
- Window position clamped to visible screen area — handles monitor unplugging gracefully
- Window dimensions clamped to minimum values (800×600) on restore
- Window state file uses atomic write — prevents corruption during rapid resizing
- Single instance lock added — opening PriceRight twice focuses the existing window

### BOM improvements
- ProductCreatePanel BOM material selection now works the same as Intermediate Materials
- Search materials as you type — results appear in a dropdown
- Click a result to add immediately — quantity input appears inline in the table row
- Edit button added to Intermediate Materials BOM rows — consistent with Products
- Both creation panels now have identical BOM interaction patterns

### Content clipping fixes
- ProductCreatePanel overlay expanded to 92vw — all BOM columns fully visible
- BOM panel width increased to 560px — no more clipping of Actions column
- IntermediateCreatePanel same expansion applied
- ProductFormDrawer width increased to 600px — BOM table fully visible
- `overflow: hidden` removed from all BOM table containers
- `.app-table-wrap` overflow changed from hidden to visible

### Font standardisation
- Table header cells standardised to 12px across all pages
- Table body cells standardised to 13px across all pages
- Consistent font sizing across Products, Materials, Price Levels, Reports, Activity

### PDF company name
- Company name from Settings → Your Business appears in all PDF export headers
- PDF exports include company name, report title, generation date, and page numbers

### Error boundaries
- Tab-level error boundaries added to IntermediateDetail BOM and Cost History tabs
- ProductDetail History tab wrapped in error boundary
- Friendly error messages shown instead of page crashes

### Help articles
- 66 articles — 20 updated, 1 new (When something goes wrong)
- All articles updated to describe PDF exports correctly
- Browse by topic category counts are now dynamic and always accurate

---

## v1.0.36 — Detailed Changes

**Released:** 9 July 2026

Professional PDF exports, error protection, and quality improvements shipped after v1.0.35.

### PDF and print overhaul
- All print and PDF exports now use jsPDF and autoTable for professional output
- Company name from Settings appears in every PDF header
- Navy blue column headers, alternating row colours, page numbers on every page
- All numeric values formatted to two decimal places
- Print button generates a downloadable PDF — no browser print dialog
- Help articles now have a Print article button that generates a clean PDF

### Export consistency
- All four export formats (CSV, Excel, PDF, Print) have identical columns per section
- SKU, Description, and Active status removed from all exports
- Currency shown as a dedicated data column — no currency codes in headers
- Approval History CSV column order now matches Excel
- Price Levels PDF includes price level name and export date as subtitle
- Intermediate Materials PDF includes Costing Method column
- Export Selected button renamed to Export Selected to Excel for clarity

### Error protection
- Error boundaries added to all tabs — a tab failure shows a friendly message not a page crash
- New help article: When something goes wrong — explains error messages and recovery
- Type safety guards prevent React object rendering errors throughout the app
- Unsaved changes warning when closing product edit forms mid-edit

### UI improvements
- Help article header redesigned as two rows — Back and Prev/Next on top, title and Print below
- Price Levels empty state now has a Create your first price list button
- Intermediate Materials empty state now has a Create your first intermediate material button
- Intermediate Detail page now has a help button
- Bulk approve undo toast redesigned — red Undo on left, green Keep on right
- Activity page print fixed — generates PDF correctly

### Help articles
- 66 articles total — 20 updated, 1 new
- All articles updated to describe PDF exports correctly
- Backup recommendation, version history, exchange rate validation documented
- Company branding, pack size validation, markup health guide all updated
- Browse by topic category counts are now dynamic and always accurate

### Settings
- Company name from Settings now appears in all PDF export headers
- Version history section shows current version and link to all releases

### Code quality
- Console.log statements removed from production client code
- Dead code cleaned up

---

## v1.0.35 — Detailed Changes

**Released:** 8 July 2026

Bug fixes and quality improvements shipped after v1.0.34.

### Bug fixes
- Fixed React error when viewing material usage — objects now rendered correctly with product name and quantity
- Fixed print functionality across all pages — native Electron print dialog now opens correctly
- Fixed Activity page print — was using browser print which does not work in Electron
- Fixed Currency column alignment in Price Level Excel export — values now correctly aligned under headers
- Fixed undo toast after bulk approve — confusing button order and wording corrected

### Export improvements
- Removed unnecessary columns from all exports — SKU, Description, and Active status no longer exported
- All numeric values standardised to 2 decimal places across all export formats
- Export Selected button in Price Levels renamed to Export Selected to Excel for clarity

### Error handling
- Error boundaries added at page and tab level — a single component failure no longer crashes the entire page
- Type safety guards added across all API data rendering — prevents object rendering errors
- Shared safeRender utility added for defensive text rendering

### Help page
- Print article button added to all help articles
- Print CSS added — printing an article shows only the article content, no navigation

### Code quality
- Dead code removed from multiple files
- Console.log statements removed from production client code
- All confirmed React error #31 sources fixed

---

## v1.0.34 — Detailed Changes

**Released:** 8 July 2026

The most thoroughly tested and polished release — comprehensive quality, safety, and performance update covering audit Groups A–I.

### Calculation safety (Group F)
- Exchange rate of zero rejected on POST/PUT — prevents material costs being zeroed out
- Markup calculation returns null safely when cost is zero — no Infinity values
- Batch yield of zero uses safe divisor — production cost never crashes
- Pack size of zero rejected — prevents NaN in pack price calculations

### Data safety (Groups F, G)
- Backup recommendation shown before Restore and Clear All Data actions
- Download backup first button in all destructive action modals
- Unsaved changes warning on ProductFormDrawer and ProductCreatePanel
- Navigation blocked when form has unsaved changes

### Export improvements (Groups B, C, D)
- All four export formats (CSV, Excel, PDF, Print) have identical columns per section
- Currency column added to all exports — no ambiguity about which currency prices are in
- Currency codes removed from column headers — universal format for any country
- Export toolbar standardised across all pages — consistent labels and icons
- Materials, Products, Intermediate Materials, and Price Level exports fully standardised

### Performance (Group H)
- Top Cost Drivers and Price Volatility reports use optimised server JOIN queries — N+1 eliminated
- Products list query selects only needed columns
- Excel export processes in chunks — UI stays responsive during large exports
- Loading skeletons on Material Detail and Intermediate Detail pages

### Error handling (Groups E, F)
- Friendly error dialog when Express server fails to start
- Automatic retry before showing error
- Error handling added to previously silent API failures in Reports and Materials
- User-friendly error messages throughout

### Auto-updater improvements (Group I)
- Update check has 10-second timeout — app never hangs waiting for update server
- View release history button in update notification dialog
- Version history section in Settings → Data tab with link to all releases
- Rollback path documented for users who need to downgrade

### Help articles
- 65 articles fully updated — all outdated references removed
- 13 new articles added covering new features
- Broken related article links fixed
- All gross margin references updated to markup terminology
- Reading time estimates removed

### UI improvements
- ProductDetail help button added
- Gross margin column removed from Margin Health report table
- Dynamic markup threshold used consistently in Price Levels
- Dead code cleaned up across Reports and Price Levels
- Console.log statements removed from production client code
- Button labels standardised across all modals
- Toast messages use consistent markup terminology

### Settings
- Version history section at bottom of Data & Backups tab
- Backup download button in destructive action modals

---

## v1.0.33 — Detailed Changes

**Released:** 5 July 2026

Comprehensive quality and consistency update covering Groups 1 through 18.

### Activity page (Group 1)
- Removed Reject from filter dropdown — replaced with Reset to Pending
- Approval entries show Markup % instead of Gross Margin %
- Zoom control, help button, and filter chips added
- Clear filters button in empty state

### Onboarding (Group 2)
- Set base currency is now the first step
- Removed references to removed features

### Demo data (Group 3)
- All product markups above healthy threshold
- Added 3 intermediate materials — Spice Blend, Tomato Base Sauce, Cream Mixture
- Pack sizes on all price level products
- Realistic exchange rates with 4 decimal places

### Intermediate Materials (Groups 4, 18)
- Full page detail view matching Product Detail and Material Detail quality
- Two-column layout with BOM tab and Cost History tab
- Markup-on-cost terminology throughout
- Help button added
- Excel export includes Yield % column after Unit

### Products and ProductFormDrawer (Groups 5, 15)
- Actual Markup % row in creation panel cost summary
- Prev/next hint uses shared localStorage key
- Close button aligned to standard pattern
- Export column order matches UI table; gross margin columns labelled (reference)

### Price Levels (Groups 12, 16)
- Cost change warning badge when product costs changed since approval
- Amber badge with AlertTriangle icon — click to review product
- Excel export shows currency in header row and column labels

### Settings (Group 8)
- Default Markup % description added
- Healthy markup threshold description explains all three bands with example
- Category inputs replaced with chip-based tag editor

### Reports and Analysis (Group 14)
- Markup Analysis export header shows target threshold
- Price Volatility export includes period label
- Top Cost Drivers export includes % of Total Cost column
- Approval History export uses readable date format (e.g. 15 Jun 2026)
- All markup formulas consistent across report exports (markup on cost)

### Export fixes (Groups 14–18)
- Products: column order matches UI, gross margin columns labelled (reference)
- Price Levels Excel: currency in header and column labels
- Materials Excel: base currency unit cost column added
- Intermediate Materials Excel: yield percentage column added

### Material Detail (Groups 9, 13)
- Usage tab shows BOM quantity and unit — product names clickable
- Help button added

### Dashboard (Group 7)
- Help button on loading state
- Below Markup Target link pre-selects Markup Analysis report

### Markup Health popover (Groups 11)
- Replaced fixed bottom-right legend card with smart toolbar info button
- Popover opens above or below depending on screen position
- Available on Dashboard, Products, Reports, Product Detail

### Electron (Group 10)
- Window size and position persisted between sessions
- Auto-updater notification shows version number
- Console.log wrapped in development-only condition

### Server and database
- rejection_reason column documented as deprecated
- Database indexes on frequently queried columns
- Material usage API returns BOM quantity alongside product name
- Approval endpoint stores markupPercent as primary metric

### Global currency (Group 6)
- Central currency utility and useBaseCurrency hook
- formatMoney/formatCurrency functions use configured base currency throughout app

---

## v1.0.32 — Detailed Changes

**Released:** 4 July 2026

### Navigation and discovery
- Reports renamed to Reports and Analysis with three groups: Pricing, Products, Materials
- Ten new reports and analysis views across Products and Materials groups
- Reports auto-generate when selected — no Generate button needed
- Filter chips visible above all report results
- Paginated report tables — 15 rows per page

### Creation experience
- New product and intermediate material creation as floating two-panel overlay
- Single-step intermediate material creation — add BOM items before saving
- Full-page Material Detail view at `/materials/:id` matching Product Detail quality
- Previous/Next navigation on Material Detail

### Price levels
- Pack size management moved to single toolbar button with Previous/Next navigation
- Pack sizes now manageable from the Edit price modal
- Export price lists show customer-facing columns only — no internal data
- Currency shown on all price list exports and print
- Pack size of 1 now accepted
- Floating point precision fixed — pack prices always exact

### Products and approvals
- Approval form redesigned — one primary Approve button with expander for other options
- Approved Base Price always shows the official approved price only
- Activity and Price History combined into single History tab
- Bulk approve defaults to Approve at Optimal Price
- Pending products approval banner on Products page
- Clean default column set — 6 columns shown by default

### Reports and analysis
- Margin calculations standardised across all views
- Low margin threshold consistent across Dashboard, Products, and Reports
- Product Pricing Overview combining approval status and margin health
- Profitability Ranking, Price vs Cost Drift, Optimal vs Actual Gap reports
- Materials Cost Analysis, Top Cost Drivers, Price Volatility, Material Price History, Inactive in Active BOMs reports

### UI improvements
- Zoom control added to Reports and Analysis page
- Density toggle removed — zoom handles row spacing
- Bulk action bars standardised across all list pages
- Filter chips on Products, Materials, Intermediate Materials, and Reports
- All native browser dialogs replaced with styled modals
- Clear filters button in all empty states
- Pending products banner with one-click bulk approve
- Row hover highlight and clickable names on all list pages

### Settings
- Settings tabs grouped into Everyday and Advanced
- Pricing Engine unified into one card
- Company branding description updated

### Other
- Reject feature replaced with Reset to Pending
- Price history and Activity combined into History tab on Product Detail
- Floating point precision fixed throughout price level calculations
- Help articles updated and expanded to 52 articles

---

## v1.0.31 — Detailed Changes

**Released:** 2 July 2026

### Global currency support
- All prices throughout the app now use the configured base currency instead of hardcoded GHS
- Works for manufacturers in any country

### Multi-currency price levels
- Each price level can be set to a different currency from the base currency
- Prices automatically converted using current exchange rates
- Print and Excel export show converted prices with an exchange rate note

### Pack quantity pricing
- Add multiple pack sizes per product within a price level via the row actions menu
- Price list table shows one row per pack size (rowSpan on shared columns)
- Print and Excel export use the same one-row-per-pack layout

### Navigation
- Prev/Next buttons added to edit drawers for Products, Materials, and Intermediate Materials
- Position counter shows e.g. "2 of 59"

### Price level fixes
- Zero now accepted as a valid fixed-amount adjustment
- "Keep current price" supported at the individual item level
- Bulk "keep current" skips products with no selling price and reports the skipped count
- Approved Base Price shown in the internal table, hidden from customer-facing price list exports

### Tables and reports
- Products, Materials, Intermediate Materials tables default to showing Active items only
- "More" actions button made clearly visible on the dark bulk-action bar
- Analysis tabs scroll correctly within their panels
- Numeric columns (money, counts, percentages, rates) consistently right-aligned across Reports Center, Materials, and BOM tables — standardised th/td alignment app-wide
- Long column headers wrap onto two lines instead of forcing wide columns (Reports Center, Price Levels)
- Table fonts standardised to 13px for `td` content throughout the app, removing 14–16px inconsistencies

### Bug fixes
- Fixed input field freezing on number fields in Electron — previously required minimising and maximising the window to recover
- Zoom level now persists across app sessions

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
- [x] Global base currency applied throughout app — no hardcoded GHS (v1.0.31)
- [x] Multi-currency price levels — per-level currency with live exchange rate conversion (v1.0.31)
- [x] Pack quantity pricing — multiple pack sizes per product per price level, one row per pack in table/print/Excel (v1.0.31)
- [x] Prev/Next navigation in Products, Materials, Intermediate Materials edit drawers with position counter (v1.0.31)
- [x] Reports and Analysis — three report groups, ten new views, auto-generate, filter chips, pagination (v1.0.32)
- [x] Full-page Material Detail at `/materials/:id` with prev/next navigation (v1.0.32)
- [x] Floating two-panel creation overlays for products and intermediate materials (v1.0.32)
- [x] Price level pack size toolbar, edit-modal pack sizes, customer-facing exports (v1.0.32)
- [x] Approval workflow redesign — primary Approve button, History tab, pending banner (v1.0.32)
- [x] Styled modals replacing native browser dialogs app-wide (v1.0.32)
- [x] Markup Health popover on Dashboard, Products, Reports, Product Detail (v1.0.33)
- [x] Export column fixes across Reports, Products, Price Levels, Materials, Intermediate Materials (v1.0.33)
- [x] Intermediate Material detail page with BOM and Cost History tabs (v1.0.33)
- [x] Price level cost-change warning badge (v1.0.33)
- [x] Electron window persistence and updater version display (v1.0.33)
- [x] Global base currency hook applied app-wide (v1.0.33)
- [x] Activity page markup terminology and filter improvements (v1.0.33)
- [x] Settings chip-based category editor and threshold descriptions (v1.0.33)
- [x] Demo data refresh — intermediate materials, pack sizes, exchange rates (v1.0.33)
- [x] Export standardisation — CSV, Excel, PDF, Print identical columns with currency column (v1.0.34)
- [x] Calculation safety — exchange rate zero guard, safe batch yield, safe pack size, null-safe markup (v1.0.34)
- [x] Data safety — backup warnings before destructive actions, unsaved changes guards (v1.0.34)
- [x] Performance — report N+1 fixes, chunked Excel export, optimised products query (v1.0.34)
- [x] Auto-updater timeout and rollback path via GitHub releases (v1.0.34)
- [x] Help centre overhaul — 65 articles updated, 13 new articles (v1.0.34)
- [x] Server startup error dialog with retry (v1.0.34)
- [x] Loading skeletons on Material Detail and Intermediate Detail (v1.0.34)
- [x] Version history section in Settings Data tab (v1.0.34)
- [x] React error #31 fixes — safeRender, usage object format, error boundaries (v1.0.35)
- [x] Electron print IPC handler across all pages (v1.0.35)
- [x] Export column cleanup — SKU, Description, Active removed (v1.0.35)
- [x] 2 decimal place standardisation in all exports (v1.0.35)
- [x] Help article print button and print CSS (v1.0.35)
- [x] Professional jsPDF + autoTable PDF exports app-wide (v1.0.36)
- [x] Company name in all PDF export headers (v1.0.36)
- [x] Print generates downloadable PDF — no browser print dialog (v1.0.36)
- [x] Help centre — 66 articles, dynamic category counts (v1.0.36)
- [x] Error boundaries with friendly tab failure messages (v1.0.36)
- [x] Price Levels and Intermediate Materials empty state CTAs (v1.0.36)
- [x] Intermediate Detail help button (v1.0.36)
- [x] Bulk approve undo toast — red Undo, green Keep (v1.0.36)
- [x] Window bounds validation, atomic state write, single instance lock (v1.0.37)
- [x] BOM search/select alignment across Product and Intermediate creation panels (v1.0.37)
- [x] BOM panel and drawer clipping fixes — expanded panels, overflow visible (v1.0.37)
- [x] Table font standardisation — 12px headers, 13px body cells app-wide (v1.0.37)
- [x] Creation panel right panel width and BOM alignment — 700px panel, aligned search/table/summary (v1.0.38)
- [x] Product creation — green Production Mode toggle, SKU removed, 2-row Description (v1.0.38)
- [x] Intermediate creation — search count on type only, Markup label, Completed Output hint, BOM Edit button (v1.0.38)
- [x] In-app table zoom and density toggle removed — fixes visual compacting after minimize/restore (v1.0.38, confirmed in v1.0.39; do not reintroduce without fixing the original bug)
- [x] Direct Labor Cost on Products and Intermediate Materials; overhead on materials+labor; needs_review on labor edit (v1.0.40)
- [x] Other Direct Costs input on Product create/edit panels (v1.0.40)
- [x] Unified Intermediate output question (exact qty or %); sub-recipe badge + inline preview in Product BOM (v1.0.40)
- [x] Bulk CSV import Products/Intermediates removed — Primary Materials only (v1.0.40)
- [x] BOM table column widths fixed in creation panels — material name wrap and Delete button overflow (v1.0.38)

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
- [x] Phase M markup simplification (v1.0.33 — markup-on-cost terminology app-wide)
- [x] Help articles update (v1.0.36 — 66 articles, 20 updated, 1 new)
- [ ] Google Search Console submission
- [ ] DecideRight development (Phase 1)
- [ ] Microsoft Store submission (future)

## Pending — v1.0.39 Polish

- [ ] Modal × close buttons — consistent styling and placement
- [ ] Settings — Save/Update button label consistency
- [ ] Reports — export toolbar button order standardisation

## Pending — Medium Priority

- [x] Privacy policy and terms of service (done — v1.0.25, `Settings.tsx` / `legalContent.tsx`)
- [ ] WhatsApp number in website footer
- [x] Backup reminder — periodic prompt in app (done — v1.0.25, `BackupReminderBanner.tsx`)
- [ ] Restore backup — full end to end test
- [ ] Trial expiry — test day 15 lock screen
- [ ] Crash/error reporting (Sentry)
- [ ] Rate limiting on licence server endpoints

## Pending — Low Priority

- [ ] Keyboard shortcuts guide in Help page
- [x] Print/PDF export of price lists (done — v1.0.25, extended in v1.0.31 with multi-currency notes)
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
| console.log in Electron main process | Low | Fixed v1.0.33 (dev-only wrapper) |
| demo-mode.json committed as local state | Low | Fixed v1.0.18 |
| v1.0.16 sidebar logo broken in packaged app | High | **Fixed in v1.0.17** (`1109771`) |
| Input fields freezing on number inputs in Electron, required minimise/maximise to recover | Medium | **Fixed in v1.0.31** |
| Numeric columns left-aligned in Reports Center and Materials table while rest of app right-aligned them | Low | **Fixed in v1.0.31** |
| Inconsistent table font sizes (14–16px `td` overrides) across pages | Low | **Fixed in v1.0.31** |

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

### IMPORTANT — Stable download link

After every release, ALSO run this additional command so the landing page download button always serves the latest version:

```powershell
Copy-Item `
  "dist-electron\PriceRight-Setup-X.X.X.exe" `
  "dist-electron\PriceRight-Setup-Latest.exe"

gh release upload vX.X.X `
  "dist-electron\PriceRight-Setup-Latest.exe" `
  --repo KwakuAsamoah/priceright `
  --clobber
```

The landing page download button points to:
`https://github.com/KwakuAsamoah/priceright/releases/latest/download/PriceRight-Setup-Latest.exe`

This URL ALWAYS serves whatever file is named `PriceRight-Setup-Latest.exe` in the latest release. If this step is skipped after a release the download button will serve the PREVIOUS version's file (since it is uploaded to the new release, the redirect should still find it — but to be safe always re-upload it).

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
