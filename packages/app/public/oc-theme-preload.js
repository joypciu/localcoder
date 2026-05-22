;(function () {
  var key = "localcoder-theme-id"
  var themeId = localStorage.getItem(key) || "cursor"

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("localcoder-theme-css-light")
    localStorage.removeItem("localcoder-theme-css-dark")
  }

  if (themeId === "oc-2" && !localStorage.getItem("localcoder-rebrand-v1")) {
    themeId = "cursor"
    localStorage.setItem(key, themeId)
    localStorage.setItem("localcoder-rebrand-v1", "1")
    localStorage.removeItem("localcoder-theme-css-light")
    localStorage.removeItem("localcoder-theme-css-dark")
  }

  if (themeId === "localcoder" && !localStorage.getItem("localcoder-cursor-default-v2")) {
    themeId = "cursor"
    localStorage.setItem(key, themeId)
    localStorage.setItem("localcoder-cursor-default-v2", "1")
    localStorage.removeItem("localcoder-theme-css-light")
    localStorage.removeItem("localcoder-theme-css-dark")
  }

  var scheme = localStorage.getItem("localcoder-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  if (themeId === "cursor" || themeId === "localcoder" || themeId === "oc-2") return

  var css = localStorage.getItem("localcoder-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "localcoder-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
