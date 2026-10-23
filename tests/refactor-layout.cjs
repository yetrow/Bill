const { chromium, expect } = require("playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

// Catch the old 600px single-column cap, squeezed zoomed columns, clipped
// amounts/actions and page overflow using actual rendered module geometry.
async function checkLayouts(browser) {
  fs.mkdirSync("test-results/screenshots", { recursive: true });
  const scenarios = [
    "default",
    "dark",
    "reduced-motion",
    "longnames",
    "largeamounts",
    "empty",
    "font200",
    "stress200",
  ];
  for (const width of [1024, 1440, 320, 393, 430, 768]) {
    for (const scenario of scenarios) {
      const enlarged = scenario.endsWith("200");
      const long = scenario === "longnames" || scenario === "stress200";
      const large = scenario === "largeamounts" || scenario === "stress200";
      const name = long
        ? "家庭日常生活采购及公共交通与其他超长分类名称LongUnbrokenCategoryName"
        : "餐饮";
      const amount = large ? 9999999.99 : 12;
      const context = await browser.newContext({
        timezoneId: "Asia/Shanghai",
        viewport: { width, height: 1100 },
        colorScheme:
          scenario === "dark" || scenario === "stress200" ? "dark" : "light",
        reducedMotion:
          scenario === "reduced-motion" || scenario === "stress200"
            ? "reduce"
            : "no-preference",
      });
      try {
        await context.addInitScript(
          ({ name, amount, empty }) => {
            localStorage.setItem(
              "ledger.snapshot.v2",
              JSON.stringify({
                categories: [
                  { name, color: "#d87962" },
                  { name: "交通", color: "#6c98b7" },
                ],
                expenses: empty
                  ? []
                  : [
                      {
                        id: "layout-fixture",
                        date: "2024-02-15",
                        amount,
                        category: name,
                        note: "布局验证 fixture",
                        createdAt: 1,
                      },
                    ],
                budgets: empty ? {} : { "2024-02": 100 },
              }),
            );
          },
          { name, amount, empty: scenario === "empty" },
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.clock.install({ time: new Date("2024-02-15T04:00:00Z") });
        await page.goto("http://127.0.0.1:4177");
        await page.getByLabel("交易备注").waitFor();
        if (enlarged)
          await page.evaluate(
            () => (document.documentElement.style.fontSize = "200%"),
          );
        const label = `${width}px ${scenario}`;
        const nav = (name) =>
          page
            .getByRole("navigation", { name: "主导航" })
            .getByRole("button", { name, exact: true });
        const columns = async (first, second) => {
          const a = await first.boundingBox(),
            b = await second.boundingBox();
          if (width >= 1024 && !enlarged) {
            assert.ok(
              b.x >= a.x + a.width && Math.abs(a.y - b.y) < 2,
              `${label}: modules must share two columns`,
            );
          } else {
            assert.ok(
              b.y >= a.y + a.height - 1 && Math.abs(a.x - b.x) < 2,
              `${label}: modules must stack in DOM order`,
            );
          }
        };
        const reachable = async (locator) => {
          await locator.scrollIntoViewIfNeeded();
          await expect(locator, label).toBeVisible();
          const b = await locator.boundingBox();
          assert.ok(
            b.x >= -1 && b.x + b.width <= width + 1,
            `${label}: control/amount fits horizontally`,
          );
          await expect(locator, label).toBeInViewport();
        };
        const noOverflow = async () => {
          const dimensions = await page.evaluate(() => {
            const page = document.querySelector(".page:not([hidden])");
            const content = page.querySelector(".content");
            return {
              document: document.documentElement.scrollWidth,
              page: page.scrollWidth,
              viewport: innerWidth,
              content: content.getBoundingClientRect().width,
              max:
                76 *
                parseFloat(getComputedStyle(document.documentElement).fontSize),
            };
          });
          assert.ok(
            dimensions.document <= width && dimensions.page <= width,
            `${label}: no whole-page horizontal overflow ${JSON.stringify(dimensions)}`,
          );
          assert.ok(
            dimensions.content <= dimensions.max + 1,
            `${label}: content capped at 76rem`,
          );
        };
        const home = page.getByLabel("记账页面", { exact: true });
        await columns(
          home.locator(".entry-panel"),
          home.locator(".ledger-section"),
        );
        const overview = await home.locator(".home-overview").boundingBox();
        const workspace = await home.locator(".home-workspace").boundingBox();
        assert.ok(
          Math.abs(overview.width - workspace.width) < 2,
          `${label}: overview spans workspace`,
        );
        await expect(home.locator(".hero-money")).toContainText(
          scenario === "empty" ? "0.00" : large ? "9,999,999.99" : "12.00",
        );
        await reachable(home.locator(".hero-money"));
        assert.ok(
          await home
            .locator(".summary-card")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
          `${label}: summary amount not clipped`,
        );
        await reachable(
          home.getByRole("button", { name: "修改预算", exact: true }),
        );
        if (width === 393 && scenario === "default") {
          await home.evaluate((el) => (el.scrollTop = 0));
          const summary = await home.locator(".summary-card").boundingBox();
          const budget = await home.locator(".budget").boundingBox();
          assert.ok(
            summary.height + budget.height < 190,
            "phone overview stays compact",
          );
          assert.ok(
            (await home.locator(".entry").boundingBox()).y < 360,
            "phone entry stays prominent",
          );
        }
        await reachable(home.getByLabel("金额（元）", { exact: true }));
        await reachable(home.getByLabel("交易备注"));
        await reachable(home.locator(".save-button"));
        await home.getByLabel("金额（元）", { exact: true }).fill("9999999.99");
        await expect(
          home.getByLabel("金额（元）", { exact: true }),
        ).toHaveValue("9999999.99");
        assert.ok(
          await home
            .getByLabel("金额（元）", { exact: true })
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          `${label}: full entered amount stays readable without horizontal input scrolling`,
        );
        if (scenario !== "empty") {
          await reachable(
            home.getByRole("button", { name: "编辑账单", exact: true }),
          );
          await expect(home.locator(".transactions")).toContainText(name);
        } else await expect(home.locator(".transactions")).toHaveCount(0);
        await noOverflow();
        if (scenario === "stress200") {
          await page.evaluate(() => {
            window.layoutTransaction = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function (...args) {
              if (args[1] === "readwrite")
                throw new Error("布局验证：写入失败，输入已保留。");
              return window.layoutTransaction.apply(this, args);
            };
          });
          await home.locator(".save-button").click();
          await expect(page.getByRole("alert")).toContainText(
            "布局验证：写入失败，输入已保留。",
          );
          await reachable(
            page.getByRole("button", { name: "关闭错误", exact: true }),
          );
          await noOverflow();
          await page
            .getByRole("button", { name: "关闭错误", exact: true })
            .click();
          await expect(
            home.getByLabel("金额（元）", { exact: true }),
          ).toHaveValue("9999999.99");
          await page.evaluate(
            () =>
              (IDBDatabase.prototype.transaction = window.layoutTransaction),
          );
        }
        const capture = async (key) => {
          if (
            [393, 1440].includes(width) &&
            ["default", "dark", "stress200"].includes(scenario)
          ) {
            await page
              .locator(".page:not([hidden])")
              .evaluate((el) => (el.scrollTop = 0));
            await page.screenshot({
              path: `test-results/screenshots/task3-${key}-${width}-${scenario}.png`,
            });
          }
        };
        await capture("home");
        await nav("统计").click();
        const stats = page.getByLabel("统计页面", { exact: true });
        await expect(stats.locator(".donut")).toBeVisible();
        await columns(
          stats.locator(".insight-card"),
          stats.locator(".trend-card"),
        );
        if (width <= 768 || enlarged) {
          const donut = await stats.locator(".donut").boundingBox();
          const trend = await stats.locator(".trend-card").boundingBox();
          assert.ok(
            donut.y + donut.height <= trend.y,
            `${label}: donut precedes trend`,
          );
        }
        if (scenario !== "empty") {
          const bar = stats.locator(".category-amount-bar").first();
          await reachable(bar);
          await expect(bar).toHaveAccessibleName(
            `${name} ¥${large ? "9,999,999.99" : "12.00"} 100.0%`,
          );
          assert.ok(
            await bar.evaluate((el) => el.scrollWidth <= el.clientWidth),
            `${label}: bar name/amount not clipped`,
          );
          await bar.click();
          await expect(bar).toHaveAttribute("aria-pressed", "true");
          await expect(
            stats.locator(".insight-ledger .transactions"),
          ).toContainText(name);
          await bar.click();
        } else
          await expect(stats.locator(".insight-card .empty")).toContainText(
            "这一期还没有支出",
          );
        await reachable(
          stats.getByRole("button", {
            name:
              "2024-02-15 支出 ¥" +
              (scenario === "empty"
                ? "0.00"
                : large
                  ? "9,999,999.99"
                  : "12.00"),
            exact: true,
          }),
        );
        await noOverflow();
        await capture("insights");
        await nav("设置").click();
        const settings = page.getByLabel("设置页面", { exact: true });
        await columns(
          settings.locator(".settings-grid > section").nth(0),
          settings.locator(".settings-grid > section").nth(1),
        );
        await reachable(
          settings.getByRole("button", { name: "导出 JSON", exact: true }),
        );
        await reachable(
          settings.getByRole("button", { name: "导入 JSON", exact: true }),
        );
        await noOverflow();
        await capture("settings");
        if (scenario === "dark") {
          assert.equal(
            await page
              .locator(".storage-card")
              .evaluate((el) => getComputedStyle(el).backgroundColor),
            "rgb(30, 41, 34)",
          );
        }
        if (scenario === "reduced-motion" || scenario === "stress200") {
          assert.equal(
            await page.evaluate(
              () =>
                getComputedStyle(document.querySelector(".progress i"))
                  .transitionDuration,
            ),
            "0s",
          );
        }
        assert.deepEqual(errors, [], label);
        console.log(`PASS layout ${label} home/insights/settings`);
      } finally {
        await context.close();
      }
    }
  }
}

// Catch retained drafts being relabeled or written to the new month, including
// blank-input deletion after an inactive page/background suspension.
async function checkBudgetRollover(browser) {
  const failures = [];
  for (const scenario of ["active-save", "resume-save", "resume-clear"]) {
    const context = await browser.newContext({
      timezoneId: "Asia/Shanghai",
      viewport: { width: 393, height: 1100 },
    });
    try {
      await context.addInitScript(() => {
        localStorage.setItem(
          "ledger.snapshot.v2",
          JSON.stringify({
            categories: [{ name: "餐饮", color: "#d87962" }],
            expenses: [
              {
                id: "feb",
                date: "2024-02-29",
                amount: 10,
                category: "餐饮",
                createdAt: 1,
              },
              {
                id: "mar",
                date: "2024-03-01",
                amount: 20,
                category: "餐饮",
                createdAt: 2,
              },
            ],
            // Legacy yuan fixture migrates to February=10000, March=50000 minor units.
            budgets: { "2024-02": 100, "2024-03": 500 },
          }),
        );
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2024-02-29T15:59:55Z") });
      await page.goto("http://127.0.0.1:4177");
      const nav = (name) =>
        page
          .getByRole("navigation", { name: "主导航" })
          .getByRole("button", { name, exact: true });
      const home = page.getByLabel("记账页面", { exact: true });
      const panel = home.locator(".budget");
      await expect(
        home.getByRole("region", { name: "本月预算", exact: true }),
      ).toBeVisible();
      await expect(panel.locator("h2")).toHaveText("2 月预算");
      await panel
        .getByRole("button", { name: "修改预算", exact: true })
        .click();
      await expect(panel.getByLabel("每月预算")).toHaveValue("100");
      const draft = scenario === "resume-clear" ? "" : "125";
      await panel.getByLabel("每月预算").fill(draft);
      if (scenario === "active-save") {
        await page.clock.runFor(10000);
      } else {
        await nav("设置").click();
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        // No timers run while suspended: resuming must refresh the rolling date.
        await page.clock.setSystemTime(new Date("2024-03-01T00:00:05+08:00"));
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new Event("focus"));
        });
        await nav("记账").click();
      }
      await expect(home.getByLabel("交易日期")).toHaveValue("2024-03-01");
      await expect(home.locator(".hero-money")).toContainText("20.00");
      await expect(home.locator(".summary-bottom strong")).toHaveText("¥20.00");
      await expect(panel.getByLabel("每月预算")).toHaveValue(draft);
      const heading = await panel.locator("h2").textContent();
      const region = await panel.getAttribute("aria-label");
      await panel
        .getByRole("button", { name: "保存预算", exact: true })
        .click();
      await expect(panel.getByLabel("每月预算")).toHaveCount(0);
      await expect(panel.locator("h2")).toHaveText("3 月预算");
      await expect(
        home.getByRole("region", { name: "本月预算", exact: true }),
      ).toBeVisible();
      const currentBudget = (
        await panel.locator(".budget-values").allTextContents()
      ).join("");
      await nav("设置").click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByLabel("设置页面", { exact: true })
          .getByRole("button", { name: "导出 JSON", exact: true })
          .click(),
      ]);
      const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
      assert.deepEqual(
        {
          budgets: backup.data.budgets.sort((a, b) =>
            a.month.localeCompare(b.month),
          ),
          heading,
          region,
          currentBudget,
          errors,
        },
        {
          budgets:
            scenario === "resume-clear"
              ? [{ month: "2024-03", amountMinor: 50000 }]
              : [
                  { month: "2024-02", amountMinor: 12500 },
                  { month: "2024-03", amountMinor: 50000 },
                ],
          heading: "2024 年 2 月预算",
          region: "2024 年 2 月预算",
          currentBudget: "本月剩余 ¥480.00预算 ¥500.00",
          errors: [],
        },
        scenario,
      );
      console.log(
        `PASS budget rollover ${scenario}: retained February draft/target, current March overview and exported budgets`,
      );
    } catch (error) {
      console.error(error);
      failures.push(error);
    } finally {
      await context.close();
    }
  }
  assert.equal(failures.length, 0, "budget rollover regressions");
}

(async () => {
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4177",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4177")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH,
    });
    await checkBudgetRollover(browser);
    if (process.argv.includes("--budget-rollover-only")) return;
    await checkLayouts(browser);
    const context = await browser.newContext({
      timezoneId: "Asia/Shanghai",
      viewport: { width: 393, height: 1100 },
    });
    await context.addInitScript(() => {
      const NativeObserver = window.ResizeObserver;
      window.donutObservers = 0;
      window.ResizeObserver = class extends NativeObserver {
        observe(target, options) {
          if (target.classList.contains("donut-wrap") && !this.tracked) {
            this.tracked = true;
            window.donutObservers++;
          }
          super.observe(target, options);
        }
        disconnect() {
          if (this.tracked) {
            window.donutObservers--;
            this.tracked = false;
          }
          super.disconnect();
        }
      };
      localStorage.setItem(
        "ledger.snapshot.v2",
        JSON.stringify({
          categories: [
            { name: "餐饮", color: "#d87962" },
            { name: "交通", color: "#6c98b7" },
          ],
          expenses: [
            {
              id: "a",
              date: "2024-02-15",
              amount: 12,
              category: "餐饮",
              note: "午餐",
              createdAt: 1,
            },
            {
              id: "b",
              date: "2024-02-15",
              amount: 8,
              category: "交通",
              note: "公交",
              createdAt: 2,
            },
            {
              id: "c",
              date: "2024-02-16",
              amount: 3,
              category: "交通",
              note: "次日公交",
              createdAt: 3,
            },
          ],
          budgets: { "2024-02": 100 },
        }),
      );
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2024-02-15T15:59:00Z") });
    await page.goto("http://127.0.0.1:4177");
    const nav = (name) =>
      page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("button", { name, exact: true });
    const home = page.getByLabel("记账页面", { exact: true });
    const stats = page.getByLabel("统计页面", { exact: true });
    await home.getByLabel("金额（元）", { exact: true }).fill("19.50");
    await home.getByLabel("交易备注").fill("保留草稿");
    await home.getByLabel("流水日期").fill("2024-02-01");
    await nav("统计").click();
    // First genuinely new assertion: amount bars supplement the unique donut labels.
    const bar = stats.getByRole("button", {
      name: "餐饮 ¥12.00 52.2%",
      exact: true,
    });
    await expect(bar).toBeVisible();
    await expect(
      stats.getByRole("button", { name: "餐饮 52.2%", exact: true }),
    ).toHaveCount(1);
    await bar.focus();
    await page.keyboard.press("Enter");
    await expect(bar).toHaveAttribute("aria-pressed", "true");
    await expect(stats.locator(".insight-ledger .transactions")).toContainText(
      "午餐",
    );
    await expect(
      stats.locator(".insight-ledger .transactions"),
    ).not.toContainText("公交");
    await stats
      .getByRole("button", { name: "餐饮 52.2%", exact: true })
      .click();
    await expect(bar).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => page.evaluate(() => window.donutObservers)).toBe(1);
    await stats
      .getByRole("button", { name: "2024-02-15 支出 ¥20.00", exact: true })
      .click();
    await page.evaluate(() => {
      window.retainedDonut = document.querySelector(".donut");
      window.retainedTrend = document.querySelector(".trend-canvas");
    });
    await nav("设置").click();
    await expect.poll(() => page.evaluate(() => window.donutObservers)).toBe(0);
    await page.setViewportSize({ width: 430, height: 1100 });
    await nav("统计").click();
    await expect(
      stats.getByRole("button", {
        name: "2024-02-15 支出 ¥20.00",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    assert.ok(
      await page.evaluate(
        () =>
          window.retainedDonut === document.querySelector(".donut") &&
          window.retainedTrend === document.querySelector(".trend-canvas"),
      ),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.abs(
              document.querySelector(".donut").viewBox.baseVal.width -
                document.querySelector(".donut-wrap").getBoundingClientRect()
                  .width,
            ) < 1,
        ),
      )
      .toBe(true);
    await stats.getByRole("button", { name: "上一期", exact: true }).click();
    await expect(stats.locator(".date-navigation strong")).toHaveText(
      "2024 年 1 月",
    );
    await nav("设置").click();
    await expect.poll(() => page.evaluate(() => window.donutObservers)).toBe(0);
    await page.clock.fastForward(120000);
    await nav("统计").click();
    await expect.poll(() => page.evaluate(() => window.donutObservers)).toBe(1);
    await expect(stats.locator(".date-navigation strong")).toHaveText(
      "2024 年 1 月",
    );
    await stats.getByRole("button", { name: "回到本期", exact: true }).click();
    await stats.getByRole("button", { name: "日", exact: true }).click();
    await expect(stats.locator(".date-navigation strong")).toHaveText(
      "2024-02-16",
    );
    await nav("记账").click();
    await expect(home.getByLabel("金额（元）", { exact: true })).toHaveValue(
      "19.50",
    );
    await expect(home.getByLabel("交易备注")).toHaveValue("保留草稿");
    await expect(home.getByLabel("流水日期")).toHaveValue("2024-02-01");
    await expect(home.getByLabel("交易日期")).toHaveValue("2024-02-16");
    await home.getByLabel("交易日期").fill("2024-02-14");
    await expect(home.locator(".hero-money")).toContainText("3.00");
    await home.getByRole("button", { name: "今天", exact: true }).click();
    await expect(home.locator(".transactions")).toContainText("次日公交");
    // Patch only write transactions after boot; the real repository must report failure.
    await page.evaluate(() => {
      window.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === "readwrite") throw new Error("测试写入失败");
        return window.originalTransaction.apply(this, args);
      };
    });
    await home.locator(".save-button").click();
    await expect(page.getByRole("alert")).toContainText("测试写入失败");
    await expect(home.getByLabel("金额（元）", { exact: true })).toHaveValue(
      "19.50",
    );
    await expect(home.getByLabel("交易备注")).toHaveValue("保留草稿");
    await page.getByRole("button", { name: "关闭错误", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await home.getByRole("button", { name: "修改预算", exact: true }).click();
    await home.getByLabel("每月预算").fill("250");
    await home.getByRole("button", { name: "保存预算", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("测试写入失败");
    await expect(home.getByLabel("每月预算")).toHaveValue("250");
    await page.evaluate(() => {
      IDBDatabase.prototype.transaction = window.originalTransaction;
    });
    await page.getByRole("button", { name: "关闭错误", exact: true }).click();
    await home.getByRole("button", { name: "保存预算", exact: true }).click();
    await expect(home.getByLabel("每月预算")).toHaveCount(0);
    // Current day follows midnight while active, and refreshes after background suspension.
    await nav("统计").click();
    await page.clock.fastForward(24 * 60 * 60 * 1000);
    await expect(stats.locator(".date-navigation strong")).toHaveText(
      "2024-02-17",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.setSystemTime(new Date("2024-02-20T04:00:00Z"));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(stats.locator(".date-navigation strong")).toHaveText(
      "2024-02-20",
    );
    await nav("记账").click();
    await expect(home.getByLabel("交易日期")).toHaveValue("2024-02-14");
    await expect(home.locator(".home-overview")).toHaveCount(1);
    await expect(
      home.locator(".home-workspace .entry-panel .entry"),
    ).toHaveCount(1);
    await expect(stats.locator(".insights-grid")).toHaveCount(1);
    await nav("设置").click();
    await expect(page.locator(".settings-grid")).toBeVisible();
    const settings = page.getByLabel("设置页面", { exact: true });
    await settings.locator(".history-options > summary").click();
    await settings
      .getByRole("button", { name: "查看最近 100 次", exact: true })
      .click();
    await expect(settings.locator(".history li").first()).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      settings.getByRole("button", { name: "导出 JSON", exact: true }).click(),
    ]);
    const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    await settings.getByLabel("导入备份文件").setInputFiles({
      name: "empty.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...backup,
          data: { ...backup.data, transactions: [] },
        }),
      ),
    });
    await settings
      .getByRole("button", { name: "确认覆盖导入", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText("导入成功");
    await expect(settings.locator(".history li")).toHaveCount(0);
    await settings.locator(".history-options > summary").click();
    await settings
      .getByRole("button", { name: "查看最近 100 次", exact: true })
      .click();
    await expect(settings.locator(".history li").first()).toContainText(
      "导入备份",
    );
    await settings
      .getByRole("button", { name: "恢复导入前数据", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "确认恢复", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText(
      "已恢复导入前数据",
    );
    await expect(settings.locator(".history li")).toHaveCount(0);
    // A fresh untouched entry must actually save against the new day after midnight.
    await page.reload();
    await home.getByLabel("金额（元）", { exact: true }).fill("4.25");
    await home.getByLabel("交易备注").fill("午夜新账单");
    await page.clock.setSystemTime(new Date("2024-02-20T15:59:55Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(home.getByLabel("交易日期")).toHaveValue("2024-02-20");
    await page.clock.runFor(10000);
    await expect(home.getByLabel("交易日期")).toHaveValue("2024-02-21");
    await home.locator(".save-button").click();
    await expect(home.locator(".transactions")).toContainText("午夜新账单");
    await expect(home.locator(".transactions")).toContainText("2024-02-21");
    await expect(home.getByLabel("金额（元）", { exact: true })).toHaveValue(
      "",
    );
    await home.getByRole("button", { name: "编辑账单", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑交易" });
    await page.clock.fastForward(24 * 60 * 60 * 1000);
    await expect(editor.getByLabel("交易日期")).toHaveValue("2024-02-21");
    await editor.getByRole("button", { name: "关闭编辑", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS amount bars/donut keyboard filtering, drafts, failed writes/budget, active observers, pinned history, midnight/background resume, wrappers",
    );
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
