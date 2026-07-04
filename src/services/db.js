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
    script.src = "/sql-wasm.js";
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

class BrowserSqliteWrapper {
  constructor(sqlDb) {
    this.db = sqlDb;
  }

  async execute(query, bindValues = []) {
    this.db.run(query, sanitizeParams(bindValues));
    await saveDbToIndexedDB(this.db.export());
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
        await rawDb.execute("PRAGMA foreign_keys = ON;");
        dbInstance = new TauriSqliteWrapper(rawDb);
      } else {
        console.info("[DB] Non-Tauri environment detected. Initializing WebAssembly SQLite (sql.js) via script injection.");
        try {
          const initSqlJsFn = await loadSqlJsScript();
          
          let SQL;
          let useLocalWasm = false;
          try {
            const checkRes = await fetch("/sql-wasm.wasm");
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

          SQL = await initSqlJsFn({ locateFile: filename => `/${filename}` });

          const saved = await loadDbFromIndexedDB();
          const sqlDb = new SQL.Database(saved ? new Uint8Array(saved) : undefined);
          console.info(saved ? "[DB] Restored database from IndexedDB." : "[DB] Created in-memory database.");
          
          sqlDb.run("PRAGMA foreign_keys = ON;");
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
