# 测试指南

本指南描述仓库中已有的测试与执行方式，不作为某个版本已通过全部测试的证明。具体提交的 CI 结果见 [GitHub Actions](https://github.com/yetrow/Bill/actions)。

## 环境与快速检查

从项目根目录执行；前端需要 Node.js 24 和 npm。Android 需要 JDK 17、SDK Platform 35 和 Build Tools 35.0.0，使用仓库中的 Gradle Wrapper。

```bash
npm ci
npm run check
```

`check` 依次执行单元测试、ESLint、TypeScript 检查和 Vite 生产构建。命令失败应先定位原因，不将未完成的检查记为通过。

## 测试层次

| 测试 | 运行命令 | 主要覆盖 |
| --- | --- | --- |
| 领域与数据库 | `npm test` | 金额与引用校验、预算、迁移、真实 Node SQLite 事务、版本冲突、备份和审计一致性 |
| 图表布局 | 包含在 `npm test` 中 | 窄屏、长分类名、大量分类及标签布局 |
| 移动浏览器 | `npm run test:mobile` | 迁移、记账增改删、预算、转账、备份恢复、界面布局及年度统计 |
| Android 数据库 | `./gradlew testDebugUnitTest`，在 `android/` 中执行 | Robolectric 下的 schema、外键、原子提交、版本冲突、重开数据库和审计保护 |

### 移动浏览器测试

先安装 Chromium 并构建前端：

```bash
npx playwright install chromium
npm run build
npm run test:mobile
```

四个浏览器测试脚本各自启动本机 Vite preview 服务，使用测试账本，不需要个人账本或签名材料：

- [`tests/mobile.cjs`](../tests/mobile.cjs)：迁移、收支编辑/删除、实时预算、转账、导入恢复、审计、损坏数据门禁、深色模式与字体缩放；原生恢复流程使用桥接模拟。
- [`tests/ui-layout.cjs`](../tests/ui-layout.cjs)：紧凑摘要、分类旁备注、分类颜色、图表引线标签、分类筛选与备注持久化。
- [`tests/spending-trend.cjs`](../tests/spending-trend.cjs)：每日支出合计、零消费日、未来日期留空、闰月、月份切换、横向滚动、点选金额、流水展开、实时更新与重启持久化；包含两个时区。
- [`tests/annual-stats.cjs`](../tests/annual-stats.cjs)：跨年边界、闰日、收支合计、转账排除、分类重置、年份切换和日/周/月回归；包含两个时区。

移动布局覆盖 320、393、430 和 768 像素视口。自动截图保存到 `test-results/screenshots/`，该目录被 Git 忽略；执行测试不会覆盖用于项目展示的 `docs/screenshots/`。

### Android 数据库测试

前端构建完成后执行：

```bash
cd android
./gradlew testDebugUnitTest
```

Windows 使用 `gradlew.bat testDebugUnitTest`。测试代码见 [`BillDatabaseTest.java`](../android/app/src/test/java/com/jizhang/repaired/BillDatabaseTest.java)。Gradle 构建会将前端资源及 SQL 迁移同步到生成的 assets 目录。

## CI 与验证边界

[`ci.yml`](../.github/workflows/ci.yml) 在 push / pull request 上执行前端检查、移动浏览器回归、Android 单元测试和调试 APK 构建。正式签名由[手动工作流](../.github/workflows/release.yml)使用外部 secrets 完成，不把私钥写入仓库。

浏览器测试不能证明真实 Android 文件选择器、WebView 生命周期或覆盖升级全部正常；Robolectric 也不能替代真机验证。发布前应在保留备份的设备上检查旧版覆盖升级、重启后数据、系统文件导入导出、字体缩放、深色模式和窄屏显示。

测试日志、报告、APK、数据库文件与账本备份不提交到 Git。自动测试通过也不等于已经测得实机启动时间、帧率或跨机器 APK 字节完全一致。
