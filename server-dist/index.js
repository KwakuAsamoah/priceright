import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveDb, liveDb, getSqliteClient, DATABASE_FILE_PATH, DEMO_DATABASE_FILE_PATH, readDemoModeState, writeDemoModeState, closeLiveDb, reopenLiveDb } from './db.js';
import { seedDemoData } from './seedDemo.js';
import { calculateProductionCost, calculateIntermediateCostPerUnit } from './costFormula.js';
import { currencies, exchangeRates, settings, materials, products, billOfMaterials, intermediateMaterialBom, materialPriceHistory, priceLevels, priceLevelItems, priceLevelPackSizes, customers, specialPricing, priceLists, priceListItems, activityLog } from './schema.js';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
const CSP_CONNECT_SRC = (process.env.CSP_CONNECT_SRC ?? "'self'")
    .split(',')
    .map((source) => source.trim())
    .filter((source) => source.length > 0)
    .join(' ');
const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "object-src 'none'",
    `connect-src ${CSP_CONNECT_SRC}`,
].join('; ');
const AUTO_BACKUP_ENABLED = (process.env.AUTO_BACKUP_ENABLED ?? 'true').toLowerCase() === 'true';
const AUTO_BACKUP_INTERVAL_MINUTES = Math.max(1, Number.parseInt(process.env.AUTO_BACKUP_INTERVAL_MINUTES ?? '60', 10) || 60);
const AUTO_BACKUP_RUN_ON_START = (process.env.AUTO_BACKUP_RUN_ON_START ?? 'false').toLowerCase() === 'true';
const AUTO_BACKUP_RETENTION_COUNT = Math.max(1, Number.parseInt(process.env.AUTO_BACKUP_RETENTION_COUNT ?? '30', 10) || 30);
const AUTO_BACKUP_INTERVAL_MS = AUTO_BACKUP_INTERVAL_MINUTES * 60 * 1000;
const db = new Proxy(liveDb, {
    get: (_target, property) => getActiveDb()[property],
});
async function getCurrentUserName() {
    try {
        const rows = await getActiveDb()
            .select({ settingKey: settings.settingKey, settingValue: settings.settingValue })
            .from(settings)
            .where(inArray(settings.settingKey, ['companyName', 'userName']));
        const companyName = rows.find((row) => row.settingKey === 'companyName')?.settingValue?.trim();
        const userName = rows.find((row) => row.settingKey === 'userName')?.settingValue?.trim();
        return companyName || userName || 'Admin';
    }
    catch {
        return 'Admin';
    }
}
async function logActivity(params, tx) {
    const writeLog = async (dbClient) => {
        await dbClient.insert(activityLog).values({
            entityType: params.entityType,
            entityId: params.entityId ?? null,
            entityName: params.entityName ?? null,
            action: params.action,
            details: params.details ? JSON.stringify(params.details) : null,
            performedBy: params.performedBy ?? 'Admin',
            userId: 1,
            userName: 'Admin',
            createdAt: new Date(),
        });
    };
    if (tx) {
        await writeLog(tx);
        return;
    }
    try {
        await writeLog(getActiveDb());
    }
    catch (err) {
        // Never let logging failure break the main operation
        console.error('[activity_log] Failed to write log entry:', err);
    }
}
function normalizeBomItemsPayload(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map((item, index) => {
        const materialId = Number(item?.materialId);
        const quantity = Number(item?.quantity);
        if (!Number.isInteger(materialId) || materialId <= 0) {
            throw new Error(`Invalid bomItems[${index}].materialId`);
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(`Invalid bomItems[${index}].quantity`);
        }
        return { materialId, quantity };
    });
}
let lastBackupTime = null;
let backupIntervalHandle = null;
const PIN_SETTING_KEY = 'pin_hash';
function isValidPin(pin) {
    return /^\d{4,6}$/.test(pin);
}
async function getStoredPinHash() {
    const result = await liveDb
        .select({ settingValue: settings.settingValue })
        .from(settings)
        .where(eq(settings.settingKey, PIN_SETTING_KEY));
    return result[0]?.settingValue ?? null;
}
async function saveSettingValue(settingKey, settingValue) {
    const existing = await liveDb
        .select({ id: settings.id })
        .from(settings)
        .where(eq(settings.settingKey, settingKey));
    if (existing.length > 0) {
        await liveDb
            .update(settings)
            .set({ settingValue, updatedAt: new Date() })
            .where(eq(settings.settingKey, settingKey));
        return;
    }
    await liveDb.insert(settings).values({ settingKey, settingValue });
}
function cleanupOldBackups(targetDir, retentionCount) {
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
        }
        catch (error) {
            console.error(`âš ï¸ Failed to delete old backup ${file.fileName}:`, error);
        }
    }
}
function createBackup() {
    const databasePath = DATABASE_FILE_PATH;
    const backupsDir = path.resolve(path.dirname(databasePath), 'backups');
    const googleDriveBackupDir = process.env.GOOGLE_DRIVE_BACKUP_DIR?.trim();
    if (!fs.existsSync(databasePath)) {
        console.error(`âŒ Database file not found at ${databasePath}`);
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
        console.log(`âœ… Backup created locally and copied to Google Drive: ${backupFileName}`);
    }
    else {
        console.log(`âœ… Backup created locally: ${backupFileName}`);
    }
    lastBackupTime = new Date();
    return true;
}
function startAutoBackupScheduler() {
    if (!AUTO_BACKUP_ENABLED) {
        console.log('â„¹ï¸ Automatic backups are disabled (AUTO_BACKUP_ENABLED=false)');
        return;
    }
    if (AUTO_BACKUP_RUN_ON_START) {
        try {
            const created = createBackup();
            if (!created) {
                console.error('âŒ Initial startup backup failed');
            }
        }
        catch (error) {
            console.error('âŒ Error creating startup backup:', error);
        }
    }
    backupIntervalHandle = setInterval(() => {
        try {
            const created = createBackup();
            if (!created) {
                console.error('âŒ Scheduled backup failed');
            }
        }
        catch (error) {
            console.error('âŒ Error during scheduled backup:', error);
        }
    }, AUTO_BACKUP_INTERVAL_MS);
    console.log(`â±ï¸ Automatic backups are enabled every ${AUTO_BACKUP_INTERVAL_MINUTES} minute(s)`);
    console.log(`ðŸ§¹ Backup retention is set to keep latest ${AUTO_BACKUP_RETENTION_COUNT} file(s)`);
}
const MIN_MARGIN_PERCENTAGE = 15;
function isFixedAmountOverrideType(value) {
    return value === 'fixed_amount_add' || value === 'fixed_amount_deduct';
}
function roundToFour(value) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
function roundToTwo(value) {
    return Math.round(value * 100) / 100;
}
async function resolveBaseCurrency() {
    const configuredCode = String((await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency')))[0]?.settingValue || 'GHS')
        .trim()
        .toUpperCase();
    const availableCurrencies = await getActiveDb().select().from(currencies);
    if (availableCurrencies.length === 0) {
        throw new Error('No base currency configured');
    }
    const normalizedCurrencies = availableCurrencies.map((currency) => ({
        ...currency,
        normalizedCode: String(currency.code || '').trim().toUpperCase(),
    }));
    const resolvedCurrency = normalizedCurrencies.find((currency) => currency.normalizedCode === configuredCode)
        || normalizedCurrencies.find((currency) => currency.normalizedCode === 'GHS')
        || normalizedCurrencies[0];
    return {
        id: resolvedCurrency.id,
        code: resolvedCurrency.code,
        symbol: resolvedCurrency.symbol,
    };
}
async function resolvePriceLevelCurrencyContext(level) {
    const base = await resolveBaseCurrency();
    if (!level.currencyId) {
        return {
            currencyId: null,
            currencyCode: null,
            rateToBase: 1,
            baseCurrencyCode: base.code,
        };
    }
    const currencyRows = await getActiveDb()
        .select()
        .from(currencies)
        .where(eq(currencies.id, level.currencyId));
    const currencyRow = currencyRows[0];
    if (!currencyRow) {
        return {
            currencyId: null,
            currencyCode: null,
            rateToBase: 1,
            baseCurrencyCode: base.code,
        };
    }
    const rateRows = await getActiveDb()
        .select()
        .from(exchangeRates)
        .where(eq(exchangeRates.currencyId, level.currencyId))
        .orderBy(desc(exchangeRates.effectiveDate))
        .limit(1);
    const rateToBase = rateRows.length > 0 && Number(rateRows[0].rateToBase) > 0
        ? Number(rateRows[0].rateToBase)
        : 1;
    return {
        currencyId: level.currencyId,
        currencyCode: currencyRow.code,
        rateToBase,
        baseCurrencyCode: base.code,
    };
}
async function enrichPriceLevelRow(level) {
    const currencyContext = await resolvePriceLevelCurrencyContext(level);
    return {
        ...level,
        currencyCode: currencyContext.currencyCode,
    };
}
function parseOptionalCurrencyId(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}
function safeBatchYield(batchYield) {
    return Math.max(1, Number(batchYield) || 1);
}
const EXCHANGE_RATE_MUST_BE_POSITIVE = 'Exchange rate must be greater than zero. A rate of 0 would make all material costs in this currency appear as zero.';
function parsePositiveExchangeRate(rateToBase) {
    const numericRate = Number(rateToBase);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
        return null;
    }
    return numericRate;
}
async function calculateProductionCostForProduct(selectedProduct, productId) {
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
    const { totalCost: materialsLaborOverheadTotal } = calculateProductionCost({
        materialCost: totalMaterialCost,
        laborCost: Number(selectedProduct.laborCost || 0),
        overheadPercentage: Number(selectedProduct.overheadPercentage || 0),
    });
    const otherCosts = Number(selectedProduct.otherDirectCosts || 0);
    const totalCost = materialsLaborOverheadTotal + otherCosts;
    if (selectedProduct.productionMode === 'batch') {
        const safeYield = safeBatchYield(selectedProduct.batchYield);
        return totalCost / safeYield;
    }
    return totalCost;
}
function toOptionalNumber(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}
function parsePriceLevelItemOverrideType(value) {
    if (value === 'rule_discount' || value === 'discount') {
        return 'rule_discount';
    }
    if (value === 'rule_markup' || value === 'markup') {
        return 'rule_markup';
    }
    if (value === 'fixed_amount_add') {
        return 'fixed_amount_add';
    }
    if (value === 'fixed_amount_deduct') {
        return 'fixed_amount_deduct';
    }
    if (value === 'custom_price' || value === 'custom') {
        return 'custom_price';
    }
    return null;
}
function computePriceLevelItemFinalPrice(input) {
    const { overrideType, adjustmentPercentage, customPrice, approvedPrice } = input;
    const normalizedApprovedPrice = Number.isFinite(approvedPrice) ? approvedPrice : 0;
    const normalizedCustomPrice = Number.isFinite(Number(customPrice ?? 0)) ? Number(customPrice ?? 0) : 0;
    if (overrideType === 'custom_price') {
        return roundToTwo(normalizedCustomPrice);
    }
    if (overrideType === 'rule_discount') {
        return roundToTwo(normalizedApprovedPrice * (1 - (Number(adjustmentPercentage || 0) / 100)));
    }
    if (overrideType === 'rule_markup') {
        return roundToTwo(normalizedApprovedPrice * (1 + (Number(adjustmentPercentage || 0) / 100)));
    }
    if (overrideType === 'fixed_amount_add') {
        return roundToTwo(normalizedApprovedPrice + normalizedCustomPrice);
    }
    return roundToTwo(normalizedApprovedPrice - normalizedCustomPrice);
}
function normalizeLegacyCustomPriceOverride(input) {
    if (input.overrideType !== 'custom_price') {
        return input;
    }
    const legacyPrice = Number(input.customPrice ?? 0);
    const approvedPrice = Number.isFinite(input.approvedPrice) ? input.approvedPrice : 0;
    const delta = legacyPrice - approvedPrice;
    const newOverrideType = delta >= 0 ? 'fixed_amount_add' : 'fixed_amount_deduct';
    return {
        overrideType: newOverrideType,
        customPrice: Math.abs(delta),
        approvedPrice: input.approvedPrice,
    };
}
function buildPackSizesResponse(packSizeRows, finalPrice, finalPriceConverted) {
    return packSizeRows.map((row) => {
        const safePackQuantity = Math.max(1, Number(row.packQuantity) || 1);
        const packPrice = Math.round(finalPrice * safePackQuantity * 100) / 100;
        const packPriceConverted = Math.round(finalPriceConverted * safePackQuantity * 100) / 100;
        return {
            id: row.id,
            packQuantity: row.packQuantity,
            packPrice,
            packPriceConverted,
        };
    });
}
async function toPriceLevelItemResponse(item, productRow, levelCurrency, packSizeRows) {
    const productionCost = await calculateProductionCostForProduct(productRow, productRow.id);
    const approvedPrice = Number(productRow.approvedPrice || 0);
    const optimalPrice = roundToTwo(productionCost * (1 + (Number(productRow.profitMargin || 0) / 100)));
    const rawOverrideType = parsePriceLevelItemOverrideType(item.overrideType) || 'rule_discount';
    let overrideType = rawOverrideType;
    const adjustmentPercentage = toOptionalNumber(item.adjustmentPercentage);
    let customPrice = toOptionalNumber(item.customPrice);
    if (rawOverrideType === 'custom_price') {
        const normalized = normalizeLegacyCustomPriceOverride({
            overrideType: rawOverrideType,
            customPrice,
            approvedPrice,
        });
        overrideType = normalized.overrideType;
        customPrice = normalized.customPrice;
    }
    const productApprovedAt = productRow.approvedAt ?? null;
    const isStalePrice = (isFixedAmountOverrideType(overrideType)
        && item.status === 'approved'
        && productApprovedAt != null
        && item.updatedAt != null
        && productApprovedAt > item.updatedAt);
    const finalPrice = computePriceLevelItemFinalPrice({
        overrideType,
        adjustmentPercentage,
        customPrice,
        approvedPrice,
    });
    const currencyContext = levelCurrency ?? {
        currencyId: null,
        currencyCode: null,
        rateToBase: 1,
        baseCurrencyCode: 'GHS',
    };
    const hasConvertedCurrency = Boolean(currencyContext.currencyCode && currencyContext.currencyId);
    const rateToBase = hasConvertedCurrency && currencyContext.rateToBase > 0
        ? currencyContext.rateToBase
        : 1;
    const finalPriceConverted = hasConvertedCurrency
        ? Math.round((finalPrice / rateToBase) * 100) / 100
        : finalPrice;
    const currencyCode = hasConvertedCurrency
        ? currencyContext.currencyCode
        : currencyContext.baseCurrencyCode;
    const resolvedPackSizeRows = packSizeRows ?? await getActiveDb()
        .select({
        id: priceLevelPackSizes.id,
        packQuantity: priceLevelPackSizes.packQuantity,
    })
        .from(priceLevelPackSizes)
        .where(eq(priceLevelPackSizes.priceLevelItemId, item.id));
    const packSizes = buildPackSizesResponse(resolvedPackSizeRows, finalPrice, finalPriceConverted);
    return {
        id: item.id,
        priceLevelId: item.priceLevelId,
        productId: item.productId,
        productName: productRow.name,
        productCategory: productRow.category || '',
        productApprovedPrice: roundToTwo(approvedPrice),
        productOptimalPrice: optimalPrice,
        productProductionCost: roundToTwo(productionCost),
        overrideType,
        adjustmentPercentage,
        customPrice,
        finalPrice,
        finalPriceConverted,
        currencyCode,
        rateToBase,
        status: (item.status === 'rejected' ? 'pending' : item.status),
        approvedBy: item.approvedBy ?? null,
        approvedAt: item.approvedAt ?? null,
        justification: item.justification ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        productApprovedAt,
        isStalePrice,
        productApprovalStatus: productRow.approvalStatus,
        packSizes,
    };
}
function parseStatusFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'active' || normalized === 'inactive' || normalized === 'all') {
        return normalized;
    }
    return 'all';
}
function parseMaterialTypeFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'primary' || normalized === 'intermediate' || normalized === 'all') {
        return normalized;
    }
    return 'all';
}
function parseIncludeInactive(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}
app.use(cors({
    origin: (origin, callback) => {
        const isLocalDevOrigin = typeof origin === 'string'
            && /^https?:\/\/(localhost|127\.0\.0\.1):(\d+)$/.test(origin);
        if (!origin || ALLOWED_ORIGINS.includes(origin) || isLocalDevOrigin) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    },
}));
app.use((req, res, next) => {
    // API is JSON-only; keep policy strict and allow only configured network targets.
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use((error, req, res, next) => {
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
app.get('/', (req, res) => {
    if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        return res.redirect('http://localhost:5173');
    }
    return res.json({
        service: 'priceright-api',
        status: 'ok',
        health: '/api/health',
    });
});
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        runtime: process.env.ELECTRON === 'true' ? 'electron' : 'dev',
        databaseFile: path.basename(DATABASE_FILE_PATH),
    });
});
app.get('/api/demo-mode', (_req, res) => {
    res.json({ demoMode: readDemoModeState() });
});
app.post('/api/demo-mode', (req, res) => {
    const incoming = Boolean(req.body?.demoMode);
    const demoMode = writeDemoModeState(incoming);
    res.json({
        demoMode,
        message: demoMode
            ? 'Demo mode enabled. Requests now use demo.db'
            : 'Live mode enabled. Requests now use priceright.db',
    });
});
app.post('/api/demo/reset', async (_req, res) => {
    try {
        if (!readDemoModeState()) {
            return res.status(400).json({ error: 'Demo reset is only available when demo mode is enabled' });
        }
        await seedDemoData({ force: true, dbPath: DEMO_DATABASE_FILE_PATH });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Error resetting demo data:', error);
        return res.status(500).json({ error: 'Failed to reset demo data' });
    }
});
// ============================================
// BACKUP ENDPOINTS
// ============================================
app.post('/api/backup', (req, res) => {
    try {
        const success = createBackup();
        if (success) {
            res.json({ success: true, message: 'Backup created successfully', lastBackupTime });
        }
        else {
            res.status(500).json({ error: 'Failed to create backup' });
        }
    }
    catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});
app.get('/api/backup/status', (req, res) => {
    try {
        const backupsDir = path.resolve(path.dirname(DATABASE_FILE_PATH), 'backups');
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
    }
    catch (error) {
        console.error('Error getting backup status:', error);
        res.status(500).json({ error: 'Failed to get backup status' });
    }
});
// --- User-initiated backup download ---
app.get('/api/backup/download', (_req, res) => {
    if (readDemoModeState()) {
        return res.status(400).json({
            error: 'Cannot backup or restore while in demo mode. Switch to your real data first in Settings → Data & Backups.',
        });
    }
    try {
        if (!fs.existsSync(DATABASE_FILE_PATH)) {
            res.status(404).json({ error: 'Database file not found' });
            return;
        }
        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `priceright_backup_${date}.db`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', fs.statSync(DATABASE_FILE_PATH).size.toString());
        fs.createReadStream(DATABASE_FILE_PATH).pipe(res);
    }
    catch (err) {
        console.error('[backup] Download error:', err);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});
// --- Restore from user-uploaded backup (base64 JSON body) ---
app.post('/api/backup/restore', express.json({ limit: '200mb' }), async (req, res) => {
    if (readDemoModeState()) {
        return res.status(400).json({
            error: 'Cannot backup or restore while in demo mode. Switch to your real data first in Settings → Data & Backups.',
        });
    }
    const { data } = req.body;
    if (!data) {
        res.status(400).json({ error: 'No backup data provided' });
        return;
    }
    const tempBackupPath = `${DATABASE_FILE_PATH}.before_restore_${Date.now()}`;
    try {
        const buf = Buffer.from(data, 'base64');
        // Validate SQLite magic header
        if (buf.length < 16 || buf.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
            res.status(400).json({ error: 'Invalid backup file. Not a valid SQLite database.' });
            return;
        }
        // Safety backup of current database
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            fs.copyFileSync(DATABASE_FILE_PATH, tempBackupPath);
        }
        // Close current connection, write new file, reopen
        closeLiveDb();
        fs.writeFileSync(DATABASE_FILE_PATH, buf);
        reopenLiveDb();
        // Clean up temp backup
        if (fs.existsSync(tempBackupPath)) {
            fs.unlinkSync(tempBackupPath);
        }
        res.json({ success: true, message: 'Database restored successfully' });
    }
    catch (err) {
        console.error('[restore] Error:', err);
        // Attempt recovery
        try {
            if (fs.existsSync(tempBackupPath)) {
                closeLiveDb();
                fs.copyFileSync(tempBackupPath, DATABASE_FILE_PATH);
                reopenLiveDb();
                fs.unlinkSync(tempBackupPath);
            }
        }
        catch (recoveryErr) {
            console.error('[restore] Recovery failed:', recoveryErr);
        }
        res.status(500).json({ error: 'Restore failed. Your original data has been preserved.' });
    }
});
// --- Live database full reset (irreversible) ---
app.post('/api/reset/live', async (_req, res) => {
    try {
        const db = liveDb;
        // Delete all data in correct order (children before parents to respect foreign keys)
        await db.delete(priceListItems);
        await db.delete(priceLists);
        await db.delete(specialPricing);
        await db.delete(priceLevelItems);
        await db.delete(priceLevels);
        await db.delete(billOfMaterials);
        await db.delete(intermediateMaterialBom);
        await db.delete(materialPriceHistory);
        await db.delete(products);
        await db.delete(materials);
        await db.delete(customers);
        await db.delete(activityLog);
        await db.delete(exchangeRates);
        await db.delete(currencies);
        await db.delete(settings);
        res.json({
            success: true,
            message: 'All data has been reset.',
        });
    }
    catch (error) {
        console.error('[reset] Live reset error:', error);
        res.status(500).json({
            error: 'Reset failed. Your data has not been changed.',
        });
    }
});
// ============================================
// SETTINGS ENDPOINTS
// ============================================
app.get('/api/pin/status', async (_req, res) => {
    try {
        const pinHash = await getStoredPinHash();
        res.json({ hasPIN: Boolean(pinHash) });
    }
    catch {
        res.status(500).json({ error: 'Failed to check PIN status' });
    }
});
app.post('/api/pin/set', async (req, res) => {
    try {
        const { pin, currentPin } = req.body;
        if (typeof pin !== 'string' || !isValidPin(pin)) {
            return res.status(400).json({ error: 'PIN must be 4 to 6 digits' });
        }
        const existingHash = await getStoredPinHash();
        if (existingHash) {
            if (typeof currentPin !== 'string' || !isValidPin(currentPin)) {
                return res.status(400).json({ error: 'Current PIN is required' });
            }
            const currentPinMatches = await bcrypt.compare(currentPin, existingHash);
            if (!currentPinMatches) {
                return res.status(400).json({ error: 'Current PIN is incorrect' });
            }
        }
        const pinHash = await bcrypt.hash(pin, 12);
        await saveSettingValue(PIN_SETTING_KEY, pinHash);
        return res.json({ success: true });
    }
    catch {
        return res.status(500).json({ error: 'Failed to set PIN' });
    }
});
app.post('/api/pin/verify', async (req, res) => {
    try {
        const { pin } = req.body;
        if (typeof pin !== 'string' || !isValidPin(pin)) {
            return res.json({ valid: false });
        }
        const pinHash = await getStoredPinHash();
        if (!pinHash) {
            return res.json({ valid: false });
        }
        const valid = await bcrypt.compare(pin, pinHash);
        return res.json({ valid });
    }
    catch {
        return res.json({ valid: false });
    }
});
app.post('/api/pin/reset', async (_req, res) => {
    res.json({
        message: 'To reset your PIN contact support@priceright.app with your licence key',
    });
});
/** Default values for settings not yet stored in the database. */
const SETTING_DEFAULTS = {
    healthyMarkupThreshold: '20',
};
app.get('/api/settings', async (req, res) => {
    try {
        const allSettings = await getActiveDb().select().from(settings);
        const existingKeys = new Set(allSettings.map((entry) => entry.settingKey));
        const mergedSettings = [...allSettings];
        for (const [settingKey, settingValue] of Object.entries(SETTING_DEFAULTS)) {
            if (!existingKeys.has(settingKey)) {
                mergedSettings.push({
                    id: 0,
                    settingKey,
                    settingValue,
                    updatedAt: new Date(),
                });
            }
        }
        res.json(mergedSettings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
app.get('/api/settings/:key', async (req, res) => {
    try {
        const setting = await getActiveDb().select().from(settings).where(eq(settings.settingKey, req.params.key));
        if (setting.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        res.json(setting[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});
app.post('/api/settings', async (req, res) => {
    try {
        const { settingKey, settingValue } = req.body;
        // Lock base currency once materials exist
        if (settingKey === 'baseCurrency') {
            const existingMaterials = await getActiveDb()
                .select({ id: materials.id })
                .from(materials)
                .limit(1);
            if (existingMaterials.length > 0) {
                return res.status(400).json({
                    error: 'BASE_CURRENCY_LOCKED',
                    message: 'Base currency cannot be changed once materials have been added. To use a different base currency, reset all data in Settings → Data and Backups.',
                });
            }
        }
        const existing = await getActiveDb().select().from(settings).where(eq(settings.settingKey, settingKey));
        if (existing.length > 0) {
            await getActiveDb().update(settings)
                .set({ settingValue, updatedAt: new Date() })
                .where(eq(settings.settingKey, settingKey));
        }
        else {
            await getActiveDb().insert(settings).values({ settingKey, settingValue });
        }
        const updated = await getActiveDb().select().from(settings).where(eq(settings.settingKey, settingKey));
        res.json(updated[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save setting' });
    }
});
// ============================================
// CURRENCIES ENDPOINTS
// ============================================
app.get('/api/currencies', async (req, res) => {
    try {
        const allCurrencies = await getActiveDb().select().from(currencies);
        res.json(allCurrencies);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch currencies' });
    }
});
app.post('/api/currencies', async (req, res) => {
    try {
        const { code, name, symbol } = req.body;
        const result = await getActiveDb().insert(currencies).values({ code, name, symbol }).returning();
        res.json(result[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create currency' });
    }
});
app.put('/api/currencies/:id', async (req, res) => {
    try {
        const { code, name, symbol } = req.body;
        await getActiveDb().update(currencies)
            .set({ code, name, symbol })
            .where(eq(currencies.id, parseInt(req.params.id)));
        const updated = await getActiveDb().select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
        res.json(updated[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update currency' });
    }
});
app.put('/api/currencies/:id/toggle', async (req, res) => {
    try {
        const currency = await getActiveDb().select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
        if (currency.length === 0) {
            return res.status(404).json({ error: 'Currency not found' });
        }
        await getActiveDb().update(currencies)
            .set({ isActive: !currency[0].isActive })
            .where(eq(currencies.id, parseInt(req.params.id)));
        const updated = await getActiveDb().select().from(currencies).where(eq(currencies.id, parseInt(req.params.id)));
        res.json(updated[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to toggle currency' });
    }
});
app.delete('/api/currencies/:id', async (req, res) => {
    try {
        await getActiveDb().delete(currencies).where(eq(currencies.id, parseInt(req.params.id)));
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete currency' });
    }
});
// ============================================
// EXCHANGE RATES ENDPOINTS
// ============================================
app.get('/api/exchange-rates', async (req, res) => {
    try {
        const rates = await getActiveDb().select().from(exchangeRates);
        res.json(rates);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch exchange rates' });
    }
});
app.post('/api/exchange-rates', async (req, res) => {
    try {
        const { currencyId, rateToBase, source } = req.body;
        const validatedRate = parsePositiveExchangeRate(rateToBase);
        if (validatedRate == null) {
            return res.status(400).json({ error: EXCHANGE_RATE_MUST_BE_POSITIVE });
        }
        const result = await getActiveDb().insert(exchangeRates).values({
            currencyId,
            rateToBase: validatedRate,
            source: source || 'manual'
        }).returning();
        res.json(result[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create exchange rate' });
    }
});
app.put('/api/exchange-rates/:currencyId', async (req, res) => {
    try {
        const { rateToBase } = req.body;
        const validatedRate = parsePositiveExchangeRate(rateToBase);
        if (validatedRate == null) {
            return res.status(400).json({ error: EXCHANGE_RATE_MUST_BE_POSITIVE });
        }
        const currencyId = parseInt(req.params.currencyId);
        const existing = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
        const oldRateValue = existing.length > 0 ? Number(existing[0].rateToBase || 0) : validatedRate;
        if (existing.length > 0) {
            await getActiveDb().update(exchangeRates)
                .set({ rateToBase: validatedRate, effectiveDate: new Date() })
                .where(eq(exchangeRates.currencyId, currencyId));
        }
        else {
            await getActiveDb().insert(exchangeRates).values({ currencyId, rateToBase: validatedRate, source: 'manual' });
        }
        const updated = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
        const currencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, currencyId));
        const currencyCode = currencyRows[0]?.code || String(currencyId);
        const newRateValue = Number(updated[0]?.rateToBase || validatedRate);
        const performedBy = await getCurrentUserName();
        try {
            const recalculation = await recalculateMaterialsForCurrency(currencyId);
            await logActivity({
                entityType: 'exchange_rate',
                entityId: currencyId,
                entityName: currencyCode,
                action: 'exchange_rate.updated',
                details: {
                    currencyCode,
                    oldRate: oldRateValue,
                    newRate: newRateValue,
                    productsAffected: recalculation.productsNowNeedsReview ?? 0,
                },
                performedBy,
            });
            res.json({
                success: true,
                rate: updated[0],
                recalculation: {
                    materialsUpdated: recalculation.materialsUpdated,
                    productsReviewed: recalculation.productsReviewed,
                    productsNowNeedsReview: recalculation.productsNowNeedsReview,
                },
            });
        }
        catch (recalculationError) {
            console.error('Error recalculating material prices:', recalculationError);
            await logActivity({
                entityType: 'exchange_rate',
                entityId: currencyId,
                entityName: currencyCode,
                action: 'exchange_rate.updated',
                details: {
                    currencyCode,
                    oldRate: oldRateValue,
                    newRate: newRateValue,
                    productsAffected: 0,
                },
                performedBy,
            });
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
    }
    catch (error) {
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
    }
    catch (error) {
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
        const status = parseStatusFilter(req.query.status);
        const materialType = parseMaterialTypeFilter(req.query.type);
        const { symbol: baseCurrencySymbol } = await resolveBaseCurrency();
        const allMaterials = await db
            .select({
            id: materials.id,
            name: materials.name,
            sku: materials.sku,
            description: materials.description,
            materialType: materials.materialType,
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
            overheadPercentage: materials.overheadPercentage,
            marginPercentage: materials.marginPercentage,
            intermediateCostMode: materials.intermediateCostMode,
            yieldPercentage: materials.yieldPercentage,
            calculatedCostPerUnit: materials.calculatedCostPerUnit,
            supplier: materials.supplier,
            isActive: materials.isActive,
            createdAt: materials.createdAt,
            updatedAt: materials.updatedAt,
        })
            .from(materials)
            .leftJoin(currencies, eq(materials.purchaseCurrencyId, currencies.id))
            .where(and(status === 'all'
            ? sql `1=1`
            : eq(materials.isActive, status === 'active'), materialType === 'all'
            ? sql `1=1`
            : eq(materials.materialType, materialType)));
        // Add base currency symbol to each material
        const materialsWithBaseCurrency = allMaterials.map(m => ({
            ...m,
            baseCurrencySymbol,
        }));
        res.json(materialsWithBaseCurrency);
    }
    catch (error) {
        console.error('[materials] GET error:', error);
        res.status(500).json({ error: 'Failed to fetch materials' });
    }
});
app.post('/api/materials', async (req, res) => {
    try {
        const { name, sku, description, category, unit, bulkQuantity, bulkPrice, purchaseCurrencyId, supplier, materialType, overheadPercentage, marginPercentage, intermediateCostMode, yieldPercentage, calculatedCostPerUnit, laborCost, } = req.body;
        const resolvedMaterialType = materialType === 'intermediate' ? 'intermediate' : 'primary';
        const baseCurrency = await resolveBaseCurrency();
        // Get exchange rate
        const resolvedPurchaseCurrencyId = resolvedMaterialType === 'intermediate'
            ? baseCurrency.id
            : Number(purchaseCurrencyId || baseCurrency.id);
        let exchangeRate = 1;
        if (resolvedPurchaseCurrencyId !== baseCurrency.id) {
            const rate = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, resolvedPurchaseCurrencyId));
            if (rate.length > 0) {
                exchangeRate = parseFloat(rate[0].rateToBase.toString());
            }
        }
        // Calculate prices
        const normalizedBulkQuantity = Number(bulkQuantity) > 0 ? Number(bulkQuantity) : 1;
        const normalizedBulkPrice = Number(bulkPrice) >= 0 ? Number(bulkPrice) : 0;
        const intermediateCost = Number(calculatedCostPerUnit || 0);
        const normalizedOverhead = Number(overheadPercentage || 0);
        const normalizedMargin = Number(marginPercentage || 0);
        const normalizedLaborCost = Number(laborCost || 0);
        const normalizedYield = Number(yieldPercentage || 100);
        const normalizedIntermediateCostMode = resolvedMaterialType === 'intermediate'
            ? (intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield')
            : 'yield';
        const priceInPurchaseCurrency = resolvedMaterialType === 'intermediate'
            ? intermediateCost * normalizedBulkQuantity
            : normalizedBulkPrice;
        const priceInBaseCurrency = resolvedMaterialType === 'intermediate'
            ? intermediateCost * normalizedBulkQuantity
            : normalizedBulkPrice * exchangeRate;
        const unitPrice = resolvedMaterialType === 'intermediate'
            ? intermediateCost
            : priceInBaseCurrency / normalizedBulkQuantity;
        // Insert material
        const result = await getActiveDb().insert(materials).values({
            name,
            sku: sku || null,
            description: description || null,
            materialType: resolvedMaterialType,
            category,
            unit,
            bulkQuantity: normalizedBulkQuantity,
            bulkPrice: priceInPurchaseCurrency,
            purchaseCurrencyId: resolvedPurchaseCurrencyId,
            priceInPurchaseCurrency,
            priceInBaseCurrency,
            unitPrice,
            overheadPercentage: normalizedOverhead,
            laborCost: normalizedLaborCost,
            marginPercentage: normalizedMargin,
            intermediateCostMode: normalizedIntermediateCostMode,
            yieldPercentage: normalizedYield,
            calculatedCostPerUnit: unitPrice,
            supplier: '',
        }).returning();
        // Save price history
        await getActiveDb().insert(materialPriceHistory).values({
            materialId: result[0].id,
            purchaseCurrencyId: resolvedPurchaseCurrencyId,
            priceInPurchaseCurrency,
            priceInBaseCurrency,
        });
        await logActivity({
            entityType: 'material',
            entityId: result[0].id,
            entityName: result[0].name,
            action: 'material.created',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json(result[0]);
    }
    catch (error) {
        console.error(error);
        if (error instanceof Error && error.message === 'No base currency configured') {
            return res.status(400).json({ error: 'No base currency configured' });
        }
        res.status(500).json({ error: 'Failed to create material' });
    }
});
app.put('/api/materials/:id', async (req, res) => {
    try {
        const materialId = parseInt(req.params.id);
        if (!Number.isInteger(materialId)) {
            return res.status(400).json({ error: 'Invalid material id' });
        }
        const existingRows = await getActiveDb().select().from(materials).where(eq(materials.id, materialId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }
        const existing = existingRows[0];
        const previousUnitPrice = Number(existing.unitPrice || 0);
        const name = req.body?.name ?? existing.name;
        const sku = req.body?.sku ?? existing.sku;
        const description = req.body?.description ?? existing.description;
        const materialType = req.body?.materialType === 'intermediate' ? 'intermediate' : (existing.materialType === 'intermediate' ? 'intermediate' : 'primary');
        const category = req.body?.category ?? existing.category;
        const unit = req.body?.unit ?? existing.unit;
        const bulkQuantity = Number(req.body?.bulkQuantity ?? existing.bulkQuantity);
        const bulkPrice = Number(req.body?.bulkPrice ?? existing.bulkPrice);
        const purchaseCurrencyIdInput = Number(req.body?.purchaseCurrencyId ?? existing.purchaseCurrencyId);
        const purchaseCurrencyId = purchaseCurrencyIdInput > 0
            ? purchaseCurrencyIdInput
            : Number(existing.purchaseCurrencyId);
        const overheadPercentage = Number(req.body?.overheadPercentage ?? existing.overheadPercentage ?? 0);
        const laborCost = Number(req.body?.laborCost ?? existing.laborCost ?? 0);
        const marginPercentage = Number(req.body?.marginPercentage ?? existing.marginPercentage ?? 0);
        const intermediateCostMode = req.body?.intermediateCostMode ?? existing.intermediateCostMode ?? 'yield';
        const yieldPercentage = Number(req.body?.yieldPercentage ?? existing.yieldPercentage ?? 100);
        const calculatedCostPerUnit = Number(req.body?.calculatedCostPerUnit ?? existing.calculatedCostPerUnit ?? existing.unitPrice ?? 0);
        const supplier = '';
        const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : Boolean(existing.isActive);
        const shouldRecalculatePrice = req.body?.bulkQuantity !== undefined
            || req.body?.bulkPrice !== undefined
            || req.body?.purchaseCurrencyId !== undefined;
        const shouldRecalculateIntermediateCost = materialType === 'intermediate' && (shouldRecalculatePrice
            || req.body?.laborCost !== undefined
            || req.body?.overheadPercentage !== undefined
            || req.body?.yieldPercentage !== undefined
            || req.body?.intermediateCostMode !== undefined
            || req.body?.bulkQuantity !== undefined);
        const baseCurrency = await resolveBaseCurrency();
        // Get exchange rate
        const resolvedPurchaseCurrencyId = materialType === 'intermediate' ? baseCurrency.id : purchaseCurrencyId;
        let exchangeRate = 1;
        if (resolvedPurchaseCurrencyId !== baseCurrency.id) {
            const rate = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, resolvedPurchaseCurrencyId));
            if (rate.length > 0) {
                exchangeRate = parseFloat(rate[0].rateToBase.toString());
            }
        }
        // Calculate prices
        const normalizedBulkQuantity = bulkQuantity > 0 ? bulkQuantity : 1;
        const normalizedBulkPrice = bulkPrice >= 0 ? bulkPrice : 0;
        const priceInPurchaseCurrency = materialType === 'intermediate'
            ? calculatedCostPerUnit * normalizedBulkQuantity
            : normalizedBulkPrice;
        const priceInBaseCurrency = materialType === 'intermediate'
            ? calculatedCostPerUnit * normalizedBulkQuantity
            : normalizedBulkPrice * exchangeRate;
        const unitPrice = materialType === 'intermediate'
            ? calculatedCostPerUnit
            : priceInBaseCurrency / normalizedBulkQuantity;
        // Update material
        await getActiveDb().update(materials).set({
            name,
            sku: sku || null,
            description: description || null,
            materialType,
            category,
            unit,
            bulkQuantity: normalizedBulkQuantity,
            bulkPrice: priceInPurchaseCurrency,
            purchaseCurrencyId: resolvedPurchaseCurrencyId,
            priceInPurchaseCurrency,
            priceInBaseCurrency,
            unitPrice,
            overheadPercentage,
            laborCost,
            marginPercentage,
            intermediateCostMode: materialType === 'intermediate'
                ? (intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield')
                : 'yield',
            yieldPercentage,
            calculatedCostPerUnit: unitPrice,
            supplier,
            isActive,
            updatedAt: new Date(),
        }).where(eq(materials.id, materialId));
        const unitPriceChanged = Math.abs(unitPrice - previousUnitPrice) > 0.0001;
        let intermediateMaterialsUpdated = 0;
        if (materialType === 'primary' && (shouldRecalculatePrice || unitPriceChanged)) {
            try {
                const cascadeSummary = await propagatePrimaryMaterialChange(materialId);
                intermediateMaterialsUpdated = cascadeSummary.intermediateUpdatedIds.length;
            }
            catch (propagateError) {
                console.error('[materials] Failed to cascade intermediate costs after primary update:', materialId, propagateError);
            }
        }
        else if (shouldRecalculateIntermediateCost || (materialType === 'intermediate' && unitPriceChanged)) {
            try {
                await recalculateIntermediateMaterialWithCascade(materialId);
            }
            catch (recalcError) {
                console.error('[materials] Failed to recalculate intermediate material after update:', materialId, recalcError);
            }
        }
        if (shouldRecalculatePrice) {
            if (!Number.isInteger(resolvedPurchaseCurrencyId) || resolvedPurchaseCurrencyId <= 0) {
                return res.status(400).json({ error: 'A valid purchase currency is required before saving price changes' });
            }
            await getActiveDb().insert(materialPriceHistory).values({
                materialId,
                purchaseCurrencyId: resolvedPurchaseCurrencyId,
                priceInPurchaseCurrency,
                priceInBaseCurrency,
            });
            const purchaseCurrencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, resolvedPurchaseCurrencyId));
            const purchaseCurrencyCode = purchaseCurrencyRows[0]?.code || '';
            const updatedMaterial = {
                ...existing,
                name,
                unitPrice,
                priceInBaseCurrency,
            };
            await logActivity({
                entityType: 'material',
                entityId: materialId,
                entityName: updatedMaterial.name,
                action: 'material.cost_updated',
                details: {
                    materialName: updatedMaterial.name,
                    oldUnitPrice: previousUnitPrice,
                    newUnitPrice: Number(updatedMaterial.unitPrice || 0),
                    currency: purchaseCurrencyCode,
                    oldGhsPrice: Number(existing.priceInBaseCurrency || 0),
                    newGhsPrice: Number(updatedMaterial.priceInBaseCurrency || 0),
                },
                performedBy: await getCurrentUserName(),
            });
        }
        const updated = await getActiveDb().select().from(materials).where(eq(materials.id, materialId));
        res.json({
            ...updated[0],
            intermediateMaterialsUpdated,
        });
    }
    catch (error) {
        console.error('Error updating material:', error);
        if (error instanceof Error && error.message === 'No base currency configured') {
            return res.status(400).json({ error: 'No base currency configured' });
        }
        res.status(500).json({ error: 'Failed to update material' });
    }
});
app.delete('/api/materials/bulk', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }
        const materialIds = ids.filter((id) => Number.isInteger(id));
        if (materialIds.length === 0) {
            return res.status(400).json({ error: 'No valid material IDs provided' });
        }
        for (const materialId of materialIds) {
            const usageRows = await db
                .select({
                productId: products.id,
                productName: products.name,
            })
                .from(billOfMaterials)
                .innerJoin(products, eq(billOfMaterials.productId, products.id))
                .where(eq(billOfMaterials.materialId, materialId));
            if (usageRows.length > 0) {
                const materialRows = await db
                    .select({ name: materials.name })
                    .from(materials)
                    .where(eq(materials.id, materialId));
                const uniqueProductNames = Array.from(new Set(usageRows.map((row) => String(row.productName || '').trim()).filter(Boolean)));
                return res.status(400).json({
                    error: `Cannot delete material - used in ${uniqueProductNames.length} products: ${uniqueProductNames.join(', ')}`,
                    code: 'MATERIAL_IN_USE',
                    details: {
                        materialId,
                        materialName: materialRows[0]?.name ?? `Material #${materialId}`,
                        productCount: uniqueProductNames.length,
                        products: uniqueProductNames,
                    },
                });
            }
            const intermediateUsageRows = await db
                .select({ id: intermediateMaterialBom.id })
                .from(intermediateMaterialBom)
                .where(and(eq(intermediateMaterialBom.componentMaterialId, materialId), sql `${intermediateMaterialBom.intermediateMaterialId} <> ${materialId}`));
            if (intermediateUsageRows.length > 0) {
                return res.status(400).json({
                    error: 'Cannot delete material - used in intermediate material BOM',
                    code: 'MATERIAL_IN_USE',
                });
            }
        }
        await getActiveDb().transaction(async (tx) => {
            for (const materialId of materialIds) {
                await tx.delete(materials).where(eq(materials.id, materialId));
            }
        });
        res.json({ deleted: materialIds.length });
    }
    catch (error) {
        console.error('Bulk delete materials failed:', error);
        res.status(500).json({ error: 'Failed to bulk delete materials' });
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
            const uniqueProductNames = Array.from(new Set(usageRows.map((row) => String(row.productName || '').trim()).filter(Boolean)));
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
        const intermediateUsageRows = await db
            .select({ id: intermediateMaterialBom.id })
            .from(intermediateMaterialBom)
            .where(and(eq(intermediateMaterialBom.componentMaterialId, materialId), sql `${intermediateMaterialBom.intermediateMaterialId} <> ${materialId}`));
        if (intermediateUsageRows.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete material - used in intermediate material BOM',
                code: 'MATERIAL_IN_USE',
            });
        }
        await getActiveDb().delete(materials).where(eq(materials.id, materialId));
        res.json({ success: true });
    }
    catch (error) {
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
            .orderBy(sql `${materialPriceHistory.changedAt} DESC`);
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});
// ============================================
// REPORTS ENDPOINTS
// ============================================
app.get('/api/reports/top-cost-drivers', async (_req, res) => {
    try {
        const rows = await db
            .select({
            materialId: materials.id,
            materialName: materials.name,
            category: materials.category,
            unitCost: materials.unitPrice,
            bomUsageCount: sql `count(${billOfMaterials.id})`.mapWith(Number),
            totalContribution: sql `sum(${billOfMaterials.quantity} * ${materials.unitPrice})`.mapWith(Number),
        })
            .from(billOfMaterials)
            .innerJoin(products, eq(billOfMaterials.productId, products.id))
            .innerJoin(materials, eq(billOfMaterials.materialId, materials.id))
            .where(and(eq(products.isActive, true), eq(materials.isActive, true)))
            .groupBy(materials.id)
            .orderBy(sql `sum(${billOfMaterials.quantity} * ${materials.unitPrice}) desc`);
        const normalizedRows = rows.map((row) => ({
            materialId: row.materialId,
            materialName: row.materialName,
            category: row.category || 'Uncategorised',
            unitCost: Number(row.unitCost) || 0,
            bomUsageCount: Number(row.bomUsageCount) || 0,
            totalContribution: Number(row.totalContribution) || 0,
        }));
        const totalWeightedCost = normalizedRows.reduce((sum, row) => sum + row.totalContribution, 0);
        const sortedRows = normalizedRows
            .map((row) => ({
            ...row,
            percentOfTotal: totalWeightedCost > 0 ? (row.totalContribution / totalWeightedCost) * 100 : 0,
        }))
            .sort((a, b) => b.totalContribution - a.totalContribution);
        res.json({
            rows: sortedRows,
            totalMaterialsInBoms: sortedRows.length,
            totalWeightedCost,
            mostImpactfulMaterial: sortedRows[0]?.materialName || '—',
        });
    }
    catch (error) {
        console.error('[reports] top-cost-drivers error:', error);
        res.status(500).json({ error: 'Failed to fetch top cost drivers report' });
    }
});
function parseVolatilityPeriodDays(period) {
    const parsed = Number.parseInt(String(period ?? '90'), 10);
    if (parsed === 30 || parsed === 90 || parsed === 180 || parsed === 365) {
        return parsed;
    }
    return 90;
}
function parseReportTimestamp(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
        const maybeMs = value > 1000000000000 ? value : value * 1000;
        const fromNumber = new Date(maybeMs);
        return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && String(value).trim() !== '') {
        const maybeMs = numericValue > 1000000000000 ? numericValue : numericValue * 1000;
        const fromNumber = new Date(maybeMs);
        return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }
    const fromString = new Date(String(value));
    return Number.isNaN(fromString.getTime()) ? null : fromString;
}
function getMaterialCostAtPeriodStart(historyAsc, periodStart) {
    if (historyAsc.length === 0)
        return null;
    let costAtStart = null;
    for (const entry of historyAsc) {
        const changedAt = parseReportTimestamp(entry.changedAt);
        if (changedAt && changedAt <= periodStart) {
            costAtStart = Number(entry.priceInBaseCurrency) || 0;
        }
    }
    if (costAtStart === null) {
        costAtStart = Number(historyAsc[0].priceInBaseCurrency) || 0;
    }
    return costAtStart;
}
app.get('/api/reports/price-volatility', async (req, res) => {
    try {
        const periodDays = parseVolatilityPeriodDays(req.query.period);
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - periodDays);
        const activeMaterials = await db
            .select({
            id: materials.id,
            name: materials.name,
            category: materials.category,
            unit: materials.unit,
            unitPrice: materials.unitPrice,
        })
            .from(materials)
            .where(eq(materials.isActive, true));
        const materialIds = activeMaterials.map((material) => material.id);
        const historyByMaterialId = new Map();
        if (materialIds.length > 0) {
            const historyRows = await db
                .select({
                materialId: materialPriceHistory.materialId,
                priceInBaseCurrency: materialPriceHistory.priceInBaseCurrency,
                changedAt: materialPriceHistory.changedAt,
            })
                .from(materialPriceHistory)
                .where(inArray(materialPriceHistory.materialId, materialIds))
                .orderBy(asc(materialPriceHistory.materialId), asc(materialPriceHistory.changedAt));
            for (const row of historyRows) {
                const existing = historyByMaterialId.get(row.materialId) || [];
                existing.push({
                    changedAt: row.changedAt,
                    priceInBaseCurrency: row.priceInBaseCurrency,
                });
                historyByMaterialId.set(row.materialId, existing);
            }
        }
        const volatilityRows = [];
        for (const material of activeMaterials) {
            const historyAsc = historyByMaterialId.get(material.id) || [];
            if (historyAsc.length === 0)
                continue;
            const changesInPeriod = historyAsc.filter((entry) => {
                const changedAt = parseReportTimestamp(entry.changedAt);
                return changedAt != null && changedAt >= periodStart;
            });
            if (changesInPeriod.length === 0)
                continue;
            const costAtStart = getMaterialCostAtPeriodStart(historyAsc, periodStart);
            if (costAtStart == null)
                continue;
            const currentCost = Number(material.unitPrice) || 0;
            const changeAmount = currentCost - costAtStart;
            const changePercent = costAtStart > 0 ? (changeAmount / costAtStart) * 100 : 0;
            volatilityRows.push({
                materialName: material.name,
                category: material.category || 'Uncategorised',
                unit: material.unit || '—',
                costAtStart,
                currentCost,
                changeAmount,
                changePercent,
            });
        }
        volatilityRows.sort((a, b) => b.changePercent - a.changePercent);
        const averageChangePercent = volatilityRows.length > 0
            ? volatilityRows.reduce((sum, row) => sum + row.changePercent, 0) / volatilityRows.length
            : 0;
        const biggestIncrease = volatilityRows.reduce((best, row) => {
            if (!best || row.changePercent > best.changePercent)
                return row;
            return best;
        }, null);
        const biggestDecrease = volatilityRows.reduce((best, row) => {
            if (!best || row.changePercent < best.changePercent)
                return row;
            return best;
        }, null);
        res.json({
            rows: volatilityRows,
            materialsWithChanges: volatilityRows.length,
            averageChangePercent,
            biggestIncreaseName: biggestIncrease?.materialName || '—',
            biggestIncreasePercent: biggestIncrease?.changePercent ?? 0,
            biggestDecreaseName: biggestDecrease?.materialName || '—',
            biggestDecreasePercent: biggestDecrease?.changePercent ?? 0,
            endpointAvailable: true,
        });
    }
    catch (error) {
        console.error('[reports] price-volatility error:', error);
        res.status(500).json({ error: 'Failed to fetch price volatility report' });
    }
});
// Check material usage in BOMs
app.post('/api/materials/check-usage', async (req, res) => {
    try {
        const { materialIds } = req.body;
        if (!Array.isArray(materialIds) || materialIds.length === 0) {
            return res.status(400).json({ error: 'materialIds must be a non-empty array' });
        }
        const canDelete = [];
        const inUse = [];
        for (const materialId of materialIds) {
            const [checkedMaterial] = await db
                .select({ name: materials.name, unit: materials.unit })
                .from(materials)
                .where(eq(materials.id, materialId));
            const materialUnit = checkedMaterial?.unit ?? '';
            const materialName = checkedMaterial?.name ?? 'Unknown';
            // Find all products that use this material in their BOM
            const usageData = await db
                .select({
                materialId: billOfMaterials.materialId,
                materialName: materials.name,
                productId: products.id,
                productName: products.name,
                quantity: billOfMaterials.quantity,
            })
                .from(billOfMaterials)
                .leftJoin(materials, eq(billOfMaterials.materialId, materials.id))
                .leftJoin(products, eq(billOfMaterials.productId, products.id))
                .where(eq(billOfMaterials.materialId, materialId));
            const intermediateUsage = await db
                .select({
                intermediateId: intermediateMaterialBom.intermediateMaterialId,
                intermediateName: materials.name,
                quantity: intermediateMaterialBom.quantity,
            })
                .from(intermediateMaterialBom)
                .leftJoin(materials, eq(intermediateMaterialBom.intermediateMaterialId, materials.id))
                .where(eq(intermediateMaterialBom.componentMaterialId, materialId));
            if (usageData.length === 0 && intermediateUsage.length === 0) {
                canDelete.push(materialId);
            }
            else {
                const productSet = new Set();
                const productEntries = [];
                for (const usage of usageData) {
                    const key = `${usage.productId}-${usage.productName}`;
                    if (!productSet.has(key)) {
                        productSet.add(key);
                        productEntries.push({
                            productId: Number(usage.productId),
                            productName: String(usage.productName || 'Unknown Product'),
                            quantity: Number(usage.quantity ?? 0),
                            unit: materialUnit,
                        });
                    }
                }
                for (const usage of intermediateUsage) {
                    const label = `Intermediate: ${usage.intermediateName || usage.intermediateId}`;
                    if (!productSet.has(label)) {
                        productSet.add(label);
                        productEntries.push({
                            productId: Number(usage.intermediateId),
                            productName: label,
                            quantity: Number(usage.quantity ?? 0),
                            unit: materialUnit,
                        });
                    }
                }
                inUse.push({
                    materialId,
                    materialName: usageData[0]?.materialName || materialName,
                    productCount: productSet.size,
                    products: productEntries,
                });
            }
        }
        res.json({ canDelete, inUse });
    }
    catch (error) {
        console.error('Error checking material usage:', error);
        res.status(500).json({ error: 'Failed to check material usage' });
    }
});
app.post('/api/materials/import', async (req, res) => {
    try {
        const payload = req.body;
        const rows = Array.isArray(payload?.materials) ? payload.materials : null;
        if (!rows) {
            return res.status(400).json({ error: 'Request body must include a materials array' });
        }
        const baseCurrencySetting = await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
        const baseCurrencyCode = (baseCurrencySetting[0]?.settingValue || 'GHS').trim().toUpperCase();
        const allCurrencies = await db
            .select({
            id: currencies.id,
            code: currencies.code,
        })
            .from(currencies);
        const currencyByCode = new Map(allCurrencies.map((currency) => [String(currency.code || '').trim().toUpperCase(), currency]));
        const baseCurrency = currencyByCode.get(baseCurrencyCode);
        if (!baseCurrency) {
            return res.status(400).json({ error: `Base currency ${baseCurrencyCode} not found` });
        }
        const latestExchangeRateRows = await db
            .select({
            currencyId: exchangeRates.currencyId,
            rateToBase: exchangeRates.rateToBase,
        })
            .from(exchangeRates)
            .orderBy(desc(exchangeRates.effectiveDate));
        const latestRateByCurrencyId = new Map();
        for (const rateRow of latestExchangeRateRows) {
            const currencyId = Number(rateRow.currencyId);
            if (latestRateByCurrencyId.has(currencyId)) {
                continue;
            }
            const numericRate = Number(rateRow.rateToBase);
            latestRateByCurrencyId.set(currencyId, numericRate);
        }
        const existingPrimaryMaterials = await db
            .select({
            id: materials.id,
            name: materials.name,
            overheadPercentage: materials.overheadPercentage,
            marginPercentage: materials.marginPercentage,
            yieldPercentage: materials.yieldPercentage,
        })
            .from(materials)
            .where(eq(materials.materialType, 'primary'));
        const existingMaterialByName = new Map(existingPrimaryMaterials.map((material) => [String(material.name || '').trim().toLowerCase(), material]));
        const normalizeString = (value) => String(value ?? '').trim();
        const errors = [];
        const historyRows = [];
        let imported = 0;
        let updated = 0;
        const updatedMaterialIds = [];
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index] || {};
            const rowNumber = index + 1;
            const name = normalizeString(row.name);
            const category = normalizeString(row.category);
            const unit = normalizeString(row.unit);
            const currencyCodeInput = normalizeString(row.currencyCode).toUpperCase();
            const bulkPrice = Number(row.bulkPrice);
            const bulkQuantity = Number(row.bulkQuantity);
            if (!name) {
                errors.push({ row: rowNumber, name: '', error: 'Material name is required' });
                continue;
            }
            if (!category) {
                errors.push({ row: rowNumber, name, error: 'Category is required' });
                continue;
            }
            if (!unit) {
                errors.push({ row: rowNumber, name, error: 'Unit is required' });
                continue;
            }
            if (!Number.isFinite(bulkPrice) || bulkPrice <= 0) {
                errors.push({ row: rowNumber, name, error: 'Bulk price must be a positive number' });
                continue;
            }
            if (!Number.isFinite(bulkQuantity) || bulkQuantity <= 0) {
                errors.push({ row: rowNumber, name, error: 'Bulk quantity must be a positive number' });
                continue;
            }
            const resolvedCurrencyCode = currencyCodeInput || baseCurrency.code;
            const selectedCurrency = currencyByCode.get(resolvedCurrencyCode);
            if (!selectedCurrency) {
                errors.push({ row: rowNumber, name, error: `Currency code \"${resolvedCurrencyCode}\" not found` });
                continue;
            }
            let exchangeRate = 1;
            if (selectedCurrency.id !== baseCurrency.id) {
                const rate = latestRateByCurrencyId.get(Number(selectedCurrency.id));
                if (rate === undefined) {
                    errors.push({ row: rowNumber, name, error: `No exchange rate found for currency ${selectedCurrency.code}` });
                    continue;
                }
                exchangeRate = Number(rate);
                if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
                    errors.push({ row: rowNumber, name, error: `Invalid exchange rate for currency ${selectedCurrency.code}` });
                    continue;
                }
            }
            const unitPriceInCurrency = bulkPrice / bulkQuantity;
            const unitPrice = unitPriceInCurrency * exchangeRate;
            const priceInPurchaseCurrency = bulkPrice;
            const priceInBaseCurrency = bulkPrice * exchangeRate;
            const normalizedName = name.toLowerCase();
            const existing = existingMaterialByName.get(normalizedName);
            if (existing) {
                await db
                    .update(materials)
                    .set({
                    name,
                    category,
                    unit,
                    materialType: 'primary',
                    bulkQuantity,
                    bulkPrice,
                    purchaseCurrencyId: selectedCurrency.id,
                    priceInPurchaseCurrency,
                    priceInBaseCurrency,
                    unitPrice,
                    calculatedCostPerUnit: unitPrice,
                    supplier: '',
                    isActive: true,
                    updatedAt: new Date(),
                    overheadPercentage: Number(existing.overheadPercentage || 0),
                    marginPercentage: Number(existing.marginPercentage || 0),
                    yieldPercentage: Number(existing.yieldPercentage || 100),
                })
                    .where(eq(materials.id, existing.id));
                historyRows.push({
                    materialId: existing.id,
                    purchaseCurrencyId: selectedCurrency.id,
                    priceInPurchaseCurrency,
                    priceInBaseCurrency,
                });
                updatedMaterialIds.push(existing.id);
                updated += 1;
            }
            else {
                const created = await getActiveDb().insert(materials).values({
                    name,
                    sku: null,
                    description: null,
                    materialType: 'primary',
                    category,
                    unit,
                    bulkQuantity,
                    bulkPrice,
                    purchaseCurrencyId: selectedCurrency.id,
                    priceInPurchaseCurrency,
                    priceInBaseCurrency,
                    unitPrice,
                    overheadPercentage: 0,
                    marginPercentage: 0,
                    yieldPercentage: 100,
                    calculatedCostPerUnit: unitPrice,
                    supplier: '',
                    isActive: true,
                }).returning();
                const createdMaterial = created[0];
                historyRows.push({
                    materialId: createdMaterial.id,
                    purchaseCurrencyId: selectedCurrency.id,
                    priceInPurchaseCurrency,
                    priceInBaseCurrency,
                });
                existingMaterialByName.set(normalizedName, {
                    id: createdMaterial.id,
                    name,
                    overheadPercentage: 0,
                    marginPercentage: 0,
                    yieldPercentage: 100,
                });
                imported += 1;
            }
        }
        // Keep insert batches below SQLite parameter limits.
        const HISTORY_BATCH_SIZE = 150;
        for (let index = 0; index < historyRows.length; index += HISTORY_BATCH_SIZE) {
            const batch = historyRows.slice(index, index + HISTORY_BATCH_SIZE);
            await getActiveDb().insert(materialPriceHistory).values(batch);
        }
        const uniqueUpdatedMaterialIds = Array.from(new Set(updatedMaterialIds));
        for (const materialId of uniqueUpdatedMaterialIds) {
            try {
                await propagatePrimaryMaterialChange(materialId);
            }
            catch (propagateErr) {
                console.error('[import] Intermediate cost cascade failed for material', materialId, propagateErr);
            }
        }
        const skipped = errors.length;
        return res.json({
            success: true,
            imported,
            updated,
            skipped,
            errors,
        });
    }
    catch (error) {
        console.error('Error importing materials:', error);
        return res.status(500).json({ error: 'Failed to import materials' });
    }
});
app.delete('/api/intermediate-materials/bulk', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }
        await getActiveDb()
            .delete(materials)
            .where(and(inArray(materials.id, ids), eq(materials.materialType, 'intermediate')));
        return res.json({ deleted: ids.length });
    }
    catch {
        return res.status(500).json({ error: 'Failed to delete' });
    }
});
// ============================================
// PRODUCTS ENDPOINTS
// ============================================
async function calculateOptimalPricePerUnit(productId) {
    const snapshot = await calculateProductCostSnapshot(productId);
    return snapshot.optimalPrice;
}
async function calculateProductCostSnapshot(productId) {
    const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
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
    const { totalCost: materialsLaborOverheadTotal } = calculateProductionCost({
        materialCost: totalMaterialCost,
        laborCost: Number(product.laborCost || 0),
        overheadPercentage: parseFloat(product.overheadPercentage.toString()),
    });
    const otherCosts = parseFloat(product.otherDirectCosts?.toString() || '0');
    const totalCost = materialsLaborOverheadTotal + otherCosts;
    // Markup formula: optimal price = totalCost × (1 + margin%)
    // The margin% here means profit on cost (markup), not profit on sales.
    // Example: cost GHS 2.41, markup 20% -> optimal = GHS 2.89
    // Gross margin at that price = (2.89-2.41)/2.89 = 16.6%
    const profitAmount = totalCost * (parseFloat(product.profitMargin.toString()) / 100);
    const recommendedPrice = totalCost + profitAmount;
    const safeYield = safeBatchYield(product.batchYield);
    const perUnitMaterialCost = product.productionMode === 'batch'
        ? totalMaterialCost / safeYield
        : totalMaterialCost;
    const perUnitOptimalPrice = product.productionMode === 'batch'
        ? recommendedPrice / safeYield
        : recommendedPrice;
    return {
        materialCost: Math.round(perUnitMaterialCost * 100) / 100,
        optimalPrice: Math.round(perUnitOptimalPrice * 100) / 100,
    };
}
let productComputedColumnsCache = null;
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
function persistProductComputedValues(productId, materialCost, optimalPrice) {
    const sqliteClient = getSqliteClient();
    if (!sqliteClient) {
        return;
    }
    const computedColumns = resolveComputedProductColumns();
    const setClauses = [];
    const values = [];
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
async function setNeedsReviewIfOutdated(productId) {
    const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
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
        await getActiveDb().update(products).set({
            approvalStatus: 'needs_review',
            needsReviewReason: 'cost_changed',
            updatedAt: new Date(),
        }).where(eq(products.id, productId));
        return { reviewed: true, movedToNeedsReview: true };
    }
    return { reviewed: true, movedToNeedsReview: false };
}
async function setNeedsReviewForMaterial(materialId) {
    const usage = await db
        .select({ productId: billOfMaterials.productId })
        .from(billOfMaterials)
        .where(eq(billOfMaterials.materialId, materialId));
    const productIds = Array.from(new Set(usage.map((u) => u.productId)));
    const reviewedProductIds = [];
    const productsNowNeedsReviewIds = [];
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
async function hasApprovedPriceLevelReference(productId) {
    const rows = await getActiveDb()
        .select({ id: priceLevelItems.id })
        .from(priceLevelItems)
        .where(and(eq(priceLevelItems.productId, productId), eq(priceLevelItems.status, 'approved')))
        .limit(1);
    return rows.length > 0;
}
async function getStaleApprovedCustomPriceLevelItems(productId) {
    if (!(await hasApprovedPriceLevelReference(productId))) {
        return [];
    }
    return getActiveDb()
        .select({
        priceLevelId: priceLevelItems.priceLevelId,
        priceLevelName: priceLevels.name,
        customPrice: priceLevelItems.customPrice,
    })
        .from(priceLevelItems)
        .innerJoin(priceLevels, eq(priceLevelItems.priceLevelId, priceLevels.id))
        .where(and(eq(priceLevelItems.productId, productId), or(eq(priceLevelItems.overrideType, 'fixed_amount_add'), eq(priceLevelItems.overrideType, 'fixed_amount_deduct'), eq(priceLevelItems.overrideType, 'custom_price')), eq(priceLevelItems.status, 'approved')));
}
async function recalculateIntermediateMaterialCost(intermediateMaterialId) {
    const rows = await getActiveDb().select().from(materials).where(eq(materials.id, intermediateMaterialId));
    if (rows.length === 0) {
        return { recalculated: false, unitPrice: 0, unitPriceChanged: false, reviewedProductIds: [], productsNowNeedsReviewIds: [] };
    }
    const intermediate = rows[0];
    if (intermediate.materialType !== 'intermediate') {
        return {
            recalculated: false,
            unitPrice: Number(intermediate.unitPrice || 0),
            unitPriceChanged: false,
            reviewedProductIds: [],
            productsNowNeedsReviewIds: [],
        };
    }
    const previousUnitPrice = Number(intermediate.unitPrice || 0);
    const bomRows = await db
        .select({
        quantity: intermediateMaterialBom.quantity,
        componentUnitPrice: materials.unitPrice,
    })
        .from(intermediateMaterialBom)
        .innerJoin(materials, eq(intermediateMaterialBom.componentMaterialId, materials.id))
        .where(eq(intermediateMaterialBom.intermediateMaterialId, intermediateMaterialId));
    let baseCost = 0;
    for (const row of bomRows) {
        baseCost += Number(row.quantity || 0) * Number(row.componentUnitPrice || 0);
    }
    const safeBulkQuantity = Math.max(0.0001, Number(intermediate.bulkQuantity || 1));
    const intermediateCostMode = intermediate.intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield';
    const yieldFraction = Math.max(0.01, Number(intermediate.yieldPercentage || 100) / 100);
    const effectiveOutputQuantity = intermediateCostMode === 'completed_output'
        ? safeBulkQuantity
        : safeBulkQuantity * yieldFraction;
    const { totalBatchCost, costPerUnit } = calculateIntermediateCostPerUnit({
        materialCost: baseCost,
        laborCost: Number(intermediate.laborCost || 0),
        overheadPercentage: Number(intermediate.overheadPercentage || 0),
        outputQuantity: effectiveOutputQuantity,
    });
    const calculatedUnitPrice = roundToTwo(costPerUnit);
    const bulkPrice = roundToTwo(totalBatchCost);
    const unitPriceChanged = Math.abs(calculatedUnitPrice - previousUnitPrice) >= 0.0001;
    await getActiveDb().update(materials)
        .set({
        unitPrice: calculatedUnitPrice,
        calculatedCostPerUnit: calculatedUnitPrice,
        bulkPrice,
        priceInPurchaseCurrency: bulkPrice,
        priceInBaseCurrency: bulkPrice,
        updatedAt: new Date(),
    })
        .where(eq(materials.id, intermediateMaterialId));
    let reviewedProductIds = [];
    let productsNowNeedsReviewIds = [];
    if (unitPriceChanged) {
        try {
            const reviewSummary = await setNeedsReviewForMaterial(intermediateMaterialId);
            reviewedProductIds = reviewSummary.reviewedProductIds;
            productsNowNeedsReviewIds = reviewSummary.productsNowNeedsReviewIds;
        }
        catch (reviewError) {
            console.error('[materials] Product review failed for intermediate:', intermediateMaterialId, reviewError);
        }
    }
    return {
        recalculated: true,
        unitPrice: calculatedUnitPrice,
        unitPriceChanged,
        reviewedProductIds,
        productsNowNeedsReviewIds,
    };
}
async function cascadeIntermediateCostsFrom(rootComponentMaterialId) {
    const reviewedProductIds = new Set();
    const productsNowNeedsReviewIds = new Set();
    const intermediateUpdatedIds = [];
    const visited = new Set();
    const queue = [rootComponentMaterialId];
    while (queue.length > 0) {
        const componentMaterialId = queue.shift();
        const intermediateLinks = await db
            .select({ intermediateMaterialId: intermediateMaterialBom.intermediateMaterialId })
            .from(intermediateMaterialBom)
            .where(eq(intermediateMaterialBom.componentMaterialId, componentMaterialId));
        const dependentIds = Array.from(new Set(intermediateLinks.map((link) => link.intermediateMaterialId)));
        for (const intermediateId of dependentIds) {
            if (visited.has(intermediateId))
                continue;
            visited.add(intermediateId);
            const recalc = await recalculateIntermediateMaterialCost(intermediateId);
            if (!recalc.recalculated)
                continue;
            intermediateUpdatedIds.push(intermediateId);
            for (const productId of recalc.reviewedProductIds) {
                reviewedProductIds.add(productId);
            }
            for (const productId of recalc.productsNowNeedsReviewIds) {
                productsNowNeedsReviewIds.add(productId);
            }
            queue.push(intermediateId);
        }
    }
    return {
        reviewedProductIds: Array.from(reviewedProductIds),
        productsNowNeedsReviewIds: Array.from(productsNowNeedsReviewIds),
        intermediateUpdatedIds,
    };
}
async function recalculateIntermediateMaterialWithCascade(intermediateMaterialId) {
    const recalc = await recalculateIntermediateMaterialCost(intermediateMaterialId);
    if (!recalc.recalculated) {
        return {
            intermediateMaterialId,
            recalculated: false,
            affectedProducts: 0,
            productsNowNeedsReview: 0,
            reviewedProductIds: [],
            productsNowNeedsReviewIds: [],
        };
    }
    const reviewedProductIds = new Set(recalc.reviewedProductIds);
    const productsNowNeedsReviewIds = new Set(recalc.productsNowNeedsReviewIds);
    const cascadeSummary = await cascadeIntermediateCostsFrom(intermediateMaterialId);
    for (const productId of cascadeSummary.reviewedProductIds) {
        reviewedProductIds.add(productId);
    }
    for (const productId of cascadeSummary.productsNowNeedsReviewIds) {
        productsNowNeedsReviewIds.add(productId);
    }
    const reviewed = Array.from(reviewedProductIds);
    const needsReview = Array.from(productsNowNeedsReviewIds);
    return {
        intermediateMaterialId,
        recalculated: true,
        affectedProducts: reviewed.length,
        productsNowNeedsReview: needsReview.length,
        reviewedProductIds: reviewed,
        productsNowNeedsReviewIds: needsReview,
    };
}
async function propagatePrimaryMaterialChange(materialId) {
    const reviewedProductIds = new Set();
    const productsNowNeedsReviewIds = new Set();
    try {
        const directSummary = await setNeedsReviewForMaterial(materialId);
        for (const productId of directSummary.reviewedProductIds) {
            reviewedProductIds.add(productId);
        }
        for (const productId of directSummary.productsNowNeedsReviewIds) {
            productsNowNeedsReviewIds.add(productId);
        }
    }
    catch (reviewError) {
        console.error('[materials] Product review failed for material:', materialId, reviewError);
    }
    const cascadeSummary = await cascadeIntermediateCostsFrom(materialId);
    for (const productId of cascadeSummary.reviewedProductIds) {
        reviewedProductIds.add(productId);
    }
    for (const productId of cascadeSummary.productsNowNeedsReviewIds) {
        productsNowNeedsReviewIds.add(productId);
    }
    return {
        reviewedProductIds: Array.from(reviewedProductIds),
        productsNowNeedsReviewIds: Array.from(productsNowNeedsReviewIds),
        intermediateUpdatedIds: cascadeSummary.intermediateUpdatedIds,
    };
}
async function recalculateMaterialsForCurrency(currencyId) {
    const rate = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
    if (rate.length === 0) {
        throw new Error('Exchange rate not found');
    }
    const exchangeRate = parseFloat(rate[0].rateToBase.toString());
    const currency = await getActiveDb().select().from(currencies).where(eq(currencies.id, currencyId));
    if (currency.length === 0) {
        throw new Error('Currency not found');
    }
    const currencyCode = currency[0].code;
    const baseSettings = await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
    const baseCurrency = baseSettings.length > 0 ? baseSettings[0].settingValue : 'GHS';
    if (currencyCode === baseCurrency) {
        return {
            materialsUpdated: 0,
            productsReviewed: 0,
            productsNowNeedsReview: 0,
            message: `Base currency (${baseCurrency}) rate change - no material recalculation needed`,
        };
    }
    const materialsToUpdate = await getActiveDb().select().from(materials).where(eq(materials.purchaseCurrencyId, currencyId));
    const reviewedProductIds = new Set();
    const productsNowNeedsReviewIds = new Set();
    for (const material of materialsToUpdate) {
        const bulkPrice = parseFloat(material.bulkPrice?.toString() || '0');
        const bulkQuantity = parseFloat(material.bulkQuantity?.toString() || '1');
        const safeBulkQuantity = bulkQuantity <= 0 ? 1 : bulkQuantity;
        const unitPriceInOriginalCurrency = bulkPrice / safeBulkQuantity;
        const priceInBaseCurrency = bulkPrice * exchangeRate;
        const unitPrice = unitPriceInOriginalCurrency * exchangeRate;
        await getActiveDb().update(materials)
            .set({
            priceInBaseCurrency,
            unitPrice,
            updatedAt: new Date(),
        })
            .where(eq(materials.id, material.id));
        const reviewSummary = await propagatePrimaryMaterialChange(material.id);
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
function toSafeNumber(value) {
    if (value === null || value === undefined)
        return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return parsed;
}
function isPriceSet(value) {
    const parsed = toSafeNumber(value);
    return parsed !== null && parsed > 0;
}
function arePricesEqual(a, b) {
    const aNum = toSafeNumber(a);
    const bNum = toSafeNumber(b);
    if (aNum === null || bNum === null)
        return false;
    return Math.abs(aNum - bNum) < 0.01;
}
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function normalizePriceExpiryDate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const dateOnly = trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        return null;
    }
    const parsed = new Date(`${dateOnly}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return dateOnly;
}
function normalizeExpiryDays(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return Math.floor(parsed);
}
function daysUntilDate(dateString) {
    const normalized = normalizePriceExpiryDate(dateString);
    if (!normalized) {
        return null;
    }
    const target = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(target.getTime())) {
        return null;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = target.getTime() - today.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function withDerivedProductFields(product) {
    const hasApprovedPrice = toSafeNumber(product.approvedPrice) !== null;
    const mismatch = hasApprovedPrice && isPriceSet(product.currentSellingPrice) && !arePricesEqual(product.currentSellingPrice, product.approvedPrice);
    const normalizedExpiryDate = normalizePriceExpiryDate(product.approvedPriceExpiresAt);
    const expiryDaysRemaining = normalizedExpiryDate ? daysUntilDate(normalizedExpiryDate) : null;
    const isPriceExpired = product.approvalStatus === 'approved'
        && expiryDaysRemaining !== null
        && expiryDaysRemaining <= 0;
    return {
        ...product,
        priceMismatch: mismatch,
        approvedPriceExpiresAt: normalizedExpiryDate,
        isPriceExpired,
        daysUntilExpiry: expiryDaysRemaining !== null && expiryDaysRemaining > 0 ? expiryDaysRemaining : null,
    };
}
async function processExpiredApprovedPrices() {
    const today = getTodayDateString();
    const approvedProducts = await db
        .select()
        .from(products)
        .where(eq(products.approvalStatus, 'approved'));
    const expired = approvedProducts.filter((product) => {
        const expiryDate = normalizePriceExpiryDate(product.approvedPriceExpiresAt);
        return expiryDate !== null && expiryDate <= today;
    });
    for (const product of expired) {
        await getActiveDb().update(products).set({
            approvalStatus: 'needs_review',
            needsReviewReason: 'price_expired',
            priceExpiryNotifiedAt: new Date().toISOString(),
            updatedAt: new Date(),
        }).where(eq(products.id, product.id));
    }
    return {
        processed: expired.length,
        productNames: expired.map((product) => product.name),
    };
}
app.post('/api/products/process-price-expiry', async (_req, res) => {
    try {
        const result = await processExpiredApprovedPrices();
        res.json(result);
    }
    catch (error) {
        console.error('Failed to process product price expiry:', error);
        res.status(500).json({ error: 'Failed to process product price expiry' });
    }
});
app.get('/api/products', async (req, res) => {
    try {
        const status = parseStatusFilter(req.query.status);
        const allProducts = await db
            .select({
            id: products.id,
            name: products.name,
            sku: products.sku,
            description: products.description,
            category: products.category,
            overheadPercentage: products.overheadPercentage,
            profitMargin: products.profitMargin,
            laborCost: products.laborCost,
            otherDirectCosts: products.otherDirectCosts,
            productionMode: products.productionMode,
            batchYield: products.batchYield,
            currentSellingPrice: products.currentSellingPrice,
            approvalStatus: products.approvalStatus,
            approvedPrice: products.approvedPrice,
            approvedBy: products.approvedBy,
            approvedAt: products.approvedAt,
            approvedPriceExpiresAt: products.approvedPriceExpiresAt,
            priceExpiryNotifiedAt: products.priceExpiryNotifiedAt,
            needsReviewReason: products.needsReviewReason,
            isActive: products.isActive,
            createdAt: products.createdAt,
            updatedAt: products.updatedAt,
        })
            .from(products)
            .where(status === 'all'
            ? sql `1=1`
            : eq(products.isActive, status === 'active'));
        const productsWithComputedCosts = await Promise.all(allProducts.map(async (product) => {
            try {
                const snapshot = await calculateProductCostSnapshot(product.id);
                const denominator = 1 + Number(product.profitMargin || 0) / 100;
                const productionCost = denominator > 0 ? snapshot.optimalPrice / denominator : 0;
                return {
                    ...product,
                    productionCost,
                    optimalPrice: snapshot.optimalPrice,
                };
            }
            catch {
                return {
                    ...product,
                    productionCost: 0,
                    optimalPrice: 0,
                };
            }
        }));
        res.json(productsWithComputedCosts.map((product) => withDerivedProductFields(product)));
    }
    catch (error) {
        console.error('âŒ Error fetching products:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const product = await getActiveDb().select().from(products).where(eq(products.id, productId));
        if (product.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const snapshot = await calculateProductCostSnapshot(productId);
        const denominator = 1 + Number(product[0].profitMargin || 0) / 100;
        const productionCost = denominator > 0 ? snapshot.optimalPrice / denominator : 0;
        res.json(withDerivedProductFields({
            ...product[0],
            productionCost,
            optimalPrice: snapshot.optimalPrice,
        }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});
app.get('/api/products/:id/has-approved-price-level', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (!Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }
        const existingRows = await getActiveDb().select({ id: products.id }).from(products).where(eq(products.id, productId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const hasApprovedReference = await hasApprovedPriceLevelReference(productId);
        res.json({ hasApprovedReference });
    }
    catch (error) {
        console.error('Error checking approved price level reference:', error);
        res.status(500).json({ error: 'Failed to check approved price level reference' });
    }
});
app.post('/api/products', async (req, res) => {
    try {
        const { name, sku, description, category, overheadPercentage, profitMargin, laborCost, otherDirectCosts, productionMode, batchYield, currentSellingPrice, bomItems, } = req.body;
        const resolvedProductionMode = productionMode || 'single';
        const normalizedBomItems = normalizeBomItemsPayload(bomItems);
        const activeDb = getActiveDb();
        const createdProduct = await activeDb.transaction(async (tx) => {
            const result = await tx.insert(products).values({
                name,
                sku: sku || null,
                description: description || null,
                category: category || null,
                overheadPercentage,
                profitMargin,
                laborCost: Number(laborCost || 0),
                otherDirectCosts: otherDirectCosts || 0,
                productionMode: resolvedProductionMode,
                batchYield: resolvedProductionMode === 'batch' ? safeBatchYield(batchYield) : 1,
                currentSellingPrice: currentSellingPrice || 0,
            }).returning();
            const productId = result[0].id;
            if (normalizedBomItems.length > 0) {
                await tx.insert(billOfMaterials).values(normalizedBomItems.map((item) => ({
                    productId,
                    materialId: item.materialId,
                    quantity: item.quantity,
                })));
            }
            return result[0];
        });
        res.json(createdProduct);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.startsWith('Invalid bomItems')) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: 'Failed to create product' });
    }
});
app.put('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (!Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }
        const existingRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const existing = existingRows[0];
        const name = req.body?.name ?? existing.name;
        const sku = req.body?.sku ?? existing.sku;
        const description = req.body?.description ?? existing.description;
        const category = req.body?.category ?? existing.category;
        const overheadPercentage = Number(req.body?.overheadPercentage ?? existing.overheadPercentage);
        const profitMargin = Number(req.body?.profitMargin ?? existing.profitMargin);
        const laborCost = Number(req.body?.laborCost ?? existing.laborCost ?? 0);
        const otherDirectCosts = Number(req.body?.otherDirectCosts ?? existing.otherDirectCosts ?? 0);
        const productionMode = req.body?.productionMode ?? existing.productionMode ?? 'single';
        const rawBatchYield = Number(req.body?.batchYield ?? existing.batchYield ?? 1);
        const batchYield = productionMode === 'batch' ? safeBatchYield(rawBatchYield) : 1;
        const hasCurrentSellingPriceInput = req.body?.currentSellingPrice !== undefined;
        const hasApprovedPriceInput = req.body?.approvedPrice !== undefined;
        let currentSellingPrice = Number(req.body?.currentSellingPrice ?? existing.currentSellingPrice ?? 0);
        let approvedPrice = req.body?.approvedPrice ?? existing.approvedPrice;
        if (hasCurrentSellingPriceInput) {
            approvedPrice = currentSellingPrice;
        }
        if (hasApprovedPriceInput) {
            currentSellingPrice = Number(req.body?.approvedPrice ?? 0);
            approvedPrice = currentSellingPrice;
        }
        const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : Boolean(existing.isActive);
        const hasApprovedPriceExpiresAtInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'approvedPriceExpiresAt');
        let approvedPriceExpiresAt = existing.approvedPriceExpiresAt;
        let priceExpiryNotifiedAt = existing.priceExpiryNotifiedAt;
        if (hasApprovedPriceExpiresAtInput) {
            if (req.body.approvedPriceExpiresAt !== null && req.body.approvedPriceExpiresAt !== '' && normalizePriceExpiryDate(req.body.approvedPriceExpiresAt) === null) {
                return res.status(400).json({ error: 'approvedPriceExpiresAt must be an ISO date string (YYYY-MM-DD) or null' });
            }
            approvedPriceExpiresAt = normalizePriceExpiryDate(req.body.approvedPriceExpiresAt);
            priceExpiryNotifiedAt = null;
        }
        const shouldReevaluateReview = req.body?.overheadPercentage !== undefined
            || req.body?.profitMargin !== undefined
            || req.body?.laborCost !== undefined
            || req.body?.otherDirectCosts !== undefined
            || req.body?.productionMode !== undefined
            || req.body?.batchYield !== undefined
            || req.body?.currentSellingPrice !== undefined
            || req.body?.name !== undefined
            || req.body?.sku !== undefined
            || req.body?.description !== undefined
            || req.body?.category !== undefined
            || req.body?.approvedPrice !== undefined;
        await getActiveDb().update(products).set({
            name,
            sku: sku || null,
            description: description || null,
            category: category || null,
            overheadPercentage,
            profitMargin,
            laborCost,
            otherDirectCosts: otherDirectCosts || 0,
            productionMode: productionMode || 'single',
            batchYield,
            currentSellingPrice: currentSellingPrice || 0,
            approvedPrice,
            approvedPriceExpiresAt,
            priceExpiryNotifiedAt,
            isActive,
            updatedAt: new Date(),
        }).where(eq(products.id, productId));
        if (shouldReevaluateReview) {
            await setNeedsReviewIfOutdated(productId);
        }
        const updated = await getActiveDb().select().from(products).where(eq(products.id, productId));
        res.json(updated[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});
app.post('/api/products/:id/approve', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { approvedPrice, priceExpiryDate, expiryDays } = req.body;
        const existingRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const existing = existingRows[0];
        const bomItems = await db
            .select({ id: billOfMaterials.id })
            .from(billOfMaterials)
            .where(eq(billOfMaterials.productId, productId));
        if (bomItems.length === 0) {
            return res.status(400).json({ error: 'Cannot approve product without BOM items' });
        }
        const approvedPriceNumber = approvedPrice !== undefined && approvedPrice !== null
            ? Number(approvedPrice)
            : await calculateOptimalPricePerUnit(productId);
        if (!Number.isFinite(approvedPriceNumber) || approvedPriceNumber < 0) {
            return res.status(400).json({ error: 'approvedPrice must be a non-negative number' });
        }
        const normalizedPriceExpiryDate = normalizePriceExpiryDate(priceExpiryDate);
        const normalizedExpiryDays = normalizeExpiryDays(expiryDays);
        const hasPriceExpiryDateInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'priceExpiryDate');
        const hasExpiryDaysInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'expiryDays');
        if (hasPriceExpiryDateInput && priceExpiryDate !== null && priceExpiryDate !== '' && normalizedPriceExpiryDate === null) {
            return res.status(400).json({ error: 'priceExpiryDate must be an ISO date string (YYYY-MM-DD) or null' });
        }
        const resolvedExpiryDate = normalizedExpiryDays !== null
            ? (() => {
                const date = new Date();
                date.setDate(date.getDate() + normalizedExpiryDays);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })()
            : normalizedPriceExpiryDate;
        const updatePayload = {
            approvalStatus: 'approved',
            approvedPrice: approvedPriceNumber,
            currentSellingPrice: approvedPriceNumber,
            approvedBy: 'user',
            approvedAt: new Date(),
            approvedPriceExpiresAt: hasPriceExpiryDateInput || hasExpiryDaysInput ? resolvedExpiryDate : existing.approvedPriceExpiresAt,
            priceExpiryNotifiedAt: null,
            needsReviewReason: null,
            updatedAt: new Date(),
        };
        await getActiveDb().update(products).set(updatePayload).where(eq(products.id, productId));
        const updated = await getActiveDb().select().from(products).where(eq(products.id, productId));
        // Compute production cost for the response — mirrors GET /api/products/:id
        let computedProductionCost = 0;
        let computedOptimalPrice = 0;
        try {
            const snapshot = await calculateProductCostSnapshot(productId);
            const denominator = 1 + Number(updated[0].profitMargin || 0) / 100;
            computedProductionCost = denominator > 0 ? snapshot.optimalPrice / denominator : 0;
            computedOptimalPrice = snapshot.optimalPrice;
        }
        catch {
            // keep 0 — non-fatal
        }
        const updatedProduct = withDerivedProductFields({
            ...updated[0],
            productionCost: computedProductionCost,
            optimalPrice: computedOptimalPrice,
        });
        const productionCost = await calculateProductionCostForProduct(updated[0], productId);
        const totalCost = productionCost;
        const markupPercent = totalCost > 0
            ? Math.round(((approvedPriceNumber - totalCost) / totalCost) * 100 * 100) / 100
            : 0;
        const grossMargin = approvedPriceNumber > 0
            ? Math.round(((approvedPriceNumber - totalCost) / approvedPriceNumber) * 100 * 100) / 100
            : 0;
        // Post-approval: activity log — wrapped so a failure does not cause a 500
        try {
            const performedBy = await getCurrentUserName();
            await logActivity({
                entityType: 'product',
                entityId: productId,
                entityName: updatedProduct.name,
                action: 'product.approved',
                details: {
                    oldPrice: existing.approvedPrice == null ? null : Number(existing.approvedPrice),
                    newPrice: approvedPriceNumber,
                    productionCost: roundToTwo(productionCost),
                    markupPercent,
                    // Kept for backward compatibility — markupPercent is the primary metric
                    grossMargin,
                    margin: grossMargin,
                },
                performedBy,
            });
        }
        catch (logErr) {
            console.error('[approve] Activity log failed (approval still succeeded):', logErr);
        }
        // Post-approval: stale fixed amount check — wrapped so a failure does not cause a 500
        let staleCustomPrices = [];
        try {
            const staleCustomPriceItems = await getStaleApprovedCustomPriceLevelItems(productId);
            staleCustomPrices = staleCustomPriceItems
                .filter((si) => si.customPrice != null)
                .map((si) => ({
                priceLevelId: si.priceLevelId,
                priceLevelName: si.priceLevelName,
                customPrice: Number(si.customPrice),
                newApprovedBasePrice: approvedPriceNumber,
            }));
        }
        catch (plErr) {
            console.error('[approve] Stale price level check failed (approval still succeeded):', plErr);
        }
        res.json({
            success: true,
            product: updatedProduct,
            staleCustomPrices,
            // markupPercent is the primary metric — grossMargin kept for backward compatibility
            markupPercent,
            grossMargin,
        });
    }
    catch (error) {
        console.error('Error approving product:', error);
        res.status(500).json({ error: 'Failed to approve price' });
    }
});
app.post('/api/products/:id/reset-to-pending', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (!Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }
        const existingRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        await getActiveDb().update(products).set({
            approvalStatus: 'pending',
            approvedPrice: null,
            approvedBy: null,
            approvedAt: null,
            updatedAt: new Date(),
        }).where(eq(products.id, productId));
        const updated = await getActiveDb().select().from(products).where(eq(products.id, productId));
        let computedProductionCost = 0;
        let computedOptimalPrice = 0;
        try {
            const snapshot = await calculateProductCostSnapshot(productId);
            const denominator = 1 + Number(updated[0].profitMargin || 0) / 100;
            computedProductionCost = denominator > 0 ? snapshot.optimalPrice / denominator : 0;
            computedOptimalPrice = snapshot.optimalPrice;
        }
        catch {
            // keep 0 — non-fatal
        }
        const updatedProduct = withDerivedProductFields({
            ...updated[0],
            productionCost: computedProductionCost,
            optimalPrice: computedOptimalPrice,
        });
        await logActivity({
            entityType: 'product',
            entityId: productId,
            entityName: updatedProduct.name,
            action: 'product.reset_to_pending',
            details: { reason: reason || null },
            performedBy: await getCurrentUserName(),
        });
        res.json(updatedProduct);
    }
    catch (error) {
        console.error('Error resetting product to pending:', error);
        res.status(500).json({ error: 'Failed to reset product to pending' });
    }
});
app.post('/api/products/bulk-approve', async (req, res) => {
    try {
        const { productIds, priceMethod, markupPercentage, priceExpiryDate, expiryDays } = req.body;
        if (!productIds || productIds.length === 0) {
            return res.status(400).json({ error: 'No products provided' });
        }
        const normalizedMethod = priceMethod || 'optimal';
        if (!['optimal', 'selling', 'markup'].includes(normalizedMethod)) {
            return res.status(400).json({ error: 'priceMethod must be one of optimal, selling, or markup' });
        }
        let normalizedMarkupPercentage = 0;
        if (normalizedMethod === 'markup') {
            const numericMarkup = Number(markupPercentage);
            if (!Number.isFinite(numericMarkup)) {
                return res.status(400).json({ error: 'markupPercentage is required when priceMethod is markup' });
            }
            normalizedMarkupPercentage = numericMarkup;
        }
        const normalizedPriceExpiryDate = normalizePriceExpiryDate(priceExpiryDate);
        const normalizedExpiryDays = normalizeExpiryDays(expiryDays);
        const hasPriceExpiryDateInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'priceExpiryDate');
        const hasExpiryDaysInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'expiryDays');
        if (hasPriceExpiryDateInput && priceExpiryDate !== null && priceExpiryDate !== '' && normalizedPriceExpiryDate === null) {
            return res.status(400).json({ error: 'priceExpiryDate must be an ISO date string (YYYY-MM-DD) or null' });
        }
        const resolvedExpiryDate = normalizedExpiryDays !== null
            ? (() => {
                const date = new Date();
                date.setDate(date.getDate() + normalizedExpiryDays);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })()
            : normalizedPriceExpiryDate;
        let approved = 0;
        let skipped = 0;
        const skippedProducts = [];
        const performedBy = await getCurrentUserName();
        const approvalWork = [];
        for (const productId of productIds) {
            const bomItems = await db
                .select({ id: billOfMaterials.id })
                .from(billOfMaterials)
                .where(eq(billOfMaterials.productId, productId));
            if (bomItems.length === 0) {
                throw new Error(`Product ${productId} cannot be approved without BOM items`);
            }
            const currentRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
            if (currentRows.length === 0) {
                throw new Error(`Product ${productId} not found`);
            }
            const current = currentRows[0];
            const optimalPrice = await calculateOptimalPricePerUnit(productId);
            let priceToApprove = optimalPrice;
            if (normalizedMethod === 'selling') {
                const currentSellingPrice = Number(current.currentSellingPrice || 0);
                if (currentSellingPrice <= 0) {
                    skipped += 1;
                    skippedProducts.push(current.name);
                    continue;
                }
                priceToApprove = currentSellingPrice;
            }
            else if (normalizedMethod === 'markup') {
                priceToApprove = roundToTwo(optimalPrice * (1 + (normalizedMarkupPercentage / 100)));
            }
            if (current.approvalStatus === 'approved' && arePricesEqual(current.approvedPrice, priceToApprove)) {
                skipped += 1;
                continue;
            }
            const productionCost = await calculateProductionCostForProduct(current, productId);
            const totalCost = productionCost;
            const markupPercent = totalCost > 0
                ? Math.round(((priceToApprove - totalCost) / totalCost) * 100 * 100) / 100
                : 0;
            const grossMargin = priceToApprove > 0
                ? Math.round(((priceToApprove - totalCost) / priceToApprove) * 100 * 100) / 100
                : 0;
            approvalWork.push({
                productId,
                current,
                priceToApprove,
                productionCost,
                markupPercent,
                grossMargin,
            });
        }
        await getActiveDb().transaction(async (tx) => {
            for (const item of approvalWork) {
                const updatePayload = {
                    approvalStatus: 'approved',
                    approvedPrice: item.priceToApprove,
                    currentSellingPrice: item.priceToApprove,
                    approvedBy: 'user',
                    approvedAt: new Date(),
                    approvedPriceExpiresAt: hasPriceExpiryDateInput || hasExpiryDaysInput
                        ? resolvedExpiryDate
                        : item.current.approvedPriceExpiresAt,
                    priceExpiryNotifiedAt: null,
                    needsReviewReason: null,
                    updatedAt: new Date(),
                };
                await tx.update(products).set(updatePayload).where(eq(products.id, item.productId));
                await logActivity({
                    entityType: 'product',
                    entityId: item.productId,
                    entityName: item.current.name,
                    action: 'product.approved',
                    details: {
                        oldPrice: item.current.approvedPrice == null ? null : Number(item.current.approvedPrice),
                        newPrice: item.priceToApprove,
                        productionCost: roundToTwo(item.productionCost),
                        markupPercent: item.markupPercent,
                        grossMargin: item.grossMargin,
                        margin: item.grossMargin,
                    },
                    performedBy,
                }, tx);
            }
        });
        approved = approvalWork.length;
        res.json({
            approved,
            skipped,
            skippedProducts,
            priceMethod: normalizedMethod,
            ...(normalizedMethod === 'markup' ? { markupPercentage: normalizedMarkupPercentage } : {}),
        });
    }
    catch (error) {
        console.error('Error bulk approving products:', error);
        res.status(500).json({ error: 'Failed to bulk approve products' });
    }
});
app.post('/api/products/bulk-reset-to-pending', async (req, res) => {
    try {
        const { productIds } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: 'No products provided' });
        }
        const idsToReset = [];
        for (const productId of productIds) {
            if (!Number.isInteger(productId)) {
                continue;
            }
            const currentRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
            if (currentRows.length === 0) {
                continue;
            }
            idsToReset.push(productId);
        }
        await getActiveDb().transaction(async (tx) => {
            for (const productId of idsToReset) {
                await tx.update(products).set({
                    approvalStatus: 'pending',
                    approvedPrice: null,
                    approvedBy: null,
                    approvedAt: null,
                    updatedAt: new Date(),
                }).where(eq(products.id, productId));
            }
        });
        res.json({ reset: idsToReset.length });
    }
    catch (error) {
        console.error('Bulk reset to pending failed:', error);
        res.status(500).json({ error: 'Failed to bulk reset products to pending' });
    }
});
app.delete('/api/products/bulk', async (req, res) => {
    try {
        const { productIds } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: 'No products provided' });
        }
        const normalizedIds = productIds.filter((id) => Number.isInteger(id));
        if (normalizedIds.length === 0) {
            return res.status(400).json({ error: 'No valid product IDs provided' });
        }
        await getActiveDb().transaction(async (tx) => {
            for (const productId of normalizedIds) {
                await tx.delete(products).where(eq(products.id, productId));
            }
        });
        res.json({ deleted: normalizedIds.length });
    }
    catch (error) {
        const message = String(error?.message || '');
        if (message.toLowerCase().includes('foreign key constraint failed')) {
            return res.status(409).json({
                error: 'Cannot delete one or more products because they are used in price lists. Remove them from those lists first.',
            });
        }
        console.error('Bulk delete products failed:', error);
        res.status(500).json({ error: 'Failed to bulk delete products' });
    }
});
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        await getActiveDb().delete(products).where(eq(products.id, productId));
        res.json({ success: true });
    }
    catch (error) {
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
        const baseCurrencySetting = await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
        const baseCurrencyCode = baseCurrencySetting.length > 0 ? baseCurrencySetting[0].settingValue : 'GHS';
        const baseCurrencyData = await getActiveDb().select().from(currencies).where(eq(currencies.code, baseCurrencyCode));
        const baseCurrencySymbol = baseCurrencyData.length > 0 ? baseCurrencyData[0].symbol : 'â‚µ';
        const bom = await db
            .select({
            id: billOfMaterials.id,
            productId: billOfMaterials.productId,
            materialId: billOfMaterials.materialId,
            quantity: billOfMaterials.quantity,
            materialName: materials.name,
            materialType: materials.materialType,
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
    }
    catch (error) {
        console.error('Error fetching BOM:', error);
        res.status(500).json({ error: 'Failed to fetch BOM' });
    }
});
// Add material to BOM
app.post('/api/products/:id/bom', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { materialId, quantity } = req.body;
        const result = await getActiveDb().insert(billOfMaterials).values({
            productId,
            materialId,
            quantity,
        }).returning();
        await setNeedsReviewIfOutdated(productId);
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error adding material to BOM:', error);
        res.status(500).json({ error: 'Failed to add material to BOM' });
    }
});
app.put('/api/products/:id/bom/:bomId', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const bomId = parseInt(req.params.bomId);
        const quantity = Number(req.body?.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(bomId) || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        await getActiveDb()
            .update(billOfMaterials)
            .set({ quantity })
            .where(and(eq(billOfMaterials.id, bomId), eq(billOfMaterials.productId, productId)));
        await setNeedsReviewIfOutdated(productId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating product BOM item:', error);
        res.status(500).json({ error: 'Failed to update material in BOM' });
    }
});
// Remove material from BOM
app.delete('/api/products/:id/bom/:bomId', async (req, res) => {
    try {
        const bomId = parseInt(req.params.bomId);
        const productId = parseInt(req.params.id);
        await getActiveDb().delete(billOfMaterials).where(eq(billOfMaterials.id, bomId));
        await setNeedsReviewIfOutdated(productId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to remove material from BOM' });
    }
});
// Calculate product cost
app.get('/api/products/:id/calculate', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        // Get product details
        const product = await getActiveDb().select().from(products).where(eq(products.id, productId));
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
        const laborCost = parseFloat(product[0].laborCost?.toString() || '0');
        const { overheadAmount, totalCost: materialsLaborOverheadTotal } = calculateProductionCost({
            materialCost: totalMaterialCost,
            laborCost,
            overheadPercentage: parseFloat(product[0].overheadPercentage.toString()),
        });
        const otherCosts = parseFloat(product[0].otherDirectCosts?.toString() || '0');
        const totalCost = materialsLaborOverheadTotal + otherCosts;
        // Markup formula: optimal price = totalCost × (1 + margin%)
        // The margin% here means profit on cost (markup), not profit on sales.
        // Example: cost GHS 2.41, markup 20% -> optimal = GHS 2.89
        // Gross margin at that price = (2.89-2.41)/2.89 = 16.6%
        const profitAmount = totalCost * (parseFloat(product[0].profitMargin.toString()) / 100);
        const recommendedPrice = totalCost + profitAmount;
        res.json({
            totalMaterialCost: totalMaterialCost.toFixed(2),
            laborCost: laborCost.toFixed(2),
            overheadCost: overheadAmount.toFixed(2),
            otherDirectCosts: otherCosts.toFixed(2),
            totalCost: totalCost.toFixed(2),
            profitAmount: profitAmount.toFixed(2),
            recommendedPrice: recommendedPrice.toFixed(2),
        });
    }
    catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
});
// ============================================
// START SERVER
// ============================================
// Price Level Rules endpoints
app.get('/api/price-levels', async (_req, res) => {
    try {
        const levels = await getActiveDb().select().from(priceLevels);
        const enriched = await Promise.all(levels.map((level) => enrichPriceLevelRow(level)));
        res.json(enriched);
    }
    catch (error) {
        console.error('Error fetching price levels:', error);
        res.status(500).json({ error: 'Failed to fetch price levels' });
    }
});
app.post('/api/price-levels', async (req, res) => {
    try {
        const { name, description, adjustmentType, adjustmentPercentage, currencyId } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        const normalizedAdjustmentType = adjustmentType === 'markup' ? 'markup' : 'discount';
        const numericPercentage = Number(adjustmentPercentage ?? 0);
        const safePercentage = Number.isFinite(numericPercentage) && numericPercentage >= 0 ? numericPercentage : 0;
        const multiplier = normalizedAdjustmentType === 'markup'
            ? 1 + (safePercentage / 100)
            : 1 - (safePercentage / 100);
        const parsedCurrencyId = parseOptionalCurrencyId(currencyId);
        if (parsedCurrencyId) {
            const currencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, parsedCurrencyId));
            if (currencyRows.length === 0) {
                return res.status(400).json({ error: 'Invalid currencyId' });
            }
        }
        const result = await getActiveDb().insert(priceLevels).values({
            name: name.trim(),
            multiplier,
            adjustmentType: normalizedAdjustmentType,
            adjustmentPercentage: safePercentage,
            description: typeof description === 'string' ? description.trim() : null,
            currencyId: parsedCurrencyId ?? null,
        }).returning();
        await logActivity({
            entityType: 'price_level',
            entityId: result[0].id,
            entityName: result[0].name,
            action: 'price_level.created',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json(await enrichPriceLevelRow(result[0]));
    }
    catch (error) {
        console.error('Error creating price level:', error);
        res.status(500).json({ error: 'Failed to create price level' });
    }
});
app.get('/api/price-level-rules', async (req, res) => {
    try {
        const rules = await getActiveDb().select().from(priceLevels);
        const enriched = await Promise.all(rules.map((level) => enrichPriceLevelRow(level)));
        res.json(enriched);
    }
    catch (error) {
        console.error('Error fetching price level rules:', error);
        res.status(500).json({ error: 'Failed to fetch price level rules' });
    }
});
app.post('/api/price-level-rules', async (req, res) => {
    try {
        const { name, adjustmentType, adjustmentPercentage, description, currencyId } = req.body;
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
        const parsedCurrencyId = parseOptionalCurrencyId(currencyId);
        if (parsedCurrencyId) {
            const currencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, parsedCurrencyId));
            if (currencyRows.length === 0) {
                return res.status(400).json({ error: 'Invalid currencyId' });
            }
        }
        const result = await getActiveDb().insert(priceLevels).values({
            name,
            multiplier,
            adjustmentType,
            adjustmentPercentage: numericPercentage,
            description,
            currencyId: parsedCurrencyId ?? null,
        }).returning();
        await logActivity({
            entityType: 'price_level',
            entityId: result[0].id,
            entityName: result[0].name,
            action: 'price_level.created',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json(await enrichPriceLevelRow(result[0]));
    }
    catch (error) {
        console.error('Error creating customer price rule:', error);
        res.status(500).json({ error: 'Failed to create customer price rule' });
    }
});
app.put('/api/price-level-rules/:id', async (req, res) => {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        const { name, adjustmentType, adjustmentPercentage, description, isActive, currencyId } = req.body;
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
        const parsedCurrencyId = parseOptionalCurrencyId(currencyId);
        if (parsedCurrencyId) {
            const currencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, parsedCurrencyId));
            if (currencyRows.length === 0) {
                return res.status(400).json({ error: 'Invalid currencyId' });
            }
        }
        const updateValues = {
            name,
            multiplier,
            adjustmentType,
            adjustmentPercentage: numericPercentage,
            description,
            isActive,
            updatedAt: new Date(),
        };
        if (currencyId !== undefined) {
            updateValues.currencyId = parsedCurrencyId ?? null;
        }
        const updated = await getActiveDb().update(priceLevels)
            .set(updateValues)
            .where(eq(priceLevels.id, parseInt(id)))
            .returning();
        res.json(updated[0] ? await enrichPriceLevelRow(updated[0]) : { success: true });
    }
    catch (error) {
        console.error('Error updating customer price rule:', error);
        res.status(500).json({ error: 'Failed to update customer price rule' });
    }
});
app.delete('/api/price-level-rules/:id', async (req, res) => {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        const levelId = parseInt(id);
        const existingRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, levelId));
        const deletedLevel = existingRows[0];
        // Cascade delete: child records must be deleted before parent
        // 1. Delete price_list_items (children of price_lists)
        const priceListsToDelete = await getActiveDb()
            .select({ id: priceLists.id })
            .from(priceLists)
            .where(eq(priceLists.priceLevelId, levelId));
        for (const pl of priceListsToDelete) {
            await getActiveDb().delete(priceListItems).where(eq(priceListItems.priceListId, pl.id));
        }
        // 2. Delete price_lists for this price_level
        await getActiveDb().delete(priceLists).where(eq(priceLists.priceLevelId, levelId));
        // 3. Delete price_level_items for this price_level
        await getActiveDb().delete(priceLevelItems).where(eq(priceLevelItems.priceLevelId, levelId));
        // 4. Finally delete the price_level itself
        await getActiveDb().delete(priceLevels).where(eq(priceLevels.id, levelId));
        await logActivity({
            entityType: 'price_level',
            entityId: levelId,
            entityName: deletedLevel?.name || null,
            action: 'price_level.deleted',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting customer price rule:', error);
        res.status(500).json({ error: 'Failed to delete customer price rule' });
    }
});
app.get('/api/price-levels/:id/items', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        if (!Number.isInteger(priceLevelId)) {
            return res.status(400).json({ error: 'Invalid price level id' });
        }
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        if (levelRows.length === 0) {
            return res.status(404).json({ error: 'Price level not found' });
        }
        const levelRow = levelRows[0];
        const levelCurrency = await resolvePriceLevelCurrencyContext(levelRow);
        const items = await getActiveDb()
            .select()
            .from(priceLevelItems)
            .where(eq(priceLevelItems.priceLevelId, priceLevelId));
        if (items.length === 0) {
            return res.json([]);
        }
        const productIds = [...new Set(items.map((item) => item.productId))];
        const productRows = await getActiveDb()
            .select()
            .from(products)
            .where(inArray(products.id, productIds));
        const productById = new Map(productRows.map((row) => [row.id, row]));
        const itemIds = items.map((item) => item.id);
        const allPackRows = itemIds.length > 0
            ? await getActiveDb()
                .select({
                id: priceLevelPackSizes.id,
                priceLevelItemId: priceLevelPackSizes.priceLevelItemId,
                packQuantity: priceLevelPackSizes.packQuantity,
            })
                .from(priceLevelPackSizes)
                .where(inArray(priceLevelPackSizes.priceLevelItemId, itemIds))
            : [];
        const packSizesByItemId = new Map();
        for (const row of allPackRows) {
            const existing = packSizesByItemId.get(row.priceLevelItemId) || [];
            existing.push({ id: row.id, packQuantity: row.packQuantity });
            packSizesByItemId.set(row.priceLevelItemId, existing);
        }
        const response = await Promise.all(items
            .filter((item) => productById.has(item.productId))
            .map((item) => toPriceLevelItemResponse(item, productById.get(item.productId), levelCurrency, packSizesByItemId.get(item.id) ?? [])));
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching price level items:', error);
        res.status(500).json({ error: 'Failed to fetch price level items' });
    }
});
app.get('/api/price-level-items/:itemId/pack-sizes', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        if (!Number.isInteger(itemId)) {
            return res.status(400).json({ error: 'Invalid price level item id' });
        }
        const itemRows = await getActiveDb()
            .select({ id: priceLevelItems.id })
            .from(priceLevelItems)
            .where(eq(priceLevelItems.id, itemId));
        if (itemRows.length === 0) {
            return res.status(404).json({ error: 'Price level item not found' });
        }
        const rows = await getActiveDb()
            .select({
            id: priceLevelPackSizes.id,
            packQuantity: priceLevelPackSizes.packQuantity,
        })
            .from(priceLevelPackSizes)
            .where(eq(priceLevelPackSizes.priceLevelItemId, itemId))
            .orderBy(asc(priceLevelPackSizes.packQuantity));
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching pack sizes:', error);
        res.status(500).json({ error: 'Failed to fetch pack sizes' });
    }
});
app.post('/api/price-level-items/:itemId/pack-sizes', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        if (!Number.isInteger(itemId)) {
            return res.status(400).json({ error: 'Invalid price level item id' });
        }
        const packQuantity = Number(req.body?.packQuantity);
        if (!Number.isInteger(packQuantity) || packQuantity < 1) {
            return res.status(400).json({ error: 'packQuantity must be an integer of at least 1' });
        }
        const itemRows = await getActiveDb()
            .select({ id: priceLevelItems.id })
            .from(priceLevelItems)
            .where(eq(priceLevelItems.id, itemId));
        if (itemRows.length === 0) {
            return res.status(404).json({ error: 'Price level item not found' });
        }
        const duplicateRows = await getActiveDb()
            .select({ id: priceLevelPackSizes.id })
            .from(priceLevelPackSizes)
            .where(and(eq(priceLevelPackSizes.priceLevelItemId, itemId), eq(priceLevelPackSizes.packQuantity, packQuantity)));
        if (duplicateRows.length > 0) {
            return res.status(400).json({ error: 'Pack quantity already exists for this item' });
        }
        const created = await getActiveDb()
            .insert(priceLevelPackSizes)
            .values({ priceLevelItemId: itemId, packQuantity })
            .returning();
        res.status(201).json({
            id: created[0].id,
            packQuantity: created[0].packQuantity,
        });
    }
    catch (error) {
        console.error('Error adding pack size:', error);
        res.status(500).json({ error: 'Failed to add pack size' });
    }
});
app.delete('/api/price-level-pack-sizes/:id', async (req, res) => {
    try {
        const packSizeId = parseInt(req.params.id);
        if (!Number.isInteger(packSizeId)) {
            return res.status(400).json({ error: 'Invalid pack size id' });
        }
        const existingRows = await getActiveDb()
            .select({ id: priceLevelPackSizes.id })
            .from(priceLevelPackSizes)
            .where(eq(priceLevelPackSizes.id, packSizeId));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Pack size not found' });
        }
        await getActiveDb()
            .delete(priceLevelPackSizes)
            .where(eq(priceLevelPackSizes.id, packSizeId));
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting pack size:', error);
        res.status(500).json({ error: 'Failed to delete pack size' });
    }
});
app.post('/api/price-levels/:id/items', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        if (!Number.isInteger(priceLevelId)) {
            return res.status(400).json({ error: 'Invalid price level id' });
        }
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        if (levelRows.length === 0) {
            return res.status(404).json({ error: 'Price level not found' });
        }
        const levelCurrency = await resolvePriceLevelCurrencyContext(levelRows[0]);
        const productId = Number(req.body?.productId);
        if (!Number.isInteger(productId)) {
            return res.status(400).json({ error: 'productId is required' });
        }
        const overrideType = parsePriceLevelItemOverrideType(req.body?.overrideType ?? req.body?.pricingType);
        if (!overrideType) {
            return res.status(400).json({ error: "overrideType must be one of: 'rule_discount', 'rule_markup', 'fixed_amount_add', 'fixed_amount_deduct', 'custom_price'" });
        }
        const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const selectedProduct = productRows[0];
        if (selectedProduct.approvalStatus !== 'approved' || selectedProduct.approvedPrice == null) {
            return res.status(400).json({ error: 'Product must be approved before adding level pricing' });
        }
        const adjustmentPercentage = toOptionalNumber(req.body?.adjustmentPercentage ?? req.body?.discountPercentage);
        const customPrice = toOptionalNumber(req.body?.customPrice);
        const justification = typeof req.body?.justification === 'string' && req.body.justification.trim().length > 0
            ? req.body.justification.trim()
            : null;
        let resolvedAdjustment = null;
        let resolvedCustomPrice = null;
        let resolvedOverrideType = overrideType;
        if (overrideType === 'rule_discount') {
            if (adjustmentPercentage == null || Number.isNaN(adjustmentPercentage) || adjustmentPercentage < 0 || adjustmentPercentage > 100) {
                return res.status(400).json({ error: 'adjustmentPercentage must be between 0 and 100 for rule_discount' });
            }
            resolvedAdjustment = adjustmentPercentage;
        }
        else if (overrideType === 'rule_markup') {
            if (adjustmentPercentage == null || Number.isNaN(adjustmentPercentage) || adjustmentPercentage < 0 || adjustmentPercentage > 1000) {
                return res.status(400).json({ error: 'adjustmentPercentage must be between 0 and 1000 for rule_markup' });
            }
            resolvedAdjustment = adjustmentPercentage;
        }
        else {
            if (customPrice == null || Number.isNaN(customPrice) || customPrice < 0) {
                return res.status(400).json({ error: 'customPrice must be non-negative for fixed amount pricing' });
            }
            const productionCost = await calculateProductionCostForProduct(selectedProduct, productId);
            const approvedPriceNumber = Number(selectedProduct.approvedPrice ?? 0);
            let proposedFinalPrice;
            if (overrideType === 'fixed_amount_add') {
                proposedFinalPrice = roundToTwo(approvedPriceNumber + customPrice);
            }
            else if (overrideType === 'fixed_amount_deduct') {
                proposedFinalPrice = roundToTwo(approvedPriceNumber - customPrice);
            }
            else {
                proposedFinalPrice = roundToTwo(customPrice);
            }
            if (proposedFinalPrice <= productionCost) {
                return res.status(400).json({
                    error: 'Proposed fixed amount pricing must be above production cost',
                    code: 'PRICE_BELOW_COST',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: proposedFinalPrice,
                    },
                });
            }
            const resultingMarginPercentage = proposedFinalPrice > 0
                ? roundToTwo(((proposedFinalPrice - productionCost) / proposedFinalPrice) * 100)
                : 0;
            if (resultingMarginPercentage < MIN_MARGIN_PERCENTAGE && !justification) {
                return res.status(400).json({
                    error: `Justification is required when resulting margin is below ${MIN_MARGIN_PERCENTAGE}%`,
                    code: 'LOW_MARGIN_JUSTIFICATION_REQUIRED',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: roundToTwo(proposedFinalPrice),
                        resultingMarginPercentage: roundToTwo(resultingMarginPercentage),
                        thresholdMarginPercentage: MIN_MARGIN_PERCENTAGE,
                    },
                });
            }
            if (overrideType === 'custom_price') {
                const normalized = normalizeLegacyCustomPriceOverride({
                    overrideType,
                    customPrice,
                    approvedPrice: approvedPriceNumber,
                });
                resolvedOverrideType = normalized.overrideType;
                resolvedCustomPrice = normalized.customPrice;
            }
            else {
                resolvedCustomPrice = roundToTwo(customPrice);
            }
        }
        const existingRows = await getActiveDb()
            .select()
            .from(priceLevelItems)
            .where(and(eq(priceLevelItems.priceLevelId, priceLevelId), eq(priceLevelItems.productId, productId)));
        const now = new Date();
        let savedId;
        if (existingRows.length > 0) {
            await getActiveDb().update(priceLevelItems)
                .set({
                overrideType: resolvedOverrideType,
                adjustmentPercentage: resolvedAdjustment,
                customPrice: resolvedCustomPrice,
                status: 'pending',
                approvedBy: null,
                approvedAt: null,
                justification,
                updatedAt: now,
            })
                .where(eq(priceLevelItems.id, existingRows[0].id));
            savedId = existingRows[0].id;
        }
        else {
            const created = await getActiveDb().insert(priceLevelItems).values({
                priceLevelId,
                productId,
                overrideType: resolvedOverrideType,
                adjustmentPercentage: resolvedAdjustment,
                customPrice: resolvedCustomPrice,
                status: 'pending',
                approvedBy: null,
                approvedAt: null,
                justification,
                createdAt: now,
                updatedAt: now,
            }).returning();
            savedId = created[0].id;
        }
        const savedRows = await getActiveDb().select().from(priceLevelItems).where(eq(priceLevelItems.id, savedId));
        const response = await toPriceLevelItemResponse(savedRows[0], selectedProduct, levelCurrency);
        res.status(existingRows.length > 0 ? 200 : 201).json(response);
    }
    catch (error) {
        console.error('Error upserting price level item:', error);
        res.status(500).json({ error: 'Failed to save price level item' });
    }
});
app.put('/api/price-levels/:id/items/:itemId', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        const itemId = parseInt(req.params.itemId);
        if (!Number.isInteger(priceLevelId) || !Number.isInteger(itemId)) {
            return res.status(400).json({ error: 'Invalid price level id or item id' });
        }
        const existingRows = await getActiveDb()
            .select()
            .from(priceLevelItems)
            .where(and(eq(priceLevelItems.id, itemId), eq(priceLevelItems.priceLevelId, priceLevelId)));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Price level item not found' });
        }
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        if (levelRows.length === 0) {
            return res.status(404).json({ error: 'Price level not found' });
        }
        const levelCurrency = await resolvePriceLevelCurrencyContext(levelRows[0]);
        const existing = existingRows[0];
        const productRows = await getActiveDb().select().from(products).where(eq(products.id, existing.productId));
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const selectedProduct = productRows[0];
        const overrideType = parsePriceLevelItemOverrideType(req.body?.overrideType ?? req.body?.pricingType ?? existing.overrideType);
        if (!overrideType) {
            return res.status(400).json({ error: "overrideType must be one of: 'rule_discount', 'rule_markup', 'fixed_amount_add', 'fixed_amount_deduct', 'custom_price'" });
        }
        const adjustmentPercentage = toOptionalNumber(req.body?.adjustmentPercentage ?? req.body?.discountPercentage ?? existing.adjustmentPercentage);
        const customPrice = toOptionalNumber(req.body?.customPrice ?? existing.customPrice);
        const justification = typeof req.body?.justification === 'string' && req.body.justification.trim().length > 0
            ? req.body.justification.trim()
            : existing.justification ?? null;
        let resolvedAdjustment = null;
        let resolvedCustomPrice = null;
        let resolvedOverrideType = overrideType;
        if (overrideType === 'rule_discount') {
            if (adjustmentPercentage == null || Number.isNaN(adjustmentPercentage) || adjustmentPercentage < 0 || adjustmentPercentage > 100) {
                return res.status(400).json({ error: 'adjustmentPercentage must be between 0 and 100 for rule_discount' });
            }
            resolvedAdjustment = adjustmentPercentage;
        }
        else if (overrideType === 'rule_markup') {
            if (adjustmentPercentage == null || Number.isNaN(adjustmentPercentage) || adjustmentPercentage < 0 || adjustmentPercentage > 1000) {
                return res.status(400).json({ error: 'adjustmentPercentage must be between 0 and 1000 for rule_markup' });
            }
            resolvedAdjustment = adjustmentPercentage;
        }
        else {
            if (customPrice == null || Number.isNaN(customPrice) || customPrice < 0) {
                return res.status(400).json({ error: 'customPrice must be non-negative for fixed amount pricing' });
            }
            const productionCost = await calculateProductionCostForProduct(selectedProduct, existing.productId);
            const approvedPriceNumber = Number(selectedProduct.approvedPrice ?? 0);
            let proposedFinalPrice;
            if (overrideType === 'fixed_amount_add') {
                proposedFinalPrice = roundToTwo(approvedPriceNumber + customPrice);
            }
            else if (overrideType === 'fixed_amount_deduct') {
                proposedFinalPrice = roundToTwo(approvedPriceNumber - customPrice);
            }
            else {
                proposedFinalPrice = roundToTwo(customPrice);
            }
            if (proposedFinalPrice <= productionCost) {
                return res.status(400).json({
                    error: 'Proposed fixed amount pricing must be above production cost',
                    code: 'PRICE_BELOW_COST',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: proposedFinalPrice,
                    },
                });
            }
            const resultingMarginPercentage = proposedFinalPrice > 0
                ? roundToTwo(((proposedFinalPrice - productionCost) / proposedFinalPrice) * 100)
                : 0;
            if (resultingMarginPercentage < MIN_MARGIN_PERCENTAGE && !justification) {
                return res.status(400).json({
                    error: `Justification is required when resulting margin is below ${MIN_MARGIN_PERCENTAGE}%`,
                    code: 'LOW_MARGIN_JUSTIFICATION_REQUIRED',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: roundToTwo(proposedFinalPrice),
                        resultingMarginPercentage: roundToTwo(resultingMarginPercentage),
                        thresholdMarginPercentage: MIN_MARGIN_PERCENTAGE,
                    },
                });
            }
            if (overrideType === 'custom_price') {
                const normalized = normalizeLegacyCustomPriceOverride({
                    overrideType,
                    customPrice,
                    approvedPrice: approvedPriceNumber,
                });
                resolvedOverrideType = normalized.overrideType;
                resolvedCustomPrice = normalized.customPrice;
            }
            else {
                resolvedCustomPrice = roundToTwo(customPrice);
            }
        }
        await getActiveDb().update(priceLevelItems)
            .set({
            overrideType: resolvedOverrideType,
            adjustmentPercentage: resolvedAdjustment,
            customPrice: resolvedCustomPrice,
            status: 'pending',
            approvedBy: null,
            approvedAt: null,
            justification,
            updatedAt: new Date(),
        })
            .where(eq(priceLevelItems.id, itemId));
        const updatedRows = await getActiveDb().select().from(priceLevelItems).where(eq(priceLevelItems.id, itemId));
        const response = await toPriceLevelItemResponse(updatedRows[0], selectedProduct, levelCurrency);
        res.json(response);
    }
    catch (error) {
        console.error('Error updating price level item:', error);
        res.status(500).json({ error: 'Failed to update price level item' });
    }
});
app.delete('/api/price-levels/:id/items/:productId', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);
        if (!Number.isInteger(priceLevelId) || !Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid price level id or product id' });
        }
        const existingRows = await getActiveDb()
            .select()
            .from(priceLevelItems)
            .where(and(eq(priceLevelItems.priceLevelId, priceLevelId), eq(priceLevelItems.productId, productId)));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Price level item not found' });
        }
        await getActiveDb().delete(priceLevelItems).where(eq(priceLevelItems.id, existingRows[0].id));
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting price level item:', error);
        res.status(500).json({ error: 'Failed to delete price level item' });
    }
});
app.post('/api/price-levels/:id/items/:productId/approve', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);
        if (!Number.isInteger(priceLevelId) || !Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid price level id or product id' });
        }
        const existingRows = await getActiveDb()
            .select()
            .from(priceLevelItems)
            .where(and(eq(priceLevelItems.priceLevelId, priceLevelId), eq(priceLevelItems.productId, productId)));
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Price level item not found' });
        }
        const approvedBy = typeof req.body?.approvedBy === 'string' && req.body.approvedBy.trim().length > 0
            ? req.body.approvedBy.trim()
            : 'user';
        await getActiveDb().update(priceLevelItems)
            .set({
            status: 'approved',
            approvedBy,
            approvedAt: new Date(),
            updatedAt: new Date(),
        })
            .where(eq(priceLevelItems.id, existingRows[0].id));
        const updatedRows = await getActiveDb().select().from(priceLevelItems).where(eq(priceLevelItems.id, existingRows[0].id));
        const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        const levelCurrency = levelRows[0]
            ? await resolvePriceLevelCurrencyContext(levelRows[0])
            : undefined;
        const response = await toPriceLevelItemResponse(updatedRows[0], productRows[0], levelCurrency);
        const levelName = levelRows[0]?.name || `Level ${priceLevelId}`;
        const productName = productRows[0]?.name || `Product ${productId}`;
        await logActivity({
            entityType: 'price_level_item',
            entityId: updatedRows[0].id,
            entityName: productName,
            action: 'price_level_item.approved',
            details: {
                levelName,
                productName,
                overrideType: updatedRows[0].overrideType,
                value: Number(updatedRows[0].adjustmentPercentage ?? updatedRows[0].customPrice ?? 0),
                finalPrice: Number(response.finalPrice ?? 0),
            },
            performedBy: await getCurrentUserName(),
        });
        res.json(response);
    }
    catch (error) {
        console.error('Error approving price level item:', error);
        res.status(500).json({ error: 'Failed to approve price level item' });
    }
});
app.post('/api/price-levels/:id/items/bulk-approve', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        if (!Number.isInteger(priceLevelId)) {
            return res.status(400).json({ error: 'Invalid price level id' });
        }
        const approvedBy = typeof req.body?.approvedBy === 'string' && req.body.approvedBy.trim().length > 0
            ? req.body.approvedBy.trim()
            : 'user';
        const pendingRows = await getActiveDb()
            .select({ id: priceLevelItems.id })
            .from(priceLevelItems)
            .where(and(eq(priceLevelItems.priceLevelId, priceLevelId), eq(priceLevelItems.status, 'pending')));
        if (pendingRows.length > 0) {
            await getActiveDb().update(priceLevelItems)
                .set({
                status: 'approved',
                approvedBy,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
                .where(and(eq(priceLevelItems.priceLevelId, priceLevelId), eq(priceLevelItems.status, 'pending')));
        }
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        const levelName = levelRows[0]?.name || `Level ${priceLevelId}`;
        await logActivity({
            entityType: 'price_level_item',
            entityId: priceLevelId,
            entityName: levelName,
            action: 'price_level_item.bulk_approved',
            details: { count: pendingRows.length, levelName },
            performedBy: await getCurrentUserName(),
        });
        res.json({ approved: pendingRows.length });
    }
    catch (error) {
        console.error('Error bulk approving price level items:', error);
        res.status(500).json({ error: 'Failed to bulk approve price level items' });
    }
});
app.get('/api/activity', async (req, res) => {
    try {
        const requestedLimit = Number(req.query.limit);
        const requestedOffset = Number(req.query.offset);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
        const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
        const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
        const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
        const entityIdParam = req.query.entityId !== undefined ? Number(req.query.entityId) : null;
        const from = Number(req.query.from);
        const to = Number(req.query.to);
        const filters = [];
        if (entityType) {
            filters.push(eq(activityLog.entityType, entityType));
        }
        if (action) {
            filters.push(eq(activityLog.action, action));
        }
        if (entityIdParam !== null && Number.isFinite(entityIdParam)) {
            filters.push(eq(activityLog.entityId, entityIdParam));
        }
        if (Number.isFinite(from)) {
            filters.push(sql `${activityLog.createdAt} >= ${Math.floor(from)}`);
        }
        if (Number.isFinite(to)) {
            filters.push(sql `${activityLog.createdAt} <= ${Math.floor(to)}`);
        }
        const whereClause = filters.length > 0 ? and(...filters) : undefined;
        let entriesQuery = getActiveDb().select().from(activityLog);
        if (whereClause) {
            entriesQuery = entriesQuery.where(whereClause);
        }
        const rows = await entriesQuery
            .orderBy(desc(activityLog.createdAt))
            .limit(limit)
            .offset(offset);
        let totalQuery = getActiveDb()
            .select({ count: sql `count(*)` })
            .from(activityLog);
        if (whereClause) {
            totalQuery = totalQuery.where(whereClause);
        }
        const totalRows = await totalQuery;
        const total = Number(totalRows[0]?.count || 0);
        const entries = rows.map((row) => {
            let parsedDetails = null;
            if (row.details) {
                try {
                    const candidate = JSON.parse(row.details);
                    parsedDetails = candidate && typeof candidate === 'object' ? candidate : null;
                }
                catch {
                    parsedDetails = null;
                }
            }
            const createdAtValue = row.createdAt instanceof Date
                ? Math.floor(row.createdAt.getTime() / 1000)
                : Number(row.createdAt || 0);
            return {
                ...row,
                details: parsedDetails,
                createdAt: createdAtValue,
            };
        });
        res.json({ entries, total });
    }
    catch (error) {
        console.error('Error fetching activity log:', error);
        res.status(500).json({ error: 'Failed to fetch activity log' });
    }
});
function resolvePriceSourceForItem(input) {
    if (input.customerSpecial) {
        return {
            priceSource: 'special',
            finalPrice: roundToTwo(Number(input.customerSpecial.customPrice)),
            discountPercentage: 0,
        };
    }
    if (input.levelItem) {
        const overrideType = parsePriceLevelItemOverrideType(input.levelItem.overrideType) ?? 'rule_discount';
        const approvedPrice = Number.isFinite(input.approvedPrice) ? input.approvedPrice : 0;
        if (overrideType === 'custom_price' && input.levelItem.customPrice != null) {
            return {
                priceSource: 'level_custom',
                finalPrice: roundToTwo(Number(input.levelItem.customPrice)),
                discountPercentage: 0,
            };
        }
        if (isFixedAmountOverrideType(overrideType) && input.levelItem.customPrice != null) {
            return {
                priceSource: 'level_fixed',
                finalPrice: approvedPrice > 0 ? computePriceLevelItemFinalPrice({
                    overrideType,
                    adjustmentPercentage: null,
                    customPrice: Number(input.levelItem.customPrice),
                    approvedPrice,
                }) : 0,
                discountPercentage: 0,
            };
        }
        const adjustment = Number(input.levelItem.adjustmentPercentage ?? 0);
        const finalPrice = approvedPrice > 0 ? computePriceLevelItemFinalPrice({
            overrideType,
            adjustmentPercentage: adjustment,
            customPrice: null,
            approvedPrice,
        }) : 0;
        return {
            priceSource: 'level_rule',
            finalPrice,
            discountPercentage: adjustment,
        };
    }
    const approvedPrice = Number.isFinite(input.approvedPrice) ? input.approvedPrice : 0;
    const adjustmentType = input.levelRule.adjustmentType === 'markup' ? 'markup' : 'discount';
    const adjustmentPercentage = Number(input.levelRule.adjustmentPercentage ?? 0);
    const finalPrice = approvedPrice > 0
        ? (adjustmentType === 'markup'
            ? roundToTwo(approvedPrice * (1 + (adjustmentPercentage / 100)))
            : roundToTwo(approvedPrice * (1 - (adjustmentPercentage / 100))))
        : 0;
    return {
        priceSource: 'level_rule',
        finalPrice,
        discountPercentage: adjustmentType === 'discount' ? adjustmentPercentage : 0,
    };
}
async function buildPriceListItems(priceListId, customerId, priceLevelId, productIds) {
    const productsRows = await getActiveDb().select().from(products).where(inArray(products.id, productIds));
    const approvedProducts = productsRows.filter((product) => product.approvalStatus === 'approved' && product.approvedPrice != null);
    if (approvedProducts.length !== productIds.length) {
        return { error: 'All products must be approved before generating a price list' };
    }
    const levelItems = await getActiveDb().select().from(priceLevelItems).where(eq(priceLevelItems.priceLevelId, priceLevelId));
    const levelItemByProduct = new Map(levelItems.map((item) => [item.productId, item]));
    const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
    if (levelRows.length === 0) {
        return { error: 'Price level not found' };
    }
    const levelRule = levelRows[0];
    const specialRows = customerId == null
        ? []
        : await getActiveDb().select().from(specialPricing).where(and(eq(specialPricing.customerId, customerId), eq(specialPricing.status, 'approved')));
    const specialByProduct = new Map(specialRows.map((item) => [item.productId, item]));
    const now = new Date();
    const insertRows = approvedProducts.map((product) => {
        const special = specialByProduct.get(product.id) ?? null;
        const levelItem = levelItemByProduct.get(product.id) ?? null;
        const resolved = resolvePriceSourceForItem({
            customerSpecial: special,
            levelItem,
            approvedPrice: Number(product.approvedPrice),
            levelRule,
        });
        return {
            priceListId,
            productId: product.id,
            basePrice: Number(product.approvedPrice),
            discountPercentage: resolved.discountPercentage,
            finalPrice: resolved.finalPrice > 0 ? resolved.finalPrice : Number(product.approvedPrice),
            priceSource: resolved.priceSource,
            notes: null,
            createdAt: now,
        };
    });
    await getActiveDb().insert(priceListItems).values(insertRows);
    return { items: insertRows };
}
app.post('/api/price-lists', async (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const priceLevelId = Number(req.body?.priceLevelId);
        const customerId = req.body?.customerId === null || req.body?.customerId === undefined || req.body?.customerId === ''
            ? null
            : Number(req.body.customerId);
        const validFrom = typeof req.body?.validFrom === 'string' ? req.body.validFrom : getTodayDateString();
        const validUntil = typeof req.body?.validUntil === 'string' && req.body.validUntil.trim() ? req.body.validUntil.trim() : null;
        const generationMode = typeof req.body?.generationMode === 'string' ? req.body.generationMode : 'byPriceLevel';
        const productIds = Array.isArray(req.body?.products) ? req.body.products.map((value) => Number(value)).filter((value) => Number.isInteger(value)) : [];
        const selectedPriceLevelIds = Array.isArray(req.body?.selectedPriceLevelIds)
            ? req.body.selectedPriceLevelIds.map((value) => Number(value)).filter((value) => Number.isInteger(value))
            : [];
        if (!name || !Number.isInteger(priceLevelId)) {
            return res.status(400).json({ error: 'name and priceLevelId are required' });
        }
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        if (levelRows.length === 0) {
            return res.status(400).json({ error: 'Invalid priceLevelId' });
        }
        if (customerId !== null) {
            const customerRows = await getActiveDb().select().from(customers).where(eq(customers.id, customerId));
            if (customerRows.length === 0) {
                return res.status(400).json({ error: 'Invalid customerId' });
            }
            if (customerRows[0].priceLevelId !== priceLevelId) {
                return res.status(400).json({ error: 'Selected price level must match the customer price level' });
            }
        }
        const resolvedProductIds = productIds.length > 0 ? productIds : [];
        if (resolvedProductIds.length === 0) {
            return res.status(400).json({ error: 'products are required' });
        }
        const normalizedGenerationMode = generationMode === 'byCustomer'
            ? 'byCustomer'
            : generationMode === 'byLevel' || generationMode === 'byPriceLevel'
                ? 'byPriceLevel'
                : 'byPriceLevel';
        const created = await getActiveDb().insert(priceLists).values({
            name,
            customerId,
            priceLevelId,
            validFrom: new Date(`${validFrom}T00:00:00`),
            validUntil: validUntil ? new Date(`${validUntil}T00:00:00`) : null,
            status: 'active',
            createdBy: normalizedGenerationMode === 'byCustomer' ? 'byCustomer' : 'byPriceLevel',
            updatedAt: new Date(),
        }).returning();
        const itemsResult = await buildPriceListItems(created[0].id, customerId, priceLevelId, resolvedProductIds);
        if ('error' in itemsResult) {
            await getActiveDb().delete(priceLists).where(eq(priceLists.id, created[0].id));
            return res.status(400).json({ error: itemsResult.error });
        }
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
            .where(eq(priceLists.id, created[0].id));
        res.status(201).json({
            ...result[0],
            priceLevelName: getPriceLevelNameDisplay(result[0].createdBy, result[0].priceLevelName),
            items: itemsResult.items,
        });
    }
    catch (error) {
        console.error('Error creating price list:', error);
        res.status(500).json({ error: 'Failed to create price list' });
    }
});
app.get('/api/price-lists/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Invalid price list id' });
        }
        const list = await db
            .select({
            id: priceLists.id,
            name: priceLists.name,
            customerId: priceLists.customerId,
            customerName: customers.name,
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
            .leftJoin(customers, eq(priceLists.customerId, customers.id))
            .where(eq(priceLists.id, id));
        if (list.length === 0) {
            return res.status(404).json({ error: 'Price list not found' });
        }
        const items = await db
            .select({
            id: priceListItems.id,
            productId: priceListItems.productId,
            productName: products.name,
            productIsActive: products.isActive,
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
    }
    catch (error) {
        console.error('Error fetching price list:', error);
        res.status(500).json({ error: 'Failed to fetch price list' });
    }
});
app.post('/api/materials-requirement', async (req, res) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
            return res.status(400).json({ error: 'items are required' });
        }
        const requirementsByMaterial = new Map();
        for (const item of items) {
            const productId = Number(item?.productId);
            const quantity = Number(item?.quantity ?? 1);
            if (!Number.isInteger(productId) || !Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ error: 'Invalid item payload' });
            }
            const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
            if (productRows.length === 0) {
                return res.status(404).json({ error: 'Product not found' });
            }
            const bomRows = await getActiveDb().select().from(billOfMaterials).where(eq(billOfMaterials.productId, productId));
            for (const bom of bomRows) {
                const materialRows = await getActiveDb().select().from(materials).where(eq(materials.id, bom.materialId));
                if (materialRows.length === 0) {
                    continue;
                }
                const material = materialRows[0];
                const totalQuantity = Number(bom.quantity) * quantity;
                const existing = requirementsByMaterial.get(material.id);
                if (existing) {
                    existing.quantity += totalQuantity;
                }
                else {
                    requirementsByMaterial.set(material.id, {
                        materialId: material.id,
                        materialName: material.name,
                        quantity: totalQuantity,
                        unit: material.unit,
                    });
                }
            }
        }
        res.json({
            items: Array.from(requirementsByMaterial.values()),
        });
    }
    catch (error) {
        console.error('Error calculating materials requirement:', error);
        res.status(500).json({ error: 'Failed to calculate materials requirement' });
    }
});
// ============================================
// PRODUCT PACKS ENDPOINTS
// ============================================
// ============================================
// PRICE LISTS ENDPOINTS
// ============================================
function getPriceLevelNameDisplay(createdBy, fallbackName) {
    if (typeof createdBy === 'string' && createdBy.startsWith('user-multi-level:')) {
        return 'Multiple';
    }
    return fallbackName ?? '-';
}
function parseSelectedPriceLevelIds(createdBy, fallbackPriceLevelId) {
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
function toUnixSecondsValue(value) {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date) {
        const timestamp = value.getTime();
        if (Number.isNaN(timestamp))
            return null;
        return Math.floor(timestamp / 1000);
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return null;
        return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric > 1000000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
        }
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed))
            return null;
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
            customerName: customers.name,
            priceLevelId: priceLists.priceLevelId,
            priceLevelName: priceLevels.name,
            validFrom: priceLists.validFrom,
            validUntil: priceLists.validUntil,
            status: priceLists.status,
            createdBy: priceLists.createdBy,
            createdAt: priceLists.createdAt,
            updatedAt: priceLists.updatedAt,
            itemsCount: sql `count(${priceListItems.id})`,
        })
            .from(priceLists)
            .leftJoin(priceLevels, eq(priceLists.priceLevelId, priceLevels.id))
            .leftJoin(customers, eq(priceLists.customerId, customers.id))
            .leftJoin(priceListItems, eq(priceListItems.priceListId, priceLists.id))
            .groupBy(priceLists.id, priceLists.name, priceLists.customerId, customers.name, priceLists.priceLevelId, priceLevels.name, priceLists.validFrom, priceLists.validUntil, priceLists.status, priceLists.createdBy, priceLists.createdAt, priceLists.updatedAt);
        res.json(lists.map((list) => ({
            ...list,
            priceLevelName: getPriceLevelNameDisplay(list.createdBy, list.priceLevelName),
        })));
    }
    catch (error) {
        console.error('Error fetching price lists:', error);
        res.status(500).json({ error: 'Failed to fetch price lists' });
    }
});
app.listen(PORT, () => {
    console.log(`âœ… Server running on http://localhost:${PORT}`);
    startAutoBackupScheduler();
    processExpiredApprovedPrices()
        .then((result) => {
        if (result.processed > 0) {
            console.log(`â° Processed ${result.processed} expired approved price(s) on startup`);
        }
    })
        .catch((error) => {
        console.error('Failed startup price expiry processing:', error);
    });
});
app.get('/api/materials/:id/bom', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        if (!Number.isInteger(materialId)) {
            return res.status(400).json({ error: 'Invalid material id' });
        }
        const rows = await db
            .select({
            id: intermediateMaterialBom.id,
            intermediateMaterialId: intermediateMaterialBom.intermediateMaterialId,
            componentMaterialId: intermediateMaterialBom.componentMaterialId,
            quantity: intermediateMaterialBom.quantity,
            componentMaterialName: materials.name,
            unit: materials.unit,
            unitPrice: materials.unitPrice,
        })
            .from(intermediateMaterialBom)
            .innerJoin(materials, eq(intermediateMaterialBom.componentMaterialId, materials.id))
            .where(eq(intermediateMaterialBom.intermediateMaterialId, materialId));
        res.json(rows);
    }
    catch (error) {
        console.error('Error loading intermediate material BOM:', error);
        res.status(500).json({ error: 'Failed to load intermediate material BOM' });
    }
});
app.post('/api/materials/:id/bom', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        const componentMaterialId = Number(req.body?.componentMaterialId);
        const quantity = Number(req.body?.quantity);
        if (!Number.isInteger(materialId) || !Number.isInteger(componentMaterialId) || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ error: 'Invalid BOM item payload' });
        }
        if (materialId === componentMaterialId) {
            return res.status(400).json({ error: 'Intermediate material cannot reference itself' });
        }
        const inserted = await getActiveDb().insert(intermediateMaterialBom).values({
            intermediateMaterialId: materialId,
            componentMaterialId,
            quantity,
        }).returning();
        await recalculateIntermediateMaterialWithCascade(materialId);
        res.json(inserted[0]);
    }
    catch (error) {
        console.error('Error adding intermediate BOM item:', error);
        res.status(500).json({ error: 'Failed to add intermediate BOM item' });
    }
});
app.put('/api/materials/:id/bom/:bomId', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        const bomId = Number(req.params.bomId);
        const quantity = Number(req.body?.quantity);
        if (!Number.isInteger(materialId) || !Number.isInteger(bomId) || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        await getActiveDb().update(intermediateMaterialBom)
            .set({ quantity })
            .where(and(eq(intermediateMaterialBom.id, bomId), eq(intermediateMaterialBom.intermediateMaterialId, materialId)));
        await recalculateIntermediateMaterialWithCascade(materialId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating intermediate BOM item:', error);
        res.status(500).json({ error: 'Failed to update intermediate BOM item' });
    }
});
app.delete('/api/materials/:id/bom/:bomId', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        const bomId = Number(req.params.bomId);
        if (!Number.isInteger(materialId) || !Number.isInteger(bomId)) {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        await getActiveDb().delete(intermediateMaterialBom)
            .where(and(eq(intermediateMaterialBom.id, bomId), eq(intermediateMaterialBom.intermediateMaterialId, materialId)));
        await recalculateIntermediateMaterialWithCascade(materialId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting intermediate BOM item:', error);
        res.status(500).json({ error: 'Failed to delete intermediate BOM item' });
    }
});
app.post('/api/materials/:id/recalculate-cost', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        if (!Number.isInteger(materialId)) {
            return res.status(400).json({ error: 'Invalid material id' });
        }
        const summary = await recalculateIntermediateMaterialWithCascade(materialId);
        res.json(summary);
    }
    catch (error) {
        console.error('Error recalculating intermediate material cost:', error);
        res.status(500).json({ error: 'Failed to recalculate intermediate material cost' });
    }
});
app.post('/api/materials/:id/cascade-intermediate-costs', async (req, res) => {
    try {
        const materialId = Number(req.params.id);
        if (!Number.isInteger(materialId)) {
            return res.status(400).json({ error: 'Invalid material id' });
        }
        const rows = await getActiveDb().select().from(materials).where(eq(materials.id, materialId));
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }
        const material = rows[0];
        if (material.materialType === 'intermediate') {
            const summary = await recalculateIntermediateMaterialWithCascade(materialId);
            return res.json({
                materialId,
                materialType: material.materialType,
                intermediateUpdatedIds: summary.recalculated ? [materialId] : [],
                ...summary,
            });
        }
        const summary = await propagatePrimaryMaterialChange(materialId);
        res.json({
            materialId,
            materialType: material.materialType,
            ...summary,
        });
    }
    catch (error) {
        console.error('Error cascading intermediate material costs:', error);
        res.status(500).json({ error: 'Failed to cascade intermediate material costs' });
    }
});
// Serve templates from multiple possible locations
const possibleTemplateDirs = [
    path.join(__dirname, '..', '..', 'client-dist', 'templates'),
    path.join(__dirname, '..', '..', 'client', 'public', 'templates'),
    path.join(__dirname, '..', '..', 'client', 'dist', 'templates'),
];
const userDataPath = process.env.USER_DATA_PATH;
if (userDataPath) {
    possibleTemplateDirs.push(path.join(userDataPath, '..', 'app', 'client-dist', 'templates'));
}
for (const dir of possibleTemplateDirs) {
    if (fs.existsSync(dir)) {
        app.use('/templates', express.static(dir));
        console.log('[server] serving templates from:', dir);
        break;
    }
}
// Serve client static files and SPA fallback when running in Electron
const clientDistPath = process.env.CLIENT_DIST_PATH || '';
if (clientDistPath && fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}
