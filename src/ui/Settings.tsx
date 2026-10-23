import { useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { isNative, nativeRequest } from "../platform/native";
import { useBook } from "./context";
import { BackupPanel } from "./settings/BackupPanel";
import { AccountsPanel } from "./settings/AccountsPanel";
import { CategoriesPanel } from "./settings/CategoriesPanel";
import { HistoryPanel } from "./settings/HistoryPanel";
import { FileTaskContext, useFileTask } from "./settings/file-task";
export function Settings() {
  const { book } = useBook();
  const [historyKey, setHistoryKey] = useState(0);
  const tasks = useFileTask();
  const { task } = tasks;
  return (
    <FileTaskContext.Provider value={tasks}>
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

        <div className="settings-grid">
          <BackupPanel onReplaced={() => setHistoryKey((key) => key + 1)} />
          <AccountsPanel />
          <CategoriesPanel />
          <HistoryPanel key={historyKey} />
        </div>
        {isNative() && (
          <section className="card settings-block">
            <h2>显示</h2>
            <div className="action-grid">
              <button
                className="secondary"
                onClick={() =>
                  void task(async () => {
                    await nativeRequest("display.fullscreen", {
                      enabled: true,
                    });
                  })
                }
              >
                沉浸式全屏
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void task(async () => {
                    await nativeRequest("display.fullscreen", {
                      enabled: false,
                    });
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
    </FileTaskContext.Provider>
  );
}
