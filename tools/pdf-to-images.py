#!/usr/bin/env python3
"""
PDF to Images — Renders PDF pages as PNGs for AI visual analysis.

Usage:
  python tools/pdf-to-images.py "path/to/file.pdf"
  python tools/pdf-to-images.py "path/to/file.pdf" --pages 1-5
  python tools/pdf-to-images.py "path/to/file.pdf" --pages 3
  python tools/pdf-to-images.py "path/to/file.pdf" --out /tmp/pages
  python tools/pdf-to-images.py "path/to/file.pdf" --dpi 200
  python tools/pdf-to-images.py "path/to/file.pdf" --text  (text extraction only, no images)

Output:
  Creates PNG files in an output directory (default: next to the PDF)
  Prints the paths so an agent can read them with the Read tool.

Requires: pip install pymupdf
"""

import sys
import os
import argparse

try:
    import pymupdf
except ImportError:
    print("ERROR: pymupdf not installed. Run: pip install pymupdf")
    sys.exit(1)


def parse_page_range(page_str, max_pages):
    """Parse '1-5' or '3' into a list of 0-indexed page numbers."""
    if not page_str:
        return list(range(max_pages))

    pages = []
    for part in page_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-', 1)
            start = max(1, int(start))
            end = min(max_pages, int(end))
            pages.extend(range(start - 1, end))
        else:
            p = int(part) - 1
            if 0 <= p < max_pages:
                pages.append(p)
    return sorted(set(pages))


def render_pages(pdf_path, out_dir, pages, dpi=150):
    """Render specified pages as PNGs. Returns list of output paths."""
    doc = pymupdf.open(pdf_path)
    total = doc.page_count

    print(f"PDF: {os.path.basename(pdf_path)}")
    print(f"Pages: {total} total, rendering {len(pages)} page(s) at {dpi} DPI")
    print(f"Output: {out_dir}")
    print()

    os.makedirs(out_dir, exist_ok=True)
    output_paths = []

    for i, page_num in enumerate(pages):
        if page_num >= total:
            continue
        page = doc[page_num]
        # Render at specified DPI (default 150 = good balance of quality/size)
        mat = pymupdf.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)

        filename = f"page-{page_num + 1:03d}.png"
        filepath = os.path.join(out_dir, filename)
        pix.save(filepath)

        size_kb = os.path.getsize(filepath) / 1024
        print(f"  [{i+1}/{len(pages)}] Page {page_num + 1} -> {filepath} ({size_kb:.0f} KB)")
        output_paths.append(filepath)

    doc.close()
    return output_paths


def extract_text(pdf_path, pages):
    """Extract text from specified pages."""
    doc = pymupdf.open(pdf_path)
    total = doc.page_count

    print(f"PDF: {os.path.basename(pdf_path)}")
    print(f"Pages: {total} total, extracting text from {len(pages)} page(s)")
    print()

    for page_num in pages:
        if page_num >= total:
            continue
        page = doc[page_num]
        text = page.get_text()
        print(f"--- PAGE {page_num + 1} ---")
        print(text)
        print()

    doc.close()


def main():
    parser = argparse.ArgumentParser(description="Convert PDF pages to PNG images for AI analysis")
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--pages", help="Page range: '1-5', '3', or '1,3,5-8'")
    parser.add_argument("--out", help="Output directory (default: pdf-pages/ next to PDF)")
    parser.add_argument("--dpi", type=int, default=150, help="Resolution (default: 150)")
    parser.add_argument("--text", action="store_true", help="Extract text only, no images")

    args = parser.parse_args()

    if not os.path.exists(args.pdf):
        print(f"ERROR: File not found: {args.pdf}")
        sys.exit(1)

    # Open to get page count
    doc = pymupdf.open(args.pdf)
    total = doc.page_count
    doc.close()

    pages = parse_page_range(args.pages, total)

    if args.text:
        extract_text(args.pdf, pages)
    else:
        out_dir = args.out or os.path.join(os.path.dirname(args.pdf), "pdf-pages")
        paths = render_pages(args.pdf, out_dir, pages, args.dpi)
        print(f"\nDone. {len(paths)} images ready.")
        print("Agent can now read these with the Read tool to see the visual content.")


if __name__ == "__main__":
    main()
