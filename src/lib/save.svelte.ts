/**
 * Speicherort der Downloads.
 * - Programm (Tauri): Ordner frei wählbar (Dialog), gemerkt im localStorage; Standard ist „Downloads“. Gespeichert wird
 *   über den Befehl save_file (gibt es den Namen schon: „Name (2).3mf“).
 * - Browser mit Ordnerwahl (Chrome, Edge): Ordner über showDirectoryPicker, gemerkt in IndexedDB. Das Schreibrecht
 *   fragt der Browser je Sitzung einmal nach. Ohne gewählten Ordner oder ohne Recht: normaler Download.
 * - Andere Browser (Firefox, Safari): den Ordner legt der Browser fest.
 */
import { isDesktop } from './desktop';

const KEY = 'osvacneo-ordner';
const DB = 'osvacneo-ordner';

/** Ordnerwahl im Browser möglich (Chrome, Edge) */
export const canPickWeb = !isDesktop && typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// Teile der File System Access API, die (noch) nicht in lib.dom stehen
type Perm = 'granted' | 'denied' | 'prompt';
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
};

function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((res) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => res(undefined);
      open.onsuccess = () => {
        const db = open.result;
        const r = f(db.transaction('kv', mode).objectStore('kv'));
        r.onsuccess = () => (res(r.result as T), db.close());
        r.onerror = () => (res(undefined), db.close());
      };
    } catch {
      res(undefined);
    }
  });
}

/** „Name.3mf“ → „Name (2).3mf“ … */
const numbered = (name: string, i: number) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
};

class SaveTarget {
  /** Programm: gewählter Ordner (voller Pfad), '' = Standard */
  dir = $state('');
  /** Programm: Standardordner (zum Anzeigen) */
  defaultDir = $state('');
  /** Browser: gewählter Ordner */
  handle = $state.raw<DirHandle | null>(null);
  /** Browser: Schreibrecht in dieser Sitzung verweigert → normaler Download */
  denied = $state(false);

  /** Ordner vom Benutzer gewählt (nicht der Standard) */
  get custom() {
    return isDesktop ? !!this.dir : !!this.handle;
  }
  /** voller Pfad (Programm) bzw. Name (Browser) des aktuellen Ordners */
  get path() {
    return isDesktop ? this.dir || this.defaultDir : (this.handle?.name ?? '');
  }
  /** kurzer Name des Ordners */
  get name() {
    if (!isDesktop) return this.handle?.name ?? 'Download-Ordner';
    const p = this.path.replace(/[\\/]+$/, '');
    return p.split(/[\\/]/).pop() || p || 'Downloads';
  }

  async init() {
    if (isDesktop) {
      try {
        this.dir = localStorage.getItem(KEY) ?? '';
      } catch {
        /* ohne Speicher: Standard */
      }
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        this.defaultDir = await invoke<string>('download_dir');
      } catch {
        this.defaultDir = '';
      }
    } else if (canPickWeb) {
      this.handle = (await idb<DirHandle>('readonly', (s) => s.get('dir'))) ?? null;
    }
  }

  /** Ordner wählen; Abbrechen ändert nichts */
  async pick() {
    if (isDesktop) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const r = await open({ directory: true, multiple: false, defaultPath: this.path || undefined, title: 'Ordner für die Downloads wählen' });
      if (typeof r !== 'string' || !r) return;
      this.dir = r === this.defaultDir ? '' : r;
      try {
        if (this.dir) localStorage.setItem(KEY, this.dir);
        else localStorage.removeItem(KEY);
      } catch {
        /* nur für diese Sitzung */
      }
    } else if (canPickWeb) {
      try {
        const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ id: 'osvacneo', mode: 'readwrite', startIn: 'downloads' });
        this.handle = h;
        this.denied = false;
        await idb('readwrite', (s) => s.put(h, 'dir'));
      } catch {
        /* abgebrochen */
      }
    }
  }

  /** zurück zum Standardordner */
  async reset() {
    if (isDesktop) {
      this.dir = '';
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* egal */
      }
    } else {
      this.handle = null;
      this.denied = false;
      await idb('readwrite', (s) => s.delete('dir'));
    }
  }

  /**
   * Browser: Schreibrecht für den gewählten Ordner holen. Muss direkt nach dem Klick laufen (vor dem Erzeugen der
   * Datei), sonst darf der Browser nicht nachfragen. Verweigert: diesmal normaler Download.
   */
  async prepare() {
    if (isDesktop || !this.handle) return;
    try {
      let p = await this.handle.queryPermission({ mode: 'readwrite' });
      if (p === 'prompt') p = await this.handle.requestPermission({ mode: 'readwrite' });
      this.denied = p !== 'granted';
    } catch {
      this.denied = true;
    }
  }

  /**
   * Datei speichern. Rückgabe: wo sie liegt (voller Pfad im Programm, Ordnername im Browser) oder '' bei einem
   * normalen Download über den Browser.
   */
  async save(blob: Blob, name: string, url: string): Promise<string> {
    if (isDesktop) {
      const { invoke } = await import('@tauri-apps/api/core');
      const data = new Uint8Array(await blob.arrayBuffer());
      return invoke<string>('save_file', data, { headers: { 'x-name': encodeURIComponent(name), 'x-dir': encodeURIComponent(this.dir) } });
    }
    if (this.handle && !this.denied) {
      try {
        let n = name;
        for (let i = 2; i < 1000; i++) {
          try {
            await this.handle.getFileHandle(n);
            n = numbered(name, i);
          } catch {
            break; // frei
          }
        }
        const w = await (await this.handle.getFileHandle(n, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
        return `${this.handle.name}/${n}`;
      } catch {
        /* Ordner weg oder kein Recht: normaler Download */
      }
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return '';
  }

  /** Programm: Datei im Dateimanager zeigen */
  async reveal(path: string) {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(path);
  }
}

export const saveTarget = new SaveTarget();
