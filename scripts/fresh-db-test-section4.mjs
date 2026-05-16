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

const approve1 = await request('/products/1/approve', { method: 'POST', body: JSON.stringify({ approvedPrice: 6.82, approvalType: 'optimal', expiryDays: 30 }) });
report('TEST 4.1', approve1.ok && approve1.data?.product?.approvalStatus === 'approved' && Number(approve1.data?.product?.approvedPrice).toFixed(2) === '6.82', `status=${approve1.status} approved=${approve1.data?.product?.approvalStatus} price=${approve1.data?.product?.approvedPrice} expires=${approve1.data?.product?.approvedPriceExpiresAt}`);

const activity = await request('/activity');
const hasApprovalLog = Array.isArray(activity.data?.entries) ? activity.data.entries.some((entry) => entry.entityType === 'product' && entry.action.includes('approved') && entry.entityId === 1) : false;
report('TEST 4.2', activity.ok && hasApprovalLog, `status=${activity.status} entries=${Array.isArray(activity.data?.entries) ? activity.data.entries.length : 'n/a'}`);

const approve2 = await request('/products/2/approve', { method: 'POST', body: JSON.stringify({ approvedPrice: 5.5, approvalType: 'custom', expiryDays: 60 }) });
report('TEST 4.3', approve2.ok && approve2.data?.product?.approvalStatus === 'approved', `status=${approve2.status} approved=${approve2.data?.product?.approvalStatus}`);

const rawUpdate = await request('/materials/1', { method: 'PUT', body: JSON.stringify({ name: 'Raw Peanuts', category: 'Nuts & Seeds', unit: 'Kg', bulkQuantity: 50, bulkPrice: 400, purchaseCurrencyId: 1, supplierType: 'Local' }) });
report('TEST 4.4A', rawUpdate.ok && Number(rawUpdate.data?.unitPrice).toFixed(2) === '8.00', `status=${rawUpdate.status} unitPrice=${rawUpdate.data?.unitPrice}`);

const productsAfterMaterialChange = await request('/products');
const peanutButter = Array.isArray(productsAfterMaterialChange.data) ? productsAfterMaterialChange.data.find((p) => p.id === 1) : null;
report('TEST 4.4B', peanutButter && peanutButter.approvalStatus === 'needs_review', `approval=${peanutButter?.approvalStatus} needsReview=${peanutButter?.needsReviewReason}`);

const reapprove = await request('/products/1/approve', { method: 'POST', body: JSON.stringify({ approvedPrice: 7.2, approvalType: 'optimal', expiryDays: 30 }) });
report('TEST 4.5', reapprove.ok && reapprove.data?.product?.approvalStatus === 'approved', `status=${reapprove.status} approved=${reapprove.data?.product?.approvalStatus} expires=${reapprove.data?.product?.approvedPriceExpiresAt}`);

const keepCurrent = await request('/products/1/approve', { method: 'POST', body: JSON.stringify({ approvedPrice: 7.2, approvalType: 'keep_current' }) });
report('TEST 4.6', keepCurrent.ok && keepCurrent.data?.product?.approvalStatus === 'approved', `status=${keepCurrent.status} approved=${keepCurrent.data?.product?.approvalStatus}`);

const bulk = await request('/products/bulk-approve', { method: 'POST', body: JSON.stringify({ productIds: [1, 2], priceMethod: 'selling', expiryDays: 30 }) });
report('TEST 4.7', bulk.ok, `status=${bulk.status} body=${JSON.stringify(bulk.data)}`);
