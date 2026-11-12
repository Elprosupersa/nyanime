import glob, json, os, re, urllib.parse

workspaces = set()

# Search in transcripts
transcripts = glob.glob(r"C:\Users\gonza\.gemini\antigravity\brain\*\.system_generated\logs\transcript*.jsonl")
for t in transcripts:
    try:
        with open(t, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i > 50:
                    break
                for m in re.finditer(r'"workspaceUris":\s*\[([^\]]+)\]', line):
                    for u in re.finditer(r'"([^"]+)"', m.group(1)):
                        clean_u = urllib.parse.unquote(u.group(1)).replace("file:///", "").replace("file://", "")
                        clean_u = os.path.normpath(clean_u)
                        if os.path.isdir(clean_u):
                            workspaces.add(clean_u)
                for d in re.finditer(r'"DirectoryPath":\s*"([^"]+)"', line):
                    clean_d = os.path.normpath(d.group(1).replace("\\\\", "\\"))
                    if os.path.isdir(clean_d):
                        workspaces.add(clean_d)
                for m in re.finditer(r'"Cwd":\s*"([^"]+)"', line):
                    clean_c = os.path.normpath(m.group(1).replace("\\\\", "\\"))
                    if os.path.isdir(clean_c):
                        workspaces.add(clean_c)
    except Exception:
        pass

# Also look at user's desktop folders
desktop = r"c:\Users\gonza\OneDrive\Escritorio"
if os.path.isdir(desktop):
    for item in os.listdir(desktop):
        p = os.path.join(desktop, item)
        if os.path.isdir(p) and not item.startswith("."):
            workspaces.add(os.path.normpath(p))

# Music folder
music = r"c:\Users\gonza\Music"
if os.path.isdir(music):
    workspaces.add(os.path.normpath(music))
    for item in os.listdir(music):
        p = os.path.join(music, item)
        if os.path.isdir(p) and not item.startswith("."):
            workspaces.add(os.path.normpath(p))

# Let's filter to real projects
ignore = {"node_modules", ".git", ".idea", "__pycache__", "AppData", ".venv", "build", "dist", "logs", "ios", "android", "linux", "macos", "web", "windows", "downloads", "static"}

real_projects = set()
for w in workspaces:
    base = os.path.basename(w)
    if base in ignore:
        continue
    if any(x in w for x in [".system_generated", "AppData", ".gemini"]):
        continue
    if os.path.isdir(w):
        real_projects.add(w)

print("REAL_PROJECTS_FOUND:")
for p in sorted(real_projects):
    print(p)
