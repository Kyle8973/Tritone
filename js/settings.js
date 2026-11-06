// ============================================================
//  settings.js — Settings Panel & Toggle Controls
// ============================================================

// ── Show Settings View ────────────────────────────────────────
window.showSettings = async function () {
    const settingsView = document.getElementById('settings-view');
    const lyricsLayer = document.getElementById('lyrics-view');
    const closeBtn = document.getElementById('pinnedCloseBtn');

    // Toggle: if already open, go back to grid
    if (settingsView.style.display === 'block') {
        showGridView();
        return;
    }

    // Close lyrics if open
    if (lyricsOpen) {
        lyricsOpen = false;
        if (lyricsLayer) lyricsLayer.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'none';
        const floatingNav = document.getElementById('sidebar-nav-floating');
        if (document.getElementById('sidebar').classList.contains('collapsed') && floatingNav) {
            floatingNav.style.display = 'flex';
        }
    }

    hideAllViews();
    settingsView.style.display = 'block';
    pushHistory({ view: 'settings', title: 'Settings' }, false);

    document.getElementById('bitrate-select').value = maxBitrate;

    const notifBtn = document.getElementById('notif-toggle-btn');
    if (notifBtn) {
        notifBtn.innerText = notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications';
        notifBtn.style.background = notificationsEnabled ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)';
        notifBtn.style.color = notificationsEnabled ? 'black' : 'white';
        notifBtn.style.border = notificationsEnabled ? 'none' : '1px solid rgba(255,255,255,0.2)';
    }

    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        try {
            const appVersion = await ipcRenderer.invoke('get-app-version');
            const apiVer = localStorage.getItem('tritone_server_api') || 'Unknown';
            const serverType = localStorage.getItem('tritone_server_type') || 'Unknown';
            const serverVer = localStorage.getItem('tritone_server_version') || '';
            const isOpenSubsonic = localStorage.getItem('tritone_is_opensubsonic') || '';

            let serverDetail = `${serverType} ${serverVer}`.trim();
            if (isOpenSubsonic === 'true') serverDetail += ' (OpenSubsonic)';

            versionDisplay.innerHTML = `
                <strong>Tritone V${appVersion}</strong><br>
                Made with ❤️ By <a href="https://github.com/Kyle8973/Tritone" target="_blank" style="color:inherit;text-decoration:underline;">Kyle8973</a><br>
                <span style="font-size:0.85em;opacity:0.8;">
                    Server: ${serverDetail}<br>
                    API Protocol: ${apiVer}
                </span>`;
        } catch (e) {
            versionDisplay.innerHTML = `Tritone<br>Made with ❤️ By Kyle8973`;
        }
    }
};

// ── Sync All Settings Controls to Saved Values ───────────────
window.syncSettingsUI = function () {
    rpcEnabled = localStorage.getItem('tritone_rpc_enabled') === 'true';
    notificationsEnabled = localStorage.getItem('tritone_notif_enabled') === 'true';
    closeToTrayEnabled = localStorage.getItem('tritone_close_tray') === 'true';

    const rpcBtn = document.getElementById('rpc-toggle-btn');
    if (rpcBtn) {
        updateButtonStyle(rpcBtn, rpcEnabled, 'RPC');
        if (typeof window.hasInitialSync === 'undefined') {
            ipcRenderer.send('set-rpc-enabled', rpcEnabled);
            window.hasInitialSync = true;
        }
    }

    const notifBtn = document.getElementById('notif-toggle-btn');
    if (notifBtn) updateButtonStyle(notifBtn, notificationsEnabled, 'Notifications');

    // Refresh server metadata if missing
    if (localStorage.getItem('server_config') && localStorage.getItem('tritone_server_type') === null) {
        const refreshMetadata = async () => {
            if (!config || !config.url) {
                const encrypted = localStorage.getItem('server_config');
                if (encrypted) {
                    try {
                        const decrypted = await ipcRenderer.invoke('decrypt-data', encrypted);
                        config = JSON.parse(decrypted);
                    } catch (e) { return; }
                }
            }
            try {
                const res = await fetch(`${config.url}/rest/ping?${getAuth()}&f=json`);
                const data = await res.json();
                const subRes = data['subsonic-response'];
                if (subRes && subRes.status === 'ok') {
                    localStorage.setItem('tritone_server_api', subRes.version || '1.16.1');
                    localStorage.setItem('tritone_server_type', subRes.type || 'Subsonic');
                    localStorage.setItem('tritone_server_version', subRes.serverVersion || '');
                    localStorage.setItem('tritone_is_opensubsonic', subRes.openSubsonic === true ? 'true' : 'false');
                    const typeLabel = document.getElementById('server-type-label');
                    if (typeLabel) typeLabel.innerText = subRes.type || 'Subsonic';
                }
            } catch (e) { }
        };
        refreshMetadata();
    }
};

// ── Button Style Helper ───────────────────────────────────────
function updateButtonStyle(btn, isEnabled, label) {
    btn.innerText = isEnabled ? `Disable ${label}` : `Enable ${label}`;
    if (isEnabled) {
        btn.style.background = 'var(--accent)';
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
        const rgb = accent.match(/\d+/g);
        if (rgb) {
            const brightness = ((rgb[0] * 299) + (rgb[1] * 587) + (rgb[2] * 114)) / 1000;
            const isLight = brightness > 150;
            btn.style.color = isLight ? 'black' : 'white';
            btn.style.fontWeight = isLight ? '900' : '600';
            btn.style.letterSpacing = isLight ? '0.5px' : 'normal';
            btn.style.textShadow = !isLight ? '0 1px 3px rgba(0,0,0,0.6)' : 'none';
        }
    } else {
        btn.style.background = 'rgba(255, 255, 255, 0.1)';
        btn.style.color = 'white';
        btn.style.fontWeight = '600';
        btn.style.textShadow = 'none';
    }
}

// ── RPC Toggle ────────────────────────────────────────────────
window.toggleRPCSetting = function () {
    if (rpcCooldown > 0) {
        showToast(`⚠️ Please Wait ${rpcCooldown}s Before Toggling RPC Again`);
        return;
    }

    rpcEnabled = !rpcEnabled;
    localStorage.setItem('tritone_rpc_enabled', rpcEnabled.toString());

    const rpcBtn = document.getElementById('rpc-toggle-btn');
    if (rpcBtn) {
        rpcBtn.innerText = rpcEnabled ? 'Disable RPC' : 'Enable RPC';
        rpcBtn.style.background = rpcEnabled ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)';
        rpcBtn.style.color = rpcEnabled ? 'black' : 'white';
        rpcBtn.style.border = rpcEnabled ? 'none' : '1px solid rgba(255,255,255,0.2)';
    }

    ipcRenderer.send('set-rpc-enabled', rpcEnabled);

    if (!rpcEnabled) {
        showToast('❌ RPC Disabled');
    } else {
        setTimeout(() => { sendRPCUpdate(); }, 1500);
        showToast('✔️ RPC Enabled');
    }

    rpcCooldown = 5;
    const cooldownTimer = setInterval(() => {
        rpcCooldown--;
        if (rpcCooldown <= 0) clearInterval(cooldownTimer);
    }, 1000);
};

// ── Notifications Toggle ──────────────────────────────────────
window.toggleNotifSetting = function () {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem('tritone_notif_enabled', notificationsEnabled);
    ipcRenderer.send('set-notifications-enabled', notificationsEnabled);
    updateButtonStyle(document.getElementById('notif-toggle-btn'), notificationsEnabled, 'Notifications');
    showToast(notificationsEnabled ? '✅ Notifications Enabled' : '❌ Notifications Disabled');
};

// ── Close to Tray Toggle ──────────────────────────────────────
window.toggleCloseToTray = function () {
    closeToTrayEnabled = !closeToTrayEnabled;
    localStorage.setItem('tritone_close_tray', closeToTrayEnabled);
    const trayBtn = document.getElementById('close-tray-btn');
    if (trayBtn) {
        trayBtn.innerText = closeToTrayEnabled ? 'Disable Close To Tray' : 'Enable Close To Tray';
        trayBtn.style.background = closeToTrayEnabled ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)';
        trayBtn.style.color = closeToTrayEnabled ? 'black' : 'white';
        trayBtn.style.border = closeToTrayEnabled ? 'none' : '1px solid rgba(255,255,255,0.2)';
    }
    ipcRenderer.send('update-close-behavior', closeToTrayEnabled);
    showToast(closeToTrayEnabled ? '✅ Close To Tray Enabled' : '❌ Close To Tray Disabled');
};

// ── Bitrate ───────────────────────────────────────────────────
window.syncAudioUI = function () {
    const bitrateSelect = document.getElementById('bitrate-select');
    if (bitrateSelect) bitrateSelect.value = maxBitrate;
};

window.saveBitrate = function () {
    maxBitrate = document.getElementById('bitrate-select').value;
    localStorage.setItem('tritone_bitrate', maxBitrate);
    showToast('💾 Bitrate Saved! Will Apply To The Next Track');
};

// ── Clear Cache ───────────────────────────────────────────────
window.clearCache = function () {
    if (!confirm('This Will Clear All Cached Data (Including Recently Played Tracks). Are You Sure?')) return;
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('bio_') || key === 'recently_played') {
            localStorage.removeItem(key);
        }
    });
    showToast('🗑️ Cache Cleared!');
};
