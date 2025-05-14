将剪贴板中的截图合并为 PDF

<img width="1112" alt="image" src="https://github.com/user-attachments/assets/87d4c924-1a47-48f3-b459-5c555521bb79" />

```
pdfinsert/
├── pdfs/         # 放置源 PDF 文件
├── output/       # 存放处理后的单个 PDF 文件 (自动生成并清理)
├── backup/       # 存放原始 PDF 文件的备份 (自动生成并清理)
├── venv/         # Python 虚拟环境 (建议)
├── pdfinsert.py  # 主程序脚本
├── requirements.txt # 依赖项 (PyPDF2, reportlab)
└── merged_output.pdf # 最终合并的 PDF 文件 
```
