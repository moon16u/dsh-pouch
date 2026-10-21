# dsh-hooks

[English](./README.md) | **中文**

`@moon16u/dsh-hooks` 执行由配置文件声明的命令钩子。每条定义在显式批准前都不生效，
审批页除完成授权所需的状态操作外全为只读。

## 只读详情与审批

入口：**插件 → 已安装 → 内置插件配置 → 钩子**。

页面按“来自项目/用户/Profile 配置文件”分组。点击项目卡片查看事件列表，展开钩子后
显示命令、匹配器、超时和执行方式；“更多配置”包含来源、执行目录、输出预算、固定内容
文件、环境变量名及定义指纹。

事件内使用紧凑编号行，右侧放配置文件入口、展开按钮和启停开关。展开后优先展示
Hook 类型、命令、匹配器、超时四项；执行方式等其余字段在“更多配置”中，
撤销批准保留在展开区域，不占用折叠列表。

配置文件入口调用宿主的默认应用，不是浏览器所在设备的文件系统；Profile 内联声明
没有文件入口。打开文件不会批准或执行钩子。

状态操作只有批准、启停和撤销批准。点击未批准钩子的药丸开关，会展开四项基本信息和
折叠的“更多配置”，此时尚未启用；点击下方“批准”即批准并启用，不重复展示配置，
不需要勾选，也没有第二次确认。批准前后台校验定义指纹与一次性审批凭据，
来源文件禁用和总开关限制始终有效。批准只对后续匹配事件生效，不会立即执行命令。
页面没有新增、编辑、删除、JSON 编辑或保存入口。

隔离样例截图：[桌面](docs/approval-direct-desktop.png) · [窄屏](docs/approval-direct-mobile.png)。

## 声明与权限

钩子定义只在文件中维护：

- 项目：最近 Git 根目录的 `.dsh/hooks.json`；没有 Git 上级时使用会话目录。
- 用户：`$DSH_HOME/hooks.json`，默认 `~/.dsh/hooks.json`。
- Profile：profile patch 中的 `commandHooks` JSON 字符串。

三类来源累加，任何定义文件都不能授予信任。批准绑定精确定义、实际执行目录和指定的
固定内容文件；定义或文件内容变化后需重新批准。界面只更新宿主的审批与启停账本，
不改写声明文件。账本位于 `$DSH_HOME/workspace-hooks/<profile-hash>.json`，
为私有文件权限；同一 profile 只应由一个 DSH 进程写入。

引擎默认可用，**未经批准的命令不执行**。文件中设置 `commandHooksEnabled: false`
会禁用所有命令，包括已批准的命令；界面只显示该状态，不提供修改入口。

受信任命令以 DSH 系统用户身份运行，没有独立钩子沙箱，也不经过逐次工具审批。
批准前请阅读 [SECURITY.md](SECURITY.md)。除非接受明文存储，不要把密钥写进命令或 `env`。
完整的事件映射、字段、输入输出与错误语义见 [command-hooks.md](docs/command-hooks.md)。

## 安装

以源码方式分发，未发布到 npm。包名为 `@moon16u/dsh-hooks`，
profile 配置 ID 为 `dsh-hooks`。

```bash
dsh plugin --profile web add "link:/path/to/dsh-pouch/packages/dsh-hooks"
```

宿主代码更新后重启 DSH，再刷新页面。已验证 DSH 0.2.1-rc.2、WSL/POSIX 与 Bash；
不保证未经验证的后续宿主版本兼容。无需修改 DSH 宿主本身。

## 测试

```bash
node --test --test-isolation=none test/*.test.mjs
# 复用已安装官方 runtime，仅运行临时无害命令
DSH_RUNTIME_ROOT=/path/to/dsh/node_modules node test/official-runtime.mjs
```

集成脚本使用已安装的官方 subprocess 服务与临时无害命令。其中适配器映射一组仅在
`DSH_HOOK_TEST_FIXTURE` 指向含一个 `.mjs` 适配器与一个 `.sh` 同级的目录时运行，
不假定任何项目路径。默认测试不发起网络请求，也不调用模型。
设计说明与能力边界见 [design.md](docs/design.md)。
