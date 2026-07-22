import html from "./index.html?raw";
import data from "./data/dashboard.json?raw";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/data/dashboard.json")) {
      return new Response(data, {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
};
