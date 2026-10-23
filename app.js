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

/* ---------------- 내 물건(Me): 활동지마다 6개 중 2개 ---------------- */
let me = new Set(store.get('me', []).filter(i => i >= 0 && i < ITEMS.length).slice(0, 2));
const meReady = () => me.size === 2;
const saveMe = () => store.set('me', [...me]);

/* ---------------- 탭 ---------------- */
const pages = {};
function goTab(name) {
  $$('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('on', p.id === name));
  if (activeSession) activeSession.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (pages[name]) pages[name].render();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.onclick = () => goTab(t.dataset.tab));

/* ---------------- ① 내 물건 고르기 ---------------- */
(function choose() {
  const grid = $('#chooseGrid'), status = $('#chooseStatus');

  const render = () => {
    grid.innerHTML = ITEMS.map((it, i) => `
      <button class="card ${me.has(i) ? 'on' : ''}" data-i="${i}">
        ${me.has(i) ? '<span class="metag big">Me</span>' : ''}
        <img src="${img(it)}" alt="${it.en}">
        <div class="colorbar" style="background:${it.hex}"></div>
        <div class="word">${esc(it.en)}</div>
        <div class="kword">${it.ko} · ${it.koColor}(${it.color})</div>
      </button>`).join('');
    if (meReady()) {
      const names = [...me].sort().map(i => ITEMS[i].en).join(', ');
      status.innerHTML = `<div class="feedback good">✅ 내 물건(Me): <b>${esc(names)}</b> — 나머지 4개는 내 물건이 아니에요.</div>
        <div class="row center">
          <button class="btn primary" data-go="mine">② Me 물건 연습 ➜</button>
          <button class="btn primary" data-go="notmine">③ 내 물건 아닌 것 연습 ➜</button>
        </div>`;
    } else {
      status.innerHTML = `<div class="feedback info">👆 내 활동지에서 <b class="me">Me</b>라고 적힌 물건 2개를 눌러 주세요. (${me.size}/2)</div>`;
    }
    $$('[data-go]', status).forEach(b => b.onclick = () => goTab(b.dataset.go));
  };

  grid.onclick = e => {
    const c = e.target.closest('.card'); if (!c) return;
    const i = Number(c.dataset.i);
    if (me.has(i)) me.delete(i);
    else { if (me.size >= 2) me.delete([...me][0]); me.add(i); speak(`My ${ITEMS[i].en}.`); }
    saveMe(); render();
  };
  $$('#choose [data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
  pages.choose = { render };
  render();
})();

/* ---------------- ② Me 물건 연습 / ③ 내 물건 아닌 것 연습 ---------------- */
// 물건을 누르면 질문과 대답이 한 화면에 함께 나와요. 줄마다 듣기·말하기를 할 수 있어요.
function makePractice(root, { answer, pick, title }) {
  const st = { k: 0 };
  const best = () => store.get('best', {});
  const list = () => ITEMS.map((_, i) => i).filter(pick);
  const isYes = answer === 'yes';

  root.innerHTML = `
    <div class="need" hidden>
      <div class="feedback info">먼저 <b>① 내 물건 고르기</b>에서 Me 물건 2개를 골라 주세요.</div>
      <div class="row center"><button class="btn primary go-choose">① 내 물건 고르러 가기</button></div>
    </div>
    <div class="body">
      <div class="step-label">${title}</div>
      <p class="hint">👇 물건을 누르면 질문과 대답이 나와요.</p>
      <div class="thumbs items"></div>
      <div class="dialog">
        <div class="dlg-head">
          <img class="p-img" alt=""><div class="colorbar p-color"></div>
          <button class="btn primary p-all">🔊 대화 전체 듣기</button>
        </div>
        <div class="dlg-line q">
          <div class="who"><span class="badge q">질문</span></div>
          <div class="said"><div class="en p-q"></div><div class="ko p-qko"></div></div>
          <button class="btn listen p-hq">🔊 듣기</button>
          <div class="p-recq"></div>
        </div>
        <div class="dlg-line a">
          <div class="who"><span class="badge ${answer}">${isYes ? '대답 (Me!)' : '대답 (내 것 아님)'}</span></div>
          <div class="said"><div class="en p-a"></div><div class="ko p-ako"></div></div>
          <button class="btn listen p-ha">🔊 듣기</button>
          <div class="p-reca"></div>
        </div>
      </div>
      <div class="row center"><button class="btn ghost p-next">다음 물건 ➜</button></div>
    </div>`;
  $('.go-choose', root).onclick = () => goTab('choose');

  const cur = () => ITEMS[list()[st.k]];
  const save = mode => r => {
    if (!r.supported || r.score == null || r.empty) return;
    const b = best(), key = `${cur().id}-${mode}`;
    if (b[key] == null || r.score > b[key]) { b[key] = r.score; store.set('best', b); renderThumbs(); }
  };
  const recQ = mountRecorder($('.p-recq', root), () => sentence(cur(), 'q').en, { label: '🎙️ 말하기', onResult: save('q') });
  const recA = mountRecorder($('.p-reca', root), () => sentence(cur(), answer).en, { label: '🎙️ 말하기', onResult: save(answer) });

  const renderThumbs = () => {
    const b = best();
    $('.items', root).innerHTML = list().map((i, k) => {
      const it = ITEMS[i];
      const dots = ['q', answer].map(m => { const v = b[`${it.id}-${m}`]; return v == null ? '○' : v >= 70 ? '★' : '☆'; }).join('');
      return `<button class="thumb ${k === st.k ? 'on' : ''}" data-k="${k}">
        ${isYes ? '<span class="metag">Me</span>' : ''}<span class="sw" style="background:${it.hex}"></span>
        <img src="${img(it)}" alt="${it.en}"><div class="tw">${esc(it.en)}</div>
        <div class="dots" title="질문·대답 최고 점수 (★ 70점 이상)">${dots}</div></button>`;
    }).join('');
  };

  const render = () => {
    const ready = meReady();
    $('.need', root).hidden = ready;
    $('.body', root).hidden = !ready;
    if (!ready) return;
    if (st.k >= list().length) st.k = 0;
    const it = cur(), q = sentence(it, 'q'), a = sentence(it, answer);
    renderThumbs();
    $('.p-img', root).src = img(it); $('.p-img', root).alt = it.en;
    $('.p-color', root).style.background = it.hex;
    $('.p-q', root).textContent = q.en; $('.p-qko', root).textContent = q.ko;
    $('.p-a', root).textContent = a.en; $('.p-ako', root).textContent = a.ko;
    recQ.reset(); recA.reset();
  };

  const playAll = async () => {
    await speak(sentence(cur(), 'q').en, { pitch: 1.3 });
    await speak(sentence(cur(), answer).en);
  };

  $('.items', root).onclick = e => {
    const t = e.target.closest('.thumb'); if (!t) return;
    st.k = Number(t.dataset.k); render(); playAll();
  };
  $('.p-all', root).onclick = playAll;
  $('.p-hq', root).onclick = () => speak(sentence(cur(), 'q').en, { pitch: 1.3 });
  $('.p-ha', root).onclick = () => speak(sentence(cur(), answer).en);
  $('.p-next', root).onclick = () => { st.k = (st.k + 1) % list().length; render(); playAll(); window.scrollTo(0, 0); };

  return { render };
}

pages.mine = makePractice($('#mine'), { answer: 'yes', pick: i => me.has(i), title: '내 물건 (Me) 2개 — 내가 주인이라면!' });
pages.notmine = makePractice($('#notmine'), { answer: 'no', pick: i => !me.has(i), title: '내 물건이 아닌 것 4개 — 내가 주인이 아니면!' });
