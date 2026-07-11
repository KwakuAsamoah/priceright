export interface HelpArticle {
  id: string;
  section: string;
  title: string;
  content: string;
  keywords: string[];
  relatedArticleIds: string[];
}

export const helpArticles: HelpArticle[] = [

  // ── GETTING STARTED ────────────────────────────────────────────────────────

  {
    id: 'welcome',
    section: 'Getting Started',
    title: 'Welcome to PriceRight',
    keywords: ['welcome', 'overview', 'what is priceright', 'introduction'],
    relatedArticleIds: ['first-setup', 'understanding-workflow', 'sample-data', 'how-priceright-calculates-profit'],
    content: `
      <p>PriceRight is a pricing management system built for product-based businesses.
      It helps you calculate the true cost of every product you make, set profitable
      approved base prices, and manage what different customers pay — all in one place.</p>

      <p>PriceRight works for any product manufacturer anywhere in the world.
      Whether you make food products, cosmetics, crafts, or any other manufactured
      goods — if you need to know your true production cost, PriceRight can help.</p>

      <p><strong>Before you begin:</strong> go to <strong>Settings → Currencies &amp; Rates</strong>
      and set your base currency. This is required before adding materials or products.</p>

      <p>Before PriceRight, most businesses rely on spreadsheets that get out of date,
      are hard to share, and don't automatically update when costs change. PriceRight
      connects everything — your raw material costs, Bill of materials,
      and Approved base prices — so when something changes, everything adjusts.</p>

      <p><strong>Getting started in six steps:</strong></p>
      <ol>
        <li>Set your base currency in Settings</li>
        <li>Add raw materials with bulk purchase prices</li>
        <li>Create products with a bill of materials and markup</li>
        <li>Approve base prices on the product detail page</li>
        <li>Build a price list for each customer type</li>
        <li>Export the price list to Excel or PDF</li>
      </ol>

      <p>PriceRight uses <strong>Markup on Cost</strong> as its main profit measure — the percentage you add on top of what it costs to make each product. Use <strong>Reports and Analysis</strong> to review pricing health across your catalogue.</p>

      <p>Sample data files are included so you can explore all features with realistic data before entering your own.</p>`,
  },

  {
    id: 'sample-data',
    section: 'Getting Started',
    title: 'Using the sample data files',
    keywords: ['sample', 'sample data', 'demo files', 'import sample', 'getting started', 'example data', 'try', 'explore'],
    relatedArticleIds: ['first-setup', 'demo-mode', 'importing-materials'],
    content: `
      <p>PriceRight includes sample data designed as a realistic food-manufacturing example. Use it to explore all features before entering your own.</p>

      <p><strong>Quickest way to explore:</strong> go to <strong>Settings → Data &amp; Backups</strong> and click <strong>Try sample data</strong>. This loads a full demo dataset — materials, intermediate materials, products, and price levels — in one step.</p>

      <p><strong>Alternatively, import raw materials only:</strong> go to Settings → Sample data, download <strong>Sample raw materials</strong>, then on the Materials page (Primary tab) click <strong>+ Add → Import from CSV</strong>. Create intermediate materials and products manually using the creation panels.</p>

      <p>When you are ready to return to your real data after using sample data, go to <strong>Settings → Data &amp; Backups</strong> and click <strong>Use my real data</strong>. Your real data is preserved and sample data is not deleted — they are separate databases.</p>

      <p>The sample materials file is always available in Settings under Sample data.</p>`,
  },

  {
    id: 'first-setup',
    section: 'Getting Started',
    title: 'Setting up for the first time',
    keywords: ['setup', 'getting started', 'first time', 'onboarding', 'steps'],
    relatedArticleIds: ['understanding-workflow', 'adding-materials', 'building-product-bom'],
    content: `
      <p>Setting up PriceRight for the first time takes about 10 minutes if your
      material costs are ready. Follow these steps in order — each one builds
      on the last.</p>

      <p>If you want to explore PriceRight before entering your own data, go to <strong>Settings → Data &amp; Backups</strong> and click <strong>Try sample data</strong> for a full demo dataset. You can also download the sample materials file from Settings → Sample data and import it on the Materials (Primary) tab.</p>
      <ol>
        <li><strong>Set your base currency.</strong> Go to <strong>Settings → Currencies &amp; Rates</strong>.
        Click <strong>Add currency</strong>, enter your local currency code (for example USD, GBP, NGN, KES, EUR, or GHS),
        and mark it as the base currency. Every cost and price in PriceRight is calculated in this currency.
        You cannot change it easily later, so set it correctly first.</li>

        <li><strong>Add your raw materials.</strong> Go to Materials. Select the Primary tab.
        Add every ingredient, packaging item, and component you use. For each material
        you need the name, category, unit, bulk purchase quantity, and the price you
        pay for that bulk quantity.</li>

        <li><strong>Build your products.</strong> Go to Products. Create each product and
        add its Bill of Materials — which materials go into it and how much of each.
        Set the Overhead %, Direct Labor Cost, and Markup % (Products also have an optional Other Direct Costs field for one-off costs like packaging or certification). PriceRight calculates the
        optimal price automatically.</li>

        <li><strong>Approve prices.</strong> Still on Products, click on the product name
        to open the product detail page, then use the pricing panel on the right to
        approve the price. After approval, the product receives an
        <strong>Approved base price</strong>. Until a product is approved it will not
        appear in price levels.</li>

        <li><strong>Set up price levels.</strong> Go to Price Levels in the Setup
        section. Create levels for your customer types — for example Wholesale,
        Retail, Export — and set either rule-based adjustments or custom prices
        per product as needed.</li>

        <li><strong>Export price lists.</strong> Go to Price Levels in the Setup section.
        Once all prices are approved, open the level and export the price list
        to Excel or PDF.</li>
      </ol>

      <p>After setup, remember that future material or exchange-rate changes can
      move products to <strong>Needs review</strong>. PriceRight then prompts you
      to review and re-approve affected prices.</p>` ,
  },

  {
    id: 'understanding-workflow',
    section: 'Getting Started',
    title: 'Understanding the workflow',
    keywords: ['workflow', 'how it works', 'process', 'overview', 'approval chain'],
    relatedArticleIds: ['first-setup', 'how-approval-works', 'price-levels'],
    content: `
      <p>PriceRight follows a five-step workflow from costing to export. Each step
      builds on the previous one so your prices remain consistent.</p>

      <p><strong>Before you start:</strong> set your base currency in
      <strong>Settings → Currencies &amp; Rates</strong>. All costs and prices are
      calculated in that currency.</p>

      <ol>
        <li><strong>Add materials with costs.</strong> Enter bulk quantity, bulk price,
        and currency so each material has an accurate unit cost.</li>
        <li><strong>Build products with BOMs.</strong> Create products and define the
        Bill of materials so PriceRight can calculate production cost and optimal price.</li>
        <li><strong>Approve base prices.</strong> Review each product and approve an
        <strong>Approved base price</strong>.</li>
        <li><strong>Create price levels and set prices per level.</strong> Use rule-based
        adjustments or custom prices for each level.</li>
        <li><strong>Export price lists from Price Levels.</strong> Export Excel or PDF
        output when prices are ready to share.</li>
      </ol>

      <p>When material costs or exchange rates change, the workflow loops back.
      Affected products move to <strong>Needs review</strong> and must be re-approved
      before price levels and exports reflect the updated costs.</p>

      <p>Use the <strong>Activity log</strong> to track every major step in this process,
      including approvals, cost changes, and exchange-rate updates.</p>`,
  },

  {
    id: 'onboarding-guide',
    title: 'Using the setup guide',
    section: 'Getting Started',
    keywords: ['onboarding', 'setup guide', 'getting started', 'welcome', 'first steps'],
    relatedArticleIds: ['first-setup', 'adding-materials', 'welcome'],
    content: `
      <p>When you launch PriceRight for the first time, a welcome screen appears
      with an overview of the steps to get started.</p>

      <p>Click <strong>Start with Materials</strong> to begin the guided setup. A green guide bar
      appears at the top of the screen and walks you through each step in order.</p>

      <p>The four steps are:</p>
      <ol>
        <li><strong>Add your materials</strong> — enter your raw materials with costs</li>
        <li><strong>Build your products</strong> — create products with a bill of materials</li>
        <li><strong>Approve your prices</strong> — review calculated costs and set prices</li>
        <li><strong>Set up a price level</strong> — organise prices for your customers</li>
      </ol>

      <p>The guide bar shows your progress and a Next button to move to the next step when you are ready.</p>

      <p>Click <strong>Skip guide</strong> at any time to dismiss the guide and explore the app on your own.</p>

      <p>If you close the app mid-guide, the guide resumes automatically when you reopen it.</p>

      <p>Each step is marked done when you complete it or move on. There is no reset button in Settings. If you want to work through a step again, open that section directly from the sidebar — for example <strong>Materials</strong>, <strong>Products</strong>, or <strong>Price Levels</strong>.</p>`,
  },

  {
    id: 'auto-updater',
    title: 'App updates and the notification bell',
    section: 'Getting Started',
    keywords: ['update', 'auto-update', 'notification', 'bell', 'new version', 'upgrade'],
    relatedArticleIds: ['welcome', 'data-backup', 'restoring-from-backup'],
    content: `
      <p>PriceRight updates itself automatically when a new version is available.
      You do not need to reinstall the app.</p>

      <p><strong>How updates work:</strong></p>
      <ol>
        <li>PriceRight checks for updates 10 seconds after launching</li>
        <li>If an update is available, it downloads silently in the background while you continue working</li>
        <li>A blue pulsing dot appears on the notification bell at the bottom of the sidebar while downloading</li>
        <li>When the download is complete, the dot turns green</li>
        <li>Click the bell to open the notification panel</li>
        <li>The panel shows the new version number and a summary of what is new</li>
        <li>Click <strong>Restart and update</strong> to install the update</li>
        <li>The app restarts and opens on the new version</li>
      </ol>

      <p>Click <strong>Later</strong> to dismiss the panel. The green dot remains on the bell so you can update whenever you are ready.</p>

      <p>Your data is never affected by an update.</p>`,
  },

  {
    id: 'restoring-from-backup',
    title: 'Restoring your data from a backup',
    section: 'Getting Started',
    keywords: ['restore', 'backup', 'recovery', 'data loss', 'restore backup'],
    relatedArticleIds: ['data-backup', 'demo-mode', 'auto-updater'],
    content: `
      <p>If you need to recover your data from a backup, follow these steps.</p>

      <p><strong>When to restore:</strong></p>
      <ul>
        <li>Your data was accidentally deleted</li>
        <li>You want to go back to a previous state</li>
        <li>You are moving to a new computer</li>
      </ul>

      <p>Before you restore, a backup recommendation appears in the restore modal. Use the <strong>Download backup first</strong> button to save your current data before selecting your backup file.</p>

      <p><strong>How to restore:</strong></p>
      <ol>
        <li>Go to <strong>Settings → Data &amp; Backups</strong></li>
        <li>Click <strong>Restore from backup</strong></li>
        <li>Select your backup file (files end in .db)</li>
        <li>A confirmation dialog appears — read it carefully. Restoring will replace your current data.</li>
        <li>Click Confirm to proceed</li>
        <li>PriceRight restarts automatically with your restored data</li>
      </ol>

      <p><strong>Where to find your backup files:</strong> Backups are saved wherever you chose when creating the backup. The default location is your Documents folder.</p>

      <p><strong>Important notes:</strong></p>
      <ul>
        <li>Restoring replaces ALL current data with the backup data</li>
        <li>This cannot be undone</li>
        <li>Create a backup of your current data before restoring if you want to keep it</li>
        <li>Demo data is not affected by restore — only your live data</li>
      </ul>

      <p><strong>Moving to a new computer:</strong></p>
      <ol>
        <li>Create a backup on the old computer</li>
        <li>Copy the backup file to the new computer (USB drive or cloud storage)</li>
        <li>Install PriceRight on the new computer</li>
        <li>Follow the restore steps above</li>
      </ol>`,
  },

  // ── RAW MATERIALS ──────────────────────────────────────────────────────────

  {
    id: 'adding-materials',
    section: 'Products and Materials',
    title: 'Adding your first materials',
    keywords: ['add material', 'create material', 'raw material', 'new material'],
    relatedArticleIds: ['bulk-prices-units', 'foreign-currencies', 'building-product-bom'],
    content: `
      <p>To add a material, go to Materials (select the Primary tab) and click
      <strong>+ Add → Add single material</strong>.</p>

      <p>You need to enter the material name, category, and unit of measure. Then
      enter the bulk purchase details — how many units you buy at a time and how
      much you pay for that bulk quantity. PriceRight divides the bulk price by the
      bulk quantity to calculate the unit cost automatically.</p>

      <p>For example, if you buy sugar in 50kg bags for 320.00 in your base currency, enter Bulk Quantity
      as 50 and Bulk Price as 320. PriceRight calculates the unit cost as 6.40
      per kg.</p>

      <p>If you buy a material in a foreign currency like USD, select USD as the
      purchase currency. PriceRight uses the current exchange rate to convert it
      to your base currency automatically. When you update the exchange rate, all affected material
      costs recalculate instantly.</p>

      <p>For the category field, you can type a new category or select an existing
      one. Keep categories consistent so your filters work properly.</p>`,
  },

  {
    id: 'bulk-prices-units',
    section: 'Products and Materials',
    title: 'Setting bulk prices and units',
    keywords: ['bulk price', 'unit price', 'bulk quantity', 'unit cost', 'calculation'],
    relatedArticleIds: ['adding-materials', 'foreign-currencies', 'importing-materials'],
    content: `
      <p>The bulk price and bulk quantity fields are how PriceRight calculates your
      true unit cost. This is important to get right because every product cost
      depends on it.</p>

      <p><strong>Bulk Price</strong> is the total amount you pay for the purchase.
      If you pay 480.00 for a box of 24 bottles, enter 480.</p>

      <p><strong>Bulk Quantity</strong> is how many units you receive. In the same
      example, enter 24.</p>

      <p>PriceRight calculates Unit Price as Bulk Price divided by Bulk Quantity.
      480.00 ÷ 24 = 20.00 per bottle.</p>

      <p>Use the unit that makes sense for how you measure the material in your
      recipes. If your recipe uses grams but you buy in kilograms, it is usually
      easier to work in one unit throughout — for example enter Kg as the unit
      and use decimal quantities in your recipe (0.5 for 500g).</p>`,
  },

  {
    id: 'foreign-currencies',
    section: 'Products and Materials',
    title: 'Using foreign currencies',
    keywords: ['currency', 'USD', 'exchange rate', 'foreign', 'base currency', 'convert'],
    relatedArticleIds: ['inline-exchange-rate', 'adding-materials', 'currency-exposure'],
    content: `
      <p>PriceRight supports multiple currencies. When you buy materials in USD,
      EUR, GBP, or any other currency, you can record the price in that currency
      and PriceRight converts it to your base currency using the exchange rate you configure.</p>

      <p>To set up a currency, go to <strong>Settings</strong> and open the
      <strong>Currencies &amp; Rates</strong> tab. Add the currency code and current
      rate. For example, if your base currency is GHS and USD rate is 15.50, then 1 USD = 15.50 GHS. Adjust the numbers to match your own currencies.</p>

      <p>When you add or edit a material, select the purchase currency from the
      dropdown. PriceRight stores both the original foreign currency price and
      the base-currency equivalent.</p>

        <p>When you update an exchange rate, PriceRight recalculates material costs in
        that currency first. Any affected products then recalculate and can move to
        <strong>Needs review</strong> so you can re-check approvals.</p>

        <p>The exchange-rate update is recorded in the <strong>Activity log</strong>
        with the old rate, new rate, and the number of affected products.</p>

      <p>You can also update exchange rates directly from the Materials page.
      The current rate appears in the toolbar — click the pencil icon next to the
      rate to edit it inline without going to Settings.</p>`,
  },

  {
    id: 'importing-materials',
    section: 'Products and Materials',
    title: 'Importing materials in bulk',
    keywords: ['import', 'bulk import', 'CSV', 'upload', 'template', 'excel'],
    relatedArticleIds: ['import-templates-overview', 'adding-materials', 'bulk-prices-units'],
    content: `
      <p>If you have many materials to add, use the bulk import feature. Go to
      Materials (Primary tab) and click <strong>+ Add → Import from CSV</strong>.</p>

      <p>First, download the Excel template from the import dialog. Open it in
      Excel, fill in your materials on the Materials Import sheet, and follow
      the instructions on the Instructions sheet.</p>

      <p>Each row is one material. You need the material name, category, unit,
      bulk price, and bulk quantity. Currency defaults to your base currency
      if left blank.</p>

      <p>Save the filled file as a CSV (File → Save As → CSV UTF-8) and upload
      it in the import dialog. PriceRight shows you a preview and highlights
      any rows with errors — including the line number and exactly how to fix
      the problem — before you confirm the import.</p>

      <p>After a successful import, PriceRight calculates each material unit cost
      automatically from the bulk price and bulk quantity you provided.</p>

      <p>If some rows have errors, valid rows still import. Rows with errors are
      listed in the result so you can fix those lines and re-import only the
      remaining items.</p>

      <p>If a material with the same name already exists, PriceRight updates it
      rather than creating a duplicate. This makes the import safe to run
      multiple times as prices change.</p>`,
  },

  {
    id: 'import-templates-overview',
    title: 'Importing materials with templates',
    section: 'Products and Materials',
    keywords: ['import', 'template', 'CSV', 'Excel', 'bulk import', 'upload', 'materials'],
    relatedArticleIds: ['importing-materials', 'sample-data', 'adding-materials'],
    content: `
      <p>PriceRight provides an Excel template for importing primary raw materials in bulk. This is faster than adding materials one by one.</p>

      <p><strong>Materials import template</strong> — for primary raw materials. Go to <strong>Materials</strong> (Primary tab), click <strong>+ Add → Import from CSV</strong>, then <strong>Download template</strong>.</p>

      <p><strong>How to fill in the template:</strong></p>
      <ul>
        <li>Open the template in Excel</li>
        <li>Read the instructions on the first sheet</li>
        <li>Fill in your data on the Import Data sheet</li>
        <li>Do not change the column headers</li>
        <li>Save as Excel (.xlsx) or CSV</li>
      </ul>

      <p><strong>How to import:</strong></p>
      <ol>
        <li>Go to Materials (Primary tab)</li>
        <li>Click <strong>+ Add → Import from CSV</strong></li>
        <li>Choose your completed file</li>
        <li>Review the preview — rows with errors are highlighted</li>
        <li>Click Import to finish</li>
      </ol>

      <p>Products and intermediate materials are created using the manual creation panels — there is no bulk CSV import for those.</p>`,
  },

  {
    id: 'intermediate-materials',
    section: 'Products and Materials',
    title: 'Intermediate materials',
    keywords: ['intermediate', 'semi-finished', 'in-house', 'produced material', 'sub-assembly'],
    relatedArticleIds: ['intermediate-costing', 'creation-panels', 'intermediate-detail-page'],
    content: `
      <p>Some materials you use in your products are made in-house from other
      raw materials. PriceRight calls these Intermediate Materials.</p>

      <p>Intermediate materials are managed under the <strong>Intermediate</strong> tab on
      the Materials page. Once created they appear as selectable components when
      building product BOMs.</p>

      <p>When an Intermediate Material is used inside a Product's Bill of Materials, it shows a sub-recipe badge — click it to preview its own materials and cost without leaving the Product page.</p>

      <p>When raw material prices change, an intermediate material's cost updates automatically.
      Every finished product that uses it recalculates too — keeping everything accurate without manual work.</p>

      <p>To create one, go to Materials → Intermediate tab and click <strong>Add Intermediate Material</strong>.
      A floating overlay panel opens with two panels side by side — form fields on the left, BOM builder on the right.
      You can add BOM items before saving.</p>

      <p>After you list your ingredients, tell PriceRight how much finished product the batch actually made — either as an exact amount or as a percentage of what you started with. Either way PriceRight calculates the same accurate cost per unit.</p>

      <p>On the left panel, the <strong>Cost Settings</strong> section holds overhead %, <strong>Direct Labor Cost</strong>, and optional Markup %. The finished output question appears on the right, below your recipe.</p>

      <p>The calculated unit cost is then available when building finished products — it appears in the same material search alongside primary materials.</p>`,
  },

  {
    id: 'intermediate-costing',
    section: 'Products and Materials',
    title: 'How to cost an intermediate material',
    keywords: [
      'intermediate cost', 'overhead', 'markup', 'transfer price',
      'roasted peanut', 'internal production', 'double counting'
    ],
    relatedArticleIds: ['intermediate-materials', 'overhead-and-margin', 'building-product-bom'],
    content: `
      <p>When you build an intermediate material in PriceRight, you need to
      decide how to cost it before it flows into your finished products.
      There are three approaches and the right one depends on how that
      material is used in your business.</p>

      <h3>Approach 1 — Raw material cost only</h3>
      <p>The intermediate material passes through at the cost of its raw
      ingredients only. No overhead and no profit are added at this stage.
      Overhead and profit are applied once — at the finished product level —
      covering the entire production process including the intermediate step.</p>

      <p>Use this approach when the intermediate production step is simple,
      quick, and uses the same general factory resources as everything else.
      It keeps costing straightforward and avoids any risk of double-counting
      overhead.</p>

      <p><strong>Example:</strong> Roasted Peanut made from raw groundnuts
      (8.00), cooking oil (1.50), and salt (0.20) gives a unit
      cost of 9.70. When this goes into a finished product like peanut
      butter, the 9.70 is treated as a raw material cost and the finished
      product's own overhead and profit are applied on top.</p>

      <h3>Approach 2 — Raw material cost plus overhead (recommended)</h3>
      <p>The intermediate material absorbs a share of overhead because its
      production step genuinely uses electricity, labour, equipment, or time
      that is separate from the finished product's production. No profit is
      added because the material is not being sold — it is an internal
      transfer.</p>

      <p>Use this approach when the intermediate production step has its own
      meaningful indirect costs. It gives you the most accurate product costing
      and prevents the finished product's overhead percentage from having to
      cover two different production processes at once.</p>

      <p><strong>Example:</strong> Roasted Peanut raw material cost is 9.70.
      Direct labor for the roasting batch is 2.00. Subtotal is 11.70.
      The roasting process has its own overhead of 15% — electricity for the
      roasting equipment — applied to materials plus labor. Overhead adds
      1.76, giving a batch total of 13.46. Divided by output quantity, the unit
      cost flows into finished products, and the finished product's
      own overhead applies on top of that.</p>

      <p>This is the recommended approach for most intermediate materials
      in a food or manufacturing business.</p>

      <h3>Approach 3 — Raw material cost plus overhead plus profit</h3>
      <p>The intermediate material is fully costed as if it were a finished
      product — with its own overhead and its own Markup %. Use this
      approach in two situations: when you also sell this intermediate material
      externally to other businesses, or when you want to track the
      profitability of the intermediate production step separately from
      the finished product.</p>

      <p><strong>Example:</strong> If your business sells Roasted Peanuts in
      bulk to other manufacturers as well as using them in your own products,
      you need a full cost including profit so you know what to charge external
      buyers. Set the Markup % on the intermediate material to match your
      target for that product.</p>

      <h3>Which approach to choose</h3>
      <p>Ask yourself two questions:</p>
      <ul>
        <li>Does this intermediate material have its own distinct production
        costs — electricity, labour, equipment — that are separate from the
        finished product? If yes, add overhead.</li>
        <li>Do you sell this intermediate material externally, or do you need
        to track its profitability independently? If yes, add Markup %.</li>
      </ul>

      <p>If the answer to both questions is no, use Approach 1. If the first
      is yes and the second is no, use Approach 2. If both are yes,
      use Approach 3.</p>

      <p>In PriceRight, set this when creating or editing an intermediate
      material under the Materials → Intermediate tab. Leave Overhead % at zero
      for Approach 1. Enter your overhead rate and leave Markup % at zero
      for Approach 2. Enter both for Approach 3.</p>

      <h3>How much did the batch produce?</h3>
      <p>After you've listed your ingredients, tell PriceRight how much finished product the batch actually made — either as an exact amount or as a percentage of what you started with. PriceRight calculates cost per unit as: (Material cost + Direct labor cost) with overhead applied to that combined subtotal, then divided by actual output quantity.</p>`,
  },

  {
    id: 'materials-analysis-tab',
    title: 'Materials Reports and Analysis',
    section: 'Reports and Analysis',
    keywords: ['materials reports', 'cost analysis', 'top cost drivers', 'price volatility', 'material price history', 'inactive materials'],
    relatedArticleIds: ['currency-exposure', 'reports-navigation', 'material-detail-page'],
    content: `
      <p>Materials analysis is now in <strong>Reports and Analysis</strong>. Open the <strong>Materials</strong> tab at the top, then choose a report from the dropdown. Reports generate automatically — no Generate button needed.</p>

      <p><strong>Currency Exposure</strong> — shows how many active materials you buy in each purchase currency. Expand a currency row to see individual materials. Helps you spot exchange-rate risk in your supply chain.</p>

      <p><strong>Materials Cost Analysis</strong> — average unit cost by category, most-used materials in product recipes, and your highest unit-cost items. Good for understanding where your material spend is concentrated.</p>

      <p><strong>Top Cost Drivers</strong> — ranks materials by total BOM cost contribution across all products. Shows which ingredients have the biggest impact on your overall production costs.</p>

      <p><strong>Price Volatility</strong> — highlights materials whose unit costs changed most over a selected period. Useful after supplier price increases or exchange-rate moves.</p>

      <p><strong>Material Price History</strong> — pick a material and see its full price change history. Same data as the Price History tab on the material detail page.</p>

      <p><strong>Inactive in Active BOMs</strong> — lists inactive materials still referenced in active product recipes. Fix these to keep product costs accurate.</p>`,
  },

  // ── PRODUCTS ───────────────────────────────────────────────────────────────

  {
    id: 'building-product-bom',
    section: 'Products and Materials',
    title: 'Building a product with a BOM',
    keywords: ['product', 'BOM', 'bill of materials', 'create product', 'recipe'],
    relatedArticleIds: ['batch-vs-single', 'creation-panels', 'how-approval-works'],
    content: `
      <p>To create a product, go to <strong>Products</strong> and click
      <strong>Add Product</strong> — this opens the creation panel directly. A floating overlay panel opens over the list — the table stays visible but dimmed behind it.</p>

      <p>The panel has two sections side by side: the <strong>product form</strong> on the left and the <strong>BOM builder</strong> on the right. The Cost Summary on the right updates live as you add materials — the left panel is for product details and pricing fields only. The creation form does not include a SKU field.</p>

      <p>Give the product a name and category. Choose <strong>Single Unit</strong> or <strong>Batch</strong> production mode. For batch, enter the Batch Yield — how many finished units one recipe run produces.</p>

      <p>Set Overhead %, <strong>Direct Labor Cost</strong>, optional <strong>Other Direct Costs</strong>, and Markup %. Type in the search box to find a material — click a result to add it immediately. Set the quantity directly in the table row. Use the Edit button on any BOM row to make changes later. Click <strong>Save</strong> at the bottom of the left panel when done.</p>

      <p>If a BOM line uses an Intermediate Material — a sub-recipe made from other materials — you'll see a small sub-recipe badge next to its name. Click it to expand an inline preview of that Intermediate's own materials and cost, without leaving the page. Click <strong>View full details →</strong> inside the preview to open the Intermediate's own detail page.</p>

      <p>After saving, the product status is <strong>Pending</strong>. Click the product row to open its detail page and approve an <strong>Approved base price</strong> before adding it to price levels.</p>

      <p>If a material cost changes later, the product moves to <strong>Needs review</strong> and should be re-approved.</p>`,
  },

  {
    id: 'batch-vs-single',
    section: 'Products and Materials',
    title: 'Batch vs single unit production',
    keywords: ['batch', 'single unit', 'production mode', 'yield', 'batch yield'],
    relatedArticleIds: ['building-product-bom', 'intermediate-materials', 'overhead-and-margin'],
    content: `
      <p>PriceRight supports two production modes.</p>

      <p><strong>Single Unit</strong> means your recipe produces one unit. The
      quantities in your BOM are what you use to make one unit.</p>

      <p><strong>Batch</strong> means your recipe produces multiple units at once.
      The BOM quantities are for the entire batch. You enter the Batch Yield
      to tell PriceRight how many units come out.</p>

      <p>For example, if you mix 10kg of sugar and 2L of molasses and that
      produces 6 jars of brown sugar, set BOM quantities to 10kg and 2L,
      and set Batch Yield to 6. PriceRight divides all costs by 6 to get
      the per-unit cost.</p>

      <p>Getting the production mode and batch yield right is important —
      it is what makes PriceRight's cost calculations accurate.</p>`,
  },

  {
    id: 'overhead-and-margin',
    section: 'Products and Materials',
    title: 'Understanding overhead and markup on cost',
    keywords: ['overhead', 'margin', 'markup', 'markup on cost', 'cost', 'percentage', 'direct labor', 'labor cost', 'other direct costs'],
    relatedArticleIds: ['how-priceright-calculates-profit', 'markup-health-guide', 'building-product-bom'],
    content: `
      <p><strong>Overhead</strong> is a percentage applied to <strong>material cost plus direct labor cost</strong> to cover indirect expenses — electricity, rent, equipment, and other production overheads. <strong>Direct Labor Cost</strong> is entered separately as a fixed amount for your own time or paid staff time to make the product or batch.</p>

      <p>Production cost is calculated as:</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        Production cost = (Material cost + Direct labor cost) × (1 + Overhead%) + Other Direct Costs
      </p>

      <p><strong>Other Direct Costs</strong> are one-off product-specific amounts — for example special packaging, certification fees, or per-batch consumables. They are added after overhead and do not themselves receive overhead. This field applies to Products only, not Intermediate Materials.</p>

      <p>Overhead is set per product on the product form, or pre-filled from <strong>Settings → Pricing Engine → Default Overhead %</strong> when creating new products. Use the overhead calculator on the Pricing Engine tab to work out a sensible default from your monthly figures.</p>

      <p><strong>Markup on Cost</strong> is PriceRight's primary profit metric. It is set on each product and drives the <strong>Optimal price</strong> calculation:</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        Optimal price = Production cost × (1 + Markup%)
      </p>

      <p>At the approved price, actual markup on cost is:</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        (Approved Price − Production Cost) ÷ Production Cost × 100
      </p>

      <p>Example: production cost 10.00, approved price 14.00 → 40% markup on cost.</p>

      <p>Products are colour-coded by markup health using your <strong>Healthy Markup Threshold</strong> in Settings: <strong>Healthy</strong> (green) at or above the threshold, <strong>Low</strong> (amber) between half and full threshold, <strong>Critical</strong> (red) below half.</p>

      <p><strong>Gross Margin %</strong> is available as an optional reference column on the Products table (labelled "reference") for accounting comparisons — but Markup on Cost is the primary metric throughout PriceRight.</p>`,
  },

  // ── PRICING AND APPROVALS ──────────────────────────────────────────────────

  {
    id: 'how-approval-works',
    section: 'Pricing and Approvals',
    title: 'How price approval works',
    keywords: ['approval', 'approve', 'reset to pending', 'pending', 'workflow', 'status'],
    relatedArticleIds: ['bulk-approval', 'needs-review', 'reset-to-pending'],
    content: `
      <p>Approval is the step where you set the product's official
      <strong>Approved base price</strong>. PriceRight calculates an <strong>Optimal price</strong>
      as production cost × (1 + Markup%). Production cost already includes materials, Direct Labor, overhead, and — for Products — Other Direct Costs. The price is not official until you approve it.</p>

      <p><strong>On the product detail page:</strong></p>
      <ol>
        <li>Review production cost, optimal price, and current markup on cost.</li>
        <li>Click the primary <strong>Approve at Optimal Price</strong> button to approve at the recommended price.</li>
        <li>Or expand <strong>Use a different price</strong> for other options:
          <ul>
            <li><strong>Keep current price</strong> — re-approve at the existing approved price when in Needs review</li>
            <li><strong>Custom Price</strong> — enter a specific amount, then click <strong>Approve Custom</strong></li>
          </ul>
        </li>
        <li><strong>Reset to pending</strong> — a low-prominence link below the form on approved or needs-review products. Clears the approved price and returns the product to pending status.</li>
      </ol>

      <p>After approval, status becomes <strong>Approved</strong> and that price is used in price levels and exports.</p>

      <p>For bulk work, select products with row checkboxes. The bulk <strong>Approve</strong> menu defaults to <strong>Approve at optimal price</strong>. Use the <strong>More</strong> menu for <strong>Reset to Pending</strong>.</p>

      <p>When material costs change, rule-based price level prices recalculate automatically. Custom level prices may show stale warnings until you review them. You can set a <strong>valid until</strong> date when approving — expired prices move to Needs review.</p>`,
  },

  {
    id: 'price-types-explained',
    section: 'Pricing and Approvals',
    title: 'Production cost vs optimal price vs approved base price vs price level price',
    keywords: ['production cost', 'optimal price', 'approved base price', 'price level price', 'above optimal', 'below optimal', 'difference'],
    relatedArticleIds: ['how-approval-works', 'overhead-and-margin', 'keep-current-price'],
    content: `
      <p>PriceRight uses four price types. Understanding each one helps you review
      changes and explain final decisions clearly.</p>

      <p><strong>1) Production cost</strong> is what it costs to make one unit.
      It's calculated as materials plus Direct Labor Cost, with Overhead % applied to that combined subtotal, plus (for Products) any Other Direct Costs added on top. It updates automatically whenever material prices, exchange rates, labor cost, or other direct costs change.</p>

      <p><strong>2) Optimal price</strong> is what the system recommends you charge.
      It covers production cost and your target markup.</p>

      <p><strong>3) Approved base price</strong> is the price you commit to after
      review. It can match the optimal price or differ when you set a custom value
      or choose <strong>Keep current price</strong> during <strong>Needs review</strong>.</p>

      <p><strong>4) Price level price</strong> is what a specific customer group pays.
      It is derived from the approved base price through a rule, or set as a custom
      amount within the price level.</p>

      <p>The <strong>Approved base price</strong> is the anchor for all
      <strong>Price level</strong> calculations.</p>` ,
  },

  {
    id: 'bulk-approval',
    section: 'Pricing and Approvals',
    title: 'Approving prices in bulk',
    keywords: ['bulk approve', 'approve all', 'bulk action', 'mass approve'],
    relatedArticleIds: ['how-approval-works', 'undo-bulk-approve', 'needs-review'],
    content: `
      <p>Use bulk approval when many products need approval at once — for example during first-time setup or after a broad cost change.</p>

      <p>On the Products page:</p>
      <ol>
        <li>Select products using the row checkboxes.</li>
        <li>Use the header checkbox to select all visible rows if needed.</li>
        <li>When at least one row is selected, the bulk action bar appears at the bottom.</li>
      </ol>

      <p>Open the <strong>Approve</strong> menu in the bulk bar. All three options open the same <strong>Bulk Approve Products</strong> modal — nothing is applied until you confirm in that modal:</p>
      <ul>
        <li><strong>Approve at optimal price</strong></li>
        <li><strong>Keep current price</strong></li>
        <li><strong>Approve at custom markup…</strong> — inside the modal this option is labelled <strong>Approve at Optimal Price + Markup %</strong></li>
      </ul>

      <p>In the modal, pick one of the three radio buttons, then click Confirm. You can also set an optional <strong>valid until</strong> date that applies to all products in the batch.</p>

      <p><strong>Keep current price</strong> re-approves each product at its existing approved base price. Products with no current selling price and no existing approved price are skipped. The summary tells you how many were approved and how many were skipped.</p>

      <p>After bulk approval, approved products move to <strong>Approved</strong> status. Rule-based prices in <strong>Price levels</strong> recalculate from the updated approved base prices.</p>`,
  },

  {
    id: 'needs-review',
    section: 'Pricing and Approvals',
    title: 'What Needs Review means',
    keywords: ['needs review', 'review', 'cost change', 'flag', 'recalculate'],
    relatedArticleIds: ['how-approval-works', 'keep-current-price', 'price-expiry'],
    content: `
      <p><strong>Needs review</strong> means a product's current
      <strong>Approved base price</strong> may be outdated compared with today's
      <strong>Production cost</strong> and <strong>Optimal price</strong>.</p>

      <p>A product moves to <strong>Needs review</strong> when:</p>
      <ul>
        <li>a material unit cost changes,</li>
        <li>an exchange-rate update changes converted material costs,</li>
        <li>an approved price passes its expiry date, or</li>
        <li>a cost input that affects the optimal price is edited on the product itself — including Direct Labor Cost, Other Direct Costs, Overhead %, or Markup %.</li>
      </ul>

      <p>On the Products page, these rows are highlighted with an amber left border,
      amber row background, a short <strong>Review</strong> badge in the name column, and
      <strong>Needs review</strong> in the Status column. The Status header also shows an
      amber count dot. Row hover text and row actions help you open review quickly, and
      Dashboard includes a <strong>Review now</strong> path.</p>

      <p>Review from the product detail page. You will
      see updated <strong>Production cost</strong>, last approved value, and new
      <strong>Optimal price</strong>. Then choose:</p>
      <ol>
        <li><strong>Approve Optimal Price</strong> to approve at the new <strong>Optimal price</strong>.</li>
        <li><strong>Keep current price</strong> to re-approve at the existing
        <strong>Approved base price</strong> when you want to absorb the change.</li>
        <li><strong>Approve Custom</strong> to approve a specific amount you enter in the <strong>Custom Price</strong> field.</li>
      </ol>

      <p>When you approve a new base price, rule-based prices in
      <strong>Price levels</strong> recalculate automatically. If a level has custom
      prices set before the latest base approval, stale custom-price alerts appear
      so you can review those entries manually.</p>`,
  },

  {
    id: 'price-expiry',
    title: 'Understanding price expiry',
    section: 'Pricing and Approvals',
    keywords: ['price expiry', 'expiry', 'expires', 'valid until', 'expired', 'renew price', 'price validity'],
    relatedArticleIds: ['needs-review', 'how-approval-works', 'price-history-tab'],
    content: `
      <p>Approved prices can have an expiry date. After this date, the price is flagged as
      <strong>Needs review</strong> and must be re-approved before it can be included in a price level export.</p>

      <p><strong>Setting an expiry date:</strong> When approving a price, optionally set a
      <strong>valid until</strong> date in the approval form. Leave it blank for a price that never expires.</p>

      <p><strong>Where expiry dates appear:</strong> on the Products list (Valid until column), on the product detail pricing panel, and on the Dashboard Approval Workload card.</p>

      <p><strong>When a price expires:</strong> the product moves to Needs review automatically and is excluded from price level exports until re-approved. Use the product detail page to review and approve with a new expiry date.</p>

      <p>To export a price level, use the direct toolbar buttons — <strong>Export PDF</strong>, <strong>Export Excel</strong>, or <strong>Print</strong> — once all items in the level are approved. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  // ── PRICE LEVELS AND EXPORTS ───────────────────────────────────────────────

  {
    id: 'price-levels',
    section: 'Price Lists and Exports',
    title: 'Setting up price levels',
    keywords: ['price level', 'tier', 'discount', 'markup', 'wholesale', 'retail', 'customer tier'],
    relatedArticleIds: ['price-level-wizard', 'special-pricing', 'generating-price-list'],
    content: `
      <p>Price levels let you set different prices for different customer types — wholesale, retail, export, or a named customer — without entering every price by hand.</p>

      <p>Go to <strong>Price Levels</strong> in the Setup section. To create your first level, click <strong>+ Create your first price level</strong>. The wizard has four steps:</p>

      <ol>
        <li><strong>Step 1 — Name and currency.</strong> Enter a name for the level (for example Wholesale or Retail). Choose the price list currency — your base currency or any other active currency in your settings.</li>
        <li><strong>Step 2 — Add products.</strong> Select which approved products belong in this price level.</li>
        <li><strong>Step 3 — Set pricing rules.</strong> For each product, choose percentage markup, percentage discount, fixed amount add, fixed amount deduct, or a custom price.</li>
        <li><strong>Step 4 — Review and confirm.</strong> Check the summary and create the level.</li>
      </ol>

      <p>When a level is first created, each product price starts as <strong>pending</strong>. You must approve pending prices before you can export the price list.</p>

      <p>You can add <strong>pack sizes</strong> to a product in the level. Each pack shows both unit price and pack price on the table and on the exported list.</p>

      <p>After prices are approved, export the level as Excel or PDF to share with customers.</p>`,
  },

  {
    id: 'price-level-wizard',
    title: 'Creating your first price level',
    section: 'Price Lists and Exports',
    keywords: ['price level', 'wizard', 'create price level', 'new price level', 'customer pricing', 'setup wizard'],
    relatedArticleIds: ['price-levels', 'price-level-approval', 'generating-price-list'],
    content: `
      <p>Click <strong>Price Levels</strong> in the sidebar, then <strong>+ Create your first price level</strong> or <strong>+ New price level</strong>. The wizard walks you through four steps.</p>

      <p><strong>Step 1 — Name and currency:</strong> Enter a name (Retail, Wholesale, or a customer name) and choose the price list currency.</p>

      <p><strong>Step 2 — Add products:</strong> Select approved products to include. Only products with an approved base price can be added.</p>

      <p><strong>Step 3 — Set pricing rules:</strong> Set a rule per product or use <strong>Apply to all</strong> for percentage markup, discount, fixed add/deduct, or custom price.</p>

      <p><strong>Step 4 — Review and confirm:</strong> Check the summary, then choose how to handle approval:</p>
      <ul>
        <li><strong>Approve all prices now</strong> — under "Make this price list ready to export?" Creates the level with all prices approved so you can export immediately.</li>
        <li><strong>I'll approve later</strong> — creates the level with prices pending; approve from the Price Levels page when ready.</li>
      </ul>

      <p>After creation, add pack sizes using the toolbar <strong>Pack sizes</strong> button and export via <strong>Export PDF</strong>, <strong>Export Excel</strong>, or <strong>Print</strong>. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'adding-customers',
    section: 'Price Lists and Exports',
    title: 'Handling customer-specific pricing',
    keywords: ['customer', 'add customer', 'create customer', 'assign price level'],
    relatedArticleIds: ['special-pricing', 'price-levels', 'price-level-wizard'],
    content: `
      <p>PriceRight no longer uses a separate customer management page.</p>

      <p>Instead, go to <strong>Price Levels</strong> in the Setup section and create a
      dedicated level when a customer needs negotiated pricing.</p>

      <p>Name the level clearly, add the products you want to price, and set
      either rule-based adjustments or custom approved prices for that level.</p>
    `,
  },

  {
    id: 'special-pricing',
    section: 'Price Lists and Exports',
    title: 'Setting customer-specific prices with price levels',
    keywords: ['price levels', 'custom price', 'override', 'negotiated', 'individual price'],
    relatedArticleIds: ['price-levels', 'stale-custom-price-alerts', 'pack-size-pricing'],
    content: `
      <p>Price levels support both rule-based pricing and custom prices per product.</p>

      <p>When a customer needs negotiated prices, create a dedicated price level named after that customer. Use it as their pricing sheet.</p>

      <p>Open <strong>Price Levels</strong>, add products to the level, and set each product using one of these override types:</p>
      <ul>
        <li>Percentage markup</li>
        <li>Percentage discount</li>
        <li>Fixed custom price</li>
        <li>Add amount</li>
        <li>Deduct amount</li>
      </ul>

      <p><strong>Pack size pricing</strong> — after a product is in the level, open the row actions menu (<strong>···</strong>) and choose <strong>Manage packs</strong>. Add pack sizes (for example 6 or 12). Each pack shows unit price and pack price (unit price × pack quantity) in the table and on export.</p>

      <p><strong>Pending re-approval</strong> — when you change a pricing rule or custom price on an existing level, the affected item returns to <strong>pending</strong> status. Approve it again before exporting the price list.</p>

      <p>When a product's approved base price changes, rule-based level prices recalculate automatically. Custom prices stay fixed and may show a stale price warning until you review them. See <strong>Stale custom price alerts</strong> for more detail.</p>

      <p>All level prices must be <strong>approved</strong> before they appear on an exported price list.</p>`,
  },

  {
    id: 'generating-price-list',
    section: 'Price Lists and Exports',
    title: 'Generating a price list',
    keywords: ['price list', 'generate', 'export', 'customer price list', 'create price list'],
    relatedArticleIds: ['price-level-wizard', 'price-level-approval', 'export-guide'],
    content: `
      <p>Export price lists from the <strong>Price Levels</strong> page. Select a level in the left panel — only <strong>approved</strong> items can be exported.</p>

      <p>Use the toolbar export buttons directly:</p>
      <ul>
        <li><strong>Export PDF</strong> — downloads a professional PDF price list</li>
        <li><strong>Export Excel</strong> — spreadsheet format</li>
        <li><strong>Export Selected to Excel</strong> — exports only the rows you have selected</li>
        <li><strong>Print</strong> — generates the same PDF as Export PDF for printing</li>
      </ul>

      <p>Before exporting, use <strong>Approve all pending</strong> or approve individual rows. Use the <strong>Export selected products</strong> modal if you want a PDF or Excel file of specific products only.</p>

      <p>Customer-facing exports show Product Name, Pack Size, Unit Price, Pack Price, and a <strong>Currency</strong> column — currency is not repeated in column headers. Internal columns like approved base price are not included on customer exports.</p>

      <p>Add pack sizes using the toolbar <strong>Pack sizes</strong> button (not per-row menus). Each pack appears as its own row with unit and pack price. If custom prices may be outdated, an amber warning appears in Export selected — you can review first or export as-is.</p>`,
  },

  {
    id: 'price-list-currencies',
    section: 'Price Lists and Exports',
    title: 'Converting price lists to other currencies',
    keywords: ['currency', 'price list currency', 'USD price list', 'convert', 'foreign currency'],
    relatedArticleIds: ['generating-price-list', 'foreign-currencies', 'export-guide'],
    content: `
      <p>PriceRight can show and export a price list in a currency other than your base currency. You do not need to convert prices manually in Excel.</p>

      <p>When creating a price level, choose <strong>Price list currency</strong> in Step 1 of the wizard. When editing, change it in the level settings. PriceRight converts all prices using the current exchange rate.</p>

      <p>Exported price lists include a dedicated <strong>Currency</strong> column showing which currency each row is in. Column headers stay plain — no currency codes in header names.</p>

      <p>A note on PDF and print exports shows which exchange rate was used. Keep rates up to date in <strong>Settings → Currencies &amp; Rates</strong>.</p>

      <p>The <strong>Currency Exposure</strong> report (Reports and Analysis → Materials tab) shows material purchase currencies — it helps with exchange-rate risk on costs, not customer price list conversion.</p>`,
  },

  // ── REPORTS AND ANALYSIS ───────────────────────────────────────────────────

  {
    id: 'pricing-analysis-page',
    section: 'Reports and Analysis',
    title: 'Products Reports and Analysis',
    keywords: ['products reports', 'margin health', 'profitability ranking', 'price vs cost drift', 'optimal vs actual gap', 'pricing overview'],
    relatedArticleIds: ['product-pricing-overview', 'markup-health-guide', 'reports-navigation'],
    content: `
      <p>Products analysis is now in <strong>Reports and Analysis</strong>. Open the <strong>Products</strong> tab at the top, then click a report pill. Reports generate automatically when selected.</p>

      <p><strong>Product Pricing Overview</strong> — combines approval status and markup health in one table. See which products are pending, approved, or need review, and how healthy each markup is at a glance.</p>

      <p><strong>Margin Health</strong> — summary cards and distribution for Healthy, Low, and Critical markup bands based on your Healthy Markup Threshold in Settings. Click a band to filter the product list.</p>

      <p><strong>Profitability Ranking</strong> — all active products ranked by Actual Markup %. Quickly find your best and weakest performers.</p>

      <p><strong>Price vs Cost Drift</strong> — shows how much each product's actual markup has drifted since approval as material costs change. Negative drift means costs rose faster than your approved price.</p>

      <p><strong>Optimal vs Actual Gap</strong> — compares each product's approved base price to today's optimal price. Highlights products priced above or below what the system currently recommends.</p>`,
  },

  {
    id: 'pricing-status-report',
    section: 'Reports and Analysis',
    title: 'Running the Pricing Status report',
    keywords: ['pricing status', 'report', 'above optimal', 'below optimal', 'export report'],
    relatedArticleIds: ['reports-navigation', 'markup-analysis-report', 'product-pricing-overview'],
    content: `
      <p>Go to <strong>Reports and Analysis</strong>, open the <strong>Pricing</strong> tab, and click the <strong>Pricing Status</strong> pill. The report generates automatically — there is no Generate button. Change filters and results update live; active filters appear as chips above the table.</p>

      <p>Summary cards show Total Products, Above Optimal, Below Optimal, and <strong>Avg Markup %</strong> (for products with an approved base price).</p>

      <p>Table columns include Product Name, Approval status, Category, Prod. Cost, Optimal Price, Approved base price, Variance, Profit, <strong>Actual Markup %</strong>, and pricing Status (Above/Below/At Optimal).</p>

      <p>Export as PDF or Excel from the report toolbar. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'low-margin-report',
    section: 'Reports and Analysis',
    title: 'Markup Analysis Report',
    keywords: ['markup analysis', 'below target', 'markup threshold', 'profitability', 'target gap'],
    relatedArticleIds: ['markup-analysis-report', 'how-priceright-calculates-profit', 'pricing-status-report'],
    content: `
      <p>The <strong>Markup Analysis</strong> report is in <strong>Reports and Analysis → Pricing tab → Markup Analysis</strong> pill. The report runs automatically when you open it.</p>

      <p>Set a <strong>threshold</strong> at the top — it defaults to your Healthy Markup Threshold from Settings. Filter by All, Above target, Below target, or a Custom markup range. Active filters appear as removable chips above the results.</p>

      <p>Summary cards show Total Products Analysed, Above Target, Below Target, and Average Markup %. The table columns are Product Name, Category, Production Cost, Approved Price, Actual Markup %, and <strong>Target Gap</strong> — the difference between actual markup and your threshold. A negative gap means the product is below target.</p>

      <p>Export the report as PDF or Excel from the toolbar. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there. See <strong>Using the Markup Analysis report</strong> for more detail.</p>`,
  },

  {
    id: 'currency-exposure',
    section: 'Reports and Analysis',
    title: 'Currency exposure',
    keywords: ['currency exposure', 'FX risk', 'exchange rate risk', 'USD exposure', 'foreign currency risk'],
    relatedArticleIds: ['foreign-currencies', 'materials-analysis-tab', 'inline-exchange-rate'],
    content: `
      <p>The Currency Exposure report shows how your active materials are spread across purchase currencies. This helps you see which currencies your material catalogue depends on.</p>

      <p>Go to <strong>Reports and Analysis</strong>, open the <strong>Materials</strong> tab, and select <strong>Currency Exposure</strong> from the dropdown. Reports generate automatically when you select them — no button needed.</p>

      <p>The report shows each currency with a count of materials purchased in that currency.
      Expand any currency row to see the individual materials.</p>

      <p>Materials purchased in foreign currencies are exposed to exchange rate risk. When rates move, production costs for those materials change. Use this report to understand which currencies matter most to your business.</p>`,
  },

  {
    id: 'price-list-summary-report',
    title: 'Price List Summary report',
    section: 'Reports and Analysis',
    keywords: ['price list summary', 'report', 'price lists', 'coverage', 'export coverage'],
    relatedArticleIds: ['generating-price-list', 'price-expiry', 'price-levels'],
    content: `
      <p>The Price List Summary report shows all your price levels and whether each list is still valid or coming up for renewal.</p>

      <p>Go to <strong>Reports and Analysis</strong>, open the <strong>Pricing</strong> tab, and click the <strong>Price List Summary</strong> pill. The report generates automatically when selected.</p>

      <p>Summary cards show:</p>
      <ul>
        <li>Total Price Lists</li>
        <li>Active</li>
        <li>Expiring Within 30 Days</li>
        <li>Expired</li>
      </ul>

      <p>The table columns are:</p>
      <ul>
        <li>Price List Name</li>
        <li>Type</li>
        <li>Customer / Level</li>
        <li>Products Covered</li>
        <li>Valid From</li>
        <li>Valid Until</li>
        <li>Days Until Expiry</li>
        <li>Last Updated</li>
        <li>Status</li>
      </ul>

      <p>Use this report to see which price lists are active, which are expiring soon, and which have already expired. It does not show per-product approval status inside each level.</p>

      <p>Export the report as Excel or PDF. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'approval-history-report',
    title: 'Approval History report',
    section: 'Reports and Analysis',
    keywords: ['approval history', 'report', 'price approvals', 'history', 'audit trail'],
    relatedArticleIds: ['activity-log', 'price-history-tab', 'reports-navigation'],
    content: `
      <p>The Approval History report lists products and their current approval-related figures. Go to <strong>Reports and Analysis → Pricing tab → Approval History</strong> pill. The report auto-generates when selected.</p>

      <p>Filter by date range, approval status, or category. Active filters show as removable chips. Summary cards show Total Products, Approved, Pending, and Needs Review counts.</p>

      <p>Table columns include Product Name, Category, Current Status, Approved base price, Optimal Price (current), Actual Markup %, Approved On (readable date format), Approved By, and Active?</p>

      <p><strong>Note:</strong> Optimal Price shows today's calculated value, not the value at approval time. For expiry dates, check the Products page or the product History tab.</p>

      <p>Export as PDF or Excel from the report toolbar. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  // ── ACTIVITY AND HISTORY ──────────────────────────────────────────────────

  {
    id: 'activity-log',
    section: 'Settings and Data',
    title: 'Using the Activity log',
    keywords: ['activity', 'log', 'history', 'audit', 'who did what', 'changes', 'track', 'record'],
    relatedArticleIds: ['price-history-tab', 'approval-history-report', 'filter-chips'],
    content: `
      <p>The Activity log records significant actions in PriceRight. Open <strong>Activity</strong> from the Pricing section of the sidebar.</p>

      <p>The log records product approvals, products reset to pending, products moved to Needs review, material cost updates, exchange-rate updates, and price level changes.</p>

      <p>Each entry shows an action icon, description, time, and who performed it. Approval entries show <strong>Markup %</strong> at the time of approval (older entries may show legacy gross margin values).</p>

      <p>Filter by entity type (Products, Materials, Price Levels, Exchange Rates), action group (Approvals, Cost changes, Created, Deleted), and date range. Reset to Pending actions appear in the list. Active filters show as removable chips — click <strong>Clear all filters</strong> to reset.</p>

      <p>Results load 50 entries at a time — click <strong>Load more</strong> for older entries.</p>`,
  },

  {
    id: 'price-history-tab',
    section: 'Products and Materials',
    title: 'Product History Tab',
    keywords: ['history tab', 'approval history', 'activity log', 'price changes', 'product history'],
    relatedArticleIds: ['how-approval-works', 'activity-log', 'reset-to-pending'],
    content: `
      <p>The product detail page has two tabs: <strong>Bill of materials</strong> and <strong>History</strong>. Click any product row on the Products page to open the detail page, then select the <strong>History</strong> tab.</p>

      <p>Use the filter buttons at the top of the History tab:</p>
      <ul>
        <li><strong>All</strong> — shows every event: approvals, resets to pending, cost changes, and review flags</li>
        <li><strong>Approvals only</strong> — shows only approval events with approved price, production cost, markup %, price change, and who approved</li>
      </ul>

      <p>In Approvals only view, markup is colour-coded using your Healthy Markup Threshold — green for Healthy, amber for Low, red for Critical. The most recent approval row is highlighted in light blue.</p>

      <p>For a full audit trail across all products and materials, use the <strong>Activity log</strong> page in the sidebar.</p>`,
  },

  {
    id: 'keep-current-price',
    section: 'Settings and Data',
    title: 'Keeping the current price after a cost change',
    keywords: ['keep current price', 'absorb cost', 'maintain price', 'cost increase', 'same price', 'no change'],
    relatedArticleIds: ['needs-review', 'how-approval-works', 'price-expiry'],
    content: `
      <p><strong>Keep current price</strong> lets you re-approve a product at its existing <strong>Approved base price</strong> after costs change. Use it when you need to hold market price while still clearing <strong>Needs review</strong>.</p>

      <p>Use this option when cost movement is temporary, customer commitments require stable pricing, or competitive pressure makes an immediate increase risky. Before confirming, review the updated markup to ensure the result is acceptable.</p>

      <p>When a product is in <strong>Needs review</strong>, open its product detail page from the <strong>Products</strong> list. Compare current approved value, updated <strong>Production cost</strong>, and new <strong>Optimal price</strong>, then select <strong>Keep current price</strong>.</p>

      <p>PriceRight protects against loss approvals. If the current approved value is below updated <strong>Production cost</strong>, the keep-current option is disabled and you must choose a different approval value.</p>

      <p>Keeping the current value is still an approval action. Status moves back to Approved, approval time updates, and rule-based <strong>Price level</strong> prices continue to calculate from the confirmed base value.</p>`,
  },

  {
    id: 'stale-custom-price-alerts',
    section: 'Settings and Data',
    title: 'Stale custom price alerts',
    keywords: ['stale', 'custom price', 'outdated', 'alert', 'review', 'price level', 'custom', 'warning'],
    relatedArticleIds: ['special-pricing', 'price-level-approval', 'generating-price-list'],
    content: `
      <p>A stale custom price happens when a product's approved base price changes after a fixed custom price was set in a price level. Rule-based entries recalculate automatically; custom values stay fixed until you review them.</p>

      <p>On the Price Levels page, stale custom entries show amber warnings — a banner above the table and row-level indicators with tooltips.</p>

      <p>When you edit a stale row in the <strong>Edit Pricing Rule</strong> modal, PriceRight shows current base context so you can keep, change, or switch to a rule-based price.</p>

      <p>If you use <strong>Export selected</strong>, an amber notice appears when selected items include stale custom prices. Direct toolbar exports (PDF, Excel, Print) export all approved items — review stale rows first if needed.</p>`,
  },

  {
    id: 'data-backup',
    section: 'Settings and Data',
    title: 'Backing up and restoring your data',
    keywords: ['backup', 'restore', 'data', 'save', 'export data', 'database', 'protect', 'recovery'],
    relatedArticleIds: ['demo-mode', 'restoring-from-backup', 'master-data'],
    content: `
      <p>PriceRight stores working data in a local SQLite database file. Live business data uses <strong>priceright.db</strong> and demo data uses <strong>demo.db</strong> as a separate file.</p>

      <p>Open <strong>Settings</strong> and go to <strong>Data &amp; Backups</strong> to check backup status. The page shows backup count and latest backup time when available.</p>

      <p>Use <strong>Create backup</strong> before major updates such as broad material price imports, product restructuring, or large approval cycles. Manual backup runs immediately and updates status after completion.</p>

      <p>Automatic backups run on a schedule handled by the server. Manual and automatic backups are both part of the same backup status flow shown in Settings.</p>

      <p>To restore from a backup:</p>
      <ol>
        <li>Go to <strong>Settings → Data &amp; Backups</strong></li>
        <li>Click <strong>Restore from backup</strong></li>
        <li>Select your backup file (.db)</li>
        <li>Confirm the restore</li>
        <li>The app will restart with your restored data</li>
      </ol>

      <p>Live and demo data are separate databases. Backup and restore operations for live usage should target the live database context.</p>

      <p>Before restore or <strong>Clear All Data</strong>, a <strong>Download backup first</strong> button appears in the confirmation modal so you can save your current data before proceeding.</p>

      <p>The <strong>Version history</strong> section at the bottom of the Data tab shows your current version and a link to download previous releases if you need to roll back.</p>`,
  },

  {
    id: 'demo-mode',
    section: 'Settings and Data',
    title: 'Using demo mode',
    keywords: ['demo', 'demo mode', 'sample data', 'test', 'explore', 'try', 'Savanna Foods', 'switch'],
    relatedArticleIds: ['sample-data', 'data-backup', 'welcome'],
    content: `
      <p>Demo mode switches the app to a separate sample database so you can test workflows without affecting live business data. In Settings, demo mode maps to <strong>demo.db</strong>, while live mode maps to <strong>priceright.db</strong>.</p>

      <p>Use demo mode for training, walkthroughs, and safe experimentation with approvals, price levels, exports, and reporting.</p>

      <p>To switch modes, open <strong>Settings</strong>, go to <strong>Data &amp; Backups</strong>,
      and find the <strong>Data mode</strong> section. Click <strong>Try sample data</strong> to switch
      to demo mode. Click <strong>Use my real data</strong> to switch back. The app confirms
      the action and reloads after the change.</p>

      <p>When demo mode is enabled, the interface shows demo indicators and reads sample records from the demo database. When disabled, the app returns to live data from the live database file.</p>

      <p>Demo and live data do not mix. Switching modes changes which database is active for reads and writes, so testing in demo mode does not modify your live dataset.</p>`,
  },

  {
    id: 'master-data',
    section: 'Settings and Data',
    title: 'Configuring master data',
    keywords: ['master data', 'categories', 'units', 'standard list', 'dropdown', 'configuration', 'settings'],
    relatedArticleIds: ['adding-materials', 'markup-health-guide', 'company-branding'],
    content: `
      <p>Master Data defines standard categories and units suggested when you create products and materials. Open <strong>Settings</strong> — horizontal tabs across the top let you switch between General, Pricing Engine, Currencies &amp; Rates, Master Data, and Data &amp; Backups.</p>

      <p>On the <strong>Master Data</strong> tab, three chip-based editors let you manage lists:</p>
      <ul>
        <li><strong>Product Categories</strong> — type a name and click Add; each category appears as a removable chip</li>
        <li><strong>Raw Material Categories</strong> — same chip pattern for material categories</li>
        <li><strong>Units of Measure</strong> — standard units like kg, liters, pieces</li>
      </ul>

      <p>Each section shows usage counts below the chips. Click × on a chip to remove an unused entry. Click <strong>Save Master Data</strong> when done — values are available immediately across the app.</p>

      <p>You can still type custom categories or units on any form — Master Data is a suggestion list, not a restriction.</p>

      <p>On the <strong>Pricing Engine</strong> tab, set your <strong>Healthy Markup Threshold</strong> — the minimum markup % considered healthy. Products are colour-coded Healthy (green), Low (amber), or Critical (red) based on this setting.</p>`,
  },

  {
    id: 'column-selector',
    section: 'Products and Materials',
    title: 'Choosing which columns to show in tables',
    keywords: ['columns', 'column selector', 'table', 'show hide'],
    relatedArticleIds: ['active-inactive-filter', 'export-guide', 'building-product-bom'],
    content: `
      <p>The Products, Materials, and Intermediate Materials tables each have a column selector in the toolbar.</p>

      <p>Click <strong>Columns</strong> to show or hide columns with checkboxes. Your choices are saved automatically.</p>

      <p>On the Products table, default visible columns include Product Name, Production Cost, Optimal Price, Approved Base Price, Actual Markup %, and Approval Status. <strong>Gross Margin %</strong> columns are available but hidden by default — they are labelled "(reference)" because Markup on Cost is the primary metric.</p>`,
  },

  {
    id: 'active-inactive-filter',
    section: 'Products and Materials',
    title: 'Filtering active and inactive items',
    keywords: ['active', 'inactive', 'filter', 'hide', 'archive'],
    relatedArticleIds: ['column-selector', 'materials-analysis-tab', 'filter-chips'],
    content: `
      <p>Products, Materials, and Intermediate Materials each have an Active, Inactive, or All filter in the toolbar. By default only active items are shown.</p>

      <p>When any filter is active (including search), small <strong>filter chips</strong> appear below the toolbar showing what is filtered — for example "Showing: Inactive" or "Search: sugar". Click × on a chip to remove that filter, or <strong>Clear all filters</strong> to reset everything.</p>

      <p>Setting an item inactive removes it from day-to-day views without deleting it. Inactive materials still in active product BOMs are flagged in the <strong>Inactive in Active BOMs</strong> report under Reports and Analysis → Materials.</p>`,
  },

  {
    id: 'prev-next-navigation',
    section: 'Products and Materials',
    title: 'Moving between products and materials without closing',
    keywords: ['previous', 'next', 'navigation', 'browse', 'detail page'],
    relatedArticleIds: ['material-detail-page', 'intermediate-detail-page', 'building-product-bom'],
    content: `
      <p>On product, material, and intermediate detail pages, <strong>Previous</strong> and <strong>Next</strong> buttons let you move through the current filtered list without going back to the table. A counter shows your position — for example, <strong>3 of 47</strong>.</p>

      <p>The first time you open a detail page, a one-time hint explains this navigation. The hint is shared across Products, Materials, and Intermediate Materials — dismiss it once and it will not appear again.</p>

      <p>Navigation follows your current filters and sort order on the list page.</p>`,
  },

  {
    id: 'pack-size-pricing',
    section: 'Price Lists and Exports',
    title: 'Adding pack sizes to a price level',
    keywords: ['pack size', 'pack price', 'manage packs', 'bulk pack', 'case price'],
    relatedArticleIds: ['special-pricing', 'generating-price-list', 'price-levels'],
    content: `
      <p>A price level can show both unit prices and pack prices for each product.</p>

      <p>Click the toolbar <strong>Pack sizes</strong> button on the Price Levels page (not a per-row menu). The Manage Pack Sizes modal opens for the first product — use <strong>Previous</strong> and <strong>Next</strong> to move between products in the level.</p>

      <p>Enter pack quantities — for example 6, 12, or 1 (single-unit packs are accepted). Pack price is calculated as unit price × pack quantity. You can also add or remove packs from the <strong>Edit Pricing Rule</strong> modal for a specific product.</p>

      <p>Each pack appears as its own row in the price list table and on exported lists.</p>

      <p>Pack quantities must be at least 1. Saving a pack size of zero shows an error. A pack of 1 is valid for showing individual unit pricing.</p>`,
  },

  {
    id: 'price-level-currency',
    section: 'Price Lists and Exports',
    title: 'Setting a price level to a different currency',
    keywords: ['currency', 'exchange rate', 'foreign currency', 'price list currency', 'convert'],
    relatedArticleIds: ['price-list-currencies', 'price-levels', 'foreign-currencies'],
    content: `
      <p>When creating or editing a price level, you can choose any active currency for that price list.</p>

      <p>Set the currency in Step 1 of the price level wizard, or edit it later in the price level settings under <strong>Price list currency</strong>.</p>

      <p>Once a currency is set, all prices in that level are shown and exported in that currency. The conversion uses the exchange rate you have entered in Settings — keep your rates up to date for accurate exported prices.</p>

      <p>The <strong>Approved Base</strong> price column always shows the amount in your base currency as a reference. The level currency column shows the converted price.</p>

      <p>The exported price list includes an exchange rate note at the bottom so customers can see the rate used.</p>

      <p>If no currency is set, the price level uses your base currency with no conversion needed.</p>`,
  },

  {
    id: 'price-level-approval',
    section: 'Price Lists and Exports',
    title: 'Approving prices within a price level',
    keywords: ['approve', 'pending', 'price level approval', 'export', 'status'],
    relatedArticleIds: ['generating-price-list', 'price-level-wizard', 'stale-custom-price-alerts'],
    content: `
      <p>When you add products to a price level or change pricing rules, affected items become <strong>Pending</strong>. Only approved items appear on exports.</p>

      <p><strong>At the end of the wizard:</strong> choose <strong>Approve all prices now</strong> to create the level ready for export, or <strong>I'll approve later</strong> to approve from the Price Levels page.</p>

      <p>On the Price Levels page, use <strong>Approve all pending</strong> for the whole level, or select rows and use <strong>Approve selected</strong> in the bulk bar. Editing a rule after approval resets the item to Pending.</p>`,
  },

  {
    id: 'undo-bulk-approve',
    section: 'Pricing and Approvals',
    title: 'Undoing a bulk approval',
    keywords: ['undo', 'bulk approve', 'reverse', 'mistake'],
    relatedArticleIds: ['bulk-approval', 'how-approval-works', 'needs-review'],
    content: `
      <p>After completing a bulk approval, a confirmation banner appears at the bottom of the screen with a red <strong>Undo</strong> button on the left and a green <strong>Keep</strong> button on the right.</p>

      <p>Click <strong>Undo</strong> to reverse the entire bulk approval and return all affected products to their previous status.</p>

      <p>The banner stays until you click <strong>Undo</strong> or <strong>Keep</strong>. If you dismiss it with <strong>Keep</strong>, the action cannot be reversed from this button.</p>

      <p>If you miss the undo window, you can manually re-approve individual products from their product detail pages, or use <strong>Reset to Pending</strong> from the Products bulk bar if you need to clear approved prices.</p>`,
  },

  {
    id: 'company-branding',
    section: 'Settings and Data',
    title: 'Adding your company name and logo',
    keywords: ['company name', 'logo', 'branding', 'dashboard', 'settings'],
    relatedArticleIds: ['master-data', 'welcome', 'generating-price-list'],
    content: `
      <p>Go to <strong>Settings</strong> and open the <strong>General</strong> tab.</p>

      <p>Enter your company name — this appears on the Dashboard and on printed and exported price lists.</p>

      <p>Upload a company logo — supported formats are PNG and JPG. Keep the file under 1 MB; a square image of at least 200 × 200 pixels works well.</p>

      <p>Your logo appears in the Dashboard header alongside your company name.</p>

      <p>These details are stored locally on your computer and are never sent to any server. You can update your company name or logo at any time from the same Settings page.</p>

      <p>Your company name also appears in the header of every PDF export across all sections of the app.</p>`,
  },

  {
    id: 'inline-exchange-rate',
    section: 'Products and Materials',
    title: 'Updating exchange rates quickly',
    keywords: ['exchange rate', 'currency', 'toolbar', 'inline edit', 'foreign currency'],
    relatedArticleIds: ['foreign-currencies', 'currency-exposure', 'exchange-rate-status'],
    content: `
      <p>The current exchange rates for all your active foreign currencies are shown directly in the toolbar at the top of the Materials page.</p>

      <p>Click the pencil icon next to any rate to edit it inline. Type the new rate and click <strong>Save</strong>. Click <strong>Cancel</strong> if you change your mind.</p>

      <p>You do not need to go into Settings to update rates — this toolbar shortcut is the fastest way to keep rates current.</p>

      <p>Exchange rates affect the base currency cost of any material purchased in that currency, and flow through to product costs and price level conversions automatically.</p>

      <p>For full rate management including adding new currencies, go to <strong>Settings</strong> → <strong>Currencies &amp; Rates</strong>.</p>`,
  },

  // ── NEW ARTICLES (Batch I Phase 2) ─────────────────────────────────────────

  {
    id: 'how-priceright-calculates-profit',
    section: 'Getting Started',
    title: 'How PriceRight calculates profit',
    keywords: ['markup', 'profit', 'gross margin', 'markup on cost', 'calculation', 'percentage', 'direct labor', 'labor cost', 'other direct costs'],
    relatedArticleIds: ['overhead-and-margin', 'markup-health-guide', 'how-approval-works'],
    content: `
      <p>PriceRight uses <strong>Markup on Cost</strong> as its profit metric — the percentage you add on top of what it costs to make a product.</p>

      <p>Production cost starts from your Bill of Materials, plus any <strong>Direct Labor Cost</strong> you enter, with overhead applied to that combined subtotal:</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        Production cost = (Material cost + Direct labor cost) × (1 + Overhead%) + Other Direct Costs
      </p>

      <p><strong>Other Direct Costs</strong> (Products only) cover one-off costs such as special packaging or certification fees. They are added after overhead and are not multiplied by the overhead percentage. Intermediate Materials do not use this field.</p>

      <p>For intermediate materials, the same batch formula applies (materials + direct labor, then overhead), then PriceRight divides by output quantity to get cost per unit.</p>

      <p>Actual markup on cost at the approved price is:</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        (Approved Price − Production Cost) ÷ Production Cost × 100
      </p>

      <p>Example: production cost GHS 10.00, approved price GHS 14.00 → 40% markup on cost.</p>

      <p>Manufacturers usually think in markup on cost — "I add 30% on top of my costs." <strong>Gross margin</strong> is different: it divides profit by the selling price, not the cost. PriceRight shows Gross Margin % as an optional reference column on the Products table for accounting purposes.</p>

      <p>Products are rated Healthy, Low, or Critical based on your <strong>Healthy Markup Threshold</strong> in Settings → Pricing Engine. See <strong>Understanding markup health bands</strong> for details.</p>`,
  },

  {
    id: 'markup-health-guide',
    section: 'Pricing and Approvals',
    title: 'Understanding markup health bands',
    keywords: ['healthy', 'low', 'critical', 'markup threshold', 'health bands', 'colour coding', 'green', 'amber', 'red'],
    relatedArticleIds: ['how-priceright-calculates-profit', 'markup-analysis-report', 'overhead-and-margin'],
    content: `
      <p>PriceRight colour-codes products by markup health using three bands tied to your <strong>Healthy Markup Threshold</strong> in Settings → Pricing Engine.</p>

      <ul>
        <li><strong>Healthy (green)</strong> — markup at or above the threshold</li>
        <li><strong>Low (amber)</strong> — markup between half the threshold and the threshold</li>
        <li><strong>Critical (red)</strong> — markup below half the threshold</li>
      </ul>

      <p>Example with a 20% threshold: Healthy ≥ 20%, Low 10%–20%, Critical &lt; 10%.</p>

      <p>Colour coding appears on the Products table, Dashboard, Reports, and Product Detail. Click the <strong>Markup Health</strong> info button (ⓘ) in page toolbars to see your current bands at a glance — it updates automatically when you change the threshold in Settings.</p>

      <p>The <strong>Below Markup Target</strong> widget on the Dashboard links directly to the Markup Analysis report — click <strong>View Markup Analysis →</strong> at the bottom of the widget.</p>`,
  },

  {
    id: 'reset-to-pending',
    section: 'Pricing and Approvals',
    title: 'Resetting a product price to pending',
    keywords: ['reset to pending', 'pending', 'remove approval', 'reprice', 'clear approved price'],
    relatedArticleIds: ['how-approval-works', 'needs-review', 'price-history-tab'],
    content: `
      <p><strong>Reset to Pending</strong> clears a product's approved price and returns it to pending status. Use it when costs have changed significantly and you want to start the approval process fresh.</p>

      <p><strong>Individual:</strong> Open the product detail page. On approved or needs-review products, click the <strong>Reset to pending</strong> link below the approval form.</p>

      <p><strong>Bulk:</strong> On the Products page, select products with checkboxes, open the bulk <strong>More</strong> menu, and click <strong>Reset to Pending</strong>.</p>

      <p>After reset, the product appears in the pending approvals banner and cannot be exported in price levels until re-approved.</p>`,
  },

  {
    id: 'material-detail-page',
    section: 'Products and Materials',
    title: 'Viewing material details',
    keywords: ['material detail', 'usage', 'price history', 'material page', 'raw material'],
    relatedArticleIds: ['adding-materials', 'prev-next-navigation', 'foreign-currencies'],
    content: `
      <p>Click any material row on the Materials page to open the full <strong>Material Detail</strong> page at <strong>/materials/:id</strong>.</p>

      <p>The page uses a two-column layout — material info and tabs on the left, pricing summary on the right. Two tabs are available:</p>
      <ul>
        <li><strong>Usage</strong> — which products use this material and the quantity in each BOM</li>
        <li><strong>Price History</strong> — historical unit cost changes over time</li>
      </ul>

      <p>Quick actions include Edit, Duplicate, Delete, and View in table. Use <strong>Previous</strong> and <strong>Next</strong> to move between materials in your current filtered list.</p>`,
  },

  {
    id: 'intermediate-detail-page',
    section: 'Products and Materials',
    title: 'Viewing intermediate material details',
    keywords: ['intermediate detail', 'BOM', 'cost history', 'intermediate material page'],
    relatedArticleIds: ['intermediate-materials', 'creation-panels', 'prev-next-navigation'],
    content: `
      <p>Click any intermediate material row to open its full detail page. Layout matches Material Detail and Product Detail — two columns with tabs on the left.</p>

      <ul>
        <li><strong>BOM</strong> — component materials with quantities and costs</li>
        <li><strong>Cost History</strong> — historical cost changes</li>
      </ul>

      <p>The <strong>Cost Summary</strong> card on the right shows batch output, material cost, Direct Labor, overhead, cost per unit, markup, and optimal price. Previous/Next navigation moves through your filtered intermediate list.</p>`,
  },

  {
    id: 'creation-panels',
    section: 'Products and Materials',
    title: 'Creating products and intermediate materials',
    keywords: ['create product', 'create intermediate', 'overlay panel', 'floating panel', 'two panel'],
    relatedArticleIds: ['building-product-bom', 'intermediate-materials', 'how-approval-works'],
    content: `
      <p>Products and intermediate materials are created in a floating overlay panel — the list stays visible but dimmed behind it.</p>

      <p>Click <strong>+ Add</strong> on the Products or Intermediate Materials page. Two panels appear side by side: the <strong>form</strong> on the left and the <strong>BOM builder</strong> on the right. Type to search for a material, click a result to add it immediately, and set the quantity directly in the table row. Use the Edit button on any BOM row to change it later. This works identically for both Products and Intermediate Materials.</p>

      <p>The Cost Summary sits alongside the BOM table on the right. The Product creation form does not include a SKU field.</p>

      <p>For intermediate materials, after adding recipe ingredients on the right, answer <strong>How much finished product did this batch make?</strong> — enter an exact amount or a percentage of total raw input. Both give the same cost per unit.</p>

      <p>You can add BOM items before saving — no need to save the product first. The <strong>Save</strong> button is always visible at the bottom of the left panel. Click × or outside the panel to cancel without saving.</p>

      <p>Closing a product form mid-edit shows a <strong>Discard changes?</strong> warning. Choose <strong>Keep editing</strong> to return to the form, or <strong>Discard</strong> to close and lose your changes. Navigation away from the page is blocked while the form has unsaved changes.</p>`,
  },

  {
    id: 'reports-navigation',
    section: 'Reports and Analysis',
    title: 'Navigating Reports and Analysis',
    keywords: ['reports navigation', 'tab bar', 'pills', 'pricing reports', 'products reports', 'materials reports', 'auto generate'],
    relatedArticleIds: ['pricing-status-report', 'materials-analysis-tab', 'pricing-analysis-page'],
    content: `
      <p><strong>Reports and Analysis</strong> is organised into three groups via tabs at the top: <strong>Pricing</strong>, <strong>Products</strong>, and <strong>Materials</strong>.</p>

      <p>Pricing and Products groups use <strong>pill selectors</strong> to pick a report. Materials uses a <strong>dropdown</strong>. Reports generate automatically when selected — there is no Generate button. Changing filters updates results live.</p>

      <p><strong>Pricing reports:</strong> Pricing Status, Markup Analysis, Approval History, Price List Summary.</p>
      <p><strong>Products reports:</strong> Product Pricing Overview, Margin Health, Profitability Ranking, Price vs Cost Drift, Optimal vs Actual Gap.</p>
      <p><strong>Materials reports:</strong> Currency Exposure, Materials Cost Analysis, Top Cost Drivers, Price Volatility, Material Price History, Inactive in Active BOMs.</p>

      <p>Active filters appear as removable chips above results. Use the export buttons (PDF, Excel, Print) in the toolbar. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'filter-chips',
    section: 'Getting Started',
    title: 'Using filter chips',
    keywords: ['filter chips', 'active filters', 'clear filters', 'filter indicator'],
    relatedArticleIds: ['active-inactive-filter', 'reports-navigation', 'activity-log'],
    content: `
      <p>When any filter is active, small pill-shaped <strong>filter chips</strong> appear below the toolbar — for example "Status: Approved" or "Search: soap".</p>

      <p>Click × on a chip to remove that filter alone. Click <strong>Clear all filters</strong> to reset everything at once.</p>

      <p>Filter chips appear on Products, Materials, Intermediate Materials, Reports and Analysis, and Activity. When filters produce no results, the empty state includes a Clear all filters button.</p>`,
  },

  {
    id: 'exchange-rate-status',
    section: 'Settings and Data',
    title: 'Monitoring exchange rate status',
    keywords: ['exchange rate status', 'currency rates', 'stale rates', 'rate update'],
    relatedArticleIds: ['foreign-currencies', 'inline-exchange-rate', 'currency-exposure'],
    content: `
      <p>The <strong>Exchange Rate Status</strong> widget on the Dashboard shows how recently your exchange rates were updated.</p>

      <p>Green means all rates are current. Amber or red means some rates are stale and material costs in base currency may be inaccurate.</p>

      <p>Click the widget to go to <strong>Settings → Currencies &amp; Rates</strong> and update your rates. You can also edit rates inline from the Materials page toolbar.</p>

      <p>Exchange rates must be greater than zero. Saving a zero or negative rate shows an error message because a zero rate would make all material costs in that currency appear as zero.</p>`,
  },

  {
    id: 'price-level-cost-warning',
    section: 'Price Lists and Exports',
    title: 'Cost change warnings on price lists',
    keywords: ['cost changed', 'needs review', 'warning badge', 'material cost change', 'price level warning'],
    relatedArticleIds: ['needs-review', 'price-level-approval', 'how-approval-works'],
    content: `
      <p>An amber <strong>Cost changed</strong> badge appears on price level rows when raw material costs have changed since the product's base price was approved.</p>

      <p>The price level item stays approved — the badge is informational. Click it to open the product detail page and review the impact.</p>

      <p>To resolve: update the product's approved base price if needed, then re-approve the price level item if the final customer price should change.</p>`,
  },

  {
    id: 'markup-analysis-report',
    section: 'Reports and Analysis',
    title: 'Using the Markup Analysis report',
    keywords: ['markup analysis', 'below target', 'above target', 'target gap', 'markup threshold', 'custom range'],
    relatedArticleIds: ['low-margin-report', 'markup-health-guide', 'how-priceright-calculates-profit'],
    content: `
      <p>Open <strong>Reports and Analysis → Pricing tab → Markup Analysis</strong> pill. The threshold input defaults to your Healthy Markup Threshold from Settings but can be changed for this session.</p>

      <p>Filter by All products, Above target, Below target, or Custom range (enter min and max %). Stat cards show Total Analysed, Above Target, Below Target, and Average Markup %.</p>

      <p>The table shows Product Name, Category, Production Cost, Approved Price, Actual Markup %, and <strong>Target Gap</strong> (Actual Markup % minus threshold). Positive gap = above target; negative = below.</p>

      <p>Export includes the threshold value used. Filter chips show active filters above the results. <strong>Print</strong> generates and downloads a PDF — open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'product-pricing-overview',
    section: 'Reports and Analysis',
    title: 'Product Pricing Overview report',
    keywords: ['pricing overview', 'approval status', 'margin health', 'combined report', 'pricing status'],
    relatedArticleIds: ['pricing-analysis-page', 'pricing-status-report', 'markup-health-guide'],
    content: `
      <p>Find this report at <strong>Reports and Analysis → Products tab → Pricing Overview</strong> pill. It combines approval status and markup health in one view.</p>

      <p>Summary stat cards show counts by approval status and markup health band. The table lists all active products with Product Name, Category, Production Cost, Approved Base Price, Optimal Price, Actual Markup %, Approval Status badge, and Pricing Health badge.</p>

      <p>Products sort with Needs Review first, then Pending, then Approved. Filter by category, approval status, or pricing health. Results update automatically when filters change.</p>`,
  },

  {
    id: 'export-guide',
    section: 'Price Lists and Exports',
    title: 'Exporting and printing your data',
    keywords: ['export', 'CSV', 'Excel', 'PDF', 'print', 'export guide', 'download'],
    relatedArticleIds: ['generating-price-list', 'column-selector', 'price-list-currencies'],
    content: `
      <p>Most data pages have a standard export toolbar: <strong>Export CSV</strong>, <strong>Export Excel</strong>, and <strong>Print</strong>. Price Levels and Reports also include <strong>Export PDF</strong>.</p>

      <p>All exports use the same columns in the same order. A <strong>Currency</strong> column shows which currency each row is in — headers stay plain without currency codes embedded in names.</p>

      <p>Customer-facing price level exports show only Product Name, Pack Size, Unit Price, Pack Price, and Currency. Internal data exports (Materials, Products) include full detail columns.</p>

      <p>On the Products page, use the column selector to choose which columns appear in exports. Reports export from the filter row toolbar.</p>

      <p>PDF exports show your company name in the header (from <strong>Settings → Your Business</strong>), navy column headers, alternating row shading, page numbers, numbers formatted to two decimal places, a <strong>Currency</strong> column on each row, and no SKU, Description, or Active columns. All four formats — CSV, Excel, PDF, and Print — use identical columns in the same order.</p>

      <p><strong>Print</strong> generates and downloads a PDF. Open the downloaded PDF in your PDF viewer to print from there.</p>`,
  },

  {
    id: 'error-boundaries',
    section: 'Getting Started',
    title: 'When something goes wrong',
    keywords: ['error', 'crash', 'something went wrong', 'try again', 'tab error'],
    relatedArticleIds: ['help-centre'],
    content: `
      <p>If a tab encounters an error PriceRight shows a friendly message — <strong>This tab could not load</strong> — with a <strong>Try again</strong> button. Your data is safe. Click Try again to reload the section.</p>

      <p>If the whole page encounters a serious error a <strong>Reload</strong> button appears. Click it to restart. If the problem continues contact <strong>support@therighthub.com</strong>.</p>`,
  },

  {
    id: 'help-centre',
    section: 'Getting Started',
    title: 'Using the Help Centre',
    keywords: ['help', 'help centre', 'articles', 'search', 'browse', 'documentation'],
    relatedArticleIds: ['welcome', 'first-setup', 'filter-chips'],
    content: `
      <p>Open <strong>Help</strong> from the sidebar to reach the Help Centre.</p>

      <p><strong>Where to start</strong> — six numbered steps link to the most important setup articles (currency, materials, products, approval, price lists, export).</p>

      <p><strong>Browse by topic</strong> — a grid of categories (Getting Started, Products and Materials, Pricing and Approvals, and more). Click a category to see all articles in that section.</p>

      <p>Use the search bar for instant suggestions as you type. Click any article to open it as a full page with related articles at the bottom. The <strong>Print article</strong> button generates and downloads a PDF of the article content only — no navigation or UI elements are included.</p>

      <p>After reading, answer <strong>Was this article helpful?</strong> to send feedback.</p>`,
  },

];