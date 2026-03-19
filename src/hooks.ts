import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerItemPaneSection } from "./modules/itemPane";
import { initPrefsWindow, registerPrefs } from "./modules/prefs";
import { clearAllSessions } from "./modules/sessionState";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  registerPrefs();
  registerItemPaneSection();

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: Window): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // cleanup handled by ztoolkit
}

async function onShutdown(): Promise<void> {
  clearAllSessions();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
}

function onPrefsEvent(type: string, data: { window: Window }) {
  if (type === "load") {
    initPrefsWindow(data.window);
  }
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onPrefsEvent,
};
