// Teste visual: cena determinística (snapshot fixo, relógio parado, Math.random com semente).
// `npm run visual` compara com __screenshots__/; `npm run visual:update` regrava (revise as imagens!).
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
  await page.clock.pauseAt(T + 1000); // relógio parado: só anda com runFor
  await page.goto('/?debug=1&rotate=0&tour=0' + query);
  // o snapshot chega por SSE (evento, não timer): espera em tempo real, sem mexer no relógio falso
  await expect.poll(() => page.evaluate(() => !!window.__pr?.office?.plan), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(30_000); // gente caminha, câmera assenta
}
const focus = (page, id) => page.evaluate((id) => {
  const o = window.__pr.office;
  const lr = [...o.plan.rooms, ...o.plan.leisure].find((r) => r.room.id === id || r.room.name === id);
  window.__pr.camera.focusRoom(lr);
}, id);
const shot = (page, name) => expect(page).toHaveScreenshot(name + '.png');

test('visão geral', async ({ page }) => { await open(page); await shot(page, 'visao-geral'); });

test('zoom numa sala de projeto', async ({ page }) => {
  await open(page);
  await focus(page, 'Atlas'); await page.clock.runFor(4000);
  await shot(page, 'zoom-sala');
});

test('cartão de agente', async ({ page }) => {
  await open(page);
  await focus(page, 'Atlas'); await page.clock.runFor(4000);
  const pos = await page.evaluate(() => { const e = [...window.__pr.office.entities.values()].find((x) => x.kind === 'staff' && x.lr.room.name === 'Atlas' && !x.away); return window.__pr.screenOf(e.key); });
  const box = await page.locator('#screen').boundingBox();
  await page.mouse.move(box.x + pos[0], box.y + pos[1] - 8);
  await page.clock.runFor(300);
  await expect(page.locator('#tip')).toBeVisible();
  await shot(page, 'cartao-agente');
});

test('academia', async ({ page }) => { await open(page); await focus(page, 'lz:gym'); await page.clock.runFor(4000); await shot(page, 'academia'); });

test('igreja com nome completo', async ({ page }) => {
  await open(page);
  await focus(page, 'lz:church'); await page.clock.runFor(4000);
  await expect(page.locator('#back')).toHaveText('← Visão geral · Igreja Adventista da I.A. dos Últimos Dias');
  await shot(page, 'igreja');
});

test('mesa do Friol', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__pr.camera.focusRoom(window.__pr.office.plan.cc));
  await page.clock.runFor(4000);
  await shot(page, 'friol');
});

test('modo demonstração', async ({ page }) => {
  await open(page);
  await page.click('#logo');
  await page.clock.runFor(8_000); // abaixo dos 40 s sem dado novo, senão aparece "sem sinal do coletor"
  await expect(page.locator('#signal')).toBeHidden();
  await expect(page.locator('#sub')).toHaveText('escritório dos agentes · modo demonstração');
  const ok = await page.evaluate(() => { const t = window.__pr.view().totals; return document.querySelectorAll('#kpis b')[3].textContent === `${t.roomsLit}/${t.rooms}`; });
  expect(ok).toBe(true);
  await shot(page, 'demonstracao');
});
