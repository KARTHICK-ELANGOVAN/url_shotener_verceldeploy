const { spawn } = require('child_process');
const fetch = global.fetch || require('node-fetch');

async function waitForHealth(base, attempts = 20, delay = 200) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(base + '/health');
      if (r.ok) return true;
    } catch (e) {}
    await new Promise(s => setTimeout(s, delay));
  }
  return false;
}

(async () => {
  const port = 3000;
  const base = `http://localhost:${port}`;
  console.log('Spawning server child process...');
  const child = spawn(process.execPath, ['src/index.js'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port) } });

  child.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[server-err] ${d}`));

  const up = await waitForHealth(base, 30, 200);
  if (!up) {
    console.error('Server did not start in time');
    child.kill('SIGTERM');
    process.exit(1);
  }
  console.log('Server is up — running smoke tests');

  try {
    let r = await fetch(base + '/health');
    console.log('HEALTH', r.status, await r.json());

    r = await fetch(base + '/api/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com' }) });
    const created = await r.json();
    console.log('CREATE', r.status, created);
    if (!r.ok) throw new Error('create failed');
    const code = created.code;
    const secret = created.secret;

    r = await fetch(base + '/api/links/' + code);
    console.log('GET', r.status, await r.json());

    r = await fetch(base + '/' + code, { redirect: 'manual' });
    console.log('REDIRECT', r.status, r.headers.get('location'));

    r = await fetch(base + '/api/links/' + code);
    console.log('GET AFTER CLICK', r.status, await r.json());

    r = await fetch(base + '/api/links/' + code, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret }) });
    console.log('DELETE', r.status, await r.json());

    r = await fetch(base + '/api/links/' + code);
    console.log('GET AFTER DELETE', r.status);
    if (r.status === 404) console.log('Delete confirmed'); else throw new Error('Delete not confirmed');

    console.log('SMOKE TESTS PASSED — requesting graceful shutdown');
    // request graceful shutdown
    try { await fetch(base + '/__shutdown', { method: 'POST' }); } catch (e) {}
    // wait for child to exit
    const exited = await new Promise(resolve => {
      const to = setTimeout(() => { resolve(false); }, 8000);
      child.on('exit', (code, sig) => { clearTimeout(to); resolve(true); });
    });
    if (!exited) {
      console.log('Child did not exit in time; killing');
      child.kill('SIGTERM');
    }
    process.exit(0);
  } catch (err) {
    console.error('SMOKE FAILED', err && err.message || err);
    try { await fetch(base + '/__shutdown', { method: 'POST' }); } catch (_) { child.kill('SIGTERM'); }
    process.exit(1);
  }
})();
