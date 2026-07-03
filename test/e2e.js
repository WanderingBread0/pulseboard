/* End-to-end test: drives index.html in headless Chrome.
   Run:  cd test && npm install && node e2e.js
   Requires Chrome/Chromium; set CHROME env var to override the binary path. */
const path = require('path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const problems = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const check = async (name, fn) => {
    try { const r = await fn(); console.log(`PASS  ${name}${r ? ' — ' + r : ''}`); }
    catch (e) { console.log(`FAIL  ${name} — ${e.message}`); problems.push(`${name}: ${e.message}`); }
  };

  // 1. wizard shows on first run
  await check('wizard opens on first run', async () => {
    const open = await page.$eval('#wizard', el => el.classList.contains('open'));
    if (!open) throw new Error('wizard not open');
  });

  // 2. complete wizard: custom org + preset + custom units, load sample
  await check('wizard completes with sample data', async () => {
    await page.type('#wiz-org', 'Acme Facilities');
    await page.click('#wiz-presets .preset[data-s="Store"]');
    await page.click('#wiz-next');
    await page.$eval('#wiz-units', el => el.value = 'Downtown\nUptown\nWestside');
    await page.click('#wiz-next');
    await page.click('#wiz-sample');
    await sleep(400);
    const open = await page.$eval('#wizard', el => el.classList.contains('open'));
    if (open) throw new Error('wizard still open');
    const org = await page.$eval('#org-name', el => el.textContent);
    if (org !== 'Acme Facilities') throw new Error('org name not applied: ' + org);
    const th = await page.$eval('#page-inspections thead th.u-sing', el => el.textContent);
    if (th !== 'Store') throw new Error('unit label not propagated: ' + th);
  });

  // 3. overview rendered with tiles + charts
  await check('overview tiles & charts render', async () => {
    const tiles = await page.$$eval('#kpi-row .tile', els => els.length);
    if (tiles < 4) throw new Error('only ' + tiles + ' tiles');
    const alive = await page.evaluate(() => Object.keys(charts).length);
    return `${tiles} tiles, ${alive} live charts`;
  });

  // 4. navigate every page
  for (const pid of ['analytics', 'inspections', 'defects', 'tasks', 'data', 'settings', 'overview']) {
    await check(`navigate → ${pid}`, async () => {
      await page.click(`.nav-item[data-page="${pid}"]`);
      await sleep(250);
      const active = await page.$eval(`#page-${pid}`, el => el.classList.contains('active'));
      if (!active) throw new Error('page not active');
    });
  }

  // 5. log an inspection through the real form
  await check('log inspection via form', async () => {
    await page.click('.nav-item[data-page="inspections"]');
    await sleep(200);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_inspections_v1')).length);
    await page.click('#btn-insp-new');
    await page.$eval('#insp-unit', el => el.value = 'Downtown');
    await page.$eval('#insp-area', el => el.value = 'Lobby');
    await page.$eval('#insp-inspector', el => el.value = 'Orion');
    await page.$eval('#insp-notes', el => el.value = 'e2e test entry');
    await page.click('#btn-insp-save');
    await sleep(250);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_inspections_v1')).length);
    if (after !== before + 1) throw new Error(`count ${before} → ${after}`);
    const rowText = await page.$eval('#insp-tbody tr', el => el.textContent);
    if (!rowText.includes('e2e test entry')) throw new Error('new row not first in table');
  });

  // 6. report a defect, then resolve it from the table
  await check('report defect + resolve from table', async () => {
    await page.click('.nav-item[data-page="defects"]');
    await sleep(200);
    await page.click('#btn-def-new');
    await page.$eval('#def-unit', el => el.value = 'Uptown');
    await page.$eval('#def-category', el => el.value = 'Lighting');
    await page.click('#pri-high + label');
    await page.$eval('#def-notes', el => el.value = 'e2e defect');
    await page.click('#btn-def-save');
    await sleep(250);
    const d = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_defects_v1')).find(x => x.notes === 'e2e defect'));
    if (!d) throw new Error('defect not saved');
    if (d.priority !== 'High') throw new Error('priority radio not captured: ' + d.priority);
    await page.evaluate(() => {
      const sel = document.querySelector('#def-tbody select[data-act="status"]');
      sel.value = 'Resolved';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(200);
    const d2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_defects_v1')).find(x => x.notes === 'e2e defect'));
    if (d2.status !== 'Resolved' || !d2.resolved) throw new Error('resolve did not stamp date');
    const cats = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_config_v1')).categories);
    if (!cats.includes('Lighting')) throw new Error('category not auto-learned');
  });

  // 7. task: add + mark done rolls due date forward
  await check('task add + done rolls due date', async () => {
    await page.click('.nav-item[data-page="tasks"]');
    await sleep(200);
    await page.click('#btn-task-new');
    await page.$eval('#task-name', el => el.value = 'e2e weekly walk');
    await page.$eval('#task-unit', el => el.value = 'Westside');
    await page.click('#btn-task-save');
    await sleep(200);
    const t = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_tasks_v1')).find(x => x.name === 'e2e weekly walk'));
    if (!t) throw new Error('task not saved');
    await page.evaluate(id => {
      const sel = document.querySelector(`#task-list select[data-id="${id}"]`);
      sel.value = 'Done';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, t.id);
    await sleep(200);
    const t2 = await page.evaluate(id => JSON.parse(localStorage.getItem('pb_tasks_v1')).find(x => x.id === id), t.id);
    if (t2.status !== 'Scheduled') throw new Error('weekly task should reschedule, got ' + t2.status);
    if (!(t2.due > t.due)) throw new Error(`due did not advance: ${t.due} → ${t2.due}`);
    return `${t.due} → ${t2.due}`;
  });

  // 8. settings: rename unit label and verify propagation
  await check('settings rename propagates', async () => {
    await page.click('.nav-item[data-page="settings"]');
    await sleep(200);
    await page.$eval('#set-sing', el => el.value = 'Location');
    await page.$eval('#set-plur', el => el.value = 'Locations');
    await page.click('#btn-save-settings');
    await sleep(200);
    const th = await page.$eval('#page-defects thead th.u-sing', el => el.textContent);
    if (th !== 'Location') throw new Error('label did not propagate: ' + th);
  });

  // 9. custom KPI shows on overview with prefix currency
  await check('custom KPI tile appears', async () => {
    await page.click('#btn-add-kpi');
    await sleep(100);
    await page.$eval('#kpi-editor [data-kf="label"]', el => el.value = 'Cost per sq ft');
    await page.$eval('#kpi-editor [data-kf="value"]', el => el.value = '1.84');
    await page.$eval('#kpi-editor [data-kf="suffix"]', el => el.value = '$');
    await page.$eval('#kpi-editor [data-kf="target"]', el => el.value = '2.00');
    await page.select('#kpi-editor select[data-kf="dir"]', 'down');
    await page.click('#btn-save-kpis');
    await sleep(150);
    await page.click('.nav-item[data-page="overview"]');
    await sleep(300);
    const txt = await page.$eval('#kpi-row', el => el.textContent);
    if (!txt.includes('Cost per sq ft')) throw new Error('custom tile missing');
    if (!txt.includes('$1.84')) throw new Error('currency should prefix: ' + txt.slice(-120));
    if (!txt.includes('✓')) throw new Error('target check missing');
  });

  // 10. analytics numbers are sane
  await check('analytics computes sigma/DPMO/control', async () => {
    await page.click('.nav-item[data-page="analytics"]');
    await sleep(300);
    const sigma = await page.$eval('#an-sigma', el => el.textContent);
    if (!/^\d\.\d{2}σ$/.test(sigma)) throw new Error('sigma looks wrong: ' + sigma);
    const note = await page.$eval('#an-control-note', el => el.textContent);
    if (!note.includes('mean')) throw new Error('control note empty');
    return sigma + ' | ' + note.slice(0, 60);
  });

  // 11. persistence across reload
  await check('data survives reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(400);
    const wizOpen = await page.$eval('#wizard', el => el.classList.contains('open'));
    if (wizOpen) throw new Error('wizard reopened after setup');
    const org = await page.$eval('#org-name', el => el.textContent);
    if (org !== 'Acme Facilities') throw new Error('org lost');
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_inspections_v1')).length);
    if (n < 90) throw new Error('records lost: ' + n);
    return n + ' inspections intact';
  });

  // 12. export payload shape
  await check('export payload shape', async () => {
    const payload = await page.evaluate(() => ({
      config: CFG, inspections: getInspections(), defects: getDefects(), tasks: getTasks()
    }));
    if (!payload.config.setupDone) throw new Error('config missing');
    if (!payload.inspections.length) throw new Error('no inspections in export');
  });

  // 13. bumpDue clamps month-end instead of overflowing
  await check('bumpDue month-end clamp', async () => {
    const r = await page.evaluate(() => [
      bumpDue('2026-01-31', 'Monthly'), bumpDue('2026-11-30', 'Quarterly'),
      bumpDue('2026-03-31', 'Monthly'), bumpDue('2026-02-28', 'Daily')]);
    const want = ['2026-02-28', '2027-02-28', '2026-04-30', '2026-03-01'];
    if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`got ${r}`);
    return r.join(', ');
  });

  // 14. sanitizers neutralize hostile/malformed backups
  await check('import sanitizers', async () => {
    const r = await page.evaluate(() => {
      const insp = sanitizeInspections([{ id: '"><img src=x>', date: 20260101, score: 'abc', notes: 5 }, null, 'junk']);
      const cfg = sanitizeConfig({ units: 'HQ', passThreshold: '<img src=x onerror=alert(1)>', kpis: { a: 1 } });
      return { n: insp.length, id: insp[0].id, date: insp[0].date, score: insp[0].score,
               units: Array.isArray(cfg.units), pass: cfg.passThreshold, kpis: Array.isArray(cfg.kpis) };
    });
    if (r.n !== 1) throw new Error('junk rows not dropped: ' + r.n);
    if (!/^[A-Za-z0-9_-]+$/.test(r.id)) throw new Error('hostile id kept: ' + r.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error('bad date kept: ' + r.date);
    if (r.score !== 0) throw new Error('NaN score kept: ' + r.score);
    if (!r.units || !r.kpis) throw new Error('wrong-typed config fields kept');
    if (r.pass !== 85) throw new Error('threshold not coerced: ' + r.pass);
  });

  // 15. monthSeq fills gap months
  await check('monthSeq fills zero months', async () => {
    const r = await page.evaluate(() => monthSeq(['2026-01', '2026-03']));
    if (!r.includes('2026-02')) throw new Error('gap month missing: ' + r);
  });

  // 16. KPI editor keeps half-typed rows on +Add KPI
  await check('KPI editor keeps in-progress rows', async () => {
    await page.click('.nav-item[data-page="settings"]');
    await sleep(200);
    await page.click('#btn-add-kpi');
    await sleep(100);
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#kpi-editor [data-kf="value"]');
      rows[rows.length - 1].value = '42';
    });
    await page.click('#btn-add-kpi');
    await sleep(100);
    const vals = await page.$$eval('#kpi-editor [data-kf="value"]', els => els.map(e => e.value));
    if (!vals.includes('42')) throw new Error('half-typed row erased: ' + JSON.stringify(vals));
    await page.evaluate(() => { // cleanup the scratch rows
      collectKpisFromEditor();
      CFG.kpis = CFG.kpis.filter(k => k.label);
      saveConfig();
    });
  });

  // 17. saving with different casing canonicalizes to the learned value
  await check('unit casing canonicalized', async () => {
    await page.click('.nav-item[data-page="inspections"]');
    await sleep(200);
    await page.click('#btn-insp-new');
    await page.$eval('#insp-unit', el => el.value = 'dOwNtOwN');
    await page.click('#btn-insp-save');
    await sleep(200);
    const units = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('pb_inspections_v1')).map(r => r.unit).filter(u => u.toLowerCase() === 'downtown'));
    if (units.some(u => u !== 'Downtown')) throw new Error('casing not canonicalized: ' + JSON.stringify([...new Set(units)]));
  });

  // 18. delete-while-editing cannot resurrect the record
  await check('delete clears open edit form', async () => {
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_inspections_v1')).length);
    await page.click('#insp-tbody [data-act="edit"]');
    await sleep(150);
    page.once('dialog', d => d.accept());
    await page.click('#insp-tbody [data-act="del"]');
    await sleep(200);
    const open = await page.$eval('#insp-form-card', el => el.classList.contains('open'));
    if (open) throw new Error('edit form still open after deleting its record');
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_inspections_v1')).length);
    if (n !== first - 1) throw new Error(`count ${first} → ${n}`);
  });

  // screenshots for the README
  const shotDir = process.env.SHOT_DIR;
  if (shotDir) {
    for (const pid of ['overview', 'analytics', 'defects']) {
      await page.click(`.nav-item[data-page="${pid}"]`);
      await sleep(450);
      await page.screenshot({ path: `${shotDir}/${pid}.png` });
    }
  }

  console.log('\n--- problems (' + problems.length + ') ---');
  problems.forEach(p => console.log('  ' + p));
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
