// Mignon UI Landing Page Controller

// Theme metadata mapping for the Showcase panel
const themeMetadata = {
    bubblegum: {
        title: "Theme: Bubblegum Pop",
        bgType: "radial-dot",
        fontHead: "'Fredoka', sans-serif",
        fontBody: "'Plus Jakarta Sans', sans-serif"
    },
    cyber: {
        title: "Theme: Neo-Cyber",
        bgType: "cyber-grid",
        fontHead: "'Orbitron', sans-serif",
        fontBody: "'Orbitron', sans-serif"
    },
    dollhouse: {
        title: "Theme: Dollhouse",
        bgType: "radial-dot",
        fontHead: "'Pacifico', cursive",
        fontBody: "'Plus Jakarta Sans', sans-serif"
    },
    classic: {
        title: "Theme: Mignon UI Classic",
        bgType: "clean-gray",
        fontHead: "'Inter', sans-serif",
        fontBody: "'Inter', sans-serif"
    },
    darkyellow: {
        title: "Theme: Dark Yellow",
        bgType: "radial-dot",
        fontHead: "'Bebas Neue', sans-serif",
        fontBody: "'Plus Jakarta Sans', sans-serif"
    },
    sketchbook: {
        title: "Theme: Sketch Book",
        bgType: "notebook-ruled",
        fontHead: "'Architects Daughter', cursive",
        fontBody: "'Caveat', cursive"
    },
    builder: {
        title: "Theme: Builder",
        bgType: "builder-studs",
        fontHead: "'Titan One', sans-serif",
        fontBody: "'Plus Jakarta Sans', sans-serif"
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const themeButtons = document.querySelectorAll(".theme-btn");
    const darkModeCheckbox = document.getElementById("dark-mode-checkbox");
    const autoCycleToggle = document.getElementById("auto-cycle-toggle");

    // ponytail: preload theme preview screenshots to prevent flash when transitioning
    ["assets/chat_interface.webp", "assets/theme_settings.webp"].forEach(src => {
        const img = new Image();
        img.src = src;
    });

    // Showcase elements
    const showcaseScreenshot = document.getElementById("showcase-screenshot");

    let activeTheme = "bubblegum";
    let pageTransitionId = null;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let autoCycleActive = !prefersReducedMotion;

    // Animation timing state variables for dynamic speed-up
    let transitionStartTime = null;
    let transitionDuration = 10000;
    let isTransitionFast = false;
    let fastStartTimestamp = null;
    let progressAtFastStart = 0;
    const fastDuration = 600; // Complete in 600ms when paused

    // Tab visibility pause/resume state variables
    let hiddenTime = null;

    // Update the theme preview screenshot matching mode selection
    function updateShowcaseScreenshot(themeName) {
        if (!showcaseScreenshot) return;
        const isDark = body.classList.contains("dark-theme");

        let src = "assets/welcome.webp"; // Default light mode screenshot

        if (isDark) {
            if (themeName === "builder") {
                src = "assets/theme_settings.webp";
            } else {
                src = "assets/chat_interface.webp";
            }
        }

        showcaseScreenshot.src = src;
    }

    // ----------------------------------------------------
    // 1. Theme Swapping Mechanism
    // ----------------------------------------------------
    function applyTheme(themeName, isFast = false) {
        const pageWrapper = document.getElementById("page-wrapper");
        if (!pageWrapper) return;

        const metadata = themeMetadata[themeName];

        // Find current theme class on pageWrapper to determine the old theme BEFORE we swap them
        let oldTheme = "bubblegum";
        for (const t of Object.keys(themeMetadata)) {
            if (pageWrapper.classList.contains(`theme-${t}`)) {
                oldTheme = t;
                break;
            }
        }

        // Clone the pageWrapper BEFORE we change its theme classes (so it preserves the old theme)
        const clonePage = pageWrapper.cloneNode(true);

        // Remove any previous transition overlays
        const existingOverlay = document.getElementById("page-wrapper-transition-overlay");
        if (existingOverlay) existingOverlay.remove();
        if (pageTransitionId) {
            cancelAnimationFrame(pageTransitionId);
            pageTransitionId = null;
        }

        // Apply new theme class to body and wrapper
        body.classList.add(`theme-${themeName}`);
        pageWrapper.classList.add(`theme-${themeName}`);

        // Remove other theme classes
        Object.keys(themeMetadata).forEach(t => {
            if (t !== themeName) {
                body.classList.remove(`theme-${t}`);
                pageWrapper.classList.remove(`theme-${t}`);
            }
        });

        // Update grid background overlay type
        body.setAttribute("data-bg-type", metadata.bgType);
        pageWrapper.setAttribute("data-bg-type", metadata.bgType);

        // Swap out screenshot image matching theme and mode
        updateShowcaseScreenshot(themeName);

        // If prefers-reduced-motion is enabled, apply instantly and skip transition overlays
        if (prefersReducedMotion) {
            if (autoCycleActive) {
                setTimeout(() => {
                    if (autoCycleActive) {
                        triggerNextTheme();
                    }
                }, 10000);
            }
            return;
        }

        // Reset timing variables for transition
        transitionStartTime = null;
        transitionDuration = isFast ? 800 : 10000; // 800ms for fast transition, 10s for auto cycle
        isTransitionFast = false;

        // 1. Create the fixed viewport container clone overlay
        const cloneContainer = document.createElement("div");
        cloneContainer.id = "page-wrapper-transition-overlay";
        cloneContainer.classList.add("transition-clone");

        // Explicitly set the old theme's typography variables on cloneContainer
        // This blocks CSS inheritance from document body (which gets the new theme class instantly)
        const oldMetadata = themeMetadata[oldTheme];
        if (oldMetadata) {
            cloneContainer.style.setProperty("--font-head", oldMetadata.fontHead);
            cloneContainer.style.setProperty("--font-body", oldMetadata.fontBody);
        }

        // Create the inner wrapper
        const cloneInner = document.createElement("div");
        cloneInner.classList.add("transition-clone-inner");

        // Helper to sync vertical scroll offsets in the animation loop
        function syncScrollOffset() {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            cloneInner.style.transform = `translateY(-${scrollTop}px)`;
            cloneContainer.style.setProperty("--scroll-top", `${scrollTop}px`);
        }

        // Initial sync before cloning
        syncScrollOffset();

        clonePage.removeAttribute("id"); // Prevent duplicate IDs

        // Sync dynamic input states to the clone (cloneNode doesn't copy current properties)
        const liveCheckbox = pageWrapper.querySelector("#dark-mode-checkbox");
        const clonedCheckbox = clonePage.querySelector("#dark-mode-checkbox");
        if (liveCheckbox && clonedCheckbox) {
            clonedCheckbox.checked = liveCheckbox.checked;
        }

        // Forward click events from clone interactive elements to live elements
        cloneContainer.addEventListener("click", (e) => {
            const target = e.target.closest("button, a, input, label, .theme-btn");
            if (!target) return;

            e.preventDefault();
            e.stopPropagation();

            // Map the element's tag index inside cloneContainer to the live pageWrapper
            const allCloneTags = Array.from(cloneContainer.querySelectorAll(target.tagName.toLowerCase()));
            const index = allCloneTags.indexOf(target);

            if (index !== -1) {
                const allLiveTags = Array.from(pageWrapper.querySelectorAll(target.tagName.toLowerCase()));
                const liveTarget = allLiveTags[index];
                if (liveTarget) {
                    liveTarget.click();
                }
            }
        });

        cloneInner.appendChild(clonePage);
        cloneContainer.appendChild(cloneInner);

        // Append container to body
        document.body.appendChild(cloneContainer);


        // 3. Animate full-page sweep transition (normal or fast mode)
        function animatePageCurtain(timestamp) {
            let progress;
            if (isTransitionFast) {
                if (!fastStartTimestamp) fastStartTimestamp = timestamp;
                const elapsedFast = timestamp - fastStartTimestamp;
                const fastProgress = Math.min(elapsedFast / fastDuration, 1);
                progress = progressAtFastStart + fastProgress * (1 - progressAtFastStart);
            } else {
                if (!transitionStartTime) transitionStartTime = timestamp;
                const elapsed = timestamp - transitionStartTime;
                progress = Math.min(elapsed / transitionDuration, 1);
            }

            // Sync scroll alignment exactly in the same rendering frame to prevent shearing lag
            syncScrollOffset();

            // Linear sweep position for constant speed comparison
            const sweepPos = 135 - (progress * 170);

            // Apply diagonal clip path to the clone container: old theme is on left (clipped), new theme on right
            cloneContainer.style.clipPath = `polygon(0 0, ${sweepPos}% 0, calc(${sweepPos}% - 30%) 100%, 0 100%)`;

            if (progress < 1) {
                pageTransitionId = requestAnimationFrame(animatePageCurtain);
            } else {
                cloneContainer.remove();
                window.removeEventListener("scroll", handleScroll);
                pageTransitionId = null;
                fastStartTimestamp = null;

                // Keep the cycle loop rolling seamlessly!
                if (autoCycleActive) {
                    triggerNextTheme();
                }
            }
        }

        // Sync scroll offsets immediately on scroll events to prevent compositor lag
        function handleScroll() {
            syncScrollOffset();
        }
        window.addEventListener("scroll", handleScroll, { passive: true });

        pageTransitionId = requestAnimationFrame(animatePageCurtain);
    }

    themeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const selectedTheme = btn.getAttribute("data-theme");
            if (selectedTheme === activeTheme) return;

            // Pause auto cycle on manual theme click
            autoCycleActive = false;
            if (autoCycleToggle) {
                autoCycleToggle.classList.add("paused");
            }

            // Toggle active state on buttons
            themeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            activeTheme = selectedTheme;
            applyTheme(selectedTheme, true);
        });
    });

    // ----------------------------------------------------
    // 2. Light / Dark Mode Toggle & Auto-Detection
    // ----------------------------------------------------
    function setDarkMode(isDark) {
        const pageWrapper = document.getElementById("page-wrapper");
        const cloneOverlay = document.getElementById("page-wrapper-transition-overlay");
        const clonePage = cloneOverlay ? cloneOverlay.querySelector(".page-wrapper") : null;
        const cloneCheckbox = cloneOverlay ? cloneOverlay.querySelector("#dark-mode-checkbox") : null;

        if (isDark) {
            body.classList.add("dark-theme");
            if (pageWrapper) pageWrapper.classList.add("dark-theme");
            if (clonePage) clonePage.classList.add("dark-theme");
            darkModeCheckbox.checked = true;
            if (cloneCheckbox) cloneCheckbox.checked = true;
        } else {
            body.classList.remove("dark-theme");
            if (pageWrapper) pageWrapper.classList.remove("dark-theme");
            if (clonePage) clonePage.classList.remove("dark-theme");
            darkModeCheckbox.checked = false;
            if (cloneCheckbox) cloneCheckbox.checked = false;
        }

        // Update screenshot preview matching the new dark/light theme setting
        updateShowcaseScreenshot(activeTheme);
    }

    darkModeCheckbox.addEventListener("change", () => {
        setDarkMode(darkModeCheckbox.checked);
    });

    // Auto-detect system/device dark mode preference
    const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (systemPrefersDark) {
        // Initial detection
        setDarkMode(systemPrefersDark.matches);

        // Listen for OS theme changes in real-time
        try {
            systemPrefersDark.addEventListener("change", (e) => {
                setDarkMode(e.matches);
            });
        } catch {
            // Fallback for older browsers
            systemPrefersDark.addListener((e) => {
                setDarkMode(e.matches);
            });
        }
    }



    // ----------------------------------------------------
    // 4. Platform Detection for Download Link
    // ----------------------------------------------------
    function detectPlatform() {
        const platform = navigator.userAgent.toLowerCase();
        const downloadBtn = document.getElementById("download-btn-primary");

        if (!downloadBtn) return;

        // Check if user is browsing on a mobile device
        const isMobile = /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/i.test(platform);

        if (isMobile) {
            downloadBtn.innerHTML = `<span>Download for Desktop</span>`;
        } else if (platform.includes("win")) {
            downloadBtn.innerHTML = `<span>Download for Windows</span>`;
        } else if (platform.includes("mac")) {
            downloadBtn.innerHTML = `<span>Download for macOS</span>`;
        } else if (platform.includes("linux")) {
            downloadBtn.innerHTML = `<span>Download for Linux</span>`;
        } else {
            downloadBtn.innerHTML = `<span>Download Client</span>`;
        }
    }

    // ----------------------------------------------------
    // 5. Auto-Cycling Theme Loop (Continuous 10s Sweep Reveal)
    // ----------------------------------------------------
    const themes = Object.keys(themeMetadata);

    function triggerNextTheme() {
        if (!autoCycleActive) return;

        let currentIndex = themes.indexOf(activeTheme);
        let nextIndex = (currentIndex + 1) % themes.length;
        let nextTheme = themes[nextIndex];

        // Update active class on buttons
        themeButtons.forEach(b => {
            if (b.getAttribute("data-theme") === nextTheme) {
                b.classList.add("active");
            } else {
                b.classList.remove("active");
            }
        });

        activeTheme = nextTheme;
        applyTheme(nextTheme);
    }

    function startAutoCycle() {
        if (prefersReducedMotion) {
            if (autoCycleToggle) {
                autoCycleToggle.classList.add("paused");
            }
            return;
        }
        // Start the continuous transition sweeps immediately on page load
        triggerNextTheme();
    }

    // ----------------------------------------------------
    // 6. Play / Pause Auto Cycle Toggle
    // ----------------------------------------------------
    if (autoCycleToggle) {
        autoCycleToggle.addEventListener("click", () => {
            autoCycleActive = !autoCycleActive;
            if (autoCycleActive) {
                autoCycleToggle.classList.remove("paused");
                // Start a transition immediately to resume cycling if none is running
                if (!pageTransitionId) {
                    triggerNextTheme();
                }
            } else {
                autoCycleToggle.classList.add("paused");
                // If a transition is currently running, speed it up to complete quickly
                if (pageTransitionId && !isTransitionFast) {
                    isTransitionFast = true;
                    fastStartTimestamp = null;
                    const elapsed = performance.now() - (transitionStartTime || performance.now());
                    progressAtFastStart = Math.min(elapsed / transitionDuration, 1);
                }
            }
        });
    }



    // ----------------------------------------------------
    // 7. Dynamic GitHub Release Download Links Fetcher
    // ----------------------------------------------------
    async function updateDownloadUrls() {
        try {
            // Fetch list of all releases (to support pre-releases/beta tags like v1.0.0-beta)
            const response = await fetch("https://api.github.com/repos/Mignon-UI/Mignon-UI/releases");
            if (!response.ok) return;
            const data = await response.json();
            if (!data || !data.length) return;

            const latestRelease = data[0]; // Newest release (pre-release or stable)
            const assets = latestRelease.assets;
            if (!assets || !assets.length) return;

            const downloadBtns = document.querySelectorAll(".download-btn");
            downloadBtns.forEach(btn => {
                const text = btn.textContent.toLowerCase();
                let matchedAsset = null;

                if (text.includes(".exe")) {
                    matchedAsset = assets.find(a => a.name.toLowerCase().endsWith(".exe"));
                } else if (text.includes(".zip")) {
                    matchedAsset = assets.find(a => a.name.toLowerCase().endsWith(".zip"));
                } else if (text.includes(".dmg")) {
                    matchedAsset = assets.find(a => a.name.toLowerCase().endsWith(".dmg"));
                } else if (text.includes(".deb")) {
                    matchedAsset = assets.find(a => a.name.toLowerCase().endsWith(".deb"));
                } else if (text.includes(".appimage")) {
                    matchedAsset = assets.find(a => a.name.toLowerCase().endsWith(".appimage"));
                }

                if (matchedAsset) {
                    btn.setAttribute("href", matchedAsset.browser_download_url);
                }
            });
        } catch (err) {
            console.warn("Failed to fetch latest release assets from GitHub API, using fallback URLs:", err);
        }
    }
    updateDownloadUrls();

    // ----------------------------------------------------
    // 8. Tab Visibility Pause/Resume Listener
    // ----------------------------------------------------
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            hiddenTime = performance.now();
        } else {
            if (hiddenTime !== null) {
                const pauseDuration = performance.now() - hiddenTime;
                if (transitionStartTime !== null) {
                    transitionStartTime += pauseDuration;
                }
                if (fastStartTimestamp !== null) {
                    fastStartTimestamp += pauseDuration;
                }
                hiddenTime = null;
            }
        }
    });

    // ----------------------------------------------------
    // 9. Platform Switcher Tab Control
    // ----------------------------------------------------
    function selectPlatform(platformName) {
        // Query dynamically to include both the live page and the transition clone overlay elements
        const currentPills = document.querySelectorAll(".switcher-pill");
        const currentCards = document.querySelectorAll(".download-card");

        currentPills.forEach(pill => {
            if (pill.getAttribute("data-platform") === platformName) {
                pill.classList.add("active");
            } else {
                pill.classList.remove("active");
            }
        });

        currentCards.forEach(card => {
            if (card.getAttribute("data-platform") === platformName) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }
        });
    }

    // Set up click listeners on the live switcher pills
    document.querySelectorAll(".switcher-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const platform = pill.getAttribute("data-platform");
            selectPlatform(platform);
        });
    });

    // Auto-detect system OS and pre-select the appropriate card
    function autoSelectPlatform() {
        const platform = navigator.userAgent.toLowerCase();
        const isMobile = /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/i.test(platform);

        if (isMobile) {
            selectPlatform("windows"); // Default mobile view to Windows details
        } else if (platform.includes("win")) {
            selectPlatform("windows");
        } else if (platform.includes("mac")) {
            selectPlatform("macos");
        } else if (platform.includes("linux")) {
            selectPlatform("linux");
        } else {
            selectPlatform("windows");
        }
    }

    detectPlatform();
    autoSelectPlatform();
    startAutoCycle();
});
