import { useState, useEffect } from 'react';
import { checkForUpdates } from '../../services/updateService';
import { isTauri } from '../../utils/safeFetch';
import { ArrowDownToLine, X, AlertCircle, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // Download states
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Check on startup
  useEffect(() => {
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

  // Set up Tauri event listeners for background download
  useEffect(() => {
    let active = true;
    const unlisteners = [];

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const uProgress = await listen('download-progress', (event) => {
          if (active) setProgress(event.payload);
        });
        unlisteners.push(uProgress);

        const uComplete = await listen('download-complete', () => {
          if (active) {
            setIsDownloading(false);
            setDownloadComplete(true);
          }
        });
        unlisteners.push(uComplete);

        const uError = await listen('download-error', (event) => {
          if (active) {
            setIsDownloading(false);
            setDownloadError(event.payload || 'An error occurred during download');
          }
        });
        unlisteners.push(uError);
      } catch (err) {
        console.error('[UpdateBanner] Failed to register Tauri listeners:', err);
      }
    };

    if (isTauri) {
      setupListeners();
    }

    return () => {
      active = false;
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const handleDismiss = () => {
    if (updateInfo?.latestVersion) {
      // Remember dismissal for this version
      localStorage.setItem('mignon_dismissed_version', updateInfo.latestVersion);
    }
    
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
    }, 400); // Match CSS slide-up duration
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;

    if (isTauri) {
      // In Tauri, trigger the background download-and-install
      setIsDownloading(true);
      setProgress(0);
      setDownloadComplete(false);
      setDownloadError(null);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('start_update_download', {
          url: updateInfo.downloadUrl,
          filename: updateInfo.filename
        });
      } catch (err) {
        setIsDownloading(false);
        setDownloadError(err.toString());
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

  if (!isVisible) return null;

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
        </div>

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
          <div className="update-progress-row" style={{ background: 'rgba(0, 150, 80, 0.15)' }}>
            <div className="update-progress-text-info" style={{ color: '#00ffaa', fontWeight: 'bold', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={15} /> 
                Download complete! Running installer...
              </span>
              <button 
                className="update-banner-btn-dismiss" 
                style={{ padding: '4px 8px !important', fontSize: '0.75rem !important' }} 
                onClick={handleDismiss}
              >
                Close Banner
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginTop: '4px' }}>
              Please close Mignon UI to allow the installer to run and complete the update.
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
