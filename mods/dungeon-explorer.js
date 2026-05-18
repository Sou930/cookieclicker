/**
 * dungeon-explorer.js  ―  Cookie Clicker Dungeon Explorer MOD
 * =============================================================
 * クッキー兵士を派遣して放置ダンジョン探索！
 *
 * 機能:
 *   - クッキーで兵士を雇用・強化
 *   - 5つのダンジョン（草原～魔王城）を自動探索
 *   - フロアを進むとボスが出現
 *   - ボス撃破でレア素材ドロップ
 *   - 素材で装備をクラフト → 兵士の戦闘力UP
 *   - 装備はクッキー生産にもボーナス
 */

(function () {
  'use strict';

  var MOD_ID = 'dungeon-explorer';
  var SAVE_KEY = 'CC_DungeonExplorer';

  /* =========================================================
     ゲームデータ定義
  ========================================================= */

  var DUNGEONS = [
    {
      id: 'meadow',
      name: '🌿 クッキー草原',
      emoji: '🌿',
      minPower: 0,
      floors: 10,
      bossFloor: 10,
      boss: '🐉 草原の番人',
      bossHp: 100,
      tickMs: 4000,
      rewards: {
        common: ['小麦粉のかけら', '砂糖の結晶'],
        rare:   ['金のクッキー欠片'],
        boss:   ['草原の守護石', '番人の牙']
      },
      color: '#4a7c3f'
    },
    {
      id: 'cave',
      name: '🦇 クリスタル洞窟',
      emoji: '🦇',
      minPower: 30,
      floors: 15,
      bossFloor: 15,
      boss: '💎 水晶ゴーレム',
      bossHp: 300,
      tickMs: 5000,
      rewards: {
        common: ['洞窟石', '光るキノコ'],
        rare:   ['水晶の破片', 'コウモリの翼'],
        boss:   ['水晶核', 'ゴーレムの心臓']
      },
      color: '#3a5a8c'
    },
    {
      id: 'volcano',
      name: '🌋 業火の火山',
      emoji: '🌋',
      minPower: 100,
      floors: 20,
      bossFloor: 20,
      boss: '🔥 溶岩巨人',
      bossHp: 800,
      tickMs: 6000,
      rewards: {
        common: ['火山灰', '溶岩石'],
        rare:   ['炎の結晶', '火竜の鱗'],
        boss:   ['溶岩核', '巨人の炎の心']
      },
      color: '#8c3a1a'
    },
    {
      id: 'icemtn',
      name: '❄️ 永久凍土の山',
      emoji: '❄️',
      minPower: 300,
      floors: 25,
      bossFloor: 25,
      boss: '🧊 氷の女王',
      bossHp: 2000,
      tickMs: 7000,
      rewards: {
        common: ['氷の欠片', '雪の結晶'],
        rare:   ['永久凍土の核', '女王の羽'],
        boss:   ['氷の王冠破片', '絶対零度の石']
      },
      color: '#2a6080'
    },
    {
      id: 'demoncastle',
      name: '🏰 魔王の城',
      emoji: '🏰',
      minPower: 1000,
      floors: 30,
      bossFloor: 30,
      boss: '👑 魔王クッキウス',
      bossHp: 10000,
      tickMs: 8000,
      rewards: {
        common: ['魔力の欠片', '呪われた骨'],
        rare:   ['魔王の血', '暗黒結晶'],
        boss:   ['魔王の王冠', '無限クッキーの秘宝']
      },
      color: '#4a1a6a'
    }
  ];

  var EQUIPMENT = [
    {
      id: 'flour_shield',
      name: '🛡️ 小麦粉の盾',
      desc: '基本的な守り。戦力+5',
      recipe: { '小麦粉のかけら': 5, '砂糖の結晶': 3 },
      power: 5,
      cpsBonus: 0.01,
      slot: 'armor'
    },
    {
      id: 'sugar_sword',
      name: '⚔️ 砂糖の剣',
      desc: '甘い一撃。戦力+10',
      recipe: { '砂糖の結晶': 8, '小麦粉のかけら': 3 },
      power: 10,
      cpsBonus: 0.02,
      slot: 'weapon'
    },
    {
      id: 'golden_helm',
      name: '👑 金のヘルメット',
      desc: 'レア素材製。戦力+25',
      recipe: { '金のクッキー欠片': 3, '草原の守護石': 1 },
      power: 25,
      cpsBonus: 0.05,
      slot: 'helm'
    },
    {
      id: 'crystal_armor',
      name: '💎 水晶の鎧',
      desc: '輝く防具。戦力+60',
      recipe: { '水晶の破片': 5, '水晶核': 1, 'ゴーレムの心臓': 1 },
      power: 60,
      cpsBonus: 0.10,
      slot: 'armor'
    },
    {
      id: 'flame_blade',
      name: '🗡️ 炎の大剣',
      desc: '業火の魂が宿る。戦力+150',
      recipe: { '炎の結晶': 5, '溶岩核': 1, '巨人の炎の心': 1 },
      power: 150,
      cpsBonus: 0.20,
      slot: 'weapon'
    },
    {
      id: 'frost_crown',
      name: '❄️ 氷の王冠',
      desc: '永久の冷気。戦力+400',
      recipe: { '永久凍土の核': 3, '氷の王冠破片': 2, '絶対零度の石': 1 },
      power: 400,
      cpsBonus: 0.40,
      slot: 'helm'
    },
    {
      id: 'demon_regalia',
      name: '👿 魔王の装束',
      desc: '最強の証。戦力+1200、CpS+100%',
      recipe: { '魔王の王冠': 1, '無限クッキーの秘宝': 1, '暗黒結晶': 5 },
      power: 1200,
      cpsBonus: 1.0,
      slot: 'armor'
    }
  ];

  /* =========================================================
     状態
  ========================================================= */
  var state = {
    soldiers: 0,
    soldierLevel: 1,
    equippedItems: {},   // slot -> equipId
    inventory: {},       // itemName -> count
    activeDungeon: null, // dungeon id
    floor: 0,
    progress: 0,         // 0-100 (現フロアの進捗)
    bossHpLeft: 0,
    exploring: false,
    log: [],
    totalBossKills: 0,
    totalFloors: 0
  };

  /* =========================================================
     ヘルパー
  ========================================================= */
  function getSoldierPower() {
    var base = state.soldiers * (5 + (state.soldierLevel - 1) * 3);
    var equipBonus = 0;
    EQUIPMENT.forEach(function (eq) {
      if (state.equippedItems[eq.slot] === eq.id) equipBonus += eq.power;
    });
    return base + equipBonus;
  }

  function getCpsBonus() {
    var bonus = 0;
    EQUIPMENT.forEach(function (eq) {
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
    for (var mat in eq.recipe) {
      state.inventory[mat] -= eq.recipe[mat];
    }
    state.equippedItems[eq.slot] = eq.id;
    addLog('🔨 ' + eq.name + ' を装備！戦力+' + eq.power);
    renderPanel();
    return true;
  }

  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 30) state.log.pop();
  }

  function randomDrop(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function soldierCost() {
    return Math.floor(50 * Math.pow(1.15, state.soldiers));
  }

  function levelUpCost() {
    return Math.floor(500 * Math.pow(3, state.soldierLevel - 1));
  }

  /* =========================================================
     探索ロジック
  ========================================================= */
  var _exploreTimer = null;

  function startExplore(dungeonId) {
    var dng = DUNGEONS.find(function (d) { return d.id === dungeonId; });
    if (!dng) return;
    if (getSoldierPower() < dng.minPower && state.soldiers > 0) {
      // 戦力不足でも進める（進みが遅くなる）
    }
    if (state.soldiers === 0) {
      addLog('⚠️ 兵士がいません！まず雇用してください。');
      renderPanel();
      return;
    }
    stopExplore();
    state.activeDungeon = dungeonId;
    state.exploring = true;
    if (state.floor === 0) state.floor = 1;
    addLog('⚔️ ' + dng.name + ' F' + state.floor + ' 探索開始！');
    renderPanel();
    _exploreTimer = setInterval(function () { exploreTick(); }, dng.tickMs);
  }

  function stopExplore() {
    if (_exploreTimer) { clearInterval(_exploreTimer); _exploreTimer = null; }
    state.exploring = false;
  }

  function exploreTick() {
    if (!state.activeDungeon) return;
    var dng = DUNGEONS.find(function (d) { return d.id === state.activeDungeon; });
    if (!dng) return;

    var power = getSoldierPower();
    var efficiency = Math.min(1, (power / Math.max(1, dng.minPower)));
    var advance = Math.max(5, Math.floor(efficiency * 20));

    // ボスフロアかどうか
    var isBossFloor = (state.floor % dng.bossFloor === 0);

    if (isBossFloor) {
      // ボス戦
      if (state.bossHpLeft <= 0) state.bossHpLeft = dng.bossHp;
      var dmg = Math.max(1, Math.floor(power * 0.5));
      state.bossHpLeft -= dmg;
      addLog('💥 ' + dng.boss + ' に ' + dmg + ' ダメージ！(残HP: ' + Math.max(0, state.bossHpLeft) + ')');

      if (state.bossHpLeft <= 0) {
        // ボス撃破
        state.totalBossKills++;
        state.bossHpLeft = 0;
        var bossLoot = randomDrop(dng.rewards.boss);
        addItem(bossLoot);
        // 追加ドロップ
        if (Math.random() < 0.5) {
          var rareLoot = randomDrop(dng.rewards.rare);
          addItem(rareLoot);
          addLog('🏆 ' + dng.boss + ' 撃破！ [' + bossLoot + '] [' + rareLoot + '] をゲット！');
        } else {
          addLog('🏆 ' + dng.boss + ' 撃破！ [' + bossLoot + '] をゲット！');
        }
        Game.Notify('⚔️ ボス撃破！', dng.boss + ' を倒した！\n[' + bossLoot + '] を入手', [14, 6], 4);
        state.floor++;
        state.totalFloors++;
        state.progress = 0;
      }
    } else {
      // 通常フロア
      state.progress += advance;
      if (Math.random() < 0.3) {
        var commonLoot = randomDrop(dng.rewards.common);
        addItem(commonLoot);
        addLog('🎒 F' + state.floor + ': [' + commonLoot + '] 発見！');
      }
      if (Math.random() < 0.08) {
        var rareLoot2 = randomDrop(dng.rewards.rare);
        addItem(rareLoot2);
        addLog('✨ F' + state.floor + ': レア！[' + rareLoot2 + '] 発見！');
      }
      if (state.progress >= 100) {
        state.progress = 0;
        state.floor++;
        state.totalFloors++;
        addLog('🚶 F' + state.floor + ' へ進んだ！');
      }
    }
    renderPanel();
  }

  /* =========================================================
     セーブ / ロード
  ========================================================= */
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        Object.assign(state, s);
        state.log = state.log || [];
        state.equippedItems = state.equippedItems || {};
        state.inventory = state.inventory || {};
      }
    } catch (e) {}
  }

  /* =========================================================
     UI
  ========================================================= */
  var _panelEl = null;

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'dungeonExplorerPanel';
    panel.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%)',
      'width:520px',
      'max-height:80vh',
      'overflow-y:auto',
      'background:linear-gradient(135deg,#1a0a2e 0%,#0d0520 60%,#1a0512 100%)',
      'border:2px solid #6a2fa0',
      'border-radius:12px',
      'box-shadow:0 0 40px rgba(130,50,200,0.6),inset 0 0 60px rgba(0,0,0,0.5)',
      'color:#e0c8ff',
      'font-family:"Courier New",monospace',
      'font-size:12px',
      'z-index:10000',
      'display:none',
      'padding:0'
    ].join(';');

    document.body.appendChild(panel);
    _panelEl = panel;
    renderPanel();
  }

  function renderPanel() {
    if (!_panelEl) return;

    var power = getSoldierPower();
    var cpsB = getCpsBonus();

    // 装備スロット表示
    var equippedHtml = '';
    ['weapon','armor','helm'].forEach(function(slot) {
      var eqId = state.equippedItems[slot];
      var eq = eqId ? EQUIPMENT.find(function(e){ return e.id === eqId; }) : null;
      var slotIcon = slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '👑';
      equippedHtml += '<span style="background:rgba(100,50,150,0.3);border:1px solid #6a2fa0;border-radius:4px;padding:2px 6px;margin:2px;">'
        + slotIcon + ' ' + (eq ? eq.name : '(なし)') + '</span>';
    });

    // ダンジョン一覧
    var dungeonBtnsHtml = DUNGEONS.map(function(d) {
      var locked = state.soldiers === 0;
      var active = state.activeDungeon === d.id && state.exploring;
      var canEnter = power >= d.minPower || state.soldiers === 0;
      var col = active ? '#ffe066' : canEnter ? d.color : '#555';
      var border = active ? '2px solid #ffe066' : '1px solid ' + d.color;
      return '<button onclick="window.DungeonExplorer.selectDungeon(\'' + d.id + '\')" style="'
        + 'background:' + (active ? 'rgba(255,224,102,0.15)' : 'rgba(0,0,0,0.3)') + ';'
        + 'border:' + border + ';border-radius:6px;color:' + col + ';'
        + 'padding:4px 8px;margin:3px;cursor:pointer;font-size:11px;font-family:inherit;'
        + 'min-width:140px;text-align:left;">'
        + d.emoji + ' ' + d.name.replace(d.emoji+' ','') + '<br>'
        + '<span style="font-size:10px;color:#aaa;">必要戦力: ' + d.minPower + '</span>'
        + (active ? ' <span style="color:#ffe066">▶探索中</span>' : '')
        + '</button>';
    }).join('');

    // 所持素材
    var invHtml = '';
    var matCount = 0;
    for (var mat in state.inventory) {
      if (state.inventory[mat] > 0) {
        invHtml += '<span style="background:rgba(60,30,100,0.5);border:1px solid #7a4fbf;'
          + 'border-radius:3px;padding:1px 5px;margin:2px;display:inline-block;">'
          + mat + ' ×' + state.inventory[mat] + '</span>';
        matCount++;
      }
    }
    if (matCount === 0) invHtml = '<span style="color:#666;">素材なし</span>';

    // 装備クラフト
    var craftHtml = EQUIPMENT.map(function(eq) {
      var has = canCraft(eq);
      var alreadyEq = state.equippedItems[eq.slot] === eq.id;
      var recipeStr = Object.entries(eq.recipe).map(function(kv){
        var have = state.inventory[kv[0]] || 0;
        var color = have >= kv[1] ? '#88ff88' : '#ff6666';
        return '<span style="color:' + color + '">' + kv[0] + '×' + kv[1] + '</span>';
      }).join(', ');

      return '<div style="border:1px solid ' + (has?'#6a9f3a':'#3a2a5a')
        + ';border-radius:6px;padding:6px;margin:4px 0;background:rgba(0,0,0,0.3);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<span>' + eq.name + ' <span style="color:#aaa;font-size:10px;">' + eq.desc + '</span></span>'
        + (alreadyEq
          ? '<span style="color:#ffe066;border:1px solid #ffe066;padding:2px 8px;border-radius:3px;font-size:10px;">装備中</span>'
          : '<button onclick="window.DungeonExplorer.craft(\'' + eq.id + '\')" style="'
            + 'background:' + (has?'#3a6f2a':'#2a1a4a') + ';border:1px solid '+(has?'#6a9f3a':'#4a3a6a')
            + ';color:'+(has?'#aaffaa':'#666')
            + ';padding:2px 8px;border-radius:3px;cursor:'+(has?'pointer':'default')+';font-family:inherit;font-size:11px;">'
            + 'クラフト</button>')
        + '</div>'
        + '<div style="font-size:10px;color:#bbb;margin-top:2px;">' + recipeStr + '</div>'
        + '</div>';
    }).join('');

    // 探索ログ
    var logHtml = state.log.slice(0, 12).map(function(l) {
      return '<div style="border-bottom:1px solid rgba(100,50,150,0.2);padding:2px 0;color:#ccc;">' + l + '</div>';
    }).join('');

    // 現在のダンジョン状況
    var dng = state.activeDungeon ? DUNGEONS.find(function(d){ return d.id === state.activeDungeon; }) : null;
    var statusHtml = '';
    if (dng) {
      var isBoss = dng && (state.floor % dng.bossFloor === 0) && state.floor > 0;
      statusHtml = '<div style="background:rgba(0,0,0,0.4);border:1px solid ' + dng.color
        + ';border-radius:6px;padding:8px;margin:8px 0;">'
        + '<div>' + dng.emoji + ' ' + dng.name
        + ' <strong style="color:#ffe066">F' + state.floor + '</strong>'
        + (state.exploring ? ' <span style="color:#88ff88;">▶ 探索中</span>' : ' <span style="color:#888;">停止中</span>')
        + '</div>'
        + (isBoss && state.bossHpLeft > 0
          ? '<div style="margin-top:4px;">👹 ボス戦: ' + dng.boss
            + '<br><div style="background:#300;border-radius:3px;height:8px;margin-top:3px;">'
            + '<div style="background:#e03030;height:8px;border-radius:3px;width:'
            + Math.round((state.bossHpLeft/dng.bossHp)*100) + '%;"></div></div>'
            + '<span style="font-size:10px;color:#ff8888;">HP ' + state.bossHpLeft + ' / ' + dng.bossHp + '</span>'
            + '</div>'
          : '<div style="margin-top:4px;background:#111;border-radius:3px;height:6px;">'
            + '<div style="background:' + dng.color + ';height:6px;border-radius:3px;width:' + state.progress + '%;transition:width 0.3s;"></div></div>'
            + '<span style="font-size:10px;color:#aaa;">フロア進捗: ' + state.progress + '%</span>')
        + '</div>';
    }

    _panelEl.innerHTML = ''
      // ヘッダー
      + '<div style="background:linear-gradient(90deg,#2a0a4e,#1a0530);padding:12px 16px;border-radius:10px 10px 0 0;'
      + 'border-bottom:1px solid #6a2fa0;display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-size:16px;font-weight:bold;color:#c890ff;text-shadow:0 0 10px #9050ff;">⚔️ Dungeon Explorer</span>'
      + '<button onclick="window.DungeonExplorer.toggle()" style="background:none;border:1px solid #6a2fa0;'
      + 'color:#c890ff;padding:2px 10px;border-radius:4px;cursor:pointer;font-family:inherit;">✕ 閉じる</button>'
      + '</div>'

      // 兵士情報
      + '<div style="padding:12px 16px;border-bottom:1px solid rgba(106,47,160,0.3);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      + '<span>🪖 兵士: <strong style="color:#ffe066;">' + state.soldiers + '人</strong>'
      + ' | Lv.<strong style="color:#88ccff;">' + state.soldierLevel + '</strong>'
      + ' | 戦力: <strong style="color:#ff9966;">' + power + '</strong>'
      + ' | CpSボーナス: <strong style="color:#88ff88;">+' + Math.round(cpsB*100) + '%</strong>'
      + '</span>'
      + '</div>'
      + '<div>'
      + '<button onclick="window.DungeonExplorer.hireSoldier()" style="'
      + 'background:rgba(50,30,80,0.8);border:1px solid #9050cf;color:#c890ff;'
      + 'padding:4px 12px;border-radius:5px;cursor:pointer;font-family:inherit;margin-right:6px;">'
      + '➕ 雇用 (' + formatCookies(soldierCost()) + '🍪)</button>'
      + (state.soldiers > 0 ? '<button onclick="window.DungeonExplorer.levelUp()" style="'
      + 'background:rgba(50,30,80,0.8);border:1px solid #cf9030;color:#ffe088;'
      + 'padding:4px 12px;border-radius:5px;cursor:pointer;font-family:inherit;">'
      + '⬆️ レベルアップ (' + formatCookies(levelUpCost()) + '🍪)</button>' : '')
      + '</div>'
      // 装備中
      + '<div style="margin-top:6px;">' + equippedHtml + '</div>'
      + '</div>'

      // タブ
      + '<div style="display:flex;border-bottom:1px solid rgba(106,47,160,0.3);" id="deTabBar">'
      + ['dungeon','craft','items','log'].map(function(t,i){
          var labels = ['🗺️ ダンジョン','🔨 クラフト','🎒 素材','📜 ログ'];
          return '<button onclick="window.DungeonExplorer.switchTab(\''+t+'\')" id="deTab_'+t+'" style="'
            + 'flex:1;background:none;border:none;border-bottom:2px solid '+(DungeonExplorer._tab===t?'#c890ff':'transparent')+';'
            + 'color:'+(DungeonExplorer._tab===t?'#c890ff':'#888')+';padding:8px;cursor:pointer;font-family:inherit;font-size:11px;">'
            + labels[i] + '</button>';
        }).join('')
      + '</div>'

      // タブコンテンツ
      + '<div style="padding:12px 16px;">'
      + (DungeonExplorer._tab === 'dungeon' ? (
          statusHtml
          + '<div style="margin-bottom:8px;font-size:11px;color:#888;">ダンジョンを選択:</div>'
          + '<div style="display:flex;flex-wrap:wrap;">' + dungeonBtnsHtml + '</div>'
          + (state.exploring
            ? '<button onclick="window.DungeonExplorer.stopExplore()" style="'
              + 'background:rgba(100,30,30,0.8);border:1px solid #cf3030;color:#ff9090;'
              + 'padding:6px 16px;border-radius:5px;cursor:pointer;font-family:inherit;margin-top:8px;width:100%;">'
              + '⏹ 探索停止</button>'
            : '')
        )
        : DungeonExplorer._tab === 'craft' ? (
          '<div style="font-size:11px;color:#aaa;margin-bottom:6px;">素材を集めて装備をクラフト（自動装備）</div>'
          + craftHtml
        )
        : DungeonExplorer._tab === 'items' ? (
          '<div style="font-size:11px;color:#aaa;margin-bottom:8px;">所持素材 (計' + matCount + '種)</div>'
          + '<div>' + invHtml + '</div>'
          + '<div style="margin-top:12px;font-size:11px;color:#888;">'
          + '総撃破ボス数: <strong>' + state.totalBossKills + '</strong> | '
          + '総踏破フロア: <strong>' + state.totalFloors + '</strong>'
          + '</div>'
        )
        : (
          '<div style="font-size:11px;">' + (logHtml || '<span style="color:#666;">ログなし</span>') + '</div>'
        )
      )
      + '</div>';
  }

  function formatCookies(n) {
    if (n >= 1e12) return (n/1e12).toFixed(1)+'兆';
    if (n >= 1e8) return (n/1e8).toFixed(1)+'億';
    if (n >= 1e4) return (n/1e4).toFixed(1)+'万';
    return n.toString();
  }

  /* =========================================================
     公開API (ボタンから呼ぶ)
  ========================================================= */
  var DungeonExplorer = window.DungeonExplorer = {
    _tab: 'dungeon',
    _visible: false,

    toggle: function () {
      this._visible = !this._visible;
      if (_panelEl) _panelEl.style.display = this._visible ? 'block' : 'none';
    },

    switchTab: function (tab) {
      this._tab = tab;
      renderPanel();
    },

    hireSoldier: function () {
      var cost = soldierCost();
      if (Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: ' + formatCookies(cost) + ')');
        renderPanel();
        return;
      }
      Game.Spend(cost);
      state.soldiers++;
      addLog('🪖 兵士を1人雇用！(合計: ' + state.soldiers + '人)');
      saveState();
      renderPanel();
    },

    levelUp: function () {
      var cost = levelUpCost();
      if (Game.cookies < cost) {
        addLog('🍪 クッキーが足りません！(必要: ' + formatCookies(cost) + ')');
        renderPanel();
        return;
      }
      Game.Spend(cost);
      state.soldierLevel++;
      addLog('⬆️ 兵士がLv.' + state.soldierLevel + ' になった！');
      saveState();
      renderPanel();
    },

    selectDungeon: function (id) {
      if (state.activeDungeon === id && state.exploring) {
        stopExplore();
        addLog('⏹ 探索を停止。');
      } else {
        if (state.activeDungeon !== id) {
          state.floor = 1;
          state.progress = 0;
          state.bossHpLeft = 0;
        }
        startExplore(id);
      }
      renderPanel();
    },

    stopExplore: function () {
      stopExplore();
      addLog('⏹ 探索を停止。');
      renderPanel();
    },

    craft: function (eqId) {
      var eq = EQUIPMENT.find(function(e){ return e.id === eqId; });
      if (eq) {
        craftEquip(eq);
        saveState();
      }
    }
  };

  /* =========================================================
     ゲームへのフック
  ========================================================= */
  function hookGame() {
    // CpSボーナス
    Game.registerHook('cps', function (cps) {
      return cps * (1 + getCpsBonus());
    });

    // 定期セーブ
    Game.registerHook('logic', function () {
      if (Game.T % (Game.fps * 30) === 0) saveState();
    });
  }

  /* =========================================================
     ミニボタン（画面右下の開閉ボタン）
  ========================================================= */
  function createToggleButton() {
    var btn = document.createElement('button');
    btn.id = 'dungeonExplorerBtn';
    btn.innerHTML = '⚔️';
    btn.title = 'Dungeon Explorer';
    btn.style.cssText = [
      'position:fixed',
      'bottom:36px',
      'right:6px',
      'width:38px',
      'height:38px',
      'background:linear-gradient(135deg,#3a1060,#1a0530)',
      'border:2px solid #8050c0',
      'border-radius:50%',
      'color:#fff',
      'font-size:16px',
      'cursor:pointer',
      'z-index:9998',
      'box-shadow:0 0 12px rgba(128,80,200,0.8)',
      'transition:transform 0.15s'
    ].join(';');
    btn.addEventListener('mouseenter', function(){ btn.style.transform='scale(1.15)'; });
    btn.addEventListener('mouseleave', function(){ btn.style.transform='scale(1)'; });
    btn.addEventListener('click', function(){ DungeonExplorer.toggle(); });
    document.body.appendChild(btn);
  }

  /* =========================================================
     MOD登録
  ========================================================= */
  if (window.CookieClickerMods) {
    window.CookieClickerMods.register({
      id: MOD_ID,

      init: function () {
        loadState();
        var tries = 0;
        var interval = setInterval(function () {
          tries++;
          if (typeof Game !== 'undefined' && typeof Game.registerHook === 'function' && typeof Game.Earn === 'function') {
            clearInterval(interval);
            hookGame();
            createPanel();
            createToggleButton();
            // 前回探索中だった場合は再開
            if (state.exploring && state.activeDungeon) {
              state.exploring = false;
              startExplore(state.activeDungeon);
            }
            console.log('[DungeonExplorer] 起動完了。右下の ⚔️ ボタンで開く。');
          }
          if (tries > 200) clearInterval(interval);
        }, 100);
      },

      disable: function () {
        stopExplore();
        saveState();
        var panel = document.getElementById('dungeonExplorerPanel');
        if (panel) panel.parentNode.removeChild(panel);
        var btn = document.getElementById('dungeonExplorerBtn');
        if (btn) btn.parentNode.removeChild(btn);
        delete window.DungeonExplorer;
        console.log('[DungeonExplorer] 停止。');
      }
    });
  }

})();
