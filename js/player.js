// ============================================================
//  player.js — Audio Engine & Playback Controls
// ============================================================

// ── Play From a Track List ────────────────────────────────────
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

// ── Core playQueue ────────────────────────────────────────────
function playQueue(index) {
    clearTimeout(recentlyPlayedTimeout);

    currentIndex = index;
    currentlyPlayingTrack = playbackQueue[index];
    hasScrobbled = false;

    if (queueOpen) renderQueue();

    const track = currentlyPlayingTrack;

    // ── Star button ───────────────────────────────────────────
    const starBtn = document.getElementById('starBtn');
    if (starBtn) {
        starBtn.style.display = 'block';
        starBtn.innerText = track.starred ? '❤️' : '🤍';
        starBtn.onclick = toggleStar;
    }

    // ── Player bar text ───────────────────────────────────────
    const mt = document.getElementById('mini-title');
    mt.innerHTML = `<span class="scroll-inner">${track.title}</span>`;
    applyScroll(mt);

    const miniArtistEl = document.getElementById('mini-artist');
    miniArtistEl.innerHTML = `<span class="scroll-inner">${track.artist}</span>`;
    miniArtistEl.onclick = () => { searchArtist(track.artist); };
    applyScroll(miniArtistEl);

    const miniAlbumEl = document.getElementById('mini-album');
    const safeAlbumName = track.album ? track.album : 'Unknown Album';
    miniAlbumEl.innerHTML = `<span class="scroll-inner">${safeAlbumName}</span>`;
    miniAlbumEl.onclick = () => { if (track.albumId) loadAlbumTracks(track.albumId); };
    applyScroll(miniAlbumEl);

    // ── Album art + ColorThief theming ───────────────────────
    const miniArt = document.getElementById('mini-art');
    miniArt.style.opacity = '0';
    miniArt.onload = function () {
        this.style.opacity = '1';
        try {
            const color = colorThief.getColor(this);
            const [r, g, b] = color;

            const gradient = `radial-gradient(circle at 20% 60%, rgba(${r},${g},${b},0.55) 0%, #050505 85%)`;
            document.body.style.background = gradient;
            document.documentElement.style.setProperty('--nav-bar-bg', `#050505`);

            document.documentElement.style.setProperty('--accent', `rgb(${r},${g},${b})`);
            document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b}, 0.4)`);

            document.getElementById('sidebar').style.background =
                `linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(${r},${g},${b}, 0.2))`;

            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            window.currentIdealText = (yiq > 150) ? 'black' : 'white';

            document.querySelectorAll('.dynamic-accent-bg').forEach(btn => {
                btn.style.fontWeight = 'bold';
                if (btn.style.background.includes('var(--accent)') || btn.classList.contains('active')) {
                    btn.style.color = window.currentIdealText;
                    btn.style.textShadow = (window.currentIdealText === 'white') ? '0 1px 3px rgba(0,0,0,0.6)' : 'none';
                } else {
                    btn.style.color = 'white';
                    btn.style.textShadow = 'none';
                }
            });
        } catch (e) {
            console.error('ColorThief Error:', e);
        }
    };

    const uniqueAlbums = [...new Set(playbackQueue.map(t => t.albumId))];
    if (uniqueAlbums.length > 1 || track.coverArt) {
        miniArt.src = `${config.url}/rest/getCoverArt?id=${track.coverArt}&${getAuth()}`;
    } else {
        miniArt.src = playlistPlaceholder;
    }
    miniArt.style.display = 'block';

    // ── Stream URL ────────────────────────────────────────────
    let streamUrl = `${config.url}/rest/stream?id=${track.id}&${getAuth()}`;
    if (maxBitrate !== '0') streamUrl += `&maxBitRate=${maxBitrate}`;
    audio.src = streamUrl;
    audio.play();

    document.getElementById('playPauseBtn').innerText = '⏸';
    document.getElementById('total-time').innerText = formatDuration(track.duration);

    // ── Desktop notification ──────────────────────────────────
    if (notificationsEnabled) {
        ipcRenderer.send('notify', {
            title: track.title,
            body: track.artist,
            iconDataUrl: `${config.url}/rest/getCoverArt?id=${track.coverArt}&${getAuth()}`
        });
    }

    // ── Recently Played (30 s rule) ───────────────────────────
    recentlyPlayedTimeout = setTimeout(() => {
        let recentStr = localStorage.getItem('recently_played');
        let recent = recentStr ? JSON.parse(recentStr) : [];

        recent = recent.filter(t => t.id !== track.id);
        recent.unshift(track);
        if (recent.length > 50) recent.pop();

        localStorage.setItem('recently_played', JSON.stringify(recent));
        loadPlaylists();

        const viewTitle = document.getElementById('view-album-title');
        if (viewTitle && viewTitle.innerText.toLowerCase().trim().includes('recently played')) {
            loadRecentlyPlayed();
        }
    }, 30000);

    sendRPCUpdate();
    if (lyricsOpen) fetchLyrics();
}

// ── Scrobble ──────────────────────────────────────────────────
async function scrobbleTrack() {
    if (!currentlyPlayingTrack) return;
    try {
        await fetch(`${config.url}/rest/scrobble?id=${currentlyPlayingTrack.id}&submission=true&${getAuth()}`);
        showToast('🎵 Scrobbled To Server');
    } catch (e) { console.error('Scrobble failed', e); }
}

// ── Stop & Reset UI ───────────────────────────────────────────
function stopPlayerAndResetUI() {
    audio.pause(); audio.src = '';
    currentlyPlayingTrack = null;
    document.getElementById('mini-title').innerText = 'Tritone';
    document.getElementById('mini-artist').innerHTML = '<a href="https://github.com/Kyle8973/Tritone" target="_blank">By Kyle8973</a>';
    document.getElementById('mini-album').innerText = '';
    document.getElementById('current-time').innerText = '0:00';
    document.getElementById('total-time').innerText = '0:00';
    document.getElementById('progress-bar').value = 0;
    document.getElementById('starBtn').style.display = 'none';
    document.getElementById('playPauseBtn').innerText = '⏸';
    const miniArt = document.getElementById('mini-art');
    miniArt.onload = null;
    miniArt.src = 'assets/images/logo.svg';
}

// ── Audio Events ──────────────────────────────────────────────
audio.onended = () => {
    if (isRepeat) {
        playQueue(currentIndex);
    } else {
        if (currentlyPlayingTrack) {
            if (!playbackHistory.length ||
                playbackHistory[playbackHistory.length - 1].id !== currentlyPlayingTrack.id) {
                playbackHistory.push(currentlyPlayingTrack);
            }
            currentlyPlayingTrack = null;
        }
        playbackQueue.splice(currentIndex, 1);
        if (playbackQueue.length > 0) { playQueue(currentIndex % playbackQueue.length); }
        else { stopPlayerAndResetUI(); }
    }
    if (queueOpen) renderQueue();
};

audio.onloadedmetadata = () => {
    const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration))
        ? audio.duration
        : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
    if (dur > 0) document.getElementById('total-time').innerText = formatDuration(Math.floor(dur));
};

audio.ontimeupdate = () => {
    const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration))
        ? audio.duration
        : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);

    if (dur > 0) {
        document.getElementById('progress-bar').value = (audio.currentTime / dur) * 100;
        document.getElementById('current-time').innerText = formatDuration(Math.floor(audio.currentTime));
        document.getElementById('total-time').innerText = formatDuration(Math.floor(dur));
        handleLyricsSync(audio.currentTime);

        if (!hasScrobbled && audio.currentTime > (dur / 2)) {
            hasScrobbled = true;
            scrobbleTrack();
        }
    }
};

// ── Progress & Volume Controls ────────────────────────────────
document.getElementById('progress-bar').oninput = function () {
    const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration))
        ? audio.duration
        : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
    audio.currentTime = (this.value / 100) * dur;
    sendRPCUpdate();
};

document.getElementById('volume-slider').oninput = function () {
    audio.volume = this.value;
    localStorage.setItem('tritone_vol', this.value);
};

// ── Playback Controls ─────────────────────────────────────────
function togglePlay() {
    if (!audio.src || audio.src === '' || audio.src.endsWith('index.html')) return;
    if (audio.paused) {
        audio.play();
        document.getElementById('playPauseBtn').innerText = '⏸';
    } else {
        audio.pause();
        document.getElementById('playPauseBtn').innerText = '▶';
    }
    sendRPCUpdate();
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const barBtn = document.getElementById('shuffleBarBtn');
    const bigBtn = document.getElementById('shuffleBtn');

    if (isShuffle) {
        if (barBtn) barBtn.classList.add('active');
        if (bigBtn) bigBtn.innerText = 'Shuffle: On';

        isRepeat = false;
        const rpt = document.getElementById('repeatBtn');
        if (rpt) rpt.classList.remove('active');

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
        if (barBtn) barBtn.classList.remove('active');
        if (bigBtn) bigBtn.innerText = 'Shuffle';

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
    if (isRepeat) {
        repeatBtn.classList.add('active');
        if (isShuffle) toggleShuffle(); // Repeat and Shuffle are mutually exclusive
    } else {
        repeatBtn.classList.remove('active');
    }
}

function playNext() {
    if (playbackQueue.length > 0) {
        if (currentlyPlayingTrack) playbackHistory.push(currentlyPlayingTrack);

        if (currentIndex < playbackQueue.length - 1) {
            currentIndex++;
            playQueue(currentIndex);
        } else {
            stopPlayerAndResetUI();
        }
    }
    if (queueOpen) renderQueue();
}

function playPrev() {
    // Standard restart-rule: if more than 3 s in, restart the current track
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        audio.play();
        return;
    }

    if (currentIndex > 0) {
        currentIndex--;
        playQueue(currentIndex);
    } else {
        audio.currentTime = 0;
        audio.play();
    }
    if (queueOpen) renderQueue();
}

// ── Seek ──────────────────────────────────────────────────────
function seekAudio(seconds) {
    if (!audio.paused || audio.currentTime > 0) {
        const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration))
            ? audio.duration
            : (currentlyPlayingTrack ? currentlyPlayingTrack.duration : 0);
        audio.currentTime = Math.max(0, Math.min(dur, audio.currentTime + seconds));
        sendRPCUpdate();
    }
}

// ── Random Mix ───────────────────────────────────────────────
async function playRandomMix() {
    showToast('🎲 Generating Mix...');
    try {
        const res = await fetch(`${config.url}/rest/getRandomSongs?size=50&${getAuth()}`);
        const data = await res.json();
        playbackQueue = data['subsonic-response'].randomSongs.song;
        originalQueue = [...playbackQueue];
        currentIndex = 0;
        playQueue(0);
    } catch (e) { showToast('❌ Mix Failed To Generate'); }
}

// ── Star Toggle ───────────────────────────────────────────────
async function toggleStar() {
    if (!currentlyPlayingTrack) return;
    const isStarred = currentlyPlayingTrack.starred !== undefined;
    const endpoint = isStarred ? 'unstar' : 'star';
    const starBtn = document.getElementById('starBtn');

    try {
        await fetch(`${config.url}/rest/${endpoint}?id=${currentlyPlayingTrack.id}&${getAuth()}`);

        if (isStarred) {
            delete currentlyPlayingTrack.starred;
            starBtn.innerText = '🤍';
            showToast('🗑️ Removed From Favorites');
        } else {
            currentlyPlayingTrack.starred = new Date().toISOString();
            starBtn.innerText = '❤️';
            showToast('✅ Added To Favorites');
        }

        loadPlaylists();

        const viewTitle = document.getElementById('view-album-title');
        const titleText = viewTitle ? viewTitle.innerText.toLowerCase().trim() : '';
        if (titleText.includes('favour') || titleText.includes('star')) {
            const favSidebarItem = Array.from(document.querySelectorAll('.sidebar-item, .playlist-item'))
                .find(el => el.innerText.toLowerCase().includes('favour'));
            if (favSidebarItem) favSidebarItem.click();
        }
    } catch (e) { console.error('Star toggle failed:', e); }
}

// ── RPC ───────────────────────────────────────────────────────
function sendRPCUpdate() {
    if (!rpcEnabled) { ipcRenderer.send('update-rpc', { clear: true }); return; }
    if (!currentlyPlayingTrack) return;

    clearTimeout(rpcUpdateTimeout);
    rpcUpdateTimeout = setTimeout(() => {
        const dur = (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration))
            ? audio.duration
            : (currentlyPlayingTrack.duration || 0);

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

// ── Media Key IPC ─────────────────────────────────────────────
ipcRenderer.on('media-play-pause', togglePlay);
ipcRenderer.on('media-next', playNext);
ipcRenderer.on('media-prev', playPrev);

ipcRenderer.on('rpc-connection-failed', (event, data) => {
    showToast(`❌ ${data.message}`);
    rpcEnabled = false;
    localStorage.setItem('tritone_rpc_enabled', 'false');
    const rpcBtn = document.getElementById('rpc-toggle-btn');
    if (rpcBtn) updateButtonStyle(rpcBtn, false, 'RPC');
});