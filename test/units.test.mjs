import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redact, label } from '../src/redact.mjs';
import { JsonlTail } from '../src/tail.mjs';

test('redact remove dados sensíveis comuns', () => {
  const s = redact('ver 192.168.0.10, a@b.com, /etc/passwd, https://x.y/z, CPF 123.456.789-09, token=abc123, ghp_abcdefghijklmnop', 200);
  for (const bad of ['192.168', 'a@b.com', '/etc/passwd', 'https://', '123.456', 'abc123', 'ghp_']) assert.ok(!s.includes(bad), bad);
});
test('redact limita tamanho', () => assert.ok(redact('x'.repeat(500)).length <= 60));
test('label aceita só caracteres seguros', () => assert.equal(label('<script>alert(1)</script>'), 'scriptalert1script'));

test('tail lê incremental, segura linha incompleta e detecta truncamento', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-tail-')), 'a.jsonl');
  fs.writeFileSync(f, '{"a":1}\n{"a":2');
  const t = new JsonlTail(f); const got = [];
  let resets = 0; t.onReset = () => resets++;
  t.poll((r) => got.push(r.a));
  assert.deepEqual(got, [1]);
  fs.appendFileSync(f, '}\n{"a":3}\nlixo\n');
  t.poll((r) => got.push(r.a));
  assert.deepEqual(got, [1, 2, 3]);
  fs.writeFileSync(f, '{"a":9}\n');
  t.poll((r) => got.push(r.a));
  assert.deepEqual(got, [1, 2, 3, 9]);
  assert.equal(resets, 1);
});

import { registerProjects, DEFAULTS, loadConfig } from '../src/config.mjs';
test('projeto novo nasce com alias genérico e tarefas visíveis', () => {
  const cfg = { ...DEFAULTS, rooms: { velho: { alias: 'Sala 3', display: 'Velho', tasks: 'publico', hidden: false } }, _file: null };
  registerProjects(cfg, ['velho', 'cliente-x', 'beta']);
  assert.equal(cfg.rooms.velho.tasks, 'publico');
  for (const k of ['cliente-x', 'beta']) {
    assert.equal(cfg.rooms[k].tasks, 'publico');
    assert.equal(cfg.rooms[k].display, null);
    assert.match(cfg.rooms[k].alias, /^Sala \d+$/);
  }
  assert.notEqual(cfg.rooms['cliente-x'].alias, cfg.rooms.beta.alias);
});
test('política inválida no config cai para oculto', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-cfg-')), 'x.json');
  fs.writeFileSync(f, JSON.stringify({ rooms: { a: { tasks: 'tudo', display: 'A' } } }));
  assert.equal(loadConfig(f).rooms.a.tasks, 'oculto');
});

test('política ausente vira publico; interno/oculto são mantidos', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-cfg-')), 'y.json');
  fs.writeFileSync(f, JSON.stringify({ rooms: { a: { alias: 'Sala 1' }, b: { tasks: 'interno' }, c: { tasks: 'oculto' } } }));
  const cfg = loadConfig(f);
  assert.equal(cfg.rooms.a.tasks, 'publico');
  assert.equal(cfg.rooms.b.tasks, 'interno');
  assert.equal(cfg.rooms.c.tasks, 'oculto');
  assert.equal(cfg.lobbyTasks, 'publico');
});

import { roleText } from '../src/snapshot.mjs';
test('roleText: redige antes de cortar, 1ª frase, sem prefixo, até 120', () => {
  assert.equal(roleText(null), undefined);
  assert.equal(roleText(42), undefined);
  assert.equal(roleText('   '), undefined);
  assert.equal(roleText('Use para revisar código. Depois outra coisa.'), 'Revisar código');
  assert.equal(roleText('Use this agent when the user asks about hooks. More.'), 'The user asks about hooks');
  // e-mail com ponto no meio não pode ser cortado como fim de frase
  const r = roleText('Avisa joao.silva@empresa.com.br e 10.0.0.5 sobre deploys. Resto');
  assert.equal(r, 'Avisa [e-mail] e [ip] sobre deploys');
  assert.equal(roleText('Lê /etc/hosts. Depois'), 'Lê [caminho]');
  const long = roleText('palavra '.repeat(40));
  assert.ok(long.length <= 120 && long.endsWith('…'));
});
