/* ============================================================
 * 八字合盘引擎  bazi.js
 * 依赖 lunar-javascript (lib/lunar.js) 计算四柱干支
 * 同时支持浏览器(window.BaziEngine)与 Node(module.exports)
 * ============================================================ */
(function (global) {
  'use strict';

  // ---- 加载 lunar 库 ----
  let Lunar = null;
  if (typeof window !== 'undefined' && window.Lunar) {
    Lunar = window.Lunar;
  } else if (typeof require !== 'undefined') {
    try { Lunar = require('../lib/lunar.js').Lunar; } catch (e) { /* ignore */ }
  }

  // ---- 基础字典 ----
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const WUXING = ['木', '火', '土', '金', '水'];

  const GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const GAN_YINYANG = { 甲: '阳', 乙: '阴', 丙: '阳', 丁: '阴', 戊: '阳', 己: '阴', 庚: '阳', 辛: '阴', 壬: '阳', 癸: '阴' };

  // 五行生克
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // A 生 B
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // A 克 B

  // 地支关系表
  const LIU_HE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
  const LIU_CHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
  const LIU_HAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
  const LIU_PO = [['子', '酉'], ['丑', '辰'], ['寅', '亥'], ['卯', '午'], ['巳', '申'], ['未', '戌']];
  const SAN_HE = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
  const SAN_XING = [['寅', '巳', '申'], ['丑', '戌', '未'], ['子', '卯'], ['辰', '午', '酉', '亥']];
  const GAN_HE = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];

  // 生肖名
  const ZHI_ANIMAL = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' };

  const WX_COLOR = { 木: '#3fa86a', 火: '#e2554f', 土: '#c8923a', 金: '#b9b9c2', 水: '#3a7bd5' };

  // ---- 关系判定工具 ----
  function pairIn(list, a, b) {
    if (a === b) return false; // 「合/冲/害」须为两个字，相同的字不算
    return list.some(p => ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)));
  }
  function inSameGroup(groups, a, b) {
    return groups.some(g => g.includes(a) && g.includes(b));
  }
  function isLiuHe(a, b) { return pairIn(LIU_HE, a, b); }
  function isLiuChong(a, b) { return pairIn(LIU_CHONG, a, b); }
  function isLiuHai(a, b) { return pairIn(LIU_HAI, a, b); }
  function isLiuPo(a, b) { return pairIn(LIU_PO, a, b); }
  function isSanXing(a, b) { return inSameGroup(SAN_XING, a, b); }
  function inSameSanHe(a, b) { return inSameGroup(SAN_HE, a, b); }
  function isGanHe(a, b) { return pairIn(GAN_HE, a, b); }

  // 生克关系文字：以 a 看 b
  function relWX(a, b) {
    if (a === b) return '比和';
    if (SHENG[a] === b) return '生';
    if (SHENG[b] === a) return '生';
    if (KE[a] === b) return '克';
    if (KE[b] === a) return '克';
    return '比和';
  }

  function naYinElement(naYin) {
    const last = naYin.slice(-1);
    return WUXING.includes(last) ? last : '土';
  }

  // 时辰 → 代表小时
  const SHICHEN_HOUR = { 子: 0, 丑: 2, 寅: 4, 卯: 6, 辰: 8, 巳: 10, 午: 12, 未: 14, 申: 16, 酉: 18, 戌: 20, 亥: 22 };

  // ============================================================
  // 排盘：公历 y/m/d + 时辰名 → 完整命盘对象
  // ============================================================
  function parseBazi(y, m, d, shichen) {
    if (!Lunar) throw new Error('lunar 库未加载');
    const hour = SHICHEN_HOUR[shichen] !== undefined ? SHICHEN_HOUR[shichen] : 0;
    const lunar = Lunar.fromYmdHms(y, m, d, hour, 0, 0);

    const pillars = ['年', '月', '日', '时'].map((label, i) => {
      const gz = [lunar.getYearInGanZhi(), lunar.getMonthInGanZhi(), lunar.getDayInGanZhi(), lunar.getTimeInGanZhi()][i];
      const nays = [lunar.getYearNaYin(), lunar.getMonthNaYin(), lunar.getDayNaYin(), lunar.getTimeNaYin()][i];
      const gan = gz.charAt(0);
      const zhi = gz.charAt(1);
      return {
        label, gan, zhi,
        ganWX: GAN_WUXING[gan],
        zhiWX: ZHI_WUXING[zhi],
        naYin: nays,
        naYinWX: naYinElement(nays)
      };
    });

    const yearZhi = pillars[0].zhi;
    const dayMaster = pillars[2].gan;
    const dayMasterWX = GAN_WUXING[dayMaster];

    // 收集全部 8 个字（干+支）的五行，用于统计
    const allChars = [];
    const allWX = [];
    pillars.forEach(p => {
      allChars.push({ type: 'gan', char: p.gan, wx: p.ganWX });
      allChars.push({ type: 'zhi', char: p.zhi, wx: p.zhiWX });
      allWX.push(p.ganWX, p.zhiWX);
    });

    // 五行数量统计
    const elementCounts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    allWX.forEach(w => elementCounts[w]++);
    const distinct = WUXING.filter(w => elementCounts[w] > 0);

    // 命格关键词（基于日主）
    const personality = personalityOf(dayMaster);

    return {
      pillars,
      yearZhi,
      zodiac: ZHI_ANIMAL[yearZhi],
      dayMaster,
      dayMasterWX,
      dayMasterYinYang: GAN_YINYANG[dayMaster],
      allChars,
      elementCounts,
      distinctElements: distinct,
      personality,
      naYin: pillars.map(p => p.naYin)
    };
  }

  function personalityOf(gan) {
    const wx = GAN_WUXING[gan];
    const yy = GAN_YINYANG[gan];
    const wxDesc = {
      木: '仁厚温和、有生长力与韧劲，重情义但偶尔优柔',
      火: '热情明亮、表达欲强、行动力足，偶尔有些急躁',
      土: '包容踏实、稳重可靠、重承诺，稍显慢热',
      金: '果决理性、有边界感、讲义气，外冷内热',
      水: '灵动聪慧、适应力强、包容大度，心思细腻善变'
    }[wx];
    const yyDesc = yy === '阳' ? '，气质外放大气、主动' : '，气质内敛柔和、细腻';
    return wxDesc + yyDesc;
  }

  // ============================================================
  // 合盘分析
  // ============================================================
  function analyzeCompat(a, b) {
    const dims = {};

    // 1) 生肖默契 (max 20)
    dims.zodiac = scoreZodiac(a, b);
    // 2) 五行互补 (max 25)
    dims.wuxing = scoreWuxing(a, b);
    // 3) 性格相合 / 天干 (max 15)
    dims.gan = scoreGan(a, b);
    // 4) 地支互动 (max 25)
    dims.zhi = scoreZhi(a, b);
    // 5) 缘分根基 / 年柱纳音 (max 15)
    dims.fate = scoreFate(a, b);

    const maxTotal = 20 + 25 + 15 + 25 + 15; // 100
    const total = Math.round(dims.zodiac.score + dims.wuxing.score + dims.gan.score + dims.zhi.score + dims.fate.score);

    const rating = rate(total);
    const summary = buildSummary(a, b, dims, total, rating);

    return {
      total,
      rating,
      dimensions: dims,
      summary,
      details: buildDetails(a, b, dims)
    };
  }

  function scoreZodiac(a, b) {
    const za = a.yearZhi, zb = b.yearZhi;
    let score, label, text;
    if (isLiuHe(za, zb)) {
      score = 20; label = '天作六合';
      text = `生肖${a.zodiac}与${b.zodiac}为「六合」，天生投缘、默契十足，相处轻松不费力。`;
    } else if (inSameSanHe(za, zb)) {
      score = 16; label = '三合助力';
      text = `生肖${a.zodiac}与${b.zodiac}同属「三合」局，气场相扶、彼此能带来好运与助力。`;
    } else if (isLiuChong(za, zb)) {
      score = 3; label = '六冲相激';
      text = `生肖${a.zodiac}与${b.zodiac}「六冲」，性格与节奏容易对撞，需要更多包容与沟通。`;
    } else if (isSanXing(za, zb)) {
      score = 5; label = '略有刑克';
      text = `生肖${a.zodiac}与${b.zodiac}存在「相刑」，细节上易有摩擦，注意别因小事较劲。`;
    } else if (isLiuHai(za, zb)) {
      score = 8; label = '六害牵绊';
      text = `生肖${a.zodiac}与${b.zodiac}「六害」，缘分中带点牵绊，需用心经营才不会渐行渐远。`;
    } else {
      score = 12; label = '平淡相安';
      text = `生肖${a.zodiac}与${b.zodiac}无特殊的合或冲，相处平稳自然，靠日常点滴累积感情。`;
    }
    return { score, max: 20, label, text };
  }

  function scoreWuxing(a, b) {
    const dmA = a.dayMasterWX, dmB = b.dayMasterWX;
    let base, relLabel;
    if (dmA === dmB) { base = 16; relLabel = '比和（同气）'; }
    else if (SHENG[dmA] === dmB || SHENG[dmB] === dmA) { base = 20; relLabel = '相生（互滋）'; }
    else { base = 11; relLabel = '相克（相制）'; }

    const union = new Set([...a.distinctElements, ...b.distinctElements]);
    let covBonus = union.size >= 5 ? 5 : union.size === 4 ? 3 : union.size === 3 ? 1 : 0;

    const score = Math.min(25, base + covBonus);
    let text;
    if (relLabel.startsWith('相生')) {
      text = `日主${dmA}与${dmB}五行相生，彼此滋养、互相成全，一个给力一个承接，关系有流动感。`;
    } else if (relLabel.startsWith('比和')) {
      text = `日主同为${dmA}，气质相近、同频共振，像照镜子；但太过相似也可能少点互补的新鲜感。`;
    } else {
      text = `日主${dmA}克${dmB}（或反之），存在张力与拉扯，是「欢喜冤家」型，磨合好了反而很带劲。`;
    }
    if (union.size >= 5) text += '两人五行齐全、气场互补，刚柔并济。';
    else if (union.size <= 3) text += '注意彼此五行偏枯，可多接触所缺元素的环境与人事来调和。';
    return { score, max: 25, label: relLabel, text };
  }

  function scoreGan(a, b) {
    const dmA = a.dayMaster, dmB = b.dayMaster;
    let score, label, text;
    if (isGanHe(dmA, dmB)) {
      score = 15; label = '天干五合';
      text = `日干${dmA}与${dmB}构成「天干五合」，这是极深的吸引与羁绊，像被一根无形的红绳系住。`;
    } else {
      const r = relWX(dmA, dmB);
      let base = r === '生' ? 12 : r === '比和' ? 10 : 7;
      // 任意天干五合
      let anyHe = false;
      a.pillars.forEach(pa => b.pillars.forEach(pb => { if (isGanHe(pa.gan, pb.gan)) anyHe = true; }));
      if (anyHe) base = Math.min(15, base + 3);
      score = base;
      label = r === '生' ? '天干相生' : r === '比和' ? '天干同气' : '天干相制';
      text = anyHe
        ? `除日干外，命盘中另有天干「五合」，暗中增添默契与缘分厚度。`
        : (r === '生'
          ? `天干${dmA}生${dmB}，你倾向于付出与照顾，关系里你是温柔的那一方。`
          : r === '比和'
            ? `天干同气，思维方式接近，聊得来也懂彼此的梗。`
            : `天干相制，观点常碰撞，但正是这种火花让相处不无聊。`);
    }
    return { score, max: 15, label, text };
  }

  function scoreZhi(a, b) {
    const za = a.pillars.map(p => p.zhi);
    const zb = b.pillars.map(p => p.zhi);
    let s = 14;
    const found = { he: 0, chong: 0, hai: 0, po: 0, xing: 0, sanhe: 0 };
    za.forEach(x => {
      zb.forEach(y => {
        if (isLiuHe(x, y)) { s += 6; found.he++; }
        else if (isLiuChong(x, y)) { s -= 6; found.chong++; }
        else if (isLiuHai(x, y)) { s -= 3; found.hai++; }
        else if (isLiuPo(x, y)) { s -= 2; found.po++; }
        else if (isSanXing(x, y)) { s -= 4; found.xing++; }
      });
      // 三合组成员重叠
      SAN_HE.forEach(g => {
        if (g.includes(x) && zb.some(y => g.includes(y))) found.sanhe++;
      });
    });
    s += Math.min(8, found.sanhe * 2);
    s = Math.max(0, Math.min(25, s));

    let label, text;
    if (found.chong === 0 && found.he >= 1) { label = '地支多合'; text = `地支中出现了${found.he}组六合，几乎没有冲克，相处顺滑、让人安心。`; }
    else if (found.chong >= 2) { label = '地支多冲'; text = `地支出现${found.chong}组六冲，生活中易有突如其来的变动与争执，需要给彼此留白。`; }
    else if (found.he === 0 && found.chong === 0 && found.sanhe > 0) { label = '三合聚气'; text = `地支三合汇聚，贵人多、气场合，一起做事容易成。`; }
    else if (found.xing > 0) { label = '地支带刑'; text = `地支存在相刑，某些心结或旧账容易被勾起，建议有事敞开说。`; }
    else { label = '地支平稳'; text = `地支互动平和，没有强烈吸引也没有明显冲突，是细水长流的类型。`; }
    if (found.sanhe > 0) text += `（含${found.sanhe}处三合助力）`;

    return { score: s, max: 25, label, text, found };
  }

  function scoreFate(a, b) {
    const na = a.pillars[0].naYinWX, nb = b.pillars[0].naYinWX;
    let score, label, text;
    if (na === nb) { score = 12; label = '纳音同音'; text = `年柱纳音同为「${na}」，根基同频，家庭背景或价值观容易相近。`; }
    else if (SHENG[na] === nb || SHENG[nb] === na) { score = 15; label = '纳音相生'; text = `年柱纳音${na}与${nb}相生，前世缘分厚、家世气场互相增益，是「带缘而来」的组合。`; }
    else { score = 8; label = '纳音相成'; text = `年柱纳音${na}与${nb}相制，缘分需要后天经营，磨合出专属的相处节奏。`; }
    return { score, max: 15, label, text };
  }

  function rate(total) {
    if (total >= 85) return { level: '上上缘', stars: 5, color: '#e2554f', desc: '天作之合，磁场高度同频' };
    if (total >= 70) return { level: '良缘佳偶', stars: 4, color: '#e08a3c', desc: '相当合拍，越处越甜' };
    if (total >= 55) return { level: '平稳相守', stars: 3, color: '#c8923a', desc: '细水长流，稳定可靠' };
    if (total >= 40) return { level: '欢喜冤家', stars: 2, color: '#5b8def', desc: '有火花也有摩擦，需磨合' };
    return { level: '缘分浅淡', stars: 1, color: '#8a8a99', desc: '需用心经营，莫强求' };
  }

  function buildSummary(a, b, dims, total, rating) {
    const z = dims.zodiac.label, w = dims.wuxing.label, f = dims.fate.label;
    const g = dims.gan.label.startsWith('天干') ? dims.gan.label.slice(2) : dims.gan.label;
    return `综合评分 ${total} 分，定为「${rating.level}」——${rating.desc}。`
      + `生肖${z}、日主${w}、天干${g}、年柱${f}。`
      + `你们之间是${total >= 70 ? '相当合拍、越处越甜' : total >= 55 ? '踏实稳定的陪伴' : total >= 40 ? '充满张力、需要磨合的吸引' : '需要更多耐心去经营'}的关系。`;
  }

  function buildDetails(a, b, dims) {
    return [
      { key: 'zodiac', name: '生肖默契', icon: '🐾', ...dims.zodiac },
      { key: 'wuxing', name: '五行互补', icon: '🌿', ...dims.wuxing },
      { key: 'gan', name: '性格相合', icon: '✨', ...dims.gan },
      { key: 'zhi', name: '地支互动', icon: '🌗', ...dims.zhi },
      { key: 'fate', name: '缘分根基', icon: '🔮', ...dims.fate }
    ];
  }

  // ---- 暴露接口 ----
  const API = {
    parseBazi, analyzeCompat,
    GAN, ZHI, WUXING, GAN_WUXING, ZHI_WUXING, WX_COLOR, ZHI_ANIMAL, SHICHEN_HOUR,
    isLiuHe, isLiuChong, isGanHe, inSameSanHe, relWX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BaziEngine = API;

})(typeof window !== 'undefined' ? window : this);
