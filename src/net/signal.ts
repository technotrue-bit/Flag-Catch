/**
 * How phones find each other before a match: small messages on a named topic that every phone listening to it hears
 * (rooms, quick match, and the few messages that set up the direct link between two phones). On TrueAIGaming.com
 * this is Supabase Realtime broadcast, the site's own Supabase; matches themselves go phone to phone (peer.ts), so
 * only a handful of these are sent per player per match.
 *
 * `?net=local` swaps in the browser's BroadcastChannel, for trying two tabs side by side and for tests.
 */

export interface Topic {
  send(event: string, payload: Record<string, unknown>): void;
  on(handler: (event: string, payload: Record<string, unknown>) => void): void;
  leave(): void;
}

export interface Signal {
  /** Resolves once listening; rejects if the topic can't be joined. */
  join(name: string): Promise<Topic>;
  close(): void;
}

export interface RealtimeConfig {
  /** The Supabase project URL and its public (anon) key, as the site page sends them. */
  url: string;
  key: string;
}

/** Supabase Realtime, loaded only when online play is opened. */
export async function realtimeSignal(cfg: RealtimeConfig): Promise<Signal> {
  const { RealtimeClient } = await import("@supabase/realtime-js");
  const endpoint = cfg.url.replace(/^http/, "ws").replace(/\/+$/, "") + "/realtime/v1";
  const client = new RealtimeClient(endpoint, { params: { apikey: cfg.key, eventsPerSecond: 20 } });
  client.connect();
  return {
    join(name) {
      return new Promise<Topic>((resolve, reject) => {
        const channel = client.channel(name, { config: { broadcast: { self: false, ack: false } } });
        const handlers: Array<(event: string, payload: Record<string, unknown>) => void> = [];
        channel.on("broadcast", { event: "*" }, (msg: { event?: unknown; payload?: unknown }) => {
          if (typeof msg.event !== "string" || typeof msg.payload !== "object" || msg.payload === null) return;
          for (const h of handlers) h(msg.event, msg.payload as Record<string, unknown>);
        });
        let settled = false;
        channel.subscribe((status: string) => {
          if (settled) return;
          if (status === "SUBSCRIBED") {
            settled = true;
            resolve({
              send(event, payload) {
                void channel.send({ type: "broadcast", event, payload });
              },
              on(h) {
                handlers.push(h);
              },
              leave() {
                void client.removeChannel(channel);
              },
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            settled = true;
            void client.removeChannel(channel);
            reject(new Error(`Could not join ${name}: ${status}`));
          }
        });
      });
    },
    close() {
      void client.removeAllChannels();
      client.disconnect();
    },
  };
}

/** Tabs of one browser, for trying it out and for tests. */
export function localSignal(): Signal {
  const open: BroadcastChannel[] = [];
  return {
    async join(name) {
      const bc = new BroadcastChannel(`fc-signal:${name}`);
      open.push(bc);
      const handlers: Array<(event: string, payload: Record<string, unknown>) => void> = [];
      bc.onmessage = (e: MessageEvent) => {
        const m = e.data as { event?: unknown; payload?: unknown } | null;
        if (!m || typeof m.event !== "string" || typeof m.payload !== "object" || m.payload === null) return;
        for (const h of handlers) h(m.event, m.payload as Record<string, unknown>);
      };
      return {
        send(event, payload) {
          bc.postMessage({ event, payload });
        },
        on(h) {
          handlers.push(h);
        },
        leave() {
          bc.close();
        },
      };
    },
    close() {
      for (const bc of open) bc.close();
    },
  };
}
