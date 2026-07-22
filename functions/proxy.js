const DEFAULT_ALLOWED_ORIGIN_SUFFIXES = ["static-fm.pages.dev", "localhost", "127.0.0.1"];

function isAllowedOrigin(originHeader, env) {
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
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("0.") ||
    host === "0.0.0.0" ||
    host.startsWith("169.254.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.includes("metadata")
  ) {
    return true;
  }
  const m172 = host.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const octet = parseInt(m172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
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

async function guardedFetch(startUrl, headers, maxHops = 3) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const u = new URL(currentUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { blocked: true };
    if (isBlockedHost(u.hostname)) return { blocked: true };

    const res = await fetch(currentUrl, { method: "GET", headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { response: res };
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }
    return { response: res };
  }
  return { tooManyRedirects: true };
}

export async function onRequest(context) {
  const { request, env } = context;

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
    const range = request.headers.get("Range");
    const upstreamHeaders = {
      "User-Agent": "RadioAppStreamProxy/1.0",
      "Accept": "audio/mpeg, audio/*, application/json, */*",
    };
    if (range) upstreamHeaders["Range"] = range;

    const result = await guardedFetch(targetUrl, upstreamHeaders);
    if (result.blocked) {
      return new Response("Forbidden destination", { status: 403 });
    }
    if (result.tooManyRedirects || !result.response) {
      return new Response("Too many redirects", { status: 502 });
    }
    const response = result.response;

    const isDirectoryApi =
      host.endsWith(".radio-browser.info") || host === "radio-browser.info";
    if (!isDirectoryApi) {
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const isAudio =
        contentType === "" ||
        contentType.startsWith("audio/") ||
        contentType.includes("mpeg") ||
        contentType.includes("ogg") ||
        contentType.includes("aac") ||
        contentType.includes("opus") ||
        contentType.includes("flac") ||
        contentType.includes("octet-stream") ||
        contentType.includes("x-scpls") ||
        contentType.includes("x-mpegurl");
      if (!isAudio) {
        return new Response("Forbidden: Non-audio content type", { status: 403 });
      }
    }

    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set(
      "Access-Control-Expose-Headers",
      "icy-name, icy-genre, icy-br, icy-url, Content-Range, Accept-Ranges"
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return new Response("Fetch error", {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
