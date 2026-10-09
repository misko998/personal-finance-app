// Lokalno skladište: IndexedDB (podrazumevano), sa rezervom na localStorage
// ako IndexedDB nije dostupan (npr. neki privatni režimi pregledača).
// Interfejs je isti za oba: getAll, put, putMany, del, delMany, replaceAll.

const DB_NAME = 'moj-budzet';
const DB_VERSION = 1;
export const STORES = ['months', 'incomes', 'categories', 'subcategories', 'labels', 'expenses', 'settings'];
const keyOf = (store) => (store === 'settings' ? 'key' : 'id');

const reqP = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

class IDBAdapter {
  kind = 'IndexedDB';

  async open() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of STORES) {
          if (db.objectStoreNames.contains(s)) continue;
          const os = db.createObjectStore(s, { keyPath: keyOf(s) });
          if (s === 'expenses') {
            os.createIndex('date', 'date');
            os.createIndex('categoryId', 'categoryId');
          }
          if (s === 'incomes') os.createIndex('date', 'date');
          if (s === 'subcategories' || s === 'labels') os.createIndex('categoryId', 'categoryId');
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Baza je blokirana (otvorena u drugom tabu).'));
    });
    // Ako se otvori novija verzija aplikacije u drugom tabu
    this.db.onversionchange = () => {
      this.db.close();
      location.reload();
    };
    return this;
  }

  getAll(store) {
    return reqP(this.db.transaction(store).objectStore(store).getAll());
  }

  #write(stores, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      fn(tx);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transakcija prekinuta'));
    });
  }

  put(store, value) {
    return this.putMany(store, [value]);
  }
  putMany(store, values) {
    return this.#write(store, (tx) => values.forEach((v) => tx.objectStore(store).put(v)));
  }
  del(store, key) {
    return this.delMany(store, [key]);
  }
  delMany(store, keys) {
    return this.#write(store, (tx) => keys.forEach((k) => tx.objectStore(store).delete(k)));
  }
  /** Briše sve i upisuje nove podatke u JEDNOJ transakciji (sve ili ništa). */
  replaceAll(data) {
    return this.#write(STORES, (tx) => {
      for (const s of STORES) {
        const os = tx.objectStore(s);
        os.clear();
        (data[s] || []).forEach((v) => os.put(v));
      }
    });
  }
}

class LocalAdapter {
  kind = 'localStorage';
  mem = {};

  async open() {
    for (const s of STORES) {
      try {
        this.mem[s] = JSON.parse(localStorage.getItem(`${DB_NAME}:${s}`) || '[]');
      } catch {
        this.mem[s] = [];
      }
    }
    return this;
  }
  #flush(store) {
    try {
      localStorage.setItem(`${DB_NAME}:${store}`, JSON.stringify(this.mem[store]));
    } catch (e) {
      console.warn('localStorage upis nije uspeo', e);
    }
  }
  async getAll(store) {
    return structuredClone(this.mem[store]);
  }
  async put(store, value) {
    return this.putMany(store, [value]);
  }
  async putMany(store, values) {
    const k = keyOf(store);
    for (const v of values) {
      const i = this.mem[store].findIndex((x) => x[k] === v[k]);
      if (i >= 0) this.mem[store][i] = structuredClone(v);
      else this.mem[store].push(structuredClone(v));
    }
    this.#flush(store);
  }
  async del(store, key) {
    return this.delMany(store, [key]);
  }
  async delMany(store, keys) {
    const k = keyOf(store);
    this.mem[store] = this.mem[store].filter((x) => !keys.includes(x[k]));
    this.#flush(store);
  }
  async replaceAll(data) {
    for (const s of STORES) {
      this.mem[s] = structuredClone(data[s] || []);
      this.#flush(s);
    }
  }
}

export async function openDB() {
  try {
    if (!('indexedDB' in globalThis)) throw new Error('IndexedDB ne postoji');
    return await new IDBAdapter().open();
  } catch (e) {
    console.warn('IndexedDB nije dostupan, koristim localStorage.', e);
    return new LocalAdapter().open();
  }
}
