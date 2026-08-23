import re
import sys

with open('AUDIT.md', 'r') as f:
    content = f.read()

# I will just write the replacements directly based on the tasks.
replacements = [
    (r"\| \*\*Fuel / tank movement\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Fuel / tank movement** | **DONE** | \1. (Commit: 60722a9)."),
    (r"\| \*\*Teleport\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Teleport** | **DONE** | \1. (Commit: 60722a9)."),
    (r"\| \*\*Contact trigger / proximity fuse\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Contact trigger / proximity fuse** | **DONE** | \1. (Commit: 3631368)."),
    (r"\| Magnetic / deflector shield \| \*\*DONE\*\* \| (.*?)\.", r"| Magnetic / deflector shield | **DONE** | \1. (Commit: 372fae6)."),
    (r"\| \*\*Selling\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Selling** | **DONE** | \1. (Commit: 263d71c)."),
    (r"\| \*\*Buy quantity / bulk\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Buy quantity / bulk** | **DONE** | \1. (Commit: 263d71c)."),
    (r"\| \*\*Economy reachable in online play\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Economy reachable in online play** | **DONE** | \1. (Commit: 096a381)."),
    (r"\| Multiple rounds \| \*\*DONE\*\* \| (.*?)\.", r"| Multiple rounds | **DONE** | \1. (Commit: fd2f959)."),
    (r"\| Cumulative scoring \| \*\*DONE\*\* \| (.*?)\.", r"| Cumulative scoring | **DONE** | \1. (Commit: fd2f959)."),
    (r"\| \*\*Between-round standings table\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Between-round standings table** | **DONE** | \1. (Commit: fd2f959)."),
    (r"\| Win condition \| \*\*DONE\*\* \| (.*?)\.", r"| Win condition | **DONE** | \1. (Commit: fd2f959)."),
    (r"\| \*\*AI selectable in a game\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **AI selectable in a game** | **DONE** | \1. (Commit: c362a64)."),
    (r"\| \*\*Solo play vs AI\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Solo play vs AI** | **DONE** | \1. (Commit: c362a64)."),
    (r"\| \*\*AI filling empty multiplayer slots\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **AI filling empty multiplayer slots** | **DONE** | \1. (Commit: c362a64)."),
    (r"\| Classic profiles Tosser / Chooser / Spoiler / Unknown \| \*\*DONE\*\* \| (.*?)\.", r"| Classic profiles Tosser / Chooser / Spoiler / Unknown | **DONE** | \1. (Commit: c362a64)."),
    (r"\| Wind readout \| \*\*DONE\*\* \| (.*?)\.", r"| Wind readout | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| \*\*Wind variability setting\*\* (.*?) \| \*\*DONE\*\* \| (.*?)\.", r"| **Wind variability setting** \1 | **DONE** | \2. (Commit: 2fd4a5a)."),
    (r"\| \*\*Gravity setting\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Gravity setting** | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| \*\*Terrain options\*\* (.*?) \| \*\*DONE\*\* \| (.*?)\.", r"| **Terrain options** \1 | **DONE** | \2. (Commit: 2fd4a5a)."),
    (r"\| \*\*Player-count / seat configuration\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Player-count / seat configuration** | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| Trajectory preview \| \*\*DONE\*\* \| (.*?)\.", r"| Trajectory preview | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| Sound \| \*\*DONE\*\* \| (.*?)\.", r"| Sound | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| \*\*Damage numbers\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Damage numbers** | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| \*\*HP bars over tanks\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **HP bars over tanks** | **DONE** | \1. (Commit: 2fd4a5a)."),
    (r"\| \*\*Riot family\*\* (.*?) \| \*\*DONE\*\* \| (.*?)\.", r"| **Riot family** \1 | **DONE** | \2. (Commit: 70ea8af)."),
    (r"\| \*\*Sandhog family\*\* (.*?) \| \*\*DONE\*\* \| (.*?)\.", r"| **Sandhog family** \1 | **DONE** | \2. (Commit: 70ea8af)."),
    (r"\| \*\*LeapFrog\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **LeapFrog** | **DONE** | \1. (Commit: 70ea8af)."),
    (r"\| \*\*Dirt Clod / Dirt Ball / Ton of Dirt\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Dirt Clod / Dirt Ball / Ton of Dirt** | **DONE** | \1. (Commit: 70ea8af)."),
    (r"\| \*\*Earth Disrupter / Plasma Blast / Laser\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Earth Disrupter / Plasma Blast / Laser** | **DONE** | \1. (Commit: 70ea8af)."),
    (r"\| \*\*Smoke Tracer\*\* \| \*\*DONE\*\* \| (.*?)\.", r"| **Smoke Tracer** | **DONE** | \1. (Commit: 70ea8af)."),
    (r"\| Weapon tiering / unlock progression \| \*\*DONE\*\* \| (.*?)\.", r"| Weapon tiering / unlock progression | **DONE** | \1. (Commit: f7c415e)."),
]

for pattern, repl in replacements:
    content = re.sub(pattern, repl, content)

with open('AUDIT.md', 'w') as f:
    f.write(content)

print("Updated AUDIT.md")
