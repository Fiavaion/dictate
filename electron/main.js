'use strict';

const { app, BrowserWindow, session, shell, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./server');

const PORT = 3001;
let mainWindow;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

async function createWindow() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if ((permission === 'media' || permission === 'microphone') &&
        (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1'))) {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'FiavaionDictate',
    icon: iconPath,
    backgroundColor: '#0e0e14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);

  await startServer(PORT, app);
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
