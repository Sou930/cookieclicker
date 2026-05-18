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
    }
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
    s.src = mod.file + '?_=' + Date.now();
    s.onload = function () { _scripts[mod.id] = s; if (onReady) onReady(); };
    s.onerror = function () { console.error('[ModLoader] 読み込み失敗:', mod.file); };
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
     ゲームネイティブ風 Mods ブロック HTML 生成
     main.js の App.writeModUI パターンを踏襲
  ========================================================= */
  function _buildModBlock() {
    var inner = '';

    if (_manifest.length === 0) {
      inner = '<div class="listing"><label>mods/mod-manifest.json にMODが登録されていません。</label></div>';
    } else {
      for (var i = 0; i < _manifest.length; i++) {
        var mod  = _manifest[i];
        var isOn = !!_enabled[mod.id];

        // ON ボタン: 有効時は視覚的に強調
        var onStyle  = isOn
          ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);'
          : 'opacity:0.45;';
        var offStyle = !isOn
          ? 'background:rgba(200,80,80,0.35);border-color:rgba(200,80,80,0.7);'
          : 'opacity:0.45;';

        inner +=
          '<div class="listing">' +
            '<a class="option smallFancyButton" style="' + onStyle + '" ' +
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">' +
              'ON' +
            '</a>' +
            '<a class="option smallFancyButton" style="' + offStyle + '" ' +
              'onclick="ModLoader_toggle(\'' + mod.id + '\');return false;">' +
              'OFF' +
            '</a>' +
            '<b style="margin-left:8px;">' + mod.name + '</b>' +
            (mod.version
              ? ' <small style="opacity:0.5;">v' + mod.version + '</small>'
              : '') +
            (mod.author
              ? ' <small style="opacity:0.5;">by ' + mod.author + '</small>'
              : '') +
            (mod.description
              ? '<br><label>' + mod.description + '</label>'
              : '') +
          '</div>';
      }
    }

    return (
      '<div id="modLoaderBlock" class="block" style="padding:0px;margin:8px 4px;">' +
        '<div class="subsection" style="padding:0px;">' +
          '<div class="title">Mods</div>' +
          inner +
        '</div>' +
      '</div>'
    );
  }

  /* =========================================================
     Game.UpdateMenu フック
     main.js 6954行: str+='<div style="height:128px;"></div>';
     の直前（= prefs ブロック末尾）に Mods ブロックを差し込む
  ========================================================= */
  function _hookUpdateMenu() {
    if (typeof Game === 'undefined' || typeof Game.UpdateMenu !== 'function') {
      setTimeout(_hookUpdateMenu, 300);
      return;
    }

    var _orig = Game.UpdateMenu;

    Game.UpdateMenu = function () {
      _orig.call(this);

      if (Game.onMenu !== 'prefs') return;

      var menu = document.getElementById('menu');
      if (!menu) return;

      // 前回のMODブロックを除去
      var old = document.getElementById('modLoaderBlock');
      if (old) old.parentNode.removeChild(old);

      // 新しいMODブロックを生成
      var wrapper = document.createElement('div');
      wrapper.innerHTML = _buildModBlock();
      var block = wrapper.firstChild; // #modLoaderBlock

      // height:128px スペーサーの直前に挿入（なければ末尾）
      var spacer = null;
      var ch = menu.children;
      for (var i = ch.length - 1; i >= 0; i--) {
        if (ch[i].style && ch[i].style.height === '128px') {
          spacer = ch[i];
          break;
        }
      }
      if (spacer) {
        menu.insertBefore(block, spacer);
      } else {
        menu.appendChild(block);
      }
    };

    console.log('[ModLoader] Game.UpdateMenu フック完了');
  }

  /* =========================================================
     初期化
  ========================================================= */
  function _init() {
    _loadState();

    fetch(MANIFEST_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        _manifest = Array.isArray(data) ? data : [];
        console.log('[ModLoader] manifest 読み込み (' + _manifest.length + ' MOD)');

        // 前回ONだったMODを自動有効化
        for (var i = 0; i < _manifest.length; i++) {
          if (_enabled[_manifest[i].id]) _enableMod(_manifest[i]);
        }

        _hookUpdateMenu();
      })
      .catch(function (err) {
        console.warn('[ModLoader] manifest 読み込みエラー:', err);
        _hookUpdateMenu(); // manifest がなくてもフックは仕込む
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
