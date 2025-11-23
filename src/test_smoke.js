// Simple smoke test using fetch (Node 18+)
const { start, stop } = require('./index');

(async function(){
  const port = 3000;
  const base = `http://localhost:${port}`;
  const log = (...a) => console.log(...a);
  try {
    log('starting server in-process...');
    await start(port);
    log('server started');
    // wait for health
    let r;
    for (let i=0;i<10;i++){
      try { r = await fetch(base + '/health'); if (r.ok) break; } catch(e){}
      await new Promise(s=>setTimeout(s, 200));
    }
    if (!r) throw new Error('server did not respond');
    log('HEALTH ->', base + '/health');
    log('health status', r.status, await r.json());

    log('\nCREATE -> POST /api/links');
    r = await fetch(base + '/api/links', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ url: 'https://example.com' }) });
    const created = await r.json();
    log('create status', r.status, created);
    if (!r.ok) throw new Error('Create failed');
    const code = created.code;
    const secret = created.secret;

    log('\nGET INFO -> /api/links/' + code);
    r = await fetch(base + '/api/links/' + code);
    log('get status', r.status, await r.json());

    log('\nREDIRECT (expect 302) -> /' + code);
    r = await fetch(base + '/' + code, { redirect: 'manual' });
    log('redirect status', r.status, 'location:', r.headers.get('location'));

    log('\nGET INFO AFTER CLICK -> /api/links/' + code);
    r = await fetch(base + '/api/links/' + code);
    log('get after click', r.status, await r.json());

    log('\nDELETE -> /api/links/' + code);
    r = await fetch(base + '/api/links/' + code, { method: 'DELETE', headers: {'content-type':'application/json'}, body: JSON.stringify({ secret }) });
    log('delete status', r.status, await r.json());

    log('\nGET AFTER DELETE -> should be 404');
    r = await fetch(base + '/api/links/' + code);
    log('get after delete status', r.status);
    if (r.status === 404) log('Delete confirmed'); else log('Unexpected status after delete', r.status, await r.text());

    log('\nSMOKE TEST COMPLETE');
    await stop();
    process.exit(0);
  } catch (e) {
    console.error('SMOKE FAILED', e && e.message || e);
    try { await stop(); } catch(_){}
    process.exit(1);
  }
})();
