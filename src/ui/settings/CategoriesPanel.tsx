import { useState } from "react";
import { COLORS, type Category } from "../../domain/book";
import { useBook } from "../context";
export function CategoriesPanel() {
  const { book, busy, dispatch } = useBook();
  const [categoryName, setCategoryName] = useState(""),
    [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [rename, setRename] = useState<Category | null>(null),
    [renameName, setRenameName] = useState("");
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
  );
}
