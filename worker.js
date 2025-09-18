/**
 * worker.js - 强化版（完整、健壮、多 host 支持，优化缓存与容错）
 *
 * 功能要点回顾：
 *  - 把 *.wikipedia.org/*.wikimedia.org 的链接改写成
 *      https://替换为自己的域名/__proxy__/{host}{path}
 *    Worker 处理 /__proxy__/* 并转发到对应 host。
 *  - HTML 使用 HTMLRewriter 最小改写（包含 srcset、data-srcset、style:url() 等）。
 *  - 静态资源走边缘缓存（caches.default + cf.cacheEverything），HTML 短缓存。
 *  - 处理 Range、Referer、User-Agent，删除限制性响应头（CSP/COOP/CORP/X-Frame-Options 等）。
 *  - 当 proxied 请求失败时，尝试回退到直接请求上游原始 URL（作为最后手段）。
 *  - 基本方法白名单、简易本地失效缓存、友好错误页。
 *
 * 请结合 Cloudflare 仪表盘的 DNS/Routes/Edge Certificates 配置使用（CNAME -> workers.dev，橙云开启）。
 */

const PROXY_HOST = '替换为自己的域名';
const DEFAULT_ORIGIN = 'zh.wikipedia.org';
const PROXY_PREFIX = '/__proxy__/';

// 缓存与性能调优（按需调整）
const TTL_HTML = 60 * 15;           // HTML 缓存 15 分钟
const TTL_ASSET_SHORT = 60 * 60 * 12; // 静态资源短缓存 12 小时
const TTL_ASSET_LONG = 60 * 60 * 24 * 30; // 静态资源长缓存 30 天

// 允许的方法
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

// 简易内存失败缓存（仅在当前 Worker 实例存活期间有效）
const hostFailureMap = new Map(); // host -> timestamp of last failure

// 多久认为 host 恢复？（秒）
const HOST_FAILURE_TTL = 60 * 60; // 1 hour

addEventListener('fetch', event => {
  event.respondWith(mainHandler(event.request));
});

async function mainHandler(request) {
  try {
    // 方法限制
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // health check
    if (url.pathname === '/__wiki_proxy_ping') return new Response('ok', { status: 200 });

    // If proxy prefix, forward to specific upstream host
    if (url.pathname.startsWith(PROXY_PREFIX)) {
      return await handleProxyUpstream(request, url);
    }

    // Otherwise handle site request (html vs assets)
    return await handleSiteRequest(request, url);

  } catch (err) {
    // Unexpected error -> return friendly page
    return errorPage('Unexpected server error: ' + (err && err.message ? err.message : String(err)));
  }
}

/* -------------------- proxy upstream (/__proxy__/host/...) -------------------- */
async function handleProxyUpstream(request, url) {
  // e.g. /__proxy__/upload.wikimedia.org/wikipedia/commons/...
  try {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts[0] !== '__proxy__') {
      return new Response('Bad proxy path', { status: 400 });
    }

    const hostname = parts[1];
    // Basic safety: hostname must look like a host (letters, digits, dots, hyphens)
    if (!/^[a-z0-9.-]+$/i.test(hostname)) {
      return new Response('Invalid host in proxy path', { status: 400 });
    }

    const path = '/' + parts.slice(2).join('/');
    const target = `https://${hostname}${path}${url.search}`;

    // If this host has a recent failure, fail fast to avoid wasted fetches
    if (isHostRecentlyFailed(hostname)) {
      return errorPage(`Upstream host ${hostname} recently returned errors; try again later.`);
    }

    // Build forwarded request (preserve method/body for POST)
    const forwardedReq = new Request(target, {
      method: request.method,
      headers: prepareForwardHeaders(request.headers, hostname),
      body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
      redirect: 'follow'
    });

    const cache = caches.default;
    const cacheKey = new Request(target, { method: 'GET', headers: forwardedReq.headers }); // cache GET form
    const likelyAsset = isLikelyAsset(path);

    // For assets try edge cache first
    if (likelyAsset) {
      try {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
      } catch (e) { /* ignore cache errors */ }
    }

    // Use CF caching hints to keep things in edge
    const cfOptions = { cacheTtl: likelyAsset ? TTL_ASSET_LONG : TTL_ASSET_SHORT, cacheEverything: true };

    let fetched;
    try {
      fetched = await fetch(forwardedReq, { cf: cfOptions });
    } catch (err) {
      // mark host as failing
      markHostFailure(hostname);
      // try fallback: attempt direct fetch without our forwarded headers
      try {
        fetched = await fetch(target);
      } catch (err2) {
        markHostFailure(hostname);
        return errorPage(`Failed to fetch upstream ${hostname}: ${err2.message}`);
      }
    }

    // If upstream returned error status, mark and maybe fallback
    if (fetched.status >= 500) {
      markHostFailure(hostname);
    }

    // Clean problematic headers (CSP etc.)
    const cleanedHeaders = stripProblematicHeaders(fetched.headers);

    // Support Range requests: if origin returned 206/200, pass through
    const resp = new Response(fetched.body, {
      status: fetched.status,
      statusText: fetched.statusText,
      headers: cleanedHeaders
    });

    // Set Cache-Control for edge/downstream for successful static assets
    if (fetched.status === 200 && likelyAsset) {
      resp.headers.set('Cache-Control', `public, max-age=${TTL_ASSET_LONG}`);
      // Async cache put to avoid blocking
      eventualCachePut(cache, cacheKey, resp.clone()).catch(()=>{});
    } else if (fetched.status === 200) {
      resp.headers.set('Cache-Control', `public, max-age=${TTL_ASSET_SHORT}`);
    }

    // Add a tiny debug header (remove in production if you like)
    resp.headers.set('X-VPNWiki-Proxy', 'upstream');

    return resp;

  } catch (err) {
    return errorPage('Proxy upstream handler error: ' + (err.message || String(err)));
  }
}

/* -------------------- site request handling (HTML rewriting vs static) -------------------- */
async function handleSiteRequest(request, url) {
  const cache = caches.default;
  const accept = (request.headers.get('Accept') || '').toLowerCase();
  const acceptsHtml = accept.includes('text/html');
  const likelyAsset = isLikelyAsset(url.pathname);

  // Treat as static asset if extension or client doesn't accept HTML
  if (likelyAsset || !acceptsHtml) {
    return await fetchAndCacheOrigin(request, url, { asset: true });
  }

  // For HTML pages: try edge cache for rewritten HTML
  const cacheKey = new Request(request.url, request);
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (e) { /* ignore */ }

  // Compose origin URL (page) on DEFAULT_ORIGIN
  const originUrl = `https://${DEFAULT_ORIGIN}${url.pathname}${url.search}`;
  const forwarded = new Request(originUrl, {
    method: request.method,
    headers: prepareForwardHeaders(request.headers, DEFAULT_ORIGIN),
    body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    redirect: 'follow'
  });

  let fetched;
  try {
    fetched = await fetch(forwarded, { cf: { cacheTtl: TTL_HTML, cacheEverything: true } });
  } catch (err) {
    return errorPage('Failed to fetch origin HTML: ' + (err.message || String(err)));
  }

  const contentType = (fetched.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) {
    // Not HTML — pass through cleaned headers
    return new Response(fetched.body, {
      status: fetched.status,
      statusText: fetched.statusText,
      headers: stripProblematicHeaders(fetched.headers)
    });
  }

  // HTML: transform using HTMLRewriter
  const rewriter = new HTMLRewriter()
    .on('a', new AttrRewriter('href'))
    .on('link', new AttrRewriter('href'))
    .on('script', new AttrRewriter('src'))
    .on('img', new AttrRewriter('src'))
    .on('img', new AttrRewriter('srcset'))
    .on('img', new AttrRewriter('data-src'))
    .on('img', new AttrRewriter('data-srcset'))
    .on('source', new AttrRewriter('src'))
    .on('source', new AttrRewriter('srcset'))
    .on('video', new AttrRewriter('src'))
    .on('video', new AttrRewriter('poster'))
    .on('audio', new AttrRewriter('src'))
    .on('form', new AttrRewriter('action'))
    .on('*', new StyleAttrRewriter());

  const transformed = rewriter.transform(fetched);

  const finalResp = new Response(transformed.body, {
    status: fetched.status,
    statusText: fetched.statusText,
    headers: stripProblematicHeaders(fetched.headers)
  });

  // Cache rewritten HTML
  if (finalResp.status === 200) {
    finalResp.headers.set('Cache-Control', `public, max-age=${TTL_HTML}`);
    try { await cache.put(cacheKey, finalResp.clone()); } catch (e) { /* ignore */ }
  }

  finalResp.headers.set('X-VPNWiki-Proxy', 'html-rewritten');
  return finalResp;
}

/* -------------------- fetch origin & cache (for default origin) -------------------- */
async function fetchAndCacheOrigin(request, url, opts = {}) {
  // opts.asset = boolean
  const cache = caches.default;
  const path = url.pathname + url.search;
  const target = `https://${DEFAULT_ORIGIN}${path}`;

  // For direct asset paths that point to non-default hosts, the HTML rewrite will create /__proxy__/host/... requests.
  const forwarded = new Request(target, {
    method: 'GET', // cache key always GET for static cache
    headers: prepareForwardHeaders(request.headers, DEFAULT_ORIGIN),
    redirect: 'follow'
  });

  const cacheKey = new Request(target, forwarded);

  // try cache
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (e) { /* ignore */ }

  try {
    const cfOptions = { cacheTtl: opts.asset ? TTL_ASSET_LONG : TTL_ASSET_SHORT, cacheEverything: true };
    const fetched = await fetch(forwarded, { cf: cfOptions });
    const cleanedHeaders = stripProblematicHeaders(fetched.headers);

    const resp = new Response(fetched.body, {
      status: fetched.status,
      statusText: fetched.statusText,
      headers: cleanedHeaders
    });

    if (fetched.status === 200) {
      resp.headers.set('Cache-Control', `public, max-age=${cfOptions.cacheTtl}`);
      eventualCachePut(cache, cacheKey, resp.clone()).catch(()=>{});
    }

    resp.headers.set('X-VPNWiki-Proxy', 'origin-fetch');
    return resp;

  } catch (err) {
    return errorPage('Fetch origin asset failed: ' + (err.message || String(err)));
  }
}

/* -------------------- helpers / rewriters / util -------------------- */

// 判定疑似静态资源（基于扩展名）
function isLikelyAsset(pathname) {
  return /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|otf|map|mp4|webm|ogg|mp3|wav|flac|m4a|ogv|ogm)(\?.*)?$/i.test(pathname);
}

// AttrRewriter: 处理 href/src/action 等单 URL 属性，并处理 srcset 的描述符
class AttrRewriter {
  constructor(attrName) { this.attrName = attrName; }
  element(el) {
    try {
      const raw = el.getAttribute(this.attrName);
      if (!raw) return;
      if (isAlreadyProxied(raw)) return;

      // srcset / data-srcset: multiple items like "URL 2x, URL2 480w"
      if (this.attrName === 'srcset' || this.attrName === 'data-srcset') {
        const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
        const mapped = parts.map(part => {
          const m = part.match(/^(\S+)(\s+\S+)?$/);
          if (!m) return part;
          const urlPart = m[1];
          const desc = m[2] || '';
          const newUrl = makeProxyUrl(urlPart);
          return `${newUrl}${desc}`;
        });
        el.setAttribute(this.attrName, mapped.join(', '));
        return;
      }

      // 普通属性：单 url
      const newVal = makeProxyUrl(raw);
      if (newVal && newVal !== raw) el.setAttribute(this.attrName, newVal);
    } catch (e) {
      // ignore per-element errors
    }
  }
}

// StyleAttrRewriter: 处理内联 style 中的 url(...)
class StyleAttrRewriter {
  element(el) {
    try {
      const styleVal = el.getAttribute('style');
      if (!styleVal) return;
      const newStyle = styleVal.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (m, q, u) => {
        if (/^(data:|blob:|about:|#)/i.test(u)) return `url(${q}${u}${q})`;
        const newUrl = makeProxyUrl(u);
        return `url(${q}${newUrl}${q})`;
      });
      if (newStyle !== styleVal) el.setAttribute('style', newStyle);
    } catch (e) {
      // ignore
    }
  }
}

// 判定是否已被改写为我们的 proxy（避免重复改写）
function isAlreadyProxied(val) {
  try {
    if (!val) return false;
    if (typeof val !== 'string') return false;
    if (val.startsWith(PROXY_PREFIX)) return true;
    const u = new URL(val, `https://${DEFAULT_ORIGIN}`);
    if (u.hostname === PROXY_HOST) return true;
    if (u.pathname && u.pathname.startsWith(PROXY_PREFIX)) return true;
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 将任意 URL（相对 / 绝对 / 协议相对）解析并改写为代理路径
 *  - 对 wikipedia.org / wikimedia.org 主机改写
 *  - 对相对路径（解析成 DEFAULT_ORIGIN）也会改写成 /__proxy__/zh.wikipedia.org/...
 */
function makeProxyUrl(orig) {
  try {
    const base = `https://${DEFAULT_ORIGIN}`;
    const u = new URL(orig, base); // supports relative and protocol-relative URLs
    const host = u.hostname.toLowerCase();
    if (host.endsWith('.wikipedia.org') || host.endsWith('.wikimedia.org') || host === DEFAULT_ORIGIN) {
      // safe path join (u.pathname is already percent-encoded by URL)
      return `https://${PROXY_HOST}${PROXY_PREFIX}${host}${u.pathname}${u.search || ''}`;
    }
    // keep third-party absolute URLs unchanged
    return orig;
  } catch (e) {
    return orig;
  }
}

/* 请求头转发准备：转发大部分有用头，但去掉会影响上游识别的 hop-by-hop headers */
function prepareForwardHeaders(originalHeaders, upstreamHost) {
  const headers = new Headers();
  for (const [k, v] of originalHeaders) {
    const key = k.toLowerCase();
    if (['x-forwarded-for','cf-connecting-ip','cf-ray','via','connection','keep-alive','transfer-encoding','upgrade'].includes(key)) continue;
    if (key === 'host') continue;
    // We drop accept-encoding to let Cloudflare manage compression to avoid mismatched encodings
    if (key === 'accept-encoding') continue;
    headers.set(k, v);
  }
  // set Host to upstreamHost (some origins check Host)
  headers.set('Host', upstreamHost);
  // Prefer to forward client's Referer if present, else use upstream origin as referer
  if (!headers.has('referer') && !headers.has('referrer')) {
    headers.set('Referer', `https://${upstreamHost}/`);
  }
  // Ensure some UA exists
  if (!headers.has('user-agent')) headers.set('User-Agent', 'Mozilla/5.0 (compatible; vpnwiki-proxy/1.0)');
  return headers;
}

/* 删除限制性响应头（CSP、COOP、X-Frame-Options 等）以提高兼容性 */
function stripProblematicHeaders(origHeaders) {
  const headers = new Headers(origHeaders);
  [
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'x-frame-options'
  ].forEach(h => headers.delete(h));
  return headers;
}

/* 异步向 edge cache 写入，不阻塞主流程 */
async function eventualCachePut(cache, key, value) {
  try {
    await cache.put(key, value);
  } catch (e) {
    // ignore cache put failure
  }
}

/* 错误页面（友好提示） */
function errorPage(message) {
  const safeMsg = String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>维基百科代理不可用</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f7fb}
    .box{background:#fff;padding:26px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.08);max-width:720px;text-align:center}
    h1{margin:0 0 12px;color:#c0392b}p{color:#333;line-height:1.6}
    a{color:#0b74de}
  </style></head><body>
    <div class="box">
      <h1>维基百科代理暂时不可用</h1>
      <p>${safeMsg}</p>
      <p>你可以稍后再试，或直接访问源站：<a href="https://zh.wikipedia.org" target="_blank">https://zh.wikipedia.org</a></p>
    </div>
  </body></html>`;
  return new Response(html, { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/* -------------------- host failure cache helpers -------------------- */
function markHostFailure(hostname) {
  try {
    hostFailureMap.set(hostname, Date.now());
  } catch (e) { /* ignore */ }
}

function isHostRecentlyFailed(hostname) {
  try {
    const t = hostFailureMap.get(hostname);
    if (!t) return false;
    return (Date.now() - t) < HOST_FAILURE_TTL * 1000;
  } catch (e) {
    return false;
  }
}
