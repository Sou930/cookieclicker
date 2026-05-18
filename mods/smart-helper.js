/**
 * smart-helper.js  ―  Cookie Clicker スマートヘルパー MOD
 * ==========================================================
 * Frozen Cookies の主要機能を再実装した軽量版。
 *
 * 機能:
 *   1. 効率ランキング表示 (Frozen Cookies の "FC" テーブル相当)
 *      - 建物・アップグレードを「回収時間」順にソートして表示
 *   2. 自動購入 (建物・アップグレード)
 *      - 最も効率の良いものを自動で購入
 *   3. 自動ゴールデンクッキークリック
 *      - 画面上の golden shimmer を自動 pop
 *      - Wrath Cookie (赤) を避けるオプション
 *   4. 自動ラッパーpop
 *      - ラッパーの hp を 0 にして即 pop
 *
 * 設定は window.SmartHelper.config で行う。
 */

(function () {
  'use strict';

  /* =========================================================
     設定 (起動後に window.SmartHelper.config.xxx = yyy で変更可)
  ========================================================= */
  var config = {
    autoBuy        : false,  // 自動購入
    autoBuyInterval: 1000,   // 自動購入間隔 (ms)
    autoGC         : false,  // 自動ゴールデンクッキークリック
    autoGCInterval : 500,    // GCチェック間隔 (ms)
    skipWrath      : true,   // true = Wrath Cookie (赤) はクリックしない
    autoPopWrinkler: false,  // 自動ラッパーpop
    autoPopInterval: 5000,   // ラッパーpopチェック間隔 (ms)
    skipShinyWrinkler: true, // true = 光るラッパーはpopしない
    showTable      : true,   // 効率テーブルを画面に表示
    tableRows      : 10,     // テーブルに表示する行数
  };

  /* =========================================================
     タイマー管理
  ========================================================= */
  var _timers = {};

  function _startTimer(key, fn, ms) {
    _stopTimer(key);
    _timers[key] = setInterval(fn, ms);
  }
  function _stopTimer(key) {
    if (_timers[key]) { clearInterval(_timers[key]); delete _timers[key]; }
  }

  /* =========================================================
     効率計算 (Frozen Cookies 式)
     efficiency = cost * 1.15 / currentCps + cost / deltaCps
     小さいほど良い
  ========================================================= */
  function _currentCps() {
    if (typeof Game === 'undefined') return 1;
    return Math.max(Game.cookiesPs * (1 - Game.cpsSucked) + Game.computedMouseCps, 0.0001);
  }

  function _buildingEfficiency(obj) {
    var price    = obj.price;
    var deltaCps = obj.storedCps * Game.globalCpsMult;
    if (deltaCps <= 0) return Infinity;
    return price * 1.15 / _currentCps() + price / deltaCps;
  }

  function _upgradeEfficiency(up) {
    // アップグレードはΔCps推定が難しいため
    // 「コスト / 現在CpS」で近似 (小さい = 安くて早く回収)
    var price = up.getPrice();
    return price / _currentCps();
  }

  /* =========================================================
     全購入候補のリストを効率順で返す
  ========================================================= */
  function _getRankedList() {
    if (typeof Game === 'undefined') return [];
    var list = [];

    // 建物
    for (var name in Game.Objects) {
      var obj = Game.Objects[name];
      var eff = _buildingEfficiency(obj);
      list.push({
        name   : obj.dname || obj.name,
        price  : obj.price,
        eff    : eff,
        canBuy : Game.cookies >= obj.price,
        type   : 'building'
      });
    }

    // アップグレード (ストア内・未購入・通常プール)
    for (var i = 0; i < Game.UpgradesInStore.length; i++) {
      var up = Game.UpgradesInStore[i];
      if (up.bought) continue;
      if (up.pool === 'prestige' || up.pool === 'debug' || up.pool === 'toggle') continue;
      if (up.isVaulted()) continue;
      if (up.priceLumps > 0) continue;
      var eff2 = _upgradeEfficiency(up);
      list.push({
        name   : up.dname || up.name,
        price  : up.getPrice(),
        eff    : eff2,
        canBuy : up.canBuy(),
        type   : 'upgrade'
      });
    }

    list.sort(function (a, b) { return a.eff - b.eff; });
    return list;
  }

  /* =========================================================
     1. 効率テーブル UI
  ========================================================= */
  var _tableEl = null;

  function _createTable() {
    if (_tableEl) return;
    _tableEl = document.createElement('div');
    _tableEl.id = 'smartHelperTable';
    _tableEl.style.cssText = [
      'position:fixed',
      'bottom:8px',
      'left:8px',
      'z-index:99999',
      'background:rgba(0,0,0,0.82)',
      'color:#e8d8b0',
      'font-size:11px',
      'font-family:Georgia,serif',
      'border:1px solid rgba(255,200,100,0.3)',
      'border-radius:4px',
      'padding:6px 8px',
      'min-width:280px',
      'max-width:340px',
      'pointer-events:none',
      'line-height:1.5'
    ].join(';');
    document.body.appendChild(_tableEl);
  }

  function _removeTable() {
    if (_tableEl) { _tableEl.parentNode && _tableEl.parentNode.removeChild(_tableEl); _tableEl = null; }
  }

  function _updateTable() {
    if (!config.showTable) { _removeTable(); return; }
    _createTable();
    var list = _getRankedList().slice(0, config.tableRows);
    var cps  = _currentCps();
    var html = '<b style="color:#ffd080;">📊 効率ランキング</b> <span style="opacity:0.5;font-size:10px;">CpS: ' + _shortNum(cps) + '</span><br>';
    html += '<table style="border-collapse:collapse;width:100%;">';
    html += '<tr style="opacity:0.6;font-size:10px;"><td>名前</td><td style="text-align:right;">コスト</td><td style="text-align:right;">回収(秒)</td></tr>';
    for (var i = 0; i < list.length; i++) {
      var item    = list[i];
      var color   = item.canBuy ? '#a0e8a0' : '#e8e8e8';
      var badge   = item.type === 'upgrade' ? '<span style="color:#ffd080;">▲</span>' : '🏠';
      var payback = item.eff === Infinity ? '∞' : _shortNum(item.eff) + 's';
      html += '<tr style="color:' + color + ';">' +
        '<td>' + badge + ' ' + item.name + '</td>' +
        '<td style="text-align:right;">' + _shortNum(item.price) + '</td>' +
        '<td style="text-align:right;">' + payback + '</td>' +
        '</tr>';
    }
    html += '</table>';
    _tableEl.innerHTML = html;
  }

  /* =========================================================
     2. 自動購入
  ========================================================= */
  function _autoBuyTick() {
    if (typeof Game === 'undefined') return;
    if (Game.OnAscend || Game.AscendTimer > 0) return;

    var list = _getRankedList();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item.canBuy) continue;

      if (item.type === 'upgrade') {
        // アップグレードを特定して購入
        for (var j = 0; j < Game.UpgradesInStore.length; j++) {
          var up = Game.UpgradesInStore[j];
          if ((up.dname || up.name) === item.name && up.canBuy()) {
            up.buy(1);
            return;
          }
        }
      } else {
        // 建物を購入
        for (var name in Game.Objects) {
          var obj = Game.Objects[name];
          if ((obj.dname || obj.name) === item.name && Game.cookies >= obj.price) {
            obj.buy(1);
            return;
          }
        }
      }
      break; // 1回に1つだけ
    }
  }

  /* =========================================================
     3. 自動ゴールデンクッキークリック
  ========================================================= */
  function _autoGCTick() {
    if (typeof Game === 'undefined') return;
    if (Game.OnAscend) return;
    for (var i = Game.shimmers.length - 1; i >= 0; i--) {
      var s = Game.shimmers[i];
      if (s.type !== 'golden' && s.type !== 'reindeer') continue;
      if (config.skipWrath && s.wrath) continue;
      s.pop();
    }
  }

  /* =========================================================
     4. 自動ラッパーpop
  ========================================================= */
  function _autoPopWrinklerTick() {
    if (typeof Game === 'undefined') return;
    for (var i = 0; i < Game.wrinklers.length; i++) {
      var w = Game.wrinklers[i];
      if (w.phase !== 2) continue;                         // phase 2 = 吸いついている状態
      if (config.skipShinyWrinkler && w.type === 1) continue; // 光るラッパーはスキップ
      // hp を 0 未満にして即 pop
      w.hp = 0;
    }
  }

  /* =========================================================
     数値短縮ヘルパー
  ========================================================= */
  function _shortNum(n) {
    if (n === Infinity) return '∞';
    var units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    var i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return (i === 0 ? Math.round(n) : n.toFixed(2)) + units[i];
  }

  /* =========================================================
     全タイマーを再起動
  ========================================================= */
  function _applyConfig() {
    // テーブル更新 (常に動かす)
    if (config.showTable) {
      _startTimer('table', _updateTable, 2000);
    } else {
      _stopTimer('table');
      _removeTable();
    }

    if (config.autoBuy) {
      _startTimer('autoBuy', _autoBuyTick, config.autoBuyInterval);
    } else {
      _stopTimer('autoBuy');
    }

    if (config.autoGC) {
      _startTimer('autoGC', _autoGCTick, config.autoGCInterval);
    } else {
      _stopTimer('autoGC');
    }

    if (config.autoPopWrinkler) {
      _startTimer('autoPopWrinkler', _autoPopWrinklerTick, config.autoPopInterval);
    } else {
      _stopTimer('autoPopWrinkler');
    }
  }

  /* =========================================================
     コントロールパネル (ゲーム画面右上に固定表示)
  ========================================================= */
  var _panelEl = null;

  function _buildPanel() {
    if (_panelEl) return;
    _panelEl = document.createElement('div');
    _panelEl.id = 'smartHelperPanel';
    _panelEl.style.cssText = [
      'position:fixed',
      'top:40px',
      'right:4px',
      'z-index:99999',
      'background:rgba(0,0,0,0.82)',
      'color:#e8d8b0',
      'font-size:11px',
      'font-family:Georgia,serif',
      'border:1px solid rgba(255,200,100,0.3)',
      'border-radius:4px',
      'padding:6px 8px',
      'min-width:180px'
    ].join(';');
    document.body.appendChild(_panelEl);
    _refreshPanel();
  }

  function _removePanel() {
    if (_panelEl) { _panelEl.parentNode && _panelEl.parentNode.removeChild(_panelEl); _panelEl = null; }
  }

  function _refreshPanel() {
    if (!_panelEl) return;

    function btn(key, label) {
      var on = !!config[key];
      return '<a style="display:inline-block;cursor:pointer;padding:1px 5px;margin:1px 2px;border-radius:3px;' +
        (on ? 'background:rgba(100,200,80,0.35);border:1px solid rgba(100,200,80,0.7);'
             : 'background:rgba(60,60,60,0.5);border:1px solid rgba(120,120,120,0.4);') +
        '" onclick="SmartHelper.toggle(\'' + key + '\');return false;">' +
        (on ? '✅' : '⬜') + ' ' + label + '</a><br>';
    }

    _panelEl.innerHTML =
      '<b style="color:#ffd080;">🍪 SmartHelper</b><br>' +
      '<div style="margin-top:4px;">' +
      btn('autoBuy',         '自動購入') +
      btn('autoGC',          'GC自動クリック') +
      btn('skipWrath',       'Wrathスキップ') +
      btn('autoPopWrinkler', 'ラッパー自動pop') +
      btn('skipShinyWrinkler','光るラッパー除外') +
      btn('showTable',       '効率テーブル表示') +
      '</div>';
  }

  /* =========================================================
     グローバル公開
  ========================================================= */
  window.SmartHelper = {
    config: config,

    toggle: function (key) {
      if (typeof config[key] !== 'boolean') return;
      config[key] = !config[key];
      _applyConfig();
      _refreshPanel();
    },

    setConfig: function (key, val) {
      config[key] = val;
      _applyConfig();
      _refreshPanel();
    }
  };

  /* =========================================================
     MODローダー向け登録
  ========================================================= */
  var _mod = {
    id: 'smart-helper',

    init: function () {
      _buildPanel();
      _applyConfig();
      console.log('[SmartHelper] 起動。window.SmartHelper.config で設定変更可能。');
    },

    disable: function () {
      Object.keys(_timers).forEach(function (k) { _stopTimer(k); });
      _removeTable();
      _removePanel();
      console.log('[SmartHelper] 停止。');
    }
  };

  if (window.CookieClickerMods) {
    window.CookieClickerMods.register(_mod);
  } else {
    console.error('[SmartHelper] CookieClickerMods が見つかりません');
  }

})();
