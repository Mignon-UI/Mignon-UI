import { useState, useEffect } from 'react';
import { checkForUpdates } from '../../services/updateService';
import { isTauri } from '../../utils/safeFetch';
import { ArrowDownToLine, X, AlertCircle, CheckCircle, RefreshCw, Sparkles, FileText, ExternalLink, RotateCcw } from 'lucide-react';

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [nativeUpdate, setNativeUpdate] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  
  // Download & Install states
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Check on startup (Desktop / Tauri only)
  useEffect(() => {
    if (!isTauri) return;

    const runStartupCheck = async () => {
      // 3-second delay on startup to let UI finish animations/initialization
      await new Promise(resolve => setTimeout(resolve, 3000));
      const result = await checkForUpdates(false);
      
      if (result.updateAvailable && !result.bannerSuppressed) {
        setUpdateInfo(result);
        setIsVisible(true);
      }
    };
    runStartupCheck();
  }, []);

  // Listen to manual triggers from settings
  useEffect(() => {
    const handleManualTrigger = (e) => {
      if (e.detail) {
        setUpdateInfo(e.detail);
        setIsVisible(true);
        setIsExiting(false);
        // Reset download states for a new trigger
        setIsDownloading(false);
        setProgress(0);
        setDownloadComplete(false);
        setDownloadError(null);
      }
    };

    window.addEventListener('mignon-show-update-banner', handleManualTrigger);
    return () => {
      window.removeEventListener('mignon-show-update-banner', handleManualTrigger);
    };
  }, []);

  const handleDismiss = () => {
    if (updateInfo?.latestVersion) {
      // Remember dismissal for this version
      localStorage.setItem('mignon_dismissed_version', updateInfo.latestVersion);
    }
    
    setIsExiting(true);
    setShowNotes(false);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
    }, 400); // Match CSS slide-up duration
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;

    if (isTauri) {
      setIsDownloading(true);
      setProgress(0);
      setDownloadComplete(false);
      setDownloadError(null);

      try {
        const { check } = await import('@tauri-apps/plugin-updater');

        let update = nativeUpdate || updateInfo._nativeUpdate;
        if (!update) {
          update = await check();
        }

        if (!update) {
          // If no direct signed bundle is found, fallback to opening the release URL
          if (updateInfo.url) {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_url', { url: updateInfo.url });
          }
          setIsDownloading(false);
          return;
        }

        setNativeUpdate(update);

        let downloaded = 0;
        let contentLength = 0;

        // Download package safely without launching installer yet
        await update.download((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data?.contentLength || 0;
              setProgress(0);
              break;
            case 'Progress':
              downloaded += event.data?.chunkLength || 0;
              if (contentLength > 0) {
                setProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
              }
              break;
            case 'Finished':
              setProgress(100);
              break;
          }
        });

        setIsDownloading(false);
        setDownloadComplete(true);
      } catch (err) {
        setIsDownloading(false);
        setDownloadError(err.message || err.toString());
      }
    } else {
      // In browser mode, fallback to opening the release url directly
      const isSafeUrl = updateInfo.url && (updateInfo.url.startsWith('https://github.com/') || updateInfo.url.startsWith('https://api.github.com/'));
      if (isSafeUrl) {
        window.open(updateInfo.url, '_blank', 'noopener,noreferrer');
      } else {
        console.error("Blocked opening unsafe redirect URL:", updateInfo.url);
      }
      handleDismiss();
    }
  };

  const handleRestartNow = async () => {
    setIsInstalling(true);
    setDownloadError(null);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch, exit } = await import('@tauri-apps/plugin-process');

      let update = nativeUpdate || updateInfo?._nativeUpdate;
      if (!update) {
        update = await check();
      }

      if (update) {
        // Automatically install update.
        // On Windows, restartAfterInstall: true instructs the installer to relaunch Mignon UI after finishing.
        await update.install({ restartAfterInstall: true });

        // Ensure app cleanly exits so Windows releases the file handle on the executable
        try {
          await relaunch();
        } catch {
          await exit(0);
        }
      } else if (updateInfo?.downloadUrl) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_url', { url: updateInfo.downloadUrl });
        setIsInstalling(false);
      }
    } catch (err) {
      console.error('[UpdateBanner] Restart & install error:', err);
      setIsInstalling(false);
      setDownloadError(err.message || err.toString());
    }
  };

  const handleOpenExternalRelease = async () => {
    const targetUrl = updateInfo?.url || 'https://github.com/Mignon-UI/Mignon-UI/releases';
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_url', { url: targetUrl });
      } catch {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!isTauri || !isVisible) return null;

  return (
    <div className="update-banner-sticky-wrap">
      <div className={`update-banner ${isExiting ? 'slide-up' : ''}`}>
        
        {/* Core Banner Contents */}
        <div className="update-banner-content">
          <div className="update-banner-info">
            <div className="update-banner-icon-wrapper">
              <Sparkles size={18} />
            </div>
            
            <div className="update-banner-text">
              <div className="update-banner-title">
                Update Available 
                <span className="update-banner-badge">{updateInfo.latestVersion}</span>
              </div>
              <div className="update-banner-desc" title={updateInfo.releaseNotes}>
                {updateInfo.name || 'New version available! Learn more about the latest updates.'}
              </div>
            </div>
          </div>

          {!isDownloading && !downloadComplete && (
            <div className="update-banner-actions">
              <button 
                type="button"
                className="update-banner-btn-notes" 
                onClick={() => setShowNotes(!showNotes)}
                title="View Release Notes"
              >
                <FileText size={14} />
                {showNotes ? 'Hide Notes' : "What's New"}
              </button>
              <button 
                className="update-banner-btn-download" 
                onClick={handleUpdate}
              >
                <ArrowDownToLine size={14} />
                {isTauri ? 'Download & Install' : 'Open Releases'}
              </button>
              <button 
                className="update-banner-btn-dismiss" 
                onClick={handleDismiss}
              >
                <X size={14} />
                Dismiss
              </button>
            </div>
          )}

          {downloadComplete && (
            <div className="update-banner-actions">
              <button 
                type="button" 
                className="update-banner-btn-restart" 
                onClick={handleRestartNow}
                disabled={isInstalling}
                title="Auto-install and restart Mignon UI"
              >
                <RotateCcw size={14} className={isInstalling ? 'mignon-animate-spin' : ''} />
                {isInstalling ? 'Restarting...' : 'Restart Now'}
              </button>
              <button 
                type="button"
                className="update-banner-btn-dismiss" 
                onClick={handleDismiss}
              >
                <X size={14} />
                Later
              </button>
            </div>
          )}
        </div>

        {/* Expandable Release Notes Drawer */}
        {showNotes && (
          <div className="update-banner-notes-drawer">
            <div className="update-banner-notes-header">
              <span>Release Notes ({updateInfo.latestVersion})</span>
              <button 
                type="button" 
                className="update-banner-notes-close" 
                onClick={() => setShowNotes(false)}
                title="Close Notes"
              >
                <X size={13} />
              </button>
            </div>
            <div className="update-banner-notes-body scrollbar-custom">
              {updateInfo.releaseNotes || updateInfo.name || 'Check the GitHub Releases page for the full changelog.'}
            </div>
            <div className="update-banner-notes-footer">
              <button 
                type="button" 
                className="update-banner-link" 
                onClick={handleOpenExternalRelease}
              >
                <ExternalLink size={12} /> Open GitHub Release Page
              </button>
            </div>
          </div>
        )}

        {/* Downloading state */}
        {isDownloading && (
          <div className="update-progress-row">
            <div className="update-progress-text-info">
              <span>Downloading update package...</span>
              <span>{progress}%</span>
            </div>
            <div className="update-progress-bar-bg">
              <div 
                className="update-progress-bar-fill" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        )}

        {/* Complete state */}
        {downloadComplete && (
          <div className="update-progress-row" style={{ background: 'rgba(0, 230, 118, 0.12)' }}>
            <div className="update-progress-text-info" style={{ color: '#00e676', fontWeight: 'bold', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={15} /> 
                Update downloaded and ready to install!
              </span>
              <button 
                type="button"
                className="update-banner-btn-restart" 
                style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                onClick={handleRestartNow}
                disabled={isInstalling}
              >
                <RotateCcw size={13} className={isInstalling ? 'mignon-animate-spin' : ''} />
                {isInstalling ? 'Restarting...' : 'Restart Now'}
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginTop: '2px' }}>
              Clicking Restart Now will automatically close Mignon UI, run the installer, and reopen the app.
            </span>
          </div>
        )}

        {/* Error state */}
        {downloadError && (
          <div className="update-progress-row" style={{ background: 'rgba(255, 74, 125, 0.15)' }}>
            <div className="update-progress-text-info" style={{ color: '#ff4a7d', fontWeight: 'bold', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={15} />
                Failed: {downloadError}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  className="update-banner-btn-download" 
                  style={{ padding: '4px 8px !important', fontSize: '0.75rem !important', background: 'var(--blue) !important' }} 
                  onClick={handleUpdate}
                >
                  <RefreshCw size={11} /> Retry
                </button>
                <button 
                  className="update-banner-btn-dismiss" 
                  style={{ padding: '4px 8px !important', fontSize: '0.75rem !important' }} 
                  onClick={handleDismiss}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
