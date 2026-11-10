# 项目总览

- 名称：Nginx日志可视化分析；界面品牌：LogScope。
- ID：nginx-logscope；版本：0.1.0；运行时：顶箭 Node 24+。
- React 18、TypeScript、Vite、Lucide、ECharts；SQLite 使用平台内置 node:sqlite。

## 功能与结构

- `src/app/`：中文工作台、总览、检索、导入管理、基础设置及样式。
- `src/components/Chart.tsx`：图表生命周期、缩放和点击事件。
- `src/features/search/DateTimeInput.tsx`：一体式自绘日历弹窗，年月切换、日期网格、时分秒滚动列及清除/今天/确定。
- `src/features/search/TimeRangeFields.tsx`：时间草稿输入、显式应用、校验和待应用提示。
- `src/analytics/timeRange.ts`：起止时间校验、结束精度到排他上界转换。
- `src/features/datasets/names.ts`：新导入名称顺延、旧同名记录统一展示标签，不修改已有数据。
- `src/features/import/ImportDialog.tsx`：导入预览、解析方式选择、自定义 log_format 与样本验证。
- `src/parsers/timings.ts`：严格单值耗时、多值上游耗时、无标签列表分组及详情格式化。
- `src/parsers/adaptive.ts`：自动路由 Combined/键值/JSON，字段别名归一化及 log_format 分隔符编译器。
- `src/parsers/`：Combined/单用户扩展/中文键值词法解析、严格时间解析、分块 UTF-8 和 gzip 解压。
- `src/workers/log.worker.ts`：多文件导入、批量持久化、取消与回滚、分页查询和统计。
- `src/analytics/query.ts`：筛选、聚合、Top 10、时间桶补零和跨度保护。
- `src/storage/db.ts`：带本机会话凭证的存储接口客户端；不再使用 IndexedDB。
- `scripts/prepare-release.mjs`：生成白名单发布目录 `_release/LogScope`，排除开发资料与数据。
- `LICENSES/`：前端运行库的原始许可证和版权声明，随包交付。
- `scripts/verify-package.mjs`：不依赖开发包的独立运行包测试，只复制正式文件后启动验证。
- `server.mjs`：本地静态资源、健康检查、SQLite 存取、来源校验和中断恢复。
- `src/tests/`：解析/统计与服务集成测试；`scripts/generate.mjs`：独立测试日志生成器。
- `examples/combined.txt`：测试样例，不自动进入用户数据集。
- `public/`：正式生产构建输出，随 Git 与顶箭运行包保留；根目录 `manifest.json` 为平台入口。

## 数据流与约束

文件经 File API 交给 Worker，2MB 分块读取，gzip 流式解压；每 2000 条或约 4MB 文本批次保存到本机 SQLite。多文件行号累计，行内保留来源文件名。每次扫描 2000 条，在 Worker 中筛选统计，只将统计和当前页发给 UI。

运行数据仅位于 TOPARROW_DATA_DIR；端口来自 TOPARROW_APP_PORT，仅绑定 127.0.0.1。前端无第三方请求和外部资源。持久化从 IndexedDB 调整为 SQLite 是用户确认的平台适配方案。服务不解析日志、不计算分析指标。

完成 Phase 1，额外包含用户明确要求的多文件与 gzip。已支持四项耗时解析和平均总耗时；耗时分位数、爬虫、异常识别和导出尚未实现；Windows/百万行尚未实测。

耗时字段（秒）：requestTime/upstreamResponseTime/upstreamConnectTime/upstreamHeaderTime，缺失为 null，旧记录 undefined 兼容。中文键值按字段名识别；无标签后缀固定总耗时/响应/连接/首包顺序，支持一项或四项，不猜测任意顺序。原文和 SQLite JSON 存储格式保留兼容，无需数据库迁移。

自适应入口为 createParser(config)，Worker 每次导入编译一次，预览复用同一实现。自动模式逐行检测，支持混合格式；配置模式以 Nginx 变量名映射，额外变量跳过。模板使用字面量分隔符扫描，不执行输入代码、不生成用户正则；字段缺失/冲突/含混配置拒绝。预览最多前 10 文件、每文件 3 条；确认后才写正式数据。Dataset.parserConfig 保存规则，下次默认复用最近成功导入配置，旧记录兼容自动模式。

上游耗时字段类型改为 number|string|null：单值保留秒数，列表保存完整字符串及逗号/冒号分组，缺失为 null。总耗时仍为单数值；旧数据库无需迁移。键值词法读取多值直到下个 key=，无标签格式合并逗号/冒号连接项；模板空格分隔时跳过列表内部空格。详情逐项显示毫秒，不聚合上游列表，不改变平均请求耗时语义。

时间筛选使用输入草稿与已应用 Filters 分离；点击应用/回车从原生 input.value 读取，防止控件值未触发 React change 时误用旧状态。起点包含，终点按输入精度转换为排他上界（整分钟/秒/毫秒），非法/反向范围拒绝。Worker 每次查询创建一次 matcher；重置、打开数据集和导入成功同步清空输入。图表钻取继续直接设置已应用范围。

时间控件使用自绘日历弹窗，不依赖平台原生时间选择器。筛选栏只保留单行触发框；弹窗内有年月选择、月切换、日期网格、时分秒滚动列、今天/清除/确定。面板草稿点击确定才同步外层，应用时间后查询。开始默认 00:00:00，结束默认 23:59:59。弹窗通过 Portal 挂在 shell 继承主题，固定定位并限制视口边界，支持点击外部和 Escape 关闭；旧时间筛选边界与重置语义不变。

安装包修复：服务静态根目录与 Vite outDir 统一为 public；publicDir:false 避免 Vite 输入输出互相拷贝。此前 dist 被 .gitignore 排除、用户安装包缺此目录导致 ENOENT；public 资源纳入版本管理，安装后无需 node_modules 或构建。缺 index 时健康检查 503、首页友好提示，未知静态文件 404。运行数据目录仍独立，不修改 manifest id。

同名处理：预览允许自定义数据集名，默认重名顺延为“原名（2）”等；Worker 导入开始时重新读取列表并分配可用名。数据仍按 UUID 隔离，不因同名覆盖或合并。已有同名记录按 created/id 排序，加导入时间与第几次标签，同一 helper 用于下拉框、当前数据集、导入记录及报告。旧数据无需迁移，原始 source 文件名不变；文件内容是否相同不凭名称判断。

市场交付使用 `_release/LogScope`（生成物不入 Git），只含 manifest、server、public、LICENSES 和使用说明，源码/AGENTS/_doc/测试样例/.git 不进入包。服务将平台端口先校验到独立变量，再以 server.listen(port, '127.0.0.1') 明确绑定；无局域网功能、不声明 network.lan。发布清理已删除项目 data 的开发导入记录和旧 dist，实际运行自动在平台目录创建空库。

图标发布修复（2026-11-03）：根目录 icon.png 与 manifest.ui.icon=icon.png 必须随发布包提供，不能只在表单上传。prepare-release 白名单包含 icon.png，并校验 PNG 签名、512×512 和 200KB 上限；verify-package 也验证包内相对路径和规格。目前发布目录共 21 文件、932093 字节。
