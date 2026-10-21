# dsh-hooks

[English](./README.md) | **中文**

`@moon16u/dsh-hooks` 2.0.0：执行配置文件声明、经过逐条审批的
DSH 命令钩子。**不再保留独立记忆注入功能，也不提供 GUI 配置编辑器。**

## 只读详情与审批

入口：**插件 → 已安装 → 内置插件配置 → 钩子**。

页面按“来自项目/用户/Profile 配置文件”分组。点击项目卡片查看事件列表，展开钩子后
显示命令、匹配器、超时和执行方式；“更多配置”包含来源、执行目录、输出预算、固定内容
文件、环境变量名及定义指纹。所有配置字段均为只读。

页面支持刷新、打开来源文件、批准、启停和撤销批准。点击未批准钩子的药丸开关，
展开原有四项基本信息和折叠的“更多配置”，此时尚未启用。点击下方“批准”即批准并启用，
不再重复展示配置，不需要勾选，也没有第二次确认。后台仍校验定义指纹和一次性审批凭据，
来源文件及总开关的禁用限制不变。批准后等待下一次匹配事件，不立即执行命令。
没有新增、编辑、删除、JSON 编辑或保存入口。

事件内使用紧凑编号行，右侧放配置文件入口、展开按钮和启停开关。展开后优先展示
Hook 类型、命令、匹配器、超时四项；执行方式等其余字段在“更多配置”中，
撤销批准保留在展开区域，不占用折叠列表。

配置文件入口调用宿主的默认应用，不是浏览器所在设备的文件系统；Profile 内联声明
没有文件入口。打开文件不会批准或执行钩子，不在页面中新增配置编辑器。

隔离样例截图：[桌面](docs/approval-direct-desktop.png) · [窄屏](docs/approval-direct-mobile.png)。

## 声明与权限

钩子定义只在文件中维护：

- 项目：最近 Git 根目录的 `.dsh/hooks.json`；没有 Git 上级时使用会话目录。
- 用户：`$DSH_HOME/hooks.json`，默认 `~/.dsh/hooks.json`。
- Profile：profile patch 中的 `commandHooks` JSON 字符串，兼容已有部署。

三类来源累加。定义文件不能授予信任。批准绑定精确定义、实际执行目录和指定固定内容文件；
定义或文件内容变化后重新审批。界面只更新宿主的审批/启停账本，不改写声明文件。

引擎默认可用，**未经批准的命令不执行**。文件中显式设置 `commandHooksEnabled: false`
仍会禁用所有命令；界面仅显示该状态，不提供修改入口。配置 schema 不再声明可编辑的
volatile 字段。

受信任命令以 DSH 系统用户身份运行，没有独立钩子沙箱，不经过逐次工具审批。
批准前阅读 [SECURITY.md](SECURITY.md)。完整输入输出、字段和事件语义见
[command-hooks.md](docs/command-hooks.md)。

## 从 1.x 升级

移除原有 `coreDir`、`files`、`maxBytes`、记忆 `enabled` 开关及其生命周期/子会话配置；
文件扫描、渲染、独立注入与去重逻辑及相关导出均已删除。既有会话里的历史消息不清除。
记忆加载改由普通命令钩子完成，未批准前没有旧功能兜底。

原有记忆注入改为该项目的 `.dsh/hooks.json` 中一条普通命令钩子，用 `watchFiles`
钉住，初始待审批。该声明及其调用的适配脚本属于项目自身，不是本包的内置行为。

2.0 将引擎总开关缺省值由 false 改为 true，让逐条批准成为激活步骤；显式 false 保留。
已有授权不会被清空：如果其他部署希望旧的已批准钩子继续全部暂停，升级前需在 profile
文件中明确设置 `commandHooksEnabled: false`。2.0 迁移未创建任何授权。

## 安装与测试

以源码方式分发，未发布到 npm。包名为 `@moon16u/dsh-hooks`，
profile 配置 ID 为 `dsh-hooks`。

迁移已有安装时，同步替换 profile dependencies、`dsh.profile.bundles`、
锁文件与安装后的 `link:` 软链。若有 `dsh-core-memory` 配置覆盖，仅把 ID
改为 `dsh-hooks`，保留其配置值。审批账本仍在
`$DSH_HOME/workspace-hooks/<profile-hash>.json`，不要清空或移动。

```bash
dsh plugin --profile web add "link:/path/to/dsh-pouch/packages/dsh-hooks"
node --test --test-isolation=none test/*.test.mjs
# 复用已安装官方 runtime，仅运行临时无害命令
DSH_RUNTIME_ROOT=/path/to/dsh/node_modules node test/official-runtime.mjs
```

宿主代码更新后重启 DSH，再刷新页面。已验证 DSH 0.2.1-rc.2、WSL/POSIX 与 Bash；
不保证未经验证的后续宿主版本兼容。适配器映射仅在设置 `DSH_HOOK_TEST_FIXTURE`
指向含一个 `.mjs` 与一个 `.sh` 的目录时运行，不假定任何项目路径。
验证记录与限制见 [design.md](docs/design.md)。
