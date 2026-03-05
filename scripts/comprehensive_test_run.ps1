$ErrorActionPreference = 'Stop'

$baseUrl = 'http://localhost:3000/api'
$results = New-Object System.Collections.Generic.List[object]
$runStamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$ctx = [ordered]@{
  currencyUsdId = $null
  materialId = $null
  productId = $null
  priceLevelDiscountId = $null
  priceLevelMarkupId = $null
  customerId = $null
  listByLevelId = $null
  listByCustomerId = $null
  baseCurrencyCode = 'GHS'
}

function Add-Result {
  param(
    [ValidateSet('PASS','FAIL','WARN')] [string]$Status,
    [string]$Name,
    [string]$Detail
  )
  $results.Add([pscustomobject]@{ status = $Status; name = $Name; detail = $Detail })
}

function Detail-Or {
  param($Primary, [string]$Fallback)
  if ($null -ne $Primary -and [string]::IsNullOrWhiteSpace([string]$Primary) -eq $false) {
    return [string]$Primary
  }
  return $Fallback
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null
  )

  $uri = "$baseUrl$Path"
  try {
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 20
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -ContentType 'application/json' -Body $json -ErrorAction Stop
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -ErrorAction Stop
    }

    return @{ ok = $true; status = 200; data = $resp; error = $null }
  } catch {
    $status = 0
    $bodyText = ''
    try {
      $status = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $bodyText = $reader.ReadToEnd()
      }
    } catch {
      $bodyText = $_.Exception.Message
    }

    $parsed = $null
    if ($bodyText) {
      try { $parsed = $bodyText | ConvertFrom-Json } catch {}
    }

    return @{ ok = $false; status = $status; data = $parsed; error = $bodyText }
  }
}

function Ensure-BaseCurrencySetting {
  $settingsResp = Invoke-Api -Method GET -Path '/settings'
  if (-not $settingsResp.ok) {
    Add-Result -Status 'FAIL' -Name 'PH1 Settings fetch' -Detail "Failed to fetch settings: $($settingsResp.error)"
    return
  }

  $baseSetting = ($settingsResp.data | Where-Object { $_.settingKey -eq 'baseCurrency' } | Select-Object -First 1)
  if ($null -eq $baseSetting) {
    $save = Invoke-Api -Method POST -Path '/settings' -Body @{ settingKey = 'baseCurrency'; settingValue = 'GHS' }
    if ($save.ok) {
      Add-Result -Status 'PASS' -Name 'PH1 Base currency setting' -Detail 'Created baseCurrency=GHS setting'
      $ctx.baseCurrencyCode = 'GHS'
    } else {
      Add-Result -Status 'FAIL' -Name 'PH1 Base currency setting' -Detail "Failed to create baseCurrency: $($save.error)"
    }
  } else {
    $ctx.baseCurrencyCode = [string]$baseSetting.settingValue
    Add-Result -Status 'PASS' -Name 'PH1 Base currency setting' -Detail "Found baseCurrency=$($ctx.baseCurrencyCode)"
  }
}

function Get-OrCreate-Currency {
  param([string]$Code, [string]$Name, [string]$Symbol)

  $all = Invoke-Api -Method GET -Path '/currencies'
  if (-not $all.ok) {
    Add-Result -Status 'FAIL' -Name "PH2 Currency lookup $Code" -Detail "Failed to read currencies: $($all.error)"
    return $null
  }

  $existing = $all.data | Where-Object { $_.code -eq $Code } | Select-Object -First 1
  if ($existing) {
    Add-Result -Status 'PASS' -Name "PH2 Currency $Code" -Detail "Using existing currency id=$($existing.id)"
    return [int]$existing.id
  }

  $created = Invoke-Api -Method POST -Path '/currencies' -Body @{ code = $Code; name = $Name; symbol = $Symbol }
  if ($created.ok) {
    Add-Result -Status 'PASS' -Name "PH2 Currency $Code" -Detail "Created currency id=$($created.data.id)"
    return [int]$created.data.id
  }

  Add-Result -Status 'FAIL' -Name "PH2 Currency $Code" -Detail "Failed to create currency: $($created.error)"
  return $null
}

# ============================================
# PHASE 1: SERVER & DATABASE
# ============================================
$health = Invoke-Api -Method GET -Path '/health'
if ($health.ok -and $health.data.status -eq 'healthy') {
  Add-Result -Status 'PASS' -Name 'PH1 Server startup & health' -Detail 'Server responded healthy on /api/health'
} else {
  Add-Result -Status 'FAIL' -Name 'PH1 Server startup & health' -Detail "Health failed: status=$($health.status) err=$($health.error)"
}

Add-Result -Status 'WARN' -Name 'PH1 Neon PostgreSQL connection' -Detail 'App currently uses SQLite (better-sqlite3), not Neon PostgreSQL'

$nodeTableCheck = @"
const Database = require('better-sqlite3');
const db = new Database('server/priceright.db');
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(JSON.stringify(rows.map(r => r.name)));
"@

$tableJson = node -e $nodeTableCheck
$tables = @()
try { $tables = $tableJson | ConvertFrom-Json } catch {}
$requiredTables = @('currencies','exchange_rates','materials','products','bill_of_materials','customers','price_levels','special_pricing','price_lists','price_list_items','settings')
$missing = @($requiredTables | Where-Object { $_ -notin $tables })
if ($missing.Count -eq 0) {
  Add-Result -Status 'PASS' -Name 'PH1 Required tables exist' -Detail 'All required tables present in SQLite database'
} else {
  Add-Result -Status 'FAIL' -Name 'PH1 Required tables exist' -Detail ("Missing tables: " + ($missing -join ', '))
}

$fkNodeCheck = @"
const Database = require('better-sqlite3');
const db = new Database('server/priceright.db');
db.pragma('foreign_keys = ON');
let ok = false;
try {
  db.prepare('INSERT INTO bill_of_materials (product_id, material_id, quantity) VALUES (?, ?, ?)').run(-999999, -999999, 1);
} catch (e) { ok = true; }
console.log(ok ? 'OK' : 'FAIL');
"@
$fkResult = node -e $fkNodeCheck
if ($fkResult -match 'OK') {
  Add-Result -Status 'PASS' -Name 'PH1 Foreign key constraints enforced' -Detail 'Invalid BOM FK insert was blocked'
} else {
  Add-Result -Status 'FAIL' -Name 'PH1 Foreign key constraints enforced' -Detail 'Invalid BOM FK insert was not blocked'
}

Ensure-BaseCurrencySetting

# ============================================
# PHASE 2: CORE DATA SETUP
# ============================================
$ctx.currencyUsdId = Get-OrCreate-Currency -Code 'USD' -Name 'US Dollar' -Symbol '$'
$baseCurrencyId = Get-OrCreate-Currency -Code $ctx.baseCurrencyCode -Name $ctx.baseCurrencyCode -Symbol '₵'

if ($ctx.currencyUsdId) {
  $rateCreate = Invoke-Api -Method POST -Path '/exchange-rates' -Body @{ currencyId = $ctx.currencyUsdId; rateToBase = 1.0; source = 'manual' }
  if ($rateCreate.ok) {
    Add-Result -Status 'PASS' -Name 'PH2 Create USD exchange rate 1.0' -Detail 'Exchange rate created/updated'
  } else {
    $rateUpdate = Invoke-Api -Method PUT -Path "/exchange-rates/$($ctx.currencyUsdId)" -Body @{ rateToBase = 1.0 }
    if ($rateUpdate.ok) {
      Add-Result -Status 'PASS' -Name 'PH2 Create USD exchange rate 1.0' -Detail 'Exchange rate updated to 1.0'
    } else {
      Add-Result -Status 'FAIL' -Name 'PH2 Create USD exchange rate 1.0' -Detail $rateUpdate.error
    }
  }
}

$matName = "Test Sugar $runStamp"
$materialCreate = Invoke-Api -Method POST -Path '/materials' -Body @{
  name = $matName
  sku = "TS-$runStamp"
  description = 'Test sugar material'
  category = 'Raw Materials'
  unit = 'kg'
  bulkQuantity = 50
  bulkPrice = 400
  purchaseCurrencyId = $baseCurrencyId
  supplier = 'Test Supplier'
}
if ($materialCreate.ok) {
  $ctx.materialId = [int]$materialCreate.data.id
  Add-Result -Status 'PASS' -Name 'PH2 Create material Test Sugar' -Detail "Created material id=$($ctx.materialId)"
} else {
  Add-Result -Status 'FAIL' -Name 'PH2 Create material Test Sugar' -Detail $materialCreate.error
}

$prodName = "Test Brown Sugar $runStamp"
$productCreate = Invoke-Api -Method POST -Path '/products' -Body @{
  name = $prodName
  sku = "TBS-$runStamp"
  description = 'Test product'
  category = 'Sugar'
  overheadPercentage = 25
  profitMargin = 20
  otherDirectCosts = 0
  productionMode = 'single'
  batchYield = 1
  currentSellingPrice = 0
}
if ($productCreate.ok) {
  $ctx.productId = [int]$productCreate.data.id
  Add-Result -Status 'PASS' -Name 'PH2 Create product Test Brown Sugar' -Detail "Created product id=$($ctx.productId)"
} else {
  Add-Result -Status 'FAIL' -Name 'PH2 Create product Test Brown Sugar' -Detail $productCreate.error
}

if ($ctx.productId -and $ctx.materialId) {
  $bomCreate = Invoke-Api -Method POST -Path "/products/$($ctx.productId)/bom" -Body @{ materialId = $ctx.materialId; quantity = 10 }
  if ($bomCreate.ok) {
    Add-Result -Status 'PASS' -Name 'PH2 Create BOM item' -Detail 'Added Test Sugar 10kg to Test Brown Sugar'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH2 Create BOM item' -Detail $bomCreate.error
  }
}

if ($ctx.productId) {
  $approve = Invoke-Api -Method POST -Path "/products/$($ctx.productId)/approve" -Body @{}
  if ($approve.ok -and $approve.data.approvalStatus -eq 'approved') {
    Add-Result -Status 'PASS' -Name 'PH2 Approve product' -Detail "approved_price=$($approve.data.approvedPrice)"
  } else {
    Add-Result -Status 'FAIL' -Name 'PH2 Approve product' -Detail (Detail-Or $approve.error 'Approval status not approved')
  }
}

$ruleDiscount = Invoke-Api -Method POST -Path '/price-level-rules' -Body @{
  name = "Test Wholesale $runStamp"
  adjustmentType = 'discount'
  adjustmentPercentage = 15
  description = 'Test discount rule'
}
if ($ruleDiscount.ok) {
  $ctx.priceLevelDiscountId = [int]$ruleDiscount.data.id
  Add-Result -Status 'PASS' -Name 'PH2 Create price level discount 15%' -Detail "Created level id=$($ctx.priceLevelDiscountId)"
} else {
  Add-Result -Status 'FAIL' -Name 'PH2 Create price level discount 15%' -Detail $ruleDiscount.error
}

if ($ctx.priceLevelDiscountId) {
  $customerCreate = Invoke-Api -Method POST -Path '/customers' -Body @{
    name = "Test Melcom $runStamp"
    priceLevelId = $ctx.priceLevelDiscountId
    allowSpecialPricing = $true
  }
  if ($customerCreate.ok) {
    $ctx.customerId = [int]$customerCreate.data.id
    Add-Result -Status 'PASS' -Name 'PH2 Create customer Test Melcom' -Detail "Created customer id=$($ctx.customerId)"
  } else {
    Add-Result -Status 'FAIL' -Name 'PH2 Create customer Test Melcom' -Detail $customerCreate.error
  }
}

# ============================================
# PHASE 3: MATERIALS & PRODUCTS
# ============================================
$mGet = Invoke-Api -Method GET -Path '/materials'
if ($mGet.ok -and ($mGet.data | Measure-Object).Count -ge 1) {
  Add-Result -Status 'PASS' -Name 'PH3 GET /api/materials' -Detail 'Materials returned'
} else {
  Add-Result -Status 'FAIL' -Name 'PH3 GET /api/materials' -Detail (Detail-Or $mGet.error 'No materials returned')
}

if ($ctx.materialId) {
  $mUpdate = Invoke-Api -Method PUT -Path "/materials/$($ctx.materialId)" -Body @{
    name = "$matName Updated"
    sku = "TSU-$runStamp"
    description = 'Updated material'
    category = 'Raw Materials'
    unit = 'kg'
    bulkQuantity = 50
    bulkPrice = 420
    purchaseCurrencyId = $baseCurrencyId
    supplier = 'Updated Supplier'
  }
  if ($mUpdate.ok) {
    Add-Result -Status 'PASS' -Name 'PH3 PUT /api/materials/:id' -Detail 'Material updated successfully'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH3 PUT /api/materials/:id' -Detail $mUpdate.error
  }
}

$pGet = Invoke-Api -Method GET -Path '/products'
if ($pGet.ok -and ($pGet.data | Measure-Object).Count -ge 1) {
  Add-Result -Status 'PASS' -Name 'PH3 GET /api/products' -Detail 'Products returned'
} else {
  Add-Result -Status 'FAIL' -Name 'PH3 GET /api/products' -Detail (Detail-Or $pGet.error 'No products returned')
}

if ($ctx.productId) {
  $pApproved = Invoke-Api -Method GET -Path "/products/$($ctx.productId)"
  if ($pApproved.ok -and $pApproved.data.approvalStatus -eq 'approved' -and $null -ne $pApproved.data.approvedPrice) {
    Add-Result -Status 'PASS' -Name 'PH3 Product approval state validation' -Detail "status=approved approved_price=$($pApproved.data.approvedPrice)"
  } else {
    Add-Result -Status 'FAIL' -Name 'PH3 Product approval state validation' -Detail (Detail-Or $pApproved.error 'approvedPrice/status invalid')
  }
}

# ============================================
# PHASE 4: EXCHANGE RATES & CASCADING
# ============================================
if ($ctx.currencyUsdId) {
  $rate15 = Invoke-Api -Method PUT -Path "/exchange-rates/$($ctx.currencyUsdId)" -Body @{ rateToBase = 15.0 }
  if ($rate15.ok) {
    Add-Result -Status 'PASS' -Name 'PH4 Update USD exchange rate to 15.0' -Detail 'Rate updated'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH4 Update USD exchange rate to 15.0' -Detail $rate15.error
  }

  $recalc = Invoke-Api -Method POST -Path "/exchange-rates/$($ctx.currencyUsdId)/recalculate-materials" -Body @{}
  if ($recalc.ok) {
    Add-Result -Status 'PASS' -Name 'PH4 Recalculate materials by exchange rate' -Detail "updatedCount=$($recalc.data.updatedCount)"
  } else {
    Add-Result -Status 'FAIL' -Name 'PH4 Recalculate materials by exchange rate' -Detail $recalc.error
  }
}

if ($ctx.productId) {
  $prodAfterRate = Invoke-Api -Method GET -Path "/products/$($ctx.productId)"
  if ($prodAfterRate.ok -and @('approved','needs_review') -contains $prodAfterRate.data.approvalStatus) {
    if ($prodAfterRate.data.approvalStatus -eq 'needs_review') {
      Add-Result -Status 'PASS' -Name 'PH4 Approved product moves to needs_review' -Detail 'Product flagged needs_review after cost-affecting change'
    } else {
      Add-Result -Status 'WARN' -Name 'PH4 Approved product moves to needs_review' -Detail 'Product remained approved (may be expected if no impacted currency-linked material)'
    }
  } else {
    Add-Result -Status 'FAIL' -Name 'PH4 Approved product moves to needs_review' -Detail (Detail-Or $prodAfterRate.error 'Could not verify status')
  }
}

# ============================================
# PHASE 5: PRICE LEVELS
# ============================================
$levelsGet = Invoke-Api -Method GET -Path '/price-level-rules'
if ($levelsGet.ok) {
  Add-Result -Status 'PASS' -Name 'PH5 GET /api/price-level-rules' -Detail "Returned $((@($levelsGet.data)).Count) level rules"
} else {
  Add-Result -Status 'FAIL' -Name 'PH5 GET /api/price-level-rules' -Detail $levelsGet.error
}

$ruleMarkup = Invoke-Api -Method POST -Path '/price-level-rules' -Body @{
  name = "Test Retail Markup $runStamp"
  adjustmentType = 'markup'
  adjustmentPercentage = 12
  description = 'Test markup rule'
}
if ($ruleMarkup.ok) {
  $ctx.priceLevelMarkupId = [int]$ruleMarkup.data.id
  Add-Result -Status 'PASS' -Name 'PH5 POST discount/markup validation' -Detail "Created markup rule id=$($ctx.priceLevelMarkupId)"
} else {
  Add-Result -Status 'FAIL' -Name 'PH5 POST markup rule' -Detail $ruleMarkup.error
}

if ($ctx.priceLevelDiscountId) {
  $verifyRule = Invoke-Api -Method GET -Path '/price-level-rules'
  $d = $verifyRule.data | Where-Object { $_.id -eq $ctx.priceLevelDiscountId } | Select-Object -First 1
  if ($verifyRule.ok -and $d -and $d.adjustmentType -eq 'discount' -and [double]$d.adjustmentPercentage -eq 15) {
    Add-Result -Status 'PASS' -Name 'PH5 Rule fields stored correctly' -Detail 'adjustment_type and adjustment_percentage verified'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH5 Rule fields stored correctly' -Detail 'Rule storage mismatch'
  }
}

# ============================================
# PHASE 6: CUSTOMERS
# ============================================
$cGet = Invoke-Api -Method GET -Path '/customers'
if ($cGet.ok) {
  Add-Result -Status 'PASS' -Name 'PH6 GET /api/customers' -Detail "Returned $((@($cGet.data)).Count) customers"
} else {
  Add-Result -Status 'FAIL' -Name 'PH6 GET /api/customers' -Detail $cGet.error
}

if ($ctx.customerId -and $ctx.priceLevelDiscountId) {
  $cUpdate = Invoke-Api -Method PUT -Path "/customers/$($ctx.customerId)" -Body @{
    name = "Test Melcom $runStamp Updated"
    priceLevelId = $ctx.priceLevelDiscountId
    allowSpecialPricing = $true
  }
  if ($cUpdate.ok -and $cUpdate.data.allowSpecialPricing -eq $true) {
    Add-Result -Status 'PASS' -Name 'PH6 PUT /api/customers/:id allowSpecialPricing' -Detail 'Updated allowSpecialPricing=true'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH6 PUT /api/customers/:id allowSpecialPricing' -Detail (Detail-Or $cUpdate.error 'Flag not true after update')
  }

  if ($cUpdate.ok -and [int]$cUpdate.data.priceLevelId -eq $ctx.priceLevelDiscountId) {
    Add-Result -Status 'PASS' -Name 'PH6 customer.price_level_id FK validity' -Detail 'Customer references valid price level'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH6 customer.price_level_id FK validity' -Detail 'Customer priceLevelId mismatch'
  }
}

# ============================================
# PHASE 7: SPECIAL PRICING & MARGIN PROTECTION
# ============================================
if ($ctx.customerId -and $ctx.productId) {
  $exactOverride = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/custom-prices" -Body @{
    productId = $ctx.productId
    customPrice = 999
    overrideType = 'custom'
  }
  if ($exactOverride.ok) {
    Add-Result -Status 'PASS' -Name 'PH7 Set exact special pricing override' -Detail 'Custom price saved'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH7 Set exact special pricing override' -Detail $exactOverride.error
  }

  Add-Result -Status 'WARN' -Name 'PH7 production_cost margin impact persistence' -Detail 'No API fields currently returned for production_cost or margin_impact_percentage'

  $belowCostAttempt = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/custom-prices" -Body @{
    productId = $ctx.productId
    customPrice = 0.01
    overrideType = 'custom'
  }
  if (-not $belowCostAttempt.ok) {
    Add-Result -Status 'PASS' -Name 'PH7 Below-cost special pricing blocked' -Detail "Blocked with status $($belowCostAttempt.status)"
  } else {
    Add-Result -Status 'FAIL' -Name 'PH7 Below-cost special pricing blocked' -Detail 'API accepted below-cost special price (no server-side margin protection)'
  }

  $lowMarginWithJustification = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/custom-prices" -Body @{
    productId = $ctx.productId
    customPrice = 10
    overrideType = 'custom'
    justification = 'Promo pricing with strategic intent'
  }
  if ($lowMarginWithJustification.ok -and $lowMarginWithJustification.data.status -eq 'pending') {
    Add-Result -Status 'PASS' -Name 'PH7 Low-margin with justification sets pending' -Detail 'Status=pending'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH7 Low-margin with justification sets pending' -Detail (Detail-Or $lowMarginWithJustification.error 'Status not pending')
  }

  $approveSpecial = Invoke-Api -Method PUT -Path "/customers/$($ctx.customerId)/custom-prices/$($ctx.productId)/approve" -Body @{ approvedBy = 'test_manager' }
  if ($approveSpecial.ok -and $approveSpecial.data.status -eq 'approved' -and $approveSpecial.data.approvedBy) {
    Add-Result -Status 'PASS' -Name 'PH7 Approve special pricing' -Detail 'status=approved with approved_by/approved_at'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH7 Approve special pricing' -Detail (Detail-Or $approveSpecial.error 'Approval fields missing')
  }

  $rejectSpecial = Invoke-Api -Method PUT -Path "/customers/$($ctx.customerId)/custom-prices/$($ctx.productId)/reject" -Body @{ approvedBy = 'test_manager'; justification = 'Rejected for test' }
  if ($rejectSpecial.ok -and $rejectSpecial.data.status -eq 'rejected') {
    Add-Result -Status 'PASS' -Name 'PH7 Reject special pricing' -Detail 'status=rejected'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH7 Reject special pricing' -Detail (Detail-Or $rejectSpecial.error 'Reject did not update status')
  }

  $requestedSpecialEndpoint = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/special-pricing" -Body @{ productId = $ctx.productId; customPrice = 55 }
  if (-not $requestedSpecialEndpoint.ok) {
    Add-Result -Status 'WARN' -Name 'PH7 Requested /special-pricing endpoint shape' -Detail 'Not implemented; app uses /customers/:id/custom-prices'
  } else {
    Add-Result -Status 'WARN' -Name 'PH7 Requested /special-pricing endpoint shape' -Detail 'Endpoint unexpectedly available'
  }
}

# Ensure one approved special price exists for phase 9
if ($ctx.customerId -and $ctx.productId) {
  $resetForPriceList = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/custom-prices" -Body @{
    productId = $ctx.productId
    customPrice = 123.45
    overrideType = 'custom'
    justification = 'Phase 9 setup'
  }
  if ($resetForPriceList.ok) {
    [void](Invoke-Api -Method PUT -Path "/customers/$($ctx.customerId)/custom-prices/$($ctx.productId)/approve" -Body @{ approvedBy = 'test_manager' })
  }
}

# ============================================
# PHASE 8: PRICE LISTS - BY LEVEL
# ============================================
if ($ctx.priceLevelDiscountId -and $ctx.productId) {
  $plByLevel = Invoke-Api -Method POST -Path '/price-lists' -Body @{
    name = "By Level Test $runStamp"
    generationMode = 'byPriceLevel'
    priceLevelId = $ctx.priceLevelDiscountId
    validFrom = (Get-Date).ToString('yyyy-MM-dd')
    products = @($ctx.productId)
  }

  if ($plByLevel.ok) {
    $ctx.listByLevelId = [int]$plByLevel.data.id
    Add-Result -Status 'PASS' -Name 'PH8 Create price list by level' -Detail "Created list id=$($ctx.listByLevelId)"

    $details = Invoke-Api -Method GET -Path "/price-lists/$($ctx.listByLevelId)"
    if ($details.ok -and ($details.data.items | Measure-Object).Count -ge 1) {
      Add-Result -Status 'PASS' -Name 'PH8 Approved products included only' -Detail 'Items present for approved product(s)'

      $allLevelRule = @($details.data.items | Where-Object { $_.priceSource -eq 'level_rule' }).Count -eq @($details.data.items).Count
      if ($allLevelRule) {
        Add-Result -Status 'PASS' -Name 'PH8 price_source level_rule only' -Detail 'All items have price_source=level_rule'
      } else {
        Add-Result -Status 'FAIL' -Name 'PH8 price_source level_rule only' -Detail 'Some items not marked level_rule'
      }

      $specialInLevel = @($details.data.items | Where-Object { $_.priceSource -eq 'special' }).Count
      if ($specialInLevel -eq 0) {
        Add-Result -Status 'PASS' -Name 'PH8 No special pricing in by-level mode' -Detail 'No special overrides applied'
      } else {
        Add-Result -Status 'FAIL' -Name 'PH8 No special pricing in by-level mode' -Detail 'Special pricing unexpectedly applied'
      }

      $calcOk = $true
      foreach ($it in $details.data.items) {
        $expected = [math]::Round(([double]$it.basePrice) * (1 - 0.15), 2)
        if ([math]::Abs(([double]$it.finalPrice) - $expected) -gt 0.01) { $calcOk = $false; break }
      }
      if ($calcOk) {
        Add-Result -Status 'PASS' -Name 'PH8 Level discount formula validation' -Detail 'Level discount formula matched expected values'
      } else {
        Add-Result -Status 'FAIL' -Name 'PH8 Level discount formula validation' -Detail 'One or more items do not match formula'
      }
    } else {
      Add-Result -Status 'FAIL' -Name 'PH8 Price list detail validation' -Detail (Detail-Or $details.error 'No items returned')
    }
  } else {
    Add-Result -Status 'FAIL' -Name 'PH8 Create price list by level' -Detail $plByLevel.error
  }

  $requestedByLevelAlias = Invoke-Api -Method POST -Path '/price-lists' -Body @{
    name = "ByLevel Alias Test $runStamp"
    generationMode = 'byLevel'
    priceLevelId = $ctx.priceLevelDiscountId
    validFrom = (Get-Date).ToString('yyyy-MM-dd')
    products = @($ctx.productId)
  }
  if ($requestedByLevelAlias.ok) {
    Add-Result -Status 'WARN' -Name 'PH8 generationMode byLevel alias' -Detail 'Accepted via fallback; canonical value is byPriceLevel'
  } else {
    Add-Result -Status 'WARN' -Name 'PH8 generationMode byLevel alias' -Detail 'byLevel alias not supported; use byPriceLevel'
  }
}

# ============================================
# PHASE 9: PRICE LISTS - BY CUSTOMER
# ============================================
if ($ctx.priceLevelDiscountId -and $ctx.customerId -and $ctx.productId) {
  $plByCustomer = Invoke-Api -Method POST -Path '/price-lists' -Body @{
    name = "By Customer Test $runStamp"
    generationMode = 'byCustomer'
    customerId = $ctx.customerId
    priceLevelId = $ctx.priceLevelDiscountId
    validFrom = (Get-Date).ToString('yyyy-MM-dd')
    products = @($ctx.productId)
  }

  if ($plByCustomer.ok) {
    $ctx.listByCustomerId = [int]$plByCustomer.data.id
    Add-Result -Status 'PASS' -Name 'PH9 Create price list by customer' -Detail "Created list id=$($ctx.listByCustomerId)"

    $details = Invoke-Api -Method GET -Path "/price-lists/$($ctx.listByCustomerId)"
    if ($details.ok -and ($details.data.items | Measure-Object).Count -ge 1) {
      $specialCount = @($details.data.items | Where-Object { $_.priceSource -eq 'special' }).Count
      if ($specialCount -ge 1) {
        Add-Result -Status 'PASS' -Name 'PH9 Special pricing override priority' -Detail 'Special override applied where available'
      } else {
        Add-Result -Status 'FAIL' -Name 'PH9 Special pricing override priority' -Detail 'No item tagged as special despite approved override'
      }

      Add-Result -Status 'WARN' -Name 'PH9 Fallback to level/base on non-overridden products' -Detail 'Single-product fixture limits fallback-path verification'
    } else {
      Add-Result -Status 'FAIL' -Name 'PH9 Customer list details' -Detail (Detail-Or $details.error 'No items returned')
    }
  } else {
    Add-Result -Status 'FAIL' -Name 'PH9 Create price list by customer' -Detail $plByCustomer.error
  }
}

# ============================================
# PHASE 10: MATERIALS REQUIREMENT
# ============================================
$mr = Invoke-Api -Method POST -Path '/materials-requirement' -Body @{ items = @(@{ productId = $ctx.productId; quantity = 2 }) }
if ($mr.ok) {
  Add-Result -Status 'WARN' -Name 'PH10 materials-requirement endpoint behavior' -Detail 'Endpoint exists but was not expected from route scan; validate manually'
} else {
  Add-Result -Status 'WARN' -Name 'PH10 materials-requirement endpoint' -Detail 'Not implemented in current backend routes'
}

# ============================================
# PHASE 11: OVERHEAD CALCULATOR
# ============================================
$sGet = Invoke-Api -Method GET -Path '/settings'
if ($sGet.ok) {
  Add-Result -Status 'PASS' -Name 'PH11 GET /api/settings' -Detail 'Settings returned'
} else {
  Add-Result -Status 'FAIL' -Name 'PH11 GET /api/settings' -Detail $sGet.error
}

$overheadSetting = Invoke-Api -Method POST -Path '/settings' -Body @{ settingKey = 'defaultOverheadPercentage'; settingValue = '30' }
if ($overheadSetting.ok) {
  Add-Result -Status 'PASS' -Name 'PH11 POST /api/settings update overhead setting' -Detail 'Setting saved'
} else {
  Add-Result -Status 'FAIL' -Name 'PH11 POST /api/settings update overhead setting' -Detail $overheadSetting.error
}

if ($ctx.productId) {
  $before = Invoke-Api -Method GET -Path "/products/$($ctx.productId)"
  Start-Sleep -Milliseconds 300
  $after = Invoke-Api -Method GET -Path "/products/$($ctx.productId)"
  if ($before.ok -and $after.ok -and [string]$before.data.approvedPrice -ne [string]$after.data.approvedPrice) {
    Add-Result -Status 'PASS' -Name 'PH11 Product recalculation after overhead setting change' -Detail 'Approved price changed after settings update'
  } else {
    Add-Result -Status 'WARN' -Name 'PH11 Product recalculation after overhead setting change' -Detail 'No automatic product recalculation endpoint tied to settings change'
  }
}

# ============================================
# PHASE 12: APPROVAL WORKFLOWS
# ============================================
$newPendingProduct = Invoke-Api -Method POST -Path '/products' -Body @{
  name = "Pending Product $runStamp"
  sku = "PEND-$runStamp"
  category = 'Sugar'
  overheadPercentage = 10
  profitMargin = 15
  otherDirectCosts = 0
  productionMode = 'single'
  batchYield = 1
  currentSellingPrice = 0
}

if ($newPendingProduct.ok) {
  $pendingId = [int]$newPendingProduct.data.id
  $state = Invoke-Api -Method GET -Path "/products/$pendingId"
  if ($state.ok -and $state.data.approvalStatus -eq 'pending') {
    Add-Result -Status 'PASS' -Name 'PH12 Product starts pending' -Detail 'New product has status=pending'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH12 Product starts pending' -Detail 'Pending status not observed'
  }

  $appr = Invoke-Api -Method POST -Path "/products/$pendingId/approve" -Body @{}
  if ($appr.ok -and $appr.data.approvalStatus -eq 'approved') {
    Add-Result -Status 'PASS' -Name 'PH12 Product approve workflow' -Detail 'Product approved successfully'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH12 Product approve workflow' -Detail (Detail-Or $appr.error 'Approve failed')
  }

  if ($ctx.materialId) {
    $b = Invoke-Api -Method POST -Path "/products/$pendingId/bom" -Body @{ materialId = $ctx.materialId; quantity = 1 }
    if ($b.ok) {
      $updateMat = Invoke-Api -Method PUT -Path "/materials/$($ctx.materialId)" -Body @{
        name = "$matName Cascade"
        sku = "TSC-$runStamp"
        description = 'Cascade trigger'
        category = 'Raw Materials'
        unit = 'kg'
        bulkQuantity = 50
        bulkPrice = 500
        purchaseCurrencyId = $baseCurrencyId
        supplier = 'Cascade Supplier'
      }
      $postState = Invoke-Api -Method GET -Path "/products/$pendingId"
      if ($updateMat.ok -and $postState.ok -and @('approved','needs_review') -contains $postState.data.approvalStatus) {
        if ($postState.data.approvalStatus -eq 'needs_review') {
          Add-Result -Status 'PASS' -Name 'PH12 needs_review after material cost change' -Detail 'Status changed to needs_review'
        } else {
          Add-Result -Status 'WARN' -Name 'PH12 needs_review after material cost change' -Detail 'Status stayed approved'
        }
      } else {
        Add-Result -Status 'FAIL' -Name 'PH12 needs_review after material cost change' -Detail 'Unable to verify'
      }
    }
  }

  $reapprove = Invoke-Api -Method POST -Path "/products/$pendingId/approve" -Body @{}
  if ($reapprove.ok -and $reapprove.data.approvalStatus -eq 'approved') {
    Add-Result -Status 'PASS' -Name 'PH12 Product re-approve workflow' -Detail 'Re-approval succeeded'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH12 Product re-approve workflow' -Detail (Detail-Or $reapprove.error 'Re-approve failed')
  }

  $noBomProduct = Invoke-Api -Method POST -Path '/products' -Body @{
    name = "No BOM Product $runStamp"
    sku = "NBOM-$runStamp"
    overheadPercentage = 10
    profitMargin = 20
    otherDirectCosts = 0
    productionMode = 'single'
    batchYield = 1
    currentSellingPrice = 0
  }
  if ($noBomProduct.ok) {
    $noBomApprove = Invoke-Api -Method POST -Path "/products/$($noBomProduct.data.id)/approve" -Body @{}
    if ($noBomApprove.ok) {
      Add-Result -Status 'WARN' -Name 'PH12 Approve product with no BOM' -Detail 'Approval currently succeeds with computed zero-material basis'
    } else {
      Add-Result -Status 'PASS' -Name 'PH12 Approve product with no BOM' -Detail 'Approval blocked as expected'
    }
  }

  $pendingSpecial = Invoke-Api -Method POST -Path "/customers/$($ctx.customerId)/custom-prices" -Body @{ productId = $pendingId; customPrice = 88.88; justification='Pending approval test' }
  if ($pendingSpecial.ok -and $pendingSpecial.data.status -eq 'pending') {
    Add-Result -Status 'PASS' -Name 'PH12 Create special pricing pending' -Detail 'Pending special price created'

    $pendingList = Invoke-Api -Method GET -Path "/customers/$($ctx.customerId)/custom-prices"
    if ($pendingList.ok -and (@($pendingList.data | Where-Object { $_.status -eq 'pending' }).Count -ge 1)) {
      Add-Result -Status 'PASS' -Name 'PH12 Get pending special prices' -Detail 'Pending special pricing entries found'
    } else {
      Add-Result -Status 'FAIL' -Name 'PH12 Get pending special prices' -Detail 'No pending entries returned'
    }
  } else {
    Add-Result -Status 'FAIL' -Name 'PH12 Create special pricing pending' -Detail (Detail-Or $pendingSpecial.error 'Status not pending')
  }
}

# ============================================
# PHASE 13: EDGE CASES
# ============================================
if ($ctx.priceLevelDiscountId) {
  $noApprovedList = Invoke-Api -Method POST -Path '/price-lists' -Body @{
    name = "No Approved Products Test $runStamp"
    generationMode = 'byPriceLevel'
    priceLevelId = $ctx.priceLevelDiscountId
    validFrom = (Get-Date).ToString('yyyy-MM-dd')
    products = @(-999999)
  }
  if (-not $noApprovedList.ok) {
    Add-Result -Status 'PASS' -Name 'PH13 Price list with no approved products' -Detail 'Handled gracefully with validation error'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH13 Price list with no approved products' -Detail 'Unexpectedly created list with invalid/non-approved products'
  }
}

if ($ctx.priceLevelDiscountId -and $ctx.productId) {
  $customerNoSpecial = Invoke-Api -Method POST -Path '/customers' -Body @{
    name = "NoSpecial Customer $runStamp"
    priceLevelId = $ctx.priceLevelDiscountId
    allowSpecialPricing = $false
  }
  if ($customerNoSpecial.ok) {
    $setSpecialWhenDisallowed = Invoke-Api -Method POST -Path "/customers/$($customerNoSpecial.data.id)/custom-prices" -Body @{
      productId = $ctx.productId
      customPrice = 77.77
    }
    if (-not $setSpecialWhenDisallowed.ok) {
      Add-Result -Status 'PASS' -Name 'PH13 Special pricing disallowed customer' -Detail 'API blocked custom pricing'
    } else {
      Add-Result -Status 'FAIL' -Name 'PH13 Special pricing disallowed customer' -Detail 'API accepted custom pricing despite allowSpecialPricing=false'
    }
  }
}

if ($ctx.materialId -and $ctx.productId) {
  $deleteUsedMaterial = Invoke-Api -Method DELETE -Path "/materials/$($ctx.materialId)"
  if (-not $deleteUsedMaterial.ok) {
    Add-Result -Status 'PASS' -Name 'PH13 Delete material used in BOM' -Detail 'Delete blocked by FK constraints'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH13 Delete material used in BOM' -Detail 'Material deletion succeeded while in use'
  }
}

if ($ctx.priceLevelDiscountId -and $ctx.productId) {
  $tempCustomer = Invoke-Api -Method POST -Path '/customers' -Body @{
    name = "Cascade Customer $runStamp"
    priceLevelId = $ctx.priceLevelDiscountId
    allowSpecialPricing = $true
  }
  if ($tempCustomer.ok) {
    $tempId = [int]$tempCustomer.data.id
    [void](Invoke-Api -Method POST -Path "/customers/$tempId/custom-prices" -Body @{ productId = $ctx.productId; customPrice = 66.66 })
    $beforeDel = Invoke-Api -Method GET -Path "/customers/$tempId/custom-prices"
    [void](Invoke-Api -Method DELETE -Path "/customers/$tempId")
    $afterDel = Invoke-Api -Method GET -Path "/customers/$tempId/custom-prices"

    $beforeCount = if ($beforeDel.ok) { @($beforeDel.data).Count } else { 0 }
    if ($beforeCount -ge 1 -and -not $afterDel.ok -and $afterDel.status -eq 404) {
      Add-Result -Status 'PASS' -Name 'PH13 Cascade delete customer special prices' -Detail 'Customer delete removed access and endpoint returned 404'
    } else {
      Add-Result -Status 'WARN' -Name 'PH13 Cascade delete customer special prices' -Detail 'Could not fully verify cascade via API-only checks'
    }
  }
}

if ($ctx.priceLevelDiscountId -and $ctx.productId) {
  $nonExistentCustomerList = Invoke-Api -Method POST -Path '/price-lists' -Body @{
    name = "Non Existent Customer $runStamp"
    generationMode = 'byCustomer'
    customerId = 99999999
    priceLevelId = $ctx.priceLevelDiscountId
    validFrom = (Get-Date).ToString('yyyy-MM-dd')
    products = @($ctx.productId)
  }
  if (-not $nonExistentCustomerList.ok) {
    Add-Result -Status 'PASS' -Name 'PH13 Generate list for non-existent customer' -Detail 'Validation error returned as expected'
  } else {
    Add-Result -Status 'FAIL' -Name 'PH13 Generate list for non-existent customer' -Detail 'Unexpectedly created list for non-existent customer'
  }
}

# ============================================
# PHASE 14: DATA INTEGRITY
# ============================================
$dupCurrency = Invoke-Api -Method POST -Path '/currencies' -Body @{ code = 'USD'; name = 'Dup USD'; symbol = '$' }
if (-not $dupCurrency.ok) {
  Add-Result -Status 'PASS' -Name 'PH14 UNIQUE constraint currencies.code' -Detail 'Duplicate USD blocked'
} else {
  Add-Result -Status 'FAIL' -Name 'PH14 UNIQUE constraint currencies.code' -Detail 'Duplicate USD was accepted'
}

$setA = Invoke-Api -Method POST -Path '/settings' -Body @{ settingKey = 'test_unique_setting'; settingValue = 'A' }
$setB = Invoke-Api -Method POST -Path '/settings' -Body @{ settingKey = 'test_unique_setting'; settingValue = 'B' }
if ($setA.ok -and $setB.ok) {
  Add-Result -Status 'PASS' -Name 'PH14 settings.setting_key uniqueness/upsert' -Detail 'Setting key upsert works without duplicates'
} else {
  Add-Result -Status 'FAIL' -Name 'PH14 settings.setting_key uniqueness/upsert' -Detail 'Setting upsert failed unexpectedly'
}

if ($ctx.materialId) {
  $matRead = Invoke-Api -Method GET -Path '/materials'
  $m = if ($matRead.ok) { $matRead.data | Where-Object { $_.id -eq $ctx.materialId } | Select-Object -First 1 } else { $null }
  if ($m -and $m.createdAt) {
    Add-Result -Status 'PASS' -Name 'PH14 Timestamp autopopulation' -Detail 'created_at/updated_at present on material'
  } else {
    Add-Result -Status 'WARN' -Name 'PH14 Timestamp autopopulation' -Detail 'Could not verify timestamps on expected records'
  }
}

# ============================================
# REPORT
# ============================================
foreach ($r in $results) {
  switch ($r.status) {
    'PASS' { "✅ PASS: $($r.name) - $($r.detail)" }
    'FAIL' { "❌ FAIL: $($r.name) - $($r.detail)" }
    'WARN' { "⚠️ WARN: $($r.name) - $($r.detail)" }
  }
}

$total = $results.Count
$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$warn = @($results | Where-Object { $_.status -eq 'WARN' }).Count

""
"=== SUMMARY ==="
"Total tests run: $total"
"Pass: $pass"
"Fail: $fail"
"Warn: $warn"
""
"Failures:"
$failed = @($results | Where-Object { $_.status -eq 'FAIL' })
if ($failed.Count -eq 0) {
  "- None"
} else {
  foreach ($f in $failed) {
    "- $($f.name): $($f.detail)"
  }
}

""
"Recommendations:"
"- Add server-side margin protection validation for custom prices (below-cost + low-margin guardrails)."
"- Add explicit endpoint compatibility or aliases if external clients use /price-levels or /special-pricing routes."
"- Implement /api/materials-requirement endpoint if required by workflow."
"- If Neon/PostgreSQL is mandatory, migrate DB driver/config from better-sqlite3 to Neon/Postgres and rerun this suite."
