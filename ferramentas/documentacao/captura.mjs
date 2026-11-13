// Captura de telas do app (local) e da simulação do Wokwi para a documentação.
// Uso: node captura.mjs <pasta-do-projeto>
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PROJ = process.argv[2];
const OUT = path.join(PROJ, 'docs', 'img');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP = 'http://localhost:5174';
const API = 'http://localhost:3002';
const ARGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
];
const so = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function esperar(fn, ms, rotulo) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await so(1000);
  }
  throw new Error(`Tempo esgotado: ${rotulo}`);
}

// ---------------- API (token para comandos diretos) ----------------
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@viveiro.local', senha: 'trocar123' }),
}).then((r) => r.json());
const TOKEN = login.accessToken;
const api = (p, opt = {}) =>
  fetch(`${API}${p}`, {
    ...opt,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(opt.headers ?? {}) },
  }).then((r) => r.json());
const [ctrl] = await api('/controladores');
const comando = (texto) => api(`/controladores/${ctrl.id}/comandos`, { method: 'POST', body: JSON.stringify({ texto }) });

// ---------------- Wokwi ----------------
const wBrowser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ARGS, userDataDir: path.join(process.env.TEMP, 'wokwi-captura') });
const w = await wBrowser.newPage();
await w.setViewport({ width: 2200, height: 1150 });
log('abrindo Wokwi');
await w.goto('https://wokwi.com/projects/new/esp32', { waitUntil: 'networkidle2', timeout: 120000 });
await esperar(() => w.evaluate(() => !!window.monaco && monaco.editor.getEditors().length > 0), 60000, 'monaco');

const sketch = fs.readFileSync(path.join(PROJ, 'firmware', 'sketch.ino'), 'utf8');
const diagram = fs.readFileSync(path.join(PROJ, 'firmware', 'diagram.json'), 'utf8');
async function clicarTexto(page, texto) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('div,span,button,a')].find((e) => e.textContent.trim() === t && e.children.length === 0);
    if (el) el.click();
    return !!el;
  }, texto);
}
// Bibliotecas: um projeto novo não tem libraries.txt; adicionar uma pelo Library Manager cria o arquivo.
await clicarTexto(w, 'Library Manager');
await so(1000);
await w.click('[aria-label="Add a new library"]');
await so(800);
await w.keyboard.type('RTClib');
await so(2000);
await w.evaluate(() => {
  const el = [...document.querySelectorAll('li')].filter((e) => e.textContent.trim() === 'RTClib' && e.getBoundingClientRect().width > 0);
  el[el.length - 1]?.click();
});
await so(1500);
await clicarTexto(w, 'libraries.txt');
await so(1200);
log(
  'libraries.txt:',
  await w.evaluate(() => {
    const m = monaco.editor.getModels().find((x) => x.uri.toString().includes('libraries'));
    if (!m) return 'sem modelo';
    m.setValue('RTClib\nArduinoJson\nPubSubClient\n');
    return 'ok';
  }),
);
await clicarTexto(w, 'diagram.json');
await so(1500);
await clicarTexto(w, 'sketch.ino');
await so(1000);
const ok = await w.evaluate(
  (s, d) => {
    const ms = monaco.editor.getModels();
    const sk = ms.find((m) => m.uri.toString() === 'vfs:sketch.ino');
    const dg = ms.find((m) => m.uri.toString() === 'vfs:diagram.json');
    if (!sk || !dg) return ms.map((m) => m.uri.toString()).join(',');
    sk.setValue(s);
    dg.setValue(d);
    return 'ok';
  },
  sketch,
  diagram,
);
log('código no Wokwi:', ok);
await so(2000);

const iniciar = async () =>
  w.evaluate(() => {
    const b = [...document.querySelectorAll('button,[role=button]')].find((e) =>
      /start the simulation/i.test(e.getAttribute('aria-label') ?? e.getAttribute('title') ?? ''),
    );
    if (b) b.click();
    return !!b;
  });
log('play:', await iniciar());
const serial = () =>
  w.evaluate(() => [...document.querySelectorAll('pre, [class*="serial"], [class*="Serial"], [class*="terminal"]')].map((e) => e.innerText).sort((a, b) => b.length - a.length)[0] ?? '');
{
  const fim = Date.now() + 600000;
  let n = 0;
  while (!(await serial()).includes('MQTT conectado')) {
    if (Date.now() > fim) {
      await w.screenshot({ path: path.join(OUT, '_debug-wokwi.png') });
      throw new Error('ESP32 não conectou. Serial: ' + (await serial()).slice(-600));
    }
    if (++n % 30 === 0) {
      const txt = await w.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
      log('aguardando…', JSON.stringify((await serial()).slice(-120)), '| tela:', txt.slice(0, 160));
      await w.screenshot({ path: path.join(OUT, '_debug-wokwi.png') });
    }
    await so(2000);
  }
}
log('ESP32 conectado');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).online, 60000, 'API ver online');
// Enquadra o circuito inteiro (menu "Zoom, grid, and more" > Fit)
{
  const labels = await w.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter((l) => /zoom|more|grid/i.test(l)));
  log('botões de zoom:', JSON.stringify(labels));
  let fit = false;
  if (labels.length) {
    await w.click(`[aria-label="${labels[0]}"]`);
    await so(700);
    fit = await w.evaluate(() => {
      const li = [...document.querySelectorAll('li')].find((e) => e.textContent.trim().startsWith('Fit'));
      li?.click();
      return !!li;
    });
  }
  if (!fit) {
    // foca o fundo do diagrama (logo acima do Serial Monitor) e aperta F
    const r = await w.evaluate(() => {
      const ser = [...document.querySelectorAll('pre, [class*="serial"], [class*="Serial"], [class*="terminal"]')]
        .map((e) => [e, e.innerText.length]).sort((x, y) => y[1] - x[1])[0]?.[0]?.getBoundingClientRect();
      return ser && { x: ser.left + 15, y: ser.top - 25 };
    });
    if (r) {
      await w.mouse.click(r.x, r.y);
      await so(300);
      await w.keyboard.press('f');
      fit = 'tecla F';
    }
  }
  log('fit:', fit);
  await so(1500);
}

async function shotWokwi(nome) {
  // recorta o circuito: união das peças <wokwi-*> + o Serial Monitor
  const r = await w.evaluate(() => {
    const pecas = [...document.querySelectorAll('*')].filter((e) => e.tagName.startsWith('WOKWI-') && e.getBoundingClientRect().width > 0);
    const rs = pecas.map((e) => e.getBoundingClientRect());
    const box = rs.reduce(
      (a, b) => ({ x1: Math.min(a.x1, b.left), y1: Math.min(a.y1, b.top), x2: Math.max(a.x2, b.right), y2: Math.max(a.y2, b.bottom) }),
      { x1: 1e9, y1: 1e9, x2: 0, y2: 0 },
    );
    const ser = [...document.querySelectorAll('pre, [class*="serial"], [class*="Serial"], [class*="terminal"]')]
      .map((e) => [e, e.innerText.length])
      .sort((a, b) => b[1] - a[1])[0]?.[0]
      ?.getBoundingClientRect();
    return { box, ser: ser && { x: ser.left, y: ser.top, w: ser.width, h: ser.height }, n: pecas.length };
  });
  await w.screenshot({ path: path.join(OUT, `${nome}-tela.png`) });
  if (r.n) {
    const m = 30;
    await w.screenshot({
      path: path.join(OUT, `${nome}-circuito.png`),
      clip: { x: Math.max(0, r.box.x1 - m), y: Math.max(0, r.box.y1 - m), width: r.box.x2 - r.box.x1 + 2 * m, height: r.box.y2 - r.box.y1 + 2 * m },
    });
  }
  if (r.ser && r.ser.w > 0) await w.screenshot({ path: path.join(OUT, `${nome}-serial.png`), clip: { x: r.ser.x, y: r.ser.y, width: r.ser.w, height: r.ser.h } });
  log('wokwi', nome, r.n, 'peças');
}

// ---------------- App ----------------
const aBrowser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ARGS, userDataDir: path.join(process.env.TEMP, 'app-captura') });
const a = await aBrowser.newPage();
// sem animação de piscar nos prints (senão o selo da bomba sai desbotado)
await a.evaluateOnNewDocument(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '.pulsar{animation:none!important}*{transition:none!important}';
    document.head.appendChild(st);
  });
});
await a.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1.5 });
await a.goto(APP, { waitUntil: 'networkidle2' });
await a.evaluate(() => localStorage.clear());
await a.reload({ waitUntil: 'networkidle2' });
await a.screenshot({ path: path.join(OUT, 'app-login.png') });
await a.type('input[type=email]', 'admin@viveiro.local');
await a.type('input[type=password]', 'trocar123');
await a.click('button[type=submit]');
await a.waitForSelector('::-p-text(Setores)', { timeout: 30000 });
await so(3000);
const shotApp = async (nome, full = false) => {
  await so(800);
  await a.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: full });
  log('app', nome);
};
const clicar = async (texto) => {
  const el = await a.waitForSelector(`::-p-text(${texto})`, { timeout: 15000 });
  await el.click();
};

await shotApp('painel-ocioso', true);
await shotWokwi('wokwi-ocioso');

// Acionamento manual
await clicar('Acionar agora');
await so(800);
await clicar('1 min');
await shotApp('acionar-modal');
await clicar('Acionar por 60 s');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.bomba, 30000, 'bomba ligar');
await so(2500);
await shotApp('painel-irrigando');
await shotWokwi('wokwi-irrigando');
await comando('parar');
await so(5000);

// Pausa visita
await clicar('Pausar irrigação');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.modo === 'PAUSA VISITA', 30000, 'pausa');
await so(2500);
await shotApp('painel-pausa');
await clicar('Retomar irrigação');
await so(4000);

// Só motor
await clicar('Só motor');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.modo === 'SO MOTOR', 30000, 'só motor');
await so(4000);
await shotApp('painel-so-motor');
await shotWokwi('wokwi-so-motor');
await clicar('Desligar motor');
await so(4000);

// Bloco vazio (só para o print) e volta
await comando('bloco 2 vazio');
await so(3000);
const card = await a.$('::-p-text(Bloco 2)');
await shotApp('painel-bloco-vazio');
await comando('bloco 2 mudas');
await so(2000);

// Rotina automática: põe o relógio do ESP32 perto das 07:00
await comando('hora 06:59:55');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.rotina === 'Manha' && (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.bomba, 60000, 'rotina Manha');
await so(1500);
await shotApp('painel-rotina');
await shotWokwi('wokwi-rotina');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).ultimoStatus?.setores?.[1]?.aberto, 60000, 'setor 2 da rotina');
await so(1000);
await shotWokwi('wokwi-rotina-setor2');

// Outras telas
await a.goto(`${APP}/rotinas`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('rotinas');
await clicar('Editar');
await so(1000);
await shotApp('rotina-form');
await a.keyboard.press('Escape');
await clicar('Nova rotina');
await so(500);
await a.select('select', 'adubacao');
await so(600);
await shotApp('rotina-form-adubacao');
await a.keyboard.press('Escape');

await a.goto(`${APP}/setores`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('setores', true);
await a.goto(`${APP}/historico`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('historico');
await clicar('Quem fez o quê');
await so(1500);
await shotApp('historico-comandos');
await a.goto(`${APP}/ajustes`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('ajustes', true);
await clicar('Novo usuário');
await so(600);
await shotApp('usuario-novo');
await a.keyboard.press('Escape');

// Celular
await a.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await a.goto(APP, { waitUntil: 'networkidle2' });
await so(2500);
await shotApp('mobile-painel');
await a.goto(`${APP}/rotinas`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('mobile-rotinas');
await a.goto(`${APP}/historico`, { waitUntil: 'networkidle2' });
await so(2000);
await shotApp('mobile-historico');

// Offline: para a simulação
await w.evaluate(() => {
  const b = [...document.querySelectorAll('button,[role=button]')].find((e) => /stop the simulation/i.test(e.getAttribute('aria-label') ?? e.getAttribute('title') ?? ''));
  if (b) b.click();
});
await a.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1.5 });
await a.goto(APP, { waitUntil: 'networkidle2' });
log('aguardando o broker marcar offline (~45 s)');
await esperar(async () => (await api(`/controladores/${ctrl.id}`)).online === false, 120000, 'offline');
await a.reload({ waitUntil: 'networkidle2' });
await so(2000);
await shotApp('painel-offline');

await aBrowser.close();
await wBrowser.close();
log('fim');
