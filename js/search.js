// ============================================================
//  search.js — Search Execution & Results Rendering
// ============================================================

// ── Input Handlers ────────────────────────────────────────────
function handleGlobalSearch(e) {
    const query = e.target.value.trim();

    // Keep both search bars in sync
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

// ── Execute Search ────────────────────────────────────────────
async function executeSearch(query) {
    try {
        // Close lyrics overlay if open
        const lyricsOverlay = document.getElementById('lyrics-overlay');
        if (lyricsOverlay) {
            lyricsOverlay.classList.remove('active');
            lyricsOverlay.style.display = 'none';
        }

        const res = await fetch(
            `${config.url}/rest/search3?query=${encodeURIComponent(query)}&artistCount=20&albumCount=50&songCount=200&${getAuth()}&f=json`
        );
        const data = await res.json();
        const results = data['subsonic-response'].searchResult3 || {};

        hideAllViews();
        document.getElementById('search-view').style.display = 'block';
        pushHistory({ view: 'search', param: query, title: 'Search Results' }, false);

        // ── 1. Playlist filtering ─────────────────────────────
        const playlistList = document.getElementById('playlist-list');
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
        const playlists = Array.from(playlistList.querySelectorAll('.playlist-item'));
        const matchingPlaylists = playlists.filter(pl => pl.innerText.toLowerCase().includes(query.toLowerCase()));

        if (matchingPlaylists.length > 0) {
            document.getElementById('search-playlists-title').style.display = 'block';
            matchingPlaylists.forEach(pl => {
                const clone = pl.cloneNode(true);
                clone.onclick = pl.onclick;
                playlistResultsGrid.appendChild(clone);
            });
        } else {
            const plTitle = document.getElementById('search-playlists-title');
            if (plTitle) plTitle.style.display = 'none';
        }

        // ── 2. Top Artist Result ──────────────────────────────
        const topResultContainer = document.getElementById('search-top-result');
        if (results.artist && results.artist.length > 0) {
            const topArtist = results.artist[0];
            const localArtUrl = `${config.url}/rest/getCoverArt?id=${topArtist.id}&${getAuth()}`;
            const safeName = topArtist.name.replace(/'/g, "\\'");

            topResultContainer.innerHTML = `
                <div class="top-result-card" onclick="searchArtist('${safeName}')">
                    <img id="search-top-artist-img" src="${localArtUrl}"
                         style="width:100px;height:100px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,0.05);">
                    <div>
                        <h2 style="margin:0;">${topArtist.name}</h2>
                        <p style="opacity:0.6;margin:5px 0 0 0;">Artist</p>
                    </div>
                </div>`;

            const topArtistImg = document.getElementById('search-top-artist-img');
            topArtistImg.onerror = () => { topArtistImg.src = artistPlaceholder; };

            // Try to upgrade the image from TheAudioDB cache
            const cacheKey = `bio_${topArtist.name.toLowerCase()}`;
            const cachedStr = localStorage.getItem(cacheKey);
            if (cachedStr) {
                const cachedData = JSON.parse(cachedStr);
                if (cachedData.thumb) document.getElementById('search-top-artist-img').src = cachedData.thumb;
            } else {
                fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(topArtist.name)}`)
                    .then(r => r.json())
                    .then(adbData => {
                        if (adbData.artists?.[0]?.strArtistThumb) {
                            const thumb = adbData.artists[0].strArtistThumb;
                            const img = document.getElementById('search-top-artist-img');
                            if (img) img.src = thumb;
                            const existing = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                            existing.thumb = thumb;
                            localStorage.setItem(cacheKey, JSON.stringify(existing));
                        }
                    }).catch(() => { });
            }
        } else {
            topResultContainer.innerHTML = '';
        }

        // ── 3. Songs List (with expand/collapse) ─────────────
        const songsList = document.getElementById('search-songs-list');
        const songsTitle = document.getElementById('search-songs-title');
        songsList.innerHTML = '';

        if (results.song && results.song.length > 0) {
            songsTitle.style.display = 'block';
            songsTitle.innerText = `Songs (${results.song.length})`;

            results.song.forEach((track, i) => {
                const div = document.createElement('div');
                div.className = 'track-row track-row-artist';
                if (i >= 5) { div.style.display = 'none'; div.classList.add('extra-song'); }

                div.innerHTML = `
                    <span>${i + 1}</span>
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span>
                    <span class="artist-link" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</span>
                    <span>${formatDuration(track.duration)}</span>
                    <span class="download-btn" title="Download">⬇</span>
                    <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;

                div.onclick = () => playFromList(results.song, i);
                div.querySelector('.artist-link').onclick = (e) => { e.stopPropagation(); searchArtist(track.artist); };
                div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); downloadTrack(track.id, track.title, track.artist, track.suffix); };
                songsList.appendChild(div);
            });

            if (results.song.length > 5) {
                const toggleBtn = document.createElement('div');
                toggleBtn.id = 'search-songs-toggle';
                toggleBtn.style = 'padding:12px;text-align:center;color:var(--accent);cursor:pointer;font-weight:bold;font-size:0.9em;opacity:0.8;border:1px solid rgba(168,85,247,0.2);border-radius:8px;margin-top:10px;';
                toggleBtn.innerText = `Show ${results.song.length - 5} More Songs...`;

                let isExpanded = false;
                toggleBtn.onclick = () => {
                    isExpanded = !isExpanded;
                    document.querySelectorAll('.extra-song').forEach(el => {
                        el.style.display = isExpanded ? 'grid' : 'none';
                    });
                    toggleBtn.innerText = isExpanded
                        ? 'Show Less'
                        : `Show ${results.song.length - 5} More Songs...`;
                    if (!isExpanded) songsTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                songsList.appendChild(toggleBtn);
            }
        } else {
            songsTitle.style.display = 'none';
        }

        // ── 4. Albums Grid (with expand/collapse) ────────────
        const albumsGrid = document.getElementById('search-albums-grid');
        const albumsTitle = document.getElementById('search-albums-title');
        albumsGrid.innerHTML = '';

        if (results.album && results.album.length > 0) {
            albumsTitle.style.display = 'block';
            albumsTitle.innerText = `Albums (${results.album.length})`;

            results.album.forEach((album, i) => {
                const resParam = (imgResolution !== '0') ? `&size=${imgResolution}` : '';
                const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}${resParam}&${getAuth()}`;
                const card = document.createElement('div');
                card.className = 'grid-album-card';
                if (i >= 5) { card.style.display = 'none'; card.classList.add('extra-album'); }
                card.dataset.id = album.id;
                card.innerHTML = `
                    <img class="grid-album-art" src="${artUrl}" loading="lazy">
                    <div style="font-weight:bold;font-size:14px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${album.name}</div>
                    <div style="font-size:12px;opacity:0.6;">${album.artist}</div>`;
                card.onclick = () => loadAlbumTracks(album.id);
                albumsGrid.appendChild(card);
            });

            if (results.album.length > 5) {
                const toggleBtn = document.createElement('div');
                toggleBtn.id = 'search-albums-toggle';
                toggleBtn.style = '';
                toggleBtn.innerText = `Show ${results.album.length - 5} More Albums...`;

                let isExpanded = false;
                toggleBtn.onclick = () => {
                    isExpanded = !isExpanded;
                    albumsGrid.querySelectorAll('.extra-album').forEach(el => {
                        el.style.display = isExpanded ? 'block' : 'none';
                    });
                    toggleBtn.innerText = isExpanded
                        ? 'Show Less'
                        : `Show ${results.album.length - 5} More Albums...`;
                    if (!isExpanded) albumsTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                albumsGrid.appendChild(toggleBtn);
            }
        } else {
            albumsTitle.style.display = 'none';
        }

    } catch (err) {
        console.error('Search failed', err);
    }
}

// ── Attach Event Listeners (called from app.js) ───────────────
function initSearchListeners() {
    document.getElementById('library-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGlobalSearch(e);
    });
    document.getElementById('grid-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGlobalSearch(e);
    });
}