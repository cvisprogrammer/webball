import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reboundPosition, reboundWorld, reboundDuration, validGesture, simulateShot, START_POSITION, courtPosition } from './public/physics.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const token = () => randomBytes(24).toString('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const seatCookie = (key, req) => `webball=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${req.socket.encrypted || process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;

export async function createGameServer({ dataDir = path.join(root, '.data'), now = Date.now } = {}) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'games.json');
  let games = {};
  try { games = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let repaired = false;
  for(const game of Object.values(games)) {
    const positions = [0,1].map(seat => courtPosition(game.positions?.[seat]));
    if(JSON.stringify(positions)!==JSON.stringify(game.positions)) repaired = true;
    game.positions = positions;
  }
  let queue = Promise.resolve();
  const save = async () => {
    await writeFile(`${file}.tmp`, JSON.stringify(games), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  if(repaired) await save();
  const view = (game, seat) => ({
    id: game.id, seat, players: game.players.map(p => p ? p.name : null),
    scores: game.scores, rebounds: game.rebounds, turn: game.turn, positions: game.positions,
    phase: game.phase, trajectory: game.trajectory, startedAt: game.startedAt,
    serverTime: now(), version: game.version,
    invite: seat === 0 && !game.players[1] ? game.invite : undefined,
  });
  async function api(req, res, url) {
    let body = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) throw fail(413, 'Request too large');
      }
      try { body = JSON.parse(raw || '{}'); } catch { throw fail(400, 'Invalid JSON'); }
    }
    const name = () => {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 24)
        throw fail(400, 'Use a name between 1 and 24 characters');
      return body.name.trim();
    };
    const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('webball='))?.slice(8);
    let result;
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const key = token();
      const game = { id: token().slice(0, 12), invite: token(), players: [{ name: name(), key }, null],
        scores: [0, 0], rebounds: [0, 0], positions: [{...START_POSITION},{...START_POSITION}], turn: 0, phase: 'waiting', trajectory: null, startedAt: null, version: 0 };
      games[game.id] = game;
      await save();
      res.setHeader('Set-Cookie', seatCookie(key, req));
      result = view(game, 0);
    } else if (req.method === 'POST' && url.pathname === '/api/join') {
      const game = games[body.id];
      if (!game || body.invite !== game.invite) throw fail(404, 'Invite not found');
      const existing = game.players.findIndex(p => p && cookie && p.key === cookie);
      if (existing >= 0) result = view(game, existing);
      else {
        if (game.players[1]) throw fail(409, 'Both seats are taken');
        const key = token();
        game.players[1] = { name: name(), key };
        game.phase = 'shoot'; game.version++;
        await save();
        res.setHeader('Set-Cookie', seatCookie(key, req));
        result = view(game, 1);
      }
    } else {
      const game = games[url.searchParams.get('id')];
      if (!game) throw fail(404, 'Game not found');
      const seat = game.players.findIndex(p => p && cookie && p.key === cookie);
      if (seat < 0) throw fail(403, 'Open your game in the browser where you joined');
      if (req.method === 'GET' && url.pathname === '/api/game') result = view(game, seat);
      else if (req.method === 'POST' && url.pathname === '/api/action') {
        if (body.version !== game.version) throw fail(409, 'The turn changed. Refresh and try again.');
        if (game.turn !== seat) throw fail(409, 'It is the other player’s turn');
        if (body.action === 'shoot' && game.phase === 'shoot') {
          if (!validGesture(body.gesture)) throw fail(400, 'Swipe upward from the ball to shoot');
          const trajectory = simulateShot(body.gesture, game.positions[seat]);
          if (trajectory.made) {
            game.scores[seat] += trajectory.points; game.turn = 1 - seat;
            game.positions = [{...START_POSITION},{...START_POSITION}];
            game.trajectory = null; game.startedAt = null;
          }
          else {
            game.trajectory = trajectory;
            game.turn = 1 - seat; game.phase = 'rebound'; game.startedAt = null;
          }
        } else if (body.action === 'start' && game.phase === 'rebound') {
          // Starting or resuming always replays the stored bounce from its beginning.
          game.startedAt = now();
        } else if (body.action === 'catch' && game.phase === 'rebound' && game.startedAt !== null) {
          const elapsed = now() - game.startedAt;
          if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || elapsed < 0 || elapsed > reboundDuration(game.trajectory))
            throw fail(409, 'The ball got away. Replay the rebound.');
          const ball = reboundPosition(game.trajectory, elapsed, game.positions[seat]);
          if (Math.hypot(body.x - ball.x, body.y - ball.y) > .06) throw fail(400, 'Tap closer to the ball');
          const caught = reboundWorld(game.trajectory, elapsed);
          game.positions[seat] = {x: caught.x, z: caught.z};
          game.rebounds[seat]++; game.phase = 'shoot'; game.trajectory = null; game.startedAt = null;
        } else throw fail(409, 'That action is unavailable');
        game.version++; await save(); result = view(game, seat);
      } else throw fail(404, 'Not found');
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result));
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        // Serialize state changes so simultaneous requests cannot take the same turn.
        const operation = queue.then(() => api(req, res, url));
        queue = operation.catch(() => {});
        await operation;
      } else {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'Method not allowed');
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'],
          '/physics.js': ['physics.js', 'text/javascript'], '/practice.js': ['practice.js', 'text/javascript'], '/swipe.js': ['swipe.js', 'text/javascript'], '/court3d.js': ['court3d.js', 'text/javascript'], '/light-court.js': ['light-court.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        const vendors = { '/vendor/three.module.js': 'three.module.js', '/vendor/three.core.js': 'three.core.js' };
        if(vendors[url.pathname]) {
          const content=await readFile(path.join(root,'node_modules/three/build',vendors[url.pathname]));
          res.writeHead(200,{'Content-Type':'text/javascript','X-Content-Type-Options':'nosniff'});
          res.end(req.method === 'HEAD' ? undefined : content);return;
        }
        const entry = files[url.pathname];
        if (!entry) throw fail(404, 'Not found');
        const content = await readFile(path.join(root, 'public', entry[0]));
        res.writeHead(200, { 'Content-Type': entry[1], 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : content);
      }
    } catch (error) {
      res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.status ? error.message : 'Unable to save the game. Try again.' }));
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createGameServer({ dataDir: process.env.DATA_DIR || path.join(root, '.data') });
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Webball running on port ${server.address().port}`));
}
