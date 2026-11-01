import { PROTOCOL_VERSION } from '../../shared/protocol-version.mjs';

/** What this browser tells the host once the connection is open (protocol 2). */
export interface Hello {
  /** The resume token for this room, or '' for a first visit. */
  session: string;
  /** This browser's identity key (src/net/identity.ts), or null when it keeps none. */
  identity: string | null;
  /** Progress from a solo character, sent only when the host accepts one. */
  carry: unknown;
}

/**
 * A WebSocket that answers the host's handshake before the game sees any message: the
 * resume token and identity key go in the first message instead of the URL, and the game
 * code keeps the plain socket events it already consumes (open, message, close, error).
 */
export class GameSocket extends EventTarget {
  private readonly ws: WebSocket;
  /** The host accepted and was offered a carried character in this connection's hello. */
  carryOffered = false;

  constructor(url: string, hello: Hello, Socket: typeof WebSocket = WebSocket) {
    super();
    const target = new URL(url);
    target.searchParams.set('hello', '1');
    target.searchParams.delete('session');
    this.ws = new Socket(target.href);
    this.ws.addEventListener('open', () => this.dispatchEvent(new Event('open')));
    this.ws.addEventListener('error', () => this.dispatchEvent(new Event('error')));
    this.ws.addEventListener('close', (event) =>
      this.dispatchEvent(new CloseEvent('close', { code: event.code, reason: event.reason })),
    );
    let answered = false;
    this.ws.addEventListener('message', (event) => {
      if (!answered && typeof event.data === 'string' && event.data.includes('"handshake"')) {
        let message: { type?: unknown; acceptsCarry?: unknown } | null = null;
        try {
          message = JSON.parse(event.data);
        } catch {
          /* Not a handshake; pass it on. */
        }
        if (message?.type === 'handshake') {
          answered = true;
          this.carryOffered = message.acceptsCarry === true && !!hello.carry;
          this.ws.send(
            JSON.stringify({
              type: 'hello',
              protocolVersion: PROTOCOL_VERSION,
              ...(hello.session ? { session: hello.session } : {}),
              ...(hello.identity ? { identity: hello.identity } : {}),
              ...(this.carryOffered ? { carry: hello.carry } : {}),
            }),
          );
          return;
        }
      }
      this.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
  }

  get readyState(): number {
    return this.ws.readyState;
  }
  get bufferedAmount(): number {
    return this.ws.bufferedAmount;
  }
  send(data: string): void {
    this.ws.send(data);
  }
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }
}
