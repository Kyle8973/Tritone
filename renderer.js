const { ipcRenderer, shell } = require('electron');
const CryptoJS = require('crypto-js');
const colorThief = new ColorThief();

let config = null;
let viewQueue = [], playbackQueue = []; 
let originalQueue = []; 
let playbackHistory = []; 
let currentIndex = 0, currentlyPlayingTrack = null, lyricsOpen = false, currentSyncedLyrics = []; 
let isShuffle = false, isRepeat = false; 
let queueOpen = false; 
let hasScrobbled = false; 
const audio = new Audio(); 

let maxBitrate = localStorage.getItem('tritone_bitrate') || '0'; 
let rpcEnabled = localStorage.getItem('tritone_rpc_enabled') !== 'false'; 
let notificationsEnabled = localStorage.getItem('tritone_notif_enabled') !== 'false'; 

const artistPlaceholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ffffff" opacity="0.1"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
const playlistPlaceholder = 'assets/images/logo.svg';

function setFadeImage(imgElement, src) {
    if (imgElement.src !== src) {
        imgElement.style.opacity = '0';
        imgElement.onload = () => { imgElement.style.opacity = '1'; };
        imgElement.src = src;
    }
}

function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '');
}

function applyScroll(el) {
    setTimeout(() => {
        const inner = el.querySelector('.scroll-inner');
        if (inner && inner.scrollWidth > el.clientWidth) {
            const dist = inner.scrollWidth - el.clientWidth + 50; 
            inner.style.setProperty('--scroll-dist', `-${dist}px`);
            inner.classList.add('do-scroll');
        } else if (inner) {
            inner.classList.remove('do-scroll');
            inner.style.setProperty('--scroll-dist', `0px`);
        }
    }, 200);
}

let historyStack = [];
let isBackNavigation = false;

function updateBreadcrumbs() {
    const btn = document.getElementById('back-btn');
    const crumb = document.getElementById('breadcrumb');
    const sidebar = document.getElementById('sidebar');
    
    // NEW: Check if sidebar is currently collapsed
    const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;

    if (historyStack.length <= 1) {
        if (btn) btn.style.display = 'none';
        if (crumb) crumb.innerText = '';
    } else {
        // MODIFIED: Hide the button if sidebar is collapsed
        if (btn) btn.style.display = isCollapsed ? 'none' : 'flex';
        
        if (crumb) crumb.innerText = ''; 
    }
}

function pushHistory(state, isRoot = false) {
    if (isBackNavigation) {
        isBackNavigation = false;
    } else {
        if (isRoot) {
            historyStack = [state];
        } else {
            const last = historyStack[historyStack.length - 1];
            if (last && last.view === 'search' && state.view === 'search') {
                historyStack[historyStack.length - 1] = state;
            } else if (!last || last.view !== state.view || last.param !== state.param) {
                historyStack.push(state);
            }
        }
    }
    updateBreadcrumbs();
}

window.goBack = function() {
    if (historyStack.length > 1) {
        historyStack.pop(); 
        const prev = historyStack[historyStack.length - 1];
        isBackNavigation = true; 
        
        if (prev.view === 'grid') showGridView();
        else if (prev.view === 'artist') searchArtist(prev.param);
        else if (prev.view === 'album') loadAlbumTracks(prev.param);
        else if (prev.view === 'playlist') loadPlaylistTracks(prev.param, prev.title);
        else if (prev.view === 'starred') loadStarredTracks();
        else if (prev.view === 'settings') showSettings();
        else if (prev.view === 'search') {
            document.getElementById('library-search').value = prev.param;
            executeSearch(prev.param);
        }
    }
};

function hideAllViews() {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('album-view').style.display = 'none';
    document.getElementById('artist-view').style.display = 'none';
    document.getElementById('library-grid-view').style.display = 'none';
    if(document.getElementById('settings-view')) document.getElementById('settings-view').style.display = 'none';
    if(document.getElementById('search-view')) document.getElementById('search-view').style.display = 'none';
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function initApp() {
    const encrypted = localStorage.getItem('server_config');
    if (encrypted) {
        try {
            const decrypted = await ipcRenderer.invoke('decrypt-data', encrypted);
            if (decrypted) { config = JSON.parse(decrypted); }
        } catch (e) { console.error("Secure decryption failed:", e); }
    }
    const savedVol = localStorage.getItem('tritone_vol');
    if (savedVol !== null) {
        audio.volume = parseFloat(savedVol);
        document.getElementById('volume-slider').value = savedVol;
    }
    if (!config) { showSetup(); } 
    else {
        document.getElementById('setup-overlay').style.display = 'none';
        loadLibrary();
        loadPlaylists();
    }
}
window.onload = initApp;

function logout() {
    if (confirm("Are You Sure You Want To Logout?")) {
        localStorage.removeItem('server_config');
        config = null;
        audio.pause();
        audio.src = "";
        currentlyPlayingTrack = null;
        hideAllViews();
        document.getElementById('empty-state').style.display = 'flex';
        document.getElementById('album-list').innerHTML = '';
        showSetup();
    }
}

function showSetup() {
    const overlay = document.getElementById('setup-overlay');
    const urlInput = document.getElementById('setup-url');
    overlay.style.display = 'flex';
    urlInput.value = "";
    document.getElementById('setup-user').value = "";
    document.getElementById('setup-pass').value = "";
    ipcRenderer.send('force-focus');
    setTimeout(() => { urlInput.focus(); }, 150);
}

async function saveConnection() {
    const urlInput = document.getElementById('setup-url').value.trim();
    const user = document.getElementById('setup-user').value.trim();
    const pass = document.getElementById('setup-pass').value.trim();
    const errorMsg = document.getElementById('setup-error');
    if (!urlInput || !user) {
        errorMsg.innerText = "URL And Username Are Required";
        errorMsg.style.display = 'block';
        return;
    }
    const url = urlInput.endsWith('/') ? urlInput.slice(0, -1) : urlInput;
    config = { url, user, pass };
    try {
        const res = await fetch(`${config.url}/rest/ping?${getAuth()}`);
        const data = await res.json();
        if (data['subsonic-response'].status === 'ok') {
            const encrypted = await ipcRenderer.invoke('encrypt-data', JSON.stringify(config));
            localStorage.setItem('server_config', encrypted);
            document.getElementById('setup-overlay').style.display = 'none';
            loadLibrary(); loadPlaylists();
            showToast("Connected to Server!");
        } else { throw new Error(); }
    } catch (e) {
        errorMsg.innerText = "Connection Failed - Please Check Your Details and Try Again";
        errorMsg.style.display = 'block';
    }
}

function getAuth() {
    if (!config) return "";
    const salt = Math.random().toString(36).substring(2);
    const token = CryptoJS.MD5(config.pass + salt).toString();
    return `u=${config.user}&t=${token}&s=${salt}&v=1.16.1&c=Tritone&f=json`;
}

window.downloadTrack = function(id, title, artist, suffix) {
    const ext = suffix || 'mp3';
    const cleanArtist = sanitizeFilename(artist || 'Unknown');
    const cleanTitle = sanitizeFilename(title || 'Track');
    const url = `${config.url}/rest/download?id=${id}&${getAuth()}`;
    ipcRenderer.send('download-track', { url, filename: `${cleanArtist} - ${cleanTitle}.${ext}` });
    showToast(`Downloading: ${title}...`);
}

window.showSettings = function() {
    hideAllViews();
    document.getElementById('settings-view').style.display = 'block';
    pushHistory({ view: 'settings', title: 'Settings' }, false);
    document.getElementById('bitrate-select').value = maxBitrate;
    document.getElementById('rpc-toggle-btn').innerText = rpcEnabled ? 'Disable RPC' : 'Enable RPC';
    document.getElementById('notif-toggle-btn').innerText = notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications';
}

window.clearCache = function() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('bio_') || key === 'recently_played') {
            localStorage.removeItem(key);
        }
    });
    showToast("Cache Cleared!");
}

window.saveBitrate = function() {
    maxBitrate = document.getElementById('bitrate-select').value;
    localStorage.setItem('tritone_bitrate', maxBitrate);
    showToast("Audio Quality Updated");
}

window.toggleRPCSetting = function() {
    rpcEnabled = !rpcEnabled;
    localStorage.setItem('tritone_rpc_enabled', rpcEnabled);
    document.getElementById('rpc-toggle-btn').innerText = rpcEnabled ? 'Disable RPC' : 'Enable RPC';
    
    if (!rpcEnabled) {
        ipcRenderer.send('update-rpc', { clear: true }); 
    } else {
        sendRPCUpdate();
    }
    showToast(rpcEnabled ? "RPC Enabled" : "RPC Disabled");
}

window.toggleNotifSetting = function() {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem('tritone_notif_enabled', notificationsEnabled);
    document.getElementById('notif-toggle-btn').innerText = notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications';
    showToast(notificationsEnabled ? "Notifications Enabled" : "Notifications Disabled");
}

let rpcUpdateTimeout;

function sendRPCUpdate() {
    if (!rpcEnabled) {
        ipcRenderer.send('update-rpc', { clear: true });
        return;
    }
    if (!currentlyPlayingTrack) return;
    
    clearTimeout(rpcUpdateTimeout);
    rpcUpdateTimeout = setTimeout(() => {
        const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) ? audio.duration : (currentlyPlayingTrack.duration || 0);
        ipcRenderer.send('update-rpc', {
            title: currentlyPlayingTrack.title || 'Unknown', 
            artist: currentlyPlayingTrack.artist || 'Unknown',
            album: currentlyPlayingTrack.album || 'Unknown Album', 
            duration: dur, 
            currentTime: audio.currentTime || 0, 
            isPaused: audio.paused
        });
    }, 500); 
}

function seekAudio(seconds) {
    if (!audio.paused || audio.currentTime > 0) {
        const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) ? audio.duration : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
        audio.currentTime = Math.max(0, Math.min(dur, audio.currentTime + seconds));
        sendRPCUpdate();
    }
}

window.createNewPlaylist = function() {
    document.getElementById('new-playlist-name').value = '';
    document.getElementById('create-playlist-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('new-playlist-name').focus(), 100);
}

window.closeCreatePlaylistModal = function() {
    document.getElementById('create-playlist-modal').style.display = 'none';
}

window.submitNewPlaylist = async function() {
    const name = document.getElementById('new-playlist-name').value.trim();
    if (name) {
        try {
            await fetch(`${config.url}/rest/createPlaylist?name=${encodeURIComponent(name)}&${getAuth()}`);
            showToast("Playlist Created!");
            closeCreatePlaylistModal();
            loadPlaylists();
        } catch (e) { showToast("Failed To Create Playlist"); }
    }
}

window.deletePlaylist = async function(id, name) {
    if (confirm(`Are You Sure You Want To Permanently Delete The Playlist "${name}"?`)) {
        try {
            await fetch(`${config.url}/rest/deletePlaylist?id=${id}&${getAuth()}`);
            showToast(`Deleted ${name}`);
            loadPlaylists();
            showGridView();
        } catch(e) { console.error(e); showToast("Failed To Delete Playlist"); }
    }
}

let trackToAddToPlaylist = null;
window.openPlaylistModal = function(trackId) {
    trackToAddToPlaylist = trackId;
    const modalList = document.getElementById('playlist-modal-list');
    modalList.innerHTML = '<p>Loading...</p>';
    document.getElementById('playlist-modal').style.display = 'flex';
    
    fetch(`${config.url}/rest/getPlaylists?${getAuth()}`)
        .then(res => res.json())
        .then(data => {
            const playlists = data['subsonic-response'].playlists.playlist || [];
            modalList.innerHTML = '';
            playlists.forEach(pl => {
                const btn = document.createElement('div');
                btn.style.cssText = "padding: 10px; background: rgba(255,255,255,0.05); margin-bottom: 5px; border-radius: 5px; cursor: pointer;";
                btn.innerText = pl.name;
                btn.onclick = () => addToPlaylist(pl.id, trackToAddToPlaylist);
                modalList.appendChild(btn);
            });
        }).catch(e => modalList.innerHTML = '<p>Error loading playlists</p>');
}

window.closePlaylistModal = function() {
    document.getElementById('playlist-modal').style.display = 'none';
    trackToAddToPlaylist = null;
}

async function addToPlaylist(playlistId, songId) {
    try {
        const checkRes = await fetch(`${config.url}/rest/getPlaylist?id=${playlistId}&${getAuth()}`);
        const checkData = await checkRes.json();
        const currentEntries = checkData['subsonic-response'].playlist.entry || [];
        
        const isDuplicate = currentEntries.some(track => track.id === songId);
        
        if (isDuplicate) {
            showToast("Track Is Already In This Playlist");
            closePlaylistModal();
            return;
        }

        await fetch(`${config.url}/rest/updatePlaylist?playlistId=${playlistId}&songIdToAdd=${songId}&${getAuth()}`);
        showToast("Added To Playlist!");
        closePlaylistModal();
        loadPlaylists();
    } catch (e) {
        showToast("Failed To Add To Playlist");
    }
}

window.removeFromPlaylist = async function(playlistId, songIndex, playlistName) {
    if (confirm("Are You Sure You Want To Remove This Track From The Playlist?")) {
        try {
            await fetch(`${config.url}/rest/updatePlaylist?playlistId=${playlistId}&songIndexToRemove=${songIndex}&${getAuth()}`);
            showToast("Removed From Playlist");
            loadPlaylistTracks(playlistId, playlistName);
            loadPlaylists();
        } catch (e) { showToast("Failed To Remove From Playlist"); }
    }
}

function handleGlobalSearch(e) {
    const query = e.target.value.trim();
    
    if (e.target.id === 'library-search') {
        const gs = document.getElementById('grid-search');
        if (gs) gs.value = e.target.value;
    } else if (e.target.id === 'grid-search') {
        const ls = document.getElementById('library-search');
        if (ls) ls.value = e.target.value;
    }

    if (query.length < 2) { 
        if (query.length === 0) loadLibrary(); 
        return; 
    }
    
    executeSearch(query);
}

async function executeSearch(query) {
    try {
        const res = await fetch(`${config.url}/rest/search3?query=${encodeURIComponent(query)}&artistCount=5&albumCount=20&songCount=20&${getAuth()}`);
        const data = await res.json();
        const results = data['subsonic-response'].searchResult3;
        
        hideAllViews();
        document.getElementById('search-view').style.display = 'block';
        pushHistory({ view: 'search', param: query, title: `Search Results` }, false);

        const topResultContainer = document.getElementById('search-top-result');
        if (results.artist && results.artist.length > 0) {
            const topArtist = results.artist[0];
            const localArtUrl = topArtist.id ? `${config.url}/rest/getCoverArt?id=${topArtist.id}&${getAuth()}` : '';
            
            topResultContainer.innerHTML = `<div class="top-result-card" onclick="searchArtist('${topArtist.name}')">
                <img id="search-top-artist-img" src="${localArtUrl}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23ffffff%22 opacity=%220.1%22><path d=%22M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z%22/></svg>'" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,0.05);">
                <div><h2 style="margin:0;">${topArtist.name}</h2><p style="opacity:0.6; margin:5px 0 0 0;">Artist</p></div>
            </div>`;

            const cacheKey = `bio_${topArtist.name.toLowerCase()}`;
            const cachedStr = localStorage.getItem(cacheKey);
            
            if (cachedStr) {
                const cachedData = JSON.parse(cachedStr);
                if (cachedData.thumb) {
                    const imgEl = document.getElementById('search-top-artist-img');
                    if(imgEl) imgEl.src = cachedData.thumb;
                }
            } else {
                fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(topArtist.name)}`)
                    .then(r => r.json())
                    .then(adbData => {
                        if (adbData.artists && adbData.artists[0] && adbData.artists[0].strArtistThumb) {
                            const thumb = adbData.artists[0].strArtistThumb;
                            const imgEl = document.getElementById('search-top-artist-img');
                            if (imgEl) imgEl.src = thumb;
                            
                            const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                            existingCache.thumb = thumb;
                            localStorage.setItem(cacheKey, JSON.stringify(existingCache));
                        }
                    }).catch(e => console.warn("Failed async image grab", e));
            }

        } else {
            topResultContainer.innerHTML = '';
        }

        // Playlist Filtering logic
        const playlistList = document.getElementById('playlist-list');
        const playlists = Array.from(playlistList.querySelectorAll('.playlist-item'));
        const searchResultsView = document.getElementById('search-view');
        
        let playlistResultsGrid = document.getElementById('search-playlists-grid');
        if (!playlistResultsGrid) {
            const title = document.createElement('h2');
            title.id = 'search-playlists-title';
            title.style.color = 'white';
            title.innerText = 'Playlists';
            
            playlistResultsGrid = document.createElement('div');
            playlistResultsGrid.id = 'search-playlists-grid';
            playlistResultsGrid.className = 'alphabetical-grid';
            playlistResultsGrid.style.marginBottom = '40px';
            
            searchResultsView.appendChild(title);
            searchResultsView.appendChild(playlistResultsGrid);
        }

        playlistResultsGrid.innerHTML = '';
        const matchingPlaylists = playlists.filter(pl => 
            pl.innerText.toLowerCase().includes(query.toLowerCase())
        );

        if (matchingPlaylists.length > 0) {
            document.getElementById('search-playlists-title').style.display = 'block';
            matchingPlaylists.forEach(pl => {
                const clone = pl.cloneNode(true);
                clone.onclick = pl.onclick; 
                playlistResultsGrid.appendChild(clone);
            });
        } else {
            document.getElementById('search-playlists-title').style.display = 'none';
        }

        const songsList = document.getElementById('search-songs-list');
        songsList.innerHTML = '';
        if (results.song && results.song.length > 0) {
            document.getElementById('search-songs-title').style.display = 'block';
            results.song.slice(0, 10).forEach((track, i) => {
                const div = document.createElement('div'); 
                div.className = 'track-row track-row-artist'; 
                div.innerHTML = `<span>${i + 1}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span><span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span><span>${formatDuration(track.duration)}</span><span class="download-btn" title="Download">⬇</span><span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
                div.onclick = () => playFromList(results.song, i);
                div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
                div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
                songsList.appendChild(div);
            });
        } else { document.getElementById('search-songs-title').style.display = 'none'; }

        const albumsGrid = document.getElementById('search-albums-grid');
        albumsGrid.innerHTML = '';
        if (results.album && results.album.length > 0) {
            document.getElementById('search-albums-title').style.display = 'block';
            results.album.forEach(album => {
                const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}&${getAuth()}`;
                const card = document.createElement('div'); card.className = 'grid-album-card';
                card.innerHTML = `<img class="grid-album-art" src="${artUrl}"><div style="font-weight:bold; font-size:14px; margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${album.name}</div><div style="font-size:12px; opacity:0.6;">${album.artist}</div>`;
                card.onclick = () => loadAlbumTracks(album.id);
                albumsGrid.appendChild(card);
            });
        } else { document.getElementById('search-albums-title').style.display = 'none'; }

    } catch(err) { console.error("Search failed", err); }
}

document.getElementById('library-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        handleGlobalSearch(e);
    }
});

document.getElementById('grid-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        handleGlobalSearch(e);
    }
});

function showGridView() {
    hideAllViews();
    
    // Clear search bars when going home
    const libSearch = document.getElementById('library-search');
    const gridSearch = document.getElementById('grid-search');
    if (libSearch) libSearch.value = '';
    if (gridSearch) gridSearch.value = '';

    document.getElementById('library-grid-view').style.display = 'block';
    pushHistory({ view: 'grid', title: 'Library' }, true);
}

async function loadLibrary() {
    try {
        const res = await fetch(`${config.url}/rest/getAlbumList2?type=newest&size=200&${getAuth()}`);
        const data = await res.json();
        const albums = data['subsonic-response'].albumList2.album;
        const sortedAlbums = [...albums].sort((a, b) => a.name.localeCompare(b.name));
        const sidebarList = document.getElementById('album-list');
        const mainGrid = document.getElementById('alphabetical-grid');
        sidebarList.innerHTML = ''; mainGrid.innerHTML = '';
        sortedAlbums.forEach(album => {
            const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}&${getAuth()}`;
            const item = document.createElement('div'); item.className = 'album-item';
            item.innerHTML = `<img class="album-thumb" src="${artUrl}"><div><b>${album.name}</b><br><small>${album.artist}</small></div>`;
            item.onclick = () => loadAlbumTracks(album.id);
            sidebarList.appendChild(item);
            const card = document.createElement('div'); card.className = 'grid-album-card';
            card.innerHTML = `<img class="grid-album-art" src="${artUrl}"><div style="font-weight:bold; font-size:14px; margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${album.name}</div><div style="font-size:12px; opacity:0.6;">${album.artist}</div>`;
            card.onclick = () => loadAlbumTracks(album.id);
            mainGrid.appendChild(card);
        });
        showGridView();
    } catch (err) { console.error("Library load error:", err); showToast("Failed To Load Library"); }
}

async function loadPlaylists() {
    try {
        const res = await fetch(`${config.url}/rest/getPlaylists?${getAuth()}`);
        const data = await res.json();
        const playlists = data['subsonic-response'].playlists.playlist || [];
        const list = document.getElementById('playlist-list');
        if(!list) return; 
        list.innerHTML = '';
        
        const recentItem = document.createElement('div');
        recentItem.className = 'playlist-item';
        recentItem.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        recentItem.innerHTML = `<div class="playlist-thumb">🕒</div><div><b>Recently Played</b><br><small>Your History</small></div>`;
        recentItem.onclick = () => loadRecentlyPlayed();
        list.appendChild(recentItem);

        const favItem = document.createElement('div'); favItem.className = 'playlist-item';
        favItem.style.border = "1px solid rgba(29, 185, 84, 0.3)";
        favItem.innerHTML = `<div class="playlist-thumb"><img src="assets/images/heart.png" style="width: 32px; height: 32px; object-fit: contain;"></div><div><b>Favourite Tracks</b><br><small>Your Favorites</small></div>`;
        favItem.onclick = () => loadStarredTracks();
        list.appendChild(favItem);

        const mixItem = document.createElement('div'); mixItem.className = 'playlist-item';
        mixItem.innerHTML = `<div class="playlist-thumb">🎲</div><div><b>Quick Mix</b><br><small>Random 50 Tracks</small></div>`;
        mixItem.onclick = () => playRandomMix();
        list.appendChild(mixItem);
        
        if(playlists) {
            playlists.forEach(pl => {
                const item = document.createElement('div'); 
                item.className = 'playlist-item';
                item.innerHTML = `
                    <div class="playlist-thumb" onclick="event.stopPropagation(); loadPlaylistTracks('${pl.id}', '${pl.name}')">🎵</div>
                    <div style="flex:1; overflow:hidden;" onclick="event.stopPropagation(); loadPlaylistTracks('${pl.id}', '${pl.name}')"><b>${pl.name}</b><br><small>${pl.songCount} tracks</small></div>
                    <button class="queue-del-btn" style="padding: 6px 10px; margin-left: 5px;" onclick="event.stopPropagation(); deletePlaylist('${pl.id}', '${pl.name}')" title="Delete Playlist">✕</button>
                `;
                list.appendChild(item);
            });
        }
    } catch (err) { console.error("Playlists load error:", err); }
}

window.loadRecentlyPlayed = function() {
    if (lyricsOpen) { lyricsOpen = false; document.getElementById('lyrics-view').style.display = 'none'; document.getElementById('pinnedCloseBtn').style.display = 'none'; }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) dlAlbumBtn.style.display = 'none';

    viewQueue = JSON.parse(localStorage.getItem('recently_played') || '[]');
    document.getElementById('view-album-title').innerText = "Recently Played";
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = "Listening History";
    artistSubtitle.style.cursor = "default"; artistSubtitle.onclick = null;
    document.getElementById('view-album-art').style.display = 'none';

    const container = document.getElementById('track-items');
    container.innerHTML = '';
    if (viewQueue.length === 0) {
        container.innerHTML = '<p style="opacity:0.5;">No listening history found yet.</p>';
        return;
    }

    viewQueue.forEach((track, i) => {
        const div = document.createElement('div'); 
        div.className = 'track-row track-row-artist';
        div.innerHTML = `<span>${i + 1}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span><span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span><span>${formatDuration(track.duration)}</span><span class="download-btn" title="Download">⬇</span><span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

function playFromList(list, index) {
    playbackQueue = [...list];
    originalQueue = [...list]; 
    if (isShuffle) {
        const currentTrack = playbackQueue[index];
        let remaining = playbackQueue.filter((_, idx) => idx !== index);
        for (let x = remaining.length - 1; x > 0; x--) {
            const y = Math.floor(Math.random() * (x + 1));
            [remaining[x], remaining[y]] = [remaining[y], remaining[x]];
        }
        playbackQueue = [currentTrack, ...remaining];
        playQueue(0);
    } else {
        playQueue(index);
    }
}

async function playRandomMix() {
    showToast("🎲 Generating Mix...");
    try {
        const res = await fetch(`${config.url}/rest/getRandomSongs?size=50&${getAuth()}`);
        const data = await res.json();
        playbackQueue = data['subsonic-response'].randomSongs.song;
        originalQueue = [...playbackQueue];
        currentIndex = 0; playQueue(0);
    } catch (e) { showToast("Mix Failed To Generate"); }
}

async function loadStarredTracks() {
    if (lyricsOpen) { lyricsOpen = false; document.getElementById('lyrics-view').style.display = 'none'; document.getElementById('pinnedCloseBtn').style.display = 'none'; }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';
    
    pushHistory({ view: 'starred', title: 'Favourites' }, true);

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) dlAlbumBtn.style.display = 'none';

    const res = await fetch(`${config.url}/rest/getStarred?${getAuth()}`);
    const data = await res.json();
    viewQueue = data['subsonic-response'].starred.song || [];
    document.getElementById('view-album-title').innerText = "Favourite Tracks";
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = "Personal Collection";
    artistSubtitle.style.cursor = "default"; artistSubtitle.onclick = null;
    
    document.getElementById('view-album-art').style.display = 'block';
    setFadeImage(document.getElementById('view-album-art'), "assets/images/heart.png");
    
    const container = document.getElementById('track-items');
    container.innerHTML = ''; 
    viewQueue.forEach((track, i) => {
        const div = document.createElement('div'); 
        div.className = 'track-row track-row-artist'; 
        div.innerHTML = `<span>${i + 1}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span><span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span><span>${formatDuration(track.duration)}</span><span class="download-btn" title="Download">⬇</span><span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

async function searchArtist(artistName) {
    if (lyricsOpen) { lyricsOpen = false; document.getElementById('lyrics-view').style.display = 'none'; document.getElementById('pinnedCloseBtn').style.display = 'none'; } 
    hideAllViews();
    const artistView = document.getElementById('artist-view');
    artistView.style.display = 'block';

    document.getElementById('artist-name-title').innerText = artistName;
    const albumGrid = document.getElementById('artist-albums-grid');
    const bioContainer = document.getElementById('artist-bio-container');
    const bioText = document.getElementById('artist-bio-text');
    const topTracksContainer = document.getElementById('artist-top-tracks-container');
    const topTracksList = document.getElementById('artist-top-tracks-list');
    const similarContainer = document.getElementById('artist-similar-container');
    
    setFadeImage(document.getElementById('artist-banner'), artistPlaceholder);
    
    albumGrid.innerHTML = '<p style="opacity:0.5;">Gathering discography...</p>';
    if (topTracksList) topTracksList.innerHTML = '';
    if (bioContainer) bioContainer.style.display = 'none';
    if (topTracksContainer) topTracksContainer.style.display = 'none';
    if (similarContainer) similarContainer.style.display = 'none';
    
    const toggleBtn = document.getElementById('bio-toggle-btn');
    if(bioText) bioText.classList.remove('expanded');
    if(toggleBtn) toggleBtn.style.display = 'none';

    try {
        const searchRes = await fetch(`${config.url}/rest/search3?query=${encodeURIComponent(artistName)}&albumCount=100&songCount=20&${getAuth()}`);
        const searchData = await searchRes.json();
        const results = searchData['subsonic-response'].searchResult3;
        const albums = (results.album || []).filter(a => a.artist.toLowerCase().includes(artistName.toLowerCase()));
        const topTracks = (results.song || []).filter(s => s.artist.toLowerCase().includes(artistName.toLowerCase()));
        
        albumGrid.innerHTML = '';
        albums.forEach(album => {
            const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}&${getAuth()}`;
            const card = document.createElement('div'); card.className = 'grid-album-card';
            card.innerHTML = `<img class="grid-album-art" src="${artUrl}"><div><b>${album.name}</b></div>`;
            card.onclick = () => { artistView.style.display = 'none'; loadAlbumTracks(album.id); };
            albumGrid.appendChild(card);
        });

        if (topTracks.length > 0 && topTracksContainer) {
            topTracksContainer.style.display = 'block';
            topTracks.slice(0, 10).forEach((track, i) => {
                const div = document.createElement('div'); div.className = 'track-row';
                div.innerHTML = `<span>${i + 1}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span><span>${formatDuration(track.duration)}</span><span class="download-btn" title="Download">⬇</span><span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
                div.onclick = () => playFromList(topTracks, i);
                div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
                topTracksList.appendChild(div);
            });
        }

        if(albums.length > 0) {
            document.getElementById('artist-stats').innerText = `${albums.length} Albums in Library`;
            setFadeImage(document.getElementById('artist-banner'), `${config.url}/rest/getCoverArt?id=${albums[0].coverArt}&${getAuth()}`);
            
            try {
                const simRes = await fetch(`${config.url}/rest/getSimilarSongs2?id=${albums[0].id}&count=50&${getAuth()}`);
                const simData = await simRes.json();
                const simSongs = simData['subsonic-response'].similarSongs2?.song || [];
                
                const uniqueArtists = [];
                const seen = new Set([artistName.toLowerCase()]);
                for (const s of simSongs) {
                    if (!seen.has(s.artist.toLowerCase())) {
                        seen.add(s.artist.toLowerCase());
                        uniqueArtists.push({ name: s.artist, artId: s.coverArt });
                    }
                }

                if (uniqueArtists.length > 0 && similarContainer) {
                    similarContainer.style.display = 'block';
                    const simGrid = document.getElementById('artist-similar-grid');
                    simGrid.innerHTML = '';
                    uniqueArtists.slice(0, 6).forEach(sim => {
                        const card = document.createElement('div');
                        card.className = 'grid-album-card';
                        card.innerHTML = `<img class="grid-album-art" src="${config.url}/rest/getCoverArt?id=${sim.artId}&${getAuth()}" onerror="this.style.opacity='0'"><div><b>${sim.name}</b></div>`;
                        card.onclick = () => { document.getElementById('artist-view').scrollTo(0,0); searchArtist(sim.name); };
                        simGrid.appendChild(card);
                    });
                }
            } catch(e) { console.warn("Similar Artists failed", e); }
        }

        const cacheKey = `bio_${artistName.toLowerCase()}`;
        const cachedStr = localStorage.getItem(cacheKey);

        if (cachedStr) {
            const cachedData = JSON.parse(cachedStr);
            if (bioText && cachedData.text) {
                bioText.innerText = cachedData.text;
                if (bioContainer) bioContainer.style.display = 'block';
                if (bioText.scrollHeight > 120 && toggleBtn) toggleBtn.style.display = 'block';
            }
            if (cachedData.thumb) setFadeImage(document.getElementById('artist-banner'), cachedData.thumb);
        } else {
            const adbRes = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artistName)}`);
            const adbData = await adbRes.json();
            
            let finalBio = '';
            let finalThumb = '';

            if (adbData.artists && adbData.artists[0]) {
                const artist = adbData.artists[0];
                if (artist.strBiographyEN) finalBio = artist.strBiographyEN;
                if (artist.strArtistThumb) finalThumb = artist.strArtistThumb;
            } 
            
            if (!finalBio) {
                const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`);
                const wikiData = await wikiRes.json();
                if(wikiData.extract) finalBio = wikiData.extract;
            }

            if (finalBio && bioText && bioContainer) {
                bioText.innerText = finalBio;
                bioContainer.style.display = 'block';
                if (bioText.scrollHeight > 120 && toggleBtn) toggleBtn.style.display = 'block';
            }
            if (finalThumb) setFadeImage(document.getElementById('artist-banner'), finalThumb);
            
            if (finalBio || finalThumb) {
                localStorage.setItem(cacheKey, JSON.stringify({ text: finalBio, thumb: finalThumb }));
            }
        }
    } catch (e) { console.error("Artist Discovery failed", e); }
}

function toggleBio() {
    const bioText = document.getElementById('artist-bio-text');
    const btn = document.getElementById('bio-toggle-btn');
    if (!bioText || !btn) return;
    bioText.classList.toggle('expanded');
    btn.innerText = bioText.classList.contains('expanded') ? 'Read Less' : 'Read More';
}

async function loadPlaylistTracks(playlistId, playlistName) {
    if (lyricsOpen) { lyricsOpen = false; document.getElementById('lyrics-view').style.display = 'none'; document.getElementById('pinnedCloseBtn').style.display = 'none'; }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';

    const res = await fetch(`${config.url}/rest/getPlaylist?id=${playlistId}&${getAuth()}`);
    const data = await res.json();
    viewQueue = data['subsonic-response'].playlist.entry || [];
    
    document.getElementById('view-album-title').innerText = playlistName;
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = "Playlist";
    artistSubtitle.style.cursor = "default"; artistSubtitle.onclick = null;
    
    const container = document.getElementById('track-items');
    container.innerHTML = '';

    if (viewQueue.length === 0) {
        container.innerHTML = `
            <div class="playlist-empty-state">
                <div style="font-size: 64px; margin-bottom: 20px;">📁</div>
                <h3>This playlist is empty</h3>
                <p>Add some tracks to start building your collection.</p>
            </div>`;
        setFadeImage(document.getElementById('view-album-art'), playlistPlaceholder);
        return;
    }

    document.getElementById('view-album-art').style.display = 'block';
    
    const uniqueCovers = [...new Set(viewQueue.map(t => t.coverArt))].slice(0, 4);
    const coverUrls = uniqueCovers.map(id => `${config.url}/rest/getCoverArt?id=${id}&${getAuth()}`);
    const collageDataUrl = await generateSmartCollage(coverUrls);
    setFadeImage(document.getElementById('view-album-art'), collageDataUrl);
    
    viewQueue.forEach((track, i) => {
        const div = document.createElement('div'); 
        div.className = 'track-row track-row-artist'; 
        div.innerHTML = `
            <span>${i + 1}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis; flex:1;">${track.title}</span>
            <span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span>
            <span>${formatDuration(track.duration)}</span>
            <span class="track-actions" style="display:flex; align-items:center; gap:12px; margin-left:15px;">
                <span class="download-btn" title="Download">⬇</span>
                <span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>
                <span class="remove-btn" onclick="event.stopPropagation(); removeFromPlaylist('${playlistId}', ${i}, '${playlistName}')" title="Remove Track" style="color:#ff5f5f; cursor:pointer; font-weight:bold; padding: 0 5px;">✕</span>
            </span>
        `;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

async function loadAlbumTracks(albumId) {
    if (lyricsOpen) { lyricsOpen = false; document.getElementById('lyrics-view').style.display = 'none'; document.getElementById('pinnedCloseBtn').style.display = 'none'; }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';

    const res = await fetch(`${config.url}/rest/getAlbum?id=${albumId}&${getAuth()}`);
    const data = await res.json();
    const albumData = data['subsonic-response'].album;
    
    viewQueue = (albumData.song || []).map(track => {
        track.album = track.album && track.album !== "" ? track.album : albumData.name;
        track.albumId = track.albumId || albumData.id;
        return track;
    });

    document.getElementById('view-album-title').innerText = albumData.name;
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = albumData.artist;
    artistSubtitle.style.cursor = "pointer"; artistSubtitle.onclick = () => searchArtist(artistSubtitle.innerText);
    
    const shuffleAlbumBtn = document.getElementById('shuffleBtn');
    if (shuffleAlbumBtn) {
        shuffleAlbumBtn.innerText = isShuffle ? 'Shuffle: On' : 'Shuffle';
        shuffleAlbumBtn.onclick = () => {
            toggleShuffle();
        };
    }

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) {
        dlAlbumBtn.style.display = 'inline-block';
        dlAlbumBtn.onclick = () => {
            const cleanArtist = sanitizeFilename(albumData.artist || 'Unknown');
            const cleanAlbum = sanitizeFilename(albumData.name || 'Album');
            const url = `${config.url}/rest/download?id=${albumId}&${getAuth()}`;
            ipcRenderer.send('download-track', { url, filename: `${cleanArtist} - ${cleanAlbum}.zip` });
            showToast(`Downloading Album: ${albumData.name}...`);
        };
    }

    document.getElementById('view-album-art').style.display = 'block';
    setFadeImage(document.getElementById('view-album-art'), `${config.url}/rest/getCoverArt?id=${albumData.coverArt}&${getAuth()}`);

    const container = document.getElementById('track-items');
    container.innerHTML = '';
    viewQueue.forEach((track, i) => {
        const div = document.createElement('div'); div.className = 'track-row';
        div.innerHTML = `<span>${i + 1}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span><span>${formatDuration(track.duration)}</span><span class="download-btn" title="Download">⬇</span><span class="add-to-pl-btn" onclick="event.stopPropagation(); openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

window.removeFromQueue = function(e, index) {
    e.stopPropagation();
    playbackQueue.splice(index, 1);
    if (index < currentIndex) {
        currentIndex--;
    } else if (index === currentIndex) {
        if (playbackQueue.length > 0) {
            playQueue(currentIndex % playbackQueue.length);
        } else {
            stopPlayerAndResetUI();
        }
    }
    renderQueue();
};

window.reorderQueue = function(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [movedTrack] = playbackQueue.splice(fromIndex, 1);
    playbackQueue.splice(toIndex, 0, movedTrack);
    
    if (currentIndex === fromIndex) {
        currentIndex = toIndex;
    } else {
        if (fromIndex < currentIndex && toIndex >= currentIndex) currentIndex--;
        else if (fromIndex > currentIndex && toIndex <= currentIndex) currentIndex++;
    }
    
    renderQueue();
};

ipcRenderer.on('menu-play-next', (e, track) => {
    if (!playbackQueue.length) { playbackQueue = [track]; originalQueue = [track]; playQueue(0); return; }
    playbackQueue.splice(currentIndex + 1, 0, track);
    if (isShuffle) originalQueue.push(track); 
    showToast(`Will Play ${track.title} Next`);
    if (queueOpen) renderQueue();
});

ipcRenderer.on('menu-add-queue', (e, track) => {
    if (!playbackQueue.length) { playbackQueue = [track]; originalQueue = [track]; playQueue(0); return; }
    playbackQueue.push(track);
    if (isShuffle) originalQueue.push(track);
    showToast(`Added ${track.title} To Queue`);
    if (queueOpen) renderQueue();
});

function toggleQueue() {
    queueOpen = !queueOpen;
    document.getElementById('queue-view').style.display = queueOpen ? 'flex' : 'none';
    if (queueOpen) renderQueue();
}

function renderQueue() {
    const list = document.getElementById('queue-list');
    list.innerHTML = '';
    if (!playbackQueue.length) { list.innerHTML = '<p style="opacity:0.5; text-align:center; padding: 20px;">Queue is empty.</p>'; return; }
    playbackQueue.forEach((track, originalIndex) => {
        const div = document.createElement('div');
        div.className = `queue-item ${originalIndex === currentIndex ? 'active' : ''}`;
        div.draggable = true;
        div.dataset.index = originalIndex;
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;">
                <span class="queue-drag-handle">≡</span>
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${track.title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="opacity:0.5;">${formatDuration(track.duration)}</span>
                <button class="queue-del-btn" onclick="removeFromQueue(event, ${originalIndex})">✕</button>
            </div>
        `;
        
        div.onclick = (e) => { 
            if(!e.target.classList.contains('queue-del-btn') && !e.target.classList.contains('queue-drag-handle')) {
                playQueue(originalIndex); 
            }
        };

        div.ondragstart = (e) => { e.dataTransfer.setData('text/plain', originalIndex); div.style.opacity = '0.5'; };
        div.ondragend = (e) => { div.style.opacity = '1'; };
        div.ondragover = (e) => { e.preventDefault(); div.style.background = 'rgba(255,255,255,0.1)'; };
        div.ondragleave = (e) => { div.style.background = ''; };
        div.ondrop = (e) => {
            e.preventDefault();
            div.style.background = '';
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            reorderQueue(fromIndex, originalIndex);
        };

        list.appendChild(div);
    });
}

async function toggleLyrics() {
    lyricsOpen = !lyricsOpen;
    const lyricsLayer = document.getElementById('lyrics-view');
    const closeBtn = document.getElementById('pinnedCloseBtn');
    const floatingNav = document.getElementById('sidebar-nav-floating');
    
    if (lyricsOpen) {
        lyricsLayer.style.display = 'block'; 
        closeBtn.style.display = 'block';
        if(floatingNav) floatingNav.style.display = 'none';
        if (currentlyPlayingTrack) fetchLyrics();
    } else { 
        lyricsLayer.style.display = 'none'; 
        closeBtn.style.display = 'none'; 
        if (document.getElementById('sidebar').classList.contains('collapsed')) {
            if(floatingNav) floatingNav.style.display = 'flex';
        }
    }
}

async function fetchLyrics() {
    if (!currentlyPlayingTrack) return;
    const track = currentlyPlayingTrack;
    const container = document.getElementById('lyrics-content');
    container.innerHTML = `<p style="opacity:0.5; font-size:24px;">Syncing lyrics...</p>`;
    currentSyncedLyrics = [];
    try {
        const webRes = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(track.artist)}&track_name=${encodeURIComponent(track.title)}`);
        const webData = await webRes.json();
        if (webData.syncedLyrics) parseLRC(webData.syncedLyrics);
        else container.innerHTML = (webData.plainLyrics || "No lyrics found.").split('\n').map(line => line.trim() ? `<div class="lyric-line active">${line}</div>` : '').join('');
    } catch (e) { container.innerText = "Offline."; }
}

function parseLRC(lrcText) {
    const container = document.getElementById('lyrics-content'); container.innerHTML = '';
    lrcText.split('\n').forEach(line => {
        const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (match) {
            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if (text) {
                const div = document.createElement('div'); div.className = 'lyric-line'; div.innerText = text;
                container.appendChild(div); currentSyncedLyrics.push({ time, element: div });
            }
        }
    });
}

function handleLyricsSync(currentTime) {
    if (!lyricsOpen || currentSyncedLyrics.length === 0) return;
    let activeIndex = -1;
    for (let i = 0; i < currentSyncedLyrics.length; i++) { if (currentTime >= currentSyncedLyrics[i].time) activeIndex = i; else break; }
    if (activeIndex !== -1) {
        document.querySelectorAll('.lyric-line').forEach(l => l.classList.remove('active'));
        const activeLine = currentSyncedLyrics[activeIndex].element;
        activeLine.classList.add('active'); activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function playQueue(index) {
    currentIndex = index; currentlyPlayingTrack = playbackQueue[index];
    hasScrobbled = false; if (queueOpen) renderQueue();
    const track = currentlyPlayingTrack;
    
    document.getElementById('starBtn').style.display = 'block';

    const mt = document.getElementById('mini-title');
    mt.innerHTML = `<span class="scroll-inner">${track.title}</span>`;
    applyScroll(mt);
    
    const miniArtistEl = document.getElementById('mini-artist');
    miniArtistEl.innerHTML = `<span class="scroll-inner">${track.artist}</span>`;
    miniArtistEl.onclick = () => { searchArtist(track.artist); };
    applyScroll(miniArtistEl);

    const miniAlbumEl = document.getElementById('mini-album');
    const safeAlbumName = track.album ? track.album : "Unknown Album";
    miniAlbumEl.innerHTML = `<span class="scroll-inner">${safeAlbumName}</span>`;
    miniAlbumEl.onclick = () => { if(track.albumId) loadAlbumTracks(track.albumId); };
    applyScroll(miniAlbumEl);
    
    const miniArt = document.getElementById('mini-art');
    miniArt.style.opacity = '0';
    miniArt.onload = function () {
        this.style.opacity = '1';
        try {
            const color = colorThief.getColor(this);
            document.body.style.background = `radial-gradient(circle at 20% 30%, rgba(${color[0]},${color[1]},${color[2]},0.55) 0%, #050505 85%)`;
            document.documentElement.style.setProperty('--accent', `rgb(${color[0]},${color[1]},${color[2]})`);
            document.getElementById('sidebar').style.background = `linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(${color[0]},${color[1]},${color[2]}, 0.2))`;
        } catch (e) { }
    };

    const uniqueAlbums = [...new Set(playbackQueue.map(t => t.albumId))];
    if (uniqueAlbums.length > 1) {
        miniArt.src = `${config.url}/rest/getCoverArt?id=${track.coverArt}&${getAuth()}`;
    } else if (track.coverArt) {
        miniArt.src = `${config.url}/rest/getCoverArt?id=${track.coverArt}&${getAuth()}`;
    } else {
        miniArt.src = playlistPlaceholder;
    }
    miniArt.style.display = 'block';
    
    let streamUrl = `${config.url}/rest/stream?id=${track.id}&${getAuth()}`;
    if (maxBitrate !== '0') streamUrl += `&maxBitRate=${maxBitrate}`;
    
    audio.src = streamUrl;
    audio.play(); document.getElementById('playPauseBtn').innerText = '⏸';
    document.getElementById('total-time').innerText = formatDuration(track.duration);
    
    let recentStr = localStorage.getItem('recently_played');
    let recent = recentStr ? JSON.parse(recentStr) : [];
    recent = recent.filter(t => t.id !== track.id);
    recent.unshift(track);
    if (recent.length > 50) recent.pop();
    localStorage.setItem('recently_played', JSON.stringify(recent));

    sendRPCUpdate(); if (lyricsOpen) fetchLyrics();
}

async function toggleStar() {
    if (!currentlyPlayingTrack) return;
    const isStarred = currentlyPlayingTrack.starred !== undefined;
    const endpoint = isStarred ? 'unstar' : 'star';
    try {
        await fetch(`${config.url}/rest/${endpoint}?id=${currentlyPlayingTrack.id}&${getAuth()}`);
        if (isStarred) { delete currentlyPlayingTrack.starred; document.getElementById('starBtn').innerText = '🤍'; showToast("Removed From Favorites"); }
        else { currentlyPlayingTrack.starred = new Date().toISOString(); document.getElementById('starBtn').innerText = '❤️'; showToast("Added To Favorites"); }
        loadPlaylists(); 
    } catch(e) { console.error(e); }
}

async function scrobbleTrack() {
    if (!currentlyPlayingTrack) return;
    try { await fetch(`${config.url}/rest/scrobble?id=${currentlyPlayingTrack.id}&submission=true&${getAuth()}`); showToast("Scrobbled To server"); } catch (e) { console.error("Scrobble failed", e); }
}

function stopPlayerAndResetUI() {
    audio.pause();
    audio.src = ""; 
    currentlyPlayingTrack = null;
    document.getElementById('mini-title').innerText = "Tritone";
    document.getElementById('mini-artist').innerHTML = '<a href="https://github.com/Kyle8973/Tritone" target="_blank">By Kyle8973</a>';
    document.getElementById('mini-album').innerText = "";
    document.getElementById('current-time').innerText = "0:00";
    document.getElementById('total-time').innerText = "0:00";
    document.getElementById('progress-bar').value = 0;
    document.getElementById('starBtn').style.display = 'none';
    const miniArt = document.getElementById('mini-art');
    miniArt.onload = null;
    miniArt.src = 'assets/images/logo.svg';
    document.getElementById('playPauseBtn').innerText = '▶';
}

audio.onended = () => { 
    if (isRepeat) {
        playQueue(currentIndex); 
    } else {
        if (currentlyPlayingTrack) {
            if (playbackHistory.length === 0 || playbackHistory[playbackHistory.length - 1].id !== currentlyPlayingTrack.id) {
                playbackHistory.push(currentlyPlayingTrack);
            }
            currentlyPlayingTrack = null;
        }
        playbackQueue.splice(currentIndex, 1);
        if (playbackQueue.length > 0) {
            playQueue(currentIndex % playbackQueue.length);
        } else {
            stopPlayerAndResetUI();
        }
    }
    if (queueOpen) renderQueue();
};

audio.onloadedmetadata = () => { 
    const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) ? audio.duration : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
    if (dur > 0) document.getElementById('total-time').innerText = formatDuration(Math.floor(dur)); 
};

audio.ontimeupdate = () => {
    const currentDuration = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) ? audio.duration : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
    if (currentDuration > 0) {
        document.getElementById('progress-bar').value = (audio.currentTime / currentDuration) * 100;
        document.getElementById('current-time').innerText = formatDuration(Math.floor(audio.currentTime));
        document.getElementById('total-time').innerText = formatDuration(Math.floor(currentDuration));
        handleLyricsSync(audio.currentTime);
        if (!hasScrobbled && audio.currentTime > (currentDuration / 2)) { hasScrobbled = true; scrobbleTrack(); }
    }
};

document.getElementById('progress-bar').oninput = function () { 
    const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) ? audio.duration : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
    audio.currentTime = (this.value / 100) * dur; 
    sendRPCUpdate(); 
};

document.getElementById('volume-slider').oninput = function () { audio.volume = this.value; localStorage.setItem('tritone_vol', this.value); };

function togglePlay() { 
    if (!audio.src || audio.src === "" || audio.src.endsWith('index.html')) return;
    if (audio.paused) { audio.play(); document.getElementById('playPauseBtn').innerText = '⏸'; } 
    else { audio.pause(); document.getElementById('playPauseBtn').innerText = '▶'; } 
    sendRPCUpdate(); 
}

function toggleShuffle() { 
    isShuffle = !isShuffle; 
    const barBtn = document.getElementById('shuffleBarBtn'); 
    const bigBtn = document.getElementById('shuffleBtn');
    if (isShuffle) { 
        if(barBtn) barBtn.classList.add('active'); 
        if(bigBtn) bigBtn.innerText = 'Shuffle: On';
        isRepeat = false; 
        const rpt = document.getElementById('repeatBtn');
        if(rpt) rpt.classList.remove('active');
        if (playbackQueue.length > 0) {
            const currentTrack = playbackQueue[currentIndex];
            let remaining = originalQueue.filter(t => t.id !== currentTrack.id);
            for (let x = remaining.length - 1; x > 0; x--) {
                const y = Math.floor(Math.random() * (x + 1));
                [remaining[x], remaining[y]] = [remaining[y], remaining[x]];
            }
            playbackQueue = [currentTrack, ...remaining];
            currentIndex = 0;
        }
    } else { 
        if(barBtn) barBtn.classList.remove('active'); 
        if(bigBtn) bigBtn.innerText = 'Shuffle';
        if (originalQueue.length > 0 && playbackQueue.length > 0) {
            const currentTrack = playbackQueue[currentIndex];
            playbackQueue = [...originalQueue];
            const newIdx = playbackQueue.findIndex(t => t.id === currentTrack.id);
            currentIndex = newIdx !== -1 ? newIdx : 0;
        }
    } 
    if (queueOpen) renderQueue();
}

function toggleRepeat() { 
    isRepeat = !isRepeat; 
    const repeatBtn = document.getElementById('repeatBtn'); 
    if (isRepeat) { repeatBtn.classList.add('active'); if (isShuffle) toggleShuffle(); } 
    else { repeatBtn.classList.remove('active'); } 
}

function playNext() { 
    if (playbackQueue.length > 0) {
        if (currentlyPlayingTrack) {
            if (playbackHistory.length === 0 || playbackHistory[playbackHistory.length - 1].id !== currentlyPlayingTrack.id) {
                playbackHistory.push(currentlyPlayingTrack);
            }
            currentlyPlayingTrack = null; 
        }
        playbackQueue.splice(currentIndex, 1);
        if (playbackQueue.length > 0) {
            playQueue(currentIndex % playbackQueue.length);
        } else {
            stopPlayerAndResetUI(); 
        }
    }
    if (queueOpen) renderQueue();
}

function playPrev() { 
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (playbackHistory.length > 0) {
        const prevTrack = playbackHistory.pop();
        if (currentlyPlayingTrack) {
            if (playbackQueue.length === 0 || playbackQueue[0].id !== currentlyPlayingTrack.id) {
                playbackQueue.unshift(currentlyPlayingTrack);
            }
        }
        if (playbackQueue.length === 0 || playbackQueue[0].id !== prevTrack.id) {
            playbackQueue.unshift(prevTrack);
        }
        currentIndex = 0;
        playQueue(0);
    } else {
        audio.currentTime = 0;
    }
    if (queueOpen) renderQueue();
}

function formatDuration(sec) { 
    if (sec === Infinity || isNaN(sec) || !sec) return "0:00"; 
    let m = Math.floor(sec / 60), s = Math.floor(sec % 60); 
    return `${m}:${s < 10 ? '0' : ''}${s}`; 
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const floatingNav = document.getElementById('sidebar-nav-floating');
    sidebar.classList.toggle('collapsed');
    
    // NEW: Update breadcrumbs immediately upon toggle
    updateBreadcrumbs();

    if (sidebar.classList.contains('collapsed')) {
        if (!lyricsOpen && floatingNav) floatingNav.style.display = 'flex';
    } else {
        if(floatingNav) floatingNav.style.display = 'none';
    }
}

async function generateSmartCollage(imageUrls) {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 600, 600);

    const loadImage = (url) => new Promise((resolve) => {
        const img = new Image(); img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

    const images = (await Promise.all(imageUrls.map(url => loadImage(url)))).filter(img => img !== null);
    const count = images.length;

    if (count === 1) { ctx.drawImage(images[0], 0, 0, 600, 600); }
    else if (count === 2) { ctx.drawImage(images[0], 0, 0, 300, 600); ctx.drawImage(images[1], 300, 0, 300, 600); }
    else if (count === 3) { ctx.drawImage(images[0], 0, 0, 300, 600); ctx.drawImage(images[1], 300, 0, 300, 300); ctx.drawImage(images[2], 300, 300, 300, 300); }
    else if (count >= 4) { ctx.drawImage(images[0], 0, 0, 300, 300); ctx.drawImage(images[1], 300, 0, 300, 300); ctx.drawImage(images[2], 0, 300, 300, 300); ctx.drawImage(images[3], 300, 300, 300, 300); }
    return canvas.toDataURL('image/jpeg', 0.8);
}

ipcRenderer.on('media-play-pause', togglePlay);
ipcRenderer.on('media-next', playNext);
ipcRenderer.on('media-prev', playPrev);