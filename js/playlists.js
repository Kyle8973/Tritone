// ============================================================
//  playlists.js — Playlist Management & Track Views
// ============================================================

// ── Load Sidebar Playlists ────────────────────────────────────
async function loadPlaylists() {
    try {
        const res = await fetch(`${config.url}/rest/getPlaylists?${getAuth()}`);
        const data = await res.json();
        const playlists = data['subsonic-response'].playlists.playlist || [];
        const list = document.getElementById('playlist-list');
        if (!list) return;
        list.innerHTML = '';

        // ── Built-in smart playlists ──────────────────────────
        const recentItem = document.createElement('div');
        recentItem.className = 'playlist-item';
        recentItem.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        recentItem.innerHTML = `<div class="playlist-thumb">🕒</div><div><b>Recently Played</b><br><small>Your History</small></div>`;
        recentItem.onclick = () => loadRecentlyPlayed();
        list.appendChild(recentItem);

        const favItem = document.createElement('div');
        favItem.className = 'playlist-item';
        favItem.style.border = '1px solid rgba(29, 185, 84, 0.3)';
        favItem.innerHTML = `<div class="playlist-thumb"><img src="assets/images/heart.png" style="width:32px;height:32px;object-fit:contain;"></div><div><b>Favourite Tracks</b><br><small>Your Favorites</small></div>`;
        favItem.onclick = () => loadStarredTracks();
        list.appendChild(favItem);

        const mixItem = document.createElement('div');
        mixItem.className = 'playlist-item';
        mixItem.innerHTML = `<div class="playlist-thumb">🎲</div><div><b>Quick Mix</b><br><small>Random 50 Tracks</small></div>`;
        mixItem.onclick = () => playRandomMix();
        list.appendChild(mixItem);

        // ── Server playlists ──────────────────────────────────
        playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.innerHTML = `
                <div class="playlist-thumb" onclick="event.stopPropagation(); loadPlaylistTracks('${pl.id}', '${pl.name}')">🎵</div>
                <div style="flex:1; overflow:hidden;" onclick="event.stopPropagation(); loadPlaylistTracks('${pl.id}', '${pl.name}')">
                    <b>${pl.name}</b><br><small>${pl.songCount} tracks</small>
                </div>
                <button class="queue-del-btn" style="padding:6px 10px; margin-left:5px;"
                    onclick="event.stopPropagation(); deletePlaylist('${pl.id}', '${pl.name}')" title="Delete Playlist">✕</button>`;
            list.appendChild(item);
        });

    } catch (err) { console.error('Playlists load error:', err); }
}

// ── Create Playlist ───────────────────────────────────────────
window.createNewPlaylist = function () {
    document.getElementById('new-playlist-name').value = '';
    document.getElementById('create-playlist-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('new-playlist-name').focus(), 100);
};

window.closeCreatePlaylistModal = function () {
    document.getElementById('create-playlist-modal').style.display = 'none';
};

window.submitNewPlaylist = async function () {
    const name = document.getElementById('new-playlist-name').value.trim();
    if (name) {
        try {
            await fetch(`${config.url}/rest/createPlaylist?name=${encodeURIComponent(name)}&${getAuth()}`);
            showToast('📃 Playlist Created!');
            closeCreatePlaylistModal();
            loadPlaylists();
        } catch (e) { showToast('❌ Failed To Create Playlist'); }
    }
};

// ── Delete Playlist ───────────────────────────────────────────
window.deletePlaylist = async function (id, name) {
    if (confirm(`Are You Sure You Want To Permanently Delete The Playlist "${name}"?`)) {
        try {
            await fetch(`${config.url}/rest/deletePlaylist?id=${id}&${getAuth()}`);
            showToast(`🗑️ Deleted ${name}`);
            loadPlaylists();
            showGridView();
        } catch (e) { console.error(e); showToast('❌ Failed To Delete Playlist'); }
    }
};

// ── Add To Playlist Modal ─────────────────────────────────────
window.openPlaylistModal = function (trackId) {
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
                btn.style.cssText = 'padding:10px; background:rgba(255,255,255,0.05); margin-bottom:5px; border-radius:5px; cursor:pointer;';
                btn.innerText = pl.name;
                btn.onclick = () => addToPlaylist(pl.id, trackToAddToPlaylist);
                modalList.appendChild(btn);
            });
        })
        .catch(() => { modalList.innerHTML = '<p>Error loading playlists</p>'; });
};

window.closePlaylistModal = function () {
    document.getElementById('playlist-modal').style.display = 'none';
    trackToAddToPlaylist = null;
};

async function addToPlaylist(playlistId, songId) {
    try {
        const checkRes = await fetch(`${config.url}/rest/getPlaylist?id=${playlistId}&${getAuth()}`);
        const checkData = await checkRes.json();
        const entries = checkData['subsonic-response'].playlist.entry || [];

        if (entries.some(track => track.id === songId)) {
            showToast('❌ Track Is Already In This Playlist');
            closePlaylistModal();
            return;
        }

        await fetch(`${config.url}/rest/updatePlaylist?playlistId=${playlistId}&songIdToAdd=${songId}&${getAuth()}`);
        showToast('✅ Added To Playlist!');
        closePlaylistModal();
        loadPlaylists();
    } catch (e) { showToast('❌ Failed To Add To Playlist'); }
}

// ── Remove From Playlist ──────────────────────────────────────
window.removeFromPlaylist = async function (playlistId, songIndex, playlistName) {
    if (confirm('Are You Sure You Want To Remove This Track From The Playlist?')) {
        try {
            await fetch(`${config.url}/rest/updatePlaylist?playlistId=${playlistId}&songIndexToRemove=${songIndex}&${getAuth()}`);
            showToast('🗑️ Removed From Playlist');
            loadPlaylistTracks(playlistId, playlistName);
            loadPlaylists();
        } catch (e) { showToast('❌ Failed To Remove From Playlist'); }
    }
};

// ── Load Playlist Tracks ──────────────────────────────────────
async function loadPlaylistTracks(playlistId, playlistName) {
    if (lyricsOpen) {
        lyricsOpen = false;
        document.getElementById('lyrics-view').style.display = 'none';
        document.getElementById('pinnedCloseBtn').style.display = 'none';
    }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';
    pushHistory({ view: 'playlist', param: playlistId, title: playlistName }, false);

    const res = await fetch(`${config.url}/rest/getPlaylist?id=${playlistId}&${getAuth()}`);
    const data = await res.json();
    viewQueue = data['subsonic-response'].playlist.entry || [];

    document.getElementById('view-album-title').innerText = playlistName;
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = 'Playlist';
    artistSubtitle.style.cursor = 'default';
    artistSubtitle.onclick = null;

    const container = document.getElementById('track-items');
    container.innerHTML = '';

    if (viewQueue.length === 0) {
        container.innerHTML = `<div class="playlist-empty-state"><div style="font-size:64px;margin-bottom:20px;">📁</div><h3>This Playlist Is Empty</h3><p>Add Some Tracks To Get Started</p></div>`;
        setFadeImage(document.getElementById('view-album-art'), playlistPlaceholder);
        return;
    }

    document.getElementById('view-album-art').style.display = 'block';
    const uniqueCovers = [...new Set(viewQueue.map(t => t.coverArt))].slice(0, 4);
    const coverUrls = uniqueCovers.map(id => `${config.url}/rest/getCoverArt?id=${id}&${getAuth()}`);
    const collageUrl = await generateSmartCollage(coverUrls);
    setFadeImage(document.getElementById('view-album-art'), collageUrl);

    viewQueue.forEach((track, i) => {
        const div = document.createElement('div');
        div.className = 'track-row track-row-artist';
        div.innerHTML = `
            <span>${i + 1}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${track.title}</span>
            <span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span>
            <span>${formatDuration(track.duration)}</span>
            <span class="track-actions" style="display:flex;align-items:center;gap:12px;margin-left:15px;">
                <span class="download-btn" title="Download">⬇</span>
                <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>
                <span class="remove-btn" onclick="event.stopPropagation();removeFromPlaylist('${playlistId}',${i},'${playlistName}')" title="Remove Track" style="color:#ff5f5f;cursor:pointer;font-weight:bold;padding:0 5px;">✕</span>
            </span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

// ── Load Album Tracks ─────────────────────────────────────────
async function loadAlbumTracks(albumId) {
    if (lyricsOpen) {
        lyricsOpen = false;
        document.getElementById('lyrics-view').style.display = 'none';
        document.getElementById('pinnedCloseBtn').style.display = 'none';
    }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';
    pushHistory({ view: 'album', param: albumId }, false);

    const res = await fetch(`${config.url}/rest/getAlbum?id=${albumId}&${getAuth()}`);
    const data = await res.json();
    const albumData = data['subsonic-response'].album;

    viewQueue = (albumData.song || []).map(track => {
        track.album = track.album && track.album !== '' ? track.album : albumData.name;
        track.albumId = track.albumId || albumData.id;
        return track;
    });

    document.getElementById('view-album-title').innerText = albumData.name;
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = albumData.artist;
    artistSubtitle.style.cursor = 'pointer';
    artistSubtitle.onclick = () => searchArtist(artistSubtitle.innerText);

    const shuffleAlbumBtn = document.getElementById('shuffleBtn');
    if (shuffleAlbumBtn) {
        shuffleAlbumBtn.innerText = isShuffle ? 'Shuffle: On' : 'Shuffle';
        shuffleAlbumBtn.onclick = () => { toggleShuffle(); };
    }

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) {
        dlAlbumBtn.style.display = 'inline-block';
        dlAlbumBtn.onclick = () => {
            const cleanArtist = sanitizeFilename(albumData.artist || 'Unknown');
            const cleanAlbum = sanitizeFilename(albumData.name || 'Album');
            const url = `${config.url}/rest/download?id=${albumId}&${getAuth()}`;
            ipcRenderer.send('download-track', { url, filename: `${cleanArtist} - ${cleanAlbum}.zip` });
            showToast(`📥 Downloading Album: ${albumData.name}...`);
        };
    }

    document.getElementById('view-album-art').style.display = 'block';
    setFadeImage(document.getElementById('view-album-art'), `${config.url}/rest/getCoverArt?id=${albumData.coverArt}&${getAuth()}`);

    const container = document.getElementById('track-items');
    container.innerHTML = '';

    viewQueue.forEach((track, i) => {
        const div = document.createElement('div');
        div.className = 'track-row';
        div.innerHTML = `
            <span>${i + 1}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span>
            <span>${formatDuration(track.duration)}</span>
            <span class="download-btn" title="Download">⬇</span>
            <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

// ── Starred Tracks ────────────────────────────────────────────
async function loadStarredTracks() {
    if (lyricsOpen) {
        lyricsOpen = false;
        document.getElementById('lyrics-view').style.display = 'none';
        document.getElementById('pinnedCloseBtn').style.display = 'none';
    }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';
    pushHistory({ view: 'starred', title: 'Favourites' }, true);

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) dlAlbumBtn.style.display = 'none';

    const res = await fetch(`${config.url}/rest/getStarred?${getAuth()}`);
    const data = await res.json();
    viewQueue = data['subsonic-response'].starred.song || [];

    document.getElementById('view-album-title').innerText = 'Favourite Tracks';
    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = 'Personal Collection';
    artistSubtitle.style.cursor = 'default';
    artistSubtitle.onclick = null;

    document.getElementById('view-album-art').style.display = 'block';
    setFadeImage(document.getElementById('view-album-art'), 'assets/images/heart.png');

    const container = document.getElementById('track-items');
    container.innerHTML = '';

    viewQueue.forEach((track, i) => {
        const div = document.createElement('div');
        div.className = 'track-row track-row-artist';
        div.innerHTML = `
            <span>${i + 1}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span>
            <span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span>
            <span>${formatDuration(track.duration)}</span>
            <span class="download-btn" title="Download">⬇</span>
            <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
}

// ── Recently Played ───────────────────────────────────────────
window.loadRecentlyPlayed = function () {
    if (lyricsOpen) {
        lyricsOpen = false;
        document.getElementById('lyrics-view').style.display = 'none';
        document.getElementById('pinnedCloseBtn').style.display = 'none';
    }
    hideAllViews();
    document.getElementById('album-view').style.display = 'block';

    const dlAlbumBtn = document.getElementById('downloadAlbumBtn');
    if (dlAlbumBtn) dlAlbumBtn.style.display = 'none';

    viewQueue = JSON.parse(localStorage.getItem('recently_played') || '[]');
    document.getElementById('view-album-title').innerText = 'Recently Played';

    const artistSubtitle = document.getElementById('view-album-artist');
    artistSubtitle.innerText = 'Listening History';
    artistSubtitle.style.cursor = 'default';
    artistSubtitle.onclick = null;
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
        div.innerHTML = `
            <span>${i + 1}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span>
            <span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span>
            <span>${formatDuration(track.duration)}</span>
            <span class="download-btn" title="Download">⬇</span>
            <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
        div.onclick = () => playFromList(viewQueue, i);
        div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
        div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
        div.oncontextmenu = () => { ipcRenderer.send('show-track-menu', track); };
        container.appendChild(div);
    });
};