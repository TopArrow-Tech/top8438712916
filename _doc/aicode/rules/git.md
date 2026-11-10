# 本地 git：本机没有时用顶箭自带的

`AGENTS.md` 要求改完就本地提交。本机找不到 `git`，或提交时报缺少用户名、邮箱时读这份。本机 git 能正常提交就不必读。

## 顶箭自带的 git 在哪

系统 PATH 里没有 `git` 时，不要据此跳过提交，也不要去网上下载安装。顶箭自带一份 git（MinGit），位置是：

`<顶箭程序根>\runtime\git\cmd\git.exe`

默认安装时就是 `C:\Program Files\TopArrow\runtime\git\cmd\git.exe`。用户可以装到别的盘（例如 `D:\TopArrow`），以本机实际安装位置为准，不要写死 `C:\Program Files`。

按这个顺序找程序根目录（根下才有 `runtime\`、`tactl.exe`、`TopArrow.exe`）：

1. 环境变量 `TOPARROW_RUNTIME_DIR`（它的上一级就是程序根）。
2. 卸载注册表 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\TopArrow` 的 `InstallLocation`；没有再看 `HKCU` 下同名键。值可能带引号，去掉即可。
3. 若顶箭正在运行：进程 `TopArrow.exe` 所在目录。
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
$git = Join-Path $root 'runtime\git\cmd\git.exe'
& $git --version
```

也可以用 `& (Join-Path $root 'tactl.exe') runtime` 自检，输出里有一行 `git  ok`。

## 怎么用

- 本次任务里的 git 命令都换成 `& $git ...`：`& $git status`、`& $git diff`、`& $git log -5`、`& $git add ...`、`& $git commit -m "..."`、`& $git init`。
- 也可以只在当前终端会话里临时加进 PATH：`$env:Path = (Split-Path $git) + ';' + $env:Path`，之后直接用 `git`。不要改系统或用户级的 PATH 环境变量。
- 这份 git 没带编辑器和分页器。提交一律用 `-m` 写信息，不要用会打开编辑器的命令（例如不带 `-m` 的 `commit`、`rebase -i`）。

## 提交身份（用户名和邮箱）

先在项目根目录看本仓库能不能取到身份：

```powershell
& $git config user.name
& $git config user.email
```

两项都有值就照用，不要改。缺任意一项时，按下面的规则把两项一起补上：

- **用户名**：默认用顶箭用户名。它在 `%LOCALAPPDATA%\TopArrow\platform.sqlite` 的 `settings` 表里：`key = 'account.profile'` 那一行的 `value` 是 JSON，取其中的 `nickname`。
- **没有登录顶箭**（退出登录后这一行的 `value` 是空字符串；也可能没有这一行，或 `nickname` 为空）：用户名用 `TAU` 加 10 位随机数字，例如 `TAU2045491692`。
- **邮箱**：`用户名@users.noreply.toparrow.local`，例如 `zhangsan@users.noreply.toparrow.local`。
  用户名带中文、空格或其他不能进邮箱的字符时（只允许英文字母、数字和 `_` `-`，以及夹在中间的 `.`），`@` 前面改用 `TAU` 加顶箭用户 id（同一段 JSON 里的 `id`）。例如昵称「张三」、id 为 `1234` 时，用户名仍是 `张三`，邮箱是 `TAU1234@users.noreply.toparrow.local`。

只写进本仓库（`--local`），不要动 `--global`、`--system`。写一次就行，以后的提交沿用；随机生成的 `TAU` 名字也靠这一步留住，不要每次提交都重新生成。

`platform.sqlite` 只读打开，不要写。下面用顶箭的 Node 读它（`$root`、`$git` 为上面找到的值，在项目根目录执行）：

```powershell
if (-not (& $git config user.name) -or -not (& $git config user.email)) {
  $node = Join-Path $root 'runtime\node\node.exe'
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $js = @'
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
let name = '';
let id = '';
try {
  const db = new DatabaseSync(path.join(process.env.LOCALAPPDATA, 'TopArrow', 'platform.sqlite'), { readOnly: true });
  const row = db.prepare("select value from settings where key = 'account.profile'").get();
  if (row && row.value) {
    const profile = JSON.parse(row.value);
    name = String(profile.nickname || '').trim();
    id = String(profile.id ?? '').trim();
  }
} catch (e) {}
const random = 'TAU' + Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
if (!name) name = random;
const local = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(name) ? name : (id ? 'TAU' + id : random);
console.log(name);
console.log(local + '@users.noreply.toparrow.local');
'@
  $out = @($js | & $node -)
  & $git config --local user.name $out[0].Trim()
  & $git config --local user.email $out[1].Trim()
}
```
