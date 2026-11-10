const { chromium } = require("playwright");

const PASSWORD = "ChefTest2026!";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem("wajbati_terms_accepted", "true");
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.getByText("طاجين تجريبي", { exact: true }).waitFor({ timeout: 20000 });
  await page.screenshot({ path: "screenshot-home.png", fullPage: true });

  await page.goto("http://localhost:3000/chef", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").waitFor({ timeout: 20000 });
  await page.locator("input[type=email]").fill("test@chef.com");
  await page.locator("input[type=password]").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.getByText("ملفي الشخصي", { exact: true }).waitFor({ timeout: 20000 });
  await page.getByText("ماذا تطبخ اليوم؟").first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: "screenshot-chef.png", fullPage: true });

  console.log("SCREENSHOTS SAVED SUCCESSFULLY");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
