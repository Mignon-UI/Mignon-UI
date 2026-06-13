import { safeFetch } from '../utils/safeFetch';
import { APP_VERSION } from '../config';

const GITHUB_API_URL = 'https://api.github.com/repos/Deep-Hex/Mignon-UI/releases';
const GITHUB_TRACKING_URL = 'https://github.com/Deep-Hex/Mignon-UI/releases/latest';

/**
 * Checks GitHub for the latest release version.
 * Emits a telemetry ping to register active user counts on GitHub Traffic.
 *
 * @param {boolean} force - If true, bypasses the 24-hour cache check.
 * @returns {Promise<object>} Update status metadata.
 */
export async function checkForUpdates(force = false) {
  const lastCheckStr = localStorage.getItem('darf_last_update_check');
  const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;
  const now = Date.now();

  const checkInterval = 24 * 60 * 60 * 1000; // 24 hours
  const isCacheExpired = now - lastCheck >= checkInterval;

  // Telemetry: Ping the GitHub URL in the background to register as a daily active user
  // This is run once every 24 hours or when forced.
  if (force || isCacheExpired) {
    try {
      // Use no-cors since we don't need to read the body of the tracking page
      // On Tauri, it bypasses CORS; on Web browser, it handles CORS errors silently.
      safeFetch(GITHUB_TRACKING_URL, { method: 'GET', mode: 'no-cors' }).catch(() => {});
      localStorage.setItem('darf_last_update_check', now.toString());
    } catch (e) {
      console.warn('[Telemetry] Telemetry ping failed:', e);
    }
  }

  try {
    const res = await safeFetch(GITHUB_API_URL);
    if (!res.ok) {
      throw new Error(`GitHub API responded with status ${res.status}`);
    }

    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('No releases found in the repository.');
    }

    const updateChannel = localStorage.getItem('darf_update_channel') || 'stable';
    let data = null;

    if (updateChannel === 'beta') {
      data = list[0];
    } else {
      // Find the first release that is not a pre-release/beta
      data = list.find(r => !r.prerelease);
      if (!data) {
        throw new Error('No stable releases found in the repository.');
      }
    }

    const latestVersion = data.tag_name; // e.g., "v0.2.0"
    const releaseNotes = data.body || '';
    const htmlUrl = data.html_url || 'https://github.com/Deep-Hex/Mignon-UI/releases';
    const releaseName = data.name || data.tag_name;
    const assets = data.assets || [];

    const updateAvailable = isNewerVersion(APP_VERSION, latestVersion);
    
    // Find the correct installer asset for the user's OS
    const matchedAsset = findPlatformAsset(assets);
    const downloadUrl = matchedAsset ? matchedAsset.browser_download_url : htmlUrl;
    const filename = matchedAsset ? matchedAsset.name : 'darf-ui-installer';

    // Check if the user dismissed this specific version before
    const dismissedVersion = localStorage.getItem('darf_dismissed_version');
    const bannerSuppressed = dismissedVersion === latestVersion;

    return {
      updateAvailable,
      latestVersion,
      currentVersion: APP_VERSION,
      releaseNotes,
      url: htmlUrl,
      downloadUrl,
      filename,
      name: releaseName,
      bannerSuppressed,
      error: null
    };
  } catch (err) {
    console.error('[UpdateService] Update check failed:', err);
    return {
      updateAvailable: false,
      latestVersion: null,
      currentVersion: APP_VERSION,
      releaseNotes: '',
      url: 'https://github.com/Deep-Hex/Mignon-UI/releases',
      downloadUrl: 'https://github.com/Deep-Hex/Mignon-UI/releases',
      filename: '',
      name: '',
      bannerSuppressed: false,
      error: err.message
    };
  }
}

/**
 * Finds the correct download asset from the releases asset list based on userAgent.
 */
function findPlatformAsset(assets) {
  const ua = navigator.userAgent;
  
  if (ua.includes('Windows')) {
    // Look for .msi or setup.exe or .exe
    const msiAsset = assets.find(a => a.name.endsWith('.msi'));
    if (msiAsset) return msiAsset;
    
    return assets.find(a => a.name.endsWith('.exe') && !a.name.includes('uninstaller'));
  } else if (ua.includes('Macintosh') || ua.includes('Mac OS')) {
    // Look for .dmg
    return assets.find(a => a.name.endsWith('.dmg'));
  } else if (ua.includes('Linux')) {
    // Look for .deb or AppImage
    const debAsset = assets.find(a => a.name.endsWith('.deb'));
    if (debAsset) return debAsset;
    
    return assets.find(a => a.name.endsWith('.AppImage'));
  }
  
  return null;
}

/**
 * Compares semantic versions. Returns true if latest > current.
 */
export function isNewerVersion(current, latest) {
  if (!latest) return false;
  
  const cleanCurrent = current.replace(/^v/, '').trim();
  const cleanLatest = latest.replace(/^v/, '').trim();

  if (cleanCurrent === cleanLatest) return false;

  const partsCurrent = cleanCurrent.split('-')[0].split('.').map(Number);
  const partsLatest = cleanLatest.split('-')[0].split('.').map(Number);

  for (let i = 0; i < Math.max(partsCurrent.length, partsLatest.length); i++) {
    const currentPart = partsCurrent[i] || 0;
    const latestPart = partsLatest[i] || 0;
    if (latestPart > currentPart) return true;
    if (currentPart > latestPart) return false;
  }

  // Pre-release checks, e.g. 1.0.0-beta vs 1.0.0
  const isCurrentPre = cleanCurrent.includes('-');
  const isLatestPre = cleanLatest.includes('-');
  if (isCurrentPre && !isLatestPre) return true; // Stable is newer than pre-release
  if (!isCurrentPre && isLatestPre) return false;
  
  if (isCurrentPre && isLatestPre) {
    // e.g. 1.0.0-beta.2 vs 1.0.0-beta.1
    return cleanLatest > cleanCurrent;
  }

  return false;
}
