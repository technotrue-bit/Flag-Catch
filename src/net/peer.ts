/**
 * The link between the host's phone and one other phone in a room. Phones talk directly (WebRTC data channels), so
 * a match costs the site nothing and stays quick: one channel that may drop or reorder messages, for the snapshots
 * and inputs sent many times a second, and one that always delivers in order, for everything else. Setting the link
 * up takes a few messages over the room's topic (signal.ts).
 *
 * When two phones can't reach each other directly (some mobile networks block it), the link falls back to carrying
 * its messages over a topic of its own, at a lower rate.
 */
import type { Signal, Topic } from "./signal";

export interface Link {
  /** May be dropped or arrive out of order: for snapshots and inputs. */
  fast(msg: unknown): void;
  /** Always arrives, in order. */
  safe(msg: unknown): void;
  onMessage(handler: (msg: Record<string, unknown>, fast: boolean) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  /** True when going through the fallback topic instead of straight to the other phone. */
  readonly relayed: boolean;
}

/** Free public STUN servers, which only tell a phone its own public address. Nothing of the match passes through them. */
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
/** How long to try a direct link before falling back to the topic. */
const DIRECT_MS = 9000;
/** Largest message accepted from another phone. */
const MAX_MSG = 64 * 1024;

export interface LinkOptions {
  signal: Signal;
  /** The room's topic, shared with everyone in it. */
  room: Topic;
  roomName: string;
  me: string;
  other: string;
  /** The joining phone makes the offer; the host answers. */
  offer: boolean;
  /** Local tests (?net=local): no STUN, since both tabs are on one computer. */
  local?: boolean;
  /** False goes straight to the fallback (tests, and browsers without WebRTC do too). */
  direct?: boolean;
}

type Handler = (msg: Record<string, unknown>, fast: boolean) => void;

/** Resolves with an open link, direct or relayed; rejects if neither comes up. */
export function openLink(o: LinkOptions): { ready: Promise<Link>; signalIn: (event: string, payload: Record<string, unknown>) => void } {
  const handlers: Handler[] = [];
  const closers: Array<() => void> = [];
  let closed = false;
  const fire = (raw: unknown, fast: boolean) => {
    if (typeof raw !== "string" || raw.length > MAX_MSG) return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return;
    for (const h of handlers) h(msg as Record<string, unknown>, fast);
  };
  const shut = () => {
    if (closed) return;
    closed = true;
    for (const c of closers) c();
  };

  let pc: RTCPeerConnection | null = null;
  let fastCh: RTCDataChannel | null = null;
  let safeCh: RTCDataChannel | null = null;
  if (o.direct !== false && typeof RTCPeerConnection !== "undefined") {
    try {
      pc = new RTCPeerConnection({ iceServers: o.local ? [] : ICE });
      // Both sides make the same two channels by number, so neither waits for the other to announce them.
      fastCh = pc.createDataChannel("fast", { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
      safeCh = pc.createDataChannel("safe", { negotiated: true, id: 1, ordered: true });
    } catch {
      pc = null;
    }
  }
  let relay: Topic | null = null;

  const signalIn = (event: string, p: Record<string, unknown>) => {
    if (p.to !== o.me || p.from !== o.other || closed) return;
    if (event === "sdp" && typeof p.sdp === "object" && p.sdp && pc) {
      const desc = p.sdp as RTCSessionDescriptionInit;
      const conn = pc;
      void (async () => {
        try {
          await conn.setRemoteDescription(desc);
          if (desc.type === "offer") {
            await conn.setLocalDescription(await conn.createAnswer());
            o.room.send("sdp", { to: o.other, from: o.me, sdp: conn.localDescription?.toJSON() });
          }
        } catch {
          // A broken offer: the fallback takes over when the wait runs out.
        }
      })();
    } else if (event === "ice" && typeof p.c === "object" && p.c && pc) {
      void pc.addIceCandidate(p.c as RTCIceCandidateInit).catch(() => {});
    } else if (event === "relay") {
      void startRelay();
    }
  };
  if (pc) {
    pc.onicecandidate = (e) => {
      if (e.candidate) o.room.send("ice", { to: o.other, from: o.me, c: e.candidate.toJSON() });
    };
  }

  let resolveReady: (l: Link) => void = () => {};
  let rejectReady: (e: Error) => void = () => {};
  const ready = new Promise<Link>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });

  const closeHandlers: Array<() => void> = [];
  const lost = () => {
    if (closed) return;
    shut();
    for (const h of closeHandlers) h();
  };
  const makeLink = (relayed: boolean, fast: (s: string) => void, safe: (s: string) => void): Link => ({
    relayed,
    fast: (msg) => {
      if (!closed) fast(JSON.stringify(msg));
    },
    safe: (msg) => {
      if (!closed) safe(JSON.stringify(msg));
    },
    onMessage: (h) => handlers.push(h),
    onClose: (h) => closeHandlers.push(h),
    close: () => {
      if (closed) return;
      try {
        if (relay) relay.send("bye", { from: o.me });
        else safe(JSON.stringify({ t: "bye" }));
      } catch {
        // Already gone.
      }
      shut();
    },
  });

  let opened = 0;
  const onOpen = () => {
    opened++;
    if (opened < 2 || relay || closed) return;
    clearTimeout(timer);
    const f = fastCh!;
    const sc = safeCh!;
    resolveReady(
      makeLink(
        false,
        (s) => f.readyState === "open" && f.send(s),
        (s) => sc.readyState === "open" && sc.send(s),
      ),
    );
  };
  if (pc && fastCh && safeCh) {
    const conn = pc;
    fastCh.onopen = onOpen;
    safeCh.onopen = onOpen;
    fastCh.onmessage = (e) => !relay && fire(e.data, true);
    safeCh.onmessage = (e) => !relay && fire(e.data, false);
    safeCh.onclose = () => !relay && lost();
    conn.onconnectionstatechange = () => {
      if (!relay && opened >= 2 && (conn.connectionState === "failed" || conn.connectionState === "closed")) lost();
    };
    closers.push(() => {
      try {
        conn.close();
      } catch {
        // Already closed.
      }
    });
  }

  let relayStarted = false;
  async function startRelay(): Promise<void> {
    if (relayStarted || closed || opened >= 2) return;
    relayStarted = true;
    clearTimeout(timer);
    // Ask the other side to come too (once), then meet on a topic just for this pair.
    o.room.send("relay", { to: o.other, from: o.me });
    try {
      const pair = [o.me, o.other].sort().join(":");
      const t = await o.signal.join(`${o.roomName}:relay:${pair}`);
      relay = t;
      closers.push(() => t.leave());
      try {
        pc?.close();
      } catch {
        // Not needed any more.
      }
      let seen = 0;
      // Broadcasts can go missing, so "safe" messages are numbered, acknowledged and sent again until they are.
      let sent = 0;
      const unacked = new Map<number, string>();
      let expect = 1;
      const early = new Map<number, string>();
      t.on((event, p) => {
        if (p.from !== o.other) return;
        seen = Date.now();
        if (event === "f") fire(p.d, true);
        else if (event === "s" && typeof p.n === "number") {
          if (p.n >= expect && typeof p.d === "string") early.set(p.n, p.d);
          while (early.has(expect)) {
            const d = early.get(expect)!;
            early.delete(expect);
            expect++;
            fire(d, false);
          }
          t.send("a", { from: o.me, n: expect - 1 });
        } else if (event === "a" && typeof p.n === "number") {
          for (const k of [...unacked.keys()]) if (k <= p.n) unacked.delete(k);
        } else if (event === "bye") lost();
      });
      // A relay has no "closed" of its own: silence for long enough means the other phone is gone.
      seen = Date.now();
      const tick = setInterval(() => {
        if (closed) {
          clearInterval(tick);
          return;
        }
        if (Date.now() - seen > 12000) {
          clearInterval(tick);
          lost();
          return;
        }
        t.send("p", { from: o.me });
        for (const [n, d] of unacked) t.send("s", { from: o.me, n, d });
      }, 1500);
      // Both ends wait a moment for the other to join before the first real message.
      await new Promise((r) => setTimeout(r, 600));
      resolveReady(
        makeLink(
          true,
          (d) => t.send("f", { from: o.me, d }),
          (d) => {
            const n = ++sent;
            unacked.set(n, d);
            t.send("s", { from: o.me, n, d });
          },
        ),
      );
    } catch (err) {
      shut();
      rejectReady(err instanceof Error ? err : new Error("No link"));
    }
  }
  const timer = setTimeout(() => void startRelay(), pc ? DIRECT_MS : 0);
  closers.push(() => clearTimeout(timer));

  if (o.offer && pc) {
    const conn = pc;
    void (async () => {
      try {
        await conn.setLocalDescription(await conn.createOffer());
        o.room.send("sdp", { to: o.other, from: o.me, sdp: conn.localDescription?.toJSON() });
      } catch {
        void startRelay();
      }
    })();
  }
  return { ready, signalIn };
}
