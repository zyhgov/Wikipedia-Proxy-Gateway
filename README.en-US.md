![Chinese Wikipedia Without Proxy](https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/klutravz4w7to_7849328529d94b329559527a0dbd0da8.jpg) 
# 📘 Wikipedia Accessibility Gateway Based on Cloudflare Workers
# Chinese Wikipedia Without Proxy
# Proxy Free Chinese Wikipedia

> **Author**: Zhang Yonghao  
> **Contact**: wikipedia@zyhorg.ac.cn  
> **Public Service URLs** (no VPN/proxy needed, access directly):  
> - Main Landing Page: https://wikipedia.zyhorg.cn/  
> - Core Service Entry: https://wikipedia.zyhorg.ac.cn/

---

## 🎯 Project Objective

Build a **zero-server, globally accelerated, auto-rewriting, edge-cached** Wikipedia access gateway, enabling users in mainland China to smoothly and fully access Wikipedia and its multimedia resources without any special network tools.

---

## ⚙️ Infrastructure Requirements

1. **Cloudflare Account** (free tier is sufficient)
2. **A Domain Connected to Cloudflare** (e.g., `zyhorg.ac.cn`)
3. **Enable Workers & Pages Services**
4. **Configure DNS + Routes + Access Policies**

---

## 📂 Detailed Deployment Process

### Step 1: Create a Cloudflare Worker

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Create application** → **Create Worker**
3. Name the Worker (e.g., `wiki-proxy-gateway`)
4. Paste the `worker.js` core code (code logic is in the "Technical Architecture" section below)
5. Save and Deploy

> ✅ **Tip**: After the first deployment, the Worker will receive a temporary subdomain (e.g., `xxx.xxx.workers.dev`), which will later be overridden by the custom domain.

---

### Step 2: Configure Custom Routes

1. In the Worker edit page, go to **Triggers** → **Routes**
2. Add a custom route:
   ```
   https://wikipedia.zyhorg.ac.cn/*
   ```
3. Save. This will direct all matching path requests to the Worker for processing.

> ⚠️ Note: The domain must already be configured in Cloudflare DNS and its status must be "Proxied" (orange cloud icon).

---

### Step 3: Configure DNS Records

1. Go to **DNS** → **Records**
2. Add a CNAME record:
   - **Name**: `vpnwiki`
   - **Target**: `your-worker-name.your-subdomain.workers.dev` (the temporary address generated after deployment in the previous step)
   - **Proxy status**: Proxied (orange cloud)

> ✅ Verification: Visiting `https://wikipedia.zyhorg.ac.cn/` should return the Wikipedia homepage, confirming that routing and the Worker are working.

---

### Step 4: Set Up Cloudflare Access (Security Hardening)

To prevent abuse, crawling, and automated attacks, it is recommended to configure an Access policy:

1. Go to **Zero Trust** → **Access** → **Applications**
2. Create a new application:
   - **Name**: Wiki Proxy Access Control
   - **Domain**: `wikipedia.zyhorg.ac.cn`
3. Configure Policy:
   - **Action**: Allow
   - **Include** → **Any valid service token** (or set IP, country, device conditions as needed)
   - (Optional) Add Bypass rules for your own debugging
4. Save and Enable

> ✅ Effect: Unauthorized access will be redirected to a login/verification page, effectively filtering malicious traffic and protecting the free quota.

---

## 🧠 Technical Architecture and Core Design

### 1. Dual-Path Processing Mechanism

- **Normal Requests** (e.g., `/wiki/...`):  
  Automatically proxied to `zh.wikipedia.org`, with `HTMLRewriter` used to stream-rewrite all resource links within the page (`href`, `src`, `srcset`, `style`, etc.), converting them to proxy paths.

- **Proxy Resource Requests** (e.g., `/__proxy__/upload.wikimedia.org/...`):  
  The Worker parses the target host and path from the URL, initiates a real request, retrieves the resource, and returns it after stripping restrictive response headers (such as CSP, X-Frame-Options).

### 2. Intelligent Caching Strategy

- **HTML Pages**: Cached for 15 minutes (`max-age=900`), balancing freshness and performance.
- **Static Resources** (images, CSS, JS, fonts, etc.): Cached for 30 days (`max-age=2592000`), significantly reducing origin requests and saving quota.
- **Edge Caching**: Utilizes `caches.default` + `cf.cacheEverything` to achieve global edge node caching.

### 3. Robustness and Fault Tolerance

- **Host Failure Circuit Breaker**: If an upstream host (e.g., `upload.wikimedia.org`) fails consecutively, the Worker adds it to a local failure list for 1 hour, avoiding repeated invalid requests.
- **Fallback Mechanism**: When a proxy request fails, it attempts to directly request the original URL (without custom headers), improving success rates.
- **Method Whitelist**: Only `GET, HEAD, POST, OPTIONS` are allowed; all other requests are rejected.
- **Friendly Error Pages**: All exceptions return structured HTML error prompts, guiding users to retry or visit the origin site.

### 4. Security and Compliance

- **Request Header Sanitization**: Removes headers like `X-Forwarded-For`, `CF-Connecting-IP` that could expose user or Cloudflare information.
- **Response Header Sanitization**: Removes restrictive headers like `Content-Security-Policy`, `X-Frame-Options` to ensure embedded page resources load normally.
- **User-Agent Spoofing**: Defaults to a common browser UA to avoid being identified as a crawler by the origin site.

---

## 🚀 Usage and Maintenance

### Direct Use (Recommended)

No deployment needed. Access the following addresses directly to experience full functionality:

- Landing Page (with instructions): https://wikipedia.zyhorg.cn/
- Core Service: https://wikipedia.zyhorg.ac.cn/

> ⚠️ The service is based on the Cloudflare free plan, with a daily limit of 100,000 requests. When the quota is exhausted, the service will automatically pause and resume the next day.

### Self-Hosted Deployment

1. Fork this project (upcoming open-source repository link)
2. Replace `PROXY_HOST` in `worker.js` with your custom domain
3. Configure DNS and routes as described in the "Deployment Process" section of this document
4. (Optional) Configure Access policies to enhance security

---

## 🤝 Acknowledgments & Support

This project is independently developed and maintained by **Zyhorg**, aiming to promote free access to knowledge. If you find this project valuable, you are welcome to support it through the following ways:

- **WeChat Sponsorship**  
  <img src="https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/wechat.jpg" alt="WeChat Sponsorship QR Code" style="zoom: 25%;" />

- **Alipay Sponsorship**  
  <img src="https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/zhifubao.jpg" alt="Alipay Sponsorship QR Code" style="zoom:25%;" />

- **Issue Feedback**: 📧 [wikipedia@zyhorg.ac.cn](mailto:wikipedia@zyhorg.ac.cn)

> 💡 Your support is the greatest motivation for me to continuously optimize and maintain this project!

---

## 📜 Copyright Notice

© 2025 Zhang Yonghao. All rights reserved.  
The code is open-sourced under the MIT License; please retain the original author's attribution when using it.

---

> **The sea embraces all rivers, for it is vast enough to hold them.**  
> — Zhang Yonghao

---
