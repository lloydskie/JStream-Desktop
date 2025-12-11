// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('database', {
  setPersonalization: (key: string, value: string) => ipcRenderer.invoke('set-personalization', key, value),
  getPersonalization: (key: string) => ipcRenderer.invoke('get-personalization', key),
  favoritesAdd: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-add', itemId, itemType),
  favoritesRemove: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-remove', itemId, itemType),
  favoritesList: () => ipcRenderer.invoke('favorites-list'),
  favoritesIs: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-is', itemId, itemType),
  favoritesSwap: (idA: number, idB: number) => ipcRenderer.invoke('favorites-swap', idA, idB),
  favoritesSetOrder: (id: number, order: number) => ipcRenderer.invoke('favorites-set-order', id, order),
  watchHistorySet: (itemId: string, position: number) => ipcRenderer.invoke('watch-history-set', itemId, position),
  watchHistoryGet: (itemId: string) => ipcRenderer.invoke('watch-history-get', itemId),
  watchHistoryList: () => ipcRenderer.invoke('watch-history-list'),
});
