export interface HelpArticle {
  id: string;
  section: string;
  title: string;
  content: string;
  keywords: string[];
}

export const helpArticles: HelpArticle[] = [

  // ── GETTING STARTED ────────────────────────────────────────────────────────

  {
    id: 'welcome',
    section: 'Getting Started',
    title: 'Welcome to PriceRight',
    keywords: ['welcome', 'overview', 'what is priceright', 'introduction'],
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

      <p>Here is what you can do with PriceRight:</p>
      <ul>
        <li>Track material costs in multiple currencies</li>
        <li>Build products with a full Bill of Materials</li>
        <li>Calculate optimal prices automatically</li>
        <li>Approve prices through a proper workflow</li>
        <li>Set different prices for different customer types</li>
        <li>Create and share professional price lists</li>
        <li>Use the Activity log to track important pricing actions</li>
        <li>Review product Price history before making decisions</li>
        <li>Run reports on your pricing health</li>
      </ul>

      <p>Sample data files are included so you can explore all features with realistic data before entering your own.</p>`,
  },

  {
    id: 'sample-data',
    section: 'Getting Started',
    title: 'Using the sample data files',
    keywords: ['sample', 'sample data', 'demo files', 'import sample', 'getting started', 'example data', 'try', 'explore'],
    content: `
      <p>PriceRight includes three sample data files designed as a realistic food-manufacturing example. Use them to explore all features with realistic data before entering your own.</p>

      <p>Go to Settings in the Setup section and find the Sample data section. Download each file and import them in this exact order:</p>

      <ol>
        <li><strong>Raw materials</strong> — 25 ingredients, oils, grains, and packaging items with realistic prices in your base currency. On the Materials page (Primary tab), click <strong>+ Add → Import from CSV</strong>.</li>
        <li><strong>Intermediate materials</strong> — 5 in-house processed ingredients such as peanut paste and cocoa powder. On the Materials page (Intermediate tab), click <strong>+ Add → Import from CSV</strong>.</li>
        <li><strong>Products with ingredients</strong> — 11 finished products including peanut butter, cocoa powder, gari, pepper sauce, and more. Each product comes with a full bill of materials. On the Products page, click <strong>+ Add → Import from CSV</strong>.</li>
      </ol>

      <p>The order matters. Products reference ingredients by name — if the materials are not imported first, products will be skipped during import.</p>

      <p>Once imported, you can approve base prices, create price levels, export price lists, and run reports — all with realistic data. When you are ready to return to your real data after using sample data, go to <strong>Settings → Data &amp; Backups</strong> and click <strong>Use my real data</strong>. Your real data is preserved and sample data is not deleted — they are separate databases.</p>

      <p>The sample data files are always available in Settings under Sample data. You can re-download and re-import them at any time.</p>`,
  },

  {
    id: 'first-setup',
    section: 'Getting Started',
    title: 'Setting up for the first time',
    keywords: ['setup', 'getting started', 'first time', 'onboarding', 'steps'],
    content: `
      <p>Setting up PriceRight for the first time takes about 10 minutes if your
      material costs are ready. Follow these steps in order — each one builds
      on the last.</p>

      <p>If you want to explore PriceRight before entering your own data, download the sample data files from Settings under Sample data. Import them in order — raw materials first, then intermediate materials, then products — and the app will be populated with a realistic sample dataset you can use to try every feature.</p>
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
        Set the overhead percentage and Markup %. PriceRight calculates the
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
    content: `
      <p>If you need to recover your data from a backup, follow these steps.</p>

      <p><strong>When to restore:</strong></p>
      <ul>
        <li>Your data was accidentally deleted</li>
        <li>You want to go back to a previous state</li>
        <li>You are moving to a new computer</li>
      </ul>

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
    section: 'Raw Materials',
    title: 'Adding your first materials',
    keywords: ['add material', 'create material', 'raw material', 'new material'],
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
    section: 'Raw Materials',
    title: 'Setting bulk prices and units',
    keywords: ['bulk price', 'unit price', 'bulk quantity', 'unit cost', 'calculation'],
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
    section: 'Raw Materials',
    title: 'Using foreign currencies',
    keywords: ['currency', 'USD', 'exchange rate', 'foreign', 'base currency', 'convert'],
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
    section: 'Raw Materials',
    title: 'Importing materials in bulk',
    keywords: ['import', 'bulk import', 'CSV', 'upload', 'template', 'excel'],
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
    title: 'Importing data with templates',
    section: 'Raw Materials',
    keywords: ['import', 'template', 'CSV', 'Excel', 'bulk import', 'upload', 'intermediate'],
    content: `
      <p>PriceRight provides Excel templates for importing materials and products in bulk. This is faster than adding items one by one.</p>

      <p><strong>Available templates:</strong></p>
      <ul>
        <li><strong>Materials import template</strong> — for primary raw materials. Go to <strong>Materials</strong> (Primary tab), click <strong>+ Add → Import from CSV</strong>, then <strong>Download template</strong>.</li>
        <li><strong>Intermediate materials import template</strong> — for in-house processed materials. Go to <strong>Materials</strong> (Intermediate tab), click <strong>+ Add → Import from CSV</strong>, then <strong>Download template</strong>.</li>
        <li><strong>Products import template</strong> — for finished products with their full bill of materials. Go to <strong>Products</strong>, click <strong>+ Add → Import from CSV</strong>, then <strong>Download template</strong>.</li>
      </ul>

      <p><strong>How to fill in a template:</strong></p>
      <ul>
        <li>Open the template in Excel</li>
        <li>Read the instructions on the first sheet</li>
        <li>Fill in your data on the Import Data sheet</li>
        <li>Do not change the column headers</li>
        <li>Save as Excel (.xlsx) or CSV</li>
      </ul>

      <p><strong>How to import:</strong></p>
      <ol>
        <li>Go to the page for the type of data you are importing</li>
        <li>Click <strong>+ Add → Import from CSV</strong></li>
        <li>Choose your completed file</li>
        <li>Review the preview — rows with errors are highlighted</li>
        <li>Click Import to finish</li>
      </ol>

      <p><strong>Tips:</strong></p>
      <ul>
        <li>Import materials before products since products reference materials</li>
        <li>Material names in the products template must exactly match the names in your materials list</li>
        <li>Import intermediate materials before products that use them in a bill of materials</li>
      </ul>`,
  },

  {
    id: 'intermediate-materials',
    section: 'Products',
    title: 'Intermediate materials',
    keywords: ['intermediate', 'semi-finished', 'in-house', 'produced material', 'sub-assembly'],
    content: `
      <p>Some materials you use in your products are made in-house from other
      raw materials. PriceRight calls these Intermediate Materials.</p>

      <p><strong>Intermediate materials are managed under the Intermediate tab on
      the Materials page. Once created they appear as selectable components when
      building product BOMs.</strong></p>

      <p>For example, Brown Sugar might be produced from raw sugar and molasses.
      Instead of treating Brown Sugar as a purchased material with a fixed cost,
      you build it as an intermediate material with its own Bill of Materials.</p>

      <p>When raw sugar prices change, Brown Sugar's cost updates automatically.
      And when Brown Sugar's cost updates, every finished product that uses it
      recalculates too. This two-level cascade keeps everything accurate without
      any manual work.</p>

      <p>To create an intermediate material, go to Materials and select the
      Intermediate tab, then click <strong>+ Add → Add single intermediate</strong>. Set the overhead
      percentage, optional Markup %, batch yield, and then build its BOM
      from primary materials.</p>

      <p>The calculated unit cost is then available as an input when building
      finished products — it appears in the same material search alongside your
      primary materials.</p>`,
  },

  {
    id: 'intermediate-costing',
    section: 'Raw Materials',
    title: 'How to cost an intermediate material',
    keywords: [
      'intermediate cost', 'overhead', 'markup', 'transfer price',
      'roasted peanut', 'internal production', 'double counting'
    ],
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
      The roasting process has its own overhead of 15% — electricity for the
      roasting equipment and labour for the roasting team. Overhead adds
      1.46, giving a unit cost of 11.16. When this goes into a
      finished product, 11.16 is the input cost and the finished product's
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
      for Approach 2. Enter both for Approach 3.</p>`,
  },

  {
    id: 'materials-analysis-tab',
    title: 'Using the Materials Analysis tab',
    section: 'Raw Materials',
    keywords: ['materials analysis', 'analysis', 'cost breakdown', 'currency exposure', 'material trends', 'BOM exposure'],
    content: `
      <p>The Materials Analysis tab helps you understand your material costs at a glance.</p>

      <p>Go to <strong>Materials</strong> and click the <strong>Analysis</strong> tab.</p>

      <p>The tab shows these panels:</p>

      <p><strong>Average unit cost by category</strong> — shows the average unit cost for each material category and how many items are in that category.</p>

      <p><strong>Most used materials in products</strong> — lists materials that appear most often in product bills of materials.</p>

      <p><strong>Top 5 highest unit cost materials</strong> — your five most expensive materials by unit cost.</p>

      <p><strong>Cost exposure across product range</strong> — shows which materials would have the biggest impact on product costs if their prices went up. Amounts are based on how much of each material is used across your products.</p>

      <p><strong>Price history</strong> — use the dropdown to select a material and see how its unit cost has changed over time.</p>

      <p><strong>Currency exposure</strong> — shows how many materials you buy in each purchase currency. This is a count only, not a money total. Materials bought in foreign currencies can be affected when exchange rates change.</p>

      <p><strong>Materials with no price changes</strong> — lists materials whose unit cost is zero and may need a price entered.</p>

      <p><strong>Inactive materials still in product BOMs</strong> — a warning panel. If a material is marked inactive but still appears in an active product's bill of materials, your product costs may be wrong. Reactivate the material or update the product recipe.</p>`,
  },

  // ── PRODUCTS ───────────────────────────────────────────────────────────────

  {
    id: 'building-product-bom',
    section: 'Products',
    title: 'Building a product with a BOM',
    keywords: ['product', 'BOM', 'bill of materials', 'create product', 'recipe'],
    content: `
      <p>To create a product, go to <strong>Products</strong> and click
      <strong>+ Add → Add single product</strong>.</p>

      <p>Give the product a name and category. Then choose the production mode —
      Single Unit if you make one unit at a time, or Batch if your recipe produces
      multiple units in one run.</p>

      <p>For batch production, enter the Batch Yield — how many finished units
      your recipe produces. If you make 12 bottles of sauce from one batch,
      enter 12.</p>

      <p>Set the Overhead percentage and Markup %. Overhead covers
      your indirect costs. Markup % is the percentage added on top of
      production cost.</p>

      <p>Then build the Bill of Materials. Search for each material and enter
      the quantity used per batch. As you add materials, PriceRight calculates
      the production cost and optimal price in real time.</p>

        <p>When you save the product, PriceRight calculates the
        <strong>Production cost</strong> automatically and sets the product status
        to <strong>Pending</strong>.</p>

        <p>Next, review and approve an <strong>Approved base price</strong>. Until
        this approval is completed, the product cannot be used in
        <strong>Price levels</strong>.</p>

        <p>If you later update the cost of any material used in the BOM, the product
        moves to <strong>Needs review</strong> and should be re-approved.</p>` ,
  },

  {
    id: 'batch-vs-single',
    section: 'Products',
    title: 'Batch vs single unit production',
    keywords: ['batch', 'single unit', 'production mode', 'yield', 'batch yield'],
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
    section: 'Products',
    title: 'Understanding overhead, markup and gross margin',
    keywords: ['overhead', 'margin', 'markup', 'gross margin', 'cost', 'percentage'],
    content: `
      <p><strong>Overhead</strong> is a percentage added to your material costs to cover indirect production expenses — electricity, rent, equipment, and production labour.</p>

      <p><strong>Where overhead is set:</strong></p>
      <ul>
        <li><strong>Per-product Overhead %</strong> — on each product's form. This applies only to that product and is used when calculating its production cost and optimal price.</li>
        <li><strong>Settings → Pricing Engine → Default Overhead %</strong> — a business-wide default that pre-fills the overhead field when you create a new product. It does not change overhead on products you have already saved.</li>
      </ul>

      <p>You can use the overhead calculator on the Pricing Engine tab to work out a sensible default from your monthly figures. Enter your totals in your base currency.</p>

      <p><strong>Markup %</strong> is set on each product. It is the main setting that drives the <strong>Optimal price</strong> calculation.</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        Optimal price = Production cost × (1 + Markup%)
      </p>

      <p>Example: if production cost is 2.41 and markup is 20%, the optimal price is 2.89.</p>

      <p>The app also shows <strong>Gross Margin %</strong> — profit as a share of the selling price. At 2.89 with 2.41 cost, gross margin is about 16.7%.</p>

      <p>Both numbers are useful:</p>
      <ul>
        <li><strong>Markup %</strong> — how much you add above what you spent to make the product.</li>
        <li><strong>Gross Margin %</strong> — what you keep from each sale after production cost, often used by buyers and distributors.</li>
      </ul>

      <p>On the Products page you can show markup and margin columns. Open any product to see both figures at the suggested price.</p>`,
  },

  // ── PRICING AND APPROVALS ──────────────────────────────────────────────────

  {
    id: 'how-approval-works',
    section: 'Pricing and Approvals',
    title: 'How price approval works',
    keywords: ['approval', 'approve', 'reset to pending', 'pending', 'workflow', 'status'],
    content: `
      <p>Approval is the step where you set the product's official
      <strong>Approved base price</strong>. PriceRight calculates an <strong>Optimal price</strong>
      from your <strong>Production cost</strong>, overhead, and markup settings, but the
      price is not official until you approve it.</p>

      <p>Use this workflow:</p>
      <ol>
        <li>Create the product. Its status is <strong>Pending</strong>.</li>
        <li>Build the <strong>Bill of materials (BOM)</strong> so PriceRight can calculate
        <strong>Production cost</strong> and <strong>Optimal price</strong>.</li>
        <li>Open the product detail page and review the numbers.</li>
        <li>Choose one action:
          <ul>
            <li><strong>Approve Optimal Price</strong> to approve at the current <strong>Optimal price</strong>.</li>
            <li><strong>Keep current price</strong> to re-approve at the existing
            <strong>Approved base price</strong> when the product is in <strong>Needs review</strong>.</li>
            <li>Enter a value in the <strong>Custom Price</strong> field, then click
            <strong>Approve Custom</strong> to approve a specific amount.</li>
            <li><strong>Reset to Pending</strong> returns the product to pending status, clears the approved price, and requires re-approval before the price can be used in exports.</li>
          </ul>
        </li>
        <li>After approval, status becomes <strong>Approved</strong> and that
        <strong>Approved base price</strong> is used in <strong>Price levels</strong> and exports.</li>
      </ol>

      <p>Open each product from the list to review updated <strong>Production cost</strong>,
      last approved value, and <strong>Optimal price</strong>, then approve from the product detail page.
      For bulk work, select products with row checkboxes and use the Approve menu in the bulk bar.</p>

      <p>After approval, rule-based prices in <strong>Price levels</strong> recalculate from
      the new <strong>Approved base price</strong>. Custom level prices can show stale
      warnings so you can review them manually. You can also set a price expiry
      date when approving; when it expires, the product returns to
      <strong>Needs review</strong>.</p>`,
  },

  {
    id: 'price-types-explained',
    section: 'Pricing and Approvals',
    title: 'Production cost vs optimal price vs approved base price vs price level price',
    keywords: ['production cost', 'optimal price', 'approved base price', 'price level price', 'above optimal', 'below optimal', 'difference'],
    content: `
      <p>PriceRight uses four price types. Understanding each one helps you review
      changes and explain final decisions clearly.</p>

      <p><strong>1) Production cost</strong> is what it costs to make one unit.
      It comes from the Bill of materials and updates when material prices or
      exchange rates change.</p>

      <p><strong>2) Optimal price</strong> is what the system recommends you charge.
      It covers production cost, overhead, and target markup.</p>

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
    content: `
      <p><strong>Needs review</strong> means a product's current
      <strong>Approved base price</strong> may be outdated compared with today's
      <strong>Production cost</strong> and <strong>Optimal price</strong>.</p>

      <p>A product moves to <strong>Needs review</strong> when:</p>
      <ul>
        <li>a material unit cost changes,</li>
        <li>an exchange-rate update changes converted material costs, or</li>
        <li>an approved price passes its expiry date.</li>
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
    content: `
      <p>Approved prices can have an expiry date. After this date, the price is flagged as
      <strong>Needs review</strong> and must be re-approved before it can be included in an export.</p>

      <p><strong>Setting an expiry date:</strong> When approving a price, you can optionally set a
      <strong>valid until</strong> date. Leave it blank for a price that never expires.</p>

      <p><strong>Where expiry dates appear:</strong></p>
      <ul>
        <li><strong>Products list</strong> — the Valid until column shows the date. Dates within 7 days are shown in amber. Expired dates are shown in red.</li>
        <li><strong>Product detail</strong> — the pricing panel shows the expiry date and a countdown in days.</li>
        <li><strong>Dashboard</strong> — the Approval Workload card shows products with expired or expiring prices.</li>
      </ul>

      <p><strong>What happens when a price expires:</strong></p>
      <ul>
        <li>The product status changes to <strong>Needs review</strong> automatically</li>
        <li>The product cannot be included in a price level export until re-approved</li>
        <li>You will see the product flagged in the Dashboard and Products list</li>
      </ul>

      <p><strong>To renew an expired price:</strong></p>
      <ol>
        <li>Click on the product to open the detail page</li>
        <li>Click <strong>Update price</strong> in the pricing panel</li>
        <li>Review the current optimal price</li>
        <li>Approve with a new expiry date</li>
      </ol>

      <p><strong>Best practice:</strong> Set expiry dates that match your price review cycle — monthly, quarterly, or annually depending on how often your input costs change.</p>`,
  },

  // ── PRICE LEVELS AND EXPORTS ───────────────────────────────────────────────

  {
    id: 'price-levels',
    section: 'Price Levels and Exports',
    title: 'Setting up price levels',
    keywords: ['price level', 'tier', 'discount', 'markup', 'wholesale', 'retail', 'customer tier'],
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
    section: 'Price Levels and Exports',
    keywords: ['price level', 'wizard', 'create price level', 'new price level', 'customer pricing', 'setup wizard'],
    content: `
      <p>When you create your first price level, PriceRight walks you through a four-step wizard.</p>

      <p>Click <strong>Price Levels</strong> in the sidebar, then <strong>+ Create your first price level</strong> or <strong>+ New price level</strong>.</p>

      <p><strong>Step 1 — Name and currency</strong><br />
      Enter a name such as Retail, Wholesale, or a customer name. Choose the <strong>Price list currency</strong> — your base currency or another active currency. Prices will be converted using the current exchange rate when shown and exported.</p>

      <p><strong>Step 2 — Add products</strong><br />
      Search and select the products to include. Only products with an approved base price can be added. You can select all or pick individual products.</p>

      <p><strong>Step 3 — Set pricing rules</strong><br />
      Set a rule for each product, or use <strong>Apply to all</strong> to set the same rule type for every selected product. Options include:</p>
      <ul>
        <li>Percentage markup — add a percentage on top of the approved base price</li>
        <li>Percentage discount — reduce the approved base price by a percentage</li>
        <li>Fixed amount add or deduct</li>
        <li>Custom price per product</li>
      </ul>

      <p><strong>Step 4 — Review and confirm</strong><br />
      Review the product list, rules, and calculated final prices. Click Confirm to create the level. New prices start as <strong>pending</strong> until you approve them on the Price Levels page.</p>

      <p><strong>After creating the level:</strong></p>
      <ul>
        <li>Approve pending prices using <strong>Approve all pending</strong> or by approving individual rows</li>
        <li>Add pack sizes from the row actions menu if needed</li>
        <li>Export as Excel or PDF once prices are approved</li>
      </ul>`,
  },

  {
    id: 'adding-customers',
    section: 'Price Levels and Exports',
    title: 'Handling customer-specific pricing',
    keywords: ['customer', 'add customer', 'create customer', 'assign price level'],
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
    section: 'Price Levels and Exports',
    title: 'Setting customer-specific prices with price levels',
    keywords: ['price levels', 'custom price', 'override', 'negotiated', 'individual price'],
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
    section: 'Price Levels and Exports',
    title: 'Generating a price list',
    keywords: ['price list', 'generate', 'export', 'customer price list', 'create price list'],
    content: `
      <p>Generate price lists from the <strong>Price Levels</strong> page. Select a level in the left panel, then click <strong>Export price list</strong>.</p>

      <p>Only products with <strong>approved</strong> prices in that level can be exported. Pending items are excluded. Before exporting, use <strong>Approve all pending</strong> or select individual rows and approve them.</p>

      <p>The export modal lists approved products. You can select or deselect products, then choose Excel or PDF.</p>

      <p>Each row includes the product name, approved base price, final level price, and the rule applied (discount, markup, custom price, and so on).</p>

      <p>If you have configured <strong>pack sizes</strong>, each pack appears as its own row with pack quantity, unit price, and pack price.</p>

      <p>If the price level uses a currency other than your base currency, exported prices appear in that chosen currency. A note at the bottom of the export shows the exchange rate used.</p>

      <p>If custom prices were set before a newer base-price approval, the modal shows an amber stale warning. You can review those entries first or export as-is.</p>

      <p>Excel works well for editing or sharing spreadsheets. PDF gives a print-ready layout for customers.</p>`,
  },

  {
    id: 'price-list-currencies',
    section: 'Price Levels and Exports',
    title: 'Converting price lists to other currencies',
    keywords: ['currency', 'price list currency', 'USD price list', 'convert', 'foreign currency'],
    content: `
      <p>PriceRight can show and export a price list in a currency other than your base currency. You do not need to convert prices manually in Excel.</p>

      <p><strong>When creating a price level</strong> — in Step 1 of the wizard, choose <strong>Price list currency</strong>. You can keep your base currency or pick any other active currency from your settings.</p>

      <p><strong>When editing an existing level</strong> — open the level and change <strong>Price list currency</strong> in the level settings if needed.</p>

      <p>PriceRight converts all prices to the selected currency using the current exchange rate. Unit prices, pack prices, and exported lists all use that currency.</p>

      <p>When you export, a note on the document shows which exchange rate was used and when.</p>

      <p><strong>Currency Exposure report</strong> (under Reports) is a separate tool. It shows how many materials you buy in each purchase currency. It helps you understand exchange-rate risk on material costs — it is not used to convert price lists for customers.</p>`,
  },

  // ── REPORTS AND ANALYSIS ───────────────────────────────────────────────────

  {
    id: 'pricing-analysis-page',
    section: 'Reports and Analysis',
    title: 'Using the Products Analysis tab',
    keywords: ['pricing analysis', 'catalog', 'variance', 'overpriced', 'underpriced', 'production calculator'],
    content: `
      <p>Go to <strong>Products</strong> in the Setup section and open the <strong>Analysis</strong> tab.</p>

      <p>The tab has four sections:</p>
      <ol>
        <li><strong>Pricing health</strong> — summary cards for Healthy markup, Low markup, Critical markup, and Not priced. Click a card to filter the table below.</li>
        <li><strong>Margin distribution</strong> — a bar chart of product counts by markup band. Click a band to filter the table.</li>
        <li><strong>Products by margin</strong> — a table of active products. Columns include Product, Category, Production cost, Approved base price, Actual Markup %, Actual Gross Margin %, and a Needs review icon column. Click any row to open that product's detail page. Use the <strong>Lowest first / Highest first</strong> sort button to rank products by margin.</li>
        <li><strong>Price level coverage</strong> — shows which products are in at least one approved price level and which are not.</li>
      </ol>

      <p>Use this tab to spot weak margins, products that still need a price, and products not yet on a price level for export.</p>`,
  },

  {
    id: 'pricing-status-report',
    section: 'Reports and Analysis',
    title: 'Running the Pricing Status report',
    keywords: ['pricing status', 'report', 'above optimal', 'below optimal', 'export report'],
    content: `
      <p>Go to <strong>Reports</strong>, select <strong>Pricing Status Report</strong>, set filters if needed, then click <strong>Generate Report</strong>.</p>

      <p>Summary cards at the top include Total Products, Above Optimal, Below Optimal, and <strong>Avg Profit %</strong> (based on products with an approved base price set).</p>

      <p>Products are grouped into sections in this order:</p>
      <ol>
        <li><strong>Below Optimal</strong> — requires attention</li>
        <li><strong>Above Optimal</strong></li>
        <li><strong>No approved base price set</strong></li>
        <li><strong>At Optimal</strong></li>
      </ol>

      <p>The table has two columns that look similar but mean different things:</p>
      <ul>
        <li><strong>Approval</strong> — the approval workflow status: pending, approved, or needs review</li>
        <li><strong>Status</strong> — the pricing position: Above Optimal, Below Optimal, At Optimal, or blank when there is no approved base price</li>
      </ul>

      <p>Other columns include Product Name, Category, Prod. Cost, Optimal Price, Approved base price, Variance, Profit, and Profit %.</p>

      <p>Export the report as Excel, PDF, or use Print. PDF and print hide the navigation so only the report content is shown.</p>`,
  },

  {
    id: 'low-margin-report',
    section: 'Reports and Analysis',
    title: 'Understanding the Low Margin report',
    keywords: ['low margin', 'margin report', 'realised margin', 'threshold', 'markup'],
    content: `
      <p>The Low Margin report identifies products where your realised gross margin
      falls below a threshold you set. The report compares each product's realised
      gross margin against your target markup percentage. A product is flagged as
      low margin when its gross margin falls below the target threshold.</p>

      <p>This is different from your target markup. A product might have a 20% markup
      set in PriceRight, but if it was approved at a lower price, the realised gross
      margin could be below 15%. This report catches that.</p>

      <p>Markup % is the target set on the product. Gross Margin % is what is
      actually realised at the approved base price. The report compares the two.</p>

      <p>Go to Reports, select Low Margin Report, set your threshold
      (default is 15%), and click Generate Report. Products are sorted
      from worst margin to best.</p>

      <p>The <strong>Gap column</strong> shows the difference between the
      realised gross margin and your target markup. A large negative gap means
      the product is significantly underperforming and probably needs a
      price review.</p>`,
  },

  {
    id: 'currency-exposure',
    section: 'Reports and Analysis',
    title: 'Currency exposure',
    keywords: ['currency exposure', 'FX risk', 'exchange rate risk', 'USD exposure', 'foreign currency risk'],
    content: `
      <p>The Currency Exposure report shows how your active materials are spread across purchase currencies. This helps you see which currencies your material catalogue depends on.</p>

      <p>Go to Reports and select Currency Exposure Report, then click
      Generate Report.</p>

      <p>The report shows each currency with a count of materials purchased in that currency.
      Expand any currency row to see the individual materials.</p>

      <p>Materials purchased in foreign currencies are exposed to exchange rate risk. When rates move, production costs for those materials change. Use this report to understand which currencies matter most to your business.</p>`,
  },

  {
    id: 'price-list-summary-report',
    title: 'Price List Summary report',
    section: 'Reports and Analysis',
    keywords: ['price list summary', 'report', 'price lists', 'coverage', 'export coverage'],
    content: `
      <p>The Price List Summary report shows all your price levels and whether each list is still valid or coming up for renewal.</p>

      <p>Go to <strong>Reports</strong>, select <strong>Price List Summary</strong>, then click <strong>Generate Report</strong>.</p>

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

      <p>Export the report as Excel, PDF, or print.</p>`,
  },

  {
    id: 'approval-history-report',
    title: 'Approval History report',
    section: 'Reports and Analysis',
    keywords: ['approval history', 'report', 'price approvals', 'history', 'audit trail'],
    content: `
      <p>The Approval History report lists products and their current approval-related figures. Use it to review pricing decisions across your catalogue.</p>

      <p>Go to <strong>Reports</strong>, select <strong>Approval History</strong>, set your filters, then click <strong>Generate Report</strong>.</p>

      <p><strong>Filters:</strong></p>
      <ul>
        <li>Date range (From and To)</li>
        <li>Approval status — approved, pending, or needs review</li>
        <li>Category</li>
      </ul>

      <p>Summary cards show counts for Total Products, Approved, Pending, and Needs Review.</p>

      <p><strong>Table columns:</strong></p>
      <ul>
        <li>Product Name</li>
        <li>Category</li>
        <li>Current Status</li>
        <li>Approved base price</li>
        <li>Optimal Price (current)</li>
        <li>Actual Markup %</li>
        <li>Actual Gross Margin %</li>
        <li>Approved On</li>
        <li>Approved By</li>
        <li>Active?</li>
      </ul>

      <p><strong>Important:</strong> Optimal Price shows the value calculated today, not the optimal price at the time of approval. PriceRight does not store historical optimal prices. There is no Valid Until column in this report — check the Products page or the Price history tab on a product for expiry dates.</p>

      <p>Export as PDF or print. You can also export to Excel from the report toolbar.</p>`,
  },

  // ── ACTIVITY AND HISTORY ──────────────────────────────────────────────────

  {
    id: 'activity-log',
    section: 'Activity and History',
    title: 'Using the Activity log',
    keywords: ['activity', 'log', 'history', 'audit', 'who did what', 'changes', 'track', 'record'],
    content: `
      <p>The Activity log is a complete record of significant actions in PriceRight. It helps you see who changed what, when it happened, and the key details of the change. Open <strong>Activity</strong> from the Pricing section of the sidebar.</p>

      <p>The log records product base price approvals, products reset to pending, products moved to <strong>Needs review</strong>, material cost updates, materials created, exchange-rate updates, price levels created or deleted, price level item approvals, and bulk price level approvals.</p>

      <p>Each entry shows an action icon, a clear description, the time, and the person who performed the action. Descriptions include practical detail such as old and new prices, <strong>Gross Margin %</strong>, production cost values, and affected product counts where relevant.</p>

      <p>Use filters at the top to narrow results by entity type, action group, and date range. Entity type includes Products, Materials, Price Levels, and Exchange Rates. Action groups include Approvals, Cost changes, Created, and Deleted. Reset to Pending actions appear in the activity list when a product price is moved back to pending.</p>

      <p>Click <strong>Clear filters</strong> to reset all filters quickly. Results are shown newest first.</p>

      <p>The page loads 50 entries at a time. Use <strong>Load more</strong> to fetch older entries.</p>`,
  },

  {
    id: 'price-history-tab',
    section: 'Activity and History',
    title: 'Viewing a product\'s price history',
    keywords: ['price history', 'past prices', 'approved prices', 'history tab', 'product history', 'price changes'],
    content: `
      <p>Open a product from <strong>Products</strong>, then select the <strong>Price history</strong> tab on the product detail page. The tab sits between <strong>Bill of materials</strong> and <strong>Activity</strong>.</p>

      <p>The table shows approved base price history only, newest first. Each row shows approval date, <strong>Approved base price</strong>, <strong>Production cost</strong>, margin, price change, and who approved the price.</p>

      <p>Margin is color coded for quick review. Green means 15% and above, amber means 10% to 14.9%, and red means below 10%.</p>

      <p>The change column compares each approval to the previous approved value. Positive changes appear with a plus sign, negative changes appear with a minus sign, and the first approval shows <strong>First approval</strong>.</p>

      <p>The most recent approval row is highlighted in light blue. This is the currently active approved price.</p>

      <p>This tab does not show reset-to-pending events or review flags. Use the full <strong>Activity log</strong> page for those events. If no approvals exist yet, the tab shows an empty state prompting first approval.</p>`,
  },

  {
    id: 'keep-current-price',
    section: 'Activity and History',
    title: 'Keeping the current price after a cost change',
    keywords: ['keep current price', 'absorb cost', 'maintain price', 'cost increase', 'same price', 'no change'],
    content: `
      <p><strong>Keep current price</strong> lets you re-approve a product at its existing <strong>Approved base price</strong> after costs change. Use it when you need to hold market price while still clearing <strong>Needs review</strong>.</p>

      <p>Use this option when cost movement is temporary, customer commitments require stable pricing, or competitive pressure makes an immediate increase risky. Before confirming, review the updated margin to ensure the result is acceptable.</p>

      <p>When a product is in <strong>Needs review</strong>, open its product detail page from the <strong>Products</strong> list. Compare current approved value, updated <strong>Production cost</strong>, and new <strong>Optimal price</strong>, then select <strong>Keep current price</strong>.</p>

      <p>PriceRight protects against loss approvals. If the current approved value is below updated <strong>Production cost</strong>, the keep-current option is disabled and you must choose a different approval value.</p>

      <p>Keeping the current value is still an approval action. Status moves back to Approved, approval time updates, and rule-based <strong>Price level</strong> prices continue to calculate from the confirmed base value.</p>`,
  },

  {
    id: 'stale-custom-price-alerts',
    section: 'Activity and History',
    title: 'Stale custom price alerts',
    keywords: ['stale', 'custom price', 'outdated', 'alert', 'review', 'price level', 'custom', 'warning'],
    content: `
      <p>A stale custom price happens when a product base price changes after a fixed custom price was set in a <strong>Price level</strong>. Rule-based entries recalculate automatically, but custom values stay fixed until you review them.</p>

      <p>On the <strong>Price Levels</strong> page, stale custom entries trigger amber warnings. You will see a banner above the table and row-level warning indicators with tooltips about price overrides that may need review — there is no separate <strong>Review custom price</strong> row label.</p>

      <p>When you edit a stale row, PriceRight shows relevant values so you can compare custom and current base context before saving. You can keep the custom value, change it, or switch to a rule-based adjustment.</p>

      <p>The export modal also shows an amber notice when selected items include stale custom prices. Export still works, so you can decide whether to review first or proceed with current values.</p>

      <p>To resolve alerts, open the affected <strong>Price level</strong>, edit stale rows, and save the updated pricing decision. After saving, stale indicators clear for those rows.</p>`,
  },

  {
    id: 'data-backup',
    section: 'Activity and History',
    title: 'Backing up and restoring your data',
    keywords: ['backup', 'restore', 'data', 'save', 'export data', 'database', 'protect', 'recovery'],
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

      <p>Live and demo data are separate databases. Backup and restore operations for live usage should target the live database context.</p>`,
  },

  {
    id: 'demo-mode',
    section: 'Activity and History',
    title: 'Using demo mode',
    keywords: ['demo', 'demo mode', 'sample data', 'test', 'explore', 'try', 'Savanna Foods', 'switch'],
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
    section: 'Settings',
    title: 'Configuring master data',
    keywords: ['master data', 'categories', 'units', 'standard list', 'dropdown', 'configuration', 'settings'],
    content: `
      <p>Master Data settings define standard categories and units that appear as suggestions when you create products and materials. This helps keep your data consistent and makes forms faster to fill.</p>

      <p>Open <strong>Settings</strong> and go to the <strong>Master Data</strong> tab. You will see three sections:</p>

      <h3>Product Categories</h3>
      <p>Enter the standard product categories your business uses. Examples: Beverages, Snacks, Frozen Goods, Sauces.</p>
      <p>When you create or edit a product, these appear as suggested options in the category dropdown. Below the input, the current list shows usage count — how many products use each category. Categories with zero usage are marked as not used.</p>

      <h3>Raw Material Categories</h3>
      <p>Enter the standard material categories for your raw materials and components. Examples: Packaging, Spices, Oils & Fats, Grains.</p>
      <p>When you create or edit a material on the Primary or Intermediate tab, these appear as suggested options in the category dropdown. Below the input, the current list shows usage count — how many materials use each category. Categories with zero usage are marked as not used.</p>

      <h3>Units of Measure</h3>
      <p>Enter the standard units you use when measuring materials. Examples: kg, liters, pieces, boxes, grams, tablespoons.</p>
      <p>When you create or edit a material, these appear as suggested options in the unit dropdown. Below the input, the current list shows usage count — how many materials use each unit. Units with zero usage are marked as not used.</p>

      <h3>What to do</h3>
      <p><strong>First time setup:</strong> Think about the categories and units you actually use in your business. List them out and enter them here before you start adding products and materials. This gives you a consistent baseline.</p>

      <p><strong>Ongoing use:</strong> When you see that new materials or products are using a category or unit that is not on your list, add it to Master Data so future entries get the suggestion. Keep the list current as your product range grows.</p>

      <p><strong>Unused entries:</strong> If a category or unit is no longer used (all products or materials using it have been deleted), it can stay in Master Data or be removed. There is no harm in keeping it — it does not affect app performance or reports.</p>

      <p><strong>Custom values:</strong> You are not limited to this list. When creating a product or material, you can type any custom category or unit value. The master data list is just a quick reference and starting point.</p>

      <p>After editing Master Data, click <strong>Save Master Data</strong>. The new values are available across the app immediately.</p>`,
  },

  {
    id: 'column-selector',
    section: 'Products',
    title: 'Choosing which columns to show in tables',
    keywords: ['columns', 'column selector', 'table', 'show hide', 'density', 'compact'],
    content: `
      <p>The Products, Materials, and Intermediate Materials tables each have a column selector in the toolbar.</p>

      <p>Click the <strong>Columns</strong> button in the toolbar to open a panel showing all available columns with checkboxes. Tick or untick columns to show or hide them. Your choices are saved automatically and stay the same the next time you open the app.</p>

      <p>The density toggle in the same toolbar switches the table between compact and comfortable row spacing. Use compact when you have many items and want to see more on screen at once.</p>`,
  },

  {
    id: 'active-inactive-filter',
    section: 'Products',
    title: 'Filtering active and inactive items',
    keywords: ['active', 'inactive', 'filter', 'hide', 'archive'],
    content: `
      <p>Products, Materials, and Intermediate Materials each have an <strong>Active</strong>, <strong>Inactive</strong>, or <strong>All</strong> filter in the toolbar.</p>

      <p>By default only active items are shown — inactive items are hidden from the table. Switch to <strong>Inactive</strong> to see only inactive items, or <strong>All</strong> to see everything together.</p>

      <p>Setting a product or material to inactive removes it from day-to-day views without deleting it. Its history and cost data are preserved.</p>

      <p>Inactive materials that are still used in a product BOM are flagged in the <strong>Materials Analysis</strong> tab as a warning.</p>`,
  },

  {
    id: 'prev-next-navigation',
    section: 'Products',
    title: 'Moving between products and materials without closing',
    keywords: ['previous', 'next', 'navigation', 'browse', 'edit drawer'],
    content: `
      <p>When you open a product, material, or intermediate material to view or edit it, you will see <strong>Previous</strong> and <strong>Next</strong> buttons.</p>

      <p>These let you move to the next or previous item in the current filtered list without closing and reopening. A position counter shows where you are — for example, <strong>3 of 47</strong>.</p>

      <p>The navigation follows whatever filter or sort you have applied. If you are viewing only active products sorted by name, Previous and Next move through that same filtered list.</p>

      <p>This is useful when reviewing or updating many items in sequence.</p>`,
  },

  {
    id: 'pack-size-pricing',
    section: 'Price Levels and Exports',
    title: 'Adding pack sizes to a price level',
    keywords: ['pack size', 'pack price', 'manage packs', 'bulk pack', 'case price'],
    content: `
      <p>A price level can show both unit prices and pack prices for each product.</p>

      <p>To add pack sizes, open a price level, find the product row, click the row actions menu (<strong>···</strong>), and select <strong>Manage packs</strong>.</p>

      <p>In the modal, add one or more pack sizes by entering the pack quantity — for example 6, 12, or 24. The pack price is calculated automatically as unit price multiplied by pack quantity.</p>

      <p>Each pack size appears as its own row in the price list table and on the exported price list. Products with no pack sizes show a single row with a dash in the Pack Size and Pack Price columns.</p>

      <p>Pack sizes can be removed from the same <strong>Manage packs</strong> modal at any time.</p>`,
  },

  {
    id: 'price-level-currency',
    section: 'Price Levels and Exports',
    title: 'Setting a price level to a different currency',
    keywords: ['currency', 'exchange rate', 'foreign currency', 'price list currency', 'convert'],
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
    section: 'Price Levels and Exports',
    title: 'Approving prices within a price level',
    keywords: ['approve', 'pending', 'price level approval', 'export', 'status'],
    content: `
      <p>When you add products to a price level or change pricing rules, the affected items are set to <strong>Pending</strong> status.</p>

      <p>Pending items are excluded from exported price lists — only <strong>Approved</strong> items appear on exports.</p>

      <p>To approve items, open the price level and use the <strong>Approve all pending</strong> button to approve everything at once, or select individual rows and use <strong>Approve selected</strong>.</p>

      <p>After approving, the item status changes to Approved and it will appear on the next export.</p>

      <p>If you edit a pricing rule or custom price after approval, the item resets to Pending and needs to be re-approved before the next export.</p>`,
  },

  {
    id: 'undo-bulk-approve',
    section: 'Pricing and Approvals',
    title: 'Undoing a bulk approval',
    keywords: ['undo', 'bulk approve', 'reverse', 'mistake'],
    content: `
      <p>After completing a bulk approval, a confirmation banner appears at the bottom of the screen with a <strong>Yes, Undo</strong> button.</p>

      <p>Click <strong>Yes, Undo</strong> to reverse the entire bulk approval and return all affected products to their previous status.</p>

      <p>The banner stays until you click <strong>Yes, Undo</strong> or <strong>No, Keep</strong>. If you dismiss it with <strong>No, Keep</strong>, the action cannot be reversed from this button.</p>

      <p>If you miss the undo window, you can manually re-approve individual products from their product detail pages, or use <strong>Reset to Pending</strong> from the Products bulk bar if you need to clear approved prices.</p>`,
  },

  {
    id: 'company-branding',
    section: 'Settings',
    title: 'Adding your company name and logo',
    keywords: ['company name', 'logo', 'branding', 'dashboard', 'settings'],
    content: `
      <p>Go to <strong>Settings</strong> and open the <strong>General</strong> tab.</p>

      <p>Enter your company name — this appears on the Dashboard and on printed and exported price lists.</p>

      <p>Upload a company logo — supported formats are PNG and JPG. Keep the file under 1 MB; a square image of at least 200 × 200 pixels works well.</p>

      <p>Your logo appears in the Dashboard header alongside your company name.</p>

      <p>These details are stored locally on your computer and are never sent to any server. You can update your company name or logo at any time from the same Settings page.</p>`,
  },

  {
    id: 'inline-exchange-rate',
    section: 'Raw Materials',
    title: 'Updating exchange rates quickly',
    keywords: ['exchange rate', 'currency', 'toolbar', 'inline edit', 'foreign currency'],
    content: `
      <p>The current exchange rates for all your active foreign currencies are shown directly in the toolbar at the top of the Materials page.</p>

      <p>Click the pencil icon next to any rate to edit it inline. Type the new rate and click <strong>Save</strong>. Click <strong>Cancel</strong> if you change your mind.</p>

      <p>You do not need to go into Settings to update rates — this toolbar shortcut is the fastest way to keep rates current.</p>

      <p>Exchange rates affect the base currency cost of any material purchased in that currency, and flow through to product costs and price level conversions automatically.</p>

      <p>For full rate management including adding new currencies, go to <strong>Settings</strong> → <strong>Currencies &amp; Rates</strong>.</p>`,
  },

];