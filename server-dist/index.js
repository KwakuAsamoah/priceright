import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { getActiveDb, liveDb, DATABASE_FILE_PATH, DEMO_DATABASE_FILE_PATH, readDemoModeState, writeDemoModeState, closeLiveDb, reopenLiveDb } from './db.js';
import { seedDemoData } from './seedDemo.js';
import { currencies, exchangeRates, settings, materials, products, billOfMaterials, intermediateMaterialBom, materialPriceHistory, priceLevels, priceLevelItems, customers, specialPricing, priceLists, priceListItems, activityLog } from './schema.js';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
const app = express();
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
async function logActivity(params) {
    try {
        await getActiveDb().insert(activityLog).values({
            entityType: params.entityType,
            entityId: params.entityId ?? null,
            entityName: params.entityName ?? null,
            action: params.action,
            details: params.details ? JSON.stringify(params.details) : null,
            performedBy: params.performedBy ?? 'Admin',
            createdAt: new Date(),
        });
    }
    catch (err) {
        // Never let logging failure break the main operation
        console.error('[activity_log] Failed to write log entry:', err);
    }
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
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
async function resolveBaseCurrency() {
    const configuredCode = String((await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency')))[0]?.settingValue || 'GHS')
        .trim()
        .toUpperCase();
    const availableCurrencies = await getActiveDb().select().from(currencies);
    if (availableCurrencies.length === 0) {
        return { id: 0, code: 'GHS', symbol: 'GHS' };
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
    const otherCosts = Number(selectedProduct.otherDirectCosts || 0);
    const overheadCost = totalMaterialCost * (Number(selectedProduct.overheadPercentage || 0) / 100);
    const totalCost = totalMaterialCost + overheadCost + otherCosts;
    if (selectedProduct.productionMode === 'batch') {
        return totalCost / Math.max(1, Number(selectedProduct.batchYield || 1));
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
        return roundToFour(normalizedCustomPrice);
    }
    if (overrideType === 'rule_discount') {
        return roundToFour(normalizedApprovedPrice * (1 - (Number(adjustmentPercentage || 0) / 100)));
    }
    if (overrideType === 'rule_markup') {
        return roundToFour(normalizedApprovedPrice * (1 + (Number(adjustmentPercentage || 0) / 100)));
    }
    if (overrideType === 'fixed_amount_add') {
        return roundToFour(normalizedApprovedPrice + normalizedCustomPrice);
    }
    return roundToFour(normalizedApprovedPrice - normalizedCustomPrice);
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
async function toPriceLevelItemResponse(item, productRow) {
    const productionCost = await calculateProductionCostForProduct(productRow, productRow.id);
    const approvedPrice = Number(productRow.approvedPrice || 0);
    const optimalPrice = roundToFour(productionCost * (1 + (Number(productRow.profitMargin || 0) / 100)));
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
    return {
        id: item.id,
        priceLevelId: item.priceLevelId,
        productId: item.productId,
        productName: productRow.name,
        productCategory: productRow.category || '',
        productApprovedPrice: roundToFour(approvedPrice),
        productOptimalPrice: optimalPrice,
        productProductionCost: roundToFour(productionCost),
        overrideType,
        adjustmentPercentage,
        customPrice,
        finalPrice: computePriceLevelItemFinalPrice({
            overrideType,
            adjustmentPercentage,
            customPrice,
            approvedPrice,
        }),
        status: item.status,
        approvedBy: item.approvedBy ?? null,
        approvedAt: item.approvedAt ?? null,
        justification: item.justification ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        productApprovedAt,
        isStalePrice,
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
    res.json({ status: 'ok', version: '1.0.0' });
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
    }
    catch (error) {
        console.error('Error getting backup status:', error);
        res.status(500).json({ error: 'Failed to get backup status' });
    }
});
// --- User-initiated backup download ---
app.get('/api/backup/download', (_req, res) => {
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
app.get('/api/settings', async (req, res) => {
    try {
        const allSettings = await getActiveDb().select().from(settings);
        res.json(allSettings);
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
        const result = await getActiveDb().insert(exchangeRates).values({
            currencyId,
            rateToBase,
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
        const currencyId = parseInt(req.params.currencyId);
        const existing = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
        const oldRateValue = existing.length > 0 ? Number(existing[0].rateToBase || 0) : Number(rateToBase || 0);
        if (existing.length > 0) {
            await getActiveDb().update(exchangeRates)
                .set({ rateToBase, effectiveDate: new Date() })
                .where(eq(exchangeRates.currencyId, currencyId));
        }
        else {
            await getActiveDb().insert(exchangeRates).values({ currencyId, rateToBase, source: 'manual' });
        }
        const updated = await getActiveDb().select().from(exchangeRates).where(eq(exchangeRates.currencyId, currencyId));
        const currencyRows = await getActiveDb().select().from(currencies).where(eq(currencies.id, currencyId));
        const currencyCode = currencyRows[0]?.code || String(currencyId);
        const newRateValue = Number(updated[0]?.rateToBase || rateToBase || 0);
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
        const { name, sku, description, category, unit, bulkQuantity, bulkPrice, purchaseCurrencyId, supplier, supplierType, materialType, overheadPercentage, marginPercentage, intermediateCostMode, yieldPercentage, calculatedCostPerUnit, } = req.body;
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
            marginPercentage: normalizedMargin,
            intermediateCostMode: normalizedIntermediateCostMode,
            yieldPercentage: normalizedYield,
            calculatedCostPerUnit: unitPrice,
            supplier: supplier ?? supplierType ?? '',
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
        const name = req.body?.name ?? existing.name;
        const sku = req.body?.sku ?? existing.sku;
        const description = req.body?.description ?? existing.description;
        const materialType = req.body?.materialType === 'intermediate' ? 'intermediate' : (existing.materialType === 'intermediate' ? 'intermediate' : 'primary');
        const category = req.body?.category ?? existing.category;
        const unit = req.body?.unit ?? existing.unit;
        const bulkQuantity = Number(req.body?.bulkQuantity ?? existing.bulkQuantity);
        const bulkPrice = Number(req.body?.bulkPrice ?? existing.bulkPrice);
        const purchaseCurrencyId = Number(req.body?.purchaseCurrencyId ?? existing.purchaseCurrencyId);
        const overheadPercentage = Number(req.body?.overheadPercentage ?? existing.overheadPercentage ?? 0);
        const marginPercentage = Number(req.body?.marginPercentage ?? existing.marginPercentage ?? 0);
        const intermediateCostMode = req.body?.intermediateCostMode ?? existing.intermediateCostMode ?? 'yield';
        const yieldPercentage = Number(req.body?.yieldPercentage ?? existing.yieldPercentage ?? 100);
        const calculatedCostPerUnit = Number(req.body?.calculatedCostPerUnit ?? existing.calculatedCostPerUnit ?? existing.unitPrice ?? 0);
        const supplier = req.body?.supplier ?? req.body?.supplierType ?? existing.supplier;
        const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : Boolean(existing.isActive);
        const shouldRecalculatePrice = req.body?.bulkQuantity !== undefined
            || req.body?.bulkPrice !== undefined
            || req.body?.purchaseCurrencyId !== undefined;
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
        if (shouldRecalculatePrice) {
            await getActiveDb().insert(materialPriceHistory).values({
                materialId,
                purchaseCurrencyId: resolvedPurchaseCurrencyId,
                priceInPurchaseCurrency,
                priceInBaseCurrency,
            });
            if (materialType === 'intermediate') {
                await recalculateIntermediateMaterialWithCascade(materialId);
            }
            else {
                await propagatePrimaryMaterialChange(materialId);
            }
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
                    oldUnitPrice: Number(existing.unitPrice || 0),
                    newUnitPrice: Number(updatedMaterial.unitPrice || 0),
                    currency: purchaseCurrencyCode,
                    oldGhsPrice: Number(existing.priceInBaseCurrency || 0),
                    newGhsPrice: Number(updatedMaterial.priceInBaseCurrency || 0),
                },
                performedBy: await getCurrentUserName(),
            });
        }
        const updated = await getActiveDb().select().from(materials).where(eq(materials.id, materialId));
        res.json(updated[0]);
    }
    catch (error) {
        console.error('Error updating material:', error);
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
            const intermediateUsage = await db
                .select({
                intermediateId: intermediateMaterialBom.intermediateMaterialId,
                intermediateName: materials.name,
            })
                .from(intermediateMaterialBom)
                .leftJoin(materials, eq(intermediateMaterialBom.intermediateMaterialId, materials.id))
                .where(eq(intermediateMaterialBom.componentMaterialId, materialId));
            if (usageData.length === 0 && intermediateUsage.length === 0) {
                canDelete.push(materialId);
            }
            else {
                const productSet = new Set();
                const productNames = [];
                for (const usage of usageData) {
                    const key = `${usage.productId}-${usage.productName}`;
                    if (!productSet.has(key)) {
                        productSet.add(key);
                        productNames.push(String(usage.productName || 'Unknown Product'));
                    }
                }
                for (const usage of intermediateUsage) {
                    const label = `Intermediate: ${usage.intermediateName || usage.intermediateId}`;
                    if (!productSet.has(label)) {
                        productSet.add(label);
                        productNames.push(label);
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
        const normalizeSupplierType = (value) => {
            const raw = normalizeString(value);
            if (!raw)
                return 'Local';
            const lowered = raw.toLowerCase();
            if (lowered === 'local')
                return 'Local';
            if (lowered === 'foreign')
                return 'Foreign';
            return null;
        };
        const errors = [];
        const historyRows = [];
        let imported = 0;
        let updated = 0;
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index] || {};
            const rowNumber = index + 1;
            const name = normalizeString(row.name);
            const category = normalizeString(row.category);
            const unit = normalizeString(row.unit);
            const currencyCodeInput = normalizeString(row.currencyCode).toUpperCase();
            const bulkPrice = Number(row.bulkPrice);
            const bulkQuantity = Number(row.bulkQuantity);
            const supplierType = normalizeSupplierType(row.supplierType);
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
            if (!supplierType) {
                errors.push({ row: rowNumber, name, error: 'Supplier type must be Local or Foreign' });
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
                    supplier: supplierType,
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
                    supplier: supplierType,
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
// Intermediate Materials Import Endpoint
// Supports grouped BOM rows: one row per component, repeat intermediate fields on each row.
// Old single-row format (Intermediate Name, Category, Unit, Notes) is also accepted.
app.post('/api/intermediate-materials/import', async (req, res) => {
    try {
        const payload = req.body;
        const rows = Array.isArray(payload?.materials) ? payload.materials : null;
        if (!rows) {
            return res.status(400).json({ error: 'Request body must include a materials array' });
        }
        // Get base currency
        const baseCurrencySetting = await getActiveDb().select().from(settings).where(eq(settings.settingKey, 'baseCurrency'));
        const baseCurrencyCode = (baseCurrencySetting[0]?.settingValue || 'GHS').trim().toUpperCase();
        const allCurrencies = await db.select({ id: currencies.id, code: currencies.code }).from(currencies);
        const baseCurrency = allCurrencies.find((c) => c.code === baseCurrencyCode);
        const defaultCurrencyId = baseCurrency?.id || 1;
        // Get existing intermediate materials by name (case-insensitive) for duplicate check
        const existingIntermediates = await db
            .select({ id: materials.id, name: materials.name })
            .from(materials)
            .where(eq(materials.materialType, 'intermediate'));
        const existingByName = new Map(existingIntermediates.map((m) => [String(m.name || '').trim().toLowerCase(), m]));
        // Read all raw materials (for BOM component validation)
        const allRawMaterials = await db
            .select({ id: materials.id, name: materials.name })
            .from(materials)
            .where(eq(materials.materialType, 'primary'));
        const rawMaterialByName = new Map(allRawMaterials.map((m) => [String(m.name || '').trim().toLowerCase(), m]));
        const getField = (row, keys) => {
            for (const k of keys) {
                const v = row[k];
                if (v !== undefined && v !== null && String(v).trim() !== '')
                    return String(v).trim();
            }
            return '';
        };
        // Group rows by intermediate name (preserving order)
        const groups = new Map();
        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i] || {};
            const rawName = getField(raw, ['Intermediate Name', 'name']);
            if (!rawName)
                continue;
            const key = rawName.trim();
            if (!groups.has(key))
                groups.set(key, []);
            groups.get(key).push({ row: raw, rowNumber: i + 1 });
        }
        const errors = [];
        let imported = 0;
        let skipped = 0;
        for (const [intermediateName, entries] of groups.entries()) {
            const first = entries[0].row;
            const firstRowNumber = entries[0].rowNumber;
            // Read intermediate-level fields from the first row of the group
            const category = getField(first, ['Category', 'category']);
            const unit = getField(first, ['Unit', 'unit']) || 'Kg';
            const notes = getField(first, ['Notes', 'Description', 'notes', 'description']);
            const overheadPct = parseFloat(getField(first, ['Overhead %', 'Overhead', 'overhead']) || '0');
            const yieldPct = parseFloat(getField(first, ['Yield %', 'Yield', 'yield']) || '100');
            const marginPct = parseFloat(getField(first, ['Margin %', 'Margin', 'margin']) || '0');
            const bulkQty = parseFloat(getField(first, ['Bulk Quantity', 'Batch Size', 'bulkQuantity']) || '1');
            // Duplicate check
            if (existingByName.has(intermediateName.toLowerCase())) {
                errors.push({ row: firstRowNumber, name: intermediateName, reason: 'Intermediate material with this name already exists' });
                skipped += 1;
                continue;
            }
            // Validate numeric fields
            if (isNaN(overheadPct) || overheadPct < 0) {
                errors.push({ row: firstRowNumber, name: intermediateName, reason: `Invalid Overhead %: "${getField(first, ['Overhead %'])}"` });
                skipped += 1;
                continue;
            }
            if (isNaN(yieldPct) || yieldPct <= 0 || yieldPct > 100) {
                errors.push({ row: firstRowNumber, name: intermediateName, reason: `Invalid Yield % (must be 1–100): "${getField(first, ['Yield %'])}"` });
                skipped += 1;
                continue;
            }
            if (isNaN(bulkQty) || bulkQty <= 0) {
                errors.push({ row: firstRowNumber, name: intermediateName, reason: `Invalid Bulk Quantity: "${getField(first, ['Bulk Quantity'])}"` });
                skipped += 1;
                continue;
            }
            // Collect and validate BOM rows
            const validatedBom = [];
            let bomFailed = false;
            for (const entry of entries) {
                const componentName = getField(entry.row, ['Component Name', 'Component', 'Material Name', 'componentName']);
                if (!componentName)
                    continue; // rows without a component name are just header-repeats
                const qtyStr = getField(entry.row, ['Component Quantity', 'Quantity', 'quantity', 'componentQuantity']);
                const qty = parseFloat(qtyStr || '0');
                if (isNaN(qty) || qty <= 0) {
                    errors.push({ row: entry.rowNumber, name: intermediateName, reason: `Invalid Component Quantity for "${componentName}": "${qtyStr}"` });
                    bomFailed = true;
                    break;
                }
                const foundMat = rawMaterialByName.get(componentName.toLowerCase());
                if (!foundMat) {
                    errors.push({ row: entry.rowNumber, name: intermediateName, reason: `Component material "${componentName}" not found — import raw materials first` });
                    bomFailed = true;
                    break;
                }
                validatedBom.push({ materialId: foundMat.id, quantity: qty });
            }
            if (bomFailed) {
                skipped += 1;
                continue;
            }
            try {
                const created = await getActiveDb()
                    .insert(materials)
                    .values({
                    name: intermediateName,
                    sku: null,
                    description: notes || null,
                    materialType: 'intermediate',
                    category: category || '',
                    unit,
                    bulkQuantity: bulkQty,
                    bulkPrice: 0,
                    purchaseCurrencyId: defaultCurrencyId,
                    priceInPurchaseCurrency: 0,
                    priceInBaseCurrency: 0,
                    unitPrice: 0,
                    overheadPercentage: overheadPct,
                    marginPercentage: marginPct,
                    yieldPercentage: yieldPct,
                    calculatedCostPerUnit: 0,
                    supplier: '',
                    isActive: true,
                })
                    .returning();
                const intermediateId = created[0].id;
                existingByName.set(intermediateName.toLowerCase(), { id: intermediateId, name: intermediateName });
                for (const bom of validatedBom) {
                    await getActiveDb().insert(intermediateMaterialBom).values({
                        intermediateMaterialId: intermediateId,
                        componentMaterialId: bom.materialId,
                        quantity: bom.quantity,
                    });
                }
                // Recalculate cost from BOM after insert
                try {
                    await recalculateIntermediateMaterialWithCascade(intermediateId);
                }
                catch (calcErr) {
                    console.error('[import] Cost recalc failed for', intermediateName, calcErr);
                    // Do not fail the import — row still counts as imported
                }
                imported += 1;
            }
            catch (error) {
                errors.push({ row: firstRowNumber, name: intermediateName, reason: error?.message || 'Failed to create intermediate material' });
                skipped += 1;
            }
        }
        return res.json({ imported, skipped, errors });
    }
    catch (error) {
        console.error('Error importing intermediate materials:', error);
        return res.status(500).json({ error: 'Failed to import intermediate materials' });
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
    const otherCosts = parseFloat(product.otherDirectCosts?.toString() || '0');
    const overheadCost = totalMaterialCost * (parseFloat(product.overheadPercentage.toString()) / 100);
    const totalCost = totalMaterialCost + overheadCost + otherCosts;
    // Markup formula: optimal price = totalCost × (1 + margin%)
    // The margin% here means profit on cost (markup), not profit on sales.
    // Example: cost GHS 2.41, markup 20% -> optimal = GHS 2.89
    // Gross margin at that price = (2.89-2.41)/2.89 = 16.6%
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
    const typedDb = db;
    return typedDb.$client ?? null;
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
let rejectionReasonColumnChecked = false;
function ensureProductRejectionReasonColumn() {
    if (rejectionReasonColumnChecked) {
        return;
    }
    const sqliteClient = getSqliteClient();
    if (!sqliteClient) {
        return;
    }
    const productColumns = sqliteClient
        .prepare("SELECT name FROM pragma_table_info('products')")
        .all();
    if (!productColumns.some((column) => column.name === 'rejection_reason')) {
        sqliteClient.prepare('ALTER TABLE products ADD COLUMN rejection_reason TEXT').run();
    }
    rejectionReasonColumnChecked = true;
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
async function recalculateIntermediateMaterialCost(intermediateMaterialId) {
    const rows = await getActiveDb().select().from(materials).where(eq(materials.id, intermediateMaterialId));
    if (rows.length === 0) {
        return { recalculated: false, unitPrice: 0 };
    }
    const intermediate = rows[0];
    if (intermediate.materialType !== 'intermediate') {
        return { recalculated: false, unitPrice: Number(intermediate.unitPrice || 0) };
    }
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
    const overheadMultiplier = 1 + (Number(intermediate.overheadPercentage || 0) / 100);
    const safeBulkQuantity = Math.max(0.0001, Number(intermediate.bulkQuantity || 1));
    const intermediateCostMode = intermediate.intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield';
    const yieldFraction = Math.max(0.01, Number(intermediate.yieldPercentage || 100) / 100);
    const effectiveOutputQuantity = intermediateCostMode === 'completed_output'
        ? safeBulkQuantity
        : safeBulkQuantity * yieldFraction;
    const totalBatchCost = roundToTwo(baseCost * overheadMultiplier);
    const calculatedUnitPrice = roundToTwo(totalBatchCost / effectiveOutputQuantity);
    const bulkPrice = roundToTwo(totalBatchCost);
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
    return { recalculated: true, unitPrice: calculatedUnitPrice };
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
    const reviewSummary = await setNeedsReviewForMaterial(intermediateMaterialId);
    return {
        intermediateMaterialId,
        recalculated: true,
        affectedProducts: reviewSummary.reviewedProductIds.length,
        productsNowNeedsReview: reviewSummary.productsNowNeedsReviewIds.length,
        reviewedProductIds: reviewSummary.reviewedProductIds,
        productsNowNeedsReviewIds: reviewSummary.productsNowNeedsReviewIds,
    };
}
async function propagatePrimaryMaterialChange(materialId) {
    const reviewedProductIds = new Set();
    const productsNowNeedsReviewIds = new Set();
    const directSummary = await setNeedsReviewForMaterial(materialId);
    for (const productId of directSummary.reviewedProductIds) {
        reviewedProductIds.add(productId);
    }
    for (const productId of directSummary.productsNowNeedsReviewIds) {
        productsNowNeedsReviewIds.add(productId);
    }
    const intermediateLinks = await db
        .select({ intermediateMaterialId: intermediateMaterialBom.intermediateMaterialId })
        .from(intermediateMaterialBom)
        .where(eq(intermediateMaterialBom.componentMaterialId, materialId));
    const intermediateIds = Array.from(new Set(intermediateLinks.map((link) => link.intermediateMaterialId)));
    for (const intermediateId of intermediateIds) {
        const summary = await recalculateIntermediateMaterialWithCascade(intermediateId);
        if (summary.recalculated) {
            for (const productId of summary.reviewedProductIds) {
                reviewedProductIds.add(productId);
            }
            for (const productId of summary.productsNowNeedsReviewIds) {
                productsNowNeedsReviewIds.add(productId);
            }
        }
    }
    return {
        reviewedProductIds: Array.from(reviewedProductIds),
        productsNowNeedsReviewIds: Array.from(productsNowNeedsReviewIds),
        intermediateUpdatedIds: intermediateIds,
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
            .select()
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
app.post('/api/products', async (req, res) => {
    try {
        const { name, sku, description, category, overheadPercentage, profitMargin, otherDirectCosts, productionMode, batchYield, currentSellingPrice } = req.body;
        const result = await getActiveDb().insert(products).values({
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
    }
    catch (error) {
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
        const otherDirectCosts = Number(req.body?.otherDirectCosts ?? existing.otherDirectCosts ?? 0);
        const productionMode = req.body?.productionMode ?? existing.productionMode ?? 'single';
        const batchYield = Number(req.body?.batchYield ?? existing.batchYield ?? 1);
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
        const shouldReevaluateReview = req.body?.overheadPercentage !== undefined
            || req.body?.profitMargin !== undefined
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
            otherDirectCosts: otherDirectCosts || 0,
            productionMode: productionMode || 'single',
            batchYield: batchYield || 1,
            currentSellingPrice: currentSellingPrice || 0,
            approvedPrice,
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
        const sqliteClient = getSqliteClient();
        if (sqliteClient) {
            ensureProductRejectionReasonColumn();
            sqliteClient.prepare('UPDATE products SET rejection_reason = NULL WHERE id = ?').run(productId);
        }
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
        // Post-approval: activity log — wrapped so a failure does not cause a 500
        try {
            const performedBy = await getCurrentUserName();
            const productionCost = await calculateProductionCostForProduct(updated[0], productId);
            const margin = approvedPriceNumber > 0
                ? ((approvedPriceNumber - productionCost) / approvedPriceNumber) * 100
                : 0;
            await logActivity({
                entityType: 'product',
                entityId: productId,
                entityName: updatedProduct.name,
                action: 'product.approved',
                details: {
                    oldPrice: existing.approvedPrice == null ? null : Number(existing.approvedPrice),
                    newPrice: approvedPriceNumber,
                    productionCost: roundToTwo(productionCost),
                    margin: roundToTwo(margin),
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
            const staleCustomPriceItems = await getActiveDb()
                .select({
                priceLevelId: priceLevelItems.priceLevelId,
                priceLevelName: priceLevels.name,
                customPrice: priceLevelItems.customPrice,
            })
                .from(priceLevelItems)
                .innerJoin(priceLevels, eq(priceLevelItems.priceLevelId, priceLevels.id))
                .where(and(eq(priceLevelItems.productId, productId), or(eq(priceLevelItems.overrideType, 'fixed_amount_add'), eq(priceLevelItems.overrideType, 'fixed_amount_deduct'), eq(priceLevelItems.overrideType, 'custom_price')), eq(priceLevelItems.status, 'approved')));
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
        });
    }
    catch (error) {
        console.error('Error approving product:', error);
        res.status(500).json({ error: 'Failed to approve price' });
    }
});
app.post('/api/products/:id/reject', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        ensureProductRejectionReasonColumn();
        await getActiveDb().update(products).set({
            approvalStatus: 'rejected',
            approvedPrice: null,
            approvedBy: null,
            approvedAt: null,
            needsReviewReason: null,
            updatedAt: new Date(),
        }).where(eq(products.id, productId));
        const sqliteClient = getSqliteClient();
        if (sqliteClient) {
            sqliteClient.prepare('UPDATE products SET rejection_reason = ? WHERE id = ?').run(reason || null, productId);
        }
        const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        const product = productRows[0];
        await logActivity({
            entityType: 'product',
            entityId: productId,
            entityName: product?.name || null,
            action: 'product.rejected',
            details: { reason: reason || null },
            performedBy: await getCurrentUserName(),
        });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to reject price' });
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
        const rejected = [];
        const performedBy = await getCurrentUserName();
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
                priceToApprove = currentSellingPrice > 0 ? currentSellingPrice : optimalPrice;
            }
            else if (normalizedMethod === 'markup') {
                priceToApprove = roundToTwo(optimalPrice * (1 + (normalizedMarkupPercentage / 100)));
            }
            if (current.approvalStatus === 'approved' && arePricesEqual(current.approvedPrice, priceToApprove)) {
                skipped += 1;
                continue;
            }
            const updatePayload = {
                approvalStatus: 'approved',
                approvedPrice: priceToApprove,
                currentSellingPrice: priceToApprove,
                approvedBy: 'user',
                approvedAt: new Date(),
                approvedPriceExpiresAt: hasPriceExpiryDateInput || hasExpiryDaysInput ? resolvedExpiryDate : current.approvedPriceExpiresAt,
                priceExpiryNotifiedAt: null,
                needsReviewReason: null,
                updatedAt: new Date(),
            };
            await getActiveDb().update(products).set(updatePayload).where(eq(products.id, productId));
            const sqliteClient = getSqliteClient();
            if (sqliteClient) {
                sqliteClient.prepare('UPDATE products SET rejection_reason = NULL WHERE id = ?').run(productId);
            }
            const productionCost = await calculateProductionCostForProduct(current, productId);
            const margin = priceToApprove > 0 ? ((priceToApprove - productionCost) / priceToApprove) * 100 : 0;
            await logActivity({
                entityType: 'product',
                entityId: productId,
                entityName: current.name,
                action: 'product.approved',
                details: {
                    oldPrice: current.approvedPrice == null ? null : Number(current.approvedPrice),
                    newPrice: priceToApprove,
                    productionCost: roundToTwo(productionCost),
                    margin: roundToTwo(margin),
                },
                performedBy,
            });
            approved += 1;
        }
        res.json({
            approved,
            rejected,
            skipped,
            priceMethod: normalizedMethod,
            ...(normalizedMethod === 'markup' ? { markupPercentage: normalizedMarkupPercentage } : {}),
        });
    }
    catch (error) {
        console.error('Error bulk approving products:', error);
        res.status(500).json({ error: 'Failed to bulk approve products' });
    }
});
app.post('/api/products/bulk-reject', async (req, res) => {
    try {
        const { productIds, reason } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: 'No products provided' });
        }
        ensureProductRejectionReasonColumn();
        const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
        let rejected = 0;
        let skipped = 0;
        for (const productId of productIds) {
            const currentRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
            if (currentRows.length === 0) {
                skipped += 1;
                continue;
            }
            const current = currentRows[0];
            if (current.approvalStatus !== 'approved') {
                skipped += 1;
                continue;
            }
            await getActiveDb().update(products).set({
                approvalStatus: 'rejected',
                approvedPrice: null,
                approvedBy: null,
                approvedAt: new Date(),
                needsReviewReason: null,
                updatedAt: new Date(),
            }).where(eq(products.id, productId));
            const sqliteClient = getSqliteClient();
            if (sqliteClient) {
                sqliteClient.prepare('UPDATE products SET rejection_reason = ? WHERE id = ?').run(normalizedReason || null, productId);
            }
            rejected += 1;
        }
        res.json({ rejected, skipped });
    }
    catch (error) {
        console.error('Bulk reject failed:', error);
        res.status(500).json({ error: 'Failed to bulk reject products' });
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
        // Calculate overhead and profit
        const otherCosts = parseFloat(product[0].otherDirectCosts?.toString() || '0');
        const overheadCost = totalMaterialCost * (parseFloat(product[0].overheadPercentage.toString()) / 100);
        const totalCost = totalMaterialCost + overheadCost + otherCosts;
        // Markup formula: optimal price = totalCost × (1 + margin%)
        // The margin% here means profit on cost (markup), not profit on sales.
        // Example: cost GHS 2.41, markup 20% -> optimal = GHS 2.89
        // Gross margin at that price = (2.89-2.41)/2.89 = 16.6%
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
        res.json(levels);
    }
    catch (error) {
        console.error('Error fetching price levels:', error);
        res.status(500).json({ error: 'Failed to fetch price levels' });
    }
});
app.post('/api/price-levels', async (req, res) => {
    try {
        const { name, description, adjustmentType, adjustmentPercentage } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        const normalizedAdjustmentType = adjustmentType === 'markup' ? 'markup' : 'discount';
        const numericPercentage = Number(adjustmentPercentage ?? 0);
        const safePercentage = Number.isFinite(numericPercentage) && numericPercentage >= 0 ? numericPercentage : 0;
        const multiplier = normalizedAdjustmentType === 'markup'
            ? 1 + (safePercentage / 100)
            : 1 - (safePercentage / 100);
        const result = await getActiveDb().insert(priceLevels).values({
            name: name.trim(),
            multiplier,
            adjustmentType: normalizedAdjustmentType,
            adjustmentPercentage: safePercentage,
            description: typeof description === 'string' ? description.trim() : null,
        }).returning();
        await logActivity({
            entityType: 'price_level',
            entityId: result[0].id,
            entityName: result[0].name,
            action: 'price_level.created',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json(result[0]);
    }
    catch (error) {
        console.error('Error creating price level:', error);
        res.status(500).json({ error: 'Failed to create price level' });
    }
});
app.get('/api/price-level-rules', async (req, res) => {
    try {
        const rules = await getActiveDb().select().from(priceLevels);
        res.json(rules);
    }
    catch (error) {
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
        const result = await getActiveDb().insert(priceLevels).values({
            name,
            multiplier,
            adjustmentType,
            adjustmentPercentage: numericPercentage,
            description,
        }).returning();
        await logActivity({
            entityType: 'price_level',
            entityId: result[0].id,
            entityName: result[0].name,
            action: 'price_level.created',
            details: null,
            performedBy: await getCurrentUserName(),
        });
        res.json(result[0]);
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
        await getActiveDb().update(priceLevels)
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
        const response = await Promise.all(items
            .filter((item) => productById.has(item.productId))
            .map((item) => toPriceLevelItemResponse(item, productById.get(item.productId))));
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching price level items:', error);
        res.status(500).json({ error: 'Failed to fetch price level items' });
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
            if (customPrice == null || Number.isNaN(customPrice) || customPrice <= 0) {
                return res.status(400).json({ error: 'customPrice must be greater than 0 for fixed amount pricing' });
            }
            const productionCost = await calculateProductionCostForProduct(selectedProduct, productId);
            const approvedPriceNumber = Number(selectedProduct.approvedPrice ?? 0);
            let proposedFinalPrice = customPrice;
            if (overrideType === 'fixed_amount_add') {
                proposedFinalPrice = approvedPriceNumber + customPrice;
            }
            else if (overrideType === 'fixed_amount_deduct') {
                proposedFinalPrice = approvedPriceNumber - customPrice;
            }
            if (proposedFinalPrice <= productionCost) {
                return res.status(400).json({
                    error: 'Proposed fixed amount pricing must be above production cost',
                    code: 'PRICE_BELOW_COST',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: roundToTwo(proposedFinalPrice),
                    },
                });
            }
            const resultingMarginPercentage = ((proposedFinalPrice - productionCost) / proposedFinalPrice) * 100;
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
                resolvedCustomPrice = roundToFour(customPrice);
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
        const response = await toPriceLevelItemResponse(savedRows[0], selectedProduct);
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
            if (customPrice == null || Number.isNaN(customPrice) || customPrice <= 0) {
                return res.status(400).json({ error: 'customPrice must be greater than 0 for fixed amount pricing' });
            }
            const productionCost = await calculateProductionCostForProduct(selectedProduct, existing.productId);
            const approvedPriceNumber = Number(selectedProduct.approvedPrice ?? 0);
            let proposedFinalPrice = customPrice;
            if (overrideType === 'fixed_amount_add') {
                proposedFinalPrice = approvedPriceNumber + customPrice;
            }
            else if (overrideType === 'fixed_amount_deduct') {
                proposedFinalPrice = approvedPriceNumber - customPrice;
            }
            if (proposedFinalPrice <= productionCost) {
                return res.status(400).json({
                    error: 'Proposed fixed amount pricing must be above production cost',
                    code: 'PRICE_BELOW_COST',
                    details: {
                        productionCost: roundToTwo(productionCost),
                        proposedPrice: roundToTwo(proposedFinalPrice),
                    },
                });
            }
            const resultingMarginPercentage = ((proposedFinalPrice - productionCost) / proposedFinalPrice) * 100;
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
                resolvedCustomPrice = roundToFour(customPrice);
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
        const response = await toPriceLevelItemResponse(updatedRows[0], selectedProduct);
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
        const response = await toPriceLevelItemResponse(updatedRows[0], productRows[0]);
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
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
app.post('/api/price-levels/:id/items/:productId/reject', async (req, res) => {
    try {
        const priceLevelId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);
        if (!Number.isInteger(priceLevelId) || !Number.isInteger(productId)) {
            return res.status(400).json({ error: 'Invalid price level id or product id' });
        }
        const rejectionJustification = typeof req.body?.justification === 'string' ? req.body.justification.trim() : '';
        if (!rejectionJustification) {
            return res.status(400).json({ error: 'justification is required for rejection' });
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
            status: 'rejected',
            approvedBy,
            approvedAt: new Date(),
            justification: rejectionJustification,
            updatedAt: new Date(),
        })
            .where(eq(priceLevelItems.id, existingRows[0].id));
        const updatedRows = await getActiveDb().select().from(priceLevelItems).where(eq(priceLevelItems.id, existingRows[0].id));
        const productRows = await getActiveDb().select().from(products).where(eq(products.id, productId));
        const response = await toPriceLevelItemResponse(updatedRows[0], productRows[0]);
        const levelRows = await getActiveDb().select().from(priceLevels).where(eq(priceLevels.id, priceLevelId));
        const levelName = levelRows[0]?.name || `Level ${priceLevelId}`;
        const productName = productRows[0]?.name || `Product ${productId}`;
        await logActivity({
            entityType: 'price_level_item',
            entityId: updatedRows[0].id,
            entityName: productName,
            action: 'price_level_item.rejected',
            details: {
                levelName,
                productName,
                reason: rejectionJustification || null,
            },
            performedBy: await getCurrentUserName(),
        });
        res.json(response);
    }
    catch (error) {
        console.error('Error rejecting price level item:', error);
        res.status(500).json({ error: 'Failed to reject price level item' });
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
            finalPrice: Number(input.customerSpecial.customPrice),
            discountPercentage: 0,
        };
    }
    if (input.levelItem) {
        const overrideType = parsePriceLevelItemOverrideType(input.levelItem.overrideType) ?? 'rule_discount';
        const approvedPrice = Number.isFinite(input.approvedPrice) ? input.approvedPrice : 0;
        if (overrideType === 'custom_price' && input.levelItem.customPrice != null) {
            return {
                priceSource: 'level_custom',
                finalPrice: Number(input.levelItem.customPrice),
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
            ? roundToFour(approvedPrice * (1 + (adjustmentPercentage / 100)))
            : roundToFour(approvedPrice * (1 - (adjustmentPercentage / 100))))
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
// Import products (grouped rows: one row per BOM material)
app.post('/api/products/import', async (req, res) => {
    try {
        const rows = req.body;
        if (!Array.isArray(rows))
            return res.status(400).json({ error: 'Expected an array of rows' });
        // Helper to read fields case-insensitively
        const getField = (row, keys) => {
            for (const k of keys) {
                if (row[k] !== undefined && row[k] !== null && row[k] !== '')
                    return String(row[k]).toString();
            }
            // Try case-insensitive match
            const lowerKeys = Object.keys(row || {}).reduce((acc, cur) => { acc[cur.toLowerCase()] = row[cur]; return acc; }, {});
            for (const k of keys) {
                const v = lowerKeys[k.toLowerCase()];
                if (v !== undefined && v !== null && v !== '')
                    return String(v).toString();
            }
            return '';
        };
        // Group rows by product name
        const groups = {};
        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i];
            const rowNumber = i + 1;
            const productName = getField(raw, ['Product Name', 'name', 'ProductName']);
            if (!productName) {
                groups[`__INVALID__`] = groups[`__INVALID__`] || [];
                groups[`__INVALID__`].push({ row: raw, rowNumber });
                continue;
            }
            const key = productName.trim();
            groups[key] = groups[key] || [];
            groups[key].push({ row: raw, rowNumber });
        }
        const errors = [];
        let imported = 0;
        let skipped = 0;
        // Load all existing products for duplicate name check
        const existingProducts = await getActiveDb().select().from(products);
        const existingProductNames = new Set(existingProducts.map((p) => String(p.name).toLowerCase()));
        for (const [productName, entries] of Object.entries(groups)) {
            if (productName === '__INVALID__') {
                for (const e of entries) {
                    errors.push({ productName: '', row: e.rowNumber, reason: 'Missing required field: Product Name' });
                    skipped += 1;
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
            const profitRaw = getField(first, ['Profit on Cost %', 'Profit on cost %', 'Profit Margin %', 'Profit', 'profitMargin', 'Profit Margin%']);
            const currentSellingPriceRaw = getField(first, ['Current Selling Price', 'currentSellingPrice', 'Selling Price', 'Current Price']);
            // Validate product-level fields
            const productionMode = productionModeRaw ? String(productionModeRaw).toLowerCase() : 'single';
            if (!['single', 'batch'].includes(productionMode)) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Invalid Production Mode: ${productionModeRaw}` });
                skipped += 1;
                continue;
            }
            const batchYield = productionMode === 'batch' ? parseInt(batchYieldRaw || '0') : 1;
            if (productionMode === 'batch' && (!batchYield || isNaN(batchYield) || batchYield <= 0)) {
                errors.push({ productName, row: entries[0].rowNumber, reason: 'Missing or invalid Batch Yield for batch product' });
                skipped += 1;
                continue;
            }
            const overhead = parseFloat(overheadRaw || '0');
            const profitMargin = parseFloat(profitRaw || '0');
            const currentSellingPrice = currentSellingPriceRaw ? parseFloat(currentSellingPriceRaw) : 0;
            if (isNaN(overhead)) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Invalid Overhead %: ${overheadRaw}` });
                skipped += 1;
                continue;
            }
            if (isNaN(profitMargin) || profitMargin < 0 || profitMargin > 99) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Invalid Profit on Cost %: ${profitRaw}` });
                skipped += 1;
                continue;
            }
            if (isNaN(currentSellingPrice) || currentSellingPrice < 0) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Invalid Current Selling Price: ${currentSellingPriceRaw}` });
                skipped += 1;
                continue;
            }
            // Duplicate product name check (case-insensitive)
            const lowerName = productName.toLowerCase();
            if (existingProductNames.has(lowerName)) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Product '${productName}' already exists and was skipped.` });
                skipped += 1;
                continue;
            }
            // Validate all materials BEFORE creating product (if any missing, skip entire product)
            const materialValidationErrors = [];
            for (const e of entries) {
                const matName = getField(e.row, ['Material Name', 'Material', 'materialName', 'MaterialName']);
                const qtyRaw = getField(e.row, ['Quantity', 'quantity']);
                const qty = parseFloat(qtyRaw || '0');
                if (!matName) {
                    materialValidationErrors.push({ rowNumber: e.rowNumber, matName: '' });
                    continue;
                }
                if (isNaN(qty) || qty <= 0) {
                    materialValidationErrors.push({ rowNumber: e.rowNumber, matName });
                    continue;
                }
                // Find material by name (case-insensitive)
                const mats = await getActiveDb().select().from(materials).where(sql `lower(${materials.name}) = ${matName.toLowerCase()}`);
                if (!mats || mats.length === 0) {
                    materialValidationErrors.push({ rowNumber: e.rowNumber, matName });
                }
            }
            // If any material validation failed, skip entire product
            if (materialValidationErrors.length > 0) {
                const firstError = materialValidationErrors[0];
                const reason = firstError.matName === ''
                    ? 'BOM line is missing a material name'
                    : `Material '${firstError.matName}' not found. Import materials and intermediates first.`;
                errors.push({ productName, row: entries[0].rowNumber, reason });
                skipped += 1;
                continue;
            }
            // Create product
            try {
                const created = await getActiveDb().insert(products).values({
                    name: productName,
                    sku: sku || null,
                    description: first['Description'] || first['description'] || null,
                    category: category || null,
                    overheadPercentage: overhead,
                    profitMargin: profitMargin,
                    productionMode: productionMode,
                    batchYield: batchYield || 1,
                    currentSellingPrice,
                    approvalStatus: 'pending',
                    isActive: true,
                }).returning();
                const productId = created[0].id;
                // For each BOM row, find material and add to BOM
                for (const e of entries) {
                    const matName = getField(e.row, ['Material Name', 'Material', 'materialName', 'MaterialName']);
                    const qtyRaw = getField(e.row, ['Quantity', 'quantity']);
                    const qty = parseFloat(qtyRaw || '0');
                    // Material already validated above, so just insert
                    const mats = await getActiveDb().select().from(materials).where(sql `lower(${materials.name}) = ${matName.toLowerCase()}`);
                    if (mats && mats.length > 0) {
                        await getActiveDb().insert(billOfMaterials).values({
                            productId,
                            materialId: mats[0].id,
                            quantity: qty,
                        });
                    }
                }
                imported += 1;
            }
            catch (err) {
                errors.push({ productName, row: entries[0].rowNumber, reason: `Failed to create product: ${err?.message || String(err)}` });
                skipped += 1;
            }
        }
        res.json({ imported, skipped, errors });
    }
    catch (error) {
        console.error('Error importing products:', error);
        res.status(500).json({ error: 'Failed to import products' });
    }
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
// Serve client static files and SPA fallback when running in Electron
const clientDistPath = process.env.CLIENT_DIST_PATH || '';
if (clientDistPath && fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}
