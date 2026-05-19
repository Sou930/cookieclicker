/**
 * mod-loader.js  ―  Cookie Clicker MOD Loader
 * =============================================
 * 変更点:
 *  - 各MOD詳細タブからは実績欄を削除（設定のみ表示）
 *  - MOD一覧タブの下部に「MOD実績」テーブルを追加
 *    各MODごとに行を作り、実績がないMODは「なし」と表示
 *  - 通常の実績欄に出ないようMOD側でpoolを'mod'等にする想定
 */

(function () {
  'use strict';

  var MANIFEST_URL = 'mods/mod-manifest.json';
  var STORAGE_KEY  = 'CC_ModsEnabled';

  var _registered  = {};
  var _pendingInit = {};

  window.CookieClickerMods = {
    register: function (mod) {
      if (!mod || !mod.id) {
        console.error('[ModLoader] register(): id が必要です');
        return;
      }
      _registered[mod.id] = mod;
      if (_pendingInit[mod.id]) {
        delete _pendingInit[mod.id];
        if (typeof mod.init === 'function') {
          try { mod.init(); }
          catch (e) { console.error('[ModLoader] init() エラー (' + mod.id + '):', e); }
        }
      }
    },
    _registered: _registered
  };

  var _manifest = [];
  var _enabled  = {};
  var _scripts  = {};

  function _saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_enabled)); } catch (e) {}
  }
  function _loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _enabled = JSON.parse(raw);
    } catch (e) {}
  }

  function _loadScript(mod, onReady) {
    if (_scripts[mod.id]) { if (onReady) onReady(); return; }
    var s = document.createElement('script');
    var isExternal = /^https?:\/\//.test(mod.file);
    s.src = isExternal ? mod.file : (mod.file + '?_=' + Date.now());
    s.onload  = function () { _scripts[mod.id] = s; if (onReady) onReady(); };
    s.onerror = function () { console.error('[ModLoader] 読み込み失敗:', mod.file); if (onReady) onReady(); };
    document.body.appendChild(s);
  }

  function _unloadScript(modId) {
    var s = _scripts[modId];
    if (s && s.parentNode) s.parentNode.removeChild(s);
    delete _scripts[modId];
    delete _registered[modId];
    delete _pendingInit[modId];
  }

  function _enableMod(mod) {
    _pendingInit[mod.id] = true;
    _loadScript(mod, function () {
      if (_pendingInit[mod.id]) {
        delete _pendingInit[mod.id];
        var reg = _registered[mod.id];
        if (reg && typeof reg.init === 'function') {
          try { reg.init(); }
          catch (e) { console.error('[ModLoader] init() エラー (' + mod.id + '):', e); }
        }
      }
    });
    _enabled[mod.id] = true;
    _saveState();
  }

  function _disableMod(mod) {
    var reg = _registered[mod.id];
    if (reg && typeof reg.disable === 'function') {
      try { reg.disable(); }
      catch (e) { console.error('[ModLoader] disable() エラー (' + mod.id + '):', e); }
    }
    _unloadScript(mod.id);
    _enabled[mod.id] = false;
    _saveState();
  }

  window.ModLoader_toggle = function (modId) {
    var mod = null;
    for (var i = 0; i < _manifest.length; i++) {
      if (_manifest[i].id === modId) { mod = _manifest[i]; break; }
    }
    if (!mod) return;
    if (_enabled[modId]) { _disableMod(mod); } else { _enableMod(mod); }
    if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
  };

  /* =========================================================
     Mod設定ブロック HTML 生成
  ========================================================= */
  function _buildSettingsSection(modId) {
    var reg = _registered[modId];
    if (!reg || typeof reg.settings !== 'function') return '';
    var html = '';
    try { html = reg.settings(); } catch(e) { return ''; }
    if (!html) return '';
    return '<div class="block" style="padding:0px;margin:8px 4px;">' +
           '<div class="subsection" style="padding:0px;">' +
           '<div class="title">Mod設定</div>' +
           '<div class="listing">' + html + '</div>' +
           '</div></div>';
  }

  /* =========================================================
     サブタブ切替
  ========================================================= */
  var _activeTab = 'mods';

  window.ModLoader_setTab = function (tab) {
    _activeTab = tab;
    if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
  };

  function _buildTabBar() {
    var enabledMods = [];
    for (var i = 0; i < _manifest.length; i++) {
      if (_enabled[_manifest[i].id]) enabledMods.push(_manifest[i]);
    }

    var tabs = [{ id: 'mods', label: 'MOD' }];
    for (var j = 0; j < enabledMods.length; j++) {
      tabs.push({ id: enabledMods[j].id, label: enabledMods[j].name || enabledMods[j].id });
    }

    var valid = false;
    for (var t = 0; t < tabs.length; t++) if (tabs[t].id === _activeTab) { valid = true; break; }
    if (!valid) _activeTab = 'mods';

    var str = '<div style="display:flex;gap:4px;margin:8px 4px 0;flex-wrap:wrap;">';
    for (var k = 0; k < tabs.length; k++) {
      var isActive = tabs[k].id === _activeTab;
      var style = isActive
        ? 'background:rgba(255,220,120,0.35);border-color:rgba(255,220,120,0.7);'
        : 'opacity:0.6;';
      str += '<a class="option smallFancyButton" style="' + style + '" ' +
             'onclick="ModLoader_setTab(\'' + tabs[k].id + '\');return false;">' +
             tabs[k].label + '</a>';
    }
    str += '</div>';
    return str;
  }

  /* =========================================================
     MOD一覧 + MOD実績テーブル
  ========================================================= */
  function _buildModAchievementsTable() {
    if (typeof Game === 'undefined' || !Game.Achievements || !Game.crate) return '';
    var rows = '';
    for (var i = 0; i < _manifest.length; i++) {
      var mod  = _manifest[i];
      var reg  = _registered[mod.id];
      var name = mod.name || mod.id;
      var crates = '';
      var has    = false;
      if (reg && reg.achievements && reg.achievements.length > 0) {
        for (var j = 0; j < reg.achievements.length; j++) {
          var a = Game.Achievements[reg.achievements[j]];
          if (a) { crates += Game.crate(a, 'stats'); has = true; }
        }
      }
      rows +=
        '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
          '<td style="padding:6px 10px;vertical-align:middle;white-space:nowrap;">' +
            '<b>' + name + '</b>' +
          '</td>' +
          '<td style="padding:6px 10px;vertical-align:middle;">' +
            (has ? '<div class="crateBox" style="display:inline-block;">' + crates + '</div>'
                 : '<label style="opacity:0.5;">なし</label>') +
          '</td>' +
        '</tr>';
    }

    return '<div class="block" style="padding:0px;margin:8px 4px;">' +
           '<div class="subsection" style="padding:0px;">' +
           '<div class="title">MOD実績</div>' +
           '<div class="listing"><table style="width:100%;border-collapse:collapse;">' +
           rows +
           '</table></div></div></div>';
  }

  function _buildModsListPanel() {
    var str = '<div class="block" style="padding:0px;margin:8px 4px;">' +
              '<div class="subsection" style="padding:0px;">' +
              '<div class="title">Mod一覧</div>';

    if (_manifest.length === 0) {
      str += '<div class="listing"><label>mods/mod-manifest.json にMODが登録されていません。</label></div>';
    } else {
      for (var i = 0; i < _manifest.length; i++) {
        var mod  = _manifest[i];
        var isOn = !!_enabled[mod.id];
        var onStyle  = isOn
          ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);'
          : 'opacity:0.45;';
        var offStyle = !isOn
          ? 'background:rgba(200,80,80,0.35);border-color:rgba(200,80,80,0.7);'
          : 'opacity:0.45;';
        str +=
          '<div class="listing">' +
            '<a class="option smallFancyButton" style="' + onStyle + '" ' +
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">ON</a>' +
            '<a class="option smallFancyButton" style="' + offStyle + '" ' +
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">OFF</a>' +
            ' <b style="margin-left:4px;">' + (mod.name || mod.id) + '</b>' +
            (mod.version ? ' <small style="opacity:0.5;">v' + mod.version + '</small>' : '') +
            (mod.author  ? ' <small style="opacity:0.5;">by ' + mod.author + '</small>' : '') +
            (mod.description ? '<br><label>' + mod.description + '</label>' : '') +
          '</div>';
      }
    }
    str += '</div></div>';

    // MOD実績テーブル
    str += _buildModAchievementsTable();

    return str;
  }

  function _buildModPanel(modId) {
    var mod = null;
    for (var i = 0; i < _manifest.length; i++) if (_manifest[i].id === modId) { mod = _manifest[i]; break; }
    if (!mod) return '<div class="listing"><label>Mod が見つかりません。</label></div>';
    if (!_enabled[modId]) return '<div class="listing"><label>この Mod は OFF です。MODタブで ON にしてください。</label></div>';

    var s = _buildSettingsSection(modId);
    if (!s) {
      s = '<div class="block" style="padding:0px;margin:8px 4px;">' +
          '<div class="subsection" style="padding:0px;">' +
          '<div class="title">' + (mod.name || mod.id) + '</div>' +
          '<div class="listing"><label>表示する設定はありません。</label></div>' +
          '</div></div>';
    }
    return s;
  }

  function _buildModsMenu() {
    try {
      var str = '<div class="section">Mod</div>';
      str += _buildTabBar();
      if (_activeTab === 'mods') {
        str += _buildModsListPanel();
      } else {
        str += _buildModPanel(_activeTab);
      }
      str += '<div style="height:128px;"></div>';
      return str;
    } catch (e) {
      console.error('[ModLoader] _buildModsMenu error:', e);
      return '<div class="section">Mod</div><div class="listing"><label>表示エラー: ' +
             (e && e.message ? e.message : e) + '</label></div>';
    }
  }

  function _hookUpdateMenu() {
    if (typeof Game === 'undefined' || typeof Game.UpdateMenu !== 'function') {
      setTimeout(_hookUpdateMenu, 300);
      return;
    }

    var _orig = Game.UpdateMenu;

    Game.UpdateMenu = function () {
      _orig.call(this);
      if (Game.onMenu !== 'mods') return;

      var menu = document.getElementById('menu');
      if (!menu) return;

      var closeBtn = '<div class="close menuClose" ' +
        (Game.clickStr || 'onclick') + '="Game.ShowMenu();">x</div>';
      menu.innerHTML = closeBtn + _buildModsMenu();
    };

    console.log('[ModLoader] Game.UpdateMenu フック完了');
  }

  function _init() {
    _loadState();

    var xhr = new XMLHttpRequest();
    xhr.open('GET', MANIFEST_URL + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      var ok = (xhr.status === 200 || xhr.status === 0) && xhr.responseText;
      if (ok) {
        try {
          var data = JSON.parse(xhr.responseText);
          _manifest = Array.isArray(data) ? data : [];
          console.log('[ModLoader] manifest 読み込み (' + _manifest.length + ' MOD)');
          for (var i = 0; i < _manifest.length; i++) {
            if (_enabled[_manifest[i].id]) _enableMod(_manifest[i]);
          }
        } catch (e) {
          console.warn('[ModLoader] manifest JSONパースエラー:', e);
        }
      } else {
        console.warn('[ModLoader] manifest 読み込み失敗 status=' + xhr.status);
      }
      _hookUpdateMenu();
    };
    xhr.onerror = function () {
      console.warn('[ModLoader] manifest XHR エラー');
      _hookUpdateMenu();
    };
    xhr.send();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
