import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.__crypto = crypto;
import { buildFixture, hashTree, SECRETS, TITLE_WORD, DESC_WORD, ROLE_WORD, ROLE_TAIL } from './fixture.mjs';
import { makeRoots } from '../src/paths.mjs';
import { DEFAULTS } from '../src/config.mjs';
import { Collector } from '../src/collector.mjs';
import { buildSnapshot } from '../src/snapshot.mjs';

function cfgWith(policy, display = null, showRealNames = false) {
  return { ...DEFAULTS, showRealNames, alerts: { ...DEFAULTS.alerts }, contextWindows: {}, _file: null,
    rooms: { [SECRETS.folder]: { alias: 'Sala 1', display, tasks: policy, hidden: false } } };
}

function run(policy, display, showRealNames = false) {
  const fx = buildFixture();
  const cfg = cfgWith(policy, display, showRealNames);
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick(); col.tick();
  return { fx, snap: buildSnapshot(col, cfg), col };
}

for (const policy of ['oculto', 'interno', 'publico']) {
  test(`nenhum segredo vaza com política ${policy}`, () => {
    const { snap } = run(policy);
    const json = JSON.stringify(snap);
    for (const [k, v] of Object.entries(SECRETS)) assert.ok(!json.includes(v), `vazou ${k}`);
    for (const frag of ['10.0.0.5', 'joao@empresa', '/srv/', 'clientes/', 'sigiloso']) assert.ok(!json.includes(frag), `vazou ${frag}`);
    if (policy !== 'publico') {
      assert.ok(!json.includes(TITLE_WORD), 'título vazou fora de publico');
      assert.ok(!json.includes(DESC_WORD), 'descrição de delegação vazou fora de publico');
    }
  });
}

test('publico mostra título redigido e delegação', () => {
  const { snap } = run('publico', 'Projeto Demo');
  const room = snap.rooms.find((r) => r.name === 'Projeto Demo');
  assert.equal(room.tasks.mode, 'lista');
  const titles = room.tasks.items.map((t) => t.title).join(' | ');
  assert.match(titles, /CLIENTEXYZTITULO/);
  assert.match(titles, /\[ip\]/);
  assert.match(titles, /\[e-mail\]/);
  assert.match(titles, /DESCCLIENTE/);
});

test('interno mostra só contagens', () => {
  const { snap } = run('interno');
  const room = snap.rooms.find((r) => r.name === 'Sala 1');
  assert.equal(room.tasks.mode, 'contagem');
  assert.equal(room.tasks.items, undefined);
});

test('pasta não classificada aparece só com alias', () => {
  const { snap } = run('oculto');
  assert.ok(snap.rooms.some((r) => r.name === 'Sala 1'));
  assert.ok(snap.catalog.projects.every((p) => p.name === 'Sala 1'));
});

test('estado e alertas derivados corretamente', () => {
  const { snap } = run('oculto');
  const room = snap.rooms.find((r) => r.name === 'Sala 1');
  assert.equal(room.sessions.length, 1);
  assert.equal(room.sessions[0].state, 'asking');
  assert.equal(room.sessions[0].contextPct, null, 'sem janela conhecida, contexto é desconhecido');
  assert.ok(snap.alerts.some((a) => a.type === 'asking'));
  const staff = room.staff.find((a) => a.name === 'revisor');
  assert.equal(staff.state, 'working');
  assert.equal(staff.activity, 'editando');
});

test('ferramenta pendente sem AskUserQuestion não vira alerta de espera', () => {
  const fx = buildFixture();
  const f = path.join(fx.base, 'projects', '-fake-' + SECRETS.folder, fx.sid + '.jsonl');
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.includes('AskUserQuestion') && l.startsWith('{') && l.endsWith('}'));
  lines.push(JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: {} }] } }));
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const cfg = cfgWith('oculto');
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  const snap = buildSnapshot(col, cfg);
  assert.ok(!snap.alerts.some((a) => a.type === 'asking' || a.type === 'waiting'));
  assert.equal(snap.rooms.find((r) => r.name === 'Sala 1').sessions[0].state, 'working');
});

test('o coletor não escreve em nada dentro da raiz lida', () => {
  const fx = buildFixture();
  const before = hashTree(fx.base);
  const cfg = cfgWith('publico');
  const col = new Collector(makeRoots(fx.base), cfg);
  for (let i = 0; i < 3; i++) { col.tick(); buildSnapshot(col, cfg); }
  assert.deepEqual(hashTree(fx.base), before);
});

test('symlink apontando para fora da raiz é ignorado', () => {
  const fx = buildFixture();
  const outside = fs.mkdtempSync(path.join(path.dirname(fx.base), 'fora-'));
  fs.mkdirSync(path.join(outside, 'agents'));
  fs.writeFileSync(path.join(outside, 'agents', 'intruso.md'), '---\nname: intruso\n---\n');
  fs.symlinkSync(path.join(outside, 'agents'), path.join(fx.base, 'agents'));
  const cfg = cfgWith('oculto');
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  assert.ok(!JSON.stringify(buildSnapshot(col, cfg)).includes('intruso'));
});

test('só src/config.mjs usa APIs de escrita', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const WRITE = /\b(writeFile|writeFileSync|appendFile|createWriteStream|mkdir|mkdirSync|rmSync|rmdir|unlink|rename|renameSync|truncate|copyFile|chmod|chown|symlink|utimes)\b|openSync\([^)]*,\s*['"](w|a|r\+|w\+|a\+)/;
  for (const f of fs.readdirSync(dir)) {
    if (f === 'config.mjs') continue;
    assert.ok(!WRITE.test(fs.readFileSync(path.join(dir, f), 'utf8')), `${f} usa API de escrita`);
  }
});

test('campo task só existe em sala publico e só com texto redigido', () => {
  for (const policy of ['oculto', 'interno']) {
    const json = JSON.stringify(run(policy).snap);
    assert.ok(!json.includes('"task"'), `task apareceu em ${policy}`);
  }
  const { snap } = run('publico', 'Demo');
  const room = snap.rooms.find((r) => r.name === 'Demo');
  const tasks = [...room.sessions, ...room.staff, ...room.interns].map((x) => x.task).filter(Boolean);
  assert.ok(tasks.length >= 2);
  for (const t of tasks) {
    assert.ok(t.length <= 60);
    for (const bad of ['10.0.0.5', 'joao@', ...Object.values(SECRETS)]) assert.ok(!t.includes(bad), bad);
  }
});

test('snapshot não carrega quantidade de tokens', () => {
  const json = JSON.stringify(run('publico').snap);
  assert.ok(!/tokens/i.test(json), 'achei campo de tokens');
});

test('nome real da pasta aparece só com showRealNames', () => {
  assert.ok(JSON.stringify(run('oculto', null, true).snap).includes(SECRETS.folder));
  assert.ok(!JSON.stringify(run('oculto', null, false).snap).includes(SECRETS.folder));
});

test('hidden e exclude removem a sala do snapshot e do catálogo', () => {
  const fx = buildFixture();
  for (const variant of ['hidden', 'exclude']) {
    const cfg = cfgWith('publico', 'Escondida', true);
    if (variant === 'hidden') cfg.rooms[SECRETS.folder].hidden = true;
    else cfg.exclude = ['sigiloso'];
    const col = new Collector(makeRoots(fx.base), cfg);
    col.tick();
    const json = JSON.stringify(buildSnapshot(col, cfg));
    assert.ok(!json.includes('Escondida') && !json.includes(SECRETS.folder), variant);
    assert.ok(!json.includes('Visitantes'), `${variant}: sessão vazou para Visitantes`);
  }
});

test('sala só acende com trabalho efetivo', () => {
  const { snap } = run('oculto', 'X');
  assert.equal(snap.rooms.find((r) => r.name === 'X').lit, true);
  const empty = snap.rooms.find((r) => r.kind === 'lobby');
  assert.equal(empty.lit, false);
});

test('função do agente sai redigida, só 1ª frase, em qualquer política', () => {
  for (const policy of ['oculto', 'interno', 'publico']) {
    const { snap } = run(policy, 'Demo');
    const room = snap.rooms.find((r) => r.name === 'Demo');
    const does = room.staff.find((a) => a.name === 'revisor').does;
    assert.match(does, new RegExp('^Revisar ' + ROLE_WORD));
    assert.match(does, /\[e-mail\].*\[ip\].*\[caminho\]$/);
    assert.ok(does.length <= 120);
    const json = JSON.stringify(snap);
    for (const bad of [ROLE_TAIL, 'hunter2', 'joao@', '10.0.0.5', '/srv/', '"description"']) assert.ok(!json.includes(bad), `${policy}: vazou ${bad}`);
    assert.equal(snap.catalog.agents.find((a) => a.name === 'revisor').does, does);
  }
});

test('descrição em bloco multilinha não vira função', async () => {
  const fx = buildFixture();
  const dir = path.join(fx.base, 'projects', SECRETS.folder, '.claude', 'agents');
  for (const [i, mark] of ['|', '|-', '>', '>+'].entries())
    fs.writeFileSync(path.join(dir, `bloco${i}.md`), `---\nname: bloco${i}\ndescription: ${mark}\n  texto ${SECRETS.thinking}\n---\n`);
  const cfg = cfgWith('publico', 'Demo');
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  const snap = buildSnapshot(col, cfg);
  const staff = snap.rooms.find((r) => r.name === 'Demo').staff.filter((a) => a.name.startsWith('bloco'));
  assert.equal(staff.length, 4);
  for (const a of staff) assert.equal(a.does, null);
  assert.ok(!JSON.stringify(snap).includes(SECRETS.thinking));
});

test('sala hidden não expõe função dos agentes', () => {
  const fx = buildFixture();
  const cfg = cfgWith('publico', 'Escondida', true);
  cfg.rooms[SECRETS.folder].hidden = true;
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  assert.ok(!JSON.stringify(buildSnapshot(col, cfg)).includes(ROLE_WORD));
});
