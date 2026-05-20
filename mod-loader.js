/**
 * mod-loader.js  ―  Cookie Clicker MOD Loader
 * =============================================
 * 変更点:
 *  - 各MOD詳細タブからは実績欄を削除（設定のみ表示）
 *  - MOD一覧タブの下部に「MOD実績」テーブルを追加
 *  - セーブ/ロードを Game.saveModData / Game.loadModData にフックする
 *    新方式に変更（type=0/1/2/3 すべての保存・ファイル保存・export 文字列に
 *    自動で MOD データが同梱される）
 *  - これにより MOD 設定・進捗・解除済み実績などが本体のセーブと
 *    完全に同期され、エクスポート/インポートでも保持される
 */

(function () {
  'use strict';

  var MANIFEST_URL = 'mods/mod-manifest.json';
  var STORAGE_KEY  = 'CC_ModsEnabled';
  var SAVE_MARKER  = '||MOD||';        // 旧フォーマット復元用
  var MOD_LOADER_KEY = '__modLoader';  // saveModData 内に格納するキー

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
     セーブ/ロード フック
  ========================================================= */
  function _utf8ToB64(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { return btoa(str); }
  }
  function _b64ToUtf8(b64) {
    try { return decodeURIComponent(escape(atob(b64))); }
    catch (e) { return atob(b64); }
  }

  function _splitModFromSave(save) {
    if (typeof save !== 'string') return { core: save, payload: null };
    var idx = save.indexOf(SAVE_MARKER);
    if (idx < 0) return { core: save, payload: null };
    var core = save.substring(0, idx);
    var rest = save.substring(idx + SAVE_MARKER.length);
    var payload = null;
    try { payload = JSON.parse(_b64ToUtf8(rest)); }
    catch (e) { console.warn('[ModLoader] MOD payload パース失敗:', e); }
    return { core: core, payload: payload };
  }

  function _applyModPayload(payload) {
    if (!payload || typeof payload !== 'object') return;

    // 有効/無効状態の復元
    if (payload.enabled && typeof payload.enabled === 'object') {
      for (var i = 0; i < _manifest.length; i++) {
        var mod = _manifest[i];
        var want = !!payload.enabled[mod.id];
        var have = !!_enabled[mod.id];
        if (want && !have) _enableMod(mod);
        else if (!want && have) _disableMod(mod);
      }
    }

    // 各 MOD の load() に渡す
    if (payload.mods && typeof payload.mods === 'object') {
      var pending = {};
      for (var id in payload.mods) {
        if (Object.prototype.hasOwnProperty.call(payload.mods, id)) pending[id] = payload.mods[id];
      }
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        for (var id in pending) {
          var reg = _registered[id];
          if (reg && typeof reg.load === 'function') {
            try { reg.load(pending[id]); }
            catch (e) { console.error('[ModLoader] load() エラー (' + id + '):', e); }
            delete pending[id];
          }
        }
        var remain = false;
        for (var k in pending) { remain = true; break; }
        if (!remain || tries > 40) clearInterval(iv);
      }, 250);
    }
  }

  function _hookSaveLoad() {
    if (typeof Game === 'undefined') { setTimeout(_hookSaveLoad, 300); return; }

    /* === 新方式: Game.saveModData / Game.loadModData をフック ===
     * これにより type=0/1/2/3 すべての保存形式・ファイルセーブ・
     * エクスポート文字列にも MOD データが自動同梱される
     */
    if (typeof Game.saveModData === 'function' && !Game._modOrigSaveModData) {
      Game._modOrigSaveModData = Game.saveModData;
      Game.saveModData = function () {
        var base = '';
        try { base = Game._modOrigSaveModData.apply(this, arguments) || ''; }
        catch (e) { console.error('[ModLoader] saveModData orig error:', e); }
        try {
          var payload = _buildModSavePayloadObj();
          // Game.safeSaveString で | や ; をエスケープ
          var safe = Game.safeSaveString
            ? Game.safeSaveString(JSON.stringify(payload))
            : JSON.stringify(payload).replace(/\|/g, '[P]').replace(/;/g, '[S]');
          return base + MOD_LOADER_KEY + ':' + safe + ';';
        } catch (e) {
          console.error('[ModLoader] saveModData hook error:', e);
        }
        return base;
      };
    }

    if (typeof Game.loadModData === 'function' && !Game._modOrigLoadModData) {
      Game._modOrigLoadModData = Game.loadModData;
      Game.loadModData = function () {
        try {
          if (Game.modSaveData && Game.modSaveData[MOD_LOADER_KEY]) {
            var raw = Game.modSaveData[MOD_LOADER_KEY];
            var json = Game.safeLoadString ? Game.safeLoadString(raw) : raw;
            try {
              var payload = JSON.parse(json);
              _applyModPayload(payload);
            } catch (e) { console.warn('[ModLoader] payload JSON parse error:', e); }
            // 本体には不要なので削除（Mod data 画面に表示しない）
            delete Game.modSaveData[MOD_LOADER_KEY];
          }
        } catch (e) { console.error('[ModLoader] loadModData hook error:', e); }
        try { return Game._modOrigLoadModData.apply(this, arguments); }
        catch (e) { console.error('[ModLoader] loadModData orig error:', e); }
      };
    }

    /* === 旧形式 (||MOD||<b64>) のセーブを読めるようにする後方互換フック === */
    if (typeof Game.ImportSaveCode === 'function' && !Game._modOrigImportSaveCode) {
      Game._modOrigImportSaveCode = Game.ImportSaveCode;
      Game.ImportSaveCode = function (save) {
        var split = _splitModFromSave(save);
        var ret = Game._modOrigImportSaveCode.call(this, split.core);
        if (split.payload) _applyModPayload(split.payload);
        return ret;
      };
    }

    if (typeof Game.LoadSave === 'function' && !Game._modOrigLoadSave) {
      Game._modOrigLoadSave = Game.LoadSave;
      Game.LoadSave = function (data) {
        // 旧フォーマットマーカーが入っていれば取り除いてから本体へ
        if (typeof data === 'string' && data.indexOf(SAVE_MARKER) >= 0) {
          var split = _splitModFromSave(data);
          var ret = Game._modOrigLoadSave.call(this, split.core);
          if (split.payload) _applyModPayload(split.payload);
          return ret;
        }
        return Game._modOrigLoadSave.apply(this, arguments);
      };
    }

    console.log('[ModLoader] セーブ/ロードフック完了 (saveModData 方式)');
  }

  /* MOD ペイロード本体生成 (オブジェクト) */
  function _buildModSavePayloadObj() {
    var payload = { enabled: _enabled, mods: {} };
    for (var id in _registered) {
      if (!Object.prototype.hasOwnProperty.call(_registered, id)) continue;
      var reg = _registered[id];
      if (reg && typeof reg.save === 'function') {
        try { payload.mods[id] = reg.save(); }
        catch (e) { console.error('[ModLoader] save() エラー (' + id + '):', e); }
      }
    }
    return payload;
  }

  /* =========================================================
     Mod設定ブロック HTML 生成
  ========================================================= */
  function _buildSettingsSection(modId) {
    var reg = _registered[modId];
    if (!reg || typeof reg.settings !== 'function') return '';
    var html = '';
    try { html = reg.settings(); }
    catch(e) {
      console.error('[ModLoader] settings() エラー (' + modId + '):', e);
      return '<div class="subsection">' +
             '<div class="title">Mod設定</div>' +
             '<div class="listing"><label style="color:#f88;">' +
             '設定の表示に失敗しました: ' + (e && e.message ? e.message : e) +
             '</label></div></div>';
    }
    if (!html) return '';
    return '<div class="subsection">' +
           '<div class="title">Mod設定</div>' +
           '<div class="listing">' + html + '</div>' +
           '</div>';
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
     MOD一覧 + MOD実績セクション
  ========================================================= */

  /**
   * Game.crate は context='stats' かつ pool!='normal' の未獲得実績を
   * 空文字で返してしまうため、MOD実績は pool を一時的に 'normal' に
   * 差し替えてクレートを生成し、直後に元に戻す。
   */
  function _modCrate(a) {
    var origPool = a.pool;
    a.pool = 'normal';
    var html = Game.crate(a, 'stats');
    a.pool = origPool;
    return html;
  }

  function _buildModAchievementsSection() {
    if (typeof Game === 'undefined' || !Game.Achievements || !Game.crate) return '';

    // 実績を持つMODが存在するか確認（有効無効問わず登録済みのものを対象）
    var modsWithAchievs = [];
    var totalOwned = 0;
    var totalAll   = 0;

    for (var i = 0; i < _manifest.length; i++) {
      var mod = _manifest[i];
      var reg = _registered[mod.id];
      if (!reg || !reg.achievements || reg.achievements.length === 0) continue;

      var crates   = '';
      var modOwned = 0;
      var modTotal = reg.achievements.length;

      for (var j = 0; j < reg.achievements.length; j++) {
        var a = Game.Achievements[reg.achievements[j]];
        if (!a) continue;
        crates += _modCrate(a);
        if (a.won) modOwned++;
      }

      totalOwned += modOwned;
      totalAll   += modTotal;
      modsWithAchievs.push({ mod: mod, crates: crates, owned: modOwned, total: modTotal });
    }

    if (modsWithAchievs.length === 0) return '';

    var totalPct = totalAll > 0 ? Math.floor((totalOwned / totalAll) * 100) : 0;

    var str = '<div class="subsection">' +
              '<div class="title">MOD実績</div>' +
              '<div id="statsModAchievs">' +
              '<div class="listing"><b>MOD実績 獲得数:</b> ' +
              totalOwned + '/' + totalAll +
              ' (' + totalPct + '%)</div>';

    for (var k = 0; k < modsWithAchievs.length; k++) {
      var entry   = modsWithAchievs[k];
      var pct     = entry.total > 0 ? Math.floor((entry.owned / entry.total) * 100) : 0;
      var modName = entry.mod.name || entry.mod.id;

      str += '<div class="listing"><b>' + modName + '</b> ' +
             '<small style="opacity:0.7;">' + entry.owned + '/' + entry.total +
             ' (' + pct + '%)</small></div>';
      if (entry.crates) {
        str += '<div class="listing crateBox">' + entry.crates + '</div>';
      }
    }

    str += '</div></div>';
    return str;
  }

  function _buildModsListPanel() {
    // Mod一覧 subsection
    var str = '<div class="subsection">' +
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
    str += '</div>';

    // MOD実績セクション（本家Stats風・独立subsection）
    str += _buildModAchievementsSection();

    return str;
  }

  function _buildModPanel(modId) {
    var mod = null;
    for (var i = 0; i < _manifest.length; i++) if (_manifest[i].id === modId) { mod = _manifest[i]; break; }
    if (!mod) return '<div class="subsection"><div class="listing"><label>Mod が見つかりません。</label></div></div>';
    if (!_enabled[modId]) return '<div class="subsection"><div class="listing"><label>この Mod は OFF です。MODタブで ON にしてください。</label></div></div>';

    var s = _buildSettingsSection(modId);
    if (!s) {
      s = '<div class="subsection">' +
          '<div class="title">' + (mod.name || mod.id) + '</div>' +
          '<div class="listing"><label>表示する設定はありません。</label></div>' +
          '</div>';
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
      str += '<div style="padding-bottom:128px;"></div>';
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
    _hookSaveLoad();
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
