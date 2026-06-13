import tauriConfig from '../src-tauri/tauri.conf.json';

export const APP_NAME = "Mignon UI";
export const DB_NAME = "DarfUI_WebDB";
export const DB_KEY = "darf.db";
export const LOCAL_STORAGE_PREFIX = "darf";
export const APP_VERSION = tauriConfig.version;
export const IS_DEV = import.meta.env.DEV;
