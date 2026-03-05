import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { currencies, exchangeRates, settings, materials, products, billOfMaterials, materialPriceHistory, priceLevels, customers, specialPricing, priceLists, priceListItems } from './schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
const app = express();
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
const AUTO_BACKUP_ENABLED = (process.env.AUTO_BACKUP_ENABLED ?? 'true').toLowerCase() === 'true';
const AUTO_BACKUP_INTERVAL_MINUTES = Math.max(1, Number.parseInt(process.env.AUTO_BACKUP_INTERVAL_MINUTES ?? '60', 10) || 60);
const AUTO_BACKUP_RUN_ON_START = (process.env.AUTO_BACKUP_RUN_ON_START ?? 'false').toLowerCase() === 'true';
const AUTO_BACKUP_RETENTION_COUNT = Math.max(1, Number.parseInt(process.env.AUTO_BACKUP_RETENTION_COUNT ?? '30', 10) || 30);
const AUTO_BACKUP_INTERVAL_MS = AUTO_BACKUP_INTERVAL_MINUTES * 60 * 1000;

let lastBackupTime: Date | null = null;
let backupIntervalHandle: NodeJS.Timeout | null = null;

type RecalculationSummary = {
  materialsUpdated: number;
  productsReviewed: number;
  productsNowNeedsReview: number;
  message: string;
};

function cleanupOldBackups(targetDir: string, retentionCount: number) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const backupFiles = fs.readdirSync(targetDir)
    .filter((fileName) => fileName.startsWith('backup-') && fileName.endsWith('.db'))
    .map((fileName) => {
      const fullPath = path.join(targetDir, fileName);
      const stats = fs.statSync(fullPath);
      return {
        fileName,
        fullPath,
        modifiedTimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedTimeMs - a.modifiedTimeMs);

  const filesToDelete = backupFiles.slice(retentionCount);
  for (const file of filesToDelete) {
    try {
      fs.unlinkSync(file.fullPath);
    } catch (error) {
      console.error(`⚠️ Failed to delete old backup ${file.fileName}:`, error);
    }
  }
}

function createBackup(): boolean {
  const databasePath = path.resolve(process.cwd(), 'priceright.db');
  const backupsDir = path.resolve(process.cwd(), 'backups');
  const googleDriveBackupDir = process.env.GOOGLE_DRIVE_BACKUP_DIR?.trim();

  if (!fs.existsSync(databasePath)) {
    console.error(`❌ Database file not found at ${databasePath}`);
    return false;
  }

  fs.mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-${timestamp}.db`;
  const localBackupPath = path.join(backupsDir, backupFileName);

  fs.copyFileSync(databasePath, localBackupPath);
  cleanupOldBackups(backupsDir, AUTO_BACKUP_RETENTION_COUNT);

  if (googleDriveBackupDir) {
    const resolvedGoogleDriveBackupDir = path.resolve(googleDriveBackupDir);
    fs.mkdirSync(resolvedGoogleDriveBackupDir, { recursive: true });
    const googleDriveBackupPath = path.join(resolvedGoogleDriveBackupDir, backupFileName);
    fs.copyFileSync(localBackupPath, googleDriveBackupPath);
    cleanupOldBackups(resolvedGoogleDriveBackupDir, AUTO_BACKUP_RETENTION_COUNT);
    console.log(`✅ Backup created locally and copied to Google Drive: ${backupFileName}`);
  } else {
    console.log(`✅ Backup created locally: ${backupFileName}`);
  }

  lastBackupTime = new Date();
  return true;
}

function startAutoBackupScheduler() {
  if (!AUTO_BACKUP_ENABLED) {
    console.log('ℹ️ Automatic backups are disabled (AUTO_BACKUP_ENABLED=false)');
    return;
  }

  if (AUTO_BACKUP_RUN_ON_START) {
    try {
      const created = createBackup();
      if (!created) {
        console.error('❌ Initial startup backup failed');
      }
    } catch (error) {
      console.error('❌ Error creating startup backup:', error);
    }
  }

  backupIntervalHandle = setInterval(() => {
    try {
      const created = createBackup();
      if (!created) {
        console.error('❌ Scheduled backup failed');
      }
    } catch (error) {
      console.error('❌ Error during scheduled backup:', error);
    }
  }, AUTO_BACKUP_INTERVAL_MS);

  console.log(`⏱️ Automatic backups are enabled every ${AUTO_BACKUP_INTERVAL_MINUTES} minute(s)`);
  console.log(`🧹 Backup retention is set to keep latest ${AUTO_BACKUP_RETENTION_COUNT} file(s)`);
}

async function upsertSpecialPricingPriceListItem(input: {
  customerId: number;
  customerName: string;
  priceLevelId: number;
  productId: number;
  basePrice: number;
  specialPrice: number;
}) {
  const { customerId, customerName, priceLevelId, productId, basePrice, specialPrice } = input;

  const existingList = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.customerId, customerId), eq(priceLists.createdBy, 'system-special-pricing')));

  let specialListId: number;
  if (existingList.length > 0) {
    specialListId = existingList[0].id;
    await db.update(priceLists)
      .set({
        name: `Special Pricing - ${customerName}`,
        priceLevelId,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(priceLists.id, specialListId));
  } else {
    const created = await db.insert(priceLists).values({
      name: `Special Pricing - ${customerName}`,
      customerId,
      priceLevelId,
      validFrom: new Date(),
      validUntil: null,
      status: 'active',
      createdBy: 'system-special-pricing',
    }).returning();
    specialListId = created[0].id;
  }

  const discountPercentage = basePrice > 0
    ? Math.round(((basePrice - specialPrice) / basePrice) * 10000) / 100
    : 0;

  const existingItem = await db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.priceListId, specialListId), eq(priceListItems.productId, productId)));

  if (existingItem.length > 0) {
    await db.update(priceListItems)
      .set({
        basePrice,
        discountPercentage,
        finalPrice: specialPrice,
        notes: 'Special pricing override',
      })
      .where(eq(priceListItems.id, existingItem[0].id));
  } else {
    await db.insert(priceListItems).values({
      priceListId: specialListId,
      productId,
      basePrice,
      discountPercentage,
      finalPrice: specialPrice,
      notes: 'Special pricing override',
    });
  }
}

async function removeSpecialPricingPriceListItem(customerId: number, productId: number) {
  const specialList = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.customerId, customerId), eq(priceLists.createdBy, 'system-special-pricing')));

  if (specialList.length === 0) {
    return;
  }

  const specialListId = specialList[0].id;
  await db
    .delete(priceListItems)
    .where(and(eq(priceListItems.priceListId, specialListId), eq(priceListItems.productId, productId)));

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(priceListItems)
    .where(eq(priceListItems.priceListId, specialListId));

  const remainingCount = Number(remaining[0]?.count || 0);
  if (remainingCount === 0) {
    await db.delete(priceLists).where(eq(priceLists.id, specialListId));
  }
}

const MIN_MARGIN_PERCENTAGE = 15;

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function calculateProductionCostForProduct(selectedProduct: typeof products.$inferSelect, productId: number): Promise<number> {
  const productionCostResponse = await db
    .select({
      quantity: billOfMaterials.quantity,
      unitPrice: materials.unitPrice,
    })
    .from(billOfMaterials)
    .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
    .where(eq(billOfMaterials.productId, productId));

  let totalMaterialCost = 0;
  for (const item of productionCostResponse) {
    totalMaterialCost += Number(item.quantity || 0) * Number(item.unitPrice || 0);
  }

  const otherCosts = Number(selectedProduct.otherDirectCosts || 0);
  const overheadCost = totalMaterialCost * (Number(selectedProduct.overheadPercentage || 0) / 100);
  const totalCost = totalMaterialCost + overheadCost + otherCosts;

  if (selectedProduct.productionMode === 'batch') {
    return totalCost / Math.max(1, Number(selectedProduct.batchYield || 1));
  }

  return totalCost;
}

function parseOverrideType(value: unknown): 'custom' | 'discount' | 'markup' {
  if (value === 'discount' || value === 'markup' || value === 'custom') {
    return value;
  }
  return 'custom';
}

function toOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

async function upsertSpecialPricingEntry(params: {
  customerId: number;
  productId: number;
  customPrice: number;
  overrideType: 'custom' | 'discount' | 'markup';
  discountPercentage: number | null;
  markupPercentage: number | null;
  justification: string | null;
  createdBy: string;
}): Promise<typeof specialPricing.$inferSelect> {
  const {
    customerId,
    productId,
    customPrice,
    overrideType,
    discountPercentage,
    markupPercentage,
    justification,
    createdBy,
  } = params;

  const customerRows = await db.select().from(customers).where(eq(customers.id, customerId));
  if (customerRows.length === 0) {
    throw new Error('Customer not found');
  }
  const customerRow = customerRows[0];
  if (!customerRow.allowSpecialPricing) {
    throw new Error('Customer is not allowed to use special pricing');
  }

  const productRows = await db.select().from(products).where(eq(products.id, productId));
  if (productRows.length === 0) {
    throw new Error('Product not found');
  }
  const productRow = productRows[0];

  if (productRow.approvalStatus !== 'approved' || productRow.approvedPrice == null) {
    throw new Error('Only approved products can have custom prices');
  }

  const productionCost = await calculateProductionCostForProduct(productRow, productId);
  const oldMarginPercentage = Number(productRow.approvedPrice) > 0
    ? ((Number(productRow.approvedPrice) - productionCost) / Number(productRow.approvedPrice)) * 100
    : -100;
  const marginImpactPercentage = customPrice > 0
    ? ((customPrice - productionCost) / customPrice) * 100
    : -100;

  const existing = await db
    .select()
    .from(specialPricing)
    .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

  const persistedPrice = roundToTwo(customPrice);
  const persistedProductionCost = roundToTwo(productionCost);
  const persistedMarginImpact = roundToTwo(marginImpactPercentage);
  const persistedOldMargin = roundToTwo(oldMarginPercentage);

  if (existing.length > 0) {
    await db.update(specialPricing)
      .set({
        customPrice: persistedPrice,
        productionCost: persistedProductionCost,
        marginImpactPercentage: persistedMarginImpact,
        oldMarginPercentage: persistedOldMargin,
        overrideType,
        discountPercentage,
        markupPercentage,
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        justification,
        createdBy,
      })
      .where(eq(specialPricing.id, existing[0].id));
  } else {
    await db.insert(specialPricing).values({
      customerId,
      productId,
      customPrice: persistedPrice,
      productionCost: persistedProductionCost,
      marginImpactPercentage: persistedMarginImpact,
      oldMarginPercentage: persistedOldMargin,
      overrideType,
      discountPercentage,
      markupPercentage,
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
      justification,
      createdBy,
    });
  }

  await upsertSpecialPricingPriceListItem({
    customerId,
    customerName: customerRow.name,
    priceLevelId: customerRow.priceLevelId,
    productId,
    basePrice: Number(productRow.approvedPrice || 0),
    specialPrice: persistedPrice,
  });

  const saved = await db
    .select()
    .from(specialPricing)
    .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

  return saved[0];
}

async function handleSpecialPricingUpsert(input: {
  customerId: number;
  productId: number;
  payload: Record<string, unknown>;
}): Promise<{ status: number; payload: Record<string, unknown> }> {
  const { customerId, productId, payload } = input;

  const productRows = await db.select().from(products).where(eq(products.id, productId));
  if (productRows.length === 0) {
    return { status: 404, payload: { error: 'Product not found' } };
  }

  const selectedProduct = productRows[0];
  if (selectedProduct.approvalStatus !== 'approved' || selectedProduct.approvedPrice == null) {
    return { status: 400, payload: { error: 'Only approved products can have custom prices' } };
  }

  const overrideType = parseOverrideType(payload.overrideType);
  const approvedPrice = Number(selectedProduct.approvedPrice || 0);
  const inputCustomPrice = toOptionalNumber(payload.customPrice);
  const discountPercentage = toOptionalNumber(payload.discountPercentage);
  const markupPercentage = toOptionalNumber(payload.markupPercentage);
  const justification = typeof payload.justification === 'string' && payload.justification.trim().length > 0
    ? payload.justification.trim()
    : null;
  const createdBy = typeof payload.createdBy === 'string' && payload.createdBy.trim().length > 0
    ? payload.createdBy.trim()
    : 'user';

  let resolvedCustomPrice: number | null = null;
  let resolvedDiscount: number | null = null;
  let resolvedMarkup: number | null = null;

  if (overrideType === 'discount') {
    if (discountPercentage == null || Number.isNaN(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
      return { status: 400, payload: { error: 'discountPercentage must be a number between 0 and 100' } };
    }
    resolvedDiscount = discountPercentage;
    resolvedCustomPrice = approvedPrice * (1 - (discountPercentage / 100));
  } else if (overrideType === 'markup') {
    if (markupPercentage == null || Number.isNaN(markupPercentage) || markupPercentage < 0 || markupPercentage > 1000) {
      return { status: 400, payload: { error: 'markupPercentage must be a number between 0 and 1000' } };
    }
    resolvedMarkup = markupPercentage;
    resolvedCustomPrice = approvedPrice * (1 + (markupPercentage / 100));
  } else {
    if (inputCustomPrice == null || Number.isNaN(inputCustomPrice) || inputCustomPrice <= 0) {
      return { status: 400, payload: { error: 'customPrice must be greater than 0 for custom override' } };
    }
    resolvedCustomPrice = inputCustomPrice;
  }

  resolvedCustomPrice = roundToTwo(Math.max(0, resolvedCustomPrice));
  if (resolvedCustomPrice <= 0) {
    return {
      status: 400,
      payload: {
        error: 'Proposed special price must be greater than 0',
        code: 'INVALID_SPECIAL_PRICE',
      },
    };
  }

  const productionCost = await calculateProductionCostForProduct(selectedProduct, productId);
  const resultingMarginPercentage = resolvedCustomPrice > 0
    ? ((resolvedCustomPrice - productionCost) / resolvedCustomPrice) * 100
    : -100;
  const minimumSafePrice = productionCost;
  const minimumPriceForMarginThreshold = productionCost / (1 - (MIN_MARGIN_PERCENTAGE / 100));

  if (resolvedCustomPrice < minimumSafePrice) {
    return {
      status: 400,
      payload: {
        error: 'Proposed special price is below production cost',
        code: 'PRICE_BELOW_COST',
        details: {
          productionCost: roundToTwo(productionCost),
          proposedPrice: roundToTwo(resolvedCustomPrice),
          resultingMarginPercentage: roundToTwo(resultingMarginPercentage),
          minimumSafePrice: roundToTwo(minimumSafePrice),
        },
      },
    };
  }

  if (resultingMarginPercentage < MIN_MARGIN_PERCENTAGE && !justification) {
    return {
      status: 400,
      payload: {
        error: `Justification is required when resulting margin is below ${MIN_MARGIN_PERCENTAGE}%`,
        code: 'LOW_MARGIN_JUSTIFICATION_REQUIRED',
        details: {
          productionCost: roundToTwo(productionCost),
          proposedPrice: roundToTwo(resolvedCustomPrice),
          resultingMarginPercentage: roundToTwo(resultingMarginPercentage),
          minimumSafePrice: roundToTwo(minimumSafePrice),
          minimumPriceForThresholdMargin: roundToTwo(minimumPriceForMarginThreshold),
          thresholdMarginPercentage: MIN_MARGIN_PERCENTAGE,
        },
      },
    };
  }

  const saved = await upsertSpecialPricingEntry({
    customerId,
    productId,
    customPrice: resolvedCustomPrice,
    overrideType,
    discountPercentage: resolvedDiscount,
    markupPercentage: resolvedMarkup,
    justification,
    createdBy,
  });

  return {
    status: 201,
    payload: {
      ...saved,
      productionCost: roundToTwo(Number(saved.productionCost ?? productionCost)),
      marginImpactPercentage: roundToTwo(Number(saved.marginImpactPercentage ?? resultingMarginPercentage)),
      oldMarginPercentage: roundToTwo(Number(saved.oldMarginPercentage ?? 0)),
    },
  };
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!error) {
    return next();
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Import payload is too large. Please split the file into smaller batches.' });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  return next(error);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ============================================
// BACKUP ENDPOINTS
// ============================================

app.post('/api/backup', (req, res) => {
  try {
    const success = createBackup();
    if (success) {
      res.json({ success: true, message: 'Backup created successfully', lastBackupTime });
    } else {
      res.status(500).json({ error: 'Failed to create backup' });
    }
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

app.get('/api/backup/status', (req, res) => {
  try {
    const backupsDir = path.resolve(process.cwd(), 'backups');
    const backupCount = fs.existsSync(backupsDir)
      ? fs.readdirSync(backupsDir).filter((fileName) => fileName.startsWith('backup-') && fileName.endsWith('.db')).length
      : 0;

    const googleDriveBackupDir = process.env.GOOGLE_DRIVE_BACKUP_DIR?.trim() || null;

    res.json({ 
      lastBackupTime,
      backupCount,
      googleDriveBackupDir,
      googleDriveEnabled: Boolean(googleDriveBackupDir),
      autoBackupEnabled: AUTO_BACKUP_ENABLED,
      autoBackupIntervalMinutes: AUTO_BACKUP_INTERVAL_MINUTES,
      autoBackupRunOnStart: AUTO_BACKUP_RUN_ON_START,
      autoBackupRetentionCount: AUTO_BACKUP_RETENTION_COUNT,
      autoBackupSchedulerActive: Boolean(backupIntervalHandle),
    });
  } catch (error) {
    console.error('Error getting backup status:', error);
    res.status(500).json({ error: 'Failed to get backup status' });
  }
});

// ============================================
// SETTINGS ENDPOINTS
// ============================================

app.get('/api/settings', async (req, res) => {
  try {
    const allSettings = await db.select().from(settings);
    res.json(allSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const setting = await db.select().from(settings).where(eq(settings.settingKey, req.params.key));
    if (setting.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json(setting[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { settingKey, settingValue } = req.body;
    
    const existing = await db.select().from(settings).where(eq(settings.settingKey, settingKey));
    
    if (existing.length > 0) {
      await db.update(settings)
        .set({ settingValue, updatedAt: new Date() })
        .where(eq(settings.settingKey, settingKey));
    } else {
      await db.insert(settings).values({ settingKey, settingValue });
    }
    
    const updated = await db.select().from(settings).where(eq(settings.settingKey, settingKey));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// ============================================
// CURRENCIES ENDPOINTS
// ============================================

app.get('/api/currencies', async (req, res) => {
  try {
    const allCurrencies = await db.select().from(currencies);
    res.json(allCurrencies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

app.post('/api/currencies', async (req, res) => {
  try {
    const { code, name, symbol } = req.body;
    const result = await db.insert(currencies).values({ code, name, symbol }).returning();
    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create currency' });
  }
});

app.put('/api/currencies/:id', async (req, res) => {
  try {
    const { code, name, symbol } = req.body;
    await db.update(currencies)
      .set({ code, name, symbol })
      .where(eq(currencies.id, parseInt(req.params.id)));
    
    const updated = await db.select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update currency' });
  }
});

app.put('/api/currencies/:id/toggle', async (req, res) => {
  try {
    const currency = await db.select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
    
    if (currency.length === 0) {
      return res.status(404).json({ error: 'Currency not found' });
    }
    
    await db.update(currencies)
      .set({ isActive: !currency[0].isActive })
      .where(eq(currencies.id, parseInt(req.params.id)));
    
    const updated = await db.select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle currency' });
  }
});

app.delete('/api/currencies/:id', async (req, res) => {
  try {
    await db.delete(currencies).where(eq(currencies.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete currency' });
  }
});

// ============================================
// EXCHANGE RATES ENDPOINTS
// ============================================

app.get('/api/exchange-rates', async (req, res) => {
  try {
    const rates = await db.select().from(exchangeRates);
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
});

app.post('/api/exchange-rates', async (req, res) => {
  try {
    const { currencyId, rateToBase, source } = req.body;
    const result = await db.insert(exchangeRates).values({ 
      currencyId, 
      rateToBase, 
      source: source || 'manual' 
    }).returning();
    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create exchange rate' });
  }
});

app.put('/api/exchange-rates/:currencyId', async (req, res) => {
  try {
    const { rateToBase } = req.body;
    const currencyId = parseInt(req.params.currencyId);
    
    const existing = await db.select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
    
    if (existing.length > 0) {
      await db.update(exchangeRates)
        .set({ rateToBase, effectiveDate: new Date() })
        .where(eq(exchangeRates.currencyId, currencyId));
    } else {
      await db.insert(exchangeRates).values({ currencyId, rateToBase, source: 'manual' });
    }
    
    const updated = await db.select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));

    try {
      const recalculation = await recalculateMaterialsForCurrency(currencyId);
      res.json({
        success: true,
        rate: updated[0],
        recalculation: {
          materialsUpdated: recalculation.materialsUpdated,
          productsReviewed: recalculation.productsReviewed,
          productsNowNeedsReview: recalculation.productsNowNeedsReview,
        },
      });
    } catch (recalculationError) {
      console.error('Error recalculating material prices:', recalculationError);
      res.json({
        success: true,
        rate: updated[0],
        recalculation: {
          materialsUpdated: 0,
          productsReviewed: 0,
          productsNowNeedsReview: 0,
        },
        recalculationFailed: true,
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update exchange rate' });
  }
});

// Recalculate material prices when exchange rate changes
app.post('/api/exchange-rates/:id/recalculate-materials', async (req, res) => {
  try {
    const rateId = parseInt(req.params.id);
    const recalculation = await recalculateMaterialsForCurrency(rateId);

    res.json({ 
      success: true, 
      updatedCount: recalculation.materialsUpdated,
      message: recalculation.message,
    });
  } catch (error) {
    console.error('Error recalculating material prices:', error);
    if (error instanceof Error && (error.message === 'Exchange rate not found' || error.message === 'Currency not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to recalculate material prices' });
  }
});

// ============================================
// MATERIALS ENDPOINTS
// ============================================

app.get('/api/materials', async (req, res) => {
  try {
    // Get base currency
    const baseCurrencySetting = await db.select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
    let baseCurrencySymbol = '';
    
    if (baseCurrencySetting.length > 0) {
      const baseCurrency = await db.select().from(currencies).where(eq(currencies.code, baseCurrencySetting[0].settingValue));
      if (baseCurrency.length > 0) {
        baseCurrencySymbol = baseCurrency[0].symbol;
      }
    }

    const allMaterials = await db
      .select({
        id: materials.id,
        name: materials.name,
        sku: materials.sku,
        description: materials.description,
        category: materials.category,
        unit: materials.unit,
        bulkQuantity: materials.bulkQuantity,
        bulkPrice: materials.bulkPrice,
        purchaseCurrencyId: materials.purchaseCurrencyId,
        purchaseCurrencyCode: currencies.code,
        purchaseCurrencySymbol: currencies.symbol,
        priceInPurchaseCurrency: materials.priceInPurchaseCurrency,
        priceInBaseCurrency: materials.priceInBaseCurrency,
        unitPrice: materials.unitPrice,
        supplier: materials.supplier,
        isActive: materials.isActive,
        createdAt: materials.createdAt,
        updatedAt: materials.updatedAt,
      })
      .from(materials)
      .leftJoin(currencies, eq(materials.purchaseCurrencyId, currencies.id));
    
    // Add base currency symbol to each material
    const materialsWithBaseCurrency = allMaterials.map(m => ({
      ...m,
      baseCurrencySymbol,
    }));
    
    res.json(materialsWithBaseCurrency);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

app.post('/api/materials', async (req, res) => {
  try {
    const { name, sku, description, category, unit, bulkQuantity, bulkPrice, purchaseCurrencyId, supplier } = req.body;
    
    // Get base currency
    const baseCurrencySetting = await db.select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
    if (baseCurrencySetting.length === 0) {
      return res.status(400).json({ error: 'Base currency not set' });
    }
    
    const baseCurrency = await db.select().from(currencies).where(eq(currencies.code, baseCurrencySetting[0].settingValue));
    
    // Get exchange rate
    let exchangeRate = 1;
    if (purchaseCurrencyId !== baseCurrency[0].id) {
      const rate = await db.select().from(exchangeRates).where(eq(exchangeRates.currencyId, purchaseCurrencyId));
      if (rate.length > 0) {
        exchangeRate = parseFloat(rate[0].rateToBase.toString());
      }
    }
    
    // Calculate prices
    const priceInPurchaseCurrency = bulkPrice;
    const priceInBaseCurrency = bulkPrice * exchangeRate;
    const unitPrice = priceInBaseCurrency / bulkQuantity;
    
    // Insert material
    const result = await db.insert(materials).values({
      name,
      sku: sku || null,
      description: description || null,
      category,
      unit,
      bulkQuantity,
      bulkPrice,
      purchaseCurrencyId,
      priceInPurchaseCurrency,
      priceInBaseCurrency,
      unitPrice,
      supplier,
    }).returning();
    
    // Save price history
    await db.insert(materialPriceHistory).values({
      materialId: result[0].id,
      purchaseCurrencyId,
      priceInPurchaseCurrency,
      priceInBaseCurrency,
    });
    
    res.json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const { name, sku, description, category, unit, bulkQuantity, bulkPrice, purchaseCurrencyId, supplier } = req.body;
    const materialId = parseInt(req.params.id);
    
    // Get base currency
    const baseCurrencySetting = await db.select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
    const baseCurrency = await db.select().from(currencies).where(eq(currencies.code, baseCurrencySetting[0].settingValue));
    
    // Get exchange rate
    let exchangeRate = 1;
    if (purchaseCurrencyId !== baseCurrency[0].id) {
      const rate = await db.select().from(exchangeRates).where(eq(exchangeRates.currencyId, purchaseCurrencyId));
      if (rate.length > 0) {
        exchangeRate = parseFloat(rate[0].rateToBase.toString());
      }
    }
    
    // Calculate prices
    const priceInPurchaseCurrency = bulkPrice;
    const priceInBaseCurrency = bulkPrice * exchangeRate;
    const unitPrice = priceInBaseCurrency / bulkQuantity;
    
    // Update material
    await db.update(materials).set({
      name,
      sku: sku || null,
      description: description || null,
      category,
      unit,
      bulkQuantity,
      bulkPrice,
      purchaseCurrencyId,
      priceInPurchaseCurrency,
      priceInBaseCurrency,
      unitPrice,
      supplier,
      updatedAt: new Date(),
    }).where(eq(materials.id, materialId));
    
    // Save price history
    await db.insert(materialPriceHistory).values({
      materialId,
      purchaseCurrencyId,
      priceInPurchaseCurrency,
      priceInBaseCurrency,
    });

    await setNeedsReviewForMaterial(materialId);
    
    const updated = await db.select().from(materials).where(eq(materials.id, materialId));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update material' });
  }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    const materialId = parseInt(req.params.id);
    if (!Number.isInteger(materialId)) {
      return res.status(400).json({ error: 'Invalid material id' });
    }

    const materialRows = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(eq(materials.id, materialId));

    if (materialRows.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const usageRows = await db
      .select({
        productId: products.id,
        productName: products.name,
      })
      .from(billOfMaterials)
      .innerJoin(products, eq(billOfMaterials.productId, products.id))
      .where(eq(billOfMaterials.materialId, materialId));

    if (usageRows.length > 0) {
      const uniqueProductNames = Array.from(
        new Set(usageRows.map((row) => String(row.productName || '').trim()).filter(Boolean)),
      );
      return res.status(400).json({
        error: `Cannot delete material - used in ${uniqueProductNames.length} products: ${uniqueProductNames.join(', ')}`,
        code: 'MATERIAL_IN_USE',
        details: {
          materialId,
          materialName: materialRows[0].name,
          productCount: uniqueProductNames.length,
          products: uniqueProductNames,
        },
      });
    }

    await db.delete(materials).where(eq(materials.id, materialId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});
// Get price history for a material
app.get('/api/materials/:id/price-history', async (req, res) => {
  try {
    const materialId = parseInt(req.params.id);
    
    const history = await db
      .select({
        id: materialPriceHistory.id,
        materialId: materialPriceHistory.materialId,
        purchaseCurrencyId: materialPriceHistory.purchaseCurrencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        priceInPurchaseCurrency: materialPriceHistory.priceInPurchaseCurrency,
        priceInBaseCurrency: materialPriceHistory.priceInBaseCurrency,
        changedAt: materialPriceHistory.changedAt,
      })
      .from(materialPriceHistory)
      .leftJoin(currencies, eq(materialPriceHistory.purchaseCurrencyId, currencies.id))
      .where(eq(materialPriceHistory.materialId, materialId))
      .orderBy(sql`${materialPriceHistory.changedAt} DESC`);
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

// Check material usage in BOMs
app.post('/api/materials/check-usage', async (req, res) => {
  try {
    const { materialIds } = req.body;
    
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return res.status(400).json({ error: 'materialIds must be a non-empty array' });
    }
    
    const canDelete: number[] = [];
    const inUse: Array<{ materialId: number; materialName: string; productCount: number; products: string[] }> = [];
    
    for (const materialId of materialIds) {
      // Find all products that use this material in their BOM
      const usageData = await db
        .select({
          materialId: billOfMaterials.materialId,
          materialName: materials.name,
          productId: products.id,
          productName: products.name,
        })
        .from(billOfMaterials)
        .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
        .leftJoin(products, eq(billOfMaterials.productId, products.id))
        .where(eq(billOfMaterials.materialId, materialId));
      
      if (usageData.length === 0) {
        canDelete.push(materialId);
      } else {
        const productSet = new Set<string>();
        const productNames: any[] = [];
        
        for (const usage of usageData) {
          const key = `${usage.productId}-${usage.productName}`;
          if (!productSet.has(key)) {
            productSet.add(key);
            productNames.push(usage.productName);
          }
        }
        
        inUse.push({
          materialId,
          materialName: usageData[0]?.materialName || 'Unknown',
          productCount: productSet.size,
          products: productNames,
        });
      }
    }
    
    res.json({ canDelete, inUse });
  } catch (error) {
    console.error('Error checking material usage:', error);
    res.status(500).json({ error: 'Failed to check material usage' });
  }
});

app.post('/api/materials-requirement', async (req, res) => {
  try {
    const payload = req.body;
    const inputItems = Array.isArray(payload) ? payload : payload?.items;

    if (!Array.isArray(inputItems) || inputItems.length === 0) {
      return res.status(400).json({ error: 'Request body must include a non-empty items array' });
    }

    const normalizedItems = inputItems.map((item: any) => ({
      productId: Number(item?.productId),
      quantity: Number(item?.quantity),
    }));

    if (normalizedItems.some((item: { productId: number; quantity: number }) => !Number.isInteger(item.productId) || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ error: 'Each item must contain integer productId and quantity > 0' });
    }

    const uniqueProductIds = Array.from(new Set(normalizedItems.map((item: { productId: number }) => item.productId)));

    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        productionMode: products.productionMode,
        batchYield: products.batchYield,
      })
      .from(products)
      .where(inArray(products.id, uniqueProductIds));

    if (productRows.length !== uniqueProductIds.length) {
      const foundIds = new Set(productRows.map((row) => row.id));
      const missingProductIds = uniqueProductIds.filter((id) => !foundIds.has(id));
      return res.status(404).json({
        error: `Some products were not found: ${missingProductIds.join(', ')}`,
        details: { missingProductIds },
      });
    }

    const bomRows = await db
      .select({
        productId: billOfMaterials.productId,
        materialId: materials.id,
        materialName: materials.name,
        unit: materials.unit,
        unitPrice: materials.unitPrice,
        bomQuantity: billOfMaterials.quantity,
      })
      .from(billOfMaterials)
      .innerJoin(materials, eq(billOfMaterials.materialId, materials.id))
      .where(inArray(billOfMaterials.productId, uniqueProductIds));

    const productMap = new Map(productRows.map((row) => [row.id, row]));
    const bomByProductId = new Map<number, Array<typeof bomRows[number]>>();
    for (const row of bomRows) {
      const existingRows = bomByProductId.get(row.productId) || [];
      existingRows.push(row);
      bomByProductId.set(row.productId, existingRows);
    }

    const consolidatedMap = new Map<number, {
      materialId: number;
      materialName: string;
      unit: string;
      unitPrice: number;
      totalQuantity: number;
      totalCost: number;
      usedInProducts: Set<string>;
    }>();

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId)!;
      const yieldPerBatch = product.productionMode === 'batch'
        ? Math.max(1, Number(product.batchYield || 1))
        : 1;
      const plannedBatches = item.quantity / yieldPerBatch;
      const productBomRows = bomByProductId.get(item.productId) || [];

      for (const bomRow of productBomRows) {
        const qtyRequired = plannedBatches * Number(bomRow.bomQuantity || 0);
        const unitPrice = Number(bomRow.unitPrice || 0);
        const cost = qtyRequired * unitPrice;

        const existing = consolidatedMap.get(bomRow.materialId);
        if (existing) {
          existing.totalQuantity += qtyRequired;
          existing.totalCost += cost;
          existing.usedInProducts.add(product.name);
        } else {
          consolidatedMap.set(bomRow.materialId, {
            materialId: bomRow.materialId,
            materialName: bomRow.materialName,
            unit: bomRow.unit,
            unitPrice,
            totalQuantity: qtyRequired,
            totalCost: cost,
            usedInProducts: new Set([product.name]),
          });
        }
      }
    }

    const materialsRequirement = Array.from(consolidatedMap.values())
      .map((entry) => ({
        materialId: entry.materialId,
        materialName: entry.materialName,
        unit: entry.unit,
        unitPrice: Math.round(entry.unitPrice * 100) / 100,
        totalQuantity: Math.round(entry.totalQuantity * 10000) / 10000,
        totalCost: Math.round(entry.totalCost * 100) / 100,
        usedInProducts: Array.from(entry.usedInProducts),
      }))
      .sort((a, b) => a.materialName.localeCompare(b.materialName));

    const totalCost = materialsRequirement.reduce((sum, entry) => sum + entry.totalCost, 0);

    res.json({
      items: materialsRequirement,
      materials: materialsRequirement,
      consolidatedMaterials: materialsRequirement,
      summary: {
        totalMaterialCost: Math.round(totalCost * 100) / 100,
        productCount: uniqueProductIds.length,
        materialCount: materialsRequirement.length,
      },
    });
  } catch (error) {
    console.error('Error calculating materials requirement:', error);
    res.status(500).json({ error: 'Failed to calculate materials requirement' });
  }
});

// ============================================
// PRODUCTS ENDPOINTS
// ============================================

async function calculateOptimalPricePerUnit(productId: number) {
  const snapshot = await calculateProductCostSnapshot(productId);
  return snapshot.optimalPrice;
}

async function calculateProductCostSnapshot(productId: number): Promise<{ materialCost: number; optimalPrice: number }> {
  const productRows = await db.select().from(products).where(eq(products.id, productId));
  if (productRows.length === 0) {
    throw new Error('Product not found');
  }

  const product = productRows[0];
  const bom = await db
    .select({
      quantity: billOfMaterials.quantity,
      unitPrice: materials.unitPrice,
    })
    .from(billOfMaterials)
    .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
    .where(eq(billOfMaterials.productId, productId));

  let totalMaterialCost = 0;
  for (const item of bom) {
    const cost = parseFloat(item.quantity.toString()) * parseFloat(item.unitPrice?.toString() || '0');
    totalMaterialCost += cost;
  }

  const otherCosts = parseFloat(product.otherDirectCosts?.toString() || '0');
  const overheadCost = totalMaterialCost * (parseFloat(product.overheadPercentage.toString()) / 100);
  const totalCost = totalMaterialCost + overheadCost + otherCosts;
  const profitAmount = totalCost * (parseFloat(product.profitMargin.toString()) / 100);
  const recommendedPrice = totalCost + profitAmount;

  const perUnitMaterialCost = product.productionMode === 'batch'
    ? totalMaterialCost / Math.max(1, product.batchYield || 1)
    : totalMaterialCost;

  const perUnitOptimalPrice = product.productionMode === 'batch'
    ? recommendedPrice / Math.max(1, product.batchYield || 1)
    : recommendedPrice;

  return {
    materialCost: Math.round(perUnitMaterialCost * 100) / 100,
    optimalPrice: Math.round(perUnitOptimalPrice * 100) / 100,
  };
}

function getSqliteClient() {
  const typedDb = db as unknown as {
    $client?: {
      prepare: (query: string) => {
        all: () => Array<{ name: string }>;
        run: (...values: number[]) => unknown;
      };
    };
  };

  return typedDb.$client ?? null;
}

let productComputedColumnsCache: { materialCostColumn: string | null; optimalPriceColumn: string | null } | null = null;

function resolveComputedProductColumns() {
  if (productComputedColumnsCache) {
    return productComputedColumnsCache;
  }

  const sqliteClient = getSqliteClient();
  if (!sqliteClient) {
    productComputedColumnsCache = { materialCostColumn: null, optimalPriceColumn: null };
    return productComputedColumnsCache;
  }

  const columns = sqliteClient.prepare("SELECT name FROM pragma_table_info('products')").all();
  const columnNames = new Set(columns.map((column) => column.name));

  productComputedColumnsCache = {
    materialCostColumn: columnNames.has('material_cost') ? 'material_cost' : (columnNames.has('materialCost') ? 'materialCost' : null),
    optimalPriceColumn: columnNames.has('optimal_price') ? 'optimal_price' : (columnNames.has('optimalPrice') ? 'optimalPrice' : null),
  };

  return productComputedColumnsCache;
}

function persistProductComputedValues(productId: number, materialCost: number, optimalPrice: number) {
  const sqliteClient = getSqliteClient();
  if (!sqliteClient) {
    return;
  }

  const computedColumns = resolveComputedProductColumns();
  const setClauses: string[] = [];
  const values: number[] = [];

  if (computedColumns.materialCostColumn) {
    setClauses.push(`${computedColumns.materialCostColumn} = ?`);
    values.push(materialCost);
  }

  if (computedColumns.optimalPriceColumn) {
    setClauses.push(`${computedColumns.optimalPriceColumn} = ?`);
    values.push(optimalPrice);
  }

  if (setClauses.length === 0) {
    return;
  }

  const updateStatement = sqliteClient.prepare(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`);
  updateStatement.run(...values, productId);
}

async function setNeedsReviewIfOutdated(productId: number): Promise<{ reviewed: boolean; movedToNeedsReview: boolean }> {
  const productRows = await db.select().from(products).where(eq(products.id, productId));
  if (productRows.length === 0) {
    return { reviewed: false, movedToNeedsReview: false };
  }
  const product = productRows[0];

  const snapshot = await calculateProductCostSnapshot(productId);
  persistProductComputedValues(productId, snapshot.materialCost, snapshot.optimalPrice);

  if (product.approvalStatus !== 'approved' || product.approvedPrice == null) {
    return { reviewed: true, movedToNeedsReview: false };
  }

  const optimalPrice = snapshot.optimalPrice;
  const diff = Math.abs(optimalPrice - product.approvedPrice);
  if (diff >= 0.01) {
    await db.update(products).set({
      approvalStatus: 'needs_review',
      updatedAt: new Date(),
    }).where(eq(products.id, productId));

    return { reviewed: true, movedToNeedsReview: true };
  }

  return { reviewed: true, movedToNeedsReview: false };
}

async function setNeedsReviewForMaterial(materialId: number): Promise<{ reviewedProductIds: number[]; productsNowNeedsReviewIds: number[] }> {
  const usage = await db
    .select({ productId: billOfMaterials.productId })
    .from(billOfMaterials)
    .where(eq(billOfMaterials.materialId, materialId));

  const productIds = Array.from(new Set(usage.map((u) => u.productId)));
  const reviewedProductIds: number[] = [];
  const productsNowNeedsReviewIds: number[] = [];

  for (const productId of productIds) {
    const result = await setNeedsReviewIfOutdated(productId);
    if (result.reviewed) {
      reviewedProductIds.push(productId);
    }
    if (result.movedToNeedsReview) {
      productsNowNeedsReviewIds.push(productId);
    }
  }

  return { reviewedProductIds, productsNowNeedsReviewIds };
}

async function recalculateMaterialsForCurrency(currencyId: number): Promise<RecalculationSummary> {
  const rate = await db.select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
  if (rate.length === 0) {
    throw new Error('Exchange rate not found');
  }

  const exchangeRate = parseFloat(rate[0].rateToBase.toString());

  const currency = await db.select().from(currencies).where(eq(currencies.id, currencyId));
  if (currency.length === 0) {
    throw new Error('Currency not found');
  }
  const currencyCode = currency[0].code;

  const baseSettings = await db.select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
  const baseCurrency = baseSettings.length > 0 ? baseSettings[0].settingValue : 'GHS';

  if (currencyCode === baseCurrency) {
    return {
      materialsUpdated: 0,
      productsReviewed: 0,
      productsNowNeedsReview: 0,
      message: `Base currency (${baseCurrency}) rate change - no material recalculation needed`,
    };
  }

  const materialsToUpdate = await db.select().from(materials).where(eq(materials.purchaseCurrencyId, currencyId));

  const reviewedProductIds = new Set<number>();
  const productsNowNeedsReviewIds = new Set<number>();

  for (const material of materialsToUpdate) {
    const bulkPrice = parseFloat(material.bulkPrice?.toString() || '0');
    const bulkQuantity = parseFloat(material.bulkQuantity?.toString() || '1');
    const safeBulkQuantity = bulkQuantity <= 0 ? 1 : bulkQuantity;

    const unitPriceInOriginalCurrency = bulkPrice / safeBulkQuantity;
    const priceInBaseCurrency = bulkPrice * exchangeRate;
    const unitPrice = unitPriceInOriginalCurrency * exchangeRate;

    await db.update(materials)
      .set({
        priceInBaseCurrency,
        unitPrice,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, material.id));

    const reviewSummary = await setNeedsReviewForMaterial(material.id);
    for (const productId of reviewSummary.reviewedProductIds) {
      reviewedProductIds.add(productId);
    }
    for (const productId of reviewSummary.productsNowNeedsReviewIds) {
      productsNowNeedsReviewIds.add(productId);
    }
  }

  return {
    materialsUpdated: materialsToUpdate.length,
    productsReviewed: reviewedProductIds.size,
    productsNowNeedsReview: productsNowNeedsReviewIds.size,
    message: `Updated ${materialsToUpdate.length} materials using new ${currencyCode} exchange rate`,
  };
}

app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Fetching all products...');
    const allProducts = await db.select().from(products);
    console.log('✅ Products fetched:', allProducts.length, 'products');
    res.json(allProducts);
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await db.select().from(products).where(eq(products.id, productId));
    
    if (product.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, sku, description, category, overheadPercentage, profitMargin, otherDirectCosts, productionMode, batchYield, currentSellingPrice } = req.body;
    const result = await db.insert(products).values({
      name,
      sku: sku || null,
      description: description || null,
      category: category || null,
      overheadPercentage,
      profitMargin,
      otherDirectCosts: otherDirectCosts || 0,
      productionMode: productionMode || 'single',
      batchYield: batchYield || 1,
      currentSellingPrice: currentSellingPrice || 0,
    }).returning();
    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, sku, description, category, overheadPercentage, profitMargin, otherDirectCosts, productionMode, batchYield, currentSellingPrice } = req.body;
    await db.update(products).set({
      name,
      sku: sku || null,
      description: description || null,
      category: category || null,
      overheadPercentage,
      profitMargin,
      otherDirectCosts: otherDirectCosts || 0,
      productionMode: productionMode || 'single',
      batchYield: batchYield || 1,
      currentSellingPrice: currentSellingPrice || 0,
      updatedAt: new Date(),
    }).where(eq(products.id, parseInt(req.params.id)));

    await setNeedsReviewIfOutdated(parseInt(req.params.id));
    
    const updated = await db.select().from(products).where(eq(products.id, parseInt(req.params.id)));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.post('/api/products/:id/approve', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { approvedPrice } = req.body;

    const bomItems = await db
      .select({ id: billOfMaterials.id })
      .from(billOfMaterials)
      .where(eq(billOfMaterials.productId, productId));

    if (bomItems.length === 0) {
      return res.status(400).json({ error: 'Cannot approve product without BOM items' });
    }

    const priceToApprove = approvedPrice ?? await calculateOptimalPricePerUnit(productId);

    await db.update(products).set({
      approvalStatus: 'approved',
      approvedPrice: priceToApprove,
      approvedBy: 'user',
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(products.id, productId));

    const updated = await db.select().from(products).where(eq(products.id, productId));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve price' });
  }
});

app.post('/api/products/:id/reject', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    await db.update(products).set({
      approvalStatus: 'rejected',
      approvedPrice: null,
      approvedBy: null,
      approvedAt: null,
      updatedAt: new Date(),
    }).where(eq(products.id, productId));

    const updated = await db.select().from(products).where(eq(products.id, productId));
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject price' });
  }
});

app.post('/api/products/bulk-approve', async (req, res) => {
  try {
    const { productIds } = req.body as { productIds?: number[] };
    if (!productIds || productIds.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    const updates = await Promise.all(productIds.map(async (productId) => {
      const bomItems = await db
        .select({ id: billOfMaterials.id })
        .from(billOfMaterials)
        .where(eq(billOfMaterials.productId, productId));

      if (bomItems.length === 0) {
        throw new Error(`Product ${productId} cannot be approved without BOM items`);
      }

      const priceToApprove = await calculateOptimalPricePerUnit(productId);
      await db.update(products).set({
        approvalStatus: 'approved',
        approvedPrice: priceToApprove,
        approvedBy: 'user',
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      return productId;
    }));

    res.json({ success: true, count: updates.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk approve products' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    await db.delete(products).where(eq(products.id, productId));
    res.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('foreign key constraint failed')) {
      return res.status(409).json({
        error: 'Cannot delete product because it is used in one or more price lists. Remove it from those lists first.',
      });
    }

    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.get('/api/products/:id/bom', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // Get base currency symbol
    const baseCurrencySetting = await db.select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
    const baseCurrencyCode = baseCurrencySetting.length > 0 ? baseCurrencySetting[0].settingValue : 'GHS';
    const baseCurrencyData = await db.select().from(currencies).where(eq(currencies.code, baseCurrencyCode));
    const baseCurrencySymbol = baseCurrencyData.length > 0 ? baseCurrencyData[0].symbol : '₵';
    
    const bom = await db
      .select({
        id: billOfMaterials.id,
        productId: billOfMaterials.productId,
        materialId: billOfMaterials.materialId,
        quantity: billOfMaterials.quantity,
        materialName: materials.name,
        unit: materials.unit,
        unitPrice: materials.unitPrice,
      })
      .from(billOfMaterials)
      .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
      .where(eq(billOfMaterials.productId, productId));
    
    // Add base currency symbol to each BOM item
    const bomWithSymbol = bom.map(item => ({
      ...item,
      currencySymbol: baseCurrencySymbol,
    }));
    
    res.json(bomWithSymbol);
  } catch (error) {
    console.error('Error fetching BOM:', error);
    res.status(500).json({ error: 'Failed to fetch BOM' });
  }
});

// Add material to BOM
app.post('/api/products/:id/bom', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { materialId, quantity } = req.body;
    
    const result = await db.insert(billOfMaterials).values({
      productId,
      materialId,
      quantity,
    }).returning();

    await setNeedsReviewIfOutdated(productId);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error adding material to BOM:', error);
    res.status(500).json({ error: 'Failed to add material to BOM' });
  }
});

// Remove material from BOM
app.delete('/api/products/:id/bom/:bomId', async (req, res) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const productId = parseInt(req.params.id);
    await db.delete(billOfMaterials).where(eq(billOfMaterials.id, bomId));
    await setNeedsReviewIfOutdated(productId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove material from BOM' });
  }
});

// Calculate product cost
app.get('/api/products/:id/calculate', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // Get product details
    const product = await db.select().from(products).where(eq(products.id, productId));
    if (product.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get BOM with material details
    const bom = await db
      .select({
        quantity: billOfMaterials.quantity,
        unitPrice: materials.unitPrice,
      })
      .from(billOfMaterials)
      .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
      .where(eq(billOfMaterials.productId, productId));
    
    // Calculate total material cost
    let totalMaterialCost = 0;
    for (const item of bom) {
      const cost = parseFloat(item.quantity.toString()) * parseFloat(item.unitPrice?.toString() || '0');
      totalMaterialCost += cost;
    }
    
    // Calculate overhead and profit
    const otherCosts = parseFloat(product[0].otherDirectCosts?.toString() || '0');
    const overheadCost = totalMaterialCost * (parseFloat(product[0].overheadPercentage.toString()) / 100);
    const totalCost = totalMaterialCost + overheadCost + otherCosts;
    const profitAmount = totalCost * (parseFloat(product[0].profitMargin.toString()) / 100);
    const recommendedPrice = totalCost + profitAmount;
    res.json({
  totalMaterialCost: totalMaterialCost.toFixed(2),
  overheadCost: overheadCost.toFixed(2),
  otherDirectCosts: otherCosts.toFixed(2),
  totalCost: totalCost.toFixed(2),
  profitAmount: profitAmount.toFixed(2),
  recommendedPrice: recommendedPrice.toFixed(2),
});
  } catch (error) {
    console.error('Error calculating cost:', error);
    res.status(500).json({ error: 'Failed to calculate cost' });
  }
});

// ============================================
// START SERVER
// ============================================
// Price Level Rules endpoints
app.get('/api/price-level-rules', async (req, res) => {
  try {
    const rules = await db.select().from(priceLevels);
    res.json(rules);
  } catch (error) {
    console.error('Error fetching price level rules:', error);
    res.status(500).json({ error: 'Failed to fetch price level rules' });
  }
});

app.post('/api/price-level-rules', async (req, res) => {
  try {
    const { name, adjustmentType, adjustmentPercentage, description } = req.body;

    if (!name || !adjustmentType || adjustmentPercentage === undefined || adjustmentPercentage === null) {
      return res.status(400).json({ error: 'name, adjustmentType, and adjustmentPercentage are required' });
    }

    if (!['discount', 'markup'].includes(adjustmentType)) {
      return res.status(400).json({ error: "adjustmentType must be 'discount' or 'markup'" });
    }

    const numericPercentage = Number(adjustmentPercentage);
    if (Number.isNaN(numericPercentage) || numericPercentage < 0) {
      return res.status(400).json({ error: 'adjustmentPercentage must be a non-negative number' });
    }

    if (adjustmentType === 'discount' && numericPercentage > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    if (adjustmentType === 'markup' && numericPercentage > 1000) {
      return res.status(400).json({ error: 'Markup percentage must be between 0 and 1000' });
    }

    const multiplier = adjustmentType === 'markup'
      ? 1 + (numericPercentage / 100)
      : 1 - (numericPercentage / 100);

    const result = await db.insert(priceLevels).values({
      name,
      multiplier,
      adjustmentType,
      adjustmentPercentage: numericPercentage,
      description,
    }).returning();
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating customer price rule:', error);
    res.status(500).json({ error: 'Failed to create customer price rule' });
  }
});

app.put('/api/price-level-rules/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, adjustmentType, adjustmentPercentage, description, isActive } = req.body;

    if (!name || !adjustmentType || adjustmentPercentage === undefined || adjustmentPercentage === null) {
      return res.status(400).json({ error: 'name, adjustmentType, and adjustmentPercentage are required' });
    }

    if (!['discount', 'markup'].includes(adjustmentType)) {
      return res.status(400).json({ error: "adjustmentType must be 'discount' or 'markup'" });
    }

    const numericPercentage = Number(adjustmentPercentage);
    if (Number.isNaN(numericPercentage) || numericPercentage < 0) {
      return res.status(400).json({ error: 'adjustmentPercentage must be a non-negative number' });
    }

    if (adjustmentType === 'discount' && numericPercentage > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    if (adjustmentType === 'markup' && numericPercentage > 1000) {
      return res.status(400).json({ error: 'Markup percentage must be between 0 and 1000' });
    }

    const multiplier = adjustmentType === 'markup'
      ? 1 + (numericPercentage / 100)
      : 1 - (numericPercentage / 100);

    await db.update(priceLevels)
      .set({
        name,
        multiplier,
        adjustmentType,
        adjustmentPercentage: numericPercentage,
        description,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(priceLevels.id, parseInt(id)))
      .returning();
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating customer price rule:', error);
    res.status(500).json({ error: 'Failed to update customer price rule' });
  }
});

app.delete('/api/price-level-rules/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    await db.delete(priceLevels)
      .where(eq(priceLevels.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer price rule:', error);
    res.status(500).json({ error: 'Failed to delete customer price rule' });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const allCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        priceLevelId: customers.priceLevelId,
        priceLevelName: priceLevels.name,
        allowSpecialPricing: customers.allowSpecialPricing,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        specialPricingCount: sql<number>`count(${specialPricing.id})`,
      })
      .from(customers)
      .leftJoin(priceLevels, eq(customers.priceLevelId, priceLevels.id))
      .leftJoin(specialPricing, eq(customers.id, specialPricing.customerId))
      .groupBy(customers.id, priceLevels.name);

    res.json(allCustomers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, priceLevelId, allowSpecialPricing } = req.body;
    const numericPriceLevelId = Number(priceLevelId);

    if (!name || !Number.isInteger(numericPriceLevelId)) {
      return res.status(400).json({ error: 'name and priceLevelId are required' });
    }

    const existingPriceLevel = await db.select().from(priceLevels).where(eq(priceLevels.id, numericPriceLevelId));
    if (existingPriceLevel.length === 0) {
      return res.status(400).json({ error: 'Invalid priceLevelId' });
    }

    const result = await db.insert(customers).values({
      name,
      priceLevelId: numericPriceLevelId,
      allowSpecialPricing: Boolean(allowSpecialPricing),
    }).returning();

    const created = await db
      .select({
        id: customers.id,
        name: customers.name,
        priceLevelId: customers.priceLevelId,
        priceLevelName: priceLevels.name,
        allowSpecialPricing: customers.allowSpecialPricing,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .innerJoin(priceLevels, eq(customers.priceLevelId, priceLevels.id))
      .where(eq(customers.id, result[0].id));

    res.status(201).json(created[0]);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { name, priceLevelId, allowSpecialPricing } = req.body;
    const numericPriceLevelId = Number(priceLevelId);

    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    if (!name || !Number.isInteger(numericPriceLevelId)) {
      return res.status(400).json({ error: 'name and priceLevelId are required' });
    }

    const existingPriceLevel = await db.select().from(priceLevels).where(eq(priceLevels.id, numericPriceLevelId));
    if (existingPriceLevel.length === 0) {
      return res.status(400).json({ error: 'Invalid priceLevelId' });
    }

    await db.update(customers)
      .set({
        name,
        priceLevelId: numericPriceLevelId,
        allowSpecialPricing: Boolean(allowSpecialPricing),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));

    const updated = await db
      .select({
        id: customers.id,
        name: customers.name,
        priceLevelId: customers.priceLevelId,
        priceLevelName: priceLevels.name,
        allowSpecialPricing: customers.allowSpecialPricing,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .innerJoin(priceLevels, eq(customers.priceLevelId, priceLevels.id))
      .where(eq(customers.id, customerId));

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    await db.delete(priceLists).where(eq(priceLists.customerId, customerId));

    await db.delete(customers).where(eq(customers.id, customerId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

app.get('/api/customers/:id/custom-prices', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const customer = await db.select().from(customers).where(eq(customers.id, customerId));
    if (customer.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customPrices = await db
      .select({
        id: specialPricing.id,
        customerId: specialPricing.customerId,
        productId: specialPricing.productId,
        productName: products.name,
        customPrice: specialPricing.customPrice,
        productionCost: specialPricing.productionCost,
        marginImpactPercentage: specialPricing.marginImpactPercentage,
        oldMarginPercentage: specialPricing.oldMarginPercentage,
        overrideType: specialPricing.overrideType,
        discountPercentage: specialPricing.discountPercentage,
        markupPercentage: specialPricing.markupPercentage,
        status: specialPricing.status,
        approvedBy: specialPricing.approvedBy,
        approvedAt: specialPricing.approvedAt,
        justification: specialPricing.justification,
        createdBy: specialPricing.createdBy,
        createdAt: specialPricing.createdAt,
      })
      .from(specialPricing)
      .innerJoin(products, eq(specialPricing.productId, products.id))
      .where(eq(specialPricing.customerId, customerId));

    res.json(customPrices);
  } catch (error) {
    console.error('Error fetching customer custom prices:', error);
    res.status(500).json({ error: 'Failed to fetch customer custom prices' });
  }
});

app.post('/api/customers/:id/custom-prices', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const productId = Number(req.body?.productId);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const result = await handleSpecialPricingUpsert({
      customerId,
      productId,
      payload: (req.body ?? {}) as Record<string, unknown>,
    });

    res.status(result.status).json(result.payload);
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Customer not found'
      || error.message === 'Customer is not allowed to use special pricing'
      || error.message === 'Product not found'
      || error.message === 'Only approved products can have custom prices'
    )) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
    console.error('Error saving customer custom price:', error);
    res.status(500).json({ error: 'Failed to save customer custom price' });
  }
});

app.put('/api/customers/:id/custom-prices/:productId', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const result = await handleSpecialPricingUpsert({
      customerId,
      productId,
      payload: { ...(req.body ?? {}), productId },
    });

    const statusCode = result.status === 201 ? 200 : result.status;
    res.status(statusCode).json(result.payload);
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Customer not found'
      || error.message === 'Customer is not allowed to use special pricing'
      || error.message === 'Product not found'
      || error.message === 'Only approved products can have custom prices'
    )) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
    console.error('Error updating customer custom price:', error);
    res.status(500).json({ error: 'Failed to update customer custom price' });
  }
});

app.put('/api/customers/:id/custom-prices/:productId/approve', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { approvedBy } = req.body || {};

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const existing = await db
      .select()
      .from(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Special pricing entry not found' });
    }

    await db
      .update(specialPricing)
      .set({
        status: 'approved',
        approvedBy: approvedBy || 'pricing_manager',
        approvedAt: new Date(),
      })
      .where(eq(specialPricing.id, existing[0].id));

    const saved = await db
      .select()
      .from(specialPricing)
      .where(eq(specialPricing.id, existing[0].id));

    res.json(saved[0]);
  } catch (error) {
    console.error('Error approving special pricing:', error);
    res.status(500).json({ error: 'Failed to approve special pricing' });
  }
});

app.put('/api/customers/:id/custom-prices/:productId/reject', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { approvedBy, justification } = req.body || {};

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const existing = await db
      .select()
      .from(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Special pricing entry not found' });
    }

    await db
      .update(specialPricing)
      .set({
        status: 'rejected',
        approvedBy: approvedBy || 'pricing_manager',
        approvedAt: new Date(),
        justification: justification || existing[0].justification || null,
      })
      .where(eq(specialPricing.id, existing[0].id));

    const saved = await db
      .select()
      .from(specialPricing)
      .where(eq(specialPricing.id, existing[0].id));

    res.json(saved[0]);
  } catch (error) {
    console.error('Error rejecting special pricing:', error);
    res.status(500).json({ error: 'Failed to reject special pricing' });
  }
});

app.delete('/api/customers/:id/custom-prices/:productId', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    await db
      .delete(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    await removeSpecialPricingPriceListItem(customerId, productId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer custom price:', error);
    res.status(500).json({ error: 'Failed to delete customer custom price' });
  }
});

// ============================================
// PRODUCT PACKS ENDPOINTS
// ============================================


// ============================================
// PRICE LISTS ENDPOINTS
// ============================================

function getPriceLevelNameDisplay(createdBy: unknown, fallbackName: string | null) {
  if (typeof createdBy === 'string' && createdBy.startsWith('user-multi-level:')) {
    return 'Multiple';
  }
  return fallbackName ?? '-';
}

function parseSelectedPriceLevelIds(createdBy: unknown, fallbackPriceLevelId: number) {
  if (typeof createdBy === 'string' && createdBy.startsWith('user-multi-level:')) {
    const ids = createdBy
      .slice('user-multi-level:'.length)
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((id) => Number.isInteger(id));

    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 0) {
      return uniqueIds;
    }
  }

  return [fallbackPriceLevelId];
}

function toUnixSecondsValue(value: unknown) {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (Number.isNaN(timestamp)) return null;
    return Math.floor(timestamp / 1000);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return Math.floor(parsed / 1000);
  }

  return null;
}

// GET /api/price-lists - Get all price lists
app.get('/api/price-lists', async (req, res) => {
  try {
    const lists = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        customerId: priceLists.customerId,
        priceLevelId: priceLists.priceLevelId,
        priceLevelName: priceLevels.name,
        validFrom: priceLists.validFrom,
        validUntil: priceLists.validUntil,
        status: priceLists.status,
        createdBy: priceLists.createdBy,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id));
    res.json(
      lists.map((list) => ({
        ...list,
        priceLevelName: getPriceLevelNameDisplay(list.createdBy, list.priceLevelName),
      }))
    );
  } catch (error) {
    console.error('Error fetching price lists:', error);
    res.status(500).json({ error: 'Failed to fetch price lists' });
  }
});

// GET /api/price-lists/expiry-monitor - Get expiry reminders for price lists
app.get('/api/price-lists/expiry-monitor', async (req, res) => {
  try {
    const daysParam = Number(req.query.days);
    const thresholdDays = Number.isFinite(daysParam)
      ? Math.min(Math.max(Math.floor(daysParam), 1), 180)
      : 30;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const thresholdSeconds = nowSeconds + thresholdDays * 24 * 60 * 60;

    const lists = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        status: priceLists.status,
        customerId: priceLists.customerId,
        validUntil: priceLists.validUntil,
        validFrom: priceLists.validFrom,
        createdBy: priceLists.createdBy,
        priceLevelName: priceLevels.name,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
      .where(sql`${priceLists.validUntil} IS NOT NULL`);

    const reminders = lists
      .map((list) => {
        const validUntilSeconds = toUnixSecondsValue(list.validUntil);
        if (validUntilSeconds === null) return null;
        if (list.status === 'archived') return null;
        if (validUntilSeconds > thresholdSeconds) return null;

        const diffSeconds = validUntilSeconds - nowSeconds;
        const daysRemaining = Math.ceil(diffSeconds / (24 * 60 * 60));
        const severity = daysRemaining < 0
          ? 'expired'
          : daysRemaining <= 7
            ? 'critical'
            : 'warning';

        return {
          id: list.id,
          name: list.name,
          status: list.status,
          customerId: list.customerId,
          validFrom: list.validFrom,
          validUntil: list.validUntil,
          daysRemaining,
          severity,
          priceLevelName: getPriceLevelNameDisplay(list.createdBy, list.priceLevelName),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    const expiredCount = reminders.filter((item) => item.daysRemaining < 0).length;
    const criticalCount = reminders.filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= 7).length;
    const warningCount = reminders.filter((item) => item.daysRemaining > 7).length;

    res.json({
      thresholdDays,
      total: reminders.length,
      expiredCount,
      criticalCount,
      warningCount,
      reminders,
    });
  } catch (error) {
    console.error('Error fetching price list expiry monitor:', error);
    res.status(500).json({ error: 'Failed to fetch expiry monitor data' });
  }
});

// GET /api/price-lists/:id - Get price list with items
app.get('/api/price-lists/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const list = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        customerId: priceLists.customerId,
        priceLevelId: priceLists.priceLevelId,
        priceLevelName: priceLevels.name,
        validFrom: priceLists.validFrom,
        validUntil: priceLists.validUntil,
        status: priceLists.status,
        createdBy: priceLists.createdBy,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
      .where(eq(priceLists.id, id));
    
    if (list.length === 0) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const items = await db
      .select({
        id: priceListItems.id,
        productId: priceListItems.productId,
        productName: products.name,
        basePrice: priceListItems.basePrice,
        discountPercentage: priceListItems.discountPercentage,
        finalPrice: priceListItems.finalPrice,
        priceSource: priceListItems.priceSource,
        notes: priceListItems.notes,
      })
      .from(priceListItems)
      .innerJoin(products, eq(priceListItems.productId, products.id))
      .where(eq(priceListItems.priceListId, id));

    res.json({
      ...list[0],
      priceLevelName: getPriceLevelNameDisplay(list[0].createdBy, list[0].priceLevelName),
      items,
    });
  } catch (error) {
    console.error('Error fetching price list:', error);
    res.status(500).json({ error: 'Failed to fetch price list' });
  }
});

// POST /api/price-lists - Create new price list
app.post('/api/price-lists', async (req, res) => {
  try {
    const {
      name,
      priceLevelId,
      customerId,
      validFrom,
      validUntil,
      products: productIds,
      selectedPriceLevelIds,
      generationMode,
    } = req.body;
    const normalizedSelectedPriceLevelIds = Array.isArray(selectedPriceLevelIds)
      ? [...new Set(selectedPriceLevelIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id)))]
      : [];
    const fallbackPriceLevelId = Number(priceLevelId);
    const numericPriceLevelId = normalizedSelectedPriceLevelIds[0] ?? fallbackPriceLevelId;
    const normalizedGenerationMode = generationMode === 'byLevel' ? 'byPriceLevel' : generationMode;
    const mode = normalizedGenerationMode === 'byCustomer' || normalizedGenerationMode === 'byPriceLevel'
      ? normalizedGenerationMode
      : (customerId ? 'byCustomer' : 'byPriceLevel');

    // Validate input
    if (!name || !Number.isInteger(numericPriceLevelId) || !validFrom) {
      return res.status(400).json({ error: 'Name, priceLevelId, and valid from date are required' });
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'At least one product must be selected' });
    }

    const effectivePriceLevelIds = mode === 'byPriceLevel'
      ? (normalizedSelectedPriceLevelIds.length > 0 ? normalizedSelectedPriceLevelIds : [numericPriceLevelId])
      : [numericPriceLevelId];

    const matchingRules = await db
      .select()
      .from(priceLevels)
      .where(and(inArray(priceLevels.id, effectivePriceLevelIds), eq(priceLevels.isActive, true)));

    if (matchingRules.length !== effectivePriceLevelIds.length) {
      return res.status(400).json({ error: 'One or more selected price levels are invalid or inactive' });
    }

    const rulesById = new Map(matchingRules.map((rule) => [rule.id, rule]));
    const selectedRule = rulesById.get(numericPriceLevelId);
    if (!selectedRule) {
      return res.status(400).json({ error: 'No active price level rule found for the provided priceLevelId' });
    }

    let selectedCustomer: { id: number; priceLevelId: number; allowSpecialPricing: boolean } | null = null;
    const numericCustomerId = customerId === undefined || customerId === null || customerId === ''
      ? null
      : Number(customerId);

    if (mode === 'byCustomer') {
      if (numericCustomerId === null) {
        return res.status(400).json({ error: 'customerId is required for By Customer generation mode' });
      }

      if (!Number.isInteger(numericCustomerId)) {
        return res.status(400).json({ error: 'customerId must be an integer when provided' });
      }

      const foundCustomer = await db.select().from(customers).where(eq(customers.id, numericCustomerId));
      if (foundCustomer.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (foundCustomer[0].priceLevelId !== numericPriceLevelId) {
        return res.status(400).json({ error: 'Price level does not match selected customer' });
      }

      selectedCustomer = {
        id: foundCustomer[0].id,
        priceLevelId: foundCustomer[0].priceLevelId,
        allowSpecialPricing: Boolean(foundCustomer[0].allowSpecialPricing),
      };
    } else if (numericCustomerId !== null) {
      return res.status(400).json({ error: 'customerId is only allowed in By Customer mode' });
    }

    // Determine status
    const now = new Date();
    const validFromDate = new Date(validFrom);
    const validUntilDate = validUntil ? new Date(validUntil) : null;
    
    let status = 'draft';
    if (validFromDate <= now && (!validUntilDate || now <= validUntilDate)) {
      status = 'active';
    } else if (validUntilDate && now > validUntilDate) {
      status = 'expired';
    }

    // Create price list
    const priceListData = {
      name: name as string,
      customerId: selectedCustomer?.id ?? null,
      priceLevelId: numericPriceLevelId,
      validFrom: validFromDate,
      validUntil: validUntilDate,
      status: status as string,
      createdBy:
        mode === 'byPriceLevel' && effectivePriceLevelIds.length > 1
          ? `user-multi-level:${effectivePriceLevelIds.join(',')}`
          : ('user' as string),
    };
    const newList = await db.insert(priceLists).values(priceListData).returning();

    // Fetch approved products and create items
    const normalizedProductIds = productIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id));
    if (normalizedProductIds.length === 0) {
      return res.status(400).json({ error: 'No valid product ids provided' });
    }

    const productsData = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, normalizedProductIds),
          eq(products.approvalStatus, 'approved'),
          sql`${products.approvedPrice} IS NOT NULL`
        )
      );

    if (productsData.length === 0) {
      return res.status(400).json({ error: 'No approved products available. Approve at least one product first.' });
    }

    const customPricesByProductId: Record<number, number> = {};
    if (mode === 'byCustomer' && selectedCustomer?.allowSpecialPricing && productsData.length > 0) {
      const overrides = await db
        .select({ productId: specialPricing.productId, customPrice: specialPricing.customPrice })
        .from(specialPricing)
        .where(
          and(
            eq(specialPricing.customerId, selectedCustomer.id),
            eq(specialPricing.status, 'approved'),
            inArray(specialPricing.productId, productsData.map((product) => product.id))
          )
        );

      for (const override of overrides) {
        customPricesByProductId[override.productId] = Number(override.customPrice);
      }
    }

    const pricingRulesToApply = mode === 'byPriceLevel'
      ? effectivePriceLevelIds
          .map((id) => rulesById.get(id))
          .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
      : [selectedRule];

    const items = productsData.flatMap((product) => {
      const basePrice = Number(product.approvedPrice || 0);
      const customPrice = customPricesByProductId[product.id];
      const hasSpecialPrice = mode === 'byCustomer' && Number.isFinite(customPrice);

      return pricingRulesToApply.map((rule) => {
        const adjustmentType = rule.adjustmentType;
        const adjustmentPercentage = Number(rule.adjustmentPercentage || 0);
        const levelAdjustedPrice = adjustmentType === 'markup'
          ? Math.round(basePrice * (1 + adjustmentPercentage / 100) * 100) / 100
          : Math.round(basePrice * (1 - adjustmentPercentage / 100) * 100) / 100;
        const discountPercentage = adjustmentType === 'discount' ? adjustmentPercentage : -adjustmentPercentage;
        const hasLevelRule = adjustmentPercentage > 0;

        let finalPrice = basePrice;
        let priceSource: 'base' | 'level_rule' | 'special' = 'base';
        let normalizedDiscountPercentage = 0;

        if (hasSpecialPrice) {
          finalPrice = Math.round(Number(customPrice) * 100) / 100;
          priceSource = 'special';
          normalizedDiscountPercentage = 0;
        } else if (hasLevelRule) {
          finalPrice = levelAdjustedPrice;
          priceSource = 'level_rule';
          normalizedDiscountPercentage = discountPercentage;
        }

        return {
          priceListId: newList[0].id,
          productId: product.id,
          basePrice,
          discountPercentage: normalizedDiscountPercentage,
          finalPrice,
          priceSource,
          notes:
            mode === 'byPriceLevel' && pricingRulesToApply.length > 1
              ? `Price Level: ${rule.name}`
              : null,
        };
      });
    });

    if (items.length > 0) {
      await db.insert(priceListItems).values(items);
    }

    // Return created list with items
    const result = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        customerId: priceLists.customerId,
        priceLevelId: priceLists.priceLevelId,
        priceLevelName: priceLevels.name,
        validFrom: priceLists.validFrom,
        validUntil: priceLists.validUntil,
        status: priceLists.status,
        createdBy: priceLists.createdBy,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
      .where(eq(priceLists.id, newList[0].id));
    res.status(201).json({
      ...result[0],
      priceLevelName: getPriceLevelNameDisplay(result[0].createdBy, result[0].priceLevelName),
      items,
    });
  } catch (error) {
    console.error('Error creating price list:', error);
    res.status(500).json({ error: 'Failed to create price list' });
  }
});

// PUT /api/price-lists/:id - Update existing price list
app.put('/api/price-lists/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid price list id' });
    }

    const existing = await db.select().from(priceLists).where(eq(priceLists.id, id));
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const { name, validFrom, validUntil, status, selectedPriceLevelIds } = req.body || {};
    const existingList = existing[0];
    const updates: Record<string, any> = {};
    let regeneratedItems: Array<{
      priceListId: number;
      productId: number;
      basePrice: number;
      discountPercentage: number;
      finalPrice: number;
      priceSource: 'base' | 'level_rule' | 'special';
      notes: string | null;
    }> | null = null;

    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      updates.name = trimmedName;
    }

    if (validFrom !== undefined) {
      const parsedValidFrom = new Date(validFrom);
      if (Number.isNaN(parsedValidFrom.getTime())) {
        return res.status(400).json({ error: 'Invalid validFrom date' });
      }
      updates.validFrom = parsedValidFrom;
    }

    if (validUntil !== undefined) {
      if (validUntil === null || validUntil === '') {
        updates.validUntil = null;
      } else {
        const parsedValidUntil = new Date(validUntil);
        if (Number.isNaN(parsedValidUntil.getTime())) {
          return res.status(400).json({ error: 'Invalid validUntil date' });
        }
        updates.validUntil = parsedValidUntil;
      }
    }

    if (status !== undefined) {
      const allowedStatuses = ['draft', 'active', 'expired', 'archived'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.status = status;
    }

    if (selectedPriceLevelIds !== undefined) {
      if (!Array.isArray(selectedPriceLevelIds)) {
        return res.status(400).json({ error: 'selectedPriceLevelIds must be an array when provided' });
      }

      const normalizedSelectedPriceLevelIds = [...new Set(
        selectedPriceLevelIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value))
      )];

      if (normalizedSelectedPriceLevelIds.length === 0) {
        return res.status(400).json({ error: 'At least one valid price level must be selected' });
      }

      const customerSpecific = existingList.customerId != null;
      if (customerSpecific && normalizedSelectedPriceLevelIds.length > 1) {
        return res.status(400).json({ error: 'Customer-specific price lists can only use one price level' });
      }

      if (customerSpecific) {
        const customerRows = await db
          .select()
          .from(customers)
          .where(eq(customers.id, Number(existingList.customerId)));

        if (customerRows.length === 0) {
          return res.status(404).json({ error: 'Customer not found for this price list' });
        }

        if (customerRows[0].priceLevelId !== normalizedSelectedPriceLevelIds[0]) {
          return res.status(400).json({ error: 'Selected price level must match the customer price level' });
        }
      }

      const matchingRules = await db
        .select()
        .from(priceLevels)
        .where(and(inArray(priceLevels.id, normalizedSelectedPriceLevelIds), eq(priceLevels.isActive, true)));

      if (matchingRules.length !== normalizedSelectedPriceLevelIds.length) {
        return res.status(400).json({ error: 'One or more selected price levels are invalid or inactive' });
      }

      const selectedRules = normalizedSelectedPriceLevelIds
        .map((id) => matchingRules.find((rule) => rule.id === id))
        .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));

      updates.priceLevelId = normalizedSelectedPriceLevelIds[0];
      updates.createdBy = normalizedSelectedPriceLevelIds.length > 1
        ? `user-multi-level:${normalizedSelectedPriceLevelIds.join(',')}`
        : 'user';

      const existingItems = await db
        .select({ productId: priceListItems.productId })
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, id));

      const existingProductIds = [...new Set(existingItems.map((item) => item.productId))];
      if (existingProductIds.length === 0) {
        regeneratedItems = [];
      } else {
        const productsData = await db
          .select()
          .from(products)
          .where(
            and(
              inArray(products.id, existingProductIds),
              eq(products.approvalStatus, 'approved'),
              sql`${products.approvedPrice} IS NOT NULL`
            )
          );

        if (productsData.length === 0) {
          return res.status(400).json({ error: 'No approved products available for recalculating this list' });
        }

        const customPricesByProductId: Record<number, number> = {};
        if (customerSpecific && existingList.customerId != null) {
          const overrides = await db
            .select({ productId: specialPricing.productId, customPrice: specialPricing.customPrice })
            .from(specialPricing)
            .where(
              and(
                eq(specialPricing.customerId, Number(existingList.customerId)),
                eq(specialPricing.status, 'approved'),
                inArray(specialPricing.productId, productsData.map((product) => product.id))
              )
            );

          for (const override of overrides) {
            customPricesByProductId[override.productId] = Number(override.customPrice);
          }
        }

        const rulesToApply = customerSpecific ? [selectedRules[0]] : selectedRules;

        regeneratedItems = productsData.flatMap((product) => {
          const basePrice = Number(product.approvedPrice || 0);
          const customPrice = customPricesByProductId[product.id];
          const hasSpecialPrice = customerSpecific && Number.isFinite(customPrice);

          return rulesToApply.map((rule) => {
            const adjustmentType = rule.adjustmentType;
            const adjustmentPercentage = Number(rule.adjustmentPercentage || 0);
            const levelAdjustedPrice = adjustmentType === 'markup'
              ? Math.round(basePrice * (1 + adjustmentPercentage / 100) * 100) / 100
              : Math.round(basePrice * (1 - adjustmentPercentage / 100) * 100) / 100;
            const discountPercentage = adjustmentType === 'discount' ? adjustmentPercentage : -adjustmentPercentage;
            const hasLevelRule = adjustmentPercentage > 0;

            let finalPrice = basePrice;
            let priceSource: 'base' | 'level_rule' | 'special' = 'base';
            let normalizedDiscountPercentage = 0;

            if (hasSpecialPrice) {
              finalPrice = Math.round(Number(customPrice) * 100) / 100;
              priceSource = 'special';
              normalizedDiscountPercentage = 0;
            } else if (hasLevelRule) {
              finalPrice = levelAdjustedPrice;
              priceSource = 'level_rule';
              normalizedDiscountPercentage = discountPercentage;
            }

            return {
              priceListId: id,
              productId: product.id,
              basePrice,
              discountPercentage: normalizedDiscountPercentage,
              finalPrice,
              priceSource,
              notes: !customerSpecific && rulesToApply.length > 1 ? `Price Level: ${rule.name}` : null,
            };
          });
        });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update' });
    }

    updates.updatedAt = new Date();

    await db.update(priceLists).set(updates).where(eq(priceLists.id, id));

    if (regeneratedItems !== null) {
      await db.delete(priceListItems).where(eq(priceListItems.priceListId, id));
      if (regeneratedItems.length > 0) {
        await db.insert(priceListItems).values(regeneratedItems);
      }
    }

    const updatedList = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        customerId: priceLists.customerId,
        priceLevelId: priceLists.priceLevelId,
        priceLevelName: priceLevels.name,
        validFrom: priceLists.validFrom,
        validUntil: priceLists.validUntil,
        status: priceLists.status,
        createdBy: priceLists.createdBy,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
      .where(eq(priceLists.id, id));
    const items = await db
      .select({
        id: priceListItems.id,
        productId: priceListItems.productId,
        productName: products.name,
        basePrice: priceListItems.basePrice,
        discountPercentage: priceListItems.discountPercentage,
        finalPrice: priceListItems.finalPrice,
        priceSource: priceListItems.priceSource,
        notes: priceListItems.notes,
      })
      .from(priceListItems)
      .innerJoin(products, eq(priceListItems.productId, products.id))
      .where(eq(priceListItems.priceListId, id));

    return res.json({
      ...updatedList[0],
      priceLevelName: getPriceLevelNameDisplay(updatedList[0].createdBy, updatedList[0].priceLevelName),
      items,
    });
  } catch (error) {
    console.error('Error updating price list:', error);
    return res.status(500).json({ error: 'Failed to update price list' });
  }
});

// PUT /api/price-lists/:id/items - Update existing price list item prices
app.put('/api/price-lists/:id/items', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid price list id' });
    }

    const list = await db.select().from(priceLists).where(eq(priceLists.id, id));
    if (list.length === 0) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    for (const item of items) {
      const itemId = Number(item?.id);
      const finalPrice = Number(item?.finalPrice);
      if (!Number.isInteger(itemId) || !Number.isFinite(finalPrice) || finalPrice < 0) {
        return res.status(400).json({ error: 'Each item must include valid id and non-negative finalPrice' });
      }

      const existingItem = await db
        .select()
        .from(priceListItems)
        .where(and(eq(priceListItems.id, itemId), eq(priceListItems.priceListId, id)));

      if (existingItem.length === 0) {
        return res.status(404).json({ error: `Price list item ${itemId} not found` });
      }

      const roundedFinalPrice = Math.round(finalPrice * 100) / 100;
      const basePrice = Number(existingItem[0].basePrice || 0);
      const discountPercentage = basePrice > 0
        ? Math.round(((basePrice - roundedFinalPrice) / basePrice) * 10000) / 100
        : 0;

      const updatePayload: Record<string, any> = {
        finalPrice: roundedFinalPrice,
        discountPercentage,
      };

      if (item.notes !== undefined) {
        updatePayload.notes = item.notes || null;
      }

      await db.update(priceListItems).set(updatePayload).where(eq(priceListItems.id, itemId));
    }

    await db.update(priceLists).set({ updatedAt: new Date() }).where(eq(priceLists.id, id));

    const refreshedList = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        customerId: priceLists.customerId,
        priceLevelId: priceLists.priceLevelId,
        priceLevelName: priceLevels.name,
        validFrom: priceLists.validFrom,
        validUntil: priceLists.validUntil,
        status: priceLists.status,
        createdBy: priceLists.createdBy,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
      .where(eq(priceLists.id, id));
    const refreshedItems = await db
      .select({
        id: priceListItems.id,
        productId: priceListItems.productId,
        productName: products.name,
        basePrice: priceListItems.basePrice,
        discountPercentage: priceListItems.discountPercentage,
        finalPrice: priceListItems.finalPrice,
        priceSource: priceListItems.priceSource,
        notes: priceListItems.notes,
      })
      .from(priceListItems)
      .innerJoin(products, eq(priceListItems.productId, products.id))
      .where(eq(priceListItems.priceListId, id));

    return res.json({
      ...refreshedList[0],
      priceLevelName: getPriceLevelNameDisplay(refreshedList[0].createdBy, refreshedList[0].priceLevelName),
      items: refreshedItems,
    });
  } catch (error) {
    console.error('Error updating price list items:', error);
    return res.status(500).json({ error: 'Failed to update price list items' });
  }
});

// DELETE /api/price-lists/:id - Delete price list
app.delete('/api/price-lists/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(priceLists).where(eq(priceLists.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting price list:', error);
    res.status(500).json({ error: 'Failed to delete price list' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  startAutoBackupScheduler();
});

// Import products (grouped rows: one row per BOM material)
app.post('/api/products/import', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Expected an array of rows' });

    // Helper to read fields case-insensitively
    const getField = (row: any, keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]).toString();
      }
      // Try case-insensitive match
      const lowerKeys = Object.keys(row || {}).reduce((acc: any, cur) => { acc[cur.toLowerCase()] = row[cur]; return acc; }, {} as any);
      for (const k of keys) {
        const v = lowerKeys[k.toLowerCase()];
        if (v !== undefined && v !== null && v !== '') return String(v).toString();
      }
      return '';
    };

    // Group rows by product name
    const groups: Record<string, Array<{ row: any; rowNumber: number }>> = {};
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNumber = i + 1;
      const productName = getField(raw, ['Product Name', 'name', 'ProductName']);
      if (!productName) {
        // put into failures later
        groups[`__INVALID__`]= groups[`__INVALID__`] || [];
        groups[`__INVALID__`].push({ row: raw, rowNumber });
        continue;
      }
      const key = productName.trim();
      groups[key] = groups[key] || [];
      groups[key].push({ row: raw, rowNumber });
    }

    const failures: Array<any> = [];
    let successCount = 0;

    // Load all existing products for duplicate name check
    const existingProducts = await db.select().from(products);

    for (const [productName, entries] of Object.entries(groups)) {
      if (productName === '__INVALID__') {
        for (const e of entries) {
          failures.push({ rowNumber: e.rowNumber, name: '', reason: 'Missing required field: Product Name', originalRow: e.row });
        }
        continue;
      }

      // Take product details from first row
      const first = entries[0].row;
      const sku = getField(first, ['SKU', 'sku']);
      const category = getField(first, ['Category', 'category']);
      const productionModeRaw = getField(first, ['Production Mode', 'productionMode', 'ProductionMode']);
      const batchYieldRaw = getField(first, ['Batch Yield', 'batchYield', 'BatchYield']);
      const overheadRaw = getField(first, ['Overhead %', 'Overhead', 'overhead', 'Overhead%']);
      const profitRaw = getField(first, ['Profit Margin %', 'Profit', 'profitMargin', 'Profit Margin%']);

      // Validate product-level fields
      if (!category) {
        for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: 'Missing required field: Category', originalRow: e.row });
        continue;
      }

      const productionMode = productionModeRaw ? String(productionModeRaw).toLowerCase() : 'single';
      if (!['single', 'batch'].includes(productionMode)) {
        for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: `Invalid Production Mode: ${productionModeRaw}`, originalRow: e.row });
        continue;
      }

      const batchYield = productionMode === 'batch' ? parseInt(batchYieldRaw || '0') : 1;
      if (productionMode === 'batch' && (!batchYield || isNaN(batchYield) || batchYield <= 0)) {
        for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: 'Missing or invalid Batch Yield for batch product', originalRow: e.row });
        continue;
      }

      const overhead = parseFloat(overheadRaw || '0');
      const profitMargin = parseFloat(profitRaw || '0');
      if (isNaN(overhead)) { for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: `Invalid Overhead %: ${overheadRaw}`, originalRow: e.row }); continue; }
      if (isNaN(profitMargin)) { for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: `Invalid Profit Margin %: ${profitRaw}`, originalRow: e.row }); continue; }

      // Duplicate product name check (case-insensitive)
      const lowerName = productName.toLowerCase();
      const exists = existingProducts.some((p: any) => String(p.name).toLowerCase() === lowerName);
      if (exists) {
        for (const e of entries) failures.push({ rowNumber: e.rowNumber, name: productName, reason: 'Duplicate product name already exists', originalRow: e.row });
        continue;
      }

      // Create product
      const created = await db.insert(products).values({
        name: productName,
        sku: sku || null,
        description: first['Description'] || first['description'] || null,
        category: category || null,
        overheadPercentage: overhead,
        profitMargin: profitMargin,
        productionMode: productionMode,
        batchYield: batchYield || 1,
      }).returning();

      const productId = created[0].id;
      successCount++;

      // For each BOM row, try to find material and add to BOM
      for (const e of entries) {
        const matName = getField(e.row, ['Material Name', 'Material', 'materialName', 'MaterialName']);
        const qtyRaw = getField(e.row, ['Quantity', 'quantity']);
        const qty = parseFloat(qtyRaw || '0');
        if (!matName) {
          failures.push({ rowNumber: e.rowNumber, name: productName, reason: 'Missing required field: Material Name', originalRow: e.row });
          continue;
        }
        if (isNaN(qty) || qty <= 0) {
          failures.push({ rowNumber: e.rowNumber, name: productName, reason: `Invalid quantity for material '${matName}': ${qtyRaw}`, originalRow: e.row });
          continue;
        }

        // Find material by name (case-insensitive)
        const mats = await db.select().from(materials).where(sql`lower(${materials.name}) = ${matName.toLowerCase()}`);
        if (!mats || mats.length === 0) {
          failures.push({ rowNumber: e.rowNumber, name: productName, reason: `Material '${matName}' not found - BOM row skipped`, originalRow: e.row });
          continue;
        }

        try {
          await db.insert(billOfMaterials).values({ productId, materialId: mats[0].id, quantity: qty });
        } catch (err: any) {
          failures.push({ rowNumber: e.rowNumber, name: productName, reason: `API error adding BOM material '${matName}': ${err?.message || String(err)}`, originalRow: e.row });
        }
      }
    }

    res.json({ successCount, failures });
  } catch (error) {
    console.error('Error importing products:', error);
    res.status(500).json({ error: 'Failed to import products' });
  }
});

app.get('/api/price-levels', async (req, res) => {
  try {
    const rules = await db.select().from(priceLevels);
    res.json(rules);
  } catch (error) {
    console.error('Error fetching price levels:', error);
    res.status(500).json({ error: 'Failed to fetch price levels' });
  }
});

app.post('/api/price-levels', async (req, res) => {
  try {
    const { name, adjustmentType, adjustmentPercentage, description } = req.body;

    if (!name || !adjustmentType || adjustmentPercentage === undefined || adjustmentPercentage === null) {
      return res.status(400).json({ error: 'name, adjustmentType, and adjustmentPercentage are required' });
    }

    if (!['discount', 'markup'].includes(adjustmentType)) {
      return res.status(400).json({ error: "adjustmentType must be 'discount' or 'markup'" });
    }

    const numericPercentage = Number(adjustmentPercentage);
    if (Number.isNaN(numericPercentage) || numericPercentage < 0) {
      return res.status(400).json({ error: 'adjustmentPercentage must be a non-negative number' });
    }

    if (adjustmentType === 'discount' && numericPercentage > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    if (adjustmentType === 'markup' && numericPercentage > 1000) {
      return res.status(400).json({ error: 'Markup percentage must be between 0 and 1000' });
    }

    const multiplier = adjustmentType === 'markup'
      ? 1 + (numericPercentage / 100)
      : 1 - (numericPercentage / 100);

    const result = await db.insert(priceLevels).values({
      name,
      multiplier,
      adjustmentType,
      adjustmentPercentage: numericPercentage,
      description,
    }).returning();
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating price level:', error);
    res.status(500).json({ error: 'Failed to create price level' });
  }
});

app.post('/api/customers/:id/special-pricing', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const productId = Number(req.body?.productId);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const result = await handleSpecialPricingUpsert({
      customerId,
      productId,
      payload: (req.body ?? {}) as Record<string, unknown>,
    });

    res.status(result.status).json(result.payload);
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Customer not found'
      || error.message === 'Customer is not allowed to use special pricing'
      || error.message === 'Product not found'
      || error.message === 'Only approved products can have custom prices'
    )) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
    console.error('Error saving customer special pricing:', error);
    res.status(500).json({ error: 'Failed to save customer special pricing' });
  }
});

app.get('/api/customers/:id/special-pricing', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    if (!Number.isInteger(customerId)) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const customer = await db.select().from(customers).where(eq(customers.id, customerId));
    if (customer.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customPrices = await db
      .select({
        id: specialPricing.id,
        customerId: specialPricing.customerId,
        productId: specialPricing.productId,
        productName: products.name,
        customPrice: specialPricing.customPrice,
        productionCost: specialPricing.productionCost,
        marginImpactPercentage: specialPricing.marginImpactPercentage,
        oldMarginPercentage: specialPricing.oldMarginPercentage,
        overrideType: specialPricing.overrideType,
        discountPercentage: specialPricing.discountPercentage,
        markupPercentage: specialPricing.markupPercentage,
        status: specialPricing.status,
        approvedBy: specialPricing.approvedBy,
        approvedAt: specialPricing.approvedAt,
        justification: specialPricing.justification,
        createdBy: specialPricing.createdBy,
        createdAt: specialPricing.createdAt,
      })
      .from(specialPricing)
      .innerJoin(products, eq(specialPricing.productId, products.id))
      .where(eq(specialPricing.customerId, customerId));

    res.json(customPrices);
  } catch (error) {
    console.error('Error fetching customer special pricing:', error);
    res.status(500).json({ error: 'Failed to fetch customer special pricing' });
  }
});

app.put('/api/customers/:id/special-pricing/:productId', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const result = await handleSpecialPricingUpsert({
      customerId,
      productId,
      payload: { ...(req.body ?? {}), productId },
    });

    const statusCode = result.status === 201 ? 200 : result.status;
    res.status(statusCode).json(result.payload);
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Customer not found'
      || error.message === 'Customer is not allowed to use special pricing'
      || error.message === 'Product not found'
      || error.message === 'Only approved products can have custom prices'
    )) {
      const status = error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
    console.error('Error updating customer special pricing:', error);
    res.status(500).json({ error: 'Failed to update customer special pricing' });
  }
});

app.put('/api/customers/:id/special-pricing/:productId/approve', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { approvedBy } = req.body || {};

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const existing = await db
      .select()
      .from(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Special pricing entry not found' });
    }

    await db
      .update(specialPricing)
      .set({
        status: 'approved',
        approvedBy: approvedBy || 'pricing_manager',
        approvedAt: new Date(),
      })
      .where(eq(specialPricing.id, existing[0].id));

    const saved = await db
      .select()
      .from(specialPricing)
      .where(eq(specialPricing.id, existing[0].id));

    res.json(saved[0]);
  } catch (error) {
    console.error('Error approving special pricing (alias):', error);
    res.status(500).json({ error: 'Failed to approve special pricing' });
  }
});

app.put('/api/customers/:id/special-pricing/:productId/reject', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { approvedBy, justification } = req.body || {};

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    const existing = await db
      .select()
      .from(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Special pricing entry not found' });
    }

    await db
      .update(specialPricing)
      .set({
        status: 'rejected',
        approvedBy: approvedBy || 'pricing_manager',
        approvedAt: new Date(),
        justification: justification || existing[0].justification || null,
      })
      .where(eq(specialPricing.id, existing[0].id));

    const saved = await db
      .select()
      .from(specialPricing)
      .where(eq(specialPricing.id, existing[0].id));

    res.json(saved[0]);
  } catch (error) {
    console.error('Error rejecting special pricing (alias):', error);
    res.status(500).json({ error: 'Failed to reject special pricing' });
  }
});

app.delete('/api/customers/:id/special-pricing/:productId', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);

    if (!Number.isInteger(customerId) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid customer id or product id' });
    }

    await db
      .delete(specialPricing)
      .where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.productId, productId)));

    await removeSpecialPricingPriceListItem(customerId, productId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer special pricing (alias):', error);
    res.status(500).json({ error: 'Failed to delete customer special pricing' });
  }
});