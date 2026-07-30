#!/usr/bin/env python3
# Temporary helper for the Evidence-page inspection workflow — strips tags
# from a fetched HTML file so its visible text is readable in an Action log.
# Not part of the app. Delete alongside the workflow that calls it.
import re
import sys

path = sys.argv[1]
html = open(path, encoding='utf-8', errors='replace').read()
html = re.sub(r'<script.*?</script>', '', html, flags=re.S)
html = re.sub(r'<style.*?</style>', '', html, flags=re.S)
text = re.sub(r'<[^>]+>', '\n', html)
text = re.sub(r'\n\s*\n+', '\n\n', text)
print(text.strip())
