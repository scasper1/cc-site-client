/*
  Credibility Compass – Site Embed Client

  Features
  - Lightweight analytics:
      - Respects Do Not Track + optional consent gate
      - Visitor + session IDs, UTM capture, referrer trail
      - Pageviews (incl. SPA navigations), scroll depth, click/outbound links
      - Heartbeat pings, basic performance + web-vitals, error tracking
      - Batched delivery via sendBeacon with fetch fallback and retry
  Notes
  - Fixed analytics/search base: https://api.credibilitycompass.com/api/v1
  - SVG assets (logos) are resolved relative to the script URL with a CDN fallback.
  - Adjust configuration via data-* attributes or window.CC_EMBED_OPTS.
*/

(function(){
  const W = window, D = document, N = navigator, L = location;

  // --- Find this <script> so we can read data-* attributes -------------------
  // Prefer the currently executing <script>; fall back to heuristic scan
  const scriptEl = (function(){
    if (D.currentScript) return D.currentScript;
    const scripts = D.getElementsByTagName('script');
    for (let i=scripts.length-1; i>=0; i--){
      const el = scripts[i];
      const src = el.getAttribute('src') || '';
      // Match our file name variants or explicit attributes
      if (src.includes('cc-site-client') || src.includes('cc-embed')) return el;
      if (el.hasAttribute('data-site-id') || src.includes('site-client')) return el;
    }
    return null;
  })();

  // --- Config ---------------------------------------------------------------
  const cfgAttr = (name, def=null)=> scriptEl?.getAttribute(name) ?? def;

  // Resolve base URL for companion assets (SVG logo, etc.)
  const scriptSrc = (scriptEl && scriptEl.getAttribute('src')) || '';
  const scriptBase = (function(){
    if (!scriptSrc) return '';
    try {
      const u = new URL(scriptSrc, L.href);
      const path = u.pathname.replace(/[^/]+$/, '/');
      return `${u.origin}${path}`;
    } catch {
      const i = scriptSrc.lastIndexOf('/');
      return i >= 0 ? scriptSrc.slice(0, i + 1) : '';
    }
  })();
  const cdnFallbackBase = 'https://cdn.jsdelivr.net/gh/scasper1/cc-site-client@latest/';
  const assetBase = scriptBase || cdnFallbackBase;
  const assetUrl = (file)=> assetBase + String(file || '');
  const COMPASS_AI_NAME = 'Compass AI';
  const hasAttr = (name)=> !!(scriptEl && scriptEl.hasAttribute && scriptEl.hasAttribute(name));
  
  // Normalize and derive helpers for API base → endpoints
  const normBase = (b)=>{
    if (!b) return '';
    try {
      const u = new URL(b);
      return u.href.endsWith('/') ? u.href : (u.href + '/');
    } catch { return '' }
  };
  // Fixed API base for production Credibility Compass backend.
  // All analytics, search, and campaign calls are made against this base.
  const apiBase = normBase('https://api.credibilitycompass.com/api/v1');
  const derive = (p)=>{
    if (!apiBase) return '';
    const seg = String(p||'').replace(/^\//,'');
    try { return new URL(seg, apiBase).toString().replace(/\/$/,'') } catch { return '' }
  };
  const metaSiteId = (function(){
    try { return D.querySelector('meta[name="cc-verification"]')?.getAttribute('content') || '' } catch { return '' }
  })();
  const explicitSearchAccent = hasAttr('data-search-accent') || typeof W.CC_EMBED_OPTS?.search?.accent === 'string';
  const explicitChatAccent = hasAttr('data-chat-accent') || typeof W.CC_EMBED_OPTS?.chat?.accent === 'string';
  const explicitSearchPlaceholder = hasAttr('data-search-placeholder') || typeof W.CC_EMBED_OPTS?.search?.placeholder === 'string';
  const explicitChatPlaceholder = hasAttr('data-chat-placeholder') || typeof W.CC_EMBED_OPTS?.chat?.placeholder === 'string';
  const explicitChatTitle = hasAttr('data-chat-title') || typeof W.CC_EMBED_OPTS?.chat?.title === 'string';
  const explicitChatLabel = hasAttr('data-chat-label') || typeof W.CC_EMBED_OPTS?.chat?.launcherLabel === 'string';
  const explicitChatEndpoint = hasAttr('data-chat-endpoint') || typeof W.CC_EMBED_OPTS?.chat?.endpoint === 'string';
  const cfg = {
    // Core analytics + search
    siteId: cfgAttr('data-site-id') || W.CC_EMBED_SITE_ID || W.CC_EMBED_OPTS?.siteId || metaSiteId || '',
    // Prefer explicit endpoint; otherwise derive from base (if provided)
    endpoint: cfgAttr('data-endpoint') || W.CC_EMBED_OPTS?.endpoint || derive('ingest'),
    // Optional site-key validation endpoint; when provided we verify before sending data
    validateEndpoint: cfgAttr('data-site-validate-endpoint') || W.CC_EMBED_OPTS?.validateEndpoint || '',
    // Public settings endpoint to read enabled controls from brand settings
    configEndpoint: cfgAttr('data-site-config-endpoint') || W.CC_EMBED_OPTS?.configEndpoint || derive('site/config'),

    // Search widget config (endpoint is always derived from apiBase to avoid external overrides)
    search: {
      endpoint: derive('search'),
      placeholder: cfgAttr('data-search-placeholder') || 'Search…',
      hotkey: (cfgAttr('data-search-hotkey') || 'Ctrl+K').toLowerCase(),
      enabled: cfgAttr('data-search-enabled') != null ? cfgAttr('data-search-enabled') === 'true' : (typeof W.CC_EMBED_OPTS?.search?.enabled === 'boolean' ? !!W.CC_EMBED_OPTS?.search?.enabled : false),
      accent: cfgAttr('data-search-accent') || W.CC_EMBED_OPTS?.search?.accent || '#336699', // title color
      logoLight: cfgAttr('data-search-logo-light') || assetUrl('cc-symbol-light-bg.svg'),
      logoDark: cfgAttr('data-search-logo-dark') || assetUrl('cc-symbol-dark-bg.svg'),
    },
    chat: {
      endpoint: cfgAttr('data-chat-endpoint') || W.CC_EMBED_OPTS?.chat?.endpoint || derive('chat'),
      enabled: cfgAttr('data-chat-enabled') != null ? cfgAttr('data-chat-enabled') === 'true' : (typeof W.CC_EMBED_OPTS?.chat?.enabled === 'boolean' ? !!W.CC_EMBED_OPTS?.chat?.enabled : false),
      placeholder: cfgAttr('data-chat-placeholder') || 'Ask about this website…',
      accent: cfgAttr('data-chat-accent') || W.CC_EMBED_OPTS?.chat?.accent || cfgAttr('data-search-accent') || W.CC_EMBED_OPTS?.search?.accent || '#336699',
      name: cfgAttr('data-chat-name') || W.CC_EMBED_OPTS?.chat?.name || COMPASS_AI_NAME,
      title: cfgAttr('data-chat-title') || W.CC_EMBED_OPTS?.chat?.title || `Ask ${COMPASS_AI_NAME}`,
      launcherLabel: cfgAttr('data-chat-label') || W.CC_EMBED_OPTS?.chat?.launcherLabel || `Ask ${COMPASS_AI_NAME}`,
      logoLight: cfgAttr('data-chat-logo-light') || W.CC_EMBED_OPTS?.chat?.logoLight || cfgAttr('data-search-logo-light') || assetUrl('cc-symbol-light-bg.svg'),
      logoDark: cfgAttr('data-chat-logo-dark') || W.CC_EMBED_OPTS?.chat?.logoDark || cfgAttr('data-search-logo-dark') || assetUrl('cc-symbol-dark-bg.svg'),
    },

    // Behavior
    autoInit: (cfgAttr('data-auto-init') || 'true') === 'true',
    consentRequired: (cfgAttr('data-consent-required') || 'false') === 'true',

    // Tunables
    sessionTimeoutMs: parseInt(cfgAttr('data-session-timeout-ms') || '1800000', 10), // 30m
    heartbeatMs: parseInt(cfgAttr('data-heartbeat-ms') || '30000', 10),              // 30s
    maxBatch: parseInt(cfgAttr('data-max-batch') || '20', 10),
  };

  // Debug helper (optional)
  W.__CC_EMBED_CFG__ = cfg;
  if (!cfg.siteId) { try { console.warn('[CC embed] Missing siteId. Set data-site-id or <meta name="cc-verification">'); } catch {} }

  // --- Small utils -----------------------------------------------------------
  const now = ()=> Date.now();
  const uuid = ()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
  const ls = {
    get(k, def=null){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def }catch{ return def }},
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} },
    del(k){ try{ localStorage.removeItem(k) }catch{} }
  };
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));

  // Site-key validation state
  let siteKeyOk = cfg.siteId ? null : false; // null = unknown, true = valid, false = invalid/disabled
  let siteKeyValidating = false;

  // Very small theme helper for light/dark detection
  const darkMql = (function(){
    try { return W.matchMedia && W.matchMedia('(prefers-color-scheme: dark)') } catch { return null }
  })();
  function isDarkMode(){
    try {
      const docEl = D.documentElement;
      if (docEl){
        if (docEl.classList.contains('dark')) return true;
        const themeAttr = docEl.getAttribute('data-theme') || docEl.getAttribute('data-color-mode');
        if (themeAttr && String(themeAttr).toLowerCase().includes('dark')) return true;
      }
      if (darkMql) return darkMql.matches;
    } catch {}
    return false;
  }

  // Pull enabled controls from brand settings (public config API)
  async function loadSiteUiConfig(){
    try{
      if (!cfg.siteId || !cfg.configEndpoint) return;
      const u = new URL(cfg.configEndpoint, apiBase || L.href);
      u.searchParams.set('siteId', cfg.siteId);
      const res = await fetch(u.toString(), { method:'GET', credentials:'omit' });
      if (!res.ok) return;
      const json = await res.json().catch(()=>null);
      if (!json || json.ok === false) return;
      const s = json.search || {};
      const c = json.chat || {};

      // Server-driven settings are authoritative for enable/disable flags.
      if (typeof s.enabled === 'boolean') cfg.search.enabled = !!s.enabled;
      if (typeof c.enabled === 'boolean') cfg.chat.enabled = !!c.enabled;
      if (!explicitSearchAccent && typeof s.accent === 'string' && s.accent.trim()) cfg.search.accent = s.accent.trim();
      if (!explicitChatAccent && typeof c.accent === 'string' && c.accent.trim()) cfg.chat.accent = c.accent.trim();
      if (!explicitSearchPlaceholder && typeof s.placeholder === 'string' && s.placeholder.trim()) cfg.search.placeholder = s.placeholder.trim();
      if (!explicitChatPlaceholder && typeof c.placeholder === 'string' && c.placeholder.trim()) cfg.chat.placeholder = c.placeholder.trim();
      if (!explicitChatTitle && typeof c.title === 'string' && c.title.trim()) cfg.chat.title = c.title.trim();
      if (!explicitChatLabel && typeof c.launcherLabel === 'string' && c.launcherLabel.trim()) cfg.chat.launcherLabel = c.launcherLabel.trim();
      if (!explicitChatEndpoint && typeof c.endpoint === 'string' && c.endpoint.trim()) cfg.chat.endpoint = c.endpoint.trim();
    }catch{}
  }

  // Unified context for all network calls (siteId, vid, sid, path, ts)
  function currentCtx(){
    const ctx = {
      siteId: cfg.siteId || '',
      vid: getVisitorId(),
      sid: getSessionId(),
      path: L.pathname || '',
      ts: now()
    };
    return ctx;
  }

  // Resolve URL for site-key validation
  function buildValidateUrl(){
    try{
      if (cfg.validateEndpoint){
        const u = new URL(cfg.validateEndpoint, apiBase || L.href);
        if (cfg.siteId) u.searchParams.set('siteId', cfg.siteId);
        return u.toString();
      }
    }catch{}
    // Default: fixed validation route under the API base
    try{
      if (apiBase){
        const u = new URL('site/validate', apiBase);
        if (cfg.siteId) u.searchParams.set('siteId', cfg.siteId);
        return u.toString();
      }
    }catch{}
    return '';
  }

  // Safe HTML & highlight helpers
  function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])) }
  function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
  function highlightHTML(text, q){
    const src = String(text || '');
    if (!q) return escapeHTML(src);
    const rx = new RegExp(`(${escapeRegExp(q)})`, 'ig');
    return escapeHTML(src).replace(rx, '<mark class="cc-hl">$1</mark>'); // non-destructive wrap
  }

  // --- Privacy gates ---------------------------------------------------------
  const dnt = (N.doNotTrack == '1' || N.msDoNotTrack == '1' || W.doNotTrack == '1');
  const hasConsent = ()=> !cfg.consentRequired || !!ls.get('cc_consent_granted', false);
  const readyToTrack = ()=> !dnt && hasConsent() && !!cfg.siteId && !!cfg.endpoint;

  // --- Identity (visitor + session) -----------------------------------------
  const VID_KEY = 'cc_vid';
  const SID_KEY = 'cc_sid';
  function getVisitorId(){ let id=ls.get(VID_KEY); if(!id){ id=uuid(); ls.set(VID_KEY, id) } return id }
  function getSessionId(){
    let s = ls.get(SID_KEY);
    const nowTs = now();
    if (!s || !s.id || (nowTs - (s.last || 0) > cfg.sessionTimeoutMs)){
      s = { id: uuid(), started: nowTs, last: nowTs };
    } else { s.last = nowTs }
    ls.set(SID_KEY, s); return s.id;
  }
  function touchSession(){ const s=ls.get(SID_KEY); if(s){ s.last=now(); ls.set(SID_KEY, s) } }

  // --- UTM & referrer trail --------------------------------------------------
  function parseQuery(qs){ const p={}; qs.replace(/^\?/, '').split('&').forEach(kv=>{ if(!kv) return; const [k,v]=kv.split('='); p[decodeURIComponent(k)] = decodeURIComponent(v||'') }); return p }
  const q = parseQuery(L.search || '');
  const utm = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].reduce((o,k)=>{ if(q[k]) o[k]=q[k]; return o },{});
  const REF_KEY = 'cc_ref';
  const refTrail = ls.get(REF_KEY, []);
  if (D.referrer && (!refTrail.length || refTrail[refTrail.length-1] !== D.referrer)){
    refTrail.push(D.referrer); if (refTrail.length>5) refTrail.shift(); ls.set(REF_KEY, refTrail);
  }

  // --- Site-key validation ---------------------------------------------------
  function disableTrackingForInvalidSite(){
    siteKeyOk = false;
    state.queue.length = 0;
  }
  async function validateSiteKey(){
    if (!cfg.siteId || !cfg.endpoint) { disableTrackingForInvalidSite(); return; }
    if (siteKeyOk === true || siteKeyValidating) return;
    const url = buildValidateUrl();
    if (!url){ siteKeyOk = true; return; } // no validation endpoint configured → allow
    siteKeyValidating = true;
    try{
      const res = await fetch(url, { method:'GET', credentials:'omit' });
      if (res.status === 401 || res.status === 403 || res.status === 404){
        disableTrackingForInvalidSite();
      } else {
        siteKeyOk = true;
      }
    }catch{
      // On network/other errors, fall back to allowing tracking so embed remains resilient
      siteKeyOk = true;
    }finally{
      siteKeyValidating = false;
      if (siteKeyOk) flush();
    }
  }

  // --- Event queue + transport ----------------------------------------------
  const state = { queue: [], flushing:false };
  function baseEvent(type, payload){
    return {
      t: type, ts: now(),
      sid: getSessionId(), vid: getVisitorId(),
      site: cfg.siteId,
      url: String(L.href), path: L.pathname, title: D.title,
      ref: D.referrer || null, lang: N.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      vp: { w: W.innerWidth, h: W.innerHeight },
      sc: { x: W.scrollX, y: W.scrollY },
      utm, trail: refTrail,
      payload
    };
  }
  function enqueue(type, payload){
    if (!readyToTrack()) return;              // silent no-op if not allowed
    if (siteKeyOk === false) return;          // invalid site key → drop
    state.queue.push(baseEvent(type, payload));
    if (state.queue.length >= cfg.maxBatch) flush();
  }
  function flush(){
    if (!state.queue.length) return;
    if (!readyToTrack()) return;
    if (siteKeyOk === false) return;
    if (siteKeyOk === null){
      validateSiteKey();
      return;
    }
    if (state.flushing) return;
    state.flushing = true;
    const batch = state.queue.splice(0, state.queue.length);
    const body = JSON.stringify({ events: batch });
    const blob = new Blob([body], { type: 'application/json' });

    // Prefer sendBeacon (background + unload-safe)
    let ok = false;
    try { ok = !!(N.sendBeacon && N.sendBeacon(cfg.endpoint, blob)) } catch {}
    if (!ok){
      fetch(cfg.endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body })
        .catch(()=>{ state.queue.unshift(...batch) }) // requeue on failure
        .finally(()=>{ state.flushing=false });
      return;
    }
    state.flushing=false;
  }
  function scheduleFlush(){ setTimeout(flush, 250) }

  // Unload/visibility/network hooks
  W.addEventListener('online', flush);
  W.addEventListener('beforeunload', flush, { capture:true });
  D.addEventListener('visibilitychange', ()=>{ if (D.visibilityState==='hidden') flush() });

  // --- Trackers --------------------------------------------------------------
  function trackPageview(meta){ enqueue('pageview', Object.assign({ hash: L.hash || null }, meta||{})) }
  // Public API for custom events: window.CC_EMBED.track('event_name', { ...payload })
  try {
    W.CC_EMBED = W.CC_EMBED || {};
    W.CC_EMBED.track = function(type, payload){
      try { enqueue(String(type||'custom'), payload && typeof payload==='object' ? payload : {}); scheduleFlush(); }
      catch{}
    };
  } catch {}
  function trackScroll(){
    const H=D.documentElement, B=D.body;
    const scrollTop = W.scrollY || H.scrollTop || B.scrollTop || 0;
    const docH = Math.max(B.scrollHeight, H.scrollHeight, B.offsetHeight, H.offsetHeight, B.clientHeight, H.clientHeight);
    const winH = W.innerHeight || H.clientHeight;
    const depth = Math.round(((scrollTop + winH) / docH) * 100);
    enqueue('scroll', { depth: clamp(depth,0,100) });
  }
  function trackClick(e){
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    const sameHost = href && href.indexOf(L.host) !== -1;
    enqueue('click', { href, outbound: href ? !sameHost : false, text: (a.textContent||'').trim().slice(0,120) });
  }
  function trackErrors(){
    W.addEventListener('error', (e)=> enqueue('error', { message:e.message, src:e.filename, line:e.lineno, col:e.colno }));
    W.addEventListener('unhandledrejection', (e)=> enqueue('promise_rejection', { reason:String(e.reason) }));
  }
  function heartbeat(){ enqueue('hb', { vis: D.visibilityState }) }

  // SPA hook: detect history navigation and treat as a pageview
  function hookSPA(){
    const _push = history.pushState, _replace = history.replaceState;
    function onChange(){ touchSession(); trackPageview({ spa:true }); scheduleFlush(); }
    history.pushState = function(){ _push.apply(this, arguments); onChange() };
    history.replaceState = function(){ _replace.apply(this, arguments); onChange() };
    W.addEventListener('popstate', onChange);
  }

  // Basic performance timings + web vitals (FCP/LCP if available)
  function perf(){
    if (!('performance' in W)) return;
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) enqueue('perf', { ttfb: nav.responseStart, dom: nav.domContentLoadedEventEnd, load: nav.loadEventEnd });
    } catch{}
    if ('PerformanceObserver' in W){
      try {
        const po = new PerformanceObserver((list)=>{
          for (const e of list.getEntries()){
            if (e.entryType === 'largest-contentful-paint') enqueue('web_vitals', { lcp: e.startTime });
          }
        });
        po.observe({ type:'largest-contentful-paint', buffered:true });
        const po2 = new PerformanceObserver((list)=>{
          for (const e of list.getEntries()) if (e.name==='first-contentful-paint') enqueue('web_vitals', { fcp: e.startTime });
        });
        po2.observe({ type:'paint', buffered:true });
      } catch{}
    }
  }

  // --- Search widget ---------------------------------------------------------
  function parseRgbFromColor(color){
    try{
      if (!color) return null;
      let c = String(color).trim();
      if (c.startsWith('#')){
        c = c.slice(1);
        if (c.length === 3){ c = c.split('').map(x=>x+x).join('') }
        if (c.length === 8){ c = c.slice(0,6) }
        if (c.length === 6){
          return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
        }
      }
      const m = c.match(/rgba?\s*\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
      if (m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
    }catch{}
    return null;
  }
  function computeHighlightBg(){
    const rgb = parseRgbFromColor(cfg.search?.accent || '#336699') || [51,102,153];
    const alpha = 0.15; // 15% opacity
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }
  function buildSearchStyles(){
    const hl = computeHighlightBg();
    return `
  .cc-chat-btn{position:fixed;right:16px;bottom:72px;z-index:2147483000;border:1px solid #ddd;border-radius:12px;padding:8px 12px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.12);font:500 14px/1 system-ui, -apple-system, Segoe UI, Roboto;cursor:pointer;display:inline-flex;align-items:center;gap:8px;color:#111}
  .cc-chat-btn:hover{box-shadow:0 6px 20px rgba(0,0,0,.16);border-color:#d1d5db}
  .cc-chat-logo-wrap{width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,.04);overflow:hidden;flex-shrink:0}
  .cc-chat-logo{width:18px;height:18px;display:block}
  .cc-chat-dot{width:8px;height:8px;border-radius:999px;background:${escapeHTML(cfg.chat?.accent || '#336699')};display:inline-block}
  .cc-chat-overlay{position:fixed;inset:0;background:rgba(0,0,0,.25);backdrop-filter:saturate(180%) blur(4px);z-index:2147483002;display:flex;align-items:flex-end;justify-content:flex-end;padding:20px}
  .cc-chat-panel{width:min(420px,95vw);height:min(620px,85vh);background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;border:1px solid #eee;display:flex;flex-direction:column}
  .cc-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #eee;background:#f9fafb}
  .cc-chat-title{font:600 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto;color:#111;display:flex;align-items:center;gap:8px}
  .cc-chat-close{border:0;background:transparent;color:#6b7280;cursor:pointer;font-size:18px;line-height:1}
  .cc-chat-body{flex:1;overflow:auto;padding:12px;background:#fff}
  .cc-chat-msg{margin:0 0 10px;max-width:92%}
  .cc-chat-msg-user{margin-left:auto;background:#eef2ff;border:1px solid #dbe4ff;color:#1f2937;padding:10px 12px;border-radius:12px}
  .cc-chat-msg-ai{margin-right:auto;background:#f8fafc;border:1px solid #e5e7eb;color:#111;padding:10px 12px;border-radius:12px}
  .cc-chat-text{white-space:pre-wrap}
  .cc-chat-sources{margin-top:10px;display:flex;flex-direction:column;gap:8px}
  .cc-chat-sources-title{font-size:11px;font-weight:600;letter-spacing:.02em;color:#6b7280;text-transform:uppercase}
  .cc-chat-source-card{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;background:#fff}
  .cc-chat-source-top{display:flex;align-items:flex-start;gap:8px}
  .cc-chat-source-icon{width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;margin-top:1px}
  .cc-chat-source-icon[data-kind="blog"]{background:#2563eb}
  .cc-chat-source-icon[data-kind="download"]{background:#059669}
  .cc-chat-source-icon[data-kind="page"]{background:#6b7280}
  .cc-chat-source-body{min-width:0;flex:1}
  .cc-chat-source-link{font-size:13px;font-weight:600;color:#111827;text-decoration:none;display:block;line-height:1.3}
  .cc-chat-source-link:hover{color:${escapeHTML(cfg.chat?.accent || '#336699')};text-decoration:underline}
  .cc-chat-source-snippet{margin-top:3px;font-size:12px;color:#4b5563;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cc-chat-source-snippet.is-expanded{display:block;-webkit-line-clamp:unset;overflow:visible}
  .cc-chat-source-more{margin-top:4px;border:0;background:transparent;padding:0;color:${escapeHTML(cfg.chat?.accent || '#336699')};font-size:11px;font-weight:600;cursor:pointer}
  .cc-chat-source-url{margin-top:2px;font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cc-chat-input-row{padding:10px;border-top:1px solid #eee;display:flex;gap:8px;background:#fff}
  .cc-chat-input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;outline:0;font:500 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto}
  .cc-chat-send{border:1px solid ${escapeHTML(cfg.chat?.accent || '#336699')};background:${escapeHTML(cfg.chat?.accent || '#336699')};color:#fff;border-radius:10px;padding:0 12px;cursor:pointer;font:600 13px/1 system-ui, -apple-system, Segoe UI, Roboto}
  .cc-chat-send[disabled]{opacity:.6;cursor:not-allowed}
  .cc-search-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:1px solid #ddd;border-radius:12px;padding:8px 12px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.12);font:500 14px/1 system-ui, -apple-system, Segoe UI, Roboto;cursor:pointer;display:inline-flex;align-items:center;gap:8px;color:#111}
  .cc-search-btn:hover{box-shadow:0 6px 20px rgba(0,0,0,.16);border-color:#d1d5db}
  .cc-search-logo-wrap{width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,.04);overflow:hidden;flex-shrink:0}
  .cc-search-logo{width:18px;height:18px;display:block}
  .cc-search-label{white-space:nowrap}
  .cc-search-btn kbd{margin-left:4px;padding:2px 6px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;line-height:1.2;color:#4b5563}
  .cc-search-input-row{display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid #eee;background:#f9fafb;gap:10px}
  .cc-search-input-logo-wrap{width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#fff;box-shadow:0 0 0 1px rgba(15,23,42,.04);flex-shrink:0}
  .cc-search-input-logo{width:20px;height:20px;display:block}
  .cc-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,.25);backdrop-filter:saturate(180%) blur(4px);z-index:2147483001;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh}
  .cc-search-panel{width:min(720px,92vw);background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;border:1px solid #eee}
  .cc-search-input{width:100%;border:0;outline:0;padding:8px 0;font:500 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto;background:transparent}
  .cc-search-list{max-height:60vh;overflow:auto}
  .cc-search-item{padding:12px 18px;border-bottom:1px solid #f4f4f5;cursor:pointer}
  .cc-search-item[aria-selected="true"]{background:#f5f7ff}
  .cc-search-empty{padding:16px 18px;color:#6b7280}
  .cc-search-item .cc-hl{ background:${hl}; border-radius:3px; padding:0 2px }
    `;
  }
  function injectStyle(){
    if (D.getElementById('cc-embed-style')) return;
    const s = D.createElement('style'); s.id='cc-embed-style'; s.textContent = buildSearchStyles(); D.head.appendChild(s);
  }

  function createSearch(){
    if (!cfg.search.enabled || !cfg.search.endpoint) return; // disabled or no backend
    injectStyle();

    let overlay=null, input=null, list=null, idx=-1, items=[], currentQ='';

    function open(){
      if (overlay) return; // already open
      overlay = D.createElement('div'); overlay.className='cc-search-overlay';
      const panel = D.createElement('div'); panel.className='cc-search-panel';
      const inputRow = D.createElement('div'); inputRow.className='cc-search-input-row';
      const inputLogoWrap = D.createElement('span'); inputLogoWrap.className='cc-search-input-logo-wrap';
      const inputLogoImg = D.createElement('img'); inputLogoImg.className='cc-search-input-logo'; inputLogoImg.alt='Credibility Compass';
      // Search bar logo: always use light-bg symbol so it stays clean on white
      try{
        const src = cfg.search.logoLight || cfg.search.logoDark;
        if (src) inputLogoImg.src = src;
      }catch{}
      inputLogoWrap.appendChild(inputLogoImg);

      input = D.createElement('input'); input.className='cc-search-input'; input.placeholder = cfg.search.placeholder;
      inputRow.appendChild(inputLogoWrap);
      inputRow.appendChild(input);
      list = D.createElement('div'); list.className='cc-search-list';
      panel.appendChild(inputRow); panel.appendChild(list); overlay.appendChild(panel); D.body.appendChild(overlay);
      input.focus();
      trackSearchUI('open');
      overlay.addEventListener('click', (e)=>{ if (e.target===overlay) close() }); // click outside to close
      input.addEventListener('input', onInput);                                     // fetch on input
      D.addEventListener('keydown', onKey);                                         // list nav keys
    }
    function close(){
      if (!overlay) return;
      overlay.remove(); overlay=null;
      D.removeEventListener('keydown', onKey);
      idx=-1; items=[];
      trackSearchUI('close');
    }
    function onKey(e){
      if (!overlay) return;
      if (e.key==='Escape'){ e.preventDefault(); close(); return }
      if (!items.length) return;
      if (e.key==='ArrowDown'){ idx = (idx+1)%items.length; renderList(); e.preventDefault() }
      if (e.key==='ArrowUp'){ idx = (idx-1+items.length)%items.length; renderList(); e.preventDefault() }
      if (e.key==='Enter' && idx>=0){ const it=items[idx]; selectItem(it) }
    }

    // Debounced network calls on input
    let debounce=0;
    function onInput(){
      const q = input.value.trim();
      currentQ = q;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(async ()=>{
        if (!q){ list.innerHTML='<div class="cc-search-empty">Type to search…</div>'; items=[]; idx=-1; return }
        const params = new URLSearchParams(); params.append('q', q); params.append('siteId', cfg.siteId);
        try {
          const res = await fetch(`${cfg.search.endpoint}?${params.toString()}`, { credentials:'omit' });
          const json = await res.json();
          const rows = Array.isArray(json.results) ? json.results : json.data || [];
          items = rows.slice(0, 50);
          idx = items.length ? 0 : -1;
          renderList();
          trackSearchQuery(q, items.length);
        } catch {
          list.innerHTML = '<div class="cc-search-empty">Search unavailable.</div>'; items=[]; idx=-1;
        }
      }, 150);
    }

    // Render results with highlighting + accent color
    function renderList(){
      if (!list) return;
      if (!items.length){ list.innerHTML='<div class="cc-search-empty">No results</div>'; return }
      list.innerHTML='';
      items.forEach((it, i)=>{
        const div = D.createElement('div'); div.className='cc-search-item'; div.setAttribute('role','option');
        div.setAttribute('aria-selected', String(i===idx));

        const navUrl  = it.canonicalUrl || it.url || it.href || it.path || '';
        const title   = it.title || it.name || 'Untitled';
        const snippet = it.snippet || it.url || '';

        div.innerHTML = `
          <div class="cc-title" style="font-weight:600; color:${escapeHTML(cfg.search.accent)}">
            ${highlightHTML(title, currentQ)}
          </div>
          <div class="cc-sub" style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${highlightHTML(snippet, currentQ)}
          </div>
          ${navUrl ? `<div class="cc-url" style="font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${escapeHTML(navUrl)}</div>` : ''}
        `;
        div.addEventListener('click', ()=> selectItem(it));
        list.appendChild(div);
      });
    }

    // Navigate to selected item
    function selectItem(it){
      const url = it.canonicalUrl || it.url || it.href || it.path;
      trackSearchSelect(it);
      if (url){ close(); W.location.href = url }
    }

    // Floating launcher button
    const btn = D.createElement('button'); btn.type='button'; btn.className='cc-search-btn';

    const logoWrap = D.createElement('span'); logoWrap.className='cc-search-logo-wrap';
    const logoImg = D.createElement('img'); logoImg.className='cc-search-logo'; logoImg.alt='Credibility Compass';
    function updateLogo(){
      try{
        const dark = isDarkMode();
        const src = dark ? (cfg.search.logoDark || cfg.search.logoLight) : cfg.search.logoLight;
        if (src) logoImg.src = src;
      }catch{}
    }
    updateLogo();
    if (darkMql){
      try{
        if (darkMql.addEventListener) darkMql.addEventListener('change', updateLogo);
        else if (darkMql.addListener) darkMql.addListener(updateLogo);
      }catch{}
    }
    logoWrap.appendChild(logoImg);

    const labelSpan = D.createElement('span'); labelSpan.className='cc-search-label'; labelSpan.textContent='Search';
    const kbdEl = D.createElement('kbd'); kbdEl.className='cc-search-kbd'; kbdEl.textContent='⌘/Ctrl K';

    btn.appendChild(logoWrap);
    btn.appendChild(labelSpan);
    btn.appendChild(kbdEl);

    btn.addEventListener('click', open); D.body.appendChild(btn);

    // Global hotkey (kept as your working version)
    D.addEventListener('keydown', (e)=>{
      const k = (e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k';
      if (k){ e.preventDefault(); open() }
    });

    // Search usage telemetry
    function trackSearchUI(action){ enqueue('search_ui', { action }) }
    function trackSearchQuery(q, total){ enqueue('search_query', { q, total }) }
    function trackSearchSelect(it){ enqueue('search_select', { id: it.id || null, title: it.title || it.name || null, url: it.url || it.href || null }) }
  }

  function createChat(){
    if (!cfg.chat.enabled || !cfg.chat.endpoint) return;
    injectStyle();

    let overlay = null, body = null, input = null, sendBtn = null, loading = false;
    function normalizeCitationUrl(c){
      const raw = c?.url || c?.canonicalUrl || '';
      if (!raw) return '';
      try { return new URL(raw, L.href).toString() } catch { return String(raw) }
    }
    function classifyCitation(c){
      const kind = String(c?.sourceKind || '').toLowerCase();
      if (kind === 'blog' || kind === 'download' || kind === 'page') return kind;
      const sourceType = String(c?.sourceType || '').toLowerCase();
      if (sourceType.includes('blog')) return 'blog';
      const url = String(c?.url || c?.canonicalUrl || '').toLowerCase();
      if (/\/blog(s)?\//.test(url)) return 'blog';
      if (/\/lead-magnets\//.test(url) || /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|zip)(\?|$)/.test(url)) return 'download';
      return 'page';
    }
    function sourceGlyph(kind){
      if (kind === 'blog') return 'B';
      if (kind === 'download') return 'DL';
      return 'P';
    }
    function renderCitation(c){
      const card = D.createElement('div');
      card.className = 'cc-chat-source-card';

      const top = D.createElement('div');
      top.className = 'cc-chat-source-top';

      const kind = classifyCitation(c);
      const icon = D.createElement('span');
      icon.className = 'cc-chat-source-icon';
      icon.setAttribute('data-kind', kind);
      icon.textContent = sourceGlyph(kind);
      top.appendChild(icon);

      const bodyWrap = D.createElement('div');
      bodyWrap.className = 'cc-chat-source-body';

      const href = normalizeCitationUrl(c);
      const link = D.createElement('a');
      link.className = 'cc-chat-source-link';
      link.href = href || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = c?.title || href || 'Source';
      link.addEventListener('click', ()=> enqueue('chat_citation_click', { title: c?.title || null, url: href || null, sourceKind: kind }));
      bodyWrap.appendChild(link);

      const snippet = String(c?.snippet || '').trim();
      if (snippet){
        const desc = D.createElement('div');
        desc.className = 'cc-chat-source-snippet';
        desc.textContent = snippet;
        bodyWrap.appendChild(desc);
        if (snippet.length > 170){
          const more = D.createElement('button');
          more.type = 'button';
          more.className = 'cc-chat-source-more';
          more.textContent = 'Read more';
          more.addEventListener('click', ()=>{
            const expanded = desc.classList.toggle('is-expanded');
            more.textContent = expanded ? 'Show less' : 'Read more';
          });
          bodyWrap.appendChild(more);
        }
      }

      if (href){
        const urlLine = D.createElement('div');
        urlLine.className = 'cc-chat-source-url';
        urlLine.textContent = href;
        bodyWrap.appendChild(urlLine);
      }

      top.appendChild(bodyWrap);
      card.appendChild(top);
      return card;
    }

    function appendMessage(kind, text, citations){
      if (!body) return;
      const wrap = D.createElement('div');
      wrap.className = `cc-chat-msg ${kind === 'user' ? 'cc-chat-msg-user' : 'cc-chat-msg-ai'}`;
      const textNode = D.createElement('div');
      textNode.className = 'cc-chat-text';
      textNode.textContent = text || '';
      wrap.appendChild(textNode);
      if (kind === 'ai' && Array.isArray(citations) && citations.length){
        const src = D.createElement('div');
        src.className = 'cc-chat-sources';
        const label = D.createElement('div');
        label.className = 'cc-chat-sources-title';
        label.textContent = 'Sources';
        src.appendChild(label);
        citations.slice(0, 5).forEach((c)=> src.appendChild(renderCitation(c)));
        wrap.appendChild(src);
      }
      body.appendChild(wrap);
      body.scrollTop = body.scrollHeight;
    }

    function setLoading(v){
      loading = !!v;
      if (sendBtn) sendBtn.disabled = loading;
      if (input) input.disabled = loading;
    }

    async function sendQuery(){
      if (!input || loading) return;
      const query = (input.value || '').trim();
      if (!query) return;
      appendMessage('user', query);
      enqueue('chat_query', { q: query });
      input.value = '';
      setLoading(true);
      try{
        const res = await fetch(cfg.chat.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            siteId: cfg.siteId,
            query,
            sessionId: getSessionId(),
          })
        });
        const json = await res.json().catch(()=> ({}));
        if (!res.ok && json?.error === 'chat_daily_limit_reached'){
          const retryAfter = Number(json?.retryAfter || 0);
          const hours = retryAfter > 0 ? Math.max(1, Math.ceil(retryAfter / 3600)) : null;
          const msg = hours
            ? `Daily chat limit reached for this website. Please try again in about ${hours} hour${hours > 1 ? 's' : ''}.`
            : 'Daily chat limit reached for this website. Please try again tomorrow.';
          appendMessage('ai', msg, []);
          enqueue('chat_response', { ok: false, error: 'chat_daily_limit_reached', retryAfter });
          return;
        }
        const answer = json.answer || json.message || 'I could not find a reliable answer from this website content.';
        const citations = Array.isArray(json.citations) ? json.citations : [];
        appendMessage('ai', answer, citations);
        enqueue('chat_response', { ok: res.ok, hasCitations: citations.length > 0, confidence: json.confidence ?? null });
      }catch{
        appendMessage('ai', 'Chat is temporarily unavailable. Please try again.');
        enqueue('chat_response', { ok: false, error: 'request_failed' });
      }finally{
        setLoading(false);
      }
    }

    function open(){
      if (overlay) return;
      overlay = D.createElement('div'); overlay.className = 'cc-chat-overlay';
      const panel = D.createElement('div'); panel.className = 'cc-chat-panel';
      const head = D.createElement('div'); head.className = 'cc-chat-head';
      const title = D.createElement('div'); title.className = 'cc-chat-title';
      title.innerHTML = `
        <span class="cc-chat-logo-wrap"><img class="cc-chat-logo" alt="${escapeHTML(cfg.chat.name || COMPASS_AI_NAME)}"></span>
        ${escapeHTML(cfg.chat.title)}
      `;
      const titleLogo = title.querySelector('.cc-chat-logo');
      try{
        const src = isDarkMode() ? (cfg.chat.logoDark || cfg.chat.logoLight) : cfg.chat.logoLight;
        if (titleLogo && src) titleLogo.src = src;
      }catch{}
      const closeBtn = D.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'cc-chat-close'; closeBtn.setAttribute('aria-label', 'Close chat'); closeBtn.textContent = '×';
      closeBtn.addEventListener('click', close);
      head.appendChild(title); head.appendChild(closeBtn);

      body = D.createElement('div'); body.className = 'cc-chat-body';
      appendMessage('ai', `Ask anything about this website. ${cfg.chat.name || COMPASS_AI_NAME} will answer from available page and blog content.`);

      const inputRow = D.createElement('div'); inputRow.className = 'cc-chat-input-row';
      input = D.createElement('input'); input.className = 'cc-chat-input'; input.placeholder = cfg.chat.placeholder;
      sendBtn = D.createElement('button'); sendBtn.type = 'button'; sendBtn.className = 'cc-chat-send'; sendBtn.textContent = 'Send';
      sendBtn.addEventListener('click', sendQuery);
      input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') sendQuery() });
      inputRow.appendChild(input); inputRow.appendChild(sendBtn);

      panel.appendChild(head); panel.appendChild(body); panel.appendChild(inputRow);
      overlay.appendChild(panel); D.body.appendChild(overlay);
      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close() });
      input.focus();
      enqueue('chat_ui', { action: 'open' });
    }

    function close(){
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      body = null;
      input = null;
      sendBtn = null;
      enqueue('chat_ui', { action: 'close' });
    }

    const btn = D.createElement('button'); btn.type = 'button'; btn.className = 'cc-chat-btn';
    const logoWrap = D.createElement('span'); logoWrap.className = 'cc-chat-logo-wrap';
    const logoImg = D.createElement('img'); logoImg.className = 'cc-chat-logo'; logoImg.alt = cfg.chat.name || COMPASS_AI_NAME;
    function updateChatLogo(){
      try{
        const dark = isDarkMode();
        const src = dark ? (cfg.chat.logoDark || cfg.chat.logoLight) : cfg.chat.logoLight;
        if (src) logoImg.src = src;
      }catch{}
    }
    updateChatLogo();
    if (darkMql){
      try{
        if (darkMql.addEventListener) darkMql.addEventListener('change', updateChatLogo);
        else if (darkMql.addListener) darkMql.addListener(updateChatLogo);
      }catch{}
    }
    logoWrap.appendChild(logoImg);
    const label = D.createElement('span'); label.textContent = cfg.chat.launcherLabel || `Ask ${COMPASS_AI_NAME}`;
    btn.appendChild(logoWrap);
    btn.appendChild(label);
    btn.addEventListener('click', open);
    D.body.appendChild(btn);
  }

  // --- Public API (small surface) --------------------------------------------
  const API = {
    track: enqueue,
    consentGranted(){ ls.set('cc_consent_granted', true) },
    pageview: trackPageview
  };
  W.CC = W.CC || {}; W.CC.embed = API;

  // --- Init ------------------------------------------------------------------
  async function init(){
    if (!cfg.autoInit) return;
    await loadSiteUiConfig();
    // Trackers can run even if analytics endpoint disabled (search still works)
    trackErrors();
    hookSPA();
    perf();
    trackPageview({ spa:false });
    // After first pageview, check for active campaign messages
    try{ if (cfg.messages?.enabled) pollActiveMessages() }catch{}

    // Scroll + click capture
    let scrollDebounce=0;
    W.addEventListener('scroll', ()=>{
      window.clearTimeout(scrollDebounce);
      scrollDebounce = window.setTimeout(()=> trackScroll(), 200);
    }, { passive:true });
    D.addEventListener('click', trackClick, true);

    // Heartbeats only while visible
    setInterval(()=>{ if (D.visibilityState==='visible') heartbeat() }, cfg.heartbeatMs);

    // Periodic flush of the event queue
    setInterval(flush, 5000);

    // Initialize search UI
    createSearch();
    // Initialize chat UI (optional)
    createChat();
  }

  if (D.readyState === 'complete' || D.readyState === 'interactive') init();
  else D.addEventListener('DOMContentLoaded', init);
})();

/*
  Embed usage (example)

  <meta name="cc-verification" content="YOUR_SITE_TOKEN">

  <script
    src="https://cdn.jsdelivr.net/gh/scasper1/cc-site-client@latest/cc-site-client.min.js"
    data-site-id="YOUR_SITE_ID"
    data-search-enabled="true"
    data-search-placeholder="Search our site"
    data-search-accent="#ec4899"
    async>
  </script>
*/
