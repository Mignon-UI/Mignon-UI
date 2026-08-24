import Database from '@tauri-apps/plugin-sql';
import { DB_NAME, DB_KEY } from '../config';

const STORE_NAME = "sqlite_file";
const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function loadDbFromIndexedDB() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DB_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("[DB] Failed to load SQLite from IndexedDB:", e);
    return null;
  }
}

async function saveDbToIndexedDB(binaryData) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(binaryData, DB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("[DB] Failed to save SQLite to IndexedDB:", e);
  }
}

function loadSqlJsScript() {
  return new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      resolve(window.initSqlJs);
      return;
    }
    
    const script = document.createElement("script");
    script.src = "./sql-wasm.js";
    script.onload = () => {
      if (window.initSqlJs) {
        resolve(window.initSqlJs);
      } else {
        reject(new Error("initSqlJs not found on window after loading local script"));
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load local sql-wasm.js. CDN fallback is disabled for security compliance."));
    };

    document.head.appendChild(script);
  });
}

function sanitizeParams(bindValues) {
  return bindValues.map(v => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === undefined) return null;
    if (v instanceof Uint8Array || v instanceof Int8Array || v instanceof Uint8ClampedArray) {
      return Array.from(v);
    }
    if (v instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(v));
    }
    return v;
  });
}

class TauriSqliteWrapper {
  constructor(tauriDb) {
    this.db = tauriDb;
  }

  async execute(query, bindValues = []) {
    return this.db.execute(query, sanitizeParams(bindValues));
  }

  async select(query, bindValues = []) {
    return this.db.select(query, sanitizeParams(bindValues));
  }
}

let pendingSaveTimeout = null;
let activeSavePromise = null;
let hasUnsavedChanges = false;
let globalSqlDb = null;

function triggerDelayedSave() {
  hasUnsavedChanges = true;
  if (pendingSaveTimeout) {
    clearTimeout(pendingSaveTimeout);
  }
  pendingSaveTimeout = setTimeout(async () => {
    await flushPendingSave();
  }, 1000);
}

async function flushPendingSave() {
  if (!hasUnsavedChanges || !globalSqlDb) return;

  if (activeSavePromise) {
    await activeSavePromise;
  }

  hasUnsavedChanges = false;
  activeSavePromise = (async () => {
    try {
      const binaryData = globalSqlDb.export();
      await saveDbToIndexedDB(binaryData);
    } catch (e) {
      console.error("[DB] Failed to auto-save database:", e);
      hasUnsavedChanges = true;
    } finally {
      activeSavePromise = null;
    }
  })();

  await activeSavePromise;
}

export async function forceSaveDatabase() {
  hasUnsavedChanges = true;
  if (pendingSaveTimeout) {
    clearTimeout(pendingSaveTimeout);
    pendingSaveTimeout = null;
  }
  await flushPendingSave();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (hasUnsavedChanges && globalSqlDb) {
      try {
        const binaryData = globalSqlDb.export();
        saveDbToIndexedDB(binaryData);
      } catch (e) {
        console.error("[DB] Emergency unload save failed:", e);
      }
    }
  });
}

class BrowserSqliteWrapper {
  constructor(sqlDb) {
    this.db = sqlDb;
    globalSqlDb = sqlDb;
  }

  async execute(query, bindValues = []) {
    this.db.run(query, sanitizeParams(bindValues));
    const lower = query.toLowerCase();
    const isCritical = lower.includes("delete") || lower.includes("drop") || lower.includes("settings") || lower.includes("characters");
    if (isCritical) {
      await forceSaveDatabase();
    } else {
      triggerDelayedSave();
    }
  }

  async select(query, bindValues = []) {
    const stmt = this.db.prepare(query);
    stmt.bind(sanitizeParams(bindValues));
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
}

let dbInstance = null;
let dbInitializationPromise = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  if (!dbInitializationPromise) {
    dbInitializationPromise = (async () => {
      if (isTauri) {
        const rawDb = await Database.load(`sqlite:${DB_KEY}`);
        await rawDb.execute("PRAGMA journal_mode = WAL;");
        await rawDb.execute("PRAGMA synchronous = NORMAL;");
        await rawDb.execute("PRAGMA foreign_keys = ON;");
        await rawDb.execute("PRAGMA cache_size = -64000;"); // 64MB memory page cache
        await rawDb.execute("PRAGMA temp_store = MEMORY;"); // Temporary tables kept in RAM
        await rawDb.execute("PRAGMA mmap_size = 268435456;"); // 256MB memory-mapped I/O
        dbInstance = new TauriSqliteWrapper(rawDb);
      } else {
        console.info("[DB] Non-Tauri environment detected. Initializing WebAssembly SQLite (sql.js) via script injection.");
        try {
          const initSqlJsFn = await loadSqlJsScript();
          
          let SQL;
          let useLocalWasm = false;
          try {
            const checkRes = await fetch("./sql-wasm.wasm");
            if (checkRes.ok) {
              const buffer = await checkRes.arrayBuffer();
              const bytes = new Uint8Array(buffer, 0, 4);
              useLocalWasm = bytes.length === 4 && [0x00, 0x61, 0x73, 0x6d].every((val, idx) => bytes[idx] === val);
            }
          } catch {
            // Ignore fetch errors and fallback to default useLocalWasm = false
          }

          if (!useLocalWasm) {
            throw new Error("Local SQLite WASM file was not found or is invalid. CDN fallback is disabled for security compliance.");
          }

          SQL = await initSqlJsFn({ locateFile: filename => `./${filename}` });

          const saved = await loadDbFromIndexedDB();
          const sqlDb = new SQL.Database(saved ? new Uint8Array(saved) : undefined);
          console.info(saved ? "[DB] Restored database from IndexedDB." : "[DB] Created in-memory database.");
          
          sqlDb.run("PRAGMA journal_mode = WAL;");
          sqlDb.run("PRAGMA synchronous = NORMAL;");
          sqlDb.run("PRAGMA foreign_keys = ON;");
          sqlDb.run("PRAGMA cache_size = -32000;");
          sqlDb.run("PRAGMA temp_store = MEMORY;");
          dbInstance = new BrowserSqliteWrapper(sqlDb);
        } catch (err) {
          console.error("[DB] Failed to initialize SQLite WASM:", err);
          dbInitializationPromise = null; // Reset to allow retry
          throw err;
        }
      }
      return dbInstance;
    })();
  }
  return dbInitializationPromise;
}

/**
 * Exports a full snapshot of the database (.mignon) for backup.
 */
export async function exportDatabaseBackup() {
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFilename = `mignon-backup-${timestamp}.mignon`;

  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');

    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'Mignon Backup (*.mignon)', extensions: ['mignon', 'sqlite', 'db'] }]
    });

    if (!filePath) return { success: false, cancelled: true };

    await invoke('export_database_backup', { targetPath: filePath });
    return { success: true, path: filePath };
  } else {
    if (!globalSqlDb) {
      await getDb();
    }
    await forceSaveDatabase();

    const binary = globalSqlDb.export();
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, filename: defaultFilename };
  }
}

/**
 * Restores the database from a selected .mignon / .sqlite backup file.
 */
export async function restoreDatabaseBackup(fileObj = null) {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Mignon Backup (*.mignon)', extensions: ['mignon', 'sqlite', 'db'] }]
    });

    if (!selectedPath) return { success: false, cancelled: true };

    await invoke('restore_database_backup', { sourcePath: selectedPath });
    // Relaunch desktop app to cleanly initialize the restored database
    await relaunch();
    return { success: true };
  } else {
    if (!fileObj) {
      throw new Error('No file provided for web restoration.');
    }

    const buffer = await fileObj.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Validate SQLite 3 magic header
    const sqliteHeader = [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00];
    const isSqlite = bytes.length >= 16 && sqliteHeader.every((val, idx) => bytes[idx] === val);

    if (!isSqlite) {
      throw new Error('Invalid backup file: Not a valid Mignon database (.mignon / .sqlite).');
    }

    await saveDbToIndexedDB(bytes);
    window.location.reload();
    return { success: true };
  }
}
