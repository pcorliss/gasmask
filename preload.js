const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, value) {
  const result = await ipcRenderer.invoke(channel, value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('gasmask', {
  getState: () => invoke('gasmask:get-state'),
  search: filters => invoke('gasmask:search', filters),
  refresh: () => invoke('gasmask:refresh'),
  loadMore: () => invoke('gasmask:load-more'),
  openURL: url => invoke('gasmask:open-url', url),
  mergePR: request => invoke('gasmask:merge-pr', request),
  saveView: view => invoke('gasmask:save-view', view),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('gasmask:state', listener);
    return () => ipcRenderer.removeListener('gasmask:state', listener);
  },
});
