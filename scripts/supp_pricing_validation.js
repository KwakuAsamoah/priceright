(async () => {
  const base = 'http://localhost:3000/api';
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
  const products = productsResp.data || [];
  const target = [...products].reverse().find((p) => String(p.name || '').includes('Test Brown Sugar'));
  if (!target) {
    console.log('NO_TARGET_PRODUCT');
    return;
  }

  const pid = target.id;
  const reapprove = await req('POST', `/products/${pid}/approve`, {});
  console.log('REAPPROVE', reapprove.ok, reapprove.status, reapprove.data?.approvalStatus, reapprove.data?.approvedPrice);

  const customersResp = await req('GET', '/customers');
  const customer = (customersResp.data || []).find((c) => c.allowSpecialPricing === true && c.priceLevelId);
  if (!customer) {
    console.log('NO_CUSTOMER');
    return;
  }

  const cid = customer.id;
  const setSpecial = await req('POST', `/customers/${cid}/custom-prices`, {
    productId: pid,
    customPrice: 123.45,
    overrideType: 'custom',
    justification: 'supp test',
  });
  console.log('SPECIAL_SET', setSpecial.ok, setSpecial.status, setSpecial.data?.status || setSpecial.error);

  const approveSpecial = await req('PUT', `/customers/${cid}/custom-prices/${pid}/approve`, { approvedBy: 'supp_test_mgr' });
  console.log('SPECIAL_APPROVE', approveSpecial.ok, approveSpecial.status, approveSpecial.data?.status || approveSpecial.error);

  const byLevel = await req('POST', '/price-lists', {
    name: 'Supp ByLevel',
    generationMode: 'byPriceLevel',
    priceLevelId: customer.priceLevelId,
    validFrom: new Date().toISOString().slice(0, 10),
    products: [pid],
  });
  console.log('PL_BY_LEVEL', byLevel.ok, byLevel.status, byLevel.data?.id || byLevel.error);
  if (byLevel.ok) {
    const details = await req('GET', `/price-lists/${byLevel.data.id}`);
    console.log('PL_BY_LEVEL_SOURCES', (details.data?.items || []).map((i) => i.priceSource).join(','));
  }

  const byCustomer = await req('POST', '/price-lists', {
    name: 'Supp ByCustomer',
    generationMode: 'byCustomer',
    customerId: cid,
    priceLevelId: customer.priceLevelId,
    validFrom: new Date().toISOString().slice(0, 10),
    products: [pid],
  });
  console.log('PL_BY_CUSTOMER', byCustomer.ok, byCustomer.status, byCustomer.data?.id || byCustomer.error);
  if (byCustomer.ok) {
    const details = await req('GET', `/price-lists/${byCustomer.data.id}`);
    console.log('PL_BY_CUSTOMER_SOURCES', (details.data?.items || []).map((i) => i.priceSource).join(','));
    console.log('PL_BY_CUSTOMER_FINALS', (details.data?.items || []).map((i) => i.finalPrice).join(','));
  }
})();