const { app, BrowserWindow, globalShortcut, ipcMain, Notification, safeStorage, Tray, Menu, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Global State Variables ---
let win; // This is the variable we must use everywhere
let tray = null;
let rpc = null;
let rpcReady = false;
let notificationTimeout = null;
let normalBounds = { width: 1200, height: 800 };

// NEW: These track the "Close to Tray" logic
let isQuitting = false; 
let closeToTrayEnabled = false; // Off by default until setting is toggled

// IPC listener to get app version
ipcMain.handle('get-app-version', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return packageJson.version;
});

// FIXED: Required for Windows Notifications to show
if (process.platform === 'win32') {
    app.setAppUserModelId("com.kyle8973.tritone");
}

// --- Discord RPC Initialization ---
try {
    const DiscordRPC = require('discord-rpc');
    const clientId = '1476307678795010211'; 
    DiscordRPC.register(clientId);
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => { rpcReady = true; });
    rpc.login({ clientId }).catch(console.error);
} catch (e) {
    console.log('discord-rpc not installed. Skipping Discord integration.');
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

    // Handle the "X" button click correctly
    win.on('close', (event) => {
        if (!isQuitting && closeToTrayEnabled) {
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
    // FIXED: Standardized path.join with commas for Linux compatibility
    const iconPath = process.platform === 'win32' 
        ? path.join(__dirname, 'assets', 'images', 'icon.ico') 
        : path.join(__dirname, 'assets', 'images', 'tritone_logo.png');

    const image = nativeImage.createFromPath(iconPath);
    
    if (image.isEmpty()) {
        console.error("Tritone Error: Tray icon not found at:", iconPath);
    }

    image.setTemplateImage(true);

    tray = new Tray(image);

    // FIXED: Changed 'mainWindow' to 'win' and added safety checks
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Play/Pause', click: () => { if(win) win.webContents.send('media-play-pause') } },
        { label: 'Next Track', click: () => { if(win) win.webContents.send('media-next') } },
        { label: 'Previous Track', click: () => { if(win) win.webContents.send('media-prev') } },
        { type: 'separator' },
        { label: 'Show Tritone', click: () => { if(win) win.show() } },
        { label: 'Quit Tritone', click: () => { 
            isQuitting = true; 
            app.quit(); 
        } }
    ]);

    if (tray) {
        tray.setToolTip('Tritone Player');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => { if(win) win.show() });
    }
}

// NEW: This receives the toggle status from your Settings UI
ipcMain.on('update-close-behavior', (event, value) => {
    closeToTrayEnabled = value;
});

ipcMain.on('window-min', () => { if(win) win.minimize() });
ipcMain.on('window-max', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});

// FIXED: Use the correct internal close region
ipcMain.on('window-close', () => {
    if (!win) return;
    if (!isQuitting && closeToTrayEnabled) {
        win.hide();
    } else {
        isQuitting = true;
        win.close();
    }
});

ipcMain.on('download-track', (event, { url, filename }) => {
    global.downloadFilename = filename;
    if(win) win.webContents.downloadURL(url);
});

ipcMain.on('update-rpc', (event, { title, artist, album, duration, currentTime, isPaused, clear }) => {
    if (!rpcReady || !rpc) return;
    
    if (clear || isPaused) {
        rpc.clearActivity().catch(console.error);
        return;
    }
    
    const now = Math.round(Date.now() / 1000); 
    const startTimestamp = now - Math.round(currentTime); 
    const endTimestamp = startTimestamp + Math.round(duration); 

    rpc.setActivity({
        details: `🎵 ${title}`, 
        state: `👤 ${artist} • 💿 ${album || "Single"}`, 
        startTimestamp: startTimestamp, 
        endTimestamp: endTimestamp, 
        largeImageKey: 'tritone_logo',
        largeImageText: `Tritone Player By Kyle8973`, 
        type: 2, 
        instance: false,
        buttons: [
            { label: "😈 Get Tritone on GitHub", url: "https://github.com/Kyle8973/Tritone" }
        ]
    }).catch(console.error);
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
    } catch (e) {
        return null;
    }
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
            } catch (e) {
                console.error("❌ Failed to fetch album art:", e);
            }
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

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});