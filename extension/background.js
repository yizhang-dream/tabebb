import {
  mergeSettings,
  getTabUrl,
  isInternalUrl,
  readUrlRecord,
  detectRestoreBursts,
  extractTrueHistoryVisitMs,
  resolveTabActivity,
  evaluateTabs,
  pruneUrlMap,
} from './core.js';

const STORAGE_KEYS = {
  SETTINGS: 'settings',
  TAB_MAP: 'tabMap',
  URL_MAP: 'urlMap',
  CLOSED_HISTORY: 'closedHistory',
  STATS: 'stats',
};

const ALARM_PERIODIC = 'edge-tab-reaper-periodic';
const ALARM_STARTUP = 'edge-tab-reaper-startup';
const MAX_HISTORY = 300;

let storageQueue = Promise.resolve();

function isTransientSwError(err) {
  const msg = String(err?.message || err || '');
  return /\bNo SW\b|Service worker|Extension context invalidated|Receiving end does not exist/i.test(msg);
}

async function withSwRetry(fn, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries && isTransientSwError(err)) {
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
      throw err;
    }
  }
}

function enqueueStorage(task) {
  const run = async () => {
    try {
      await storageQueue;
    } catch {
      // Previous op handled its own error.
    }
    return await task();
  };
  const next = run();
  storageQueue = next;
  return next;
}

function safeListener(label, fn) {
  return (...args) => {
    (async () => {
      try {
        await fn(...args);
      } catch (err) {
        if (isTransientSwError(err)) return;
        console.warn(`[edge-tab-reaper] ${label} error:`, err?.message || err);
      }
    })();
  };
}

async function loadState() {
  const data = await withSwRetry(() =>
    chrome.storage.local.get([
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.TAB_MAP,
      STORAGE_KEYS.URL_MAP,
      STORAGE_KEYS.CLOSED_HISTORY,
      STORAGE_KEYS.STATS,
    ])
  );
  return {
    settings: mergeSettings(data[STORAGE_KEYS.SETTINGS]),
    tabMap: data[STORAGE_KEYS.TAB_MAP] || {},
    urlMap: data[STORAGE_KEYS.URL_MAP] || {},
    closedHistory: Array.isArray(data[STORAGE_KEYS.CLOSED_HISTORY]) ? data[STORAGE_KEYS.CLOSED_HISTORY] : [],
    stats: data[STORAGE_KEYS.STATS] || { totalClosed: 0, lastRunAt: null, lastClosedCount: 0 },
  };
}

async function ensureAlarm(settings) {
  const existing = await withSwRetry(() => chrome.alarms.get(ALARM_PERIODIC));
  if (!existing || existing.periodInMinutes !== settings.checkIntervalMinutes) {
    await withSwRetry(() =>
      chrome.alarms.create(ALARM_PERIODIC, {
        periodInMinutes: settings.checkIntervalMinutes,
      })
    );
  }
}

/**
 * Query Edge's real History DB for each tab URL, detect Edge session-restore reload bursts,
 * and strip out fake restore `reload` visits + post-reload redirect chains!
 */
async function lookupHistoryForTabs(tabs) {
  const historyMap = {};
  if (!chrome.history?.getVisits) return historyMap;

  const uniqueUrls = new Set();
  for (const tab of tabs) {
    const url = getTabUrl(tab);
    if (url && !isInternalUrl(url)) uniqueUrls.add(url);
  }

  const visitsByUrl = new Map();
  const allReloadTimes = [];

  await Promise.all(
    Array.from(uniqueUrls).map(async (url) => {
      try {
        let visits = await chrome.history.getVisits({ url });
        if ((!visits || visits.length === 0) && url.includes('#')) {
          visits = await chrome.history.getVisits({ url: url.split('#')[0] });
        }
        const list = Array.isArray(visits) ? visits : [];
        visitsByUrl.set(url, list);
        for (const v of list) {
          if (v?.transition === 'reload' && typeof v.visitTime === 'number' && v.visitTime > 0) {
            allReloadTimes.push(v.visitTime);
          }
        }
      } catch {
        // Leave unset if history query fails for this URL.
      }
    })
  );

  const burstWindows = detectRestoreBursts(allReloadTimes);

  for (const [url, list] of visitsByUrl.entries()) {
    historyMap[url] = extractTrueHistoryVisitMs(list, burstWindows);
  }

  return historyMap;
}

async function syncAllOpenTabs(now = Date.now()) {
  const tabs = await withSwRetry(() => chrome.tabs.query({}));
  const historyMap = await lookupHistoryForTabs(tabs);

  return enqueueStorage(async () => {
    const state = await loadState();
    const nextTabMap = {};
    const nextUrlMap = { ...state.urlMap };
    const openUrls = new Set();

    for (const tab of tabs) {
      const url = getTabUrl(tab);
      const { lastActiveMs, source } = resolveTabActivity(tab, state.tabMap, state.urlMap, historyMap, now);
      const persistSource = source === 'history' ? 'history-filtered' : source;
      nextTabMap[String(tab.id)] = { url, lastActiveMs, source: persistSource };

      if (url && !isInternalUrl(url)) {
        openUrls.add(url);
        const existingRec = readUrlRecord(nextUrlMap, url);
        if (tab.active) {
          nextUrlMap[url] = { ts: now, source: 'activated' };
        } else if (existingRec && existingRec.source === 'activated') {
          nextUrlMap[url] = {
            ts: Math.max(existingRec.ts, lastActiveMs),
            source: 'activated',
          };
        } else if (source === 'history' || source === 'history-expired') {
          nextUrlMap[url] = { ts: lastActiveMs, source: persistSource };
        } else if (!existingRec || existingRec.source === 'legacy' || existingRec.source === 'history') {
          nextUrlMap[url] = { ts: lastActiveMs, source: persistSource };
        }
      }
    }

    const prunedUrlMap = pruneUrlMap(nextUrlMap, openUrls, now);
    await withSwRetry(() =>
      chrome.storage.local.set({
        [STORAGE_KEYS.TAB_MAP]: nextTabMap,
        [STORAGE_KEYS.URL_MAP]: prunedUrlMap,
      })
    );
    return { ...state, tabMap: nextTabMap, urlMap: prunedUrlMap, tabs, historyMap };
  });
}

async function recordTabActive(tabId, now = Date.now()) {
  return enqueueStorage(async () => {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (!tab) return;
    const url = getTabUrl(tab);
    const data = await withSwRetry(() =>
      chrome.storage.local.get([STORAGE_KEYS.TAB_MAP, STORAGE_KEYS.URL_MAP])
    );
    const tabMap = data[STORAGE_KEYS.TAB_MAP] || {};
    const urlMap = data[STORAGE_KEYS.URL_MAP] || {};

    tabMap[String(tab.id)] = { url, lastActiveMs: now, source: 'activated' };
    if (url && !isInternalUrl(url)) {
      urlMap[url] = { ts: now, source: 'activated' };
    }

    await withSwRetry(() =>
      chrome.storage.local.set({
        [STORAGE_KEYS.TAB_MAP]: tabMap,
        [STORAGE_KEYS.URL_MAP]: urlMap,
      })
    );
  });
}

async function getOrCreateArchiveFolder(folderName) {
  const tree = await chrome.bookmarks.getTree();
  const rootChildren = tree?.[0]?.children || [];
  const parent = rootChildren[1] || rootChildren[0];
  if (!parent) return null;

  const existing = (parent.children || []).find(
    node => !node.url && node.title === folderName
  );
  if (existing) return existing.id;

  const created = await chrome.bookmarks.create({
    parentId: parent.id,
    title: folderName,
  });
  return created.id;
}

async function archiveTabsToBookmarks(entries, folderName) {
  if (!entries.length) return 0;
  try {
    const folderId = await getOrCreateArchiveFolder(folderName);
    if (!folderId) return 0;
    const existingChildren = await chrome.bookmarks.getChildren(folderId);
    const existingUrls = new Set(existingChildren.map(c => c.url).filter(Boolean));

    let added = 0;
    for (const item of entries) {
      if (!item.url || isInternalUrl(item.url) || existingUrls.has(item.url)) continue;
      await chrome.bookmarks.create({
        parentId: folderId,
        title: item.title || item.url,
        url: item.url,
      });
      existingUrls.add(item.url);
      added++;
    }
    return added;
  } catch (err) {
    console.warn('[edge-tab-reaper] Bookmark archive failed:', err?.message || err);
    return 0;
  }
}

async function updateBadge(count) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#0f766e' });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch {
    // Ignore transient badge errors.
  }
}

async function reapExpiredTabs(trigger = 'alarm', forceRun = false) {
  const now = Date.now();
  const synced = await syncAllOpenTabs(now);
  const { settings, tabs, historyMap } = synced;

  if (!settings.enabled && !forceRun) {
    const preview = evaluateTabs(tabs, synced, settings, now, historyMap);
    await updateBadge(preview.toClose.length);
    return { skipped: true, reason: 'disabled', closedCount: 0, preview };
  }

  const evaluation = evaluateTabs(tabs, synced, settings, now, historyMap);
  const toClose = evaluation.toClose;

  if (toClose.length === 0) {
    const nextStats = {
      ...synced.stats,
      lastRunAt: now,
      lastClosedCount: 0,
      lastTrigger: trigger,
    };
    await enqueueStorage(() =>
      withSwRetry(() => chrome.storage.local.set({ [STORAGE_KEYS.STATS]: nextStats }))
    );
    await updateBadge(0);
    return { skipped: false, closedCount: 0, evaluation, stats: nextStats };
  }

  if (settings.archiveToBookmarks) {
    await archiveTabsToBookmarks(toClose, settings.bookmarkFolderName);
  }

  const closedRecords = toClose.map(item => ({
    title: item.title,
    url: item.url,
    host: item.host,
    lastActiveMs: item.lastActiveMs,
    source: item.source,
    closedAt: now,
    idleDays: item.idleDays,
  }));

  const ids = toClose.map(item => item.id);
  let removedCount = 0;
  try {
    await chrome.tabs.remove(ids);
    removedCount = ids.length;
  } catch {
    for (const id of ids) {
      try {
        await chrome.tabs.remove(id);
        removedCount++;
      } catch {
        // Ignore already-closed tab.
      }
    }
  }

  const nextStats = await enqueueStorage(async () => {
    const latest = await loadState();
    const nextTabMap = { ...latest.tabMap };
    for (const id of ids) {
      delete nextTabMap[String(id)];
    }
    const nextHistory = [...closedRecords, ...latest.closedHistory].slice(0, MAX_HISTORY);
    const updatedStats = {
      totalClosed: (latest.stats.totalClosed || 0) + removedCount,
      lastRunAt: now,
      lastClosedCount: removedCount,
      lastTrigger: trigger,
    };
    await withSwRetry(() =>
      chrome.storage.local.set({
        [STORAGE_KEYS.TAB_MAP]: nextTabMap,
        [STORAGE_KEYS.CLOSED_HISTORY]: nextHistory,
        [STORAGE_KEYS.STATS]: updatedStats,
      })
    );
    return updatedStats;
  });

  await updateBadge(0);
  return { skipped: false, closedCount: removedCount, closedRecords, evaluation, stats: nextStats };
}

chrome.runtime.onInstalled.addListener(
  safeListener('onInstalled', async () => {
    const state = await loadState();
    await enqueueStorage(() =>
      withSwRetry(() => chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: state.settings }))
    );
    await ensureAlarm(state.settings);
    const now = Date.now();
    const synced = await syncAllOpenTabs(now);
    const preview = evaluateTabs(synced.tabs, synced, state.settings, now, synced.historyMap);
    await updateBadge(preview.toClose.length);
  })
);

chrome.runtime.onStartup.addListener(
  safeListener('onStartup', async () => {
    const state = await loadState();
    await ensureAlarm(state.settings);
    await withSwRetry(() => chrome.alarms.create(ALARM_STARTUP, { delayInMinutes: 0.5 }));
    setTimeout(
      safeListener('startup-quick', async () => {
        await reapExpiredTabs('startup-quick');
      }),
      8000
    );
  })
);

chrome.alarms.onAlarm.addListener(
  safeListener('onAlarm', async (alarm) => {
    if (alarm.name === ALARM_PERIODIC || alarm.name === ALARM_STARTUP) {
      await reapExpiredTabs(alarm.name);
    }
  })
);

chrome.tabs.onActivated.addListener(
  safeListener('onActivated', async ({ tabId }) => {
    await recordTabActive(tabId, Date.now());
  })
);

chrome.windows.onFocusChanged.addListener(
  safeListener('onFocusChanged', async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab) {
      await recordTabActive(activeTab.id, Date.now());
    }
  })
);

chrome.tabs.onUpdated.addListener(
  safeListener('onUpdated', async (tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    const now = Date.now();
    if (tab.active) {
      await recordTabActive(tabId, now);
      return;
    }
    const historyMap = await lookupHistoryForTabs([tab]);
    await enqueueStorage(async () => {
      const data = await withSwRetry(() =>
        chrome.storage.local.get([STORAGE_KEYS.TAB_MAP, STORAGE_KEYS.URL_MAP])
      );
      const tabMap = data[STORAGE_KEYS.TAB_MAP] || {};
      const urlMap = data[STORAGE_KEYS.URL_MAP] || {};
      const url = changeInfo.url;
      const { lastActiveMs, source } = resolveTabActivity(tab, tabMap, urlMap, historyMap, now);
      const persistSource = source === 'history' ? 'history-filtered' : source;
      tabMap[String(tabId)] = { url, lastActiveMs, source: persistSource };
      if (url && !isInternalUrl(url)) {
        const existingRec = readUrlRecord(urlMap, url);
        if (!existingRec || existingRec.source === 'legacy' || existingRec.source === 'history') {
          urlMap[url] = { ts: lastActiveMs, source: persistSource };
        }
      }
      await withSwRetry(() =>
        chrome.storage.local.set({
          [STORAGE_KEYS.TAB_MAP]: tabMap,
          [STORAGE_KEYS.URL_MAP]: urlMap,
        })
      );
    });
  })
);

chrome.tabs.onRemoved.addListener(
  safeListener('onRemoved', async (tabId) => {
    await enqueueStorage(async () => {
      const data = await withSwRetry(() => chrome.storage.local.get(STORAGE_KEYS.TAB_MAP));
      const tabMap = data[STORAGE_KEYS.TAB_MAP] || {};
      if (Object.prototype.hasOwnProperty.call(tabMap, String(tabId))) {
        delete tabMap[String(tabId)];
        await withSwRetry(() => chrome.storage.local.set({ [STORAGE_KEYS.TAB_MAP]: tabMap }));
      }
    });
  })
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'GET_STATUS') {
        const now = Date.now();
        const synced = await syncAllOpenTabs(now);
        const evaluation = evaluateTabs(synced.tabs, synced, synced.settings, now, synced.historyMap);
        await updateBadge(evaluation.toClose.length);
        sendResponse({
          ok: true,
          settings: synced.settings,
          stats: synced.stats,
          evaluation,
          closedHistory: synced.closedHistory.slice(0, 50),
        });
        return;
      }

      if (msg?.type === 'UPDATE_SETTINGS') {
        const nextSettings = mergeSettings(msg.settings);
        await enqueueStorage(() =>
          withSwRetry(() => chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: nextSettings }))
        );
        await ensureAlarm(nextSettings);
        const now = Date.now();
        const synced = await syncAllOpenTabs(now);
        const evaluation = evaluateTabs(synced.tabs, synced, nextSettings, now, synced.historyMap);
        await updateBadge(evaluation.toClose.length);
        sendResponse({ ok: true, settings: nextSettings, evaluation });
        return;
      }

      if (msg?.type === 'RUN_REAP_NOW') {
        const res = await reapExpiredTabs('manual', true);
        const now = Date.now();
        const synced = await syncAllOpenTabs(now);
        const evaluation = evaluateTabs(synced.tabs, synced, synced.settings, now, synced.historyMap);
        sendResponse({
          ok: true,
          closedCount: res.closedCount,
          stats: synced.stats,
          evaluation,
          closedHistory: synced.closedHistory.slice(0, 50),
        });
        return;
      }

      if (msg?.type === 'RESTORE_TAB' && msg.url) {
        const created = await chrome.tabs.create({ url: msg.url, active: true });
        if (created?.id) await recordTabActive(created.id, Date.now());
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'CLEAR_HISTORY') {
        await enqueueStorage(() =>
          withSwRetry(() => chrome.storage.local.set({ [STORAGE_KEYS.CLOSED_HISTORY]: [] }))
        );
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true;
});
