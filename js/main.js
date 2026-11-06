// ============================================================
//  main.js - Main
// ============================================================

// MASTER LOG CONTROL: Set To false For Production, true For Development
const DEBUG_MODE = false;

if (!DEBUG_MODE) {
    console.log = () => { };
    console.warn = () => { };
}

const { app, BrowserWindow, globalShortcut, ipcMain, Notification, safeStorage, Tray, Menu, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Global State Variables ---
let win;
let tray = null;
let rpc = null;
let rpcReady = false;
let rpcEnabled = false;
let lastProcessedState = null;
let isBusy = false;
let notificationTimeout = null;
let normalBounds = { width: 1200, height: 800 };

let isQuitting = false;
let closeToTrayEnabled = false;

const clientId = '1476307678795010211';

// --- Discord RPC Logic ---
function setupDiscordRPC() {
    if (!rpcEnabled) return;

    try {
        const DiscordRPC = require('discord-rpc');
        if (rpc) return;

        DiscordRPC.register(clientId);
        rpc = new DiscordRPC.Client({ transport: 'ipc' });

        let retryCount = 0;
        const MAX_RETRIES = 5;

        rpc.on('ready', () => {
            rpcReady = true;
            retryCount = 0;
            console.log("RPC Mode: Handshake Successful");
            if (win) win.webContents.send('request-rpc-update');
        });

        const connect = () => {
            if (!rpcEnabled || !rpc) return;

            rpc.login({ clientId }).catch(err => {
                retryCount++;
                console.log("Discord Not Detected Or RPC Crash:", err.message);

                if (retryCount < MAX_RETRIES) {
                    setTimeout(connect, 15000);
                } else {
                    console.log(`❌ Max retries (${MAX_RETRIES}) reached. RPC disabled until toggle.`);

                    if (win) {
                        win.webContents.send('rpc-connection-failed', {
                            message: "RPC Failed To Connect After Multiple Attempts, Consider Restarting Discord Or Tritone. RPC Will Be Disabled Until You Toggle It Again In Settings"
                        });
                    }

                    if (rpc) {
                        rpc.destroy().catch(() => { });
                        rpc = null;
                        rpcReady = false;
                    }
                }
            });
        };
        connect();
    } catch (e) {
        console.log('Discord RPC Module Not Found', e.message);
    }
}

// --- IPC Communication Logic ---
ipcMain.on('set-rpc-enabled', async (event, value) => {
    const newState = (value === true || value === 'true');

    if (isBusy || newState === lastProcessedState) return;

    isBusy = true;
    lastProcessedState = newState;
    rpcEnabled = newState;

    if (rpcEnabled) {
        console.log("RPC Mode: Enabled");
        if (!rpc) {
            setupDiscordRPC();
        } else if (rpcReady && win) {
            win.webContents.send('request-rpc-update');
        }
        isBusy = false;
    } else {
        console.log("RPC Mode: Closed");
        if (rpc) {
            try {
                await rpc.clearActivity().catch(() => { });

                setTimeout(() => {
                    if (rpc) {
                        rpc.destroy().catch(() => { });
                        rpc = null;
                        rpcReady = false;
                    }
                    isBusy = false;
                    console.log("RPC Reset Complete");
                }, 1000);
            } catch (e) {
                if (rpc) rpc.destroy().catch(() => { });
                rpc = null;
                rpcReady = false;
                isBusy = false;
            }
        } else {
            isBusy = false;
        }
    }
});

ipcMain.on('update-rpc', (event, data) => {
    if (!rpcEnabled || !rpcReady || !rpc) return;

    if (data.clear || data.isPaused) {
        rpc.clearActivity().catch(() => { });
        return;
    }

    const now = Math.round(Date.now() / 1000);
    const startTimestamp = now - Math.round(data.currentTime);
    const endTimestamp = startTimestamp + Math.round(data.duration);

    rpc.setActivity({
        details: `🎵 ${data.title}`,
        state: `👤 ${data.artist}`,
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        largeImageKey: 'tritone_logo',
        largeImageText: `Tritone Player By Kyle8973`,
        instance: false,
        buttons: [
            { label: "😈 Get Tritone on GitHub", url: "https://github.com/Kyle8973/Tritone" }
        ]
    }).catch(() => {
        rpcReady = false;
    });
});

// --- Window & App Logic ---

ipcMain.handle('get-app-version', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join('./package.json'), 'utf8'));
    return packageJson.version;
});

ipcMain.handle('check-tray-status', () => {
    return tray !== null;
});

if (process.platform === 'win32') {
    app.setAppUserModelId("com.kyle8973.tritone");
}

function createWindow() {
    win = new BrowserWindow({
        width: normalBounds.width,
        height: normalBounds.height,
        backgroundColor: '#121212',
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            allowRunningInsecureContent: true
        }
    });

    win.loadFile('index.html');

    win.on('close', (event) => {
        if (!isQuitting && closeToTrayEnabled && tray) {
            event.preventDefault();
            win.hide();
            return false;
        }
    });

    win.webContents.session.on('will-download', (event, item, webContents) => {
        if (global.downloadFilename) {
            item.setSaveDialogOptions({ defaultPath: global.downloadFilename });
            global.downloadFilename = null;
        }
        item.once('done', (event, state) => {
            if (state === 'completed') {
                win.webContents.send('notify', { title: 'Download Complete', body: item.getFilename() });
            }
        });
    });

    try {
        win.setThumbarButtons([
            { tooltip: 'Previous', icon: path.join(__dirname, 'assets', 'images', 'prev.png'), click() { win.webContents.send('media-prev'); } },
            { tooltip: 'Play/Pause', icon: path.join(__dirname, 'assets', 'images', 'play.png'), click() { win.webContents.send('media-play-pause'); } },
            { tooltip: 'Next', icon: path.join(__dirname, 'assets', 'images', 'next.png'), click() { win.webContents.send('media-next'); } }
        ]);
    } catch (e) { }

    globalShortcut.register('MediaPlayPause', () => win.webContents.send('media-play-pause'));
    globalShortcut.register('MediaNextTrack', () => win.webContents.send('media-next'));
    globalShortcut.register('MediaPreviousTrack', () => win.webContents.send('media-prev'));
}

function createTray() {
    const iconPath = process.platform === 'win32'
        ? path.join(__dirname, 'assets', 'images', 'icon.ico')
        : path.join(__dirname, 'assets', 'images', 'tritone_logo.png');

    const image = nativeImage.createFromPath(iconPath);

    try {
        tray = new Tray(image);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Play/Pause', click: () => { if (win) win.webContents.send('media-play-pause') } },
            { label: 'Next Track', click: () => { if (win) win.webContents.send('media-next') } },
            { label: 'Previous Track', click: () => { if (win) win.webContents.send('media-prev') } },
            { type: 'separator' },
            { label: 'Show Tritone', click: () => { if (win) win.show() } },
            {
                label: 'Quit Tritone', click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Tritone Player');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => { if (win) win.show() });
    } catch (e) {
        console.warn("Tritone Warning: System Tray failed to initialize or is not supported. Minimize to Tray will be disabled.");
        tray = null;
    }
}

ipcMain.on('update-close-behavior', (event, value) => { closeToTrayEnabled = value; });
ipcMain.on('window-min', () => { if (win) win.minimize() });
ipcMain.on('window-max', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});

ipcMain.on('window-close', async () => {
    if (!win) return;
    if (!isQuitting && closeToTrayEnabled && tray) {
        win.hide();
    } else {
        isQuitting = true;
        if (rpc && rpcReady) {
            await rpc.clearActivity().catch(() => { });
        }
        win.close();
    }
});

ipcMain.on('download-track', (event, { url, filename }) => {
    global.downloadFilename = filename;
    if (win) win.webContents.downloadURL(url);
});

ipcMain.on('show-track-menu', (event, trackInfo) => {
    const template = [
        { label: 'Play Next', click: () => event.sender.send('menu-play-next', trackInfo) },
        { label: 'Add to Queue', click: () => event.sender.send('menu-add-queue', trackInfo) }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle('encrypt-data', (event, data) => {
    if (!safeStorage.isEncryptionAvailable()) return data;
    return safeStorage.encryptString(data).toString('base64');
});

ipcMain.handle('decrypt-data', (event, encryptedData) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
        const buffer = Buffer.from(encryptedData, 'base64');
        return safeStorage.decryptString(buffer);
    } catch (e) { return null; }
});

ipcMain.on('notify', async (event, { title, body, iconDataUrl }) => {
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(async () => {
        const appLogoPath = path.join(__dirname, 'assets', 'images', 'icon.png');
        let displayIcon = nativeImage.createFromPath(appLogoPath);
        if (iconDataUrl) {
            try {
                const response = await net.fetch(iconDataUrl);
                const buffer = await response.arrayBuffer();
                let img = nativeImage.createFromBuffer(Buffer.from(buffer));
                const size = img.getSize();
                const minDim = Math.min(size.width, size.height);
                img = img.crop({
                    x: Math.floor((size.width - minDim) / 2),
                    y: Math.floor((size.height - minDim) / 2),
                    width: minDim,
                    height: minDim
                });
                displayIcon = img.resize({ width: 256, height: 256, quality: 'best' });
            } catch (e) { console.error("❌ Failed to fetch album art:", e); }
        }
        const notif = new Notification({
            title: `Now Playing: ${title}`,
            body: body,
            icon: displayIcon,
            appIcon: nativeImage.createFromPath(appLogoPath),
            silent: true
        });
        notif.show();
        if (tray) tray.setToolTip(`Playing: ${title} - ${body}`);
        notificationTimeout = null;
    }, 1500);
});

ipcMain.on('force-focus', (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender);
    if (targetWin) {
        targetWin.blur();
        targetWin.focus();
        targetWin.show();
    }
});

// --- Startup Sequence ---
app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('will-quit', async () => {
    if (rpc && rpcReady) {
        try {
            await rpc.clearActivity().catch(() => { });
            rpc.destroy().catch(() => { });
        } catch (e) { }
    }
    globalShortcut.unregisterAll();
});