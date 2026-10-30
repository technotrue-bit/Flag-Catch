// The Supabase Realtime path of signal.ts against a small stand-in server that speaks the same protocol (Phoenix
// channels, version 2.0.0, with binary broadcast frames), so rooms are known to meet the way they will on the site.
// Plain JS so the server can use Node's own http and crypto.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { realtimeSignal } from "./signal";
import { GuestRoom, HostRoom } from "./room";

let server;
let port = 0;
const joins = [];
const sockets = new Set();

function frame(opcode, data) {
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : null;
  if (!head) throw new Error("too big");
  return Buffer.concat([head, data]);
}

function startServer() {
  server = createServer();
  server.on("upgrade", (req, socket) => {
    if (!req.url.startsWith("/realtime/v1/websocket") || !req.url.includes("apikey=anon-key")) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const peer = { socket, topics: new Set() };
    sockets.add(peer);
    let buf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 15;
        let len = buf[1] & 127;
        let at = 2;
        if (len === 126) {
          len = buf.readUInt16BE(2);
          at = 4;
        }
        const mask = buf.subarray(at, at + 4);
        at += 4;
        if (buf.length < at + len) return;
        const data = Buffer.from(buf.subarray(at, at + len));
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
        buf = buf.subarray(at + len);
        if (op === 8) {
          sockets.delete(peer);
          socket.end();
          return;
        }
        if (op === 9) socket.write(frame(10, data));
        else if (op === 1) text(peer, JSON.parse(data.toString()));
        else if (op === 2) binary(peer, data);
      }
    });
    socket.on("close", () => sockets.delete(peer));
    socket.on("error", () => sockets.delete(peer));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
}

function reply(peer, joinRef, ref, topic, payload) {
  peer.socket.write(frame(1, Buffer.from(JSON.stringify([joinRef, ref, topic, "phx_reply", payload]))));
}

function text(peer, [joinRef, ref, topic, event, payload]) {
  if (event === "phx_join") {
    joins.push({ topic, config: payload?.config });
    peer.topics.add(topic);
    reply(peer, joinRef, ref, topic, { status: "ok", response: { postgres_changes: [] } });
  } else if (event === "heartbeat" || event === "phx_leave" || event === "access_token") {
    if (event === "phx_leave") peer.topics.delete(topic);
    reply(peer, joinRef, ref, topic, { status: "ok", response: {} });
  }
}

// A client's broadcast (kind 3) goes to everyone else on the topic as a server broadcast (kind 4).
function binary(peer, data) {
  if (data[0] !== 3) return;
  const [jr, rf, tl, el, ml, enc] = [data[1], data[2], data[3], data[4], data[5], data[6]];
  let at = 7 + jr + rf;
  const topic = data.subarray(at, at + tl).toString();
  at += tl;
  const event = data.subarray(at, at + el);
  at += el + ml;
  const payload = data.subarray(at);
  const head = Buffer.from([4, tl, el, 0, enc]);
  const out = Buffer.concat([head, Buffer.from(topic), event, payload]);
  for (const other of sockets) if (other !== peer && other.topics.has(topic)) other.socket.write(frame(2, out));
}

beforeAll(async () => {
  port = await startServer();
});
afterAll(() => {
  for (const p of sockets) p.socket.destroy();
  server?.close();
});

describe("rooms over Supabase Realtime", () => {
  it("two phones on a topic hear each other's messages, and not their own", async () => {
    const cfg = { url: `http://127.0.0.1:${port}`, key: "anon-key" };
    const a = await realtimeSignal(cfg);
    const b = await realtimeSignal(cfg);
    const ta = await a.join("fc:room:BKQ7");
    const tb = await b.join("fc:room:BKQ7");
    const heardA = [];
    const heardB = [];
    ta.on((event, payload) => heardA.push([event, payload]));
    tb.on((event, payload) => heardB.push([event, payload]));
    ta.send("hello", { to: "BKQ7", from: "ana", name: "Zoë" });
    tb.send("ok", { to: "ana", host: "bea" });
    const end = Date.now() + 4000;
    while ((heardA.length < 1 || heardB.length < 1) && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    expect(heardB).toEqual([["hello", { to: "BKQ7", from: "ana", name: "Zoë" }]]);
    expect(heardA).toEqual([["ok", { to: "ana", host: "bea" }]]);
    // Joined as plain broadcast topics, without hearing themselves.
    expect(joins.map((j) => j.topic)).toEqual(["realtime:fc:room:BKQ7", "realtime:fc:room:BKQ7"]);
    expect(joins[0].config.broadcast).toMatchObject({ self: false, ack: false });
    expect(joins[0].config.private).toBe(false);
    ta.leave();
    a.close();
    b.close();
  });

  it("a friend joins a room through it and both see the room", async () => {
    const cfg = { url: `http://127.0.0.1:${port}`, key: "anon-key" };
    const env = async (name) => ({
      signal: await realtimeSignal(cfg),
      me: { id: name.toLowerCase(), ticket: `t:${name}`, who: { name, uid: name, exp: Infinity } },
      check: async (t) => (typeof t === "string" && t.startsWith("t:") ? { name: t.slice(2), uid: t.slice(2), exp: Infinity } : null),
      local: true,
    });
    const states = [];
    const on = { change: (s) => states.push(s), start() {}, snap() {}, events() {}, left() {}, closed() {} };
    const he = await env("Ana");
    const host = new HostRoom(he, { animal: "lion", medic: false }, { world: "home", mode: "capture", difficulty: "medium" }, false, on);
    await host.begin();
    const ge = await env("Bea");
    const seen = [];
    const guest = new GuestRoom(ge, { animal: "penguin", medic: false }, host.code, { ...on, change: (s) => seen.push(s) });
    await guest.begin();
    const end = Date.now() + 8000;
    while (!seen.some((s) => s.members.length === 2) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    expect(seen.at(-1).members.map((m) => m.name)).toEqual(["Ana", "Bea"]);
    expect(host.state().members.map((m) => m.name)).toEqual(["Ana", "Bea"]);
    guest.leave();
    host.leave();
    he.signal.close();
    ge.signal.close();
  }, 20000);

  it("a wrong key can't join", async () => {
    const bad = await realtimeSignal({ url: `http://127.0.0.1:${port}`, key: "nope" });
    await expect(bad.join("fc:lobby")).rejects.toThrow();
    bad.close();
  }, 20000);
});
