// ============================================================
//  artist.js — Artist View, Biographies & Similar Artists
// ============================================================

async function searchArtist(artistName) {
    if (lyricsOpen) {
        lyricsOpen = false;
        document.getElementById('lyrics-view').style.display = 'none';
        document.getElementById('pinnedCloseBtn').style.display = 'none';
    }

    hideAllViews();
    const artistView = document.getElementById('artist-view');
    artistView.style.display = 'block';
    artistView.scrollTo(0, 0);
    pushHistory({ view: 'artist', param: artistName, title: artistName }, false);

    document.getElementById('artist-name-title').innerText = artistName;

    const albumGrid = document.getElementById('artist-albums-grid');
    const bioContainer = document.getElementById('artist-bio-container');
    const bioText = document.getElementById('artist-bio-text');
    const topTracksContainer = document.getElementById('artist-top-tracks-container');
    const topTracksList = document.getElementById('artist-top-tracks-list');
    const similarContainer = document.getElementById('artist-similar-container');
    const toggleBtn = document.getElementById('bio-toggle-btn');

    setFadeImage(document.getElementById('artist-banner'), artistPlaceholder);
    albumGrid.innerHTML = '<p style="opacity:0.5;">Gathering Discography...</p>';

    if (topTracksList) topTracksList.innerHTML = '';
    if (bioContainer) bioContainer.style.display = 'none';
    if (topTracksContainer) topTracksContainer.style.display = 'none';
    if (similarContainer) similarContainer.style.display = 'none';
    if (bioText) bioText.classList.remove('expanded');
    if (toggleBtn) toggleBtn.style.display = 'none';

    try {
        // ── 1. Fetch library data ──────────────────────────────
        const searchRes = await fetch(
            `${config.url}/rest/search3?query=${encodeURIComponent(artistName)}&albumCount=100&songCount=20&${getAuth()}&f=json`
        );
        const searchData = await searchRes.json();
        const results = searchData['subsonic-response']?.searchResult3 || {};

        const albums = (results.album || []).filter(a =>
            a.artist.toLowerCase().includes(artistName.toLowerCase()) ||
            artistName.toLowerCase().includes(a.artist.toLowerCase())
        );

        const topTracks = (results.song || []).filter(s =>
            s.artist.toLowerCase().includes(artistName.toLowerCase()) ||
            artistName.toLowerCase().includes(s.artist.toLowerCase())
        );

        albumGrid.innerHTML = '';

        if (albums.length > 0) {
            albums.forEach((album, i) => {
                const resParam = (imgResolution !== '0') ? `&size=${imgResolution}` : '';
                const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}${resParam}&${getAuth()}`;
                const card = document.createElement('div');
                card.className = 'grid-album-card';
                if (i >= 5) { card.style.display = 'none'; card.classList.add('extra-artist-album'); }
                card.innerHTML = `<img class="grid-album-art" src="${artUrl}"><div><b>${album.name}</b></div>`;
                card.onclick = () => { artistView.style.display = 'none'; loadAlbumTracks(album.id); };
                albumGrid.appendChild(card);
            });

            if (albums.length > 5) {
                const toggleBtn = document.createElement('div');
                toggleBtn.id = 'artist-albums-toggle';
                let expanded = false;
                toggleBtn.innerText = `Show ${albums.length - 5} More Albums...`;
                toggleBtn.onclick = () => {
                    expanded = !expanded;
                    albumGrid.querySelectorAll('.extra-artist-album').forEach(el => {
                        el.style.display = expanded ? 'block' : 'none';
                    });
                    toggleBtn.innerText = expanded ? 'Show Less' : `Show ${albums.length - 5} More Albums...`;
                };
                albumGrid.appendChild(toggleBtn);
            }

            document.getElementById('artist-stats').innerText =
                `${albums.length} Album${albums.length !== 1 ? 's' : ''} in Library`;

            setFadeImage(
                document.getElementById('artist-banner'),
                `${config.url}/rest/getCoverArt?id=${albums[0].coverArt}&${getAuth()}`
            );

            // Similar artists
            try {
                const simRes = await fetch(`${config.url}/rest/getSimilarSongs2?id=${albums[0].id}&count=50&${getAuth()}&f=json`);
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
                    uniqueArtists.forEach((sim, i) => {
                        const card = document.createElement('div');
                        card.className = 'grid-album-card';
                        if (i >= 5) { card.style.display = 'none'; card.classList.add('extra-similar-artist'); }
                        card.innerHTML = `
                            <img class="grid-album-art" src="${config.url}/rest/getCoverArt?id=${sim.artId}&${getAuth()}"
                                 onerror="this.style.opacity='0'">
                            <div><b>${sim.name}</b></div>`;
                        card.onclick = () => { artistView.scrollTo(0, 0); searchArtist(sim.name); };
                        simGrid.appendChild(card);
                    });

                    if (uniqueArtists.length > 5) {
                        const simToggle = document.createElement('div');
                        simToggle.id = 'artist-similar-toggle';
                        let simExpanded = false;
                        simToggle.innerText = `Show ${uniqueArtists.length - 5} More Artists...`;
                        simToggle.onclick = () => {
                            simExpanded = !simExpanded;
                            simGrid.querySelectorAll('.extra-similar-artist').forEach(el => {
                                el.style.display = simExpanded ? 'block' : 'none';
                            });
                            simToggle.innerText = simExpanded ? 'Show Less' : `Show ${uniqueArtists.length - 5} More Artists...`;
                        };
                        simGrid.appendChild(simToggle);
                    }
                }
            } catch (e) { console.warn('Similar Artists failed', e); }

        } else {
            albumGrid.innerHTML = '<p style="opacity:0.5;">No albums found in library.</p>';
        }

        // ── Top Tracks ─────────────────────────────────────────
        if (topTracks.length > 0 && topTracksContainer) {
            topTracksContainer.style.display = 'block';
            topTracks.slice(0, 10).forEach((track, i) => {
                const div = document.createElement('div');
                div.className = 'track-row';
                div.innerHTML = `
                    <span>${i + 1}</span>
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</span>
                    <span>${formatDuration(track.duration)}</span>
                    <span class="download-btn" title="Download">⬇</span>
                    <span class="add-to-pl-btn" onclick="event.stopPropagation();openPlaylistModal('${track.id}')" title="Add to Playlist">➕</span>`;
                div.onclick = () => playFromList(topTracks, i);
                div.querySelector('.download-btn').onclick = (e) => {
                    e.stopPropagation();
                    downloadTrack(track.id, track.title, track.artist, track.suffix);
                };
                topTracksList.appendChild(div);
            });
        }

        // ── 2. Bio discovery: cache → TheAudioDB → Wikipedia ──
        const cacheKey = `bio_${artistName.toLowerCase()}`;
        const cachedStr = localStorage.getItem(cacheKey);
        let cachedData = null;
        try { cachedData = cachedStr ? JSON.parse(cachedStr) : null; } catch (e) { }

        if (cachedData && cachedData.text && cachedData.text.trim().length > 10) {
            bioText.innerText = cachedData.text;
            if (bioContainer) bioContainer.style.display = 'block';
            if (bioText.scrollHeight > 120 && toggleBtn) toggleBtn.style.display = 'block';
            if (cachedData.thumb) setFadeImage(document.getElementById('artist-banner'), cachedData.thumb);
        } else {
            const fetchADB = async (name) => {
                const r = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(name)}`);
                const d = await r.json();
                return d?.artists?.[0];
            };

            let artistData = await fetchADB(artistName);
            if (!artistData && artistName.toLowerCase().startsWith('the ')) {
                artistData = await fetchADB(artistName.substring(4));
            }

            let finalBio = artistData?.strBiographyEN || '';
            let finalThumb = artistData?.strArtistThumb || (cachedData ? cachedData.thumb : '');

            // Wikipedia fallback
            if (!finalBio || finalBio.trim().length < 10) {
                try {
                    const wikiRes = await fetch(
                        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`
                    );
                    if (wikiRes.ok) {
                        const wikiData = await wikiRes.json();
                        finalBio = wikiData.extract || '';
                        if (!finalThumb) finalThumb = wikiData.originalimage?.source || wikiData.thumbnail?.source || '';
                    }
                } catch (e) { console.warn('Wiki fallback failed', e); }
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
    } catch (e) { console.error('Artist Discovery failed', e); }
}

// ── Biography Read More / Less Toggle ────────────────────────
function toggleBio() {
    const bioText = document.getElementById('artist-bio-text');
    const btn = document.getElementById('bio-toggle-btn');
    if (!bioText || !btn) return;
    bioText.classList.toggle('expanded');
    btn.innerText = bioText.classList.contains('expanded') ? 'Read Less' : 'Read More';
}