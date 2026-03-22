// ============================================================
//  app.js — Application Entry Point
// ============================================================

// ── Boot ──────────────────────────────────────────────────────
async function initApp() {
    // 1. Decrypt and load saved config
    const encrypted = localStorage.getItem('server_config');
    if (encrypted) {
        try {
            const decrypted = await ipcRenderer.invoke('decrypt-data', encrypted);
            if (decrypted) config = JSON.parse(decrypted);
        } catch (e) {
            console.error('Secure decryption failed:', e);
        }
    }

    // 2. Default sort
    currentSortType = 'alphabeticalByName';
    const sortDropdown = document.getElementById('library-sort');
    if (sortDropdown) sortDropdown.value = 'alphabeticalByName';

    // 3. Volume persistence
    const savedVol = localStorage.getItem('tritone_vol');
    if (savedVol !== null) {
        audio.volume = parseFloat(savedVol);
        const volSlider = document.getElementById('volume-slider');
        if (volSlider) volSlider.value = savedVol;
    }

    // 4. Sync all settings UI controls
    syncSettingsUI();
    syncAudioUI();
    syncPerformanceUI();

    // 5. Auth check
    if (!config || !config.url) {
        showSetup();
    } else {
        const setupOverlay = document.getElementById('setup-overlay');
        if (setupOverlay) setupOverlay.style.display = 'none';
        loadLibrary(true);
        loadPlaylists();
    }
}

// ── Wire up event listeners that need the DOM ready ───────────
document.addEventListener('DOMContentLoaded', () => {
    // Search inputs
    initSearchListeners();

    // Settings sync calls (kept for compatibility with any inline calls)
    syncSettingsUI();
    syncAudioUI();
    syncPerformanceUI();
});

// ── Single entry point — only called once ─────────────────────
window.onload = initApp;
