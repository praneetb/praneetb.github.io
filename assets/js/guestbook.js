(function () {
  "use strict";

  function statusNode() {
    return document.getElementById("diary-form-status");
  }

  function setStatus(message, isError) {
    var node = statusNode();
    if (!node) {
      return;
    }
    node.hidden = !message;
    node.textContent = message || "";
    node.classList.toggle("is-error", !!isError);
  }

  function thanksCopy() {
    return "Thanks — your note is with the keeper of the diary. It appears here after Praneet publishes it.";
  }

  function init() {
    var form = document.getElementById("diary-form");
    if (!form) {
      return;
    }
    var endpoint = (form.getAttribute("action") || "").trim();
    var button = form.querySelector("button[type='submit']");

    form.addEventListener("submit", function (event) {
      var honeypot = form.querySelector("[name='website']");
      if (honeypot && honeypot.value) {
        event.preventDefault();
        form.reset();
        setStatus(thanksCopy(), false);
        return;
      }
      if (!endpoint) {
        event.preventDefault();
        setStatus("Diary intake not configured.", true);
        return;
      }
      if (typeof fetch !== "function") {
        return;
      }
      event.preventDefault();
      var body = new FormData(form);
      body.delete("website");
      setStatus("", false);
      if (button) {
        button.disabled = true;
      }
      fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: body
      })
        .then(function (response) {
          if (response.ok) {
            form.reset();
            setStatus(thanksCopy(), false);
            return;
          }
          return response.json().then(
            function (payload) {
              var err = (payload && (payload.error || payload.message)) || "Could not send the note.";
              throw new Error(typeof err === "string" ? err : "Could not send the note.");
            },
            function () {
              throw new Error("Could not send the note. Try again in a moment.");
            }
          );
        })
        .catch(function (error) {
          setStatus(error.message || "Could not send the note. Try again in a moment.", true);
        })
        .then(function () {
          if (button) {
            button.disabled = false;
          }
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
