export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return new Response("Forbidden protocol", { status: 400 });
      }

      const host = parsedUrl.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "0.0.0.0" ||
        host === "169.254.169.254" ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        host.startsWith("172.16.") || host.startsWith("172.17.") || host.startsWith("172.18.") || host.startsWith("172.19.") || host.startsWith("172.20.") || host.startsWith("172.21.") || host.startsWith("172.22.") || host.startsWith("172.23.") || host.startsWith("172.24.") || host.startsWith("172.25.") || host.startsWith("172.26.") || host.startsWith("172.27.") || host.startsWith("172.28.") || host.startsWith("172.29.") || host.startsWith("172.30.") || host.startsWith("172.31.") ||
        host.includes("metadata")
      ) {
        return new Response("Forbidden destination", { status: 403 });
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "User-Agent": "RadioAppStreamProxy/1.0",
          "Accept": "audio/mpeg, audio/*, application/json, */*",
          "Icy-MetaData": "1",
        },
      });

      const isDirectoryApi = host.endsWith(".radio-browser.info") || host === "radio-browser.info";

      if (!isDirectoryApi) {
        const contentType = response.headers.get("content-type") || "";
        const isAudio = contentType.startsWith("audio/") ||
                        contentType.includes("mpeg") ||
                        contentType.includes("ogg") ||
                        contentType.includes("aac") ||
                        contentType.includes("opus") ||
                        contentType.includes("flac") ||
                        contentType.includes("octet-stream");

        if (!isAudio) {
          return new Response("Forbidden: Non-audio content type", { status: 403 });
        }
      }

      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Expose-Headers", "icy-name, icy-genre, icy-br, icy-url");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
    } catch (e) {
      return new Response("Fetch error", { 
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },
};
