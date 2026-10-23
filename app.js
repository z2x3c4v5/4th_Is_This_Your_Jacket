'use strict';

/* ---------------- 데이터: 활동지의 6개 물건 (오른쪽 색깔 막대 = 내 물건의 색깔) ---------------- */
const ITEMS = [
  { id: 'coat',   en: 'coat',    ko: '코트',   koQ: '코트니',   koTopic: '코트는',   color: 'red',    koColor: '빨간색', hex: '#e53935' },
  { id: 'dress',  en: 'dress',   ko: '원피스', koQ: '원피스니', koTopic: '원피스는', color: 'yellow', koColor: '노란색', hex: '#fdd835' },
  { id: 'jacket', en: 'jacket',  ko: '재킷',   koQ: '재킷이니', koTopic: '재킷은',   color: 'blue',   koColor: '파란색', hex: '#1e63d6' },
  { id: 'tshirt', en: 'T-shirt', ko: '티셔츠', koQ: '티셔츠니', koTopic: '티셔츠는', color: 'green',  koColor: '초록색', hex: '#2e9e44' },
  { id: 'bag',    en: 'bag',     ko: '가방',   koQ: '가방이니', koTopic: '가방은',   color: 'black',  koColor: '검은색', hex: '#222222' },
  { id: 'belt',   en: 'belt',    ko: '벨트',   koQ: '벨트니',   koTopic: '벨트는',   color: 'orange', koColor: '주황색', hex: '#fb8c00' },
];
const img = it => `images/${it.id}.png`;

const sentence = (it, mode) => {
  if (mode === 'q')   return { en: `Is this your ${it.en}?`, ko: `이것은 너의 ${it.koQ}?` };
  if (mode === 'yes') return { en: `Yes, it's mine.`, ko: `응, 그건 내 거야.` };
  return { en: `No, it's not. My ${it.en} is ${it.color}.`, ko: `아니, 그렇지 않아. 내 ${it.koTopic} ${it.koColor}이야.` };
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const store = {
  get(k, d) { try { const v = localStorage.getItem('jacket.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jacket.' + k, JSON.stringify(v)); } catch { /* 저장 불가 시 무시 */ } },
};

/* ---------------- 원어민 음성 (TTS) ---------------- */
let rate = store.get('rate', 0.75);
let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(prefer) {
  const us = voices.filter(v => /en[-_]US/i.test(v.lang));
  const pool = us.length ? us : voices;
  if (prefer != null && pool.length > 1) return pool[prefer % pool.length];
  return pool.find(v => /Google US English|Samantha|Aria|Jenny|Zira/i.test(v.name)) || pool[0];
}

function speak(text, { pitch = 1, voiceIdx = null } = {}) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    const v = pickVoice(voiceIdx);
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(done, 1500 + text.length * 150);
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  });
}

$$('.speed .chip').forEach(b => {
  b.classList.toggle('on', Number(b.dataset.rate) === rate);
  b.onclick = () => {
    rate = Number(b.dataset.rate); store.set('rate', rate);
    $$('.speed .chip').forEach(x => x.classList.toggle('on', x === b));
  };
});

/* ---------------- 녹음 + 음성 인식 ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

(function showSupport() {
  const msgs = [];
  if (!SR) msgs.push('이 브라우저는 <b>음성 인식(정확도 측정)</b>을 지원하지 않아요. 크롬·엣지·사파리에서 열어 주세요. (녹음과 듣기는 할 수 있어요)');
  if (!canRecord) msgs.push('이 브라우저에서는 마이크를 쓸 수 없어요. <b>https</b> 주소로 열었는지 확인해 주세요.');
  if (!('speechSynthesis' in window)) msgs.push('이 브라우저는 원어민 음성 듣기를 지원하지 않아요.');
  if (msgs.length) { const n = $('#support'); n.innerHTML = msgs.join('<br>'); n.hidden = false; }
})();

function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}

let activeSession = null;

/** 녹음과 음성 인식을 동시에 시작. stop()으로 끝내거나, 말이 끝나면 자동으로 끝남. */
async function startListening(onInterim, maxMs = 8000) {
  if (activeSession) activeSession.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();

  let stream = null;
  if (canRecord) stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  let mr = null; const chunks = [];
  if (stream && window.MediaRecorder) {
    const mime = pickMime();
    mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start();
  }

  let candidates = [], recEnded = !SR, finished = false, error = null, rec = null, endWait = null;
  let resolveDone; const done = new Promise(r => { resolveDone = r; });

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer); clearTimeout(endWait);
    activeSession = null;
    const stopped = new Promise(r => {
      if (mr && mr.state !== 'inactive') { mr.onstop = () => r(); mr.stop(); } else r();
    });
    stopped.then(() => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: (mr && mr.mimeType) || 'audio/webm' })) : null;
      resolveDone({ url, candidates, error, srSupported: !!SR });
    });
  };

  if (SR) {
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    rec.onresult = e => {
      const res = [...e.results];
      const primary = res.map(r => r[0].transcript).join(' ').trim();
      const prefix = res.slice(0, -1).map(r => r[0].transcript).join(' ');
      const last = res[res.length - 1];
      const list = [primary];
      for (let j = 1; j < last.length; j++) list.push((prefix + ' ' + last[j].transcript).trim());
      candidates = list.filter(Boolean);
      if (onInterim) onInterim(primary);
    };
    rec.onerror = e => { error = e.error; };
    rec.onend = () => { recEnded = true; finish(); };
    try { rec.start(); } catch (e) { error = 'start'; recEnded = true; }
  }

  const session = {
    stop() {
      if (finished) return;
      if (rec && !recEnded) {
        try { rec.stop(); } catch { /* 이미 멈춤 */ }
        endWait = setTimeout(finish, 1500);
      } else finish();
    },
    done,
  };
  const timer = setTimeout(() => session.stop(), maxMs);
  activeSession = session;
  return session;
}

/* ---------------- 정확도 채점 ---------------- */
const SYN = {
  youre: 'your', yor: 'your', you: 'your', mind: 'mine', mines: 'mine',
  coats: 'coat', dresses: 'dress', jackets: 'jacket', tshirts: 'tshirt', bags: 'bag', belts: 'belt', bad: 'bag', back: 'bag',
  read: 'red', bled: 'blue', blew: 'blue', yellows: 'yellow', greens: 'green',
  know: 'no', nah: 'no', yas: 'yes', dis: 'this', these: 'this',
};

function normTokens(s) {
  s = String(s).toLowerCase().replace(/[’‘`´]/g, "'");
  s = s.replace(/\b(t|tee|tea)[\s-]?shirts?\b/g, 'tshirt');
  s = s.replace(/\bit's\b|\bits\b/g, 'it is').replace(/\bisn't\b/g, 'is not').replace(/\byou're\b/g, 'your');
  s = s.replace(/[^a-z' ]+/g, ' ').replace(/'/g, '');
  return s.split(/\s+/).filter(Boolean).map(w => SYN[w] || w);
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function wordSim(a, b) {
  if (a === b) return 1;
  const r = 1 - lev(a, b) / Math.max(a.length, b.length);
  return r >= 0.75 ? 0.5 : 0;
}

/** 목표 문장과 들린 문장을 단어 단위로 맞춰 보고 점수(0~100)와 단어별 결과를 돌려줌 */
function scoreOne(target, heard) {
  const display = target.split(/\s+/);
  const tTok = [], owner = [];
  display.forEach((w, i) => normTokens(w).forEach(t => { tTok.push(t); owner.push(i); }));
  const hTok = normTokens(heard);
  const n = tTok.length, m = hTok.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + wordSim(tTok[i - 1], hTok[j - 1]));
  }
  const per = new Array(n).fill(0);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = wordSim(tTok[i - 1], hTok[j - 1]);
    if (s > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s)) < 1e-9) { per[i - 1] = s; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const sum = per.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, m - n);
  const score = n ? Math.round(100 * (sum / n) * (n / (n + 0.5 * extra))) : 0;
  const words = display.map((w, i) => {
    const idx = owner.map((o, k) => (o === i ? k : -1)).filter(k => k >= 0);
    const v = idx.length ? idx.reduce((a, k) => a + per[k], 0) / idx.length : 1;
    return { w, v };
  });
  return { score, words, heard, tokens: hTok };
}

function scoreBest(target, candidates) {
  if (!candidates.length) return { score: 0, words: target.split(/\s+/).map(w => ({ w, v: 0 })), heard: '', tokens: [] };
  return candidates.map(c => scoreOne(target, c)).sort((a, b) => b.score - a.score)[0];
}

function gradeOf(score) {
  if (score >= 90) return { text: 'Excellent! 🌟🌟🌟', stars: 3, color: 'var(--good)' };
  if (score >= 70) return { text: 'Great job! 🌟🌟', stars: 2, color: 'var(--good)' };
  if (score >= 50) return { text: 'Good try! 🌟', stars: 1, color: 'var(--mid)' };
  return { text: 'Try again! 💪', stars: 0, color: 'var(--bad)' };
}

const ERR_MSG = {
  'not-allowed': '마이크 사용이 막혀 있어요. 주소창의 🔒 아이콘을 눌러 마이크를 허용해 주세요.',
  'service-not-allowed': '마이크 사용이 막혀 있어요. 주소창의 🔒 아이콘을 눌러 마이크를 허용해 주세요.',
  'no-speech': '목소리가 들리지 않았어요. 마이크 가까이에서 크게 말해 보세요!',
  'audio-capture': '마이크를 찾을 수 없어요. 마이크 연결을 확인해 주세요.',
  'network': '음성 인식에 인터넷 연결이 필요해요. 인터넷을 확인해 주세요.',
};

/**
 * 녹음 UI: 🎙 버튼 → 녹음/인식 → 결과(점수, 단어별 색, 내 녹음 듣기)
 * onResult(result) 는 채점이 끝나면 호출됨. result.supported=false 이면 자동 채점 불가.
 */
function mountRecorder(el, getTarget, { onResult, showScore = true, label = '🎙️ 녹음하고 말하기' } = {}) {
  el.innerHTML = `
    <div class="recbox">
      <button class="btn rec">${label}</button>
      <div class="live-text"></div>
      <div class="out"></div>
    </div>`;
  const btn = $('.rec', el), live = $('.live-text', el), out = $('.out', el);
  let session = null;

  btn.onclick = async () => {
    if (session) { session.stop(); return; }
    out.innerHTML = ''; live.textContent = '';
    try {
      session = await startListening(t => { live.textContent = '👂 ' + t; });
    } catch (e) {
      out.innerHTML = `<div class="err">${ERR_MSG['not-allowed']}</div>`;
      return;
    }
    btn.classList.add('live'); btn.textContent = '⏹ 다 말했어요 (멈추기)';
    live.textContent = SR ? '👂 듣고 있어요... 지금 말하세요!' : '🔴 녹음 중... 말한 뒤 멈추기를 누르세요.';
    const r = await session.done;
    session = null;
    btn.classList.remove('live'); btn.textContent = '🎙️ 다시 녹음하기';
    live.textContent = '';

    const target = getTarget();
    const audio = r.url ? `<button class="say play">▶ 내 목소리 듣기</button>` : '';
    if (!r.srSupported) {
      out.innerHTML = `<div class="result"><div class="res-body"><div class="grade">녹음 완료!</div>
        <div class="heard">이 브라우저는 자동 채점을 지원하지 않아요. 내 목소리와 원어민 소리를 비교해 보세요.</div>
        <div class="row">${audio}<button class="say model">🔊 원어민 듣기</button></div></div></div>`;
      wireAudio(out, r.url, target);
      onResult && onResult({ supported: false, score: null });
      return;
    }
    const res = scoreBest(target, r.candidates);
    if (!r.candidates.length && r.error && ERR_MSG[r.error]) {
      out.innerHTML = `<div class="err">${ERR_MSG[r.error]}</div><div class="row center">${audio}</div>`;
      wireAudio(out, r.url, target);
      onResult && onResult({ supported: true, score: 0, empty: true, tokens: [] });
      return;
    }
    const g = gradeOf(res.score);
    out.innerHTML = `
      <div class="result">
        ${showScore ? `<div class="ring" style="--p:${res.score};--c:${g.color}"><div><div class="score-num">${res.score}<small>점</small></div></div></div>` : ''}
        <div class="res-body">
          ${showScore ? `<div class="grade">${g.text}</div>` : ''}
          <div class="words">${res.words.map(x => `<span class="w ${x.v >= 1 ? 'ok' : x.v > 0 ? 'half' : 'miss'}">${esc(x.w)}</span>`).join('')}</div>
          <div class="legend"><span class="w ok">잘했어요</span> <span class="w half">조금 달라요</span> <span class="w miss">안 들렸어요</span></div>
          <div class="heard">컴퓨터가 들은 말: “${esc(res.heard || '(들리지 않음)')}”</div>
          <div class="row">${audio}<button class="say model">🔊 원어민 듣기</button></div>
        </div>
      </div>`;
    wireAudio(out, r.url, target);
    onResult && onResult({ supported: true, ...res });
  };

  return { reset() { if (session) session.stop(); out.innerHTML = ''; live.textContent = ''; btn.textContent = label; } };
}

function wireAudio(el, url, target) {
  const p = $('.play', el), m = $('.model', el);
  if (p) p.onclick = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); new Audio(url).play(); };
  if (m) m.onclick = () => speak(target);
}

/* ---------------- 탭 ---------------- */
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('on', x === t));
  $$('.panel').forEach(p => p.classList.toggle('on', p.id === t.dataset.tab));
  if (activeSession) activeSession.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
});

/* ---------------- ① 표현 익히기 ---------------- */
(function learn() {
  const grid = $('#learnGrid'), detail = $('#learnDetail');
  grid.innerHTML = ITEMS.map((it, i) => `
    <button class="card" data-i="${i}">
      <img src="${img(it)}" alt="${it.en}">
      <div class="colorbar" style="background:${it.hex}"></div>
      <div class="word">${esc(it.en)}</div>
      <div class="kword">${it.ko} · 내 것은 ${it.koColor}(${it.color})</div>
    </button>`).join('');

  const show = i => {
    const it = ITEMS[i];
    $$('.card', grid).forEach(c => c.classList.toggle('on', Number(c.dataset.i) === i));
    const lines = [['q', '질문'], ['yes', '내가 주인이면'], ['no', '내가 주인이 아니면']].map(([m, lab]) => {
      const s = sentence(it, m);
      return `<div class="line"><span class="badge ${m}">${lab}</span><span class="en">${esc(s.en)}</span>
        <button class="say" data-say="${esc(s.en)}">🔊 듣기</button><span class="k">${s.ko}</span></div>`;
    }).join('');
    detail.innerHTML = `<h3>${esc(it.en)} (${it.ko})</h3>${lines}
      <div class="row"><button class="btn primary small" id="goPractice">🎙️ 이 물건으로 말하기 연습하기</button></div>`;
    detail.hidden = false;
    $$('[data-say]', detail).forEach(b => b.onclick = () => speak(b.dataset.say));
    $('#goPractice').onclick = () => { practice.select(i, 'q'); $('.tab[data-tab="practice"]').click(); };
    speak(sentence(it, 'q').en);
  };
  grid.onclick = e => { const c = e.target.closest('.card'); if (c) show(Number(c.dataset.i)); };
})();

/* ---------------- ② 말하기 연습 ---------------- */
const practice = (function () {
  const st = { i: 0, mode: 'q' };
  const best = store.get('best', {});
  const ORDER = ['q', 'yes', 'no'];

  const renderThumbs = () => {
    $('#pItems').innerHTML = ITEMS.map((it, i) => {
      const dots = ORDER.map(m => { const b = best[`${it.id}-${m}`]; return b == null ? '○' : b >= 70 ? '★' : '☆'; }).join('');
      return `<button class="thumb ${i === st.i ? 'on' : ''}" data-i="${i}">
        <span class="sw" style="background:${it.hex}"></span>
        <img src="${img(it)}" alt="${it.en}"><div class="tw">${esc(it.en)}</div><div class="dots" title="질문·Yes·No 최고 점수">${dots}</div></button>`;
    }).join('');
  };

  const SITUATION = {
    q: '친구를 만났어요. 물건을 보여 주며 물어보세요.',
    yes: '친구가 “Is this your ___?” 하고 물었어요. <b>내 물건이 맞아요!</b>',
    no: '친구가 “Is this your ___?” 하고 물었어요. <b>내 물건이 아니에요!</b> 내 물건의 색깔을 말해요.',
  };

  const rec = mountRecorder($('#pRec'), () => sentence(ITEMS[st.i], st.mode).en, {
    onResult(r) {
      if (!r.supported || r.score == null || r.empty) return;
      const k = `${ITEMS[st.i].id}-${st.mode}`;
      if (best[k] == null || r.score > best[k]) { best[k] = r.score; store.set('best', best); renderThumbs(); }
    },
  });

  const render = () => {
    const it = ITEMS[st.i], s = sentence(it, st.mode);
    renderThumbs();
    $$('#pModes .mode').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    $('#pImg').src = img(it); $('#pImg').alt = it.en;
    $('#pColor').style.background = it.hex;
    $('#pSituation').innerHTML = SITUATION[st.mode].replace('___', esc(it.en));
    $('#pTarget').textContent = s.en;
    $('#pTarget').classList.toggle('hidden', $('#pHide').checked);
    $('#pKo').textContent = s.ko;
    rec.reset();
  };

  $('#pItems').onclick = e => { const t = e.target.closest('.thumb'); if (t) { st.i = Number(t.dataset.i); render(); } };
  $('#pModes').onclick = e => { const b = e.target.closest('.mode'); if (b) { st.mode = b.dataset.mode; render(); } };
  $('#pListen').onclick = () => speak(sentence(ITEMS[st.i], st.mode).en);
  $('#pHide').onchange = () => $('#pTarget').classList.toggle('hidden', $('#pHide').checked);
  $('#pTarget').onclick = () => { if ($('#pHide').checked) $('#pTarget').classList.toggle('hidden'); };
  $('#pNext').onclick = () => {
    const k = ORDER.indexOf(st.mode);
    if (k < 2) st.mode = ORDER[k + 1]; else { st.mode = 'q'; st.i = (st.i + 1) % ITEMS.length; }
    render();
  };

  render();
  return { select(i, mode) { st.i = i; st.mode = mode; render(); } };
})();

/* ---------------- ③ 친구 찾기 게임 (정보 차 활동) ---------------- */
(function game() {
  const FRIENDS = [
    { name: 'Minji', face: '👧', pitch: 1.3 }, { name: 'Junho', face: '👦', pitch: 1.1 },
    { name: 'Seoyeon', face: '👩', pitch: 1.2 }, { name: 'Jiho', face: '🧒', pitch: 1.15 },
    { name: 'Yuna', face: '👱‍♀️', pitch: 1.35 }, { name: 'Tom', face: '👨', pitch: 0.95 },
    { name: 'Amy', face: '👩‍🦰', pitch: 1.25 }, { name: 'Ben', face: '🧑', pitch: 1.0 },
  ];
  const PASS = 60; // 이 점수 이상이면 친구가 알아들어요

  let me = new Set();
  let g = null; // 진행 상태

  const renderMe = () => {
    $('#gMeGrid').innerHTML = ITEMS.map((it, i) => `
      <button class="thumb ${me.has(i) ? 'on' : ''}" data-i="${i}">
        ${me.has(i) ? '<span class="metag">Me</span>' : ''}<span class="sw" style="background:${it.hex}"></span>
        <img src="${img(it)}" alt="${it.en}"><div class="tw">${esc(it.en)}</div></button>`).join('');
    $('#gStart').disabled = me.size !== 2;
  };
  $('#gMeGrid').onclick = e => {
    const t = e.target.closest('.thumb'); if (!t) return;
    const i = Number(t.dataset.i);
    if (me.has(i)) me.delete(i); else if (me.size < 2) me.add(i); else { me.delete([...me][0]); me.add(i); }
    renderMe();
  };
  $('#gRandom').onclick = () => { me = new Set(shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2)); renderMe(); };
  $('#gStart').onclick = start;
  $('#gReset').onclick = () => { if (activeSession) activeSession.stop(); $('#gPlay').hidden = true; $('#gSetup').hidden = false; };

  function start() {
    // 친구마다 Me가 아닌 물건 중 2개를 무작위로 가지고 있어요
    const others = ITEMS.map((_, i) => i).filter(i => !me.has(i));
    const friends = shuffle(FRIENDS).map((f, k) => ({ ...f, own: new Set(shuffle(others).slice(0, 2)), voiceIdx: k }));
    g = { friends, k: 0, names: ITEMS.map(() => []), met: 0, flash: -1 };
    $('#gSetup').hidden = true; $('#gPlay').hidden = false;
    meetFriend();
  }

  const friend = () => g.friends[g.k % g.friends.length];
  const say = (text, f = friend()) => { $('#gBubble').textContent = text; return speak(text, { pitch: f.pitch, voiceIdx: f.voiceIdx }); };
  const stage = html => { $('#gStage').innerHTML = html; };

  function renderSheet() {
    $('#gSheet').innerHTML = ITEMS.map((it, i) => `
      <div class="scell ${g.flash === i ? 'new' : ''}">
        <span class="sw" style="background:${it.hex}"></span>
        <img src="${img(it)}" alt="${it.en}">
        <div class="tw">${esc(it.en)}</div>
        ${me.has(i) ? '<div class="metag">Me</div>' : `<div class="names">${g.names[i].map(esc).join(', ') || '&nbsp;'}</div>`}
      </div>`).join('');
    g.flash = -1;
    $('#gNames').textContent = g.names.reduce((a, n) => a + n.length, 0);
    $('#gMet').textContent = g.met;
  }

  function meetFriend() {
    const f = friend();
    g.asked = new Set();
    $('#gAvatar').textContent = f.face;
    $('#gName').textContent = f.name;
    renderSheet();
    say(`Hi! I'm ${f.name}.`);
    askStep();
  }

  // 1단계: 내가 친구에게 물어보기
  function askStep(msg = '') {
    const f = friend();
    stage(`
      <h3>❓ 내 차례! ${esc(f.name)}에게 물어보세요</h3>
      <p class="tip">물어볼 물건을 고르세요. (<b class="me">Me</b> 물건은 내 것이니까 물어보지 않아요)</p>
      <div class="thumbs" id="gAskPick">${ITEMS.map((it, i) => `
        <button class="thumb" data-i="${i}" ${me.has(i) || g.asked.has(i) ? 'disabled' : ''}>
          ${me.has(i) ? '<span class="metag">Me</span>' : ''}<span class="sw" style="background:${it.hex}"></span>
          <img src="${img(it)}" alt="${it.en}"><div class="tw">${esc(it.en)}</div></button>`).join('')}</div>
      ${msg}`);
    $('#gAskPick').onclick = e => {
      const t = e.target.closest('.thumb'); if (!t || t.disabled) return;
      askRecord(Number(t.dataset.i));
    };
  }

  function askRecord(i) {
    const it = ITEMS[i], q = sentence(it, 'q').en;
    stage(`
      <h3>❓ 물건을 보여 주며 물어보세요</h3>
      <div class="ask-item"><img src="${img(it)}" alt="${it.en}">
        <div><div class="q-en">${esc(q)}</div><div class="ko">${sentence(it, 'q').ko}</div>
        <div class="row"><button class="say" id="gHear">🔊 듣기</button><button class="say" id="gBack">↩ 다른 물건</button></div></div></div>
      <div id="gRec"></div><div id="gFb"></div>`);
    $('#gHear').onclick = () => speak(q);
    $('#gBack').onclick = () => askStep();
    mountRecorder($('#gRec'), () => q, {
      label: '🎙️ 녹음하고 물어보기',
      async onResult(r) {
        const fb = $('#gFb');
        if (r.supported && r.score < PASS) {
          fb.innerHTML = `<div class="feedback bad">${esc(friend().name)}: “Sorry? 다시 말해 줄래?” — 위의 빨간 단어를 더 또박또박 말해 보세요!</div>`;
          say('Sorry? Can you say that again?');
          return;
        }
        g.asked.add(i);
        const owns = friend().own.has(i);
        const ans = sentence(it, owns ? 'yes' : 'no').en;
        fb.innerHTML = `<div class="feedback info">💬 ${esc(friend().name)}: “${esc(ans)}”</div>`;
        $('#gRec').querySelector('.rec').disabled = true;
        await say(ans);
        if (owns) {
          if (!g.names[i].includes(friend().name)) g.names[i].push(friend().name);
          g.flash = i;
          renderSheet();
          fb.innerHTML += `<div class="feedback good">🎉 ${esc(friend().name)}의 물건이었어요! 활동지에 이름을 적었어요.</div>
            <div class="row center"><button class="btn primary" id="gNext">친구가 물어볼 차례 ➜</button></div>`;
        } else {
          fb.innerHTML += `<div class="feedback info">${esc(friend().name)}의 물건이 아니래요.</div>
            <div class="row center"><button class="btn ghost" id="gAgain">다른 물건 물어보기</button><button class="btn primary" id="gNext">친구가 물어볼 차례 ➜</button></div>`;
          const again = $('#gAgain');
          if (ITEMS.every((_, k) => me.has(k) || g.asked.has(k))) again.remove();
          else again.onclick = () => askStep();
        }
        $('#gNext').onclick = beAsked;
      },
    });
  }

  // 2단계: 친구가 나에게 물어보기
  async function beAsked() {
    const i = Math.floor(Math.random() * ITEMS.length);
    const it = ITEMS[i], mine = me.has(i);
    const q = sentence(it, 'q').en, expect = sentence(it, mine ? 'yes' : 'no');
    stage(`
      <h3>🙋 ${esc(friend().name)}의 질문이에요! 대답해 보세요</h3>
      <div class="ask-item"><img src="${img(it)}" alt="${it.en}">
        <div><div class="q-en">“${esc(q)}”</div>
        <p class="tip">이 ${it.koTopic} 내 물건(<b class="me">Me</b>)일까요? 아래 활동지를 보고 대답하세요.</p>
        <div class="row"><button class="say" id="gHear">🔊 다시 듣기</button><button class="say" id="gHint">💡 힌트 보기</button></div>
        <div id="gHintText" class="ko" hidden>${esc(expect.en)} <br>(${expect.ko})</div></div></div>
      <div id="gRec"></div><div id="gFb"></div>`);
    $('#gHear').onclick = () => say(q);
    $('#gHint').onclick = () => { $('#gHintText').hidden = false; speak(expect.en); };
    say(q);

    mountRecorder($('#gRec'), () => expect.en, {
      label: '🎙️ 녹음하고 대답하기',
      onResult(r) {
        const fb = $('#gFb');
        if (!r.supported) {
          fb.innerHTML = `<p class="tip">자동 채점이 안 되는 브라우저예요. 내가 뭐라고 대답했나요?</p>
            <div class="selfcheck"><button class="btn" data-a="yes">⭕ Yes, it's mine.</button><button class="btn" data-a="no">❌ No, it's not.</button></div>`;
          $$('[data-a]', fb).forEach(b => b.onclick = () => judge(b.dataset.a === 'yes', 100));
          return;
        }
        const t = r.tokens || [];
        const yi = t.indexOf('yes'), ni = Math.min(...['no', 'not'].map(w => (t.indexOf(w) < 0 ? 1e9 : t.indexOf(w))));
        if (yi < 0 && ni === 1e9) {
          fb.innerHTML = `<div class="feedback bad">“Yes”인지 “No”인지 잘 안 들렸어요. 다시 말해 보세요!</div>`;
          return;
        }
        judge(yi >= 0 && (ni === 1e9 || yi < ni), r.score);
      },
    });

    function judge(saidYes, score) {
      const fb = $('#gFb');
      $('#gRec').querySelector('.rec').disabled = true;
      if (saidYes !== mine) {
        fb.innerHTML = `<div class="feedback bad">앗! 이 ${it.koTopic} ${mine ? '내 물건(Me)이에요. <b>Yes</b>' : '내 물건이 아니에요. <b>No</b>'}로 대답해야 해요.<br>
          정답: “${esc(expect.en)}”</div>
          <div class="row center"><button class="say" id="gModel">🔊 정답 듣기</button><button class="btn ghost" id="gRetry">다시 대답하기</button></div>`;
        $('#gModel').onclick = () => speak(expect.en);
        $('#gRetry').onclick = () => { $('#gRec').querySelector('.rec').disabled = false; fb.innerHTML = ''; };
        return;
      }
      g.met++;
      renderSheet();
      const reply = mine ? 'Oh, here you are!' : 'Okay. Thank you!';
      fb.innerHTML = `<div class="feedback good">⭕ 알맞게 대답했어요! ${score < 70 ? '문장을 조금 더 정확하게 말해 보면 더 좋아요.' : '발음도 아주 좋아요!'}</div>
        <div class="feedback info">💬 ${esc(friend().name)}: “${reply} Bye!”</div>
        <div class="row center"><button class="btn primary" id="gNextFriend">다음 친구 만나기 ➜</button></div>`;
      say(`${reply} Bye!`);
      $('#gNextFriend').onclick = () => { g.k++; meetFriend(); };
    }
  }

  renderMe();
})();
