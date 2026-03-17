import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // TODO: registerPrefs()
  // TODO: registerItemPaneSection()
  // TODO: registerContextMenu()

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: Window): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // cleanup handled by ztoolkit
}

async function onShutdown(): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
}

function onPrefsEvent(type: string, data: { window: Window }) {
  // TODO: wire up highlights textarea auto-save
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onPrefsEvent,
};
