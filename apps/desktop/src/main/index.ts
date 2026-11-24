import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  IPC_CHANNELS,
  ipcInputSchemas,
  ipcChannelName,
  ipcEventName,
  type IpcChannel,
  type IpcInput,
} from '@croc-classroom/shared';
import { Desktop } from './desktop.js';
import { publicError } from './rest.js';

let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let desktop: Desktop | undefined;
let quitting = false;
const reveal = () => {
  window?.show();
  window?.focus();
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', reveal);
  app.on('activate', reveal);
  app.on('before-quit', (event) => {
    if (!quitting && desktop) {
      event.preventDefault();
      quitting = true;
      void desktop.close().finally(() => app.quit());
    }
  });
  void app
    .whenReady()
    .then(async () => {
      const binary = process.platform === 'win32' ? 'croc.exe' : 'croc';
      const path = app.isPackaged
        ? join(process.resourcesPath, 'bin', binary)
        : join(
            app.getAppPath(),
            '../../packages/croc-engine/bin',
            process.platform + '-' + process.arch,
            binary,
          );
      const service = new Desktop(path, (event, value) => {
        if (window && !window.isDestroyed()) window.webContents.send(ipcEventName(event), value);
      });
      desktop = service;
      await service.init();
      const page = join(__dirname, 'renderer', 'index.html');
      const trustedUrl = pathToFileURL(page).href;
      const win = new BrowserWindow({
        width: 1240,
        height: 840,
        show: false,
        webPreferences: {
          preload: join(__dirname, 'preload.cjs'),
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      window = win;
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      win.webContents.session.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'",
            ],
          },
        }),
      );
      win.webContents.on('will-attach-webview', (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      function register<K extends IpcChannel>(channel: K) {
        ipcMain.handle(ipcChannelName(channel), async (event, raw) => {
          const frame = event.senderFrame;
          if (
            event.sender !== win.webContents ||
            !frame ||
            frame !== win.webContents.mainFrame ||
            frame.url.split('#')[0] !== trustedUrl
          )
            return { ok: false, error: { code: 'FORBIDDEN', message: 'Cửa sổ không hợp lệ.' } };
          const parsed = ipcInputSchemas[channel].safeParse(raw);
          if (!parsed.success)
            return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu không hợp lệ.' } };
          try {
            return { ok: true, data: await service.handlers[channel](parsed.data as IpcInput<K>) };
          } catch (e) {
            return { ok: false, error: publicError(e) };
          }
        });
      }
      IPC_CHANNELS.forEach(register);
      const icon = nativeImage.createFromPath(join(__dirname, 'tray.png'));
      tray = new Tray(icon);
      tray.setToolTip('Croc Classroom');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Mở lớp học', click: reveal },
          { label: 'Thoát', click: () => app.quit() },
        ]),
      );
      tray.on('click', reveal);
      win.on('close', (event) => {
        if (!quitting && service.isSharing()) {
          event.preventDefault();
          win.hide();
        }
      });
      win.on('closed', () => {
        window = undefined;
        app.quit();
      });
      await win.loadFile(page);
      win.show();
    })
    .catch(() => {
      app.exit(1);
    });
}
