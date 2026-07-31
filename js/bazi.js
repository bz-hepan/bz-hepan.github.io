/* ============================================================
 * 八字合盘引擎  bazi.js
 * 依赖 lunar-javascript (lib/lunar.js) 计算四柱干支
 * 同时支持浏览器(window.BaziEngine)与 Node(module.exports)
 * ============================================================ */
(function (global) {
  'use strict';

  // ---- 加载 lunar 库 ----
  let Lunar = null, Solar = null;
  if (typeof window !== 'undefined' && window.Lunar) {
    Lunar = window.Lunar; Solar = window.Solar;
  } else if (typeof require !== 'undefined') {
    try {
      const lib = require('../lib/lunar.js');
      Lunar = lib.Lunar; Solar = lib.Solar;
    } catch (e) { /* ignore */ }
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

  // ---- 纳音（六十甲子）----
  const NAYIN = {
    '甲子': '海中金', '乙丑': '海中金', '丙寅': '炉中火', '丁卯': '炉中火',
    '戊辰': '大林木', '己巳': '大林木', '庚午': '路旁土', '辛未': '路旁土',
    '壬申': '剑锋金', '癸酉': '剑锋金', '甲戌': '山头火', '乙亥': '山头火',
    '丙子': '涧下水', '丁丑': '涧下水', '戊寅': '城头土', '己卯': '城头土',
    '庚辰': '白蜡金', '辛巳': '白蜡金', '壬午': '杨柳木', '癸未': '杨柳木',
    '甲申': '泉中水', '乙酉': '泉中水', '丙戌': '屋上土', '丁亥': '屋上土',
    '戊子': '霹雳火', '己丑': '霹雳火', '庚寅': '松柏木', '辛卯': '松柏木',
    '壬辰': '长流水', '癸巳': '长流水', '甲午': '沙中金', '乙未': '沙中金',
    '丙申': '山下火', '丁酉': '山下火', '戊戌': '平地木', '己亥': '平地木',
    '庚子': '壁上土', '辛丑': '壁上土', '壬寅': '金箔金', '癸卯': '金箔金',
    '甲辰': '覆灯火', '乙巳': '覆灯火', '丙午': '天河水', '丁未': '天河水',
    '戊申': '大驿土', '己酉': '大驿土', '庚戌': '钗钏金', '辛亥': '钗钏金',
    '壬子': '桑柘木', '癸丑': '桑柘木', '甲寅': '大溪水', '乙卯': '大溪水',
    '丙辰': '沙中土', '丁巳': '沙中土', '戊午': '天上火', '己未': '天上火',
    '庚申': '石榴木', '辛酉': '石榴木', '壬戌': '大海水', '癸亥': '大海水'
  };
  function naYinOf(gan, zhi) { return NAYIN[gan + zhi] || '未知'; }

  // 月柱起始"节"与对应月支（寅月起立春）
  const JIE = [
    ['立春', '寅'], ['惊蛰', '卯'], ['清明', '辰'], ['立夏', '巳'],
    ['芒种', '午'], ['夏至', '未'], ['立秋', '申'], ['白露', '酉'],
    ['寒露', '戌'], ['立冬', '亥'], ['大雪', '子'], ['小寒', '丑']
  ];
  // 五虎遁：年干 → 寅月天干序号
  const WUHU_DUN = { 甲: 2, 己: 2, 乙: 4, 庚: 4, 丙: 6, 辛: 6, 丁: 8, 壬: 8, 戊: 0, 癸: 0 };
  // 五鼠遁：日干 → 子时天干序号（日上起时）
  const WUZI_DUN = { 甲: 0, 己: 0, 乙: 2, 庚: 2, 丙: 4, 辛: 4, 丁: 6, 壬: 6, 戊: 8, 癸: 8 };
  function timeGanZhi(dayGan, zhi) {
    const start = WUZI_DUN[dayGan];
    const idx = ZHI.indexOf(zhi);
    return { gan: GAN[(start + idx) % 10], zhi };
  }

  // ---- 日柱：独立儒略日公式自算（不依赖 lunar 的 getDayInGanZhi，后者存在跨年偏移 bug）----
  // 整数儒略日数（Meeus 公式，Gregorian 历）
  function jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12);
    const yy = y + 4800 - a;
    const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
      + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  // 标定常数 C = 49：经 1995-6-15=丁丑、2008-8-8=庚辰、2024-2-10=甲辰、2000-1-1=戊午 四组权威万年历交叉验证
  const DAY_C = 49;
  function solarDayGZ(y, m, d) {
    const n = (((jdn(y, m, d) + DAY_C) % 60) + 60) % 60;
    return { gan: GAN[n % 10], zhi: ZHI[n % 12] };
  }
  // 用 Date 自动归一化跨月/跨年（晚子时取次日日柱）
  function dayGZOf(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return solarDayGZ(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function getJieList(y) {
    const L = Lunar.fromYmdHms(y, 1, 1, 0, 0, 0);
    const tbl = L.getJieQiTable();
    if (!tbl) return [];
    const list = [];
    JIE.forEach(([name, zhi]) => {
      const s = tbl[name];
      if (s && typeof s.getYear === 'function') {
        list.push({ ymd: s.getYear() * 10000 + s.getMonth() * 100 + s.getDay(), zhi });
      }
    });
    return list;
  }

  // 节气为界求月支
  function monthZhi(birthYmd, y) {
    let all = [];
    [y - 1, y, y + 1].forEach(yy => { all = all.concat(getJieList(yy)); });
    all.sort((a, b) => a.ymd - b.ymd);
    let zhi = '丑';
    for (let i = 0; i < all.length; i++) {
      if (all[i].ymd <= birthYmd) zhi = all[i].zhi;
      else break;
    }
    return zhi;
  }

  // 立春为界求年干支（八字年）
  function yearGanZhi(y, m, d) {
    const L = Lunar.fromYmdHms(y, 1, 1, 0, 0, 0);
    const tbl = L.getJieQiTable();
    const lc = tbl && tbl['立春'];
    const lcmd = lc && typeof lc.getYear === 'function'
      ? lc.getYear() * 10000 + lc.getMonth() * 100 + lc.getDay() : y * 10000 + 2 * 100 + 4;
    const bymd = y * 10000 + m * 100 + d;
    const by = bymd >= lcmd ? y : y - 1;
    const g = GAN[(((by - 4) % 10) + 10) % 10];
    const z = ZHI[(((by - 4) % 12) + 12) % 12];
    return { gan: g, zhi: z, year: by };
  }

  // ============================================================
  // 排盘：公历 y/m/d + 时辰名 → 完整命盘对象
  // 年柱按立春换、月柱按节气换（自算），日柱/时柱用 lunar（已验证准确）
  // ============================================================
  function parseBazi(y, m, d, shichen) {
    if (!Lunar) throw new Error('lunar 库未加载');
    const birthYmd = y * 10000 + m * 100 + d;
    const isLateZi = (shichen === '晚子'); // 23:00–23:59 晚子时，日柱归次日

    // 年柱（立春为界）
    const yGZ = yearGanZhi(y, m, d);
    // 月柱（节气为界 + 五虎遁）
    const mZhi = monthZhi(birthYmd, y);
    const baseGanIdx = WUHU_DUN[yGZ.gan];
    const mIdx = ((ZHI.indexOf(mZhi) - ZHI.indexOf('寅')) + 12) % 12;
    const mGan = GAN[(baseGanIdx + mIdx) % 10];

    // 日柱：独立儒略日公式自算（避开 lunar 跨年偏移 bug）；晚子时归次日
    const dayGZ = isLateZi ? dayGZOf(y, m, d + 1) : dayGZOf(y, m, d);
    // 时柱：五鼠遁（日上起时）；晚子时支仍为"子"
    const timeZhi = isLateZi ? '子' : shichen;
    const timeGZ = timeGanZhi(dayGZ.gan, timeZhi);

    const gzArr = [
      { label: '年', gan: yGZ.gan, zhi: yGZ.zhi },
      { label: '月', gan: mGan, zhi: mZhi },
      { label: '日', gan: dayGZ.gan, zhi: dayGZ.zhi },
      { label: '时', gan: timeGZ.gan, zhi: timeGZ.zhi }
    ];
    const pillars = gzArr.map(p => ({
      label: p.label, gan: p.gan, zhi: p.zhi,
      ganWX: GAN_WUXING[p.gan],
      zhiWX: ZHI_WUXING[p.zhi],
      naYin: naYinOf(p.gan, p.zhi),
      naYinWX: naYinElement(naYinOf(p.gan, p.zhi))
    }));

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

    // 1) 生肖默契 (max 12)
    dims.zodiac = scoreZodiac(a, b);
    // 2) 五行互补 (max 22)
    dims.wuxing = scoreWuxing(a, b);
    // 3) 性格相合 / 天干 (max 14)
    dims.gan = scoreGan(a, b);
    // 4) 地支互动 (max 22)
    dims.zhi = scoreZhi(a, b);
    // 5) 缘分根基 / 年柱纳音 (max 11)
    dims.fate = scoreFate(a, b);
    // 6) 用神互补（命理核心，max 19）
    dims.yongshen = scoreYongShen(a, b);

    const maxTotal = 12 + 22 + 14 + 22 + 11 + 19; // 100
    const total = Math.round(dims.zodiac.score + dims.wuxing.score + dims.gan.score + dims.zhi.score + dims.fate.score + dims.yongshen.score);

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
      score = 12; label = '天作六合';
      text = `生肖${a.zodiac}与${b.zodiac}为「六合」——这是十二地支里最深的投缘。你们几乎不需刻意经营，气场自会替你们说话：一起吃饭、逛街、说些有的没的都顺得不得了；即便相对无言也不尴尬，因为彼此的频率本就同频。这种默契像呼吸一样自然，是旁人羡慕不来的合拍。`;
    } else if (inSameSanHe(za, zb)) {
      score = 10; label = '三合助力';
      text = `生肖${a.zodiac}与${b.zodiac}同落「三合」局，气场互相托举。相处里你们像被同一股运势推着走，做事容易成、说话容易懂；哪怕各自忙一阵， reconnect 时也毫无隔阂。这样的组合适合一起做长期的事，越养越厚。`;
    } else if (isLiuChong(za, zb)) {
      score = 2; label = '六冲相激';
      text = `生肖${a.zodiac}与${b.zodiac}「六冲」，节奏与频率常对撞。你们需要更多包容与沟通——不是不能好，而是得有人主动放缓脚步等对方。争执时记得先各退半步，化火药为火花。`;
    } else if (isSanXing(za, zb)) {
      score = 3; label = '略有刑克';
      text = `生肖${a.zodiac}与${b.zodiac}存在「相刑」，细节上易有摩擦。某些旧账或心结容易被勾起，建议有事敞开说、别憋着；磨合顺了，这点刑克反倒成了关系的“记忆点”。`;
    } else if (isLiuHai(za, zb)) {
      score = 5; label = '六害牵绊';
      text = `生肖${a.zodiac}与${b.zodiac}「六害」，缘分中带着牵绊。你们需要更用心经营才不会渐行渐远——多制造共同经历、少留冷战的空白，感情就有锚点。`;
    } else {
      score = 8; label = '平淡相安';
      text = `生肖${a.zodiac}与${b.zodiac}无特殊合冲，相处平稳自然。感情靠日常点滴慢慢累积：一顿饭、一段话、一次并肩，都能把平淡熬出甜味。`;
    }
    return { score, max: 12, label, text };
  }

  function scoreWuxing(a, b) {
    const dmA = a.dayMasterWX, dmB = b.dayMasterWX;
    let base, relLabel;
    if (dmA === dmB) { base = 14; relLabel = '比和（同气）'; }
    else if (SHENG[dmA] === dmB || SHENG[dmB] === dmA) { base = 18; relLabel = '相生（互滋）'; }
    else { base = 8; relLabel = '相克（相制）'; }

    const union = new Set([...a.distinctElements, ...b.distinctElements]);
    let covBonus = union.size >= 5 ? 4 : union.size === 4 ? 3 : union.size === 3 ? 1 : 0;

    const score = Math.min(22, base + covBonus);
    let text;
    if (relLabel.startsWith('相生')) {
      text = `日主${dmA}与${dmB}五行相生，彼此滋养、互相成全。一个给力、一个承接，关系里有流动感——你付出时对方恰好接住，像水润土、木生火般自然。日常里少有“对牛弹琴”的错位，聊什么都能接得住。`;
    } else if (relLabel.startsWith('比和')) {
      text = `日主同为${dmA}，气质相近、同频共振，像照镜子。你们太懂彼此的梗，却也少点互补的新鲜感——建议刻意留一点各自的小世界，让相似里长出变化。`;
    } else {
      text = `日主${dmA}克${dmB}（或反之），存在张力与拉扯，是“欢喜冤家”型。磨合好了很带劲：一个愿给、一个愿接，火花里藏着成长；磨不好则易成内耗，得有人主动松手。`;
    }
    if (union.size >= 5) text += ' 两人五行齐全、气场互补，刚柔并济，几乎不挑相处场景。';
    else if (union.size <= 3) text += ' 注意彼此五行偏枯，可多接触所缺元素的环境与人事（如木多喜火，便多些热闹光亮）来调和。';
    return { score, max: 22, label: relLabel, text };
  }

  function scoreGan(a, b) {
    const dmA = a.dayMaster, dmB = b.dayMaster;
    let score, label, text;
    if (isGanHe(dmA, dmB)) {
      score = 14; label = '天干五合';
      text = `日干${dmA}与${dmB}构成「天干五合」，这是极深的吸引与羁绊，像被一根无形的红绳系住。你们之间有一种“说不清但就是合”的默契，分开时念着、聚着时黏着，是旁人羡慕的良缘底色。`;
    } else {
      const r = relWX(dmA, dmB);
      let base = r === '生' ? 11 : r === '比和' ? 9 : 6;
      // 任意天干五合
      let anyHe = false;
      a.pillars.forEach(pa => b.pillars.forEach(pb => { if (isGanHe(pa.gan, pb.gan)) anyHe = true; }));
      if (anyHe) base = Math.min(14, base + 3);
      score = base;
      label = r === '生' ? '天干相生' : r === '比和' ? '天干同气' : '天干相制';
      text = anyHe
        ? `除日干外，命盘中另有天干「五合」，暗中又添一层默契与缘分厚度——你们的关系不只表面合拍，骨子里也连着线。`
        : (r === '生'
          ? `天干${dmA}生${dmB}，你倾向于付出与照顾，关系里你是温柔的那一方。你的好意常被接住，付出不至于落空。`
          : r === '比和'
            ? `天干同气，思维方式接近，聊得来也懂彼此的梗。你们像两座并排的灯塔，各自发光也不刺眼。`
            : `天干相制，观点常碰撞，但正是这种火花让相处不无聊。吵完往往更懂，是"越磨越合"的那类。`);
    }
    return { score, max: 14, label, text };
  }

  function scoreZhi(a, b) {
    const za = a.pillars.map(p => p.zhi);
    const zb = b.pillars.map(p => p.zhi);
    let s = 10;
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
    s = Math.max(0, Math.min(22, s));

    let label, text;
    if (found.chong === 0 && found.he >= 1) { label = '地支多合'; text = `地支中出现了${found.he}组六合，几乎没有冲克，相处顺滑、让人安心。你们像被无形的手轻轻拢在一起，少有突如其来的别扭。`; }
    else if (found.chong >= 2) { label = '地支多冲'; text = `地支出现${found.chong}组六冲，生活里易有突如其来的变动与争执。别慌，给彼此留白、定好节奏，冲突也能化成张力。`; }
    else if (found.he === 0 && found.chong === 0 && found.sanhe > 0) { label = '三合聚气'; text = `地支三合汇聚，贵人多、气场合，一起做事容易成。你们像被同一阵风推着走，协作起来格外顺。`; }
    else if (found.xing > 0) { label = '地支带刑'; text = `地支存在相刑，某些心结或旧账容易被勾起。建议有事敞开说，别让小摩擦积成墙。`; }
    else { label = '地支平稳'; text = `地支互动平和，没有强烈吸引也没有明显冲突，是细水长流的类型。日常里安稳，却也少点惊艳。`; }
    if (found.sanhe > 0) text += `（含${found.sanhe}处三合助力，贵气更足）`;

    return { score: s, max: 22, label, text, found };
  }

  function scoreFate(a, b) {
    const na = a.pillars[0].naYinWX, nb = b.pillars[0].naYinWX;
    let score, label, text;
    if (na === nb) { score = 9; label = '纳音同音'; text = `年柱纳音同为「${na}」，根基同频，家庭背景或价值观容易相近。`; }
    else if (SHENG[na] === nb || SHENG[nb] === na) { score = 11; label = '纳音相生'; text = `年柱纳音${na}与${nb}相生，前世缘分厚、家世气场互相增益，是「带缘而来」的组合。`; }
    else { score = 6; label = '纳音相成'; text = `年柱纳音${na}与${nb}相制，缘分需要后天经营，磨合出专属的相处节奏。`; }
    return { score, max: 11, label, text };
  }

  // 用神互补：命理合婚核心——你喜用、所缺的，恰是对方旺而能给你的
  function scoreYongShen(a, b) {
    const xiA = personDeep(a).xi, xiB = personDeep(b).xi;
    const supply = (p, needs) => {
      if (!needs.length) return { cov: 1, clash: 0 };
      let hit = 0, clash = 0;
      needs.forEach(e => {
        const c = (p.elementCounts && p.elementCounts[e]) || 0;
        if (c >= 2 || e === p.dayMasterWX) hit++;            // 对方旺而能补，或日主透出
        else if (KE[p.dayMasterWX] === e && c < 2) clash++;  // 对方日主克制我所需且无气
      });
      return { cov: hit / needs.length, clash: clash / needs.length };
    };
    const sa = supply(b, xiA), sb = supply(a, xiB);
    let raw = (sa.cov + sb.cov) / 2 - 0.5 * (sa.clash + sb.clash) / 2;
    raw = Math.max(0, Math.min(1, raw));
    const score = Math.max(2, Math.round(raw * 19));
    let label, text;
    if (raw >= 0.8) { label = '用神相济'; text = `你俩喜用神恰好互补——你偏弱、所缺的，正是对方旺而能给你的。这种"刚好补上"的缘分最养人，久处不厌。`; }
    else if (raw >= 0.5) { label = '用神相扶'; text = `双方喜用神大体互补，能互相托住彼此短板；偶有错位也正常，多些包容就把差异酿成默契。`; }
    else if (raw >= 0.25) { label = '用神参半'; text = `喜用神互补程度一般，部分需求对方给得上、部分得自己消化。关系里留点各自成长的空间反而更健康。`; }
    else { label = '用神相背'; text = `双方喜用神互补较弱，你需要的对方恰偏弱，相处中可能偶尔觉得"接不住"。正因不同，才更需要彼此成全。`; }
    return { score, max: 19, label, text };
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
      { key: 'fate', name: '缘分根基', icon: '🔮', ...dims.fate },
      { key: 'yongshen', name: '用神互补', icon: '🔗', ...dims.yongshen }
    ];
  }

  // ============================================================
  // 深度报告（付费解锁内容）— 纯娱乐文案扩展
  // ============================================================
  function personDeep(p) {
    const wx = p.dayMasterWX;
    const cnt = p.elementCounts[wx];
    const shengWX = WUXING.find(w => SHENG[w] === wx); // 生我者（印）
    let strength;
    if (cnt >= 3) strength = '偏旺';
    else if (cnt === 2) strength = '中和';
    else strength = '偏弱';
    let xi;
    if (cnt >= 3) {
      xi = [WUXING.find(w => KE[wx] === w), SHENG[wx], WUXING.find(w => KE[w] === wx)]; // 克、泄、耗
    } else {
      xi = [wx, shengWX]; // 同、生
    }
    const xiDesc = '喜' + xi.join('、') + '为用';
    // 性格深度：结合强弱给一句
    let tone;
    if (strength === '偏旺') tone = '更有主见、能扛事，但偶尔要学着示弱与倾听';
    else if (strength === '偏弱') tone = '更需被托住、被理解，温柔里有韧性';
    else tone = '状态平稳、好相处，情绪相对稳定';
    return { strength, xi, xiDesc, tone };
  }

  function timelineOf(total) {
    if (total >= 70) return [
      { stage: '初识', tip: '一拍即合，趁热打铁多制造共同回忆。' },
      { stage: '磨合', tip: '少争对错、多问感受，关系会越养越厚。' },
      { stage: '长久', tip: '适合一起规划未来（同居 / 旅行 / 事业），把缘分落进生活。' }
    ];
    if (total >= 55) return [
      { stage: '初识', tip: '慢热但稳，给彼此多一点靠近的时间。' },
      { stage: '磨合', tip: '把小情绪说出口，别攒成心结。' },
      { stage: '长久', tip: '固定一些只属于两人的小仪式，感情有锚点。' }
    ];
    if (total >= 40) return [
      { stage: '初识', tip: '火花足但也易擦枪走火，先当朋友摸清脾气。' },
      { stage: '磨合', tip: '争执时各退十分钟，把"讲赢"换成"懂你"。' },
      { stage: '长久', tip: '找共同爱好当缓冲带，摩擦也能变成情趣。' }
    ];
    return [
      { stage: '初识', tip: '缘分浅，不强求，当段舒服的相遇就好。' },
      { stage: '磨合', tip: '差异大时少评判、多好奇，反而能互相学到东西。' },
      { stage: '长久', tip: '顺其自然，经营得好也能日久生情。' }
    ];
  }

  function deepReport(a, b, res) {
    const pa = personDeep(a), pb = personDeep(b);

    // 桃花专项
    const peach = (p) => p.pillars.some(pl => ['子', '午', '卯', '酉'].includes(pl.zhi));
    const taohua = (peach(a) && peach(b))
      ? '双方命带桃花，这组关系里吸引力与心动感都很足，记得把这份火花用在彼此身上。'
      : (peach(a) || peach(b))
        ? '你们之中有一方桃花较旺，会把更多浪漫与关注带进关系，另一方安心接住就好。'
        : '桃花平稳，你们的感情更偏向日久生情、细水长流，越了解越上头。';

    // 财运专项（我克者为财）
    const caiWXa = KE[a.dayMasterWX], caiWXb = KE[b.dayMasterWX];
    const caiSum = a.elementCounts[caiWXa] + b.elementCounts[caiWXb];
    const wealth = caiSum >= 3
      ? '财星两旺，一起规划小事业或共同储蓄会很合拍，钱的事聊开了反而更亲密。'
      : caiSum === 2
        ? '财星各一位，求财风格互补——一个敢想、一个稳健，搭伙正好。'
        : '财星偏弱，对钱都偏随性，建议在关系里设一两个共同小目标，感情有锚点。';

    // 事业专项
    const zhiLabel = res.dimensions.zhi.label;
    const career = (zhiLabel.includes('合') || zhiLabel.includes('三合'))
      ? '事业上你们能互相搭台，一个出主意、一个落地，组合战斗力很强。'
      : zhiLabel.includes('冲')
        ? '事业上观点易碰撞，但正因为互补，定好分工反而能把事做成。'
        : '事业上节奏接近，一起做点什么会很合拍，关键是把角色分清楚。';

    // 深度长文
    const deep = `${a.zodiac}与${b.zodiac}的组合，${res.summary} `
      + `从命格看，A 方日主${a.dayMaster}（${pa.strength}，${pa.xiDesc}），B 方日主${b.dayMaster}（${pb.strength}，${pb.xiDesc}）——`
      + `一个${pa.tone}，一个${pb.tone}。`
      + `你们的相处底色由生肖「${res.dimensions.zodiac.label}」、五行「${res.dimensions.wuxing.label}」、天干「${res.dimensions.gan.label}」共同织成；`
      + `年柱「${res.dimensions.fate.label}」则决定了这份缘分的深浅与经营方式。`;

    // 五行调和指南
    const unionWX = new Set([...a.distinctElements, ...b.distinctElements]);
    const missingWX = WUXING.filter(w => !unionWX.has(w));
    const map = { 木: '多接触绿植、森林、木质家具，穿青绿色衣物', 火: '多晒太阳、点香薰蜡烛，穿红橙色系', 土: '布置温馨的居家环境，穿米黄、棕色系', 金: '保持空间整洁、佩戴金属小物，穿白金色系', 水: '多近水边、养鱼或听流水声，穿黑蓝色系' };
    const tune = missingWX.length
      ? '两人五行偏缺' + missingWX.join('、') + '，可在生活中多补：' + missingWX.map(w => map[w]).join('；') + '。'
      : '两人五行齐全，气场相对平衡，相处中多保持自然即可。';

    // 相处禁忌
    const taboo = [];
    if (res.dimensions.zhi.label.includes('多冲')) taboo.push('避免在情绪激动时争论对错，先各自冷静再沟通。');
    if (res.dimensions.wuxing.label.includes('相克')) taboo.push('不要试图改变对方的本性，学会欣赏差异。');
    if (res.dimensions.gan.label.includes('相制')) taboo.push('意见不合时少用反问句，多用“我理解你”开头。');
    if (!taboo.length) taboo.push('你们的气场相对温和，最大的禁忌是“想当然”——再合也要记得表达爱意。');

    return {
      personA: { ...pa },
      personB: { ...pb },
      taohua, wealth, career,
      deep,
      tune,
      taboo,
      timeline: timelineOf(res.total)
    };
  }

  // ---- 暴露接口 ----
  const API = {
    parseBazi, analyzeCompat, deepReport,
    GAN, ZHI, WUXING, GAN_WUXING, ZHI_WUXING, WX_COLOR, ZHI_ANIMAL, SHICHEN_HOUR,
    isLiuHe, isLiuChong, isGanHe, inSameSanHe, relWX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BaziEngine = API;

})(typeof window !== 'undefined' ? window : this);
