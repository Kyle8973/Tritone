const { app, BrowserWindow, globalShortcut, ipcMain, Notification, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

if (process.platform === 'win32') {
    app.setAppUserModelId("Tritone");
}

let DiscordRPC;
let rpcReady = false;
let rpc = null;
try {
    DiscordRPC = require('discord-rpc');
    const clientId = '1476307678795010211'; 
    DiscordRPC.register(clientId);
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => { rpcReady = true; });
    rpc.login({ clientId }).catch(console.error);
} catch (e) {
    console.log('discord-rpc not installed. Skipping Discord integration.');
}

let win;
let tray = null;
let normalBounds = { width: 1200, height: 800 }; 

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
            { tooltip: 'Previous', icon: path.join(__dirname, 'assets/images', 'prev.png'), click() { win.webContents.send('media-prev'); } },
            { tooltip: 'Play/Pause', icon: path.join(__dirname, 'assets/images', 'play.png'), click() { win.webContents.send('media-play-pause'); } },
            { tooltip: 'Next', icon: path.join(__dirname, 'assets/images', 'next.png'), click() { win.webContents.send('media-next'); } }
        ]);
    } catch (e) { }

    globalShortcut.register('MediaPlayPause', () => win.webContents.send('media-play-pause'));
    globalShortcut.register('MediaNextTrack', () => win.webContents.send('media-next'));
    globalShortcut.register('MediaPreviousTrack', () => win.webContents.send('media-prev'));
}

function createTray() {
    try {
        tray = new Tray(path.join(__dirname, 'assets/images', 'icon.ico')); 
    } catch (e) {
        const { nativeImage } = require('electron');
        tray = new Tray(nativeImage.createEmpty()); 
    }
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Play/Pause', click: () => win.webContents.send('media-play-pause') },
        { label: 'Next Track', click: () => win.webContents.send('media-next') },
        { label: 'Previous Track', click: () => win.webContents.send('media-prev') },
        { type: 'separator' },
        { label: 'Show Tritone', click: () => win.show() },
        { label: 'Quit Tritone', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    
    tray.setToolTip('Tritone Player');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => win.show());
}

ipcMain.on('window-min', () => win.minimize());
ipcMain.on('window-max', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});
ipcMain.on('window-close', () => {
    if (!app.isQuitting) {
        win.hide();
    } else {
        win.close();
    }
});

ipcMain.on('download-track', (event, { url, filename }) => {
    global.downloadFilename = filename;
    win.webContents.downloadURL(url);
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
        details: title,
        state: `${artist} • ${album || "Unknown Album"}`,
        startTimestamp: startTimestamp, 
        endTimestamp: endTimestamp, 
        largeImageKey: 'tritone_logo',
        largeImageText: "Tritone",
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

ipcMain.on('notify', (event, { title, body, iconDataUrl }) => {
    let icon;
    if (iconDataUrl) {
        icon = nativeImage.createFromDataURL(iconDataUrl);
    }
    
    new Notification({ 
        title: `Now Playing: ${title}`, 
        body: body, 
        icon: icon, 
        silent: true 
    }).show();

    if (tray) tray.setToolTip(`Playing: ${title} - ${body}`);
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