(function () {
  "use strict";

  var dialog;
  var titleEl;
  var frame;
  var statusEl;
  var downloadLink;
  var closeBtn;
  var signinBtn;
  var lastTrigger = null;
  var objectUrl = null;
  var pendingId = "";

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function revokeViewerUrl() {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        // Best-effort cleanup.
      }
      objectUrl = null;
    }
  }

  function setStatus(message, kind) {
    if (!statusEl) {
      return;
    }
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", kind === "error");
    if (signinBtn) {
      signinBtn.hidden = kind !== "reauth";
    }
  }

  function setFrame(url, title) {
    if (!frame) {
      return;
    }
    if (url) {
      frame.src = url;
      frame.title = title || "Report PDF";
      frame.hidden = false;
    } else {
      frame.removeAttribute("src");
      frame.hidden = true;
    }
  }

  function setDownload(url, filename) {
    if (!downloadLink) {
      return;
    }
    if (url) {
      downloadLink.href = url;
      downloadLink.download = filename || "report.pdf";
      downloadLink.hidden = false;
    } else {
      downloadLink.removeAttribute("href");
      downloadLink.removeAttribute("download");
      downloadLink.hidden = true;
    }
  }

  function focusables() {
    if (!dialog) {
      return [];
    }
    return Array.prototype.slice.call(
      dialog.querySelectorAll('button:not([hidden]), a[href]:not([hidden])')
    ).filter(function (node) {
      return !node.disabled && node.getAttribute("aria-hidden") !== "true";
    });
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !dialog || !dialog.open) {
      return;
    }
    var nodes = focusables();
    if (!nodes.length) {
      return;
    }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeDialog() {
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      onClosed();
    }
  }

  function onClosed() {
    pendingId = "";
    revokeViewerUrl();
    setFrame("");
    setDownload("");
    setStatus("");
    if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
    lastTrigger = null;
  }

  function openDialogShell(title) {
    if (!dialog) {
      return;
    }
    if (titleEl) {
      titleEl.textContent = title || "Report";
    }
    setFrame("");
    setDownload("");
    setStatus("Opening report…", "loading");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute("open", "open");
    }
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  async function showReport(id, title, trigger) {
    var gate = admin();
    lastTrigger = trigger || lastTrigger;
    pendingId = id;
    openDialogShell(title);
    if (!gate || typeof gate.getManyaReportBlob !== "function") {
      setStatus("Reports are not available on this site yet.", "error");
      return;
    }
    if (typeof gate.awaitReportsReady === "function") {
      await gate.awaitReportsReady();
    } else if (typeof gate.getManyaReportBlob === "function") {
      await gate.getManyaReportBlob(id);
    }
    if (pendingId !== id) {
      return;
    }
    var blob = await gate.getManyaReportBlob(id);
    if (pendingId !== id) {
      return;
    }
    if (!blob) {
      var unlocked = typeof gate.isUnlocked === "function" && gate.isUnlocked();
      var missingForId = false;
      if (typeof gate.needsManyaReport === "function") {
        missingForId = await gate.needsManyaReport(id);
      }
      if (pendingId !== id) {
        return;
      }
      // Stale sessions can have other report blobs (school cards) while a
      // later pack id (SAT/PSAT) is missing. Always ask to sign in again —
      // do not claim the id was never published.
      if (
        unlocked ||
        missingForId ||
        (typeof gate.needsManyaReportsUnlock === "function" && gate.needsManyaReportsUnlock())
      ) {
        setStatus("Sign in again to decrypt this report on this device.", "reauth");
        return;
      }
      setStatus("Reports are not available on this site yet.", "error");
      return;
    }
    revokeViewerUrl();
    objectUrl = URL.createObjectURL(blob);
    var meta = gate.getManyaReportMeta ? gate.getManyaReportMeta(id) : null;
    var filename = (meta && meta.filename) || "report.pdf";
    var label = (meta && meta.title) || title || "Report";
    if (titleEl) {
      titleEl.textContent = label;
    }
    setStatus("");
    setFrame(objectUrl, label);
    setDownload(objectUrl, filename);
  }

  function cardTitle(card) {
    return card.getAttribute("data-report-title") || "Report";
  }

  function onCardActivate(event) {
    var drive = event.target.closest(".manya-report-drive");
    if (drive) {
      return;
    }
    var card = event.target.closest(".manya-report[data-report-id]");
    if (!card) {
      return;
    }
    event.preventDefault();
    var trigger = event.target.closest("[data-view-report]") || card.querySelector("[data-view-report]") || card;
    showReport(card.getAttribute("data-report-id"), cardTitle(card), trigger);
  }

  function onCardKey(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    if (event.target.closest(".manya-report-drive")) {
      return;
    }
    var card = event.target.closest(".manya-report[data-report-id]");
    if (!card || event.target !== card) {
      return;
    }
    event.preventDefault();
    showReport(card.getAttribute("data-report-id"), cardTitle(card), card);
  }

  function init() {
    dialog = el("manya-report-dialog");
    titleEl = el("manya-report-dialog-title");
    frame = el("manya-report-frame");
    statusEl = el("manya-report-status");
    downloadLink = el("manya-report-download");
    closeBtn = el("manya-report-close");
    signinBtn = el("manya-report-signin");
    var lists = document.querySelectorAll(".manya-report-stage, .manya-reports");
    if (!dialog || !lists.length) {
      return;
    }
    Array.prototype.forEach.call(lists, function (list) {
      list.addEventListener("click", onCardActivate);
      list.addEventListener("keydown", onCardKey);
    });
    if (closeBtn) {
      closeBtn.addEventListener("click", closeDialog);
    }
    if (signinBtn) {
      signinBtn.addEventListener("click", function () {
        closeDialog();
        if (admin() && admin().requestSignIn) {
          admin().requestSignIn();
        }
      });
    }
    dialog.addEventListener("close", onClosed);
    dialog.addEventListener("cancel", function () {
      // Native Esc already closes <dialog>; keep cleanup on close.
    });
    dialog.addEventListener("keydown", trapFocus);
    var gate = admin();
    if (gate && typeof gate.onChange === "function") {
      gate.onChange(function (unlocked) {
        if (!unlocked) {
          closeDialog();
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
