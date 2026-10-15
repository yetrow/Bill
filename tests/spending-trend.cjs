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
      "4176",
    ],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4176")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
      executablePath: process.env.CHROME_PATH,
    });
    for (const timezoneId of ["Asia/Shanghai", "America/Los_Angeles"]) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        timezoneId,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2024-02-15T12:00:00Z") });
      await context.addInitScript(() => {
        if (localStorage.getItem("fixture")) return;
        localStorage.setItem("fixture", "1");
        localStorage.setItem(
          "ledger.snapshot.v2",
          JSON.stringify({
            categories: [{ name: "餐饮", color: "#d87962" }],
            expenses: [
              {
                id: "a",
                date: "2024-02-01",
                amount: 12.34,
                category: "餐饮",
                note: "早餐",
                createdAt: 1,
              },
              {
                id: "b",
                date: "2024-02-01",
                amount: 0.66,
                category: "餐饮",
                note: "加餐",
                createdAt: 2,
              },
              {
                id: "c",
                date: "2024-02-15",
                amount: 40,
                category: "餐饮",
                note: "午饭",
                createdAt: 3,
              },
            ],
            budgets: { "2024-02": 1000 },
          }),
        );
      });
      await page.goto("http://127.0.0.1:4176");
      await page.getByLabel("交易备注").waitFor();
      await page.getByRole("button", { name: "统计", exact: true }).click();
      const stats = page.getByLabel("统计页面");
      const chart = stats.getByRole("region", {
        name: "每日消费趋势，可左右滑动",
      });
      assert.equal(
        await chart.count(),
        1,
        "month view includes scrollable daily expense trend",
      );
      await chart.locator(".trend-date").first().scrollIntoViewIfNeeded();
      const firstDate = await chart
        .locator(".trend-date")
        .first()
        .boundingBox();
      await page.touchscreen.tap(
        firstDate.x + firstDate.width / 2,
        firstDate.y + firstDate.height / 2,
      );
      assert.match(
        await stats.getByRole("status").innerText(),
        /2月1日[\s\S]*13\.00/,
        "tapping a date label selects its amount",
      );
      await stats
        .getByRole("button", { name: "2024-02-01 支出 ¥13.00", exact: true })
        .click();
      assert.match(
        await stats.getByRole("status").innerText(),
        /2月1日[\s\S]*13\.00/,
      );
      await stats
        .getByRole("button", { name: "2024-02-02 支出 ¥0.00", exact: true })
        .click();
      assert.match(
        await stats.getByRole("status").innerText(),
        /2月2日[\s\S]*0\.00/,
      );
      assert.equal(
        await chart.getByRole("button").count(),
        15,
        "future dates are not zero-valued points",
      );
      const donut = stats.getByRole("group", { name: "图表分类及百分比" });
      const total = donut.locator(".donut-total");
      assert.equal(
        await donut.isVisible(),
        true,
        "category donut remains visible",
      );
      assert.equal(await total.textContent(), "¥53.00");
      async function assertDonutBeforeTrend() {
        assert.ok(
          await donut.evaluate((el) =>
            Boolean(
              el.compareDocumentPosition(
                document.querySelector(".trend-card"),
              ) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          ),
          "category donut precedes the extra daily trend in reading order",
        );
        const donutBox = await donut.boundingBox();
        const trendBox = await stats
          .getByRole("region", { name: "月内每日支出", exact: true })
          .boundingBox();
        assert.ok(
          donutBox.y + donutBox.height <= trendBox.y,
          "category donut appears above the daily trend on the phone",
        );
      }
      async function assertEmptyDonut() {
        assert.equal(
          await donut.isVisible(),
          true,
          "empty periods keep the category donut",
        );
        assert.equal(await total.textContent(), "¥0.00");
        assert.ok((await donut.textContent()).includes("0 个分类"));
        assert.equal(await donut.locator(".donut-label").count(), 0);
      }
      await assertDonutBeforeTrend();
      assert.equal(
        await stats.getByText("午饭", { exact: true }).isVisible(),
        false,
        "ledger initially collapsed",
      );
      await stats
        .getByRole("button", { name: "餐饮 100.0%", exact: true })
        .click();
      assert.equal(
        await stats.getByText("午饭", { exact: true }).isVisible(),
        true,
        "category filtering reveals its ledger",
      );
      for (const width of [320, 393, 430, 768]) {
        await page.setViewportSize({ width, height: 852 });
        const overflow = await chart.evaluate((el) => {
          el.scrollLeft = 9999;
          return {
            moved: el.scrollLeft,
            scroll: el.scrollWidth,
            visible: el.clientWidth,
          };
        });
        assert.ok(
          overflow.scroll > overflow.visible && overflow.moved > 0,
          `chart pans at ${width}px`,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `page fits ${width}px`,
        );
        assert.equal(
          await chart.locator(".trend-date").last().textContent(),
          "29",
        );
      }
      await stats.getByRole("button", { name: "上一期", exact: true }).click();
      assert.equal(await chart.getByRole("button").count(), 31);
      await assertEmptyDonut();
      await assertDonutBeforeTrend();
      assert.equal(
        await chart.evaluate((el) => el.scrollLeft),
        0,
        "new month starts at its beginning",
      );
      await stats
        .getByRole("button", { name: "2024-01-31 支出 ¥0.00", exact: true })
        .click();
      await stats
        .getByRole("button", { name: "回到本期", exact: true })
        .click();
      await stats.getByRole("button", { name: "下一期", exact: true }).click();
      assert.equal(
        await chart.getByRole("button").count(),
        0,
        "future month has no observed spending",
      );
      await assertEmptyDonut();
      await assertDonutBeforeTrend();
      await stats
        .getByRole("button", { name: "回到本期", exact: true })
        .click();
      await stats
        .getByRole("button", { name: "收入占比", exact: true })
        .click();
      assert.equal(
        await chart.count(),
        0,
        "income view does not show an expense chart",
      );
      await assertEmptyDonut();
      await stats
        .getByRole("button", { name: "支出占比", exact: true })
        .click();
      await page.getByRole("button", { name: "记账", exact: true }).click();
      await page.getByLabel("金额（元）", { exact: true }).fill("5");
      await page.getByLabel("交易备注").fill("趋势更新");
      await page.getByRole("button", { name: "记一笔", exact: false }).click();
      await page
        .getByTestId("budget-remaining")
        .filter({ hasText: "942.00" })
        .waitFor();
      await page.getByRole("button", { name: "统计", exact: true }).click();
      await chart
        .getByRole("button", { name: "2024-02-15 支出 ¥45.00", exact: true })
        .waitFor();
      assert.equal(
        await total.textContent(),
        "¥58.00",
        "saving an expense updates the category donut alongside the daily trend",
      );
      await assertDonutBeforeTrend();
      await page.reload();
      await page.getByRole("button", { name: "统计", exact: true }).click();
      await chart
        .getByRole("button", { name: "2024-02-15 支出 ¥45.00", exact: true })
        .waitFor();
      await page.setViewportSize({ width: 393, height: 852 });
      await chart.evaluate((el) => {
        el.scrollLeft = 0;
      });
      await chart
        .getByRole("button", { name: "2024-02-01 支出 ¥13.00", exact: true })
        .click();
      fs.mkdirSync("test-results/screenshots", { recursive: true });
      async function captureFullStatistics(path) {
        const height = await stats.evaluate((el) => el.scrollHeight + 80);
        await page.setViewportSize({ width: 393, height });
        await stats.evaluate((el) => {
          el.scrollTop = 0;
        });
        await page.screenshot({ path, fullPage: true });
        await page.setViewportSize({ width: 393, height: 852 });
      }
      if (timezoneId === "Asia/Shanghai") {
        await captureFullStatistics(
          "test-results/screenshots/bill-donut-trend.png",
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await captureFullStatistics(
          "test-results/screenshots/bill-donut-trend-dark.png",
        );
      }
      await chart
        .getByRole("button", { name: "2024-02-15 支出 ¥45.00", exact: true })
        .click();
      const beforeMidnight = await page.evaluate(() =>
        new Date(2024, 1, 15, 23, 59, 55).getTime(),
      );
      await page.clock.setSystemTime(new Date(beforeMidnight));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.clock.runFor(10000);
      assert.equal(
        await chart.getByRole("button").count(),
        16,
        "new local day becomes available across midnight",
      );
      assert.ok(
        !(await stats.getByRole("status").innerText()).includes("今天"),
        "yesterday no longer says today",
      );
      await page.emulateMedia({ colorScheme: "light" });
      await stats.locator(".insight-ledger > summary").click();
      while (
        await stats
          .getByRole("button", { name: "删除账单", exact: true })
          .count()
      ) {
        const count = await stats
          .getByRole("button", { name: "删除账单", exact: true })
          .count();
        await stats
          .getByRole("button", { name: "删除账单", exact: true })
          .first()
          .click();
        await stats
          .getByRole("button", { name: "确认删除", exact: true })
          .click();
        await stats
          .getByRole("button", { name: "删除账单", exact: true })
          .nth(count - 1)
          .waitFor({ state: "detached" });
      }
      await assertEmptyDonut();
      await assertDonutBeforeTrend();
      assert.equal(
        await chart
          .getByRole("button", { name: "2024-02-15 支出 ¥0.00", exact: true })
          .count(),
        1,
        "deleting the final expense resets both charts",
      );
      await stats.getByText("这一期还没有支出", { exact: true }).waitFor();
      if (timezoneId === "Asia/Shanghai") {
        await captureFullStatistics(
          "test-results/screenshots/bill-donut-trend-empty.png",
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await captureFullStatistics(
          "test-results/screenshots/bill-donut-trend-empty-dark.png",
        );
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS category donut precedes daily trend: empty ring, last-expense deletion, totals, cents, zero days, future gaps, leap month, month navigation, 4 widths, horizontal pan, filtered ledger, income separation, live updates, persistence, 2 timezones",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
