(function () {
  "use strict";

  function statusMessage(message) {
    var status = document.getElementById("copy-status");
    if (!status) return;
    status.textContent = "";
    window.requestAnimationFrame(function () { status.textContent = message; });
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        if (!document.execCommand("copy")) throw new Error("Copy command failed");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        field.remove();
      }
    });
  }

  function copyTemplate(button) {
    var target = document.getElementById(button.getAttribute("data-copy-target"));
    var original = button.getAttribute("data-copy-label") || button.textContent.trim();
    button.setAttribute("data-copy-label", original);

    if (!target) {
      statusMessage("The template could not be found.");
      return;
    }

    var copy = navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(target.innerText)
      : fallbackCopy(target.innerText);

    copy.then(function () {
      button.textContent = "Copied";
      statusMessage("Template copied to clipboard.");
      window.setTimeout(function () { button.textContent = original; }, 2000);
    }).catch(function () {
      button.textContent = "Copy failed";
      statusMessage("Unable to copy automatically. Select the template and copy it manually.");
      window.setTimeout(function () { button.textContent = original; }, 3000);
    });
  }

  document.querySelectorAll(".copybtn[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () { copyTemplate(button); });
  });
})();
