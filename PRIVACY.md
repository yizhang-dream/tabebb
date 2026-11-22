# TabEbb Privacy Policy / 隐私政策

**Effective Date / 生效日期**: 2026-11-22

## Summary / 核心声明

**TabEbb runs 100% locally in your browser. It does NOT collect, transmit, sell, or share any user data, browsing history, tab URLs, or analytics to any remote server.**

**TabEbb 完全在你的浏览器本地运行，不向任何远程服务器收集、上传、出售或共享任何用户数据、浏览历史、标签网址或统计信息。**

## Data Accessed Locally / 本地访问的数据与用途

TabEbb requests only the minimum browser permissions required for its single purpose (auto-closing and bookmark-archiving tabs inactive for a user-configured number of days):

1. **`tabs`**: Reads open tab URLs, titles, pinned/audible/active status, and closes tabs that exceed the user-configured inactivity threshold (default: 3 days).
2. **`history`**: Reads local visit timestamps and navigation transition types (`reload` vs. human visits) to distinguish genuine last-visited times from bulk session-restore reloads after browser restarts. Never modifies or deletes browser history.
3. **`bookmarks`**: Optionally saves the URL and title of each automatically closed tab into a local bookmark folder (`自动清理归档 (3天未访问)`) before closing it, so no page is ever lost.
4. **`storage`**: Stores user preferences (inactivity threshold, whitelist domains, protection toggles), per-URL last-active timestamps, and a local list of recently archived tabs in `chrome.storage.local` only (never synced to external servers).
5. **`alarms`**: Schedules periodic local background checks (default: every 30 minutes) and post-startup scans.

## Network & Third Parties / 网络请求与第三方

- TabEbb makes **zero** network requests.
- TabEbb uses **zero** remote scripts, CDNs, ads, trackers, or third-party SDKs.
- All stored data is deleted automatically when you uninstall the extension.

## Contact / 联系方式

For privacy questions or issues, please open an issue at:
https://github.com/yizhang-dream/tabebb/issues
