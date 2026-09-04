# ComfyUI-IAI666-Tools ✨

一个用于批量处理提示词、批量创建任务并逐一生成结果的 ComfyUI 自定义节点集合。

感谢 B 站 UP 主 **AICoser 小姐姐** 原创节点和教学视频

---

## 🌟 功能特性
- **批量提示词节点**：支持批量加载/处理提示词，避免重复操作
- **任务队列管理**：创建多个生成任务，按顺序逐个执行
- **逐一生成结果**：执行时依次生成每张图片，便于调试和结果管理
- **前端界面集成**：提供简洁的 Web 界面，方便查看任务队列和进度

---

## 📦 本次更新（v1.1.0，相较 v1.0.1）

本次更新集中优化 `BatchLoadImages` 的前端图片管理体验，Python 节点接口和工作流连接保持不变。

### ✨ 新增功能

- 新增“粘贴”按钮，可直接读取剪贴板图片并上传
- 支持拖拽缩略图调整顺序，新顺序会同步保存到 `image_list`
- 支持单击缩略图选中图片，并将对应位置同步到 `index`
- 选中图片经过排序或删除后，`index` 会自动跟随调整

### 🎛️ 交互与布局调整

- 工具栏统一为纯文字按钮：上传、选择文件夹、粘贴、单张入队、逐张入队、清空
- “上传”和“选择文件夹”由替换列表改为默认追加，避免覆盖已导入并排好顺序的图片
- 图片网格自动占满节点剩余空间，并随节点宽高变化自适应
- 缩略图改为完整适配显示，避免不同宽高比的图片被裁切
- 工具栏空间不足时自动换行，改善窄节点下的显示效果

### ⚡ 性能优化

- 缩略图启用懒加载和异步解码，降低大量图片同时显示时的资源占用
- 减少上传、粘贴、排序和删除后的重复重绘

### 🔄 兼容性

- 保持 `image_list`、`max_images`、`mode`、`index` 参数及输出接口不变，现有工作流无需重新连线
- 如果安装过独立旧版 `ComfyUI-IAI666-BatchLoadImages`，需将其移出 `custom_nodes`，避免同名节点加载旧界面

---

## 📦 本次更新（v1.0.1 by numibuc144-afk）

### 🔧 修复内容
- **修复 None 值崩溃问题**：`VALIDATE_INPUTS`、`load_images`、`IS_CHANGED` 方法中 `index` 参数为 `None` 时会导致类型比较崩溃（`'<' not supported between instances of 'NoneType' and 'int'`）
- **增强循环节点兼容性**：现在可以与 `comfyui-easy-use` 的 For/While 循环节点完美配合使用

### 🎯 问题场景
当 `BatchLoadImages` 节点放在 For 循环内部时，ComfyUI 在验证阶段会传入 `None` 值给 `index` 参数，导致验证失败，工作流无法运行。

### ✅ 修复方案
在三个方法开头添加 None 值保护：
```python
if index is None:
    index = 0
```

## 📦 包含节点

| 节点名称 | 功能 |
|----------|------|
| **BatchLoadImages** | 批量加载图片，支持按索引逐张输出 |
| **PromptQueue** | 提示词队列，按索引提取提示词 |
| **IAI666_TextList** | 文本列表组合（最多4个输入合并） |
| **IAI666_SplitLines** | 文本按行分割 |

## 🚀 安装方法

### 方法一：手动安装

1. 下载本仓库
2. 将文件夹放入 `ComfyUI/custom_nodes/` 目录
3. 重启 ComfyUI

> 升级提示：如果曾安装独立旧版 `ComfyUI-IAI666-BatchLoadImages`，请先将其移出 `custom_nodes`。新旧插件会注册同名节点，可能导致新版节点仍显示旧界面。

### 方法二：ComfyUI Manager

1. 打开 ComfyUI Manager
2. 搜索 `IAI666-Tools`
3. 点击安装

## 📖 节点说明

### 1. BatchLoadImages（批量加载图片）

从文件名列表中加载图片，支持批量或按索引加载单张。

**输入参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `image_list` | STRING | "" | 图片文件名列表，每行一个 |
| `max_images` | INT | 0 | 最大加载数量（0=不限制） |
| `mode` | batch/single | batch | batch=批量加载，single=按索引加载 |
| `index` | INT | 0 | single模式下加载第几张（从0开始） |

**输出：**

| 输出 | 类型 | 说明 |
|------|------|------|
| `images` | IMAGE | 加载的图片 tensor |
| `filenames` | STRING | 实际加载的图片文件名 |

**使用示例：**

```
image_list:
上架图-6_0001.png
上架图-7_0001.png
上架图-8_0002.png
上架图-9_0001.png

mode: single
index: 0  →  输出上架图-6_0001.png
index: 1  →  输出上架图-7_0001.png
index: 2  →  输出上架图-8_0002.png
index: 3  →  输出上架图-9_0001.png
```

---

### 2. PromptQueue（提示词队列）

从 JSON 数组或上游输入中按索引提取一条提示词。

**输入参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompts_json` | STRING | [] | 提示词 JSON 数组（隐藏参数） |
| `index` | INT | 0 | 提取第几条（从0开始） |
| `prompts` | STRING | (可选) | 上游直接传入提示词列表 |

**输出：**

| 输出 | 类型 | 说明 |
|------|------|------|
| `prompt` | STRING | 当前索引的提示词 |
| `index` | INT | 当前索引 |
| `total` | INT | 提示词总数 |

**使用示例：**

```json
prompts_json: ["a beautiful sunset", "a cute cat", "a mountain landscape"]

index: 0  →  "a beautiful sunset"
index: 1  →  "a cute cat"
index: 2  →  "a mountain landscape"
```

---

### 3. IAI666_TextList（文本列表组合）

将最多 4 个文本输入合并成一个列表。

**输入参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `text1` | STRING | 文本输入1（可选） |
| `text2` | STRING | 文本输入2（可选） |
| `text3` | STRING | 文本输入3（可选） |
| `text4` | STRING | 文本输入4（可选） |

**输出：**

| 输出 | 类型 | 说明 |
|------|------|------|
| `texts` | STRING[] | 合并后的文本列表 |

---

### 4. IAI666_SplitLines（文本分割行）

将一段文本按行分割成列表。

**输入参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `text` | STRING | - | 要分割的文本 |
| `ignore_empty` | BOOLEAN | true | 是否忽略空行 |
| `trim` | BOOLEAN | true | 是否去除首尾空格 |
| `split_escaped_newline` | BOOLEAN | true | 是否把 `\n` 当作换行 |
| `split_html_br` | BOOLEAN | true | 是否把 `<br>` 当作换行 |

**输出：**

| 输出 | 类型 | 说明 |
|------|------|------|
| `texts` | STRING[] | 分割后的文本列表 |

## 🔗 典型工作流

### 批量循环处理图片

```
ForLoopStart(总量=4)
    ↓
BatchLoadImages(mode=single, index=循环索引)
    ↓
Image Save
    ↓
ForLoopEnd
```

### 批量循环处理提示词

```
SplitLines(提示词列表)
    ↓
PromptQueue(index=循环索引)
    ↓
KSampler(生成图片)
    ↓
ForLoopEnd
```

## ⚠️ 注意事项

1. **图片文件名**：`image_list` 中的文件名需要是 ComfyUI 能识别的路径（通常是 `input/` 目录下的相对路径）
2. **索引从0开始**：所有 `index` 参数都是从 0 开始计数
3. **循环节点兼容**：本节点支持与 `comfyui-easy-use` 的 For/While 循环节点配合使用

## 📝 更新日志

### v1.0.1（by numibuc144-afk）
- 修复 `VALIDATE_INPUTS`、`load_images`、`IS_CHANGED` 方法中 `index` 参数为 `None` 时的崩溃问题
- 增强循环节点兼容性，支持与 `comfyui-easy-use` 的 For/While 循环节点配合使用

### v1.0.0（原版 by AICoser 小姐姐）
- 初始版本
- 支持 BatchLoadImages、PromptQueue、TextList、SplitLines 四个节点

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🙏 致谢

- 感谢 B 站 UP 主 **AICoser 小姐姐** 原创节点和教学视频
- 感谢 ComfyUI 社区的支持！
