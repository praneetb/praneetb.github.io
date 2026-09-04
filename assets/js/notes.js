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

  function folders() {
    var names = (pack && pack.folders) || [];
    if (names.length) {
      return names.slice();
    }
    var seen = {};
    notes().forEach(function (note) {
      if (note.folder) {
        seen[note.folder] = true;
      }
    });
    return Object.keys(seen).sort();
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
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
        fontFamily: "Source Sans 3, ui-sans-serif, sans-serif"
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
    var collapsed = {};
    ((pack && pack.collapsed) || []).forEach(function (name) {
      collapsed[name] = !q;
    });
    folders().forEach(function (folder) {
      var items = visible.filter(function (note) {
        return (note.folder || "") === folder;
      });
      if (!items.length && q) {
        return;
      }
      var wrap = document.createElement("div");
      wrap.className = "notes-folder" + (collapsed[folder] ? " is-collapsed" : "");
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "notes-folder-toggle";
      toggle.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>' + escapeHtml(folder);
      toggle.addEventListener("click", function () {
        wrap.classList.toggle("is-collapsed");
      });
      wrap.appendChild(toggle);
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
      wrap.appendChild(list);
      root.appendChild(wrap);
    });
    var loose = visible.filter(function (note) {
      return !note.folder;
    });
    if (loose.length) {
      var looseList = document.createElement("ul");
      looseList.className = "notes-files";
      loose.forEach(function (note) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.className = "notes-file";
        link.href = "#" + encodeURIComponent(note.id);
        link.setAttribute("data-id", note.id);
        link.textContent = note.title;
        item.appendChild(link);
        looseList.appendChild(item);
      });
      root.appendChild(looseList);
    }
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
