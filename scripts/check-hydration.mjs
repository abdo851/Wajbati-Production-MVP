import { chromium } from "playwright";

const base = process.env.RIGH_VERIFY_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const msgs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/hydrat|did not match|server rendered/i.test(t)) msgs.push(t.slice(0, 400));
});
page.on("pageerror", (e) => {
  if (/hydrat/i.test(e.message)) msgs.push(e.message.slice(0, 400));
});
await page.goto(base + "/", { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify({ hydrationWarnings: msgs.length, samples: msgs.slice(0, 8) }));
await browser.close();
process.exit(msgs.length ? 1 : 0);
