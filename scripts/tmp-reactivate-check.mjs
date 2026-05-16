const base = 'http://localhost:3000/api';

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  return { status: res.status, ok: res.ok, data: await res.json().catch(() => null) };
}

const ghs = 1;
const label = await request('/materials', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Label Printed',
    category: 'Packaging',
    unit: 'Ea',
    bulkQuantity: 1000,
    bulkPrice: 85,
    purchaseCurrencyId: ghs,
    supplierType: 'Local',
    materialType: 'primary',
  }),
});
console.log('create', label.status, label.data?.id);

const off = await request(`/materials/${label.data.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: 'Label Printed',
    category: 'Packaging',
    unit: 'Ea',
    bulkQuantity: 1000,
    bulkPrice: 85,
    purchaseCurrencyId: ghs,
    supplierType: 'Local',
    isActive: false,
  }),
});
console.log('deactivate', off.status, off.data?.isActive);

const list1 = await request('/materials?status=active');
console.log('active contains label', Array.isArray(list1.data) && list1.data.some((m) => m.id === label.data.id));

const on = await request(`/materials/${label.data.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: 'Label Printed',
    category: 'Packaging',
    unit: 'Ea',
    bulkQuantity: 1000,
    bulkPrice: 85,
    purchaseCurrencyId: ghs,
    supplierType: 'Local',
    isActive: true,
  }),
});
console.log('reactivate', on.status, on.data?.isActive);

const list2 = await request('/materials?status=active');
console.log('active after reactivate', Array.isArray(list2.data) && list2.data.some((m) => m.id === label.data.id));
