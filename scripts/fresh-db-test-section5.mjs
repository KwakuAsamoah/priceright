const base = 'http://localhost:3000/api';

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

function report(label, ok, detail) {
  console.log(`${label}: ${ok ? 'PASS' : 'FAIL'} ${detail}`);
}

const created = await request('/price-levels', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Wholesale',
    description: 'Section 5 alias check',
    currency: 'USD',
  }),
});
report('TEST 5.1', created.ok && created.data?.name === 'Wholesale', `status=${created.status} id=${created.data?.id} name=${created.data?.name}`);

const listed = await request('/price-levels');
const createdLevel = Array.isArray(listed.data) ? listed.data.find((level) => level.name === 'Wholesale') : null;
report('TEST 5.2', listed.ok && Boolean(createdLevel), `status=${listed.status} count=${Array.isArray(listed.data) ? listed.data.length : 'n/a'}`);

const levelId = createdLevel?.id ?? created.data?.id;
const productId = 1;

const addDiscount = await request(`/price-levels/${levelId}/items`, {
  method: 'POST',
  body: JSON.stringify({
    productId,
    pricingType: 'discount',
    discountPercentage: 10,
  }),
});
report('TEST 5.3', addDiscount.ok && addDiscount.data?.overrideType === 'rule_discount' && Number(addDiscount.data?.finalPrice).toFixed(2) === '6.48', `status=${addDiscount.status} itemId=${addDiscount.data?.id} overrideType=${addDiscount.data?.overrideType} finalPrice=${addDiscount.data?.finalPrice}`);

const itemId = addDiscount.data?.id;
const items = await request(`/price-levels/${levelId}/items`);
report('TEST 5.4', items.ok && Array.isArray(items.data) && items.data.some((item) => item.id === itemId), `status=${items.status} count=${Array.isArray(items.data) ? items.data.length : 'n/a'}`);

const updated = await request(`/price-levels/${levelId}/items/${itemId}`, {
  method: 'PUT',
  body: JSON.stringify({
    pricingType: 'discount',
    discountPercentage: 15,
  }),
});
report('TEST 5.5', updated.ok && updated.data?.overrideType === 'rule_discount' && Number(updated.data?.finalPrice) < Number(addDiscount.data?.finalPrice), `status=${updated.status} finalPrice=${updated.data?.finalPrice}`);

const secondLevel = await request('/price-levels', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Retail',
    description: 'Section 5 custom price check',
    currency: 'USD',
  }),
});
const secondLevelId = secondLevel.data?.id;

const addCustom = await request(`/price-levels/${levelId}/items`, {
  method: 'POST',
  body: JSON.stringify({
    productId: 2,
    pricingType: 'custom',
    customPrice: 6.4,
  }),
});
report('TEST 5.6', addCustom.ok && Number(addCustom.data?.finalPrice).toFixed(2) === '6.40', `status=${addCustom.status} finalPrice=${addCustom.data?.finalPrice}`);

const approve = await request(`/price-levels/${levelId}/items/${addCustom.data?.productId}/approve`, {
  method: 'POST',
});
report('TEST 5.7', approve.ok, `status=${approve.status} body=${JSON.stringify(approve.data)}`);

const secondList = await request(`/price-levels/${secondLevelId}/items`);
report('TEST 5.8', secondLevel.ok && secondList.ok, `createStatus=${secondLevel.status} listStatus=${secondList.status}`);
