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
      birthYear: y,
      birthMonth: m,
      birthDay: d,
      naYin: pillars.map(p => p.naYin)
    };
  }

  // —— 双人称呼：两人同生肖时不再都叫「×方」，改用日主/年/月日区分，避免混淆 ——
  // 返回 [称呼A, 称呼B]，保证两者不同；只在必要时才加限定，尽量保持简洁。
  function pairNames(a, b) {
    const baseA = a.zodiac, baseB = b.zodiac;
    if (baseA !== baseB) return [baseA + '方', baseB + '方'];
    // 同生肖：先用日主天干区分（如「壬方」「甲方」）
    if (a.dayMaster !== b.dayMaster) return [a.dayMaster + '方', b.dayMaster + '方'];
    // 同生肖同日主：用出生年份后两位（如「94方」「98方」）
    const ya = String(a.birthYear || '').slice(-2), yb = String(b.birthYear || '').slice(-2);
    if (ya !== yb) return [ya + '方', yb + '方'];
    // 连年份都一样：用月日（如「0615方」「0308方」）
    const ma = String(a.birthMonth || '').padStart(2, '0') + String(a.birthDay || '').padStart(2, '0');
    const mb = String(b.birthMonth || '').padStart(2, '0') + String(b.birthDay || '').padStart(2, '0');
    if (ma !== mb) return [ma + '方', mb + '方'];
    // 极端：同一天生日不同时辰，直接用「先 / 后」区分
    return ['先到方', '后到方'];
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
    // 同生肖时不再写「生肖×与×」，改写成同属的表达
    const sameZodiac = a.zodiac === b.zodiac;
    const zPair = sameZodiac ? `你俩同属${a.zodiac}` : `生肖${a.zodiac}与${b.zodiac}`;
    let score, label, text;
    if (isLiuHe(za, zb)) {
      score = 12; label = '天作六合';
      text = `${zPair}为「六合」——这是十二地支里最深的投缘。你们几乎不需刻意经营，气场自会替你们说话：一起吃饭、逛街、说些有的没的都顺得不得了；即便相对无言也不尴尬，因为彼此的频率本就同频。这种默契像呼吸一样自然，是旁人羡慕不来的合拍。`;
    } else if (inSameSanHe(za, zb)) {
      score = 10; label = '三合助力';
      text = `${zPair}同落「三合」局，气场互相托举。相处里你们像被同一股运势推着走，做事容易成、说话容易懂；哪怕各自忙一阵， reconnect 时也毫无隔阂。这样的组合适合一起做长期的事，越养越厚。`;
    } else if (isLiuChong(za, zb)) {
      score = 2; label = '六冲相激';
      text = `${zPair}「六冲」，节奏与频率常对撞。你们需要更多包容与沟通——不是不能好，而是得有人主动放缓脚步等对方。争执时记得先各退半步，化火药为火花。`;
    } else if (isSanXing(za, zb)) {
      score = 3; label = '略有刑克';
      text = `${zPair}存在「相刑」，细节上易有摩擦。某些旧账或心结容易被勾起，建议有事敞开说、别憋着；磨合顺了，这点刑克反倒成了关系的“记忆点”。`;
    } else if (isLiuHai(za, zb)) {
      score = 5; label = '六害牵绊';
      text = `${zPair}「六害」，缘分中带着牵绊。你们需要更用心经营才不会渐行渐远——多制造共同经历、少留冷战的空白，感情就有锚点。`;
    } else {
      score = 8; label = '平淡相安';
      text = sameZodiac
        ? `你俩同属${a.zodiac}，属相上既不相冲也不相合，相处平稳自然——少了戏剧化的牵引，反倒靠日常点滴慢慢累积：一顿饭、一段话、一次并肩，都能把平淡熬出甜味。`
        : `生肖${a.zodiac}与${b.zodiac}无特殊合冲，相处平稳自然。感情靠日常点滴慢慢累积：一顿饭、一段话、一次并肩，都能把平淡熬出甜味。`;
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
    const found = { he: 0, chong: 0, hai: 0, po: 0, xing: 0, sanhe: 0 };
    za.forEach(x => {
      zb.forEach(y => {
        if (isLiuHe(x, y)) found.he++;
        else if (isLiuChong(x, y)) found.chong++;
        else if (isLiuHai(x, y)) found.hai++;
        else if (isLiuPo(x, y)) found.po++;
        else if (isSanXing(x, y)) found.xing++;
      });
      // 三合组成员重叠
      SAN_HE.forEach(g => {
        if (g.includes(x) && zb.some(y => g.includes(y))) found.sanhe++;
      });
    });
    // 两人各 4 地支两两比对共 16 组，逐组全额扣分会让冲一多就跌破地板。
    // 改为：抬高基准 + 降低单组扣分 + 底部保护，保留「冲多分低、合多分高」的排序，
    // 但不让这个高权重维度对大多数人恒定输出 0 分而失去区分度。
    const plus = found.he * 5 + Math.min(8, found.sanhe * 2);
    // 用整数权重，避免 3.2/2.2/1.6 产生 10.8、8.599999... 这类浮点长串显示在维度分数里。
    // 乘 5 后取整再除 5，等价保留原来扣分力度，但对外始终是最多一位小数；
    // 这里进一步四舍五入为整数，六个维度统一显示成干净的 n/max。
    const minus = found.chong * 3 + found.xing * 2 + found.hai * 2 + found.po * 1;
    let s = 14 + plus - minus;
    s = Math.round(Math.max(5, Math.min(22, s)));

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
  // 多维性格画像：把日主、十神倾向、季节、桃花、强弱、阴阳组合起来，
  // 从 6 个角度生成不重复的文案。同一命盘结果稳定可复现，不同命盘差异大。
  // 只谈性格与相处方式，不涉及性取向判断。
  // ============================================================
  function _hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function _pick(seed, arr) { return arr && arr.length ? arr[_hash(seed) % arr.length] : ''; }

  // 十神倾向：以日主为中心，统计其余七个字（三个天干 + 四个地支主气）
  function _godOf(dm, other) {
    if (dm === other) return '比劫';
    if (SHENG[other] === dm) return '印';
    if (SHENG[dm] === other) return '食伤';
    if (KE[dm] === other) return '财';
    return '官杀';
  }
  function tenGods(p) {
    const dm = p.dayMasterWX;
    const c = { 比劫: 0, 印: 0, 食伤: 0, 财: 0, 官杀: 0 };
    p.pillars.forEach((pl, i) => {
      if (i !== 2) c[_godOf(dm, pl.ganWX)]++; // 年、月、时三个天干
      c[_godOf(dm, pl.zhiWX)]++;              // 四个地支主气
    });
    let top = '比劫';
    Object.keys(c).forEach(k => { if (c[k] > c[top]) top = k; });
    return { counts: c, top };
  }
  function seasonOf(p) {
    const z = p.pillars[1].zhi;
    if ('寅卯辰'.indexOf(z) >= 0) return '春';
    if ('巳午未'.indexOf(z) >= 0) return '夏';
    if ('申酉戌'.indexOf(z) >= 0) return '秋';
    return '冬';
  }
  function peachOf(p) { return p.pillars.filter(pl => '子午卯酉'.indexOf(pl.zhi) >= 0).length; }

  const PERSONA_FACETS = {
    // 初见印象：按十神主导
    first: {
      比劫: ['第一印象是「有主见、不好糊弄」，往那儿一站在那儿自带气场，说话不绕弯；熟了才知道她其实挺护短。',
             '初见带点锋芒，答话干脆利落，既不迎合也不冷场；越是这样的人，越把温柔留给已经认定的那几个。'],
      印: ['初见安静温和，眼神里带一点观察的距离感；一旦把你放进心里，照顾就藏在记你口味、替你操心这些细节里。',
           '第一眼是「淡淡的、很好说话」，其实她心里有一套自己的节奏，靠时间和真诚才能慢慢走近。'],
      食伤: ['一见就亮，话多、有趣、反应飞快，跟她在一起几乎不会冷场；偶尔冒失的玩笑别往心里去，那是她的亲昵。',
             '初见就带着股机灵劲儿，想法一个接一个，被她逗笑是常态；她用热闹掩饰敏感，懂的人会觉得格外可爱。'],
      财: ['初见务实又利落，见面先把安排做得妥妥当当；她的好感往往藏在「我已经帮你搞定了」这句话里。',
           '第一印象是靠谱、能干、不拖泥带水；她不太说漂亮话，但答应过的事一定会做到。'],
      官杀: ['自带分寸感，规矩、克制、不轻易亲近；可正因为慢热，那份给你的信任才格外珍贵。',
             '初见有礼貌、有距离，不轻易敞开心；一旦她在你面前放松下来，会露出很柔软的一面。']
    },
    // 内心真正想要的：按十神主导
    drive: {
      比劫: ['她真正想要的，是被当成「能扛事的对手」而不是被保护的对象——被尊重、被平等对待，比被哄更让她心动。',
             '她骨子里要的是自主和并肩：一起做决定、一起解决问题，比全程被照顾更让她觉得被看重。'],
      印: ['她要的是被稳稳接住的安全感——不是轰轰烈烈，而是你记得她说过的话、在她累时不追问、只安静陪着。',
           '她渴望一种「不必解释也被懂」的踏实，被信任、被包容的时候，她会给出加倍的温柔。'],
      食伤: ['她要的是被欣赏、被回应——你认真看她分享的东西、接住她抛来的梗，比送什么礼物都有效。',
             '她最怕被敷衍，最吃「你懂我这个点」；一个走心的回应，就能让她记住很久很久。'],
      财: ['她要的是确定和实在——说到做到、计划能落地，她对空口承诺天生免疫，行动才是她的语言。',
           '她在意的是日子过得踏实：稳定的节奏、看得见的成果，比一时的甜言更能让她安心。'],
      官杀: ['她要的是边界和分寸——不被逼问、不被催促，慢慢来反而让她更愿意主动靠近。',
             '她看重承诺与态度，也看重你待人的分寸；被认真对待、被给足空间，是她放下防备的前提。']
    },
    // 压力下的样子：按强弱 + 阴阳
    stress: {
      偏旺阳: ['压力一来她会变得更「硬」，嘴上说没事其实在一个人扛；这时候别追问，安静陪着就好。',
               '越累越要强，习惯先把事情揽下来；你要做的是帮她分担具体的活，而不是反复问她还好吗。'],
      偏旺阴: ['表面照常，心里已经拉起了警戒线；一次没被接住的委屈，可能攒成很久的沉默，别等它发酵。',
               '她不太会当场发作，却会默默扣分；发现她变安静时，主动问一句「是不是我哪里没做好」很管用。'],
      偏弱阳: ['她会突然抽离、变沉默，像是把自己关起来充电；给她时间，比急着安慰有用得多。',
               '累了就想一个人待着整理情绪，不是针对你；等她缓过来，会自己回来找你。'],
      偏弱阴: ['容易往心里去，一句无心的话能反刍很久；这时候一个明确的「我在」比讲道理管用一百倍。',
               '情绪来得细密又绵长，别用「你想多了」打发；抱一下、说清「我不是那个意思」，比什么都强。'],
      中和: ['情绪像过山车但恢复很快，吵完能自己消化大半；你只要别在同一件事上翻旧账就好。',
              '她的弹性很好，起伏过后总能自己回稳；做她身边那个不添乱的人，就是最好的支持。']
    },
    // 她想要的被爱方式：按日主五行
    love: {
      木: ['她需要的爱是给空间——别把日程排满，留一块能让她自己折腾的自留地，她反而会更黏你。',
           '对她而言，最好的爱是「我支持你长成你想要的样」，而不是替她规划好每一步。'],
      火: ['她需要的爱是有回应——消息别晾太久，一个认真的注视比敷衍的「嗯嗯」暖得多。',
           '她的热情需要被看见，你哪怕只回一句「我在意」，都能让她亮起来。'],
      土: ['她需要的爱是确定感——计划别临时改，说到做到，是她衡量你有多在乎的尺子。',
           '稳定、可预期、有担当，这些朴素的东西最能打动她，花言巧语反而让她犯疑。'],
      金: ['她需要的爱是被尊重边界——别用「我是为你好」替她做决定，先问一句比直接安排更贴心。',
           '她看重承诺和原则，答应的事请做到；被认真对待时，她会卸下那层硬壳。'],
      水: ['她需要的爱是别被框死——留点弹性和留白，她会用更多的亲密来回报这份信任。',
           '她像水，你越想抓紧越留不住；给她自由流动的空间，她反而会一直流回你身边。']
    },
    // 不为人知的反差：按桃花数量 + 阴阳
    contrast: {
      多阳: ['别人以为她游刃有余，其实真遇到心动的人会笨拙得可爱——反差就藏在「会撩」和「认真」之间。',
             '在外表现得大方得体，回到喜欢的人面前却会突然害羞，这份反差是她最真实的地方。'],
      多阴: ['看着淡淡的、不太好接近，熟了才知道她心里有很柔软的一面，只是不轻易示人。',
             '外表清冷，内里细腻；能让她主动撒娇的人，一定是她认定了很久的人。'],
      少阳: ['外表独立得很，其实很吃「被坚定选择」这一套，认定了就会默默把对方放在第一位。',
             '看着什么都不需要，其实特别珍惜那个让她可以放心依靠的人，只是嘴上不说。'],
      少阴: ['慢热又慢热，可一旦把你划进「自己人」，那份话多和黏人会让身边人吓一跳。',
             '在外人面前安静得几乎没存在感，只有在你面前，她才会露出孩子气的一面。']
    },
    // 相处节奏：按出生季节
    season: {
      春: ['像刚抽芽的枝条，兴致来得快、也愿意试新东西；顺着她的好奇走，关系长得最稳。',
           '带着春天的生发劲，愿意一起规划将来；给她足够的成长空间，这段关系会越长越密。'],
      夏: ['热度高、表达直接，情绪都写在脸上；配一个能接住她热情、又不被烧到的人最好。',
           '喜欢就全情投入，爱恨分明；别泼冷水，你的回应就是她持续发光的燃料。'],
      秋: ['清爽有分寸，喜欢把关系理清楚再往前走；推进太快反而让她退后半步。',
           '秋天生的她更看重质感，宁可慢一点也要对；给她确定的节奏，她会回以长久的稳定。'],
      冬: ['慢热、内敛，靠时间和细节积累信任；一旦认定，是那种默默守很久的人。',
           '她的温度是慢慢释放的，别急着敲开；熬过那段沉默，你会得到一个极可靠的人。']
    }
  };

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
    const xiWhy = strength === '偏旺'
      ? `命局里「${wx}」气偏重（四柱中出现 ${cnt} 次），宜用克、泄、耗把过旺的能量疏散开，反而更从容；`
      : `命局里「${wx}」气偏轻（四柱中出现 ${cnt} 次），宜用同类与生我者扶一把，被托住时状态最好。`;
    // 性格底色：按「十神倾向 + 阴阳」组合成 10 类短句，比旧的强弱三档差异更大
    const toneMap = {
      比劫阳: '独立好胜、说一不二，认准的事谁也拦不住，心里最看重被平等对待',
      比劫阴: '外柔内刚、不肯服输，表面随和，心里自有一套不轻易让步的主张',
      印阳:   '心软又有担当、爱操心，把照顾身边人当成本能，被信任时最踏实',
      印阴:   '细腻念旧、想得深，情绪都藏在心里，被认真对待时会格外柔软',
      食伤阳: '开朗有才气、爱表达，藏不住情绪也藏不住喜欢，靠感染力温暖人',
      食伤阴: '灵秀敏感、点子多，用热闹掩饰着细腻，最吃「你懂我」这一套',
      财阳:   '务实果断、行动力强，认定了就干脆利落地投入，用做事表达在乎',
      财阴:   '精打细算、心思活络，把日子过得妥帖实在，答应的事一定做到',
      官杀阳: '自律要强、讲原则，对自己比对谁都严格，慢热但极可靠',
      官杀阴: '克制谨慎、重分寸，不轻易敞开心，一旦认定就用情很深'
    };
    const needMap = {
      木: '最需要的是「可以自由生长的空间」，被安排得太满会悄悄收紧',
      火: '最需要的是「被看见、被回应」，冷落比争吵更伤',
      土: '最需要的是「确定感」，临时变卦会让她不安',
      金: '最需要的是「边界被尊重」，答应的事请做到',
      水: '最需要的是「不被框死」，留一点弹性才自在'
    };
    const paceMap = {
      木: '慢热但长情，认定了会一年年往下扎根',
      火: '来得快、热得明显，情绪起伏也写在脸上',
      土: '节奏稳、不轻易变，靠近需要一点耐心',
      金: '干脆利落，喜欢把话说清楚、把事定下来',
      水: '随势而动，忽近忽远其实是在找舒服的距离'
    };

    // —— 多维画像角度 ——
    const tg = tenGods(p);                       // 十神主导倾向
    const season = seasonOf(p);                  // 出生季节（月令）
    const peachN = peachOf(p);                   // 桃花处数
    const yy = p.dayMasterYinYang === '阳' ? '阳' : '阴';
    const stressKey = strength === '中和' ? '中和' : strength + yy;
    const contrastKey = (peachN >= 2 ? '多' : '少') + yy;
    // 稳定种子：用日主 + 年月日时四柱干支拼成，同一命盘永远得到同一组文案
    const seed = p.dayMaster + p.pillars.map(pl => pl.gan + pl.zhi).join('');
    const facets = [
      { k: 'first',    icon: '👀', title: '初见印象',       text: _pick(seed + '|first|' + tg.top, PERSONA_FACETS.first[tg.top]) },
      { k: 'drive',    icon: '💗', title: '内心真正想要的', text: _pick(seed + '|drive|' + tg.top, PERSONA_FACETS.drive[tg.top]) },
      { k: 'stress',   icon: '🌧️', title: '压力下的样子',   text: _pick(seed + '|stress|' + stressKey, PERSONA_FACETS.stress[stressKey]) },
      { k: 'love',     icon: '🫶', title: '想要的被爱方式', text: _pick(seed + '|love|' + wx, PERSONA_FACETS.love[wx]) },
      { k: 'contrast', icon: '🎭', title: '不为人知的反差', text: _pick(seed + '|contrast|' + contrastKey, PERSONA_FACETS.contrast[contrastKey]) },
      { k: 'season',   icon: '🍃', title: '相处节奏',       text: _pick(seed + '|season|' + season, PERSONA_FACETS.season[season]) }
    ];

    return {
      strength, xi, xiDesc, xiWhy,
      tone: toneMap[tg.top + yy] || toneMap[strength],
      need: needMap[wx],
      pace: paceMap[wx],
      gan: p.dayMaster, wx, count: cnt,
      // 多维角度画像
      facets, tenGods: tg.top, season, peachN
    };
  }

  function timelineOf(total) {
    if (total >= 70) return [
      { stage: '初识 · 一见如故', tip: '一拍即合，趁热打铁多制造共同回忆；这阶段的默契是天生的，别刻意去考验它。' },
      { stage: '靠近 · 加速期', tip: '会很快进入「什么都想一起」的状态，记得各留一点自己的朋友圈，关系反而更耐处。' },
      { stage: '磨合 · 首次分歧', tip: '少争对错、多问感受。高分组合最容易栽在「我以为你懂」，把话说明白是必修课。' },
      { stage: '长久 · 落进生活', tip: '适合一起规划未来（同居、旅行、共同储蓄），把缘分从情绪落进日程里，越养越厚。' }
    ];
    if (total >= 55) return [
      { stage: '初识 · 慢慢靠近', tip: '慢热但稳，给彼此多一点靠近的时间；不急着定义关系，反而更容易看清对方。' },
      { stage: '靠近 · 建立习惯', tip: '固定的联系节奏比密集的甜言蜜语更管用，一个小仪式就能把关系稳住。' },
      { stage: '磨合 · 把话说开', tip: '把小情绪及时说出口，别攒成心结；你们的问题不在合不合，而在说不说。' },
      { stage: '长久 · 细水长流', tip: '固定只属于两人的小仪式（周末一顿饭、睡前一段话），感情就有了锚点。' }
    ];
    if (total >= 40) return [
      { stage: '初识 · 火花期', tip: '火花足但也易擦枪走火，先当朋友摸清彼此脾气，别在最上头的时候做决定。' },
      { stage: '靠近 · 找节奏', tip: '一进一退容易互相误会，先约定「忙的时候怎么报备」，比猜心思省力得多。' },
      { stage: '磨合 · 学会暂停', tip: '争执时各退十分钟，把「讲赢」换成「懂你」；你们的张力用好了是火花，用不好才是内耗。' },
      { stage: '长久 · 共同缓冲带', tip: '找一个共同爱好当缓冲带，摩擦也能变成情趣；差异不必消灭，安置好就行。' }
    ];
    return [
      { stage: '初识 · 舒服的相遇', tip: '缘分浅不必强求，当一段舒服的相遇就好；先别急着给关系命名。' },
      { stage: '靠近 · 保持好奇', tip: '差异大时少评判、多好奇，反而能从对方身上学到自己没有的东西。' },
      { stage: '磨合 · 降低期待', tip: '把「她应该懂我」换成「我可以说给她听」，期待一降，相处就松了。' },
      { stage: '长久 · 顺其自然', tip: '顺其自然，经营得好也能日久生情；不合适的节奏，优雅退场也是一种成全。' }
    ];
  }

  // ============================================================
  // 未来三年流年时间轴（付费内容）
  // 依据：流年干支五行 + 双方喜用 + 流年地支与各自日支的刑冲合害。
  // 只给到「年」的趋势主题与相处建议，不预测具体事件；纯娱乐参考。
  // ============================================================
  const FORTUNE_THEME = {
    木: { word: '生长 · 规划', line: '木主生发，这一年的关系关键词是「一起长大」——适合做长远打算、共同养成一个习惯，把关系往更扎实的方向推。' },
    火: { word: '热烈 · 表达', line: '火主明亮，这一年心动感与表达欲都被点亮——适合旅行、约会、把喜欢说出口，感情容易升温。' },
    土: { word: '稳定 · 落地', line: '土主承载，这一年的主题是「落进生活」——适合谈些现实议题（同居、见面家人、共同储蓄），把浪漫过成日常。' },
    金: { word: '收敛 · 决断', line: '金主决断，这一年适合把关系定下来、把模糊变清晰——承诺、边界，与「我们到底是什么」的答案容易浮现。' },
    水: { word: '流动 · 沟通', line: '水主流通，这一年贵在「把话说开」——深度沟通、情绪磨合、化解误会，柔性地把关系带顺。' }
  };

  // 流年地支相对某人日支的关系提示
  function zhiRelation(liunianZhi, dayZhi) {
    if (liunianZhi === dayZhi) return '流年与日支同气，情绪和关系都容易被放大——好事更甜，小事也别钻牛角尖';
    if (isLiuChong(liunianZhi, dayZhi)) return '流年冲动日支，生活里易有变动或情绪起伏，重大决定多留一个缓冲';
    if (isLiuHe(liunianZhi, dayZhi)) return '流年六合日支，人缘与感情都有推动，适合主动靠近';
    if (isLiuPo(liunianZhi, dayZhi)) return '流年与日支相破，关系里易有小的消耗，避免过度解读';
    if (isLiuHai(liunianZhi, dayZhi)) return '流年与日支相害，留意口舌误会，把话讲明白大多能化解';
    if (isSanXing(liunianZhi, dayZhi)) return '流年与日支相刑，像一次压力测试，耐心比聪明更管用';
    if (inSameSanHe(liunianZhi, dayZhi)) return '流年与日支半合，暗中有助力，顺势而为更顺';
    return '';
  }

  function fortuneYears(a, b, pa, pb) {
    const thisYear = new Date().getFullYear();
    const [na, nb] = pairNames(a, b);
    const aDayZhi = a.pillars[2].zhi;
    const bDayZhi = b.pillars[2].zhi;
    const list = [];
    for (let i = 0; i < 3; i++) {
      const year = thisYear + i;
      const gan = GAN[((year - 4) % 10 + 10) % 10];
      const zhi = ZHI[((year - 4) % 12 + 12) % 12];
      const ganWX = GAN_WUXING[gan];
      const zhiWX = ZHI_WUXING[zhi];
      const theme = FORTUNE_THEME[ganWX];

      const aFav = pa.xi.includes(ganWX) || pa.xi.includes(zhiWX);
      const bFav = pb.xi.includes(ganWX) || pb.xi.includes(zhiWX);
      const aNote = zhiRelation(zhi, aDayZhi);
      const bNote = zhiRelation(zhi, bDayZhi);
      const notes = [];
      if (aNote) notes.push(`${na}：${aNote}`);
      if (bNote) notes.push(`${nb}：${bNote}`);

      let level, levelText, relation;
      if (aFav && bFav) {
        level = '顺遂'; levelText = '双喜顺势';
        relation = '流年五行同时补到两个人的喜用，是难得的「一起变好」之年——想推进的关系大事，今年做最省力。';
      } else if (aFav || bFav) {
        const favWho = aFav ? na : nb;
        const calmWho = aFav ? nb : na;
        level = '平稳'; levelText = '一暖一缓';
        relation = `这一年${favWho}方更顺势、状态更亮，${calmWho}方偏平缓。顺的一方主动带动，缓的一方安心接住，节奏就不容易错开。`;
      } else {
        level = '需经营'; levelText = '沉淀守成';
        relation = '流年五行没有直接补到两人的喜用，属于「慢慢养」的一年。别急着推进大事，把日常过稳、把情绪照顾好，就是最好的经营。';
      }

      let advice;
      if (level === '顺遂') advice = '顺势的年，适合把想法落到具体计划：一次旅行、一个新家、一次郑重其事的自我介绍。';
      else if (level === '需经营') advice = '守成的年，少一点考验、多一点确定感——固定的联系节奏和说到做到，比轰轰烈烈更养关系。';
      else advice = '一快一慢的年，先把「忙的时候怎么报备」说清楚，能省掉大半猜测。';

      list.push({
        year, ganzhi: gan + zhi, zodiac: ZHI_ANIMAL[zhi], wx: ganWX,
        theme: theme.word, themeLine: theme.line,
        level, levelText, relation, notes, advice, aFav, bFav
      });
    }
    return list;
  }

  // ============================================================
  // 差异化新角度：避开「相处/沟通/被爱方式」等已写滥的主题，
  // 聚焦关系类型专属 + 具体生活场景模拟，全部按命盘特征组合生成。
  // ============================================================

  // —— 关系类型专属解读（恋人 / 闺蜜 / 搭档 / 其他）——
  function relationFocus(a, b, pa, pb, res, rel) {
    const kind = ['恋人', '闺蜜', '搭档'].indexOf(rel) >= 0 ? rel : '其他';
    const strong = res.total >= 68, mid = res.total >= 45;
    const lib = {
      恋人: {
        core: '恋人之间，最想问的其实是「我们会不会一直这样」。从盘上看，你们吸引的方式与维系的方式并不完全相同——热烈和安稳各占一头，所以别用某一刻的浓度去衡量整段感情。',
        advice: strong
          ? '这组配置适合认真谈长远：把「以后」聊具体一点（住哪里、怎么过日子、家人怎么看），反而让彼此更安心。越是合拍，越要把喜欢说出口，别让默契变成默认。'
          : mid
            ? '感情是慢慢焐热的那种，靠固定的小仪式养着最稳：睡前一段话、周末一顿饭。别急着定义关系，把日常过顺了，答案自然浮现。'
            : '缘分偏淡不代表不能爱，只是需要更多主动的表达与耐心。少一点「她应该懂」，多一点「我想让你知道」，把心意说明白，比什么都强。',
        risk: '恋人最容易在「你把温柔给了别人」和「你没以前那么上心」上较劲。吃醋时先问自己是不是累了，再和对方好好说——多数时候，那只是电量不足，不是不爱了。'
      },
      闺蜜: {
        core: '闺蜜这份缘，贵在「不用说也懂」。你们的盘里既有相似的地方，也有互补的地方：相似让你们聊得来，互补让你们在对方身上看到自己没有的那一面——这正是友谊最耐看的部分。',
        advice: strong
          ? '这是能互相托底的友谊。别把对方的付出当理所当然，也别因为太熟就省掉感谢。真正的闺蜜，是各自过得好，也常常见面。'
          : mid
            ? '友谊靠「常联系」养着，不一定要天天聊，但别让 Silence 变成生疏。一个月一次的见面或长聊，就能把关系稳住。'
            : '再好的朋友也需要经营。少一点比较、多一点捧场，她难过时你在、她得意时你也真心高兴，这段关系就会越来越瓷实。',
        risk: '闺蜜之间最容易因为「她没第一时间告诉我」而受伤。记住：不是所有沉默都是疏远，每个人处理情绪的方式不同，问一句比闷着强。'
      },
      搭档: {
        core: '做搭档，看的不是合不合得来，而是「能不能一起把事做成」。你们的分工气质从盘里就能看出来：有人擅长开局、有人擅长收尾，有人想方向、有人盯细节——把角色摆对，战斗力就出来了。',
        advice: strong
          ? '这组配置适合长期协作。开局时就把「谁拍板、谁执行、怎么复盘」写清楚，默契加上规则，能走得很远。'
          : mid
            ? '协作的关键是把边界画出来：各自负责的领域自己说了算，交叉的事再一起商量。省下的内耗，都是产能。'
            : '节奏不完全一致时，别急着互相改造。先磨合出一套双方都舒服的协作节奏，慢一点反而更稳。',
        risk: '搭档最忌「既想一起做、又不肯放手」。要么明确分工各自负责，要么彻底交出去别插手——最怕的是权责不清，最后谁都觉得自己在替对方擦屁股。'
      },
      其他: {
        core: '无论你们把这段关系叫作什么，盘里藏着的都是同一种东西：两个人带着各自的底色靠近，在相似处共鸣，在差异处成长。名字不重要，相处得舒服才重要。',
        advice: strong
          ? '这组配置很合拍，好好珍惜。不必急着给关系贴标签，顺着舒服的节奏走，反而能走得更久。'
          : mid
            ? '关系在路上，慢慢来就好。多一点好奇、少一点预设，你们还有不少彼此不了解的惊喜。'
            : '缘分有深有浅，不必强求。能舒服地相处、从对方身上学到东西，本身就是收获。',
        risk: '最怕的是用一种关系的标准去要求另一种。想清楚你们彼此期待的是什么，把默认期待摊开说，很多别扭就不存在了。'
      }
    };
    const L = lib[kind];
    return { kind, core: L.core, advice: L.advice, risk: L.risk };
  }

  // —— 冲突现场还原：从冷战到和好的完整流程 ——
  // 两人属性相同时改为「同频」叙述，不再把同一句话重复两遍。
  function conflictFlow(a, b, pa, pb, res) {
    const d = res.dimensions;
    const [na, nb] = pairNames(a, b);
    const clash = d.zhi.label.includes('冲') || d.wuxing.label.includes('相克') || d.gan.label.includes('相制');
    const coolA = pa.strength === '偏旺' ? '先冷着、把话憋在心里' : '当场不吭声、事后反复想';
    const coolB = pb.strength === '偏旺' ? '先冷着、把话憋在心里' : '当场不吭声、事后反复想';
    const returnA = pa.tenGods === '食伤' || pa.tenGods === '火'
      ? '一个玩笑或一句软话破冰' : '默默做点实事（倒杯水、把事办好）当台阶';
    const returnB = pb.tenGods === '食伤' || pb.tenGods === '火'
      ? '一个玩笑或一句软话破冰' : '默默做点实事（倒杯水、把事办好）当台阶';

    // 冷静方式：相同 → 同频叙述；不同 → 分别叙述
    const coldSame = coolA === coolB;
    const coldText = coldSame
      ? `你俩在这一点上是同频的——都是「${coolA}」的类型。同频的好处是彼此懂那个沉默不是在赌气；麻烦是两个人都憋着时，谁也不会先出声。所以约好：谁先缓过来，谁先开个头，不用等对方。`
      : `${na}多是「${coolA}」，${nb}多是「${coolB}」。这半拍到半天的冷却期不是坏事，别急着在这时候讲道理——先各自待着，情绪过了头再谈。`;

    // 和好方式：相同 → 同频叙述；不同 → 分别叙述
    const returnSame = returnA === returnB;
    const returnText = returnSame
      ? `在和好这件事上你们出奇一致——都偏向「${returnA}」。好处是台阶的样子彼此都认得；但两个人都用同一种方式、都在等对方先递时，就容易僵住。认出信号之后，谁方便谁先来，别把「谁先低头」当成输赢。`
      : `和好的方式也不同：${na}偏向「${returnA}」，${nb}偏向「${returnB}」。认出对方的和好信号很重要——她递台阶时，就顺着下，别追着问「你到底错在哪」。`;

    return {
      start: clash
        ? '你们的分歧往往来得挺快：一个观点鲜明不肯让，另一个也有主意，几句话不合就上头。导火索常常不是那件事本身，而是「你那语气」。'
        : '你们平日里不太容易吵起来，真有分歧时更像是突然的沉默——谁都不想先破坏气氛，于是话都憋着。',
      cold: coldText,
      return: returnText,
      rule: '给你们定一条通用规矩：吵完 24 小时内，无论谁对谁错，先说一句「我不是想跟你吵」。这句不是认输，是把关系从对立里捞出来——冷战的伤害，往往比那件事本身大得多。'
    };
  }

  // —— 一起做事的场景模拟（挑 3 个最贴合命盘的组合）——
  // 两人同类属性不硬凑「一个这样、一个那样」，改写成同频场景。
  function lifeScenes(a, b, pa, pb, res) {
    const d = res.dimensions;
    const [na, nb] = pairNames(a, b);
    const paPlan = pa.tenGods === '财' || pa.tenGods === '官杀';
    const pbPlan = pb.tenGods === '财' || pb.tenGods === '官杀';
    const travelSame = paPlan === pbPlan;
    const nightYangSame = a.dayMasterYinYang === b.dayMasterYinYang;
    const needA = pa.need.replace('最需要的是', '').replace(/[「」]/g, '').replace(/，$/, '');
    const needB = pb.need.replace('最需要的是', '').replace(/[「」]/g, '').replace(/，$/, '');
    const needSame = needA === needB;
    const moneySame = (pa.tenGods === '财') === (pb.tenGods === '财');

    const travelText = travelSame
      ? `${d.zhi.label.includes('合') || d.zodiac.label.includes('合') ? '你们的地支相合，一起出门的默契是加分项' : '一起出门是最容易看清彼此节奏的机会'}：你俩在计划这件事上是同一路人——都偏「${paPlan ? '提前把行程排得妥妥的' : '随性走走看看、临时起意'}」。同频让沟通省力，却也容易一起漏掉细节（比如都忘了订票、都没看天气）。出发前指定一个人专门盯「硬性安排」，另一个只管发现路边的小店，同频也能分工。`
      : `${d.zhi.label.includes('合') || d.zodiac.label.includes('合') ? '你们的地支相合，一起出门的默契是加分项' : '一起出门是最容易看清彼此节奏的机会'}：${na}偏「${paPlan ? '提前把行程排得妥妥的' : '随性走走看看、临时起意'}」，${nb}偏「${pbPlan ? '喜欢有个明确计划' : '走到哪算哪、享受意外'}」。出发前先把「一定要去的点」和「随便逛逛的时间」分开，一个负责订票导航，一个负责发现路边的小店，各司其职最开心。`;

    const nightText = nightYangSame
      ? `深夜是你们最容易交心的时段。你俩都是${a.dayMasterYinYang === '阴' ? '心思细、夜里容易翻来覆去的类型，一句关心就能戳中' : '白天各自要强、夜深才肯卸下防备的类型'}——同频的时候聊起来特别深，但也可能两个人都闷着不说。这样的时刻别用来算旧账、聊压力，多讲点没用的废话和心里的软话——关系的温度，常常是在这些「不解决问题」的聊天里攒起来的。`
      : `深夜是你们最容易交心的时段。${na}${a.dayMasterYinYang === '阴' ? '心思细、容易被一句关心戳中' : '白天要强，夜里才卸下防备'}，${nb}${b.dayMasterYinYang === '阴' ? '想得多、睡前最容易翻来覆去' : '嘴上不说，夜深时才肯讲真话'}。这样的时刻别用来算旧账、聊压力，多讲点没用的废话和心里的软话——关系的温度，常常是在这些「不解决问题」的聊天里攒起来的。`;

    const sickText = needSame
      ? `一方不舒服时，最能看出照顾的方式对不对。有意思的是，你俩需要的恰好是同一样东西——「${needA}」。这意味着你们照顾对方时容易照顾到点子上，因为自己想要的，往往也是她想要的。反倒要留意：两个人都需要同一种支持时，容易一起缺位，那就轮流做那个先开口问「你现在想要我怎么做」的人。`
      : `一方不舒服时，最能看出照顾的方式对不对。${na}需要「${needA}」，${nb}需要「${needB}」。别用自己的方式硬套对方：想安静的就别一直追问，需要回应的就别晾着。照顾这件事，问一句「你现在想要我怎么做」，比自作主张周到得多。`;

    const moneyText = moneySame
      ? `一起花钱、一起做计划时，你俩在钱上是同一类——都偏「${pa.tenGods === '财' ? '有账算得清楚的务实派' : '差不多就行、不太计较'}」。同类最省摩擦，但也有共同的坑：${pa.tenGods === '财' ? '两个人都想拿主意时容易较劲' : '两个人都随性时容易一起月光'}。大额支出先说好各自的比例和底线，小额就别一笔笔算——把规则定在前面，感情里就少很多算计的委屈。`
      : `一起花钱、一起做计划时，${na}偏「${pa.tenGods === '财' ? '有账算得很清楚的务实派' : '差不多就行、不太计较'}」，${nb}偏「${pb.tenGods === '财' ? '把钱花在刀刃上的计划派' : '随性、够用就好'}」。差异本身不是问题，藏着不说才是。大额支出先说好各自的比例和底线，小额就别一笔笔算——把规则定在前面，感情里就少很多算计的委屈。`;

    const sceneLib = [
      { key: '一起旅行', icon: '🧳', when: true, text: travelText },
      { key: '深夜聊天', icon: '🌙', when: true, text: nightText },
      { key: '生病照顾', icon: '🩹', when: true, text: sickText },
      { key: '钱与计划', icon: '💰', when: true, text: moneyText }
    ];
    // 四个场景全给：一起旅行 / 深夜聊天 / 生病照顾 / 钱与计划
    return sceneLib.filter(s => s.when);
  }

  // —— 女女相处实招：来自真实伴侣经验与同性伴侣关系研究的语料 ——
  // 只谈相处方式，不作取向判断；按命盘确定性选取，避免人人都看到同一句。
  const LES_LORE = {
    fusion: [
      '你们容易把彼此的情绪当成自己的：她一沉默，你就开始猜是不是自己哪里做错了。给彼此留一块不用报备的小天地，不是疏远，是让「我」一直完整，「我们」才不会腻。',
      '贴得越紧，越怕失去。你需要的也许不是更多的「随时在线」，而是一句明确的「我晚上回来」——确定感比黏在一起更安神。',
      '两个人的世界如果重叠到没有缝隙，吵架时就没有退路。各自保有一个不重叠的爱好或朋友圈，回来才有话可聊，关系也才有喘息的余地。'
    ],
    mindread: [
      '「你应该懂我」是心思细腻的人最容易掉进去的坑。想要陪伴，就直接说「睡前陪我聊五分钟」；明确的请求比含蓄的暗示更容易被接住，也更不伤感情。',
      '两个人都很会表达，也会一起掉进「情绪洪水」——都在说，没人在听。约定一个暂停的小信号，吵到上头时先抱一抱、缓二十分钟，再回来把话讲完。',
      '把「你总是这样」换成「刚才你那样，我有点失落」。说具体的一次、讲自己的感受，对方才听得进去——指责只会让两个敏感的人一起竖起防备。'
    ],
    outside: [
      '你们对外界的节奏未必一致：一个想大方公开，一个还在准备。先商量好哪些人可以知道、哪些场合低调，把口径统一了，外面的风就吹不进你们之间。',
      '遇到冒失的提问，你们不必每次都解释。约好一个只属于两个人的回应方式，把力气留给彼此，而不是说给不相干的人听。',
      '外面的压力最怕关起门来变成互相消耗。先统一口径、再一起面对——"我们"站在一边，外界就只是背景音。'
    ],
    daily: [
      '你们的爱藏在细节里：记得对方不吃香菜、加班时留一盏灯、逛街时她多看一眼的裙子。把这些小动作配一句「我记得」，被在乎的感觉就从心里落到了实处。',
      '一起逛菜市场、一起做饭，饭桌上把对方爱吃的菜夹过去——再浓的浪漫，最后都落在一餐一饭里。这些不起眼的重复，才是关系最稳的地基。',
      '睡前一段话、周末一顿饭、出门前牵个手——这些小仪式看着不起眼，却是给关系充电的插座。日子久了，靠的就是它们。'
    ],
    longterm: [
      '别拿初见时的她当标准答案。人会变，爱好会变，每隔几年重新问一次「现在的你想要什么样的日子」，关系才不会停在最能心动的那一年。',
      '激情会退，照顾不会：递杯水、扶一把、走路时下意识慢半拍——这些才是走久了以后最动人的部分。',
      '长久不是「对的人就会自然在一起」，而是愿意主动维护：每周留一次只属于两人的时间，遇到反复出现的问题就坐下来好好谈，别让沉默替你们做决定。'
    ],
    equal: [
      '没有谁「必须」主动、谁「必须」负责经济、谁「必须」做决定——这是两个人在一起的自由，也意味着要多花一点心思去协商。把默认值摊开说，反而更轻松。',
      '你们都擅长照顾人，就容易一起掉进「过度付出」：把温柔都给对方，慢慢丢了自己。先照顾好自己的电量，给出的关心才不是透支。'
    ]
  };
  function lesLore(a, b, pa, pb, res) {
    const seed = a.dayMaster + b.dayMaster + a.pillars[0].zhi + b.pillars[0].zhi;
    const fusion = _pick(seed + '|fusion', LES_LORE.fusion);
    const mindread = _pick(seed + '|mindread', LES_LORE.mindread);
    const outside = _pick(seed + '|outside', LES_LORE.outside);
    const daily = _pick(seed + '|daily', LES_LORE.daily);
    const longterm = _pick(seed + '|longterm', LES_LORE.longterm);
    const equal = _pick(seed + '|equal', LES_LORE.equal);
    const html = (arr) => arr.map(x => `<div class="du-lore-item"><span class="du-lore-dot">✦</span><p>${x}</p></div>`).join('');
    return {
      rich: `<div class="du-lore">`
        + `<div class="du-lore-group"><h4>🫧 亲密与空间</h4>${html([fusion])}</div>`
        + `<div class="du-lore-group"><h4>💬 别猜，直接说</h4>${html([mindread])}</div>`
        + `<div class="du-lore-group"><h4>🌍 外面的世界</h4>${html([outside])}</div>`
        + `<div class="du-lore-group"><h4>🍚 日常里的偏爱</h4>${html([daily])}</div>`
        + `<div class="du-lore-group"><h4>🌳 走得久的秘密</h4>${html([longterm])}</div>`
        + `<div class="du-lore-group"><h4>⚖️ 平等与自我</h4>${html([equal])}</div>`
        + `</div><p class="du-fortune-disclaimer">※ 这一章整理自真实的女女相处经验与同性伴侣关系研究，写的是常见处境，不是对你们的断言。日子怎么过，你们说了算。</p>`
    };
  }

  // ============================================================
  // 深度报告 · 富文本扩展
  // 不改动 deepReport 原有字段与算法，只附加更详尽的分段长文、
  // 专项解读、角色分工、情绪节奏、相处计划与可直接照着说的话术。
  // ============================================================
  function buildRichReport(a, b, res, pa, pb, rel) {
    const d = res.dimensions;
    const [na, nb] = pairNames(a, b);
    const rateOf = (x) => x.score / x.max;
    const ranked = [
      { k: '生肖默契', v: d.zodiac },
      { k: '五行互补', v: d.wuxing },
      { k: '性格相合', v: d.gan },
      { k: '地支互动', v: d.zhi },
      { k: '缘分根基', v: d.fate },
      { k: '用神互补', v: d.yongshen }
    ].sort((x, y) => rateOf(y.v) - rateOf(x.v));
    const strongest = ranked[0], weakest = ranked[ranked.length - 1];

    const unionWX = new Set([...a.distinctElements, ...b.distinctElements]);
    const missingWX = WUXING.filter(w => !unionWX.has(w));
    const wxScene = {
      木: '多接触绿植与树林、用青绿色小物、一起养一盆植物',
      火: '多晒太阳、点一盏暖灯或香薰、穿红橙色系',
      土: '把居家环境布置得温软些、用米黄棕色、一起做饭',
      金: '保持空间清爽、佩戴银色小物、把计划写下来',
      水: '多近水边散步、听流水声、穿黑蓝色系'
    };

    // —— 桃花专项（细到四柱里桃花出现的处数）——
    const peach = (p) => p.pillars.filter(pl => ['子', '午', '卯', '酉'].includes(pl.zhi));
    const ca = peach(a).length, cb = peach(b).length;
    const taohuaRich = (ca && cb)
      ? `双方四柱里都见桃花（${na} ${ca} 处、${nb} ${cb} 处），这组关系的吸引力是双向且外显的：容易被彼此的气质、表达、甚至说话的方式打动，站在人群里也常被注意到。好处是心动感充足、不缺浪漫；要留意的是桃花旺的人对情绪格外敏感，一句没接住的玩笑可能被放大。把这份敏锐用在彼此身上——多回应、少晾着，火花就会一直温着，而不是烧完就散。`
      : (ca || cb)
        ? `两人中有一方桃花较旺（${ca ? na : nb}命带 ${ca || cb} 处桃花），会把更多浪漫、仪式感与关注度带进关系：主动找话题、记得小日子、愿意制造惊喜。另一方不必勉强配合同样的浓度，安心接住、认真回应就很好。桃花偏弱的那一方更擅长把关系过成日常，这恰好是让心动落地的能力——一个负责点亮，一个负责守灯。`
        : `两人四柱桃花都偏少，感情不靠一时的来电，而靠「越了解越上头」。你们更可能从默契、可靠、被稳稳照顾的感觉里生出喜欢，起步慢一点，但一旦认定就很稳。建议主动给关系添一点新鲜感：换条路线散步、一起试件没做过的事，细水也能起涟漪。`;

    // —— 财运专项（我克者为财）——
    const caiWXa = KE[a.dayMasterWX], caiWXb = KE[b.dayMasterWX];
    const caiSum = (a.elementCounts[caiWXa] || 0) + (b.elementCounts[caiWXb] || 0);
    const wealthRich = (caiWXa === caiWXb
      ? `以「我克者为财」来看，你俩日主同属${a.dayMasterWX}，财星都落在「${caiWXa}」上——对「把日子过好」的向往是同一种，容易想到一块去。两人命盘合计见 ${caiSum} 处财气。`
      : `以「我克者为财」来看，${na}财星属${caiWXa}、${nb}财星属${caiWXb}，两人命盘合计见 ${caiSum} 处财气。`)
      + (caiSum >= 3
        ? `财星两旺，你们对「把日子过好」这件事都有驱动力，一起规划小事业、共同储蓄或攒一笔旅行基金会很合拍。钱的话题在你们之间不该是禁忌：把预算摊开聊，反而比各自猜测更亲密。要留意的是两人都想拿主意时容易较劲，建议按「谁更擅长谁负责」分工，别在同一笔账上争主导权。`
        : caiSum === 2
          ? `财星各一位，求财风格恰好互补——一个敢想、一个稳健，搭伙正好。适合设一个共同的、金额不大的小目标（一次短途旅行、一件想一起买的家具），用可见的进度给关系添点成就感。花钱观念有出入时，先约定「各自可自由支配的额度」，剩下的再一起商量，摩擦会少很多。`
          : `财星偏弱，两人对钱都偏随性，不太爱精打细算，也不容易为计较伤感情。风险在于容易「一起月光」或谁都不好意思提钱。建议给关系设一两个共同小目标，再开一个只属于两人的小账本，不必严格，有个锚点就够了。`);

    // —— 事业 / 协作专项 ——
    const zhiLabel = d.zhi.label;
    const careerRich = (zhiLabel.includes('合') || zhiLabel.includes('三合'))
      ? `地支「${zhiLabel}」让你们在协作里天然互相搭台：一个出主意、一个落地，一个看方向、一个盯细节，组合战斗力很强。适合一起做需要长期配合的事（共同项目、开店、备考、装修）。要提醒的是顺手也容易顺手包办，尽量把「谁拍板、谁执行、什么时候复盘」说清楚，免得默契变成默认某一个人多扛。`
      : zhiLabel.includes('冲')
        ? `地支「${zhiLabel}」意味着观点常碰撞，短期内不算省力，但正因如此反而少有盲区——你们能看到对方看不到的风险。协作前先花十分钟定好分工与决策规则（比如「谁的专业谁说了算」），把争论限定在事情上，不滑向人的对错，这股张力就能变成产出。`
        : `事业上你们节奏接近、都不爱极端，一起做点什么会很合拍，问题往往不在能力而在角色重叠：两个人都想照顾全局，反而没人拍板。建议按各自日主的长处分工（${pa.wx}气偏「${pa.gan}」的踏实与生发，${pb.wx}气偏「${pb.gan}」的灵动与承接），把边界画出来，配合就顺了。`;

    // —— 五行调和（更具体的可执行清单）——
    // 喜用相同时不再说「各有侧重 / 略有不同」这种自相矛盾的话。
    const xiSame = pa.xiDesc === pb.xiDesc;
    const xiLine = xiSame
      ? `有意思的是，${na}和${nb}的喜用几乎一样（都${pa.xiDesc.replace(/^最需要的是/, '')}），要补的是同一味。一起往同一个方向使劲当然省力，但也容易两个人都缺在同一点上——这时该由一方主动换换口味，把另一方没意识到的部分带进来。`
      : `${na}${pa.xiDesc}、${nb}${pb.xiDesc}，两人喜用各有侧重，选一起做的事时轮流迁就，比单方面配合更长久。`;
    const tuneRich = missingWX.length
      ? `两人四柱合起来偏缺「${missingWX.join('、')}」，气场里少了这几味的流动，相处上容易表现为：${missingWX.map(w => ({ 木: '不太会主动开新话题', 火: '情绪表达偏含蓄、热度起得慢', 土: '缺少落地的稳定感、计划容易悬着', 金: '边界与规则模糊、该断的事拖着', 水: '少一点松弛与变通、容易硬碰硬' }[w])).join('；')}。`
        + `不必紧张，命理讲「缺则可补」，生活里补比改性格容易得多：${missingWX.map(w => wxScene[w]).join('；')}。`
        + xiLine
      : `两人五行俱全，气场相对平衡，几乎不挑相处场景：热闹的聚会、安静的居家、需要协作的事都能接得住。这种组合不需要刻意「补什么」，更值得留意的是别把平衡过成平淡——定期一起试件没做过的事，让五种能量都流动起来。${xiLine}`;

    // —— 缘分深度长文（四段）——
    // 日主/性格完全相同时不写「一个…一个…」的重复句，改写同频解读。
    const toneLine = pa.tone === pb.tone
      ? `两张盘最有趣的地方是「像」——${pa.tone}。这样的同频让你们特别懂彼此，但也意味着相似的坑会一起踩：真正要经营的不是「怎么磨合差异」，而是「怎么在相同里保持各自的新鲜」。`
      : `一个${pa.tone}；一个${pb.tone}。这不是谁强谁弱，而是两张盘各自带着不同的季节出生，本来就该有不同的呼吸方式。`;
    // 两人喜用成因相同时只写一次，避免同一句话重复两遍
    const whyLine = pa.xiWhy === pb.xiWhy
      ? (pa.xiWhy + '（你俩的喜用成因相同，这一点上特别同频。）')
      : pa.xiWhy + pb.xiWhy;
    const zPairLine = a.zodiac === b.zodiac ? `你俩同属${a.zodiac}` : `${a.zodiac}与${b.zodiac}`;
    const deepParas = [
      `${zPairLine}的组合，${res.summary} 先把两张命盘摊开看：${na}日主${a.dayMaster}（${a.dayMasterWX}·${pa.strength}，${pa.xiDesc}），${nb}日主${b.dayMaster}（${b.dayMasterWX}·${pb.strength}，${pb.xiDesc}）。${whyLine}${toneLine}`,

      `你们最亮的那一维是「${strongest.k}」（${strongest.v.score}/${strongest.v.max}，标签为「${strongest.v.label}」）。${strongest.v.text} 换句话说，这段关系里有个不需要费力维护的部分——它会自动替你们把日子托住。吵架、忙碌、隔了一阵没见，回头时靠的往往就是这块底色。生肖「${d.zodiac.label}」定下初见时的亲近感，天干「${d.gan.label}」决定彼此怎么表达，地支「${d.zhi.label}」则写进了日常里那些说不清的顺与别扭。`,

      `最需要留心的那一维是「${weakest.k}」（${weakest.v.score}/${weakest.v.max}）。${weakest.v.text} 这里要说实话：分数低不代表不合适，它只是标出了两人默认模式下最容易互相误读的地方。年柱「${d.fate.label}」、用神「${d.yongshen.label}」也在提醒同一件事——${d.yongshen.text} 命理里最养人的关系，从来不是处处都合，而是知道哪里需要多说一句、哪里可以放心沉默。`,

      `所以这份报告想给的结论并不复杂：把「${strongest.k}」当成你们的根据地，多待在那里；把「${weakest.k}」当成需要一起学的功课，别当成对方的缺点。${res.total >= 70 ? '你们是那种越处越甜的组合，值得认真规划长远' : res.total >= 55 ? '你们是稳稳当当的陪伴型，慢一点反而走得更久' : res.total >= 40 ? '你们有火花也有摩擦，磨合好了会比一开始就顺的关系更有味道' : '缘分浅淡也不必遗憾，舒服地相处本身就是一种收获'}。八字写的是出生那一刻的天天气息，往后的日子，还是由你们一笔一笔自己写。`
    ];

    // —— 关系里的角色分工 ——
    let roles;
    if (SHENG[a.dayMasterWX] === b.dayMasterWX || SHENG[b.dayMasterWX] === a.dayMasterWX) {
      const aGives = SHENG[a.dayMasterWX] === b.dayMasterWX;
      roles = {
        a: aGives ? `${na}（${a.dayMasterWX}生${b.dayMasterWX}）更像「给的人」：习惯先照顾、先张罗、先把对方的情绪接住，付出得自然，也容易忘了自己也会累。` : `${na}是承接的一方：被照顾时懂得回应，也擅长把对方给的热度安放到具体的生活里。`,
        b: aGives ? `${nb}是承接的一方：被照顾时懂得回应，也擅长把对方给的热度安放到具体的生活里。` : `${nb}（${b.dayMasterWX}生${a.dayMasterWX}）更像「给的人」：习惯先照顾、先张罗、先把对方的情绪接住，付出得自然，也容易忘了自己也会累。`,
        together: '相生的组合最怕「一边一直给、一边一直收」。建议每过一阵就换一次角色——让平时被照顾的人来安排一次约会、做一次决定，能量的流动才不会变成单方面的消耗。'
      };
    } else if (a.dayMasterWX === b.dayMasterWX) {
      // 同为一行：不再两人各说一遍「照镜子」，改为一句同频总述 + 各自不同的落点
      const sameWX = a.dayMasterWX;
      const diffNote = pa.strength === pb.strength
        ? `更巧的是你俩强弱也接近（都${pa.strength}），节奏几乎踩在一个点上——亲近是真亲近，较劲也容易较到一块去。`
        : `细微的差别在强弱上：${na}${pa.strength}、${nb}${pb.strength}，同中有异，正好互为补给。`;
      const mirrorLine = a.dayMasterYinYang === b.dayMasterYinYang
        ? `连阴阳都相同（都属${a.dayMasterYinYang}），你俩几乎是同一块料子雕出来的——默契到不用解释，也意味着盲点高度重合。这份「像」最该警惕的，是两个人一起错还都觉得有理，所以身边有个敢说真话的朋友，反而珍贵。`
        : `底色相近，但${na}偏${a.dayMasterYinYang}、${nb}偏${b.dayMasterYinYang}——同一块料子，照出的角度仍不同。认出这份「像里的不像」，比追求完全一致更有意思。`;
      roles = {
        a: `你俩日主同属${sameWX}，思维、节奏、在意的事都很像，好处是「不用说就懂」，坏处是容易一起钻同一个牛角尖。${diffNote}`,
        b: mirrorLine,
        together: '同气组合最适合「各留一块自留地」：各自保有一个不重叠的爱好或圈子，回来才有话可聊。遇到分歧时，别指望对方自动唱反调，得有人主动扮演那个提不同意见的人。'
      };
    } else {
      roles = {
        a: `${na}日主${a.dayMaster}（${a.dayMasterWX}）与对方形成相制，习惯用自己的方式推进事情，观点鲜明、不太肯含糊。`,
        b: `${nb}日主${b.dayMaster}（${b.dayMasterWX}）同样有主张，两人碰在一起不会无聊，但也容易在同一件事上较劲。`,
        together: '相制不是相克到底，而是「彼此磨出边界」。建议把决策按领域切开：各自最在意的那一块由本人拍板，交叉的事再一起商量。吵完记得补一句「我不是针对你」，这句比讲道理管用。'
      };
    }

    // —— 情绪与相处节奏 ——（pace/need 相同时合并叙述，避免整句重复）
    const paceSame = pa.pace === pb.pace, needSameRhythm = pa.need === pb.need;
    const rhythm = paceSame && needSameRhythm
      ? {
          a: `${na}日主属${a.dayMasterYinYang}、${pa.strength}；${nb}日主属${b.dayMasterYinYang}、${pb.strength}——你俩的相处节奏几乎是同一个节拍：${pa.pace}${pa.need}`,
          b: `节奏相同的人在一起，最难得的是「不用解释对方为什么忽然安静」。但也正因为同频，低落时容易一起沉下去、谁也不喊停。你们需要的不是磨合节奏，而是约好一个「低电量信号」（比如一句「今天有点累」），让对方知道该给空间还是该靠近。`,
          together: '同频的伴侣要特意留一个「不同步」的出口：各自保有能独处、能找别人聊的时间，回来才不会把彼此当成唯一的情绪出口。'
        }
      : {
          a: `${na}日主属${a.dayMasterYinYang}、${pa.strength}：${pa.pace}。${pa.need}。`,
          b: `${nb}日主属${b.dayMasterYinYang}、${pb.strength}：${pb.pace}。${pb.need}。`,
          together: a.dayMasterYinYang === b.dayMasterYinYang
            ? '两人阴阳同调，情绪起伏容易同步：一起开心时很亮，一起低落时也容易互相带着往下沉。约好一个「低电量信号」（比如一句「今天有点累」），让对方知道该给空间还是该靠近，比硬撑着体贴有效。'
            : '一阴一阳，节奏天然错开：一个先热、一个后暖；一个想说清楚、一个需要缓一缓。这其实是很好的缓冲，别把「她怎么不马上回应」解读成不在意，给慢的那一方留半拍，很多误会根本不会发生。'
        };

    // —— 未来三个月相处小计划 ——
    const plan = [
      {
        title: '第 1 个月 · 把话说明白',
        tip: `挑一个都不忙的时段，聊聊彼此「希望被怎样对待」。${rhythm.together}不用谈得多郑重，把默认期待摊开，后面两个月会省掉大半猜测。`
      },
      {
        title: '第 2 个月 · 补上缺的那一味',
        tip: missingWX.length
          ? `两人五行偏缺「${missingWX.join('、')}」，这个月安排一件对应小事就好：${missingWX.slice(0, 2).map(w => wxScene[w]).join('；')}。共同经历比讲道理更能调气场。`
          : '两人五行俱全，这个月不妨一起试件从没做过的事（新路线、新手艺、新馆子），让齐全的能量流动起来，别把平衡过成惯性。'
      },
      {
        title: '第 3 个月 · 留一个只属于你们的仪式',
        tip: `针对最弱的一维「${weakest.k}」，定一个低成本、能长期做的小动作：${weakest.k === '地支互动' ? '每周一次不插手机的共同时段，给变动留个稳锚' : weakest.k === '用神互补' ? '轮流安排一次约会，各带对方进一次自己的世界' : weakest.k === '性格相合' ? '有分歧时先复述对方的话，再说自己的' : '固定一句睡前的话，把亲近感养成习惯'}。三个月后回头看，关系往往就稳在这些小地方。`
      }
    ];

    // —— 相处禁忌（更完整）——
    const needLine = pa.need === pb.need
      ? `别试图改造对方的日主本性：你俩在这一点上出奇一致——${pa.need}。相同的底色让彼此更懂，也意味着会「同缺同痛」，别指望对方补上你自己都没有的那块。`
      : `别试图改造对方的日主本性：${na}${pa.need}，${nb}${pb.need}。这些是底色，不是可以商量改掉的毛病。`;
    const tabooRich = [
      '别把「合盘分数」当成判决书，更别在争执时拿它当论据——分数说的是默认模式，不是人的上限。',
      needLine
    ];
    if (res.total >= 75) tabooRich.push('高分组合最容易犯的错是「想当然」——再默契，也要把感谢和喜欢说出口。');
    if (missingWX.length) tabooRich.push(`两人同缺「${missingWX.join('、')}」，别在彼此都短的那件事上互相指望（比如都不擅长规划时，就别等对方来安排）。`);
    tabooRich.push('不要把第三方的评价带进两个人的关系里，命理、朋友、家人都只是参考，过日子的是你们。');
    // 来自真实女女相处经验的提醒（只谈相处方式，不涉及取向判断）：公开节奏差、外界目光。
    tabooRich.push('如果两个人「公开的程度」不一样——一个想大大方方，一个还没准备好——别急着逼对方表态。先商量好哪些场合、哪些人可以知道，给彼此一点时间和安全感，比反复试探更养关系。');
    tabooRich.push('面对外人好奇甚至冒失的提问，你们不必每次都解释或自证。约定好一套只属于两个人的回应方式，把力气留给彼此，而不是说给不相干的人听。');

    // —— 可直接照着说的话术 ——
    const scripts = [
      `想靠近时：「今天有点想你，不用回也没关系，就是想让你知道。」——给${pa.need.includes('空间') || pb.need.includes('空间') ? '需要空间的一方' : '彼此'}留了退路，反而更容易被接住。`,
      '有误会时：「我可能理解错了，你刚才是想说……对吗？」先复述再表达，比急着解释有效得多。',
      `要拒绝时：「这件事我现在接不住，但我在意你，我们晚点再聊好不好？」——把「不行」和「不在乎」分开说，是${a.dayMasterWX === b.dayMasterWX ? '同气组合' : '你们这组'}最需要的一句。`,
      `想和好时：「刚才我语气不好，不是针对你。我们重新来一次。」不翻旧账、不追对错，给台阶也给面子。`,
      '想留点自己的空间时：「我很爱我们，这周想留一晚给自己充充电，不是躲你。」——先把爱说在前面，再讲需要，亲近和独立从来不冲突。'
    ];

    // —— 开运 · 宜忌 ——
    const luckyAvoid = missingWX.length
      ? `近期少把两人同时放进「${missingWX[0]}」气过重的场景里（例如${({ 木: '连着一整天户外奔波', 火: '密集社交与赶场', 土: '反复改计划、临时变卦', 金: '硬碰硬地谈规则与对错', 水: '行程完全不定、迟迟不落地' })[missingWX[0]]}），容易把原本就偏少的那味耗得更薄。`
      : '五行俱全不忌什么，唯独忌「什么都不一起做」——再平衡的气场，也需要共同经历来养。';

    // —— 缘分关键词（按得分率判定，修掉旧版阈值错误）——
    const kw = [];
    if (res.total >= 80) kw.push('天作之合');
    else if (res.total >= 68) kw.push('越处越甜');
    if (rateOf(d.wuxing) >= 0.8) kw.push('五行互补');
    if (rateOf(d.yongshen) >= 0.78) kw.push('互相成就');
    if (d.zhi.label.includes('合')) kw.push('磁场相吸');
    if (d.gan.label.includes('五合')) kw.push('心意相通');
    if (rateOf(d.fate) >= 0.8) kw.push('根基深厚');
    if (d.zhi.label.includes('冲')) kw.push('欢喜冤家');
    if (res.total < 45) kw.push('细水长流');
    kw.push('互补成长');
    if (kw.length < 5) kw.push('灵魂搭子', '慢热长情');
    const keywordsRich = [...new Set(kw)].slice(0, 6);

    const dmPair = a.dayMaster === b.dayMaster ? `同为「${a.dayMaster}」` : `${a.dayMaster}与${b.dayMaster}`;
    const zodPair = a.zodiac === b.zodiac ? `都属「${a.zodiac}」` : `${a.zodiac}与${b.zodiac}`;
    const closing = `写到这里，其实想说的只有一句：${zodPair}、${dmPair}，这些字只是古人替出生那一刻留下的记号，它们能解释你们为什么容易靠近、又容易在哪里卡住，却解释不了你们后来一起吃过的那些饭、等过的那些雨、和好时的那个拥抱。合盘给的是一张地图，路还是要两个人自己走。若这份报告里有哪一句让你想起她，就把那一句留下来；其余的，看过就好。愿你们被温柔以待，也愿你们有能力温柔待人。🌷`;

    // —— 双方多角度性格画像（各 6 个切面）——
    const facetsA = pa.facets || [];
    const facetsB = pb.facets || [];
    const facetsHtml = (facets, title) => `
      <div class="du-facet-person">
        <h4>${title}</h4>
        ${facets.map(f => `<div class="du-facet"><span class="du-facet-ic">${f.icon}</span><div><b>${f.title}</b><p>${f.text}</p></div></div>`).join('')}
      </div>`;
    // 两张盘四柱高度重合时（如同一天不同时辰），六面画像会相似——给出解释，避免看起来像复制粘贴
    const nearSame = a.pillars.slice(0, 3).every((p, i) => p.gan === b.pillars[i].gan && p.zhi === b.pillars[i].zhi);
    const similarNote = nearSame
      ? `<p class="du-facet-intro">你俩的年、月、日三柱完全相同，只有时柱不同——八字上本就是「同源」的两张盘，所以下面六个切面会有许多相像之处，这不是套模板，而是命盘确实高度重合。差别主要落在时柱（${a.pillars[3].gan}${a.pillars[3].zhi} / ${b.pillars[3].gan}${b.pillars[3].zhi}）与强弱上（${pa.strength} / ${pb.strength}），越往细节看，越能看出两份不同的性情。</p>`
      : '';
    const facetsRich = `<p class="du-para du-facet-intro">同一个人，换个角度看会很不一样。这里从六个切面分别写她：初见时的样子、内心想要什么、压力下如何、渴望怎样被爱、藏起来的反差、相处的节奏。两张盘各写一套，不是套话模板。</p>${similarNote}<div class="du-facet-grid">${facetsHtml(facetsA, na + ' · ' + a.dayMaster + '日主')}${facetsHtml(facetsB, nb + ' · ' + b.dayMaster + '日主')}</div>`;

    // —— 关系类型专属解读 ——
    const relFocus = relationFocus(a, b, pa, pb, res, rel);
    const relLabel = { 恋人: '恋人 / 情侣', 闺蜜: '闺蜜 / 知己', 搭档: '事业搭档', 其他: '你们的关系' }[relFocus.kind];
    const relationRich = `<p class="du-para du-facet-intro">这一段是照着你们选的「${relLabel}」写的——同样两张盘，换成别的关系，说法会不一样。</p>`
      + `<div class="du-rel-card"><div class="du-rel-block"><b>💞 这段关系的核心</b><p>${relFocus.core}</p></div>`
      + `<div class="du-rel-block"><b>🌱 怎么经营更好</b><p>${relFocus.advice}</p></div>`
      + `<div class="du-rel-block"><b>⚠️ 最容易卡住的地方</b><p>${relFocus.risk}</p></div></div>`;

    // —— 冲突现场还原 ——
    const cf = conflictFlow(a, b, pa, pb, res);
    const conflictRich = `<div class="du-flow">`
      + `<div class="du-flow-step"><span class="du-flow-n">1</span><div><b>🔥 通常怎么吵起来</b><p>${cf.start}</p></div></div>`
      + `<div class="du-flow-step"><span class="du-flow-n">2</span><div><b>🧊 冷战时各自的样子</b><p>${cf.cold}</p></div></div>`
      + `<div class="du-flow-step"><span class="du-flow-n">3</span><div><b>🕊️ 谁先递台阶、怎么和好</b><p>${cf.return}</p></div></div>`
      + `<div class="du-flow-step du-flow-rule"><span class="du-flow-n">✓</span><div><b>📌 给你们的一条规矩</b><p>${cf.rule}</p></div></div></div>`;

    // —— 生活场景模拟 ——
    const scenes = lifeScenes(a, b, pa, pb, res);
    const scenesRich = `<div class="du-scenes">${scenes.map(s => `<div class="du-scene"><div class="du-scene-h"><span>${s.icon}</span><b>${s.key}</b></div><p>${s.text}</p></div>`).join('')}</div>`;

    // —— 女女相处实招（真实经验 + 研究语料）——
    const loreRich = lesLore(a, b, pa, pb, res).rich;

    return {
      deepParas, taohuaRich, wealthRich, careerRich, tuneRich,
      roles, rhythm, plan, tabooRich, scripts, facetsRich,
      relationRich, conflictRich, scenesRich, loreRich, relKind: relFocus.kind,
      luckyAvoid, keywordsRich, closing,
      strongest, weakest, missingWX,
      fortune: fortuneYears(a, b, pa, pb)
    };
  }

  function deepReport(a, b, res, rel) {
    const pa = personDeep(a), pb = personDeep(b);
    const [na, nb] = pairNames(a, b);

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

    // 深度长文（tone 相同时改写同频句）
    const deepTone = pa.tone === pb.tone
      ? `你俩的底色出奇地一致——${pa.tone}，像照见彼此，亲近省力，也要留意别把相同的坑一起踩。`
      : `一个${pa.tone}，一个${pb.tone}。`;
    const deepZPair = a.zodiac === b.zodiac ? `你俩同属${a.zodiac}` : `${a.zodiac}与${b.zodiac}`;
    const deep = `${deepZPair}的组合，${res.summary} `
      + `从命格看，${na}日主${a.dayMaster}（${pa.strength}，${pa.xiDesc}），${nb}日主${b.dayMaster}（${pb.strength}，${pb.xiDesc}）——`
      + deepTone
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

    // —— 缘分关键词：改由 buildRichReport 按「得分率」判定 ——
    // （旧版用固定阈值 82 与各维 max 不匹配，导致多个标签永不出现，已修正）

    // —— 专属开运守护（幸运色 / 开运小物 / 宜一起做）——
    const wxColorMap = { 木: '青绿·森林色', 火: '红橙·暖阳色', 土: '米黄·大地色', 金: '白金·月光色', 水: '黑蓝·深海色' };
    const wxItemMap = { 木: '绿植 / 木质手串', 火: '香薰蜡烛 / 暖灯', 土: '陶瓷杯 / 棉麻织物', 金: '金属腕表 / 银饰', 水: '水晶 / 小鱼缸' };
    const xiUnion = Array.from(new Set([...pa.xi, ...pb.xi])).filter(w => wxColorMap[w]);
    const luckyColors = xiUnion.map(w => wxColorMap[w]);
    const luckyItems = xiUnion.map(w => wxItemMap[w]);
    const luckyScenes = missingWX.length
      ? missingWX.map(w => map[w]).join('；')
      : '一起布置温馨小家、逛展看电影，平平淡淡最养感情。';

    // —— 沟通风格与化解话术 ——
    const talkStyle = {
      木: '有主见、要空间，别逼太紧', 火: '热情直接、情绪来得快，哄一哄就好',
      土: '稳重慢热，需要时间暖化', 金: '理性干脆、有话直说，记得裹层糖',
      水: '灵活善变、怕被框死，给点确定性'
    };
    const talk = {
      a: na + '（日主' + a.dayMaster + '·' + a.dayMasterWX + '）' + talkStyle[a.dayMasterWX],
      b: nb + '（日主' + b.dayMaster + '·' + b.dayMasterWX + '）' + talkStyle[b.dayMasterWX],
      tip: a.dayMasterWX === b.dayMasterWX
        ? '你俩沟通风格同源，容易「都觉得对方应该懂」——争执时更要先复述一遍对方的话、确认“我听懂了”，再表达自己，别把同频当成不用解释。'
        : '争执时先复述对方的话、确认“我听懂了”，再表达自己——误会往往死在“你根本不懂我”。'
    };

    // —— 富文本扩展（关键词按得分率重新判定）——
    const rich = buildRichReport(a, b, res, pa, pb, rel);

    // —— 专属缘分词（古风签名句）——
    const unionLabel = missingWX.length ? '各有所偏' : '俱全';
    const dmSig = a.dayMaster === b.dayMaster ? '日主同为' + a.dayMaster : '日主' + a.dayMaster + '/' + b.dayMaster;
    const zodSig = a.zodiac === b.zodiac ? '同属' + a.zodiac : a.zodiac + '与' + b.zodiac;
    const signature = zodSig + '相映成趣，五行' + unionLabel + '、' + dmSig + '——'
      + '宜' + (missingWX.length ? missingWX.map(w => map[w].slice(0, 5)).join('、') : '细水长流地陪伴')
      + '，惜' + (rich.keywordsRich[0] || '彼此') + '。此缘，值得慢慢养。';

    return {
      personA: { ...pa },
      personB: { ...pb },
      taohua, wealth, career,
      deep,
      tune,
      taboo,
      timeline: timelineOf(res.total),
      keywords: rich.keywordsRich,
      lucky: { colors: luckyColors, items: luckyItems, scenes: luckyScenes, avoid: rich.luckyAvoid },
      talk,
      signature,
      rich
    };
  }

  // ---- 暴露接口 ----
  const API = {
    parseBazi, analyzeCompat, deepReport, personDeep,
    GAN, ZHI, WUXING, GAN_WUXING, ZHI_WUXING, WX_COLOR, ZHI_ANIMAL, SHICHEN_HOUR,
    isLiuHe, isLiuChong, isGanHe, inSameSanHe, relWX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BaziEngine = API;

})(typeof window !== 'undefined' ? window : this);
