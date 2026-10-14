import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  ShieldCheck,
} from "lucide-react";
import {
  balances,
  COLORS,
  formatMoney,
  parseMoney,
  type Book,
  type Category,
} from "../domain/book";
import {
  MAX_FILE_BYTES,
  parseFile,
  toBeancount,
  toCsv,
} from "../domain/backup";
import type { AuditEvent } from "../data/repository";
import {
  isNative,
  nativeRequest,
  openFile,
  saveFile,
} from "../platform/native";
import { useBook } from "./context";
export function Settings() {
  const { book, repository, dispatch, run, busy, recovery } = useBook();
  const [message, setMessage] = useState(""),
    [working, setWorking] = useState(false),
    [preview, setPreview] = useState<{ book: Book; raw: unknown } | null>(null),
    [confirmRestore, setConfirmRestore] = useState(false),
    [history, setHistory] = useState<AuditEvent[] | null>(null);
  const [accountName, setAccountName] = useState(""),
    [opening, setOpening] = useState("0"),
    [categoryName, setCategoryName] = useState(""),
    [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [rename, setRename] = useState<Category | null>(null),
    [renameName, setRenameName] = useState("");
  const input = useRef<HTMLInputElement>(null),
    fileGuard = useRef(false);
  const sums = balances(book),
    disabled = busy || working;
  async function task(work: () => Promise<void>) {
    if (fileGuard.current) return;
    fileGuard.current = true;
    setWorking(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      fileGuard.current = false;
      setWorking(false);
    }
  }
  async function exportData(type: "json" | "csv" | "beancount") {
    await task(async () => {
      const data = await repository.exportBackup();
      const content =
        type === "json"
          ? JSON.stringify(data, null, 2)
          : type === "csv"
            ? toCsv(data.data)
            : toBeancount(data.data);
      const ok = await saveFile(
        content,
        type,
        type === "json"
          ? "application/json"
          : type === "csv"
            ? "text/csv"
            : "text/plain",
      );
      setMessage(ok ? "导出已完成，请保管好备份文件。" : "已取消导出");
    });
  }
  function parse(text: string) {
    setPreview(null);
    const { book } = parseFile(text);
    setPreview({ book, raw: JSON.parse(text.replace(/^\uFEFF/, "")) });
  }
  async function choose() {
    setPreview(null);
    if (isNative())
      await task(async () => {
        const content = await openFile();
        if (content !== null) parse(content);
      });
    else input.current?.click();
  }
  async function addAccount() {
    try {
      if (
        await dispatch({
          type: "account.add",
          account: {
            id: crypto.randomUUID(),
            name: accountName.trim(),
            openingMinor: parseMoney(opening, true),
            archived: false,
          },
        })
      ) {
        setAccountName("");
        setOpening("0");
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function addCategory() {
    if (
      await dispatch({
        type: "category.save",
        category: {
          id: crypto.randomUUID(),
          name: categoryName.trim(),
          kind: categoryKind,
          color: COLORS[book.categories.length % COLORS.length],
          archived: false,
        },
      })
    )
      setCategoryName("");
  }
  return (
    <div className="content">
      <header className="page-header">
        <div>
          <h1>设置</h1>
        </div>
      </header>
      <section className="card storage-card">
        <div className="storage-icon">
          <Database size={24} />
        </div>
        <div>
          <h2>
            Bill <span className="version">3.0.1</span>
          </h2>
          <p>本机保存 · {book.transactions.length} 笔交易</p>
        </div>
        <ShieldCheck size={19} />
      </section>
      <section className="card settings-block">
        <div className="section-heading">
          <h2>数据与备份</h2>
        </div>
        <p className="hint">
          JSON 包含账户、预算和变更历史。导入前会校验，替换前自动保留恢复点。
        </p>
        <div className="action-grid">
          <button
            className="primary"
            disabled={disabled}
            onClick={() => void exportData("json")}
          >
            <ArrowDownToLine size={16} />
            导出 JSON
          </button>
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => void choose()}
          >
            <ArrowUpFromLine size={16} />
            导入 JSON
          </button>
        </div>
        <details className="advanced-options">
          <summary>更多导出格式</summary>
          <div className="action-grid">
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => void exportData("csv")}
            >
              导出 CSV
            </button>
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => void exportData("beancount")}
            >
              导出 Beancount
            </button>
          </div>
        </details>
        <input
          ref={input}
          aria-label="导入备份文件"
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setPreview(null);
            if (file)
              void task(async () => {
                if (file.size > MAX_FILE_BYTES)
                  throw new Error("文件超过 32 MB");
                parse(await file.text());
              });
          }}
        />
        {preview && (
          <div className="confirmation">
            <strong>检查导入内容</strong>
            <p>
              {preview.book.transactions.length} 笔交易 ·{" "}
              {preview.book.accounts.length} 个账户 ·{" "}
              {preview.book.budgets.length} 个月预算
            </p>
            <p>
              将替换当前 {book.transactions.length} 笔交易。已有审计记录保留。
            </p>
            <button
              className="primary"
              disabled={disabled}
              onClick={async () => {
                if (await run(() => repository.importBackup(preview.raw))) {
                  setPreview(null);
                  setHistory(null);
                  setMessage("导入成功，已保留导入前恢复点。");
                }
              }}
            >
              确认覆盖导入
            </button>
            <button disabled={disabled} onClick={() => setPreview(null)}>
              取消导入
            </button>
          </div>
        )}
        <button
          className="text-button"
          disabled={disabled || !recovery}
          onClick={() => setConfirmRestore(true)}
        >
          恢复导入前数据
        </button>
        {confirmRestore && (
          <div className="confirmation">
            <p>恢复到上次导入前的账本？当前账本会成为下一份恢复点。</p>
            <button
              disabled={disabled}
              className="primary"
              onClick={async () => {
                if (await run(() => repository.restore())) {
                  setConfirmRestore(false);
                  setHistory(null);
                  setMessage("已恢复导入前数据。");
                }
              }}
            >
              确认恢复
            </button>
            <button onClick={() => setConfirmRestore(false)}>取消</button>
          </div>
        )}
        {working && (
          <p role="status" className="hint">
            正在处理，请完成系统文件选择…
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </section>
      <section className="card settings-block">
        <div className="section-heading">
          <h2>账户</h2>
          <span>余额根据流水计算</span>
        </div>
        <ul className="settings-list">
          {book.accounts.map((a) => (
            <li key={a.id}>
              <div>
                <strong>
                  {a.name}
                  {a.archived ? " · 已归档" : ""}
                </strong>
                <p>¥{formatMoney(sums[a.id])}</p>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void dispatch({ type: "account.archive", id: a.id })
                }
              >
                {a.archived ? "启用" : "归档"}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="add-account"
          onSubmit={(e) => {
            e.preventDefault();
            void addAccount();
          }}
        >
          <label>
            账户名称
            <input
              aria-label="账户名称"
              placeholder="如：银行卡"
              value={accountName}
              maxLength={100}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </label>
          <label>
            期初余额
            <input
              aria-label="期初余额"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              required
            />
          </label>
          <button className="secondary" disabled={busy || !accountName.trim()}>
            添加账户
          </button>
        </form>
        <p className="hint">期初余额是开始使用 Bill 前的余额，不计为收入。</p>
      </section>
      <section className="card settings-block">
        <div className="section-heading">
          <h2>分类</h2>
          <span>归档保留历史引用</span>
        </div>
        <div className="category-management">
          {book.categories.map((c) => (
            <div key={c.id}>
              <i style={{ background: c.color }} />
              <span>
                {c.name}
                <small>
                  {c.kind === "income" ? "收入" : "支出"}
                  {c.archived ? " · 已归档" : ""}
                </small>
              </span>
              <button
                aria-label={`重命名${c.name}`}
                onClick={() => {
                  setRename(c);
                  setRenameName(c.name);
                }}
              >
                改名
              </button>
              <button
                disabled={busy}
                aria-label={`${c.archived ? "启用" : "归档"}${c.name}`}
                onClick={() =>
                  void dispatch({
                    type: "category.save",
                    category: { ...c, archived: !c.archived },
                  })
                }
              >
                {c.archived ? "启用" : "归档"}
              </button>
            </div>
          ))}
        </div>
        {rename && (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await dispatch({
                  type: "category.save",
                  category: { ...rename, name: renameName.trim() },
                })
              )
                setRename(null);
            }}
          >
            <input
              aria-label="新的分类名"
              value={renameName}
              maxLength={100}
              onChange={(e) => setRenameName(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              保存名称
            </button>
            <button type="button" onClick={() => setRename(null)}>
              取消
            </button>
          </form>
        )}
        <form
          className="add-category"
          onSubmit={(e) => {
            e.preventDefault();
            void addCategory();
          }}
        >
          <input
            aria-label="新分类名称"
            placeholder="新分类名称"
            value={categoryName}
            maxLength={100}
            onChange={(e) => setCategoryName(e.target.value)}
            required
          />
          <select
            aria-label="新分类类型"
            value={categoryKind}
            onChange={(e) =>
              setCategoryKind(e.target.value as "expense" | "income")
            }
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <button className="secondary" disabled={busy || !categoryName.trim()}>
            添加分类
          </button>
        </form>
      </section>
      <details className="card settings-block history-options">
        <summary>变更历史</summary>
        <div className="section-heading">
          <button
            disabled={disabled}
            onClick={() =>
              void task(async () =>
                setHistory((await repository.history()).slice(-100).reverse()),
              )
            }
          >
            查看最近 100 次
          </button>
        </div>
        <p className="hint">
          修正与删除会保留前后记录。完整记录随 JSON 备份导出。
        </p>
        {history && (
          <ol className="history">
            {history.map((h) => (
              <li key={h.id}>
                <details>
                  <summary>
                    <span>
                      {{
                        migration: "初始化 / 旧账本迁移",
                        "transaction.save": "新增 / 修正交易",
                        "transaction.delete": "删除交易",
                        "account.add": "添加账户",
                        "account.archive": "账户归档 / 启用",
                        "category.save": "分类变更",
                        "budget.set": "预算变更",
                        "backup.import": "导入备份",
                        "backup.restore": "恢复备份",
                      }[h.kind] ?? h.kind}
                    </span>
                    <small>
                      #{h.revision} · {new Date(h.at).toLocaleString("zh-CN")}
                    </small>
                  </summary>
                  <pre>{JSON.stringify(h.changes, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </details>
      {isNative() && (
        <section className="card settings-block">
          <h2>显示</h2>
          <div className="action-grid">
            <button
              className="secondary"
              onClick={() =>
                void task(async () => {
                  await nativeRequest("display.fullscreen", { enabled: true });
                })
              }
            >
              沉浸式全屏
            </button>
            <button
              className="secondary"
              onClick={() =>
                void task(async () => {
                  await nativeRequest("display.fullscreen", { enabled: false });
                })
              }
            >
              显示系统栏
            </button>
          </div>
        </section>
      )}
      <p className="page-footnote">定期导出备份，以防设备丢失或卸载应用。</p>
    </div>
  );
}
