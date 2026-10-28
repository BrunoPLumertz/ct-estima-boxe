/* CT Estima Boxe · motor da página
   Hero sem vídeo: duas imagens movidas pelo scroll (a câmera desce pela corrente e pousa no saco),
   pó de giz em canvas, legendas em faixas de progresso, cronômetro de round, treino de manopla. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => {
    const t = clamp((p - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- divisão dos títulos em palavras e caracteres (uma vez) ---------- */
  $$('[data-split]').forEach((el, i) => {
    const mode = el.dataset.split;
    const text = el.textContent.trim();
    const em = (el.dataset.em || '').split(' ').filter(Boolean);
    const r = rng(1000 + i * 97);
    const spread = parseFloat(el.closest('.band')?.dataset.spread || '.5');
    const words = text.split(/\s+/);
    const totalChars = text.replace(/\s/g, '').length;
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = text;
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    let ci = 0;
    words.forEach((w, wi) => {
      const ws = document.createElement('span');
      ws.className = 'w';
      if (em.includes(w)) ws.classList.add('em');
      if (mode === 'char') {
        [...w].forEach(ch => {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          c.style.setProperty('--th', (ci / totalChars * spread + r() * 0.06).toFixed(3));
          c.style.setProperty('--jx', (-(16 + r() * 30)).toFixed(1) + 'px');
          ws.appendChild(c);
          ci++;
        });
      } else {
        ws.textContent = w;
        ws.style.setProperty('--th', (wi / words.length * 0.5 + r() * 0.04).toFixed(3));
      }
      vis.appendChild(ws);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    el.textContent = '';
    el.append(sr, vis);
  });

  /* ---------- HERO ---------- */
  const hero = $('.hero');
  const cam = $('.cam');
  const shotA = $('.shot-a');
  const shotB = $('.shot-b');
  const flare = $('.flare');
  const cue = $('.cue');
  const canvas = $('.dust');
  const settleCta = $('.band--settle .btn');

  const F = 0.035; // borda suavizada das faixas, em progresso (~17vh no intervalo de 480vh)
  const bands = $$('.band').map((el, i, all) => ({
    el,
    a: parseFloat(el.dataset.a),
    b: parseFloat(el.dataset.b),
    ramp: el.dataset.ramp ? parseFloat(el.dataset.ramp) : 0,
    first: i === 0,
    last: i === all.length - 1,
    op: -1,
    k: -1,
    on: null
  }));

  let target = 0;
  let shown = 0;
  let rafId = null;
  let lastTick = 0;
  let scrubOn = false;
  let heroOnScreen = true;
  let loadK = 0;
  let heroInit = false;
  const camCache = { a: '', b: '', ob: -1, fl: -1, cue: null };

  function heroProgress() {
    const r = hero.getBoundingClientRect();
    const range = r.height - innerHeight;
    return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
  }

  function updateCaptions(p) {
    for (const b of bands) {
      const f = Math.min(F, (b.b - b.a) / 3);
      const inn = b.first ? 1 : smoothstep(p, b.a, b.a + f);
      const out = b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      const op = inn * out;
      const ramp = b.ramp || Math.min(0.03, (b.b - b.a) * 0.35);
      let k = clamp((p - b.a) / ramp, 0, 1);
      if (b.first) k = Math.max(k, loadK);
      if (Math.abs(op - b.op) > 0.004 || ((op === 0 || op === 1) && op !== b.op)) {
        b.op = op;
        b.el.style.opacity = op.toFixed(3);
      }
      if (Math.abs(k - b.k) > 0.008 || ((k === 0 || k === 1) && k !== b.k)) {
        b.k = k;
        b.el.style.setProperty('--k', k.toFixed(3));
      }
      const on = op > 0.5;
      if (on !== b.on) {
        b.on = on;
        b.el.classList.toggle('on', on);
        if (b.last && settleCta) {
          if (on) settleCta.removeAttribute('tabindex');
          else settleCta.setAttribute('tabindex', '-1');
        }
      }
    }
  }

  function updateCamera(p) {
    // A: a câmera desce pela corrente (a imagem sobe e aproxima)
    // no clarão a corrente passa rente à lente: zoom rápido para cima, para fora do quadro
    const ta = easeIO(clamp(p / 0.64, 0, 1));
    const tz = smoothstep(p, 0.47, 0.62);
    const ta3 = `translate3d(0,${(-12 * ta - 16 * tz).toFixed(3)}%,0) scale(${(1.08 + 0.22 * ta + 0.8 * tz * tz).toFixed(4)})`;
    // B: chega ao saco (vem de cima e recua até o enquadramento final)
    const tb = easeOut(clamp((p - 0.46) / 0.54, 0, 1));
    const tb3 = `translate3d(0,${(8 * (1 - tb)).toFixed(3)}%,0) scale(${(1.22 - 0.2 * tb).toFixed(4)})`;
    const ob = smoothstep(p, 0.5, 0.6);
    const fl = Math.pow(Math.max(0, 1 - Math.abs(p - 0.55) / 0.09), 1.4);
    if (ta3 !== camCache.a) { camCache.a = ta3; shotA.style.transform = ta3; }
    if (tb3 !== camCache.b) { camCache.b = tb3; shotB.style.transform = tb3; }
    if (Math.abs(ob - camCache.ob) > 0.003 || ((ob === 0 || ob === 1) && ob !== camCache.ob)) {
      camCache.ob = ob;
      shotB.style.opacity = ob.toFixed(3);
    }
    if (Math.abs(fl - camCache.fl) > 0.003 || (fl === 0 && camCache.fl !== 0)) {
      camCache.fl = fl;
      flare.style.opacity = fl.toFixed(3);
    }
    const gone = p > 0.03;
    if (gone !== camCache.cue) { camCache.cue = gone; cue.classList.toggle('gone', gone); }
  }

  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    const k = 0.16; // suavização por quadro a 60fps
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) {
      shown = target;
      rafId = null;
      lastTick = 0;
    } else {
      rafId = requestAnimationFrame(tick);
    }
    updateCamera(shown);
    updateCaptions(shown);
  }

  function onScroll() {
    if (!scrubOn) return;
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }

  function rampLoad() {
    // a faixa 1 abre montada: rampa de tempo única que passa o bastão para o scroll
    const t0 = performance.now();
    const step = now => {
      loadK = easeOut(clamp((now - t0) / 1100, 0, 1));
      if (scrubOn) updateCaptions(shown);
      if (loadK < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initHeroOnce() {
    if (heroInit) return;
    heroInit = true;
    const imgA = new Image();
    imgA.onload = () => {
      shotA.style.backgroundImage = "url('assets/hero-corrente.jpg')";
      cam.classList.add('ready');
      const imgB = new Image();
      imgB.onload = () => { shotB.style.backgroundImage = "url('assets/hero-saco.jpg')"; };
      imgB.src = 'assets/hero-saco.jpg';
    };
    imgA.onerror = () => cam.classList.add('failed'); // a página segue completa sobre o fundo
    imgA.src = 'assets/hero-corrente.jpg';
    rampLoad();
  }

  /* pó de giz: deriva lenta, mais forte no feixe de luz, sobe quando a câmera desce */
  const dust = { ctx: canvas.getContext('2d'), w: 0, h: 0, parts: [], raf: null, last: 0, lastShown: 0 };
  function dustResize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dust.w = canvas.clientWidth;
    dust.h = canvas.clientHeight;
    canvas.width = Math.round(dust.w * dpr);
    canvas.height = Math.round(dust.h * dpr);
    dust.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = clamp(Math.round(dust.w * dust.h / 15000), 40, 110);
    const r = rng(7);
    dust.parts = Array.from({ length: n }, () => ({
      x: r() * dust.w,
      y: r() * dust.h,
      z: 0.4 + r() * 0.9,
      vx: (r() - 0.5) * 0.008,
      vy: (r() - 0.6) * 0.006,
      rad: 0.5 + r() * 1.6,
      a: 0.18 + r() * 0.5,
      ph: r() * Math.PI * 2
    }));
  }
  function dustTick(now) {
    const dt = Math.min(50, now - (dust.last || now));
    dust.last = now;
    const { ctx, w, h } = dust;
    const dy = (shown - dust.lastShown) * h * 2.2;
    dust.lastShown = shown;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f3dfb0';
    const cx = w / 2;
    const sig = w * 0.17;
    for (const p of dust.parts) {
      p.x += p.vx * dt * p.z;
      p.y += p.vy * dt * p.z - dy * p.z;
      if (p.y < -10) p.y += h + 20;
      else if (p.y > h + 10) p.y -= h + 20;
      if (p.x < -10) p.x += w + 20;
      else if (p.x > w + 10) p.x -= w + 20;
      const beam = Math.exp(-Math.pow((p.x - cx) / sig, 2));
      const tw = 0.75 + 0.25 * Math.sin(now * 0.0012 + p.ph);
      ctx.globalAlpha = p.a * (0.22 + 0.78 * beam) * tw;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.rad * p.z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    dust.raf = requestAnimationFrame(dustTick);
  }
  function dustSync() {
    const run = scrubOn && heroOnScreen && !document.hidden;
    if (run && dust.raf === null) {
      if (!dust.parts.length) dustResize();
      dust.last = 0;
      dust.lastShown = shown;
      dust.raf = requestAnimationFrame(dustTick);
    } else if (!run && dust.raf !== null) {
      cancelAnimationFrame(dust.raf);
      dust.raf = null;
    }
  }
  dust.raf = null;

  /* portão do hero estático: idêntico às media queries do CSS, decidido ao vivo */
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; b.on = null; });
    camCache.a = camCache.b = '';
    camCache.ob = camCache.fl = -1;
    camCache.cue = null;
    target = shown = heroProgress();
    updateCamera(shown);
    updateCaptions(shown);
    onScroll();
    dustSync();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    dustSync();
    [shotA, shotB, flare].forEach(el => { el.style.transform = ''; el.style.opacity = ''; });
    if (settleCta) settleCta.removeAttribute('tabindex');
  }
  function applyHeroMode() {
    if (GATES.some(q => matchMedia(q).matches)) disableScrub();
    else enableScrub();
  }
  const MQLS = GATES.map(q => matchMedia(q));
  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));

  new IntersectionObserver(entries => {
    heroOnScreen = entries[0].isIntersecting;
    if (heroOnScreen) onScroll();
    dustSync();
  }).observe(hero);

  /* ---------- PÁGINA ---------- */
  const nav = $('#nav');
  const clock = $('.clock');
  const clockLabel = $('.clock-label');
  const clockTime = $('.clock-time');
  const rounds = $$('[data-round]');
  const dividers = $$('.chain-divider');
  let pinned = false;

  // corrente: elos deitados e de lado, gerados uma vez
  dividers.forEach(div => {
    const path = $('path', div);
    let d = '';
    for (let x = 6, i = 0; x < 1194; x += 34, i++) {
      if (i % 2 === 0) {
        const w = 46, h = 18, r = 9;
        d += `M${x + r} ${20 - h / 2}H${x + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${20 + h / 2}H${x + r}A${r} ${r} 0 0 1 ${x + r} ${20 - h / 2}Z`;
      } else {
        d += `M${x + 2} 17H${x + 44}M${x + 2} 23H${x + 44}`;
      }
    }
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    div.drawCache = -1;
  });

  const clockState = { label: '', time: '', cp: -1, ding: null, at: 0, timer: null };
  function fmt(sec) {
    const s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function updateClock(force) {
    const now = performance.now();
    if (!force && now - clockState.at < 100) {
      clearTimeout(clockState.timer);
      clockState.timer = setTimeout(() => updateClock(true), 110);
      return;
    }
    clockState.at = now;
    const line = innerHeight * 0.4;
    let cur = rounds[0];
    for (const s of rounds) if (s.getBoundingClientRect().top <= line) cur = s;
    let t;
    if (cur === hero) t = heroProgress();
    else {
      const r = cur.getBoundingClientRect();
      t = clamp((line - r.top) / r.height, 0, 1);
    }
    const label = cur.dataset.round;
    const isBell = label === 'Gongo';
    const time = isBell ? '0:00' : fmt(180 * (1 - t));
    const cp = isBell ? 0 : 1 - t;
    if (label !== clockState.label) { clockState.label = label; clockLabel.textContent = label; }
    if (time !== clockState.time) { clockState.time = time; clockTime.textContent = time; }
    if (Math.abs(cp - clockState.cp) > 0.004) { clockState.cp = cp; clock.style.setProperty('--cp', cp.toFixed(3)); }
    if (isBell !== clockState.ding) { clockState.ding = isBell; clock.classList.toggle('ding', isBell); }
  }

  let navSolid = null;
  let pageRaf = null;
  function updatePage() {
    pageRaf = null;
    const solid = hero.getBoundingClientRect().bottom <= 69;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('solid', solid); }
    if (!pinned) {
      for (const div of dividers) {
        const r = div.getBoundingClientRect();
        const t = clamp((innerHeight - r.top) / (innerHeight * 0.55), 0, 1);
        const v = easeOut(t);
        if (Math.abs(v - div.drawCache) > 0.004 || (v === 1 && div.drawCache !== 1)) {
          div.drawCache = v;
          div.style.setProperty('--draw', v.toFixed(3));
        }
      }
    }
    updateClock();
  }
  function onPageScroll() {
    if (pageRaf === null) pageRaf = requestAnimationFrame(updatePage);
  }
  addEventListener('scroll', onPageScroll, { passive: true });
  addEventListener('resize', () => {
    if (scrubOn) { dustResize(); onScroll(); }
    onPageScroll();
  });

  /* entradas coreografadas */
  const revealIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.classList.add('in');
      revealIO.unobserve(el);
      const maxI = Math.max(0, ...$$('.r', el).map(r => parseFloat(r.style.getPropertyValue('--i')) || 0));
      setTimeout(() => el.classList.add('settled'), maxI * 90 + 900);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => revealIO.observe(el));

  /* um elemento vivo por seção, só enquanto ela está na tela */
  const liveIO = new IntersectionObserver(entries => {
    for (const e of entries) e.target.classList.toggle('live', e.isIntersecting);
  });
  $$('.sec').forEach(s => liveIO.observe(s));

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('paused', document.hidden);
    dustSync();
  });

  /* contadores */
  const counters = $$('.stat-v[data-count]').map(el => {
    const final = el.textContent.trim();
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = final;
    el.after(sr);
    el.setAttribute('aria-hidden', 'true');
    return {
      el,
      final,
      to: parseFloat(el.dataset.count),
      dec: parseInt(el.dataset.decimals || '0', 10),
      pre: el.dataset.prefix || '',
      done: false,
      raf: null
    };
  });
  const showCount = (c, v) => {
    const s = c.pre + v.toFixed(c.dec).replace('.', ',');
    if (s !== c.el.textContent) c.el.textContent = s;
  };
  function runCounter(c) {
    if (c.done) return;
    c.done = true;
    if (RM.matches) { c.el.textContent = c.final; return; }
    const t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / 1400, 0, 1);
      showCount(c, c.to * easeOut(t));
      c.raf = t < 1 ? requestAnimationFrame(step) : null;
      if (t === 1) c.el.textContent = c.final;
    };
    c.raf = requestAnimationFrame(step);
  }
  if (!RM.matches) counters.forEach(c => showCount(c, 0));
  const countIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      counters.filter(c => c.el === e.target).forEach(runCounter);
      countIO.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  counters.forEach(c => countIO.observe(c.el));

  /* dúvidas */
  $$('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const open = !item.classList.contains('open');
      item.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* aberto agora? (horário de Viamão) */
  (function hoursStatus() {
    const SCHED = { 0: [], 1: [[6, 10], [17, 21]], 2: [[7, 10], [17, 22]], 3: [[6, 10], [17, 21]], 4: [[7, 10], [17, 22]], 5: [[6, 10], [17, 21]], 6: [[9, 12]] };
    const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    let wd, hh, mm;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
      const get = t => parts.find(p => p.type === t).value;
      wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
      hh = parseInt(get('hour'), 10) % 24;
      mm = parseInt(get('minute'), 10);
    } catch (e) { return; }
    const now = hh + mm / 60;
    const row = $$('.board tbody tr').find(tr => tr.dataset.days.split(',').map(Number).includes(wd));
    if (row) row.classList.add('today');
    const status = $('.status');
    const text = $('.status-text');
    const open = SCHED[wd].find(([a, b]) => now >= a && now < b);
    if (open) {
      status.classList.add('open');
      text.textContent = `Aberto agora, até as ${open[1]}h`;
      return;
    }
    const later = SCHED[wd].find(([a]) => a > now);
    if (later) { text.textContent = `Fechado agora. Abre hoje às ${later[0]}h`; return; }
    for (let i = 1; i <= 7; i++) {
      const d = (wd + i) % 7;
      if (SCHED[d].length) {
        text.textContent = `Fechado agora. Abre ${i === 1 ? 'amanhã' : DAYS[d]} às ${SCHED[d][0][0]}h`;
        return;
      }
    }
  })();

  /* ---------- treino de manopla (o momento interativo) ---------- */
  const drill = {
    el: $('#drill'),
    call: $('.drill-call'),
    msg: $('.drill-msg'),
    ci: $('.drill-ci'),
    pads: $$('.pad'),
    pillars: $$('.pillar'),
    combos: [[1, 2], [1, 2, 3], [1, 1, 2]],
    c: 0,
    s: 0,
    done: false,
    fromPin: false,
    lock: false,
    timers: []
  };
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'link drill-reset';
  reset.textContent = 'Treinar de novo';
  reset.hidden = true;
  $('.drill-top').appendChild(reset);

  function drillRender() {
    const combo = drill.combos[Math.min(drill.c, drill.combos.length - 1)];
    const html = combo.map((n, i) => `<span class="${drill.done || i < drill.s ? 'hit' : ''}">${n}</span>`).join('<span class="dash">-</span>');
    if (drill.call.innerHTML !== html) drill.call.innerHTML = html;
    const gp = drill.done ? 1 : (drill.c + drill.s / combo.length) / drill.combos.length;
    drill.el.style.setProperty('--gp', gp.toFixed(3));
    drill.ci.textContent = String(Math.min(drill.c + 1, drill.combos.length));
  }
  function say(text, err) {
    drill.msg.textContent = text;
    drill.msg.classList.toggle('err', !!err);
  }
  function kick(pad, cls) {
    pad.classList.remove('pop', 'miss');
    void pad.offsetWidth;
    pad.classList.add(cls);
  }
  function drillComplete(fromPin) {
    drill.done = true;
    drill.fromPin = !!fromPin;
    drill.c = drill.combos.length - 1;
    drill.s = drill.combos[drill.c].length;
    drill.el.classList.add('done');
    drillRender();
    say('É assim todo treino. Golpe por golpe.');
    reset.hidden = false;
    drill.pillars.forEach((p, i) => {
      if (RM.matches || fromPin) p.classList.add('lit');
      else drill.timers.push(setTimeout(() => p.classList.add('lit'), 200 + i * 220));
    });
  }
  function drillReset() {
    drill.timers.forEach(clearTimeout);
    drill.timers = [];
    drill.c = drill.s = 0;
    drill.done = drill.fromPin = drill.lock = false;
    drill.el.classList.remove('done');
    drill.pillars.forEach(p => p.classList.remove('lit'));
    reset.hidden = true;
    say('');
    drillRender();
  }
  function drillHit(n) {
    const pad = drill.pads[n - 1];
    if (drill.done) { kick(pad, 'pop'); return; }
    if (drill.lock) return;
    const combo = drill.combos[drill.c];
    if (n === combo[drill.s]) {
      kick(pad, 'pop');
      drill.s++;
      say('');
      drillRender();
      if (drill.s === combo.length) {
        if (drill.c === drill.combos.length - 1) { drillComplete(false); return; }
        say('Isso. Agora a próxima.');
        drill.lock = true;
        drill.timers.push(setTimeout(() => {
          drill.c++;
          drill.s = 0;
          drill.lock = false;
          drillRender();
        }, 700));
      }
    } else {
      kick(pad, 'miss');
      drill.s = 0;
      say('Corrige a base e vai de novo.', true);
      drillRender();
    }
  }
  drill.pads.forEach(pad => {
    pad.addEventListener('click', () => drillHit(parseInt(pad.dataset.n, 10)));
    pad.addEventListener('animationend', () => pad.classList.remove('pop', 'miss'));
  });
  $('.drill-panel').addEventListener('keydown', e => {
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const n = parseInt(e.key, 10);
      drill.pads[n - 1].focus();
      drillHit(n);
    }
  });
  reset.addEventListener('click', () => { drillReset(); drill.pads[0].focus(); });
  drillRender();

  /* ---------- movimento reduzido ao vivo, nas duas direções ---------- */
  function pinToFinalStates() {
    pinned = true;
    dividers.forEach(div => { div.drawCache = 1; div.style.setProperty('--draw', '1'); });
    counters.forEach(c => {
      if (c.raf) cancelAnimationFrame(c.raf);
      c.raf = null;
      c.done = true;
      c.el.textContent = c.final;
    });
    $$('.reveal').forEach(el => el.classList.add('in', 'settled'));
    if (!drill.done) drillComplete(true);
  }
  function unpinFinalStates() {
    if (!pinned) return;
    pinned = false;
    dividers.forEach(div => { div.drawCache = -1; });
    if (drill.fromPin) drillReset();
    onPageScroll();
  }
  RM.addEventListener('change', e => {
    if (e.matches) pinToFinalStates();
    else { unpinFinalStates(); applyHeroMode(); }
  });

  /* início */
  if (RM.matches) pinToFinalStates();
  applyHeroMode();
  updatePage();
})();
