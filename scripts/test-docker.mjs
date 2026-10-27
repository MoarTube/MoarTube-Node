import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

// Tests an already-built image, using only disposable containers and a new volume.
const image = process.argv[2] ?? 'moartube-node:local';
const name = `moartube-smoke-${randomUUID()}`;
const volume = `${name}-data`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000 }).trim();
let base;
async function start() {
  docker('run', '-d', '--init', '--name', name, '-p', '127.0.0.1::9090',
    '-v', `${volume}:/data`, image);
  const port = docker('port', name, '9090/tcp').split(':').at(-1);
  base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/status/heartbeat`, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch { /* Wait for migration and workers. */ }
    await delay(500);
  }
  throw new Error('Container did not become ready');
}
async function request(path, options) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`);
  return response;
}
async function json(path, options) {
  const body = await (await request(path, options)).json();
  assert.notEqual(body.isError, true, JSON.stringify(body));
  return body;
}
const post = (body, token) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
const link = 'https://example.com/docker-smoke';

try {
  docker('volume', 'create', volume);
  await start();
  assert.equal(docker('exec', name, 'id', '-u'), '1001');
  docker('exec', name, 'node', '-e', "if(require('fs').existsSync('.env')) process.exit(1)");
  assert.match(await (await request('/')).text(), /<html/i);
  const player = await request('/external/resources/javascript/videojs-10.2.0.js');
  assert.ok((await player.text()).length > 1000);
  assert.equal((await fetch(`${base}/settings/`)).status, 401);
  const credentials = { username: 'admin', password: 'admin', moarTubeNodeHttpProtocol: 'http',
    moarTubeNodeIp: '127.0.0.1', moarTubeNodePort: new URL(base).port };
  const login = await json('/account/signin', post(credentials));
  assert.equal(login.isAuthenticated, true);
  assert.ok(login.token);
  const token = login.token;
  assert.equal((await json('/account/authenticated', { headers: { authorization: `Bearer ${token}` } })).isAuthenticated, true);
  // Test storage/transport bytes; decoding actual media is a separate Client check.
  const media = Buffer.from('MoarTube Docker media transport fixture');
  const { videoId } = await json('/videos/import', post({ title: 'Docker smoke video', description: '', tags: '' }, token));
  assert.equal(videoId.length, 11);
  const videoForm = new FormData();
  videoForm.append('videoFile', new Blob([media], { type: 'video/mp4' }), 'video-240p.mp4');
  await json(`/videos/${videoId}/upload?format=mp4&resolution=240p`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: videoForm,
  });
  await json('/videos/imported', post({ videoId }, token));
  await json('/videos/published', post({ videoId }, token));
  const mediaPath = `/external/videos/${videoId}/progressive/mp4/video-240p.mp4`;
  assert.deepEqual(Buffer.from(await (await request(mediaPath)).arrayBuffer()), media);
  const range = await fetch(`${base}${mediaPath}`, { headers: { range: 'bytes=0-7' }, signal: AbortSignal.timeout(5000) });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), `bytes 0-7/${media.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), media.subarray(0, 8));
  await json('/settings/personalize/name', post({ nodeName: name }, token));
  await json('/links/add', post({ url: link, svgGraphic: '' }, token));
  const form = new FormData();
  form.append('avatarFile', new Blob([png], { type: 'image/png' }), 'avatar.png');
  await json('/settings/avatar', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  assert.deepEqual(Buffer.from(await (await request('/settings/avatar')).arrayBuffer()), png);
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(base.replace('http:', 'ws:'), { handshakeTimeout: 5000 });
    socket.once('error', reject);
    socket.once('open', () => { socket.close(); resolve(); });
  });
  // Exercise Docker's actual HEALTHCHECK, not just a host-side HTTP request.
  const deadline = Date.now() + 45_000;
  while (docker('inspect', '--format', '{{.State.Health.Status}}', name) !== 'healthy') {
    assert.ok(Date.now() < deadline, 'Docker health check failed');
    await delay(1000);
  }
  console.log('Passed startup, non-root runtime, assets, authentication, SQLite writes, video upload/download/ranges, image upload, WebSocket, health check');
  docker('stop', '--time', '10', name);
  assert.notEqual(docker('inspect', '--format', '{{.State.ExitCode}}', name), '137', 'Container required SIGKILL');
  docker('rm', name);
  await start();
  assert.equal((await json('/status/information')).information.nodeName, name);
  assert.ok((await json('/links/all')).links.some(item => item.url === link));
  assert.deepEqual(Buffer.from(await (await request('/settings/avatar')).arrayBuffer()), png);
  assert.deepEqual(Buffer.from(await (await request(mediaPath)).arrayBuffer()), media);
  assert.equal((await json('/status/information')).information.nodeVideoCount, 1);
  assert.equal((await json('/account/signin', post(credentials))).isAuthenticated, true);
  console.log('Passed container replacement: settings, SQLite records, uploaded file, login persisted');
} catch (error) {
  try { console.error(docker('logs', '--tail', '100', name)); } catch { /* Container may not exist. */ }
  throw error;
} finally {
  try { docker('rm', '-f', name); } finally { docker('volume', 'rm', volume); }
}
