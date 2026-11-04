/* -----------------------------
      FILTER SIDEBAR UPGRADES
------------------------------ */
// Additive upgrades to Cardmarket's product filter sidebar:
//  - every filter applies on its own: changes to the site's filters are
//    submitted after a short pause, with a status bar and Undo
//  - "Active filters" chips for what the listing is filtered by right now
//  - button rows instead of dropdowns for condition / reputation / delivery
//    and Any/Yes/No toggles for every Yes/No select (Reverse Holo, Signed,
//    First Edition, Altered, and the extension's own Photo)
//  - sections at their default start closed, headings show the current
//    value; "only" shortcut on checkbox rows
// The site's own form fields stay the source of truth: new controls only
// set them, and applying always goes through the site's Filter button.

(function () {
    const PLURALS = { sellerCountry: "countries", sellerType: "seller types", language: "languages" };

    const STYLE = `
/* Captured at form level: Bootstrap redefines --bs-link-color inside accordion headers */
.article-filter-form { --gs-accent: var(--bs-link-color, #7fa6fe); }
.gs-fx-hidden { display: none !important; }
.gs-fx-hval {
    display: inline-block; max-width: 150px; margin: 0 4px 0 2px; vertical-align: bottom;
    font-weight: 400; color: var(--bs-secondary-color, #999);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Button rows (scales + toggles) */
.gs-seg { display: flex; width: 100%; border: 1px solid var(--bs-border-color, #495057); border-radius: 4px; overflow: hidden; }
.gs-seg-btn {
    flex: 1 1 0; min-width: 0; padding: 4px 0; border: 0; margin: 0;
    background: var(--bs-body-bg, #14161b); color: var(--bs-body-color, #e4e6eb);
    font-size: 11.5px; line-height: 1.3; white-space: nowrap; cursor: pointer;
    transition: background-color .12s ease-out, color .12s ease-out, opacity .12s ease-out;
}
.gs-seg-btn + .gs-seg-btn { border-left: 1px solid var(--bs-border-color, #495057); }
.gs-seg-btn:hover { background: var(--bs-tertiary-bg, rgba(127,127,127,.15)); }
.gs-seg-btn:focus-visible { outline: 2px solid var(--gs-accent); outline-offset: -2px; position: relative; z-index: 1; }
.gs-seg-btn.is-in { background: color-mix(in srgb, var(--gs-accent) 30%, var(--bs-body-bg, #14161b)); }
.gs-seg-btn[aria-checked="true"] { background: var(--gs-accent); color: var(--bs-body-bg, #14161b); font-weight: 600; }
.gs-seg-cap { margin-top: 4px; font-size: 11.5px; color: var(--bs-secondary-color, #999); }

/* Condition row uses the site's own condition badges */
.gs-seg-cond { border: 0; gap: 3px; overflow: visible; }
.gs-seg-cond .gs-seg-btn { padding: 2px 0; background: none; border: 0; border-radius: 4px; }
.gs-seg-cond .gs-seg-btn .article-condition { margin: 0 !important; pointer-events: none; }
.gs-seg-cond .gs-seg-btn .badge { display: block; width: 100%; }
.gs-seg-cond .gs-seg-btn.is-out { opacity: .32; }
.gs-seg-cond .gs-seg-btn.is-out:hover { opacity: .7; }
.gs-seg-cond .gs-seg-btn[aria-checked="true"] { background: none; box-shadow: 0 0 0 2px var(--bs-body-color, #e4e6eb); }
.gs-seg-toggle { width: auto; flex: 1; }

/* "only" shortcut */
.gs-only-row { position: relative; }
.gs-only {
    position: absolute; right: 0; top: 50%; transform: translateY(-50%);
    padding: 0 6px; border: 0; border-radius: 3px; background: var(--bs-body-bg, #14161b);
    color: var(--gs-accent); font-size: 11px; line-height: 18px; cursor: pointer;
    opacity: 0; pointer-events: none; transition: opacity .1s ease-out;
}
.gs-only-row:hover .gs-only, .gs-only:focus-visible { opacity: 1; pointer-events: auto; }
.gs-only:hover { text-decoration: underline; }
.gs-only:focus-visible { outline: 2px solid var(--gs-accent); }

/* Active filters */
.gs-active {
    padding: 8px 10px 9px; border: 1px solid var(--bs-border-color, #495057); border-bottom: 0;
    font-size: 12px;
}
.gs-active-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
.gs-active-title { font-weight: 600; }
.gs-active-clear { padding: 0; border: 0; background: none; color: var(--gs-accent); font-size: 12px; cursor: pointer; }
.gs-active-clear:hover { text-decoration: underline; }
.gs-active-list { display: flex; flex-wrap: wrap; gap: 4px; }
.gs-chip {
    display: inline-flex; align-items: center; gap: 4px; max-width: 100%;
    padding: 1px 3px 1px 8px; border-radius: 999px; line-height: 18px;
    background: var(--bs-tertiary-bg, rgba(127,127,127,.15));
    border: 1px solid var(--bs-border-color-translucent, rgba(127,127,127,.25));
}
.gs-chip-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gs-chip-x {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%;
    background: transparent; color: var(--bs-secondary-color, #999); font-size: 14px; line-height: 1; cursor: pointer;
}
.gs-chip-x:hover, .gs-chip-x:focus-visible { outline: none; color: var(--bs-body-color, #e4e6eb); background: var(--bs-secondary-bg, rgba(127,127,127,.3)); }

/* Pinned apply bar */
.gs-applybar {
    position: sticky; bottom: 0; z-index: 20;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; font-size: 12px;
    background: var(--bs-dropdown-bg, var(--bs-body-bg, #1d1f26));
    border: 1px solid var(--gs-accent);
    box-shadow: 0 -6px 18px rgba(0,0,0,.35);
    animation: gs-bar-in .18s ease-out;
}
.gs-applybar[hidden] { display: none; }
.gs-applybar-text { flex: 1; min-width: 0; }
.gs-applybar-spin {
    width: 12px; height: 12px; flex-shrink: 0; border-radius: 50%;
    border: 2px solid var(--bs-border-color, #495057); border-top-color: var(--gs-accent);
    animation: gs-spin .7s linear infinite;
}
.gs-applybar-spin[hidden], .gs-applybar-undo[hidden] { display: none; }
@keyframes gs-spin { to { transform: rotate(360deg); } }
.gs-applybar-undo { padding: 0; border: 0; background: none; color: var(--gs-accent); font-size: 12px; cursor: pointer; }
.gs-applybar-undo:hover { text-decoration: underline; }
.gs-fx-saved {
    display: flex; justify-content: center; align-items: center; gap: 6px;
    padding: 8px 10px; font-size: 12px; color: var(--bs-secondary-color, #999);
    border: 1px solid var(--bs-border-color, #495057); border-top: 0;
}
.gs-fx-saved-btn { padding: 0; border: 0; background: none; color: var(--gs-accent); font-size: 12px; cursor: pointer; }
.gs-fx-saved-btn:hover { text-decoration: underline; }
.gs-fx-saved-btn:focus-visible { outline: 2px solid var(--gs-accent); outline-offset: 2px; }
@keyframes gs-bar-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
    .gs-applybar, .gs-applybar-spin { animation: none; }
    .gs-seg-btn, .gs-only { transition: none; }
}
`;

    /* ---------- field state ---------- */

    const isBox = el => el.type === "checkbox";
    const isNumberLike = el => el.tagName === "INPUT" && !isBox(el);

    // Applied value and neutrality come from lib/filter-state.js, shared with
    // the history recorder (content.js) so both agree on what is "active".
    const appliedVal = appliedValue;

    function currentVal(el) {
        return isBox(el) ? el.checked : el.value;
    }

    function neutralOf(el) {
        if (isBox(el)) return false;
        if (el.tagName === "SELECT") return neutralValue(el.name, [...el.options].map(o => o.value));
        return "0";
    }

    const isNeutralVal = isNeutralFieldValue;

    const isToggleSelect = el => el.tagName === "SELECT" && isToggleOptions([...el.options].map(o => o.value));

    function sameVal(el, a, b) {
        if (isNumberLike(el)) return (Number(a) || 0) === (Number(b) || 0);
        return a === b;
    }

    function setVal(el, v) {
        if (sameVal(el, currentVal(el), v)) return;
        if (isBox(el)) el.checked = v;
        else el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function labelOf(el) {
        const label = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        return (label ? label.textContent : el.value).trim();
    }

    // Photo is the extension's own toggle (in the Extra section): it filters
    // the loaded rows instantly instead of going through the site's form.
    function photoSummary(v) {
        return v === "Y" ? "With photo" : v === "N" ? "Without photo" : null;
    }

    /* ---------- sections ---------- */

    function readSection(item) {
        const collapse = item.querySelector(":scope > .accordion-collapse");
        const link = item.querySelector(":scope > .accordion-header a");
        const nameEl = item.querySelector(".filterName");
        if (!collapse || !link || !nameEl) return null;
        const fields = [...collapse.querySelectorAll("input[name], select[name]")]
            .filter(el => el.type !== "hidden" && el.type !== "search");
        if (!fields.length) return null;
        const prefix = fields[0].name.replace(/\[.*$/, "");
        return {
            item, collapse, link, nameEl,
            title: nameEl.textContent.trim(),
            fields,
            kind: fields.every(isBox) ? "checks" : "values",
            plural: PLURALS[prefix] || "selected",
            prefix,
        };
    }

    function summary(section, getter) {
        if (section.kind === "checks") {
            return checkedSummary(section.fields.filter(getter).map(labelOf), section.plural);
        }
        const parts = section.fields.map(el => {
            const v = getter(el);
            if (isNeutralVal(el, v)) return null;
            if (isNumberLike(el)) return `≥ ${v} copies`;
            if (isToggleSelect(el)) return toggleSummary(labelOf(el), v);
            const known = scaleSummary(el.name, v);
            if (known) return known;
            const opt = [...el.options].find(o => o.value === v);
            return opt ? opt.text.trim() : v;
        }).filter(Boolean);
        return parts.length ? parts.join(", ") : null;
    }

    const isDirty = s => s.fields.some(el => !sameVal(el, currentVal(el), appliedVal(el)));
    const isAppliedNeutral = s => s.fields.every(el => isNeutralVal(el, appliedVal(el)));

    /* ---------- build ---------- */

    function injectStyle() {
        if (document.getElementById("gs-fx-style")) return;
        const style = document.createElement("style");
        style.id = "gs-fx-style";
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    // Radio-group of buttons that drives a hidden native <select>: a scale
    // (SCALES) or an Any/Yes/No toggle
    function buildButtonRow(select, title, render) {
        const field = select.name || select.id;
        const scale = SCALES[field];
        const options = scale
            ? scale.options
            : [...select.options].map(o => ({ value: o.value, label: o.text.trim(), name: o.text.trim() }));

        const wrap = el("div", "gs-seg-wrap");
        const row = el("div", "gs-seg" + (field === "minCondition" ? " gs-seg-cond" : "") + (scale ? "" : " gs-seg-toggle"));
        row.setAttribute("role", "radiogroup");
        row.setAttribute("aria-label", title);
        const cap = scale ? el("div", "gs-seg-cap") : null;
        if (cap) cap.id = `gs-seg-cap-${field.replace(/\W/g, "")}`;

        const buttons = options.map(o => {
            const b = el("button", "gs-seg-btn");
            b.type = "button";
            b.dataset.value = o.value;
            b.setAttribute("role", "radio");
            b.title = o.name;
            if (cap) b.setAttribute("aria-describedby", cap.id);
            if (o.badge) {
                const badge = el("span", `article-condition condition-${o.badge}`);
                badge.appendChild(el("span", "badge", o.label));
                b.appendChild(badge);
                b.setAttribute("aria-label", o.name);
            } else {
                b.textContent = o.label;
            }
            b.addEventListener("click", () => {
                setVal(select, o.value);
                render();
            });
            row.appendChild(b);
            return b;
        });

        row.addEventListener("keydown", e => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const i = buttons.indexOf(document.activeElement);
            const next = buttons[(i + step + buttons.length) % buttons.length];
            next.focus();
            next.click();
        });

        function sync() {
            const v = select.value;
            const neutral = scale ? scale.neutral : null;
            buttons.forEach(b => {
                const on = b.dataset.value === v;
                b.setAttribute("aria-checked", String(on));
                b.tabIndex = on ? 0 : -1;
                if (scale) {
                    const inRange = isIncluded(field, b.dataset.value, v);
                    b.classList.toggle("is-in", inRange && v !== neutral && !on);
                    b.classList.toggle("is-out", !inRange);
                }
            });
            if (cap) cap.textContent = scaleCaption(field, v);
        }

        wrap.appendChild(row);
        if (cap) wrap.appendChild(cap);
        return { wrap, sync };
    }

    function addOnlyLinks(container, boxes) {
        if (boxes.length < 2) return;
        boxes.forEach(box => {
            const row = box.closest(".form-check");
            if (!row || row.querySelector(".gs-only")) return;
            row.classList.add("gs-only-row");
            const only = el("button", "gs-only", "only");
            only.type = "button";
            only.setAttribute("aria-label", `Only ${labelOf(box)}`);
            only.addEventListener("click", e => {
                e.preventDefault();
                boxes.forEach(b => setVal(b, b === box));
            });
            row.appendChild(only);
        });
    }

    function enhance(articleFilters) {
        if (articleFilters.dataset.gsFx) return;
        const form = articleFilters.closest("form");
        const applyBtn = form && form.querySelector('[type="submit"][name="apply"]');
        if (!form || !applyBtn) return;
        articleFilters.dataset.gsFx = "1";
        injectStyle();

        const sections = [...articleFilters.children]
            .filter(item => item.classList.contains("accordion-item") && !item.id.startsWith("gs-"))
            .map(readSection)
            .filter(Boolean);

        const syncers = [];
        let submitting = false;

        /* heading values */
        sections.forEach(s => {
            s.hval = el("span", "gs-fx-hval");
            s.nameEl.after(s.hval);
        });

        /* button rows */
        function addButtonRow(select, title) {
            if (select.classList.contains("gs-fx-hidden")) return;
            const { wrap, sync } = buildButtonRow(select, title, render);
            select.after(wrap);
            select.classList.add("gs-fx-hidden");
            syncers.push(sync);
        }
        sections.forEach(s => {
            s.fields.filter(f => f.tagName === "SELECT" && (SCALES[f.name] || isToggleSelect(f)))
                .forEach(select => addButtonRow(select, s.title));
        });
        // Toggles the extension adds later (Photo, after a scan) ask for a row
        form.addEventListener("gs-fx-toggle", e => {
            if (!isToggleSelect(e.target)) return;
            addButtonRow(e.target, labelOf(e.target));
            render();
        });

        /* only links on the site's checkbox groups (countries have their own picker) */
        sections.filter(s => s.kind === "checks" && s.prefix !== "sellerCountry")
            .forEach(s => addOnlyLinks(s.collapse, s.fields));

        /* auto-apply: every change to the site's filters is submitted through
           its own Filter button after a short pause, so a burst of clicks
           (or an "only") becomes one page load. The bar is the status line,
           with a chance to undo during that pause. */
        const APPLY_DELAY = 900;
        const footer = [...form.children].find(c => c.contains(applyBtn));
        const bar = el("div", "gs-applybar");
        bar.hidden = true;
        bar.setAttribute("role", "status");
        const spinner = el("span", "gs-applybar-spin");
        spinner.setAttribute("aria-hidden", "true");
        const barText = el("span", "gs-applybar-text");
        const undo = el("button", "gs-applybar-undo", "Undo");
        undo.type = "button";
        bar.append(spinner, barText, undo);
        if (footer) form.insertBefore(bar, footer);
        else form.appendChild(bar);

        let timer = null;
        let quiet = false;

        // Programmatic changes (undo, chip removal) must not schedule a submit
        function withQuiet(fn) {
            quiet = true;
            try { fn(); } finally { quiet = false; }
        }

        function revertAll() {
            withQuiet(() => sections.forEach(s => s.fields.forEach(f => setVal(f, appliedVal(f)))));
        }

        const pickerOpen = () => !!form.querySelector(".gs-csel-panel:not([hidden])");

        function showBar(text, busy, canUndo) {
            bar.hidden = false;
            barText.textContent = text;
            spinner.hidden = !busy;
            undo.hidden = !canUndo;
        }

        // Submit through one of the site's own submit buttons
        function submitWith(button, text) {
            clearTimeout(timer);
            if (submitting) return;
            submitting = true;
            showBar(text, true, false);
            if (typeof form.requestSubmit === "function") form.requestSubmit(button);
            else button.click();
        }

        const submit = () => submitWith(applyBtn, "Updating results…");

        /* The site's footer (Clear / Filter) is redundant with auto-apply and
           "Clear all". Filter's dropdown also holds Cardmarket's personal
           filter settings (Save and Apply / Reset to personal), so those stay
           reachable as a slim link row in its place. */
        const persistBtn = form.querySelector('[type="submit"][name="persist"]');
        const restoreBtn = form.querySelector('[type="submit"][name="restore"]');
        if (footer) {
            const saved = el("div", "gs-fx-saved");
            const link = (text, title, button, busy) => {
                const b = el("button", "gs-fx-saved-btn", text);
                b.type = "button";
                b.title = title;
                b.addEventListener("click", () => submitWith(button, busy));
                return b;
            };
            if (persistBtn) {
                saved.append(link("Save as my default", "Save these filters as your personal Cardmarket filter settings",
                    persistBtn, "Saving as your default\u2026"));
            }
            if (restoreBtn) {
                if (persistBtn) saved.append(el("span", "gs-fx-saved-sep", "·"));
                saved.append(link("Load my default", "Reset to your personal Cardmarket filter settings",
                    restoreBtn, "Loading your default filters\u2026"));
            }
            if (saved.children.length) form.insertBefore(saved, footer);
            footer.classList.add("gs-fx-hidden");
        }

        function schedule() {
            clearTimeout(timer);
            if (submitting) return;
            if (!sections.some(isDirty)) {
                bar.hidden = true;
                return;
            }
            if (pickerOpen()) {
                showBar("Applies when you close the country list", false, true);
                return;
            }
            showBar("Updating results…", true, true);
            timer = setTimeout(submit, APPLY_DELAY);
        }

        undo.addEventListener("click", () => {
            clearTimeout(timer);
            revertAll();
            bar.hidden = true;
            render();
        });

        const isSiteField = t => sections.some(s => s.fields.includes(t));
        // The site's Select all / Deselect all set boxes without a change event
        sections.forEach(s => s.collapse.querySelectorAll(".select-all, .deselect-all").forEach(btn =>
            btn.addEventListener("click", () => setTimeout(() => {
                render();
                schedule();
            }, 0))
        ));
        form.addEventListener("gs-csel-close", schedule);

        /* active filters */
        const active = el("div", "gs-active");
        active.hidden = true;
        const head = el("div", "gs-active-head");
        head.append(el("span", "gs-active-title", "Active filters"));
        const clearAll = el("button", "gs-active-clear", "Clear all");
        clearAll.type = "button";
        head.append(clearAll);
        const chipList = el("div", "gs-active-list");
        active.append(head, chipList);
        articleFilters.before(active);

        function instantFilters() {
            const out = [];
            const graded = [...document.querySelectorAll('#gs-filter-accordion-item input[type="checkbox"]')];
            const on = graded.filter(b => b.checked);
            if (on.length) {
                out.push({
                    text: checkedSummary(on.map(b => b.id.replace("gs-grader-cb-", "").toUpperCase()), "graders"),
                    title: "Graded Cards",
                    clear: () => on.forEach(b => setVal(b, false)),
                });
            }
            const photo = document.getElementById("gs-photo-select");
            const photoText = photo && photoSummary(photo.value);
            if (photoText) {
                out.push({ text: photoText, title: "Photo", el: photo, clear: () => setVal(photo, "0") });
            }
            return out;
        }

        function chip(text, title, onRemove) {
            const c = el("span", "gs-chip");
            c.title = title;
            const x = el("button", "gs-chip-x", "×");
            x.type = "button";
            x.setAttribute("aria-label", `Remove ${title}: ${text}`);
            x.addEventListener("click", onRemove);
            c.append(el("span", "gs-chip-text", text), x);
            return c;
        }

        clearAll.addEventListener("click", () => {
            instantFilters().forEach(f => f.clear());
            const native = sections.filter(s => !isAppliedNeutral(s));
            if (native.length) {
                revertAll();
                withQuiet(() => native.forEach(s => s.fields.forEach(f => setVal(f, neutralOf(f)))));
                submit();
            }
            render();
        });

        /* render */
        function render() {
            syncers.forEach(sync => sync());

            const instant = instantFilters();
            sections.forEach(s => {
                const parts = [summary(s, currentVal)]
                    .concat(instant.filter(f => f.el && s.collapse.contains(f.el)).map(f => f.text))
                    .filter(Boolean);
                const now = parts.length ? parts.join(", ") : null;
                s.hval.textContent = now ? `· ${now}` : "";
                s.hval.title = now || "";
            });

            chipList.textContent = "";
            sections.forEach(s => {
                const text = summary(s, appliedVal);
                if (!text) return;
                chipList.appendChild(chip(text, s.title, () => {
                    revertAll();
                    withQuiet(() => s.fields.forEach(f => setVal(f, neutralOf(f))));
                    submit();
                }));
            });
            instant.forEach(f => chipList.appendChild(chip(f.text, f.title, () => {
                f.clear();
                render();
            })));
            active.hidden = chipList.children.length === 0;
        }

        form.addEventListener("change", e => {
            render();
            if (!quiet && isSiteField(e.target)) schedule();
        });
        form.addEventListener("input", render);

        // The extension's own Graded Cards section (and Photo, when the page
        // has no Extra section) is (re)inserted
        // after a scan; give them "only" links and refresh the chips.
        new MutationObserver(() => {
            const graded = document.getElementById("gs-filter-accordion-item");
            if (graded) addOnlyLinks(graded, [...graded.querySelectorAll('input[type="checkbox"]')]);
            render();
        }).observe(articleFilters, { childList: true });
        const gradedNow = document.getElementById("gs-filter-accordion-item");
        if (gradedNow) addOnlyLinks(gradedNow, [...gradedNow.querySelectorAll('input[type="checkbox"]')]);

        /* every load: sections with a filter set start open, the rest closed */
        sections.forEach(s => {
            const open = !isAppliedNeutral(s);
            s.collapse.classList.toggle("show", open);
            s.link.classList.toggle("collapsed", !open);
            s.link.setAttribute("aria-expanded", String(open));
        });

        render();
    }

    function init() {
        const articleFilters = document.getElementById("articleFilters");
        if (!articleFilters) return;
        try {
            enhance(articleFilters);
        } catch (err) {
            console.error("[Grading Scanner] filter sidebar failed:", err);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
