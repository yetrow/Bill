import { useState } from "react";
import { BookOpen, ChartNoAxesCombined, Settings2 } from "lucide-react";
import { BookProvider } from "./ui/store";
import { useBook } from "./ui/context";
import { Home } from "./ui/Home";
import { Insights } from "./ui/Insights";
import { Settings } from "./ui/Settings";
function Shell() {
  const [tab, setTab] = useState("home");
  const { error, dismiss, busy } = useBook();
  return (
    <div className="app-shell">
      {error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button onClick={dismiss} aria-label="关闭错误">
            ×
          </button>
          <button onClick={() => location.reload()}>重新加载</button>
        </div>
      )}
      <main className="pages">
        <section hidden={tab !== "home"} className="page" aria-label="记账页面">
          <Home active={tab === "home"} />
        </section>
        <section
          hidden={tab !== "insights"}
          className="page"
          aria-label="统计页面"
        >
          <Insights active={tab === "insights"} />
        </section>
        <section
          hidden={tab !== "settings"}
          className="page"
          aria-label="设置页面"
        >
          <Settings />
        </section>
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {[
          { id: "home", label: "记账", Icon: BookOpen },
          { id: "insights", label: "统计", Icon: ChartNoAxesCombined },
          { id: "settings", label: "设置", Icon: Settings2 },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {busy && (
        <div className="saving" role="status">
          正在安全保存…
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <BookProvider>
      <Shell />
    </BookProvider>
  );
}
