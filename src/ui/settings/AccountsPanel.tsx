import { useMemo, useState } from "react";
import { balances, formatMoney, parseMoney } from "../../domain/book";
import { useBook } from "../context";
import { useSettingsTask } from "./file-task";
export function AccountsPanel() {
  const { book, busy, dispatch } = useBook();
  const { setMessage } = useSettingsTask();
  const [accountName, setAccountName] = useState(""),
    [opening, setOpening] = useState("0");
  const sums = useMemo(() => balances(book), [book]);
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

  return (
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
  );
}
