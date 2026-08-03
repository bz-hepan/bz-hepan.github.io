/* ============================================================
 * 双女八字合盘 · 界面交互  app.js
 * 依赖：lib/lunar.js（window.Lunar）、js/bazi.js（window.BaziEngine）
 * ============================================================ */
(function () {
  'use strict';
  const B = window.BaziEngine;
  const $ = (id) => document.getElementById(id);

  // ===== 解锁配置（站长可自行修改） =====
  // 解锁码规则：每「配对」专属 + 按月流动（滚动）
  //  - 不同配对 → 不同解锁码（由双方八字四柱生成）
  //  - 每月更新一次，上个月码有 1 个月宽限期
  //  - 用户加站长微信，发送出生信息即可领取专属码
  const PAY = {
    wechat: 'aichishutiaodewo',
    // 站长备用总码（仅自己测试用，不参与"每对不同"规则）
    codes: ['YUAN2026'],
    // 站长控制台入口：网址后加 ?op=ownerOp&key=ownerKey 才打开（如 .../?op=yuan-admin-2026&key=你的密令）
    // ownerKey 仅作"防随手猜网址"的软门槛，写在网页里并非真加密；密令请设长一点并自行修改
    ownerOp: 'yuan-admin-2026',
    ownerKey: 'yzHP2026$xK7mPq2vN'
  };
  const CODE_SALT = 'bazi-hepan-yuan-2026';

  // —— 配对签名：由双方八字四柱生成，顺序无关 ——
  function pairSig(a, b) {
    const s = p => p.pillars.map(x => x.gan + x.zhi).join('');
    return [s(a), s(b)].sort().join('|');
  }
  // 短暗号（用户发给站长做指代用，不可逆）
  function shortToken(sig) {
    return hashStr(sig).toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
  }
  // —— 时间窗口：按月滚动，返回 [当月, 上月] ——
  function monthWindows() {
    const d = new Date();
    let y = d.getFullYear(), m = d.getMonth();
    const cur = y * 100 + (m + 1);
    let py = y, pm = m - 1;
    if (pm < 0) { pm = 11; py = y - 1; }
    return [cur, py * 100 + (pm + 1)];
  }
  // —— 哈希 & 解锁码生成 ——
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeCode(sig, win) {
    const h = hashStr(sig + '|' + win + '|' + CODE_SALT);
    const body = h.toString(36).toUpperCase().padStart(7, '0').slice(-7);
    return 'Y' + body; // 形如 YK3F9ZQ2
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
    deepZone: $('deepZone'),
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

    // 去重 + 取前 5 条
    const uniq = [...new Set(tips)].slice(0, 5);
    els.adviceList.innerHTML = uniq.map(t => `<li>${t}</li>`).join('');
  }

  // ===== 个性化解读区（结果卡内） =====
  function buildPersonalInsight(a, b, res) {
    const nameA = els.nameA.value.trim() || 'Ta';
    const nameB = els.nameB.value.trim() || 'Ta';
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
  function renderDeepZone(a, b, res) {
    if (isPairUnlocked(currentSig)) {
      const d = B.deepReport(a, b, res);
      const nameA = els.nameA.value.trim() || '命主 A';
      const nameB = els.nameB.value.trim() || '命主 B';
      els.deepZone.innerHTML = `
        <div class="deep-unlocked">
          <div class="du-head">🌟 深度缘分报告（已解锁）</div>
          <div class="du-persona-grid">
            <div class="du-persona">
              <h4>${nameA}</h4>
              <div class="du-strength">日主 ${a.dayMaster}（${a.dayMasterWX}）· ${d.personA.strength}</div>
              <div class="du-tone">${d.personA.tone}</div>
              <div class="du-xi">${d.personA.xiDesc}</div>
            </div>
            <div class="du-persona">
              <h4>${nameB}</h4>
              <div class="du-strength">日主 ${b.dayMaster}（${b.dayMasterWX}）· ${d.personB.strength}</div>
              <div class="du-tone">${d.personB.tone}</div>
              <div class="du-xi">${d.personB.xiDesc}</div>
            </div>
          </div>
          <div class="du-block">
            <h4>📜 缘分深度长文</h4>
            <p>${d.deep}</p>
          </div>
          <div class="du-block">
            <h4>🌿 五行调和指南</h4>
            <p>${d.tune}</p>
          </div>
          <div class="du-specials">
            <div class="du-special"><h4>💞 桃花缘</h4><p>${d.taohua}</p></div>
            <div class="du-special"><h4>💰 财运合盘</h4><p>${d.wealth}</p></div>
            <div class="du-special"><h4>🚀 事业合盘</h4><p>${d.career}</p></div>
          </div>
          <div class="du-block">
            <h4>⚠️ 相处禁忌</h4>
            <ul class="du-taboo-list">${d.taboo.map(t => `<li>${t}</li>`).join('')}</ul>
          </div>
          <div class="du-block" style="margin-top:14px;">
            <h4>🗓️ 关系发展时间线</h4>
            <div class="du-timeline">
              ${d.timeline.map(t => `<div class="du-tl-item"><div class="stage">${t.stage}</div><div class="tip">${t.tip}</div></div>`).join('')}
            </div>
          </div>
        </div>`;
    } else {
      const token = shortToken(currentSig);
      els.deepZone.innerHTML = `
        <div class="deep-locked">
          <span class="deep-badge">专属解锁 · 每对不同</span>
          <h3>想知道你们更深的缘分吗？</h3>
          <p class="deep-free-line">${res.summary} 解锁后还能看到关系时间线、桃花 / 财运 / 事业专项解读，以及无水印高清分享图。</p>
          <div class="deep-pair-token">本配对暗号：<b>${token}</b><span class="deep-pair-note">把暗号 + 你们俩的出生年月日与时辰发给站长微信，领取本配对专属解锁码</span></div>
          <ul class="deep-feature-list">
            <li>双人命格详批：日主强弱、喜用神、性格深度</li>
            <li>缘分深度长文：从命理看你们的相处底色</li>
            <li>专项合盘：桃花缘 / 财运 / 事业 三维度</li>
            <li>关系发展时间线：初识 → 磨合 → 长久建议</li>
            <li>解锁后分享图去水印，高清无遮挡</li>
          </ul>
          <button id="unlockBtn" class="unlock-btn" type="button">🔓 获取专属解锁码</button>
        </div>`;
      const ub = $('unlockBtn');
      if (ub) ub.addEventListener('click', openModal);
    }
  }

  function openModal() {
    els.payWechat.textContent = PAY.wechat;
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
    const [cur, prev] = monthWindows();
    const ok = code === makeCode(currentSig, cur) || code === makeCode(currentSig, prev) || PAY.codes.includes(code);
    if (ok) {
      unlockPair(currentSig);
      closeModal();
      showUnlockMsg('解锁成功，正在刷新…', true);
      if (lastCalc) renderDeepZone(lastCalc.pa, lastCalc.pb, lastCalc.res);
      els.shareBtn.textContent = '📸 保存无水印高清图';
    } else {
      showUnlockMsg('解锁码不正确，请核对或联系站长微信 ' + PAY.wechat, false);
    }
  }

  async function saveShare() {
    if (typeof html2canvas !== 'function') { alert('分享组件未加载，请刷新页面重试'); return; }
    els.shareHint.hidden = false;
    els.shareHint.textContent = '生成中…';
    els.shareBtn.disabled = true;
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
      if (wm && wm.parentNode) wm.parentNode.removeChild(wm);
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

      currentSig = pairSig(pa, pb);
      lastCalc = { pa, pb, res };

      els.result.hidden = false;
      els.shareBtn.hidden = false;
      els.resetBtn.hidden = false;
      animateScore(res.total);
      els.ratingLevel.textContent = res.rating.level;
      els.ratingLevel.style.color = res.rating.color;
      els.ratingStars.textContent = '★'.repeat(res.rating.stars) + '☆'.repeat(5 - res.rating.stars);
      els.summaryText.textContent = res.summary;
      buildPersonalInsight(pa, pb, res);
      els.pillarA.innerHTML = buildPillarCard(pa, els.nameA.value.trim());
      els.pillarB.innerHTML = buildPillarCard(pb, els.nameB.value.trim());
      renderDimensions(res.details);
      buildAdvice(pa, pb, res.dimensions, res.total, els.relA.value);
      renderDeepZone(pa, pb, res);
      els.shareBtn.textContent = isPairUnlocked(currentSig) ? '📸 保存无水印高清图' : '📸 保存分享图（体验版带水印）';
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
    { tag: '现代诗 · 原创', author: '今人 · 双女小诗', lines: ['她是我平平无奇的日子里，', '忽然亮起的一盏灯。'], note: '写给那个让你生活发光的人。' }
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
    const SHOWN = 6;
    const shown = POEMS.slice(0, SHOWN).map(cardHTML).join('');
    const rest = POEMS.slice(SHOWN).map(cardHTML).join('');
    grid.innerHTML = shown + (rest
      ? `<details class="poem-more"><summary>展开更多 ${POEMS.length - SHOWN} 首 🌿</summary><div class="poem-more-grid">${rest}</div></details>`
      : '');
  }
  renderPoems();

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

  // ===== 站长控制台：输入用户出生信息 → 生成该配对当月专属解锁码 =====
  function initOwnerConsole() {
    const params = new URLSearchParams(location.search);
    if (params.get('op') !== PAY.ownerOp) return;
    if (params.get('key') !== PAY.ownerKey) return; // 口令不对 → 不显示控制台（静默）
    const oc = document.getElementById('ownerConsole');
    if (!oc) return;
    const fill = (id, src) => {
      const el = document.getElementById(id), s = document.getElementById(src);
      if (el && s) el.innerHTML = s.innerHTML;
    };
    fill('ocTimeA', 'timeA');
    fill('ocTimeB', 'timeB');
    oc.hidden = false;
    const closeOc = () => { oc.hidden = true; };
    document.getElementById('ocClose').addEventListener('click', closeOc);
    oc.addEventListener('click', (e) => { if (e.target === oc) closeOc(); });
    document.getElementById('ocGen').addEventListener('click', () => {
      const da = document.getElementById('ocDateA').value;
      const db = document.getElementById('ocDateB').value;
      if (!da || !db) { alert('请填写两位命主的出生日期'); return; }
      const [ay, am, ad] = da.split('-').map(Number);
      const [by, bm, bd] = db.split('-').map(Number);
      const sa = document.getElementById('ocTimeA').value || '子';
      const sb = document.getElementById('ocTimeB').value || '子';
      const pa = B.parseBazi(ay, am, ad, sa);
      const pb = B.parseBazi(by, bm, bd, sb);
      const sig = pairSig(pa, pb);
      const [cur, prev] = monthWindows();
      const out = document.getElementById('ocOut');
      out.hidden = false;
      out.innerHTML = '当前解锁码：<b class="oc-code">' + makeCode(sig, cur) + '</b>' +
        '<span class="oc-win">有效期：' + cur + '（上个月 ' + prev + ' 也有效）</span>' +
        '<span class="oc-win">配对暗号：' + shortToken(sig) + '</span>';
    });
  }
  initOwnerConsole();
})();
