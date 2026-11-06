// ============================================================
//  library.js — Virtual Grid + Library Loading
//
//  VirtualGrid: renders only the cards the user can see.
//  Instead of creating/destroying DOM nodes, it maintains a
//  fixed pool of card elements and just swaps their content
//  and position as the user scrolls — O(1) DOM mutations.
// ============================================================

// ── VirtualGrid ───────────────────────────────────────────────
class VirtualGrid {
    /**
     * @param {object} opts
     * @param {HTMLElement} opts.container   - The scrollable parent element
     * @param {HTMLElement} opts.gridEl      - The grid element to populate
     * @param {Array}       opts.items       - Full data array
     * @param {Function}    opts.renderItem  - fn(cardEl, item, dataIndex)
     * @param {string}      [opts.cardClass] - CSS class for pool cards
     * @param {number}      [opts.cardW]     - Card width  in px  (default 180)
     * @param {number}      [opts.cardH]     - Card height in px  (default 230)
     * @param {number}      [opts.gap]       - Gap between cards  (default 20)
     */
    constructor(opts) {
        this.container = opts.container;
        this.gridEl = opts.gridEl;
        this.items = opts.items || [];
        this.renderItem = opts.renderItem;
        this.cardClass = opts.cardClass || 'grid-album-card';
        this.cardW = opts.cardW || 180;
        this.cardH = opts.cardH || 230;
        this.gap = opts.gap || 20;

        this.pool = [];   // { el, idx } – fixed reusable card elements
        this.columns = 1;
        this.totalRows = 0;
        this.totalHeight = 0;
        this.offsetX = 0;   // left padding so grid is centred
        this._gridOffset = 0;   // offsetTop of gridEl within container

        // Velocity tracking for fast-scroll image skipping
        this._lastScrollTop = 0;
        this._lastScrollTime = Date.now();
        this._isScrollingFast = false;
        this._scrollTimeout = null;

        this._renderBound = this._render.bind(this);
        this._setup();
    }

    // ── Internal: first-time initialisation ──────────────────
    _setup() {
        this.gridEl.style.position = 'relative';
        this.gridEl.style.display = 'block';
        this.gridEl.style.overflow = 'visible';
        this.gridEl.style.overflowAnchor = 'none';

        this._measureOffset();
        this._recalcLayout();
        this._ensurePoolSize();

        this.container.addEventListener('scroll', () => {
            const now = Date.now();
            const dt = now - this._lastScrollTime;
            const dy = Math.abs(this.container.scrollTop - this._lastScrollTop);

            this._lastScrollTop = this.container.scrollTop;
            this._lastScrollTime = now;

            // If moving faster than 1.8px/ms, skip heavy image IPC calls
            if (dy / dt > 1.8) this._isScrollingFast = true;

            // When scrolling stops, do a full quality render
            clearTimeout(this._scrollTimeout);
            this._scrollTimeout = setTimeout(() => {
                this._isScrollingFast = false;
                this._render();
            }, 150);

            this._render();
        }, { passive: true });

        this._ro = new ResizeObserver(() => {
            this._measureOffset();
            this._recalcLayout();
            this._ensurePoolSize();
            this._invalidateAll();
            this._render();
        });
        this._ro.observe(this.container);

        this._render();
    }

    // ── Internal: measure how far down the grid sits ─────────
    // Uses offsetTop walk — works even when an ancestor has display:none,
    // unlike getBoundingClientRect which returns 0 for hidden elements.
    _measureOffset() {
        let el = this.gridEl, top = 0;
        while (el && el !== this.container) {
            top += el.offsetTop;
            el = el.offsetParent;
        }
        this._gridOffset = top;
    }

    // ── Internal: compute column count & total height ────────
    _recalcLayout() {
        const style = window.getComputedStyle(this.container);
        const padL = parseFloat(style.paddingLeft) || 0;
        const padR = parseFloat(style.paddingRight) || 0;
        const gridW = Math.max(
            this.cardW + this.gap,
            (this.container.clientWidth || this.container.offsetWidth) - padL - padR
        );

        this.columns = Math.max(1, Math.floor((gridW + this.gap) / (this.cardW + this.gap)));
        this.totalRows = Math.ceil(this.items.length / this.columns);
        this.totalHeight = this.totalRows * (this.cardH + this.gap);

        const usedW = this.columns * (this.cardW + this.gap) - this.gap;
        this.offsetX = Math.max(0, Math.floor((gridW - usedW) / 2));

        this.gridEl.style.height = this.totalHeight + 'px';
    }

    // ── Internal: create more pool entries if needed ─────────
    _growPool(target) {
        while (this.pool.length < target) {
            const el = document.createElement('div');
            el.className = this.cardClass;
            el.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: ${this.cardW}px;
                height: ${this.cardH}px;
                box-sizing: border-box;
                overflow: hidden;
                will-change: transform;
                display: none;
            `;
            // albumId tracks which album is rendered — independent of array
            // index so filtered views don't cause unnecessary re-renders.
            this.pool.push({ el, idx: -1, albumId: null });
            this.gridEl.appendChild(el);
        }
    }

    _ensurePoolSize() {
        const rowH = this.cardH + this.gap;
        const visibleRows = Math.ceil(this.container.clientHeight / rowH) + 10 + 10;
        const needed = Math.max(80, visibleRows * this.columns);
        this._growPool(needed);
    }

    // ── Internal: mark all pool slots as stale ───────────────
    _invalidateAll() {
        this.pool.forEach(p => { p.idx = -1; p.albumId = null; });
    }

    // ── Internal: the hot render loop ────────────────────────
    // Uses STABLE pool assignment: albums already visible keep their
    // exact slot and are only repositioned. Only albums newly entering
    // the overscan zone get a free slot, triggering a render + fade.
    // This eliminates the "everything jumps" effect caused by sequential
    // assignment where every slot got a new album on each scroll tick.
    _render() {
        if (!this.items.length) {
            this.pool.forEach(p => { p.el.style.display = 'none'; p.idx = -1; p.albumId = null; });
            return;
        }

        const rowH = this.cardH + this.gap;
        const relScroll = Math.max(0, this.container.scrollTop - this._gridOffset);

        // No overscan in testing mode (pool size 5) — restore to -5/+5 for production
        const firstRow = Math.max(0, Math.floor(relScroll / rowH));
        const lastRow = Math.min(
            this.totalRows - 1,
            Math.ceil((relScroll + this.container.clientHeight) / rowH)
        );

        const firstIdx = firstRow * this.columns;
        const lastIdx = Math.min(this.items.length - 1, (lastRow + 1) * this.columns - 1);

        // Build the set of data indices that should be visible
        const neededIdxs = new Set();
        for (let i = firstIdx; i <= lastIdx; i++) neededIdxs.add(i);

        // Classify pool slots: keep ones whose dataIdx is still in range,
        // reclaim the rest as free slots for incoming albums.
        // Keyed on dataIdx (not album.id) so cloned albums with duplicate
        // IDs are treated as distinct entries.
        const assignedMap = new Map(); // dataIdx → slot
        const freeSlots = [];

        for (const slot of this.pool) {
            if (slot.idx !== -1 && neededIdxs.has(slot.idx)) {
                assignedMap.set(slot.idx, slot);
            } else {
                slot.el.style.display = 'none';
                slot.idx = -1;
                slot.albumId = null;
                freeSlots.push(slot);
            }
        }

        // Place each visible album into its slot
        let freePtr = 0;
        for (let dataIdx = firstIdx; dataIdx <= lastIdx; dataIdx++) {
            const album = this.items[dataIdx];
            const row = Math.floor(dataIdx / this.columns);
            const col = dataIdx % this.columns;
            const x = this.offsetX + col * (this.cardW + this.gap);
            const y = row * rowH;

            let slot = assignedMap.get(dataIdx);

            if (!slot) {
                // New position entering view — grab a free slot and render
                if (freePtr >= freeSlots.length) continue;
                slot = freeSlots[freePtr++];
                slot.idx = dataIdx;
                slot.albumId = album.id;
                slot.el.style.opacity = '1';
                this.renderItem(slot.el, album, dataIdx, this._isScrollingFast);
            } else {
                // Same position — check if album actually changed
                if (slot.albumId !== album.id) {
                    slot.albumId = album.id;
                    this.renderItem(slot.el, album, dataIdx, this._isScrollingFast);
                } else if (!this._isScrollingFast && slot.el.dataset.isPlaceholder === 'true') {
                    // Was a placeholder while fast-scrolling — now load the real image
                    this.renderItem(slot.el, album, dataIdx, false);
                }
                slot.idx = dataIdx;
            }

            slot.el.style.transform = `translate(${x}px, ${y}px)`;
            slot.el.style.display = '';
        }
    }

    // ── Public API ────────────────────────────────────────────

    /** Replace the entire dataset and re-render */
    setItems(newItems) {
        this.items = newItems;
        this._recalcLayout();
        this._ensurePoolSize();
        // No _invalidateAll() here — the albumId guard in _render() detects
        // changed albums precisely. Blanket invalidation caused all visible
        // images to reload even when the same albums were still showing.
        this._render();
    }

    /** Scroll the container back to the top of the grid */
    scrollToTop() {
        this.container.scrollTo({ top: this._gridOffset, behavior: 'instant' });
    }

    /** Tear down — remove listeners and DOM nodes */
    destroy() {
        this.container.removeEventListener('scroll', this._renderBound);
        if (this._ro) this._ro.disconnect();
        this.pool.forEach(p => p.el.remove());
        this.pool = [];
        this.gridEl.style.height = '';
        this.gridEl.style.position = '';
        this.gridEl.style.display = '';
    }
}


// ── Active virtual grid instance ─────────────────────────────
let vGrid = null;
const VGRID_THRESHOLD = 80; // below this, render all cards as plain DOM — no pool recycling issues

// ── Simple grid for small libraries (<= VGRID_THRESHOLD albums) ──
// Just renders all cards directly — no virtual scrolling, no pool,
// no recycling. 80 DOM nodes has zero performance impact.
function _renderSimpleGrid(items) {
    const gridEl = document.getElementById('alphabetical-grid');
    if (!gridEl) return;

    // Destroy virtual grid if it was previously active
    if (vGrid) { vGrid.destroy(); vGrid = null; }

    // Reset grid to normal flow layout
    gridEl.style.position = '';
    gridEl.style.height = '';
    gridEl.style.display = 'flex';
    gridEl.style.flexWrap = 'wrap';
    gridEl.style.gap = '20px';
    gridEl.style.justifyContent = 'flex-start';
    gridEl.innerHTML = '';

    items.forEach((album, i) => {
        const el = document.createElement('div');
        el.className = 'grid-album-card';
        el.style.width = '180px';
        el.style.height = '230px';
        el.style.flexShrink = '0';
        _renderGridCard(el, album, i, false);
        gridEl.appendChild(el);
    });
}

// ── Initialise the virtual grid ───────────────────────────────
function initVirtualScrollers() {
    const container = document.getElementById('library-grid-view');
    const gridEl = document.getElementById('alphabetical-grid');

    // Reset any simple-grid styles before handing control to VirtualGrid
    gridEl.style.display = '';
    gridEl.style.flexWrap = '';
    gridEl.style.gap = '';
    gridEl.style.justifyContent = '';

    if (vGrid) vGrid.destroy();
    vGrid = new VirtualGrid({
        container,
        gridEl,
        items: albumIndex,
        cardClass: 'grid-album-card',
        cardW: 180,
        cardH: 230,
        gap: 20,
        renderItem: _renderGridCard,
    });
}

// ── Card renderer for the main grid ──────────────────────────
// Updates card elements in-place rather than rebuilding innerHTML.
// This preserves the <img> DOM element across re-renders so the
// browser's image cache works correctly — previously-loaded images
// appear instantly with no flash or reload delay.
function _renderGridCard(el, album, index, isScrollingFast = false) {
    const resParam = (imgResolution !== '0') ? `&size=${imgResolution}` : '';
    const artUrl = `${config.url}/rest/getCoverArt?id=${album.coverArt}${resParam}&${getAuth()}`;

    let img = el.querySelector('.grid-album-art');
    let nameEl = el.querySelector('.grid-card-name');
    let artistEl = el.querySelector('.grid-card-artist');

    if (!img) {
        el.innerHTML = `
            <img class="grid-album-art">
            <div class="grid-card-name"  style="font-weight:bold; font-size:14px; margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
            <div class="grid-card-artist" style="font-size:12px; opacity:0.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>`;
        img = el.querySelector('.grid-album-art');
        nameEl = el.querySelector('.grid-card-name');
        artistEl = el.querySelector('.grid-card-artist');
    }

    nameEl.textContent = album.name;
    artistEl.textContent = album.artist;
    el.onclick = () => loadAlbumTracks(album.id);
    el.setAttribute('data-album-id', album.id);

    if (isScrollingFast) {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.style.backgroundColor = '#171717';
        img.style.opacity = '1';
        el.dataset.isPlaceholder = 'true';
        // Clear the ID so the real image always loads when scroll stops
        delete img.dataset.coverArtId;
    } else {
        el.dataset.isPlaceholder = 'false';
        img.style.backgroundColor = '';
        // Skip reload if this slot already shows the correct cover art.
        if (img.dataset.coverArtId !== album.coverArt) {
            img.dataset.coverArtId = album.coverArt;
            img.style.opacity = '0';
            img.onload = () => { img.style.opacity = '1'; };
            img.onerror = () => { img.style.opacity = '1'; };
            img.src = artUrl;
        }
    }
}

// ── Library Spinner ───────────────────────────────────────────
function toggleLibrarySpinner(show) {
    const spinner = document.getElementById('library-spinner') || document.getElementById('grid-spinner');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
}

// ── Main Library Loader ───────────────────────────────────────
async function loadLibrary(isNewLoad = true) {
    if (isLibraryFetching) return;

    const mainGrid = document.getElementById('alphabetical-grid');
    const playlistSection = document.getElementById('playlist-section-wrapper');

    if (isNewLoad) {
        if (mainGrid) mainGrid.classList.add('loading-fade');
        if (playlistSection) playlistSection.classList.add('loading-fade');

        await new Promise(resolve => setTimeout(resolve, 300));

        currentLibraryOffset = 0;
        allLibraryLoaded = false;
        albumIndex = [];

        toggleLibrarySpinner(true);
        updateAlphabeticalSidebar();
    }

    isLibraryFetching = true;

    try {
        if (albumIndex.length === 0) {
            // One cheap request to get the total count
            const countUrl = `${config.url}/rest/getAlbumList2?type=${currentSortType}&size=1&${getAuth()}`;
            const countRes = await fetch(countUrl);
            const countData = await countRes.json();
            const totalCount = countData['subsonic-response']?.albumList2?.albumCount || 100000;

            // Fetch full index in one shot — only metadata, no audio
            const indexUrl = `${config.url}/rest/getAlbumList2?type=${currentSortType}&size=${totalCount}&${getAuth()}`;
            const res = await fetch(indexUrl);
            const data = await res.json();
            const respData = data['subsonic-response'];

            const listKey = Object.keys(respData).find(k => respData[k] && Array.isArray(respData[k].album));
            let allAlbums = listKey ? respData[listKey].album : [];

            // Client-side sort
            switch (currentSortType) {
                case 'newest':
                    albumIndex = allAlbums;
                    break;
                case 'random':
                    albumIndex = allAlbums.sort(() => Math.random() - 0.5);
                    break;
                default:
                    allAlbums.sort((a, b) => {
                        const isArtistSort = (currentSortType === 'alphabeticalByArtist');
                        let valA = (isArtistSort ? (a.artist || '') : (a.name || '')).trim();
                        let valB = (isArtistSort ? (b.artist || '') : (b.name || '')).trim();

                        const getZone = (str) => {
                            const c = str.charAt(0);
                            if (/[0-9]/.test(c)) return 1;
                            if (/[a-zA-Z]/.test(c)) return 2;
                            return 0;
                        };

                        const zA = getZone(valA), zB = getZone(valB);
                        if (zA !== zB) return zA - zB;
                        if (zA === 0) return valA.charCodeAt(0) - valB.charCodeAt(0);
                        return valA.localeCompare(valB, 'en', { numeric: true, sensitivity: 'base' });
                    });
                    albumIndex = allAlbums;
                    break;
            }

            allLibraryLoaded = true;
            currentLibraryOffset = albumIndex.length;

            // Test: simulate a large library — controlled by clone.js
            albumIndex = cloneAlbumIndex(albumIndex);
        }

        if (albumIndex.length <= VGRID_THRESHOLD) {
            _renderSimpleGrid(albumIndex);
        } else if (vGrid) {
            vGrid.setItems(albumIndex);
        } else {
            initVirtualScrollers();
        }

        if (isNewLoad) {
            requestAnimationFrame(() => {
                if (mainGrid) mainGrid.classList.remove('loading-fade');
                if (playlistSection) playlistSection.classList.remove('loading-fade');
            });
            showGridView();
        }

    } catch (err) {
        console.error('Library load error:', err);
        showToast('❌ Connection Error');
    } finally {
        isLibraryFetching = false;
        toggleLibrarySpinner(false);
    }
}

// ── Grid View ─────────────────────────────────────────────────
function showGridView() {
    hideAllViews();

    const searchBar = document.getElementById('library-search');
    const gridSearch = document.getElementById('grid-search');
    if (searchBar) searchBar.value = '';
    if (gridSearch) gridSearch.value = '';

    const lyricsView = document.getElementById('lyrics-view');
    const albumView = document.getElementById('album-view');
    const artistView = document.getElementById('artist-view');
    const pinnedBtn = document.getElementById('pinnedCloseBtn');

    if (lyricsView) { lyricsView.style.display = 'none'; lyricsOpen = false; }
    if (albumView) albumView.style.display = 'none';
    if (artistView) artistView.style.display = 'none';
    if (pinnedBtn) pinnedBtn.style.display = 'none';

    const gridView = document.getElementById('library-grid-view');
    if (gridView) {
        gridView.style.display = 'block';
        gridView.scrollTo({ top: 0, behavior: 'instant' });
    }

    // Re-measure after the container becomes visible — initVirtualScrollers()
    // may have run while display:none so all dimensions were 0.
    requestAnimationFrame(() => {
        if (vGrid) {
            vGrid._measureOffset();
            vGrid._recalcLayout();
            vGrid._ensurePoolSize();
            vGrid._invalidateAll();
            vGrid._render();
        }
    });

    if (albumIndex && albumIndex.length > 0) {
        if (albumIndex.length <= VGRID_THRESHOLD) {
            _renderSimpleGrid(albumIndex);
        } else if (vGrid) {
            vGrid.setItems(albumIndex);
        }
    }

    pushHistory({ view: 'grid', title: 'Library' }, true);
}

// ── Sort Change ───────────────────────────────────────────────
window.changeLibrarySort = function (newSort) {
    currentSortType = newSort;
    albumIndex = [];
    loadLibrary(true);
};

// ── Alphabetical Sidebar (A-Z jump strip) ─────────────────────
function updateAlphabeticalSidebar() {
    const sidebar = document.getElementById('alphabetical-sidebar');
    if (!sidebar) return;

    const isAlpha = currentSortType.includes('alphabetical');
    sidebar.style.display = isAlpha ? 'flex' : 'none';
    if (!isAlpha) return;

    sidebar.style.position = 'fixed';
    sidebar.style.right = '10px';
    sidebar.style.top = '50%';
    sidebar.style.transform = 'translateY(-50%)';
    sidebar.style.maxHeight = '70vh';
    sidebar.style.width = '28px';
    sidebar.style.padding = '12px 0';
    sidebar.style.backgroundColor = 'rgba(15, 15, 15, 0.85)';
    sidebar.style.backdropFilter = 'blur(12px)';
    sidebar.style.borderRadius = '30px';
    sidebar.style.border = '1px solid rgba(255,255,255,0.08)';
    sidebar.style.zIndex = '1000';
    sidebar.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';

    let html = `
        <button onclick="resetToHome()"
                title="Reset to A-Z"
                style="background:none;border:none;color:var(--accent);font-size:16px;cursor:pointer;padding-bottom:8px;width:100%;display:flex;align-items:center;justify-content:center;transition:0.2s;"
                onmouseover="this.style.transform='scale(1.2)'"
                onmouseout="this.style.transform='scale(1)'">🏠</button>`;

    '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(char => {
        html += `
        <button onclick="jumpToLetter('${char}')"
                style="background:none;border:none;color:white;opacity:0.5;font-size:12px;font-weight:bold;cursor:pointer;padding:0;height:13px;width:100%;display:flex;align-items:center;justify-content:center;transition:0.2s;"
                onmouseover="this.style.opacity=1;this.style.color='var(--accent)';"
                onmouseout="this.style.opacity=0.5;this.style.color='white';">${char}</button>`;
    });

    sidebar.innerHTML = html;
}

// ── Jump To Letter ────────────────────────────────────────────
window.jumpToLetter = function (letter) {
    if (!albumIndex || albumIndex.length === 0) return;

    const isArtistSort = (currentSortType === 'alphabeticalByArtist');

    const filtered = albumIndex.filter(album => {
        const name = (isArtistSort ? album.artist : album.name) || '';
        const cleanName = name.trim().toUpperCase();
        if (letter === '#') return !/^[A-Z]/.test(cleanName);
        return cleanName.startsWith(letter.toUpperCase());
    });

    if (filtered.length === 0) {
        showToast(`❌ No ${isArtistSort ? 'Artists' : 'Albums'} Starting With '${letter}'`);
        return;
    }

    const mainGrid = document.getElementById('alphabetical-grid');
    const container = document.getElementById('library-grid-view');

    if (container) container.scrollTo({ top: 0, behavior: 'instant' });
    if (mainGrid) { mainGrid.style.transition = 'opacity 0.18s ease'; mainGrid.style.opacity = '0'; }

    requestAnimationFrame(() => {
        if (filtered.length <= VGRID_THRESHOLD) { _renderSimpleGrid(filtered); } else if (vGrid) { vGrid.setItems(filtered); } else { initVirtualScrollers(); vGrid.setItems(filtered); }
        requestAnimationFrame(() => {
            if (mainGrid) mainGrid.style.opacity = '1';
        });
    });

    showToast(`📁 Showing ${filtered.length} ${isArtistSort ? 'Artists' : 'Albums'} Starting With '${letter}'`);
};

// ── Reset to Full Library ─────────────────────────────────────
window.resetToHome = function () {
    const container = document.getElementById('library-grid-view');
    const mainGrid = document.getElementById('alphabetical-grid');

    if (container) container.scrollTo({ top: 0, behavior: 'instant' });
    if (mainGrid) { mainGrid.style.transition = 'opacity 0.18s ease'; mainGrid.style.opacity = '0'; }

    requestAnimationFrame(() => {
        if (albumIndex.length <= VGRID_THRESHOLD) { _renderSimpleGrid(albumIndex); } else if (vGrid) { vGrid.setItems(albumIndex); }
        requestAnimationFrame(() => {
            if (mainGrid) mainGrid.style.opacity = '1';
        });
    });

    const searchBar = document.getElementById('library-search');
    const gridSearch = document.getElementById('grid-search');
    const searchView = document.getElementById('search-view');
    if (searchBar) searchBar.value = '';
    if (gridSearch) gridSearch.value = '';
    if (searchView) searchView.style.display = 'none';

    const isArtistSort = (currentSortType === 'alphabeticalByArtist');
    showToast(`📚 Showing All ${isArtistSort ? 'Artists' : 'Albums'} (A-Z)`);
};

// ── Performance Settings ──────────────────────────────────────
window.syncPerformanceUI = function () {
    const maxDomSelect = document.getElementById('max-dom-select');
    const pruneSelect = document.getElementById('prune-select');
    const imgResSelect = document.getElementById('img-res-select');
    if (maxDomSelect) maxDomSelect.value = maxDomItems.toString();
    if (pruneSelect) pruneSelect.value = pruneAmount.toString();
    if (imgResSelect) imgResSelect.value = imgResolution;
};

window.savePerformanceSettings = function () {
    const maxDomEl = document.getElementById('max-dom-select');
    const pruneEl = document.getElementById('prune-select');
    const imgResEl = document.getElementById('img-res-select');

    if (maxDomEl) maxDomItems = parseInt(maxDomEl.value);
    if (pruneEl) pruneAmount = parseInt(pruneEl.value);
    if (imgResEl) imgResolution = imgResEl.value;

    if (maxDomEl) localStorage.setItem('tritone_max_dom', maxDomItems);
    if (pruneEl) localStorage.setItem('tritone_prune', pruneAmount);
    if (imgResEl) localStorage.setItem('tritone_img_res', imgResolution);

    if (albumIndex.length > 0) {
        if (albumIndex.length <= VGRID_THRESHOLD) {
            // Simple grid — just re-render all cards with the new resolution
            _renderSimpleGrid(albumIndex);
        } else if (vGrid) {
            // Virtual grid — clear cached img srcs so browser re-fetches at new resolution
            vGrid.pool.forEach(p => {
                const img = p.el.querySelector('.grid-album-art');
                if (img) { img.src = ''; delete img.dataset.coverArtId; }
                p.idx = -1;
                p.albumId = null;
            });
            vGrid._render();
        }
    }
    showToast('💾 Performance Settings Applied');
};