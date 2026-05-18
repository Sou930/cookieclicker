/**
 * mod-loader.js
 * =============
 * Cookie Clicker MODローダー
 *
 * 機能:
 *  - mods/mod-manifest.json からMOD一覧を読み込む
 *  - LocalStorageでON/OFF状態を保存・復元
 *  - ゲームのオプション画面 (Options) にMOD設定欄を追加
 *  - MODファイルを動的に <script> タグで読み込み/アンロード
 *
 * 使い方:
 *  index.html の </body> 直前に以下を追記するだけ:
 *    <script src="mod-loader.js"></script>
 */

(function () {
  'use strict';

  // =============================================
  // 定数・設定
  // =============================================
  var MANIFEST_URL = 'mods/mod-manifest.json';
  var STORAGE_KEY  = 'CookieClickerModsEnabled'; // LocalStorage キー

  // =============================================
  // グローバルAPI (各MODファイルから参照する)
  // =============================================
  var registeredMods = {}; // { id: modObject }

  window.CookieClickerMods = {
    /**
     * MODオブジェクトを登録する。
     * MODファイル内の最後に呼び出す。
     * @param {Object} mod - { id, init, disable } を持つオブジェクト
     */
    register: function (mod) {
      if (!mod || !mod.id) {
        console.error('[ModLoader] register: id が必要です');
        return;
      }
      registeredMods[mod.id] = mod;
      console.log('[ModLoader] MOD登録済み:', mod.id);
    },
  };

  // =============================================
  // 内部状態
  // =============================================
  var manifestData   = [];          // mod-manifest.json の中身
  var loadedScripts  = {};          // { id: <script>要素 }
  var enabledState   = {};          // { id: true/false }

  // =============================================
  // LocalStorage ユーティリティ
  // =============================================
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledState));
    } catch (e) {}
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) enabledState = JSON.parse(raw);
    } catch (e) {}
  }

  // =============================================
  // スクリプト動的ロード/アンロード
  // =============================================
  function loadScript(mod, callback) {
    if (loadedScripts[mod.id]) { if (callback) callback(); return; }
    var script = document.createElement('script');
    script.src = mod.file + '?_=' + Date.now(); // キャッシュ回避
    script.onload  = function () { loadedScripts[mod.id] = script; if (callback) callback(); };
    script.onerror = function () { console.error('[ModLoader] 読み込みエラー:', mod.file); };
    document.body.appendChild(script);
  }

  function unloadScript(mod) {
    var script = loadedScripts[mod.id];
    if (script) {
      script.parentNode && script.parentNode.removeChild(script);
      delete loadedScripts[mod.id];
    }
    delete registeredMods[mod.id];
  }

  // =============================================
  // MON ON/OFF 切り替え
  // =============================================
  function enableMod(mod) {
    loadScript(mod, function () {
      // スクリプト読み込み後、登録されたMODの init() を呼ぶ
      var registered = registeredMods[mod.id];
      if (registered && typeof registered.init === 'function') {
        registered.init();
      }
    });
    enabledState[mod.id] = true;
    saveState();
  }

  function disableMod(mod) {
    var registered = registeredMods[mod.id];
    if (registered && typeof registered.disable === 'function') {
      registered.disable();
    }
    unloadScript(mod);
    enabledState[mod.id] = false;
    saveState();
  }

  // =============================================
  // オプション画面へのUI挿入
  // =============================================
  function buildModUI() {
    if (manifestData.length === 0) return '';

    var html = '<div id="modLoaderSection" style="' +
      'border-top:1px solid rgba(255,255,255,0.15);' +
      'margin-top:12px;padding-top:10px;">' +
      '<div class="title" style="font-size:14px;margin-bottom:6px;">🛠 MOD</div>';

    manifestData.forEach(function (mod) {
      var isOn = !!enabledState[mod.id];
      html +=
        '<div class="listing" style="margin:4px 0;">' +
          '<a class="option' + (isOn ? ' on' : '') + '" ' +
            'id="modToggle_' + mod.id + '" ' +
            'onclick="CookieClickerModLoader.toggle(\'' + mod.id + '\');return false;">' +
            (isOn ? 'MOD ON' : 'MOD OFF') +
          '</a> ' +
          '<b>' + mod.name + '</b> ' +
          '<small style="opacity:0.6;">v' + (mod.version || '?') + ' by ' + (mod.author || '?') + '</small>' +
          '<br><small style="opacity:0.5;padding-left:4px;">' + (mod.description || '') + '</small>' +
        '</div>';
    });

    html += '</div>';
    return html;
  }

  // ゲームのメニュー構築関数をフック
  function hookOptionsMenu() {
    if (typeof Game === 'undefined' || typeof Game.UpdateMenu === 'undefined') {
      setTimeout(hookOptionsMenu, 500);
      return;
    }

    var _originalUpdateMenu = Game.UpdateMenu.bind(Game);
    Game.UpdateMenu = function () {
      _originalUpdateMenu();

      // Options タブが開いているときだけ追加
      if (Game.onMenu !== 'prefs') return;

      var menu = document.getElementById('menu');
      if (!menu) return;

      // 既に追加済みなら更新のみ
      var existing = document.getElementById('modLoaderSection');
      if (existing) {
        existing.outerHTML = buildModUI();
        return;
      }

      // メニューの末尾に追記
      var tmp = document.createElement('div');
      tmp.innerHTML = buildModUI();
      while (tmp.firstChild) {
        menu.appendChild(tmp.firstChild);
      }
    };

    console.log('[ModLoader] オプション画面フック完了');
  }

  // =============================================
  // グローバルトグルAPI (HTML onclick から呼ぶ)
  // =============================================
  window.CookieClickerModLoader = {
    toggle: function (modId) {
      var mod = manifestData.find(function (m) { return m.id === modId; });
      if (!mod) return;

      if (enabledState[modId]) {
        disableMod(mod);
      } else {
        enableMod(mod);
      }

      // ボタン表示を即時更新
      var btn = document.getElementById('modToggle_' + modId);
      if (btn) {
        var isOn = !!enabledState[modId];
        btn.textContent = isOn ? 'MOD ON' : 'MOD OFF';
        btn.className   = 'option' + (isOn ? ' on' : '');
      }
    },
  };

  // =============================================
  // 初期化
  // =============================================
  function init() {
    loadState();

    // manifest を fetch で取得
    fetch(MANIFEST_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        manifestData = data;
        console.log('[ModLoader] manifest 読み込み完了。MOD数:', manifestData.length);

        // 保存済みで ON になっていたMODを自動有効化
        manifestData.forEach(function (mod) {
          if (enabledState[mod.id]) {
            enableMod(mod);
          }
        });

        // オプション画面フック
        hookOptionsMenu();
      })
      .catch(function (err) {
        console.error('[ModLoader] manifest 読み込みエラー:', err);
      });
  }

  // DOMContentLoaded 後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
