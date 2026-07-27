(function () {
  "use strict";

  function codeSearchTokens(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  }

  function codeSearchMatches(searchText, query) {
    const queryTokens = codeSearchTokens(query);
    if (queryTokens.length === 0) return true;
    const searchable = codeSearchTokens(searchText).join("");
    return queryTokens.every((token) => searchable.includes(token));
  }

  function codeSearchResultLabel(count, total, query) {
    if (!String(query ?? "").trim()) return `Showing all ${total} codes.`;
    if (count === 0) return `No codes match “${String(query).trim()}”.`;
    return `${count} ${count === 1 ? "code matches" : "codes match"} “${String(query).trim()}”.`;
  }

  function initCodeFinder(root) {
    const input = root.querySelector("#code-query");
    const clear = root.querySelector("#clear-code-query");
    const status = root.querySelector("#code-results-status");
    const noResults = root.querySelector("#code-no-results");
    const rows = [...root.querySelectorAll("[data-code-row]")];
    if (!input || !clear || !status || !noResults || rows.length === 0) return;

    const applyFilter = () => {
      const query = input.value.trim();
      let visibleCount = 0;
      for (const row of rows) {
        const visible = codeSearchMatches(row.dataset.codeSearch ?? row.textContent, query);
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      }
      clear.hidden = query.length === 0;
      noResults.hidden = visibleCount !== 0;
      status.textContent = codeSearchResultLabel(visibleCount, rows.length, query);
    };

    input.addEventListener("input", applyFilter);
    clear.addEventListener("click", () => {
      input.value = "";
      applyFilter();
      input.focus();
    });
    applyFilter();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initCodeFinder(document), { once: true });
    } else {
      initCodeFinder(document);
    }
  }

  // Expose helpers only in the document-free Node regression-test sandbox.
  if (typeof document === "undefined" && typeof globalThis !== "undefined") {
    globalThis.__getMyYesCodeFinder = {
      codeSearchTokens,
      codeSearchMatches,
      codeSearchResultLabel,
      initCodeFinder,
    };
  }
})();
