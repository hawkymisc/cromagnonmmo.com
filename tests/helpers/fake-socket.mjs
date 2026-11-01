/** An in-memory GameConnection (application/ports.mts) recording what the game sends. */
export class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  closed = null;
  handlers = new Map();
  on(type, handler) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  emit(type, ...args) {
    for (const handler of this.handlers.get(type) ?? []) handler(...args);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit('close');
  }
  terminate() {
    this.close(4000, 'terminated');
  }
  ping() {
    this.emit('pong');
  }
  /** Deliver a client command as JSON text. */
  command(message) {
    this.emit('message', JSON.stringify(message), false);
  }
  messages(type) {
    return this.sent.filter((message) => message.type === type);
  }
  last(type) {
    return this.messages(type).at(-1);
  }
}

/** Join `core` with URL-style parameters; the result reads the joined player back. */
export function join(core, params, socket = new FakeSocket()) {
  core.connect(socket, new URLSearchParams({ resume: '1', ...params }));
  const welcome = () => socket.last('welcome');
  return {
    socket,
    welcome,
    room: () => core.rooms.get(welcome()?.room),
    player: () => core.rooms.get(welcome()?.room)?.players.get(welcome()?.id),
  };
}
