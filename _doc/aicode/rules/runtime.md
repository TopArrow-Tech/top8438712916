# 运行时选型与本机查找

新项目开始、写方案、或需要在本机跑 Node / PHP / Python 时读这份。日常改业务不必重读。

## 怎么选运行时

先定 `manifest.json` 的 `runtime.type`，**不要默认 PHP**。用户指定了用哪种就用哪种。

| 用 | 适合 |
| --- | --- |
| **Node** | 小游戏、Canvas、大量图片/音频/关卡文件、WebSocket。黄金矿工这类游戏用 Node，不要用 PHP。 |
| **PHP** | 管理系统、表单、报表、后台增删改查。 |
| **Python** | 脚本、数据处理、带少量第三方库的本地 HTTP 工具。解释器由平台提供，依赖用应用自己的 `vendor/`。 |
| **Electron** | 需要系统文件对话框、打印、原生窗口等桌面能力。普通网页或小游戏不必上 Electron。 |

PHP 在 Windows 上是串行处理请求的，小游戏首屏要拉很多资源时会卡，这不是调优能绕开的。
纯静态页用十几行 Node 起服务即可。

模板里的 `manifest.json` 是 PHP 写法。Node / Python / Electron 把 `entry.public_dir` 换成 `entry.main`（要执行的 js / py，或 Electron 的应用根）。

## 本机怎么找到顶箭的 Node / PHP / Python / SQLite

系统 PATH 里通常**没有** `node`、`php`、`python`。不要据此判断「没装」或去网上装一份，也不要 `npm install sqlite3` / `better-sqlite3`。
顶箭自带运行时，**不要查 PATH**。

默认安装在 `C:\Program Files\TopArrow\`。用户可以改到别的盘（例如 `D:\TopArrow`），程序目录以本机实际安装位置为准，不要写死 `C:\Program Files`。

按这个顺序找程序根目录（根下才有 `runtime\`、`tactl.exe`、`TopArrow.exe`）：

1. 环境变量 `TOPARROW_RUNTIME_DIR`（应用被顶箭拉起时会注入，它的上一级就是程序根）。
2. 卸载注册表的 `InstallLocation`（安装器写入，改过安装目录也能找到）：
   `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\TopArrow`
   没有再看 `HKCU` 下同名键。值可能带引号，去掉即可。
3. 若顶箭正在运行：进程 `TopArrow.exe` 所在目录就是程序根。
4. 以上都没有，再试默认路径 `C:\Program Files\TopArrow`。

```powershell
$root = $null
if ($env:TOPARROW_RUNTIME_DIR) { $root = Split-Path $env:TOPARROW_RUNTIME_DIR -Parent }
if (-not $root) {
  foreach ($k in @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\TopArrow',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\TopArrow'
  )) {
    $loc = (Get-ItemProperty $k -ErrorAction SilentlyContinue).InstallLocation
    if ($loc) { $root = $loc.Trim('"'); break }
  }
}
if (-not $root) {
  $p = Get-Process TopArrow -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p) { $root = Split-Path $p.Path -Parent }
}
if (-not $root) { $root = 'C:\Program Files\TopArrow' }
$node = Join-Path $root 'runtime\node\node.exe'
```

随后用 `$node`，不要用系统里的 `node`。同级还有 `runtime\php\php.exe`、`runtime\python\python.exe`、`runtime\electron\electron.exe`、`tactl.exe`。自检：`& (Join-Path $root 'tactl.exe') runtime`。

SQLite 已经编进运行时里，不是单独装的软件：

- Node：`require('node:sqlite')` 的 `DatabaseSync`（平台 Node 24，不需要 flag、不需要原生模块）。
- PHP：`pdo_sqlite` / `sqlite3` 扩展已开启。
- Python：标准库 `sqlite3`（平台 Python 3.13）。

探测 Node + SQLite（`$node` 为上面找到的路径）：

```powershell
& $node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(':memory:'); console.log(db.prepare('select sqlite_version() as v').get());"
```

开发期要跑脚本，用找到的 `node.exe` / `php.exe` / `python.exe`。应用真正运行时仍由顶箭拉起并注入 `TOPARROW_*`。
用户数据目录仍在 `%LOCALAPPDATA%\TopArrow\`，与程序装在哪个盘无关。

## Python 额外约定

- **不要带 `python.exe`，不要建 `.venv`。** 解释器只能由平台提供。
- **平台不内置 pip。** 第三方库在开发机上执行 `pip install --target vendor 包名`，把展开后的 site-packages 放进应用根 `vendor/`。不要把原始 `.whl` 丢进去。
- 带原生扩展的包必须是 `cp313` + `win_amd64`（在 Windows 上对着同一套 Python 3.13 打）。别的平台打出来的 wheel，用户机器上 import 会失败。
- 启动由平台拼：`python.exe -X utf8 -B toparrow_bootstrap.py <应用根> <entry.main>`。不要自己设 `PYTHONPATH`。
- 改完 `.py` 后停一下再启动应用即生效；不要引入打包器。
