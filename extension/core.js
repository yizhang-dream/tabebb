export const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_EXPIRED_DAYS = 90;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  ttlDays: 3,
  protectPinned: true,
  protectAudible: true,
  protectGrouped: false,
  archiveToBookmarks: true,
  bookmarkFolderName: '自动清理归档 (3天未访问)',
  whitelistDomains: [],
  checkIntervalMinutes: 30,
});

export function mergeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  const days = Number(s.ttlDays);
  s.ttlDays = Number.isFinite(days) && days >= 0.01 ? days : DEFAULT_SETTINGS.ttlDays;
  const interval = Number(s.checkIntervalMinutes);
  s.checkIntervalMinutes = Number.isFinite(interval) && interval >= 5 ? interval : DEFAULT_SETTINGS.checkIntervalMinutes;
  s.whitelistDomains = Array.isArray(s.whitelistDomains)
    ? s.whitelistDomains.map(d => String(d).trim().toLowerCase()).filter(Boolean)
    : [];
  s.bookmarkFolderName = String(s.bookmarkFolderName || DEFAULT_SETTINGS.bookmarkFolderName).trim() || DEFAULT_SETTINGS.bookmarkFolderName;
  return s;
}

export function getTabUrl(tab) {
  return String(tab?.url || tab?.pendingUrl || '').trim();
}

export function isInternalUrl(url) {
  if (!url) return true;
  return /^(edge|chrome|chrome-extension|extension|about|devtools|view-source):/i.test(url);
}

export function extractHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isWhitelistedUrl(url, whitelistDomains) {
  if (!whitelistDomains || whitelistDomains.length === 0) return false;
  const host = extractHostname(url);
  if (!host) return false;
  return whitelistDomains.some(rule => {
    const clean = rule.replace(/^\*\./, '').replace(/^https?:\/\//, '').split('/')[0];
    if (!clean) return false;
    return host === clean || host.endsWith('.' + clean);
  });
}

/**
 * Detect Edge session-restore burst windows from reload visit timestamps (ms).
 * When Edge restarts with "Continue where you left off", it reloads dozens of old tabs
 * in a short burst (transition === "reload"), and some pages (Bing, SSO, SPAs) trigger a
 * follow-up JS/meta redirect ("link") 30-180s later. Filtering these bursts recovers the
 * true last human visit time!
 */
export function detectRestoreBursts(reloadTimestampsMs, minCount = 5, clusterSpanMs = 60_000, tailMs = 180_000) {
  const sorted = (reloadTimestampsMs || [])
    .filter(t => typeof t === 'number' && Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b);
  if (sorted.length < minCount) return [];

  const windows = [];
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > clusterSpanMs) {
      left++;
    }
    if (right - left + 1 >= minCount) {
      const start = sorted[left] - 5_000;
      const end = sorted[right] + tailMs;
      if (windows.length > 0 && start <= windows[windows.length - 1].end) {
        windows[windows.length - 1].end = Math.max(windows[windows.length - 1].end, end);
      } else {
        windows.push({ start, end });
      }
    }
  }
  return windows;
}

export function isInBurstWindows(ts, burstWindows) {
  if (!burstWindows || burstWindows.length === 0) return false;
  for (const w of burstWindows) {
    if (ts >= w.start && ts <= w.end) return true;
  }
  return false;
}

/**
 * Given all chrome.history VisitItems for one URL + global restore burst windows,
 * extract the latest genuine human visit timestamp (ignoring Edge session-restore reloads
 * and post-reload redirect visits within 180s of a reload).
 */
export function extractTrueHistoryVisitMs(visits, burstWindows = []) {
  if (!Array.isArray(visits) || visits.length === 0) return null;

  const valid = visits
    .filter(v => typeof v?.visitTime === 'number' && v.visitTime > 0)
    .sort((a, b) => b.visitTime - a.visitTime); // newest first
  if (valid.length === 0) return null;

  const reloadTimes = valid.filter(v => v.transition === 'reload').map(v => v.visitTime);

  const isPostReloadRedirect = (ts) =>
    reloadTimes.some(rt => ts >= rt && ts - rt <= 180_000);

  for (const v of valid) {
    if (v.transition === 'reload') continue;
    if (isInBurstWindows(v.visitTime, burstWindows)) continue;
    if (isPostReloadRedirect(v.visitTime)) continue;
    return v.visitTime;
  }

  // Every recorded visit in the 90-day DB was a reload or inside a restore burst:
  // use the earliest recorded visit (the tab has been sitting around at least since then).
  return valid[valid.length - 1].visitTime;
}

export function readUrlRecord(urlMap, url) {
  const raw = url ? urlMap?.[url] : null;
  if (!raw) return null;
  if (typeof raw === 'number' && raw > 0) {
    return { ts: raw, source: 'legacy' };
  }
  if (typeof raw === 'object' && typeof raw.ts === 'number' && raw.ts > 0) {
    return { ts: raw.ts, source: raw.source || 'legacy' };
  }
  return null;
}

/**
 * Resolve true last-active timestamp and provenance for a tab.
 * Priority:
 *   1. Currently active tab -> `now` ('active')
 *   2. Explicit user activation observed by this extension (`source === 'activated'`)
 *      -> max(recorded activation ts, filtered history ts)
 *   3. Edge History genuine non-restore visit (`historyMap[url]`)
 *      -> immune to Edge session-restore reloads AND post-reload redirects!
 *   4. Previously stored filtered history timestamp in urlMap
 *   5. Discarded http(s) tab with 0 visits in Edge's 90-day History DB -> >90d stale
 *   6. Fallback -> `tab.lastAccessed` or `now`
 */
export function resolveTabActivity(tab, tabMap, urlMap, historyMap, now) {
  if (tab.active) {
    return { lastActiveMs: now, source: 'active' };
  }

  const url = getTabUrl(tab);
  const tabRec = tabMap?.[String(tab.id)];
  const urlRec = url && !isInternalUrl(url) ? readUrlRecord(urlMap, url) : null;
  const hasHistoryKey = Boolean(url && historyMap && Object.prototype.hasOwnProperty.call(historyMap, url));
  const historyTs = hasHistoryKey && typeof historyMap[url] === 'number' && historyMap[url] > 0
    ? historyMap[url]
    : null;

  if (tabRec && tabRec.url === url && tabRec.source === 'activated' && typeof tabRec.lastActiveMs === 'number') {
    const ts = historyTs ? Math.max(tabRec.lastActiveMs, historyTs) : tabRec.lastActiveMs;
    return { lastActiveMs: ts, source: 'activated' };
  }
  if (urlRec && urlRec.source === 'activated') {
    const ts = historyTs ? Math.max(urlRec.ts, historyTs) : urlRec.ts;
    return { lastActiveMs: ts, source: 'activated' };
  }

  if (historyTs) {
    return { lastActiveMs: historyTs, source: 'history' };
  }

  if (urlRec && (urlRec.source === 'history-filtered' || urlRec.source === 'history-expired')) {
    return { lastActiveMs: urlRec.ts, source: urlRec.source };
  }

  if (hasHistoryKey && historyTs === null && tab.discarded && /^https?:/i.test(url)) {
    return { lastActiveMs: now - HISTORY_EXPIRED_DAYS * DAY_MS, source: 'history-expired' };
  }

  const validTabAccessed =
    typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0 && tab.lastAccessed <= now
      ? tab.lastAccessed
      : null;
  return { lastActiveMs: validTabAccessed ?? now, source: 'fallback' };
}

export function evaluateTabs(tabs, state, rawSettings, now = Date.now(), historyMap = {}) {
  const settings = mergeSettings(rawSettings);
  const ttlMs = settings.ttlDays * DAY_MS;
  const tabMap = state?.tabMap || {};
  const urlMap = state?.urlMap || {};

  const byWindow = new Map();
  for (const tab of tabs) {
    const wid = tab.windowId ?? 0;
    if (!byWindow.has(wid)) byWindow.set(wid, []);
    byWindow.get(wid).push(tab);
  }

  const toClose = [];
  const kept = [];

  for (const [, winTabs] of byWindow.entries()) {
    const candidates = [];

    for (const tab of winTabs) {
      const url = getTabUrl(tab);
      const { lastActiveMs, source } = resolveTabActivity(tab, tabMap, urlMap, historyMap, now);
      const idleMs = Math.max(0, now - lastActiveMs);
      const expired = idleMs >= ttlMs;

      let reason = null;
      if (tab.active) reason = 'active';
      else if (settings.protectPinned && tab.pinned) reason = 'pinned';
      else if (settings.protectAudible && tab.audible) reason = 'audible';
      else if (settings.protectGrouped && typeof tab.groupId === 'number' && tab.groupId >= 0) reason = 'grouped';
      else if (isInternalUrl(url)) reason = 'internal';
      else if (isWhitelistedUrl(url, settings.whitelistDomains)) reason = 'whitelisted';

      const entry = {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || url || '(无标题)',
        url,
        host: extractHostname(url),
        pinned: Boolean(tab.pinned),
        active: Boolean(tab.active),
        audible: Boolean(tab.audible),
        discarded: Boolean(tab.discarded),
        lastActiveMs,
        source,
        idleMs,
        idleDays: Number((idleMs / DAY_MS).toFixed(1)),
        expired,
        protectedReason: reason,
      };

      if (expired && !reason) {
        candidates.push(entry);
      } else {
        kept.push(entry);
      }
    }

    const remainingKeptInWin = winTabs.length - candidates.length;
    if (remainingKeptInWin === 0 && candidates.length > 0) {
      candidates.sort((a, b) => b.lastActiveMs - a.lastActiveMs);
      const spared = candidates.shift();
      spared.protectedReason = 'last-tab-in-window';
      kept.push(spared);
    }

    candidates.sort((a, b) => a.lastActiveMs - b.lastActiveMs);
    toClose.push(...candidates);
  }

  kept.sort((a, b) => a.lastActiveMs - b.lastActiveMs);

  return {
    toClose,
    kept,
    summary: {
      totalTabs: tabs.length,
      expiredCount: toClose.length,
      keptCount: kept.length,
      ttlDays: settings.ttlDays,
    },
  };
}

export function pruneUrlMap(urlMap, openUrlsSet, now = Date.now(), maxAgeDays = 120) {
  const cutoff = now - maxAgeDays * DAY_MS;
  const next = {};
  for (const [url] of Object.entries(urlMap || {})) {
    const rec = readUrlRecord(urlMap, url);
    if (!rec) continue;
    // Drop unverified legacy or unfiltered v1.1.0 history entries so v1.2.0 filtered lookup wins.
    if (rec.source === 'legacy' || rec.source === 'history') continue;
    if (openUrlsSet.has(url) || rec.ts >= cutoff) {
      next[url] = rec;
    }
  }
  return next;
}
