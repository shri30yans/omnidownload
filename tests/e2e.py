"""Load the built extension in Chromium and report what the panel finds per URL.

Usage: python3 tests/e2e.py [urls.json]   (run `npm run build` first)
Each case: {"name", "url", "expect": "video|image|audio|none", "min": 1}
"""
import json, os, sys, time, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tests/cases.json")))

JS = """() => {
  const r = document.getElementById('omnidownload-root');
  if (!r) return null;
  return {
    version: r.querySelector('.omni-version')?.textContent,
    status: r.querySelector('.omni-status')?.textContent,
    items: [...r.querySelectorAll('.omni-item')].map(li => ({
      title: li.querySelector('.omni-item-title')?.textContent,
      sub: li.querySelector('.omni-item-sub')?.textContent})),
  };
}"""

def run():
    results = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), headless=False,
            args=[f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}",
                  "--headless=new"],
            viewport={"width": 1280, "height": 900}, accept_downloads=True)
        for c in CASES:
            page = ctx.new_page()
            logs = []
            page.on("console", lambda m: logs.append(m.text) if "OmniDownload" in m.text else None)
            try:
                page.goto(c["url"], wait_until="domcontentloaded", timeout=45000)
                got = None
                for _ in range(24):          # up to ~12s for async extractors
                    time.sleep(0.5)
                    try: got = page.evaluate(JS)
                    except Exception: continue   # page still navigating
                    if got and got["items"]:
                        break
                kinds = [i["sub"].split(" ")[0] for i in (got or {}).get("items", [])]
                want = c.get("expect", "video")
                ok = (not kinds) if want == "none" else kinds.count(want) >= c.get("min", 1)
                if ok and c.get("pick") and got["items"]:
                    # Stream download: the extension saves via the page, so catch it in the browser.
                    page.evaluate("(q) => [...document.querySelectorAll('.omni-item')].find(li => li.textContent.includes(q)).querySelector('button').click()", c["pick"])
                    with page.expect_download(timeout=180000) as info:
                        pass
                    path = os.path.join(tempfile.mkdtemp(), "out.mp4")
                    info.value.save_as(path)
                    got["status"] += f" | saved {os.path.getsize(path)} bytes -> {path}"
                    ok = os.path.getsize(path) > 10000
                elif ok and c.get("download") and got["items"]:
                    sw = next((w for w in ctx.service_workers if w.url.startswith("chrome-extension://")), None) or ctx.wait_for_event("serviceworker")
                    before = sw.evaluate("chrome.downloads.search({}).then(r=>r.length)")
                    page.evaluate("document.querySelector('.omni-download').click()")
                    dl = None
                    for _ in range(60):
                        time.sleep(1)
                        dl = sw.evaluate("chrome.downloads.search({orderBy:['-startTime']}).then(r=>r.map(d=>({state:d.state,bytes:d.totalBytes||d.bytesReceived,err:d.error,name:d.filename.split('/').pop()})))")
                        if dl and len(dl) > before and dl[0]["state"] != "in_progress": break
                    ok = bool(dl) and len(dl) > before and dl[0]["state"] == "complete" and dl[0]["bytes"] > 1000
                    got["status"] += f" | download: {dl[0] if dl else None}"
                results.append((c["name"], ok, got, logs[:3]))
            except Exception as e:
                results.append((c["name"], False, {"status": f"ERROR {e}", "items": []}, logs[:3]))
            page.close()
        ctx.close()
    for name, ok, got, logs in results:
        items = (got or {}).get("items", [])
        print(f"{'PASS' if ok else 'FAIL'}  {name}: {len(items)} items | {(got or {}).get('status')}")
        for i in items[:4]: print("      ", i["title"], "|", i["sub"])
        if not ok: print("       logs:", logs)
    sys.exit(0 if all(r[1] for r in results) else 1)

run()
