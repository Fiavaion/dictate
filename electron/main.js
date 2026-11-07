'use strict';

const { app, BrowserWindow, session, shell, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./server');

const PORT = 3001;
const APP_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
let mainWindow;

function isAppUrl(url) {
  try { return APP_ORIGINS.has(new URL(url).origin); }
  catch { return false; }
}

function openExternalIfHttp(url) {
  // Only hand http(s) URLs to the OS shell; deny file:, data:, etc.
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

async function createWindow() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if ((permission === 'media' || permission === 'microphone') && isAppUrl(webContents.getURL())) {
      return callback(true);
    }
    callback(false);
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfHttp(url);
    return { action: 'deny' };
  });

  // Keep the app window on the local app; send any other destination to the OS browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternalIfHttp(url);
  });

  await startServer(PORT, app);
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
