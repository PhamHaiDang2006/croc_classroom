import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, ipcChannelName, ipcEventName, type CrocApi } from '@croc-classroom/shared';

const bridge: CrocApi = {
  async invoke(channel, ...args) {
    if (!IPC_CHANNELS.includes(channel))
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'Kênh không hợp lệ.' } };
    try {
      return await ipcRenderer.invoke(ipcChannelName(channel), args[0]);
    } catch {
      return { ok: false, error: { code: 'OFFLINE', message: 'Mất kết nối với ứng dụng.' } };
    }
  },
  on(event, listener) {
    if (!IPC_EVENTS.includes(event) || typeof listener !== 'function') return () => {};
    const name = ipcEventName(event);
    const callback = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on(name, callback);
    return () => {
      ipcRenderer.removeListener(name, callback);
    };
  },
};
contextBridge.exposeInMainWorld('croc', bridge);
