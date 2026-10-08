import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server.js';
import { reboundPosition } from '../public/physics.js';

test('two players shoot, save an offline rebound, resume after restart and catch it', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'webball-test-'));
  let time = 100000;
  let server, base;
  async function start() {
    server = await createGameServer({ dataDir, now: () => time });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function request(route, body, cookie) {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    await start();
    let first = await request('/api/create', { name: 'Alex' });
    assert.equal(first.status, 200);
    assert.equal((await fetch(base + '/healthz')).status, 200);
    const p0 = first.cookie, id = first.data.id, invite = first.data.invite;
    assert.equal(first.data.phase, 'waiting');
    assert.equal((await request(`/api/game?id=${id}`)).status, 403);
    assert.equal((await request('/api/join', { id, invite: 'bad', name: 'Sam' })).status, 404);
    const second = await request('/api/join', { id, invite, name: 'Sam' });
    const p1 = second.cookie;
    assert.equal(second.status, 200);
    assert.equal(second.data.phase, 'shoot');
    assert.equal(second.data.invite, undefined);
    assert.equal((await request('/api/join', { id, invite, name: 'Third' })).status, 409);
    let state = second.data;
    const action = async (cookie, body) => request(`/api/action?id=${id}`, { version: state.version, ...body }, cookie);
    assert.equal((await action(p1, { action: 'shoot', aim: .5 })).status, 409);
    state = (await action(p0, { action: 'shoot', aim: .5 })).data;
    assert.deepEqual(state.scores, [2, 0]); assert.equal(state.turn, 1);
    const staleVersion = state.version;
    state = (await action(p1, { action: 'shoot', aim: .75 })).data;
    assert.equal(state.phase, 'rebound'); assert.equal(state.turn, 0);
    assert.equal(state.startedAt, null);
    assert.equal((await request(`/api/action?id=${id}`, { action: 'start', version: staleVersion }, p0)).status, 409);
    const trajectory = state.trajectory;
    await new Promise(resolve => server.close(resolve));
    time += 86400000;
    await start();
    state = (await request(`/api/game?id=${id}`, null, p0)).data;
    assert.deepEqual(state.trajectory, trajectory); assert.equal(state.startedAt, null);
    state = (await action(p0, { action: 'start' })).data;
    time += 1000;
    assert.equal((await action(p0, { action: 'catch', x: 0, y: 0 })).status, 400);
    let ball = reboundPosition(trajectory, 1000);
    state = (await action(p0, { action: 'catch', ...ball })).data;
    assert.equal(state.phase, 'shoot'); assert.deepEqual(state.rebounds, [1, 0]); assert.equal(state.turn, 0);
    state = (await action(p0, { action: 'shoot', aim: .2 })).data;
    state = (await action(p1, { action: 'start' })).data;
    time += 9000;
    assert.equal((await action(p1, { action: 'catch', x: .1, y: .8 })).status, 409);
    state = (await action(p1, { action: 'start' })).data;
    ball = reboundPosition(state.trajectory, 0);
    state = (await action(p1, { action: 'catch', ...ball })).data;
    assert.deepEqual(state.rebounds, [1, 1]);
    assert.equal(state.phase, 'shoot');
    assert.equal((await fetch(base + '/')).status, 200);
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
