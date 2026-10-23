const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
(async () => {
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
    ],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4174")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 393, height: 1100 },
      timezoneId: "Asia/Shanghai",
    });
    await context.addInitScript(() => {
      if (localStorage.getItem("fixture")) return;
      const date = new Intl.DateTimeFormat("en-CA").format(new Date());
      const names = [
        "餐饮",
        "购物",
        "医疗",
        "洗澡+宿舍水费",
        "洗衣服",
        "水费",
        "考研",
        "骑车",
        "吹头",
        "话费",
        "其他",
      ];
      const colors = [
        "#e79077",
        "#7eb687",
        "#da82a3",
        "#858fce",
        "#d87962",
        "#c6a464",
        "#858fce",
        "#609e9b",
        "#609e9b",
        "#a8aaa1",
        "#bf708a",
      ];
      const amounts = [106.4, 38.08, 0, 6, 5, 10, 60, 0, 0, 99.99, 0];
      localStorage.setItem("fixture", "1");
      localStorage.setItem(
        "ledger.snapshot.v2",
        JSON.stringify({
          categories: names.map((name, i) => ({ name, color: colors[i] })),
          expenses: amounts.flatMap((amount, i) =>
            amount
              ? [
                  {
                    id: `old-${i}`,
                    date,
                    amount,
                    category: names[i],
                    note: `消费${i}`,
                    createdAt: i,
                  },
                ]
              : [],
          ),
          budgets: { [date.slice(0, 7)]: 1200 },
        }),
      );
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4174");
    await page.getByLabel("交易备注").waitFor();
    const home = page.getByLabel("记账页面");
    const note = await home.getByLabel("交易备注").boundingBox();
    const categories = await home.getByLabel("交易分类").boundingBox();
    assert.ok(
      note.x > categories.x + categories.width,
      "note stays beside category selection",
    );
    const summary = await home.locator(".summary-card").boundingBox();
    const budget = await home.getByLabel("本月预算").boundingBox();
    const entry = await home.locator(".entry").boundingBox();
    assert.ok(
      summary.height + budget.height < 190,
      "summary cards stay compact",
    );
    assert.ok(entry.y < 360, "entry is prominent on the first screen");
    const fills = await home
      .locator(".category-picker button")
      .evaluateAll((buttons) =>
        buttons.map((b) => getComputedStyle(b).backgroundColor),
      );
    assert.equal(
      new Set(fills).size,
      fills.length,
      "every category has a distinct fill",
    );
    fs.mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({ path: "test-results/screenshots/bill-home.png" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "test-results/screenshots/bill-dark.png" });
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("button", { name: "统计", exact: true }).click();
    await page.locator(".donut-label").first().waitFor();
    assert.equal(await page.locator(".donut-label").count(), 7);
    assert.equal(
      await page.locator(".chart-labels").count(),
      0,
      "no separate percentage legend below the donut",
    );
    for (const width of [320, 393, 430, 768]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(100);
      const bounds = await page.locator(".donut").evaluate((svg) => {
        const view = svg.viewBox.baseVal;
        return Array.from(svg.querySelectorAll(".donut-label text")).map(
          (el) => {
            const b = el.getBBox();
            return (
              b.x >= 0 &&
              b.y >= 0 &&
              b.x + b.width <= view.width &&
              b.y + b.height <= view.height
            );
          },
        );
      });
      assert.ok(
        bounds.every(Boolean),
        `all names and percentages fit at ${width}px`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.setViewportSize({ width: 393, height: 1100 });
    await page.waitForTimeout(100);
    await page.screenshot({
      path: "test-results/screenshots/bill-insights.png",
    });
    await page.getByRole("button", { name: "餐饮 32.7%", exact: true }).click();
    assert.equal(
      await page.locator(".page:not([hidden]) .transactions > li").count(),
      1,
    );
    await page.getByRole("button", { name: "餐饮 32.7%", exact: true }).click();
    assert.equal(
      await page.locator(".page:not([hidden]) .transactions > li").count(),
      7,
    );
    await page.getByRole("button", { name: "记账", exact: true }).click();
    await home.getByLabel("交易备注").fill("晚饭：面条 + 牛奶");
    await home
      .getByLabel("交易分类")
      .getByRole("button", { name: "餐饮", exact: true })
      .click();
    assert.equal(
      await home.getByLabel("交易备注").inputValue(),
      "晚饭：面条 + 牛奶",
    );
    await home.getByLabel("金额（元）", { exact: true }).fill("15");
    await home.getByRole("button", { name: "记一笔", exact: false }).click();
    await home
      .locator(".transactions")
      .getByText("晚饭：面条 + 牛奶", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥859.53",
    );
    await page.reload();
    await home
      .locator(".transactions")
      .getByText("晚饭：面条 + 牛奶", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS compact summary, adjacent note, distinct category fills, 7 connected chart labels, 4 widths, category filtering, saved note and live budget",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
