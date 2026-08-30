(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function admin() {
    return window.SiteAdmin || null;
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function money(value) {
    if (value == null || value === "") {
      return "";
    }
    return "$" + text(value);
  }

  function node(name, className, content) {
    var item = document.createElement(name);
    if (className) {
      item.className = className;
    }
    if (content != null && content !== "") {
      item.textContent = text(content);
    }
    return item;
  }

  function card(title, primary, muted) {
    var item = document.createElement("li");
    item.appendChild(node("h2", "", title));
    item.appendChild(node("p", "", primary));
    if (muted) {
      item.appendChild(node("p", "rose-muted", muted));
    }
    return item;
  }

  function renderDashboard(root, data) {
    var current = data.current || {};
    var week = data.this_week || {};
    var month = data.full_month_if_scheduled || {};
    var wrap = node("div", "rose-dashboard");

    wrap.appendChild(node("p", "kicker", "Rose"));
    wrap.appendChild(node("h1", "", "Hours and pay"));
    wrap.appendChild(node("p", "rose-balance", money(current.amount_usd)));
    wrap.appendChild(
      node(
        "p",
        "lede",
        ["Current balance through " + text(current.as_of), text(current.hours) ? text(current.hours) + " hours" : "", text(current.note)]
          .filter(Boolean)
          .join(" · ")
      )
    );

    var cards = node("ul", "rose-cards");
    cards.appendChild(
      card(
        "Rate",
        money(data.rate_usd_per_hour) ? money(data.rate_usd_per_hour) + " / hour" : "",
        data.tracking_starts ? "Tracking from " + text(data.tracking_starts) : ""
      )
    );
    cards.appendChild(
      card(
        "Running hours",
        text(current.hours) ? text(current.hours) + " hours" : "",
        current.as_of ? "Through " + text(current.as_of) : ""
      )
    );
    cards.appendChild(
      card(
        "This week",
        [text(week.hours) ? text(week.hours) + " hours" : "", money(week.amount_usd)].filter(Boolean).join(" · "),
        [text(week.label), text(week.note)].filter(Boolean).join(" · ")
      )
    );
    cards.appendChild(
      card(
        "Full month",
        [text(month.hours) ? text(month.hours) + " hours" : "", money(month.amount_usd)].filter(Boolean).join(" · "),
        text(month.note)
      )
    );
    wrap.appendChild(cards);

    var scheduleSection = node("section", "rose-section");
    scheduleSection.setAttribute("aria-labelledby", "rose-schedule-heading");
    scheduleSection.appendChild(node("h2", "", "Weekly schedule")).id = "rose-schedule-heading";
    var scheduleNote = [text(data.weekly_hours) ? text(data.weekly_hours) + " hours" : "", money(data.weekly_amount_usd) ? money(data.weekly_amount_usd) + " each week" : ""]
      .filter(Boolean)
      .join(" / ");
    if (scheduleNote) {
      scheduleSection.appendChild(node("p", "rose-muted", scheduleNote));
    }
    var schedule = node("ul", "rose-schedule");
    (data.schedule || []).forEach(function (slot) {
      schedule.appendChild(node("li", "", [text(slot.day), text(slot.hours) ? text(slot.hours) + "h" : ""].filter(Boolean).join(" ")));
    });
    scheduleSection.appendChild(schedule);
    wrap.appendChild(scheduleSection);

    var paymentsSection = node("section", "rose-section");
    paymentsSection.setAttribute("aria-labelledby", "rose-payments-heading");
    paymentsSection.appendChild(node("h2", "", "Payments")).id = "rose-payments-heading";
    var payments = data.payments || [];
    if (!payments.length) {
      paymentsSection.appendChild(node("p", "empty", "None recorded."));
    } else {
      var payList = node("ul", "place-list");
      payments.forEach(function (payment) {
        var item = document.createElement("li");
        item.appendChild(node("p", "place-name", money(payment.amount_usd)));
        item.appendChild(node("p", "place-meta", [text(payment.date), text(payment.note)].filter(Boolean).join(" · ")));
        payList.appendChild(item);
      });
      paymentsSection.appendChild(payList);
    }
    wrap.appendChild(paymentsSection);

    var sessionsSection = node("section", "rose-section");
    sessionsSection.setAttribute("aria-labelledby", "rose-sessions-heading");
    sessionsSection.appendChild(node("h2", "", "Sessions")).id = "rose-sessions-heading";
    var tableWrap = node("div", "rose-table-wrap");
    var table = node("table", "rose-table");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    ["Date", "Day", "Hours", "Amount", "Status", "Note"].forEach(function (label, index) {
      var th = node("th", index === 2 || index === 3 ? "num" : "", label);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    (data.sessions || []).forEach(function (session) {
      var row = document.createElement("tr");
      row.appendChild(node("td", "", session.date));
      row.appendChild(node("td", "", session.weekday));
      row.appendChild(node("td", "num", text(session.hours) ? text(session.hours) + "h" : ""));
      row.appendChild(node("td", "num", money(session.amount_usd)));
      var statusCell = document.createElement("td");
      var status = node(
        "span",
        "rose-status" + (session.status === "scheduled" ? " rose-status-scheduled" : ""),
        session.status
      );
      statusCell.appendChild(status);
      row.appendChild(statusCell);
      row.appendChild(node("td", "rose-note", session.note));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    sessionsSection.appendChild(tableWrap);
    wrap.appendChild(sessionsSection);

    var toolbar = node("p", "rose-toolbar");
    var lockBtn = node("button", "rose-lock-btn", "Lock");
    lockBtn.type = "button";
    lockBtn.id = "rose-lock";
    lockBtn.addEventListener("click", onLock);
    toolbar.appendChild(lockBtn);
    wrap.appendChild(toolbar);

    root.replaceChildren(wrap);
  }

  function showDashboard(ledger) {
    var gate = el("rose-gate");
    var root = el("rose-dashboard-root");
    var data = ledger || (admin() && admin().getLedger());
    if (!root || !data) {
      showLock(false);
      return;
    }
    renderDashboard(root, data);
    root.hidden = false;
    if (gate) {
      gate.hidden = true;
    }
  }

  function showLock(unconfigured) {
    var gate = el("rose-gate");
    var form = el("rose-gate-form");
    var status = el("rose-gate-status");
    var error = el("rose-gate-error");
    var root = el("rose-dashboard-root");
    var button = form ? form.querySelector("button[type='submit']") : null;
    if (root) {
      root.hidden = true;
      root.replaceChildren();
    }
    if (gate) {
      gate.hidden = false;
    }
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    if (button) {
      button.disabled = false;
      button.textContent = "Unlock";
    }
    if (unconfigured) {
      if (status) {
        status.textContent = "This gate is not configured yet.";
      }
      if (form) {
        form.hidden = true;
      }
      return;
    }
    if (status) {
      status.textContent = "Enter the password to continue.";
    }
    if (form) {
      form.hidden = false;
    }
  }

  function stayLocked(message) {
    var error = el("rose-gate-error");
    var input = el("rose-password");
    var root = el("rose-dashboard-root");
    var form = el("rose-gate-form");
    var button = form ? form.querySelector("button[type='submit']") : null;
    if (root) {
      root.hidden = true;
    }
    if (button) {
      button.disabled = false;
      button.textContent = "Unlock";
    }
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function onLock() {
    var api = admin();
    if (api) {
      api.lock();
    }
    showLock(false);
  }

  async function onSubmit(event) {
    event.preventDefault();
    var api = admin();
    var form = el("rose-gate-form");
    var button = form ? form.querySelector("button[type='submit']") : null;
    if (!api) {
      stayLocked("This gate is not configured yet.");
      return;
    }
    var input = el("rose-password");
    var password = input ? input.value : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Unlocking…";
    }
    var result = await api.tryUnlock(password);
    if (result.unconfigured) {
      showLock(true);
      return;
    }
    if (!result.ok) {
      stayLocked("That password is not correct.");
      return;
    }
    if (input) {
      input.value = "";
    }
    if (button) {
      button.disabled = false;
      button.textContent = "Unlock";
    }
    showDashboard(result.ledger);
  }

  function init() {
    var api = admin();
    if (!api) {
      showLock(true);
      return;
    }
    if (api.isUnlocked() && api.getLedger()) {
      showDashboard(api.getLedger());
    } else {
      showLock(false);
    }
    var form = el("rose-gate-form");
    if (form) {
      form.addEventListener("submit", onSubmit);
    }
    if (api && typeof api.onChange === "function") {
      api.onChange(function (unlocked) {
        if (unlocked && api.getLedger()) {
          showDashboard(api.getLedger());
        } else {
          showLock(false);
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
