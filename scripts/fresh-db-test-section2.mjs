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

const currencies = await request('/currencies');
const ghs = currencies.data.find((c) => c.code === 'GHS');
const usd = currencies.data.find((c) => c.code === 'USD');

const create = async (body) => request('/materials', { method: 'POST', body: JSON.stringify(body) });

const raw = await create({ name: 'Raw Peanuts', category: 'Nuts & Seeds', unit: 'Kg', bulkQuantity: 50, bulkPrice: 320, purchaseCurrencyId: ghs.id, supplierType: 'Local', materialType: 'primary' });
report('TEST 2.1', raw.ok && Number(raw.data.unitPrice).toFixed(2) === '6.40', `status=${raw.status} id=${raw.data?.id} unitPrice=${raw.data?.unitPrice}`);

const milk = await create({ name: 'Milk Powder', category: 'Dairy', unit: 'Kg', bulkQuantity: 25, bulkPrice: 45, purchaseCurrencyId: usd.id, supplierType: 'Foreign', materialType: 'primary' });
report('TEST 2.2', milk.ok && Number(milk.data.unitPrice).toFixed(1) === '27.9', `status=${milk.status} id=${milk.data?.id} unitPrice=${milk.data?.unitPrice}`);

const jar = await create({ name: 'PET Jar 250g', category: 'Packaging', unit: 'Ea', bulkQuantity: 500, bulkPrice: 650, purchaseCurrencyId: ghs.id, supplierType: 'Local', materialType: 'primary' });
report('TEST 2.3', jar.ok && Number(jar.data.unitPrice).toFixed(2) === '1.30', `status=${jar.status} id=${jar.data?.id} unitPrice=${jar.data?.unitPrice}`);

const label = await create({ name: 'Label Printed', category: 'Packaging', unit: 'Ea', bulkQuantity: 1000, bulkPrice: 85, purchaseCurrencyId: ghs.id, supplierType: 'Local', materialType: 'primary' });
report('TEST 2.4', label.ok && Number(label.data.unitPrice).toFixed(3) === '0.085', `status=${label.status} id=${label.data?.id} unitPrice=${label.data?.unitPrice}`);

const update = await request(`/materials/${raw.data.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Raw Peanuts', category: 'Nuts & Seeds', unit: 'Kg', bulkQuantity: 50, bulkPrice: 350, purchaseCurrencyId: ghs.id, supplierType: 'Local' }) });
report('TEST 2.5', update.ok && Number(update.data.unitPrice).toFixed(2) === '7.00', `status=${update.status} unitPrice=${update.data?.unitPrice}`);

const history = await request(`/materials/${raw.data.id}/price-history`);
report('TEST 2.6', history.ok && Array.isArray(history.data) && history.data.length >= 1, `status=${history.status} records=${Array.isArray(history.data) ? history.data.length : 'n/a'}`);

const materials = await request('/materials?status=active');
report('TEST 2.7', materials.ok && Array.isArray(materials.data) && materials.data.length === 4, `status=${materials.status} count=${Array.isArray(materials.data) ? materials.data.length : 'n/a'}`);

const intermediate = await create({ name: 'Refined Peanut Paste', category: 'Processed Nuts', unit: 'Kg', materialType: 'intermediate' });
report('TEST 2.8', intermediate.ok, `status=${intermediate.status} id=${intermediate.data?.id}`);

const deactivate = await request(`/materials/${label.data.id}`, { method: 'DELETE' });
report('TEST 2.9', deactivate.ok, `status=${deactivate.status}`);

const materialsAfterDelete = await request('/materials?status=active');
const activeHasLabel = Array.isArray(materialsAfterDelete.data) && materialsAfterDelete.data.some((m) => m.id === label.data.id);
report('TEST 2.9 VERIFY', !activeHasLabel, `activeCount=${Array.isArray(materialsAfterDelete.data) ? materialsAfterDelete.data.length : 'n/a'}`);

const reactivate = await request(`/materials/${label.data.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Label Printed', category: 'Packaging', unit: 'Ea', bulkQuantity: 1000, bulkPrice: 85, purchaseCurrencyId: ghs.id, supplierType: 'Local', isActive: true }) });
report('TEST 2.10', reactivate.ok, `status=${reactivate.status}`);
