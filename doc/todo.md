# 世界书读写工具

## 目标
提供一组工具调用接口，这组接口可以在推理过程中调用，避免人手动访问。

## 工具样例
下面取了 cc 输出的样例，参考里面的工具定义

reference.json

## 文件系统

-# 下文中的 Lorebook 与 Worldbook 是同义词。

实际上在世界书的概念上不存在文件系统，我们以下面的概念模拟一个文件系统：
`/<LorebookName>/<EntryName>`
对于 LorebookName，限制不能有 `/` 符号，如果一个世界书有这个符号，那么直接忽略它。
对于 EntryName，可以正常有 `/` 符号，且这个符号正常起到文件系统的目录层级作用。具体指在 List/Grep 操作中的路径指定作用。

允许存在 `Folder` `Folder/Content` 为名的两条 Entry。
前者只有在 List `/<LorebookName>` 的场合才能看见， `/<LorebookName>/Folder` 的场合不会输出。

## 提供的工具集合
提供下面的工具：
Glob
Grep
Read
Edit
Write
AskUserQuestion
GetAttribute
SetAttribute

### 文件系统下的操作
#### 世界书相关
所有在 `/` 下的操作，都直接被映射到下面的一组函数中：
 - 列出： getWorldbookNames
 - 创建： createWorldbook
 - 删除： deleteWorldbook

所有在 `/<LorebookName>` 下的操作，都映射到下面的一组函数：
可以通过下面的方式获取到世界书的内容：
```
await loadWorldInfo(worldbook_name).then(
    data => (data! as { entries: { [uid: number]: _OriginalWorldbookEntry & _ImplicitKeys } }) ?? {},
  );
```
对取到的对象 entries 进行 CURD 操作即可进行操作。
写入操作在粘滞5s后进行，具体方法为 `saveWorldInfo`
对于 `_OriginalWorldbookEntry` 类型，其 `comment` 映射到路径+文件名的组合，其 `content` 映射到内容。

其余的 position 等属性作为这个文件的 Attribute，也就是 `GetAttribute` `SetAttribute` 所修改的内容。但是对外的格式需要与 WorldbookEntry 吻合，schema同。





### 安全相关
授权类型共三种：
 - 删授权
 - 写授权
 - 读授权

删授权隐含写授权，写授权隐含读授权。
每个 `/<LorebookName>` 目录有它单独的授权，仅在获得授权后，才能对那个世界书进行对应的操作。

获取授权通过显式弹出 `SillyTavern.callGenericPopup` 框进行。
弹出的内容大致为 `LLM 请求对 '/<LorebookName>‘ 进行 <操作类型> ，是否允许？`
可选项目为：
 - 允许
 - 对 `/<LorebookName>` 目录始终允许
 - 拒绝

选择始终允许后，在当前脚本的一个全局变量中记录，作为之后授权的结果。

### 项目目录结构
main.ts - 所有的入口点
tools/read.ts 单个工具的实现
permission.ts 权限控制

按需要可以分出更多的文件
