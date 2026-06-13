import Database from '@tauri-apps/plugin-sql';
import { DB_NAME, DB_KEY } from '../config';

// IndexedDB adapter for SQLite WASM file persistence
const STORE_NAME = "sqlite_file";


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
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(DB_KEY);
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
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(binaryData, DB_KEY);
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
    
    // Attempt local script loading
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

class TauriSqliteWrapper {
  constructor(tauriDb) {
    this.db = tauriDb;
  }

  _sanitizeParams(bindValues) {
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

  async execute(query, bindValues = []) {
    const params = this._sanitizeParams(bindValues);
    return this.db.execute(query, params);
  }

  async select(query, bindValues = []) {
    const params = this._sanitizeParams(bindValues);
    return this.db.select(query, params);
  }
}

class BrowserSqliteWrapper {
  constructor(sqlDb) {
    this.db = sqlDb;
  }

  _sanitizeParams(bindValues) {
    return bindValues.map(v => {
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === undefined) return null;
      return v;
    });
  }

  async execute(query, bindValues = []) {
    const params = this._sanitizeParams(bindValues);
    this.db.run(query, params);
    
    // Save database state asynchronously to IndexedDB
    const binaryData = this.db.export();
    await saveDbToIndexedDB(binaryData);
  }

  async select(query, bindValues = []) {
    const params = this._sanitizeParams(bindValues);
    const stmt = this.db.prepare(query);
    stmt.bind(params);
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

// Return database instance, loading lazily if needed
export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!dbInitializationPromise) {
    dbInitializationPromise = (async () => {
      const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);
      if (isTauri) {
        // Saves sqlite database inside standard tauri app directory: data/DB_KEY
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
              const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
              if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
                useLocalWasm = true;
              }
            }
          } catch {
            // Ignore
          }

          if (useLocalWasm) {
            SQL = await initSqlJsFn({
              locateFile: filename => `/${filename}`
            });
          } else {
            throw new Error("Local SQLite WASM file was not found or is invalid. CDN fallback is disabled for security compliance.");
          }

          const savedBuffer = await loadDbFromIndexedDB();
          let sqlDb;
          if (savedBuffer) {
            sqlDb = new SQL.Database(new Uint8Array(savedBuffer));
            console.info("[DB] Restored existing SQLite database from IndexedDB.");
          } else {
            sqlDb = new SQL.Database();
            console.info("[DB] Created new in-memory SQLite database.");
          }
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
