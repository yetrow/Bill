import { useRef, useState, type CSSProperties } from "react";
import { Check, Delete } from "lucide-react";
import { parseMoney, today, type Kind, type Transaction } from "../domain/book";
import { useBook } from "./context";
import { categoryColors } from "./category-colors";
export function TransactionForm({
  existing,
  onSaved,
  asOf,
}: {
  asOf?: string;
  existing?: Transaction;
  onSaved?: () => void;
}) {
  const { book, dispatch, busy } = useBook();
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense"),
    [amount, setAmount] = useState(
      existing ? (existing.amountMinor / 100).toFixed(2) : "",
    );
  const [accountId, setAccount] = useState(
      existing?.accountId ?? book.accounts.find((a) => !a.archived)!.id,
    ),
    [target, setTarget] = useState(existing?.toAccountId ?? "");
  const [categoryId, setCategory] = useState(
    existing?.categoryId ??
      book.categories.find((c) => c.kind === "expense" && !c.archived)?.id ??
      "",
  );
  const [chosenDate, setDate] = useState<string | null>(existing?.date ?? null),
    [note, setNote] = useState(existing?.note ?? ""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const date = chosenDate ?? asOf ?? today();
  const guard = useRef(false);
  const cats = book.categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === existing?.categoryId),
  );
  const colors = categoryColors(book.categories);
  const selected = cats.some((c) => c.id === categoryId)
    ? categoryId
    : (cats[0]?.id ?? "");
  const accounts = book.accounts.filter(
    (a) =>
      !a.archived ||
      a.id === existing?.accountId ||
      a.id === existing?.toAccountId,
  );
  const source = accounts.some((a) => a.id === accountId)
    ? accountId
    : (accounts[0]?.id ?? "");
  const destination = accounts.some((a) => a.id === target && a.id !== source)
    ? target
    : (accounts.find((a) => a.id !== source)?.id ?? "");
  async function save() {
    if (guard.current || busy) return;
    guard.current = true;
    setError("");
    try {
      const transaction: Transaction = {
        id: existing?.id ?? crypto.randomUUID(),
        kind,
        amountMinor: parseMoney(amount),
        accountId: source,
        toAccountId: kind === "transfer" ? destination : null,
        categoryId: kind === "transfer" ? null : selected,
        date,
        note: note.trim(),
        createdAt: existing?.createdAt ?? Date.now(),
      };
      if (await dispatch({ type: "transaction.save", transaction })) {
        if (existing) onSaved?.();
        else {
          setAmount("");
          setNote("");
          setSaved(true);
          setTimeout(() => setSaved(false), 1400);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      guard.current = false;
    }
  }
  function key(k: string) {
    setAmount((old) => {
      if (k === "⌫") return old.slice(0, -1);
      if (k === ".") return old.includes(".") ? old : (old || "0") + ".";
      const next = (old === "0" ? "" : old) + k;
      return /^\d{0,7}(\.\d{0,2})?$/.test(next) ? next : old;
    });
  }
  return (
    <form
      className="entry card"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="segmented">
        {(["expense", "income", "transfer"] as const).map((k) => (
          <button
            type="button"
            key={k}
            className={kind === k ? "selected" : ""}
            onClick={() => setKind(k)}
          >
            {{ expense: "支出", income: "收入", transfer: "转账" }[k]}
          </button>
        ))}
      </div>
      <label className="amount-entry">
        <span>¥</span>
        <input
          aria-label="金额（元）"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            if (/^\d{0,7}(\.\d{0,2})?$/.test(e.target.value))
              setAmount(e.target.value);
          }}
        />
        <span className="currency">CNY</span>
      </label>
      <div
        className={`category-note-grid ${kind === "transfer" ? "transfer-note" : ""}`}
      >
        {kind !== "transfer" && (
          <div className="category-field">
            <span className="field-label">选择分类</span>
            <div className="category-picker" aria-label="交易分类">
              {cats.map((c) => (
                <button
                  type="button"
                  className={selected === c.id ? "active" : ""}
                  key={c.id}
                  aria-pressed={selected === c.id}
                  style={
                    { "--category-color": colors.get(c.id) } as CSSProperties
                  }
                  onClick={() => setCategory(c.id)}
                >
                  <i style={{ background: colors.get(c.id) }} />
                  <span>{c.name}</span>
                  {selected === c.id && (
                    <Check size={12} className="category-check" />
                  )}
                </button>
              ))}
              {cats.length === 0 && (
                <p className="muted">
                  请先在设置中添加{kind === "income" ? "收入" : "支出"}分类。
                </p>
              )}
            </div>
          </div>
        )}
        <label className="note-field">
          <span className="field-label">
            备注 <small>选填</small>
          </span>
          <textarea
            className="note"
            aria-label="交易备注"
            placeholder={
              kind === "income"
                ? "这笔收入从哪里来？"
                : kind === "transfer"
                  ? "记录转账用途"
                  : "这笔花在了哪里？\n例如：午餐、买书、话费"
            }
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      {kind === "transfer" && (
        <p className="hint transfer-hint">
          账户间转账不计入支出，也不占用预算。
        </p>
      )}
      <div className="form-grid">
        <label>
          账户
          <select
            aria-label="交易账户"
            value={source}
            onChange={(e) => setAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "transfer" && (
          <label>
            转入账户
            <select
              aria-label="转入账户"
              value={destination}
              onChange={(e) => setTarget(e.target.value)}
            >
              {accounts
                .filter((a) => a.id !== source)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          日期
          <input
            aria-label="交易日期"
            type="date"
            max={asOf ?? today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {!existing && (
        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
            (k) => (
              <button
                type="button"
                aria-label={k === "⌫" ? "退格" : k}
                key={k}
                onClick={() => key(k)}
              >
                {k === "⌫" ? <Delete size={21} /> : k}
              </button>
            ),
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button
        className="primary save-button"
        disabled={
          busy || !amount || (kind === "transfer" ? !destination : !selected)
        }
        type="submit"
      >
        {saved ? (
          <>
            <Check size={18} />
            已记一笔
          </>
        ) : existing ? (
          "保存修改"
        ) : (
          "记一笔"
        )}
        <span>{existing ? "保留修正历史" : "＋"}</span>
      </button>
    </form>
  );
}
