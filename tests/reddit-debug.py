"""Load extension on Reddit and dump OmniDownload scan state + DOM hints."""
import json
import os
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URLS = sys.argv[1:] or [
    "https://old.reddit.com/r/pics/comments/1g8wx0l/oc/",
    "https://www.reddit.com/r/pics/comments/1g8wx0l/oc/",
]

PANEL = """() => {
  const r = document.getElementById('omnidownload-root');
  if (!r) return { error: 'no omnidownload-root' };
  return {
    version: r.querySelector('.omni-version')?.textContent,
    status: r.querySelector('.omni-status')?.textContent,
    items: [...r.querySelectorAll('.omni-item')].map(li => li.textContent?.slice(0, 120)),
  };
}"""

DOM = """() => {
  const posts = [...document.querySelectorAll('shreddit-post')].slice(0, 3).map(p => ({
    id: p.id,
    postId: p.getAttribute('post-id'),
    type: p.getAttribute('post-type'),
    contentHref: p.getAttribute('content-href'),
    permalink: p.getAttribute('permalink'),
  }));
  return {
    title: document.title,
    h1: document.querySelector('h1')?.textContent,
    posts,
    postCount: document.querySelectorAll('shreddit-post').length,
  };
}"""


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            tempfile.mkdtemp(),
            headless=False,
            args=[
                f"--disable-extensions-except={ROOT}",
                f"--load-extension={ROOT}",
                "--headless=new",
            ],
            viewport={"width": 1280, "height": 900},
        )
        logs = []
        for url in URLS:
            page = ctx.new_page()
            page.on("console", lambda m: logs.append(m.text) if "OmniDownload" in m.text else None)
            print("\n===", url, "===")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                print("goto error:", e)
                page.close()
                continue
            for wait in (0, 2, 5, 10):
                if wait:
                    time.sleep(wait)
                dom = page.evaluate(DOM)
                panel = page.evaluate(PANEL)
                print(f"  t+{wait}s dom:", json.dumps(dom, indent=2)[:1200])
                print(f"  t+{wait}s panel:", panel)
                if panel.get("items"):
                    break
            if logs:
                print("  logs:", logs[-8:])
            logs.clear()
            page.close()
        ctx.close()


if __name__ == "__main__":
    main()
