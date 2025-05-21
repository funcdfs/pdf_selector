#!/bin/bash

# Activate virtual environment
source venv/bin/activate

# Run the PDF processor with all arguments passed to this script
python pdf_fill.py "$@" 