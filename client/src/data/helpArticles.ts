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
      <p>PriceRight includes three sample data files designed for a Ghanaian food manufacturer. Use them to explore all features with realistic data before entering your own.</p>

      <p>Go to Settings in the Setup section and find the Sample data section. Download each file and import them in this exact order:</p>

      <ol>
        <li><strong>Raw materials</strong> — 25 ingredients, oils, grains, and packaging items with realistic GHS prices. Import via Materials page using the Import button.</li>
        <li><strong>Intermediate materials</strong> — 5 in-house processed ingredients such as peanut paste and cocoa powder. Import via the Intermediate tab on the Materials page.</li>
        <li><strong>Products with ingredients</strong> — 11 finished products including peanut butter, cocoa powder, gari, pepper sauce, and more. Each product comes with a full bill of materials. Import via the Products page using Import in the More menu.</li>
      </ol>

      <p>The order matters. Products reference ingredients by name — if the materials are not imported first, products will be skipped during import.</p>

      <p>Once imported, you can approve base prices, create price levels, export price lists, and run reports — all with realistic data. When you are ready to use your own data, clear the sample records and start fresh.</p>

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

      <p>If you want to explore PriceRight before entering your own data, download the sample data files from Settings under Sample data. Import them in order — raw materials first, then intermediate materials, then products — and the app will be populated with a realistic set of Ghanaian food manufacturer data you can use to try every feature.</p>
      <ol>
        <li><strong>Add your raw materials.</strong> Go to Materials. Select the Primary tab.
        Add every ingredient, packaging item, and component you use. For each material
        you need the name, category, unit, bulk purchase quantity, and the price you
        pay for that bulk quantity.</li>

        <li><strong>Build your products.</strong> Go to Products. Create each product and
        add its Bill of Materials — which materials go into it and how much of each.
        Set the overhead percentage and Markup %. PriceRight calculates the
        optimal price automatically.</li>

        <li><strong>Approve prices.</strong> Still on Products, review the optimal price
        for each product and click Approve. After approval, the product receives an
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

  // ── RAW MATERIALS ──────────────────────────────────────────────────────────

  {
    id: 'adding-materials',
    section: 'Raw Materials',
    title: 'Adding your first materials',
    keywords: ['add material', 'create material', 'raw material', 'new material'],
    content: `
      <p>To add a material, go to Materials (select the Primary tab) and click
      Add Material.</p>

      <p>You need to enter the material name, category, and unit of measure. Then
      enter the bulk purchase details — how many units you buy at a time and how
      much you pay for that bulk quantity. PriceRight divides the bulk price by the
      bulk quantity to calculate the unit cost automatically.</p>

      <p>For example, if you buy sugar in 50kg bags for GHS 320, enter Bulk Quantity
      as 50 and Bulk Price as 320. PriceRight calculates the unit cost as GHS 6.40
      per kg.</p>

      <p>If you buy a material in a foreign currency like USD, select USD as the
      purchase currency. PriceRight uses the current exchange rate to convert it
      to GHS automatically. When you update the exchange rate, all affected material
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
      If you pay GHS 480 for a box of 24 bottles, enter 480.</p>

      <p><strong>Bulk Quantity</strong> is how many units you receive. In the same
      example, enter 24.</p>

      <p>PriceRight calculates Unit Price as Bulk Price divided by Bulk Quantity.
      GHS 480 ÷ 24 = GHS 20 per bottle.</p>

      <p>Use the unit that makes sense for how you measure the material in your
      recipes. If your recipe uses grams but you buy in kilograms, it is usually
      easier to work in one unit throughout — for example enter Kg as the unit
      and use decimal quantities in your recipe (0.5 for 500g).</p>`,
  },

  {
    id: 'foreign-currencies',
    section: 'Raw Materials',
    title: 'Using foreign currencies',
    keywords: ['currency', 'USD', 'exchange rate', 'foreign', 'GHS', 'convert'],
    content: `
      <p>PriceRight supports multiple currencies. When you buy materials in USD,
      EUR, GBP, or any other currency, you can record the price in that currency
      and PriceRight converts it to GHS using the exchange rate you configure.</p>

      <p>To set up a currency, go to <strong>Settings</strong> and open the
      <strong>Currencies and Rates</strong> tab. Add the currency code and current
      rate. For example, USD at 15.50 means 1 USD = GHS 15.50.</p>

      <p>When you add or edit a material, select the purchase currency from the
      dropdown. PriceRight stores both the original foreign currency price and
      the GHS equivalent.</p>

        <p>When you update an exchange rate, PriceRight recalculates material costs in
        that currency first. Any affected products then recalculate and can move to
        <strong>Needs review</strong> so you can re-check approvals.</p>

        <p>The exchange-rate update is recorded in the <strong>Activity log</strong>
        with the old rate, new rate, and the number of affected products.</p>`,
  },

  {
    id: 'importing-materials',
    section: 'Raw Materials',
    title: 'Importing materials in bulk',
    keywords: ['import', 'bulk import', 'CSV', 'upload', 'template', 'excel'],
    content: `
      <p>If you have many materials to add, use the bulk import feature. Go to
      Materials (Primary tab), open the <strong>More</strong> menu in the page
      header, and click <strong>Import materials</strong>.</p>

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
      Intermediate tab, then click Add Intermediate Material. Set the overhead
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
      'intermediate cost', 'overhead', 'profit margin', 'transfer price',
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
      (GHS 8.00), cooking oil (GHS 1.50), and salt (GHS 0.20) gives a unit
      cost of GHS 9.70. When this goes into a finished product like Peanut
      Butter, the GHS 9.70 is treated as a raw material cost and the finished
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

      <p><strong>Example:</strong> Roasted Peanut raw material cost is GHS 9.70.
      The roasting process has its own overhead of 15% — electricity for the
      roasting equipment and labour for the roasting team. Overhead adds
      GHS 1.46, giving a unit cost of GHS 11.16. When this goes into a
      finished product, GHS 11.16 is the input cost and the finished product's
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

  // ── PRODUCTS ───────────────────────────────────────────────────────────────

  {
    id: 'building-product-bom',
    section: 'Products',
    title: 'Building a product with a BOM',
    keywords: ['product', 'BOM', 'bill of materials', 'create product', 'recipe'],
    content: `
      <p>To create a product, go to <strong>Products</strong> and click
      <strong>Add Product</strong> in the page header.</p>

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
    title: 'Understanding overhead and margin',
    keywords: ['overhead', 'margin', 'profit margin', 'markup', 'cost', 'percentage'],
    content: `
      <p><strong>Overhead</strong> is the percentage added to your material costs
      to cover indirect production expenses — electricity, water, rent, equipment
      maintenance, and production labour.</p>

      <p>If your monthly overhead costs are GHS 5,000 and your monthly material
      spend is GHS 20,000, your overhead rate is 25%. Set this in
      <strong>Settings</strong> under the <strong>Pricing Engine</strong> tab.</p>

      <p>PriceRight applies overhead as a percentage of
      <strong>Production cost</strong> when calculating the
      <strong>Optimal price</strong>.</p>

      <p>In PriceRight, the percentage you set as <strong>Markup %</strong>
      is applied as markup on production cost. That means the
      system adds this percentage on top of production cost to suggest the
      <strong>Optimal price</strong>.</p>

      <p style="font-family: monospace; background: #f1f5f9; padding: 8px 12px; border-radius: 4px;">
        Optimal price = Production cost × (1 + Markup%)
      </p>

      <p>Example: if production cost is GHS 2.41 and markup is 20%, then
      markup profit is GHS 0.48 and optimal price is GHS 2.89.</p>

      <p>The app also shows what this means as <strong>Gross Margin %</strong>,
      which is profit as a percentage of the selling
      price. At GHS 2.89 with GHS 2.41 cost, gross margin is 16.7%.</p>

      <p>Both numbers are useful:</p>
      <ul>
        <li><strong>Markup %</strong> tells you how much you are adding above what you spent.</li>
        <li><strong>Gross Margin %</strong> is what banks, investors, and distributors typically ask about.</li>
      </ul>

      <p>The <strong>Markup %</strong> column in Products shows markup on cost.
      Open any product to see both Markup % and Gross Margin % at the suggested
      price.</p>`,
  },

  // ── PRICING AND APPROVALS ──────────────────────────────────────────────────

  {
    id: 'how-approval-works',
    section: 'Pricing and Approvals',
    title: 'How price approval works',
    keywords: ['approval', 'approve', 'reject', 'pending', 'workflow', 'status'],
    content: `
      <p>Approval is the step where you set the product's official
      <strong>Approved base price</strong>. PriceRight calculates an <strong>Optimal price</strong>
      from your <strong>Production cost</strong>, overhead, and margin settings, but the
      price is not official until you approve it.</p>

      <p>Use this workflow:</p>
      <ol>
        <li>Create the product. Its status is <strong>Pending</strong>.</li>
        <li>Build the <strong>Bill of materials (BOM)</strong> so PriceRight can calculate
        <strong>Production cost</strong> and <strong>Optimal price</strong>.</li>
        <li>Open the product detail page and review the numbers.</li>
        <li>Choose one action:
          <ul>
            <li><strong>Accept new price</strong> to approve at the current <strong>Optimal price</strong>.</li>
            <li><strong>Keep current price</strong> to re-approve at the existing
            <strong>Approved base price</strong> when the product is in <strong>Needs review</strong>.</li>
            <li><strong>Set custom price</strong> to approve a specific amount.</li>
            <li><strong>Reject</strong> to decline and continue review.</li>
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
      It covers production cost, overhead, and target margin.</p>

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
      <p>Use bulk approval when many products need approval at the same time,
      such as first-time setup or after broad cost changes.</p>

      <p>On the Products page:</p>
      <ol>
        <li>Select products using row checkboxes.</li>
        <li>Use the header checkbox to select all visible rows when needed.</li>
        <li>When at least one row is selected, the dark bulk action bar appears
        with the selected count.</li>
      </ol>

      <p>Open the Approve menu in the bulk bar and choose one option:</p>
      <ul>
        <li><strong>Approve at optimal price</strong> to set each selected product to its
        current <strong>Optimal price</strong>.</li>
        <li><strong>Keep current price</strong> to re-approve selected products at their
        existing <strong>Approved base price</strong>.</li>
      </ul>

      <p>A confirmation modal shows how many products will be approved and which
      price basis will be used. Confirm to continue.</p>

      <p>After bulk approval, selected products move to <strong>Approved</strong> and
      rule-based prices in <strong>Price levels</strong> recalculate from the updated
      <strong>Approved base price</strong> values.</p>`,
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
      amber row background, and a <strong>Needs review</strong> status badge. The Status
      header also shows an amber count dot. Row hover text and row actions help you
      open review quickly, and Dashboard includes a <strong>Review now</strong> path.</p>

      <p>Review from the product detail page. You will
      see updated <strong>Production cost</strong>, last approved value, and new
      <strong>Optimal price</strong>. Then choose:</p>
      <ol>
        <li><strong>Accept new price</strong> to approve at the new <strong>Optimal price</strong>.</li>
        <li><strong>Keep current price</strong> to re-approve at the existing
        <strong>Approved base price</strong> when you want to absorb the change.</li>
        <li><strong>Set custom price</strong> to approve a specific amount.</li>
      </ol>

      <p>When you approve a new base price, rule-based prices in
      <strong>Price levels</strong> recalculate automatically. If a level has custom
      prices set before the latest base approval, stale custom-price alerts appear
      so you can review those entries manually.</p>`,
  },

  // ── PRICE LEVELS AND EXPORTS ───────────────────────────────────────────────

  {
    id: 'price-levels',
    section: 'Price Levels and Exports',
    title: 'Setting up price levels',
    keywords: ['price level', 'tier', 'discount', 'markup', 'wholesale', 'retail', 'customer tier'],
    content: `
      <p>Price levels let you apply a standard discount or markup to a group
      of customers without setting individual prices for every product.</p>

      <p>Go to <strong>Price Levels</strong> in the Setup section of the navigation.
      Create levels for your customer types — for example Wholesale, Retail,
      Distributor, and Export.</p>

      <p>For each level, set either rule-based pricing (discount/markup) or
      custom prices per product. A discount rule applies below the approved
      base price and a markup rule applies above it.</p>

      <p>Once the prices inside a level are approved, you can export that
      level as a price list in Excel or PDF format for sharing.</p>`,
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
      <p>Price levels support both rule-based pricing and custom prices per
      product.</p>

      <p>When a customer needs negotiated prices, create a dedicated price
      level named after that customer (for example, Accra Supermart Ltd).
      Use that level as the customer-specific pricing sheet.</p>

      <p>Open the <strong>Price Levels</strong> page, add products to that level, and set
      each product to either a rule-based adjustment (discount or markup)
      or a custom exact price.</p>

        <p>When a product's approved base price changes after a cost update,
        rule-based prices recalculate automatically. Custom prices do not
        recalculate automatically, so they show a stale custom price alert and
        must be reviewed manually.</p>

        <p>See <strong>Stale custom price alerts</strong> for more detail on handling
        outdated custom prices.</p>

      <p>Price level item prices must be approved before they are used in
      generated price lists.</p>`,
  },

  {
    id: 'generating-price-list',
    section: 'Price Levels and Exports',
    title: 'Generating a price list',
    keywords: ['price list', 'generate', 'export', 'customer price list', 'create price list'],
    content: `
      <p>Generate price lists from the <strong>Price Levels</strong> page. Select a
      level in the left panel, then click <strong>Export price list</strong> in the
      level header on the right.</p>

      <p>The export modal shows products in that level. You can select or
      deselect products before export, then choose Excel or PDF.</p>

      <p>Each row in the export includes product name,
      <strong>Approved base price</strong>, final level price, and the applied rule
      (for example discount, markup, or custom price). Values are generated
      from current approved data at export time.</p>

      <p>If custom prices were set before a newer base-price approval, the modal
      shows an amber stale warning. Export still works, and you can decide to
      review custom entries first or export as-is.</p>

      <p>Products with no approved base value can appear with GHS 0.00, so confirm
      approvals before sending a final customer list.</p>

      <p>Excel is recommended when you need a spreadsheet for sharing or editing.
      PDF opens a print-ready view for distribution.</p>`,
  },

  {
    id: 'price-list-currencies',
    section: 'Price Levels and Exports',
    title: 'Converting price lists to other currencies',
    keywords: ['currency', 'price list currency', 'USD price list', 'convert', 'foreign currency'],
    content: `
      <p>PriceRight works in GHS as the base currency. Exported price lists from
      Price Levels show GHS prices.</p>

      <p>If a customer pays in USD or another currency, use the
      <strong>Currency Exposure</strong> report in the Pricing section to understand
      your foreign currency exposure.</p>

      <p>For price lists in other currencies, export the GHS price list to Excel,
      then apply the current exchange rate manually in your worksheet.</p>

      <p>Currency still matters for costing because exchange-rate changes update
      material values and can move products to <strong>Needs review</strong>.</p>`,
  },

  // ── REPORTS AND ANALYSIS ───────────────────────────────────────────────────

  {
    id: 'pricing-analysis-page',
    section: 'Reports and Analysis',
    title: 'Using the Products Analysis tab',
    keywords: ['pricing analysis', 'catalog', 'variance', 'overpriced', 'underpriced', 'production calculator'],
    content: `
      <p>Go to <strong>Products</strong> in the Setup section and open the
      <strong>Analysis</strong> tab next to Products.</p>

      <p>The tab gives a portfolio view of pricing health with four sections:</p>
      <ol>
        <li><strong>Pricing health summary</strong> cards for Healthy margin,
        Low margin, Critical margin, and Not priced. Click a card to filter
        the table.</li>
        <li><strong>Margin distribution</strong> showing product counts by margin
        band. Click a band to filter results.</li>
        <li><strong>Products by margin</strong> table of active products with
        <strong>Production cost</strong>, <strong>Approved base price</strong>, and
        margin indicators. Click a row to open that product.</li>
        <li><strong>Price level coverage</strong> showing which products are in at
        least one approved <strong>Price level</strong> and which are not.</li>
      </ol>

      <p>Use this tab regularly to spot products with weak margins, products that
      need pricing decisions, and products not yet covered by approved
      <strong>Price levels</strong> for export workflows.</p>`,
  },

  {
    id: 'pricing-status-report',
    section: 'Reports and Analysis',
    title: 'Running the Pricing Status report',
    keywords: ['pricing status', 'report', 'above optimal', 'below optimal', 'export report'],
    content: `
      <p>Go to Reports and select Pricing Status Report. Filter by category
      or pricing status if needed, then click Generate Report.</p>

      <p>The report shows all active products grouped into sections —
      above optimal, below optimal, at optimal, and no approved base price set.
      Summary cards at the top give you the headline numbers.</p>

      <p>The Approval Status column shows whether each product has been
      approved, is pending, or needs review — so you can see both pricing
      health and approval status in one view.</p>

      <p>To export, click Export to Excel for a spreadsheet or Export PDF
      to print. The PDF hides the navigation and filters so only the
      report content is visible.</p>`,
  },

  {
    id: 'low-margin-report',
    section: 'Reports and Analysis',
    title: 'Understanding the Low Margin report',
    keywords: ['low margin', 'margin report', 'realised margin', 'threshold', 'profit margin'],
    content: `
      <p>The Low Margin report identifies products where your actual
      realised margin — based on your Approved base price versus your
      production cost — falls below a threshold you set.</p>

      <p>This is different from your target margin. A product might have
      a 20% target set in PriceRight but if it was approved at a lower
      price, the actual margin could be below 15%. This report catches
      that.</p>

      <p>Go to Reports, select Low Margin Report, set your threshold
      (default is 15%), and click Generate Report. Products are sorted
      from worst margin to best.</p>

      <p>The <strong>Gap column</strong> shows the difference between the
      realised margin and your target margin. A large negative gap means
      the product is significantly underperforming and probably needs a
      price review.</p>`,
  },

  {
    id: 'currency-exposure',
    section: 'Reports and Analysis',
    title: 'Currency exposure',
    keywords: ['currency exposure', 'FX risk', 'exchange rate risk', 'USD exposure', 'foreign currency risk'],
    content: `
      <p>The Currency Exposure report shows what percentage of your total
      material costs are in each currency. This tells you how exposed
      your business is to exchange rate movements.</p>

      <p>Go to Reports and select Currency Exposure Report, then click
      Generate Report.</p>

      <p>The report shows each currency with the total GHS value of
      materials purchased in that currency and the exposure percentage.
      Expand any currency row to see the individual materials.</p>

      <p>If 60% of your material costs are in USD, a 10% cedi depreciation
      effectively increases your production costs by 6% on average. Use
      this report to understand that risk and make informed pricing
      decisions when exchange rates move.</p>`,
  },

  // ── ACTIVITY AND HISTORY ──────────────────────────────────────────────────

  {
    id: 'activity-log',
    section: 'Activity and History',
    title: 'Using the Activity log',
    keywords: ['activity', 'log', 'history', 'audit', 'who did what', 'changes', 'track', 'record'],
    content: `
      <p>The Activity log is a complete record of significant actions in PriceRight. It helps you see who changed what, when it happened, and the key details of the change. Open <strong>Activity</strong> from the Pricing section of the sidebar.</p>

      <p>The log records product base price approvals and rejections, products moved to <strong>Needs review</strong>, material cost updates, materials created, exchange-rate updates, price levels created or deleted, price level item approvals and rejections, and bulk price level approvals.</p>

      <p>Each entry shows an action icon, a clear description, the time, and the person who performed the action. Descriptions include practical detail such as old and new prices, <strong>Gross Margin %</strong>, production cost values, and affected product counts where relevant.</p>

      <p>Use filters at the top to narrow results by entity type, action group, and date range. Entity type includes Products, Materials, Price Levels, and Exchange Rates. Action groups include Approvals, Rejections, Cost changes, Created, and Deleted.</p>

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

      <p>This tab does not show rejections or review flags. Use the full <strong>Activity log</strong> page for those events. If no approvals exist yet, the tab shows an empty state prompting first approval.</p>`,
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

      <p>On the <strong>Price Levels</strong> page, stale custom entries trigger amber warnings. You will see a banner above the table, row-level warning indicators, and a <strong>Review custom price</strong> label on affected items.</p>

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

      <p>Open <strong>Settings</strong> and go to <strong>Data and Backups</strong> to check backup status. The page shows backup count and latest backup time when available.</p>

      <p>Use <strong>Create Manual Backup</strong> before major updates such as broad material price imports, product restructuring, or large approval cycles. Manual backup runs immediately and updates status after completion.</p>

      <p>Automatic backups run on a schedule handled by the server. Manual and automatic backups are both part of the same backup status flow shown in Settings.</p>

      <p>Live and demo data are separate databases. Backup and restore operations for live usage should target the live database context. Do not perform file replacement while the app is running.</p>`,
  },

  {
    id: 'demo-mode',
    section: 'Activity and History',
    title: 'Using demo mode',
    keywords: ['demo', 'demo mode', 'sample data', 'test', 'explore', 'try', 'Savanna Foods', 'switch'],
    content: `
      <p>Demo mode switches the app to a separate sample database so you can test workflows without affecting live business data. In Settings, demo mode maps to <strong>demo.db</strong>, while live mode maps to <strong>priceright.db</strong>.</p>

      <p>Use demo mode for training, walkthroughs, and safe experimentation with approvals, price levels, exports, and reporting.</p>

      <p>To switch modes, open <strong>Settings</strong>, go to <strong>Data and Backups</strong>, and toggle the demo mode control. The app confirms the action and reloads after the change.</p>

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

];