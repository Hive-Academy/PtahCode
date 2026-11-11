"""Level 2 composites census. Read-only. Run from the repository root:
    python -I .ptah/specs/TASK_2026_940_eef5/composites-census.py
Scope: git ls-files under apps/ptah-extension-webview/src and libs/frontend.
Templates: .html files and inline `template:` backtick strings in .ts files.
Excluded: *.spec.ts, *.stories.ts, libs/frontend/webview-e2e-harness.
"""
import re, subprocess, bisect
from collections import Counter, defaultdict

files = subprocess.run(
    ["git", "ls-files", "apps/ptah-extension-webview/src", "libs/frontend"],
    capture_output=True, text=True, check=True).stdout.split("\n")
files = [f for f in files if f and "webview-e2e-harness" not in f
         and not f.endswith((".spec.ts", ".stories.ts"))
         and f.endswith((".html", ".ts"))]


def group(path):
    if path.startswith("apps/ptah-extension-webview"):
        return "app"
    if path.startswith("libs/frontend/chat/src/lib/settings/"):
        return "chat-settings"
    return path.split("/")[2]


TAG = re.compile(r"<([A-Za-z][\w:-]*)((?:[^<>\"']|\"[^\"]*\"|'[^']*')*)>", re.S)
CLS = re.compile(r"""(?<![\w\[.-])class\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.S)
TPL = re.compile(r"template:\s*`")

templates = []  # (file, base_line, text)
for f in files:
    src = open(f, encoding="utf-8", errors="replace").read()
    if f.endswith(".html"):
        templates.append((f, 1, src))
        continue
    for m in TPL.finditer(src):
        i = m.end()
        j = i
        while j < len(src):
            if src[j] == "\\":
                j += 2
                continue
            if src[j] == "`":
                break
            j += 1
        templates.append((f, src.count("\n", 0, i) + 1, src[i:j]))

tags = []  # dicts
for f, base, text in templates:
    for m in TAG.finditer(text):
        attrs = m.group(2)
        cm = CLS.search(attrs)
        raw = (cm.group(1) or cm.group(2) or "") if cm else ""
        raw = re.sub(r"\{\{.*?\}\}", " ", raw)
        toks = set(raw.split())
        tags.append(dict(file=f, line=base + text.count("\n", 0, m.start()),
                         name=m.group(1).lower(), attrs=attrs, toks=toks,
                         grp=group(f), ui=f.startswith("libs/frontend/ui/")))


def hasattr_(t, a):
    return re.search(r"(?<![\w-])" + re.escape(a) + r"(?![\w-])", t["attrs"]) is not None


def role(t, r):
    return re.search(r"""role\s*=\s*["']""" + r + r"""["']""", t["attrs"]) is not None


def tk(*names):
    return lambda t: bool(t["toks"] & set(names))


def any_(*fs):
    return lambda t: any(f(t) for f in fs)


def nm(*names):
    return lambda t: t["name"] in names


# composite -> (exact rules dict name->pred, ui-lib selector predicate, variant prefixes)
C = {}
C["dialog/modal"] = dict(
    exact={"class modal-box": tk("modal-box"), "class modal": tk("modal"),
           "role dialog": lambda t: role(t, "dialog") or role(t, "alertdialog"),
           "<dialog>": nm("dialog")},
    ui={"ptah-native-modal": nm("ptah-native-modal")},
    unit=any_(tk("modal-box"), nm("dialog", "ptah-native-modal")),
    prefixes=("modal", "max-w", "w-"), extra={"modal-action": tk("modal-action")})
C["drawer"] = dict(
    exact={"class drawer*": lambda t: any(x.startswith("drawer") for x in t["toks"])},
    ui={"ptah-native-drawer": nm("ptah-native-drawer")},
    unit=nm("ptah-native-drawer"), prefixes=("drawer",))
C["card/panel"] = dict(
    exact={"class card": tk("card"), "class card-body": tk("card-body")},
    ui={"ptah-native-card": nm("ptah-native-card"), "ptah-surface-card": nm("ptah-surface-card"),
        "ptah-surface-tile": nm("ptah-surface-tile"), "ptah-surface-section": nm("ptah-surface-section"),
        "ptah-stat-card": nm("ptah-stat-card"), "ptah-catalog-card": nm("ptah-catalog-card")},
    unit=tk("card"), prefixes=("card", "shadow", "border", "bg-base"))
C["badge/chip/status"] = dict(
    exact={"class badge": tk("badge")},
    ui={"ptah-ui-status-badge": nm("ptah-ui-status-badge"),
        "ptah-file-status-badge": nm("ptah-file-status-badge")},
    unit=tk("badge"), prefixes=("badge",))
C["tabs/segmented"] = dict(
    exact={"class tabs": tk("tabs"), "class tab": tk("tab"), "role tablist": lambda t: role(t, "tablist"),
           "role tab": lambda t: role(t, "tab")},
    ui={"ptah-native-tab-group": nm("ptah-native-tab-group")},
    unit=any_(tk("tabs"), lambda t: role(t, "tablist")),
    prefixes=("tabs", "tab-", "tab"))
C["segmented (join of buttons)"] = dict(
    exact={"class join": tk("join"), "class join-item": tk("join-item")},
    ui={}, unit=tk("join"), prefixes=("join",))
C["menu/dropdown"] = dict(
    exact={"class menu": tk("menu"), "class dropdown": tk("dropdown"),
           "class dropdown-content": tk("dropdown-content"),
           "role menu": lambda t: role(t, "menu"), "role menuitem": lambda t: role(t, "menuitem")},
    ui={"ptah-native-dropdown": nm("ptah-native-dropdown"), "ptah-dropdown": nm("ptah-dropdown")},
    unit=any_(tk("menu"), tk("dropdown-content")), prefixes=("menu", "dropdown"))
C["popover"] = dict(
    exact={"role popover/tooltip": lambda t: hasattr_(t, "popover")},
    ui={"ptah-native-popover": nm("ptah-native-popover"), "ptah-popover": nm("ptah-popover")},
    unit=lambda t: t["name"] in ("ptah-native-popover", "ptah-popover"), prefixes=("popover",))
C["autocomplete/combobox"] = dict(
    exact={"role combobox": lambda t: role(t, "combobox"), "role listbox": lambda t: role(t, "listbox"),
           "autocompleteInput": lambda t: hasattr_(t, "autocompleteInput")},
    ui={"ptah-native-autocomplete": nm("ptah-native-autocomplete"), "ptah-autocomplete": nm("ptah-autocomplete"),
        "ptah-provider-model-picker": nm("ptah-provider-model-picker"),
        "ptah-peer-session-picker": nm("ptah-peer-session-picker")},
    unit=any_(lambda t: role(t, "combobox"), nm("ptah-native-autocomplete", "ptah-autocomplete")),
    prefixes=())
C["alert/banner"] = dict(
    exact={"class alert": tk("alert"), "role alert": lambda t: role(t, "alert"),
           "role status": lambda t: role(t, "status")},
    ui={"ptah-state-panel": nm("ptah-state-panel")},
    unit=tk("alert"), prefixes=("alert",))
C["toast"] = dict(exact={"class toast": tk("toast")}, ui={}, unit=tk("toast"), prefixes=("toast",))
C["table"] = dict(
    exact={"<table>": nm("table"), "class table": tk("table"), "<tr>": nm("tr")},
    ui={}, unit=nm("table"), prefixes=("table",))
C["collapse/accordion"] = dict(
    exact={"class collapse": tk("collapse"), "<details>": nm("details")},
    ui={}, unit=any_(tk("collapse"), nm("details")), prefixes=("collapse",))
C["skeleton/loading"] = dict(
    exact={"class skeleton": tk("skeleton"), "class loading": tk("loading"),
           "animate-pulse": tk("animate-pulse"), "<progress>": nm("progress")},
    ui={"ptah-catalog-card-skeleton": nm("ptah-catalog-card-skeleton")},
    unit=any_(tk("skeleton"), tk("loading"), nm("progress")), prefixes=("skeleton", "loading"))
C["stat/key-value"] = dict(
    exact={"class stat(s)": any_(tk("stat"), tk("stats")), "<dl>": nm("dl"), "<dt>": nm("dt")},
    ui={"ptah-stat-card": nm("ptah-stat-card"), "ptah-meter": nm("ptah-meter")},
    unit=any_(tk("stats"), nm("dl")), prefixes=("stat",))
C["tooltip"] = dict(
    exact={"class tooltip": tk("tooltip"), "ptahTooltip": lambda t: hasattr_(t, "ptahTooltip"),
           "title attr": lambda t: hasattr_(t, "title") or hasattr_(t, "[title]")},
    ui={"ptahTooltip": lambda t: hasattr_(t, "ptahTooltip")},
    unit=any_(tk("tooltip"), lambda t: hasattr_(t, "ptahTooltip")), prefixes=("tooltip",))
C["settings row (label+control)"] = dict(
    exact={"class form-control": tk("form-control"), "class label": tk("label"),
           "class label-text": tk("label-text"), "<fieldset>": nm("fieldset"),
           "<label>": nm("label")},
    ui={"ptah-field": nm("ptah-field"), "ptahSettingsField": lambda t: hasattr_(t, "ptahSettingsField"),
        "ptahSetupField": lambda t: hasattr_(t, "ptahSetupField")},
    unit=tk("form-control"), prefixes=("form-control",))
C["list row"] = dict(
    exact={"ptahListRow": lambda t: hasattr_(t, "ptahListRow"), "ptahInboxRow": lambda t: hasattr_(t, "ptahInboxRow"),
           "<li>": nm("li"), "class list-row": tk("list-row")},
    ui={"ptahListRow": lambda t: hasattr_(t, "ptahListRow"), "ptahInboxRow": lambda t: hasattr_(t, "ptahInboxRow"),
        "ptah-list-detail": nm("ptah-list-detail"), "ptah-inbox-layout": nm("ptah-inbox-layout")},
    unit=nm("li"), prefixes=())
C["page/section header"] = dict(
    exact={"ptah-page-header": nm("ptah-page-header"), "ptah-surface-section": nm("ptah-surface-section"),
           "ptah-toolbar": nm("ptah-toolbar"), "<h1>-<h3>": nm("h1", "h2", "h3")},
    ui={"ptah-page-header": nm("ptah-page-header"), "ptah-surface-section": nm("ptah-surface-section"),
        "ptah-toolbar": nm("ptah-toolbar")},
    unit=nm("h1", "h2", "h3"), prefixes=())
C["divider/avatar/steps"] = dict(
    exact={"class divider": tk("divider"), "class avatar": tk("avatar"), "class steps": tk("steps"),
           "class kbd": tk("kbd"), "class indicator": tk("indicator")},
    ui={}, unit=any_(tk("divider"), tk("avatar"), tk("steps"), tk("kbd")), prefixes=())


def loc(t):
    return f"{t['file']}:{t['line']}"


print("# scope: %d files, %d templates, %d tags" % (len(files), len(templates), len(tags)))
print("# tags outside ui lib: %d" % sum(1 for t in tags if not t["ui"]))

for cname, c in C.items():
    print("\n=== %s ===" % cname)
    for rn, p in c["exact"].items():
        ts = [t for t in tags if p(t)]
        out = [t for t in ts if not t["ui"]]
        print("  exact %-26s all=%-5d outside-ui=%-5d files=%-4d groups=%d" % (
            rn, len(ts), len(out), len({t['file'] for t in out}), len({t['grp'] for t in out})))
    for rn, p in c["ui"].items():
        ts = [t for t in tags if p(t) and not t["ui"]]
        print("  ui-lib use %-26s outside-ui=%-5d files=%-4d groups=%s" % (
            rn, len(ts), len({t['file'] for t in ts}), sorted({t['grp'] for t in ts})))
    unit = [t for t in tags if c["unit"](t)]
    uo = [t for t in unit if not t["ui"]]
    print("  UNIT total=%d outside-ui=%d files=%d groups=%d %s" % (
        len(unit), len(uo), len({t['file'] for t in uo}), len({t['grp'] for t in uo}),
        dict(Counter(t['grp'] for t in uo).most_common(12))))
    for en, ep in c.get("extra", {}).items():
        print("  extra %s outside-ui=%d" % (en, sum(1 for t in tags if ep(t) and not t["ui"])))
    if c["prefixes"]:
        rec = defaultdict(list)
        for t in uo:
            toks = sorted(x for x in t["toks"] if x.startswith(c["prefixes"]) or x in c["prefixes"])
            rec[" ".join(toks) or "(none)"].append(t)
        for r, ts in sorted(rec.items(), key=lambda kv: -len(kv[1]))[:8]:
            print("    %4d  %-60s %s | %s" % (len(ts), r[:60], loc(ts[0]), loc(ts[-1])))
        ind = Counter()
        for t in uo:
            for x in t["toks"]:
                if x.startswith(c["prefixes"][0] + "-"):
                    ind[x] += 1
        print("    tokens:", dict(ind.most_common(14)))

# heuristics ---------------------------------------------------------------
print("\n=== HEURISTICS ===")
EMPTY = re.compile(r">\s*([^<>{}]{0,40}\b(?:No [A-Za-z ]{2,30}|Nothing [a-z ]{2,30}|[A-Za-z ]{0,30}(?:yet|found|available|configured))\b[^<>{}]{0,30}?)\s*<", re.I)
emp = []
for f, base, text in templates:
    if f.startswith("libs/frontend/ui/"):
        continue
    for m in EMPTY.finditer(text):
        s = m.group(1).strip()
        if re.match(r"^(No [A-Za-z ]+|Nothing [a-z ]+|[A-Za-z ]+ (yet|found|available|configured))[.!]?$", s) and len(s) < 70:
            emp.append((f, base + text.count("\n", 0, m.start()), s))
print("empty-state text nodes outside ui (heuristic): %d, files=%d, groups=%d" % (
    len(emp), len({e[0] for e in emp}), len({group(e[0]) for e in emp})))
for e in emp[:3]:
    print("   ", e)
hdr = []
for f, base, text in templates:
    if f.startswith("libs/frontend/ui/"):
        continue
    for m in re.finditer(r"<(div|header|section)\b[^>]*class=\"([^\"]*)\"[^>]*>\s*<(h[1-6]|span)\b", text):
        k = set(m.group(2).split())
        if "justify-between" in k and "items-center" in k and m.group(3).startswith("h"):
            hdr.append((f, base + text.count("\n", 0, m.start())))
print("header row = flex justify-between items-center + h* first child (heuristic): %d, files=%d, groups=%d" % (
    len(hdr), len({h[0] for h in hdr}), len({group(h[0]) for h in hdr})))
for h in hdr[:2]:
    print("   ", h)
rows = [t for t in tags if not t["ui"] and {"flex", "items-center"} <= t["toks"]
        and any(x.startswith("hover:bg-") for x in t["toks"])]
print("clickable-row (flex items-center hover:bg-*) (heuristic): %d, files=%d, groups=%d" % (
    len(rows), len({t['file'] for t in rows}), len({t['grp'] for t in rows})))
for t in rows[:2]:
    print("   ", loc(t))
lab = [t for t in tags if not t["ui"] and t["name"] in ("div", "label") and {"flex", "items-center", "justify-between"} <= t["toks"]]
print("label+control row (div flex items-center justify-between) (heuristic): %d, files=%d, groups=%d" % (
    len(lab), len({t['file'] for t in lab}), len({t['grp'] for t in lab})))
for t in lab[:2]:
    print("   ", loc(t))
for cn in ("alert", "badge", "card", "modal-box"):
    pass

# size sub-areas ------------------------------------------------------------
print("\n=== SUB-AREAS (tags outside ui lib, files with templates) ===")
tc = Counter(t["grp"] for t in tags if not t["ui"])
fc = defaultdict(set)
for t in tags:
    if not t["ui"]:
        fc[t["grp"]].add(t["file"])
for g, n in tc.most_common(14):
    print("  %-22s tags=%-6d files=%d" % (g, n, len(fc[g])))
print("\n=== chat sub-folders ===")
cc = Counter()
for t in tags:
    if t["file"].startswith("libs/frontend/chat/src/lib/") and not t["ui"]:
        cc[t["file"].split("/")[5] if len(t["file"].split("/")) > 6 else "(root)"] += 1
print(dict(cc.most_common(10)))

# private re-implementations -----------------------------------------------
print("\n=== PRIVATE COMPONENTS OUTSIDE ui (selector keyword match; heuristic) ===")
KEY = {"dialog/modal": r"modal|dialog|confirm", "drawer": r"drawer|sheet|sidebar",
       "card/panel": r"card|panel|tile", "badge/chip/status": r"badge|chip|pill|status|tag",
       "tabs": r"tab", "menu/dropdown/popover": r"menu|dropdown|popover|picker|select",
       "autocomplete": r"autocomplete|combobox|search",
       "alert/banner/toast": r"alert|banner|toast|notice|callout",
       "empty/state": r"empty|state|placeholder", "list row": r"row|item|entry",
       "header": r"header|toolbar|title", "skeleton": r"skeleton|loading|spinner"}
SEL = re.compile(r"selector:\s*['\"`]([^'\"`]+)['\"`]")
sels = []
for f in files:
    if f.endswith(".ts") and not f.startswith("libs/frontend/ui/"):
        s = open(f, encoding="utf-8", errors="replace").read()
        if "@Component" in s:
            for m in SEL.finditer(s):
                sels.append((m.group(1), f))
print("total components outside ui: %d" % len(sels))
for k, rx in KEY.items():
    hits = [(s, f) for s, f in sels if re.search(rx, s, re.I)]
    print("  %-24s %3d  groups=%d  e.g. %s" % (k, len(hits), len({group(f) for s, f in hits}),
                                               [h[0] for h in hits[:4]]))
print("\nselectors that match dialog/modal|drawer|card|badge|tab|dropdown|menu|empty|alert|banner:")
for s, f in sels:
    if re.search(r"modal|dialog|drawer|card|badge|tab|dropdown|menu|empty|alert|banner|toast|popover|chip", s, re.I):
        print("   %-48s %s" % (s, f))

# panel-like surface heuristic ------------------------------------------------
print("\n=== PANEL SURFACE HEURISTIC ===")
def panelish(t):
    k = t["toks"]
    return (not t["ui"] and t["name"] in ("div", "section", "article", "aside")
            and any(x.startswith("bg-base-") for x in k) and "border" in k
            and any(x.startswith("rounded") for x in k) and "card" not in k)
ps = [t for t in tags if panelish(t)]
print("div with bg-base-* + border + rounded (no card class) (heuristic): %d, files=%d, groups=%d" % (
    len(ps), len({t['file'] for t in ps}), len({t['grp'] for t in ps})))
print("  ", loc(ps[0]), loc(ps[-1]), dict(Counter(t['grp'] for t in ps).most_common(6)))
chip = [t for t in tags if not t["ui"] and "badge" not in t["toks"] and "rounded-full" in t["toks"]
        and any(x.startswith("px-") for x in t["toks"]) and any(x.startswith("text-") for x in t["toks"])]
print("chip-like without badge class (rounded-full + px-* + text-*) (heuristic): %d, files=%d" % (len(chip), len({t['file'] for t in chip})))
print("  ", loc(chip[0]) if chip else "")
