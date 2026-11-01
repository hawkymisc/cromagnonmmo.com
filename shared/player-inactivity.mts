/** Shared by both server hosts and the browser's intentional-disconnect handling. */
export const IDLE_TIMEOUT_MS = 30000;
export const IDLE_CLOSE_CODE = 4002;
export const IDLE_MESSAGE = '30秒間操作がなかったため、部屋から退出しました。';
/** The same explanation for a room with its own idle limit (shared/room-rules.mts). */
export function idleMessage(timeoutMs: number): string {
  if (timeoutMs === IDLE_TIMEOUT_MS) return IDLE_MESSAGE;
  const seconds = Math.round(timeoutMs / 1000);
  const span = seconds % 60 === 0 ? `${seconds / 60}分` : `${seconds}秒`;
  return `${span}間操作がなかったため、部屋から退出しました。`;
}
