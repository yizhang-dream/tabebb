const els = {
  enabledToggle: document.getElementById('enabledToggle'),
  totalTabs: document.getElementById('totalTabs'),
  expiredCount: document.getElementById('expiredCount'),
  totalClosed: document.getElementById('totalClosed'),
  reapNowBtn: document.getElementById('reapNowBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  statusMsg: document.getElementById('statusMsg'),
  ttlDaysInput: document.getElementById('ttlDaysInput'),
  protectPinned: document.getElementById('protectPinned'),
  protectAudible: document.getElementById('protectAudible'),
  archiveBookmarks: document.getElementById('archiveBookmarks'),
  whitelistInput: document.getElementById('whitelistInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  lastRunHint: document.getElementById('lastRunHint'),
  expiredList: document.getElementById('expiredList'),
  keptList: document.getElementById('keptList'),
  historyList: document.getElementById('historyList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

let currentSettings = null;

function setStatus(text) {
  els.statusMsg.textContent = text;
}

function fmtTime(ms) {
  if (!ms) return '尚未运行';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function sendMsg(payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chrome.runtime.sendMessage(payload);
      if (!res?.ok) throw new Error(res?.error || '操作失败');
      return res;
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (attempt === 0 && /\bNo SW\b|Receiving end does not exist|Service worker/i.test(msg)) {
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
      throw err;
    }
  }
}

function renderList(container, items, emptyText, renderAction) {
  container.textContent = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'tab-item';

    const meta = document.createElement('div');
    meta.className = 'tab-meta';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = item.title || item.url;
    title.title = item.url || '';

    const sub = document.createElement('div');
    sub.className = 'tab-sub';
    sub.textContent = item.subText;

    meta.appendChild(title);
    meta.appendChild(sub);
    li.appendChild(meta);

    if (renderAction) {
      const btn = renderAction(item);
      if (btn) li.appendChild(btn);
    }

    container.appendChild(li);
  }
}

const SOURCE_LABEL = {
  history: '真实历史',
  'history-filtered': '真实历史',
  'history-expired': '超90天无历史',
  activated: '点击记录',
  active: '当前页',
  fallback: '标签时间',
};

const PROTECT_LABEL = {
  active: '保护:当前',
  pinned: '保护:固定',
  audible: '保护:发声',
  grouped: '保护:分组',
  whitelisted: '保护:白名单',
  internal: '保护:内置页',
  'last-tab-in-window': '保护:末页',
};

function render(data) {
  currentSettings = data.settings;
  els.enabledToggle.checked = Boolean(data.settings.enabled);
  els.ttlDaysInput.value = String(data.settings.ttlDays);
  els.protectPinned.checked = Boolean(data.settings.protectPinned);
  els.protectAudible.checked = Boolean(data.settings.protectAudible);
  els.archiveBookmarks.checked = Boolean(data.settings.archiveToBookmarks);
  els.whitelistInput.value = (data.settings.whitelistDomains || []).join('\n');

  els.totalTabs.textContent = String(data.evaluation.summary.totalTabs);
  els.expiredCount.textContent = String(data.evaluation.summary.expiredCount);
  els.totalClosed.textContent = String(data.stats?.totalClosed || 0);
  els.lastRunHint.textContent = data.stats?.lastRunAt ? `上次巡检 ${fmtTime(data.stats.lastRunAt)}` : '待巡检';

  const expiredItems = (data.evaluation.toClose || []).map(item => {
    const src = SOURCE_LABEL[item.source] || '已闲置';
    const ageText = item.source === 'history-expired' ? '>90 天' : `${item.idleDays} 天`;
    return {
      ...item,
      subText: `${item.host || '页面'} · ${src} · ${ageText}`,
    };
  });

  renderList(
    els.expiredList,
    expiredItems,
    `暂无超过 ${data.settings.ttlDays} 天未访问的标签`,
    (item) => {
      if (!item.host) return null;
      const btn = document.createElement('button');
      btn.className = 'mini-btn';
      btn.textContent = '豁免';
      btn.title = `将 ${item.host} 加入白名单`;
      btn.addEventListener('click', async () => {
        const list = Array.from(new Set([...(currentSettings.whitelistDomains || []), item.host]));
        await saveSettings({ ...currentSettings, whitelistDomains: list }, `已豁免域名 ${item.host}`);
      });
      return btn;
    }
  );

  const keptItems = (data.evaluation.kept || []).slice(0, 25).map(item => {
    const src = SOURCE_LABEL[item.source] || '已闲置';
    const ageText = item.source === 'history-expired' ? '>90 天' : `${item.idleDays} 天`;
    const prot = item.protectedReason ? ` · ${PROTECT_LABEL[item.protectedReason] || item.protectedReason}` : '';
    return {
      ...item,
      subText: `${item.host || '页面'} · ${src} ${ageText}${prot}`,
    };
  });

  renderList(els.keptList, keptItems, '暂无保留标签');

  const historyItems = (data.closedHistory || []).map(item => ({
    ...item,
    subText: `${fmtTime(item.closedAt)} 关闭 · 曾闲置 ${item.idleDays} 天`,
  }));

  renderList(
    els.historyList,
    historyItems,
    '暂无已自动关闭记录',
    (item) => {
      const btn = document.createElement('button');
      btn.className = 'mini-btn';
      btn.textContent = '恢复';
      btn.addEventListener('click', async () => {
        try {
          await sendMsg({ type: 'RESTORE_TAB', url: item.url });
          setStatus('已重新打开标签页');
        } catch (err) {
          setStatus(`恢复失败：${err.message}`);
        }
      });
      return btn;
    }
  );
}

async function refresh() {
  try {
    const data = await sendMsg({ type: 'GET_STATUS' });
    render(data);
  } catch (err) {
    setStatus(`读取状态失败：${err.message}`);
  }
}

async function saveSettings(overrideSettings = null, okText = '设置已保存') {
  try {
    const domains = els.whitelistInput.value
      .split(/[\r\n,]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const payload = overrideSettings || {
      ...(currentSettings || {}),
      enabled: els.enabledToggle.checked,
      ttlDays: Number(els.ttlDaysInput.value) || 3,
      protectPinned: els.protectPinned.checked,
      protectAudible: els.protectAudible.checked,
      archiveToBookmarks: els.archiveBookmarks.checked,
      whitelistDomains: domains,
    };
    await sendMsg({ type: 'UPDATE_SETTINGS', settings: payload });
    await refresh();
    setStatus(okText);
  } catch (err) {
    setStatus(`保存失败：${err.message}`);
  }
}

els.enabledToggle.addEventListener('change', () => saveSettings(null, els.enabledToggle.checked ? '已启用自动清理' : '已暂停自动清理'));
els.saveSettingsBtn.addEventListener('click', () => saveSettings());
els.refreshBtn.addEventListener('click', async () => {
  await refresh();
  setStatus('已刷新');
});
els.reapNowBtn.addEventListener('click', async () => {
  try {
    const res = await sendMsg({ type: 'RUN_REAP_NOW' });
    render({
      settings: currentSettings,
      stats: res.stats,
      evaluation: res.evaluation,
      closedHistory: res.closedHistory,
    });
    setStatus(res.closedCount > 0 ? `已关闭并归档 ${res.closedCount} 个老标签` : '当前没有超期老标签');
  } catch (err) {
    setStatus(`清理失败：${err.message}`);
  }
});
els.clearHistoryBtn.addEventListener('click', async () => {
  try {
    await sendMsg({ type: 'CLEAR_HISTORY' });
    await refresh();
    setStatus('已清空本地记录（书签夹内容保留）');
  } catch (err) {
    setStatus(`清空失败：${err.message}`);
  }
});

refresh();
