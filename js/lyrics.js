// ============================================================
//  lyrics.js — Lyrics Fetching, LRC Parsing & Sync
// ============================================================

// ── Toggle Lyrics Overlay ─────────────────────────────────────
async function toggleLyrics() {
    lyricsOpen = !lyricsOpen;
    const lyricsLayer = document.getElementById('lyrics-view');
    const closeBtn = document.getElementById('pinnedCloseBtn');
    const floatingNav = document.getElementById('sidebar-nav-floating');

    if (lyricsOpen) {
        lyricsLayer.style.display = 'block';
        closeBtn.style.display = 'block';
        if (floatingNav) floatingNav.style.display = 'none';
        if (currentlyPlayingTrack) fetchLyrics();
    } else {
        lyricsLayer.style.display = 'none';
        closeBtn.style.display = 'none';
        if (document.getElementById('sidebar').classList.contains('collapsed')) {
            if (floatingNav) floatingNav.style.display = 'flex';
        }
    }
}

// ── Fetch Lyrics From LRCLIB ──────────────────────────────────
async function fetchLyrics() {
    if (!currentlyPlayingTrack) return;
    const track = currentlyPlayingTrack;
    const container = document.getElementById('lyrics-content');
    container.innerHTML = `<p style="opacity:0.5; font-size:24px;">Syncing lyrics...</p>`;
    currentSyncedLyrics = [];

    try {
        const webRes = await fetch(
            `https://lrclib.net/api/get?artist_name=${encodeURIComponent(track.artist)}&track_name=${encodeURIComponent(track.title)}`
        );
        const webData = await webRes.json();

        if (webData.syncedLyrics) {
            parseLRC(webData.syncedLyrics);
        } else {
            container.innerHTML = (webData.plainLyrics || 'No lyrics found.')
                .split('\n')
                .map(line => line.trim() ? `<div class="lyric-line active">${line}</div>` : '')
                .join('');
        }
    } catch (e) {
        container.innerText = 'Offline.';
    }
}

// ── Parse .lrc Format ─────────────────────────────────────────
function parseLRC(lrcText) {
    const container = document.getElementById('lyrics-content');
    container.innerHTML = '';

    lrcText.split('\n').forEach(line => {
        const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (match) {
            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if (text) {
                const div = document.createElement('div');
                div.className = 'lyric-line';
                div.innerText = text;
                container.appendChild(div);
                currentSyncedLyrics.push({ time, element: div });
            }
        }
    });
}

// ── Sync Lyrics to Playback Position ─────────────────────────
function handleLyricsSync(currentTime) {
    if (!lyricsOpen || currentSyncedLyrics.length === 0) return;

    let activeIndex = -1;
    for (let i = 0; i < currentSyncedLyrics.length; i++) {
        if (currentTime >= currentSyncedLyrics[i].time) activeIndex = i;
        else break;
    }

    if (activeIndex !== -1) {
        document.querySelectorAll('.lyric-line').forEach(l => l.classList.remove('active'));
        const activeLine = currentSyncedLyrics[activeIndex].element;
        activeLine.classList.add('active');
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}