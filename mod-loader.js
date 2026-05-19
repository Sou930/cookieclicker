/**
 * mod-loader.js  ―  Cookie Clicker MOD Loader
 * =============================================
 * 配置: リポジトリルート (index.html と同じ階層)
 *
 * index.html の </body> 直前に追加:
 *   <script src="mod-loader.js"></script>
 *
 * 動作:
 *   - mods/mod-manifest.json からMOD一覧を読み込む
 *   - LocalStorage でON/OFF状態を永続化
 *   - Game.UpdateMenu を上書きし、Options の末尾に
 *     ゲームネイティブなスタイルの "Mods" セクションを追加
 *   - ONのMODは <script> タグで動的ロード → init() 呼び出し
 *   - OFFにすると disable() を呼んでからタグを削除
 */

(function () {
  'use strict';

  /* =========================================================
     定数
  ========================================================= */
  var MANIFEST_URL = 'mods/mod-manifest.json';
  var STORAGE_KEY  = 'CC_ModsEnabled';

  /* =========================================================
     グローバル公開API  ―  各MODファイルが呼び出す
  ========================================================= */
  var _registered  = {};  // { modId: modObject }
  var _pendingInit = {};  // ロード済みだが register() 前のもの

  window.CookieClickerMods = {
    /**
     * MODを登録する。MODファイルの末尾で必ず呼ぶ。
     * @param {{ id:string, init:function, disable:function }} mod
     */
    register: function (mod) {
      if (!mod || !mod.id) {
        console.error('[ModLoader] register(): id が必要です');
        return;
      }
      _registered[mod.id] = mod;
      // すでに有効化が要求されていたら即 init
      if (_pendingInit[mod.id]) {
        delete _pendingInit[mod.id];
        if (typeof mod.init === 'function') {
          try { mod.init(); }
          catch (e) { console.error('[ModLoader] init() エラー (' + mod.id + '):', e); }
        }
      }
    },
    /** 登録済みMODオブジェクトへの参照（achievements の後付け更新用） */
    _registered: _registered
  };

  /* =========================================================
     内部状態
  ========================================================= */
  var _manifest = [];  // mod-manifest.json の配列
  var _enabled  = {};  // { modId: bool }
  var _scripts  = {};  // { modId: <script>要素 }

  /* =========================================================
     LocalStorage
  ========================================================= */
  function _saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_enabled)); } catch (e) {}
  }
  function _loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _enabled = JSON.parse(raw);
    } catch (e) {}
  }

  /* =========================================================
     スクリプト動的ロード / アンロード
  ========================================================= */
  function _loadScript(mod, onReady) {
    if (_scripts[mod.id]) { if (onReady) onReady(); return; }
    var s = document.createElement('script');
    // 外部URL（http/https）はキャッシュバスターを付けない（CORS・ネットワーク問題を避ける）
    var isExternal = /^https?:\/\//.test(mod.file);
    s.src = isExternal ? mod.file : (mod.file + '?_=' + Date.now());
    s.onload = function () { _scripts[mod.id] = s; if (onReady) onReady(); };
    s.onerror = function () {
      console.error('[ModLoader] 読み込み失敗:', mod.file);
      // 失敗してもゲーム起動をブロックしないよう onReady を呼ぶ
      if (onReady) onReady();
    };
    document.body.appendChild(s);
  }

  function _unloadScript(modId) {
    var s = _scripts[modId];
    if (s && s.parentNode) s.parentNode.removeChild(s);
    delete _scripts[modId];
    delete _registered[modId];
    delete _pendingInit[modId];
  }

  /* =========================================================
     MOD ON / OFF
  ========================================================= */
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

  /* =========================================================
     トグル  ―  オプション画面のボタン onclick から呼ばれる
  ========================================================= */
  window.ModLoader_toggle = function (modId) {
    var mod = null;
    for (var i = 0; i < _manifest.length; i++) {
      if (_manifest[i].id === modId) { mod = _manifest[i]; break; }
    }
    if (!mod) return;
    if (_enabled[modId]) { _disableMod(mod); } else { _enableMod(mod); }
    // メニューを即再描画
    if (typeof Game !== 'undefined' && Game.UpdateMenu) Game.UpdateMenu();
  };

  /* =========================================================
     Mod内実績ブロック HTML 生成
     Game.Achievements から modId に関連する実績を集める
  ========================================================= */
  function _buildAchievSection(modId) {
    if (typeof Game === 'undefined' || !Game.Achievements) return '';
    var reg = _registered[modId];
    if (!reg || !reg.achievements || reg.achievements.length === 0) return '';

    var str = '<div class="block" style="padding:0px;margin:8px 4px;">' +
              '<div class="subsection" style="padding:0px;">' +
              '<div class="title">Mod内実績</div>' +
              '<div class="listing crateBox">';

    var found = 0;
    for (var j = 0; j < reg.achievements.length; j++) {
      var aName = reg.achievements[j];
      var a = Game.Achievements[aName];
      if (a) {
        str += Game.crate(a, 'stats');
        found++;
      }
    }
    str += '</div></div></div>';
    return found > 0 ? str : '';
  }

  /* =========================================================
     Mod設定ブロック HTML 生成
     各Modが settings() 関数を持つ場合はその内容を表示
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
     ゲームネイティブ風 Mods メニュー HTML 生成
  ========================================================= */
  function _buildModsMenu() {
    var str = '<div class="section">Mod</div>';

    // ── Mod一覧 ON/OFF ────────────────────────────────────
    str += '<div class="block" style="padding:0px;margin:8px 4px;">' +
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
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">' +
              'ON' +
            '</a>' +
            '<a class="option smallFancyButton" style="' + offStyle + '" ' +
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">' +
              'OFF' +
            '</a>' +
            ' <b style="margin-left:4px;">' + (mod.name || mod.id) + '</b>' +
            (mod.version ? ' <small style="opacity:0.5;">v' + mod.version + '</small>' : '') +
            (mod.author  ? ' <small style="opacity:0.5;">by ' + mod.author + '</small>' : '') +
            (mod.description ? '<br><label>' + mod.description + '</label>' : '') +
          '</div>';
      }
    }
    str += '</div></div>';

    // ── ロード中Modごとの設定 & 実績 ──────────────────────
    for (var k = 0; k < _manifest.length; k++) {
      var m = _manifest[k];
      if (!_enabled[m.id]) continue;
      str += _buildSettingsSection(m.id);
      str += _buildAchievSection(m.id);
    }

    // ── サードパーティ実績（shadow: Third-party 等） ───────
    if (typeof Game !== 'undefined' && Game.Achievements && Game.Achievements['Third-party']) {
      str += '<div class="block" style="padding:0px;margin:8px 4px;">' +
             '<div class="subsection" style="padding:0px;">' +
             '<div class="title">Mod関連実績</div>' +
             '<div class="listing crateBox">' +
             Game.crate(Game.Achievements['Third-party'], 'stats') +
             '</div>' +
             '</div></div>';
    }

    str += '<div style="height:128px;"></div>';
    return str;
  }

  /* =========================================================
     Game.UpdateMenu フック
     onMenu === 'mods' のときに Mod メニューを描画する
  ========================================================= */
  function _hookUpdateMenu() {
    if (typeof Game === 'undefined' || typeof Game.UpdateMenu !== 'function') {
      setTimeout(_hookUpdateMenu, 300);
      return;
    }

    var _orig = Game.UpdateMenu;

    Game.UpdateMenu = function () {
      _orig.call(this);

      // mods メニューのときだけ上書き描画
      if (Game.onMenu !== 'mods') return;

      var menu = document.getElementById('menu');
      if (!menu) return;

      menu.innerHTML = _buildModsMenu();
    };

    console.log('[ModLoader] Game.UpdateMenu フック完了');
  }

  /* =========================================================
     初期化
  ========================================================= */
  function _init() {
    _loadState();

    // fetch は file:// プロトコルで失敗するため XHR で代替
    var xhr = new XMLHttpRequest();
    xhr.open('GET', MANIFEST_URL + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      // file:// では status=0、http では status=200 が成功
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
