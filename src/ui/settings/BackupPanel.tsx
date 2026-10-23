import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { Book } from "../../domain/book";
import {
  MAX_FILE_BYTES,
  parseFile,
  toBeancount,
  toCsv,
} from "../../domain/backup";
import { isNative, openFile, saveFile } from "../../platform/native";
import { useBook } from "../context";
import { useSettingsTask } from "./file-task";
export function BackupPanel({ onReplaced }: { onReplaced: () => void }) {
  const { book, repository, run, busy, recovery } = useBook();
  const { task, working, message, setMessage } = useSettingsTask();
  const disabled = busy || working;
  const [preview, setPreview] = useState<{ book: Book; raw: unknown } | null>(
      null,
    ),
    [confirmRestore, setConfirmRestore] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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

  return (
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
              if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 32 MB");
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
                onReplaced();
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
                onReplaced();
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
  );
}
