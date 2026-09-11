/* ============================================================
   风电标准学习平台 · 统一逻辑层
   三套标准课程（GB/T 46154 / NB/T 11773 / NB/T 10991）
   账号密码登录，每个账号 + 每门课程的学习数据完全独立
   ============================================================ */
(function () {
  'use strict';

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* ---------- 纯 JS SHA-256（兼容 file:// 与 HTTPS，用于密码加盐哈希） ---------- */
  var sha256 = (function () {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var maxWord = Math.pow(2, 32);
    var hash = [], k = [], isComposite = {}, primeCounter = 0;
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    return function (ascii) {
      var result = '', words = [], asciiBitLength = ascii.length * 8;
      ascii += '\x80';
      while (ascii.length % 64 - 56) ascii += '\x00';
      for (var i = 0; i < ascii.length; i++) {
        var j = ascii.charCodeAt(i);
        if (j >> 8) return '';
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
      }
      words[words.length] = (asciiBitLength / maxWord) | 0;
      words[words.length] = asciiBitLength;
      var h = hash.slice(0);
      for (var j = 0; j < words.length;) {
        var w = words.slice(j, j += 16), oldHash = h.slice(0, 8);
        for (var i = 0; i < 64; i++) {
          var w15 = w[i - 15], w2 = w[i - 2];
          var a = h[0], e = h[4];
          var temp1 = h[7]
            + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
            + ((e & h[5]) ^ ((~e) & h[6]))
            + k[i]
            + (w[i] = (i < 16) ? w[i] : (w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
          var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
            + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
          h = [(temp1 + temp2) | 0].concat(h);
          h[4] = (h[4] + temp1) | 0;
        }
        for (var i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
      }
      for (var i = 0; i < 8; i++) {
        for (var j = 3; j + 1; j--) {
          var b = (h[i] >> (j * 8)) & 255;
          result += ((b < 16) ? 0 : '') + b.toString(16);
        }
      }
      return result;
    };
  })();
  function hashPassword(salt, pwd) {
    return sha256(salt + ':' + encodeURIComponent(String(pwd)));
  }
  function randSalt() {
    var s = '';
    for (var i = 0; i < 16; i++) s += 'abcdef0123456789'[Math.floor(Math.random() * 16)];
    return s + '_' + Date.now().toString(36);
  }

  /* ================= 账号体系（本地存储） ================= */
  var USERS_KEY = 'unified_learn_users_v1';
  var SESSION_KEY = 'unified_learn_session';
  var users = {};
  try {
    var rawUsers = localStorage.getItem(USERS_KEY);
    if (rawUsers) users = JSON.parse(rawUsers);
  } catch (e) {}
  function saveUsers() {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
  }
  function curUser() {
    try {
      var s = sessionStorage.getItem(SESSION_KEY);
      if (s) { var o = JSON.parse(s); if (o && o.user && users[o.user]) return o.user; }
    } catch (e) {}
    return null;
  }
  function curNick() {
    var u = curUser();
    return u ? (users[u].nick || u) : '';
  }
  function setSession(user) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: user, at: Date.now() })); } catch (e) {}
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function authMsg(id, txt, ok) {
    var el = $(id);
    el.textContent = txt;
    el.className = 'auth-msg' + (ok ? ' ok' : ' err');
  }

  /* ---------- 注册 ---------- */
  $('tabLogin').onclick = function () { showAuthForm('login'); };
  $('tabReg').onclick = function () { showAuthForm('reg'); };
  function showAuthForm(which) {
    $('formLogin').classList.toggle('hidden', which !== 'login');
    $('formReg').classList.toggle('hidden', which !== 'reg');
    $('tabLogin').classList.toggle('active', which === 'login');
    $('tabReg').classList.toggle('active', which === 'reg');
  }
  $('formLogin').onsubmit = function (e) {
    e.preventDefault();
    var u = $('liUser').value.trim();
    var p = $('liPass').value;
    if (!u || !p) { authMsg('liMsg', '请输入账号和密码'); return; }
    var rec = users[u];
    if (!rec) { authMsg('liMsg', '账号不存在，请先注册'); return; }
    if (hashPassword(rec.salt, p) !== rec.hash) { authMsg('liMsg', '密码不正确'); return; }
    setSession(u);
    enterPortal();
  };
  $('formReg').onsubmit = function (e) {
    e.preventDefault();
    var u = $('rgUser').value.trim();
    var nick = $('rgNick').value.trim();
    var p = $('rgPass').value;
    var p2 = $('rgPass2').value;
    if (!/^[A-Za-z0-9_]{2,20}$/.test(u)) { authMsg('rgMsg', '账号需为 2-20 位字母、数字或下划线'); return; }
    if (users[u]) { authMsg('rgMsg', '该账号已存在，请直接登录'); return; }
    if (p.length < 4) { authMsg('rgMsg', '密码至少 4 位'); return; }
    if (p !== p2) { authMsg('rgMsg', '两次输入的密码不一致'); return; }
    var salt = randSalt();
    users[u] = { salt: salt, hash: hashPassword(salt, p), nick: nick || u, created: Date.now() };
    saveUsers();
    setSession(u);
    enterPortal();
  };

  /* ================= 课程配置 ================= */
  var KB_MAP_GBT = function (p) {
    if (!window.KB) return null;
    if (KB.standards && KB.standards[p]) return p;
    if (p.includes('封面')) return '封面';
    if (p.includes('前言')) return '前言';
    if (p.includes('引言')) return '引言';
    if (p.includes('第1章') || p === '1 范围') return '第1章 范围';
    if (p.includes('第2章') || p === '2 规范性引用文件') return '第2章 规范性引用文件';
    if (p.includes('第3章')) return '第3章 术语、定义和符号';
    if (p.includes('第4章') || p === '4 重大危险清单') return '第4章 重大危险清单';
    if (p.includes('第6章')) return '第6章 验证';
    if (p.includes('第7章')) return '第7章 使用信息';
    if (p.includes('附录A')) return '附录A 重大危险清单';
    if (p.includes('附录B')) return '附录B 风机电梯试验';
    if (p.includes('附录C')) return '附录C 起升机构试验';
    if (p.includes('附录D')) return '附录D 计算方法指南';
    if (p.includes('附录E')) return '附录E 超速安全装置和防坠落装置试验';
    if (p.includes('附录F')) return '附录F 层门强度试验';
    if (p.includes('附录G')) return '附录G 疏散与救援';
    if (p.includes('图3') || p.includes('图4')) return '图3、图4 标引说明';
    var tm = p.match(/^(表\d+)/);
    if (tm) return tm[1];
    var cm = p.match(/^(\d+(?:\.\d+)+)/);
    if (cm) return cm[1];
    var am = p.match(/^([A-G])\.(\d+(?:\.\d+)*)/);
    if (am) return am[1] + '.' + am[2];
    return null;
  };
  var KB_MAP_NBT11773 = function (p) {
    if (!window.KB) return null;
    if (KB.standards && KB.standards[p]) return p;
    if (p.includes('封面')) return '封面';
    if (p.includes('前言')) return '前言';
    if (p.includes('第1章') || p === '1 范围') return '第1章 范围';
    if (p.includes('第2章') || p === '2 规范性引用文件') return '第2章 规范性引用文件';
    if (p.includes('第3章')) return '第3章 术语和定义';
    if (p.includes('第4章')) return '第4章 技术要求';
    if (p.includes('第5章')) return '第5章 装配';
    if (p.includes('第6章')) return '第6章 检验';
    if (p.includes('第7章')) return '第7章 包装、储存和运输';
    var fm = p.match(/^(图\d+)/);
    if (fm) return fm[1];
    var tm = p.match(/^(表\d+)/);
    if (tm) return tm[1];
    var cm = p.match(/^(\d+(?:\.\d+)+)/);
    if (cm) return cm[1];
    return null;
  };
  var KB_MAP_NBT10991 = function (p) {
    if (!window.KB) return null;
    if (KB.standards && KB.standards[p]) return p;
    var pNoSpace = p.replace(/\s+/g, '');
    if (KB.standards && KB.standards[pNoSpace]) return pNoSpace;
    if (p.includes('封面')) return '封面';
    if (p.includes('前言')) return '前言';
    if (p.includes('第1章') || p === '1 范围') return '第1章 范围';
    if (p.includes('第2章') || p === '2 规范性引用文件') return '第2章 规范性引用文件';
    if (p.includes('第3章') || p === '3 术语和定义') return '第3章 术语和定义';
    if (p.includes('第4章') || p === '4 型号、分类、主参数') return '第4章 型号、分类、主参数';
    if (p.includes('第5章') || p === '5 技术要求') return '第5章 技术要求';
    if (p.includes('第6章') || p === '6 试验') return '第6章 试验';
    if (p.includes('第7章') || p === '7 检验方法检验规则') return '第7章 检验方法检验规则';
    if (p.includes('第8章') || p === '8 标识、包装、运输、贮存') return '第8章 标识、包装、运输、贮存';
    if (p.includes('第9章') || p === '9 随机文件') return '第9章 随机文件';
    if (p.includes('第10章') || p === '10 安装与运行维护') return '第10章 安装与运行维护';
    if (p.includes('附录A')) return '附录A 离心式安全锁锁绳速度';
    var tm = p.match(/^(表\d+)/);
    if (tm) return tm[1];
    var cm = p.match(/^(\d+(?:\.\d+)+)/);
    if (cm) return cm[1];
    return null;
  };

  var COURSES = [
    { id: 'gbt46154', code: 'GB/T 46154—2025', short: '风机电梯', name: '风力发电机组用电梯制造与安装安全规范', ch: 14, logo: 'GB', kbMap: KB_MAP_GBT },
    { id: 'nbt11773', code: 'NB/T 11773—2025', short: '内附件', name: '风力发电机组内附件技术规范', ch: 9, logo: 'NB', kbMap: KB_MAP_NBT11773 },
    { id: 'nbt10991', code: 'NB/T 10991—2022', short: '塔架升降机', name: '风力发电机组 塔架升降机', ch: 14, logo: 'NB', kbMap: KB_MAP_NBT10991 }
  ];
  var COURSE_META = (window.COURSE_META || {});
  function getCourse(cid) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === cid) return COURSES[i];
    return COURSES[0];
  }

  /* ================= 视图路由 ================= */
  function showLogin() {
    $('view-login').classList.remove('hidden');
    $('view-portal').classList.add('hidden');
    $('view-course').classList.add('hidden');
    clearCourseGlobals();
  }
  function enterPortal() {
    $('view-login').classList.add('hidden');
    $('view-course').classList.add('hidden');
    $('view-portal').classList.remove('hidden');
    renderPortal();
  }
  function enterCourse(cid) {
    $('view-login').classList.add('hidden');
    $('view-portal').classList.add('hidden');
    $('view-course').classList.remove('hidden');
    clearCourseGlobals();
    var c = getCourse(cid);
    // 标题
    document.title = c.code + ' ' + c.name + ' · 互动学习课程';
    $('courseLogo').textContent = c.logo;
    $('courseTitle').textContent = c.name;
    $('courseSub').innerHTML = c.code + ' · 互动学习课程 · <span id="totalCount">0</span> 道权威题库';
    $('courseBarName').textContent = c.code + ' ' + c.short;
    $('courseBarUser').textContent = curNick();
    $('lecTitle').textContent = '正在加载课程数据…';
    loadCourseData(cid, function () { initCourse(c); });
  }

  /* ---------- 课程数据动态加载 ---------- */
  function clearCourseGlobals() {
    for (var i = 1; i <= 20; i++) {
      var k = 'CH' + (i < 10 ? '0' + i : i);
      try { delete window[k]; } catch (e) {}
    }
    try { delete window.FILL; } catch (e) {}
    try { delete window.KB; } catch (e) {}
  }
  function loadCourseData(cid, cb) {
    var c = getCourse(cid);
    var files = [];
    for (var i = 1; i <= c.ch; i++) {
      files.push('data/' + cid + '/ch' + (i < 10 ? '0' + i : i) + '.js');
    }
    files.push('data/' + cid + '/fill.js', 'data/' + cid + '/kb.js');
    var idx = 0;
    function next() {
      if (idx >= files.length) { cb(); return; }
      var s = document.createElement('script');
      s.src = files[idx++];
      s.onload = next;
      s.onerror = function () { alert('课程数据加载失败：' + s.src); };
      document.head.appendChild(s);
    }
    next();
  }

  /* ================= 课程逻辑（按当前课程初始化） ================= */
  var CHAPTERS = [], ALL = [], ST = { ans: {}, mark: {} }, STF = { ans: {}, mark: {} };
  var KEY = '', FKEY = '';
  var view = 'lecture', curChap = 0, slideIdx = 0, playTimer = null, playing = false, speakOn = false;
  var pool = [], qi = 0, answered = false, chosen = [];
  var FPOOL = [], fpool = [], fq = 0, fanswered = false;
  var CURRENT = null;

  function loadST(cid) {
    var u = curUser();
    KEY = 'unified_v1_' + cid + '_' + u + '_quiz';
    FKEY = 'unified_v1_' + cid + '_' + u + '_fill';
    ST = { ans: {}, mark: {} };
    STF = { ans: {}, mark: {} };
    try { var r1 = localStorage.getItem(KEY); if (r1) ST = JSON.parse(r1); } catch (e) {}
    try { var r2 = localStorage.getItem(FKEY); if (r2) STF = JSON.parse(r2); } catch (e) {}
    if (!ST.ans) ST.ans = {};
    if (!ST.mark) ST.mark = {};
    if (!STF.ans) STF.ans = {};
    if (!STF.mark) STF.mark = {};
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }
  function fsave() { try { localStorage.setItem(FKEY, JSON.stringify(STF)); } catch (e) {} }

  function initCourse(c) {
    CURRENT = c;
    loadST(c.id);
    // 收集章节数据
    CHAPTERS = [];
    for (var i = 1; i <= c.ch; i++) {
      var k = 'CH' + (i < 10 ? '0' + i : i);
      if (window[k]) CHAPTERS.push(window[k]);
    }
    ALL = [];
    CHAPTERS.forEach(function (ch) {
      ch.questions.forEach(function (q) { ALL.push({ ch: ch, q: q }); });
    });
    ALL.forEach(function (it, i) { it.gid = i; it.q._gid = i; });
    // 填空数据
    FPOOL = [];
    var FILL = window.FILL || null;
    if (FILL && FILL.questions) {
      FILL.questions.forEach(function (q, i) { FPOOL.push({ ch: FILL, q: q, gid: 'F' + i }); });
    }
    // 重置答题状态
    pool = []; qi = 0; answered = false; chosen = [];
    fpool = []; fq = 0; fanswered = false;
    view = 'lecture';
    curChap = 0; slideIdx = 0; stopPlay();
    // 填充章节下拉
    fillChapterSelect($('fChapter'), true);
    fillChapterSelect($('ffChapter'), false);
    fillMobileSelect();
    buildNav();
    renderSlide();
    applyFilter(true);
    updateTopStats();
    switchView('lecture');
    window.scrollTo(0, 0);
  }

  function fillChapterSelect(sel, withTitle) {
    if (!sel) return;
    sel.innerHTML = '<option value="all">全部章节</option>';
    CHAPTERS.forEach(function (c2) {
      var o = document.createElement('option');
      o.value = c2.id;
      o.textContent = withTitle ? ('第' + c2.id + '章 ' + c2.title) : ('第' + c2.id + '章');
      sel.appendChild(o);
    });
  }
  function fillMobileSelect() {
    var mSel = $('mChapter');
    mSel.innerHTML = '';
    CHAPTERS.forEach(function (c2) {
      var o = document.createElement('option');
      o.value = c2.id;
      o.textContent = '第' + c2.id + '章 ' + c2.title;
      mSel.appendChild(o);
    });
  }

  /* ================= 引用规范链接化 ================= */
  var STD_RE = /((?:GB(?:\/T|\/Z)?|NB(?:\/T)?|JB(?:\/T)?|TSG|AQ|GA|YD(?:\/T)?|DL(?:\/T)?|JGJ|QB(?:\/T)?|HG(?:\/T)?|WS(?:\/T)?|SN(?:\/T)?)\s?-?\s?\d{3,5}(?:\.\d+)*)(?:—\d{4})?(?![0-9])/g;
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function linkStandards(txt) {
    return escHtml(txt).replace(STD_RE, function (m) {
      return '<a class="std-link" data-kb="' + m + '">' + m + '</a>';
    });
  }
  function linkStdNodes(root) {
    if (!root || !root.querySelectorAll) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (p && p.closest && p.closest('a,button,script,style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(function (n) {
      var txt = n.nodeValue;
      if (!STD_RE.test(txt)) return;
      STD_RE.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = STD_RE.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        var a = document.createElement('a');
        a.className = 'std-link';
        a.dataset.kb = m[0];
        a.textContent = m[0];
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
    STD_RE.lastIndex = 0;
  }

  /* ================= 知识库弹窗 ================= */
  function kbMap(p) {
    if (!CURRENT) return null;
    return CURRENT.kbMap(p);
  }
  function openKb(src, label) {
    if (!window.KB) { alert('知识库未加载'); return; }
    var parts = src.split(/[；;，,、+~～]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var html = '';
    parts.forEach(function (p) {
      var key = kbMap(p);
      var entry = key && (KB.items[key] || KB.special[key] || KB.standards[key]);
      if (entry) {
        var head = '<div class="kb-key">' + escHtml(key) + (entry.t ? ' ' + escHtml(entry.t) : '') + '</div>';
        var text = '<div class="kb-text">' + escHtml(entry.c) + '</div>';
        html += '<div class="kb-item">' + head + text + '</div>';
      } else {
        html += '<div class="kb-item"><div class="kb-key">' + escHtml(p) + '</div><div class="kb-text">（该出处暂无知识库条目）</div></div>';
      }
    });
    $('kbTitle').textContent = label + '：' + src;
    $('kbBody').innerHTML = html;
    $('kbModal').classList.remove('hidden');
  }
  function closeKb() { $('kbModal').classList.add('hidden'); }

  /* ================= 章节导航 ================= */
  function buildNav() {
    var nav = $('chapNav');
    nav.innerHTML = '';
    var mSel = $('mChapter');
    if (mSel) mSel.value = String(CHAPTERS[curChap].id);
    CHAPTERS.forEach(function (c2, i) {
      var d = document.createElement('div');
      d.className = 'chap-item' + (i === curChap ? ' active' : '');
      d.innerHTML = '<span>' + c2.title + '</span><span class="cnum">' + c2.questions.length + ' 题</span>';
      d.onclick = function () {
        curChap = i; slideIdx = 0;
        stopPlay();
        buildNav();
        if (view === 'lecture') renderSlide();
        else { $('fChapter').value = String(c2.id); applyFilter(false); }
      };
      nav.appendChild(d);
    });
  }

  /* ================= 讲解 ================= */
  function renderSlide() {
    var c2 = CHAPTERS[curChap];
    var sl = c2.slides[slideIdx];
    $('lecChap').textContent = '第 ' + c2.id + ' 章';
    $('lecTitle').textContent = c2.title;
    var html = '<h3>' + sl.h + '</h3>' + sl.body;
    if (sl.src) html += '<div class="src">出处：' + sl.src + '</div>';
    $('lecSlide').innerHTML = html;
    linkStdNodes($('lecSlide'));
    $('lecIdx').textContent = (slideIdx + 1) + ' / ' + c2.slides.length;
    $('lecBar').style.width = ((slideIdx + 1) / c2.slides.length * 100) + '%';
    var dots = $('lecDots'); dots.innerHTML = '';
    c2.slides.forEach(function (_, i) {
      var dd = document.createElement('div');
      dd.className = 'dot' + (i === slideIdx ? ' on' : '');
      dd.onclick = function () { slideIdx = i; renderSlide(); };
      dots.appendChild(dd);
    });
    $('lecPrev').disabled = slideIdx === 0;
    $('lecNext').disabled = slideIdx === c2.slides.length - 1;
    enhanceTables();
  }
  function enhanceTables() {
    var slide = $('lecSlide');
    var tables = slide.querySelectorAll('table');
    Array.prototype.forEach.call(tables, function (t) {
      var wrap = t.parentNode;
      if (wrap && wrap.classList && wrap.classList.contains('tbl-wrap')) return;
      var box = document.createElement('div');
      box.className = 'tbl-wrap';
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
      var tip = document.createElement('div');
      tip.className = 'tbl-tip hidden';
      tip.textContent = '← 左右滑动查看完整表格 →';
      box.parentNode.insertBefore(tip, box);
      var check = function () {
        var w = box.querySelector('table');
        if (!w) return;
        var over = w.scrollWidth - w.clientWidth > 2;
        tip.classList.toggle('hidden', !over || w.scrollLeft > 4);
        box.classList.toggle('scrollable', over);
        box.classList.toggle('at-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
        box.classList.toggle('at-start', w.scrollLeft <= 4);
      };
      t.addEventListener('scroll', check, { passive: true });
      check();
    });
  }
  function slideText() {
    return ($('lecSlide').textContent || '').replace(/\s+/g, ' ').trim();
  }
  function speakCurrent(onEnd) {
    if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    var u = new window.SpeechSynthesisUtterance(slideText());
    u.lang = 'zh-CN';
    u.rate = 1.05;
    if (onEnd) u.onend = onEnd;
    try { window.speechSynthesis.speak(u); } catch (e) { if (onEnd) onEnd(); }
  }
  function cancelSpeak() {
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function stopPlay() {
    playing = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    cancelSpeak();
    $('lecPlay').textContent = '自动播放';
    $('lecPlay').classList.remove('primary');
  }
  function advance() {
    var c2 = CHAPTERS[curChap];
    if (slideIdx >= c2.slides.length - 1) { stopPlay(); return; }
    slideIdx++;
    renderSlide();
    runStep();
  }
  function runStep() {
    var c2 = CHAPTERS[curChap];
    if (speakOn) {
      speakCurrent(function () {
        if (!playing) return;
        playTimer = setTimeout(function () {
          playTimer = null;
          if (!playing) return;
          if (slideIdx >= c2.slides.length - 1) { stopPlay(); return; }
          advance();
        }, 900);
      });
    } else {
      playTimer = setTimeout(function () { playTimer = null; advance(); }, 9000);
    }
  }
  function startPlay() {
    playing = true;
    $('lecPlay').textContent = '暂停';
    $('lecPlay').classList.add('primary');
    runStep();
  }

  /* ================= 答题 ================= */
  function matchScope(it) {
    var s = $('fScope').value;
    var rec = ST.ans[it.gid];
    if (s === 'undo') return !rec;
    if (s === 'wrong') return rec && !rec.ok;
    if (s === 'right') return rec && rec.ok;
    return true;
  }
  function applyFilter(keepChapter) {
    var ch = $('fChapter').value;
    var ty = $('fType').value;
    pool = ALL.filter(function (it) {
      if (ch !== 'all' && it.ch.id !== parseInt(ch, 10)) return false;
      if (keepChapter && it.ch.id !== CHAPTERS[curChap].id) return false;
      if (ty !== 'all' && it.q.t !== ty) return false;
      if (!matchScope(it)) return false;
      return true;
    });
    if ($('fShuffle').checked) pool.sort(function () { return Math.random() - 0.5; });
    qi = 0;
    if (!pool.length) { renderEmpty(); return; }
    renderQ();
  }
  function renderEmpty() {
    $('qChapter').textContent = '无匹配题目';
    $('qType').textContent = '—';
    $('qIdx').textContent = '0 / 0';
    $('qSourceTag').textContent = '—';
    $('qText').textContent = '当前筛选条件下没有题目，请调整章节、题型或范围。';
    $('qOptions').innerHTML = '';
    $('qFeedback').classList.add('hidden');
    $('quizRange').textContent = '0 题';
    $('jumpGrid').innerHTML = '';
    $('qNext').textContent = '下一题 →';
  }
  function optsOf(q) {
    if (q.t === 'judge') return ['正确', '错误'];
    return q.o;
  }
  function renderQ() {
    var it = pool[qi];
    var q = it.q;
    answered = false; chosen = [];
    var rec = ST.ans[it.gid];

    $('qChapter').textContent = '第' + it.ch.id + '章 ' + it.ch.title;
    $('qType').textContent = q.t === 'single' ? '单选题' : q.t === 'multi' ? '多选题' : '判断题';
    $('qIdx').textContent = (qi + 1) + ' / ' + pool.length;
    $('qSourceTag').textContent = '出处见解析';
    $('qText').textContent = q.q;
    $('quizRange').textContent = '共 ' + pool.length + ' 题';

    var wrap = $('qOptions');
    wrap.innerHTML = '';
    wrap.className = 'options' + (q.t === 'multi' ? ' opt-multi' : '');
    optsOf(q).forEach(function (txt, i) {
      var d = document.createElement('div');
      d.className = 'opt';
      d.innerHTML = '<div class="letter">' + LETTERS[i] + '</div><div>' + txt + '</div>';
      d.onclick = function () { pick(i, d); };
      wrap.appendChild(d);
    });

    $('qFeedback').classList.add('hidden');
    $('qMark').style.display = 'none';

    if (rec) {
      answered = true;
      chosen = rec.pick.slice();
      lockAndShow(rec.ok);
    } else {
      $('qNext').textContent = (q.t === 'multi') ? '提交答案' : '下一题 →';
    }
    renderJump();
    updateTopStats();
  }
  function pick(i, el) {
    if (answered) return;
    var it = pool[qi], q = it.q;
    var nodes = $('qOptions').children;
    if (q.t === 'multi') {
      var k = chosen.indexOf(i);
      if (k >= 0) { chosen.splice(k, 1); el.classList.remove('sel'); }
      else { chosen.push(i); el.classList.add('sel'); }
      $('qNext').textContent = chosen.length ? '提交答案（已选 ' + chosen.length + ' 项）' : '提交答案';
      return;
    }
    chosen = [i];
    for (var n = 0; n < nodes.length; n++) nodes[n].classList.remove('sel');
    el.classList.add('sel');
    submit();
  }
  function submit() {
    var it = pool[qi], q = it.q;
    if (!chosen.length) return;
    var ok = chosen.length === q.a.length && q.a.every(function (x) { return chosen.indexOf(x) >= 0; });
    ST.ans[it.gid] = { ok: ok, pick: chosen.slice() };
    save();
    answered = true;
    lockAndShow(ok);
    renderJump();
    updateTopStats();
  }
  function lockAndShow(ok) {
    var it = pool[qi], q = it.q;
    var nodes = $('qOptions').children;
    for (var n = 0; n < nodes.length; n++) {
      nodes[n].classList.add('locked');
      nodes[n].classList.remove('sel');
      if (q.a.indexOf(n) >= 0) nodes[n].classList.add('right');
      else if (chosen.indexOf(n) >= 0) nodes[n].classList.add('wrong');
    }
    var fb = $('qFeedback');
    fb.classList.remove('hidden');
    var head = $('fbHead');
    head.className = 'fb-head ' + (ok ? 'ok' : 'bad');
    head.textContent = ok ? '✓ 回答正确' : '✗ 回答错误';
    $('fbAnswer').textContent = q.a.map(function (x) { return LETTERS[x] + '. ' + optsOf(q)[x]; }).join('　|　');
    $('fbExplain').innerHTML = linkStandards(q.e);
    $('fbSource').innerHTML = '<button type="button" class="src-link" data-src="' + escHtml(q.s) + '">出处：' + escHtml(q.s) + ' <span class="src-arrow">▸</span></button>';
    $('qMark').style.display = 'inline-block';
    $('qMark').textContent = ST.mark[it.gid] ? '已标记 ★' : '标记错题';
    $('qNext').textContent = '下一题 →';
  }
  function renderJump() {
    var g = $('jumpGrid'); g.innerHTML = '';
    pool.forEach(function (it, i) {
      var rec = ST.ans[it.gid];
      var b = document.createElement('button');
      b.className = 'jump-btn' + (i === qi ? ' cur' : '') + (rec ? (rec.ok ? ' right' : ' wrong') : '');
      b.textContent = i + 1;
      b.onclick = function () { qi = i; renderQ(); window.scrollTo(0, 0); };
      g.appendChild(b);
    });
  }
  function updateTopStats() {
    var done = 0, right = 0;
    for (var k in ST.ans) { if (ST.ans.hasOwnProperty(k)) { done++; if (ST.ans[k].ok) right++; } }
    $('sDone').textContent = done;
    $('sRight').textContent = right;
    $('sWrong').textContent = done - right;
    $('sRate').textContent = done ? Math.round(right / done * 100) + '%' : '—';
    $('totalCount').textContent = ALL.length;
  }
  function renderStats() {
    var done = 0, right = 0;
    for (var k in ST.ans) { if (ST.ans.hasOwnProperty(k)) { done++; if (ST.ans[k].ok) right++; } }
    var marks = Object.keys(ST.mark).length;
    $('statCards').innerHTML =
      '<div class="scard"><b>' + ALL.length + '</b><span>题库总题量</span></div>' +
      '<div class="scard"><b>' + done + '</b><span>已作答题数</span></div>' +
      '<div class="scard"><b>' + right + '</b><span>答对题数</span></div>' +
      '<div class="scard"><b>' + (done ? Math.round(right / done * 100) + '%' : '—') + '</b><span>总正确率</span></div>' +
      '<div class="scard"><b>' + marks + '</b><span>手动标记</span></div>' +
      '<div class="scard"><b>' + Math.round(done / ALL.length * 100) + '%</b><span>完成进度</span></div>';

    var cs = $('chapStats'); cs.innerHTML = '';
    CHAPTERS.forEach(function (c2) {
      var tot = c2.questions.length, d = 0, r = 0;
      c2.questions.forEach(function (q) {
        var rec = ST.ans[q._gid];
        if (rec) { d++; if (rec.ok) r++; }
      });
      var pct = d ? Math.round(r / d * 100) : 0;
      var row = document.createElement('div');
      row.className = 'cs-row';
      row.innerHTML = '<div class="cs-name">第' + c2.id + '章 ' + c2.title + '</div>' +
        '<div class="cs-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="cs-val">' + (d ? r + '/' + d + ' · ' + pct + '%' : '未开始') + '</div>';
      cs.appendChild(row);
    });

    var wl = $('wrongList'); wl.innerHTML = '';
    var bad = ALL.filter(function (it) { var r = ST.ans[it.gid]; return r && !r.ok; });
    if (!bad.length) {
      wl.innerHTML = '<div class="empty">还没有错题。做错的题目会自动出现在这里。</div>';
      return;
    }
    bad.forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'wrong-item';
      d.innerHTML = '<b>第' + it.ch.id + '章 · ' + it.q.q.slice(0, 60) + (it.q.q.length > 60 ? '…' : '') + '</b>' +
        '<div style="margin-top:4px;color:#7b8493">正确：' + it.q.a.map(function (x) { return LETTERS[x]; }).join('') + '　出处：' + it.q.s + '</div>';
      d.onclick = function () {
        switchView('quiz');
        $('fChapter').value = 'all'; $('fType').value = 'all'; $('fScope').value = 'all';
        applyFilter(false);
        var pos = pool.indexOf(it);
        if (pos >= 0) { qi = pos; renderQ(); }
      };
      wl.appendChild(d);
    });
  }

  /* ================= 视图切换（课程内四模式） ================= */
  function switchView(v) {
    view = v;
    ['lecture', 'quiz', 'fill', 'stats'].forEach(function (n) {
      $('view-' + n).classList.toggle('hidden', n !== v);
    });
    document.querySelectorAll('.mode-btn, .mnav-btn[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === v);
    });
    if (v !== 'lecture') stopPlay();
    if (v === 'lecture') renderSlide();
    if (v === 'stats') renderStats();
    if (v === 'fill' && !fpool.length) fApplyFilter();
    if (v === 'quiz' && !pool.length) {
      $('fChapter').value = String(CHAPTERS[curChap].id);
      applyFilter(false);
    } else if (v === 'quiz' && $('fChapter').value !== 'all'
               && $('fChapter').value !== String(CHAPTERS[curChap].id)) {
      $('fChapter').value = String(CHAPTERS[curChap].id);
      applyFilter(false);
    }
  }
  document.querySelectorAll('.mode-btn, .mnav-btn[data-view]').forEach(function (b) {
    if (b.dataset.view) b.onclick = function () { switchView(b.dataset.view); };
  });

  /* ================= 移动端章节选择 ================= */
  $('mChapter').onchange = function () {
    var id = parseInt($('mChapter').value, 10);
    CHAPTERS.forEach(function (c2, i) { if (c2.id === id) curChap = i; });
    slideIdx = 0;
    buildNav();
    if (view === 'lecture') renderSlide();
    else switchView('lecture');
  };

  /* ================= 进度导入 / 导出 ================= */
  function countProgress() {
    var done = 0, right = 0;
    for (var k in ST.ans) {
      if (ST.ans.hasOwnProperty(k)) { done++; if (ST.ans[k].ok) right++; }
    }
    return { done: done, right: right };
  }
  function openSync() {
    $('syncModal').classList.remove('hidden');
    $('syncStatus').textContent = '';
    $('syncStatus').className = 'modal-status';
    var p = countProgress();
    $('syncSum').textContent = '当前账号进度：已答 ' + p.done + ' 题，答对 ' + p.right + ' 题。';
  }
  function closeSync() { $('syncModal').classList.add('hidden'); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.src-link, .std-link') : null;
    if (!el) return;
    e.preventDefault();
    var src = el.dataset.kb || el.dataset.src || el.textContent.trim();
    openKb(src, el.classList.contains('std-link') ? '引用规范' : '出处');
  });
  $('kbClose').onclick = closeKb;
  $('kbMask').onclick = closeKb;
  $('btnSync2').onclick = openSync;
  $('mSync').onclick = openSync;
  $('syncClose').onclick = closeSync;
  $('syncMask').onclick = closeSync;

  $('btnExport').onclick = function () {
    if (!CURRENT) return;
    try {
      var u = curUser();
      var data = { app: CURRENT.code + ' 学习课程', user: u, ver: 2, at: Date.now(), progress: ST };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
      a.href = url;
      a.download = CURRENT.short + '-学习进度-' + u + '-' + stamp + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      var p = countProgress();
      $('syncStatus').className = 'modal-status ok';
      $('syncStatus').textContent = '已导出 ' + p.done + ' 条答题记录，文件已下载。把它发到新设备即可导入。';
    } catch (err) {
      $('syncStatus').className = 'modal-status err';
      $('syncStatus').textContent = '导出失败：' + err.message;
    }
  };
  $('btnImport').onclick = function () { $('fileInput').click(); };
  $('fileInput').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var obj = JSON.parse(rd.result);
        var p = obj && obj.progress ? obj.progress : obj;
        if (!p || typeof p !== 'object' || !p.ans) throw new Error('文件格式不正确');
        var merge = Object.keys(ST.ans).length > 0 &&
                    !confirm('本机已有答题记录。\n\n点「确定」= 合并两边的进度（推荐）\n点「取消」= 用导入的记录覆盖本机');
        if (merge) {
          for (var k in p.ans) { if (p.ans.hasOwnProperty(k)) ST.ans[k] = p.ans[k]; }
          if (p.mark) { for (var m in p.mark) { if (p.mark.hasOwnProperty(m)) ST.mark[m] = p.mark[m]; } }
        } else {
          ST.ans = p.ans || {};
          ST.mark = p.mark || {};
        }
        save();
        updateTopStats();
        if (view === 'stats') renderStats();
        if (view === 'quiz') renderQ();
        var c = countProgress();
        $('syncStatus').className = 'modal-status ok';
        $('syncStatus').textContent = '导入成功！当前已答 ' + c.done + ' 题，答对 ' + c.right + ' 题。';
        $('syncSum').textContent = '进度已写入当前账号，可继续学习。';
      } catch (err2) {
        $('syncStatus').className = 'modal-status err';
        $('syncStatus').textContent = '导入失败：' + err2.message;
      }
      e.target.value = '';
    };
    rd.readAsText(f);
  };

  /* ================= 答题按钮 ================= */
  $('qPrev').onclick = function () { if (qi > 0) { qi--; renderQ(); window.scrollTo(0, 0); } };
  $('qNext').onclick = function () {
    var it = pool[qi];
    if (it && !answered && it.q.t === 'multi') { submit(); return; }
    if (qi < pool.length - 1) { qi++; renderQ(); window.scrollTo(0, 0); }
  };
  $('qMark').onclick = function () {
    var it = pool[qi];
    if (ST.mark[it.gid]) delete ST.mark[it.gid]; else ST.mark[it.gid] = 1;
    save();
    $('qMark').textContent = ST.mark[it.gid] ? '已标记 ★' : '标记错题';
  };
  $('fChapter').onchange = function () { applyFilter(false); };
  $('fType').onchange = function () { applyFilter(false); };
  $('fScope').onchange = function () { applyFilter(false); };
  $('fShuffle').onchange = function () { applyFilter(false); };
  $('btnReset').onclick = function () {
    if (confirm('确定清空当前账号在本课程的全部答题记录与标记吗？此操作不可撤销。')) {
      ST = { ans: {}, mark: {} }; save();
      applyFilter(false); updateTopStats(); renderStats();
    }
  };
  $('lecPrev').onclick = function () {
    if (slideIdx > 0) {
      stopPlay(); slideIdx--; renderSlide();
      if (speakOn) speakCurrent(null);
    }
  };
  $('lecNext').onclick = function () {
    var c2 = CHAPTERS[curChap];
    if (slideIdx < c2.slides.length - 1) {
      stopPlay(); slideIdx++; renderSlide();
      if (speakOn) speakCurrent(null);
    }
  };
  $('lecPlay').onclick = function () { playing ? stopPlay() : startPlay(); };
  $('lecSpeak').onclick = function () {
    speakOn = !speakOn;
    $('lecSpeak').textContent = speakOn ? '语音讲解 ✓' : '语音讲解';
    $('lecSpeak').classList.toggle('primary', speakOn);
    if (speakOn) speakCurrent(null); else cancelSpeak();
  };
  $('lecToQuiz').onclick = function () {
    switchView('quiz');
    $('fChapter').value = String(CHAPTERS[curChap].id);
    $('fScope').value = 'all';
    applyFilter(false);
  };

  /* ================= 填空 ================= */
  function normIn(s) {
    return ('' + s)
      .replace(/[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u00A0]/g, '')
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\u3000/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }
  function fMatch(acc, val) {
    return acc.some(function (a) { return normIn(a) === normIn(val); });
  }
  function fStats() {
    var done = 0, right = 0;
    for (var k in STF.ans) { if (STF.ans.hasOwnProperty(k)) { done++; if (STF.ans[k].ok) right++; } }
    return { done: done, right: right, rate: done ? Math.round(right / done * 100) : null };
  }
  function fRenderStats() {
    var st = fStats();
    $('ffStats').textContent = '填空题库共 ' + FPOOL.length + ' 题 · 已答 ' + st.done +
      ' · 答对 ' + st.right + (st.rate !== null ? ' · 正确率 ' + st.rate + '%' : '');
  }
  function fApplyFilter() {
    var ch = $('ffChapter').value;
    var sc = $('ffScope').value;
    fpool = FPOOL.filter(function (it) {
      if (ch !== 'all' && it.q.ch !== parseInt(ch, 10)) return false;
      var rec = STF.ans[it.gid];
      if (sc === 'undo') return !rec;
      if (sc === 'wrong') return rec && !rec.ok;
      if (sc === 'right') return rec && rec.ok;
      return true;
    });
    if ($('ffShuffle').checked) fpool.sort(function () { return Math.random() - 0.5; });
    fq = 0;
    if (!fpool.length) { fRenderEmpty(); return; }
    fRenderQ();
  }
  function fRenderEmpty() {
    $('fqChapter').textContent = '无匹配题目';
    $('fqType').textContent = '—';
    $('fqIdx').textContent = '0 / 0';
    $('fqSourceTag').textContent = '—';
    $('fqText').textContent = '当前筛选条件下没有填空题，请调整章节或范围。';
    $('fqOptions').innerHTML = '';
    $('fqFeedback').classList.add('hidden');
    $('ffRange').textContent = '0 题';
    $('fjumpGrid').innerHTML = '';
    $('fqNext').textContent = '下一题 →';
    fRenderStats();
  }
  function fRenderQ() {
    var it = fpool[fq];
    var q = it.q;
    fanswered = false;
    var rec = STF.ans[it.gid];

    $('fqChapter').textContent = '第' + q.ch + '章';
    $('fqType').textContent = '填空题';
    $('fqIdx').textContent = (fq + 1) + ' / ' + fpool.length;
    $('fqSourceTag').textContent = '出处见解析';
    $('fqText').textContent = q.q;
    $('ffRange').textContent = '共 ' + fpool.length + ' 题';

    var wrap = $('fqOptions');
    wrap.innerHTML = '';
    wrap.className = 'options fill-opts';
    q.a.forEach(function (_, i) {
      var d = document.createElement('div');
      d.className = 'fill-row';
      d.innerHTML = '<span class="fill-no">第 ' + (i + 1) + ' 空</span>' +
        '<input class="fill-input" type="text" autocomplete="off" placeholder="在此输入答案">';
      wrap.appendChild(d);
    });

    $('fqFeedback').classList.add('hidden');
    $('fqMark').style.display = 'none';

    if (rec) {
      fanswered = true;
      fShowResult(rec.ok, rec.pick);
    } else {
      $('fqNext').textContent = '提交答案';
    }
    fRenderJump();
    fRenderStats();
  }
  function fSubmit() {
    var it = fpool[fq];
    var q = it.q;
    var inputs = document.querySelectorAll('#fqOptions .fill-input');
    var vals = [];
    for (var i = 0; i < inputs.length; i++) vals.push(inputs[i].value.trim());
    var empty = vals.filter(function (v) { return v === ''; }).length;
    if (empty) {
      alert('还有 ' + empty + ' 个空未填写，请填完再提交。');
      return;
    }
    var ok = q.a.length === vals.length && q.a.every(function (acc, i) { return fMatch(acc, vals[i]); });
    STF.ans[it.gid] = { ok: ok, pick: vals };
    fsave();
    fanswered = true;
    fShowResult(ok, vals);
    fRenderJump();
    fRenderStats();
  }
  function fShowResult(ok, pick) {
    var it = fpool[fq];
    var q = it.q;
    var fb = $('fqFeedback');
    fb.classList.remove('hidden');
    var head = $('ffbHead');
    head.className = 'fb-head ' + (ok ? 'ok' : 'bad');
    head.textContent = ok ? '✓ 回答正确' : '✗ 回答错误';
    $('ffbAnswer').textContent = q.a.map(function (acc, i) {
      return '第' + (i + 1) + '空：' + acc.join(' 或 ');
    }).join('　|　');
    $('ffbExplain').innerHTML = linkStandards(q.e);
    $('ffbSource').innerHTML = '<button type="button" class="src-link" data-src="' + escHtml(q.s) + '">出处：' + escHtml(q.s) + ' <span class="src-arrow">▸</span></button>';
    var inputs = document.querySelectorAll('#fqOptions .fill-input');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].disabled = true;
      var okk = fMatch(q.a[i], pick[i]);
      inputs[i].classList.add(okk ? 'right' : 'wrong');
      if (!okk) { inputs[i].value = q.a[i][0]; inputs[i].classList.add('show-ans'); }
    }
    $('fqMark').style.display = 'inline-block';
    $('fqMark').textContent = STF.mark[it.gid] ? '已标记 ★' : '标记错题';
    $('fqNext').textContent = '下一题 →';
  }
  function fRenderJump() {
    var g = $('fjumpGrid'); g.innerHTML = '';
    fpool.forEach(function (it, i) {
      var rec = STF.ans[it.gid];
      var b = document.createElement('button');
      b.className = 'jump-btn' + (i === fq ? ' cur' : '') + (rec ? (rec.ok ? ' right' : ' wrong') : '');
      b.textContent = i + 1;
      b.onclick = function () { fq = i; fRenderQ(); window.scrollTo(0, 0); };
      g.appendChild(b);
    });
  }
  $('fqPrev').onclick = function () { if (fq > 0) { fq--; fRenderQ(); window.scrollTo(0, 0); } };
  $('fqNext').onclick = function () {
    if (!fanswered) { fSubmit(); return; }
    if (fq < fpool.length - 1) { fq++; fRenderQ(); window.scrollTo(0, 0); }
  };
  $('fqMark').onclick = function () {
    var it = fpool[fq];
    if (STF.mark[it.gid]) delete STF.mark[it.gid]; else STF.mark[it.gid] = 1;
    fsave();
    $('fqMark').textContent = STF.mark[it.gid] ? '已标记 ★' : '标记错题';
  };
  $('ffChapter').onchange = fApplyFilter;
  $('ffScope').onchange = fApplyFilter;
  $('ffShuffle').onchange = fApplyFilter;

  /* ================= 门户（课程选择） ================= */
  function renderPortal() {
    $('portalUser').textContent = curNick() + '，你好';
    var grid = $('portalGrid');
    grid.innerHTML = '';
    var u = curUser();
    COURSES.forEach(function (c) {
      var meta = COURSE_META[c.id] || { quiz: '?', fill: '?' };
      var st = { ans: {} };
      try {
        var raw = localStorage.getItem('unified_v1_' + c.id + '_' + u + '_quiz');
        if (raw) st = JSON.parse(raw);
      } catch (e) {}
      var done = st.ans ? Object.keys(st.ans).length : 0;
      var card = document.createElement('div');
      card.className = 'portal-card';
      card.innerHTML =
        '<div class="pc-head">' +
        '  <div class="pc-logo">' + c.logo + '</div>' +
        '  <div class="pc-info">' +
        '    <div class="pc-code">' + c.code + '</div>' +
        '    <div class="pc-name">' + c.name + '</div>' +
        '  </div>' +
        '</div>' +
        '<div class="pc-meta">' + c.ch + ' 章 · 选择题 ' + meta.quiz + ' · 填空 ' + meta.fill + '</div>' +
        '<div class="pc-progress">' +
        '  <div class="pc-prog-bar"><i style="width:' + (meta.quiz ? Math.round(done / meta.quiz * 100) : 0) + '%"></i></div>' +
        '  <span>已答 ' + done + ' / ' + meta.quiz + '</span>' +
        '</div>' +
        '<button type="button" class="auth-btn pc-btn" data-cid="' + c.id + '">进入学习 →</button>';
      card.querySelector('.pc-btn').onclick = function () { enterCourse(c.id); };
      grid.appendChild(card);
    });
  }

  /* ================= 顶部操作 ================= */
  $('btnBackPortal').onclick = enterPortal;
  $('btnLogout').onclick = doLogout;
  $('btnLogout2').onclick = doLogout;
  function doLogout() {
    if (!confirm('确定退出登录吗？')) return;
    clearSession();
    clearCourseGlobals();
    showLogin();
    showAuthForm('login');
    $('liPass').value = '';
    $('liMsg').textContent = '';
  }

  /* ================= 键盘快捷键（仅在课程视图内生效） ================= */
  document.addEventListener('keydown', function (e) {
    if ($('view-course').classList.contains('hidden')) return;
    if (view === 'quiz') {
      if (e.key >= '1' && e.key <= '6') {
        var i = parseInt(e.key, 10) - 1;
        var nodes = $('qOptions').children;
        if (nodes[i] && !answered) nodes[i].click();
      }
      if (e.key === 'Enter') $('qNext').click();
    }
    if (view === 'fill' && e.key === 'Enter') $('fqNext').click();
  });

  /* ================= PWA ================= */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    deferredPrompt = ev;
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua);
    if (isIOS && !/Safari/.test(ua)) return;
    $('installGuide').textContent = isIOS
      ? 'Safari 底部「分享」→「添加到主屏幕」'
      : '添加后断网也能继续学习';
    $('installDo').textContent = isIOS ? '知道了' : '添加';
    if (sessionStorage.getItem('unified_install_no') !== '1') {
      $('installTip').classList.remove('hidden');
    }
  });
  $('installNo').onclick = function () {
    $('installTip').classList.add('hidden');
    try { sessionStorage.setItem('unified_install_no', '1'); } catch (e) {}
  };
  $('installDo').onclick = function () {
    $('installTip').classList.add('hidden');
    try { sessionStorage.setItem('unified_install_no', '1'); } catch (e) {}
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
    }
  };
  if ('serviceWorker' in navigator && navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  /* ================= 初始化 ================= */
  var bootUser = curUser();
  if (bootUser) {
    enterPortal();
  } else {
    showLogin();
    showAuthForm('login');
  }
})();
