(() => {
  'use strict';

  const SAVE_KEY = 'autonomousCookieFactorySaveV1';
  const CONFIG = {
    saveIntervalMs: 5000,
    baseOfflineCapSeconds: 6 * 60 * 60,
    maxTrustedAbsenceSeconds: 14 * 24 * 60 * 60,
    suspiciousFallbackSeconds: 2 * 60 * 60,
    minimumPopupSeconds: 60,
    tickMs: 250
  };

  const categories = [
    { id: 'production', name: '生産施設' },
    { id: 'research', name: '研究' },
    { id: 'automation', name: '自動化' },
    { id: 'offline', name: 'オフライン' },
    { id: 'forbidden', name: '禁断技術' }
  ];

  const upgrades = [
    { id: 'press', category: 'production', icon: '🍪', name: '手動プレス機', description: 'クリック出力と基礎生産を少し増加', baseCost: 15, scale: 1.16, cps: 0.2, click: 1 },
    { id: 'mixer', category: 'production', icon: '🌀', name: '生地混練ライン', description: '安定した毎秒生産を追加', baseCost: 100, scale: 1.18, cps: 1.2 },
    { id: 'oven', category: 'production', icon: '🔥', name: '連続焼成炉', description: '高温ラインで大量焼成', baseCost: 650, scale: 1.2, cps: 8 },
    { id: 'packer', category: 'production', icon: '📦', name: '包装ロボット群', description: '完成品搬出を高速化', baseCost: 3200, scale: 1.22, cps: 38 },
    { id: 'reactor', category: 'production', icon: '⚡', name: '砂糖反応炉', description: '工場全体へ高密度エネルギー供給', baseCost: 18000, scale: 1.24, cps: 210 },

    { id: 'recipe', category: 'research', icon: '📘', name: '量産レシピ解析', description: '全生産効率 +12%', baseCost: 500, scale: 1.8, productionMultiplier: 0.12 },
    { id: 'servo', category: 'research', icon: '🔩', name: '精密サーボ調整', description: 'クリック出力 +25%', baseCost: 900, scale: 1.75, clickMultiplier: 0.25 },
    { id: 'neon', category: 'research', icon: '💡', name: 'ネオン管制盤', description: '全生産効率 +20% と演出強化', baseCost: 4200, scale: 1.9, productionMultiplier: 0.2 },
    { id: 'quality', category: 'research', icon: '🔬', name: '品質予測研究', description: '施設生産 +30%', baseCost: 14000, scale: 2.05, productionMultiplier: 0.3 },

    { id: 'autoArm', category: 'automation', icon: '🦾', name: '自動クリックアーム', description: '自動クリック相当の生産を追加', baseCost: 300, scale: 1.2, autoClickCps: 1 },
    { id: 'drone', category: 'automation', icon: '🚁', name: '管理ドローン', description: '全生産効率 +15%', baseCost: 1600, scale: 1.55, productionMultiplier: 0.15 },
    { id: 'ai', category: 'automation', icon: '🧠', name: '自動管理AI', description: 'オフライン中に予算の一部で自動購入', baseCost: 8500, scale: 2.1, autoBuy: 1 },
    { id: 'selfLine', category: 'automation', icon: '🏭', name: '自己増設ライン', description: '自動化が進むほど毎秒生産が上昇', baseCost: 42000, scale: 2.25, automationSynergy: 0.08 },

    { id: 'night', category: 'offline', icon: '🌙', name: '夜勤アルバイター', description: 'オフライン生産効率 +15%', baseCost: 1200, scale: 1.65, offlineEfficiency: 0.15 },
    { id: 'compressor', category: 'offline', icon: '⏳', name: '時間圧縮装置', description: 'オフライン時間倍率 +25%', baseCost: 4800, scale: 1.9, timeCompression: 0.25 },
    { id: 'welcome', category: 'offline', icon: '🎉', name: '起動祝い', description: '復帰後しばらく生産倍率が大幅上昇', baseCost: 9000, scale: 2.0, loginBurst: 1 },
    { id: 'sleep', category: 'offline', icon: '🛌', name: '深層睡眠処理', description: 'オフライン蓄積上限時間 +2時間', baseCost: 12000, scale: 1.7, offlineCapHours: 2 },
    { id: 'coldVault', category: 'offline', icon: '❄️', name: '低温保管庫', description: '長時間不在時の損失を軽減', baseCost: 30000, scale: 2.1, offlineEfficiency: 0.22, offlineCapHours: 1 },

    { id: 'voidOven', category: 'forbidden', icon: '🕳️', name: '虚空焼成炉', description: '全生産効率 +60%、事故危険度 +3%', baseCost: 50000, scale: 2.0, productionMultiplier: 0.6, risk: 0.03 },
    { id: 'unstableClock', category: 'forbidden', icon: '💥', name: '不安定時計炉', description: 'オフライン倍率 +80%、事故危険度 +5%', baseCost: 90000, scale: 2.2, timeCompression: 0.8, risk: 0.05 },
    { id: 'redSwitch', category: 'forbidden', icon: '🚨', name: '赤色増幅スイッチ', description: '危険度に応じて生産倍率上昇', baseCost: 160000, scale: 2.35, riskReward: 0.35, risk: 0.04 }
  ];

  const elements = {};
  let state = createDefaultState();
  let activeCategory = 'production';
  let lastTick = Date.now();

  function createDefaultState() {
    return {
      cookies: 0,
      totalCookies: 0,
      lastSeen: Date.now(),
      levels: {},
      log: ['自律工場の中枢を起動しました。'],
      burstUntil: 0,
      burstMultiplier: 1,
      createdAt: Date.now()
    };
  }

  function cacheElements() {
    const ids = ['cookieCount', 'perSecond', 'manualButton', 'floatingLayer', 'statusText', 'burstText', 'offlineCapText', 'clickPowerText', 'offlineEfficiencyText', 'timeCompressionText', 'riskText', 'archetypes', 'logList', 'categoryTabs', 'upgradeGrid', 'saveButton', 'resetButton', 'offlineModal', 'offlineDuration', 'offlineGain', 'offlineDetail', 'offlineClose'];
    ids.forEach(id => { elements[id] = document.getElementById(id); });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const loaded = JSON.parse(raw);
      state = { ...createDefaultState(), ...loaded, levels: loaded.levels || {}, log: loaded.log || [] };
    } catch (error) {
      state = createDefaultState();
      addLog('保存データの読み込みに失敗したため、新しい工場を起動しました。');
    }
  }

  function saveState() {
    state.lastSeen = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function getLevel(id) {
    return state.levels[id] || 0;
  }

  function getCost(upgrade) {
    return Math.ceil(upgrade.baseCost * Math.pow(upgrade.scale, getLevel(upgrade.id)));
  }

  function getStats() {
    let baseCps = 0;
    let clickPower = 1;
    let productionMultiplier = 1;
    let clickMultiplier = 1;
    let offlineEfficiency = 0.25;
    let offlineCapSeconds = CONFIG.baseOfflineCapSeconds;
    let timeCompression = 1;
    let autoBuyLevel = 0;
    let risk = 0;
    let riskReward = 0;
    let automationLevels = 0;

    upgrades.forEach(upgrade => {
      const level = getLevel(upgrade.id);
      if (!level) return;
      baseCps += (upgrade.cps || 0) * level;
      baseCps += (upgrade.autoClickCps || 0) * level;
      clickPower += (upgrade.click || 0) * level;
      productionMultiplier += (upgrade.productionMultiplier || 0) * level;
      clickMultiplier += (upgrade.clickMultiplier || 0) * level;
      offlineEfficiency += (upgrade.offlineEfficiency || 0) * level;
      offlineCapSeconds += (upgrade.offlineCapHours || 0) * level * 60 * 60;
      timeCompression += (upgrade.timeCompression || 0) * level;
      autoBuyLevel += (upgrade.autoBuy || 0) * level;
      risk += (upgrade.risk || 0) * level;
      riskReward += (upgrade.riskReward || 0) * level;
      if (upgrade.category === 'automation') automationLevels += level;
    });

    const synergy = 1 + (getLevel('selfLine') * 0.08 * Math.max(0, automationLevels - getLevel('selfLine')));
    const riskMultiplier = 1 + riskReward * Math.min(0.35, risk * 3);
    const burstActive = Date.now() < state.burstUntil;
    const burstMultiplier = burstActive ? state.burstMultiplier : 1;
    const cps = baseCps * productionMultiplier * synergy * riskMultiplier * burstMultiplier;

    return {
      baseCps,
      cps,
      offlineCps: baseCps * productionMultiplier * synergy * riskMultiplier,
      clickPower: clickPower * clickMultiplier,
      productionMultiplier,
      offlineEfficiency: Math.min(3, offlineEfficiency),
      offlineCapSeconds,
      timeCompression,
      autoBuyLevel,
      risk: Math.min(0.75, risk),
      burstActive,
      burstMultiplier,
      synergy,
      riskMultiplier
    };
  }

  function calculateOfflineGain(now) {
    const stats = getStats();
    const rawSeconds = Math.floor((now - (state.lastSeen || now)) / 1000);
    if (rawSeconds < 0) {
      addLog('端末時刻の逆行を検知しました。安全のためオフライン生産は停止しました。');
      return null;
    }
    if (rawSeconds < CONFIG.minimumPopupSeconds) return null;

    let suspicious = rawSeconds > CONFIG.maxTrustedAbsenceSeconds;
    const configuredCap = Math.floor(stats.offlineCapSeconds);
    const safetyCap = suspicious ? Math.min(configuredCap, CONFIG.suspiciousFallbackSeconds) : configuredCap;
    const cappedSeconds = Math.min(rawSeconds, safetyCap);
    const effectiveSeconds = cappedSeconds * stats.timeCompression;
    let gain = stats.offlineCps * effectiveSeconds * stats.offlineEfficiency;
    let accidentText = '';

    if (stats.risk > 0 && Math.random() < Math.min(0.6, stats.risk * 1.5)) {
      const lossRate = 0.2 + Math.random() * 0.35;
      gain *= (1 - lossRate);
      accidentText = `禁断設備の小事故により蓄積分が${formatPercent(lossRate)}減少しました。`;
      addLog(accidentText);
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 360);
    }

    gain = Math.floor(Math.max(0, gain));
    return { rawSeconds, cappedSeconds, effectiveSeconds, gain, suspicious, accidentText, stats };
  }

  function applyOfflineProgress() {
    const report = calculateOfflineGain(Date.now());
    if (!report || report.gain <= 0) return;

    state.cookies += report.gain;
    state.totalCookies += report.gain;
    let autoText = runOfflineAutoBuy(report.stats);

    const welcomeLevel = getLevel('welcome');
    if (welcomeLevel > 0) {
      const duration = (30 + (welcomeLevel - 1) * 10) * 1000;
      state.burstUntil = Date.now() + duration;
      state.burstMultiplier = 3 + welcomeLevel * 2;
      triggerBurstEffect();
    }

    const durationText = formatDuration(report.rawSeconds);
    const cappedText = report.rawSeconds > report.cappedSeconds ? `蓄積上限により${formatDuration(report.cappedSeconds)}まで換算しました。` : '蓄積上限内で全時間を換算しました。';
    const suspiciousText = report.suspicious ? '長すぎる不在時間を検知したため、安全上限を適用しました。' : '';
    const detailParts = [cappedText, suspiciousText, report.accidentText, autoText].filter(Boolean);

    elements.offlineDuration.textContent = `${durationText}の間、工場は稼働し続けました`;
    elements.offlineGain.textContent = `+${formatNumber(report.gain)} クッキー獲得`;
    elements.offlineDetail.textContent = detailParts.join(' ');
    elements.offlineModal.classList.remove('hidden');
    playSound('cashIn2.mp3');
    addLog(`${durationText}分のオフライン生産を回収しました。`);
  }

  function runOfflineAutoBuy(stats) {
    if (stats.autoBuyLevel <= 0) return '';
    const budgetRate = Math.min(0.55, 0.18 + stats.autoBuyLevel * 0.08);
    let budget = state.cookies * budgetRate;
    let bought = 0;
    const targetCategories = ['production', 'automation', 'offline'];

    while (bought < 20) {
      const affordable = upgrades
        .filter(upgrade => targetCategories.includes(upgrade.category))
        .map(upgrade => ({ upgrade, cost: getCost(upgrade) }))
        .filter(item => item.cost <= state.cookies && item.cost <= budget)
        .sort((a, b) => a.cost - b.cost)[0];
      if (!affordable) break;
      state.cookies -= affordable.cost;
      budget -= affordable.cost;
      state.levels[affordable.upgrade.id] = getLevel(affordable.upgrade.id) + 1;
      bought += 1;
    }

    if (bought > 0) {
      addLog(`自動管理AIが不在中に${bought}件の増設を実行しました。`);
      return `自動管理AIが${bought}件の増設を完了しました。`;
    }
    return '自動管理AIは予算不足のため待機しました。';
  }

  function buyUpgrade(id) {
    const upgrade = upgrades.find(item => item.id === id);
    if (!upgrade) return;
    const cost = getCost(upgrade);
    if (state.cookies < cost) {
      playSound('tickOff.mp3');
      addLog(`${upgrade.name}の費用が不足しています。`);
      return;
    }
    state.cookies -= cost;
    state.levels[id] = getLevel(id) + 1;
    addLog(`${upgrade.name}を増設しました。`);
    playSound(upgrade.category === 'forbidden' ? 'spell.mp3' : 'buy1.mp3');
    render();
    saveState();
  }

  function manualClick(event) {
    const stats = getStats();
    const gain = Math.max(1, Math.floor(stats.clickPower));
    state.cookies += gain;
    state.totalCookies += gain;
    elements.manualButton.classList.add('pressed');
    setTimeout(() => elements.manualButton.classList.remove('pressed'), 130);
    spawnFloatingNumber(`+${formatNumber(gain)}`, event.clientX, event.clientY);
    playSound(`click${1 + Math.floor(Math.random() * 7)}.mp3`);
    if (Math.random() < 0.08) spawnParticles(event.clientX, event.clientY, 8);
    render();
  }

  function tick() {
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    const stats = getStats();
    const gain = stats.cps * delta;
    if (gain > 0) {
      state.cookies += gain;
      state.totalCookies += gain;
    }
    renderCounters(stats);
  }

  function render() {
    const stats = getStats();
    renderCounters(stats);
    renderTabs();
    renderUpgrades();
    renderArchetypes(stats);
    renderLog();
  }

  function renderCounters(stats = getStats()) {
    elements.cookieCount.textContent = formatNumber(Math.floor(state.cookies));
    elements.perSecond.textContent = `毎秒 ${formatNumber(stats.cps)}`;
    elements.statusText.textContent = stats.cps > 0 ? '自律稼働中' : '手動待機中';
    elements.burstText.textContent = stats.burstActive ? `${formatNumber(stats.burstMultiplier)}倍` : 'なし';
    elements.offlineCapText.textContent = formatDuration(stats.offlineCapSeconds);
    elements.clickPowerText.textContent = formatNumber(stats.clickPower);
    elements.offlineEfficiencyText.textContent = formatPercent(stats.offlineEfficiency);
    elements.timeCompressionText.textContent = `${formatNumber(stats.timeCompression)}倍`;
    elements.riskText.textContent = formatPercent(stats.risk);
    document.body.classList.toggle('burst-active', stats.burstActive);
  }

  function renderTabs() {
    elements.categoryTabs.innerHTML = '';
    categories.forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = category.name;
      button.className = category.id === activeCategory ? 'active' : '';
      button.addEventListener('click', () => {
        activeCategory = category.id;
        playSound('switch.mp3');
        render();
      });
      elements.categoryTabs.appendChild(button);
    });
  }

  function renderUpgrades() {
    const template = document.getElementById('upgradeCardTemplate');
    elements.upgradeGrid.innerHTML = '';
    upgrades.filter(upgrade => upgrade.category === activeCategory).forEach(upgrade => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector('.upgrade-icon').textContent = upgrade.icon;
      node.querySelector('h3').textContent = upgrade.name;
      node.querySelector('p').textContent = upgrade.description;
      node.querySelector('.upgrade-cost').textContent = `費用 ${formatNumber(getCost(upgrade))}`;
      node.querySelector('.upgrade-level').textContent = `段階 ${getLevel(upgrade.id)}`;
      const button = node.querySelector('.buy-button');
      button.disabled = state.cookies < getCost(upgrade);
      button.textContent = button.disabled ? '不足' : '購入';
      button.addEventListener('click', () => buyUpgrade(upgrade.id));
      elements.upgradeGrid.appendChild(node);
    });
  }

  function renderArchetypes(stats) {
    const scores = [
      { name: '夜勤特化', desc: '長時間の不在で安定して蓄積する構成', score: getLevel('night') * 16 + getLevel('sleep') * 12 + getLevel('coldVault') * 14 },
      { name: '復帰爆発特化', desc: 'ログイン直後に巨大な生産波を起こす構成', score: getLevel('welcome') * 24 + (stats.burstActive ? 20 : 0) },
      { name: '完全自動化特化', desc: 'AIと機械腕が自律的に成長する構成', score: getLevel('autoArm') * 7 + getLevel('ai') * 22 + getLevel('selfLine') * 18 },
      { name: '時間圧縮特化', desc: '不在時間そのものを濃縮して稼ぐ構成', score: getLevel('compressor') * 22 + getLevel('unstableClock') * 18 },
      { name: '危険増幅特化', desc: '事故危険度を受け入れて高倍率を狙う構成', score: getLevel('voidOven') * 18 + getLevel('unstableClock') * 20 + getLevel('redSwitch') * 24 }
    ];
    elements.archetypes.innerHTML = '';
    scores.forEach(item => {
      const percent = Math.min(100, Math.round(item.score));
      const div = document.createElement('div');
      div.className = 'archetype';
      div.innerHTML = `<strong><span>${item.name}</span><span>${percent}%</span></strong><small>${item.desc}</small><div class="bar"><i style="width:${percent}%"></i></div>`;
      elements.archetypes.appendChild(div);
    });
  }

  function renderLog() {
    elements.logList.innerHTML = '';
    state.log.slice(-8).reverse().forEach(text => {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = text;
      elements.logList.appendChild(div);
    });
  }

  function spawnFloatingNumber(text, x, y) {
    const rect = elements.floatingLayer.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'float-number';
    span.textContent = text;
    span.style.left = `${x - rect.left}px`;
    span.style.top = `${y - rect.top}px`;
    elements.floatingLayer.appendChild(span);
    setTimeout(() => span.remove(), 1100);
  }

  function spawnParticles(x, y, count) {
    const rect = elements.floatingLayer.getBoundingClientRect();
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'burst-particle';
      dot.style.left = `${x - rect.left}px`;
      dot.style.top = `${y - rect.top}px`;
      dot.style.setProperty('--x', `${Math.cos(i / count * Math.PI * 2) * (60 + Math.random() * 50)}px`);
      dot.style.setProperty('--y', `${Math.sin(i / count * Math.PI * 2) * (60 + Math.random() * 50)}px`);
      elements.floatingLayer.appendChild(dot);
      setTimeout(() => dot.remove(), 950);
    }
  }

  function triggerBurstEffect() {
    const rect = elements.manualButton.getBoundingClientRect();
    spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 28);
  }

  function addLog(text) {
    state.log.push(text);
    if (state.log.length > 40) state.log = state.log.slice(-40);
  }

  function playSound(file) {
    try {
      const audio = new Audio(`snd/${file}`);
      audio.volume = 0.45;
      audio.play().catch(() => {});
    } catch (error) {
      // Audio playback may be blocked before the first user gesture.
    }
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '0';
    return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: value < 100 ? 1 : 0 }).format(value);
  }

  function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const parts = [];
    if (days) parts.push(`${days}日`);
    if (hours) parts.push(`${hours}時間`);
    if (minutes || parts.length === 0) parts.push(`${minutes}分`);
    return parts.join('');
  }

  function resetGame() {
    if (!confirm('工場データを初期化しますか？')) return;
    state = createDefaultState();
    saveState();
    addLog('工場データを初期化しました。');
    playSound('thud.mp3');
    render();
  }

  function bindEvents() {
    elements.manualButton.addEventListener('click', manualClick);
    elements.saveButton.addEventListener('click', () => {
      saveState();
      addLog('手動保存を完了しました。');
      playSound('tick.mp3');
      renderLog();
    });
    elements.resetButton.addEventListener('click', resetGame);
    elements.offlineClose.addEventListener('click', () => {
      elements.offlineModal.classList.add('hidden');
      playSound('swooshOut.mp3');
      render();
      saveState();
    });
    window.addEventListener('beforeunload', saveState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveState();
    });
  }

  function boot() {
    cacheElements();
    loadState();
    bindEvents();
    applyOfflineProgress();
    render();
    setInterval(tick, CONFIG.tickMs);
    setInterval(saveState, CONFIG.saveIntervalMs);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
