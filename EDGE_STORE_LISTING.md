# TabEbb · Microsoft Edge Add-ons 上架填表指南

> 对应发布包：`dist/tabebb-v1.2.0.zip`（已剔除测试、文档与视频工程文件）
> 商店后台入口：https://partner.microsoft.com/dashboard/microsoftedge/overview （开发者账号注册免费 $0）

---

## 1. 基础信息（Store Listing）

- **扩展名称（与 `_locales` 一致，不含第三方商标）**
  - 中文（zh-CN）：`TabEbb · 潮退标签`
  - 英文（en-US）：`TabEbb — Auto-Archive Stale Tabs`
- **简短说明（≤132 字符）**
  - 中文：`保留近期页面自动恢复，自动识别并过滤浏览器重启假刷新，关闭超 3 天未访问的老标签并归档到书签，释放内存不丢页。`
  - 英文：`Keep recent session tabs on restart; auto-close and bookmark-archive 3+ day stale tabs by filtering fake restore reloads.`
- **分类（Category）**：`Productivity`（效率工具）
- **开源仓库 / 支持页 URL**：`https://github.com/yizhang-dream/tabebb`
- **隐私政策 URL（Privacy policy URL）**：`https://github.com/yizhang-dream/tabebb/blob/main/PRIVACY.md`

---

## 2. 详细说明（Detailed Description）

### 中文版
习惯开启「启动时打开上次浏览的页面」，却经常不知不觉攒出七八十个旧标签、吃掉十几 GB 内存？

**TabEbb（潮退标签）** 让浏览器只保留你最近真正在看的页面，超过设定天数（默认 3 天）未再访问的老标签自动关闭并归档，既释放后台渲染进程内存，又绝不丢页。

**核心特性：**
- **识破重启“假刷新”**：浏览器重启恢复历史会话时，会把所有陈年标签的时间戳重置并写入批量 `reload` 历史记录。TabEbb 自动识别会话恢复风暴并过滤假刷新与重定向链，精准还原每个标签上次真正被人工打开的时间。
- **零丢失书签归档**：关闭前自动将标题与链接写入本地书签夹（自动去重），扩展弹窗内同步保留最近 300 条清理记录，支持一键恢复。
- **多重安全保护**：永不关闭当前活跃页、固定标签（Pinned）、正在播放声音的标签、窗口内最后一个标签、内置页面以及自定义域名白名单。
- **全本地零上传**：无任何网络请求、无追踪、无广告、MIT 开源。

### English Version
Love using "Continue where you left off", but end up with 70+ forgotten tabs eating gigabytes of RAM?

**TabEbb** keeps your recent session tabs intact while automatically closing and bookmark-archiving tabs you haven't actually visited in 3+ days (customizable).

**Key Features:**
- **Defeats Fake Session-Restore Timestamps**: When browsers restart and restore a session, they reset tab access times and write bulk `reload` visits to history. TabEbb detects restore bursts and post-reload redirects to recover the true last human visit time of every tab.
- **Zero-Loss Bookmark Archive**: Automatically archives closed tabs (deduplicated) into a local bookmark folder before closing, plus keeps a one-click restore list of the last 300 closed tabs in the popup.
- **Smart Safety Guards**: Never closes the active tab, pinned tabs, audible tabs, internal browser pages, the last tab in a window, or domains on your custom whitelist.
- **100% Local & Open Source**: Zero network requests, zero telemetry, zero ads. MIT licensed.

---

## 3. 单一用途与权限逐条声明（Certification Notes / Permissions Justification）

**Single Purpose（单一用途）**：
> Automatically close browser tabs that have not been visited for a user-configured number of days (default 3 days) and archive them to a local bookmark folder to reclaim memory while keeping recent session tabs intact.

**Permissions Justification（权限说明）**：
- **`tabs`**：Inspect open tab URLs, titles, active/pinned/audible states, listen for tab activation to record genuine user visits, and remove tabs that exceed the user's inactivity threshold.
- **`history`**：Read local visit timestamps and transition types (`reload` vs. human navigation) via `chrome.history.getVisits` so tabs restored on browser startup are not misclassified as freshly visited. No history entries are ever modified or transmitted.
- **`bookmarks`**：Create a dedicated local archive folder and save each auto-closed tab's title and URL (deduplicated) before closing so users never lose pages.
- **`storage`**：Persist user settings (inactivity threshold, whitelist domains, protection switches), per-URL last-active timestamps, and recent archive history locally via `chrome.storage.local`.
- **`alarms`**：Schedule periodic local background scans (default every 30 minutes) and post-startup scans in the Manifest V3 service worker.

**Data Disclosure（隐私数据披露勾选）**：
- Does this extension collect or transmit user data off-device? **No（全不勾选）**。

---

## 4. 已备好的商店素材清单（`store-assets/`）

- 商店图标：`extension/icons/icon-128.png`（128×128 PNG）
- 商店截图 1：`store-assets/screenshot-1-popup.png`（1280×800 PNG）
- 商店截图 2：`store-assets/screenshot-2-xray.png`（1280×800 PNG）
- 小宣传磁贴：`store-assets/promo-tile-440x280.png`（440×280 PNG）
- 提交安装包：`dist/tabebb-v1.2.0.zip`
