import { useState } from "react";
import type { AuditEvent } from "../../data/repository";
import { useBook } from "../context";
import { useSettingsTask } from "./file-task";
export function HistoryPanel() {
  const { repository, busy } = useBook();
  const { task, working } = useSettingsTask();
  const disabled = busy || working;
  const [history, setHistory] = useState<AuditEvent[] | null>(null);
  return (
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
  );
}
