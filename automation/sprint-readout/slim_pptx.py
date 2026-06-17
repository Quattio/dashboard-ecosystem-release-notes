"""Slim a python-pptx output to remove unused slide layouts.

python-pptx adds 11 default slide layouts (~15KB extra). For a deck that uses
just one layout (Blank/Title-only), you can strip the rest and shrink the file
~50%. Important if you need to keep the file under 20KB for upload-tool limits.

Usage:
    python3 slim_pptx.py <input.pptx> <output.pptx>

The script auto-detects which slideLayoutN.xml is referenced by the slides via
the slide rels, and keeps only that one. Falls back to keeping slideLayout7.xml
(Title Only) if detection fails.
"""
import sys, zipfile, re

def slim(src, dst):
    with zipfile.ZipFile(src, 'r') as zin:
        entries = {n: zin.read(n) for n in zin.namelist()}

    # Auto-detect which slideLayout the slides actually use
    used_layouts = set()
    for n in entries:
        if n.startswith('ppt/slides/_rels/') and n.endswith('.xml.rels'):
            for m in re.finditer(r'Target="\.\./slideLayouts/(slideLayout\d+\.xml)"',
                                  entries[n].decode()):
                used_layouts.add(m.group(1))
    if not used_layouts:
        used_layouts = {'slideLayout7.xml'}

    # Find rIds in the master rels that point to a kept layout
    rels_path = 'ppt/slideMasters/_rels/slideMaster1.xml.rels'
    rels_xml = entries[rels_path].decode()
    keep_rids = set()
    for m in re.finditer(r'<Relationship Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml):
        rid, target = m.group(1), m.group(2)
        if any(layout in target for layout in used_layouts) or 'slideLayout' not in target:
            keep_rids.add(rid)

    def filter_rel(m):
        rid = re.search(r'Id="([^"]+)"', m.group(0)).group(1)
        return m.group(0) if rid in keep_rids else ''
    entries[rels_path] = re.sub(r'<Relationship\s[^/]*?/>', filter_rel, rels_xml).encode()

    # Strip <p:sldLayoutId .../> entries with rIds not in keep_rids
    master_xml = entries['ppt/slideMasters/slideMaster1.xml'].decode()
    def filter_layoutid(m):
        rid_m = re.search(r'r:id="([^"]+)"', m.group(0))
        return m.group(0) if rid_m and rid_m.group(1) in keep_rids else ''
    # Mandatory space after sldLayoutId to avoid matching sldLayoutIdLst itself
    master_xml = re.sub(r'<p:sldLayoutId\s[^/]*?/>', filter_layoutid, master_xml)
    entries['ppt/slideMasters/slideMaster1.xml'] = master_xml.encode()

    # Drop layout files + their rels
    for n in list(entries):
        if 'slideLayouts/' in n and not any(layout in n for layout in used_layouts):
            del entries[n]

    # Drop Override entries for removed layouts in [Content_Types].xml
    ct_xml = entries['[Content_Types].xml'].decode()
    def filter_override(m):
        pn = re.search(r'PartName="([^"]+)"', m.group(0))
        if pn and 'slideLayout' in pn.group(1) and not any(layout in pn.group(1) for layout in used_layouts):
            return ''
        return m.group(0)
    entries['[Content_Types].xml'] = re.sub(r'<Override\s[^/]*?/>', filter_override, ct_xml).encode()

    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
        for n, data in entries.items():
            zout.writestr(n, data)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    slim(src, dst)
    import os
    print(f"slimmed {os.path.getsize(src)} → {os.path.getsize(dst)} bytes")
