// Stream / directory proxy for the radio app.
//
// This Worker adds CORS headers so the browser can play cross-origin audio
// streams and read the analyser data. Because it fetches arbitrary URLs, it is
// hardened against two kinds of abuse:
//   1. Third-party sites using it as a free relay  -> Origin allowlist.
//   2. SSRF to internal/link-local/metadata targets -> destination blocklist.
//
// Configure allowed caller origins with the ALLOWED_ORIGINS environment
// variable (comma-separated hostnames or ".suffix" matches). If unset, the
// defaults below are used.
const DEFAULT_ALLOWED_ORIGIN_SUFFIXES = [".pages.dev", "localhost", "127.0.0.1"];

function isAllowedOrigin(originHeader, env) {
  // Media element / same-origin requests may omit Origin and Referer; allow
  // those (the destination blocklist still applies). A cross-site request from
  // a browser always carries Origin, which is what we gate on.
  if (!originHeader) return true;
  let host;
  try {
    host = new URL(originHeader).hostname.toLowerCase();
  } catch {
    return false;
  }
  const suffixes =
    env && env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : DEFAULT_ALLOWED_ORIGIN_SUFFIXES;
  return suffixes.some((s) => {
    const bare = s.replace(/^\./, "");
    return host === bare || host.endsWith(`.${bare}`);
  });
}

function isBlockedHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host.startsWith("127.") || // 127.0.0.0/8 loopback
    host.startsWith("0.") ||
    host === "0.0.0.0" ||
    host.startsWith("169.254.") || // link-local incl. 169.254.169.254 metadata
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.includes("metadata")
  ) {
    return true;
  }

  // 172.16.0.0 – 172.31.255.255
  const m172 = host.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const octet = parseInt(m172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:10.0.0.1) pointing at private space
  if (host.includes("::ffff:")) {
    const tail = host.split("::ffff:").pop() || "";
    if (
      tail.startsWith("10.") ||
      tail.startsWith("127.") ||
      tail.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(tail)
    ) {
      return true;
    }
  }

  return false;
}

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

    const originHeader =
      request.headers.get("Origin") || request.headers.get("Referer") || "";
    if (!isAllowedOrigin(originHeader, env)) {
      return new Response("Forbidden origin", {
        status: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
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

      if (isBlockedHost(parsedUrl.hostname)) {
        return new Response("Forbidden destination", { status: 403 });
      }

      const host = parsedUrl.hostname.toLowerCase();

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "User-Agent": "RadioAppStreamProxy/1.0",
          "Accept": "audio/mpeg, audio/*, application/json, */*",
          "Icy-MetaData": "1",
        },
      });

      const isDirectoryApi =
        host.endsWith(".radio-browser.info") || host === "radio-browser.info";

      if (!isDirectoryApi) {
        const contentType = response.headers.get("content-type") || "";
        const isAudio =
          contentType.startsWith("audio/") ||
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
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
