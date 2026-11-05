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

| 测试               | 运行命令                                            | 主要覆盖                                                                      |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| 领域与数据库       | `npm test`                                          | 金额与引用校验、预算、迁移、真实 Node SQLite 事务、版本冲突、备份和审计一致性 |
| 图表布局           | 包含在 `npm test` 中                                | 窄屏、长分类名、大量分类及标签布局                                            |
| 展示模型与共享日期 | 包含在 `npm test` 中                                | 纯查询、整数分、稳定排序、本地日历边界、午夜更新、后台恢复与资源清理          |
| 移动浏览器         | `npm run test:mobile`                               | 迁移、记账增改删、预算、转账、备份恢复、界面布局及年度统计                    |
| Android 数据库     | `./gradlew testDebugUnitTest`，在 `android/` 中执行 | Robolectric 下的 schema、外键、原子提交、版本冲突、重开数据库和审计保护       |

### 移动浏览器测试

已安装依赖时，先构建前端再运行浏览器测试。默认使用 Playwright 配套 Chromium；缺少浏览器时可安装它：

```bash
npx playwright install chromium
npm run build
npm run test:mobile
```

也可通过 `CHROME_PATH` 指向已安装的 Chrome 可执行文件，避免下载浏览器。Windows PowerShell 从项目根目录执行：

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run build
npm run test:mobile
Remove-Item Env:CHROME_PATH
```

未设置 `CHROME_PATH` 时仍使用默认配套 Chromium。`test:mobile` 串行执行五个浏览器测试脚本，每个脚本各自启动本机 Vite preview 服务，并在 `finally` 中关闭浏览器和终止服务；使用测试账本，不需要个人账本或签名材料：

- [`tests/mobile.cjs`](../tests/mobile.cjs)：迁移、收支编辑/删除、实时预算、转账、导入恢复、审计、损坏数据门禁、深色模式与字体缩放；原生恢复流程使用桥接模拟。
- [`tests/ui-layout.cjs`](../tests/ui-layout.cjs)：紧凑摘要、分类旁备注、分类颜色、图表引线标签、分类筛选与备注持久化。
- [`tests/spending-trend.cjs`](../tests/spending-trend.cjs)：每日支出合计、零消费日、未来日期留空、闰月、月份切换、横向滚动、点选金额、流水展开、实时更新与重启持久化；包含两个时区。
- [`tests/annual-stats.cjs`](../tests/annual-stats.cjs)：跨年边界、闰日、收支合计、转账排除、分类重置、年份切换和日/周/月回归；包含两个时区。
- [`tests/refactor-layout.cjs`](../tests/refactor-layout.cjs)：独立 preview 端口 4177；验证首页、统计、设置的单双列几何、金额与操作可达性、无整页横向溢出、分类金额条的键盘筛选及与环图的筛选联动、切页草稿与趋势选择保留、隐藏页尺寸观察清理、午夜及后台恢复、失败写入与预算输入保留、导入恢复后的历史刷新。

布局回归覆盖 320、393、430、768、1024 和 1440 像素视口；新脚本在六种宽度下分别检查默认、深色、减少动画、长名称、大金额、空账本、200% 根字体以及组合压力场景。根字体放大是自动布局验证，不能代替 Android 系统字体缩放或浏览器真实缩放的手工检查。自动截图保存到 `test-results/screenshots/`，该目录被 Git 忽略；执行测试不会覆盖用于项目展示的 `docs/screenshots/`。

[`tests/view-models.test.ts`](../tests/view-models.test.ts) 使用冻结输入检查展示查询不修改账本，并覆盖收支和转账口径、筛选、稳定排序、闰日及日/周/月/年区间。[`tests/current-date.test.ts`](../tests/current-date.test.ts) 使用注入时钟检查懒订阅、共享定时、午夜、焦点及可见性恢复、最后退订清理和无 DOM 的服务端渲染。

统计页趋势选中金额另有 320px、200% 字体回归，分别使用系统字体与等宽字体检查完整金额及卡片边界，避免 Windows 与 Linux 字体宽度差异掩盖溢出。构建后可单独执行 `node tests/refactor-layout.cjs --trend-overflow-only`。布局矩阵失败时保存当前页面截图；CI 将浏览器测试产物上传为 `Bill-browser-failure`，保留 7 天。

### 格式与空白检查

```powershell
npm run format:check
git diff --check
```

`format` 与 `format:check` 均显式包含 `tests/refactor-layout.cjs`，保证新回归脚本持续接受格式检查。全量格式检查若发现已有文件问题，应记录具体文件；只格式化当前修改范围，避免顺带改写无关文件。可用已安装的 Prettier 对本次集成文件单独检查：

```powershell
node node_modules/prettier/bin/prettier.cjs --check package.json tests/ui-layout.cjs docs/architecture.md docs/testing.md tests/refactor-layout.cjs
```

### Android 数据库测试

前端构建完成后执行：

```bash
cd android
./gradlew testDebugUnitTest
```

Windows 使用 `gradlew.bat testDebugUnitTest`。测试代码见 [`BillDatabaseTest.java`](../android/app/src/test/java/com/jizhang/repaired/BillDatabaseTest.java)。Gradle 构建会将前端资源及 SQL 迁移同步到生成的 assets 目录。

工具链配置完整时，可从项目根目录同时验证单元测试和调试 APK 构建：

```powershell
.\android\gradlew.bat -p android --no-daemon testDebugUnitTest assembleDebug
```

仅有 Java 不足以执行 Android 验证；还需通过 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或 `android/local.properties` 中的 `sdk.dir` 配置 SDK。SDK 未配置时应明确记录上述命令未执行、Robolectric 与 APK 均未验证，不以浏览器通过替代。APK 构建通过也不证明真机行为已验证。

## CI 与验证边界

[`ci.yml`](../.github/workflows/ci.yml) 在 push / pull request 上执行前端检查、格式检查、移动浏览器回归、Android 单元测试和调试 APK 构建。正式签名由[手动工作流](../.github/workflows/release.yml)使用外部 secrets 完成，不把私钥写入仓库。

浏览器测试不能证明真实 Android 文件选择器、WebView 生命周期或覆盖升级全部正常；Robolectric 也不能替代真机验证。发布前应在保留备份的设备上检查旧版覆盖升级、重启后数据、系统文件导入导出、字体缩放、深色模式和窄屏显示。

测试日志、报告、APK、数据库文件与账本备份不提交到 Git。自动测试通过也不等于已经测得实机启动时间、帧率或跨机器 APK 字节完全一致。
