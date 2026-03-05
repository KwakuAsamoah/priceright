(async () => {
  const base = 'http://localhost:3000/api';
  const stamp = Math.floor(Date.now() / 1000);
  const results = [];

  const add = (s, n, d) => results.push({ s, n, d });
  const req = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data, error: data?.error || text };
  };

  const productsResp = await req('GET', '/products');
  const approvedProduct = (productsResp.data || []).find((p) => p.approvalStatus === 'approved' && p.approvedPrice != null) || (productsResp.data || [])[0];

  if (!approvedProduct) {
    add('FAIL', 'Setup approved product', 'No product available');
  }

  if (approvedProduct && approvedProduct.approvalStatus !== 'approved') {
    await req('POST', `/products/${approvedProduct.id}/approve`, {});
  }

  const levelBody = {
    name: `Focused Level ${stamp}`,
    adjustmentType: 'discount',
    adjustmentPercentage: 15,
    description: 'Focused retest level',
  };

  const ph5a = await req('POST', '/price-level-rules', levelBody);
  if (ph5a.ok) add('PASS', 'PH5 POST /api/price-level-rules', `Created id=${ph5a.data.id}`);
  else add('FAIL', 'PH5 POST /api/price-level-rules', ph5a.error);

  const ph5b = await req('POST', '/price-levels', {
    name: `Focused Level Alias ${stamp}`,
    adjustmentType: 'markup',
    adjustmentPercentage: 10,
    description: 'Alias route test',
  });
  if (ph5b.ok) add('PASS', 'PH5 POST /api/price-levels', `Created id=${ph5b.data.id}`);
  else add('FAIL', 'PH5 POST /api/price-levels', ph5b.error);

  const levelsGet = await req('GET', '/price-level-rules');
  if (levelsGet.ok && ph5a.ok) {
    const created = (levelsGet.data || []).find((r) => Number(r.id) === Number(ph5a.data.id));
    if (created && created.adjustmentType === 'discount' && Number(created.adjustmentPercentage) === 15) {
      add('PASS', 'PH5 verify level fields', 'adjustment_type and adjustment_percentage stored correctly');
    } else {
      add('FAIL', 'PH5 verify level fields', 'Created level not found or fields mismatch');
    }
  } else if (!levelsGet.ok) {
    add('FAIL', 'PH5 GET /api/price-level-rules', levelsGet.error);
  }

  const customersResp = await req('GET', '/customers');
  let customer = (customersResp.data || []).find((c) => c.allowSpecialPricing === true && c.priceLevelId);
  if (!customer) {
    const fallbackPriceLevelId = ph5a.ok ? ph5a.data.id : (ph5b.ok ? ph5b.data.id : null);
    if (fallbackPriceLevelId) {
      const createCustomer = await req('POST', '/customers', {
        name: `Focused Customer ${stamp}`,
        priceLevelId: fallbackPriceLevelId,
        allowSpecialPricing: true,
      });

      if (createCustomer.ok) {
        customer = createCustomer.data;
        add('PASS', 'Setup customer for PH7', `Created fallback customer id=${customer.id}`);
      } else {
        add('FAIL', 'Setup customer for PH7', `Fallback customer create failed: ${createCustomer.error}`);
      }
    } else {
      add('FAIL', 'Setup customer for PH7', 'No eligible customer found and no fallback price level available');
    }
  }

  if (customer && approvedProduct) {
    const ensureApproved = await req('POST', `/products/${approvedProduct.id}/approve`, {});
    if (!ensureApproved.ok) add('WARN', 'PH7 product approve precondition', ensureApproved.error);

    const specialSave = await req('POST', `/customers/${customer.id}/special-pricing`, {
      productId: approvedProduct.id,
      customPrice: Number(approvedProduct.approvedPrice) * 0.9,
      overrideType: 'custom',
      justification: 'Focused PH7 test',
    });

    if (specialSave.ok) {
      add('PASS', 'PH7 POST /api/customers/:id/special-pricing', `Saved status=${specialSave.data.status}`);
      if (specialSave.data.productionCost !== undefined) {
        add('PASS', 'PH7 production cost calculation in response', `productionCost=${specialSave.data.productionCost}, marginImpact=${specialSave.data.marginImpactPercentage}`);
      } else {
        add('FAIL', 'PH7 production cost calculation in response', 'productionCost not returned');
      }
    } else {
      add('FAIL', 'PH7 POST /api/customers/:id/special-pricing', specialSave.error);
    }

    const lowPrice = await req('POST', `/customers/${customer.id}/special-pricing`, {
      productId: approvedProduct.id,
      customPrice: 0.01,
      overrideType: 'custom',
    });
    if (!lowPrice.ok) add('PASS', 'PH7 below-cost/invalid low-price handling', `Blocked with status=${lowPrice.status}`);
    else add('WARN', 'PH7 below-cost/invalid low-price handling', 'Request accepted; server allows low pricing');

    const approveSp = await req('PUT', `/customers/${customer.id}/custom-prices/${approvedProduct.id}/approve`, { approvedBy: 'focused_test' });
    if (approveSp.ok && approveSp.data.status === 'approved') add('PASS', 'PH7 approve special pricing', 'status=approved');
    else add('FAIL', 'PH7 approve special pricing', approveSp.error || 'approve failed');

    if (ph5a.ok) {
      const byLevel = await req('POST', '/price-lists', {
        name: `Focused ByLevel ${stamp}`,
        generationMode: 'byPriceLevel',
        priceLevelId: ph5a.data.id,
        validFrom: new Date().toISOString().slice(0, 10),
        products: [approvedProduct.id],
      });

      if (byLevel.ok) {
        const details = await req('GET', `/price-lists/${byLevel.data.id}`);
        const items = details.data?.items || [];
        const allLevel = items.length > 0 && items.every((i) => i.priceSource === 'level_rule');
        if (allLevel) add('PASS', 'PH8 by-level source validation', 'All items price_source=level_rule');
        else add('FAIL', 'PH8 by-level source validation', 'Expected level_rule source not found');
      } else {
        add('FAIL', 'PH8 create by-level price list', byLevel.error);
      }

      const byCustomer = await req('POST', '/price-lists', {
        name: `Focused ByCustomer ${stamp}`,
        generationMode: 'byCustomer',
        customerId: customer.id,
        priceLevelId: customer.priceLevelId,
        validFrom: new Date().toISOString().slice(0, 10),
        products: [approvedProduct.id],
      });

      if (byCustomer.ok) {
        const details = await req('GET', `/price-lists/${byCustomer.data.id}`);
        const items = details.data?.items || [];
        const anySpecial = items.some((i) => i.priceSource === 'special');
        if (anySpecial) add('PASS', 'PH9 by-customer priority validation', 'Special override applied with price_source=special');
        else add('FAIL', 'PH9 by-customer priority validation', 'No special source applied');
      } else {
        add('FAIL', 'PH9 create by-customer price list', byCustomer.error);
      }
    }
  }

  for (const r of results) {
    const icon = r.s === 'PASS' ? '✅ PASS' : r.s === 'FAIL' ? '❌ FAIL' : '⚠️ WARN';
    console.log(`${icon}: ${r.n} - ${r.d}`);
  }

  const p = results.filter((r) => r.s === 'PASS').length;
  const f = results.filter((r) => r.s === 'FAIL').length;
  const w = results.filter((r) => r.s === 'WARN').length;
  console.log(`SUMMARY total=${results.length} pass=${p} fail=${f} warn=${w}`);
})();