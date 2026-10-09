import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server.js';
import { reboundPosition, reboundWorld, courtPosition, START_POSITION } from '../public/physics.js';

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
    assert.equal((await action(p1, { action: 'shoot', gesture: { dx: 0, dy: .35, duration: .175 } })).status, 409);
    assert.equal((await action(p0, { action: 'shoot', gesture: { dx: 0, dy: .35, duration: .175, velocity: null } })).status, 400);
    const foulShot={dx:0,dy:.22,duration:.088,velocity:2.5};
    state = (await action(p0, { action: 'shoot', gesture: foulShot })).data;
    assert.deepEqual(state.scores, [2, 0]); assert.equal(state.turn, 1);
    assert.deepEqual(state.positions,[START_POSITION,START_POSITION]);
    // Resume a match whose next shooter caught a rebound near the hoop.
    await new Promise(resolve=>server.close(resolve));
    const scoringFile=path.join(dataDir,'games.json'),scoringState=JSON.parse(await readFile(scoringFile,'utf8'));
    scoringState[id].positions=[{x:.5,z:2},{x:0,z:1}];
    await writeFile(scoringFile,JSON.stringify(scoringState));
    await start();
    state=(await request(`/api/game?id=${id}`,null,p1)).data;
    state=(await action(p1,{action:'shoot',gesture:{dx:0,dy:.18,duration:.072,velocity:2.5},points:2,origin:START_POSITION})).data;
    assert.deepEqual(state.scores,[2,1],'the server scores the actual catch location instead of a requested foul-line origin or point value');
    assert.equal(state.turn,0);assert.equal(state.phase,'shoot');
    assert.deepEqual(state.positions,[START_POSITION,START_POSITION],'both players return to the foul line after a basket');
    assert.equal(state.trajectory,null);assert.equal(state.startedAt,null);
    await new Promise(resolve=>server.close(resolve));
    await start();
    state=(await request(`/api/game?id=${id}`,null,p0)).data;
    assert.deepEqual(state.scores,[2,1]);assert.deepEqual(state.positions,[START_POSITION,START_POSITION]);
    state=(await action(p0,{action:'shoot',gesture:foulShot})).data;
    assert.deepEqual(state.scores,[4,1],'the next turn is a two-point foul-line attempt');
    assert.equal(state.turn,1);
    const staleVersion = state.version;
    state = (await action(p1, { action: 'shoot', gesture: { dx: 0, dy: .025, duration: .5, velocity: .05 } })).data;
    assert.equal(state.phase, 'rebound'); assert.equal(state.turn, 0);
    assert.equal(state.trajectory.feedback,'Short of the hoop','the server releases and saves even a very soft shot');
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
    let ball = reboundPosition(trajectory, 1000, state.positions[0]);
    const caughtSpot = reboundWorld(trajectory, 1000);
    state = (await action(p0, { action: 'catch', ...ball })).data;
    assert.equal(state.phase, 'shoot'); assert.deepEqual(state.rebounds, [1, 0]); assert.equal(state.turn, 0);
    assert.deepEqual(state.positions[0], {x:caughtSpot.x,z:caughtSpot.z});
    await new Promise(resolve => server.close(resolve));
    await start();
    state = (await request(`/api/game?id=${id}`, null, p0)).data;
    assert.deepEqual(state.positions[0], {x:caughtSpot.x,z:caughtSpot.z});
    state = (await action(p0, { action: 'shoot', gesture: { dx: -.2, dy: .35, duration: .175 }, origin:{x:0,z:6} })).data;
    assert.deepEqual(state.trajectory.origin,{x:caughtSpot.x,z:caughtSpot.z});
    assert.equal(state.trajectory.flight[0][1],caughtSpot.x);
    assert.equal(state.trajectory.flight[0][3],caughtSpot.z);
    state = (await action(p1, { action: 'start' })).data;
    time += 13000;
    assert.equal((await action(p1, { action: 'catch', x: .1, y: .8 })).status, 409);
    state = (await action(p1, { action: 'start' })).data;
    ball = reboundPosition(state.trajectory, 0, state.positions[1]);
    state = (await action(p1, { action: 'catch', ...ball })).data;
    assert.deepEqual(state.rebounds, [1, 1]);
    assert.equal(state.phase, 'shoot');
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/swipe.js')).status, 200);
    assert.equal((await fetch(base + '/light-court.js')).status, 200);
    // Reproduce a position saved by the old, escapable court boundaries.
    await new Promise(resolve=>server.close(resolve));
    const file=path.join(dataDir,'games.json'),saved=JSON.parse(await readFile(file,'utf8'));
    const scores=[...state.scores],version=state.version;
    saved[id].positions[1]={x:5.8,z:-2};
    await writeFile(file,JSON.stringify(saved));
    await start();
    state=(await request(`/api/game?id=${id}`,null,p1)).data;
    assert.deepEqual(state.positions[1],courtPosition({x:5.8,z:-2}));
    assert.deepEqual(state.scores,scores);assert.equal(state.version,version);assert.equal(state.turn,1);
    const repaired=JSON.parse(await readFile(file,'utf8'));
    assert.deepEqual(repaired[id].positions[1],state.positions[1],'repair persists across refresh and restart');
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
