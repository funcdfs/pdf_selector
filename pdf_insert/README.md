# PDF Insert & Merge Tool

一个 Python 脚本，用于自动化处理和合并 PDF 文件。 **注意：脚本默认在每次运行时清理先前生成的 `output/`、`backup/` 目录和 `merged_output.pdf` 文件。**

## 主要功能

1.  **添加边距**: 为源 PDF 的每一页上下添加 1.5cm 的边距。
2.  **添加空白页**: 在添加边距后的每一页后面，添加一个与该页宽度相同的正方形空白页。
3.  **添加页码**: 为所有页面（包括添加的空白页）在右下角添加页码，格式为 `当前原始页码 / 原始总页码`。
4.  **备份**: 自动备份原始 PDF 文件到 `backup/` 目录。
5.  **保留书签**: 保留原始 PDF 的书签结构，并将其应用到 `output/` 中对应的已处理文件。
6.  **输出**: 将处理后的单个 PDF 文件（包含边距、空白页、页码和原始书签）保存到 `output/` 目录。
7.  **合并与层级书签**: (默认模式) 将 `output/` 目录中所有处理过的 PDF 文件，按文件名数字顺序合并成一个最终的 `merged_output.pdf` 文件。在合并文件中创建层级书签：顶层书签是原始文件名（不含扩展名），其下嵌套该 PDF 文件原有的书签结构。

## 项目结构

```
pdfinsert/
├── pdfs/         # 放置源 PDF 文件
├── output/       # 存放处理后的单个 PDF 文件 (自动生成并清理)
├── backup/       # 存放原始 PDF 文件的备份 (自动生成并清理)
├── venv/         # Python 虚拟环境 (建议)
├── pdfinsert.py  # 主程序脚本
├── requirements.txt # 依赖项 (PyPDF2, reportlab)
├── .gitignore    # Git 忽略配置
└── merged_output.pdf # 最终合并的 PDF 文件 (自动生成并清理)
```

## 安装

1.  **克隆或下载项目**

2.  **创建并激活 Python 虚拟环境 (推荐)**:

    ```bash
    # Linux/macOS (bash/zsh)
    python3 -m venv venv
    source venv/bin/activate

    # Linux/macOS (fish)
    python3 -m venv venv
    source venv/bin/activate.fish

    # Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **安装依赖**:

    ```bash
    pip install -r requirements.txt
    ```

## 使用方法

### 默认模式 (处理 `pdfs/` 目录并合并)

1.  将所有需要处理的 PDF 文件放入 `pdfs` 目录。
2.  确保文件名以数字开头以便正确排序合并 (例如 `1-章节一.pdf`, `2_引言.pdf`, `10 Part3.pdf`)。
3.  直接运行脚本：

    ```bash
    python pdfinsert.py
    ```

脚本将**首先自动清理 `output/`, `backup/` 和 `merged_output.pdf`**，然后处理 `pdfs/` 中的文件（添加边距、空白页、页码、保留书签），最后在项目根目录生成包含层级书签的 `merged_output.pdf` 文件。

### 清理所有 (包括源文件)

如果你想在运行前**清空包括 `pdfs/` 目录在内的所有生成文件和备份**，使用 `--clean` 参数：

```bash
python pdfinsert.py --clean
```
**警告：** 这会删除 `pdfs/` 目录下的所有 PDF 文件（除非有 `.gitkeep` 等非 PDF 文件）！

### 处理指定文件/目录 (不合并)

如果你只想处理特定的文件或目录，而不进行最终的合并，可以使用命令行参数。脚本同样会**先执行默认清理** (`output/`, `backup/`, `merged_output.pdf`)。

*   处理单个 PDF 文件:
    ```bash
    python pdfinsert.py /path/to/your/input.pdf
    ```
*   处理多个 PDF 文件:
    ```bash
    python pdfinsert.py file1.pdf file2.pdf
    ```
*   处理指定目录中的所有 PDF 文件:
    ```bash
    python pdfinsert.py /path/to/some/directory
    ```
处理结果（包含边距、空白页、页码、原始书签的独立文件）将保存在 `output` 目录，原始文件备份在 `backup` 目录。**这种方式不会触发合并步骤。**

*   清理并处理指定文件/目录:
    ```bash
    python pdfinsert.py --clean /path/to/your/input.pdf
    ```
    这会先清理所有（包括`pdfs/`），然后处理指定的 `input.pdf`，结果存放在 `output/`。