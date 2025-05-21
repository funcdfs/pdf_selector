#!/usr/bin/env python3

import os
import sys
import glob
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from io import BytesIO
import argparse

# 注册字体
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont # 用于加载 TTF 字体

# 定义自定义字体路径和名称
FONT_NAME = "LXGWWenKaiMono"
FONT_PATH = "Font/LXGWWenKaiMono-Regular.ttf" # 相对于脚本的路径

try:
    if os.path.exists(FONT_PATH):
        pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))
    else:
        print(f"[警告] 字体文件未找到: {os.path.abspath(FONT_PATH)}")
        print("[信息] 将尝试回退到 STSong-Light (如果可用)。中文字符可能无法按预期显示。")
        # 尝试回退到 STSong-Light (如果之前注册代码还在，或者 ReportLab 默认包含)
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        try:
            pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
            FONT_NAME = 'STSong-Light' # 更新 FONT_NAME 以便后续使用
            print("[信息] 已回退到 STSong-Light 字体。")
        except Exception as e_stsong:
            print(f"[警告] 未能注册 STSong-Light 作为回退字体: {e_stsong}")
            print("[信息] 页码中文字符可能无法正确显示。")
            FONT_NAME = 'Helvetica' # 最终回退到 Helvetica
            print("[信息] 已最终回退到 Helvetica 字体。")

except Exception as e:
    print(f"[警告] 注册字体 {FONT_NAME} 时发生错误: {e}")
    print("[信息] 将尝试回退到 STSong-Light 或 Helvetica。中文字符可能无法按预期显示。")
    try:
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        FONT_NAME = 'STSong-Light'
        print("[信息] 已回退到 STSong-Light 字体。")
    except:
        FONT_NAME = 'Helvetica' # 最终回退
        print("[信息] 已最终回退到 Helvetica 字体。")


TOP_MARGIN_RATIO = 0.10 # 页面顶部内容预留的边距比例


def resize_and_position_page(page):
    """调整 PDF 页面尺寸：宽度铺满 A4，高度等比缩放，内容顶部对齐（约偏移10%）。"""
    original_width = float(page.mediabox.width)
    original_height = float(page.mediabox.height)
    
    a4_width, a4_height = A4

    # 计算缩放比例：以适应A4宽度，高度等比调整
    scale = a4_width / original_width
    new_height = original_height * scale

    # 计算垂直平移量：使内容顶部留出 TOP_MARGIN_RATIO 的边距
    top_margin = a4_height * TOP_MARGIN_RATIO
    vertical_offset = a4_height - new_height - top_margin

    # 添加变换（先缩放，后平移）
    page.add_transformation(
        Transformation().scale(scale, scale).translate(tx=0, ty=vertical_offset)
    )

    # 设置页面大小为 A4
    page.mediabox.upper_right = (a4_width, a4_height)

    return page


def add_page_numbers(writer, total_global_pages, input_files_metadata=None, single_file_name=None):
    """
    将复杂的页码添加到 writer 对象的每一页。
    格式: [ 原始文件名 文件内页码/文件内总页数 ] [ 全局页码/全局总页数 ]

    参数:
        writer: PdfWriter 对象，包含所有页面。
        total_global_pages: 最终输出的总页数。
        input_files_metadata: 用于合并PDF时。一个元组列表，每个元组为 (原始文件基本名, 该文件的页数)。
                              例如: [("文件A", 10), ("文件B", 5)]
        single_file_name: 用于处理单个PDF时。该PDF文件的基本名。
    """
    
    file_info_iter = None
    current_file_name = None
    current_file_total_pages = 0
    # 追踪当前原始文件在全局页面中的起始索引 (0-based)
    current_original_file_global_start_idx = 0

    if input_files_metadata:  # 合并PDF模式
        if not input_files_metadata: # 正常调用不应发生此情况
            print("[警告] add_page_numbers 在合并模式下被调用，但未提供元数据。")
            return
        file_info_iter = iter(input_files_metadata)
        current_file_name, current_file_total_pages = next(file_info_iter, (None, 0))
    elif single_file_name:  # 单个PDF模式
        current_file_name = single_file_name
        current_file_total_pages = total_global_pages # 对于单个文件，其总页数即为全局总页数
    else:
        print("[警告] add_page_numbers 调用时未获得足够的页码信息。")
        return # 或者可以回退到更简单的页码格式

    for global_page_idx in range(total_global_pages):  # global_page_idx 是 0-indexed
        page_in_original_file = 0

        if input_files_metadata:  # 合并PDF模式：确定当前原始文件及其中的页码
            # 检查 global_page_idx 是否已超过 current_file_name 的页数范围
            while current_file_name is not None and \
                  global_page_idx >= current_original_file_global_start_idx + current_file_total_pages:
                current_original_file_global_start_idx += current_file_total_pages
                current_file_name, current_file_total_pages = next(file_info_iter, (None, 0))
                if current_file_name is None: # 已遍历完所有输入文件的元数据
                    # 如果 total_global_pages 与文件页数总和匹配，理想情况下不应到达此处
                    print(f"[警告] 页码元数据在全局页 {global_page_idx+1} 处耗尽")
                    break
            
            if current_file_name is not None:
                page_in_original_file = (global_page_idx - current_original_file_global_start_idx) + 1
            else: # 如果元数据与 total_global_pages 不符，则进行回退处理
                page_in_original_file = global_page_idx + 1 # 或其他指示符
        
        elif single_file_name:  # 单个PDF模式
            page_in_original_file = global_page_idx + 1
            # current_file_name 和 current_file_total_pages 已设置

        # 构建页码文本的各个部分
        page_text_part1 = ""
        page_text_part2 = f"[ {global_page_idx + 1}/{total_global_pages} ]"

        if not current_file_name or not current_file_total_pages:
            # 如果缺少原始文件信息，则回退到简化页码
            print(f"[警告] 正在为全局页 {global_page_idx + 1} 使用简化页码。")
        else:
            page_text_part1 = f"[ {current_file_name} {page_in_original_file}/{current_file_total_pages} ]"
        
        packet = BytesIO()
        c = canvas.Canvas(packet, pagesize=A4)
        
        base_font_name = FONT_NAME # 使用注册的字体名称
        base_font_size = 10            # 基础字体大小 (原为 8)
        min_font_size_part1 = 7        # 左侧部分页码的最小字体大小 (原为 5)
        
        y_position = 7 * mm 
        left_margin_part1 = 10 * mm # 左侧部分页码的左边距 (从 5mm 增加)
        right_margin_part2 = 5 * mm     # 右侧部分页码的右边距
        gap_between_parts = 5 * mm      # 两部分页码之间的最小期望间隙

        # 第二部分 (右对齐) - 首先计算其属性
        c.setFont(base_font_name, base_font_size)
        text_width_part2 = c.stringWidth(page_text_part2, base_font_name, base_font_size)
        x_position_part2 = A4[0] - text_width_part2 - right_margin_part2
        
        # 第一部分 (左对齐)
        if page_text_part1:
            current_font_size_part1 = base_font_size
            c.setFont(base_font_name, current_font_size_part1)
            text_width_part1 = c.stringWidth(page_text_part1, base_font_name, current_font_size_part1)
            
            # 第一部分允许的最大宽度是到第二部分开始前，减去间隙和其自身的边距
            max_allowed_width_for_part1 = (x_position_part2 - gap_between_parts) - left_margin_part1
            
            # 如果第一部分太宽，则动态减小其字体大小
            while text_width_part1 > max_allowed_width_for_part1 and current_font_size_part1 > min_font_size_part1:
                current_font_size_part1 -= 0.5 # 减小字体大小
                c.setFont(base_font_name, current_font_size_part1)
                text_width_part1 = c.stringWidth(page_text_part1, base_font_name, current_font_size_part1)
            
            if text_width_part1 > max_allowed_width_for_part1 and current_font_size_part1 <= min_font_size_part1:
                print(f"[警告] 页码左侧部分过长，即使已缩小至最小字体 ({min_font_size_part1}pt)，仍可能显示不全或与右侧重叠: '{page_text_part1[:30]}...'")
            
            c.setFont(base_font_name, current_font_size_part1) # 确保设置了正确的字体大小
            c.drawString(left_margin_part1, y_position, page_text_part1)

        # 绘制第二部分 (使用基础字体大小)
        c.setFont(base_font_name, base_font_size)
        c.drawString(x_position_part2, y_position, page_text_part2)
        
        c.save()

        packet.seek(0)
        watermark = PdfReader(packet)
        watermark_page = watermark.pages[0]

        page_to_modify = writer.pages[global_page_idx]
        page_to_modify.merge_page(watermark_page)


def process_pdf(input_path, output_path, add_nums=True):
    """处理单个 PDF 文件。"""
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        modified_page = resize_and_position_page(page)
        writer.add_page(modified_page)

    if add_nums: # 如果需要添加页码
        num_pages = len(reader.pages)
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        add_page_numbers(writer, num_pages, single_file_name=base_name)

    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path


def merge_pdfs(input_files, output_path):
    """合并多个 PDF 文件，添加书签和页码。"""
    writer = PdfWriter()
    total_pages = 0
    page_counts = []
    processed_files = []

    try:
        # 预处理每个 PDF (调整尺寸，但不立即添加页码)
        for pdf_file in input_files:
            tmp_output = f"tmp_{os.path.basename(pdf_file)}"
            process_pdf(pdf_file, tmp_output, add_nums=False) # 不为临时文件添加页码
            processed_files.append(tmp_output)

            reader_temp = PdfReader(tmp_output) # 为清晰起见，使用不同变量名
            page_count = len(reader_temp.pages)
            page_counts.append(page_count)
            total_pages += page_count

        # 合并所有处理后的 PDF
        current_page = 0
        for i, processed_file_path in enumerate(processed_files):
            bookmark_name = os.path.splitext(os.path.basename(input_files[i]))[0]
            writer.add_outline_item(bookmark_name, current_page)

            reader_processed = PdfReader(processed_file_path) # 使用不同变量名
            for page in reader_processed.pages:
                writer.add_page(page)

            current_page += page_counts[i]
            # os.remove(processed_file_path) # 移至 finally 块处理

        # 为最终合并的 PDF 添加页码
        files_metadata = []
        for i, input_file_path in enumerate(input_files):
            base_name = os.path.splitext(os.path.basename(input_file_path))[0]
            num_p = page_counts[i]
            files_metadata.append((base_name, num_p))
        
        add_page_numbers(writer, total_pages, input_files_metadata=files_metadata)

        with open(output_path, "wb") as f:
            writer.write(f)
    finally:
        # 清理临时文件
        for pf_path in processed_files:
            if os.path.exists(pf_path):
                try:
                    os.remove(pf_path)
                except OSError as e:
                    print(f"[警告] 无法删除临时文件 {pf_path}: {e}")


def main():
    parser = argparse.ArgumentParser(description="将 PDF 页面调整为 A4 顶部对齐，添加页码和书签")
    parser.add_argument("input", nargs='?', default="./PDFS", help="输入 PDF 文件或目录（默认 ./PDFS）")
    parser.add_argument("-o", "--output", help="输出文件路径或目录", default=None)
    parser.add_argument("--no-merge", action="store_true", help="不合并，分别处理每个文件")

    args = parser.parse_args()

    if os.path.isdir(args.input):
        input_files = sorted(glob.glob(os.path.join(args.input, "*.pdf")))
        if not input_files:
            print(f"[错误] 在目录 {args.input} 中未找到 PDF 文件")
            return
        print(f"[PDF] 找到 {len(input_files)} 个 PDF 文件")
    else:
        if not os.path.exists(args.input):
            print(f"[错误] 文件 {args.input} 不存在")
            return
        if not args.input.endswith(".pdf"):
            print("[错误] 输入文件必须是 PDF 格式")
            return
        input_files = [args.input]
        print(f"[PDF] 处理单个文件: {args.input}")

    if args.output is None:
        if len(input_files) == 1 and not args.no_merge:
            base_name = os.path.splitext(os.path.basename(input_files[0]))[0]
            output_path = f"./output/{base_name}_processed.pdf"
        else:
            output_path = "./output/"
    else:
        output_path = args.output

    output_dir = os.path.dirname(output_path) if output_path.endswith(".pdf") else output_path
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"[目录] 创建输出目录: {output_dir}")

    if args.no_merge or len(input_files) == 1:
        for input_file in input_files:
            base_name = os.path.splitext(os.path.basename(input_file))[0]
            if output_path.endswith("/"):
                output_file = os.path.join(output_path, f"{base_name}_processed.pdf")
            else:
                output_file = output_path if len(input_files) == 1 else f"{output_path.rstrip('/')}/{base_name}_processed.pdf"

            print(f"[处理中] {os.path.basename(input_file)}")
            process_pdf(input_file, output_file) # 默认 add_nums=True，此处正确
            print(f"[完成] 输出文件: {os.path.basename(output_file)}")
    else:
        if output_path.endswith("/"):
            folder_name = os.path.basename(os.path.normpath(args.input))
            output_file = os.path.join(output_path, f"{folder_name}_merged.pdf")
        else:
            output_file = output_path

        print(f"[处理中] 合并 {len(input_files)} 个文件")
        merge_pdfs(input_files, output_file)
        print(f"[完成] 合并输出文件: {output_file}")
        print(f"[书签] 已添加 {len(input_files)} 个书签")


if __name__ == "__main__":
    main()
