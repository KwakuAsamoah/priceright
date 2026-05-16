const base = 'http://localhost:3000/api';
async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}
function report(label, ok, detail) { console.log(`${label}: ${ok ? 'PASS' : 'FAIL'} ${detail}`); }

const productsBefore = await request('/products');
if (!productsBefore.ok) throw new Error(`Cannot read products: ${JSON.stringify(productsBefore.data)}`);
if (Array.isArray(productsBefore.data) && productsBefore.data.length !== 0) console.log(`NOTE: fresh DB products count before test was ${productsBefore.data.length}`);

const p1 = await request('/products', { method: 'POST', body: JSON.stringify({ name: 'Peanut Butter 250g', category: 'Spreads', productionMode: 'batch', batchYield: 500, overheadPercentage: 25, profitMargin: 20, otherDirectCosts: 0 }) });
report('TEST 3.1', p1.ok && p1.data?.approvalStatus === 'pending', `status=${p1.status} id=${p1.data?.id} approval=${p1.data?.approvalStatus}`);

const rawPeanutsId = 1;
const milkPowderId = 2;
const jarId = 3;
const labelId = 6;

const bom1 = await request(`/products/${p1.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: rawPeanutsId, quantity: 200 }) });
report('TEST 3.2', bom1.ok, `status=${bom1.status}`);
const bom2 = await request(`/products/${p1.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: milkPowderId, quantity: 8 }) });
report('TEST 3.3', bom2.ok, `status=${bom2.status}`);
const bom3 = await request(`/products/${p1.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: jarId, quantity: 500 }) });
report('TEST 3.4', bom3.ok, `status=${bom3.status}`);

const productRead = await request(`/products/${p1.data.id}`);
const calc = productRead.data || {};
const approx = (a, b, tol = 0.05) => Math.abs(Number(a) - b) <= tol;
report('TEST 3.5', productRead.ok && approx(calc.productionCost, 5.683, 0.05) && approx(calc.optimalPrice, 6.82, 0.1), `status=${productRead.status} productionCost=${calc.productionCost} optimalPrice=${calc.optimalPrice}`);

const bomRows = await request(`/products/${p1.data.id}/bom`);
const rawLine = Array.isArray(bomRows.data) ? bomRows.data.find((row) => row.materialId === rawPeanutsId) : null;
const bomUpdate = rawLine ? await request(`/products/${p1.data.id}/bom/${rawLine.id}`, { method: 'PUT', body: JSON.stringify({ quantity: 220 }) }) : { ok: false, status: 0, data: null };
report('TEST 3.6', bomUpdate.ok, `status=${bomUpdate.status}`);
const productAfterUpdate = await request(`/products/${p1.data.id}`);
report('TEST 3.6 VERIFY', productAfterUpdate.ok && Number(productAfterUpdate.data.productionCost) > Number(calc.productionCost), `productionCost=${productAfterUpdate.data.productionCost}`);

const milkLine = Array.isArray(bomRows.data) ? bomRows.data.find((row) => row.materialId === milkPowderId) : null;
const bomDelete = milkLine ? await request(`/products/${p1.data.id}/bom/${milkLine.id}`, { method: 'DELETE' }) : { ok: false, status: 0 };
report('TEST 3.7', bomDelete.ok, `status=${bomDelete.status}`);
const productAfterDelete = await request(`/products/${p1.data.id}`);
report('TEST 3.7 VERIFY', productAfterDelete.ok && Number(productAfterDelete.data.productionCost) < Number(productAfterUpdate.data.productionCost), `productionCost=${productAfterDelete.data.productionCost}`);

const bomReadd = await request(`/products/${p1.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: milkPowderId, quantity: 8 }) });
report('TEST 3.8', bomReadd.ok, `status=${bomReadd.status}`);

const p2 = await request('/products', { method: 'POST', body: JSON.stringify({ name: 'Blended Spice Mix 100g', category: 'Seasonings', productionMode: 'single', batchYield: 1, overheadPercentage: 25, profitMargin: 30, otherDirectCosts: 0 }) });
report('TEST 3.9', p2.ok && p2.data?.approvalStatus === 'pending', `status=${p2.status} id=${p2.data?.id} approval=${p2.data?.approvalStatus}`);

const p2bom1 = await request(`/products/${p2.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: rawPeanutsId, quantity: 0.1 }) });
report('TEST 3.10a', p2bom1.ok, `status=${p2bom1.status}`);
const p2bom2 = await request(`/products/${p2.data.id}/bom`, { method: 'POST', body: JSON.stringify({ materialId: labelId, quantity: 1 }) });
report('TEST 3.10b', p2bom2.ok, `status=${p2bom2.status}`);

const allProducts = await request('/products');
report('TEST 3.11', allProducts.ok && Array.isArray(allProducts.data) && allProducts.data.length === 2, `status=${allProducts.status} count=${Array.isArray(allProducts.data) ? allProducts.data.length : 'n/a'}`);
