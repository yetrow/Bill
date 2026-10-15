const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

(async () => {
  const { emptyBook } = await import("../src/domain/book.ts");
  const book = emptyBook();
  book.accounts.push({
    id: "bank",
    name: "银行卡",
    openingMinor: 0,
    archived: false,
  });
  book.transactions = [
    ["2023-12-31", 900, "food", "expense", "上一年"],
    ["2024-01-01", 1000, "food", "expense", "年初"],
    ["2024-02-29", 2000, "food", "expense", "闰日"],
    ["2024-12-31", 3000, "food", "expense", "年末"],
    ["2024-06-01", 4000, "transport", "expense", "交通"],
    ["2025-01-01", 9000, "food", "expense", "下一年"],
    ["2024-01-01", 20000, "salary", "income", "年初工资"],
    ["2024-12-31", 30000, "salary", "income", "年末工资"],
    ["2024-06-01", 7777, null, "transfer", "账户转账"],
  ].map(([date, amountMinor, categoryId, kind, note], i) => ({
    id: `annual-${i}`,
    date,
    amountMinor,
    categoryId,
    kind,
    note,
    accountId: "cash",
    toAccountId: kind === "transfer" ? "bank" : null,
    createdAt: i + 1,
  }));
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4175",
    ],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4175")).ok) break;
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
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.clock.install({ time: new Date("2024-02-29T12:00:00Z") });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:4175");
      await page.getByRole("button", { name: "设置", exact: true }).click();
      await page.getByLabel("导入备份文件").setInputFiles({
        name: "annual.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ app: "Bill", version: 3, data: book }),
        ),
      });
      await page
        .getByRole("button", { name: "确认覆盖导入", exact: true })
        .click();
      await page
        .getByText("导入成功，已保留导入前恢复点。", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "统计", exact: true }).click();
      const stats = page.getByLabel("统计页面");
      // A missing year tab or monthly fallback cannot satisfy annual totals.
      assert.equal(
        await stats.getByRole("button", { name: "年", exact: true }).count(),
        1,
        "statistics offers a year period",
      );
      await stats.getByRole("button", { name: "年", exact: true }).click();
      await stats.locator(".insight-ledger > summary").click();
      const label = stats.locator(".date-navigation strong");
      const total = stats.locator(".donut-total");
      const notes = () => stats.locator(".transaction-note").allTextContents();
      assert.equal(await label.innerText(), "2024 年");
      assert.equal(await total.textContent(), "¥100.00");
      assert.deepEqual(await notes(), ["年末", "交通", "闰日", "年初"]);
      await stats
        .getByRole("button", { name: "餐饮 60.0%", exact: true })
        .click();
      assert.deepEqual(await notes(), ["年末", "闰日", "年初"]);
      await stats.getByRole("button", { name: "上一期", exact: true }).click();
      assert.equal(await label.innerText(), "2023 年");
      assert.deepEqual(await notes(), ["上一年"]);
      assert.equal(
        await stats
          .getByRole("button", { name: "餐饮 100.0%", exact: true })
          .getAttribute("aria-pressed"),
        "false",
        "year navigation clears the selected category before any tab change",
      );
      await stats.getByRole("button", { name: "月", exact: true }).click();
      assert.equal(
        await label.innerText(),
        "2023 年 1 月",
        "year navigation normalizes leap-day cursor",
      );
      await stats.getByRole("button", { name: "年", exact: true }).click();
      await stats.getByRole("button", { name: "下一期", exact: true }).click();
      assert.equal(await total.textContent(), "¥100.00");
      assert.equal(
        (await notes()).length,
        4,
        "navigation clears the selected category",
      );
      await stats.getByRole("button", { name: "下一期", exact: true }).click();
      assert.equal(await label.innerText(), "2025 年");
      assert.deepEqual(await notes(), ["下一年"]);
      await stats.getByRole("button", { name: "下一期", exact: true }).click();
      assert.equal(await label.innerText(), "2026 年");
      await stats.getByText("这一期还没有支出", { exact: true }).waitFor();
      await stats
        .getByRole("button", { name: "回到本期", exact: true })
        .click();
      assert.equal(await label.innerText(), "2024 年");
      assert.equal(await total.textContent(), "¥100.00");
      await stats
        .getByRole("button", { name: "餐饮 60.0%", exact: true })
        .click();
      await stats
        .getByRole("button", { name: "收入占比", exact: true })
        .click();
      assert.equal(await total.textContent(), "¥500.00");
      assert.deepEqual(await notes(), ["年末工资", "年初工资"]);
      await stats
        .getByRole("button", { name: "支出占比", exact: true })
        .click();
      for (const [tab, amount, count] of [
        ["月", "¥20.00", 1],
        ["周", "¥20.00", 1],
        ["日", "¥20.00", 1],
        ["年", "¥100.00", 4],
      ]) {
        await stats.getByRole("button", { name: tab, exact: true }).click();
        assert.equal(await total.textContent(), amount);
        assert.equal((await notes()).length, count);
      }
      for (const width of [320, 393, 430, 768]) {
        await page.setViewportSize({ width, height: 852 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `annual view fits ${width}px`,
        );
      }
      if (process.env.ANNUAL_SCREENSHOT && timezoneId === "Asia/Shanghai") {
        await page.setViewportSize({ width: 393, height: 852 });
        await page.screenshot({ path: process.env.ANNUAL_SCREENSHOT });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS annual boundaries, leap day, totals, income, transfer exclusion, category resets, year navigation, empty year, current year, day/week/month regression, 2 timezones and 4 widths",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
