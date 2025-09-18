![无需代理的中文维基百科](https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/klutravz4w7to_7849328529d94b329559527a0dbd0da8.jpg) "无需代理的中文维基百科")
# 📘 基于 Cloudflare Workers 的维基百科无障碍访问网关
# 无需代理的中文维基百科
# Proxy Free Chinese Wikipedia

> **作者**：杖雍皓  
> **联系方式**：wikipedia@zyhgov.cn  
> **公开服务地址**（无需梯子/科学上网，直接访问）：  
> - 主引导页：https://zyhorg.ac.cn/Wikipedia/  
> - 核心服务入口：https://vpnwiki.zyhgov.cn/

---

## 🎯 项目目标

构建一个**零服务器、全球加速、自动改写、边缘缓存**的维基百科访问网关，使中国大陆用户无需任何特殊网络工具，即可流畅、完整地访问维基百科及其多媒体资源。

---

## ⚙️ 基础设施要求

1. **Cloudflare 账户**（免费版即可）
2. **已接入 Cloudflare 的域名**（如 `zyhgov.cn`）
3. **启用 Workers 与 Pages 服务**
4. **配置 DNS + 路由 + Access 策略**

---

## 📂 部署流程详解

### 步骤 1：创建 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create application** → **Create Worker**
3. 命名 Worker（如 `wiki-proxy-gateway`）
4. 粘贴 `worker.js` 核心代码（代码逻辑见下文“技术架构”部分）
5. 保存并部署

> ✅ **提示**：首次部署后，Worker 会获得一个临时子域名（如 `xxx.xxx.workers.dev`），后续将被自定义域名覆盖。

---

### 步骤 2：配置自定义路由

1. 在 Worker 编辑页面，进入 **Triggers** → **Routes**
2. 添加自定义路由：
   ```
   https://vpnwiki.zyhgov.cn/*
   ```
3. 保存。此操作将把所有匹配该路径的请求交由 Worker 处理。

> ⚠️ 注意：域名必须已在 Cloudflare DNS 中配置且状态为“Proxied”（橙色云朵图标）。

---

### 步骤 3：配置 DNS 记录

1. 进入 **DNS** → **Records**
2. 添加一条 CNAME 记录：
   - **Name**: `vpnwiki`
   - **Target**: `your-worker-name.your-subdomain.workers.dev`（上一步部署后系统生成的临时地址）
   - **Proxy status**: Proxied（橙色云朵）

> ✅ 验证：访问 `https://vpnwiki.zyhgov.cn/` 应返回维基百科首页，证明路由与 Worker 生效。

---

### 步骤 4：设置 Cloudflare Access（安全加固）

为防止滥用、爬虫与自动化攻击，建议配置 Access 策略：

1. 进入 **Zero Trust** → **Access** → **Applications**
2. 创建新应用：
   - **Name**: Wiki Proxy Access Control
   - **Domain**: `vpnwiki.zyhgov.cn`
3. 配置策略（Policy）：
   - **Action**: Allow
   - **Include** → **Any valid service token**（或按需设置 IP、国家、设备等条件）
   - （可选）添加 Bypass 规则供自己调试
4. 保存并启用

> ✅ 效果：未授权访问将跳转至登录/验证页，有效过滤恶意流量，保护免费配额。

---

## 🧠 技术架构与核心设计

### 1. 双路径处理机制

- **普通请求**（如 `/wiki/...`）：  
  自动代理至 `zh.wikipedia.org`，并使用 `HTMLRewriter` 流式改写页面内所有资源链接（`href`, `src`, `srcset`, `style` 等），将其转换为代理路径。

- **代理资源请求**（如 `/__proxy__/upload.wikimedia.org/...`）：  
  Worker 解析路径中的目标主机与路径，发起真实请求，获取资源后返回，并剥离限制性响应头（如 CSP、X-Frame-Options）。

### 2. 智能缓存策略

- **HTML 页面**：缓存 15 分钟（`max-age=900`），平衡新鲜度与性能。
- **静态资源**（图片、CSS、JS、字体等）：缓存 30 天（`max-age=2592000`），大幅减少源站请求，节省配额。
- **边缘缓存**：利用 `caches.default` + `cf.cacheEverything`，实现全球节点缓存。

### 3. 健壮性与容错

- **Host 故障熔断**：若某上游主机（如 `upload.wikimedia.org`）连续失败，Worker 会将其加入本地失败列表 1 小时，避免重复无效请求。
- **回退机制**：当代理请求失败时，尝试直接请求原始 URL（不带自定义头），提高成功率。
- **方法白名单**：仅允许 `GET, HEAD, POST, OPTIONS`，拒绝非法请求。
- **友好错误页**：所有异常均返回结构化 HTML 错误提示，引导用户重试或访问源站。

### 4. 安全与合规

- **请求头净化**：移除 `X-Forwarded-For`, `CF-Connecting-IP` 等可能暴露用户或 Cloudflare 信息的头。
- **响应头净化**：移除 `Content-Security-Policy`, `X-Frame-Options` 等限制性头，确保页面内嵌资源正常加载。
- **User-Agent 伪装**：默认设置为常见浏览器 UA，避免被源站识别为爬虫。

---

## 🚀 使用与维护

### 直接使用（推荐）

无需部署，直接访问以下地址即可体验完整功能：

- 引导页（含说明）：https://zyhorg.ac.cn/Wikipedia/
- 核心服务：https://vpnwiki.zyhgov.cn/

> ⚠️ 服务基于 Cloudflare 免费套餐，每日限额 100,000 次请求。配额耗尽时服务将自动暂停，次日恢复。

### 自行部署

1. Fork 本项目（后续开源仓库地址）
2. 替换 `worker.js` 中的 `PROXY_HOST` 为你的自定义域名
3. 按本文档“部署流程”配置 DNS 与路由
4. （可选）配置 Access 策略增强安全性

当然可以！以下是格式规范、排版美观的 Markdown 版本，可直接复制粘贴到你的文档或 README 中：

---

## 🤝 致谢与支持

本项目由 **Zyhorg** 独立开发与维护，旨在推动知识自由获取。若您觉得项目有价值，欢迎通过以下方式支持：

- **微信赞助**  
  ![微信赞助二维码](https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/wechat.jpg  )

- **支付宝赞助**  
  ![支付宝赞助二维码](https://pub-3433f1b6996846838340064e4e5f75a4.r2.dev/images/zhifubao.jpg  )

- **问题反馈**：📧 [wikipedia@zyhgov.cn](mailto:wikipedia@zyhgov.cn)

> 💡 您的支持是我持续优化与维护本项目的最大动力！

---

✅ **说明**：

- 图片链接后多余的空格和引号已清理，避免渲染异常。
- 添加了 `📧` 邮件图标与 `mailto:` 链接，提升交互体验。
- 使用引用块强调“支持动力”，增强情感共鸣。
- 整体结构清晰，视觉层次分明，适合 GitHub / 技术文档场景。

直接使用即可，效果专业美观！

## 📜 版权声明

© 2025 Zyhorg. 保留所有权利。  
代码采用 MIT 许可证开源，使用时请保留原作者署名。

---

> **海纳百川，有容纳大。**  
> —— 杖雍皓

---
