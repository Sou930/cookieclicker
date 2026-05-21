/**
 * smart-helper.js  ―  Cookie Clicker スマートヘルパー MOD
 * =========================================================
 * 変更点:
 *  - フローティングカード UI を廃止
 *  - 設定とランキングは MODタブ内の SmartHelper タブ (settings) に移動
 *  - アップグレード購入の優先度を下げた（効率値を ×2.5 に補正）
 *  - 【バグ修正】_shortNum 未定義により settings() が例外を投げ
 *    SmartHelper タブの中身が表示されなかったのを修正
 *  - セーブ/ロードに対応 (save/load フックで config を保存)
 */

(function () {
  'use strict';

  var MOD_ID = 'smart-helper';

  /* =========================================================
     設定
  ========================================================= */
  var config = {
    autoBuy          : false,
    autoBuyInterval  : 250,
    autoGC           : false,
    autoGCInterval   : 500,
    skipWrath        : true,
    autoPopWrinkler  : false,
    autoPopInterval  : 5000,
    skipShinyWrinkler: true,
    showTable        : true,
    tableRows        : 10,
    autoClick        : false,
    autoClickInterval: 50,
  };

  /* アップグレード優先度低下用の倍率
     ＝ 大きいほどアップグレードが後回しになる */
  var UPGRADE_PRIORITY_PENALTY = 2.5;
  var AUTO_BUY_MAX_PER_TICK = 3;

  /* =========================================================
     数値フォーマット（_shortNum）
     ※ これが未定義だったため settings() で例外が出ていた
  ========================================================= */
  function _shortNum(n) {
    if (n === Infinity || n === -Infinity) return '∞';
    if (typeof n !== 'number' || isNaN(n)) return '-';
    if (typeof Beautify === 'function') {
      try { return Beautify(n); } catch (e) {}
    }
    var abs = Math.abs(n);
    if (abs < 1000) {
      return (abs < 10 ? n.toFixed(2) : abs < 100 ? n.toFixed(1) : Math.round(n).toString());
    }
    var units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    var i = Math.floor(Math.log10(abs) / 3);
    if (i >= units.length) i = units.length - 1;
    return (n / Math.pow(1000, i)).toFixed(2) + units[i];
  }

  /* =========================================================
     タイマー管理
  ========================================================= */
  var _timers = {};

  function _startTimer(key, fn, ms) {
    _stopTimer(key);
    _timers[key] = setInterval(function () {
      try { fn(); } catch (e) { console.error('[SmartHelper] timer error (' + key + '):', e); }
    }, ms);
  }
  function _stopTimer(key) {
    if (_timers[key]) { clearInterval(_timers[key]); delete _timers[key]; }
  }
  function _stopAllTimers() {
    Object.keys(_timers).forEach(function (k) { _stopTimer(k); });
  }

  /* =========================================================
     安全ガード
  ========================================================= */
  function _gameReady() {
    return (
      typeof Game !== 'undefined' && Game &&
      Game.Objects && Game.UpgradesInStore &&
      Array.isArray(Game.UpgradesInStore)
    );
  }
  function _whenReady(fn, retryMs) {
    retryMs = retryMs || 1000;
    function check() {
      if (_gameReady()) {
        try { fn(); } catch (e) { console.error('[SmartHelper] ready hook error:', e); }
        return;
      }
      setTimeout(check, retryMs);
    }
    check();
  }

 /* =========================================================
   効率計算
========================================================= */

function _snapshotGainState() {
  return {
    cookiesPs: Game.cookiesPs,
    cookiesPsRaw: Game.cookiesPsRaw,
    cookiesPsRawHighest: Game.cookiesPsRawHighest,
    cpsSucked: Game.cpsSucked,
    recalculateGains: Game.recalculateGains
  };
}

function _restoreGainState(snap) {
  if (!snap) return;
  Game.cookiesPs = snap.cookiesPs;
  Game.cookiesPsRaw = snap.cookiesPsRaw;
  Game.cookiesPsRawHighest = snap.cookiesPsRawHighest;
  Game.cpsSucked = snap.cpsSucked;
  Game.recalculateGains = snap.recalculateGains;
}

function _withSuppressedWins(fn) {
  if (!Game.Win) return fn();
  var oldWin = Game.Win;
  Game.Win = function () { return 0; };
  try { return fn(); }
  finally { Game.Win = oldWin; }
}

function _getBuildingPrice(obj) {
  if (!obj) return 0;
  if (typeof obj.getPrice === 'function') {
    try { return obj.getPrice(); } catch (e) {}
  }
  return obj.price || 0;
}

function _currentCps() {
  if (!_gameReady()) return 1;

  var cps =
    (Game.cookiesPs || 0) *
    (1 - (Game.cpsSucked || 0)) +
    (Game.computedMouseCps || 0);

  return Math.max(cps, 0.0001);
}

/* =========================================================
   建物 CpS増加量
========================================================= */
function _buildingDeltaCps(obj) {
  if (!obj) return 0;

  var oldAmount = obj.amount;
  var snap = _snapshotGainState();

  try {
    return _withSuppressedWins(function () {
      var before = Game.cookiesPs;

      // 仮購入（実績・最高CpSなどの副作用は抑止して最後に復元）
      obj.amount = oldAmount + 1;
      Game.CalculateGains();

      var after = Game.cookiesPs;

      return Math.max(after - before, 0);
    });

  } catch (e) {

    // フォールバック
    return (obj.storedCps || 0) * (Game.globalCpsMult || 1);
  } finally {
    obj.amount = oldAmount;
    try { _withSuppressedWins(function () { Game.CalculateGains(); }); } catch (e2) {}
    _restoreGainState(snap);
  }
}

/* =========================================================
   建物効率
========================================================= */
function _buildingEfficiency(obj) {
  if (!obj) return Infinity;

  var price = _getBuildingPrice(obj);
  var deltaCps = _buildingDeltaCps(obj);

  if (deltaCps <= 0) return Infinity;

  // 回収時間
  return price / deltaCps;
}

/* =========================================================
   アップグレード CpS増加量
========================================================= */
function _upgradeDeltaCps(up) {
  if (!up) return 0;

  var oldBought = up.bought;
  var snap = _snapshotGainState();

  try {
    return _withSuppressedWins(function () {
      var before = Game.cookiesPs;

      // 仮購入（実績・最高CpSなどの副作用は抑止して最後に復元）
      up.bought = 1;
      Game.CalculateGains();

      var after = Game.cookiesPs;

      return Math.max(after - before, 0);
    });

  } catch (e) {
    console.error('[SmartHelper] upgrade cps calc error:', e);
    return 0;
  } finally {
    up.bought = oldBought;
    try { _withSuppressedWins(function () { Game.CalculateGains(); }); } catch (e2) {}
    _restoreGainState(snap);
  }
}

/* =========================================================
   アップグレード効率
========================================================= */

function _upgradeEfficiency(up) {
  if (!up || typeof up.getPrice !== 'function') {
    return Infinity;
  }

  var price = up.getPrice();
  var deltaCps = _upgradeDeltaCps(up);

  if (deltaCps <= 0) {
    return Infinity;
  }

  // 回収時間ベース
  return (price / deltaCps) * UPGRADE_PRIORITY_PENALTY;
}

/* =========================================================
   ランキング取得
========================================================= */
function _getRankedList() {
  if (!_gameReady()) return [];

  var list = [];

  /* =========================
     建物
  ========================= */
  for (var name in Game.Objects) {

    if (!Object.prototype.hasOwnProperty.call(Game.Objects, name)) {
      continue;
    }

    var obj = Game.Objects[name];

    if (!obj) continue;

    list.push({
      name   : obj.name || name,
      price  : _getBuildingPrice(obj),
      eff    : _buildingEfficiency(obj),
      canBuy : (Game.cookies || 0) >= _getBuildingPrice(obj),
      type   : 'building',
      ref    : obj
    });
  }

  /* =========================
     アップグレード
  ========================= */
  for (var i = 0; i < Game.UpgradesInStore.length; i++) {

    var up = Game.UpgradesInStore[i];

    if (!up || up.bought) continue;

    // 除外対象
    if (
      up.pool === 'prestige' ||
      up.pool === 'debug' ||
      up.pool === 'toggle'
    ) continue;

    if (
      typeof up.isVaulted === 'function' &&
      up.isVaulted()
    ) continue;

    if (up.priceLumps > 0) continue;

    list.push({
      name   : up.dname || up.name || ('upgrade-' + i),

      price  : typeof up.getPrice === 'function'
        ? up.getPrice()
        : (up.price || 0),

      eff    : _upgradeEfficiency(up),

      canBuy : typeof up.canBuy === 'function'
        ? up.canBuy()
        : false,

      type   : 'upgrade',
      ref    : up
    });
  }

  /* =========================
     効率順ソート
  ========================= */
  list.sort(function (a, b) {
    return a.eff - b.eff;
  });

  return list;
}

  /* =========================================================
     自動アクション
  ========================================================= */
  function _autoClickTick() {
    if (!_gameReady() || Game.OnAscend) return;
    try {
      var cookie = document.getElementById('bigCookie');
      if (cookie) cookie.click();
    } catch (e) { console.error('[SmartHelper] autoClick error:', e); }
  }

  function _purchaseRankedItem(item) {
    if (!item || !item.ref) return false;

    if (item.type === 'upgrade') {
      // 効率表で選んだアップグレードを通常購入と同じ経路で買う
      return !!item.ref.buy();
    }

    if (item.type === 'building') {
      var oldBuyMode = Game.buyMode;
      var beforeAmount = item.ref.amount;
      try {
        Game.buyMode = 1; // 売却モード中でも自動購入では必ず購入する
        item.ref.buy(1);
      } finally {
        Game.buyMode = oldBuyMode;
      }
      return item.ref.amount > beforeAmount;
    }

    return false;
  }

  function _autoBuyTick() {
    if (!_gameReady() || Game.OnAscend || Game.AscendTimer > 0) return;

    for (var bought = 0; bought < AUTO_BUY_MAX_PER_TICK; bought++) {
      var list = _getRankedList();
      var purchased = false;

      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item.canBuy || item.eff === Infinity) continue;
        try {
          purchased = _purchaseRankedItem(item);
        } catch (e) {
          console.error('[SmartHelper] autoBuy error:', e);
          purchased = false;
        }
        if (purchased) break;
      }

      if (!purchased) return;
    }
  }

  function _autoGCTick() {
    if (!_gameReady() || Game.OnAscend) return;
    var shimmers = Game.shimmers || [];
    for (var i = shimmers.length - 1; i >= 0; i--) {
      var s = shimmers[i];
      if (!s) continue;
      if (s.type !== 'golden' && s.type !== 'reindeer') continue;
      if (config.skipWrath && s.wrath) continue;
      try { if (typeof s.pop === 'function') s.pop(); } catch (e) { console.error('[SmartHelper] autoGC error:', e); }
    }
  }

  function _autoPopWrinklerTick() {
    if (!_gameReady()) return;
    var wrinklers = Game.wrinklers || [];
    for (var i = 0; i < wrinklers.length; i++) {
      var w = wrinklers[i];
      if (!w || w.phase !== 2) continue;
      if (config.skipShinyWrinkler && w.type === 1) continue;
      try { w.hp = 0; } catch (e) { console.error('[SmartHelper] wrinkler error:', e); }
    }
  }

  /* =========================================================
     設定反映
  ========================================================= */
  function _applyConfig() {
    config.autoClick
      ? _startTimer('autoClick', _autoClickTick, config.autoClickInterval)
      : _stopTimer('autoClick');

    config.autoBuy
      ? _startTimer('autoBuy', _autoBuyTick, config.autoBuyInterval)
      : _stopTimer('autoBuy');

    config.autoGC
      ? _startTimer('autoGC', _autoGCTick, config.autoGCInterval)
      : _stopTimer('autoGC');

    config.autoPopWrinkler
      ? _startTimer('autoPopWrinkler', _autoPopWrinklerTick, config.autoPopInterval)
      : _stopTimer('autoPopWrinkler');

    // MODタブを開いている間だけランキングを定期再描画
    if (config.showTable) {
      _startTimer('refresh', function () {
        if (typeof Game !== 'undefined' && Game.onMenu === 'mods' && Game.UpdateMenu) {
          Game.UpdateMenu();
        }
      }, 2000);
    } else {
      _stopTimer('refresh');
    }
  }

  /* =========================================================
     公開 API（settings 内 HTML から呼ばれる）
  ========================================================= */
  var _activeTab = 'ranking';

  window.SmartHelper = {
    config: config,

    setTab: function (tab) {
      _activeTab = tab;
      if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
    },

    toggle: function (key) {
      if (typeof config[key] !== 'boolean') return;
      config[key] = !config[key];
      _applyConfig();
      if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
    },

    setConfig: function (key, val) {
      config[key] = val;
      _applyConfig();
      if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
    }
  };

  /* =========================================================
     settings() HTML
  ========================================================= */
  function _renderRankingHTML() {
    var cps  = _gameReady() ? _currentCps() : 0;
    var list = _gameReady() ? _getRankedList().slice(0, config.tableRows) : [];

    var html = '';
    html += '<div style="opacity:0.6;font-size:11px;margin-bottom:6px;">CpS: ' + _shortNum(cps) + '</div>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr style="opacity:0.6;border-bottom:1px solid rgba(255,255,255,0.15);">' +
              '<th style="text-align:left;padding:3px 6px;">名前</th>' +
              '<th style="text-align:right;padding:3px 6px;">コスト</th>' +
              '<th style="text-align:right;padding:3px 6px;">回収(秒)</th>' +
            '</tr>';
    if (list.length === 0) {
      html += '<tr><td colspan="3" style="opacity:0.5;padding:10px 0;text-align:center;">データなし</td></tr>';
    }
    for (var i = 0; i < list.length; i++) {
      var item    = list[i];
      var color   = item.canBuy ? '#7ed87e' : '';
      var badge   = item.type === 'upgrade' ? '▲' : '🏠';
      var payback = item.eff === Infinity ? '∞' : _shortNum(item.eff) + 's';
      html +=
        '<tr style="' + (color ? 'color:' + color + ';' : '') + 'border-bottom:1px solid rgba(255,255,255,0.05);">' +
          '<td style="padding:3px 6px;">' + badge + ' ' + item.name + '</td>' +
          '<td style="text-align:right;padding:3px 6px;">' + _shortNum(item.price) + '</td>' +
          '<td style="text-align:right;padding:3px 6px;">' + payback + '</td>' +
        '</tr>';
    }
    html += '</table>';
    return html;
  }

  function _renderSettingsHTML() {
    function row(key, label, desc) {
      var on = !!config[key];
      var st = on
        ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);'
        : 'background:rgba(200,80,80,0.25);border-color:rgba(200,80,80,0.55);opacity:0.85;';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
               '<div><div>' + label + '</div>' +
                 (desc ? '<small style="opacity:0.55;">' + desc + '</small>' : '') +
               '</div>' +
               '<a class="option smallFancyButton" style="' + st + '" ' +
                  'onclick="SmartHelper.toggle(\'' + key + '\');return false;">' +
                  (on ? 'ON' : 'OFF') + '</a>' +
             '</div>';
    }

    return ''
      + row('autoClick',         '🖱️ 自動クリック',     '毎' + config.autoClickInterval + 'msクッキーをクリック')
      + row('autoBuy',           '🛒 自動購入',          '毎' + config.autoBuyInterval + 'ms、効率表と同じ基準で最大' + AUTO_BUY_MAX_PER_TICK + '件購入')
      + row('autoGC',            '✨ GC自動クリック',    'ゴールデンクッキーを自動でクリック')
      + row('skipWrath',         '😈 Wrathスキップ',     '怒りクッキーはスキップ')
      + row('autoPopWrinkler',   '🐛 ラッパー自動pop',  'ラッパーを自動で破裂させる')
      + row('skipShinyWrinkler', '✨ 光るラッパー除外',  '光るラッパーはpopしない')
      + row('showTable',         '📊 ランキング自動更新','2秒ごとにランキングを更新')
      + '<div style="margin-top:6px;font-size:11px;opacity:0.55;">※ アップグレードの購入優先度は建物より低めに設定されています (×' + UPGRADE_PRIORITY_PENALTY + ')</div>';
  }

  function _renderSettings() {
    var tabOn  = 'background:rgba(255,220,120,0.35);border-color:rgba(255,220,120,0.7);';
    var tabOff = 'opacity:0.6;';
    var html = '<div style="padding:4px;">';

    html += '<div style="display:flex;gap:4px;margin-bottom:8px;">' +
              '<a class="option smallFancyButton" style="' + (_activeTab === 'ranking'  ? tabOn : tabOff) + '" ' +
                'onclick="SmartHelper.setTab(\'ranking\');return false;">📊 ランキング</a>' +
              '<a class="option smallFancyButton" style="' + (_activeTab === 'settings' ? tabOn : tabOff) + '" ' +
                'onclick="SmartHelper.setTab(\'settings\');return false;">⚙️ 設定</a>' +
            '</div>';

    if (_activeTab === 'ranking') {
      html += _renderRankingHTML();
    } else {
      html += _renderSettingsHTML();
    }

    html += '</div>';
    return html;
  }

  /* =========================================================
     MOD登録
  ========================================================= */
  if (window.CookieClickerMods && typeof window.CookieClickerMods.register === 'function') {
    window.CookieClickerMods.register({
      id: MOD_ID,

      init: function () {
        _whenReady(function () {
          _applyConfig();
          console.log('[SmartHelper] 起動。MODタブの SmartHelper から設定可能。');
        }, 1000);
      },

      /* セーブ/ロード フック */
      save: function () {
        return { config: config };
      },
      load: function (data) {
        if (!data || !data.config) return;
        for (var k in data.config) {
          if (Object.prototype.hasOwnProperty.call(data.config, k) &&
              Object.prototype.hasOwnProperty.call(config, k)) {
            config[k] = data.config[k];
          }
        }
        // 旧セーブの1秒間隔を引き継いでしまわないよう、新しい高速既定値へ移行
        if (config.autoBuyInterval > 250) config.autoBuyInterval = 250;
        _applyConfig();
      },

      settings: function () {
        return _renderSettings();
      },

      disable: function () {
        _stopAllTimers();
        try { delete window.SmartHelper; } catch (e) { window.SmartHelper = undefined; }
        console.log('[SmartHelper] 停止。');
      }
    });
  } else {
    console.error('[SmartHelper] CookieClickerMods が見つかりません');
  }

})();
