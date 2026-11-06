// ============================================================
//  utils.js — Pure Helper Utilities
//  No DOM side-effects beyond the toast container.
// ============================================================

// ── Toast Notification ────────────────────────────────────────
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

// ── Time Formatting ───────────────────────────────────────────
function formatDuration(sec) {
    if (sec === Infinity || isNaN(sec) || !sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ── File / String Helpers ─────────────────────────────────────
function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '');
}

// ── Image Helpers ─────────────────────────────────────────────
function setFadeImage(imgElement, src) {
    if (imgElement.src !== src) {
        imgElement.style.opacity = '0';
        imgElement.onload = () => { imgElement.style.opacity = '1'; };
        imgElement.src = src;
    }
}

// ── Scrolling Title Animation ─────────────────────────────────
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

// ── Smart Playlist Collage ────────────────────────────────────
async function generateSmartCollage(imageUrls) {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 600, 600);

    const loadImage = (url) => new Promise((resolve) => {
        const img = new Image(); img.crossOrigin = 'Anonymous';
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