/**
 * The wire protocol both ends speak (application/protocol.mts, src/net/game-socket.ts).
 * 1: the resume token and profile travel in the WebSocket URL (still accepted).
 * 2: a connection opened with `hello=1` receives `handshake`, then sends `hello` with the
 *    resume token and the browser's identity key, so neither appears in a URL or a log.
 */
export const PROTOCOL_VERSION = 2;
