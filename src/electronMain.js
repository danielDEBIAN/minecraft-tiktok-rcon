import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGuiServer } from './guiServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let guiServer = null;

// Conectar el selector nativo de carpetas de Electron con MinecraftServerManager
globalThis.__electronSelectFolder = async (defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona la carpeta de tu Servidor de Minecraft',
    defaultPath,
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths?.length) {
    return null;
  }
  return result.filePaths[0];
};

async function createWindow() {
  const port = Number(process.env.GUI_PORT) || 3000;
  guiServer = await startGuiServer({ port });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'Minecraft × TikTok Live — RCON Studio',
    backgroundColor: '#070f0b',
    icon: path.resolve(__dirname, '../public/icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (guiServer) {
    try {
      guiServer.close();
    } catch {
      // Ignorar
    }
  }
  app.quit();
});

