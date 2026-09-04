(function () {
  "use strict";

  var WIKI = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g;
  var mermaidReady = null;
  var pack = null;
  var currentId = "";

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function notes() {
    return (pack && pack.notes) || [];
  }

  var FOLDER_ORDER = ["Daily", "Projects", "People", "Travel", "Music", "Archive"];

  function folderParts(folderPath) {
    return String(folderPath || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);
  }

  function folderLabel(folderPath) {
    var parts = folderParts(folderPath);
    var segment = parts[parts.length - 1] || String(folderPath || "");
    return segment.replace(/^\d+-/, "");
  }

  function parentFolder(folderPath) {
    var parts = folderParts(folderPath);
    if (parts.length <= 1) {
      return "";
    }
    return parts.slice(0, -1).join("/");
  }

  function addFolderPrefixes(seen, folderPath) {
    var parts = folderParts(folderPath);
    var acc = "";
    var i;
    for (i = 0; i < parts.length; i += 1) {
      acc = acc ? acc + "/" + parts[i] : parts[i];
      seen[acc] = true;
    }
  }

  function allFolderPaths() {
    var seen = {};
    ((pack && pack.folders) || []).forEach(function (folder) {
      addFolderPrefixes(seen, folder);
    });
    notes().forEach(function (note) {
      if (note.folder) {
        addFolderPrefixes(seen, note.folder);
      }
    });
    return Object.keys(seen);
  }

  function compareFolders(a, b) {
    var la = folderLabel(a);
    var lb = folderLabel(b);
    var ia = FOLDER_ORDER.indexOf(la);
    var ib = FOLDER_ORDER.indexOf(lb);
    if (ia === -1 && ib === -1) {
      return a.localeCompare(b);
    }
    if (ia === -1) {
      return 1;
    }
    if (ib === -1) {
      return -1;
    }
    return ia - ib;
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\.md$/i, "")
      .replace(/[^a-z0-9/]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^-|-$/g, "");
  }

  function findNote(query) {
    var q = String(query || "").trim();
    if (!q) {
      return null;
    }
    var key = slug(q);
    var list = notes();
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (list[i].id === q || list[i].id === key || list[i].path === q) {
        return list[i];
      }
    }
    var lower = q.toLowerCase();
    for (i = 0; i < list.length; i += 1) {
      if (list[i].title.toLowerCase() === lower) {
        return list[i];
      }
    }
    for (i = 0; i < list.length; i += 1) {
      if (slug(list[i].title) === key || slug(list[i].path) === key) {
        return list[i];
      }
    }
    return null;
  }

  function wikiTargets(body) {
    var found = [];
    var seen = {};
    String(body || "").replace(WIKI, function (_, target) {
      var name = String(target || "").trim();
      var key = name.toLowerCase();
      if (name && !seen[key]) {
        seen[key] = true;
        found.push(name);
      }
      return "";
    });
    return found;
  }

  function outgoing(note) {
    return wikiTargets(note && note.body).map(findNote).filter(Boolean);
  }

  function backlinks(note) {
    if (!note) {
      return [];
    }
    return notes().filter(function (other) {
      if (other.id === note.id) {
        return false;
      }
      return wikiTargets(other.body).some(function (target) {
        var match = findNote(target);
        return match && match.id === note.id;
      });
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value + "T00:00:00");
    if (isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function inline(text) {
    var safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    safe = safe.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
    safe = safe.replace(WIKI, function (_, target, label) {
      var name = String(target || "").trim();
      var note = findNote(name);
      var textLabel = (label || name).trim();
      if (!note) {
        return '<span class="notes-wiki">' + escapeHtml(textLabel) + "</span>";
      }
      return '<a class="notes-wiki" href="#' + encodeURIComponent(note.id) + '">' + escapeHtml(textLabel) + "</a>";
    });
    return safe;
  }

  function renderTable(block) {
    var rows = block.split(/\n/).filter(Boolean);
    if (rows.length < 2) {
      return "<p>" + inline(block) + "</p>";
    }
    var html = "<table>";
    rows.forEach(function (row, index) {
      if (/^\s*\|?\s*-+/.test(row)) {
        return;
      }
      var cells = row.replace(/^\||\|$/g, "").split("|");
      var tag = index === 0 ? "th" : "td";
      html += "<tr>" + cells.map(function (cell) {
        return "<" + tag + ">" + inline(cell.trim()) + "</" + tag + ">";
      }).join("") + "</tr>";
    });
    return html + "</table>";
  }

  function renderMarkdown(body) {
    var text = String(body || "").replace(/\r\n/g, "\n").replace(/^#\s+.+\n+/, "");
    var mermaidBlocks = [];
    text = text.replace(/```mermaid\n([\s\S]*?)```/g, function (_, code) {
      mermaidBlocks.push(code.trim());
      return "\n%%MERMAID_" + (mermaidBlocks.length - 1) + "%%\n";
    });
    var chunks = text.split(/\n{2,}/);
    var html = chunks.map(function (chunk) {
      var trim = chunk.trim();
      if (!trim) {
        return "";
      }
      var mermaid = trim.match(/^%%MERMAID_(\d+)%%$/);
      if (mermaid) {
        return '<div class="notes-mermaid" data-mermaid="' + mermaid[1] + '"></div>';
      }
      if (/^\|/.test(trim)) {
        return renderTable(trim);
      }
      if (/^##\s+/.test(trim)) {
        return "<h2>" + inline(trim.replace(/^##\s+/, "")) + "</h2>";
      }
      if (/^###\s+/.test(trim)) {
        return "<h3>" + inline(trim.replace(/^###\s+/, "")) + "</h3>";
      }
      if (/^[-*]\s+/.test(trim)) {
        var items = trim.split(/\n/).map(function (line) {
          return "<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>";
        });
        return "<ul>" + items.join("") + "</ul>";
      }
      if (/^```/.test(trim)) {
        var code = trim.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
        return "<pre><code>" + escapeHtml(code) + "</code></pre>";
      }
      return "<p>" + inline(trim).replace(/\n/g, "<br>") + "</p>";
    }).join("");
    return { html: html, mermaid: mermaidBlocks };
  }

  function loadMermaid() {
    if (mermaidReady) {
      return mermaidReady;
    }
    mermaidReady = new Promise(function (resolve) {
      if (window.mermaid) {
        resolve(window.mermaid);
        return;
      }
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";
      script.onload = function () {
        resolve(window.mermaid);
      };
      script.onerror = function () {
        resolve(null);
      };
      document.head.appendChild(script);
    });
    return mermaidReady;
  }

  function renderMermaid(root, blocks) {
    var nodes = root.querySelectorAll("[data-mermaid]");
    if (!nodes.length) {
      return;
    }
    loadMermaid().then(function (mermaid) {
      if (!mermaid) {
        nodes.forEach(function (node) {
          node.textContent = blocks[Number(node.getAttribute("data-mermaid"))] || "";
        });
        return;
      }
      var siteTheme = document.documentElement.getAttribute("data-theme");
      mermaid.initialize({
        startOnLoad: false,
        theme: siteTheme === "cadence" ? "dark" : "neutral",
        securityLevel: "strict",
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-ui") || "DM Sans, ui-sans-serif, sans-serif"
      });
      nodes.forEach(function (node, index) {
        var code = blocks[Number(node.getAttribute("data-mermaid"))];
        if (!code) {
          return;
        }
        var id = "notes-mmd-" + Date.now() + "-" + index;
        mermaid.render(id, code).then(function (result) {
          node.innerHTML = result.svg;
        }).catch(function () {
          node.textContent = code;
        });
      });
    });
  }

  function linkList(root, items, empty) {
    root.replaceChildren();
    if (!items.length) {
      var muted = document.createElement("p");
      muted.className = "notes-muted";
      muted.textContent = empty;
      root.appendChild(muted);
      return;
    }
    var list = document.createElement("ul");
    list.className = "notes-link-list";
    items.forEach(function (note) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + encodeURIComponent(note.id);
      link.textContent = note.title;
      item.appendChild(link);
      list.appendChild(item);
    });
    root.appendChild(list);
  }

  function showNote(note) {
    var empty = el("notes-empty");
    var doc = el("notes-doc");
    var title = el("notes-title");
    var meta = el("notes-meta");
    var body = el("notes-body");
    currentId = note ? note.id : "";
    document.querySelectorAll(".notes-file").forEach(function (link) {
      link.classList.toggle("is-active", note && link.getAttribute("data-id") === note.id);
    });
    if (!note) {
      if (empty) {
        empty.hidden = false;
      }
      if (doc) {
        doc.hidden = true;
      }
      linkList(el("notes-outgoing"), [], "None");
      linkList(el("notes-backlinks"), [], "None");
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (doc) {
      doc.hidden = false;
    }
    if (title) {
      title.textContent = note.title;
    }
    if (meta) {
      meta.textContent = [note.folder || "Vault", formatDate(note.updated) ? "Updated " + formatDate(note.updated) : ""]
        .filter(Boolean)
        .join(" · ");
    }
    var rendered = renderMarkdown(note.body);
    if (body) {
      body.innerHTML = rendered.html;
      renderMermaid(body, rendered.mermaid);
    }
    linkList(el("notes-outgoing"), outgoing(note), "None");
    linkList(el("notes-backlinks"), backlinks(note), "None");
    document.title = note.title + " · Notes · Praneet Bachheti";
  }

  function defaultNote() {
    return findNote("Site redesign") || notes()[0] || null;
  }

  function noteFromHash() {
    var raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    return findNote(raw) || defaultNote();
  }

  function matchesQuery(note, query) {
    if (!query) {
      return true;
    }
    var hay = (note.title + " " + note.path + " " + note.body).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function buildTree(visible) {
    var folderSet = allFolderPaths();
    var nodes = {};
    folderSet.forEach(function (folderPath) {
      nodes[folderPath] = { path: folderPath, children: [], notes: [] };
    });
    var roots = [];
    folderSet.forEach(function (folderPath) {
      var parent = parentFolder(folderPath);
      if (parent && nodes[parent]) {
        nodes[parent].children.push(folderPath);
      } else {
        roots.push(folderPath);
      }
    });
    visible.forEach(function (note) {
      var folder = note.folder || "";
      if (folder && nodes[folder]) {
        nodes[folder].notes.push(note);
      }
    });
    folderSet.forEach(function (folderPath) {
      nodes[folderPath].children.sort(compareFolders);
      nodes[folderPath].notes.sort(function (a, b) {
        return a.title.localeCompare(b.title);
      });
    });
    roots.sort(compareFolders);
    return { roots: roots, nodes: nodes };
  }

  function folderHasVisibleNotes(folderPath, nodes) {
    var node = nodes[folderPath];
    if (!node) {
      return false;
    }
    if (node.notes.length) {
      return true;
    }
    return node.children.some(function (child) {
      return folderHasVisibleNotes(child, nodes);
    });
  }

  function appendNoteList(parent, items) {
    if (!items.length) {
      return;
    }
    var list = document.createElement("ul");
    list.className = "notes-files";
    items.forEach(function (note) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.className = "notes-file" + (note.id === currentId ? " is-active" : "");
      link.href = "#" + encodeURIComponent(note.id);
      link.setAttribute("data-id", note.id);
      link.textContent = note.title;
      item.appendChild(link);
      list.appendChild(item);
    });
    parent.appendChild(list);
  }

  function collapsedMap(query) {
    var collapsed = {};
    var searching = !!query;
    var listed = (pack && pack.collapsed) || [];
    allFolderPaths().forEach(function (folderPath) {
      var base = folderParts(folderPath).pop();
      if (!searching && (listed.indexOf(folderPath) !== -1 || listed.indexOf(base) !== -1)) {
        collapsed[folderPath] = true;
      }
    });
    return collapsed;
  }

  function renderFolderNode(folderPath, nodes, collapsed, query) {
    if (query && !folderHasVisibleNotes(folderPath, nodes)) {
      return null;
    }
    var node = nodes[folderPath];
    var wrap = document.createElement("div");
    var isCollapsed = !!collapsed[folderPath];
    wrap.className = "notes-folder" + (isCollapsed ? " is-collapsed" : "");
    wrap.setAttribute("data-folder", folderPath);
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "notes-folder-toggle";
    toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    toggle.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>' + escapeHtml(folderLabel(folderPath));
    toggle.addEventListener("click", function () {
      var next = wrap.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", next ? "false" : "true");
    });
    wrap.appendChild(toggle);
    var children = document.createElement("div");
    children.className = "notes-folder-children";
    node.children.forEach(function (childPath) {
      var child = renderFolderNode(childPath, nodes, collapsed, query);
      if (child) {
        children.appendChild(child);
      }
    });
    appendNoteList(children, node.notes);
    wrap.appendChild(children);
    return wrap;
  }

  function renderTree(query) {
    var root = el("notes-tree");
    var count = el("notes-count");
    if (!root) {
      return;
    }
    root.replaceChildren();
    var q = String(query || "").trim().toLowerCase();
    var visible = notes().filter(function (note) {
      return matchesQuery(note, q);
    });
    var tree = buildTree(visible);
    var collapsed = collapsedMap(q);
    tree.roots.forEach(function (folderPath) {
      var node = renderFolderNode(folderPath, tree.nodes, collapsed, q);
      if (node) {
        root.appendChild(node);
      }
    });
    var loose = visible.filter(function (note) {
      return !note.folder;
    });
    appendNoteList(root, loose);
    if (count) {
      var total = notes().length;
      count.textContent = total === 1 ? "1 note" : total + " notes";
    }
  }

  function openFromHash() {
    showNote(noteFromHash());
  }

  function start() {
    var api = admin();
    pack = api && api.isUnlocked() ? api.getNotes() : { notes: [], folders: [], collapsed: [] };
    renderTree(el("notes-search") ? el("notes-search").value : "");
    openFromHash();
  }

  function init() {
    var search = el("notes-search");
    if (search) {
      search.addEventListener("input", function () {
        renderTree(search.value);
      });
    }
    window.addEventListener("hashchange", openFromHash);
    start();
    if (admin() && typeof admin().onChange === "function") {
      admin().onChange(function (unlocked) {
        if (unlocked) {
          start();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
