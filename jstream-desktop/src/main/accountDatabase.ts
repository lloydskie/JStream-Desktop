import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';
import crypto from 'node:crypto';

// User accounts are stored in a master accounts.json file
const accountsPath = path.join(app.getPath('userData'), 'accounts.json');
const userDataDir = path.join(app.getPath('userData'), 'user_data');

// Ensure user_data directory exists
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

interface UserAccount {
  id: string;
  name: string;
  avatar: string;
  pinHash: string;
  recoveryPinHash: string;
  createdAt: string;
  isKid: boolean;
}

interface AccountsData {
  accounts: UserAccount[];
  currentAccountId: string | null;
}

// User database types
interface FavoriteItem {
  id: number;
  item_id: string;
  item_type: string;
  added_at: string;
  sort_order: number;
}

interface WatchHistoryItem {
  id: number;
  item_id: string;
  position: number;
  watched_at: string;
}

interface PersonalizationItem {
  key: string;
  value: string;
}

interface UserDatabase {
  favorites: FavoriteItem[];
  watch_history: WatchHistoryItem[];
  personalization: PersonalizationItem[];
  recent_watches: { movie: number[]; tv: number[] };
}

// Hash function for PINs (using SHA-256)
function hashPin(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

// Generate a random salt
function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Load accounts from file
function loadAccountsData(): AccountsData {
  try {
    const data = fs.readFileSync(accountsPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { accounts: [], currentAccountId: null };
  }
}

// Save accounts to file
function saveAccountsData(data: AccountsData) {
  fs.writeFileSync(accountsPath, JSON.stringify(data, null, 2));
}

// Get all accounts (without sensitive data)
export function getAccounts(): Omit<UserAccount, 'pinHash' | 'recoveryPinHash'>[] {
  const data = loadAccountsData();
  return data.accounts.map(({ id, name, avatar, createdAt, isKid }) => ({
    id, name, avatar, createdAt, isKid
  }));
}

// Create a new account
export function createAccount(
  accountInfo: { id: string; name: string; avatar: string; pin: string; isKid: boolean },
  recoveryPin: string
): boolean {
  const data = loadAccountsData();
  
  // Generate salt for this account
  const salt = accountInfo.id; // Use account ID as salt for simplicity
  
  const newAccount: UserAccount = {
    id: accountInfo.id,
    name: accountInfo.name,
    avatar: accountInfo.avatar,
    pinHash: hashPin(accountInfo.pin, salt),
    recoveryPinHash: hashPin(recoveryPin, salt),
    createdAt: new Date().toISOString().split('T')[0],
    isKid: accountInfo.isKid,
  };
  
  data.accounts.push(newAccount);
  data.currentAccountId = newAccount.id;
  saveAccountsData(data);
  
  // Create user's data directory and initialize their database
  const userDir = path.join(userDataDir, newAccount.id);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  
  // Initialize the user's database
  const userDbPath = path.join(userDir, 'data.json');
  const initialData: UserDatabase = {
    favorites: [] as FavoriteItem[],
    watch_history: [] as WatchHistoryItem[],
    personalization: [] as PersonalizationItem[],
    recent_watches: { movie: [] as number[], tv: [] as number[] },
  };
  fs.writeFileSync(userDbPath, JSON.stringify(initialData, null, 2));
  
  return true;
}

// Verify PIN and login
export function loginAccount(accountId: string, pin: string): boolean {
  const data = loadAccountsData();
  const account = data.accounts.find(a => a.id === accountId);
  
  if (!account) return false;
  
  const pinHash = hashPin(pin, accountId);
  
  // Check both regular PIN and recovery PIN
  if (pinHash === account.pinHash || pinHash === account.recoveryPinHash) {
    data.currentAccountId = accountId;
    saveAccountsData(data);
    return true;
  }
  
  return false;
}

// Delete an account
export function deleteAccount(accountId: string): boolean {
  const data = loadAccountsData();
  const index = data.accounts.findIndex(a => a.id === accountId);
  
  if (index === -1) return false;
  
  // Remove from accounts list
  data.accounts.splice(index, 1);
  
  // Clear current account if it was the deleted one
  if (data.currentAccountId === accountId) {
    data.currentAccountId = data.accounts.length > 0 ? data.accounts[0].id : null;
  }
  
  saveAccountsData(data);
  
  // Delete user's data directory
  const userDir = path.join(userDataDir, accountId);
  try {
    fs.rmSync(userDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Failed to delete user data directory', e);
  }
  
  return true;
}

// Reset PIN using recovery PIN
export function resetPinWithRecovery(accountId: string, recoveryPin: string, newPin: string): boolean {
  const data = loadAccountsData();
  const account = data.accounts.find(a => a.id === accountId);
  
  if (!account) return false;
  
  // Verify the recovery PIN
  const recoveryPinHash = hashPin(recoveryPin, accountId);
  if (recoveryPinHash !== account.recoveryPinHash) {
    return false;
  }
  
  // Update the PIN
  account.pinHash = hashPin(newPin, accountId);
  saveAccountsData(data);
  
  return true;
}// Get current account ID
export function getCurrentAccountId(): string | null {
  const data = loadAccountsData();
  return data.currentAccountId;
}

// Set current account ID
export function setCurrentAccountId(accountId: string | null): void {
  const data = loadAccountsData();
  data.currentAccountId = accountId;
  saveAccountsData(data);
}

// Logout (clear current account)
export function logout(): void {
  setCurrentAccountId(null);
}

// Update account profile (name and/or avatar)
export function updateAccountProfile(accountId: string, updates: { name?: string; avatar?: string }): boolean {
  const data = loadAccountsData();
  const account = data.accounts.find(a => a.id === accountId);
  
  if (!account) return false;
  
  if (updates.name !== undefined) {
    account.name = updates.name;
  }
  if (updates.avatar !== undefined) {
    account.avatar = updates.avatar;
  }
  
  saveAccountsData(data);
  return true;
}

// Save avatar image to user's data directory
export function saveAvatarImage(accountId: string, imageData: string): string | null {
  try {
    const userDir = path.join(userDataDir, accountId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    // Extract base64 data and determine file extension
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return null;
    
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const filename = `avatar.${ext}`;
    const filePath = path.join(userDir, filename);
    
    // Write the image file
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    
    // Return the relative path that can be used to reference this image
    return `user-avatar://${accountId}/${filename}`;
  } catch (e) {
    console.error('Failed to save avatar image', e);
    return null;
  }
}

// Get avatar image path for an account
export function getAvatarImagePath(accountId: string): string | null {
  try {
    const userDir = path.join(userDataDir, accountId);
    const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    
    for (const ext of extensions) {
      const filePath = path.join(userDir, `avatar.${ext}`);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Load avatar image as base64 data URL
export function loadAvatarImage(accountId: string): string | null {
  try {
    const filePath = getAvatarImagePath(accountId);
    if (!filePath) return null;
    
    const ext = path.extname(filePath).slice(1);
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const imageData = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${imageData.toString('base64')}`;
  } catch (e) {
    console.error('Failed to load avatar image', e);
    return null;
  }
}

// ============================================
// User-specific database operations
// ============================================

function getUserDbPath(accountId: string): string {
  return path.join(userDataDir, accountId, 'data.json');
}

function loadUserDb(accountId: string): any {
  try {
    const dbPath = getUserDbPath(accountId);
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      favorites: [],
      watch_history: [],
      personalization: [],
      recent_watches: { movie: [], tv: [] },
    };
  }
}

function saveUserDb(accountId: string, data: any): void {
  const dbPath = getUserDbPath(accountId);
  const userDir = path.dirname(dbPath);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Get current user's database
function getCurrentUserDb(): any {
  const accountId = getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account logged in');
  }
  return loadUserDb(accountId);
}

function saveCurrentUserDb(data: any): void {
  const accountId = getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account logged in');
  }
  saveUserDb(accountId, data);
}

// ============================================
// Database operations (user-scoped)
// ============================================

// Personalization
export function setPersonalization(key: string, value: string): void {
  const db = getCurrentUserDb();
  let item = db.personalization.find((p: any) => p.key === key);
  if (!item) {
    item = { key, value };
    db.personalization.push(item);
  } else {
    item.value = value;
  }
  saveCurrentUserDb(db);
}

export function getPersonalization(key: string): string | null {
  const db = getCurrentUserDb();
  const item = db.personalization.find((p: any) => p.key === key);
  return item ? item.value : null;
}

// Favorites
export function favoritesAdd(itemId: string, itemType: string): void {
  const db = getCurrentUserDb();
  const exists = db.favorites.find((f: any) => f.item_id === itemId && f.item_type === itemType);
  if (!exists) {
    const maxOrder = db.favorites.reduce((m: number, f: any) => Math.max(m, f.sort_order || 0), 0);
    db.favorites.push({
      id: Date.now(),
      item_id: itemId,
      item_type: itemType,
      added_at: new Date().toISOString(),
      sort_order: maxOrder + 1
    });
    saveCurrentUserDb(db);
  }
}

export function favoritesRemove(itemId: string, itemType: string): void {
  const db = getCurrentUserDb();
  db.favorites = db.favorites.filter((f: any) => !(f.item_id === itemId && f.item_type === itemType));
  saveCurrentUserDb(db);
}

export function favoritesList(): any[] {
  const db = getCurrentUserDb();
  return db.favorites.sort((a: any, b: any) => a.sort_order - b.sort_order);
}

export function favoritesIs(itemId: string, itemType: string): boolean {
  const db = getCurrentUserDb();
  return !!db.favorites.find((f: any) => f.item_id === itemId && f.item_type === itemType);
}

export function favoritesReorder(id: number, newOrder: number): void {
  const db = getCurrentUserDb();
  const item = db.favorites.find((f: any) => f.id === id);
  if (item) {
    item.sort_order = newOrder;
    saveCurrentUserDb(db);
  }
}

// Watch History
export function watchHistorySet(itemId: string, position: number): void {
  const db = getCurrentUserDb();
  let item = db.watch_history.find((w: any) => w.item_id === itemId);
  if (!item) {
    item = { id: Date.now(), item_id: itemId, position, watched_at: new Date().toISOString() };
    db.watch_history.push(item);
  } else {
    item.position = position;
    item.watched_at = new Date().toISOString();
  }
  saveCurrentUserDb(db);
}

export function watchHistoryGet(itemId: string): { position: number; watched_at: string } | null {
  const db = getCurrentUserDb();
  const item = db.watch_history.find((w: any) => w.item_id === itemId);
  return item ? { position: item.position, watched_at: item.watched_at } : null;
}

export function watchHistoryRemove(itemId: string): void {
  const db = getCurrentUserDb();
  db.watch_history = db.watch_history.filter((w: any) => w.item_id !== itemId);
  saveCurrentUserDb(db);
}

export function watchHistoryList(): any[] {
  const db = getCurrentUserDb();
  return db.watch_history.sort((a: any, b: any) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
}

// Recent Watches
export function recentWatchesGet(): { movie: number[]; tv: number[] } {
  const db = getCurrentUserDb();
  return db.recent_watches || { movie: [], tv: [] };
}

export function recentWatchesAdd(itemIdRaw: string): void {
  const db = getCurrentUserDb();
  if (!db.recent_watches) db.recent_watches = { movie: [], tv: [] };
  
  let type: 'movie' | 'tv' = 'movie';
  let idStr = itemIdRaw;
  if (itemIdRaw.includes(':')) {
    const parts = itemIdRaw.split(':');
    type = parts[0] === 'tv' ? 'tv' : 'movie';
    idStr = parts[1];
  }
  
  const id = Number(idStr);
  if (!Number.isFinite(id)) return;
  
  const list = db.recent_watches[type];
  const filtered = list.filter((v: number) => v !== id);
  filtered.unshift(id);
  db.recent_watches[type] = filtered.slice(0, 50); // Keep only last 50
  
  saveCurrentUserDb(db);
}

export function recentWatchesRemove(id: number, type: 'movie' | 'tv'): void {
  const db = getCurrentUserDb();
  if (!db.recent_watches) return;
  
  if (type === 'tv') {
    db.recent_watches.tv = db.recent_watches.tv.filter((v: number) => v !== id);
  } else {
    db.recent_watches.movie = db.recent_watches.movie.filter((v: number) => v !== id);
  }
  
  saveCurrentUserDb(db);
}

// ============================================
// Legacy compatibility - export db object with prepare method
// ============================================

const db = {
  prepare: (sql: string) => {
    // This provides backward compatibility with existing code
    if (sql.includes('INSERT OR REPLACE INTO personalization')) {
      return { run: (key: string, value: string) => setPersonalization(key, value) };
    }
    if (sql.includes('SELECT value FROM personalization')) {
      return { get: (key: string) => { const v = getPersonalization(key); return v ? { value: v } : null; } };
    }
    if (sql.includes('INSERT OR IGNORE INTO favorites')) {
      return { run: (itemId: string, itemType: string) => favoritesAdd(itemId, itemType) };
    }
    if (sql.includes('DELETE FROM favorites WHERE')) {
      return { run: (itemId: string, itemType: string) => favoritesRemove(itemId, itemType) };
    }
    if (sql.includes('SELECT id, item_id, item_type, sort_order FROM favorites')) {
      return { all: () => favoritesList() };
    }
    if (sql.includes('SELECT 1 FROM favorites')) {
      return { get: (itemId: string, itemType: string) => favoritesIs(itemId, itemType) ? { 1: 1 } : null };
    }
    if (sql.includes('SELECT COALESCE(MAX(sort_order)')) {
      return { get: () => ({ maxOrder: favoritesList().reduce((m, f) => Math.max(m, f.sort_order || 0), 0) }) };
    }
    if (sql.includes('UPDATE favorites SET sort_order')) {
      return { run: (order: number, id: number) => favoritesReorder(id, order) };
    }
    if (sql.includes('INSERT INTO watch_history') || sql.includes('UPDATE watch_history')) {
      return { run: (itemId: string, position: number) => watchHistorySet(itemId, position) };
    }
    if (sql.includes('SELECT 1 FROM watch_history')) {
      return { get: (itemId: string) => watchHistoryGet(itemId) ? { 1: 1 } : null };
    }
    if (sql.includes('SELECT position, watched_at FROM watch_history')) {
      return { get: (itemId: string) => watchHistoryGet(itemId) };
    }
    if (sql.includes('DELETE FROM watch_history')) {
      return { run: (itemId: string) => watchHistoryRemove(itemId) };
    }
    // Default fallback
    return { run: (): void => {}, get: (): null => null, all: (): never[] => [] };
  }
};

export default db;
