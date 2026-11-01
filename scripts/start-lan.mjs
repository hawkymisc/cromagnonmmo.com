// Shared play for everyone on this Wi-Fi or LAN (docs/lan-play.md). The same server and save
// as `pnpm start`, listening on the network, serving the room instead of solo play.
process.env.CRO_MULTIPLAYER = 'lan';
const { startServer } = await import('../dist/server.mjs');
await startServer();
