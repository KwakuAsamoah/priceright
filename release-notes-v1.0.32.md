## PriceRight v1.0.32

### Major improvements

**Navigation and discovery**
- Reports renamed to Reports and Analysis with three groups: Pricing, Products, Materials
- Ten new reports and analysis views across Products and Materials groups
- Reports auto-generate when selected — no Generate button needed
- Filter chips visible above all report results
- Paginated report tables — 15 rows per page

**Creation experience**
- New product and intermediate material creation as floating two-panel overlay
- Single-step intermediate material creation — add BOM items before saving
- Full-page Material Detail view at /materials/:id matching Product Detail quality
- Previous/Next navigation on Material Detail

**Price levels**
- Pack size management moved to single toolbar button with Previous/Next navigation
- Pack sizes now manageable from the Edit price modal
- Export price lists show customer-facing columns only — no internal data
- Currency shown on all price list exports and print
- Pack size of 1 now accepted
- Floating point precision fixed — pack prices always exact

**Products and approvals**
- Approval form redesigned — one primary Approve button with expander for other options
- Approved Base Price always shows the official approved price only
- Activity and Price History combined into single History tab
- Bulk approve defaults to Approve at Optimal Price
- Pending products approval banner on Products page
- Clean default column set — 6 columns shown by default

**Reports and analysis**
- Margin calculations standardised across all views
- Low margin threshold consistent across Dashboard, Products, and Reports
- Product Pricing Overview combining approval status and margin health
- Profitability Ranking, Price vs Cost Drift, Optimal vs Actual Gap reports
- Materials Cost Analysis, Top Cost Drivers, Price Volatility, Material Price History, Inactive in Active BOMs reports

**UI improvements**
- Zoom control added to Reports and Analysis page
- Density toggle removed — zoom handles row spacing
- Bulk action bars standardised across all list pages
- Filter chips on Products, Materials, Intermediate Materials, and Reports
- All native browser dialogs replaced with styled modals
- Clear filters button in all empty states
- Pending products banner with one-click bulk approve
- Row hover highlight and clickable names on all list pages

**Settings**
- Settings tabs grouped into Everyday and Advanced
- Pricing Engine unified into one card
- Company branding description updated

**Other**
- Reject feature replaced with Reset to Pending
- Price history and Activity combined into History tab on Product Detail
- Floating point precision fixed throughout price level calculations
- Help articles updated and expanded to 52 articles
