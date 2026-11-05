"""Write generator/src/data/blocks.json: every block the game knows, with its properties and their values.

`check` uses it to catch a block state the game would not load (a misspelt name, a property the block does not have,
a value it cannot take), which Minecraft turns into air without a word.

Vanilla blocks come from the game's own report. Make it with the server jar the mod build downloads (any directory
for the output):

    java -DbundlerMainClass=net.minecraft.data.Main -jar ~/.gradle/caches/fabric-loom/26.3/minecraft-server.jar --reports --output <dir>

AgentCraft's blocks come from the mod's blockstate files. Run from the repository root:

    python tools/update-blocks.py <dir>/reports/blocks.json
"""

import glob
import json
import os
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
report = json.load(open(sys.argv[1], encoding="utf-8"))
blocks = {name: entry.get("properties", {}) for name, entry in report.items()}

for path in sorted(glob.glob(f"{root}/mod/src/main/resources/assets/agentcraft/blockstates/*.json")):
    name = "agentcraft:" + os.path.basename(path)[:-5]
    states = json.load(open(path, encoding="utf-8"))
    props = {}
    for key in states.get("variants", {}):
        for pair in filter(None, key.split(",")):
            k, v = pair.split("=")
            props.setdefault(k, set()).add(v)
    for part in states.get("multipart", []):
        when = part.get("when", {})
        for clause in when.get("OR") or when.get("AND") or [when]:
            for k, v in clause.items():
                props.setdefault(k, set()).update(str(v).split("|"))
    blocks[name] = {k: sorted(v) for k, v in props.items()}

out = f"{root}/generator/src/data/blocks.json"
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8", newline="\n") as f:
    json.dump(blocks, f, separators=(",", ":"), sort_keys=True)
    f.write("\n")
print(f"wrote {out}: {len(blocks)} blocks")
