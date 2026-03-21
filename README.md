# LTC(LorebookToolCall) - Early Access

给予制卡预设直接操纵世界书条目的能力。

## 使用方法

将 `https://cdn.jsdelivr.net/gh/MagicalAstrogy/LorebookToolCall/dist/wtc/index.js` 加入酒馆助手全局脚本，启动即可。

注：目前为止验证支持的模型是 Openrouter 渠道的 Gemini 3/3.1 模型。理论上 Openrouter 上其他模型也支持。

注2：目前验证支持的写卡预设有 [明月秋青](https://discord.com/channels/1134557553011998840/1436581369558994974)

## 相关的工作
在类似的领域，其他创作者也同样在为着更顺畅的编写体验而做着努力，你也可以去关注一下他们的项目：
 - 通过MCP 和 CLI 帮助 agent 编写角色卡(@shiyue110) [链接](https://github.com/shiyue137mh-netizen/CharacterCard_Studio)
 - 本地完善的制卡环境 (@青空莉) [链接](https://stagedog.github.io/%E9%9D%92%E7%A9%BA%E8%8E%89/%E5%86%99%E5%8D%A1%E5%BB%BA%E8%AE%AE/)
 - 世界书编辑插件(Lucker) (@funnycups) [链接](https://github.com/funnycups/Luker)

## 安全性说明
这个项目运行中可能会对当前酒馆上下文的任意世界书进行读取/写入。对于读取/写入，均会弹出权限允许框，如果您拒绝，将不会有具体的修改被应用，
也不会使指定的世界书被访问到。但是，由于插件逻辑的特性，我们允许llm在没有取得显式授权的情况下，获取当前酒馆实例的世界书列表。

## 已知问题
部分情况下可能会因为酒馆/Gemini 的原因空回，此时 Swipe 一下即可。

## 构建

0. 请保证环境上已经正确安装好了 Node.js
1. 使用 `git clone` 克隆本项目
2. `corepack enable & corepack prepare yarn@3.4.1 --activate` 配置 yarn。
3. `yarn install` 进行构建，完成后产物将存放在 `artifact` 目录下。

## 贡献指南
如果您想参与本项目，欢迎提交 PR 或者 Issue。对于本项目，我们鼓励贡献者遵守以下原则：
 - 保持代码质量，遵循项目约定的编码规范。具体需要保证运行 `lint` 不出现新的 error 级别错误。妥善配置您的 IDE 可以比较方便地做到这一点。
 - 提供清晰的文档和注释，以便他人理解和维护。具体指关键逻辑/易混淆位置需要有注释说明。如果含较复杂的设计，需要补充文档到 `doc` 目录下。
 - 对于较大的改动，建议先发起讨论，确保方案的可行性。如 Issue 讨论等，src 下变更超过 1000 行的可能会被直接拒绝。
 - 始终补充测试用例，对于新的特性/老的行为变更，始终需要在 test 下补充用例，或是对应地对以往用例进行调整。

如果您是预设制作者，为了适配这个插件，可能需要考虑：
 - 在预设内容中加入针对性使用特定工具的描述。
 - 酌情削减在 Chat History 后的内容。

## 许可证

[Aladdin](LICENSE)

## Special Thanks

开发过程中参考了以下项目，感谢他们之前的工作：
 - https://github.com/StageDog/tavern_helper_template
 - https://github.com/MagicalAstrogy/MagVarUpdate
 - https://github.com/Piebald-AI/claude-code-system-prompts
