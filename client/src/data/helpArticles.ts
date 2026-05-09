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
      connects everything — your raw material costs, production recipes, customer tiers,
      and Approved base prices — so when something changes, everything adjusts.</p>

      <p>Here is what you can do with PriceRight:</p>
      <ul>
        <li>Track material costs in multiple currencies</li>
        <li>Build products with a full Bill of Materials</li>
        <li>Calculate optimal prices automatically</li>
        <li>Approve prices through a proper workflow</li>
        <li>Set different prices for different customer types</li>
        <li>Create and share professional price lists</li>
        <li>Run reports on your pricing health</li>
      </ul>`,
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

      <ol>
        <li><strong>Add your raw materials.</strong> Go to Materials. Select the Primary tab.
        Add every ingredient, packaging item, and component you use. For each material
        you need the name, category, unit, bulk purchase quantity, and the price you
        pay for that bulk quantity.</li>

        <li><strong>Build your products.</strong> Go to Products. Create each product and
        add its Bill of Materials — which materials go into it and how much of each.
        Set the overhead percentage and profit margin. PriceRight calculates the
        optimal price automatically.</li>

        <li><strong>Approve prices.</strong> Still on Products, review the optimal price
        for each product and click Approve. Until a product is approved it will not
        appear in price lists.</li>

        <li><strong>Set up price levels.</strong> Go to Price levels in the Setup
        section. Create levels for your customer types — for example Wholesale,
        Retail, Export — and set either rule-based adjustments or custom prices
        per product as needed.</li>

        <li><strong>Configure customer pricing.</strong> Go to Price levels in the Setup
        section. Create one level for each customer type, or create a dedicated
        level for a specific customer when negotiated pricing is needed.</li>

        <li><strong>Export price lists.</strong> Go to Price levels in the Setup section.
        Once all prices are approved, open the level and export the price list
        to Excel or PDF.</li>
      </ol>`,
  },

  {
    id: 'understanding-workflow',
    section: 'Getting Started',
    title: 'Understanding the workflow',
    keywords: ['workflow', 'how it works', 'process', 'overview', 'approval chain'],
    content: `
      <p>PriceRight follows a specific workflow and it helps to understand why
      each step exists.</p>

      <p><strong>Materials are the foundation.</strong> Every product cost calculation
      depends on accurate material prices. When a material price changes, PriceRight
      automatically recalculates all products that use it and flags them for review.</p>

      <p><strong>Products are built on top of materials.</strong> A product's Bill of
      Materials tells PriceRight exactly what goes into each unit. Combined with
      overhead and margin settings, this produces the optimal price.</p>

      <p><strong>Approval is the control gate.</strong> No product can appear in a price
      list until a manager approves it. This prevents unreviewed prices from reaching
      customers. When you approve a price, that becomes the official baseline.</p>

      <p><strong>Price levels apply rules automatically.</strong> Instead of manually
      setting prices for every customer, you create a rule — for example Wholesale
      customers get 10% off — and PriceRight applies it to every approved product.</p>

      <p><strong>Price levels handle exceptions too.</strong> When one customer needs
      negotiated prices, create a dedicated price level for that customer and set
      custom product prices inside that level.</p>

      <p><strong>Price lists are the output.</strong> They pull everything together —
      Approved base prices and level-specific product pricing (rules or custom amounts)
      — into a clean list you can share with customers.</p>`,
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

      <p>To set up a currency, go to Settings → Currencies and add the currency
      code and current rate. For example, USD at 15.50 means 1 USD = GHS 15.50.</p>

      <p>When you add or edit a material, select the purchase currency from the
      dropdown. PriceRight stores both the original foreign currency price and
      the GHS equivalent.</p>

      <p>When you update an exchange rate in Settings, PriceRight automatically
      recalculates all material costs in that currency and updates the optimal
      prices of all affected products. A summary banner tells you how many
      materials and products were updated.</p>`,
  },

  {
    id: 'importing-materials',
    section: 'Raw Materials',
    title: 'Importing materials in bulk',
    keywords: ['import', 'bulk import', 'CSV', 'upload', 'template', 'excel'],
    content: `
      <p>If you have many materials to add, use the bulk import feature. Go to
      Materials (Primary tab) and click Import.</p>

      <p>First, download the Excel template from the import dialog. Open it in
      Excel, fill in your materials on the Materials Import sheet, and follow
      the instructions on the Instructions sheet.</p>

      <p>Each row is one material. You need the material name, category, unit,
      bulk price, and bulk quantity. Currency and supplier type are optional
      and default to GHS and Local if left blank.</p>

      <p>Save the filled file as a CSV (File → Save As → CSV UTF-8) and upload
      it in the import dialog. PriceRight shows you a preview and highlights
      any rows with errors — including the line number and exactly how to fix
      the problem — before you confirm the import.</p>

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

      <p>For example, Brown Sugar might be produced from raw sugar and molasses.
      Instead of treating Brown Sugar as a purchased material with a fixed cost,
      you build it as an intermediate material with its own Bill of Materials.</p>

      <p>When raw sugar prices change, Brown Sugar's cost updates automatically.
      And when Brown Sugar's cost updates, every finished product that uses it
      recalculates too. This two-level cascade keeps everything accurate without
      any manual work.</p>

      <p>To create an intermediate material, go to Materials and select the
      Intermediate tab, then click Add Intermediate Material. Set the overhead
      percentage, optional profit margin, batch yield, and then build its BOM
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
      product — with its own overhead and its own profit margin. Use this
      approach in two situations: when you also sell this intermediate material
      externally to other businesses, or when you want to track the
      profitability of the intermediate production step separately from
      the finished product.</p>

      <p><strong>Example:</strong> If your business sells Roasted Peanuts in
      bulk to other manufacturers as well as using them in your own products,
      you need a full cost including profit so you know what to charge external
      buyers. Set the profit margin on the intermediate material to match your
      target for that product.</p>

      <h3>Which approach to choose</h3>
      <p>Ask yourself two questions:</p>
      <ul>
        <li>Does this intermediate material have its own distinct production
        costs — electricity, labour, equipment — that are separate from the
        finished product? If yes, add overhead.</li>
        <li>Do you sell this intermediate material externally, or do you need
        to track its profitability independently? If yes, add profit margin.</li>
      </ul>

      <p>If the answer to both questions is no, use Approach 1. If the first
      is yes and the second is no, use Approach 2. If both are yes,
      use Approach 3.</p>

      <p>In PriceRight, set this when creating or editing an intermediate
      material under the Materials → Intermediate tab. Leave Overhead % at zero
      for Approach 1. Enter your overhead rate and leave Profit Margin % at zero
      for Approach 2. Enter both for Approach 3.</p>`,
  },

  // ── PRODUCTS ───────────────────────────────────────────────────────────────

  {
    id: 'building-product-bom',
    section: 'Products',
    title: 'Building a product with a BOM',
    keywords: ['product', 'BOM', 'bill of materials', 'create product', 'recipe'],
    content: `
      <p>To create a product, go to Products and click Add Product.</p>

      <p>Give the product a name and category. Then choose the production mode —
      Single Unit if you make one unit at a time, or Batch if your recipe produces
      multiple units in one run.</p>

      <p>For batch production, enter the Batch Yield — how many finished units
      your recipe produces. If you make 12 bottles of sauce from one batch,
      enter 12.</p>

      <p>Set the Overhead percentage and Profit Margin percentage. Overhead covers
      your indirect costs. Profit Margin is the percentage of the approved base price
      that is profit.</p>

      <p>Then build the Bill of Materials. Search for each material and enter
      the quantity used per batch. As you add materials, PriceRight calculates
      the material cost and optimal price in real time.</p>

      <p>When you save the product, its status is set to Pending — waiting for
      a manager to review and approve the price.</p>`,
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
      spend is GHS 20,000, your overhead rate is 25%. Use the overhead calculator
      in Settings to work this out precisely.</p>

      <p><strong>Profit Margin</strong> is different from markup. Margin is the
      percentage of the approved base price that is profit. Markup is the percentage
      added on top of cost. PriceRight uses margin.</p>

      <p>If your production cost is GHS 80 and you want a 20% margin, the
      approved base price is GHS 100 — because GHS 20 is 20% of GHS 100. A 20%
      markup would give GHS 96. Different result, so make sure you are using
      the right one.</p>

      <p>PriceRight uses margin consistently throughout so all your pricing
      stays on the same basis.</p>`,
  },

  // ── PRICING AND APPROVALS ──────────────────────────────────────────────────

  {
    id: 'how-approval-works',
    section: 'Pricing and Approvals',
    title: 'How price approval works',
    keywords: ['approval', 'approve', 'reject', 'pending', 'workflow', 'status'],
    content: `
      <p>Every product in PriceRight goes through an approval workflow before
      its price can be used in price lists or customer quotes.</p>

      <p>When you create or update a product, its status is set to
      <strong>Pending</strong>. You review the optimal price and either
      approve it or reject it.</p>

      <p>When you <strong>approve</strong> a product, the Approved base price is locked in
      and becomes the base for all price lists. The approved base price is
      automatically updated to match.</p>

      <p>When material costs change, approved products that are affected are
      automatically moved to <strong>Needs Review</strong> status. A manager needs
      to review and re-approve before the new price takes effect.</p>

      <p><strong>Rejected</strong> products go back to Pending and need to be
      corrected before they can be approved.</p>

      <p>You can approve products one at a time or use bulk approve to handle
      many at once. Bulk approve lets you choose whether to approve at the
      optimal price, the approved base price, or the optimal price with a
      custom markup.</p>`,
  },

  {
    id: 'price-types-explained',
    section: 'Pricing and Approvals',
    title: 'Material cost vs optimal price vs approved base price vs customer price',
    keywords: ['material cost', 'optimal price', 'approved base price', 'customer price', 'above optimal', 'below optimal', 'difference'],
    content: `
      <p>PriceRight uses four pricing levels. Understanding this hierarchy helps
      you make clear pricing decisions and explain price changes internally.</p>

      <p><strong>1) Material Cost</strong> is your input cost from the Bill of
      Materials (BOM). It updates when material prices or exchange rates change.</p>

      <p><strong>2) Optimal Price</strong> is what PriceRight calculates based on
      your material costs, overhead, and target margin. It is a recommendation,
      not a rule. It updates automatically whenever costs change.</p>

      <p><strong>3) Approved base price</strong> is the official price set by
      management (previously called Current Selling Price). This is the business
      decision point. It may match the optimal price, or management may choose a
      different approved value.</p>

      <p><strong>4) Customer Price</strong> is what a customer actually pays
      after applying their assigned price level's product pricing (rule-based or
      custom). This can differ by customer while the approved base price stays
      the same.</p>

      <p>The Pricing column on the Products page shows whether your approved
      base price is <strong>Above Optimal</strong>, <strong>Below Optimal</strong>,
      or <strong>At Optimal</strong>. This gives you an instant health check on
      whether your prices are covering your costs properly.</p>`,
  },

  {
    id: 'bulk-approval',
    section: 'Pricing and Approvals',
    title: 'Approving prices in bulk',
    keywords: ['bulk approve', 'approve all', 'bulk action', 'mass approve'],
    content: `
      <p>When you have many products to approve, use bulk approve to save time.</p>

      <p>On the Products page, select the products you want to approve using
      the checkboxes. Then open the bulk actions menu and choose
      Approve Selected.</p>

      <p>A modal appears asking how you want to set the Approved base price for
      all selected products. You have three options:</p>
      <ul>
        <li>Approve at the <strong>optimal price</strong> — PriceRight's recommendation</li>
        <li>Approve at the <strong>approved base price</strong> — lock in what you are already charging</li>
        <li>Approve at <strong>optimal price + custom markup %</strong> — adjust above the recommendation</li>
      </ul>

      <p>After approving, a confirmation banner shows how many products were
      approved and at what basis. You can undo the bulk approval immediately
      if you made a mistake.</p>`,
  },

  {
    id: 'needs-review',
    section: 'Pricing and Approvals',
    title: 'What Needs Review means',
    keywords: ['needs review', 'review', 'cost change', 'flag', 'recalculate'],
    content: `
      <p>When a product shows <strong>Needs Review</strong> status, it means the
      optimal price has changed since the product was last approved. This
      usually happens because a material cost changed or an exchange rate
      was updated.</p>

      <p>The product's Approved base price has not changed — it is still the last
      approved value. But PriceRight is telling you that if you generated a
      price list today, it would be based on a price that may no longer
      reflect your current costs.</p>

      <p>To resolve it, click the Review button on the product row. You will
      see the old Approved base price, the new optimal price, and the difference
      between them. You can then approve at the new optimal price or set a
      custom price.</p>

      <p>Until you re-approve, the product continues to appear in price lists
      at its last Approved base price. PriceRight will also flag any price lists
      containing this product as potentially stale.</p>`,
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

      <p>Go to Price levels in the Setup section of the navigation.
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
      <p>PriceRight no longer uses a separate Customers page.</p>

      <p>Instead, go to Price levels in the Setup section and create a
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

      <p>Open the Price levels page, add products to that level, and set
      each product to either a rule-based adjustment (discount or markup)
      or a custom exact price.</p>

      <p>Price level item prices must be approved before they are used in
      generated price lists.</p>`,
  },

  {
    id: 'generating-price-list',
    section: 'Price Levels and Exports',
    title: 'Generating a price list',
    keywords: ['price list', 'generate', 'export', 'customer price list', 'create price list'],
    content: `
      <p>Select a price level in the Setup section.</p>

      <p>Once all prices in that level are approved, click Export price list
      to download an Excel or PDF price list.</p>

      <p>The exported file uses the approved prices stored on that level.
      Rule-based adjustments and custom approved prices are both included.</p>

      <p>Use Excel when you need a working spreadsheet and PDF when you need
      a clean shareable version for customers.</p>`,
  },

  {
    id: 'price-list-currencies',
    section: 'Price Levels and Exports',
    title: 'Converting price lists to other currencies',
    keywords: ['currency', 'price list currency', 'USD price list', 'convert', 'foreign currency'],
    content: `
      <p>Price list exports are based on the approved values stored in each
      price level.</p>

      <p>If you need foreign-currency context, update your exchange rates in
      Settings before exporting and use your workbook or report output to add
      any converted columns required for the customer.</p>

      <p>All stored pricing remains in GHS. Use Reports for pricing history
      and exported files for customer-facing distribution.</p>`,
  },

  // ── REPORTS AND ANALYSIS ───────────────────────────────────────────────────

  {
    id: 'pricing-analysis-page',
    section: 'Reports and Analysis',
    title: 'Using the Pricing Analysis page',
    keywords: ['pricing analysis', 'catalog', 'variance', 'overpriced', 'underpriced', 'production calculator'],
    content: `
      <p>The Pricing Analysis page is available from the direct Catalog route
      and gives
      you a complete view of how your approved base prices compare to
      your optimal prices across all products.</p>

      <p>The summary bar at the top shows how many products are above
      optimal, below optimal, or not yet priced.</p>

      <p>The table shows every active product with its production cost,
      optimal price, approved base price, variance, and profit
      percentage. Products priced below optimal appear highlighted —
      these need your attention.</p>

      <p>The <strong>Bulk Production Calculator</strong> lets you enter a
      quantity for any product and see the total material requirements
      and production economics for that run — useful for planning
      before a production order.</p>`,
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

];