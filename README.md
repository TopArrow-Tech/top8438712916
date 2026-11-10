# Nginx日志可视化分析 · LogScope

<!-- toparrow-author -->
**Author:** [栈外手记](https://www.toparrow.top/web/publisher/%E6%A0%88%E5%A4%96%E6%89%8B%E8%AE%B0)

[This version on TopArrow](https://www.toparrow.top/web/version/top8438712916-8ot3hz)
<!-- /toparrow-author -->


在本机顶箭运行的中文 Nginx 日志分析工具。日志不会发送至第三方。

## 已实现

- 导入前预览识别结果：自动检测 Combined、中英文键值和 JSON Lines；自定义格式可粘贴完整 Nginx log_format，配置随数据集保留并在下次导入复用。
- 点击或拖拽导入 `.log`、`.txt`、`.gz`；多文件联合为一个数据集，保留文件名及原始日志。
- Worker 流式解压、2MB 分块解码、批量保存、进度反馈、取消与错误报告。
- 自动识别标准 Combined、单用户字段扩展和中文键值格式，正确处理时区、IPv6、499、转义引号与查询参数。
- 总请求数、独立 IP、4xx/5xx 请求、响应字节量、状态码分布、Top 10 IP/路径、请求趋势。
- 图表钻取、时间/IP/方法/路径/状态码/UA/关键词组合检索、时间排序、50 条分页、原文详情和复制。
- 数据集切换、删除、重启保留；深浅主题。

## 顶箭启动与构建

由顶箭提供 Node 24+。开发时依照 `_doc/aicode/rules/runtime.md` 找到平台 Node，确保命令中的 `node`、`npm` 使用该运行时；无需安装其他数据库或原生模块。

```sh
npm ci
npm run build
```

之后在顶箭「我的发布」点击「打开」。`manifest.json` 指向 `server.mjs`，健康检查为 `/__health`。必须提供平台注入的 `TOPARROW_DATA_DIR` 和 `TOPARROW_APP_PORT`，应用仅监听 `127.0.0.1`，不内置路径、端口或运行时程序。

源码开发：先用上述平台环境启动 `npm start`，再在另一终端保留同一个 `TOPARROW_APP_PORT` 执行 `npm run dev`；Vite 将 `/api` 转发到本机服务。生产打开不依赖 Vite。

所有 JS、CSS、图标和图表库均打包为本地资源。正式打包必须包含 `public/`、`server.mjs`、`manifest.json`；`data/`、`node_modules/`、测试产物不作为运行数据交付。

## 存储与隐私

按顶箭约束，以 SQLite 替代原需求中的 IndexedDB。数据库保存在 `TOPARROW_DATA_DIR/logscope.sqlite`（含可能的 WAL/SHM 文件）。服务只进行结构化数据存取，解析、筛选和统计在浏览器 Worker 执行。端口变化不会改变数据位置。

浏览器只接收当前扫描批次和当前页；不会一次性读取完整文件。取消和失败导入会清理部分日志；应用服务重启时回滚未完成的导入。关闭浏览器时正在导入的记录可能保持“导入中”，可在导入记录中删除，或重启服务触发恢复。删除操作清除逻辑记录，SQLite 文件不保证立即缩小。

相同文件重复导入、文件之间重叠的日志均按真实出现次数计数，不自动去重。示例数据不会自动导入或与用户数据混合。

## 测试与示例

```sh
npm test
npm run build
# 设置 TOPARROW_DATA_DIR 后：
npm run generate -- 100000
```

生成器写入数据目录，输出预期请求数、IP 数、字节数和 499 数量，便于独立校验。`examples/combined.txt` 为明确的测试样例。`examples/extended.txt` 是用户提供两种格式的脱敏测试样例。

自动化测试覆盖解析、时区、UTF-8 分块、CRLF、无末尾换行、gzip、取消读取、错误行、组合筛选、精确钻取、时间补零、10 万行统计及本机存储读写/删除/重启恢复。服务测试需要允许绑定本机端口。

## 当前限制

支持 UTF-8 Combined（两个身份字段）及单用户字段变体，末尾可带 1 项 request_time 或 4 项耗时。四项固定顺序为总耗时、上游响应、连接、首包，单位秒；请核对 Nginx log_format 中的实际顺序。也支持样例中的中文键值格式。非负数和 - 分别表示真实耗时与缺失值，0 不会当作缺失；支持逗号或冒号分隔的上游耗时列表，例如 0.223 : 0.136、0.1, - : 0.2；列表保留原顺序与分组，不取首项或擅自求和。总耗时 request_time 仍必须是单值。

总览平均总耗时只统计有 request_time 的日志，显示参与统计条数；明细和详情显示毫秒。可通过 log_format 指定字段顺序和分隔符；不支持相邻无分隔符变量或推断未知数字含义。耗时分位数、爬虫与异常分析、路径归一化、CSV/JSON 导出、存储占用面板和完整保留策略留待后续阶段。未知耗时显示“无数据”。

已在 macOS Chrome 验证 10 万行；尚未验证百万行、任意大小文件或 Windows 实机。代码使用跨平台 Node API，gzip 需要浏览器支持 DecompressionStream。单行上限 8MB，解压后占用可能远大于压缩文件；磁盘不足时会报告失败。精确 IP/路径统计的内存使用随唯一值数量增长，深页检索保留到目标页的候选行，不宣称任意规模性能。

时间按原始偏移转换为时间戳，界面按本机时区显示；时间桶按 UTC 时间戳对齐。超过约 10,000 个桶时自动合并并补零，避免连接缺失时段产生误导。

## 自定义格式如何导入

选择文件后，先看“格式预览”。自动识别失败或字段含义不匹配时，选择“自定义 Nginx log_format”，粘贴服务器配置中的完整 log_format 指令，或只粘贴其格式内容。可点击示例再编辑。确认 IP、时间、请求、状态码、字节和耗时正确后开始导入。

自动模式支持已知 Combined 及扩展、中英文 key=value、逐行 JSON 对象；JSON 属性可用 remote_addr/ip、time_local/time_iso8601/time、request 或 method+uri、status、body_bytes_sent/bytes、request_time 等。时间必须带偏移或使用明确的 $msec。模板中必须定义 IP、时间、请求、状态和字节；支持额外 Nginx 变量但不将其冒充已知指标。

没有字段名、没有格式配置时，不能可靠区分多个长度或耗时数字。内置四耗时顺序只是既有扩展预设，其他顺序请使用 log_format 核对。规则匹配失败的行仍保留错误报告。无法仅凭样本保证任意自定义格式，尤其分隔符本身出现在未转义字段内。预览是有限样本，完整导入可能仍有失败行。

上游多值在请求详情逐项换算为毫秒，并保留逗号、冒号与“无数据”。请求数量每行只计一次，总览平均请求耗时只取 request_time，不把上游各项当作多个请求或累计总耗时。修复后需重新导入原日志才能补入此前失败的记录，已有数据集不会自动修改。

## 运行包检查

正式页面构建输出为 `public/`（不是会被忽略的 `dist/`），已作为运行资源保留在仓库中。Vite 的 publicDir 已关闭，避免将输出目录当作输入目录。修改界面后需重新 `npm run build`，再提交 public 中更新的资源，然后从顶箭重新打包安装。生产运行只需平台 Node，不需要 node_modules 或现场编译。

打包前执行 `npm run check:package`，或用平台 Node 执行 `node --test scripts/verify-package.mjs`。该检查不依赖第三方包，在独立临时目录仅复制 manifest/server/public，核对健康检查、页面、所有 JS/CSS/Worker、本机数据目录及资源缺失场景。当前应用目录无需恢复开发依赖即可执行此检查。检查通过不替代最终顶箭实际安装验收。

## 同名数据集

新导入与已有名称重复时，默认添加“（2）”“（3）”等序号，也可以在预览中自己填写数据集名称。界面提示本次另存，不自动覆盖或合并。历史同名记录在下拉框、当前数据集、导入记录和报告中显示导入时间与次数；同一时刻的记录仍按稳定顺序区分。日志来源文件名和原始日志保持不变。同名不是内容重复的判断依据，不自动做文件内容去重。

## 提交市场的目录

运行 `npm run prepare:release` 或平台 Node `scripts/prepare-release.mjs`，生成 `_release/LogScope/`。在平台打包时选择该目录，避免把源码仓库、Git、开发文档、测试样例或导入记录交付给他人。脚本仅复制 manifest/server/public/LICENSES 和使用说明，并检查数量、体积、路径及敏感文件类型；不会复制 data。以后修改界面请先构建，再重新生成发布目录。

`LICENSES/` 保留实际使用的运行库原始许可及声明。目录生成后，可设置 LOGSCOPE_PACKAGE_DIR 指向该目录，执行 `node --test scripts/verify-package.mjs`；验证运行所需资源、空数据库和回环监听。

应用图标同时需要随包提供：根目录 `icon.png` 为 512×512 PNG、129843 字节，`manifest.json` 中 `ui.icon` 指向 `icon.png`。发布脚本会复制并检查图标，请勿只在发布表单上传而遗漏安装包内文件。
