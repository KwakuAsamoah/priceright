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

const bomRows = await request('/products/1/bom');
const rawLine = bomRows.data.find((row) => row.materialId === 1);
console.log('before', rawLine.quantity);
const update = await request(`/products/1/bom/${rawLine.id}`, { method: 'PUT', body: JSON.stringify({ quantity: 220 }) });
console.log('update', update.status, update.ok, JSON.stringify(update.data));
const after = await request('/products/1');
console.log('after', after.data.productionCost, after.data.optimalPrice);
