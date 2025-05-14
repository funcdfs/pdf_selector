#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
处理流程:
1.  读取原始 PDF (位于 pdfs/ 或命令行指定)，备份至 backup/.
2.  为原始 PDF 的每一页添加 1.5cm 上下边距，生成中间文件。
3.  读取带边距的中间文件，在每一页后面添加一个与该页宽度相同的正方形空白页，生成另一个中间文件。
4.  为所有页面（包括空白页）添加页码 (格式: "当前原始页码 / 原始总页码")，页码位于右下角。
5.  保留原始 PDF 的书签结构，并将其附加到处理后的 PDF 文件中 (位于 output/)。
6.  (默认模式) 将 output/ 目录中所有处理后的 PDF 文件合并到项目根目录的 merged_output.pdf。
7.  (默认模式) 在合并后的 PDF 中创建层级式书签：顶层书签是原始文件名，其下嵌套该 PDF 文件原有的书签结构。

默认行为:
-   若无命令行参数，处理 pdfs/ 目录下的所有 PDF 文件，并执行合并。
-   每次运行脚本时，会自动清理 output/, backup/ 目录及 merged_output.pdf。

命令行参数:
-   `--clean`: 除了默认清理外，还会额外清空 pdfs/ 目录中的 PDF 文件。
-   `[inputs...]`: 可以指定一个或多个 PDF 文件或包含 PDF 的目录。若指定，则只处理这些输入，**不执行合并**。
"""

import os
import sys
import shutil
from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from io import BytesIO
import traceback
import re
import argparse
from typing import Optional, List, Tuple

# --- 常量定义 --- 
PROJECT_DIR = Path(__file__).resolve().parent
INPUT_DIR = PROJECT_DIR / "pdfs"
OUTPUT_DIR = PROJECT_DIR / "output"
BACKUP_DIR = PROJECT_DIR / "backup"
MERGED_FILENAME = "merged_output.pdf"
MERGED_FILE_PATH = PROJECT_DIR / MERGED_FILENAME

CM_TO_POINTS = 28.3464567 # 厘米到 PDF 点的转换因子
MARGIN_CM = 1.5           # 边距大小 (厘米)
TOP_MARGIN_PTS = MARGIN_CM * CM_TO_POINTS
BOTTOM_MARGIN_PTS = MARGIN_CM * CM_TO_POINTS

# --- 清理函数 --- 
def cleanup_generated_files():
    """清空 output/, backup/ 目录以及合并后的 PDF 文件。"""
    print("[*] 清理生成文件 (output/, backup/, merged_output.pdf)...")
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir() # 确保目录存在

    if BACKUP_DIR.exists():
        shutil.rmtree(BACKUP_DIR)
    BACKUP_DIR.mkdir() # 确保目录存在

    if MERGED_FILE_PATH.exists():
        try:
            MERGED_FILE_PATH.unlink()
        except Exception as e:
            print(f"    [!] 警告: 删除 {MERGED_FILENAME} 失败: {e}")

def cleanup_input_files():
    """清空 pdfs/ 目录中的 PDF 文件 (--clean 参数触发)。"""
    print("[*] 清理源文件 pdfs/ (--clean 激活)...")
    if INPUT_DIR.exists():
        deleted_count = 0
        kept_count = 0
        for item in INPUT_DIR.iterdir():
             try:
                 if item.is_dir():
                     shutil.rmtree(item)
                     deleted_count +=1
                 elif item.is_file() and item.suffix.lower() == '.pdf': # 只删除 PDF
                     item.unlink()
                     deleted_count +=1
                 else:
                     kept_count += 1 # 保留其他文件 (如 .gitkeep)
             except Exception as e:
                 print(f"    [!] 警告: 删除 {item.name} 失败: {e}")
        print(f"    -> 清理pdfs/: 已删除 {deleted_count} 个PDF/目录, 保留 {kept_count} 个其他文件.")
    else:
        print(f"    [*] 目录 {INPUT_DIR.relative_to(PROJECT_DIR)}/ 不存在, 跳过清理.")

# --- PDF 处理辅助函数 --- 

# 修改：递归添加嵌套书签的辅助函数
def add_nested_outline(reader, source_items, target_writer, target_parent, page_idx_transform_func):
    """
    递归地将源书签项添加到目标写入器中，作为指定父项的子项。

    Args:
        reader: 源 PdfReader 对象，用于解析页码对象到源索引。
        source_items: 从源 reader 获取的书签项列表 (reader.outline 或 item.children)。
        target_writer: 目标 PdfWriter 对象。
        target_parent: 在 target_writer 中，这些书签应该附加到的父书签项。
        page_idx_transform_func: 一个函数，接收源文件中的0-based页索引，
                                 返回目标写入器中对应的0-based页索引。
    """
    from PyPDF2.generic import OutlineItem # 确保类型检查可用

    for item in source_items:
        try:
            if isinstance(item, list):
                add_nested_outline(reader, item, target_writer, target_parent, page_idx_transform_func)
                continue

            title = item.title
            page_object = item.page

            try:
                 source_page_index = reader.get_page_number(page_object)
            except Exception as page_err:
                 print(f"    [!] 警告: 无法解析书签 '{title}' 的页码对象: {page_err}. 跳过此书签。")
                 continue

            # 使用转换函数计算目标页码
            target_page_index = page_idx_transform_func(source_page_index)

            new_item = target_writer.add_outline_item(
                title,
                target_page_index,
                parent=target_parent
            )

            # 检查子书签 - 确保 children 是可迭代的列表或元组
            if hasattr(item, 'children') and isinstance(item.children, (list, tuple)) and item.children:
                 add_nested_outline(reader, item.children, target_writer, new_item, page_idx_transform_func)

        except AttributeError as ae:
            print(f"    [!] 警告: 处理书签时遇到属性错误 (可能结构不标准): {ae}. 书签内容: {item}")
        except Exception as e:
            print(f"    [!] 警告: 处理书签 '{getattr(item, 'title', '未知标题')}' 时出错: {e}")


def add_page_numbers(input_pdf: Path, 
                     output_pdf: Path, 
                     font_name: str = "Helvetica", 
                     font_size: int = 10, 
                     original_outline_struct: Optional[List] = None, 
                     outline_source_reader: Optional[PdfReader] = None):
    """为PDF添加页码(右下角)，并可选择性地添加调整后的原始书签。
    
    Args:
        input_pdf (Path): 输入的PDF文件路径 (通常是包含边距和空白页的临时文件)。
        output_pdf (Path): 最终输出的文件路径 (位于 output/ 目录)。
        font_name (str): 页码字体名称。
        font_size (int): 页码字体大小。
        original_outline_struct (Optional[List]): 从原始输入PDF读取的书签结构。
        outline_source_reader (Optional[PdfReader]): 用于解析原始书签页码对象的 PdfReader。

    Returns:
        Optional[Path]: 成功时返回 output_pdf 路径，失败时返回 None。
    """
    try:
        reader = PdfReader(str(input_pdf)) # 读取包含边距和空白页的文件
        writer = PdfWriter()
        total_pages_in_temp_file = len(reader.pages)
        original_total_pages = total_pages_in_temp_file // 2
        
        # 页数检查与警告
        if total_pages_in_temp_file % 2 != 0:
             print(f"    [!] 警告: 文件 '{input_pdf.name}' 进行页码编号时发现奇数页 ({total_pages_in_temp_file})。")
             print(f"              这可能表示之前的处理步骤（边距或空白页添加）未完全成功。")
             print(f"              将尝试基于 {original_total_pages} 个原始页进行编号，但总数可能不准确。")
        elif original_total_pages == 0 and total_pages_in_temp_file > 0:
             print(f"    [!] 警告: 页码编号时发现总页数为 {total_pages_in_temp_file} 但计算出的原始页数为 0。")
             original_total_pages = total_pages_in_temp_file // 2

        margin_bottom = 30 # 页码距离底部的边距 (points)
        margin_right = 30  # 页码距离右侧的边距 (points)

        # 添加页码覆盖层
        for i in range(total_pages_in_temp_file):
            page = reader.pages[i]
            current_original_page_num = (i // 2) + 1 # 原始文档中的页码
            page_width = float(page.mediabox.width)
            page_height = float(page.mediabox.height)
            
            packet = BytesIO()
            c = canvas.Canvas(packet, pagesize=(page_width, page_height))
            c.setFont(font_name, font_size)
            page_number_text = f"{current_original_page_num} / {original_total_pages}"
            x_coordinate = page_width - margin_right
            y_coordinate = margin_bottom
            c.drawRightString(x_coordinate, y_coordinate, page_number_text)
            c.save()
            packet.seek(0)
            
            try:
                overlay_reader = PdfReader(packet)
                overlay_page = overlay_reader.pages[0]
                page.merge_page(overlay_page)
            except Exception as e:
                print(f"    [!] 警告: 合并页码失败 (页 {i+1} / 文件 {input_pdf.name}): {e}")
            writer.add_page(page)

        # 添加原始书签（调整后）
        if original_outline_struct and outline_source_reader:
            print(f"    -> 为 {output_pdf.name} 添加处理后的原始书签...")
            # 页面映射函数: 原始0索引 -> 当前写入器中的0索引 (每页后加一页空白，索引*2)
            page_map_func = lambda orig_idx: orig_idx * 2
            add_nested_outline(
                reader=outline_source_reader, 
                source_items=original_outline_struct, 
                target_writer=writer, 
                target_parent=None,   # 添加到根级别
                page_idx_transform_func=page_map_func
            )

        # 写入最终输出文件
        with open(output_pdf, "wb") as fp:
            writer.write(fp)
        return output_pdf # 成功
            
    except Exception as e:
        print(f"[!] 错误: 添加页码或书签时出错 {input_pdf.relative_to(PROJECT_DIR)} -> {output_pdf.relative_to(PROJECT_DIR)}")
        traceback.print_exc()
        try:
            # 尝试复制中间文件作为调试线索
            shutil.copy2(str(input_pdf), str(output_pdf))
            print(f"    [*] 信息: 因页码/书签添加错误，已复制中间文件到输出: {output_pdf.relative_to(PROJECT_DIR)}")
        except Exception as copy_e:
            print(f"[!] 错误: 复制中间文件失败: {copy_e}")
        return None # 失败


def process_pdf(input_file: Path, output_dir: Path, backup_dir: Path) -> Optional[Path]:
    """处理单个PDF文件: 1. 备份 2. 加边距 3. 加空白页 4. 加页码和书签"""
    relative_input_path = input_file.relative_to(PROJECT_DIR) if input_file.is_relative_to(PROJECT_DIR) else input_file
    filename = input_file.name
    output_file = output_dir / filename
    backup_file = backup_dir / filename
    temp_margin_file = output_dir / f"temp_margin_{filename}"
    temp_blank_file = output_dir / f"temp_blank_{filename}"
    
    success = True
    original_input_reader = None

    try:
        # 1. 备份
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(input_file), str(backup_file))
        print(f"[*] 处理: {relative_input_path} -> Backup: {backup_file.relative_to(PROJECT_DIR)}")
        
        # 读取原始文件一次，获取页面和书签
        original_input_reader = PdfReader(str(input_file), strict=False)
        original_outline_structure = original_input_reader.outline
        original_page_count = len(original_input_reader.pages)
        if original_page_count == 0:
             print(f"    [!] 警告: 文件 {filename} 为空，跳过处理。")
             return None # 空文件无法处理

        # 2. 添加边距
        margin_writer = PdfWriter()
        for i in range(original_page_count):
            original_page_for_dims = original_input_reader.pages[i]
            original_width = float(original_page_for_dims.mediabox.width)
            original_height = float(original_page_for_dims.mediabox.height)
            new_height = original_height + TOP_MARGIN_PTS + BOTTOM_MARGIN_PTS

            _temp_writer = PdfWriter()
            new_page_obj = _temp_writer.add_blank_page(original_width, new_height)
            
            # 先合并，再变换
            original_page_to_merge = original_input_reader.pages[i] 
            new_page_obj.merge_page(original_page_to_merge)
            transform = Transformation().translate(tx=0, ty=BOTTOM_MARGIN_PTS)
            new_page_obj.add_transformation(transform)
            margin_writer.add_page(new_page_obj)
        
        output_dir.mkdir(parents=True, exist_ok=True)
        with open(temp_margin_file, "wb") as fp:
            margin_writer.write(fp)
        
        # 3. 添加空白页
        margin_reader = PdfReader(str(temp_margin_file))
        blank_writer = PdfWriter()
        pages_with_margins_count = len(margin_reader.pages)
        if pages_with_margins_count != original_page_count:
             print(f"    [!] 警告: 添加边距后页数不匹配 ({original_page_count} vs {pages_with_margins_count}). 检查 {temp_margin_file.name}")

        for page_with_margin in margin_reader.pages:
            blank_writer.add_page(page_with_margin)
            width = float(page_with_margin.mediabox.width)
            blank_writer.add_blank_page(width, width)
            
        with open(temp_blank_file, "wb") as fp:
            blank_writer.write(fp)

        # 4. 添加页码并将原始书签添加到输出文件
        processed_output_file = add_page_numbers(
            temp_blank_file, 
            output_file, # 直接使用最终输出路径
            original_outline_struct=original_outline_structure, 
            outline_source_reader=original_input_reader
        )
        
        if processed_output_file:
            print(f"[+] 完成: {output_file.relative_to(PROJECT_DIR)}")
            # output_file 变量已被正确设置
        else:
            success = False
            output_file = None # add_page_numbers 失败，确保返回 None
            print(f"[!] 错误: 未能生成最终文件 {output_file.name if output_file else filename}")

    except Exception as e:
        success = False
        print(f"[!] 错误处理 {relative_input_path}: {str(e)}")
        traceback.print_exc()
        try:
            # 尝试复制原始文件作为参考
            output_dir.mkdir(parents=True, exist_ok=True)
            # 检查 output_file 是否因异常而未定义
            dest_path = output_dir / filename
            shutil.copy2(str(input_file), str(dest_path))
            print(f"    [*] 信息: 因错误已复制原始文件到输出: {dest_path.relative_to(PROJECT_DIR)}")
        except Exception as copy_e:
            print(f"[!] 错误: 复制原始文件失败: {copy_e}")
        output_file = None # 确保返回 None
            
    finally:
        # 清理临时文件 (更健壮)
        for temp_file in [temp_margin_file, temp_blank_file]:
            if temp_file.exists():
                try:
                    temp_file.unlink()
                except OSError as e:
                    print(f"    [!] 警告: 清理临时文件 {temp_file.name} 失败: {e}")
                 
    return output_file if success else None


def merge_pdfs_with_bookmarks(output_dir: Path, final_pdf_filename: str = MERGED_FILENAME):
    """将 output_dir 中的所有 PDF 文件合并成一个 PDF 文件,
    并根据原始文件名（按数字排序）添加【层级式】书签：
    文件名作为顶层，其下嵌套该文件【已处理文件自身】的书签结构。
    """
    relative_output_dir = output_dir.relative_to(PROJECT_DIR)
    print(f"\n[*] 开始合并: {relative_output_dir}/")
    
    processed_pdf_files = [f for f in output_dir.glob('*.pdf') 
                           if f.is_file() and not f.name.startswith('temp_')]

    def get_sort_key(pdf_path: Path) -> Tuple[float, str]:
        match = re.match(r"^\s*(\d+)", pdf_path.name)
        if match:
            return (int(match.group(1)), pdf_path.name)
        return (float('inf'), pdf_path.name) 
    processed_pdf_files.sort(key=get_sort_key)
    
    pdf_file_names = [p.name for p in processed_pdf_files]
    if not processed_pdf_files:
        print(f"[!] 警告: 在 {relative_output_dir} 中未找到可合并的 PDF 文件.")
        return

    display_limit = 5
    files_to_merge_display = pdf_file_names[:display_limit]
    if len(pdf_file_names) > display_limit:
        files_to_merge_display.append('...')
    print(f"[*] 合并 {len(processed_pdf_files)} 个文件 (排序后): {files_to_merge_display}")

    merged_writer = PdfWriter()
    current_page_in_merged_pdf = 0 # 0-based index
    total_files_to_merge = len(processed_pdf_files)
    files_merged_count = 0

    for idx, processed_pdf_path in enumerate(processed_pdf_files):
        relative_processed_path = processed_pdf_path.relative_to(PROJECT_DIR)
        
        try:
            print(f"    -> 读取页面和书签 ({idx+1}/{total_files_to_merge}): {relative_processed_path}")
            reader_processed = PdfReader(str(processed_pdf_path), strict=False)
            num_pages = len(reader_processed.pages)
            if num_pages == 0:
                print(f"    [!] 跳过空文件 ({idx+1}/{total_files_to_merge}): {relative_processed_path}")
                continue

            # --- 书签处理逻辑 --- 
            bookmark_title = processed_pdf_path.stem
            parent_bookmark = merged_writer.add_outline_item(
                bookmark_title, 
                current_page_in_merged_pdf # 顶层指向此部分内容的开始页
            )
            processed_outline_data = reader_processed.outline
            if processed_outline_data:
                 print(f"        -> 从处理后文件发现并尝试添加原有书签...")
                 # 页面映射: 在此处理后文件内的页索引 -> 最终合并文件内的页索引
                 page_map_func = lambda idx_in_processed: idx_in_processed + current_page_in_merged_pdf
                 add_nested_outline(
                     reader=reader_processed,       
                     source_items=processed_outline_data, 
                     target_writer=merged_writer,   
                     target_parent=parent_bookmark, 
                     page_idx_transform_func=page_map_func
                 )
            else:
                 # 如果处理后的文件没有书签，可能原始文件就没有，或者add_page_numbers阶段出错
                 print(f"        -> 处理后文件 '{processed_pdf_path.name}' 未包含书签." )
            # --- 书签处理结束 --- 

            # --- 使用 add_page() 逐页添加 --- 
            print(f"        -> 逐页添加 {num_pages} 页内容...")
            for page_num in range(num_pages):
                page = reader_processed.pages[page_num]
                merged_writer.add_page(page)
            # --- 页面添加结束 ---
            
            page_increment = num_pages
            current_page_in_merged_pdf += page_increment 
            files_merged_count += 1
            print(f"    -> ({idx+1}/{total_files_to_merge}) {processed_pdf_path.name} ({page_increment}页) | 下一页偏移: {current_page_in_merged_pdf}")

        except Exception as e:
            print(f"    [!] 错误合并文件 ({idx+1}/{total_files_to_merge}) {relative_processed_path}: {e}")
            traceback.print_exc()

    # --- 写入最终合并的 PDF --- 
    if current_page_in_merged_pdf == 0:
        print("[!] 错误: 没有页面被成功合并. 未创建输出文件.")
        return

    final_pdf_path = PROJECT_DIR / final_pdf_filename
    try:
        relative_final_path = final_pdf_path.relative_to(PROJECT_DIR)
    except ValueError:
        relative_final_path = final_pdf_path

    try:
        with open(final_pdf_path, "wb") as fp:
            merged_writer.write(fp)
        print(f"[+] 合并完成: {relative_final_path} ({files_merged_count}/{total_files_to_merge} 文件, {current_page_in_merged_pdf} 页)")
    except Exception as e:
        print(f"[!] 错误写入最终 PDF {relative_final_path}: {e}")
        traceback.print_exc()

def process_all_pdfs():
    """处理 INPUT_DIR (默认是 pdfs/) 中的所有 PDF 文件。"""
    INPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)
    
    relative_input_dir = INPUT_DIR.relative_to(PROJECT_DIR)
    print(f"[*] 扫描 PDF: {relative_input_dir}/")
    
    pdf_files = list(INPUT_DIR.glob('*.pdf'))
    if not pdf_files:
        print(f"[!] 警告: 在 {relative_input_dir} 未找到 PDF 文件.")
        return
        
    print(f"[*] 发现 {len(pdf_files)} 个 PDF 文件.")
    
    processed_files_count = 0
    failed_files: List[str] = []
    
    for pdf_file in pdf_files:
        output_file_path = process_pdf(pdf_file, OUTPUT_DIR, BACKUP_DIR)
        if output_file_path and output_file_path.exists():
             processed_files_count += 1
        else:
            # 如果 process_pdf 返回 None 或文件不存在，则记录失败
            failed_files.append(pdf_file.name)
            
    print(f"\n[*] 处理结果: {processed_files_count} 成功, {len(failed_files)} 失败.")
    if failed_files:
        print(f"[!] 失败文件列表: {failed_files}")
    
    if processed_files_count > 0:
        merge_pdfs_with_bookmarks(OUTPUT_DIR, MERGED_FILENAME)
    else:
        print("[!] 无成功处理的文件，跳过合并步骤.")

def main():
    parser = argparse.ArgumentParser(description="为PDF添加边距、空白页、页码和层级书签，然后合并。默认清理生成文件。")
    parser.add_argument(
        "--clean", 
        action="store_true", 
        help="清理生成文件和 pdfs/ 目录中的源 PDF 文件。"
    )
    parser.add_argument(
        "inputs", 
        nargs="*", 
        help="可选参数，指定要处理的 PDF 文件或目录路径。若省略，则处理 'pdfs/' 目录。"
    )
    
    args = parser.parse_args()

    # 默认操作: 清理生成文件
    cleanup_generated_files()

    # --clean 选项处理
    if args.clean:
        cleanup_input_files()
        if not args.inputs:
            print("[*] --clean 已执行，无输入参数，退出.")
            sys.exit(0)

    # 处理模式判断
    if args.inputs:
        # 命令行模式 (处理指定输入，不自动合并)
        print("[*] 命令行模式运行 (不自动合并).")
        pdf_files_to_process: List[Path] = []
        for p_str in args.inputs:
            p = Path(p_str)
            if p.is_dir():
                discovered = list(p.glob('*.pdf'))
                print(f"    -> 发现 {len(discovered)} 个 PDF 来自: {p.name}/")
                pdf_files_to_process.extend(discovered)
            elif p.is_file() and p.suffix.lower() == '.pdf':
                 pdf_files_to_process.append(p)
            else:
                 print(f"[!] 警告: 参数 '{p_str}' 不是有效的 PDF 文件或目录, 跳过.")

        if not pdf_files_to_process:
             print("[!] 命令行未指定有效的 PDF 文件或目录.")
             return
             
        print(f"[*] 从命令行处理 {len(pdf_files_to_process)} 个文件.")
        processed_count_cli = 0
        failed_files_cli: List[str] = []
        for pdf_file in pdf_files_to_process:
            if pdf_file.exists(): 
                 output_file_res = process_pdf(pdf_file, OUTPUT_DIR, BACKUP_DIR)
                 if output_file_res: 
                      processed_count_cli += 1
                 else:
                      failed_files_cli.append(pdf_file.name)
            else:
                 print(f"    [*] 信息: 文件 {pdf_file.name} 未找到 (可能已被 --clean 删除或不存在). 跳过.")
        
        print(f"[*] 命令行模式结束. 处理了 {processed_count_cli} 个文件, {len(failed_files_cli)} 个失败.")
        if failed_files_cli:
             print(f"[!] 失败文件列表: {failed_files_cli}")

    else:
        # 默认模式 (处理 'pdfs/' 并合并)
        print("[*] 默认模式运行 (处理 'pdfs/' 并合并).")
        process_all_pdfs()

if __name__ == "__main__":
    main()
