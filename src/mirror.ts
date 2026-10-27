/**
 * A copy of the save on TrueAIGaming's own side. On the site the game plays inside a frame from another address, and
 * iPhone Safari never keeps a framed page's storage once Safari closes (WebKit keeps it like sessionStorage). So the
 * play page keeps a copy of every flagcatch.* key in its own storage, signed in or not: before the game starts it
 * hands the copy back ("tag:mirror"), and every change the game writes is sent to it ("tag:put"). Played on its own,
 * or on any other page, nothing is sent and the game keeps its storage as before.
 */
import { isSite } from "./cloud";
import { PROGRESS_KEY, type Store, load, merge, parse, save } from "./progress";

export const PREFIX = "flagcatch.";
/** How long to wait for the page before starting without its copy. It answers within a few milliseconds. */
const WAIT_MS = 1500;

/**
 * Puts the page's copy into `store`. A key the game already has stays (it is this visit's newer value), except the
 * progress, where the two are merged so no points are lost either way.
 */
export function fill(store: Store, data: unknown): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    try {
      const have = store.getItem(key);
      if (have === null) store.setItem(key, value);
      else if (key === PROGRESS_KEY && have !== value) {
        const p = load(store);
        if (merge(p, parse(JSON.parse(value), "local"))) save(store, p);
      }
    } catch {
      // A bad copy of one key never stops the game.
    }
  }
}

/** Storage that lasts as long as the page, for a browser that refuses the frame any storage at all. */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

/** Asks the site's play page for its copy; resolves with the page's address and copy, or null if no site answers. */
function ask(game: string): Promise<{ site: string; data: unknown } | null> {
  if (window.parent === window) return Promise.resolve(null);
  // Where the browser says who framed us, skip the wait on any other page.
  const framer = location.ancestorOrigins?.[0];
  if (framer && !isSite(framer)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (v: { site: string; data: unknown } | null) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(v);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isSite(e.origin)) return;
      const m = e.data as { type?: unknown; game?: unknown; data?: unknown } | null;
      if (m && m.type === "tag:mirror" && m.game === game) done({ site: e.origin, data: m.data });
    };
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => done(null), WAIT_MS);
    // Says which game this is and nothing else, so any page may hear it.
    window.parent.postMessage({ type: "tag:hello", game, v: 1 }, "*");
  });
}

/** Restores the page's copy before the game reads its storage, then sends the page every change. */
export async function startMirror(game: string): Promise<void> {
  const reply = await ask(game);
  if (!reply) return;
  let store: Storage;
  let shim = false;
  try {
    store = window.localStorage;
    store.getItem(PREFIX);
  } catch {
    // Storage refused outright: keep the page's copy in memory for this visit.
    store = memory();
    shim = true;
    try {
      Object.defineProperty(window, "localStorage", { value: store, configurable: true });
    } catch {
      return;
    }
  }
  fill(store, reply.data);
  const send = (key: string, value: string | null) => {
    if (key.startsWith(PREFIX)) window.parent.postMessage({ type: "tag:put", game, v: 1, key, value }, reply.site);
  };
  // Every write goes through these two, whichever part of the game makes it.
  const set = store.setItem.bind(store);
  const remove = store.removeItem.bind(store);
  const own = (s: Storage) => s === store;
  const proto = Storage.prototype;
  const protoSet = proto.setItem;
  const protoRemove = proto.removeItem;
  if (!shim) {
    proto.setItem = function (this: Storage, key: string, value: string) {
      protoSet.call(this, key, value);
      if (own(this)) send(String(key), String(value));
    };
    proto.removeItem = function (this: Storage, key: string) {
      protoRemove.call(this, key);
      if (own(this)) send(String(key), null);
    };
  } else {
    store.setItem = (key: string, value: string) => {
      set(key, value);
      send(String(key), String(value));
    };
    store.removeItem = (key: string) => {
      remove(key);
      send(String(key), null);
    };
  }
  // Whatever the page didn't have yet (a first visit, or keys made before this), so its copy is whole.
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    const value = key === null ? null : store.getItem(key);
    if (key && value !== null) send(key, value);
  }
}
