/* ============================================================
 * 双女八字合盘 · 界面交互  app.js
 * 依赖：lib/lunar.js（window.Lunar）、js/bazi.js（window.BaziEngine）
 * ============================================================ */
(function () {
  'use strict';
  const B = window.BaziEngine;
  const $ = (id) => document.getElementById(id);

  // ===== HTML 转义：任何用户输入拼进 innerHTML 前必须先过这一层，防 XSS =====
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function safeName(el, fallback) {
    const v = el && el.value ? el.value.trim() : '';
    return escapeHtml(v || fallback || '');
  }

  // ===== 联系配置 =====
  const PAY = { wechat: 'aichishutiaodewo', price: '9.9', priceOriginal: '19.9' };

  // ===== 解锁码校验 =====
  // 只接受「配对暗号 + 当月/上月 + 盐」派生的 8 位专属码，
  // 生成器不放在本站，由站长在离线工具里运行。
  const CODE_SALT = 'yuan-bazi-2026-v1';

  // 月份键（UTC，避免时区导致跨月抖动）
  function monthKeyOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  // 由 配对签名 + 月份 + 盐 派生确定性 8 位解锁码（去掉易混字符 0/O/1/I/L）
  function makeCode(sig, monthKey) {
    const base = sig + '|' + monthKey + '|' + CODE_SALT;
    let h = hashStr(base);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) {
      s += alphabet[h % alphabet.length];
      h = (Math.floor(h / alphabet.length) ^ (h << 1)) >>> 0;
    }
    return s;
  }

  // 当前月 + 上月（宽限窗口），用于校验
  function monthWindows() {
    const now = new Date();
    const cur = monthKeyOf(now);
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prev = monthKeyOf(prevDate);
    return [cur, prev];
  }

  // —— 配对签名：由双方八字四柱生成，顺序无关 ——
  function pairSig(a, b) {
    const s = p => p.pillars.map(x => x.gan + x.zhi).join('');
    return [s(a), s(b)].sort().join('|');
  }
  // 短暗号（用户发给站长做指代用，不可逆）
  function shortToken(sig) {
    return hashStr(sig).toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
  }
  // —— 哈希（仅用于生成不可逆的「配对暗号」，不用于推导解锁码）——
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // —— 复制到剪贴板（兼容 file:// 本地打开，clipboard API 不可用时降级）——
  function copyText(text, okCb, failCb) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { if (okCb) okCb(); } else if (failCb) failCb();
      } catch (e) { if (failCb) failCb(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { if (okCb) okCb(); }).catch(fallback);
    } else fallback();
  }

  // —— 解锁状态：按「配对」记录，每对独立 ——
  const UNLOCK_KEY = 'bazi_unlocked_pairs';
  function getUnlocked() { try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]'); } catch (e) { return []; } }
  function isPairUnlocked(sig) { return sig ? getUnlocked().includes(sig) : false; }
  function unlockPair(sig) {
    if (!sig) return;
    const arr = getUnlocked();
    if (!arr.includes(sig)) { arr.push(sig); try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(arr)); } catch (e) {} }
  }

  let currentSig = null;   // 当前合盘配对的签名
  let lastCalc = null;     // 最近一次合盘结果（用于解锁后局部刷新）

  const els = {
    nameA: $('nameA'), dateA: $('dateA'), timeA: $('timeA'), relA: $('relA'),
    nameB: $('nameB'), dateB: $('dateB'), timeB: $('timeB'), relB: $('relB'),
    calcBtn: $('calcBtn'), demoBtn: $('demoBtn'),
    error: $('errorMsg'), result: $('result'),
    scoreNum: $('scoreNum'), scoreRing: document.querySelector('.score-ring'),
    ratingLevel: $('ratingLevel'), ratingStars: $('ratingStars'), summaryText: $('summaryText'),
    insightBox: $('insightBox'),
    pillarA: $('pillarA'), pillarB: $('pillarB'),
    dimensions: $('dimensions'), adviceList: $('adviceList'),
    shareBtn: $('shareBtn'), shareHint: $('shareHint'), resetBtn: $('resetBtn'),
    deepZone: $('deepZone'), verdictCard: $('verdictCard'), timeUnknownTip: $('timeUnknownTip'),
    soloName: $('soloName'), soloDate: $('soloDate'), soloTime: $('soloTime'),
    soloBtn: $('soloBtn'), soloResult: $('soloResult'),
    unlockModal: $('unlockModal'), modalClose: $('modalClose'),
    unlockCode: $('unlockCode'), unlockConfirm: $('unlockConfirm'), unlockMsg: $('unlockMsg'),
    payWechat: $('payWechat')
  };

  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
  }
  function clearError() { els.error.hidden = true; els.error.textContent = ''; }

  function parseInput(side) {
    const dateVal = side === 'A' ? els.dateA.value : els.dateB.value;
    if (!dateVal) throw new Error('请先填写命主 ' + side + ' 的出生日期');
    const [y, m, d] = dateVal.split('-').map(Number);
    if (!y || !m || !d) throw new Error('出生日期格式有误');
    let shichen = side === 'A' ? els.timeA.value : els.timeB.value;
    if (!shichen) shichen = '子'; // 未填时辰时按子时估算
    return { y, m, d, shichen };
  }

  function buildPillarCard(p, name, side) {
    const wxColor = B.WX_COLOR;
    const dot = (w) => `<span class="dotwx" style="background:${wxColor[w]}"></span>`;
    const cols = p.pillars.map(pl => `
      <div class="pcol">
        <div class="plabel">${pl.label}</div>
        <div class="pgan" style="color:${wxColor[pl.ganWX]}">${pl.gan}</div>
        <div class="pzhi" style="color:${wxColor[pl.zhiWX]}">${pl.zhi}</div>
        <div class="pnayin">${pl.naYin}</div>
      </div>`).join('');
    const title = name ? name : '命主';
    return `
      <h4>${title}</h4>
      <div class="pillar-sub">生肖 ${p.zodiac} · 日主 ${p.dayMaster}（${p.dayMasterWX}${p.dayMasterYinYang}）</div>
      <div class="pillar-grid">${cols}</div>
      <div class="persona">${p.personality}</div>
      <button type="button" class="solo-entry" data-side="${side}">看 ${title} 的完整命格 →</button>`;
  }

  function renderDimensions(dims) {
    els.dimensions.innerHTML = dims.map(d => {
      const pct = Math.round((d.score / d.max) * 100);
      return `
        <div class="dim-row">
          <div class="dim-top">
            <span class="dim-name"><span class="ic">${d.icon}</span>${d.name}</span>
            <span class="dim-tag">${d.label}</span>
          </div>
          <div class="dim-bar"><div class="dim-fill" style="width:0%" data-w="${pct}"></div></div>
          <div class="dim-top">
            <span class="dim-text">${d.text}</span>
            <span class="dim-score">${d.score}/${d.max}</span>
          </div>
        </div>`;
    }).join('');
    // 动画填充
    requestAnimationFrame(() => {
      document.querySelectorAll('.dim-fill').forEach(el => { el.style.width = el.dataset.w + '%'; });
    });
  }

  function buildAdvice(a, b, dims, total, relA) {
    const tips = [];
    const z = dims.zodiac.label, w = dims.wuxing.label, g = dims.gan.label, zh = dims.zhi.label, f = dims.fate.label;
    if (z.includes('六合') || z.includes('三合')) tips.push('你们生肖特别合，多一起参加热闹的聚会或旅行，气场会被带动得更旺。');
    if (z.includes('六冲')) tips.push('生肖相冲，重要决定尽量别卡在同一天拍板，给彼此留点缓冲空间。');
    if (z.includes('六害') || z.includes('刑')) tips.push('生肖略有牵绊，别因小事翻旧账，翻篇比讲赢更重要。');
    if (w.includes('相生')) tips.push('日主相生，你俩是互相充电的关系——累了就安安静静靠对方待一会儿。');
    if (w.includes('相克')) tips.push('日主相制，争执时先各退十分钟冷静，别硬碰硬，化火药为火花。');
    if (w.includes('比和')) tips.push('同气连枝，兴趣重叠多；但记得保留各自的小世界，关系更有呼吸感。');
    if (g.includes('五合')) tips.push('天干五合是很难得的羁绊，这种吸引请好好珍惜，别轻易放手。');
    if (zh.includes('多冲')) tips.push('地支冲多、生活变动大，固定一个"只属于你们俩"的小仪式，会让关系很稳。');
    if (zh.includes('多合')) tips.push('地支多合、相处顺滑，很适合一起培养一个共同爱好。');
    if (f.includes('相生')) tips.push('年柱纳音相生，家庭与过往背景容易互相接纳，见家长阻力较小。');
    if (f.includes('相成')) tips.push('年柱纳音相制，谈长远或见家长前多做铺垫，节奏放慢更稳。');
    if (dims.yongshen.label.includes('相济')) tips.push('你们喜用神互补得恰到好处，多给彼此空间发挥长处，关系会越养越厚。');
    if (dims.yongshen.label.includes('相背')) tips.push('用神互补偏弱，少些“为你好”的改造，多些“我懂你”的接纳，差异反成滋养。');

    // 五行偏缺调和
    const union = new Set([...a.distinctElements, ...b.distinctElements]);
    const missing = ['木', '火', '土', '金', '水'].filter(x => !union.has(x));
    if (missing.length) {
      const map = { 木: '绿植与自然', 火: '阳光与热闹', 土: '安稳的居家', 金: '利落的规划', 水: '流动与旅行' };
      tips.push(`两人命盘偏缺${missing.join('、')}行，多接触${missing.map(m => map[m]).join('、')}，能悄悄调和彼此气场。`);
    }

    // 关系向解读
    if (relA === '恋人') {
      tips.push('作为恋人，甜的时候很甜——把"合"的部分放大，把小事翻篇，感情会越养越厚。');
      if (total >= 70) tips.push('你们的组合很适合一起规划未来，别怕谈"长久"这件事。');
    } else if (relA === '闺蜜') {
      tips.push('作为闺蜜，这份缘适合长长久久，吵架也尽量别过夜，一个表情包就能和好。');
      if (total >= 70) tips.push('你俩是能互相托底那种友谊，关键时刻她一定在。');
    } else if (relA === '搭档') {
      tips.push('作为事业搭档，互补处正好分工，别抢同一件事做，反而事半功倍。');
      if (zh.includes('多合') || zh.includes('多冲')) tips.push('地支互动强，协作效率高但也易有分歧，定好规则再开工。');
    } else {
      tips.push('无论什么关系，合盘只是参考，舒服的相处才是硬道理。');
    }

    // 总评
    if (total >= 85) tips.push('妥妥的天作之合，眼前人值得狠狠珍惜。');
    else if (total >= 70) tips.push('整体缘分很旺，越处越甜。');
    else if (total < 40) tips.push('缘分偏淡，不强求、不内耗，顺其自然最轻松。');

    // —— 免费加厚：更多可落地的相处提示 ——
    const wxTrait = {
      木: '适合一起养植物、逛公园、做需要耐心慢慢长的事',
      火: '适合一起热闹、看展、晒太阳，情绪记得互相回应',
      土: '适合一起做饭、布置小家，把约定落到具体日程',
      金: '适合一起订计划、整理空间，把话说清楚最舒服',
      水: '适合一起旅行、临水散步，留点弹性别排太满'
    };
    const wxs = ['木', '火', '土', '金', '水'];
    const dominantWX = wxs.reduce((best, w) =>
      (a.elementCounts[w] + b.elementCounts[w]) > (a.elementCounts[best] + b.elementCounts[best]) ? w : best, '木');
    tips.push(`两人合盘里「${dominantWX}」气最足：${wxTrait[dominantWX]}，顺着这个长处安排共同活动最省力。`);
    if (a.zodiac === b.zodiac) tips.push('同年同生肖，默契里也带着相似的执拗，遇到分歧时别一起钻牛角尖。');
    if (a.dayMasterYinYang !== b.dayMasterYinYang) {
      tips.push('一阴一阳、节奏天然错开，慢的那位需要半拍缓冲，别把「没马上回应」读成不在意。');
    } else {
      tips.push('两人阴阳同调，情绪容易一起起落；约好一句「今天有点累」当低电量信号，比硬撑着体贴有用。');
    }
    if (dims.fate.score >= 9) tips.push('年柱根基相生，见家人、谈长远这类事阻力较小，可以慢慢推进不必急。');
    if (total >= 55 && total < 70) tips.push('分数中等偏上，属于「越处越有」的类型，别急着下结论，多给几次相处的机会。');
    if (dims.zhi.score >= 16) tips.push('地支互动顺，适合定一个长期共同习惯（每周一顿饭、每晚一段话），把顺滑变成稳定。');
    tips.push('合盘只是参考：把今天看到的一两条拿去用，比记住那个分数更有意义。🌷');

    // 去重 + 取前 8 条（全部免费）
    const uniq = [...new Set(tips)].slice(0, 8);
    els.adviceList.innerHTML = uniq.map(t => `<li>${t}</li>`).join('');
  }

  // ===== P1-2 结论先行卡：30 秒拿到「所以到底怎么样」=====
  function renderVerdict(res) {
    const box = els.verdictCard;
    if (!box) return;
    const total = res.total;
    const dims = res.details.map((d, i) => ({ ...d, key: i }))
      .sort((x, y) => (y.score / y.max) - (x.score / x.max));
    const best = dims[0], worst = dims[dims.length - 1];
    const tone = total >= 70 ? '旺' : total >= 55 ? '稳' : total >= 40 ? '有火花' : '偏淡';
    const kws = (res.keywords && res.keywords.length ? res.keywords : [best.label, worst.label]).slice(0, 3);
    box.innerHTML = `
      <div class="verdict-head"><span class="verdict-seal">缘</span><span>一分钟速读 · 你们的故事</span></div>
      <p class="verdict-main">这是一段 <b>${tone}</b> 的缘分：最亮的地方是 <b>${best.name}（${best.label}）</b>，最需要一起学着照顾的是 <b>${worst.name}</b>。</p>
      <div class="verdict-kws">${kws.map(k => `<span>${escapeHtml(k)}</span>`).join('')}</div>
      <p class="verdict-tip">💡 今天就能做的一件事：${escapeHtml(best.text.slice(0, 42))}${best.text.length > 42 ? '…' : ''}</p>`;
    box.hidden = false;
  }

  // ===== P0-4 时辰不详后果提示（如实告知，防「算不准」退款）=====
  function renderTimeUnknownTip(ia, ib) {
    const tip = els.timeUnknownTip;
    if (!tip) return;
    const aU = !ia.shichen || ia.shichen === '子' && !els.timeA.value;
    const bU = !ib.shichen || ib.shichen === '子' && !els.timeB.value;
    const who = [aU ? safeName(els.nameA, '命主 A') : '', bU ? safeName(els.nameB, '命主 B') : ''].filter(Boolean);
    if (who.length) {
      tip.innerHTML = `※ ${who.join('、')}的出生时辰未填，时柱相关解读按子时估算，这部分仅供参考；知道大致时段可在上方重选时辰后再合一次。`;
      tip.hidden = false;
    } else {
      tip.hidden = true;
    }
  }

  // ===== P1-1 关键术语解释：给结果区里的术语加悬浮白话解释 =====
  const TERM_DICT = {
    '日主': '出生那天的天干，代表「你自己」',
    '喜用神': '能让命局更舒服的那味五行',
    '用神': '能让命局更舒服的那味五行',
    '纳音': '六十甲子配的五行称号，如「海中金」',
    '比和': '两人五行相同，气场相近',
    '相生': '一方滋养另一方，付出容易被接住',
    '相克': '彼此有张力，需要磨合，不等于不好',
    '六合': '地支间的一种吸引、默契组合',
    '三合': '地支间的合力组合，相处顺',
    '六冲': '地支间的碰撞组合，易有变动',
    '偏旺': '某类五行偏多，性格上更有主见',
    '偏弱': '某类五行偏少，更容易被环境带动',
    '配偶宫': '日支，传统上用来看亲密关系',
    '印': '生我者的五行，代表被滋养、被支持'
  };
  function decorateTerms(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.nodeValue || node.parentElement && node.parentElement.closest('abbr.term')) return;
      const keys = Object.keys(TERM_DICT).sort((a, b) => b.length - a.length);
      const re = new RegExp('(' + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
      if (!re.test(node.nodeValue)) return;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(node.nodeValue)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(node.nodeValue.slice(last, m.index)));
        const ab = document.createElement('abbr');
        ab.className = 'term'; ab.textContent = m[0]; ab.title = TERM_DICT[m[0]];
        frag.appendChild(ab);
        last = m.index + m[0].length;
      }
      if (last < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // ===== P1-3 单人命格浅卡：复用 personDeep，免费，一屏内读完 =====
  function soloCardHTML(p, label) {
    const pd = B.personDeep(p);
    const wxColor = B.WX_COLOR;
    const wxBar = ['木', '火', '土', '金', '水'].map(w => {
      const n = p.elementCounts[w] || 0;
      return `<span class="solo-wx ${wxColor[w] ? '' : ''}" style="color:${wxColor[w]}">${w}${n}</span>`;
    }).join('');
    return `
      <div class="solo-card-head"><span class="solo-name">${escapeHtml(label)}</span><span class="solo-dm">日主 ${p.dayMaster} · ${pd.wx}${p.dayMasterYinYang}</span></div>
      <div class="solo-grid">
        <div><b>强弱</b><span>${pd.strength}</span></div>
        <div><b>喜用</b><span>${pd.xiDesc}</span></div>
        <div><b>性格底色</b><span>${pd.tone}</span></div>
        <div><b>最需要</b><span>${pd.need}</span></div>
        <div><b>相处节奏</b><span>${pd.pace}</span></div>
        <div><b>五行分布</b><span class="solo-wxs">${wxBar}</span></div>
      </div>
      <p class="solo-disclaimer">※ 浅析仅供娱乐参考，不含流年运势与具体事件预测。想看两人的缘分，请用上方的双人合盘 🌷</p>`;
  }
  function bindSoloEntries(pa, pb) {
    document.querySelectorAll('.solo-entry').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const p = btn.dataset.side === 'A' ? pa : pb;
        const label = btn.dataset.side === 'A' ? safeName(els.nameA, '命主 A') : safeName(els.nameB, '命主 B');
        let card = btn.parentNode.querySelector('.solo-inline');
        if (card) { card.remove(); return; }
        card = document.createElement('div');
        card.className = 'solo-inline';
        card.innerHTML = soloCardHTML(p, label);
        btn.parentNode.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  // ===== 五行能量分布（免费加厚：把四柱里的五行摊开给你看）=====
  function renderWxChart(a, b) {
    const box = $('wxChart');
    if (!box) return;
    const nameA = safeName(els.nameA, '命主 A');
    const nameB = safeName(els.nameB, '命主 B');
    const wxs = ['木', '火', '土', '金', '水'];
    const rows = wxs.map(w => {
      const ca = a.elementCounts[w] || 0, cb = b.elementCounts[w] || 0;
      const max = Math.max(4, ca, cb);
      return `
        <div class="wx-row">
          <span class="wx-name wx-${w}">${w}</span>
          <div class="wx-bars">
            <div class="wx-bar"><i class="wx-a" style="width:${ca / max * 100}%"></i><span>${ca}</span></div>
            <div class="wx-bar"><i class="wx-b" style="width:${cb / max * 100}%"></i><span>${cb}</span></div>
          </div>
        </div>`;
    }).join('');
    const missing = wxs.filter(w => !(a.elementCounts[w] || 0) && !(b.elementCounts[w] || 0));
    box.innerHTML = `
      <h3 class="section-title">🌈 五行能量分布</h3>
      <div class="wx-card">
        <div class="wx-legend">
          <span><i class="lg-a"></i>${nameA}</span>
          <span><i class="lg-b"></i>${nameB}</span>
          <em>四柱共 8 个字，每字归一行</em>
        </div>
        ${rows}
        <p class="wx-note">${missing.length
          ? `两人合起来偏缺「${missing.join('、')}」，可在生活里用颜色、场景与习惯轻轻补上（下方「八字小知识」有对照表）。`
          : '两人五行俱全，气场相对均衡，几乎不挑相处场景。'} 这一栏完全免费，慢慢看 🌿</p>
      </div>`;
  }

  // ===== 个性化解读区（结果卡内） =====
  function buildPersonalInsight(a, b, res) {
    if (!els.insightBox) return; // 容错：元素不存在时跳过
    const nameA = safeName(els.nameA, 'Ta');
    const nameB = safeName(els.nameB, 'Ta');
    const d = res.details;
    const dims = [
      { key: 'zodiac',  ...d[0] },
      { key: 'wuxing',  ...d[1] },
      { key: 'gan',     ...d[2] },
      { key: 'zhi',     ...d[3] },
      { key: 'fate',    ...d[4] },
      { key: 'yongshen',...d[5] }
    ];
    // 按得分率排序
    dims.sort((x, y) => (y.score / y.max) - (x.score / x.max));
    const top = dims.slice(0, 2);     // 最强两项
    const bot = dims.slice(-2).reverse(); // 最弱两项

    // 日主性格画像
    const dmA = a.dayMaster, dmB = b.dayMaster;
    const dmMap = {
      '甲': { trait: '如大树般稳重的存在，有担当、能扛事', role: '守护者' },
      '乙': { trait: '柔韧如藤蔓，细腻敏感、善于感知情绪', role: '感知者' },
      '丙': { trait: '像太阳一样热情直爽，照亮身边的人', role: '发光体' },
      '丁': { trait: '烛光般的温柔，细腻贴心、默默付出', role: '温暖者' },
      '戊': { trait: '像大地般厚实可靠，给人安全感', role: '定海针' },
      '己': { trait: '如田园泥土般包容滋养，善解人意', role: '滋养者' },
      '庚': { trait: '刚毅果决、讲原则，行动力强', role: '行动派' },
      '辛': { trait: '精致讲究、审美在线，追求品质', role: '鉴赏家' },
      '壬': { trait: '如江河般灵动聪慧、适应力极强', role: '智者' },
      '癸': { trait: '如雨露般润物无声、内心丰富深邃', role: '治愈者' }
    };
    const pA = dmMap[dmA] || { trait: '个性独特', role: '神秘人' };
    const pB = dmMap[dmB] || { trait: '个性独特', role: '神秘人' };

    // 生肖互动小注
    const zodiacNote = (() => {
      const za = a.pillars[0].zhi, zb = b.pillars[0].zhi;
      const liuhe = { '子丑':'鼠牛共耕','寅亥':'虎猪相抱','卯戌':'兔狗同巢','辰酉':'龙鸡共舞','巳申':'蛇猴连理','未羊':'马羊同行' };
      const liuchong = { '子午':'水火不容','丑未':'土气相争','寅申':'金木相战','卯酉':'东西对冲','辰戌':'水库互冲','巳亥':'南北相冲' };
      if (liuhe[za+zb]) return liuhe[za+zb];
      if (liuhe[zb+za]) return liuhe[zb+za];
      if (liuchong[za+zb]) return liuchong[za+zb];
      if (liuchong[zb+za]) return liuchong[zb+za];
      return null;
    })();

    // 相处模式
    const modeText = (() => {
      const ganLabel = dims.find(x => x.key === 'gan').label;
      const zhiLabel = dims.find(x => x.key === 'zhi').label;
      const ysLabel = dims.find(x => x.key === 'yongshen').label;
      if (res.total >= 80) return `${nameA}和${nameB}在一起时，整个气场都会变亮——你们是那种"旁人看了都觉得配"的组合。`;
      if (res.total >= 60) {
        if (ganLabel.includes('五合') || ganLabel.includes('相生')) return `你们天然有一种默契的吸引，${nameA}说的话${nameB}常常秒懂。`;
        if (zhiLabel.includes('多合')) return `相处起来意外地顺滑，很多事不用多说就能同频。`;
        if (ysLabel.includes('相济')) return `从命理上看，你俩刚好能补上彼此最缺的那一块——这种互补很养关系。`;
        return `整体来说是一段舒服的关系，有亮点也有需要磨合的地方，正常且真实。`;
      }
      if (ganLabel.includes('相制')) return `你们之间的张力其实是一种特别的化学反应——吵完反而更懂对方。`;
      if (zhiLabel.includes('多冲') || zhiLabel.includes('刑')) return `你们像两块棱角分明的石头，磨着磨着反而更契合——关键是别放弃沟通。`;
      return `缘分这事儿不只看分数。有时候恰恰是那些"不那么合"的地方，让彼此学会了成长。`;
    })();

    // 亮点标签
    const highlightTags = [];
    top.forEach(t => {
      if (t.score / t.max >= 0.75) highlightTags.push(t.label);
    });
    if (dims.find(x => x.key === 'gan').label === '天干五合') highlightTags.push('天作羁绊');
    if (zodiacNote && !zodiacNote.includes('冲')) highlightTags.push(zodiacNote);

    // 注意标签
    const cautionTags = [];
    bot.forEach(t => {
      if (t.score / t.max < 0.4) cautionTags.push(t.label);
    });

    els.insightBox.innerHTML = `
      <div class="insight-personas">
        <div class="insight-persona">
          <span class="ip-name">${nameA}</span>
          <span class="ip-role">${pA.role}</span>
          <p class="ip-trait">${pA.trait}</p>
        </div>
        <div class="insight-arrow">💫</div>
        <div class="insight-persona">
          <span class="ip-name">${nameB}</span>
          <span class="ip-role">${pB.role}</span>
          <p class="ip-trait">${pB.trait}</p>
        </div>
      </div>
      <p class="insight-mode">${modeText}</p>
      ${highlightTags.length ? `<div class="insight-tags insight-highlights"><span class="it-label">✨ 亮点</span>${highlightTags.map(t => `<span class="it-tag it-good">${t}</span>`).join('')}</div>` : ''}
      ${cautionTags.length ? `<div class="insight-tags insight-cautions"><span class="it-label">🌱 注意</span>${cautionTags.map(t => `<span class="it-tag it-warn">${t}</span>`).join('')}</div>` : ''}
    `;
  }

  // ===== 深度缘分解锁区 =====
  // 深度报告阅读交互：折叠章节 / 目录跳转 / 进度条 / 返回顶部
  function initDeepInteractions() {
    const zone = $('duSections');
    if (!zone) return;
    const toc = $('duToc');
    const secs = Array.prototype.slice.call(zone.querySelectorAll('.du-sec'));
    const tocItems = toc ? Array.prototype.slice.call(toc.querySelectorAll('.du-toc-item')) : [];

    function setOpen(sec, open) {
      sec.classList.toggle('open', open);
      const head = sec.querySelector('.du-sec-head');
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
      const idx = sec.getAttribute('data-sec');
      tocItems.forEach(t => { if (t.getAttribute('data-sec') === idx) t.classList.toggle('active', open); });
    }

    // 点击章节标题切换展开
    zone.addEventListener('click', (e) => {
      const head = e.target.closest('.du-sec-head');
      if (head) {
        const sec = head.closest('.du-sec');
        setOpen(sec, !sec.classList.contains('open'));
      }
    });

    // 目录跳转：展开目标并滚动定位
    if (toc) toc.addEventListener('click', (e) => {
      const item = e.target.closest('.du-toc-item');
      if (!item) return;
      const idx = item.getAttribute('data-sec');
      const target = zone.querySelector('.du-sec[data-sec="' + idx + '"]');
      if (!target) return;
      setOpen(target, true);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 1200);
      if (window.innerWidth <= 640) $('duToc') && $('duToc').classList.remove('show');
    });

    const expandAll = $('duExpandAll');
    if (expandAll) expandAll.addEventListener('click', () => secs.forEach(s => setOpen(s, true)));
    const collapseAll = $('duCollapseAll');
    if (collapseAll) collapseAll.addEventListener('click', () => secs.forEach(s => setOpen(s, false)));

    const tocToggle = $('duTocToggle');
    if (tocToggle) tocToggle.addEventListener('click', () => {
      if (toc) toc.classList.toggle('show');
      tocToggle.classList.toggle('active');
    });

    const backTop = $('duBackTop');
    if (backTop) backTop.addEventListener('click', () => {
      const anchor = zone.closest('.deep-unlocked') || zone;
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 阅读进度与返回顶部显隐已迁移到 mountReadingBar（顶部固定阅读条）

    // 初始化目录高亮：默认展开的章节
    secs.forEach(s => { if (s.classList.contains('open')) setOpen(s, true); });
  }

  // ===== 深度报告 · 古风图解（内联 SVG，零外部请求）=====
  // 每张图为「矢量插画 + 古风图注」，按章节植入，让付费报告图文并茂。
  const DEEP_ILLUS = {
    // 同心缘起：两环相扣，中心莲花
    origin: `<svg viewBox="0 0 340 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="两枚同心圆环交叠，中心开出一朵莲花">
      <defs><linearGradient id="dioA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a8c4"/><stop offset="1" stop-color="#b08bd6"/></linearGradient></defs>
      <g fill="none"><circle cx="146" cy="62" r="38" stroke="url(#dioA)" stroke-width="2.2" opacity=".9"/><circle cx="194" cy="62" r="38" stroke="#d9b25a" stroke-width="2.2" opacity=".9"/></g>
      <g transform="translate(170,62)">
        <g fill="#f7a8c4" opacity=".82"><ellipse cy="-15" rx="6.5" ry="14"/><ellipse cy="-15" rx="6.5" ry="14" transform="rotate(60)"/><ellipse cy="-15" rx="6.5" ry="14" transform="rotate(120)"/><ellipse cy="-15" rx="6.5" ry="14" transform="rotate(180)"/><ellipse cy="-15" rx="6.5" ry="14" transform="rotate(240)"/><ellipse cy="-15" rx="6.5" ry="14" transform="rotate(300)"/></g>
        <circle r="6.5" fill="#d9b25a"/><circle r="2.6" fill="#fff8e6"/>
      </g>
      <g fill="#d9b25a" opacity=".7"><circle cx="96" cy="40" r="2"/><circle cx="244" cy="86" r="2.4"/><circle cx="262" cy="38" r="1.6"/></g>
    </svg><figcaption>两环相扣，是命里写好的相逢 · 莲花为证</figcaption>`,
    // 角色分工：一给一接，双人循环
    roles: `<svg viewBox="0 0 340 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="两个人形以循环箭头彼此呼应，象征一给一接">
      <defs><marker id="dioArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#b08bd6"/></marker></defs>
      <g fill="none" stroke="#b08bd6" stroke-width="2"><path d="M132 40 Q170 16 208 40" marker-end="url(#dioArrow)"/><path d="M208 92 Q170 116 132 92" marker-end="url(#dioArrow)"/></g>
      <circle cx="106" cy="66" r="24" fill="rgba(247,168,196,.35)" stroke="#e2558f" stroke-width="2"/><circle cx="234" cy="66" r="24" fill="rgba(217,178,90,.3)" stroke="#d9b25a" stroke-width="2"/>
      <text x="106" y="72" text-anchor="middle" font-size="20" fill="#e2558f" font-family="serif">给</text>
      <text x="234" y="72" text-anchor="middle" font-size="20" fill="#b8862f" font-family="serif">接</text>
      <text x="170" y="70" text-anchor="middle" font-size="14" fill="#7c5bbf" font-family="serif">相济</text>
    </svg><figcaption>一给一接，如日月相济 · 能量在彼此间流动</figcaption>`,
    // 情绪节奏：两条交织波形，一阴一阳
    rhythm: `<svg viewBox="0 0 340 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="两条柔和波形彼此交织，象征一阴一阳的相处节奏">
      <path d="M20 66 Q60 26 100 66 T180 66 T260 66 T320 66" fill="none" stroke="#e2558f" stroke-width="2.4" opacity=".85"/>
      <path d="M20 66 Q60 106 100 66 T180 66 T260 66 T320 66" fill="none" stroke="#7c5bbf" stroke-width="2.4" opacity=".85"/>
      <g fill="#fff" stroke="#d9b25a" stroke-width="1.6"><circle cx="100" cy="66" r="4"/><circle cx="180" cy="66" r="4"/><circle cx="260" cy="66" r="4"/></g>
      <text x="170" y="26" text-anchor="middle" font-size="12" fill="#e2558f" font-family="serif">阳 · 先热</text>
      <text x="170" y="118" text-anchor="middle" font-size="12" fill="#7c5bbf" font-family="serif">阴 · 后暖</text>
    </svg><figcaption>一阴一阳，起伏相和 · 给慢的那一方留半拍</figcaption>`,
    // 五行相生：环形五点，相生有序
    wuxing: `<svg viewBox="0 0 340 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="木火土金水五个元素环形相生">
      <path d="M170 28 L214 60 L197 110 L143 110 L126 60 Z" fill="none" stroke="#d9b25a" stroke-width="1.6" opacity=".65" stroke-dasharray="5 4"/>
      <g font-family="serif" font-size="15" text-anchor="middle" fill="#fff">
        <circle cx="170" cy="28" r="15" fill="#3fa86a"/><text x="170" y="33">木</text>
        <circle cx="214" cy="60" r="15" fill="#e2554f"/><text x="214" y="65">火</text>
        <circle cx="197" cy="110" r="15" fill="#c8923a"/><text x="197" y="115">土</text>
        <circle cx="143" cy="110" r="15" fill="#a9a9b8"/><text x="143" y="115">金</text>
        <circle cx="126" cy="60" r="15" fill="#3a7bd5"/><text x="126" y="65">水</text>
      </g>
      <text x="292" y="70" text-anchor="middle" font-size="12" fill="#7c5bbf" font-family="serif">相生</text>
      <text x="292" y="88" text-anchor="middle" font-size="12" fill="#7c5bbf" font-family="serif">相依</text>
    </svg><figcaption>木火土金水，相生相依 · 缺则可补，贵在流动</figcaption>`,
    // 流年卷轴：三载光阴
    fortune: `<svg viewBox="0 0 340 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三卷展开的年轴，象征未来三年">
      <g>
        <rect x="34" y="44" width="80" height="46" rx="8" fill="rgba(247,168,196,.28)" stroke="#e2558f" stroke-width="1.6"/>
        <rect x="130" y="38" width="80" height="52" rx="8" fill="rgba(217,178,90,.26)" stroke="#d9b25a" stroke-width="1.8"/>
        <rect x="226" y="44" width="80" height="46" rx="8" fill="rgba(176,139,214,.28)" stroke="#7c5bbf" stroke-width="1.6"/>
      </g>
      <path d="M114 67 H130 M210 67 H226" stroke="#b08bd6" stroke-width="1.6" stroke-dasharray="4 4"/>
      <g font-family="serif" font-size="15" fill="#7c5bbf" text-anchor="middle"><text x="74" y="73">壹</text><text x="170" y="70">贰</text><text x="266" y="73">叁</text></g>
      <g fill="#d9b25a"><circle cx="74" cy="36" r="3"/><circle cx="170" cy="30" r="3.6"/><circle cx="266" cy="36" r="3"/></g>
    </svg><figcaption>三载光阴，各有其时 · 顺势而为，逐年向好</figcaption>`,
    // 开运守护：幸运色环 + 守护星
    lucky: `<svg viewBox="0 0 340 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="四色幸运光环环绕一颗守护星">
      <g fill="none" stroke-width="3" opacity=".85"><circle cx="170" cy="66" r="42" stroke="#3fa86a" stroke-dasharray="66 200" transform="rotate(-90 170 66)"/><circle cx="170" cy="66" r="42" stroke="#e2554f" stroke-dasharray="66 200" transform="rotate(0 170 66)"/><circle cx="170" cy="66" r="42" stroke="#c8923a" stroke-dasharray="66 200" transform="rotate(90 170 66)"/><circle cx="170" cy="66" r="42" stroke="#3a7bd5" stroke-dasharray="66 200" transform="rotate(180 170 66)"/></g>
      <path d="M170 44 l5.6 15.4 L192 65 l-16.4 5.6 L170 86 l-5.6-15.4 L148 65 l16.4-5.6 Z" fill="#d9b25a" opacity=".92"/>
      <circle cx="170" cy="65" r="4.5" fill="#fff8e6"/>
    </svg><figcaption>幸色成环，吉物护佑 · 把喜欢的气息带在身边</figcaption>`
  };
  // 未解锁引导区：同心锁 + 微光
  const TEASER_ILLUS = `<svg viewBox="0 0 340 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一枚古风同心锁，周围有微光">
    <g fill="none" stroke="#d9b25a" stroke-width="2" opacity=".75"><path d="M126 62 a44 44 0 0 1 88 0"/><rect x="140" y="62" width="60" height="48" rx="10" fill="rgba(217,178,90,.16)" stroke="#d9b25a"/></g>
    <circle cx="170" cy="86" r="7" fill="none" stroke="#e2558f" stroke-width="2"/><circle cx="170" cy="86" r="2.4" fill="#e2558f"/>
    <g fill="#f7a8c4" opacity=".8"><circle cx="106" cy="44" r="2.2"/><circle cx="234" cy="50" r="2.6"/><circle cx="98" cy="96" r="1.8"/><circle cx="244" cy="104" r="2"/></g>
    <text x="170" y="28" text-anchor="middle" font-size="13" fill="#7c5bbf" font-family="serif">解锁之后 · 尽是为你而写的字</text>
  </svg>`;

  // 顶部固定阅读条：进入深度报告区滑出，全程可见；显示进度百分比与当前章节
  function mountReadingBar() {
    const zone = $('duSections');
    const container = zone && (zone.closest('.deep-unlocked') || zone);
    if (!container) return;
    const secs = Array.prototype.slice.call(zone.querySelectorAll('.du-sec'));
    if (!secs.length) return;
    const bar = document.createElement('div');
    bar.className = 'du-readingbar';
    bar.id = 'duTopBar';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `
      <div class="du-rb-inner">
        <span class="du-rb-mark">🌸</span>
        <div class="du-rb-meta">
          <span class="du-rb-chapter" id="duRbChapter">深度缘分报告</span>
          <span class="du-rb-sub" id="duRbSub">正在阅读 · 共 ${secs.length} 章</span>
        </div>
        <span class="du-rb-pct" id="duRbPct">0%</span>
      </div>
      <div class="du-rb-track"><div class="du-rb-fill" id="duRbFill"></div></div>`;
    document.body.appendChild(bar);

    const fill = $('duRbFill');
    const pctEl = $('duRbPct');
    const chapterEl = $('duRbChapter');
    const subEl = $('duRbSub');
    let active = false, ticking = false;

    function updateProgress() {
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight;
      // 进度：从容器顶部到达视口顶部算 0%，到容器底部到达视口底部算 100%
      const total = rect.height - vh;
      const scrolled = -rect.top;
      const pct = total > 0 ? Math.max(0, Math.min(1, scrolled / total)) : (rect.top < 0 ? 1 : 0);
      if (fill) fill.style.width = (pct * 100).toFixed(1) + '%';
      if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';

      // 返回顶部按钮显隐
      const backTop = $('duBackTop');
      if (backTop) backTop.classList.toggle('visible', scrolled > 300);

      // 当前章节：取判定线之上最后一个章节
      let cur = null;
      const line = Math.min(150, vh * 0.3);
      for (let i = 0; i < secs.length; i++) {
        if (secs[i].getBoundingClientRect().top <= line) cur = secs[i]; else break;
      }
      if (cur) {
        const no = cur.getAttribute('data-sec');
        const title = cur.querySelector('.du-sec-title');
        if (chapterEl) chapterEl.textContent = title ? title.textContent : '深度缘分报告';
        if (subEl) subEl.textContent = '第 ' + (Number(no) + 1) + ' / ' + secs.length + ' 章 · 正在阅读';
      } else {
        if (chapterEl) chapterEl.textContent = '深度缘分报告';
        if (subEl) subEl.textContent = '正在阅读 · 共 ' + secs.length + ' 章';
      }
      ticking = false;
    }
    function onScroll() {
      if (!active || ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // 仅在报告区进入视口时显示，离开后收起
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        const e = entries[0];
        active = e.isIntersecting;
        bar.classList.toggle('show', active);
        bar.setAttribute('aria-hidden', active ? 'false' : 'true');
        if (active) updateProgress();
      }, { rootMargin: '-72px 0px -40% 0px', threshold: 0 });
      io.observe(container);
    } else {
      active = true;
      bar.classList.add('show');
      updateProgress();
    }
  }

  function renderDeepZone(a, b, res) {
    // 每次重渲染先清掉旧的固定阅读条，避免重复
    const oldBar = $('duTopBar');
    if (oldBar) oldBar.remove();
    if (isPairUnlocked(currentSig)) {
      const d = B.deepReport(a, b, res);
      const r = d.rich;
      const nameA = safeName(els.nameA, '命主 A');
      const nameB = safeName(els.nameB, '命主 B');
      // 章节清单：编号 / 图标 / 标题 / 正文 HTML。前 two 章默认展开，其余折叠。
      const sections = [
        { icon: '📜', title: '缘分深度长文', body: r.deepParas.map(p => `<p class="du-para">${p}</p>`).join('') },
        { icon: '🧭', title: '关系里的角色分工', body: `<p class="du-para">${r.roles.a}</p><p class="du-para">${r.roles.b}</p><p class="du-para du-em">${r.roles.together}</p>` },
        { icon: '🌤️', title: '情绪与相处节奏', body: `<p class="du-para">${r.rhythm.a}</p><p class="du-para">${r.rhythm.b}</p><p class="du-para du-em">${r.rhythm.together}</p>` },
        { icon: '🌿', title: '五行调和指南', body: `<p class="du-para">${r.tuneRich}</p>` },
        { icon: '💞', title: '桃花缘', body: `<p class="du-para">${r.taohuaRich}</p>` },
        { icon: '💰', title: '财运合盘', body: `<p class="du-para">${r.wealthRich}</p>` },
        { icon: '🚀', title: '事业协作', body: `<p class="du-para">${r.careerRich}</p>` },
        { icon: '⚠️', title: `相处提醒（${r.tabooRich.length} 条）`, body: `<ul class="du-taboo-list">${r.tabooRich.map(t => `<li>${t}</li>`).join('')}</ul>` },
        { icon: '🗓️', title: '关系发展时间线 · 四阶段', body: `<div class="du-timeline">${d.timeline.map(t => `<div class="du-tl-item"><div class="stage">${t.stage}</div><div class="tip">${t.tip}</div></div>`).join('')}</div>` },
        { icon: '✨', title: '未来三年相处趋势手记', body: `<p class="du-fortune-intro">按两人的喜用五行与年份干支，逐年给出一个相处主题与小建议——当作给日子添点仪式感的参考，而非对具体事件的预言。愿你们把每一年都过成想要的样子 🌷</p><div class="du-fortune-list">${r.fortune.map(y => `
                <div class="du-fortune-item lv-${y.level === '顺遂' ? 'good' : y.level === '需经营' ? 'care' : 'mid'}">
                  <div class="fy-head">
                    <span class="fy-year">${y.year}</span>
                    <span class="fy-gz">${y.ganzhi}年 · ${y.zodiac}</span>
                    <span class="fy-badge">${y.levelText}</span>
                  </div>
                  <div class="fy-theme">${y.theme}</div>
                  <p class="fy-line">${y.themeLine}</p>
                  <p class="fy-relation">${y.relation}</p>
                  ${y.notes.length ? `<div class="fy-notes">${y.notes.map(n => `<span>${n}</span>`).join('')}</div>` : ''}
                  <p class="fy-advice">💡 ${y.advice}</p>
                </div>`).join('')}</div><p class="du-fortune-disclaimer">※ 本手记取传统五行生克之意，用于增加相处时的心意与仪式感，仅供娱乐参考，并非对具体事件的预测或保证。日子怎么过，终究由你们自己决定。</p>` },
        { icon: '🪴', title: '未来三个月相处小计划', body: `<div class="du-plan">${r.plan.map(p => `<div class="du-plan-item"><div class="du-plan-t">${p.title}</div><div class="du-plan-d">${p.tip}</div></div>`).join('')}</div>` },
        { icon: '🏷️', title: '你们的缘分关键词', body: `<div class="du-keywords">${d.keywords.map(k => `<span class="du-kw">${k}</span>`).join('')}</div>` },
        { icon: '🔮', title: '专属开运小物参考', body: `<div class="du-lucky"><div class="du-lucky-item"><div class="du-lucky-k">幸运色</div><div class="du-lucky-v">${d.lucky.colors.join('、')}</div></div><div class="du-lucky-item"><div class="du-lucky-k">开运小物</div><div class="du-lucky-v">${d.lucky.items.join('、')}</div></div><div class="du-lucky-item du-lucky-wide"><div class="du-lucky-k">宜一起做</div><div class="du-lucky-v">${d.lucky.scenes}</div></div><div class="du-lucky-item du-lucky-wide"><div class="du-lucky-k">近期宜避</div><div class="du-lucky-v">${d.lucky.avoid}</div></div></div>` },
        { icon: '💬', title: '沟通风格 & 化解话术', body: `<p class="du-talk">${d.talk.a}</p><p class="du-talk">${d.talk.b}</p><p class="du-talk-tip">💡 ${d.talk.tip}</p><div class="du-scripts"><div class="du-scripts-t">可以直接照着说：</div>${r.scripts.map(s => `<p class="du-script">${s}</p>`).join('')}</div>` },
        { icon: '✍️', title: '专属缘分词', body: `<p class="du-sig-text">${d.signature}</p>` },
        { icon: '💌', title: '写给你们', body: `<p class="du-para">${r.closing}</p>` }
      ];

      const ILLUS_BY_SEC = { 0: 'origin', 1: 'roles', 2: 'rhythm', 3: 'wuxing', 9: 'fortune', 12: 'lucky' };
      const tocHtml = sections.map((s, i) => `<button type="button" class="du-toc-item" data-sec="${i}"><span class="du-toc-n">${String(i + 1).padStart(2, '0')}</span><span class="du-toc-ic">${s.icon}</span><span class="du-toc-t">${s.title}</span></button>`).join('');
      const secHtml = sections.map((s, i) => `
        <section class="du-sec${i < 2 ? ' open' : ''}" id="du-sec-${i}" data-sec="${i}">
          <button type="button" class="du-sec-head" aria-expanded="${i < 2}">
            <span class="du-sec-no">${String(i + 1).padStart(2, '0')}</span>
            <span class="du-sec-icon">${s.icon}</span>
            <span class="du-sec-title">${s.title}</span>
            <span class="du-sec-arrow">⌄</span>
          </button>
          <div class="du-sec-body"><div class="du-sec-inner">${ILLUS_BY_SEC[i] ? `<figure class="du-fig">${DEEP_ILLUS[ILLUS_BY_SEC[i]]}</figure>` : ''}${s.body}</div></div>
        </section>`).join('');

      els.deepZone.innerHTML = `
        <div class="deep-unlocked">
          <div class="du-head">🌟 深度缘分报告（已解锁）</div>
          <p class="du-intro">全部章节都按你们两人的四柱单独生成，换一对人就是另一份。为避免一次看不完，章节已折叠——点标题即可展开，或用上方目录直达 🌷</p>
          <div class="du-persona-grid">
            <div class="du-persona">
              <h4>${nameA}</h4>
              <div class="du-strength">日主 ${a.dayMaster}（${a.dayMasterWX}）· ${d.personA.strength}</div>
              <div class="du-tone">${d.personA.tone}。</div>
              <div class="du-xi">${d.personA.xiDesc} · ${d.personA.xiWhy}</div>
              <div class="du-need">${d.personA.need}；${d.personA.pace}。</div>
            </div>
            <div class="du-persona">
              <h4>${nameB}</h4>
              <div class="du-strength">日主 ${b.dayMaster}（${b.dayMasterWX}）· ${d.personB.strength}</div>
              <div class="du-tone">${d.personB.tone}。</div>
              <div class="du-xi">${d.personB.xiDesc} · ${d.personB.xiWhy}</div>
              <div class="du-need">${d.personB.need}；${d.personB.pace}。</div>
            </div>
          </div>

          <div class="du-reportbar">
            <button type="button" class="du-toc-toggle" id="duTocToggle">📑 章节目录 <span>共 ${sections.length} 章 ⌄</span></button>
            <div class="du-bar-actions">
              <button type="button" id="duExpandAll">全部展开</button>
              <button type="button" id="duCollapseAll">全部收起</button>
            </div>
          </div>
          <nav class="du-toc" id="duToc">${tocHtml}</nav>

          <div class="du-sections" id="duSections">${secHtml}</div>
          <button type="button" class="du-backtop" id="duBackTop">↑ 回到顶部</button>
        </div>`;
      initDeepInteractions();
      mountReadingBar();
    } else {
      const token = shortToken(currentSig);
      // 未解锁也先把报告算出来：让用户「看得见」自己将要拿到什么，而不是只看一串功能名
      const preview = B.deepReport(a, b, res);
      const r = preview.rich;
      const TOC = [
        '双人命格详批 · 日主强弱 / 喜用 / 性格底色',
        '缘分深度长文 · 四段逐层拆解',
        '关系里的角色分工 · 谁给、谁接',
        '情绪与相处节奏',
        '五行调和指南 · 可照着做',
        '桃花缘专项',
        '财运合盘专项',
        '事业协作专项',
        '相处提醒清单',
        '关系发展时间线 · 四阶段',
        '✨ 未来三年相处趋势手记 · 逐年参考',
        '未来三个月相处小计划',
        '缘分关键词 + 专属开运小物参考',
        '沟通风格与化解话术（含例句）',
        '专属缘分词 + 写给你们'
      ];
      const wordCount = (r.deepParas.join('') + r.roles.a + r.roles.b + r.roles.together
        + r.rhythm.a + r.rhythm.b + r.rhythm.together + r.tuneRich
        + r.taohuaRich + r.wealthRich + r.careerRich + r.tabooRich.join('')
        + r.fortune.map(y => y.themeLine + y.relation + y.notes.join('') + y.advice).join('')
        + r.plan.map(p => p.tip).join('') + r.scripts.join('') + r.closing).length;
      els.deepZone.innerHTML = `
        <div class="deep-locked">
          <span class="deep-badge">✨ 已为你们生成 ${TOC.length} 段内容 · 只差解锁</span>
          <h3>想知道你们更深的缘分吗？</h3>
          <p class="deep-anchor">🌸 上面这些——缘分分、四柱排盘、六维解读、五行分布、相处锦囊、诗词与小知识——<strong>已经全部免费给你了</strong>，不用花一分钱。</p>

          <div class="deep-toc">
            <div class="deep-toc-head">📖 深度报告目录 <span>已按你们的八字生成 ✓</span></div>
            <ul>${TOC.map((t, i) => `<li><span class="toc-n">${String(i + 1).padStart(2, '0')}</span><span class="toc-t">${t}</span><span class="toc-lock">🔒</span></li>`).join('')}</ul>
          </div>

          <figure class="du-fig du-fig-teaser">${TEASER_ILLUS}</figure>
          <div class="deep-preview">
            <div class="deep-preview-head">👀 先试读一段 · 缘分深度长文（节选）</div>
            <div class="deep-preview-body">${r.deepParas[0]} ${r.deepParas[1].slice(0, 52)}…</div>
            <div class="deep-preview-mask"><span>🔓 解锁后阅读完整报告</span></div>
          </div>

          <p class="deep-free-line">${res.summary} 完整报告约 ${wordCount} 字，按你们两人的四柱单独生成、每对不同；解锁后分享图还会去掉水印，可保存高清无遮挡版。</p>
          <div class="deep-pair-token">本配对暗号：<b id="pairToken">${token}</b>
            <button id="copyTokenBtn" class="token-copy-btn" type="button">📋 复制暗号</button>
            <span class="deep-pair-note">点「复制暗号」发给站长微信 <b>${PAY.wechat}</b>，付款后即可领取本配对专属解锁码（首单 ¥${PAY.price}，原价 ¥${PAY.priceOriginal}；填码时只填 8 位解锁码，不用填暗号）</span>
          </div>
          <button id="unlockBtn" class="unlock-btn" type="button">🔓 获取专属解锁码 · 解锁完整报告</button>
          <p class="deep-cta-note">免费部分随时可看 · 解锁只是想看得更细一点 🌷</p>
        </div>`;
      const ub = $('unlockBtn');
      if (ub) ub.addEventListener('click', openModal);
      const ct = $('copyTokenBtn');
      if (ct) ct.addEventListener('click', () => {
        copyText(token,
          () => {
            ct.textContent = '✅ 已复制，去微信发给站长';
            let tip = document.getElementById('copyNextTip');
            if (!tip) {
              tip = document.createElement('p');
              tip.id = 'copyNextTip'; tip.className = 'copy-next-tip';
              ct.parentNode.appendChild(tip);
            }
            tip.innerHTML = '下一步：打开微信 → 加站长 <b>' + PAY.wechat + '</b> → 粘贴暗号并付款，稍等就能收到 8 位解锁码 🌷';
            setTimeout(() => { ct.textContent = '📋 复制暗号'; }, 2600);
          },
          () => { ct.textContent = '请手动选中上面的暗号'; }
        );
      });
    }
  }

  function openModal() {
    els.payWechat.textContent = PAY.wechat;
    const priceEl = $('payPrice');
    if (priceEl) priceEl.textContent = PAY.price;
    els.unlockMsg.hidden = true;
    els.unlockCode.value = '';
    els.unlockModal.hidden = false;
  }
  function closeModal() { els.unlockModal.hidden = true; }
  function showUnlockMsg(msg, ok) {
    els.unlockMsg.hidden = false;
    els.unlockMsg.textContent = msg;
    els.unlockMsg.className = 'unlock-msg ' + (ok ? 'ok' : 'err');
  }
  function confirmUnlock() {
    const code = (els.unlockCode.value || '').trim().toUpperCase();
    if (!code) { showUnlockMsg('请输入解锁码', false); return; }
    if (!currentSig) { showUnlockMsg('请先完成一次合盘', false); return; }
    // 仅接受本配对专属码：暗号(由出生数据派生) + 当月/上月任一匹配即通过
    const ok = monthWindows().some(w => makeCode(shortToken(currentSig), w) === code);
    if (ok) {
      finishUnlock();
    } else {
      showUnlockMsg('解锁码不正确或已过期，请核对，或联系站长微信 ' + PAY.wechat, false);
    }
  }
  function finishUnlock() {
    unlockPair(currentSig);
    closeModal();
    showUnlockMsg('解锁成功，正在刷新…', true);
    if (lastCalc) renderDeepZone(lastCalc.pa, lastCalc.pb, lastCalc.res);
    els.shareBtn.textContent = '📸 保存无水印高清图';
    // P1-5 解锁后引导保存与分享（满意度峰值，促裂变）
    const shareRow = els.shareBtn.parentNode;
    let guide = document.getElementById('unlockShareGuide');
    if (!guide && shareRow) {
      guide = document.createElement('p');
      guide.id = 'unlockShareGuide';
      guide.className = 'unlock-share-guide';
      guide.innerHTML = '🎉 已解锁完成！分享图已自动去掉水印——点上方「保存无水印高清图」就能存下来，觉得准的话也欢迎分享给姐妹～';
      shareRow.after(guide);
    }
  }

  // 按需加载 html2canvas：首屏不下载，点「保存分享图」时才拉取，省约 47KB gzip
  function ensureHtml2Canvas() {
    if (typeof html2canvas === 'function') return Promise.resolve();
    if (window.__h2cPromise) return window.__h2cPromise;
    window.__h2cPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/html2canvas.min.js?v=2';
      s.onload = () => resolve();
      s.onerror = () => { window.__h2cPromise = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return window.__h2cPromise;
  }

  async function saveShare() {
    els.shareHint.hidden = false;
    els.shareHint.textContent = '组件加载中…';
    els.shareBtn.disabled = true;
    try {
      await ensureHtml2Canvas();
    } catch (e) {
      alert('分享组件加载失败，请检查网络后重试');
      els.shareBtn.disabled = false;
      els.shareHint.hidden = true;
      return;
    }
    els.shareHint.textContent = '生成中…';
    const node = els.result;
    let wm = null;
    if (!isPairUnlocked(currentSig)) {
      wm = document.createElement('div');
      wm.className = 'share-watermark';
      wm.textContent = '体验版 · 双女八字合盘';
      node.appendChild(wm);
    }
    const prevBg = node.style.background;
    const prevBtn = els.shareBtn.style.display;
    // P2-3 分享图配色主题
    const THEMES = {
      pink: { bg: 'linear-gradient(160deg,#fde7f1,#efe4fb 45%,#e6ecfb)', solid: '#fbe9f3' },
      ink:  { bg: 'linear-gradient(160deg,#dcefe9,#e3eaf5 50%,#eae4f3)', solid: '#e2efe9' },
      gold: { bg: 'linear-gradient(160deg,#fbf0d8,#f6e8d0 50%,#f3eadf)', solid: '#f8eed9' }
    };
    const themeSel = $('shareTheme');
    const th = THEMES[themeSel && themeSel.value] || THEMES.pink;
    els.shareBtn.style.display = 'none';
    if (themeSel) themeSel.style.display = 'none';
    els.shareHint.style.display = 'none';
    node.style.background = th.bg;
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: th.solid, useCORS: true, logging: false });
      const link = document.createElement('a');
      link.download = '双女八字合盘_' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      els.shareHint.textContent = '已保存到下载文件夹 🌷';
    } catch (e) {
      alert('生成图片失败：' + (e.message || e));
      els.shareHint.textContent = '';
    } finally {
      if (wm && wm.parentNode) wm.parentNode.removeChild(wm);
      node.style.background = prevBg;
      els.shareBtn.style.display = prevBtn;
      const themeSelBack = $('shareTheme');
      if (themeSelBack) themeSelBack.style.display = '';
      els.shareBtn.disabled = false;
      setTimeout(() => { els.shareHint.hidden = true; }, 2500);
    }
  }

  function animateScore(total) {
    const ring = els.scoreRing;
    let cur = 0;
    const step = Math.max(1, Math.round(total / 40));
    const timer = setInterval(() => {
      cur += step;
      if (cur >= total) { cur = total; clearInterval(timer); }
      els.scoreNum.textContent = cur;
      ring.style.setProperty('--deg', (cur / 100 * 360) + 'deg');
    }, 22);
  }

  // 合盘仪式过场：先算好数据，播完动画再渲染，算法不受影响
  function playRitual(after) {
    const mask = $('ritual');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!mask || reduce) { after(); return; }
    mask.hidden = false;
    mask.setAttribute('aria-hidden', 'false');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      mask.classList.add('ritual-out');
      setTimeout(() => {
        mask.hidden = true;
        mask.setAttribute('aria-hidden', 'true');
        mask.classList.remove('ritual-out');
      }, 320);
      after();
    };
    setTimeout(finish, 1150);
  }

  function doCalc() {
    clearError();
    try {
      const ia = parseInput('A');
      const ib = parseInput('B');
      const pa = B.parseBazi(ia.y, ia.m, ia.d, ia.shichen);
      const pb = B.parseBazi(ib.y, ib.m, ib.d, ib.shichen);
      const res = B.analyzeCompat(pa, pb);

      currentSig = pairSig(pa, pb);
      lastCalc = { pa, pb, res };

      playRitual(() => {
        els.result.hidden = false;
        els.shareBtn.hidden = false;
        els.resetBtn.hidden = false;
        animateScore(res.total);
        els.ratingLevel.textContent = res.rating.level;
        els.ratingLevel.style.color = res.rating.color;
        els.ratingStars.textContent = '★'.repeat(res.rating.stars) + '☆'.repeat(5 - res.rating.stars);
        els.summaryText.textContent = res.summary;
        buildPersonalInsight(pa, pb, res);
        els.pillarA.innerHTML = buildPillarCard(pa, safeName(els.nameA, '命主'), 'A');
        els.pillarB.innerHTML = buildPillarCard(pb, safeName(els.nameB, '命主'), 'B');
        renderWxChart(pa, pb);
        renderDimensions(res.details);
        buildAdvice(pa, pb, res.dimensions, res.total, els.relA.value);
        renderVerdict(res);
        renderTimeUnknownTip(ia, ib);
        renderDeepZone(pa, pb, res);
        decorateTerms(els.result);
        bindSoloEntries(pa, pb);
        els.shareBtn.textContent = isPairUnlocked(currentSig) ? '📸 保存无水印高清图' : '📸 保存分享图（体验版带水印）';
        const themeSel = $('shareTheme'); if (themeSel) themeSel.hidden = false;
        els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      showError(e.message || '合盘出错，请检查输入。');
    }
  }

  // 随机示例
  const SAMPLES = [
    { n: '小柔', y: 1995, m: 6, d: 15, t: '未', r: '恋人' },
    { n: '阿岚', y: 1996, m: 8, d: 20, t: '午', r: '恋人' },
    { n: '一一', y: 1991, m: 2, d: 10, t: '子', r: '闺蜜' },
    { n: '林果', y: 1998, m: 11, d: 3, t: '酉', r: '恋人' },
    { n: '夏夏', y: 1993, m: 4, d: 28, t: '巳', r: '搭档' },
    { n: '清清', y: 2000, m: 1, d: 18, t: '寅', r: '闺蜜' }
  ];
  function fillDemo() {
    clearError();
    const pick = () => SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    let a = pick(), b = pick();
    let guard = 0;
    while (b === a && guard++ < 10) b = pick();
    const setA = (s) => {
      els.nameA.value = s.n; els.dateA.value = `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`;
      els.timeA.value = s.t; els.relA.value = s.r;
    };
    const setB = (s) => {
      els.nameB.value = s.n; els.dateB.value = `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`;
      els.timeB.value = s.t; els.relB.value = s.r;
    };
    setA(a); setB(b);
    doCalc();
  }

  // ===== 诗词共赏（免费专区） =====
  const POEMS = [
    { tag: '唐诗 · 女诗人', author: '李冶《八至》', lines: ['至近至远东西，', '至深至浅清溪。', '至高至明日月，', '至亲至疏夫妻。'], note: '唐代女诗人李冶的名句——最亲最疏，原是身边人。' },
    { tag: '唐诗 · 女诗人', author: '鱼玄机《赠邻女》', lines: ['羞日遮罗袖，', '愁春懒起妆。', '易求无价宝，', '难得有情郎。'], note: '鱼玄机写给邻家女子的诗，道尽女儿家心事。' },
    { tag: '唐诗 · 女诗人', author: '薛涛《春望词》', lines: ['花开不同赏，', '花落不同悲。', '欲问相思处，', '花开花落时。'], note: '薛涛以花喻相思，写尽双女相隔的柔情。' },
    { tag: '唐诗 · 女诗人', author: '薛涛《送友人》', lines: ['水国蒹葭夜有霜，', '月寒山色共苍苍。', '谁言千里自今夕，', '离梦杳如关塞长。'], note: '薛涛送别之作，千里亦如比邻。' },
    { tag: '宋词 · 女词人', author: '李清照《如梦令》', lines: ['常记溪亭日暮，', '沉醉不知归路。', '兴尽晚回舟，', '误入藕花深处。'], note: '李清照少女时代的明快，像极了和喜欢的人一起浪费时光。' },
    { tag: '宋词 · 女词人', author: '朱淑真《谒金门》', lines: ['满院落花帘不卷，', '断肠芳草远。'], note: '朱淑真笔下的思念，写尽女儿家细腻幽微的心事。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['她不是风景，是归途；', '我走遍千山，只在她眼里落脚。'], note: '现代随手写的短句，给两个女孩。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['我们把名字写在同一行，', '风一读，就甜了。'], note: '同名同框，是双女最寻常的浪漫。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['她懂我所有的沉默，', '就像月亮懂潮汐。'], note: '不必说出口的懂得，是最深的默契。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['我们是两朵并肩生长的花，', '根在地下悄悄牵着手。'], note: '写给那些细水长流、彼此支撑的关系。' },
    { tag: '古风短句', author: '并蒂 · 双栖', lines: ['并蒂莲开，双栖枝上。', '她携春风来，落我眉间雪。'], note: '古风里写双女，最宜合盘。' },
    { tag: '古风短句', author: '同看 · 共话', lines: ['同看一窗月，', '共话两心知。'], note: '月下并肩，是两朵花最好的归宿。' },
    { tag: '古风短句', author: '红袖 · 添香', lines: ['红袖添香夜读书，', '灯下眉弯两相顾。'], note: '最浪漫的事，不过一屋两人，三餐四季。' },
    { tag: '古风短句', author: '相思 · 不负', lines: ['愿我如星君如月，', '夜夜流光相皎洁。'], note: '虽是旧句，写给双女亦是再合适不过。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['别人问我们是什么关系，', '我们相视一笑——是命运。'], note: '有些缘分，八字知道，心也知道。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['她是我平平无奇的日子里，', '忽然亮起的一盏灯。'], note: '写给那个让你生活发光的人。' },
    { tag: '唐诗 · 女诗人', author: '李冶《明月夜留别》', lines: ['离人无语月无声，', '明月有光人有情。', '别后相思人似月，', '云间水上到层城。'], note: '唐代女道士李冶写别后相思，隔了多远都照得到。' },
    { tag: '唐诗 · 女诗人', author: '鱼玄机《寄国香》', lines: ['旦夕醉吟身，', '相思又此春。', '雨中寄书使，', '窗下断肠人。'], note: '鱼玄机寄给女性友人的诗，女儿之间的惦念写得极真。' },
    { tag: '宋词 · 女词人', author: '李清照《点绛唇》', lines: ['蹴罢秋千，', '起来慵整纤纤手。', '露浓花瘦，', '薄汗轻衣透。'], note: '少女时代的明快与俏皮，像被喜欢的人撞见的那一瞬。' },
    { tag: '宋词 · 女词人', author: '李清照《浣溪沙》', lines: ['绣面芙蓉一笑开，', '斜飞宝鸭衬香腮。', '眼波才动被人猜。'], note: '一个眼神就被猜中心事，写尽了心照不宣。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['她把伞往我这边倾了倾，', '雨就只淋湿了她半边肩膀。'], note: '偏爱都藏在这种不打招呼的小动作里。' },
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['我们不擅长说永远，', '只擅长把明天再约一次。'], note: '长久不是一句誓言，是一次次再约。' },
    { tag: '古风短句 · 原创', author: '今人 · 双女小诗', lines: ['一窗月色分两处，', '各照眉间一样柔。'], note: '不在一处，也共着同一片月光。' },
    { tag: '古风短句 · 原创', author: '今人 · 双女小诗', lines: ['并肩不问归途远，', '只借春风同步行。'], note: '不问终点，只问身边是不是你。' }
  ];
  function renderPoems() {
    const grid = document.getElementById('poemGrid');
    if (!grid) return;
    const cardHTML = (p, i) => `
      <article class="poem-card${i % 3 === 0 ? ' poem-featured' : ''}">
        <div class="poem-tag">${p.tag}</div>
        <h4 class="poem-author">${p.author}</h4>
        <div class="poem-body">${p.lines.map(l => `<p>${l}</p>`).join('')}</div>
        <div class="poem-note">${p.note}</div>
      </article>`;
    const SHOWN = 8;
    const shown = POEMS.slice(0, SHOWN).map(cardHTML).join('');
    const rest = POEMS.slice(SHOWN).map(cardHTML).join('');
    grid.innerHTML = shown + (rest
      ? `<details class="poem-more"><summary>展开更多 ${POEMS.length - SHOWN} 首 🌿</summary><div class="poem-more-grid">${rest}</div></details>`
      : '');
  }
  renderPoems();

  // ===== 十天干日主速查（免费专区，全部免费）=====
  const GAN_CARDS = [
    { g: '甲', wx: '木', role: '守护者', trait: '如大树般稳重，有担当、能扛事', tip: '给她空间生长，别替她做决定' },
    { g: '乙', wx: '木', role: '感知者', trait: '柔韧如藤蔓，细腻、很会读空气', tip: '别用直话戳她，先说感受再说事' },
    { g: '丙', wx: '火', role: '发光体', trait: '像太阳一样热情直爽，照亮身边人', tip: '认真回应她的分享，冷落最伤' },
    { g: '丁', wx: '火', role: '温暖者', trait: '烛光般的温柔，细腻贴心、默默付出', tip: '主动看见她的付出，别当成理所当然' },
    { g: '戊', wx: '土', role: '定海针', trait: '像大地般厚实可靠，给足安全感', tip: '少临时变卦，确定感对她很重要' },
    { g: '己', wx: '土', role: '滋养者', trait: '如田园泥土般包容，善解人意', tip: '她照顾人，也记得留人照顾她' },
    { g: '庚', wx: '金', role: '行动派', trait: '刚毅果决、讲原则、行动力强', tip: '有话直说，但记得裹一层糖' },
    { g: '辛', wx: '金', role: '鉴赏家', trait: '精致讲究、审美在线、追求品质', tip: '别敷衍她认真挑过的东西' },
    { g: '壬', wx: '水', role: '智者', trait: '如江河般灵动聪慧，适应力极强', tip: '别把她框死，留一点弹性' },
    { g: '癸', wx: '水', role: '治愈者', trait: '如雨露般润物无声，内心深邃', tip: '她沉默时陪着就好，别急着追问' }
  ];
  function renderGanCards() {
    const grid = $('ganGrid');
    if (!grid) return;
    grid.innerHTML = GAN_CARDS.map(c => `
      <article class="gan-card">
        <div class="gan-head"><span class="gan-char wx-${c.wx}">${c.g}</span><span class="gan-wx">${c.wx} · ${c.role}</span></div>
        <p class="gan-trait">${c.trait}</p>
        <p class="gan-tip">相处提示：${c.tip}</p>
      </article>`).join('');
  }
  renderGanCards();

  // ===== P2-1 单人命格速查工具（次级免费入口，SEO 长尾）=====
  if (els.soloBtn) {
    els.soloBtn.addEventListener('click', () => {
      const dateVal = els.soloDate.value;
      if (!dateVal) { alert('请先填写出生日期（公历）'); return; }
      const [y, m, d] = dateVal.split('-').map(Number);
      try {
        const p = B.parseBazi(y, m, d, els.soloTime.value || '子');
        const label = (els.soloName.value || '').trim() || '你';
        els.soloResult.innerHTML = soloCardHTML(p, escapeHtml(label));
        els.soloResult.hidden = false;
        els.soloResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {
        alert('日期有误，请检查后重试');
      }
    });
  }

  // 免费 / 深度对照区：一键回到输入区
  const goCalcBtn = $('goCalcBtn');
  if (goCalcBtn) {
    goCalcBtn.addEventListener('click', () => {
      const input = document.querySelector('.input-area');
      if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // 复制微信号
  const copyWxBtn = $('copyWxBtn');
  if (copyWxBtn) {
    copyWxBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(PAY.wechat).then(() => {
        const old = copyWxBtn.textContent;
        copyWxBtn.textContent = '已复制 ✓';
        setTimeout(() => copyWxBtn.textContent = old, 1500);
      }).catch(() => {
        alert('微信号：' + PAY.wechat);
      });
    });
  }

  // 回到顶部
  const backToTop = $('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  els.calcBtn.addEventListener('click', doCalc);
  els.demoBtn.addEventListener('click', fillDemo);
  els.shareBtn.addEventListener('click', saveShare);
  els.resetBtn.addEventListener('click', () => {
    els.result.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  els.unlockConfirm.addEventListener('click', confirmUnlock);
  els.modalClose.addEventListener('click', closeModal);
  els.unlockModal.addEventListener('click', (e) => { if (e.target === els.unlockModal) closeModal(); });
  els.unlockCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmUnlock(); });

  // ===== P2-4 节日氛围：按日期给页面加一个轻微色调 class（不改结构，可一键关闭）=====
  function applySeasonalMood() {
    const now = new Date();
    const m = now.getMonth() + 1, d = now.getDate();
    let mood = '';
    if ((m === 2 && d >= 12) || (m === 8 && d >= 18 && d <= 25)) mood = 'mood-qixi'; // 情人节 / 七夕
    else if (m === 1 || m === 2) mood = 'mood-newyear';                              // 新春
    else if (m >= 3 && m <= 5) mood = 'mood-spring';                                 // 春日
    if (mood) document.body.classList.add(mood);
  }
  applySeasonalMood();

  // ===== PWA：注册 Service Worker（仅 https / localhost 生效，file:// 下静默跳过）=====
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
