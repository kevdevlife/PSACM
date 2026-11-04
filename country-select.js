/* -----------------------------
    SEARCHABLE SELLER LOCATION
------------------------------ */
// Replaces Cardmarket's Seller Location filter (one home-country checkbox
// plus a long "View more countries" dropdown) with a searchable multi-select.
// The native checkboxes stay in the form as the source of truth: they are
// only hidden, and every toggle here flips them, so submitting the filter
// and the site's own Select all / Deselect all keep working unchanged.

(function () {
    const CHIP_LIMIT = 8;
    let uid = 0;

    const STYLE = `
.gs-csel-hidden { display: none !important; }
.gs-csel { margin-bottom: 4px; }
.gs-csel-anchor { position: relative; }
.gs-csel-trigger {
    display: flex; align-items: center; gap: 6px; width: 100%;
    text-align: left; cursor: pointer; min-height: 29px;
}
.gs-csel-trigger:focus-visible, .gs-csel-search:focus {
    outline: none;
    border-color: var(--bs-link-color, #7fa6fe);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--bs-link-color, #7fa6fe) 35%, transparent);
}
.gs-csel-summary { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gs-csel-placeholder { color: var(--bs-secondary-color, #999); }
.gs-csel-flags { display: inline-flex; flex-shrink: 0; }
.gs-csel-flags .icon { margin: 0 !important; }
.gs-csel-flags .icon + .icon { margin-left: -5px !important; box-shadow: -1px 0 0 var(--bs-body-bg, #14161b); }
.gs-csel-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.gs-csel-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 1px 3px 1px 6px; border-radius: 999px; font-size: 12px; line-height: 18px;
    background: var(--bs-tertiary-bg, rgba(127,127,127,.15));
    border: 1px solid var(--bs-border-color-translucent, rgba(127,127,127,.25));
}
.gs-csel-chip .icon { margin: 0 !important; }
.gs-csel-chip-x {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%;
    background: transparent; color: var(--bs-secondary-color, #999);
    font-size: 14px; line-height: 1; cursor: pointer;
}
.gs-csel-chip-x:hover, .gs-csel-chip-x:focus-visible {
    outline: none; color: var(--bs-body-color, #e4e6eb);
    background: var(--bs-secondary-bg, rgba(127,127,127,.3));
}
.gs-csel-panel {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 1060;
    display: flex; flex-direction: column;
    background: var(--bs-dropdown-bg, var(--bs-body-bg, #1d1f26));
    border: 1px solid var(--bs-border-color-translucent, rgba(255,255,255,.15));
    border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    overflow: hidden;
}
.gs-csel-search-wrap { position: relative; padding: 6px; border-bottom: 1px solid var(--bs-border-color-translucent, rgba(255,255,255,.1)); }
.gs-csel-search-wrap svg {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    width: 13px; height: 13px; color: var(--bs-secondary-color, #999); pointer-events: none;
}
.gs-csel-search { padding-left: 26px !important; }
.gs-csel-search::-webkit-search-cancel-button { cursor: pointer; }
.gs-csel-list { list-style: none; margin: 0; padding: 4px 0; max-height: 252px; overflow-y: auto; overscroll-behavior: contain; }
.gs-csel-option {
    display: flex; align-items: center; gap: 8px; padding: 5px 10px;
    cursor: pointer; user-select: none; font-size: 13px;
}
.gs-csel-option.is-active { background: var(--bs-dropdown-link-hover-bg, rgba(127,127,127,.15)); }
.gs-csel-option .icon { margin: 0 !important; flex-shrink: 0; }
.gs-csel-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gs-csel-option-name mark { padding: 0; background: none; color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.gs-csel-box {
    width: 14px; height: 14px; flex-shrink: 0; border-radius: 3px;
    border: 1px solid var(--bs-border-color, #495057);
    background: var(--bs-body-bg, #14161b);
    display: inline-flex; align-items: center; justify-content: center;
}
.gs-csel-option[aria-selected="true"] .gs-csel-box {
    background: var(--bs-link-color, #7fa6fe); border-color: var(--bs-link-color, #7fa6fe);
}
.gs-csel-box svg { width: 10px; height: 10px; color: var(--bs-body-bg, #14161b); visibility: hidden; }
.gs-csel-option[aria-selected="true"] .gs-csel-box svg { visibility: visible; }
.gs-csel-sep { height: 1px; margin: 4px 10px; background: var(--bs-border-color-translucent, rgba(255,255,255,.1)); }
.gs-csel-empty { padding: 14px 10px; text-align: center; font-size: 12px; color: var(--bs-secondary-color, #999); }
.gs-csel-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 5px 10px; font-size: 12px;
    border-top: 1px solid var(--bs-border-color-translucent, rgba(255,255,255,.1));
    color: var(--bs-secondary-color, #999);
}
.gs-csel-foot button { padding: 0; border: 0; background: none; font-size: 12px; color: var(--bs-link-color, #7fa6fe); cursor: pointer; }
.gs-csel-foot button:hover { text-decoration: underline; }
.gs-csel-foot button:disabled { color: var(--bs-secondary-color, #999); cursor: default; text-decoration: none; }
`;

    const SEARCH_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>';
    const CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>';

    function injectStyle() {
        if (document.getElementById("gs-csel-style")) return;
        const style = document.createElement("style");
        style.id = "gs-csel-style";
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    function flagOf(input) {
        const icon = input.closest(".form-check")?.querySelector(".icon");
        return icon ? icon.cloneNode(true) : document.createElement("span");
    }

    function enhance(filterBox) {
        if (filterBox.dataset.gsCsel) return;
        const inputs = [...filterBox.querySelectorAll('input[type="checkbox"][name^="sellerCountry"]')];
        if (inputs.length < 2) return;
        filterBox.dataset.gsCsel = "1";
        injectStyle();

        const id = `gs-csel-${++uid}`;
        // Native order: the site puts the home country first, then A-Z
        const countries = inputs.map(input => ({
            input,
            name: (input.closest(".form-check")?.querySelector("label")?.textContent || input.value).trim(),
            flag: flagOf(input),
        }));
        const homeCount = filterBox.querySelectorAll(':scope > .form-check input[name^="sellerCountry"]').length;

        const root = document.createElement("div");
        root.className = "gs-csel";

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "form-select form-select-sm gs-csel-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", `${id}-list`);
        trigger.setAttribute("aria-label", "Seller location");

        const chips = document.createElement("div");
        chips.className = "gs-csel-chips";

        const panel = document.createElement("div");
        panel.className = "gs-csel-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <div class="gs-csel-search-wrap">${SEARCH_SVG}
                <input type="search" class="form-control form-control-sm gs-csel-search"
                    placeholder="Search countries…" autocomplete="off" spellcheck="false"
                    role="combobox" aria-autocomplete="list" aria-expanded="true"
                    aria-controls="${id}-list" aria-label="Search countries">
            </div>
            <ul class="gs-csel-list" id="${id}-list" role="listbox" aria-multiselectable="true" aria-label="Seller location"></ul>
            <div class="gs-csel-foot">
                <span class="gs-csel-count"></span>
                <button type="button" class="gs-csel-clear">Clear</button>
            </div>`;
        const search = panel.querySelector(".gs-csel-search");
        const list = panel.querySelector(".gs-csel-list");
        const countEl = panel.querySelector(".gs-csel-count");
        const clearBtn = panel.querySelector(".gs-csel-clear");

        // Anchor keeps the panel directly under the field, above the chips
        const anchor = document.createElement("div");
        anchor.className = "gs-csel-anchor";
        anchor.append(trigger, panel);
        root.append(anchor, chips);
        filterBox.insertBefore(root, filterBox.firstChild);

        let matches = [];
        let active = 0;

        const selected = () => countries.filter(c => c.input.checked);

        function setChecked(country, checked) {
            if (country.input.checked === checked) return;
            country.input.checked = checked;
            country.input.dispatchEvent(new Event("input", { bubbles: true }));
            country.input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        function renderTrigger() {
            const sel = selected();
            trigger.textContent = "";
            const summary = document.createElement("span");
            summary.className = "gs-csel-summary";
            if (sel.length === 0) {
                summary.classList.add("gs-csel-placeholder");
                summary.textContent = "All countries";
            } else {
                const flags = document.createElement("span");
                flags.className = "gs-csel-flags";
                sel.slice(0, 3).forEach(c => flags.appendChild(c.flag.cloneNode(true)));
                trigger.appendChild(flags);
                summary.textContent = sel.length === 1 ? sel[0].name : `${sel.length} countries`;
            }
            trigger.appendChild(summary);

            chips.textContent = "";
            // One country is already named in the field; many would flood the sidebar
            chips.hidden = sel.length < 2 || sel.length > CHIP_LIMIT;
            if (chips.hidden) return;
            sel.forEach(c => {
                const chip = document.createElement("span");
                chip.className = "gs-csel-chip";
                const label = document.createElement("span");
                label.textContent = c.name;
                const x = document.createElement("button");
                x.type = "button";
                x.className = "gs-csel-chip-x";
                x.setAttribute("aria-label", `Remove ${c.name}`);
                x.textContent = "×";
                x.addEventListener("click", () => {
                    setChecked(c, false);
                    render();
                    (chips.querySelector(".gs-csel-chip-x") || trigger).focus();
                });
                chip.append(c.flag.cloneNode(true), label, x);
                chips.appendChild(chip);
            });
        }

        function optionName(match) {
            const span = document.createElement("span");
            span.className = "gs-csel-option-name";
            if (match.end > match.start) {
                const mark = document.createElement("mark");
                mark.textContent = match.name.slice(match.start, match.end);
                span.append(match.name.slice(0, match.start), mark, match.name.slice(match.end));
            } else {
                span.textContent = match.name;
            }
            return span;
        }

        function renderList() {
            const query = search.value;
            matches = searchCountries(countries.map(c => c.name), query);
            list.textContent = "";
            if (matches.length === 0) {
                const empty = document.createElement("li");
                empty.className = "gs-csel-empty";
                empty.setAttribute("role", "presentation");
                empty.textContent = `No countries match “${query.trim()}”`;
                list.appendChild(empty);
                search.removeAttribute("aria-activedescendant");
                return;
            }
            active = Math.min(active, matches.length - 1);
            matches.forEach((m, i) => {
                // Separate the home country from the A-Z list while browsing
                if (!query.trim() && homeCount && i === homeCount) {
                    const sep = document.createElement("li");
                    sep.className = "gs-csel-sep";
                    sep.setAttribute("role", "presentation");
                    list.appendChild(sep);
                }
                const c = countries[m.index];
                const li = document.createElement("li");
                li.id = `${id}-opt-${m.index}`;
                li.className = "gs-csel-option" + (i === active ? " is-active" : "");
                li.setAttribute("role", "option");
                li.setAttribute("aria-selected", String(c.input.checked));
                const box = document.createElement("span");
                box.className = "gs-csel-box";
                box.innerHTML = CHECK_SVG;
                li.append(box, c.flag.cloneNode(true), optionName(m));
                // mousedown keeps focus in the search field
                li.addEventListener("mousedown", e => e.preventDefault());
                li.addEventListener("click", () => {
                    active = i;
                    toggle(m.index);
                });
                li.addEventListener("mousemove", () => {
                    if (active !== i) setActive(i);
                });
                list.appendChild(li);
            });
            search.setAttribute("aria-activedescendant", `${id}-opt-${matches[active].index}`);
        }

        function renderFoot() {
            const n = selected().length;
            countEl.textContent = n === 0 ? "Showing all countries" : `${n} selected`;
            clearBtn.disabled = n === 0;
        }

        function render() {
            renderTrigger();
            if (!panel.hidden) {
                renderList();
                renderFoot();
            }
        }

        function setActive(i) {
            const opts = list.querySelectorAll(".gs-csel-option");
            if (!opts.length) return;
            active = (i + opts.length) % opts.length;
            opts.forEach((o, k) => o.classList.toggle("is-active", k === active));
            const el = opts[active];
            search.setAttribute("aria-activedescendant", el.id);
            el.scrollIntoView({ block: "nearest" });
        }

        function toggle(index) {
            const c = countries[index];
            setChecked(c, !c.input.checked);
            const scroll = list.scrollTop;
            render();
            list.scrollTop = scroll;
        }

        function open(initialQuery) {
            if (!panel.hidden) return;
            panel.hidden = false;
            trigger.setAttribute("aria-expanded", "true");
            search.value = initialQuery || "";
            active = 0;
            render();
            list.scrollTop = 0;
            search.focus();
        }

        function close(focusTrigger) {
            if (panel.hidden) return;
            panel.hidden = true;
            trigger.setAttribute("aria-expanded", "false");
            if (focusTrigger) trigger.focus();
            // The sidebar holds auto-apply while the list is open
            root.dispatchEvent(new CustomEvent("gs-csel-close", { bubbles: true }));
        }

        trigger.addEventListener("click", () => (panel.hidden ? open() : close(true)));
        trigger.addEventListener("keydown", e => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                open();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
                // Start typing on the closed select to search right away
                e.preventDefault();
                open(e.key);
            }
        });

        search.addEventListener("input", () => {
            active = 0;
            renderList();
            list.scrollTop = 0;
        });
        search.addEventListener("keydown", e => {
            switch (e.key) {
                case "ArrowDown": e.preventDefault(); setActive(active + 1); break;
                case "ArrowUp": e.preventDefault(); setActive(active - 1); break;
                case "Home": if (!search.value) { e.preventDefault(); setActive(0); } break;
                case "End": if (!search.value) { e.preventDefault(); setActive(-1); } break;
                case "Enter":
                    // Never let Enter submit the filter form from here
                    e.preventDefault();
                    if (matches[active]) toggle(matches[active].index);
                    break;
                case "Escape":
                    e.preventDefault();
                    e.stopPropagation();
                    if (search.value) {
                        search.value = "";
                        search.dispatchEvent(new Event("input"));
                    } else {
                        close(true);
                    }
                    break;
                case "Tab": close(false); break;
            }
        });

        clearBtn.addEventListener("mousedown", e => e.preventDefault());
        clearBtn.addEventListener("click", () => {
            countries.forEach(c => setChecked(c, false));
            render();
            search.focus();
        });

        document.addEventListener("mousedown", e => {
            if (!panel.hidden && !root.contains(e.target)) close(false);
        }, true);

        // Keep in sync with the site's own Select all / Deselect all buttons
        filterBox.addEventListener("change", e => {
            if (!root.contains(e.target)) render();
        });
        filterBox.querySelectorAll(".select-all, .deselect-all").forEach(btn =>
            btn.addEventListener("click", () => setTimeout(render, 0))
        );

        render();

        // Only hide the native home-country row and "View more countries"
        // dropdown once the replacement is fully built
        [...filterBox.children].forEach(child => {
            if (child.matches(".form-check, .dropdown")) child.classList.add("gs-csel-hidden");
        });
    }

    function init() {
        const box = document.querySelector("#articleFilterSellerLocation .filter-box");
        if (!box) return;
        try {
            enhance(box);
        } catch (err) {
            console.error("[Grading Scanner] seller location select failed:", err);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
