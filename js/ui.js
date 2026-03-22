// ============================================================
//  ui.js — Navigation, Views, Queue Panel & Sidebar
// ============================================================

// ── View Helpers ──────────────────────────────────────────────
function hideAllViews() {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('album-view').style.display = 'none';
    document.getElementById('artist-view').style.display = 'none';
    document.getElementById('library-grid-view').style.display = 'none';

    const settingsView = document.getElementById('settings-view');
    const searchView = document.getElementById('search-view');
    if (settingsView) settingsView.style.display = 'none';
    if (searchView) searchView.style.display = 'none';

    // Close lyrics overlay if open
    if (lyricsOpen) {
        lyricsOpen = false;
        const lyricsLayer = document.getElementById('lyrics-view');
        const closeBtn = document.getElementById('pinnedCloseBtn');
        if (lyricsLayer) lyricsLayer.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'none';

        const navBar = document.getElementById('collapsed-nav-bar');
        if (document.getElementById('sidebar').classList.contains('collapsed') && navBar) {
            navBar.style.display = 'flex';
        }
    }
}

// ── Breadcrumbs & History ─────────────────────────────────────
function updateBreadcrumbs() {
    const btn = document.getElementById('back-btn');
    const crumb = document.getElementById('breadcrumb');
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;

    if (historyStack.length <= 1) {
        if (btn) btn.style.display = 'none';
        if (crumb) crumb.innerText = '';
    } else {
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
            // Deduplicate: replace search history in-place
            if (last && last.view === 'search' && state.view === 'search') {
                historyStack[historyStack.length - 1] = state;
            } else if (!last || last.view !== state.view || last.param !== state.param) {
                historyStack.push(state);
            }
        }
    }
    updateBreadcrumbs();
}

window.goBack = function () {
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

// ── Sidebar Toggle ────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const navBar = document.getElementById('collapsed-nav-bar');
    sidebar.classList.toggle('collapsed');
    updateBreadcrumbs();
    if (sidebar.classList.contains('collapsed')) {
        if (!lyricsOpen && navBar) navBar.style.display = 'flex';
        document.body.classList.add('sidebar-collapsed');
    } else {
        if (navBar) navBar.style.display = 'none';
        document.body.classList.remove('sidebar-collapsed');
    }
}

// ── Queue Panel ───────────────────────────────────────────────
function toggleQueue() {
    queueOpen = !queueOpen;
    document.getElementById('queue-view').style.display = queueOpen ? 'flex' : 'none';
    if (queueOpen) renderQueue();
}

function renderQueue() {
    const list = document.getElementById('queue-list');
    list.innerHTML = '';

    if (!playbackQueue.length) {
        list.innerHTML = '<p style="opacity:0.5; text-align:center; padding: 20px;">Queue is empty.</p>';
        return;
    }

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
            </div>`;

        div.onclick = (e) => {
            if (!e.target.classList.contains('queue-del-btn') && !e.target.classList.contains('queue-drag-handle')) {
                playQueue(originalIndex);
            }
        };

        div.ondragstart = (e) => { e.dataTransfer.setData('text/plain', originalIndex); div.style.opacity = '0.5'; };
        div.ondragend = () => { div.style.opacity = '1'; };
        div.ondragover = (e) => { e.preventDefault(); div.style.background = 'rgba(255,255,255,0.1)'; };
        div.ondragleave = () => { div.style.background = ''; };
        div.ondrop = (e) => {
            e.preventDefault();
            div.style.background = '';
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            reorderQueue(fromIndex, originalIndex);
        };

        list.appendChild(div);
    });
}

window.removeFromQueue = function (e, index) {
    e.stopPropagation();
    playbackQueue.splice(index, 1);
    if (index < currentIndex) {
        currentIndex--;
    } else if (index === currentIndex) {
        if (playbackQueue.length > 0) { playQueue(currentIndex % playbackQueue.length); }
        else { stopPlayerAndResetUI(); }
    }
    renderQueue();
};

window.reorderQueue = function (fromIndex, toIndex) {
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

// ── IPC Context Menu Queue Actions ───────────────────────────
ipcRenderer.on('menu-play-next', (e, track) => {
    if (!playbackQueue.length) { playbackQueue = [track]; originalQueue = [track]; playQueue(0); return; }
    playbackQueue.splice(currentIndex + 1, 0, track);
    if (isShuffle) originalQueue.push(track);
    showToast(`🎵 Will Play ${track.title} Next`);
    if (queueOpen) renderQueue();
});

ipcRenderer.on('menu-add-queue', (e, track) => {
    if (!playbackQueue.length) { playbackQueue = [track]; originalQueue = [track]; playQueue(0); return; }
    playbackQueue.push(track);
    if (isShuffle) originalQueue.push(track);
    showToast(`✅ Added ${track.title} To Queue`);
    if (queueOpen) renderQueue();
});