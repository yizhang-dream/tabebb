#!/usr/bin/env python3
"""Render crisp Microsoft Edge Add-ons Store visual assets for TabEbb.

Outputs (all exact required dimensions, trademark-safe):
  store-assets/screenshot-1-popup.png   (1280x800)
  store-assets/screenshot-2-xray.png    (1280x800)
  store-assets/promo-tile-440x280.png   (440x280)
"""
import asyncio
import os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "store-assets")
os.makedirs(OUT_DIR, exist_ok=True)

COMMON_CSS = """
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --font-sans: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
    --font-mono: "Cascadia Code", "Consolas", ui-monospace, monospace;
  }
  body {
    overflow: hidden;
    font-family: var(--font-sans);
    color: #f3f1ec;
    -webkit-font-smoothing: antialiased;
    background: radial-gradient(circle at 75% 32%, rgba(20, 184, 166, 0.22), transparent 52%),
                radial-gradient(circle at 20% 78%, rgba(15, 118, 110, 0.16), transparent 48%),
                linear-gradient(145deg, #161421 0%, #0b0a11 100%);
  }
  .dots-grid {
    position: fixed; inset: 0;
    background-image: radial-gradient(rgba(180, 190, 220, 0.14) 1.2px, transparent 1.2px);
    background-size: 32px 32px;
    pointer-events: none;
  }
"""

HTML_SHOT_1 = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
{COMMON_CSS}
body {{ width: 1280px; height: 800px; display: flex; align-items: center; justify-content: space-between; padding: 54px 66px; gap: 46px; position: relative; }}
.left {{ flex: 1; display: flex; flex-direction: column; gap: 22px; z-index: 2; }}
.kicker {{ display: inline-flex; align-items: center; gap: 10px; align-self: flex-start; padding: 7px 15px; border-radius: 999px; background: rgba(20,184,166,0.16); border: 1px solid rgba(45,212,191,0.42); color: #5eead4; font-size: 15px; font-weight: 700; letter-spacing: 0.04em; }}
h1 {{ font-size: 52px; font-weight: 800; line-height: 1.14; letter-spacing: -0.03em; color: #f8fafc; }}
h1 span {{ color: #2dd4bf; }}
.lead {{ font-size: 20px; line-height: 1.6; color: #cbd5e1; max-width: 560px; }}
.bullets {{ display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }}
.b-item {{ display: flex; align-items: flex-start; gap: 13px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 14px 18px; }}
.b-ico {{ width: 28px; height: 28px; border-radius: 8px; background: rgba(20,184,166,0.2); color: #2dd4bf; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; margin-top: 1px; }}
.b-title {{ font-size: 17px; font-weight: 700; color: #f8fafc; }}
.b-sub {{ font-size: 14px; color: #94a3b8; margin-top: 3px; }}
.foot-chips {{ display: flex; gap: 10px; margin-top: 4px; }}
.chip {{ font-family: var(--font-mono); font-size: 13px; padding: 6px 13px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; }}

.popup-wrap {{ position: relative; z-index: 2; flex-shrink: 0; }}
.popup-glow {{ position: absolute; inset: -24px; background: radial-gradient(circle, rgba(20,184,166,0.28), transparent 68%); filter: blur(18px); z-index: -1; }}
.popup {{ width: 440px; background: #0f172a; border: 1.5px solid rgba(45,212,191,0.45); border-radius: 22px; padding: 22px; box-shadow: 0 28px 65px rgba(0,0,0,0.55); display: flex; flex-direction: column; gap: 14px; }}
.p-head {{ display: flex; justify-content: space-between; align-items: center; }}
.p-brand {{ display: flex; align-items: center; gap: 12px; }}
.p-logo {{ width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #0f766e, #2dd4bf); display: flex; align-items: center; justify-content: center; }}
.p-h1 {{ font-size: 19px; font-weight: 700; color: #f8fafc; }}
.p-sub {{ font-size: 12.5px; color: #94a3b8; margin-top: 2px; }}
.p-toggle {{ width: 44px; height: 24px; border-radius: 999px; background: #14b8a6; position: relative; }}
.p-toggle::after {{ content: ""; position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #fff; top: 3px; right: 3px; }}
.p-stats {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }}
.p-stat {{ background: #1e293b; border: 1px solid #334155; border-radius: 11px; padding: 11px 8px; text-align: center; }}
.p-stat .v {{ font-family: var(--font-mono); font-size: 26px; font-weight: 800; color: #f8fafc; }}
.p-stat.acc .v {{ color: #2dd4bf; }}
.p-stat .l {{ font-size: 12px; color: #94a3b8; margin-top: 3px; }}
.p-toast {{ padding: 9px 13px; border-radius: 9px; background: rgba(20,184,166,0.16); border: 1px solid rgba(20,184,166,0.42); color: #5eead4; font-size: 13px; font-weight: 600; }}
.p-panel {{ background: #1e293b; border: 1px solid #334155; border-radius: 13px; padding: 14px 15px; display: flex; flex-direction: column; gap: 10px; }}
.p-ptitle {{ display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #e2e8f0; }}
.p-ptitle span:last-child {{ color: #5eead4; font-weight: 600; }}
.p-item {{ display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 9px; border-top: 1px solid #334155; }}
.p-item:first-of-type {{ border-top: none; padding-top: 2px; }}
.p-ititle {{ font-size: 13.5px; font-weight: 600; color: #f1f5f9; }}
.p-isub {{ font-size: 11.5px; color: #94a3b8; margin-top: 2px; }}
.p-rbtn {{ padding: 5px 12px; border-radius: 7px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 12px; font-weight: 600; }}
.p-rbtn.hi {{ background: #14b8a6; border-color: #2dd4bf; color: #05221e; }}
.p-actions {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
.p-btn {{ padding: 10px 12px; border-radius: 10px; text-align: center; font-size: 13px; font-weight: 700; }}
.p-btn.primary {{ background: linear-gradient(135deg, #0d9488, #14b8a6); color: #04211e; }}
.p-btn.ghost {{ background: #1e293b; border: 1px solid #334155; color: #e2e8f0; }}
</style></head><body>
<div class="dots-grid"></div>
<div class="left">
  <div class="kicker">TabEbb · 潮退标签 v1.2</div>
  <h1>只留近 <span>3 天</span>在看的页<br>陈年旧页自动归档</h1>
  <div class="lead">保留「打开时恢复上次页面」的顺手体验，自动清理超期未访标签并归档到书签，释放后台内存、绝不丢页。</div>
  <div class="bullets">
    <div class="b-item"><div class="b-ico">✓</div><div><div class="b-title">识破浏览器重启「假刷新」</div><div class="b-sub">自动过滤会话恢复风暴（reload 与重定向链），还原页面上次真正被人工打开的日期</div></div></div>
    <div class="b-item"><div class="b-ico">★</div><div><div class="b-title">零丢失书签归档 + 一键恢复</div><div class="b-sub">关闭前自动去重写入本地书签夹，弹窗同步保留最近 300 条记录随时找回</div></div></div>
    <div class="b-item"><div class="b-ico">⚡</div><div><div class="b-title">智能保护 + 100% 本地运行</div><div class="b-sub">永不误关当前页、固定页、播放声音页与白名单域名，零联网、零追踪、MIT 开源</div></div></div>
  </div>
  <div class="foot-chips">
    <span class="chip">100% Local · No Telemetry</span>
    <span class="chip">Manifest V3</span>
    <span class="chip">MIT Open Source</span>
  </div>
</div>
<div class="popup-wrap">
  <div class="popup-glow"></div>
  <div class="popup">
    <div class="p-head">
      <div class="p-brand">
        <div class="p-logo">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="10" width="22" height="6" rx="3" fill="#ccfbf1"/>
            <circle cx="32" cy="35" r="17" stroke="#ffffff" stroke-width="5.5"/>
            <path d="M32 24V35L41 35" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div><div class="p-h1">TabEbb · 潮退标签</div><div class="p-sub">仅留 3 天内真看过的页面</div></div>
      </div>
      <div class="p-toggle"></div>
    </div>
    <div class="p-stats">
      <div class="p-stat"><div class="v">8</div><div class="l">当前打开</div></div>
      <div class="p-stat acc"><div class="v">0</div><div class="l">待清理</div></div>
      <div class="p-stat"><div class="v">15</div><div class="l">已归档清理</div></div>
    </div>
    <div class="p-toast">✓ 已自动写入书签夹「自动清理归档 (3天未访问)」</div>
    <div class="p-panel">
      <div class="p-ptitle"><span>最近已自动归档 · 一键恢复</span><span>0 丢页</span></div>
      <div class="p-item"><div><div class="p-ititle">Memory Tuning Guide · docs.example.org</div><div class="p-isub">真实历史 · 曾闲置 5.7 天</div></div><div class="p-rbtn">恢复</div></div>
      <div class="p-item"><div><div class="p-ititle">4K 显示器参数对比 · demo-store.example</div><div class="p-isub">真实历史 · 曾闲置 4.5 天</div></div><div class="p-rbtn hi">已恢复</div></div>
      <div class="p-item"><div><div class="p-ititle">DevNotes 社区 · 标签页内存优化讨论</div><div class="p-isub">真实历史 · 曾闲置 5.0 天</div></div><div class="p-rbtn">恢复</div></div>
      <div class="p-item"><div><div class="p-ititle">StudyHub · 第 4 章算法笔记汇总</div><div class="p-isub">真实历史 · 曾闲置 3.8 天</div></div><div class="p-rbtn">恢复</div></div>
    </div>
    <div class="p-actions">
      <div class="p-btn primary">立即清理过期标签</div>
      <div class="p-btn ghost">查看休眠诊断明细</div>
    </div>
  </div>
</div>
</body></html>"""

HTML_SHOT_2 = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
{COMMON_CSS}
body {{ width: 1280px; height: 800px; display: flex; flex-direction: column; justify-content: center; padding: 52px 64px; gap: 30px; position: relative; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-end; z-index: 2; }}
.kicker {{ font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: #2dd4bf; letter-spacing: 0.1em; text-transform: uppercase; }}
h1 {{ font-size: 44px; font-weight: 800; letter-spacing: -0.03em; margin-top: 8px; color: #f8fafc; }}
h1 span {{ color: #2dd4bf; }}
.top-note {{ font-size: 17px; color: #94a3b8; max-width: 420px; text-align: right; line-height: 1.5; }}

.grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 28px; z-index: 2; }}
.card {{ border-radius: 22px; padding: 26px 28px; display: flex; flex-direction: column; gap: 18px; }}
.card.bad {{ background: linear-gradient(180deg, rgba(48,24,36,0.92) 0%, rgba(25,17,26,0.96) 100%); border: 1.5px solid rgba(244,63,94,0.48); box-shadow: 0 22px 54px rgba(0,0,0,0.45); }}
.card.good {{ background: linear-gradient(180deg, rgba(20,42,46,0.92) 0%, rgba(16,23,33,0.96) 100%); border: 1.5px solid rgba(45,212,191,0.52); box-shadow: 0 22px 54px rgba(0,0,0,0.45), 0 0 42px rgba(20,184,166,0.14); }}
.c-head {{ display: flex; justify-content: space-between; align-items: center; }}
.c-title {{ font-size: 22px; font-weight: 800; }}
.pill {{ font-family: var(--font-mono); font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 999px; }}
.pill.red {{ background: rgba(244,63,94,0.2); color: #fda4af; border: 1px solid rgba(244,63,94,0.45); }}
.pill.teal {{ background: rgba(20,184,166,0.2); color: #5eead4; border: 1px solid rgba(45,212,191,0.5); }}
.ram-box {{ display: flex; justify-content: space-between; align-items: baseline; }}
.ram {{ font-family: var(--font-mono); font-size: 56px; font-weight: 800; letter-spacing: -0.04em; }}
.ram.red {{ color: #fb7185; }}
.ram.teal {{ color: #2dd4bf; }}
.ram-sub {{ font-size: 15px; color: #94a3b8; text-align: right; line-height: 1.5; }}
.bar {{ height: 12px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }}
.bar > div {{ height: 100%; border-radius: 999px; }}
.bar.red > div {{ width: 94%; background: linear-gradient(90deg, #f59e0b, #f43f5e); }}
.bar.teal > div {{ width: 14%; background: linear-gradient(90deg, #0d9488, #2dd4bf); }}
.rows {{ display: flex; flex-direction: column; gap: 10px; }}
.row {{ display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-radius: 11px; background: rgba(0,0,0,0.26); border: 1px solid rgba(255,255,255,0.07); }}
.url {{ font-family: var(--font-mono); font-size: 14px; color: #e2e8f0; }}
.tag {{ font-family: var(--font-mono); font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 7px; white-space: nowrap; }}
.tag.fake {{ background: rgba(244,63,94,0.22); color: #fda4af; }}
.tag.real {{ background: rgba(20,184,166,0.22); color: #5eead4; }}
.tag.keep {{ background: rgba(255,255,255,0.1); color: #cbd5e1; }}

.footer-strip {{ display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); z-index: 2; font-size: 15px; color: #cbd5e1; }}
.footer-strip strong {{ color: #5eead4; }}
</style></head><body>
<div class="dots-grid"></div>
<div class="top">
  <div>
    <div class="kicker">Restore Burst Filter · 会话恢复风暴穿透</div>
    <h1>重启对决：<span>假刷新</span> vs <span>真时间</span></h1>
  </div>
  <div class="top-note">普通插件在浏览器重启后全部失效；TabEbb 穿透批量 reload 记录，只清理真正闲置超 3 天的页面。</div>
</div>
<div class="grid">
  <div class="card bad">
    <div class="c-head"><div class="c-title">普通重启恢复</div><span class="pill red">transition: reload 误导</span></div>
    <div class="ram-box"><div class="ram red">15.6 GB</div><div class="ram-sub">72 个标签全部复活<br>95 个渲染进程狂吃内存</div></div>
    <div class="bar red"><div></div></div>
    <div class="rows">
      <div class="row"><span class="url">docs.example.org/guides/memory-tuning</span><span class="tag fake">误判 0.0d</span></div>
      <div class="row"><span class="url">shop.demo-store.example/compare/4k</span><span class="tag fake">误判 0.0d</span></div>
      <div class="row"><span class="url">search.example.com/q?k=显示器对比</span><span class="tag fake">误判 0.0d</span></div>
      <div class="row"><span class="url">github.com/yizhang-dream/tabebb</span><span class="tag keep">0.2d · 活跃</span></div>
    </div>
  </div>
  <div class="card good">
    <div class="c-head"><div class="c-title">TabEbb 潮退守护</div><span class="pill teal">真实历史 · 精准剥离</span></div>
    <div class="ram-box"><div class="ram teal">1.4 GB</div><div class="ram-sub">仅保留 8 个近期页面<br>超期页已安全归档至书签</div></div>
    <div class="bar teal"><div></div></div>
    <div class="rows">
      <div class="row"><span class="url">docs.example.org/guides/memory-tuning</span><span class="tag real">真实 5.7d → 归档</span></div>
      <div class="row"><span class="url">shop.demo-store.example/compare/4k</span><span class="tag real">真实 4.5d → 归档</span></div>
      <div class="row"><span class="url">search.example.com/q?k=显示器对比</span><span class="tag real">真实 5.7d → 归档</span></div>
      <div class="row"><span class="url">github.com/yizhang-dream/tabebb</span><span class="tag keep">0.2d · 保留</span></div>
    </div>
  </div>
</div>
<div class="footer-strip">
  <span><strong>原理：</strong>检测重启后 10 分钟内的批量 <code>reload</code> 聚类 + 180 秒重定向链，跳过假访问，追溯页面上次真正被人工打开的时间。</span>
  <span style="font-family:var(--font-mono);color:#5eead4;">github.com/yizhang-dream/tabebb</span>
</div>
</body></html>"""

HTML_PROMO = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
{COMMON_CSS}
body {{ width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; gap: 14px; position: relative; }}
.row {{ display: flex; align-items: center; gap: 16px; z-index: 2; }}
.ico {{ width: 64px; height: 64px; border-radius: 17px; background: linear-gradient(135deg, #0f766e, #2dd4bf); box-shadow: 0 12px 28px rgba(20,184,166,0.42); display: flex; align-items: center; justify-content: center; }}
.title {{ font-size: 46px; font-weight: 800; letter-spacing: -0.04em; color: #f8fafc; }}
.sub {{ font-size: 18px; font-weight: 700; color: #5eead4; z-index: 2; }}
.desc {{ font-size: 13px; color: #cbd5e1; z-index: 2; line-height: 1.45; max-width: 396px; white-space: nowrap; }}
.pills {{ display: flex; gap: 8px; z-index: 2; margin-top: 2px; }}
.pill {{ font-family: var(--font-mono); font-size: 11px; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); color: #cbd5e1; }}
</style></head><body>
<div class="dots-grid"></div>
<div class="row">
  <div class="ico">
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="10" width="22" height="6" rx="3" fill="#ccfbf1"/>
      <circle cx="32" cy="35" r="17" stroke="#ffffff" stroke-width="5.5"/>
      <path d="M32 24V35L41 35" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <div class="title">TabEbb</div>
</div>
<div class="sub">潮退标签 · 只留近 3 天，老页归书签</div>
<div class="desc">过滤重启假刷新，超期页自动归档，释放内存不丢页</div>
<div class="pills">
  <span class="pill">3+ Days Auto-Archive</span>
  <span class="pill">100% Local · MIT</span>
</div>
</body></html>"""


async def main():
    jobs = [
        ("screenshot-1-popup.png", 1280, 800, HTML_SHOT_1),
        ("screenshot-2-xray.png", 1280, 800, HTML_SHOT_2),
        ("promo-tile-440x280.png", 440, 280, HTML_PROMO),
    ]
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for fname, w, h, html in jobs:
            pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            await pg.set_content(html, wait_until="load")
            await pg.evaluate("document.fonts.ready")
            out = os.path.join(OUT_DIR, fname)
            await pg.screenshot(path=out)
            await pg.close()
            print(f"wrote {out} ({w}x{h})")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
