"""Form controls census. Read-only. Run from the repository root:
    python -I .ptah/specs/TASK_2026_940_eef5/form-controls-census.py [section]
Sections: totals, recipes, a11y, ui, excl, pages, all (default).
Scope: git ls-files for apps/ptah-extension-webview/src and libs/frontend,
.html and .ts files, without spec, stories and webview-e2e-harness.
Tags are parsed with a multi-line, quote-aware regex. Counts are static source
occurrences, not rendered repetitions.
"""
import re
import subprocess
import sys
from collections import Counter, defaultdict

SECTION = sys.argv[1] if len(sys.argv) > 1 else "all"

files = subprocess.run(
    ["git", "ls-files", "apps/ptah-extension-webview/src", "libs/frontend"],
    capture_output=True, text=True, check=True).stdout.split("\n")
files = [f for f in files if f.endswith((".html", ".ts"))
         and not f.endswith((".spec.ts", ".stories.ts"))
         and "webview-e2e-harness" not in f]

TAG = re.compile(r'<(input|textarea|select)\b((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', re.S)
ATTR_CLASS = re.compile(r'(?<![\w.\[-])class\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', re.S)
LAYOUT = re.compile(r'^(w-|flex-|mt-|mb-|ml-|mr-|gap-|col-|order-|min-w-|max-w-|self-|justify-|items-|shrink)')
LAYOUT_EXACT = {"grow", "flex", "w-full"}


def group_of(path):
    if path.startswith("apps/ptah-extension-webview"):
        return "app"
    if path.startswith("libs/frontend/chat/src/lib/settings/"):
        return "chat-settings"
    return path.split("/")[2]


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def attr(attrs, name):
    m = re.search(r'(?<![\w.\[-])' + re.escape(name) + r'\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', attrs, re.S)
    if m:
        return m.group(1) if m.group(1) is not None else m.group(2)
    return None


def has(attrs, name):
    return re.search(r'(?<![\w.\-])' + re.escape(name) + r'(?![\w\-])', attrs) is not None


def tokens(cls):
    cls = re.sub(r'\{\{.*?\}\}', ' {{ }} ', cls, flags=re.S)
    return sorted(set(t for t in cls.split() if t))


def kind_of(tag, attrs, toks):
    if tag == "textarea":
        return "textarea"
    if tag == "select":
        return "select"
    t = attr(attrs, "type")
    dyn = re.search(r'\[(attr\.)?type\]', attrs) is not None
    if dyn and t is None:
        return "input:dynamic"
    if t is None:
        return "input:text(no type)"
    return "input:" + t.strip().lower()


def strip_comments(t):
    """Blank block comments and whole-line // comments (keeps line numbers).
    Doc comments mention `<select>` in prose and must not count."""
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    t = re.sub(r"/\*.*?\*/", blank, t, flags=re.S)
    t = re.sub(r"^[ \t]*//[^\n]*", blank, t, flags=re.M)
    return t


def rd(f):
    t = open(f, encoding="utf-8").read()
    return strip_comments(t) if f.endswith(".ts") else t


els = []
for f in files:
    text = rd(f)
    labels_for = bool(re.search(r'<label\b[^>]*(\bfor|\[for\]|\[attr\.for\])\s*=', text))
    for m in TAG.finditer(text):
        tag, attrs = m.group(1), m.group(2)
        cm = ATTR_CLASS.search(attrs)
        cls = (cm.group(1) if cm and cm.group(1) is not None else (cm.group(2) if cm else "")) or ""
        toks = tokens(cls)
        k = kind_of(tag, attrs, toks)
        pre = text[:m.start()]
        open_labels = len(re.findall(r'<label\b', pre)) - len(re.findall(r'</label>', pre))
        # wrapping label only if the last <label opened after the last </label>
        wrapped = pre.rfind('<label') > pre.rfind('</label>')
        wrap_ctx = text[pre.rfind('<label'):m.start()] if wrapped else ""
        els.append(dict(f=f, line=line_of(text, m.start()), tag=tag, attrs=attrs, toks=toks,
                        kind=k, wrapped=wrapped, wrap_ctx=wrap_ctx, labels_for=labels_for,
                        group=group_of(f), end=m.end(), text=text))


def recipe(e):
    return " ".join(t for t in e["toks"] if not (LAYOUT.match(t) or t in LAYOUT_EXACT))


def ex(lst):
    return "; ".join("%s:%d" % (e["f"], e["line"]) for e in lst[:2])


def role(e):
    t = e["kind"]
    c = set(e["toks"])
    if t in ("input:checkbox",):
        return "toggle" if "toggle" in c else ("checkbox" if "checkbox" in c else "checkbox(no class)")
    if t == "input:radio":
        return "radio" if "radio" in c else "radio(no class)"
    return t


def name_info(e):
    a = e["attrs"]
    if has(a, "aria-label") or re.search(r'\[attr\.aria-label\]', a):
        return "aria-label"
    if has(a, "aria-labelledby") or re.search(r'\[attr\.aria-labelledby\]', a):
        return "aria-labelledby"
    if e["wrapped"]:
        return "wrapping label"
    sid = attr(a, "id")
    if sid is not None and sid and "{{" not in sid:
        # static id: need a label with the same static for value
        if re.search(r'for\s*=\s*["\']' + re.escape(sid) + r'["\']', e["text"]):
            return "id+for (approx)"
    elif re.search(r'(?<![\w.\-])(\[(attr\.)?id\])\s*=', a) and e["labels_for"]:
        return "id+for (approx)"  # dynamic id: any label with for in the file
    if has(a, "ptahFieldControl"):
        return "ptahFieldControl (shell)"
    if has(a, "placeholder") or re.search(r'\[(attr\.)?placeholder\]', a):
        return "placeholder only"
    if has(a, "title") or re.search(r'\[attr\.title\]', a):
        return "title only"
    return "none"


NAMED = {"aria-label", "aria-labelledby", "wrapping label", "id+for (approx)", "ptahFieldControl (shell)"}
HIDDEN = {"input:hidden", "input:file", "input:range"}
text_kinds = [e for e in els if e["kind"] not in ("input:checkbox", "input:radio", "input:hidden", "input:file")]


def totals():
    print("## totals; files scanned: %d" % len(files))
    c = Counter(e["kind"] for e in els)
    print("elements total:", len(els), " input:", sum(v for k, v in c.items() if k.startswith("input")),
          " textarea:", c["textarea"], " select:", c["select"])
    for k, v in sorted(c.items(), key=lambda x: -x[1]):
        print("  %-24s %d" % (k, v))
    print("by group (input / textarea / select / total):")
    g = defaultdict(Counter)
    for e in els:
        g[e["group"]]["input" if e["tag"] == "input" else e["tag"]] += 1
    for k, v in sorted(g.items(), key=lambda x: -sum(x[1].values())):
        print("  %-22s %4d / %3d / %3d / %4d" % (k, v["input"], v["textarea"], v["select"], sum(v.values())))
    print("roles (toggle/checkbox/radio by class):")
    r = Counter(role(e) for e in els if e["kind"] in ("input:checkbox", "input:radio"))
    for k, v in r.items():
        print("  %-22s %d" % (k, v))
    # sizes etc
    allc = Counter()
    for e in els:
        for t in e["toks"]:
            allc[t] += 1
    keys = ["input-xs", "input-sm", "input-md", "input-lg", "select-xs", "select-sm", "select-md", "select-lg",
            "textarea-xs", "textarea-sm", "textarea-md", "toggle-xs", "toggle-sm", "toggle-md", "checkbox-xs",
            "checkbox-sm", "checkbox-md", "radio-xs", "radio-sm", "input-bordered", "select-bordered",
            "textarea-bordered", "input-ghost", "select-ghost", "input-error", "input-warning", "input-primary",
            "input-success", "input-info", "select-error", "textarea-error", "toggle-primary", "checkbox-primary",
            "font-mono", "text-xs", "text-sm", "bg-surface-0", "border-surface-border", "rounded-lg"]
    print("class counts (element has token):")
    print("  " + ", ".join("%s %d" % (k, allc[k]) for k in keys))
    sized = Counter()
    for e in text_kinds:
        sz = [t for t in e["toks"] if re.match(r'^(input|select|textarea)-(xs|sm|md|lg)$', t)]
        sized[sz[0].split("-")[1] if sz else "none"] += 1
    print("text-like control size (input/select/textarea):", dict(sized))
    # custom toggles
    cust = Counter()
    for f in files:
        t = rd(f)
        cust["role=switch"] += len(re.findall(r'role\s*=\s*"switch"', t))
        cust["ptah-toggle"] += len(re.findall(r'<ptah-toggle\b', t))
        cust["role=checkbox"] += len(re.findall(r'role\s*=\s*"(checkbox|radio)"', t))
        cust["role=radiogroup"] += len(re.findall(r'role\s*=\s*"radiogroup"', t))
        cust["aria-checked"] += len(re.findall(r'aria-checked', t))
    print("custom toggles:", dict(cust))


def recipes():
    print("## recipes (layout classes removed: w- flex- mt- mb- ml- mr- gap- col- order- min-w- max-w- self- justify- items- shrink grow flex)")
    groups = defaultdict(list)
    for e in els:
        groups[role(e)].append(e)
    for k, lst in sorted(groups.items(), key=lambda x: -len(x[1])):
        rc = defaultdict(list)
        for e in lst:
            rc[recipe(e)].append(e)
        print("### %s: %d elements, %d recipes" % (k, len(lst), len(rc)))
        if k in HIDDEN:
            continue
        for r, l in sorted(rc.items(), key=lambda x: -len(x[1]))[:14]:
            print("|%d|`%s`|%s|" % (len(l), r or "(none)", ex(l)))
    # settings-only vs not
    print("### text-like recipes (all kinds) with element-wise counts: total distinct", len(set((role(e), recipe(e)) for e in els)))


def a11y():
    print("## accessible name / states / patterns")
    scope = [e for e in els if e["kind"] not in ("input:hidden", "input:file")]
    c = Counter(name_info(e) for e in scope)
    print("controls (excl hidden, file):", len(scope))
    for k, v in c.most_common():
        print("  %-28s %d" % (k, v))
    noname = [e for e in scope if name_info(e) not in NAMED]
    print("NO accessible name (none + placeholder only + title only):", len(noname))
    bk = Counter(role(e) for e in noname)
    print("  by role:", dict(bk))
    bg = Counter(e["group"] for e in noname)
    print("  by group:", dict(bg.most_common()))
    print("  none only:", sum(1 for e in scope if name_info(e) == "none"))
    print("  examples (none):", ex([e for e in scope if name_info(e) == "none"]))
    # wrapping label detail
    w = [e for e in scope if e["wrapped"]]
    print("wrapping label:", len(w), " with label-text:", sum(1 for e in w if "label-text" in e["wrap_ctx"]),
          " floating:", sum(1 for e in w if "floating" in e["wrap_ctx"]),
          " input-in-label join:", sum(1 for e in w if "input" in e["wrap_ctx"] and e["tag"] != "input"))
    print("floating-label token anywhere:", sum(1 for e in els if any("floating" in t for t in e["toks"])))
    st = Counter()
    for e in scope:
        a = e["attrs"]
        st["disabled"] += bool(has(a, "disabled") or re.search(r'\[(attr\.)?disabled\]', a))
        st["readonly"] += bool(has(a, "readonly") or re.search(r'\[(attr\.)?readonly\]', a))
        st["required"] += bool(has(a, "required") or re.search(r'\[(attr\.)?required\]', a))
        st["aria-invalid"] += bool(re.search(r'aria-invalid', a))
        st["aria-describedby"] += bool(re.search(r'aria-describedby', a))
        st["[class.input-error] binding"] += bool(re.search(r'\[class\.(input|select|textarea|checkbox)-(error|warning)\]', a))
        st["ngClass or [class] with error"] += bool(re.search(r'\[(ngClass|class)\]\s*=\s*"[^"]*(error|warning)', a))
        st["static input-error/warning token"] += bool(any(re.match(r'^(input|select|textarea)-(error|warning)$', t) for t in e["toks"]))
        st["ngModel"] += bool(re.search(r'ngModel', a))
        st["[value]"] += bool(re.search(r'\[value\]', a))
        st["[checked]"] += bool(re.search(r'\[checked\]', a))
        st["dynamic [class]/ngClass"] += bool(re.search(r'\[(ngClass|class)\]\s*=', a))
        st["no class at all"] += (not e["toks"])
        st["autofocus/cdkFocus"] += bool(re.search(r'autofocus|cdkFocus|#\w+', a) and has(a, "autofocus"))
    for k, v in st.items():
        print("  %-34s %d" % (k, v))
    # helper/error text pattern
    h = Counter()
    for e in scope:
        after = e["text"][e["end"]:e["end"] + 500]
        nxt = re.search(r'<(input|select|textarea)\b', after)
        if nxt:
            after = after[:nxt.start()]
        if re.search(r'label-text-alt', after):
            h["label-text-alt after"] += 1
        if re.search(r'class="[^"]*text-(error|warning)', after):
            h["text-error/warning element after (approx)"] += 1
        if re.search(r'class="[^"]*text-base-content-muted|text-base-content/\d', after):
            h["muted helper after (approx)"] += 1
    print("helper/error text patterns:", dict(h))
    print("files with ptah-field shell:", sum(1 for f in files if '<ptah-field' in open(f, encoding='utf-8').read()))
    gloss = Counter()
    for f in files:
        t = rd(f)
        gloss["label-text"] += len(re.findall(r'\blabel-text\b', t))
        gloss["label-text-alt"] += len(re.findall(r'\blabel-text-alt\b', t))
        gloss["form-control"] += len(re.findall(r'\bform-control\b', t))
        gloss["<label"] += len(re.findall(r'<label\b', t))
        gloss["input-group/join"] += len(re.findall(r'\bjoin\b', t))
    print("label markup tokens in files:", dict(gloss))


def ui():
    print("## ui lib component uses (opening tag or attribute), inside ui lib vs outside")
    pats = {
        "ptah-field": r'<ptah-field\b', "ptahFieldControl": r'\bptahFieldControl\b',
        "ptahSettingsField": r'\bptahSettingsField\b', "ptahSetupField": r'\bptahSetupField\b',
        "ptah-native-dropdown": r'<ptah-native-dropdown\b', "ptah-native-option": r'<ptah-native-option\b',
        "ptah-native-autocomplete": r'<ptah-native-autocomplete\b',
        "ptah-provider-model-search-field": r'<ptah-provider-model-search-field\b',
        "ptah-provider-model-picker": r'<ptah-provider-model-picker\b',
        "ptah-peer-session-picker": r'<ptah-peer-session-picker\b', "ptah-json-schema-form": r'<ptah-json-schema-form\b',
        "ptah-dropdown (old)": r'<ptah-dropdown\b', "ptah-autocomplete (old)": r'<ptah-autocomplete\b',
        "autocompleteInput": r'\bautocompleteInput\b', "ptah-option (old)": r'<ptah-option\b',
        "ptah-toolbar": r'<ptah-toolbar\b', "ptah-toggle": r'<ptah-toggle\b',
    }
    for n, p in pats.items():
        ins = out = 0
        for f in files:
            c = len(re.findall(p, rd(f)))
            if f.startswith("libs/frontend/ui/"):
                ins += c
            else:
                out += c
        print("  %-34s outside ui lib %3d   inside ui lib %3d" % (n, out, ins))
    ui_els = Counter(e["kind"].split(":")[0] for e in els if e["f"].startswith("libs/frontend/ui/"))
    print("raw elements inside ui lib:", dict(ui_els), " select inside ui lib files:",
          sorted(set(e["f"] for e in els if e["f"].startswith("libs/frontend/ui/") and e["tag"] == "select")))
    # zero-pixel: compare with ptahFieldControl output and setup-field looks
    ref = {
        "ptahFieldControl input": {"input", "input-sm", "border-surface-border", "text-sm"},
        "ptahFieldControl select": {"select", "select-sm", "border-surface-border", "text-sm"},
        "ptahFieldControl textarea": {"textarea", "textarea-sm", "border-surface-border", "text-sm"},
        "setup select": {"select", "select-bordered", "select-sm"},
    }
    print("exact matches with current owner output (layout classes removed):")
    for n, s in ref.items():
        want = " ".join(sorted(s))
        cnt = [e for e in els if recipe(e) == want and e["f"].split("/")[2] != "ui"]
        print("  %-28s %3d  (%s)" % (n, len(cnt), ex(cnt)))
    # DaisyUI recipes that map to the sm/xs control heights
    print("candidate map: DaisyUI size xs=1.5rem and sm=2rem equal --ptah-control-h-xs|sm; default (3rem) and lg differ from md 2.5rem")
    for pre in ("input", "select", "textarea"):
        n = Counter()
        for e in els:
            if e["tag"] == pre or (pre == "input" and e["tag"] == "input" and e["kind"] not in ("input:checkbox", "input:radio", "input:hidden", "input:file", "input:range")):
                if e["tag"] != pre:
                    continue
                szs = [t for t in e["toks"] if re.match(r'^%s-(xs|sm|md|lg)$' % pre, t)]
                n[szs[0].split("-")[1] if szs else ("none" if e["toks"] else "no class")] += 1
        print("  %s size: %s" % (pre, dict(n)))
    # explicit height overrides
    hov = [e for e in text_kinds if any(re.match(r'^(h-|min-h-|!h-)', t) for t in e["toks"])]
    print("text-like controls with own height class (h-*, min-h-*):", len(hov), " tokens:",
          dict(Counter(t for e in hov for t in e["toks"] if re.match(r'^(h-|min-h-|!h-)', t)).most_common(8)))


def excl():
    print("## exclusions")
    comp = [e for e in els if re.search(r'(chat-input|lane-composer|composer)', e["f"]) and e["tag"] == "textarea"]
    print("composer textareas (file name chat-input|lane-composer|composer):", len(comp), [ex([e]) for e in comp])
    c = Counter()
    for f in files:
        t = rd(f)
        c["contenteditable"] += len(re.findall(r'contenteditable', t))
        c["monaco/codemirror/ace"] += len(re.findall(r'(?i)monaco|codemirror|\bace-editor', t))
        c["xterm/terminal element"] += len(re.findall(r'(?i)xterm', t))
        c["<ptah-json-schema-form"] += len(re.findall(r'<ptah-json-schema-form', t))
    print("  ", dict(c))
    cf = defaultdict(Counter)
    for f in files:
        t = rd(f)
        for k, p in (("contenteditable", r'contenteditable'), ("xterm", r'(?i)xterm'), ("monaco/codemirror", r'(?i)monaco|codemirror')):
            n = len(re.findall(p, t))
            if n:
                cf[k][f] = n
    for k, v in cf.items():
        print("  %s files: %s" % (k, dict(list(v.items())[:6])))
    for kind in ("input:file", "input:hidden", "input:range"):
        l = [e for e in els if e["kind"] == kind]
        print(kind, len(l), "with a recipe:", sum(1 for e in l if recipe(e)), ex(l))
    print("input type counts excluded: file+hidden+range =", sum(1 for e in els if e["kind"] in HIDDEN))
    # files inside ui lib gallery
    print("elements in ui lib files:", sum(1 for e in els if e["f"].startswith("libs/frontend/ui/")))
    g = [e for e in els if "gallery" in e["f"]]
    print("gallery elements:", len(g), sorted(set(e["f"] for e in g)))


def pages():
    print("## per-file counts for candidate reference files (kind: count)")
    by = defaultdict(Counter)
    for e in els:
        by[e["f"]][role(e)] += 1
    top = sorted(by.items(), key=lambda x: -sum(x[1].values()))[:25]
    for f, c in top:
        print("  %3d %s %s" % (sum(c.values()), f, dict(c)))
    div = sorted(by.items(), key=lambda x: -len(x[1]))[:10]
    print("most diverse (kinds):")
    for f, c in div:
        print("  %d kinds %s %s" % (len(c), f, dict(c)))


for name, fn in (("totals", totals), ("recipes", recipes), ("a11y", a11y), ("ui", ui), ("excl", excl), ("pages", pages)):
    if SECTION in ("all", name):
        fn()
        print()
