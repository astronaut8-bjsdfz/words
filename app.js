/* ============================================================
   单词雪球 · 看中文写英文
   ------------------------------------------------------------
   判分原则：只比对「字母 / 数字」，大小写、标点、空格、连字符、
   撇号一律不管——这是「能不能写出这个词组」的回忆测试，
   不是标点听写。真正扣分的是写错词、拼错字母、漏词。
   ============================================================ */

(function () {
  'use strict';

  var D = window.SNOW_DATA;
  var ITEMS = D.items;
  var LS = { wrong: 'snow.wrong.v1', stat: 'snow.stat.v1' };

  /* ---------------- 存储 ---------------- */

  function load(k, dft) {
    try {
      var s = localStorage.getItem(k);
      return s ? JSON.parse(s) : dft;
    } catch (e) { return dft; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var book = load(LS.wrong, {});            /* key -> {zh, en, n, t} */
  var stat = load(LS.stat, { r: 0, t: 0 }); /* r 答对次数 / t 答题总次数 */

  /* ---------------- 归一化 ---------------- */

  /* 有些「字符」长得一样但码点不同，屏幕上完全看不出来：全角 ｒ、零宽空格、
     软连字符、ﬁ 连字。中文输入法在中文状态打英文、或从别处粘一手，都会带进来。
     不先折平就判错，而且错得让人莫名其妙 —— 所以第一步先收掉。 */
  function nfkc(s) {
    try { return s.normalize('NFKC'); } catch (e) { return s; }
  }

  function norm(s) {
    return nfkc(String(s == null ? '' : s))
      /* 零宽、软连字符、控制字符一律直接删（不是变空格）：它们看不见，
         留着会把一个词从中间切开，判错却看不出错在哪 */
      .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, '')
      .toLowerCase()
      .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function keyOf(item) { return norm(item.en).replace(/ /g, ''); }

  /* 原表用斜杠并列、或括号里可省的写法，手写备选答案 */
  var ALT = {
    'belong to sb./sth': ['belong to sb', 'belong to sth'],
    'enable sb. / sth. to do': ['enable sb to do', 'enable sth to do'],
    'be fed up with sth. / doing': ['be fed up with sth', 'be fed up with doing'],
    'be in good/bad shape': ['be in good shape', 'be in bad shape'],
    'be worth sth / doing sth': ['be worth sth', 'be worth doing sth'],
    '(sb) get addicted to (sth)': ['get addicted to', 'get addicted to sth'],
    'make it (to)': ['make it', 'make it to'],
    'the direction to sp': ['the direction to someplace', 'the direction to some place'],
    'enquire about sth with sb': ['inquire about sth with sb'],
    'do sb. a favour': ['do sb a favour', 'do sb a favor', 'do sb. a favor'],
    'delivery man': ['deliveryman'],
    'based on real\u2011life events': ['based on real-life events', 'based on real life events']
  };

  var SPELL = [['favour', 'favor'], ['enquire', 'inquire'], ['practise', 'practice'],
               ['organisation', 'organization'], ['realise', 'realize']];

  /* 判定：先比归一后的整串。
     再给一次机会 —— 只给「原始输入里带非 ASCII / 控制字符」的情况：
     全角字母、全角空格、零宽、从别处粘来的怪字符都算，这时把空格也一并忽略再比。
     普通键盘打字全是 ASCII，根本走不到这一步，所以 in sight 与 insight
     这类只差一个空格的词仍然分得清（实测过，放宽会混成一个）。
     ⚠️ 兜底只对「本身不含空格的答案」生效，理由同上。 */
  var ODDCHAR = /[\u0000-\u001F\u007F-\uFFFF]/;

  function hit(item, v) {
    var set = accepted(item), k = norm(v);
    if (set[k]) return true;
    if (k.indexOf(' ') < 0) return false;
    if (norm(item.en).indexOf(' ') > -1) return false;
    if (!ODDCHAR.test(String(v == null ? '' : v))) return false;
    var flat = k.replace(/ /g, '');
    for (var a in set) if (a.replace(/ /g, '') === flat) return true;
    return false;
  }

  var cache = {};

  function accepted(item) {
    if (cache[item.en]) return cache[item.en];
    var e = item.en;
    var cands = [e];

    if (/\([^)]*\)/.test(e)) {
      cands.push(e.replace(/\([^)]*\)/g, ' '));     /* 括号整段不要 */
      cands.push(e.replace(/[()]/g, ' '));          /* 括号里的字留下 */
    }
    (ALT[e] || []).forEach(function (x) { cands.push(x); });

    var extra = [];
    cands.forEach(function (c) {
      SPELL.forEach(function (p) {
        if (c.indexOf(p[0]) > -1) extra.push(c.split(p[0]).join(p[1]));
        if (c.indexOf(p[1]) > -1) extra.push(c.split(p[1]).join(p[0]));
      });
    });

    var set = {};
    cands.concat(extra).forEach(function (c) {
      var k = norm(c);
      if (k) set[k] = 1;
    });
    cache[e] = set;
    return set;
  }

  /* ---------------- 差异标记 ---------------- */

  function lcs(a, b) {
    var n = a.length, m = b.length, i, j;
    var dp = [];
    for (i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1
                                 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var okA = new Array(n).fill(false), okB = new Array(m).fill(false);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { okA[i] = okB[j] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return { okA: okA, okB: okB };
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var ALNUM = /[a-z0-9]/i;

  /* 返回 {u: 你写的(带标记), a: 应该的(带标记), bad: 错的处数} */
  function diffHtml(user, ans) {
    var u = String(user || '').trim();
    if (!u) return null;

    var multi = /\s/.test(ans) || /\s/.test(u);
    var i, okU, okA, bad = 0;

    if (multi) {
      var U = u.split(/\s+/).filter(Boolean);
      var A = ans.split(/\s+/).filter(Boolean);
      var r = lcs(
        U.map(function (w) { return norm(w); }),
        A.map(function (w) { return norm(w); })
      );
      okU = r.okA; okA = r.okB;
      if (!okU.length) return null;
      U.forEach(function (w, k) { if (!okU[k]) bad++; });
      if (bad > 6) return null;
      return {
        u: U.map(function (w, k) { return okU[k] ? esc(w) : '<span class="w">' + esc(w) + '</span>'; }).join(' '),
        a: A.map(function (w, k) { return okA[k] ? esc(w) : '<span class="m">' + esc(w) + '</span>'; }).join(' '),
        bad: bad
      };
    }

    /* 逐字母：标点不算错，只比字母数字 */
    var ua = [], ui = [], aa = [], ai = [];
    for (i = 0; i < u.length; i++) if (ALNUM.test(u[i])) { ua.push(u[i].toLowerCase()); ui.push(i); }
    for (i = 0; i < ans.length; i++) if (ALNUM.test(ans[i])) { aa.push(ans[i].toLowerCase()); ai.push(i); }

    var res = lcs(ua, aa);
    var mU = new Array(u.length).fill(true), mA = new Array(ans.length).fill(true);
    ui.forEach(function (p, k) { mU[p] = res.okA[k]; });
    ai.forEach(function (p, k) { mA[p] = res.okB[k]; });

    mU.forEach(function (v) { if (!v) bad++; });
    if (bad > 8) return null;

    var uh = '', ah = '';
    for (i = 0; i < u.length; i++) uh += mU[i] ? esc(u[i]) : '<span class="w">' + esc(u[i]) + '</span>';
    for (i = 0; i < ans.length; i++) ah += mA[i] ? esc(ans[i]) : '<span class="m">' + esc(ans[i]) + '</span>';

    return { u: uh, a: ah, bad: bad };
  }

  /* ---------------- DOM ---------------- */

  function $(id) { return document.getElementById(id); }

  var el = {
    home: $('vHome'), quiz: $('vQuiz'), done: $('vDone'),
    back: $('btnBack'), mini: $('barMini'),
    stDone: $('stDone'), stAcc: $('stAcc'), stWrong: $('stWrong'),
    allN: $('allN'), wrongN: $('wrongN'), pages: $('pages'), homeModes: $('homeModes'),
    qi: $('qi'), qe: $('qe'), pfill: $('pfill'),
    qpos: $('qpos'), qzh: $('qzh'), fb: $('fb'), ans: $('ans'),
    keys: $('keys'),
    btnHint: $('btnHint'), btnShow: $('btnShow'), btnSkip: $('btnSkip'), btnNext: $('btnNext'),
    btnSpeak: $('btnSpeak'),
    ring: $('ring'), rPct: $('rPct'), rTitle: $('rTitle'), rSub: $('rSub'),
    rWrongSec: $('rWrongSec'), rWrong: $('rWrong'), rWrongN: $('rWrongN'),
    rRetry: $('rRetry'), rRetryN: $('rRetryN'), rAgain: $('rAgain')
  };

  function view(name) {
    el.home.hidden = name !== 'home';
    el.quiz.hidden = name !== 'quiz';
    el.done.hidden = name !== 'done';
    el.back.hidden = name === 'home';
    window.scrollTo(0, 0);
  }

  /* ---------------- 首页 ---------------- */

  function bookCount() {
    var n = 0;
    for (var k in book) if (book[k]) n++;
    return n;
  }

  function renderHome() {
    view('home');
    el.mini.textContent = ITEMS.length + ' 词';
    el.stDone.textContent = stat.t;
    el.stAcc.textContent = stat.t ? Math.round(stat.r / stat.t * 100) + '%' : '—';
    el.stWrong.textContent = bookCount();
    el.allN.textContent = ITEMS.length;
    el.wrongN.textContent = bookCount();
    $('btnWrongMode').disabled = bookCount() === 0;

    var html = '';
    D.pages.forEach(function (p) {
      html += '<button class="pg" type="button" data-pg="' + p.no + '">' +
                p.no + '<em>' + p.n + ' 词</em></button>';
    });
    el.pages.innerHTML = html;
  }

  el.pages.addEventListener('click', function (e) {
    var b = e.target.closest('.pg');
    if (b) startPage(+b.dataset.pg);
  });

  el.homeModes.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (!b || b.disabled) return;
    if (b.dataset.go === 'all') startRound(shuffle(ITEMS.slice()), '全部', 'all');
    if (b.dataset.go === 'wrong') startWrongBook();
  });

  $('rHome').addEventListener('click', renderHome);
  el.back.addEventListener('click', renderHome);

  /* ---------------- 一轮 ---------------- */

  var S = null;
  var timer = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startRound(list, label, from, arg) {
    if (!list.length) return;
    clearTimeout(timer);
    S = { q: list, i: 0, right: 0, wrong: [], label: label, from: from, arg: arg,
          t0: Date.now(), done: false };
    view('quiz');
    el.mini.textContent = label;
    ask();
  }

  function startPage(no) {
    startRound(ITEMS.filter(function (x) { return x.pg === no; }), '第 ' + no + ' 页', 'page', no);
  }

  function startWrongBook() {
    var list = [];
    ITEMS.forEach(function (x) { if (book[keyOf(x)]) list.push(x); });
    if (!list.length) return;
    startRound(shuffle(list), '错词本', 'wrong');
  }

  function posOf(zh) {
    var m = zh.match(/^((?:n|v|adj|adv|prep|conj|pron|aux|vt|vi)(?:\s*\/\s*(?:n|v|adj|adv|prep|conj|pron|aux|vt|vi))*\.)\s+/);
    if (!m) return { pos: '', text: zh };
    return { pos: m[1], text: zh.slice(m[0].length) };
  }

  function ask() {
    var it = S.q[S.i];
    var p = posOf(it.zh);

    el.qpos.textContent = p.pos;
    el.qzh.textContent = p.text;
    el.qi.textContent = (S.i + 1) + ' / ' + S.q.length;
    el.qe.textContent = '错 ' + S.wrong.length;
    el.pfill.style.width = (S.i / S.q.length * 100) + '%';

    el.ans.value = '';
    el.ans.readOnly = false;
    el.ans.placeholder = '写下英文…';
    el.fb.hidden = true;
    el.fb.innerHTML = '';
    el.fb.className = 'fb';

    el.btnSpeak.hidden = true;
    el.btnHint.hidden = false;
    el.btnShow.hidden = false;
    el.btnSkip.hidden = false;
    el.btnNext.hidden = true;
    el.btnHint.disabled = false;
    el.btnShow.disabled = false;
    el.btnSkip.disabled = false;

    S.done = false;
    setTimeout(function () {
      try { el.ans.focus({ preventScroll: true }); } catch (e) { el.ans.focus(); }
    }, 40);
  }

  function remember(it, dir) {
    var k = keyOf(it);
    if (dir > 0) {
      var cur = book[k];
      book[k] = { zh: it.zh, en: it.en, n: (cur ? cur.n : 0) + 1, t: Date.now() };
    } else if (book[k]) {
      delete book[k];   /* 答对一次就销账：错词本是「还没记住」的清单，不是账本 */
    }
    save(LS.wrong, book);
  }

  function markAnswered() {
    el.ans.readOnly = true;
    el.ans.placeholder = '回车 / 点「下一题」继续';
    el.btnHint.hidden = true;
    el.btnShow.hidden = true;
    el.btnSkip.hidden = true;
    el.btnNext.hidden = false;
    el.btnSpeak.hidden = false;
    S.done = true;
  }

  function good(it) {
    S.right++;
    stat.r++; stat.t++;
    save(LS.stat, stat);
    remember(it, -1);

    el.fb.className = 'fb good';
    el.fb.innerHTML =
      '<p class="head"><span class="mark"><i class="tick"></i></span>对</p>' +
      '<p class="row"><span class="val">' + esc(it.en) + '</span></p>' +
      '<p class="note">0.6 秒后自动下一题</p>';
    el.fb.hidden = false;
    markAnswered();

    clearTimeout(timer);
    timer = setTimeout(next, 620);
  }

  function bad(it, shown) {
    S.wrong.push(it);
    stat.t++;
    save(LS.stat, stat);
    remember(it, +1);

    var d = shown ? diffHtml(shown, it.en) : null;
    var html = '<p class="head"><span class="mark"><i class="cross"></i></span>' +
               (shown ? '不太对' : '看一眼再走') + '</p>';

    if (d) {
      html += '<p class="row mine"><span>你写的</span><span class="val">' + d.u + '</span></p>';
      html += '<p class="row head-row"><span>应该是</span><span class="val">' + d.a + '</span></p>';
      html += '<p class="note">橙＝漏掉/写错，红划线＝多写 · 已记入错词本</p>';
    } else {
      if (shown) {
        html += '<p class="row mine"><span>你写的</span><span class="val">' + esc(shown) + '</span></p>';
      }
      html += '<p class="row head-row"><span>应该是</span><span class="val">' + esc(it.en) + '</span></p>';
      html += '<p class="note">已记入错词本</p>';
    }

    el.fb.className = 'fb bad';
    el.fb.innerHTML = html;
    el.fb.hidden = false;

    el.qe.textContent = '错 ' + S.wrong.length;
    markAnswered();
  }

  function submit() {
    if (!S) return;
    if (S.done) { next(); return; }

    var v = el.ans.value.trim();
    if (!v) { el.ans.focus(); return; }

    var it = S.q[S.i];
    if (hit(it, v)) good(it);
    else bad(it, v);
  }

  function reveal() {
    if (!S || S.done) return;
    bad(S.q[S.i], el.ans.value.trim());
  }

  function next() {
    clearTimeout(timer);
    if (!S) return;
    S.i++;
    if (S.i >= S.q.length) finish();
    else ask();
  }

  el.ans.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  el.btnNext.addEventListener('click', next);
  el.btnShow.addEventListener('click', reveal);
  el.btnSkip.addEventListener('click', reveal);

  el.btnHint.addEventListener('click', function () {
    if (!S || S.done) return;
    var it = S.q[S.i];
    el.fb.className = 'fb';
    el.fb.innerHTML = '<p class="note">首字母 <b class="k">' + esc(it.en.charAt(0)) +
      '</b> · ' + it.en.split(/\s+/).length + ' 个词 · 共 ' +
      it.en.replace(/[^a-z]/gi, '').length + ' 个字母</p>';
    el.fb.hidden = false;
    el.ans.focus();
  });

  el.btnSpeak.addEventListener('click', function () {
    if (S) speak(S.q[S.i].en);
  });

  function speak(txt) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(txt);
      u.lang = 'en-US';
      u.rate = .92;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------------- 结算 ---------------- */

  function fmtDur(ms) {
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m ? m + ' 分 ' + (s % 60) + ' 秒' : s + ' 秒';
  }

  function finish() {
    var total = S.q.length;
    var pct = Math.round(S.right / total * 100);

    el.ring.style.setProperty('--p', pct);
    el.rPct.textContent = pct + '%';
    el.rTitle.textContent = S.right + ' / ' + total + ' 答对';
    el.rSub.textContent = S.label + ' · 用了 ' + fmtDur(Date.now() - S.t0);

    if (S.wrong.length) {
      el.rWrongSec.hidden = false;
      el.rWrongN.textContent = S.wrong.length + ' 个';
      el.rWrong.innerHTML = S.wrong.map(function (it) {
        return '<div class="wrow"><span class="z">' + esc(it.zh) + '</span>' +
               '<span class="e">' + esc(it.en) + '</span></div>';
      }).join('');
      el.rRetry.hidden = false;
      el.rRetryN.textContent = S.wrong.length;
    } else {
      el.rWrongSec.hidden = true;
      el.rRetry.hidden = true;
    }

    var wrongList = shuffle(S.wrong.slice());
    var from = S.from, arg = S.arg, label = S.label;
    var round = S.q.slice();

    el.rRetry.onclick = function () {
      if (wrongList.length) startRound(wrongList, '重练', 'retry', null);
    };
    el.rAgain.onclick = function () {
      if (from === 'page') startPage(arg);
      else if (from === 'wrong') startWrongBook();
      else startRound(shuffle(ITEMS.slice()), '全部', 'all');
    };

    view('done');
  }

  /* ---------------- 起 ---------------- */

  /* 调试钩子：只用来跑断言，不进界面 */
  window.__snow = {
    judge: function (en, ans) { return hit({ en: en }, ans); },
    items: ITEMS
  };

  renderHome();
})();
