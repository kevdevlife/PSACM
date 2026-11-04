// Pure helpers for the filter sidebar: neutral values, short summaries and
// captions for Cardmarket's filter fields. Shared by the content script
// (browser global) and node tests.
(function (root) {
    // Ranged scales: options run strict -> loose, the loosest is "no filter".
    // Values are Cardmarket's own select values.
    const SCALES = {
        minCondition: {
            neutral: "7",
            options: [
                { value: "1", label: "MT", name: "Mint", badge: "mt" },
                { value: "2", label: "NM", name: "Near Mint", badge: "nm" },
                { value: "3", label: "EX", name: "Excellent", badge: "ex" },
                { value: "4", label: "GD", name: "Good", badge: "gd" },
                { value: "5", label: "LP", name: "Light Played", badge: "lp" },
                { value: "6", label: "PL", name: "Played", badge: "pl" },
                { value: "7", label: "PO", name: "Poor", badge: "po" },
            ],
            summary: o => (o.value === "1" ? "MT" : `${o.label}+`),
            caption: (o, first) => (first ? `${o.name} only` : `${o.name} or better`),
            anyCaption: "Any condition",
        },
        sellerReputation: {
            neutral: "5",
            options: [
                { value: "1", label: "Outst.", name: "Outstanding" },
                { value: "2", label: "V.good", name: "Very good" },
                { value: "3", label: "Good", name: "Good" },
                { value: "4", label: "Avg", name: "Average" },
                { value: "5", label: "Any", name: "Bad" },
            ],
            summary: o => (o.value === "1" ? "Outstanding sellers" : `${o.name}+ sellers`),
            caption: (o, first) => (first ? `${o.name} only` : `${o.name} or better`),
            anyCaption: "Any reputation",
        },
        maxShippingTime: {
            neutral: "7",
            options: [
                { value: "2", label: "2d", name: "2 days" },
                { value: "3", label: "3d", name: "3 days" },
                { value: "4", label: "4d", name: "4 days" },
                { value: "5", label: "5d", name: "5 days" },
                { value: "6", label: "6d", name: "6 days" },
                { value: "7", label: "Any", name: "7+ days" },
            ],
            summary: o => `≤ ${o.value} days delivery`,
            caption: o => `${o.name} or faster on average`,
            anyCaption: "Any delivery time",
        },
    };

    // Three-way toggles (Any / Yes / No)
    const TOGGLES = {
        "extra[isSigned]": { yes: "Signed", no: "Not signed" },
        "extra[isAltered]": { yes: "Altered", no: "Not altered" },
    };

    function neutralValue(field, optionValues) {
        if (SCALES[field]) return SCALES[field].neutral;
        if (optionValues.includes("0")) return "0";
        return optionValues[optionValues.length - 1];
    }

    function scaleOption(field, value) {
        const scale = SCALES[field];
        return scale ? scale.options.find(o => o.value === value) || null : null;
    }

    function scaleSummary(field, value) {
        if (TOGGLES[field]) {
            if (value === "Y") return TOGGLES[field].yes;
            if (value === "N") return TOGGLES[field].no;
            return null;
        }
        const scale = SCALES[field];
        const opt = scaleOption(field, value);
        if (!opt || value === scale.neutral) return null;
        return scale.summary(opt);
    }

    function scaleCaption(field, value) {
        const scale = SCALES[field];
        const opt = scaleOption(field, value);
        if (!opt || value === scale.neutral) return scale ? scale.anyCaption : "";
        return scale.caption(opt, scale.options[0] === opt);
    }

    // Is option `value` part of the range picked by `selected`?
    function isIncluded(field, value, selected) {
        const opts = SCALES[field].options.map(o => o.value);
        return opts.indexOf(value) <= opts.indexOf(selected);
    }

    function checkedSummary(labels, plural) {
        if (labels.length === 0) return null;
        if (labels.length <= 2) return labels.join(", ");
        return `${labels.length} ${plural}`;
    }

    // Field state. `el` is a form field (or a stand-in with the same properties:
    // tagName, type, name, defaultChecked, defaultValue, options[].defaultSelected).
    const isCheckbox = el => el.type === "checkbox";
    const isSelect = el => el.tagName === "SELECT";

    // The value the page was loaded with = the filter that is actually applied.
    function appliedValue(el) {
        if (isCheckbox(el)) return el.defaultChecked;
        if (isSelect(el)) {
            const opts = [...el.options];
            const o = opts.find(opt => opt.defaultSelected);
            return o ? o.value : (opts[0] ? opts[0].value : "");
        }
        return el.defaultValue;
    }

    function isNeutralFieldValue(el, v) {
        if (isCheckbox(el)) return v === false;
        if (isSelect(el)) return v === neutralValue(el.name, [...el.options].map(o => o.value));
        return !v || Number(v) <= 0;
    }

    // Does any field have an applied, non-neutral value? `skip(el)` leaves fields out.
    function hasActiveFilters(fields, skip) {
        return fields.some(el => !(skip && skip(el)) && !isNeutralFieldValue(el, appliedValue(el)));
    }

    const api = { SCALES, TOGGLES, neutralValue, scaleSummary, scaleCaption, isIncluded, checkedSummary, appliedValue, isNeutralFieldValue, hasActiveFilters };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
