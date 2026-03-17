import { config } from "../../package.json";
import { summarize } from "./summarizer";

const MENU_ID = "zotldr-summarize-menu";

export function registerContextMenu() {
  Zotero.MenuManager.registerMenu({
    menuID: MENU_ID,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuitem-summarize`,
        onCommand: async (
          _event: Event,
          context: { items?: Zotero.Item[] },
        ) => {
          const items = context.items;
          if (!items?.length) return;

          if (items.length === 1) {
            await summarizeSingle(items[0]);
          } else {
            await summarizeBatch(items);
          }
        },
      },
    ],
  });
}

async function summarizeSingle(item: Zotero.Item) {
  try {
    await summarize(item);
  } catch (e: any) {
    ztoolkit.log(`Summarization failed: ${e.message ?? e}`);
  }
}

async function summarizeBatch(items: Zotero.Item[]) {
  const showConfirm = Zotero.Prefs.get(
    `${config.prefsPrefix}.showBatchConfirm`,
    true,
  ) as boolean;

  if (showConfirm) {
    const ok = Services.prompt.confirm(
      null as any,
      "zoTLDR",
      `Summarize ${items.length} items with AI?`,
    );
    if (!ok) return;
  }

  const delay = (Zotero.Prefs.get(
    `${config.prefsPrefix}.batchDelay`,
    true,
  ) ?? 500) as number;

  for (const item of items) {
    try {
      await summarize(item);
    } catch (e: any) {
      ztoolkit.log(`Batch error on ${item.id}: ${e.message ?? e}`);
    }
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
