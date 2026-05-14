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
  const cdnFallbackBase = 'https://cdn.jsdelivr.net/gh/scasper1/cc-site-client@latest';
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
  const explicitChatShowPdfPreview = hasAttr('data-chat-show-pdf-preview') || typeof W.CC_EMBED_OPTS?.chat?.showPdfPreview === 'boolean';
  const explicitMessagesAccent = hasAttr('data-messages-accent') || typeof W.CC_EMBED_OPTS?.messages?.accent === 'string';
  const explicitDockPosition = hasAttr('data-dock-position') || hasAttr('data-toolbar-position') || typeof W.CC_EMBED_OPTS?.dock?.position === 'string' || typeof W.CC_EMBED_OPTS?.toolbar?.position === 'string';
  const explicitDockDensity = hasAttr('data-dock-density') || hasAttr('data-toolbar-density') || typeof W.CC_EMBED_OPTS?.dock?.density === 'string' || typeof W.CC_EMBED_OPTS?.toolbar?.density === 'string';
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
      minSpinnerMs: parseInt(cfgAttr('data-chat-min-spinner-ms') || W.CC_EMBED_OPTS?.chat?.minSpinnerMs || '5000', 10),
      showPdfPreview: cfgAttr('data-chat-show-pdf-preview') != null
        ? cfgAttr('data-chat-show-pdf-preview') === 'true'
        : (typeof W.CC_EMBED_OPTS?.chat?.showPdfPreview === 'boolean' ? !!W.CC_EMBED_OPTS?.chat?.showPdfPreview : false),
      logoLight: cfgAttr('data-chat-logo-light') || W.CC_EMBED_OPTS?.chat?.logoLight || cfgAttr('data-search-logo-light') || assetUrl('cc-symbol-light-bg.svg'),
      logoDark: cfgAttr('data-chat-logo-dark') || W.CC_EMBED_OPTS?.chat?.logoDark || cfgAttr('data-search-logo-dark') || assetUrl('cc-symbol-dark-bg.svg'),
    },
    messages: {
      enabled: (cfgAttr('data-messages-enabled') ?? cfgAttr('data-campaigns-enabled')) != null
        ? (cfgAttr('data-messages-enabled') ?? cfgAttr('data-campaigns-enabled')) === 'true'
        : (typeof W.CC_EMBED_OPTS?.messages?.enabled === 'boolean' ? !!W.CC_EMBED_OPTS.messages.enabled : true),
      endpoint: cfgAttr('data-messages-endpoint') || cfgAttr('data-campaigns-endpoint') || W.CC_EMBED_OPTS?.messages?.endpoint || derive('campaigns/active-messages'),
      base: cfgAttr('data-campaign-base') || W.CC_EMBED_OPTS?.messages?.base || derive('campaigns'),
      accent: cfgAttr('data-messages-accent') || W.CC_EMBED_OPTS?.messages?.accent || cfgAttr('data-chat-accent') || W.CC_EMBED_OPTS?.chat?.accent || cfgAttr('data-search-accent') || W.CC_EMBED_OPTS?.search?.accent || '#336699',
    },
    dock: {
      position: cfgAttr('data-dock-position') || cfgAttr('data-toolbar-position') || W.CC_EMBED_OPTS?.dock?.position || W.CC_EMBED_OPTS?.toolbar?.position || 'right',
      density: cfgAttr('data-dock-density') || cfgAttr('data-toolbar-density') || W.CC_EMBED_OPTS?.dock?.density || W.CC_EMBED_OPTS?.toolbar?.density || 'compact',
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
      const d = json.dock || json.toolbar || json.launcher || json.primaryToolbar || json.primary?.dock || json.primary?.toolbar || json.settings?.dock || json.settings?.toolbar || json.settings?.primaryToolbar || {};

      // Server-driven settings are authoritative for enable/disable flags.
      if (typeof s.enabled === 'boolean') cfg.search.enabled = !!s.enabled;
      if (typeof c.enabled === 'boolean') cfg.chat.enabled = !!c.enabled;
      if (!explicitSearchAccent && typeof s.accent === 'string' && s.accent.trim()) cfg.search.accent = s.accent.trim();
      if (!explicitChatAccent && typeof c.accent === 'string' && c.accent.trim()) cfg.chat.accent = c.accent.trim();
      if (!explicitMessagesAccent) {
        const accent = String(c.accent || s.accent || cfg.chat.accent || cfg.search.accent || '').trim();
        if (accent) cfg.messages.accent = accent;
      }
      if (!explicitSearchPlaceholder && typeof s.placeholder === 'string' && s.placeholder.trim()) cfg.search.placeholder = s.placeholder.trim();
      if (!explicitChatPlaceholder && typeof c.placeholder === 'string' && c.placeholder.trim()) cfg.chat.placeholder = c.placeholder.trim();
      if (!explicitChatTitle && typeof c.title === 'string' && c.title.trim()) cfg.chat.title = c.title.trim();
      if (!explicitChatLabel && typeof c.launcherLabel === 'string' && c.launcherLabel.trim()) cfg.chat.launcherLabel = c.launcherLabel.trim();
      if (!explicitChatEndpoint && typeof c.endpoint === 'string' && c.endpoint.trim()) cfg.chat.endpoint = c.endpoint.trim();
      if (typeof c.minSpinnerMs === 'number' && Number.isFinite(c.minSpinnerMs)) cfg.chat.minSpinnerMs = c.minSpinnerMs;
      if (!explicitChatShowPdfPreview && typeof c.showPdfPreview === 'boolean') cfg.chat.showPdfPreview = !!c.showPdfPreview;
      if (!explicitDockPosition && typeof d.position === 'string' && d.position.trim()) cfg.dock.position = d.position.trim();
      if (!explicitDockDensity && typeof d.density === 'string' && d.density.trim()) cfg.dock.density = d.density.trim();
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
        .then(()=> scheduleCampaignPoll(600))
        .catch(()=>{ state.queue.unshift(...batch) }) // requeue on failure
        .finally(()=>{ state.flushing=false });
      return;
    }
    state.flushing=false;
    scheduleCampaignPoll(900);
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
    function onChange(){ touchSession(); trackPageview({ spa:true }); scheduleFlush(); scheduleCampaignPoll(900); scheduleCampaignPoll(2500) }
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
  function contrastTextForColor(color){
    const rgb = parseRgbFromColor(color);
    if (!rgb) return '#ffffff';
    const [r, g, b] = rgb.map((v)=>{
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    return luminance > 0.55 ? '#111111' : '#ffffff';
  }
  function computeHighlightBg(){
    const rgb = parseRgbFromColor(cfg.search?.accent || '#336699') || [51,102,153];
    const alpha = 0.15; // 15% opacity
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }
  function buildSearchStyles(){
    const hl = computeHighlightBg();
    const chatAccent = escapeHTML(cfg.chat?.accent || '#336699');
    const chatAccentContrast = escapeHTML(contrastTextForColor(cfg.chat?.accent || '#336699'));
    return `
  .cc-dock{position:fixed;z-index:2147483000;border:1px solid #ddd;border-radius:12px;padding:7px 9px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.12);font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto;display:inline-flex;align-items:center;gap:8px;color:#111}
  .cc-dock:hover{box-shadow:0 6px 20px rgba(0,0,0,.16);border-color:#d1d5db}
  .cc-dock[data-position="right"]{right:16px;bottom:16px}
  .cc-dock[data-position="left"]{left:16px;bottom:16px}
  .cc-dock[data-position="bottom"],.cc-dock[data-position="middle-bottom"],.cc-dock[data-position="center"],.cc-dock[data-position="center-bottom"]{left:50%;bottom:16px;transform:translateX(-50%)}
  .cc-dock[data-density="relaxed"]{padding:9px 12px;gap:11px}
  .cc-dock-brand{white-space:nowrap;padding-right:2px;color:#111827}
  .cc-dock-sep{width:1px;height:22px;background:#e5e7eb}
  .cc-dock-icon{position:relative;width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:#111827;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
  .cc-dock-icon:hover{background:#f3f4f6;color:${chatAccent}}
  .cc-dock-icon svg{width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
  .cc-dock-alert{position:absolute;right:3px;top:3px;width:8px;height:8px;border-radius:999px;background:${escapeHTML(cfg.messages?.accent || '#336699')};box-shadow:0 0 0 2px #fff;display:none}
  .cc-dock-icon[data-alert="true"] .cc-dock-alert{display:block}
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
  .cc-chat-msg-ai{margin-right:auto;background:${chatAccent};border:1px solid ${chatAccent};color:${chatAccentContrast};padding:10px 12px;border-radius:12px}
  .cc-chat-msg-ai .cc-chat-text{color:${chatAccentContrast}}
  .cc-chat-text{white-space:pre-wrap;font-size:13px;line-height:1.4}
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
  .cc-chat-source-link:hover{color:${chatAccent}}
  .cc-chat-source-snippet{margin-top:3px;font-size:12px;color:#4b5563;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cc-chat-source-snippet.is-expanded{display:block;-webkit-line-clamp:unset;overflow:visible}
  .cc-chat-source-more{margin-top:4px;border:0;background:transparent;padding:0;color:${chatAccent};font-size:11px;font-weight:600;cursor:pointer}
  .cc-chat-source-preview{margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff}
  .cc-chat-source-preview-btn{display:block;width:100%;padding:0;border:0;background:#fff;cursor:pointer;text-align:left}
  .cc-chat-source-preview-embed{width:100%;height:96px;border:0;display:block;background:#f8fafc}
  .cc-chat-source-preview-fallback{height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(180deg,#fff,#f8fafc);color:#334155}
  .cc-chat-source-preview-fallback strong{font-size:11px;letter-spacing:.03em}
  .cc-chat-source-preview-fallback span{font-size:11px;color:#64748b}
  .cc-chat-source-url{margin-top:2px;font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cc-chat-source-actions{margin-top:8px;display:flex;align-items:center;gap:8px}
  .cc-chat-source-cta{border:1px solid ${chatAccent};background:${chatAccent};color:#fff;border-radius:999px;padding:6px 12px;font:600 11px/1 system-ui, -apple-system, Segoe UI, Roboto;cursor:pointer}
  .cc-chat-source-cta[data-variant="secondary"]{background:#fff;color:${chatAccent}}
  .cc-chat-msg-actions{margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .cc-chat-msg-action{border:1px solid ${chatAccent};background:#fff;color:${chatAccent};border-radius:999px;padding:6px 12px;font:600 11px/1 system-ui, -apple-system, Segoe UI, Roboto;cursor:pointer}
  .cc-chat-spinner-wrap{display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.2}
  .cc-chat-spinner{width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:${chatAccentContrast};border-radius:999px;animation:cc-spin .8s linear infinite}
  @keyframes cc-spin { to { transform: rotate(360deg); } }
  .cc-chat-input-row{padding:10px;border-top:1px solid #eee;display:flex;gap:8px;background:#fff}
  .cc-chat-input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;outline:0;font:500 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto}
  .cc-chat-input:focus{border-color:${chatAccent};box-shadow:0 0 0 3px color-mix(in srgb, ${chatAccent} 20%, white)}
  .cc-chat-input-email-focus{border-color:${chatAccent}!important;box-shadow:0 0 0 3px color-mix(in srgb, ${chatAccent} 30%, white)!important;animation:cc-input-pulse 1.2s ease-in-out 2}
  @keyframes cc-input-pulse {
    0%{box-shadow:0 0 0 0 color-mix(in srgb, ${chatAccent} 35%, white)}
    70%{box-shadow:0 0 0 8px color-mix(in srgb, ${chatAccent} 0%, transparent)}
    100%{box-shadow:0 0 0 0 color-mix(in srgb, ${chatAccent} 0%, transparent)}
  }
  .cc-chat-send{border:1px solid ${chatAccent};background:${chatAccent};color:#fff;border-radius:10px;padding:0 12px;cursor:pointer;font:600 13px/1 system-ui, -apple-system, Segoe UI, Roboto}
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
  .cc-campaign-layer{position:fixed;z-index:2147483003;font:500 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto;color:#111}
  .cc-campaign-scrim{position:fixed;inset:0;background:rgba(15,23,42,.42);z-index:2147483003;display:flex;align-items:center;justify-content:center;padding:18px}
  .cc-campaign-card{position:relative;width:min(460px,94vw);max-height:88vh;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 46px rgba(15,23,42,.24)}
  .cc-campaign-card[data-layout="toast"]{position:fixed;left:18px;bottom:18px;width:min(380px,92vw)}
  .cc-campaign-card[data-layout="banner"]{position:fixed;left:12px;right:12px;bottom:12px;width:auto;max-width:960px;margin:0 auto}
  .cc-campaign-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 0}
  .cc-campaign-title{margin:0;font-size:17px;line-height:1.25;font-weight:700;color:#111827}
  .cc-campaign-close{border:0;background:transparent;color:#64748b;font-size:20px;line-height:1;cursor:pointer}
  .cc-campaign-card[data-image="flush"] .cc-campaign-close{position:absolute;right:10px;top:10px;z-index:2;width:30px;height:30px;border-radius:999px;background:rgba(15,23,42,.58);color:#fff;display:flex;align-items:center;justify-content:center}
  .cc-campaign-hero-img{display:block;width:100%;height:190px;object-fit:cover;background:#f8fafc}
  .cc-campaign-body{padding:14px 16px 16px}
  .cc-campaign-text{margin:0 0 12px;color:#334155;white-space:pre-wrap}
  .cc-campaign-img{width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:12px;background:#f8fafc}
  .cc-campaign-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}
  .cc-campaign-actions-stacked{display:grid;grid-template-columns:1fr;gap:8px}
  .cc-campaign-action{border:0;background:transparent;font:700 13px/1 system-ui,-apple-system,Segoe UI,Roboto;cursor:pointer;text-decoration:none;text-align:center}
  .cc-campaign-action-button{border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:8px;padding:9px 13px;box-shadow:0 1px 2px rgba(15,23,42,.08)}
  .cc-campaign-action-button:hover{background:#f9fafb;border-color:#9ca3af}
  .cc-campaign-action-button-accent{border-color:${escapeHTML(cfg.messages?.accent || '#336699')};background:${escapeHTML(cfg.messages?.accent || '#336699')};color:${escapeHTML(contrastTextForColor(cfg.messages?.accent || '#336699'))}}
  .cc-campaign-action-button-accent:hover{filter:brightness(.96)}
  .cc-campaign-action-link{color:${escapeHTML(cfg.messages?.accent || '#336699')};padding:4px 0;text-decoration:underline;text-underline-offset:3px}
  .cc-campaign-actions-stacked .cc-campaign-action-button{display:block;width:100%}
  .cc-campaign-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
  .cc-campaign-field label{font-size:12px;font-weight:700;color:#334155}
  .cc-campaign-field input,.cc-campaign-field textarea{border:1px solid #cbd5e1;border-radius:9px;padding:9px 10px;font:500 14px/1.3 system-ui,-apple-system,Segoe UI,Roboto}
  .cc-campaign-error{font-size:12px;color:#b91c1c;margin-top:8px}
  .cc-campaign-step-count{font-size:12px;color:#64748b;margin-bottom:8px}
    `;
  }
  function injectStyle(){
    if (D.getElementById('cc-embed-style')) return;
    const s = D.createElement('style'); s.id='cc-embed-style'; s.textContent = buildSearchStyles(); D.head.appendChild(s);
  }
  function normalizeDockPosition(raw){
    const value = String(raw || '').toLowerCase().replace(/_/g, '-').trim();
    if (['left', 'left-bottom', 'bottom-left'].includes(value)) return 'left';
    if (['bottom', 'middle-bottom', 'center', 'center-bottom', 'bottom-center', 'floating'].includes(value)) return 'middle-bottom';
    return 'right';
  }
  function normalizeDockDensity(raw){
    return String(raw || '').toLowerCase().trim() === 'relaxed' ? 'relaxed' : 'compact';
  }
  function dockIconSvg(kind){
    if (kind === 'search') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
    if (kind === 'chat') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"></path><path d="M5 5v14"></path><path d="M19 5v14"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>';
  }
  function createDock(controllers){
    const items = [];
    if (controllers?.search) items.push({ kind:'search', label:'Search', open: controllers.search.open });
    if (controllers?.chat) items.push({ kind:'chat', label: cfg.chat?.name || COMPASS_AI_NAME, open: controllers.chat.open });
    if (cfg.messages?.enabled) items.push({ kind:'campaign', label:'Campaigns', open: openDockCampaign });
    if (!items.length) return null;
    injectStyle();
    const dock = D.createElement('div');
    dock.className = 'cc-dock';
    dock.setAttribute('data-position', normalizeDockPosition(cfg.dock?.position));
    dock.setAttribute('data-density', normalizeDockDensity(cfg.dock?.density));
    dock.setAttribute('role', 'toolbar');
    dock.setAttribute('aria-label', 'Compass tools');
    const brand = D.createElement('span');
    brand.className = 'cc-dock-brand';
    brand.textContent = 'Compass';
    dock.appendChild(brand);
    dock.appendChild(Object.assign(D.createElement('span'), { className:'cc-dock-sep' }));
    items.forEach((item)=>{
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = 'cc-dock-icon';
      btn.setAttribute('aria-label', item.label);
      btn.setAttribute('title', item.label);
      btn.setAttribute('data-kind', item.kind);
      btn.innerHTML = dockIconSvg(item.kind);
      if (item.kind === 'campaign') {
        const alert = D.createElement('span');
        alert.className = 'cc-dock-alert';
        btn.appendChild(alert);
      }
      btn.addEventListener('click', item.open);
      dock.appendChild(btn);
    });
    D.body.appendChild(dock);
    updateCampaignDockAlert();
    return dock;
  }
  function updateCampaignDockAlert(){
    try{
      const btn = D.querySelector('.cc-dock-icon[data-kind="campaign"]');
      if (btn) btn.setAttribute('data-alert', lastDismissedCampaignMessage ? 'true' : 'false');
    }catch{}
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

    // Global hotkey (kept as your working version)
    D.addEventListener('keydown', (e)=>{
      const k = (e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k';
      if (k){ e.preventDefault(); open() }
    });

    // Search usage telemetry
    function trackSearchUI(action){ enqueue('search_ui', { action }) }
    function trackSearchQuery(q, total){ enqueue('search_query', { q, total }) }
    function trackSearchSelect(it){ enqueue('search_select', { id: it.id || null, title: it.title || it.name || null, url: it.url || it.href || null }) }
    return { open, close };
  }

  function createChat(){
    if (!cfg.chat.enabled || !cfg.chat.endpoint) return;
    injectStyle();

    let overlay = null, body = null, input = null, sendBtn = null, loading = false;
    let pendingLeadCapture = null;
    let emailFocusTimer = 0;
    let lastDownloadUrl = '';
    let lastDownloadAt = 0;
    const CLAIM_ENDPOINT = derive('chat/lead-magnets/claim');
    const DEFAULT_CHAT_PLACEHOLDER = cfg.chat.placeholder || 'Ask about this website…';
    const delay = (ms)=> new Promise((resolve)=> setTimeout(resolve, Math.max(0, Number(ms || 0))));
    const minSpinnerMs = ()=> {
      const raw = Number(cfg.chat?.minSpinnerMs || 5000);
      return Math.max(5000, Number.isFinite(raw) ? Math.floor(raw) : 5000);
    };
    function normalizeCitationUrl(c){
      const raw = c?.url || c?.canonicalUrl || '';
      if (!raw) return '';
      try { return new URL(raw, L.href).toString() } catch { return String(raw) }
    }
    function isValidEmail(email){
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }
    function parseLeadMagnetId(c, href){
      const direct = String(c?.leadMagnetId || '').trim();
      if (direct) return direct;
      const m = String(href || '').match(/\/lead-magnets\/([a-fA-F0-9]{24})\/download/);
      return m ? m[1] : '';
    }
    function triggerDownloadInNewTab(url){
      const href = String(url || '').trim();
      if (!href) return false;
      const nowTs = Date.now();
      // Guard against accidental duplicate triggers for the same file in a short window.
      if (href === lastDownloadUrl && (nowTs - lastDownloadAt) < 2500){
        enqueue('chat_download_triggered', {
          success: true,
          skippedDuplicate: true,
          iframeTriggered: false,
          openedInNewTab: false,
          sameTabFallback: false,
        });
        return true;
      }
      lastDownloadUrl = href;
      lastDownloadAt = nowTs;

      let openedInNewTab = false;
      let iframeTriggered = false;
      // Most reliable for async chat flows: trigger download via hidden iframe (avoids popup blockers).
      try{
        const frame = D.createElement('iframe');
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        frame.src = href;
        D.body.appendChild(frame);
        iframeTriggered = true;
        W.setTimeout(()=>{ try { frame.remove() } catch {} }, 15000);
      }catch{}
      if (!openedInNewTab && !iframeTriggered){
        try{
          const win = W.open(href, '_blank', 'noopener,noreferrer');
          openedInNewTab = !!win;
        }catch{}
      }
      if (!openedInNewTab && !iframeTriggered){
        try { W.location.href = href } catch {}
      }
      enqueue('chat_download_triggered', {
        success: iframeTriggered || openedInNewTab,
        iframeTriggered,
        openedInNewTab,
        sameTabFallback: !iframeTriggered && !openedInNewTab,
      });
      return iframeTriggered || openedInNewTab;
    }
    function focusEmailInput(){
      if (!input) return;
      if (input.disabled){
        W.setTimeout(focusEmailInput, 0);
        return;
      }
      input.focus();
      try { input.select() } catch {}
      input.classList.add('cc-chat-input-email-focus');
      if (emailFocusTimer) W.clearTimeout(emailFocusTimer);
      emailFocusTimer = W.setTimeout(()=>{
        if (input) input.classList.remove('cc-chat-input-email-focus');
      }, 2600);
    }
    async function claimLeadMagnet(c, href, email){
      const leadMagnetId = parseLeadMagnetId(c, href);
      if (!leadMagnetId){
        appendMessage('ai', 'This download item is missing a resource id.');
        return null;
      }
      email = String(email || '').trim().toLowerCase();
      if (!isValidEmail(email)){
        appendMessage('ai', 'Please enter a valid email to access this download.');
        return null;
      }
      if (!CLAIM_ENDPOINT){
        appendMessage('ai', 'Download claim endpoint is not configured.');
        return null;
      }
      try{
        const res = await fetch(CLAIM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            siteId: cfg.siteId,
            leadMagnetId,
            email,
            sessionId: getSessionId(),
          }),
        });
        const json = await res.json().catch(()=> ({}));
        const pendingActivation = (res.status === 202 && json?.error === 'pending_activation') || !!json?.data?.pendingActivation;
        const hasDownloadUrl = !!json?.data?.downloadUrl;
        if (pendingActivation){
          appendMessage(
            'ai',
            json?.message || 'Thanks for downloading the resource. We have sent you an email with the file download link for your reference, along with a free account activation link.'
          );
          enqueue('chat_download_pending_activation', { leadMagnetId, emailDomain: email.split('@')[1] || null });
          if (!hasDownloadUrl) return null;
        }
        if ((res.status === 202 && json?.error === 'session_expired') || json?.data?.sessionExpired){
          appendMessage('ai', json?.message || 'Session expired. Please check your email and confirm to continue download.');
          enqueue('chat_download_session_expired', { leadMagnetId, emailDomain: email.split('@')[1] || null });
          return null;
        }
        if (json?.error === 'activation_email_send_failed'){
          appendMessage('ai', 'Thanks for your request. We could not send the activation email right now. Please try again in a few minutes.');
          enqueue('chat_download_activation_email_failed', { leadMagnetId, emailDomain: email.split('@')[1] || null });
          return null;
        }
        if (json?.error === 'reauth_email_send_failed'){
          appendMessage('ai', json?.message || 'Could not send confirmation email right now. Please try again.');
          enqueue('chat_download_reauth_email_failed', { leadMagnetId, emailDomain: email.split('@')[1] || null });
          return null;
        }
        if (!res.ok || !json?.ok || !json?.data?.downloadUrl){
          appendMessage('ai', json?.message || 'Could not start the download right now. Please try again.');
          return null;
        }
        enqueue('chat_download_claim', { leadMagnetId, emailDomain: email.split('@')[1] || null });
        return json.data.downloadUrl;
      }catch{
        appendMessage('ai', 'Could not start the download right now. Please try again.');
        return null;
      }
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
    function isPdfCitation(c, href, kind){
      if (kind !== 'download') return false;
      const lmType = String(c?.leadMagnetType || '').toLowerCase();
      if (lmType === 'pdf') return true;
      if (/\.pdf(\?|$)/i.test(String(href || ''))) return true;
      const text = `${c?.title || ''} ${c?.snippet || ''}`.toLowerCase();
      return /\bpdf\b/.test(text);
    }
    function openCitationInNewTab(c, href, kind){
      if (!href) return;
      enqueue('chat_citation_click', { title: c?.title || null, url: href || null, sourceKind: kind });
      W.open(href, '_blank', 'noopener,noreferrer');
    }
    function startLeadCapture(c, href){
      enqueue('chat_download_cta_click', { leadMagnetId: parseLeadMagnetId(c, href) || null, title: c?.title || null });
      pendingLeadCapture = { citation: c, href };
      if (input){
        input.placeholder = 'Enter your email to get this download…';
        focusEmailInput();
      }
      appendMessage('ai', 'Enter your email in this chat to receive the download.');
      enqueue('chat_email_capture_requested', { leadMagnetId: parseLeadMagnetId(c, href) || null, title: c?.title || null });
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
      const title = D.createElement('div');
      title.className = 'cc-chat-source-link';
      title.textContent = c?.title || href || 'Source';
      bodyWrap.appendChild(title);

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

      const shouldRenderPdfPreview = !!cfg.chat?.showPdfPreview && isPdfCitation(c, href, kind);
      if (shouldRenderPdfPreview){
        const previewWrap = D.createElement('div');
        previewWrap.className = 'cc-chat-source-preview';
        const previewBtn = D.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'cc-chat-source-preview-btn';
        previewBtn.setAttribute('aria-label', 'Open PDF preview');
        previewBtn.addEventListener('click', ()=>{
          enqueue('chat_pdf_preview_click', { sourceKind: kind, title: c?.title || null });
          if (kind === 'download') startLeadCapture(c, href);
          else openCitationInNewTab(c, href, kind);
        });
        if (/\.pdf(\?|$)/i.test(String(href || ''))){
          const frame = D.createElement('iframe');
          frame.className = 'cc-chat-source-preview-embed';
          frame.loading = 'lazy';
          frame.setAttribute('title', c?.title || 'PDF preview');
          frame.src = `${href}${href.includes('#') ? '' : '#page=1&toolbar=0&navpanes=0&scrollbar=0'}`;
          previewBtn.appendChild(frame);
        } else {
          const fallback = D.createElement('div');
          fallback.className = 'cc-chat-source-preview-fallback';
          fallback.innerHTML = `<strong>PDF PREVIEW</strong><span>Click to open</span>`;
          previewBtn.appendChild(fallback);
        }
        previewWrap.appendChild(previewBtn);
        bodyWrap.appendChild(previewWrap);
      }

      const actions = D.createElement('div');
      actions.className = 'cc-chat-source-actions';
      const ctaBtn = D.createElement('button');
      ctaBtn.type = 'button';
      ctaBtn.className = 'cc-chat-source-cta';
      ctaBtn.textContent = kind === 'download' ? 'Download' : 'Open';
      if (kind === 'download'){
        ctaBtn.addEventListener('click', ()=> startLeadCapture(c, href));
      } else {
        ctaBtn.setAttribute('data-variant', 'secondary');
        ctaBtn.addEventListener('click', ()=> openCitationInNewTab(c, href, kind));
      }
      actions.appendChild(ctaBtn);
      bodyWrap.appendChild(actions);

      if (href && kind !== 'download'){
        const urlLine = D.createElement('div');
        urlLine.className = 'cc-chat-source-url';
        urlLine.textContent = href;
        bodyWrap.appendChild(urlLine);
      }

      top.appendChild(bodyWrap);
      card.appendChild(top);
      return card;
    }

    function appendMessage(kind, text, citations, actions){
      if (!body) return;
      const wrap = D.createElement('div');
      wrap.className = `cc-chat-msg ${kind === 'user' ? 'cc-chat-msg-user' : 'cc-chat-msg-ai'}`;
      const textNode = D.createElement('div');
      textNode.className = 'cc-chat-text';
      textNode.textContent = text || '';
      wrap.appendChild(textNode);
      if (kind === 'ai' && Array.isArray(actions) && actions.length){
        const actionWrap = D.createElement('div');
        actionWrap.className = 'cc-chat-msg-actions';
        actions.forEach((a)=>{
          if (!a || typeof a.onClick !== 'function') return;
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = 'cc-chat-msg-action';
          btn.textContent = a.label || 'Open';
          btn.addEventListener('click', a.onClick);
          actionWrap.appendChild(btn);
        });
        if (actionWrap.childElementCount) wrap.appendChild(actionWrap);
      }
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
    function appendSpinnerMessage(){
      if (!body) return null;
      const wrap = D.createElement('div');
      wrap.className = 'cc-chat-msg cc-chat-msg-ai';
      const line = D.createElement('div');
      line.className = 'cc-chat-spinner-wrap';
      const spinner = D.createElement('span');
      spinner.className = 'cc-chat-spinner';
      const txt = D.createElement('span');
      txt.textContent = 'Thinking…';
      line.appendChild(spinner);
      line.appendChild(txt);
      wrap.appendChild(line);
      body.appendChild(wrap);
      body.scrollTop = body.scrollHeight;
      return wrap;
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
      input.value = '';
      const spinnerStartedAt = now();
      const spinner = appendSpinnerMessage();
      const waitMs = minSpinnerMs();
      enqueue('chat_spinner_shown', { flow: pendingLeadCapture ? 'lead_capture' : 'chat_query', minSpinnerMs: waitMs });
      setLoading(true);
      try{
        if (pendingLeadCapture){
          const email = String(query || '').trim().toLowerCase();
          if (!isValidEmail(email)){
            enqueue('chat_email_capture_invalid', { reason: 'invalid_email_format' });
            const remaining = waitMs - (now() - spinnerStartedAt);
            if (remaining > 0) await delay(remaining);
            if (spinner) spinner.remove();
            appendMessage('ai', 'Please enter a valid email (example: name@company.com).');
            focusEmailInput();
            return;
          }
          enqueue('chat_email_capture_submitted', { emailDomain: email.split('@')[1] || null });
          const downloadUrl = await claimLeadMagnet(pendingLeadCapture.citation, pendingLeadCapture.href, email);
          const remaining = waitMs - (now() - spinnerStartedAt);
          if (remaining > 0) await delay(remaining);
          if (spinner) spinner.remove();
          if (!downloadUrl) return;
          appendMessage('ai', 'Your download is ready. Click "Download file" below to continue.', [], [
            {
              label: 'Download file',
              onClick: ()=>{
                enqueue('chat_download_fallback_click', { source: 'chat_action' });
                triggerDownloadInNewTab(downloadUrl);
              },
            },
          ]);
          pendingLeadCapture = null;
          if (input){
            input.placeholder = DEFAULT_CHAT_PLACEHOLDER;
            input.classList.remove('cc-chat-input-email-focus');
          }
          enqueue('chat_download_ready', { autoDownload: false });
          return;
        }
        enqueue('chat_query', { q: query });
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
        const remaining = waitMs - (now() - spinnerStartedAt);
        if (remaining > 0) await delay(remaining);
        if (spinner) spinner.remove();
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
        const remaining = waitMs - (now() - spinnerStartedAt);
        if (remaining > 0) await delay(remaining);
        if (spinner) spinner.remove();
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
      input.addEventListener('input', ()=> input?.classList?.remove('cc-chat-input-email-focus'));
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
      pendingLeadCapture = null;
      enqueue('chat_ui', { action: 'close' });
    }

    return { open, close };
  }

  // --- Campaign messages -----------------------------------------------------
  let campaignOpen = false;
  const campaignSeen = new Set();
  let lastDismissedCampaignMessage = null;

  function campaignUrl(path){
    const base = String(cfg.messages?.base || '').replace(/\/+$/, '');
    const clean = String(path || '').replace(/^\/+/, '');
    return base ? `${base}/${clean}` : '';
  }
  function safeHref(raw){
    const href = String(raw || '').trim();
    if (!href) return '';
    try {
      const u = new URL(href, L.href);
      if (!/^https?:$/i.test(u.protocol)) return '';
      return u.toString();
    } catch { return '' }
  }
  function appendText(parent, tag, className, text){
    const el = D.createElement(tag);
    if (className) el.className = className;
    el.textContent = String(text || '');
    parent.appendChild(el);
    return el;
  }
  function deliveryOption(delivery, key, fallback){
    if (!delivery || typeof delivery !== 'object') return fallback;
    if (delivery[key] != null) return delivery[key];
    if (delivery.display && delivery.display[key] != null) return delivery.display[key];
    if (delivery.actionList && delivery.actionList[key] != null) return delivery.actionList[key];
    return fallback;
  }
  function campaignActionListLayout(delivery, layout){
    const raw = deliveryOption(delivery, 'actionListLayout',
      deliveryOption(delivery, 'actionsLayout', layout === 'action_list' ? 'stacked' : 'inline'));
    return ['stacked', 'one_per_line'].includes(String(raw || '').toLowerCase()) ? 'stacked' : 'inline';
  }
  function campaignDefaultActionStyle(delivery){
    return String(deliveryOption(delivery, 'actionStyle', 'button')).toLowerCase() === 'link' ? 'link' : 'button';
  }
  function campaignDefaultButtonTone(delivery){
    return String(deliveryOption(delivery, 'actionButtonTone', 'default')).toLowerCase() === 'accent' ? 'accent' : 'default';
  }
  function campaignActionStyle(action, fallback){
    return String(action?.style || action?.variant || fallback || 'button').toLowerCase() === 'link' ? 'link' : 'button';
  }
  function campaignButtonTone(action, fallback){
    return String(action?.buttonTone || action?.tone || fallback || 'default').toLowerCase() === 'accent' ? 'accent' : 'default';
  }
  function applyCampaignActionsLayout(el, delivery, layout){
    el.className = `cc-campaign-actions${campaignActionListLayout(delivery, layout) === 'stacked' ? ' cc-campaign-actions-stacked' : ''}`;
  }
  function campaignImagePlacement(image){
    const raw = String(image?.placement || image?.display || '').toLowerCase();
    return raw === 'flush_top' || raw === 'flush' || image?.flush === true ? 'flush' : 'contained';
  }
  function campaignCtx(){
    const ctx = currentCtx();
    return { siteId: ctx.siteId, vid: ctx.vid, sid: ctx.sid, path: ctx.path };
  }
  async function campaignPost(url, body){
    if (!url) return null;
    try{
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(body || {}),
      });
      return await res.json().catch(()=>({ ok: res.ok, success: res.ok }));
    }catch{ return null }
  }
  async function recordCampaign(campaignId, kind, body){
    const url = campaignUrl(`${encodeURIComponent(campaignId)}/${kind}`);
    return campaignPost(url, Object.assign(campaignCtx(), body || {}));
  }
  async function submitCampaignForm(campaignId, step, fields, leadMagnetId){
    return campaignPost(campaignUrl(`${encodeURIComponent(campaignId)}/submissions`), Object.assign(campaignCtx(), {
      stepId: step?.id || '',
      fields,
      leadMagnetId: leadMagnetId || step?.leadMagnetId || '',
    }));
  }
  async function claimCampaignLeadMagnet(leadMagnetId, email){
    const endpoint = derive('chat/lead-magnets/claim');
    if (!endpoint) return { ok:false, message:'Download endpoint is not configured.' };
    try{
      const res = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        credentials:'include',
        body: JSON.stringify({ siteId: cfg.siteId, leadMagnetId, email, sessionId: getSessionId() }),
      });
      const json = await res.json().catch(()=>({}));
      return Object.assign({ ok: res.ok && json?.ok !== false }, json);
    }catch{ return { ok:false, message:'Could not start the download right now.' } }
  }
  function triggerCampaignDownload(url){
    const href = safeHref(url);
    if (!href) return;
    try{
      const frame = D.createElement('iframe');
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      frame.src = href;
      D.body.appendChild(frame);
      W.setTimeout(()=>{ try{ frame.remove() }catch{} }, 15000);
    }catch{
      try{ W.open(href, '_blank', 'noopener,noreferrer') }catch{}
    }
  }
  function buildCampaignShell(layout, onClose){
    const isModal = layout === 'modal' || layout === 'overlay' || layout === 'wizard' || layout === 'action_list';
    const root = D.createElement('div');
    root.className = isModal ? 'cc-campaign-scrim' : 'cc-campaign-layer';
    const card = D.createElement('div');
    card.className = 'cc-campaign-card';
    card.setAttribute('role', isModal ? 'dialog' : 'status');
    card.setAttribute('aria-live', isModal ? 'off' : 'polite');
    card.setAttribute('data-layout', layout || 'modal');
    const head = D.createElement('div');
    head.className = 'cc-campaign-head';
    const titleWrap = D.createElement('div');
    const close = D.createElement('button');
    close.type = 'button';
    close.className = 'cc-campaign-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', onClose);
    head.appendChild(titleWrap);
    head.appendChild(close);
    const body = D.createElement('div');
    body.className = 'cc-campaign-body';
    card.appendChild(head);
    card.appendChild(body);
    root.appendChild(card);
    if (isModal) root.addEventListener('click', (e)=>{ if (e.target === root) onClose() });
    return { root, card, titleWrap, body };
  }
  function renderCampaignImage(parent, image){
    const src = safeHref(image?.url);
    if (!src) return;
    const img = D.createElement('img');
    img.className = 'cc-campaign-img';
    img.src = src;
    img.alt = String(image?.alt || '');
    img.loading = 'lazy';
    parent.appendChild(img);
  }
  function clearCampaignHero(card){
    try{
      card.removeAttribute('data-image');
      const hero = card.querySelector('[data-cc-campaign-hero="true"]');
      if (hero) hero.remove();
    }catch{}
  }
  function renderCampaignHero(card, image){
    clearCampaignHero(card);
    const src = safeHref(image?.url);
    if (!src || campaignImagePlacement(image) !== 'flush') return false;
    card.setAttribute('data-image', 'flush');
    const img = D.createElement('img');
    img.className = 'cc-campaign-hero-img';
    img.setAttribute('data-cc-campaign-hero', 'true');
    img.src = src;
    img.alt = String(image?.alt || '');
    img.loading = 'lazy';
    card.insertBefore(img, card.firstChild);
    return true;
  }
  function readStepFields(step, container){
    const out = {};
    (Array.isArray(step?.fields) ? step.fields : []).forEach((f)=>{
      const id = String(f?.id || f?.name || '').trim();
      if (!id) return;
      const esc = W.CSS && W.CSS.escape ? W.CSS.escape(id) : id.replace(/"/g, '\\"');
      const el = container.querySelector(`[data-cc-field="${esc}"]`);
      out[id] = el ? String(el.value || '').trim() : '';
    });
    return out;
  }
  function renderFields(parent, step){
    (Array.isArray(step?.fields) ? step.fields : []).forEach((f)=>{
      const id = String(f?.id || f?.name || '').trim();
      if (!id) return;
      const wrap = D.createElement('div');
      wrap.className = 'cc-campaign-field';
      const label = D.createElement('label');
      label.textContent = String(f?.label || id);
      label.htmlFor = `cc-campaign-${id}`;
      const input = String(f?.type || '').toLowerCase() === 'textarea' ? D.createElement('textarea') : D.createElement('input');
      input.id = `cc-campaign-${id}`;
      input.setAttribute('data-cc-field', id);
      if (input.tagName === 'INPUT') input.type = String(f?.type || 'text');
      input.placeholder = String(f?.placeholder || '');
      input.required = f?.required === true;
      wrap.appendChild(label);
      wrap.appendChild(input);
      parent.appendChild(wrap);
    });
  }
  function campaignButton(label, options){
    const opts = typeof options === 'string' ? { variant: options } : (options || {});
    const style = opts.style === 'link' ? 'link' : 'button';
    const tone = opts.tone === 'accent' ? 'accent' : 'default';
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = `cc-campaign-action cc-campaign-action-${style}${style === 'button' ? ' cc-campaign-action-button' : ''}${style === 'button' && tone === 'accent' ? ' cc-campaign-action-button-accent' : ''}`;
    btn.textContent = String(label || 'Continue');
    return btn;
  }
  function openDockCampaign(){
    if (campaignOpen) return;
    if (lastDismissedCampaignMessage) {
      const message = lastDismissedCampaignMessage;
      lastDismissedCampaignMessage = null;
      updateCampaignDockAlert();
      renderCampaignMessage(message, { force:true });
      return;
    }
    scheduleCampaignPoll(0);
  }
  function renderCampaignMessage(message, options){
    if (campaignOpen) return;
    const force = !!options?.force;
    const campaignId = message?.campaignId;
    const delivery = message?.delivery || {};
    if (!campaignId || (!force && campaignSeen.has(String(campaignId)))) return;
    campaignSeen.add(String(campaignId));
    campaignOpen = true;
    injectStyle();

    const hasWizardSteps = Array.isArray(delivery.steps) && delivery.steps.length > 0;
    const layout = hasWizardSteps ? 'wizard' : (delivery.layout || 'modal');
    const close = ()=>{
      try{ recordCampaign(campaignId, 'interaction', { interactionType:'dismiss', deliveryAttemptId: message.deliveryAttemptId }) }catch{}
      lastDismissedCampaignMessage = message;
      updateCampaignDockAlert();
      try{ root.remove() }catch{}
      campaignOpen = false;
    };
    const shell = buildCampaignShell(layout, close);
    const { root, card, titleWrap, body } = shell;
    const wizardState = { fields: {} };

    function renderStep(stepIndex){
      const steps = Array.isArray(delivery.steps) ? delivery.steps : [];
      const step = steps[stepIndex] || {};
      titleWrap.innerHTML = '';
      body.innerHTML = '';
      const heroImage = step.image || delivery.image;
      const isHero = renderCampaignHero(card, heroImage);
      appendText(titleWrap, 'h2', 'cc-campaign-title', step.title || delivery.title || 'Message');
      if (steps.length > 1) appendText(body, 'div', 'cc-campaign-step-count', `${stepIndex + 1} / ${steps.length}`);
      if (!isHero) renderCampaignImage(body, heroImage);
      if (step.body || delivery.body) appendText(body, 'p', 'cc-campaign-text', step.body || delivery.body);
      const stepType = String(step.type || 'content').toLowerCase();
      if (stepType === 'form' || stepType === 'lead_magnet') {
        const formWrap = D.createElement('div');
        renderFields(formWrap, stepType === 'lead_magnet' && !step.fields?.length
          ? Object.assign({}, step, { fields: [{ id:'email', label:'Email', type:'email', required:true, placeholder:'you@example.com' }] })
          : step);
        body.appendChild(formWrap);
      }
      const actions = D.createElement('div');
      applyCampaignActionsLayout(actions, delivery, layout);
      if (stepIndex > 0) {
        const back = campaignButton('Back', 'secondary');
        back.addEventListener('click', ()=> renderStep(stepIndex - 1));
        actions.appendChild(back);
      }
      const configuredActions = Array.isArray(step.actions) && step.actions.length ? step.actions : [];
      const defaultActionStyle = campaignDefaultActionStyle(delivery);
      const defaultButtonTone = campaignDefaultButtonTone(delivery);
      const shouldAddFallbackNext = stepIndex < steps.length - 1 && !configuredActions.some((a)=> {
        const kind = String(a?.kind || '').toLowerCase();
        return kind === 'next' || kind === 'submit' || kind === 'lead_magnet';
      });
      const fallbackNext = shouldAddFallbackNext ? [{ label:'Next', kind:'next', nextStepId: steps[stepIndex + 1]?.id }] : [];
      const terminalActions = stepIndex >= steps.length - 1 && !configuredActions.length && Array.isArray(delivery.actions) ? delivery.actions : [];
      [...configuredActions, ...fallbackNext, ...terminalActions].forEach((a)=>{
        const btn = campaignButton(a?.label || (a?.kind === 'link' ? 'Open' : 'Continue'), {
          style: campaignActionStyle(a, defaultActionStyle),
          tone: campaignButtonTone(a, defaultButtonTone),
        });
        btn.addEventListener('click', async ()=>{
          const kind = String(a?.kind || 'next').toLowerCase();
          await recordCampaign(campaignId, 'interaction', { interactionType: kind, actionId: a?.id || '', deliveryAttemptId: message.deliveryAttemptId });
          if (kind === 'link' || kind === 'cta') {
            const href = safeHref(a?.href || delivery?.cta?.href);
            if (href) W.open(href, '_blank', 'noopener,noreferrer');
            return;
          }
          if (kind === 'close') return close();
          if (kind === 'submit' || stepType === 'form') {
            const fields = readStepFields(step, body);
            wizardState.fields = Object.assign({}, wizardState.fields, fields);
            const json = await submitCampaignForm(campaignId, step, fields, a?.leadMagnetId);
            if (!json?.success) {
              appendText(body, 'div', 'cc-campaign-error', json?.message || 'Could not submit. Please check the fields.');
              return;
            }
          }
          if (kind === 'lead_magnet' || stepType === 'lead_magnet') {
            const fields = readStepFields(step, body);
            wizardState.fields = Object.assign({}, wizardState.fields, fields);
            const email = fields.email || fields.Email || wizardState.fields.email || wizardState.fields.Email || '';
            const leadMagnetId = a?.leadMagnetId || step?.leadMagnetId || '';
            const claim = await claimCampaignLeadMagnet(leadMagnetId, email);
            if (!claim?.ok || !claim?.data?.downloadUrl) {
              appendText(body, 'div', 'cc-campaign-error', claim?.message || 'Could not start the download.');
              return;
            }
            triggerCampaignDownload(claim.data.downloadUrl);
          }
          const targetId = a?.nextStepId || '';
          const nextIdx = targetId ? steps.findIndex((s)=> String(s?.id || '') === String(targetId)) : stepIndex + 1;
          if (nextIdx >= 0 && nextIdx < steps.length) renderStep(nextIdx);
          else close();
        });
        actions.appendChild(btn);
      });
      if (!actions.childElementCount) {
        const done = campaignButton('Close', 'secondary');
        done.addEventListener('click', close);
        actions.appendChild(done);
      }
      body.appendChild(actions);
    }

    const steps = Array.isArray(delivery.steps) && delivery.steps.length ? delivery.steps : [];
    if (layout === 'wizard' || steps.length) {
      renderStep(0);
    } else {
      const isHero = renderCampaignHero(card, delivery.image);
      appendText(titleWrap, 'h2', 'cc-campaign-title', delivery.title || 'Message');
      if (!isHero) renderCampaignImage(body, delivery.image);
      appendText(body, 'p', 'cc-campaign-text', delivery.body || '');
      const actions = D.createElement('div');
      applyCampaignActionsLayout(actions, delivery, layout);
      const actionList = Array.isArray(delivery.actions) && delivery.actions.length
        ? delivery.actions
        : (delivery.cta?.label ? [{ label: delivery.cta.label, href: delivery.cta.href, kind: 'link' }] : []);
      const defaultActionStyle = campaignDefaultActionStyle(delivery);
      const defaultButtonTone = campaignDefaultButtonTone(delivery);
      actionList.forEach((a)=>{
        const btn = campaignButton(a?.label || 'Open', {
          style: campaignActionStyle(a, defaultActionStyle),
          tone: campaignButtonTone(a, defaultButtonTone),
        });
        btn.addEventListener('click', async ()=>{
          const kind = String(a?.kind || 'link').toLowerCase();
          await recordCampaign(campaignId, 'interaction', { interactionType: kind, actionId: a?.id || '', deliveryAttemptId: message.deliveryAttemptId });
          if (kind === 'lead_magnet') {
            body.innerHTML = '';
            titleWrap.innerHTML = '';
            appendText(titleWrap, 'h2', 'cc-campaign-title', a?.label || delivery.title || 'Download');
            const leadStep = {
              id: `lead-${a?.id || 'magnet'}`,
              type: 'lead_magnet',
              title: a?.label || delivery.title || 'Download',
              body: a?.body || 'Enter your email to receive this resource.',
              leadMagnetId: a?.leadMagnetId || '',
              fields: [{ id:'email', label:'Email', type:'email', required:true, placeholder:'you@example.com' }],
              actions: [{ id:'claim', label:'Download', kind:'lead_magnet', leadMagnetId: a?.leadMagnetId || '' }],
            };
            delivery.steps = [leadStep];
            renderStep(0);
            return;
          }
          const href = safeHref(a?.href);
          if (href) W.open(href, '_blank', 'noopener,noreferrer');
        });
        actions.appendChild(btn);
      });
      body.appendChild(actions);
    }
    D.body.appendChild(root);
    recordCampaign(campaignId, 'impression', { deliveryAttemptId: message.deliveryAttemptId });
  }
  async function pollActiveMessages(){
    if (!cfg.messages?.enabled || !cfg.messages?.endpoint || !cfg.siteId || !hasConsent() || dnt) return;
    try{
      const u = new URL(cfg.messages.endpoint, apiBase || L.href);
      const ctx = currentCtx();
      u.searchParams.set('siteId', ctx.siteId);
      u.searchParams.set('vid', ctx.vid);
      u.searchParams.set('sid', ctx.sid);
      u.searchParams.set('path', ctx.path);
      u.searchParams.set('url', String(L.href));
      const res = await fetch(u.toString(), { method:'GET', credentials:'omit' });
      if (!res.ok) return;
      const json = await res.json().catch(()=>null);
      const list = Array.isArray(json?.data) ? json.data : [];
      if (list.length) renderCampaignMessage(list[0]);
    }catch{}
  }
  function scheduleCampaignPoll(delayMs){
    try{
      if (!cfg.messages?.enabled) return;
      W.setTimeout(pollActiveMessages, Math.max(0, Number(delayMs || 0)));
    }catch{}
  }

  // --- Public API (small surface) --------------------------------------------
  const API = {
    track: enqueue,
    consentGranted(){ ls.set('cc_consent_granted', true) },
    pageview: trackPageview,
    campaigns: {
      poll: pollActiveMessages
    }
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
    scheduleFlush();
    scheduleCampaignPoll(900);
    scheduleCampaignPoll(2500);
    scheduleCampaignPoll(6000);

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
    const searchController = createSearch();
    // Initialize chat UI (optional)
    const chatController = createChat();
    // Initialize unified Compass dock
    createDock({ search: searchController, chat: chatController });
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
