import { config } from "../../package.json";
import { stripHTML } from "../utils/html";

export function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: `chrome://${config.addonRef}/content/preferences.xhtml`,
    label: "zoTLDR",
    image: `chrome://${config.addonRef}/content/icons/favicon.png`,
  });
}

export function initPrefsWindow(win: Window) {
  const doc = win.document;

  const pickBtn = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-pickContextDoc`,
  );
  const keyInput = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-contextDocKey`,
  ) as HTMLInputElement | null;
  const statusEl = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-contextDocStatus`,
  ) as HTMLElement | null;

  if (keyInput) {
    const savedKey = Zotero.Prefs.get(
      `${config.prefsPrefix}.contextDocKey`,
      true,
    ) as string;
    if (savedKey) keyInput.value = savedKey;

    keyInput.addEventListener("input", () => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.contextDocKey`,
        keyInput.value,
        true,
      );
    });
  }

  if (pickBtn && keyInput) {
    pickBtn.addEventListener("click", async () => {
      const notes = await findContextNotes();
      if (notes.length === 0) {
        if (statusEl)
          statusEl.textContent =
            'No notes tagged "zs-context" found in any library.';
        return;
      }

      if (notes.length === 1) {
        keyInput.value = notes[0].key;
        Zotero.Prefs.set(
          `${config.prefsPrefix}.contextDocKey`,
          notes[0].key,
          true,
        );
        if (statusEl)
          statusEl.textContent = `Selected: ${notes[0].title} (${notes[0].library})`;
        return;
      }

      const labels = notes.map((n, i) => `${i + 1}. ${n.title} [${n.library}]`);
      const selected: { value: number } = { value: 0 };
      const ok = Services.prompt.select(
        win as any,
        "zoTLDR",
        'Select a context document (notes tagged "zs-context"):',
        labels,
        selected,
      );
      if (!ok) return;

      const note = notes[selected.value];
      keyInput.value = note.key;
      Zotero.Prefs.set(`${config.prefsPrefix}.contextDocKey`, note.key, true);
      if (statusEl)
        statusEl.textContent = `Selected: ${note.title} (${note.library})`;
    });
  }

  updateContextDocStatus(statusEl);
}

interface ContextNoteInfo {
  key: string;
  title: string;
  library: string;
}

async function findContextNotes(): Promise<ContextNoteInfo[]> {
  const results: ContextNoteInfo[] = [];
  const libraries = Zotero.Libraries.getAll();

  for (const lib of libraries) {
    const s = new Zotero.Search();
    (s as any).libraryID = lib.libraryID;
    s.addCondition("itemType", "is", "note");
    s.addCondition("tag", "is", "zs-context");
    const ids = await s.search();

    for (const id of ids) {
      const item = Zotero.Items.get(id);
      const noteText = stripHTML(item.getNote()).trim();
      const preview = noteText.slice(0, 60) || "(empty note)";
      results.push({
        key: item.key,
        title: preview,
        library: lib.name,
      });
    }
  }

  return results;
}

async function updateContextDocStatus(
  statusEl: HTMLElement | null,
): Promise<void> {
  if (!statusEl) return;

  const key = Zotero.Prefs.get(
    `${config.prefsPrefix}.contextDocKey`,
    true,
  ) as string;
  if (!key) {
    statusEl.textContent = "No context document configured.";
    return;
  }

  const libraries = Zotero.Libraries.getAll();
  for (const lib of libraries) {
    const found = await Zotero.Items.getByLibraryAndKeyAsync(
      lib.libraryID,
      key,
    );
    if (found) {
      statusEl.textContent = `Linked: ${key} in ${lib.name}`;
      return;
    }
  }

  statusEl.textContent = `Warning: item ${key} not found in any library.`;
}
