# 📄 PDF Fill 工具

一个 Python 小工具，用于自动处理 PDF 文件（特别是题目截图）：
*   将每页调整为 A4 大小，内容顶部对齐。
*   添加复杂的双重页码。
*   合并处理时，自动添加书签。

---

## ⚙️ 主要功能

*   **A4适配与对齐**：页面转为A4，内容保留原始宽高比，顶部对齐（约10%边距）。
*   **高级页码**：
    *   左下角：`[ 文件名 页内页码/文件总页数 ]`
    *   右下角：`[ 总文档中页码/总文档总页数 ]`
*   **书签**：合并多个PDF时，以原文件名作为书签。
*   **灵活处理**：支持处理单个文件或整个目录下的PDF，可选择合并输出或单独输出。

---

## 🛠️ 安装和运行

**环境**: Python 3.x

1.  **安装依赖库**:
    ```bash
    pip install pypdf reportlab
    ```
    (如果已有 `setup.sh`，也可直接运行 `./setup.sh`)

2.  **赋予执行权限** (如果通过脚本运行):
    ```bash
    chmod +x pdf_fill.py
    chmod +x run.sh # 如果使用 run.sh
    ```

---

## 🚀 使用指南

基础命令格式: `python3 pdf_fill.py [输入路径] [选项]`
或者使用 `run.sh` 脚本: `./run.sh [输入路径] [选项]`

**输入路径**: 
*   单个 PDF 文件路径 (例如: `mydocs/report.pdf`)
*   包含 PDF 文件的目录路径 (例如: `./PDFS/`)
*   如果省略，默认为 `./PDFS` 目录。

**主要选项**:

*   `-o, --output <输出路径>`:
    *   指定输出文件名 (例如: `-o merged_document.pdf`)。
    *   指定输出目录 (例如: `-o ./processed_files/`)。处理多个文件且不合并时，文件会保存到此目录。
    *   如果省略：
        *   单个输入文件：`./output/原文件名_processed.pdf`
        *   合并多个文件（默认从 `./PDFS` 读取）：`./output/PDFS_merged.pdf`
        *   合并指定目录的文件：`./output/目录名_merged.pdf`
        *   不合并处理目录：文件输出到 `./output/` 下，名为 `原文件名_processed.pdf`

*   `--no-merge`:
    *   如果输入是目录，此选项会让脚本单独处理目录中的每个 PDF 文件，而不是将它们合并。
    *   输出文件将以 `原文件名_processed.pdf` 的格式命名，并存放在指定的输出目录（或 `./output/`）。

---

## 💡 快速示例

1.  **处理 `./PDFS` 目录下所有PDF，合并输出到默认位置**:
    ```bash
    python3 pdf_fill.py 
    # 或 ./run.sh
    ```
    输出: `./output/PDFS_merged.pdf`

2.  **处理指定目录 `MyPapers`，合并并指定输出文件名**:
    ```bash
    python3 pdf_fill.py ./MyPapers -o ./FinalDoc.pdf
    # 或 ./run.sh ./MyPapers -o ./FinalDoc.pdf
    ```
    输出: `./FinalDoc.pdf` (包含来自 `MyPapers` 中所有PDF的内容和书签)

3.  **处理目录 `MyScans`，但不合并，单独输出每个文件到 `OutputScans` 目录**:
    ```bash
    python3 pdf_fill.py ./MyScans --no-merge -o ./OutputScans/
    # 或 ./run.sh ./MyScans --no-merge -o ./OutputScans/
    ```
    输出: `OutputScans/` 目录下会有 `文件名1_processed.pdf`, `文件名2_processed.pdf` 等。

4.  **处理单个文件 `report.pdf` 并指定输出名**:
    ```bash
    python3 pdf_fill.py report.pdf -o processed_report.pdf
    # 或 ./run.sh report.pdf -o processed_report.pdf
    ```

---

## 📝 备注

*   脚本会自动创建输出目录（如果不存在）。
*   文件名中的中文字符在页码中可以正常显示。
*   本工具采用 MIT 许可证。
