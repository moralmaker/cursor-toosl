import { installDemoApi } from "./api";

installDemoApi();

const params = new URLSearchParams(window.location.search);
const locale = params.get("locale") === "en-US" ? "en-US" : "zh-CN";
const theme = params.get("theme") === "default-light" ? "default-light" : "default-dark";

document.documentElement.dataset.platform = "macos";
localStorage.setItem("cursor-tools.locale", locale);
localStorage.setItem("cursor-tools.theme", theme);

void import("../index");
