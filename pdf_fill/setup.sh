#!/bin/bash

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

echo "Setup complete! To use the script, run:"
echo "source venv/bin/activate"
echo "python pdf_fill.py [input] -o [output.pdf]" 