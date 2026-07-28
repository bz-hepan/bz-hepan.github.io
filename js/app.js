/* ============================================================
 * 双女八字合盘 · 界面交互  app.js
 * 依赖：lib/lunar.js（window.Lunar）、js/bazi.js（window.BaziEngine）
 * ============================================================ */
(function () {
  'use strict';
  const B = window.BaziEngine;
  const $ = (id) => document.getElementById(id);

  const els = {
    nameA: $('nameA'), dateA: $('dateA'), timeA: $('timeA'), relA: $('relA'),
    nameB: $('nameB'), dateB: $('dateB'), timeB: $('timeB'), relB: $('relB'),
    calcBtn: $('calcBtn'), demoBtn: $('demoBtn'),
    error: $('errorMsg'), result: $('result'),
    scoreNum: $('scoreNum'), scoreRing: document.querySelector('.score-ring'),
    ratingLevel: $('ratingLevel'), ratingStars: $('ratingStars'), summaryText: $('summaryText'),
    pillarA: $('pillarA'), pillarB: $('pillarB'),
    dimensions: $('dimensions'), adviceList: $('adviceList'),
    shareBtn: $('shareBtn'), shareHint: $('shareHint')
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

  function buildPillarCard(p, name) {
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
      <div class="persona">${p.personality}</div>`;
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

    // 去重 + 取前 5 条
    const uniq = [...new Set(tips)].slice(0, 5);
    els.adviceList.innerHTML = uniq.map(t => `<li>${t}</li>`).join('');
  }

  async function saveShare() {
    if (typeof html2canvas !== 'function') { alert('分享组件未加载，请刷新页面重试'); return; }
    els.shareHint.hidden = false;
    els.shareHint.textContent = '生成中…';
    els.shareBtn.disabled = true;
    const node = els.result;
    const prevBg = node.style.background;
    const prevBtn = els.shareBtn.style.display;
    els.shareBtn.style.display = 'none';
    els.shareHint.style.display = 'none';
    node.style.background = 'linear-gradient(160deg,#fde7f1,#efe4fb 45%,#e6ecfb)';
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#fbe9f3', useCORS: true, logging: false });
      const link = document.createElement('a');
      link.download = '双女八字合盘_' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      els.shareHint.textContent = '已保存到下载文件夹 🌷';
    } catch (e) {
      alert('生成图片失败：' + (e.message || e));
      els.shareHint.textContent = '';
    } finally {
      node.style.background = prevBg;
      els.shareBtn.style.display = prevBtn;
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

  function doCalc() {
    clearError();
    try {
      const ia = parseInput('A');
      const ib = parseInput('B');
      const pa = B.parseBazi(ia.y, ia.m, ia.d, ia.shichen);
      const pb = B.parseBazi(ib.y, ib.m, ib.d, ib.shichen);
      const res = B.analyzeCompat(pa, pb);

      els.result.hidden = false;
      els.shareBtn.hidden = false;
      animateScore(res.total);
      els.ratingLevel.textContent = res.rating.level;
      els.ratingLevel.style.color = res.rating.color;
      els.ratingStars.textContent = '★'.repeat(res.rating.stars) + '☆'.repeat(5 - res.rating.stars);
      els.summaryText.textContent = res.summary;
      els.pillarA.innerHTML = buildPillarCard(pa, els.nameA.value.trim());
      els.pillarB.innerHTML = buildPillarCard(pb, els.nameB.value.trim());
      renderDimensions(res.details);
      buildAdvice(pa, pb, res.dimensions, res.total, els.relA.value);
      els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  els.calcBtn.addEventListener('click', doCalc);
  els.demoBtn.addEventListener('click', fillDemo);
  els.shareBtn.addEventListener('click', saveShare);
})();
