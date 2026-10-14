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
      "4173",
    ],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4173")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
      executablePath: process.env.CHROME_PATH,
    });
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await context.addInitScript(
      ({ date }) => {
        if (!localStorage.getItem("fixture")) {
          localStorage.setItem("fixture", "1");
          localStorage.setItem(
            "ledger.snapshot.v2",
            JSON.stringify({
              expenses: [
                {
                  id: "legacy-1",
                  date,
                  amount: 12,
                  category: "餐饮",
                  note: "迁移午餐",
                  createdAt: 1,
                },
              ],
              categories: [
                { name: "餐饮", color: "#d87962" },
                { name: "交通", color: "#6c98b7" },
              ],
              budgets: { [date.slice(0, 7)]: 900 },
            }),
          );
        }
      },
      { date },
    );
    await page.goto("http://127.0.0.1:4173");
    await page
      .locator(".page:not([hidden])")
      .getByText("迁移午餐", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥888.00",
    );
    await page.getByLabel("金额（元）", { exact: true }).fill("8.50");
    await page.getByLabel("交易备注").fill("新支出");
    await page.getByRole("button", { name: "记一笔", exact: false }).click();
    await page
      .locator(".page:not([hidden]) .transactions")
      .getByText("新支出", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥879.50",
    );
    await page
      .getByRole("button", { name: "编辑账单", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("金额（元）", { exact: true }).fill("10");
    await dialog
      .getByRole("button", { name: "保存修改", exact: false })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥878.00",
    );
    await page.reload();
    await page
      .locator(".page:not([hidden]) .transactions")
      .getByText("新支出", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "删除账单", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await page
      .locator(".page:not([hidden]) .transactions")
      .getByText("新支出", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥888.00",
    );
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByLabel("账户名称", { exact: true }).fill("银行卡");
    await page.getByLabel("期初余额", { exact: true }).fill("100");
    await page.getByRole("button", { name: "添加账户", exact: true }).click();
    await page
      .locator(".settings-list")
      .getByText("银行卡", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "记账", exact: true }).click();
    await page.getByRole("button", { name: "转账", exact: true }).click();
    await page.getByLabel("金额（元）", { exact: true }).fill("20");
    await page.getByRole("button", { name: "记一笔", exact: false }).click();
    await page
      .locator(".page:not([hidden])")
      .getByText("账户转账", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId("budget-remaining").innerText(),
      "¥888.00",
    );
    await page.getByRole("button", { name: "统计", exact: true }).click();
    await page
      .getByLabel("图表分类及百分比")
      .getByText("100.0%", { exact: true })
      .waitFor();
    for (const width of [320, 393, 430, 768]) {
      await page.setViewportSize({ width, height: 852 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 393, height: 852 });
    fs.mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/bill-insights.png",
    });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出 JSON", exact: true }).click(),
    ]);
    const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(backup.app, "Bill");
    assert.equal(backup.data.transactions.length, 2);
    assert.equal(backup.audit.length, 6);
    const input = page.getByLabel("导入备份文件");
    await input.setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
    await page.getByRole("status").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "确认覆盖导入", exact: true })
        .count(),
      0,
    );
    const empty = { ...backup, data: { ...backup.data, transactions: [] } };
    await input.setInputFiles({
      name: "empty.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(empty)),
    });
    await page
      .getByRole("button", { name: "确认覆盖导入", exact: true })
      .click();
    await page
      .locator(".page:not([hidden])")
      .getByText(/导入成功/)
      .waitFor();
    await page
      .getByRole("button", { name: "恢复导入前数据", exact: true })
      .click();
    await page.getByRole("button", { name: "确认恢复", exact: true }).click();
    await page
      .locator(".page:not([hidden])")
      .getByText("已恢复导入前数据。", { exact: true })
      .waitFor();
    await page.locator(".history-options > summary").click();
    await page
      .getByRole("button", { name: "查看最近 100 次", exact: true })
      .click();
    await page.locator(".history li").first().waitFor();
    assert.equal(await page.locator(".history li").count(), 8);
    await page.getByRole("button", { name: "记账", exact: true }).click();
    await page.getByRole("button", { name: "支出", exact: true }).click();
    await page
      .locator(".page:not([hidden])")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: "test-results/screenshots/bill-home.png" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "test-results/screenshots/bill-dark.png" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "24px";
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "font scale overflow",
    );
    // An initialized database is the only truth, even if the old source is corrupted later.
    await page.evaluate(() =>
      localStorage.setItem("ledger.snapshot.v2", "{broken-after-migration"),
    );
    await page.reload();
    await page
      .locator(".page:not([hidden])")
      .getByText("迁移午餐", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    // A corrupt initial migration must show a recovery gate, never an empty editable book.
    const other = await browser.newContext();
    await other.addInitScript(() =>
      localStorage.setItem("ledger.snapshot.v2", "{broken"),
    );
    const bad = await other.newPage();
    await bad.goto("http://127.0.0.1:4173");
    await bad.getByRole("alert").waitFor();
    assert.equal(
      await bad.getByRole("button", { name: "记一笔", exact: false }).count(),
      0,
    );
    await other.close();
    // Android bridge recovery must use SAF, not an unsupported HTML file chooser.
    const nativeContext = await browser.newContext();
    await nativeContext.addInitScript(() => {
      localStorage.setItem("ledger.snapshot.v2", "{broken");
      window.testActions = [];
      window.BillNative = {
        request(id, action, payload) {
          window.testActions.push(action);
          setTimeout(() => {
            const data =
              action === "db.read" && JSON.parse(payload).queries.length === 1
                ? [[]]
                : action === "db.read"
                  ? [
                      [
                        { key: "revision", value: "0" },
                        { key: "initialized", value: "0" },
                      ],
                      [],
                      [],
                      [],
                      [],
                      [],
                    ]
                  : action === "file.open"
                    ? JSON.stringify({
                        version: 2,
                        expenses: [],
                        categories: [],
                      })
                    : true;
            window.billNativeResult(id, { ok: true, data });
          }, 0);
        },
      };
    });
    const nativePage = await nativeContext.newPage();
    await nativePage.goto("http://127.0.0.1:4173");
    await nativePage.getByRole("alert").waitFor();
    await nativePage
      .getByRole("button", { name: "选择备份恢复", exact: true })
      .click();
    await nativePage
      .getByRole("button", { name: "确认恢复此备份", exact: true })
      .click();
    await nativePage
      .getByRole("button", { name: "记账", exact: true })
      .waitFor();
    assert.ok(
      (await nativePage.evaluate(() => window.testActions)).includes(
        "file.open",
      ),
    );
    await nativeContext.close();
    console.log(
      "PASS migration, CRUD, live budget, transfer, backup/recovery/audit, restart, corrupt data, 4 widths, dark mode, font scaling",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
