(function () {
  "use strict";

  function init() {
    var api = window.SiteAdmin;
    var lockBtn = document.getElementById("admin-lock");
    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        if (api) {
          api.lock();
        }
        location.assign((document.documentElement.getAttribute("data-baseurl") || "").replace(/\/$/, "") + "/");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
