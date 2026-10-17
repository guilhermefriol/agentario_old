import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
globalThis.__crypto = crypto;
import { buildFixture, SECRETS } from './fixture.mjs';
import { isCodexCommand, verdictOf } from '../src/audit.mjs';
import { makeRoots } from '../src/paths.mjs';
import { DEFAULTS } from '../src/config.mjs';
import { Collector } from '../src/collector.mjs';
import { buildSnapshot } from '../src/snapshot.mjs';

const CMD_SECRET = 'CMD_CODEX_SECRETO_404';
const OUT_SECRET = 'SAIDA_CODEX_SECRETA_505';

test('reconhece chamada do codex e ignora o resto', () => {
  assert.ok(isCodexCommand('cat /tmp/p.md | ~/.local/bin/codex exec --skip-git-repo-check -s read-only -'));
  assert.ok(isCodexCommand('codex exec -C x "oi"'));
  assert.ok(!isCodexCommand('echo codex'));
  assert.ok(!isCodexCommand('mycodex exec'));
  assert.ok(!isCodexCommand(null));
});

test('extrai só o último veredito, em enum fechado', () => {
  assert.equal(verdictOf('**Veredito: revisar** ... reavaliação ... **Veredito: aprovar**'), 'aprovado');
  assert.equal(verdictOf([{ type: 'text', text: 'Veredito — bloquear.' }]), 'bloqueado');
  assert.equal(verdictOf('Command running in background with ID: x'), 'sem veredito');
  assert.equal(verdictOf(undefined), 'sem veredito');
});

function withAudit({ result, done = true, ageMs = 60_000, otherRoom = false } = {}) {
  const fx = buildFixture();
  const proj = path.join(fx.base, 'projects', SECRETS.folder);
  const otherProj = path.join(fx.base, 'projects', 'outro-projeto');
  fs.mkdirSync(otherProj, { recursive: true });
  const sid = '99999999-2222-3333-4444-555555555555';
  const dir = path.join(fx.base, 'projects', '-fake-audit');
  fs.mkdirSync(dir, { recursive: true });
  const ts = (d) => new Date(Date.now() - d).toISOString();
  const cwd = otherRoom ? otherProj : proj;
  const lines = [
    { type: 'assistant', cwd, timestamp: ts(ageMs + 5000), message: { content: [{ type: 'tool_use', id: 'cx1', name: 'Bash', input: { command: `cat plano.md | codex exec -s read-only - # ${CMD_SECRET}` } }] } },
  ];
  if (done) lines.push({ type: 'user', cwd, timestamp: ts(ageMs), message: { content: [{ type: 'tool_result', tool_use_id: 'cx1', content: `${OUT_SECRET}\n${result}` }] }, toolUseResult: { stdout: OUT_SECRET } });
  fs.writeFileSync(path.join(dir, sid + '.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(fx.base, 'sessions', '2.json'), JSON.stringify({ pid: process.pid, sessionId: sid, cwd, status: 'busy' }));
  const cfg = { ...DEFAULTS, alerts: { ...DEFAULTS.alerts }, _file: null, showRealNames: true,
    rooms: { [SECRETS.folder]: { alias: 'Sala 1', display: 'Alvo', tasks: 'publico' }, 'outro-projeto': { alias: 'Sala 2', display: 'Outro', tasks: 'publico' } } };
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  return buildSnapshot(col, cfg);
}

test('veredito bloqueado vira alerta e nenhum texto vaza', () => {
  const snap = withAudit({ result: '**Veredito: bloquear**' });
  const json = JSON.stringify(snap);
  for (const s of [CMD_SECRET, OUT_SECRET, 'codex exec', 'plano.md', ...Object.values(SECRETS).filter((v) => v !== SECRETS.folder)]) assert.ok(!json.includes(s), s);
  const room = snap.rooms.find((r) => r.name === 'Alvo');
  assert.equal(room.auditor.verdict, 'bloqueado');
  assert.equal(room.auditor.state, 'livre');
  assert.ok(snap.alerts.some((a) => a.type === 'codex' && a.room === 'Alvo'));
  assert.deepEqual(Object.keys(room.auditor).sort(), ['state', 'today', 'verdict', 'verdictAt']);
});

test('auditoria em andamento acende a sala e não gera alerta', () => {
  const snap = withAudit({ done: false, ageMs: 10_000 });
  const room = snap.rooms.find((r) => r.name === 'Alvo');
  assert.equal(room.auditor.state, 'auditando');
  assert.equal(room.lit, true);
  assert.ok(!snap.alerts.some((a) => a.type === 'codex'));
});

test('alerta do codex expira depois de 30 minutos', () => {
  const snap = withAudit({ result: 'Veredito: bloquear', ageMs: 31 * 60_000 });
  assert.equal(snap.rooms.find((r) => r.name === 'Alvo').auditor.verdict, 'bloqueado');
  assert.ok(!snap.alerts.some((a) => a.type === 'codex'));
});

test('auditoria é atribuída à sala certa', () => {
  const snap = withAudit({ result: 'Veredito: aprovar', otherRoom: true });
  assert.equal(snap.rooms.find((r) => r.name === 'Outro').auditor.verdict, 'aprovado');
  assert.equal(snap.rooms.find((r) => r.name === 'Alvo').auditor, null);
});

test('execução em segundo plano conta como sem veredito', () => {
  const snap = withAudit({ result: 'Command running in background with ID: abc' });
  assert.equal(snap.rooms.find((r) => r.name === 'Alvo').auditor.verdict, 'sem veredito');
});

test('veredito real não é mascarado por chamada posterior sem veredito', async () => {
  const { verdictOf: v } = await import('../src/audit.mjs');
  assert.equal(v('x'), 'sem veredito');
  const fx = buildFixture();
  const dir = path.join(fx.base, 'projects', '-fake-audit2');
  fs.mkdirSync(dir, { recursive: true });
  const sid = '88888888-2222-3333-4444-555555555555';
  const cwd = path.join(fx.base, 'projects', SECRETS.folder);
  const ts = (d) => new Date(Date.now() - d).toISOString();
  const L = [
    { type: 'assistant', cwd, timestamp: ts(9000), message: { content: [{ type: 'tool_use', id: 'a1', name: 'Bash', input: { command: 'codex exec -' } }] } },
    { type: 'user', cwd, timestamp: ts(8000), message: { content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'Veredito: aprovar' }] } },
    { type: 'assistant', cwd, timestamp: ts(5000), message: { content: [{ type: 'tool_use', id: 'a2', name: 'Bash', input: { command: 'codex exec - > out.txt' } }] } },
    { type: 'user', cwd, timestamp: ts(4000), message: { content: [{ type: 'tool_result', tool_use_id: 'a2', content: '' }] } },
  ];
  fs.writeFileSync(path.join(dir, sid + '.jsonl'), L.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const cfg = { ...DEFAULTS, alerts: { ...DEFAULTS.alerts }, _file: null, rooms: { [SECRETS.folder]: { alias: 'Sala 1', display: 'Alvo', tasks: 'oculto' } } };
  const col = new Collector(makeRoots(fx.base), cfg);
  col.tick();
  const room = buildSnapshot(col, cfg).rooms.find((r) => r.name === 'Alvo');
  assert.equal(room.auditor.verdict, 'aprovado');
  assert.equal(room.auditor.today, 2);
});
