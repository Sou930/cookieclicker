/**
 * dungeon-explorer.js  ―  Cookie Clicker Dungeon Explorer MOD
 * =============================================================
 * 変更点 (今回):
 *   - フローティングパネル & 右下 ⚔ ボタンを廃止
 *   - パネル UI を MOD タブ (Mod設定) 内に完全埋め込み
 *   - デザインを Cookie Clicker 公式の木目/金色トーンで美しく刷新
 *     (グラデーション・微細な影・洗練されたタブ・カード型レイアウト)
 *   - 起動毎に MOD 実績通知が再発火するバグを修正
 *     (won 状態を MOD 側 SAVE_KEY に保存し、ロード時は
 *      Game.Win を使わず won=1 を直接復元することで通知を抑制)
 */

(function () {
  'use strict';

  var MOD_ID   = 'dungeon-explorer';
  var SAVE_KEY = 'CC_DungeonExplorer_v2';

  /* ============================================================
     実績定義
  ============================================================ */
  var ACHIEVEMENTS_JSON_URL = 'mods/achievements/dungeon-explorer.json';
  var DE_ACHIEVEMENTS = [];

  function loadAchievementsJson(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ACHIEVEMENTS_JSON_URL + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      var ok = (xhr.status === 200 || xhr.status === 0) && xhr.responseText;
      if (ok) {
        try { DE_ACHIEVEMENTS = JSON.parse(xhr.responseText); }
        catch(e) { console.warn('[DungeonExplorer] achievements JSON パースエラー:', e); }
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

  function registerAchievements() {
    if (typeof Game === 'undefined' || !Game.Achievement) return;
    DE_ACHIEVEMENTS.forEach(function(a) {
      if (!Game.Achievements[a.name]) {
        new Game.Achievement(a.name, a.desc, a.icon);
        Game.Achievements[a.name].pool = 'mod';
      }
    });
    /* === 通知バグ修正: ロード時の重複通知を避けるため、
           MOD 側で保存していた won 状態を Game.Win を使わず直接復元 === */
    if (state.wonAchievements && state.wonAchievements.length) {
      state.wonAchievements.forEach(function(name) {
        var a = Game.Achievements[name];
        if (a && !a.won) { a.won = 1; a.date = a.date || Date.now(); }
      });
    }
    if (window.CookieClickerMods && window.CookieClickerMods._registered) {
      var reg = window.CookieClickerMods._registered[MOD_ID];
      if (reg) reg.achievements = DE_ACHIEVEMENTS.map(function(a){ return a.name; });
    }
  }

  function winAchiev(name) {
    if (typeof Game === 'undefined' || !Game.Win) return;
    var a = Game.Achievements[name];
    if (!a) return;
    if (state.wonAchievements.indexOf(name) === -1) state.wonAchievements.push(name);
    if (!a.won) Game.Win(name);
  }

  function checkAchievements() {
    if (state.totalFloors    >= 1)   winAchiev('初陣');
    if (state.totalBossKills >= 1)   winAchiev('ボスハンター');
    if (state.totalBossKills >= 10)  winAchiev('百戦錬磨');
    if (state.totalFloors    >= 100) winAchiev('百フロア踏破');
    if (state.soldiers       >= 50)  winAchiev('精鋭部隊');
    if (state.soldierLevel   >= 10)  winAchiev('伝説の兵団');
    var slots = {};
    EQUIPMENT.forEach(function(eq) { slots[eq.slot] = true; });
    var allCrafted = Object.keys(slots).every(function(slot) {
      return !!state.equippedItems[slot];
    });
    if (allCrafted) winAchiev('全装備制覇');
  }

  /* ============================================================
     ゲームデータ
  ============================================================ */
  var DUNGEONS = [
    { id:'meadow', name:'草原の試練場', emoji:'🌿', minPower:0,    floors:10, bossFloor:10, boss:'草原の番人',     bossHp:100,   tickMs:3000,
      rewards:{ common:['小麦粉のかけら','砂糖の結晶'], rare:['金のクッキー欠片'],            boss:['草原の守護石','番人の牙'] },
      color:'#5c7a2a', colorDark:'#8fba40' },
    { id:'cave', name:'クリスタル洞窟', emoji:'🦇', minPower:30,   floors:15, bossFloor:15, boss:'水晶ゴーレム',    bossHp:300,   tickMs:4000,
      rewards:{ common:['洞窟石','光るキノコ'],         rare:['水晶の破片','コウモリの翼'],     boss:['水晶核','ゴーレムの心臓'] },
      color:'#2a5a8a', colorDark:'#4a8fc7' },
    { id:'volcano', name:'業火の火山', emoji:'🌋', minPower:100,  floors:20, bossFloor:20, boss:'溶岩巨人',        bossHp:800,   tickMs:5000,
      rewards:{ common:['火山灰','溶岩石'],             rare:['炎の結晶','火竜の鱗'],           boss:['溶岩核','巨人の炎の心'] },
      color:'#9a3a10', colorDark:'#e05a20' },
    { id:'icemtn', name:'永久凍土の山', emoji:'❄️', minPower:300, floors:25, bossFloor:25, boss:'氷の女王',        bossHp:2000,  tickMs:5500,
      rewards:{ common:['氷の欠片','雪の結晶'],         rare:['永久凍土の核','女王の羽'],       boss:['氷の王冠破片','絶対零度の石'] },
      color:'#1a6090', colorDark:'#50a8e0' },
    { id:'demoncastle', name:'魔王の城', emoji:'🏰', minPower:1000, floors:30, bossFloor:30, boss:'魔王クッキウス', bossHp:10000, tickMs:6000,
      rewards:{ common:['魔力の欠片','呪われた骨'],     rare:['魔王の血','暗黒結晶'],           boss:['魔王の王冠','無限クッキーの秘宝'] },
      color:'#601090', colorDark:'#a030e0' }
  ];

  var EQUIPMENT = [
    { id:'flour_shield', name:'小麦粉の盾', icon:'🛡️', desc:'基本的な守り。戦力+5',
      recipe:{'小麦粉のかけら':5,'砂糖の結晶':3}, power:5, cpsBonus:0.01, slot:'armor' },
    { id:'sugar_sword', name:'砂糖の剣', icon:'⚔️', desc:'甘い一撃。戦力+10',
      recipe:{'砂糖の結晶':8,'小麦粉のかけら':3}, power:10, cpsBonus:0.02, slot:'weapon' },
    { id:'golden_helm', name:'金のヘルメット', icon:'👑', desc:'レア素材製。戦力+25',
      recipe:{'金のクッキー欠片':3,'草原の守護石':1}, power:25, cpsBonus:0.05, slot:'helm' },
    { id:'crystal_armor', name:'水晶の鎧', icon:'💎', desc:'輝く防具。戦力+60',
      recipe:{'水晶の破片':5,'水晶核':1,'ゴーレムの心臓':1}, power:60, cpsBonus:0.10, slot:'armor' },
    { id:'flame_blade', name:'炎の大剣', icon:'🗡️', desc:'業火の魂が宿る。戦力+150',
      recipe:{'炎の結晶':5,'溶岩核':1,'巨人の炎の心':1}, power:150, cpsBonus:0.20, slot:'weapon' },
    { id:'frost_crown', name:'氷の王冠', icon:'❄️', desc:'永久の冷気。戦力+400',
      recipe:{'永久凍土の核':3,'氷の王冠破片':2,'絶対零度の石':1}, power:400, cpsBonus:0.40, slot:'helm' },
    { id:'demon_regalia', name:'魔王の装束', icon:'👿', desc:'最強の証。戦力+1200 | CpS+100%',
      recipe:{'魔王の王冠':1,'無限クッキーの秘宝':1,'暗黒結晶':5}, power:1200, cpsBonus:1.0, slot:'armor' }
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
    totalFloors: 0,
    wonAchievements: []  // 通知重複バグ対策: ここに保存
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
    for (var mat in eq.recipe) if ((state.inventory[mat] || 0) < eq.recipe[mat]) return false;
    return true;
  }
  function craftEquip(eq) {
    if (!canCraft(eq)) return false;
    for (var mat in eq.recipe) state.inventory[mat] -= eq.recipe[mat];
    state.equippedItems[eq.slot] = eq.id;
    addLog('🔨 ' + eq.icon + eq.name + ' を装備！戦力+' + eq.power);
    checkAchievements();
    return true;
  }
  function addLog(msg) {
    var now = new Date();
    var ts  = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
    state.log.unshift('[' + ts + '] ' + msg);
    if (state.log.length > 40) state.log.pop();
  }
  function randomDrop(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
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
      refreshMenu();
      return;
    }
    stopExplore();
    state.activeDungeon = dungeonId;
    state.exploring = true;
    if (state.floor === 0) state.floor = 1;
    addLog('⚔️ ' + dng.emoji + ' ' + dng.name + ' F' + state.floor + ' 探索開始！');
    _exploreTimer = setInterval(function(){ exploreTick(); }, dng.tickMs);
    refreshMenu();
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
        if (dng.id === 'demoncastle') winAchiev('魔王討伐');
        state.floor++;
        state.totalFloors++;
        state.progress = 0;
        checkAchievements();
      }
    } else {
      state.progress += advance;
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
    refreshMenu();
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
        state.log             = state.log             || [];
        state.equippedItems   = state.equippedItems   || {};
        state.inventory       = state.inventory       || {};
        state.wonAchievements = state.wonAchievements || [];
      }
    } catch(e){}
  }

  /* ============================================================
     UI — MOD設定タブ内に埋め込み
  ============================================================ */
  var _styleInjected = false;
  function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    var css = [
      /* ルートカード */
      '.de-root{font-family:Georgia,"Times New Roman",serif;color:#f0d080;',
        'background:radial-gradient(ellipse at top,#241608 0%,#150c04 100%);',
        'border:2px solid #8b6914;border-radius:8px;',
        'box-shadow:inset 0 1px 0 rgba(255,220,100,0.18),inset 0 0 0 1px #3d2a06,',
                   '0 6px 20px rgba(0,0,0,0.5);',
        'padding:0;margin:4px 0;overflow:hidden;}',

      /* タイトル帯 */
      '.de-banner{background:linear-gradient(180deg,#6a4408 0%,#3a2005 100%);',
        'padding:10px 14px;border-bottom:2px solid #8b6914;',
        'display:flex;justify-content:space-between;align-items:center;',
        'box-shadow:inset 0 1px 0 rgba(255,220,100,0.25);}',
      '.de-banner-title{font-size:17px;color:#ffe87a;letter-spacing:1.5px;',
        'text-shadow:0 1px 0 #000,0 0 14px rgba(255,200,50,0.45);}',
      '.de-banner-sub{font-size:11px;color:#c8a040;font-style:italic;}',

      /* ステータスバー */
      '.de-statusbar{background:rgba(0,0,0,0.4);border-bottom:1px solid #3d2a06;',
        'padding:10px 14px;}',
      '.de-stat-row{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#c8a040;align-items:center;}',
      '.de-stat-row strong{color:#ffe87a;}',
      '.de-stat-row .sep{color:#5a3a10;}',
      '.de-cps-pill{display:inline-block;background:rgba(80,150,40,0.15);',
        'border:1px solid #6a9030;color:#a0d060;',
        'padding:1px 8px;border-radius:10px;font-size:11px;}',

      /* アクション */
      '.de-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      '.de-btn{background:linear-gradient(180deg,#5a3a08 0%,#2e1a04 100%);',
        'border:1px solid #8b6914;color:#f0d060;padding:5px 12px;border-radius:5px;',
        'cursor:pointer;font-family:Georgia,serif;font-size:12px;',
        'box-shadow:0 2px 0 #1a0e02,inset 0 1px 0 rgba(255,220,100,0.22);',
        'transition:filter 0.1s,transform 0.05s;}',
      '.de-btn:hover{filter:brightness(1.25);}',
      '.de-btn:active{transform:translateY(1px);box-shadow:0 1px 0 #1a0e02;}',
      '.de-btn.disabled{opacity:0.35;cursor:default;filter:grayscale(0.7);}',
      '.de-btn.danger{border-color:#903020;color:#e08070;}',
      '.de-btn.primary{background:linear-gradient(180deg,#8b6914 0%,#5a3a08 100%);color:#fff3b0;}',

      /* 装備スロット */
      '.de-slots{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}',
      '.de-slot{flex:1;min-width:110px;background:rgba(0,0,0,0.45);',
        'border:1px solid #5a3a10;border-radius:5px;padding:5px 8px;',
        'font-size:11px;color:#a07030;}',
      '.de-slot.filled{border-color:#c8900a;color:#ffe87a;',
        'background:linear-gradient(180deg,rgba(80,50,0,0.4),rgba(40,25,0,0.4));}',
      '.de-slot-label{font-size:10px;color:#806030;text-transform:uppercase;letter-spacing:1px;}',

      /* タブバー */
      '.de-tabs{display:flex;background:#0e0a04;border-bottom:2px solid #3d2a06;}',
      '.de-tab{flex:1;background:none;border:none;border-right:1px solid #2a1a06;',
        'color:#806030;padding:9px 4px;cursor:pointer;font-family:Georgia,serif;font-size:12px;',
        'transition:background 0.15s,color 0.15s;letter-spacing:0.5px;}',
      '.de-tab:last-child{border-right:none;}',
      '.de-tab.active{background:linear-gradient(180deg,#1c1208 0%,#0e0a04 100%);color:#ffe87a;',
        'box-shadow:inset 0 2px 0 #c8900a;}',
      '.de-tab:hover:not(.active){background:#1a1004;color:#c8a040;}',

      /* コンテンツ */
      '.de-content{padding:12px 14px;max-height:520px;overflow-y:auto;}',
      '.de-content::-webkit-scrollbar{width:7px;}',
      '.de-content::-webkit-scrollbar-track{background:#0e0a04;}',
      '.de-content::-webkit-scrollbar-thumb{background:#6b4f10;border-radius:3px;}',

      /* ラベル */
      '.de-label{color:#a08040;font-size:11px;margin:2px 0 6px;',
        'text-transform:uppercase;letter-spacing:1.5px;',
        'border-bottom:1px solid #3d2a06;padding-bottom:4px;}',

      /* ダンジョンカード */
      '.de-dng{display:block;width:100%;text-align:left;',
        'background:linear-gradient(180deg,rgba(30,18,8,0.7),rgba(10,6,2,0.7));',
        'border:1px solid #3d2a06;border-left:3px solid #5a3a10;',
        'border-radius:5px;padding:9px 12px;margin:5px 0;',
        'cursor:pointer;font-family:Georgia,serif;color:#c8a040;',
        'transition:all 0.15s;}',
      '.de-dng:hover{background:linear-gradient(180deg,rgba(60,40,10,0.6),rgba(30,18,8,0.7));',
        'border-left-color:#8b6914;}',
      '.de-dng.active{border-color:#c8900a;border-left-color:#ffe87a;',
        'background:linear-gradient(180deg,rgba(100,70,15,0.5),rgba(50,30,5,0.6));',
        'color:#ffe87a;box-shadow:inset 0 0 12px rgba(255,200,50,0.15);}',
      '.de-dng.locked{opacity:0.35;cursor:not-allowed;}',
      '.de-dng-name{font-size:13px;font-weight:bold;}',
      '.de-dng-req{font-size:10px;color:#806030;margin-top:2px;}',

      /* ステータス枠 */
      '.de-status{border:1px solid;border-radius:6px;padding:10px;margin:0 0 10px;',
        'background:linear-gradient(180deg,rgba(0,0,0,0.5),rgba(0,0,0,0.3));}',

      /* バー */
      '.de-bar-wrap{background:#0e0a04;border:1px solid #3d2a06;',
        'border-radius:4px;height:9px;overflow:hidden;margin:5px 0 2px;',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,0.6);}',
      '.de-bar{height:100%;border-radius:4px;transition:width 0.4s;',
        'box-shadow:0 0 8px currentColor;}',
      '.de-boss-bar-wrap{background:#1a0606;border:1px solid #6a1010;',
        'border-radius:4px;height:11px;overflow:hidden;margin:5px 0 2px;',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,0.7);}',
      '.de-boss-bar{height:100%;background:linear-gradient(90deg,#c02020,#ff5050);',
        'border-radius:4px;transition:width 0.3s;box-shadow:0 0 10px #e04040;}',

      /* 素材バッジ */
      '.de-mat{display:inline-block;background:rgba(40,25,5,0.85);',
        'border:1px solid #5a3a10;border-radius:10px;',
        'padding:2px 8px;margin:2px;font-size:10.5px;color:#c8a040;}',
      '.de-mat.have{border-color:#6a9030;color:#a0d060;',
        'background:rgba(40,70,20,0.4);}',
      '.de-mat.lack{border-color:#903020;color:#d06040;',
        'background:rgba(70,20,15,0.4);}',

      /* クラフトカード */
      '.de-craft{border:1px solid #3d2a06;border-radius:6px;',
        'padding:8px 11px;margin:6px 0;',
        'background:linear-gradient(180deg,rgba(20,12,4,0.7),rgba(10,6,2,0.7));}',
      '.de-craft.craftable{border-color:#6a9030;',
        'box-shadow:0 0 8px rgba(100,180,40,0.18);}',
      '.de-craft.equipped{border-color:#c8900a;',
        'background:linear-gradient(180deg,rgba(80,50,0,0.4),rgba(30,20,0,0.4));',
        'box-shadow:0 0 10px rgba(255,200,50,0.2);}',
      '.de-craft-head{display:flex;justify-content:space-between;align-items:center;}',
      '.de-craft-name{color:#f0d080;font-size:13px;font-weight:bold;}',
      '.de-craft-desc{font-size:10.5px;color:#806030;margin:3px 0 4px;font-style:italic;}',
      '.de-equipped-pill{color:#ffe87a;font-size:10px;border:1px solid #c8900a;',
        'padding:2px 7px;border-radius:10px;background:rgba(100,70,15,0.4);}',

      /* ログ */
      '.de-log{font-size:11px;}',
      '.de-log-row{padding:3px 6px;border-bottom:1px solid rgba(80,50,10,0.25);',
        'color:#a08040;}',
      '.de-log-row:first-child{color:#ffe090;background:rgba(255,200,50,0.05);}',

      '.de-divider{border:none;border-top:1px solid #2a1a06;margin:8px 0;}',
      '.de-empty{color:#5a3a10;font-style:italic;text-align:center;padding:20px;}'
    ].join('');
    var el = document.createElement('style');
    el.id  = 'dungeonExplorerStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* MOD タブが現在表示されていれば再描画 */
  function refreshMenu() {
    if (typeof Game !== 'undefined' && Game.onMenu === 'mods' && Game.UpdateMenu) {
      Game.UpdateMenu();
    }
  }

  var _tab = 'dungeon';

  function buildPanelHtml() {
    injectStyle();

    var power = getSoldierPower();
    var cpsB  = getCpsBonus();

    /* 装備スロット */
    var slotsHtml = ['weapon','armor','helm'].map(function(slot){
      var icons  = {weapon:'⚔ 武器',armor:'🛡 防具',helm:'👑 兜'};
      var eqId   = state.equippedItems[slot];
      var eq     = eqId ? EQUIPMENT.find(function(e){return e.id===eqId;}) : null;
      return '<div class="de-slot'+(eq?' filled':'')+'">'
        +'<div class="de-slot-label">'+icons[slot]+'</div>'
        +'<div>'+(eq?eq.icon+' '+eq.name:'なし')+'</div>'
        +'</div>';
    }).join('');

    /* ダンジョン */
    var dngBtnsHtml = DUNGEONS.map(function(d){
      var active = state.activeDungeon===d.id && state.exploring;
      var locked = power < d.minPower && state.soldiers > 0;
      var cls    = 'de-dng'+(active?' active':'')+(locked?' locked':'');
      var reqTxt = d.minPower > 0 ? '必要戦力 '+d.minPower+' / ボス '+d.boss+' (HP '+d.bossHp+')'
                                  : 'いつでも入れる / ボス '+d.boss;
      return '<a class="'+cls+'" onclick="window.DungeonExplorer.selectDungeon(\''+d.id+'\');return false;">'
        +'<div class="de-dng-name">'
          +'<span style="font-size:15px;">'+d.emoji+'</span> '+d.name
          +(active ? ' <span style="color:#ffe87a;font-size:11px;">▶ 探索中</span>' : '')
        +'</div>'
        +'<div class="de-dng-req">'+reqTxt+'</div>'
        +'</a>';
    }).join('');

    /* 探索ステータス */
    var statusHtml = '';
    var dng = state.activeDungeon ? DUNGEONS.find(function(d){return d.id===state.activeDungeon;}) : null;
    if (dng) {
      var isBoss = (state.floor % dng.bossFloor===0) && state.floor>0;
      statusHtml = '<div class="de-status" style="border-color:'+(isBoss?'#903020':'#3d6010')+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
        +'<span>'+dng.emoji+' <strong style="color:#ffe87a;">'+dng.name+'</strong>'
        +' F<strong style="color:#ffe87a;">'+state.floor+'</strong></span>'
        +'<span style="font-size:11px;color:'+(state.exploring?'#80c040':'#806030')+'">'
        +(state.exploring?'▶ 探索中':'■ 停止')+'</span>'
        +'</div>';
      if (isBoss && state.bossHpLeft > 0) {
        var bossRatio = Math.max(0, state.bossHpLeft / dng.bossHp);
        statusHtml += '<div style="margin-top:7px;font-size:11px;color:#e04040;">⚔ ボス戦: '+dng.boss+'</div>'
          +'<div class="de-boss-bar-wrap"><div class="de-boss-bar" style="width:'+Math.round(bossRatio*100)+'%;"></div></div>'
          +'<div style="font-size:10px;color:#c06060;">HP '+Math.max(0,state.bossHpLeft)+' / '+dng.bossHp+'</div>';
      } else {
        statusHtml += '<div class="de-bar-wrap"><div class="de-bar" style="width:'+state.progress+'%;background:'+dng.colorDark+';color:'+dng.colorDark+';"></div></div>'
          +'<div style="font-size:10px;color:#806030;">フロア進捗 '+state.progress+'%</div>';
      }
      statusHtml += '</div>';
    }

    /* インベントリ */
    var invHtml = ''; var matCount = 0;
    for (var mat in state.inventory) {
      if (state.inventory[mat] > 0) {
        invHtml += '<span class="de-mat">'+mat+' ×'+state.inventory[mat]+'</span>';
        matCount++;
      }
    }
    if (!matCount) invHtml = '<div class="de-empty">素材なし — ダンジョンで採取しよう</div>';

    /* クラフト */
    var craftHtml = EQUIPMENT.map(function(eq){
      var has  = canCraft(eq);
      var isEq = state.equippedItems[eq.slot]===eq.id;
      var cls  = 'de-craft'+(isEq?' equipped':has?' craftable':'');
      var recipeHtml = Object.keys(eq.recipe).map(function(mat){
        var have = state.inventory[mat]||0;
        var need = eq.recipe[mat];
        var cls2 = have>=need?'have':'lack';
        return '<span class="de-mat '+cls2+'">'+mat+' '+have+'/'+need+'</span>';
      }).join('');
      return '<div class="'+cls+'">'
        +'<div class="de-craft-head">'
        +'<span class="de-craft-name">'+eq.icon+' '+eq.name+'</span>'
        +(isEq
          ? '<span class="de-equipped-pill">装備中</span>'
          : '<a class="de-btn'+(has?' primary':' disabled')+'" onclick="'+(has?'window.DungeonExplorer.craft(\''+eq.id+'\');return false;':'return false;')+'">クラフト</a>')
        +'</div>'
        +'<div class="de-craft-desc">'+eq.desc+'</div>'
        +'<div>'+recipeHtml+'</div>'
        +'</div>';
    }).join('');

    /* ログ */
    var logHtml = state.log.slice(0,20).map(function(l){
      return '<div class="de-log-row">'+l+'</div>';
    }).join('') || '<div class="de-empty">まだログはありません</div>';

    /* === レイアウト === */
    var tabs = [
      {id:'dungeon', label:'🗺 探索'},
      {id:'craft',   label:'🔨 クラフト'},
      {id:'items',   label:'🎒 素材'},
      {id:'log',     label:'📜 ログ'}
    ];
    var tabBar = '<div class="de-tabs">'
      + tabs.map(function(t){
          return '<a class="de-tab'+(_tab===t.id?' active':'')+'" '
               + 'onclick="window.DungeonExplorer.switchTab(\''+t.id+'\');return false;">'+t.label+'</a>';
        }).join('')
      + '</div>';

    var content;
    if (_tab === 'dungeon') {
      content = statusHtml
        + '<div class="de-label">ダンジョンを選択</div>'
        + dngBtnsHtml
        + (state.exploring
            ? '<a class="de-btn danger" style="display:block;text-align:center;margin-top:8px;" onclick="window.DungeonExplorer.stopExplore();return false;">⏹ 探索を停止</a>'
            : '');
    } else if (_tab === 'craft') {
      content = '<div class="de-label">素材を集めて装備をクラフト（自動装備）</div>' + craftHtml;
    } else if (_tab === 'items') {
      content = '<div class="de-label">所持素材 ('+matCount+'種)</div>'
        + '<div>'+invHtml+'</div>'
        + '<hr class="de-divider">'
        + '<div style="font-size:12px;color:#c8a040;">'
        + '総撃破ボス数: <strong style="color:#ffe87a;">'+state.totalBossKills+'</strong>'
        + ' &nbsp;|&nbsp; 総踏破フロア: <strong style="color:#ffe87a;">'+state.totalFloors+'</strong>'
        + '</div>';
    } else {
      content = '<div class="de-log">'+logHtml+'</div>';
    }

    return '<div class="de-root">'
      + '<div class="de-banner">'
      +   '<span class="de-banner-title">⚔ DUNGEON EXPLORER</span>'
      +   '<span class="de-banner-sub">クッキー王国の地下迷宮</span>'
      + '</div>'
      + '<div class="de-statusbar">'
      +   '<div class="de-stat-row">'
      +     '<span>🪖 兵士 <strong>'+state.soldiers+'人</strong></span>'
      +     '<span class="sep">|</span>'
      +     '<span>Lv.<strong>'+state.soldierLevel+'</strong></span>'
      +     '<span class="sep">|</span>'
      +     '<span>戦力 <strong>'+power+'</strong></span>'
      +     '<span class="sep">|</span>'
      +     '<span class="de-cps-pill">CpS +'+Math.round(cpsB*100)+'%</span>'
      +   '</div>'
      +   '<div class="de-actions">'
      +     '<a class="de-btn" onclick="window.DungeonExplorer.hireSoldier();return false;">➕ 雇用 ('+formatCookies(soldierCost())+'🍪)</a>'
      +     (state.soldiers>0
            ? '<a class="de-btn" onclick="window.DungeonExplorer.levelUp();return false;">⬆ Lv.UP ('+formatCookies(levelUpCost())+'🍪)</a>'
            : '')
      +   '</div>'
      +   '<div class="de-slots">'+slotsHtml+'</div>'
      + '</div>'
      + tabBar
      + '<div class="de-content">'+content+'</div>'
      + '</div>';
  }

  /* ============================================================
     公開 API
  ============================================================ */
  window.DungeonExplorer = {
    switchTab: function(tab){ _tab = tab; refreshMenu(); },

    hireSoldier: function(){
      var cost = soldierCost();
      if (typeof Game === 'undefined' || Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: '+formatCookies(cost)+')');
        refreshMenu(); return;
      }
      Game.Spend(cost);
      state.soldiers++;
      addLog('🪖 兵士を1人雇用！(合計: '+state.soldiers+'人)');
      checkAchievements();
      saveState(); refreshMenu();
    },

    levelUp: function(){
      var cost = levelUpCost();
      if (typeof Game === 'undefined' || Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: '+formatCookies(cost)+')');
        refreshMenu(); return;
      }
      Game.Spend(cost);
      state.soldierLevel++;
      addLog('⬆ 兵士がLv.'+state.soldierLevel+' になった！');
      checkAchievements();
      saveState(); refreshMenu();
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
      saveState();
      refreshMenu();
    },

    stopExplore: function(){
      stopExplore();
      addLog('⏹ 探索を停止。');
      saveState();
      refreshMenu();
    },

    craft: function(eqId){
      var eq = EQUIPMENT.find(function(e){ return e.id===eqId; });
      if (eq && craftEquip(eq)) { saveState(); refreshMenu(); }
    }
  };

  /* ============================================================
     ゲームへのフック
  ============================================================ */
  function hookGame() {
    Game.registerHook('cps', function(cps){
      return cps * (1 + getCpsBonus());
    });
    Game.registerHook('logic', function(){
      if (Game.T % (Game.fps * 30) === 0) saveState();
    });
  }

  /* ============================================================
     MOD 登録
  ============================================================ */
  if (window.CookieClickerMods) {
    window.CookieClickerMods.register({
      id: MOD_ID,
      achievements: DE_ACHIEVEMENTS.map(function(a){ return a.name; }),

      settings: function(){
        return buildPanelHtml();
      },

      init: function(){
        loadState();
        var tries = 0;
        var iv = setInterval(function(){
          tries++;
          if (typeof Game !== 'undefined'
              && typeof Game.registerHook === 'function'
              && typeof Game.Earn === 'function') {
            clearInterval(iv);
            loadAchievementsJson(function() {
              registerAchievements();
              hookGame();
              if (state.exploring && state.activeDungeon) {
                state.exploring = false;
                startExplore(state.activeDungeon);
              }
              /* === 初回ロード時の通知抑制 ===
                 ここでは Game.Win を呼ばない checkAchievements 相当の
                 won 復元はすでに registerAchievements で完了している。
                 新規達成のみ checkAchievements で通知する。 */
              checkAchievements();
              console.log('[DungeonExplorer] 起動完了。MODタブ → DungeonExplorer で操作。');
            });
          }
          if (tries > 200) clearInterval(iv);
        }, 100);
      },

      disable: function(){
        stopExplore();
        saveState();
        var el = document.getElementById('dungeonExplorerStyle');
        if (el) el.remove();
        delete window.DungeonExplorer;
        console.log('[DungeonExplorer] 停止。');
      }
    });
  }

})();
