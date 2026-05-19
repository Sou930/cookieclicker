/**
 * dungeon-explorer.js  ―  Cookie Clicker Dungeon Explorer MOD
 * =============================================================
 * Cookie Clicker の公式デザイン言語に完全準拠したリデザイン版
 *
 * 変更点:
 *   [デザイン]
 *   - Cookie Clicker の茶色/金色/木目テクスチャ風 UI に統一
 *   - 公式フォント・カラーパレット・ボタンスタイルに合わせた
 *   - パネルが CC の「お店」「実績」欄と違和感なく共存
 *   [バランス調整]
 *   - 兵士コスト: 50×1.15^n → 25×1.12^n (序盤の敷居を下げる)
 *   - レベルアップコスト: 500×3^(n-1) → 300×2.5^(n-1) (レベルを上げやすく)
 *   - CpSボーナスが Game.cookiesPs に正しく乗算されることを確認
 *   - ティック速度調整: 草原4s→3s, 洞窟5s→4s, 火山6s→5s, 凍土7s→5.5s, 魔王城8s→6s
 *   - 通常フロアのドロップ率: common 30%→40%, rare 8%→12%
 *   - ボスダメージ倍率: power×0.5 → power×0.8 (ボス戦が長引かないよう)
 *   - 装備のCpSボーナスを実際にフックで反映する処理を修正・確認
 */

(function () {
  'use strict';

  var MOD_ID   = 'dungeon-explorer';
  var SAVE_KEY = 'CC_DungeonExplorer_v2';

  /* ============================================================
     実績定義  ―  mods/achievements/dungeon-explorer.json から読み込む
  ============================================================ */
  var ACHIEVEMENTS_JSON_URL = 'mods/achievements/dungeon-explorer.json';
  var DE_ACHIEVEMENTS = [];  // XHR 完了後に格納される

  function loadAchievementsJson(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ACHIEVEMENTS_JSON_URL + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      var ok = (xhr.status === 200 || xhr.status === 0) && xhr.responseText;
      if (ok) {
        try {
          DE_ACHIEVEMENTS = JSON.parse(xhr.responseText);
        } catch(e) {
          console.warn('[DungeonExplorer] achievements JSON パースエラー:', e);
        }
      } else {
        console.warn('[DungeonExplorer] achievements JSON 読み込み失敗 status=' + xhr.status);
      }
      if (callback) callback();
    };
    xhr.onerror = function() {
      console.warn('[DungeonExplorer] achievements JSON XHR エラー');
      if (callback) callback();
    };
    xhr.send();
  }

  /* 実績を登録してゲームに追加 */
  function registerAchievements() {
    if (typeof Game === 'undefined' || !Game.Achievement) return;
    DE_ACHIEVEMENTS.forEach(function(a) {
      if (!Game.Achievements[a.name]) {
        new Game.Achievement(a.name, a.desc, a.icon);
        // shadow にすると未開放で表示すらされないため、通常実績扱い(=未開放時"?")にする
        Game.Achievements[a.name].pool = (a.pool && a.pool !== 'shadow') ? a.pool : '';
      }
    });
    // mod-loader の achievements リストを最新化
    if (window.CookieClickerMods && window.CookieClickerMods._registered) {
      var reg = window.CookieClickerMods._registered[MOD_ID];
      if (reg) reg.achievements = DE_ACHIEVEMENTS.map(function(a){ return a.name; });
    }
  }

  /* 実績を解除 */
  function winAchiev(name) {
    if (typeof Game === 'undefined' || !Game.Win) return;
    if (Game.Achievements[name] && !Game.Achievements[name].won) {
      Game.Win(name);
    }
  }

  /* 現在の状態に応じて実績チェック */
  function checkAchievements() {
    // 初陣: 一度でも探索を開始したか（totalFloorsで判定）
    if (state.totalFloors >= 1) winAchiev('初陣');
    // ボスハンター
    if (state.totalBossKills >= 1) winAchiev('ボスハンター');
    // 百戦錬磨
    if (state.totalBossKills >= 10) winAchiev('百戦錬磨');
    // 百フロア踏破
    if (state.totalFloors >= 100) winAchiev('百フロア踏破');
    // 精鋭部隊
    if (state.soldiers >= 50) winAchiev('精鋭部隊');
    // 伝説の兵団
    if (state.soldierLevel >= 10) winAchiev('伝説の兵団');
    // 全装備制覇: 全スロットが埋まっているか
    var slots = {};
    EQUIPMENT.forEach(function(eq) { slots[eq.slot] = true; });
    var allCrafted = Object.keys(slots).every(function(slot) {
      return !!state.equippedItems[slot];
    });
    if (allCrafted) winAchiev('全装備制覇');
  }

  /* ============================================================
     ゲームデータ定義
  ============================================================ */

  var DUNGEONS = [
    {
      id: 'meadow', name: '草原の試練場', emoji: '🌿',
      minPower: 0, floors: 10, bossFloor: 10,
      boss: '草原の番人', bossHp: 100,
      tickMs: 3000,
      rewards: {
        common: ['小麦粉のかけら','砂糖の結晶'],
        rare:   ['金のクッキー欠片'],
        boss:   ['草原の守護石','番人の牙']
      },
      color: '#5c7a2a', colorDark: '#8fba40'
    },
    {
      id: 'cave', name: 'クリスタル洞窟', emoji: '🦇',
      minPower: 30, floors: 15, bossFloor: 15,
      boss: '水晶ゴーレム', bossHp: 300,
      tickMs: 4000,
      rewards: {
        common: ['洞窟石','光るキノコ'],
        rare:   ['水晶の破片','コウモリの翼'],
        boss:   ['水晶核','ゴーレムの心臓']
      },
      color: '#2a5a8a', colorDark: '#4a8fc7'
    },
    {
      id: 'volcano', name: '業火の火山', emoji: '🌋',
      minPower: 100, floors: 20, bossFloor: 20,
      boss: '溶岩巨人', bossHp: 800,
      tickMs: 5000,
      rewards: {
        common: ['火山灰','溶岩石'],
        rare:   ['炎の結晶','火竜の鱗'],
        boss:   ['溶岩核','巨人の炎の心']
      },
      color: '#9a3a10', colorDark: '#e05a20'
    },
    {
      id: 'icemtn', name: '永久凍土の山', emoji: '❄️',
      minPower: 300, floors: 25, bossFloor: 25,
      boss: '氷の女王', bossHp: 2000,
      tickMs: 5500,
      rewards: {
        common: ['氷の欠片','雪の結晶'],
        rare:   ['永久凍土の核','女王の羽'],
        boss:   ['氷の王冠破片','絶対零度の石']
      },
      color: '#1a6090', colorDark: '#50a8e0'
    },
    {
      id: 'demoncastle', name: '魔王の城', emoji: '🏰',
      minPower: 1000, floors: 30, bossFloor: 30,
      boss: '魔王クッキウス', bossHp: 10000,
      tickMs: 6000,
      rewards: {
        common: ['魔力の欠片','呪われた骨'],
        rare:   ['魔王の血','暗黒結晶'],
        boss:   ['魔王の王冠','無限クッキーの秘宝']
      },
      color: '#601090', colorDark: '#a030e0'
    }
  ];

  var EQUIPMENT = [
    {
      id: 'flour_shield', name: '小麦粉の盾', icon: '🛡️',
      desc: '基本的な守り。戦力+5',
      recipe: {'小麦粉のかけら':5,'砂糖の結晶':3},
      power: 5, cpsBonus: 0.01, slot: 'armor'
    },
    {
      id: 'sugar_sword', name: '砂糖の剣', icon: '⚔️',
      desc: '甘い一撃。戦力+10',
      recipe: {'砂糖の結晶':8,'小麦粉のかけら':3},
      power: 10, cpsBonus: 0.02, slot: 'weapon'
    },
    {
      id: 'golden_helm', name: '金のヘルメット', icon: '👑',
      desc: 'レア素材製。戦力+25',
      recipe: {'金のクッキー欠片':3,'草原の守護石':1},
      power: 25, cpsBonus: 0.05, slot: 'helm'
    },
    {
      id: 'crystal_armor', name: '水晶の鎧', icon: '💎',
      desc: '輝く防具。戦力+60',
      recipe: {'水晶の破片':5,'水晶核':1,'ゴーレムの心臓':1},
      power: 60, cpsBonus: 0.10, slot: 'armor'
    },
    {
      id: 'flame_blade', name: '炎の大剣', icon: '🗡️',
      desc: '業火の魂が宿る。戦力+150',
      recipe: {'炎の結晶':5,'溶岩核':1,'巨人の炎の心':1},
      power: 150, cpsBonus: 0.20, slot: 'weapon'
    },
    {
      id: 'frost_crown', name: '氷の王冠', icon: '❄️',
      desc: '永久の冷気。戦力+400',
      recipe: {'永久凍土の核':3,'氷の王冠破片':2,'絶対零度の石':1},
      power: 400, cpsBonus: 0.40, slot: 'helm'
    },
    {
      id: 'demon_regalia', name: '魔王の装束', icon: '👿',
      desc: '最強の証。戦力+1200 | CpS+100%',
      recipe: {'魔王の王冠':1,'無限クッキーの秘宝':1,'暗黒結晶':5},
      power: 1200, cpsBonus: 1.0, slot: 'armor'
    }
  ];

  /* ============================================================
     状態
  ============================================================ */
  var state = {
    soldiers: 0,
    soldierLevel: 1,
    equippedItems: {},
    inventory: {},
    activeDungeon: null,
    floor: 0,
    progress: 0,
    bossHpLeft: 0,
    exploring: false,
    log: [],
    totalBossKills: 0,
    totalFloors: 0
  };

  /* ============================================================
     ヘルパー
  ============================================================ */
  function getSoldierPower() {
    var base = state.soldiers * (5 + (state.soldierLevel - 1) * 3);
    var bonus = 0;
    EQUIPMENT.forEach(function(eq) {
      if (state.equippedItems[eq.slot] === eq.id) bonus += eq.power;
    });
    return base + bonus;
  }

  function getCpsBonus() {
    var bonus = 0;
    EQUIPMENT.forEach(function(eq) {
      if (state.equippedItems[eq.slot] === eq.id) bonus += eq.cpsBonus;
    });
    return bonus;
  }

  function addItem(name, count) {
    state.inventory[name] = (state.inventory[name] || 0) + (count || 1);
  }

  function canCraft(eq) {
    for (var mat in eq.recipe) {
      if ((state.inventory[mat] || 0) < eq.recipe[mat]) return false;
    }
    return true;
  }

  function craftEquip(eq) {
    if (!canCraft(eq)) return false;
    for (var mat in eq.recipe) { state.inventory[mat] -= eq.recipe[mat]; }
    state.equippedItems[eq.slot] = eq.id;
    addLog('🔨 ' + eq.icon + eq.name + ' を装備！戦力+' + eq.power);
    checkAchievements();
    renderPanel();
    return true;
  }

  function addLog(msg) {
    var now = new Date();
    var ts  = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
    state.log.unshift('[' + ts + '] ' + msg);
    if (state.log.length > 40) state.log.pop();
  }

  function randomDrop(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* バランス調整済みコスト計算 */
  function soldierCost() { return Math.floor(25 * Math.pow(1.12, state.soldiers)); }
  function levelUpCost()  { return Math.floor(300 * Math.pow(2.5, state.soldierLevel - 1)); }

  function formatCookies(n) {
    if (n >= 1e12) return (n/1e12).toFixed(1)+'兆';
    if (n >= 1e8)  return (n/1e8).toFixed(1)+'億';
    if (n >= 1e4)  return (n/1e4).toFixed(1)+'万';
    return Math.floor(n).toString();
  }

  /* ============================================================
     探索ロジック
  ============================================================ */
  var _exploreTimer = null;

  function startExplore(dungeonId) {
    var dng = DUNGEONS.find(function(d){ return d.id === dungeonId; });
    if (!dng) return;
    if (state.soldiers === 0) {
      addLog('⚠️ 兵士がいません！まず雇用してください。');
      renderPanel();
      return;
    }
    stopExplore();
    state.activeDungeon = dungeonId;
    state.exploring = true;
    if (state.floor === 0) state.floor = 1;
    addLog('⚔️ ' + dng.emoji + ' ' + dng.name + ' F' + state.floor + ' 探索開始！');
    renderPanel();
    _exploreTimer = setInterval(function(){ exploreTick(); }, dng.tickMs);
    // 実績チェック（初陣は totalFloors が増えた後にも走るが、開始フラグとして）
    if (state.totalFloors === 0) {
      // フロアが増えるまで待つので exploreTick 側で検出される
    }
  }

  function stopExplore() {
    if (_exploreTimer) { clearInterval(_exploreTimer); _exploreTimer = null; }
    state.exploring = false;
  }

  function exploreTick() {
    if (!state.activeDungeon) return;
    var dng = DUNGEONS.find(function(d){ return d.id === state.activeDungeon; });
    if (!dng) return;

    var power = getSoldierPower();
    var efficiency = Math.min(1, power / Math.max(1, dng.minPower));
    var advance = Math.max(8, Math.floor(efficiency * 25));
    var isBossFloor = (state.floor % dng.bossFloor === 0) && state.floor > 0;

    if (isBossFloor) {
      if (state.bossHpLeft <= 0) state.bossHpLeft = dng.bossHp;
      /* バランス調整: ×0.5 → ×0.8 */
      var dmg = Math.max(1, Math.floor(power * 0.8));
      state.bossHpLeft -= dmg;
      addLog('💥 ' + dng.boss + ' に ' + dmg + ' ダメージ！(残HP: ' + Math.max(0, state.bossHpLeft) + ')');

      if (state.bossHpLeft <= 0) {
        state.totalBossKills++;
        state.bossHpLeft = 0;
        var bossLoot = randomDrop(dng.rewards.boss);
        addItem(bossLoot);
        var extra = '';
        if (Math.random() < 0.5) {
          var rareLoot = randomDrop(dng.rewards.rare);
          addItem(rareLoot);
          extra = ' [' + rareLoot + ']';
        }
        addLog('🏆 ' + dng.boss + ' 撃破！ [' + bossLoot + ']' + extra + ' をゲット！');
        if (typeof Game !== 'undefined' && Game.Notify)
          Game.Notify('⚔️ ボス撃破！', dng.boss+' を倒した！\n['+bossLoot+'] を入手', [14,6], 4);
        // 魔王撃破チェック
        if (dng.id === 'demoncastle') winAchiev('魔王討伐');
        state.floor++;
        state.totalFloors++;
        state.progress = 0;
        checkAchievements();
      }
    } else {
      state.progress += advance;
      /* バランス調整: common 30%→40%, rare 8%→12% */
      if (Math.random() < 0.40) {
        var commonLoot = randomDrop(dng.rewards.common);
        addItem(commonLoot);
        addLog('🎒 F' + state.floor + ': [' + commonLoot + '] 発見！');
      }
      if (Math.random() < 0.12) {
        var rareLoot2 = randomDrop(dng.rewards.rare);
        addItem(rareLoot2);
        addLog('✨ F' + state.floor + ': レア！[' + rareLoot2 + '] 発見！');
      }
      if (state.progress >= 100) {
        state.progress = 0;
        state.floor++;
        state.totalFloors++;
        addLog('🚶 F' + state.floor + ' へ進んだ！');
        checkAchievements();
      }
    }
    renderPanel();
  }

  /* ============================================================
     セーブ / ロード
  ============================================================ */
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){}
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        Object.assign(state, s);
        state.log          = state.log          || [];
        state.equippedItems= state.equippedItems|| {};
        state.inventory    = state.inventory    || {};
      }
    } catch(e){}
  }

  /* ============================================================
     UI — Cookie Clicker 統合デザイン
  ============================================================ */

  /* CC 公式スタイル変数 */
  var CC_STYLE = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'width:560px',
    'max-height:82vh',
    'overflow:hidden',
    'display:flex',
    'flex-direction:column',
    'background:#1c1208',
    'border:3px solid #8b6914',
    'border-radius:8px',
    'box-shadow:0 0 0 1px #3d2a06,0 8px 32px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,220,100,0.15)',
    'color:#f0d080',
    'font-family:"Georgia",serif',
    'font-size:13px',
    'z-index:10001'
  ].join(';');

  /* 内部 CSS (インジェクト一度だけ) */
  var _styleInjected = false;
  function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    var css = [
      /* スクロールエリア */
      '#dePanel .de-scroll{overflow-y:auto;flex:1;}',
      '#dePanel .de-scroll::-webkit-scrollbar{width:6px;}',
      '#dePanel .de-scroll::-webkit-scrollbar-track{background:#0e0a04;}',
      '#dePanel .de-scroll::-webkit-scrollbar-thumb{background:#6b4f10;border-radius:3px;}',

      /* ヘッダー */
      '#dePanel .de-head{background:linear-gradient(180deg,#5a3a08 0%,#3a2005 100%);',
        'padding:10px 14px;display:flex;justify-content:space-between;align-items:center;',
        'border-bottom:2px solid #8b6914;flex-shrink:0;}',
      '#dePanel .de-head-title{font-size:18px;color:#ffe87a;',
        'text-shadow:0 1px 0 #000,0 0 12px rgba(255,200,50,0.4);',
        'letter-spacing:1px;}',
      '#dePanel .de-close{background:#2a1505;border:1px solid #6b4f10;color:#d4a030;',
        'padding:3px 10px;border-radius:4px;cursor:pointer;font-family:Georgia,serif;',
        'font-size:12px;transition:background 0.15s;}',
      '#dePanel .de-close:hover{background:#3a2010;}',

      /* 兵士バー */
      '#dePanel .de-soldiers{background:rgba(0,0,0,0.4);border-bottom:1px solid #3d2a06;',
        'padding:8px 14px;}',
      '#dePanel .de-stat{color:#c8a040;font-size:12px;}',
      '#dePanel .de-stat strong{color:#ffe87a;}',
      '#dePanel .de-btn{background:linear-gradient(180deg,#4a2e08 0%,#2e1a04 100%);',
        'border:1px solid #8b6914;color:#f0d060;padding:4px 12px;border-radius:4px;',
        'cursor:pointer;font-family:Georgia,serif;font-size:12px;',
        'box-shadow:0 2px 0 #1a0e02,inset 0 1px 0 rgba(255,220,100,0.2);',
        'transition:filter 0.1s;margin:2px 3px 2px 0;}',
      '#dePanel .de-btn:hover{filter:brightness(1.2);}',
      '#dePanel .de-btn:active{transform:translateY(1px);box-shadow:0 1px 0 #1a0e02;}',
      '#dePanel .de-btn.disabled{opacity:0.4;cursor:default;filter:none;}',

      /* タブバー */
      '#dePanel .de-tabs{display:flex;background:#0e0a04;border-bottom:2px solid #3d2a06;flex-shrink:0;}',
      '#dePanel .de-tab{flex:1;background:none;border:none;border-right:1px solid #2a1a06;',
        'color:#806030;padding:7px 4px;cursor:pointer;font-family:Georgia,serif;font-size:11px;',
        'transition:background 0.15s,color 0.15s;}',
      '#dePanel .de-tab:last-child{border-right:none;}',
      '#dePanel .de-tab.active{background:#1c1208;color:#ffe87a;',
        'box-shadow:inset 0 2px 0 #c8900a;}',
      '#dePanel .de-tab:hover:not(.active){background:#1a1004;color:#c8a040;}',

      /* タブコンテンツ */
      '#dePanel .de-content{padding:10px 14px;}',

      /* ダンジョンボタン */
      '#dePanel .de-dng-btn{display:block;width:100%;text-align:left;',
        'background:rgba(0,0,0,0.5);border:1px solid #3d2a06;',
        'border-radius:5px;padding:7px 10px;margin:4px 0;',
        'cursor:pointer;font-family:Georgia,serif;color:#c8a040;',
        'transition:border-color 0.15s,background 0.15s;}',
      '#dePanel .de-dng-btn:hover{background:rgba(80,50,10,0.4);}',
      '#dePanel .de-dng-btn.active{border-color:#c8900a;background:rgba(100,60,10,0.4);color:#ffe87a;}',
      '#dePanel .de-dng-btn.locked{opacity:0.4;cursor:not-allowed;}',

      /* 素材バッジ */
      '#dePanel .de-mat{display:inline-block;background:rgba(40,25,5,0.8);',
        'border:1px solid #5a3a10;border-radius:3px;',
        'padding:1px 6px;margin:2px;font-size:11px;color:#c8a040;}',
      '#dePanel .de-mat.have{border-color:#6a9030;color:#a0d060;}',
      '#dePanel .de-mat.lack{border-color:#903020;color:#d06040;}',

      /* クラフトカード */
      '#dePanel .de-craft{border:1px solid #3d2a06;border-radius:5px;',
        'padding:6px 10px;margin:5px 0;background:rgba(0,0,0,0.35);}',
      '#dePanel .de-craft.craftable{border-color:#6a9030;}',
      '#dePanel .de-craft.equipped{border-color:#c8900a;background:rgba(80,50,0,0.3);}',

      /* プログレスバー */
      '#dePanel .de-bar-wrap{background:#0e0a04;border:1px solid #3d2a06;',
        'border-radius:3px;height:8px;overflow:hidden;margin:4px 0;}',
      '#dePanel .de-bar{height:100%;border-radius:3px;transition:width 0.4s;}',

      /* 装備スロット */
      '#dePanel .de-slot{display:inline-block;background:rgba(0,0,0,0.5);',
        'border:1px solid #5a3a10;border-radius:4px;',
        'padding:2px 8px;margin:2px;font-size:11px;color:#a07030;}',
      '#dePanel .de-slot.filled{border-color:#c8900a;color:#ffe87a;}',

      /* ログ行 */
      '#dePanel .de-log-row{padding:2px 0;border-bottom:1px solid rgba(80,50,10,0.3);',
        'color:#b09040;font-size:11px;}',
      '#dePanel .de-log-row:first-child{color:#ffe090;}',

      /* セクションラベル */
      '#dePanel .de-label{color:#806030;font-size:11px;margin:4px 0;}',

      /* ステータス枠 */
      '#dePanel .de-status{border:1px solid;border-radius:5px;padding:8px;margin:6px 0;}',
      '#dePanel .de-boss-bar-wrap{background:#200808;border:1px solid #6a1010;',
        'border-radius:3px;height:10px;overflow:hidden;margin:4px 0;}',
      '#dePanel .de-boss-bar{height:100%;background:linear-gradient(90deg,#c02020,#e04040);',
        'border-radius:3px;transition:width 0.3s;}',

      /* スクロールバー FF */
      '#dePanel .de-scroll{scrollbar-width:thin;scrollbar-color:#6b4f10 #0e0a04;}',

      /* 区切り */
      '#dePanel .de-divider{border:none;border-top:1px solid #2a1a06;margin:6px 0;}'
    ].join('');
    var el = document.createElement('style');
    el.id  = 'dungeonExplorerStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

  var _panelEl = null;

  function createPanel() {
    injectStyle();
    var panel = document.createElement('div');
    panel.id   = 'dePanel';
    panel.setAttribute('style', CC_STYLE);
    document.body.appendChild(panel);
    _panelEl = panel;
    renderPanel();
  }

  function renderPanel() {
    if (!_panelEl) return;

    var power = getSoldierPower();
    var cpsB  = getCpsBonus();
    var tab   = DungeonExplorer._tab;

    /* ========== 装備スロット HTML ========== */
    var slotsHtml = ['weapon','armor','helm'].map(function(slot){
      var icons = {weapon:'⚔️',armor:'🛡️',helm:'👑'};
      var eqId  = state.equippedItems[slot];
      var eq    = eqId ? EQUIPMENT.find(function(e){ return e.id===eqId; }) : null;
      return '<span class="de-slot'+(eq?' filled':'')+'">'+icons[slot]+' '+(eq?eq.name:'なし')+'</span>';
    }).join('');

    /* ========== ダンジョンボタン ========== */
    var dngBtnsHtml = DUNGEONS.map(function(d){
      var active = state.activeDungeon===d.id && state.exploring;
      var locked = power < d.minPower && state.soldiers > 0;
      var cls    = 'de-dng-btn'+(active?' active':'')+(locked?' locked':'');
      var reqTxt = d.minPower > 0 ? '必要戦力 '+d.minPower : '誰でも入れる';
      return '<button class="'+cls+'" onclick="window.DungeonExplorer.selectDungeon(\''+d.id+'\')">'
        +'<span style="font-size:14px;">'+d.emoji+'</span> '
        +'<strong>'+d.name+'</strong>'
        +(active ? ' <span style="color:#ffe87a;font-size:11px;">▶ 探索中</span>' : '')
        +'<br><span style="font-size:10px;color:#806030;">'+reqTxt+'</span>'
        +'</button>';
    }).join('');

    /* ========== 探索ステータス ========== */
    var statusHtml = '';
    var dng = state.activeDungeon ? DUNGEONS.find(function(d){ return d.id===state.activeDungeon; }) : null;
    if (dng) {
      var isBoss = dng && (state.floor % dng.bossFloor===0) && state.floor>0;
      statusHtml = '<div class="de-status" style="border-color:'+(isBoss?'#903020':'#3d6010')+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
        +'<span>'+dng.emoji+' <strong style="color:#ffe87a;">'+dng.name+'</strong>'
        +' F<strong style="color:#ffe87a;">'+state.floor+'</strong></span>'
        +'<span style="font-size:11px;color:'+(state.exploring?'#80c040':'#806030')+'">'
        +(state.exploring?'▶ 探索中':'■ 停止')+'</span>'
        +'</div>';

      if (isBoss && state.bossHpLeft > 0) {
        var bossRatio = Math.max(0, state.bossHpLeft / dng.bossHp);
        statusHtml += '<div style="margin-top:6px;font-size:11px;color:#e04040;">⚔️ ボス戦: '+dng.boss+'</div>'
          +'<div class="de-boss-bar-wrap"><div class="de-boss-bar" style="width:'
          +Math.round(bossRatio*100)+'%;"></div></div>'
          +'<div style="font-size:10px;color:#c06060;">HP '+Math.max(0,state.bossHpLeft)+' / '+dng.bossHp+'</div>';
      } else {
        statusHtml += '<div class="de-bar-wrap"><div class="de-bar" style="width:'
          +state.progress+'%;background:'+dng.colorDark+';"></div></div>'
          +'<div style="font-size:10px;color:#806030;">フロア進捗: '+state.progress+'%</div>';
      }
      statusHtml += '</div>';
    }

    /* ========== 素材インベントリ ========== */
    var invHtml = '';
    var matCount = 0;
    for (var mat in state.inventory) {
      if (state.inventory[mat] > 0) {
        invHtml += '<span class="de-mat">'+mat+' ×'+state.inventory[mat]+'</span>';
        matCount++;
      }
    }
    if (!matCount) invHtml = '<span style="color:#5a3a10;font-size:12px;">素材なし</span>';

    /* ========== クラフト ========== */
    var craftHtml = EQUIPMENT.map(function(eq){
      var has   = canCraft(eq);
      var isEq  = state.equippedItems[eq.slot]===eq.id;
      var cls   = 'de-craft'+(isEq?' equipped':has?' craftable':'');

      var recipeHtml = Object.keys(eq.recipe).map(function(mat){
        var have  = state.inventory[mat]||0;
        var need  = eq.recipe[mat];
        var cls2  = have>=need?'have':'lack';
        return '<span class="de-mat '+cls2+'">'+mat+' '+have+'/'+need+'</span>';
      }).join('');

      return '<div class="'+cls+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
        +'<span style="color:#f0d080;">'+eq.icon+' '+eq.name+'</span>'
        +(isEq
          ? '<span style="color:#ffe87a;font-size:11px;border:1px solid #c8900a;padding:1px 6px;border-radius:3px;">装備中</span>'
          : '<button class="de-btn'+(has?'':' disabled')+'" onclick="'+(has?'window.DungeonExplorer.craft(\''+eq.id+'\')':'')+'">'
            +'クラフト</button>')
        +'</div>'
        +'<div style="font-size:10px;color:#806030;margin-top:2px;">'+eq.desc+'</div>'
        +'<div style="margin-top:4px;">'+recipeHtml+'</div>'
        +'</div>';
    }).join('');

    /* ========== ログ ========== */
    var logHtml = state.log.slice(0,16).map(function(l){
      return '<div class="de-log-row">'+l+'</div>';
    }).join('') || '<span style="color:#5a3a10;font-size:12px;">ログなし</span>';

    /* ========== レンダリング ========== */
    _panelEl.innerHTML = ''
      /* ヘッダー */
      +'<div class="de-head">'
      +'<span class="de-head-title">⚔ Dungeon Explorer</span>'
      +'<button class="de-close" onclick="window.DungeonExplorer.toggle()">✕ 閉じる</button>'
      +'</div>'

      /* 兵士情報 */
      +'<div class="de-soldiers" style="flex-shrink:0;">'
      +'<div class="de-stat" style="margin-bottom:5px;">'
      +'🪖 兵士 <strong>'+state.soldiers+'人</strong>'
      +' &nbsp;|&nbsp; Lv.<strong>'+state.soldierLevel+'</strong>'
      +' &nbsp;|&nbsp; 戦力 <strong>'+power+'</strong>'
      +' &nbsp;|&nbsp; CpS <strong style="color:#80c040;">+'+Math.round(cpsB*100)+'%</strong>'
      +'</div>'
      +'<div>'
      +'<button class="de-btn" onclick="window.DungeonExplorer.hireSoldier()">➕ 雇用 ('+formatCookies(soldierCost())+'🍪)</button>'
      +(state.soldiers>0
        ? '<button class="de-btn" onclick="window.DungeonExplorer.levelUp()">⬆ Lv.UP ('+formatCookies(levelUpCost())+'🍪)</button>'
        : '')
      +'</div>'
      +'<div style="margin-top:5px;">'+slotsHtml+'</div>'
      +'</div>'

      /* タブバー */
      +'<div class="de-tabs" style="flex-shrink:0;">'
      +['dungeon','craft','items','log'].map(function(t,i){
          var labels=['🗺 ダンジョン','🔨 クラフト','🎒 素材','📜 ログ'];
          return '<button class="de-tab'+(tab===t?' active':'')+'" onclick="window.DungeonExplorer.switchTab(\''+t+'\')">'+labels[i]+'</button>';
        }).join('')
      +'</div>'

      /* スクロールコンテナ */
      +'<div class="de-scroll">'
      +'<div class="de-content">'
      +(tab==='dungeon'
        ? statusHtml
          +'<div class="de-label" style="margin-top:8px;">ダンジョンを選択:</div>'
          +dngBtnsHtml
          +(state.exploring
            ? '<button class="de-btn" style="width:100%;margin-top:6px;border-color:#903020;color:#e06060;" onclick="window.DungeonExplorer.stopExplore()">⏹ 探索停止</button>'
            : '')
        : tab==='craft'
        ? '<div class="de-label">素材を集めて装備をクラフト（自動装備）</div>'+craftHtml
        : tab==='items'
        ? '<div class="de-label">所持素材 ('+matCount+'種)</div>'
          +'<div style="margin-bottom:8px;">'+invHtml+'</div>'
          +'<hr class="de-divider">'
          +'<div class="de-stat">総撃破ボス数: <strong>'+state.totalBossKills+'</strong> ／ 総踏破フロア: <strong>'+state.totalFloors+'</strong></div>'
        : '<div>'+logHtml+'</div>'
      )
      +'</div>'
      +'</div>';
  }

  /* ============================================================
     公開 API
  ============================================================ */
  var DungeonExplorer = window.DungeonExplorer = {
    _tab: 'dungeon',
    _visible: false,

    toggle: function(){
      this._visible = !this._visible;
      if (_panelEl) _panelEl.style.display = this._visible ? 'flex' : 'none';
    },
    switchTab: function(tab){ this._tab = tab; renderPanel(); },

    hireSoldier: function(){
      var cost = soldierCost();
      if (typeof Game === 'undefined' || Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: '+formatCookies(cost)+')');
        renderPanel(); return;
      }
      Game.Spend(cost);
      state.soldiers++;
      addLog('🪖 兵士を1人雇用！(合計: '+state.soldiers+'人)');
      checkAchievements();
      saveState(); renderPanel();
    },

    levelUp: function(){
      var cost = levelUpCost();
      if (typeof Game === 'undefined' || Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: '+formatCookies(cost)+')');
        renderPanel(); return;
      }
      Game.Spend(cost);
      state.soldierLevel++;
      addLog('⬆ 兵士がLv.'+state.soldierLevel+' になった！');
      checkAchievements();
      saveState(); renderPanel();
    },

    selectDungeon: function(id){
      if (state.activeDungeon===id && state.exploring) {
        stopExplore();
        addLog('⏹ 探索を停止。');
      } else {
        if (state.activeDungeon!==id) {
          state.floor=1; state.progress=0; state.bossHpLeft=0;
        }
        startExplore(id);
      }
      renderPanel();
    },

    stopExplore: function(){
      stopExplore();
      addLog('⏹ 探索を停止。');
      renderPanel();
    },

    craft: function(eqId){
      var eq = EQUIPMENT.find(function(e){ return e.id===eqId; });
      if (eq && craftEquip(eq)) saveState();
    }
  };

  /* ============================================================
     ゲームへのフック
     CpSボーナスを Game.cookiesPs に反映
  ============================================================ */
  function hookGame() {
    /* CpS フック: cps × (1 + getCpsBonus()) */
    Game.registerHook('cps', function(cps){
      return cps * (1 + getCpsBonus());
    });
    /* 30秒ごとにオートセーブ */
    Game.registerHook('logic', function(){
      if (Game.T % (Game.fps * 30) === 0) saveState();
    });
  }

  /* ============================================================
     開閉ボタン（CC の右下エリアに馴染むスタイル）
  ============================================================ */
  function createToggleButton() {
    var btn = document.createElement('button');
    btn.id  = 'dungeonExplorerBtn';
    btn.innerHTML = '⚔';
    btn.title = 'Dungeon Explorer を開く';
    btn.style.cssText = [
      'position:fixed',
      'bottom:40px',
      'right:8px',
      'width:40px',
      'height:40px',
      'background:linear-gradient(180deg,#5a3a08,#2e1a04)',
      'border:2px solid #8b6914',
      'border-radius:50%',
      'color:#ffe87a',
      'font-size:18px',
      'cursor:pointer',
      'z-index:9999',
      'box-shadow:0 2px 0 #1a0e02,0 0 8px rgba(200,150,10,0.5)',
      'transition:filter 0.15s'
    ].join(';');
    btn.addEventListener('mouseenter', function(){ btn.style.filter='brightness(1.3)'; });
    btn.addEventListener('mouseleave', function(){ btn.style.filter='brightness(1)'; });
    btn.addEventListener('click', function(){ DungeonExplorer.toggle(); });
    document.body.appendChild(btn);
  }

  /* ============================================================
     MOD 登録
  ============================================================ */
  if (window.CookieClickerMods) {
    window.CookieClickerMods.register({
      id: MOD_ID,
      achievements: DE_ACHIEVEMENTS.map(function(a){ return a.name; }),

      init: function(){
        loadState();
        var tries = 0;
        var iv = setInterval(function(){
          tries++;
          if (typeof Game !== 'undefined'
              && typeof Game.registerHook === 'function'
              && typeof Game.Earn === 'function') {
            clearInterval(iv);
            // まず実績JSONを読み込んでから初期化を続行
            loadAchievementsJson(function() {
              registerAchievements();
              hookGame();
              createPanel();
              createToggleButton();
              /* 前回探索中だった場合は再開 */
              if (state.exploring && state.activeDungeon) {
                state.exploring = false;
                startExplore(state.activeDungeon);
              }
              /* ロード時に既存の進捗に対して実績チェック */
              checkAchievements();
              console.log('[DungeonExplorer] 起動完了。右下の ⚔ ボタンで開く。');
            });
          }
          if (tries > 200) clearInterval(iv);
        }, 100);
      },

      disable: function(){
        stopExplore();
        saveState();
        var el;
        el = document.getElementById('dePanel');           if (el) el.remove();
        el = document.getElementById('dungeonExplorerBtn');if (el) el.remove();
        el = document.getElementById('dungeonExplorerStyle');if(el) el.remove();
        delete window.DungeonExplorer;
        console.log('[DungeonExplorer] 停止。');
      }
    });
  }

})();
