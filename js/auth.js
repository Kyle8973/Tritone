// ============================================================
//  auth.js — Authentication & Connection
// ============================================================

// ── Auth Token Builder ────────────────────────────────────────
function getAuth() {
    if (!config) return '';
    const salt = Math.random().toString(36).substring(2);
    const token = CryptoJS.MD5(config.pass + salt).toString();
    return `u=${config.user}&t=${token}&s=${salt}&v=1.16.1&c=Tritone&f=json`;
}

// ── Login Setup Overlay ───────────────────────────────────────
function showSetup() {
    const overlay = document.getElementById('setup-overlay');
    const urlInput = document.getElementById('setup-url');
    overlay.style.display = 'flex';
    urlInput.value = '';
    document.getElementById('setup-user').value = '';
    document.getElementById('setup-pass').value = '';
    ipcRenderer.send('force-focus');
    setTimeout(() => { urlInput.focus(); }, 150);
}

// ── Save & Test Connection ────────────────────────────────────
async function saveConnection() {
    const urlInput = document.getElementById('setup-url').value.trim();
    const user = document.getElementById('setup-user').value.trim();
    const pass = document.getElementById('setup-pass').value.trim();
    const errorMsg = document.getElementById('setup-error');

    if (!urlInput || !user) {
        errorMsg.innerText = 'URL And Username Are Required';
        errorMsg.style.display = 'block';
        return;
    }

    const url = urlInput.endsWith('/') ? urlInput.slice(0, -1) : urlInput;
    config = { url, user, pass };

    try {
        const res = await fetch(`${config.url}/rest/ping?${getAuth()}&f=json`);
        const data = await res.json();
        const subRes = data['subsonic-response'];

        if (subRes && subRes.status === 'ok') {
            localStorage.setItem('tritone_server_api', subRes.version || '?');
            localStorage.setItem('tritone_server_type', subRes.type || '?');
            localStorage.setItem('tritone_server_version', subRes.serverVersion || '?');
            localStorage.setItem('tritone_is_opensubsonic', subRes.openSubsonic === true ? 'true' : 'false');

            const encrypted = await ipcRenderer.invoke('encrypt-data', JSON.stringify(config));
            localStorage.setItem('server_config', encrypted);

            document.getElementById('setup-overlay').style.display = 'none';

            loadLibrary();
            loadPlaylists();

            if (typeof syncSettingsUI === 'function') syncSettingsUI();
            showToast('✅ Connected to Server!');
        } else {
            const reason = subRes?.error?.message || 'Invalid Credentials';
            throw new Error(reason);
        }
    } catch (e) {
        console.error('Connection Error:', e);
        errorMsg.innerText = `Connection Failed: ${e.message || 'Please Check Your Details'}\nExpected Format: http://ip:port`;
        errorMsg.style.display = 'block';
    }
}

// ── Logout ────────────────────────────────────────────────────
function logout() {
    if (confirm('Are You Sure You Want To Logout?')) {
        localStorage.clear();
        config = null;
        audio.pause();
        audio.src = '';
        currentlyPlayingTrack = null;
        hideAllViews();
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'flex';
        const albumList = document.getElementById('album-list');
        if (albumList) albumList.innerHTML = '';
        showSetup();
    }
}

// ── Track Download ────────────────────────────────────────────
window.downloadTrack = function (id, title, artist, suffix) {
    const ext = suffix || 'mp3';
    const cleanArtist = sanitizeFilename(artist || 'Unknown');
    const cleanTitle = sanitizeFilename(title || 'Track');
    const url = `${config.url}/rest/download?id=${id}&${getAuth()}`;
    ipcRenderer.send('download-track', { url, filename: `${cleanArtist} - ${cleanTitle}.${ext}` });
    showToast(`📩 Downloading: ${title}...`);
};