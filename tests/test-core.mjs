import assert from 'node:assert/strict';
import {
  DAY_MS,
  detectRestoreBursts,
  extractTrueHistoryVisitMs,
  evaluateTabs,
  resolveTabActivity,
  pruneUrlMap,
} from '../extension/core.js';

const NOW = Date.UTC(2026, 10, 22, 10, 0, 0);

// 1. Edge session-restore burst + post-reload redirect filtering:
//    Simulate Edge restarting 10 min ago (reloading 6 tabs in 2s) AND Bing firing a fake 'link'
//    redirect 65s later. True visit 5.7d ago MUST be recovered!
{
  const burstBase = NOW - 10 * 60_000;
  const reloadCluster = [0, 200, 400, 700, 1100, 1500].map(dt => burstBase + dt);
  const bursts = detectRestoreBursts(reloadCluster);
  assert.equal(bursts.length, 1, 'Should detect 1 restore burst window');

  const bingVisits = [
    { visitTime: burstBase + 65_000, transition: 'link' },   // fake post-reload JS redirect (+65s)
    { visitTime: burstBase + 400, transition: 'reload' },    // Edge session restore reload
    { visitTime: NOW - 1 * DAY_MS + 40_000, transition: 'link' },   // previous restore post-reload (+40s)
    { visitTime: NOW - 1 * DAY_MS, transition: 'reload' },          // previous restore reload
    { visitTime: NOW - 5.7 * DAY_MS, transition: 'link' },          // REAL user visit 5.7d ago!
  ];
  assert.equal(extractTrueHistoryVisitMs(bingVisits, bursts), NOW - 5.7 * DAY_MS);

  // If every single recorded visit was a reload (original >90d rolled off History), return earliest recorded visit
  const onlyReloads = [
    { visitTime: burstBase, transition: 'reload' },
    { visitTime: NOW - 20 * DAY_MS, transition: 'reload' },
  ];
  assert.equal(extractTrueHistoryVisitMs(onlyReloads, bursts), NOW - 20 * DAY_MS);
}

// 2. Fresh install / upgrade AFTER Edge restart: Edge reset tab.lastAccessed to NOW,
//    and v1.1.0 left unfiltered history entries. Filtered historyMap MUST catch old tabs!
{
  const tabs = [
    { id: 101, windowId: 1, active: true,  pinned: false, audible: false, discarded: false, url: 'https://example.com/active', lastAccessed: NOW },
    { id: 102, windowId: 1, active: false, pinned: false, audible: false, discarded: true,  url: 'https://example.com/old-12d', lastAccessed: NOW },
    { id: 103, windowId: 1, active: false, pinned: false, audible: false, discarded: true,  url: 'https://example.com/fresh-1d', lastAccessed: NOW },
    { id: 104, windowId: 1, active: false, pinned: true,  audible: false, discarded: true,  url: 'https://example.com/pinned-10d', lastAccessed: NOW },
    { id: 105, windowId: 1, active: false, pinned: false, audible: true,  discarded: false, url: 'https://example.com/music-10d', lastAccessed: NOW },
    { id: 106, windowId: 1, active: false, pinned: false, audible: false, discarded: true,  url: 'https://mail.google.com/mail/u/0/', lastAccessed: NOW },
    { id: 107, windowId: 1, active: false, pinned: false, audible: false, discarded: true,  url: 'https://ancient.example.com/over-90d', lastAccessed: NOW },
    { id: 108, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: 'edge://settings/system', lastAccessed: NOW - 10 * DAY_MS },
  ];
  const state = {
    tabMap: {},
    urlMap: {
      'https://example.com/old-12d': { ts: NOW, source: 'history' }, // stale v1.1.0 unfiltered
      'https://ancient.example.com/over-90d': NOW,                   // stale v1.0.0 legacy
    },
  };
  const historyMap = {
    'https://example.com/old-12d': NOW - 12 * DAY_MS,
    'https://example.com/fresh-1d': NOW - 1 * DAY_MS,
    'https://example.com/pinned-10d': NOW - 10 * DAY_MS,
    'https://example.com/music-10d': NOW - 10 * DAY_MS,
    'https://mail.google.com/mail/u/0/': NOW - 8 * DAY_MS,
    'https://ancient.example.com/over-90d': null,
  };
  const res = evaluateTabs(tabs, state, { ttlDays: 3, whitelistDomains: ['google.com'] }, NOW, historyMap);
  assert.deepEqual(res.toClose.map(t => t.id), [107, 102]);
  assert.equal(res.toClose.find(t => t.id === 102).source, 'history');
  assert.equal(res.toClose.find(t => t.id === 107).source, 'history-expired');
  assert.equal(res.kept.find(t => t.id === 104).protectedReason, 'pinned');
  assert.equal(res.kept.find(t => t.id === 105).protectedReason, 'audible');
  assert.equal(res.kept.find(t => t.id === 106).protectedReason, 'whitelisted');
  assert.equal(res.kept.find(t => t.id === 108).protectedReason, 'internal');
}

// 3. Explicit user activation protects tab even if URL hasn't navigated in 10 days.
{
  const tab = { id: 201, windowId: 1, active: false, discarded: false, url: 'https://dash.example.com/', lastAccessed: NOW };
  const state = {
    tabMap: {},
    urlMap: { 'https://dash.example.com/': { ts: NOW - 1 * DAY_MS, source: 'activated' } },
  };
  const historyMap = { 'https://dash.example.com/': NOW - 10 * DAY_MS };
  const resolved = resolveTabActivity(tab, state.tabMap, state.urlMap, historyMap, NOW);
  assert.equal(resolved.source, 'activated');
  assert.equal(resolved.lastActiveMs, NOW - 1 * DAY_MS);
}

// 4. Prune drops legacy v1.0.0 and unfiltered v1.1.0 entries, keeps activated & history-filtered.
{
  const pruned = pruneUrlMap(
    {
      'https://legacy': NOW,
      'https://v11-unfiltered': { ts: NOW, source: 'history' },
      'https://keep.open': { ts: NOW - 150 * DAY_MS, source: 'activated' },
      'https://keep.recent': { ts: NOW - 10 * DAY_MS, source: 'history-filtered' },
      'https://drop.ancient': { ts: NOW - 150 * DAY_MS, source: 'history-filtered' },
    },
    new Set(['https://keep.open']),
    NOW,
    120
  );
  assert.deepEqual(Object.keys(pruned).sort(), ['https://keep.open', 'https://keep.recent']);
}

console.log('ALL edge-tab-reaper v1.2.0 core tests PASSED');

