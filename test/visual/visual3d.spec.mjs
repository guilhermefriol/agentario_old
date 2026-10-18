// Modo 3D (v7): cenas determinísticas (mesmo esquema do visual.spec.mjs, giro automático desligado) e
// testes funcionais da troca 2D↔3D. `npm run visual` roda tudo; `npm run visual:update` regrava (revise!).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const SNAP = JSON.parse(fs.readFileSync(new URL('./snapshot.json', import.meta.url), 'utf8'));

async function open(page, query = '') {
  await page.addInitScript(() => {
    let a = 0x9e3779b9; // mulberry32
    Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  const T = SNAP.generatedAt + 60_000;
  await page.clock.install({ time: T });
  await page.clock.pauseAt(T + 1000);
  await page.goto('/?debug=1&rotate=0&tour=0&gira=0' + query);
  await expect.poll(() => page.evaluate(() => !!window.__pr?.office?.plan), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}
// abre já no 3D e confere que é 3D de verdade (módulo carregado e quadros desenhados) antes de capturar
async function open3d(page, query = '') {
  await open(page, '&view=3d' + query);
  await expect.poll(() => page.evaluate(() => window.__pr.viewMode()), { timeout: 15_000 }).toBe('3d');
  await page.clock.runFor(30_000);
  expect(await page.evaluate(() => window.__pr.view3d().frames)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__pr.view3d().ready.then(() => true))).toBe(true);
}
const focus = (page, id) => page.evaluate((id) => {
  const o = window.__pr.office;
  const lr = [...o.plan.rooms, ...o.plan.leisure].find((r) => r.room.id === id || r.room.name === id);
  window.__pr.camera.focusRoom(lr);
}, id);
const shot = (page, name) => expect(page).toHaveScreenshot(name + '.png', { maxDiffPixelRatio: 0.01 });
const hoverAgent = async (page, room) => {
  const pos = await page.evaluate((room) => { const e = [...window.__pr.office.entities.values()].find((x) => x.kind === 'staff' && x.lr.room.name === room && !x.away); return window.__pr.screenOf(e.key); }, room);
  const box = await page.locator('#screen').boundingBox();
  await page.mouse.move(box.x + pos[0], box.y + pos[1] - 8);
  await page.clock.runFor(300);
};

test.describe('cenas 3D', () => {
  test('3d visão geral', async ({ page }) => { await open3d(page); await shot(page, '3d-visao-geral'); });
  test('3d zoom numa sala', async ({ page }) => { await open3d(page); await focus(page, 'Atlas'); await page.clock.runFor(4000); await shot(page, '3d-zoom-sala'); });
  test('3d cartão de agente', async ({ page }) => {
    await open3d(page); await focus(page, 'Atlas'); await page.clock.runFor(4000);
    await hoverAgent(page, 'Atlas');
    await expect(page.locator('#tip')).toBeVisible();
    await shot(page, '3d-cartao-agente');
  });
  test('3d igreja', async ({ page }) => {
    await open3d(page); await focus(page, 'lz:church'); await page.clock.runFor(4000);
    await expect(page.locator('#back')).toHaveText('← Visão geral · Igreja Adventista da I.A. dos Últimos Dias');
    await shot(page, '3d-igreja');
  });
  test('3d demonstração', async ({ page }) => {
    await open3d(page); await page.click('#logo'); await page.clock.runFor(8_000);
    await expect(page.locator('#sub')).toHaveText('escritório dos agentes · modo demonstração');
    await shot(page, '3d-demonstracao');
  });
});

test.describe('troca 2D ↔ 3D', () => {
  test('isométrico não baixa o Three.js; o botão liga o 3D e volta mantendo a sala', async ({ page }) => {
    const vendor = [];
    page.on('request', (r) => { if (r.url().includes('/vendor/')) vendor.push(r.url()); });
    await open(page); await page.clock.runFor(5000);
    expect(vendor).toEqual([]);
    await expect(page.locator('#view-btn')).toHaveText('3D');
    await focus(page, 'Atlas'); await page.clock.runFor(2000);
    await page.click('#view-btn');
    await expect.poll(() => page.evaluate(() => window.__pr.viewMode()), { timeout: 15_000 }).toBe('3d');
    await page.clock.runFor(3000);
    expect(vendor.length).toBeGreaterThan(0);
    await expect(page.locator('#view-btn')).toHaveText('2D');
    expect(await page.evaluate(() => window.__pr.camera.focused)).toBe(await page.evaluate(() => [...window.__pr.office.plan.rooms].find((r) => r.room.name === 'Atlas').room.id));
    await hoverAgent(page, 'Atlas');
    await expect(page.locator('#tip')).toBeVisible();
    await page.click('#view-btn');
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => window.__pr.viewMode())).toBe('iso');
    await expect(page.locator('canvas.screen3d')).toHaveCount(0);
    await expect(page.locator('#back')).toBeVisible();
    await hoverAgent(page, 'Atlas');
    await expect(page.locator('#tip')).toBeVisible();
  });

  test('três cliques seguidos terminam no 3D', async ({ page }) => {
    await open(page); await page.clock.runFor(2000);
    for (let i = 0; i < 3; i++) await page.click('#view-btn');
    await expect.poll(() => page.evaluate(() => window.__pr.viewMode()), { timeout: 15_000 }).toBe('3d');
    await page.clock.runFor(2000);
    await expect(page.locator('canvas.screen3d')).toHaveCount(1);
  });

  test('Three.js indisponível: fica no 2D com aviso', async ({ page }) => {
    await page.route('**/vendor/**', (r) => r.fulfill({ status: 404, body: 'não' }));
    await open(page); await page.clock.runFor(2000);
    await page.click('#view-btn');
    await expect(page.locator('#view-msg')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.__pr.viewMode())).toBe('iso');
    await expect(page.locator('#view-btn')).toHaveText('3D');
  });

  test('perda do contexto gráfico volta ao 2D', async ({ page }) => {
    await open3d(page);
    await page.evaluate(() => document.querySelector('canvas.screen3d').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect.poll(() => page.evaluate(() => window.__pr.viewMode()), { timeout: 15_000 }).toBe('iso');
    await expect(page.locator('#view-msg')).toBeVisible();
    await page.clock.runFor(2000);
    await expect(page.locator('canvas.screen3d')).toHaveCount(0);
  });

  test('mudar a planta (demonstração liga/desliga) não acumula geometria nem textura', async ({ page }) => {
    await open3d(page);
    const mem = () => page.evaluate(() => window.__pr.view3d().info);
    await page.click('#logo'); await page.clock.runFor(5000);
    await page.click('#logo'); await page.clock.runFor(5000);
    const a = await mem();
    for (let i = 0; i < 3; i++) { await page.click('#logo'); await page.clock.runFor(5000); await page.click('#logo'); await page.clock.runFor(5000); }
    const b = await mem();
    expect(b.geometries).toBe(a.geometries);
    // texturas: poucas poses por pessoa presente (quem sai do prédio leva as suas junto) + balões e partículas
    expect(b.textures).toBeLessThanOrEqual((b.figs + b.bubs) * 10 + 80);
  });
});

test.describe('tela de alta densidade', () => {
  test.use({ deviceScaleFactor: 2 });
  test('DPR 2: o mouse acerta a pessoa no 3D', async ({ page }) => {
    await open3d(page); await focus(page, 'Atlas'); await page.clock.runFor(4000);
    await hoverAgent(page, 'Atlas');
    await expect(page.locator('#tip')).toBeVisible();
  });
});
