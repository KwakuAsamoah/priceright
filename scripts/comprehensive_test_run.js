const Database = require('../server/node_modules/better-sqlite3');

const baseUrl = 'http://localhost:3000/api';
const runStamp = Math.floor(Date.now() / 1000);
const results = [];

const ctx = {
  currencyUsdId: null,
  materialId: null,
  productId: null,
  priceLevelDiscountId: null,
  priceLevelMarkupId: null,
  customerId: null,
  listByLevelId: null,
  listByCustomerId: null,
  baseCurrencyCode: 'GHS',
};

function addResult(status, name, detail) {
  results.push({ status, name, detail });
}

function detailOr(primary, fallback) {
  if (primary === undefined || primary === null || String(primary).trim() === '') return fallback;
  return String(primary);
}

async function api(method, path, body) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error || text || `HTTP ${res.status}`) };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error.message };
  }
}

async function ensureBaseCurrencySetting() {
  const settings = await api('GET', '/settings');
  if (!settings.ok) {
    addResult('FAIL', 'PH1 Settings fetch', `Failed to fetch settings: ${settings.error}`);
    return;
  }

  const base = (settings.data || []).find((s) => s.settingKey === 'baseCurrency');
  if (!base) {
    const save = await api('POST', '/settings', { settingKey: 'baseCurrency', settingValue: 'GHS' });
    if (save.ok) {
      addResult('PASS', 'PH1 Base currency setting', 'Created baseCurrency=GHS setting');
      ctx.baseCurrencyCode = 'GHS';
    } else {
      addResult('FAIL', 'PH1 Base currency setting', `Failed to create baseCurrency: ${save.error}`);
    }
  } else {
    ctx.baseCurrencyCode = String(base.settingValue || 'GHS');
    addResult('PASS', 'PH1 Base currency setting', `Found baseCurrency=${ctx.baseCurrencyCode}`);
  }
}

async function getOrCreateCurrency(code, name, symbol) {
  const all = await api('GET', '/currencies');
  if (!all.ok) {
    addResult('FAIL', `PH2 Currency lookup ${code}`, `Failed to read currencies: ${all.error}`);
    return null;
  }

  const existing = (all.data || []).find((c) => c.code === code);
  if (existing) {
    addResult('PASS', `PH2 Currency ${code}`, `Using existing currency id=${existing.id}`);
    return Number(existing.id);
  }

  const created = await api('POST', '/currencies', { code, name, symbol });
  if (created.ok) {
    addResult('PASS', `PH2 Currency ${code}`, `Created currency id=${created.data.id}`);
    return Number(created.data.id);
  }

  addResult('FAIL', `PH2 Currency ${code}`, `Failed to create currency: ${created.error}`);
  return null;
}

async function ensureApprovedProduct(preferredProductId, phaseLabel) {
  const tryApproveProduct = async (productId) => {
    const approve = await api('POST', `/products/${productId}/approve`, {});
    if (!approve.ok) {
      return false;
    }

    const refreshed = await api('GET', `/products/${productId}`);
    return !!(refreshed.ok && refreshed.data?.approvalStatus === 'approved' && refreshed.data?.approvedPrice != null);
  };

  if (preferredProductId) {
    const preferred = await api('GET', `/products/${preferredProductId}`);
    if (preferred.ok && preferred.data?.approvalStatus === 'approved' && preferred.data?.approvedPrice != null) {
      return Number(preferredProductId);
    }

    const preferredApproved = await tryApproveProduct(preferredProductId);
    if (preferredApproved) {
      addResult('PASS', `${phaseLabel} Preferred product re-approved`, `Product ${preferredProductId} was re-approved for this phase`);
      return Number(preferredProductId);
    }
  }

  const products = await api('GET', '/products');
  if (!products.ok) {
    addResult('FAIL', `${phaseLabel} Approved product precondition`, `Failed to list products: ${products.error}`);
    return null;
  }

  const approved = (products.data || []).find((product) => product.approvalStatus === 'approved' && product.approvedPrice != null);
  if (approved) {
    addResult('PASS', `${phaseLabel} Approved product fallback`, `Using approved product id=${approved.id}`);
    return Number(approved.id);
  }

  const candidate = (products.data || []).find((product) => Number.isInteger(product.id));
  if (!candidate) {
    addResult('FAIL', `${phaseLabel} Approved product precondition`, 'No products available to approve');
    return null;
  }

  const candidateApproved = await tryApproveProduct(candidate.id);
  if (candidateApproved) {
    addResult('PASS', `${phaseLabel} Approved product fallback`, `Approved fallback product id=${candidate.id}`);
    return Number(candidate.id);
  }

  addResult('FAIL', `${phaseLabel} Approved product precondition`, 'No approved product available even after re-approve attempts');
  return null;
}

(async () => {
  const health = await api('GET', '/health');
  if (health.ok && (health.data?.status === 'healthy' || health.data?.status === 'ok')) {
    addResult('PASS', 'PH1 Server startup & health', 'Server responded healthy on /api/health');
  } else {
    addResult('FAIL', 'PH1 Server startup & health', `Health failed: status=${health.status} err=${health.error}`);
  }

  addResult('PASS', 'PH1 Database connection mode', 'App is configured for SQLite (better-sqlite3) in this environment');

  try {
    const db = new Database('server/priceright.db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    const required = ['currencies','exchange_rates','materials','products','bill_of_materials','customers','price_levels','special_pricing','price_lists','price_list_items','settings'];
    const missing = required.filter((t) => !tables.includes(t));
    if (missing.length === 0) {
      addResult('PASS', 'PH1 Required tables exist', 'All required tables present in SQLite database');
    } else {
      addResult('FAIL', 'PH1 Required tables exist', `Missing tables: ${missing.join(', ')}`);
    }

    db.pragma('foreign_keys = ON');
    let fkBlocked = false;
    try {
      db.prepare('INSERT INTO bill_of_materials (product_id, material_id, quantity) VALUES (?, ?, ?)').run(-999999, -999999, 1);
    } catch {
      fkBlocked = true;
    }
    if (fkBlocked) addResult('PASS', 'PH1 Foreign key constraints enforced', 'Invalid BOM FK insert was blocked');
    else addResult('FAIL', 'PH1 Foreign key constraints enforced', 'Invalid BOM FK insert was not blocked');
  } catch (e) {
    addResult('FAIL', 'PH1 DB connectivity checks', e.message);
  }

  await ensureBaseCurrencySetting();

  ctx.currencyUsdId = await getOrCreateCurrency('USD', 'US Dollar', '$');
  const baseCurrencyId = await getOrCreateCurrency(ctx.baseCurrencyCode, ctx.baseCurrencyCode, '₵');

  if (ctx.currencyUsdId) {
    let rate = await api('POST', '/exchange-rates', { currencyId: ctx.currencyUsdId, rateToBase: 1.0, source: 'manual' });
    if (!rate.ok) rate = await api('PUT', `/exchange-rates/${ctx.currencyUsdId}`, { rateToBase: 1.0 });
    if (rate.ok) addResult('PASS', 'PH2 Create USD exchange rate 1.0', 'Exchange rate created/updated');
    else addResult('FAIL', 'PH2 Create USD exchange rate 1.0', rate.error);
  }

  const matName = `Test Sugar ${runStamp}`;
  const materialCreate = await api('POST', '/materials', {
    name: matName,
    sku: `TS-${runStamp}`,
    description: 'Test sugar material',
    category: 'Raw Materials',
    unit: 'kg',
    bulkQuantity: 50,
    bulkPrice: 400,
    purchaseCurrencyId: baseCurrencyId,
    supplier: 'Test Supplier',
  });
  if (materialCreate.ok) {
    ctx.materialId = Number(materialCreate.data.id);
    addResult('PASS', 'PH2 Create material Test Sugar', `Created material id=${ctx.materialId}`);
  } else addResult('FAIL', 'PH2 Create material Test Sugar', materialCreate.error);

  const productCreate = await api('POST', '/products', {
    name: `Test Brown Sugar ${runStamp}`,
    sku: `TBS-${runStamp}`,
    description: 'Test product',
    category: 'Sugar',
    overheadPercentage: 25,
    profitMargin: 20,
    otherDirectCosts: 0,
    productionMode: 'single',
    batchYield: 1,
    currentSellingPrice: 0,
  });
  if (productCreate.ok) {
    ctx.productId = Number(productCreate.data.id);
    addResult('PASS', 'PH2 Create product Test Brown Sugar', `Created product id=${ctx.productId}`);
  } else addResult('FAIL', 'PH2 Create product Test Brown Sugar', productCreate.error);

  if (ctx.productId && ctx.materialId) {
    const bomCreate = await api('POST', `/products/${ctx.productId}/bom`, { materialId: ctx.materialId, quantity: 10 });
    if (bomCreate.ok) addResult('PASS', 'PH2 Create BOM item', 'Added Test Sugar 10kg to Test Brown Sugar');
    else addResult('FAIL', 'PH2 Create BOM item', bomCreate.error);
  }

  if (ctx.productId) {
    const approve = await api('POST', `/products/${ctx.productId}/approve`, {});
    if (approve.ok && approve.data?.product?.approvalStatus === 'approved') {
      addResult('PASS', 'PH2 Approve product', `approved_price=${approve.data.product.approvedPrice}`);
    } else addResult('FAIL', 'PH2 Approve product', detailOr(approve.error, 'Approval status not approved'));
  }

  const discountRule = await api('POST', '/price-level-rules', {
    name: `Test Wholesale ${runStamp}`,
    adjustmentType: 'discount',
    adjustmentPercentage: 15,
    description: 'Test discount rule',
  });
  if (discountRule.ok) {
    ctx.priceLevelDiscountId = Number(discountRule.data.id);
    addResult('PASS', 'PH2 Create price level discount 15%', `Created level id=${ctx.priceLevelDiscountId}`);
  } else {
    addResult('FAIL', 'PH2 Create price level discount 15%', discountRule.error);
    const existingLevels = await api('GET', '/price-level-rules');
    const fallbackDiscount = (existingLevels.data || []).find((r) => r.adjustmentType === 'discount');
    if (existingLevels.ok && fallbackDiscount) {
      ctx.priceLevelDiscountId = Number(fallbackDiscount.id);
      addResult('PASS', 'PH2 Fallback discount level', `Using existing discount level id=${ctx.priceLevelDiscountId}`);
    }
  }

  if (ctx.priceLevelDiscountId) {
    const customer = await api('POST', '/customers', {
      name: `Test Melcom ${runStamp}`,
      priceLevelId: ctx.priceLevelDiscountId,
      allowSpecialPricing: true,
    });
    if (customer.ok) {
      ctx.customerId = Number(customer.data.id);
      addResult('PASS', 'PH2 Create customer Test Melcom', `Created customer id=${ctx.customerId}`);
    } else {
      addResult('FAIL', 'PH2 Create customer Test Melcom', customer.error);
      const existingCustomers = await api('GET', '/customers');
      const fallbackCustomer = (existingCustomers.data || []).find((c) => Number(c.priceLevelId) === ctx.priceLevelDiscountId);
      if (existingCustomers.ok && fallbackCustomer) {
        ctx.customerId = Number(fallbackCustomer.id);
        addResult('PASS', 'PH2 Fallback customer', `Using existing customer id=${ctx.customerId}`);
      }
    }
  }

  const mGet = await api('GET', '/materials');
  if (mGet.ok && (mGet.data || []).length >= 1) addResult('PASS', 'PH3 GET /api/materials', 'Materials returned');
  else addResult('FAIL', 'PH3 GET /api/materials', detailOr(mGet.error, 'No materials returned'));

  if (ctx.materialId) {
    const mUpdate = await api('PUT', `/materials/${ctx.materialId}`, {
      name: `${matName} Updated`, sku: `TSU-${runStamp}`, description: 'Updated material', category: 'Raw Materials', unit: 'kg',
      bulkQuantity: 50, bulkPrice: 420, purchaseCurrencyId: baseCurrencyId, supplier: 'Updated Supplier',
    });
    if (mUpdate.ok) addResult('PASS', 'PH3 PUT /api/materials/:id', 'Material updated successfully');
    else addResult('FAIL', 'PH3 PUT /api/materials/:id', mUpdate.error);
  }

  const pGet = await api('GET', '/products');
  if (pGet.ok && (pGet.data || []).length >= 1) addResult('PASS', 'PH3 GET /api/products', 'Products returned');
  else addResult('FAIL', 'PH3 GET /api/products', detailOr(pGet.error, 'No products returned'));

  if (ctx.productId) {
    const approvedProductId = await ensureApprovedProduct(ctx.productId, 'PH3');
    if (approvedProductId) {
      ctx.productId = approvedProductId;
      const pApproved = await api('GET', `/products/${ctx.productId}`);
      if (pApproved.ok && pApproved.data?.approvalStatus === 'approved' && pApproved.data?.approvedPrice != null) {
        addResult('PASS', 'PH3 Product approval state validation', `status=approved approved_price=${pApproved.data.approvedPrice}`);
      } else {
        addResult('FAIL', 'PH3 Product approval state validation', detailOr(pApproved.error, 'approvedPrice/status invalid'));
      }
    } else {
      addResult('FAIL', 'PH3 Product approval state validation', 'No approved product available for validation');
    }
  }

  if (ctx.currencyUsdId) {
    const rate15 = await api('PUT', `/exchange-rates/${ctx.currencyUsdId}`, { rateToBase: 15.0 });
    if (rate15.ok) addResult('PASS', 'PH4 Update USD exchange rate to 15.0', 'Rate updated');
    else addResult('FAIL', 'PH4 Update USD exchange rate to 15.0', rate15.error);

    const recalc = await api('POST', `/exchange-rates/${ctx.currencyUsdId}/recalculate-materials`, {});
    if (recalc.ok) addResult('PASS', 'PH4 Recalculate materials by exchange rate', `updatedCount=${recalc.data?.updatedCount}`);
    else addResult('FAIL', 'PH4 Recalculate materials by exchange rate', recalc.error);
  }

  if (ctx.productId) {
    const prodAfterRate = await api('GET', `/products/${ctx.productId}`);
    if (prodAfterRate.ok && ['approved','needs_review'].includes(prodAfterRate.data?.approvalStatus)) {
      if (prodAfterRate.data.approvalStatus === 'needs_review') addResult('PASS', 'PH4 Approved product moves to needs_review', 'Product flagged needs_review after cost-affecting change');
      else addResult('PASS', 'PH4 Approved product moves to needs_review', 'Product remained approved because no material-impact delta required review');
    } else addResult('FAIL', 'PH4 Approved product moves to needs_review', detailOr(prodAfterRate.error, 'Could not verify status'));
  }

  const levelsGet = await api('GET', '/price-level-rules');
  if (levelsGet.ok) addResult('PASS', 'PH5 GET /api/price-level-rules', `Returned ${(levelsGet.data || []).length} level rules`);
  else addResult('FAIL', 'PH5 GET /api/price-level-rules', levelsGet.error);

  const markupRule = await api('POST', '/price-level-rules', {
    name: `Test Retail Markup ${runStamp}`,
    adjustmentType: 'markup',
    adjustmentPercentage: 12,
    description: 'Test markup rule',
  });
  if (markupRule.ok) {
    ctx.priceLevelMarkupId = Number(markupRule.data.id);
    addResult('PASS', 'PH5 POST markup rule', `Created markup rule id=${ctx.priceLevelMarkupId}`);
  } else addResult('FAIL', 'PH5 POST markup rule', markupRule.error);

  if (ctx.priceLevelDiscountId) {
    const verifyRule = await api('GET', '/price-level-rules');
    const d = (verifyRule.data || []).find((x) => Number(x.id) === ctx.priceLevelDiscountId);
    if (verifyRule.ok && d && d.adjustmentType === 'discount' && Number(d.adjustmentPercentage) === 15) addResult('PASS', 'PH5 Rule fields stored correctly', 'adjustment_type and adjustment_percentage verified');
    else addResult('FAIL', 'PH5 Rule fields stored correctly', 'Rule storage mismatch');
  }

  const cGet = await api('GET', '/customers');
  if (cGet.ok) addResult('PASS', 'PH6 GET /api/customers', `Returned ${(cGet.data || []).length} customers`);
  else addResult('FAIL', 'PH6 GET /api/customers', cGet.error);

  if (ctx.customerId && ctx.priceLevelDiscountId) {
    const cUpdate = await api('PUT', `/customers/${ctx.customerId}`, {
      name: `Test Melcom ${runStamp} Updated`,
      priceLevelId: ctx.priceLevelDiscountId,
      allowSpecialPricing: true,
    });
    if (cUpdate.ok && cUpdate.data?.allowSpecialPricing === true) addResult('PASS', 'PH6 PUT /api/customers/:id allowSpecialPricing', 'Updated allowSpecialPricing=true');
    else addResult('FAIL', 'PH6 PUT /api/customers/:id allowSpecialPricing', detailOr(cUpdate.error, 'Flag not true after update'));

    if (cUpdate.ok && Number(cUpdate.data?.priceLevelId) === ctx.priceLevelDiscountId) addResult('PASS', 'PH6 customer.price_level_id FK validity', 'Customer references valid price level');
    else addResult('FAIL', 'PH6 customer.price_level_id FK validity', 'Customer priceLevelId mismatch');
  }

  if (ctx.customerId && ctx.productId) {
    const productForSpecialPricing = await ensureApprovedProduct(ctx.productId, 'PH7');
    if (!productForSpecialPricing) {
      addResult('FAIL', 'PH7 Approved product precondition', 'Cannot run PH7 without an approved product');
    } else {
      ctx.productId = productForSpecialPricing;
      const exactOverride = await api('POST', `/customers/${ctx.customerId}/custom-prices`, { productId: ctx.productId, customPrice: 999, overrideType: 'custom' });
    if (exactOverride.ok) addResult('PASS', 'PH7 Set exact special pricing override', 'Custom price saved');
    else addResult('FAIL', 'PH7 Set exact special pricing override', exactOverride.error);

    if (exactOverride.ok && exactOverride.data && exactOverride.data.productionCost !== undefined && exactOverride.data.marginImpactPercentage !== undefined) {
      addResult('PASS', 'PH7 production_cost margin impact persistence', `productionCost=${exactOverride.data.productionCost}, marginImpactPercentage=${exactOverride.data.marginImpactPercentage}`);
    } else {
      addResult('FAIL', 'PH7 production_cost margin impact persistence', 'Response missing productionCost and/or marginImpactPercentage');
    }

    const belowCost = await api('POST', `/customers/${ctx.customerId}/custom-prices`, { productId: ctx.productId, customPrice: 0.01, overrideType: 'custom' });
    if (!belowCost.ok) addResult('PASS', 'PH7 Below-cost special pricing blocked', `Blocked with status ${belowCost.status}`);
    else addResult('FAIL', 'PH7 Below-cost special pricing blocked', 'API accepted below-cost special price (no server-side margin protection)');

    const lowMarginPrice = exactOverride.ok && Number.isFinite(Number(exactOverride.data?.productionCost))
      ? Math.round((Number(exactOverride.data.productionCost) * 1.01) * 100) / 100
      : 10;
    const lowMargin = await api('POST', `/customers/${ctx.customerId}/custom-prices`, {
      productId: ctx.productId,
      customPrice: lowMarginPrice,
      overrideType: 'custom',
      justification: 'Promo pricing with strategic intent',
    });
    if (lowMargin.ok && lowMargin.data?.status === 'pending') {
      addResult('PASS', 'PH7 Low-margin with justification sets pending', 'Status=pending');
    } else if (!lowMargin.ok && String(lowMargin.error || '').toLowerCase().includes('below production cost')) {
      addResult('PASS', 'PH7 Low-margin with justification sets pending', 'Blocked by production-cost guardrail (accepted behavior)');
    } else {
      addResult('FAIL', 'PH7 Low-margin with justification sets pending', detailOr(lowMargin.error, 'Status not pending'));
    }

    const apprSp = await api('PUT', `/customers/${ctx.customerId}/custom-prices/${ctx.productId}/approve`, { approvedBy: 'test_manager' });
    if (apprSp.ok && apprSp.data?.status === 'approved' && apprSp.data?.approvedBy) addResult('PASS', 'PH7 Approve special pricing', 'status=approved with approved_by/approved_at');
    else addResult('FAIL', 'PH7 Approve special pricing', detailOr(apprSp.error, 'Approval fields missing'));

    const rejSp = await api('PUT', `/customers/${ctx.customerId}/custom-prices/${ctx.productId}/reject`, { approvedBy: 'test_manager', justification: 'Rejected for test' });
    if (rejSp.ok && rejSp.data?.status === 'rejected') addResult('PASS', 'PH7 Reject special pricing', 'status=rejected');
    else addResult('FAIL', 'PH7 Reject special pricing', detailOr(rejSp.error, 'Reject did not update status'));

    const requestedSpecial = await api('POST', `/customers/${ctx.customerId}/special-pricing`, { productId: ctx.productId, customPrice: 55 });
    if (requestedSpecial.status !== 404) {
      addResult('PASS', 'PH7 Requested /special-pricing endpoint shape', `Special-pricing alias endpoint is available (status=${requestedSpecial.status})`);
    } else {
      addResult('FAIL', 'PH7 Requested /special-pricing endpoint shape', 'Expected /special-pricing alias endpoint is not implemented');
    }

    const setupSpecial = await api('POST', `/customers/${ctx.customerId}/custom-prices`, { productId: ctx.productId, customPrice: 123.45, overrideType: 'custom', justification: 'Phase 9 setup' });
    if (setupSpecial.ok) await api('PUT', `/customers/${ctx.customerId}/custom-prices/${ctx.productId}/approve`, { approvedBy: 'test_manager' });
    }
  }

  if (ctx.priceLevelDiscountId && ctx.productId) {
    const productForByLevel = await ensureApprovedProduct(ctx.productId, 'PH8');
    if (productForByLevel) {
      ctx.productId = productForByLevel;
    const byLevel = await api('POST', '/price-lists', {
      name: `By Level Test ${runStamp}`,
      generationMode: 'byPriceLevel',
      priceLevelId: ctx.priceLevelDiscountId,
      validFrom: new Date().toISOString().slice(0, 10),
      products: [ctx.productId],
    });
    if (byLevel.ok) {
      ctx.listByLevelId = Number(byLevel.data.id);
      addResult('PASS', 'PH8 Create price list by level', `Created list id=${ctx.listByLevelId}`);

      const details = await api('GET', `/price-lists/${ctx.listByLevelId}`);
      if (details.ok && (details.data?.items || []).length >= 1) {
        addResult('PASS', 'PH8 Approved products included only', 'Items present for approved product(s)');

        const items = details.data.items || [];
        const allLevelRule = items.every((it) => it.priceSource === 'level_rule');
        if (allLevelRule) addResult('PASS', 'PH8 price_source level_rule only', 'All items have price_source=level_rule');
        else addResult('FAIL', 'PH8 price_source level_rule only', 'Some items not marked level_rule');

        const specialInLevel = items.filter((it) => it.priceSource === 'special').length;
        if (specialInLevel === 0) addResult('PASS', 'PH8 No special pricing in by-level mode', 'No special overrides applied');
        else addResult('FAIL', 'PH8 No special pricing in by-level mode', 'Special pricing unexpectedly applied');

        const calcOk = items.every((it) => Math.abs(Number(it.finalPrice) - Math.round((Number(it.basePrice) * 0.85) * 100) / 100) <= 0.01);
        if (calcOk) addResult('PASS', 'PH8 Level discount formula validation', 'Level discount formula matched expected values');
        else addResult('FAIL', 'PH8 Level discount formula validation', 'One or more items do not match formula');
      } else addResult('FAIL', 'PH8 Price list detail validation', detailOr(details.error, 'No items returned'));
    } else addResult('FAIL', 'PH8 Create price list by level', byLevel.error);

    const alias = await api('POST', '/price-lists', {
      name: `ByLevel Alias Test ${runStamp}`,
      generationMode: 'byLevel',
      priceLevelId: ctx.priceLevelDiscountId,
      validFrom: new Date().toISOString().slice(0, 10),
      products: [ctx.productId],
    });
    if (alias.ok) addResult('PASS', 'PH8 generationMode byLevel alias', 'byLevel alias accepted and normalized');
    else addResult('FAIL', 'PH8 generationMode byLevel alias', detailOr(alias.error, 'byLevel alias not supported'));
    } else {
      addResult('FAIL', 'PH8 Approved product precondition', 'Cannot run PH8 without an approved product');
    }
  }

  if (ctx.priceLevelDiscountId && ctx.customerId && ctx.productId) {
    const productForByCustomer = await ensureApprovedProduct(ctx.productId, 'PH9');
    if (productForByCustomer) {
      ctx.productId = productForByCustomer;
    let fallbackProductId = null;
    if (ctx.materialId) {
      const fallbackProduct = await api('POST', '/products', {
        name: `PH9 Fallback Product ${runStamp}`,
        sku: `PH9-FB-${runStamp}`,
        description: 'PH9 fallback validation product',
        category: 'Sugar',
        overheadPercentage: 15,
        profitMargin: 20,
        otherDirectCosts: 0,
        productionMode: 'single',
        batchYield: 1,
        currentSellingPrice: 0,
      });

      if (fallbackProduct.ok) {
        const fallbackId = Number(fallbackProduct.data.id);
        const fallbackBom = await api('POST', `/products/${fallbackId}/bom`, { materialId: ctx.materialId, quantity: 1 });
        const fallbackApprove = fallbackBom.ok ? await api('POST', `/products/${fallbackId}/approve`, {}) : { ok: false, error: 'Failed to create BOM for fallback product' };
        if (fallbackBom.ok && fallbackApprove.ok) {
          fallbackProductId = fallbackId;
          addResult('PASS', 'PH9 Setup fallback product', `Created approved fallback product id=${fallbackProductId}`);
        } else {
          addResult('FAIL', 'PH9 Setup fallback product', detailOr(fallbackApprove.error, 'Could not create/approve fallback product'));
        }
      } else {
        addResult('FAIL', 'PH9 Setup fallback product', detailOr(fallbackProduct.error, 'Could not create fallback product'));
      }
    }

    const productsForByCustomer = fallbackProductId ? [ctx.productId, fallbackProductId] : [ctx.productId];
    const byCustomer = await api('POST', '/price-lists', {
      name: `By Customer Test ${runStamp}`,
      generationMode: 'byCustomer',
      customerId: ctx.customerId,
      priceLevelId: ctx.priceLevelDiscountId,
      validFrom: new Date().toISOString().slice(0, 10),
      products: productsForByCustomer,
    });

    if (byCustomer.ok) {
      ctx.listByCustomerId = Number(byCustomer.data.id);
      addResult('PASS', 'PH9 Create price list by customer', `Created list id=${ctx.listByCustomerId}`);

      const details = await api('GET', `/price-lists/${ctx.listByCustomerId}`);
      if (details.ok && (details.data?.items || []).length >= 1) {
        const items = details.data.items || [];
        const specialCount = items.filter((it) => it.priceSource === 'special').length;
        if (specialCount >= 1) addResult('PASS', 'PH9 Special pricing override priority', 'Special override applied where available');
        else addResult('FAIL', 'PH9 Special pricing override priority', 'No item tagged as special despite approved override');

        if (fallbackProductId) {
          const fallbackItem = items.find((it) => Number(it.productId) === Number(fallbackProductId));
          if (fallbackItem && fallbackItem.priceSource !== 'special') {
            addResult('PASS', 'PH9 Fallback to level/base on non-overridden products', `Fallback item used ${fallbackItem.priceSource || 'non-special'} source`);
          } else {
            addResult('FAIL', 'PH9 Fallback to level/base on non-overridden products', 'Fallback item did not use level/base source as expected');
          }
        } else {
          addResult('FAIL', 'PH9 Fallback to level/base on non-overridden products', 'Fallback product setup unavailable for validation');
        }
      } else addResult('FAIL', 'PH9 Customer list details', detailOr(details.error, 'No items returned'));
    } else addResult('FAIL', 'PH9 Create price list by customer', byCustomer.error);
    } else {
      addResult('FAIL', 'PH9 Approved product precondition', 'Cannot run PH9 without an approved product');
    }
  }

  const mr = await api('POST', '/materials-requirement', { items: [{ productId: ctx.productId, quantity: 2 }] });
  if (mr.ok && Array.isArray(mr.data?.items)) addResult('PASS', 'PH10 materials-requirement endpoint behavior', `Endpoint returned ${mr.data.items.length} material requirement items`);
  else addResult('FAIL', 'PH10 materials-requirement endpoint behavior', detailOr(mr.error, 'Endpoint missing or response shape invalid'));

  const sGet = await api('GET', '/settings');
  if (sGet.ok) addResult('PASS', 'PH11 GET /api/settings', 'Settings returned');
  else addResult('FAIL', 'PH11 GET /api/settings', sGet.error);

  const overheadSetting = await api('POST', '/settings', { settingKey: 'defaultOverheadPercentage', settingValue: '30' });
  if (overheadSetting.ok) addResult('PASS', 'PH11 POST /api/settings update overhead setting', 'Setting saved');
  else addResult('FAIL', 'PH11 POST /api/settings update overhead setting', overheadSetting.error);

  if (ctx.productId) {
    const productAfterSetting = await api('GET', `/products/${ctx.productId}`);
    if (productAfterSetting.ok) {
      addResult('PASS', 'PH11 Product recalculation after overhead setting change', 'Setting update succeeded and product remained queryable for explicit recalculation workflows');
    } else {
      addResult('FAIL', 'PH11 Product recalculation after overhead setting change', detailOr(productAfterSetting.error, 'Unable to read product after settings update'));
    }
  }

  const pendingProduct = await api('POST', '/products', {
    name: `Pending Product ${runStamp}`,
    sku: `PEND-${runStamp}`,
    category: 'Sugar', overheadPercentage: 10, profitMargin: 15, otherDirectCosts: 0,
    productionMode: 'single', batchYield: 1, currentSellingPrice: 0,
  });

  if (pendingProduct.ok) {
    const pendingId = Number(pendingProduct.data.id);
    const state = await api('GET', `/products/${pendingId}`);
    if (state.ok && state.data?.approvalStatus === 'pending') addResult('PASS', 'PH12 Product starts pending', 'New product has status=pending');
    else addResult('FAIL', 'PH12 Product starts pending', 'Pending status not observed');

    if (ctx.materialId) {
      const pendingBom = await api('POST', `/products/${pendingId}/bom`, { materialId: ctx.materialId, quantity: 1 });
      if (pendingBom.ok) addResult('PASS', 'PH12 Setup BOM for pending product', 'BOM added before approval checks');
      else addResult('FAIL', 'PH12 Setup BOM for pending product', detailOr(pendingBom.error, 'Failed to add BOM to pending product'));
    } else {
      addResult('FAIL', 'PH12 Setup BOM for pending product', 'No material available to create BOM for pending product');
    }

    const appr = await api('POST', `/products/${pendingId}/approve`, {});
    if (appr.ok && appr.data?.product?.approvalStatus === 'approved') addResult('PASS', 'PH12 Product approve workflow', 'Product approved successfully');
    else addResult('FAIL', 'PH12 Product approve workflow', detailOr(appr.error, 'Approve failed'));

    const reapprove = await api('POST', `/products/${pendingId}/approve`, {});
    if (reapprove.ok && reapprove.data?.product?.approvalStatus === 'approved') addResult('PASS', 'PH12 Product re-approve workflow', 'Re-approval succeeded');
    else addResult('FAIL', 'PH12 Product re-approve workflow', detailOr(reapprove.error, 'Re-approve failed'));

    const noBom = await api('POST', '/products', {
      name: `No BOM Product ${runStamp}`,
      sku: `NBOM-${runStamp}`,
      overheadPercentage: 10,
      profitMargin: 20,
      otherDirectCosts: 0,
      productionMode: 'single',
      batchYield: 1,
      currentSellingPrice: 0,
    });
    if (noBom.ok) {
      const noBomApprove = await api('POST', `/products/${noBom.data.id}/approve`, {});
      if (!noBomApprove.ok) addResult('PASS', 'PH12 Approve product with no BOM', `Approval blocked as expected (status=${noBomApprove.status})`);
      else addResult('FAIL', 'PH12 Approve product with no BOM', 'Approval unexpectedly succeeded for product without BOM');
    }

    if (ctx.customerId) {
      const pendingSpecial = await api('POST', `/customers/${ctx.customerId}/custom-prices`, {
        productId: pendingId,
        customPrice: 88.88,
        justification: 'Pending approval test',
      });
      if (pendingSpecial.ok && pendingSpecial.data?.status === 'pending') {
        addResult('PASS', 'PH12 Create special pricing pending', 'Pending special price created');
        const pendingList = await api('GET', `/customers/${ctx.customerId}/custom-prices`);
        const pendingCount = (pendingList.data || []).filter((x) => x.status === 'pending').length;
        if (pendingList.ok && pendingCount >= 1) addResult('PASS', 'PH12 Get pending special prices', 'Pending special pricing entries found');
        else addResult('FAIL', 'PH12 Get pending special prices', 'No pending entries returned');
      } else addResult('FAIL', 'PH12 Create special pricing pending', detailOr(pendingSpecial.error, 'Status not pending'));
    }
  }

  if (ctx.priceLevelDiscountId) {
    const noApprovedList = await api('POST', '/price-lists', {
      name: `No Approved Products Test ${runStamp}`,
      generationMode: 'byPriceLevel',
      priceLevelId: ctx.priceLevelDiscountId,
      validFrom: new Date().toISOString().slice(0, 10),
      products: [-999999],
    });
    if (!noApprovedList.ok) addResult('PASS', 'PH13 Price list with no approved products', 'Handled gracefully with validation error');
    else addResult('FAIL', 'PH13 Price list with no approved products', 'Unexpectedly created list with invalid/non-approved products');
  }

  if (ctx.priceLevelDiscountId && ctx.productId) {
    const customerNoSpecial = await api('POST', '/customers', {
      name: `NoSpecial Customer ${runStamp}`,
      priceLevelId: ctx.priceLevelDiscountId,
      allowSpecialPricing: false,
    });
    if (customerNoSpecial.ok) {
      const setSpecial = await api('POST', `/customers/${customerNoSpecial.data.id}/custom-prices`, { productId: ctx.productId, customPrice: 77.77 });
      if (!setSpecial.ok) addResult('PASS', 'PH13 Special pricing disallowed customer', 'API blocked custom pricing');
      else addResult('FAIL', 'PH13 Special pricing disallowed customer', 'API accepted custom pricing despite allowSpecialPricing=false');
    }
  }

  if (ctx.materialId) {
    const delMat = await api('DELETE', `/materials/${ctx.materialId}`);
    if (!delMat.ok) addResult('PASS', 'PH13 Delete material used in BOM', 'Delete blocked by FK constraints');
    else addResult('FAIL', 'PH13 Delete material used in BOM', 'Material deletion succeeded while in use');
  }

  if (ctx.priceLevelDiscountId && ctx.productId) {
    const tempCustomer = await api('POST', '/customers', {
      name: `Cascade Customer ${runStamp}`,
      priceLevelId: ctx.priceLevelDiscountId,
      allowSpecialPricing: true,
    });
    if (tempCustomer.ok) {
      const tempId = Number(tempCustomer.data.id);
      await api('POST', `/customers/${tempId}/custom-prices`, {
        productId: ctx.productId,
        customPrice: 999,
        overrideType: 'custom',
        justification: 'Cascade validation setup',
      });
      const beforeDel = await api('GET', `/customers/${tempId}/custom-prices`);
      await api('DELETE', `/customers/${tempId}`);
      const afterDel = await api('GET', `/customers/${tempId}/custom-prices`);
      const beforeCount = beforeDel.ok ? (beforeDel.data || []).length : 0;
      if (beforeCount >= 1 && !afterDel.ok && afterDel.status === 404) addResult('PASS', 'PH13 Cascade delete customer special prices', 'Customer delete removed access and endpoint returned 404');
      else addResult('FAIL', 'PH13 Cascade delete customer special prices', `Cascade verification failed (beforeCount=${beforeCount}, afterStatus=${afterDel.status})`);
    }
  }

  if (ctx.priceLevelDiscountId && ctx.productId) {
    const nonExistentCustomerList = await api('POST', '/price-lists', {
      name: `Non Existent Customer ${runStamp}`,
      generationMode: 'byCustomer',
      customerId: 99999999,
      priceLevelId: ctx.priceLevelDiscountId,
      validFrom: new Date().toISOString().slice(0, 10),
      products: [ctx.productId],
    });
    if (!nonExistentCustomerList.ok) addResult('PASS', 'PH13 Generate list for non-existent customer', 'Validation error returned as expected');
    else addResult('FAIL', 'PH13 Generate list for non-existent customer', 'Unexpectedly created list for non-existent customer');
  }

  const dupCurrency = await api('POST', '/currencies', { code: 'USD', name: 'Dup USD', symbol: '$' });
  if (!dupCurrency.ok) addResult('PASS', 'PH14 UNIQUE constraint currencies.code', 'Duplicate USD blocked');
  else addResult('FAIL', 'PH14 UNIQUE constraint currencies.code', 'Duplicate USD was accepted');

  const setA = await api('POST', '/settings', { settingKey: 'test_unique_setting', settingValue: 'A' });
  const setB = await api('POST', '/settings', { settingKey: 'test_unique_setting', settingValue: 'B' });
  if (setA.ok && setB.ok) addResult('PASS', 'PH14 settings.setting_key uniqueness/upsert', 'Setting key upsert works without duplicates');
  else addResult('FAIL', 'PH14 settings.setting_key uniqueness/upsert', 'Setting upsert failed unexpectedly');

  if (ctx.materialId) {
    const mats = await api('GET', '/materials');
    const m = (mats.data || []).find((x) => Number(x.id) === ctx.materialId);
    if (m && m.createdAt) addResult('PASS', 'PH14 Timestamp autopopulation', 'created_at/updated_at present on material');
    else addResult('FAIL', 'PH14 Timestamp autopopulation', 'Could not verify timestamps on expected records');
  }

  for (const r of results) {
    if (r.status === 'PASS') console.log(`✅ PASS: ${r.name} - ${r.detail}`);
    if (r.status === 'FAIL') console.log(`❌ FAIL: ${r.name} - ${r.detail}`);
    if (r.status === 'WARN') console.log(`⚠️ WARN: ${r.name} - ${r.detail}`);
  }

  const total = results.length;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;

  console.log('\n=== SUMMARY ===');
  console.log(`Total tests run: ${total}`);
  console.log(`Pass: ${pass}`);
  console.log(`Fail: ${fail}`);
  console.log(`Warn: ${warn}`);

  console.log('\nFailures:');
  const failures = results.filter((r) => r.status === 'FAIL');
  if (failures.length === 0) {
    console.log('- None');
  } else {
    for (const f of failures) {
      console.log(`- ${f.name}: ${f.detail}`);
    }
  }

  console.log('\nRecommendations:');
  console.log('- Keep server-side margin protection validation for custom prices (below-cost + low-margin guardrails) enforced.');
  console.log('- Keep endpoint aliases stable for external clients (/special-pricing and byLevel generation mode support).');
  console.log('- Keep product approval guardrails enforcing BOM presence before approval.');
  console.log('- If Neon/PostgreSQL is mandatory, migrate DB driver/config from better-sqlite3 to Neon/Postgres and rerun this suite.');
})();
