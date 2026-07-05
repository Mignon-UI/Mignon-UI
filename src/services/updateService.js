import { safeFetch } from '../utils/safeFetch';
import { APP_VERSION } from '../config';

const GITHUB_API_URL = 'https://api.github.com/repos/Mignon-UI/Mignon-UI/releases';
const GITHUB_TRACKING_URL = 'https://github.com/Mignon-UI/Mignon-UI/releases/latest';

/**
 * Checks GitHub for the latest release version.
 * Emits a telemetry ping to register active user counts on GitHub Traffic.
 *
 * @param {boolean} force - If true, bypasses the 24-hour cache check.
 * @returns {Promise<object>} Update status metadata.
 */
export async function checkForUpdates(force = false) {
  const now = Date.now();
  const lastCheck = Number(localStorage.getItem('mignon_last_update_check')) || 0;

  if (force || now - lastCheck >= 24 * 60 * 60 * 1000) {
    safeFetch(GITHUB_TRACKING_URL, { method: 'GET', mode: 'no-cors' }).catch(() => {});
    localStorage.setItem('mignon_last_update_check', now.toString());
  }

  try {
    const res = await safeFetch(GITHUB_API_URL);
    if (!res.ok) throw new Error(`GitHub API responded with status ${res.status}`);

    const list = await res.json();
    if (!Array.isArray(list) || !list.length) throw new Error('No releases found in the repository.');

    const isBeta = localStorage.getItem('mignon_update_channel') === 'beta';
    const data = isBeta ? list[0] : list.find(r => !r.prerelease);
    if (!data) throw new Error(`No ${isBeta ? 'beta' : 'stable'} releases found in the repository.`);

    const latestVersion = data.tag_name;
    const htmlUrl = data.html_url || 'https://github.com/Mignon-UI/Mignon-UI/releases';
    const matchedAsset = findPlatformAsset(data.assets || []);

    return {
      updateAvailable: isNewerVersion(APP_VERSION, latestVersion),
      latestVersion,
      currentVersion: APP_VERSION,
      releaseNotes: data.body || '',
      url: htmlUrl,
      downloadUrl: matchedAsset ? matchedAsset.browser_download_url : htmlUrl,
      filename: matchedAsset ? matchedAsset.name : 'mignon-ui-installer',
      name: data.name || latestVersion,
      bannerSuppressed: localStorage.getItem('mignon_dismissed_version') === latestVersion,
      error: null
    };
  } catch (err) {
    console.error('[UpdateService] Update check failed:', err);
    const fallbackUrl = 'https://github.com/Mignon-UI/Mignon-UI/releases';
    return {
      updateAvailable: false,
      latestVersion: null,
      currentVersion: APP_VERSION,
      releaseNotes: '',
      url: fallbackUrl,
      downloadUrl: fallbackUrl,
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
  if (ua.includes('Windows')) return assets.find(a => a.name.endsWith('.msi')) || assets.find(a => a.name.endsWith('.exe') && !a.name.includes('uninstaller'));
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return assets.find(a => a.name.endsWith('.dmg'));
  if (ua.includes('Linux')) return assets.find(a => a.name.endsWith('.deb')) || assets.find(a => a.name.endsWith('.AppImage'));
  return null;
}

/**
 * Compares semantic versions. Returns true if latest > current.
 */
export function isNewerVersion(current, latest) {
  if (!latest) return false;
  const c = current.replace(/^v/, '').trim();
  const l = latest.replace(/^v/, '').trim();
  if (c === l) return false;

  const cp = c.split('-')[0].split('.').map(Number);
  const lp = l.split('-')[0].split('.').map(Number);
  for (let i = 0; i < Math.max(cp.length, lp.length); i++) {
    if ((lp[i] || 0) > (cp[i] || 0)) return true;
    if ((cp[i] || 0) > (lp[i] || 0)) return false;
  }

  // ponytail: stable vs pre-release tags logic
  const cpPre = c.includes('-');
  const lpPre = l.includes('-');
  return cpPre !== lpPre ? cpPre : l > c;
}
