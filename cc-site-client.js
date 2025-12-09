/*
  Credibility Compass – Site Embed Client

  Features
  - Lightweight analytics:
      - Respects Do Not Track + optional consent gate
      - Visitor + session IDs, UTM capture, referrer trail
      - Pageviews (incl. SPA navigations), scroll depth, click/outbound links
      - Heartbeat pings, basic performance + web-vitals, error tracking
      - Batched delivery via sendBeacon with fetch fallback and retry
  - Search widget:
      - Floating launcher chip (button) + Cmd/Ctrl+K hotkey
      - Debounced queries to the Credibility Compass search API
      - Keyboard navigation (arrows + Enter), minimal inline styles
      - CC logo in launcher chip and in the search bar
  - Campaign messages:
      - Modal / toast delivery powered by the campaigns API

  Notes
  - Fixed analytics/search/campaign base: https://api.credibilitycompass.com/api/v1
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
  const cfg = {
    // Core
    siteId: cfgAttr('data-site-id') || W.CC_EMBED_SITE_ID || W.CC_EMBED_OPTS?.siteId || metaSiteId || '',
    // Prefer explicit endpoint; otherwise derive from base (if provided)
    endpoint: cfgAttr('data-endpoint') || W.CC_EMBED_OPTS?.endpoint || derive('ingest'),

    // Search widget config (endpoint is always derived from apiBase to avoid external overrides)
    search: {
      endpoint: derive('search'),
      placeholder: cfgAttr('data-search-placeholder') || 'Search…',
      hotkey: (cfgAttr('data-search-hotkey') || 'Ctrl+K').toLowerCase(),
      enabled: (cfgAttr('data-search-enabled') || 'true') === 'true',
      accent: cfgAttr('data-search-accent') || W.CC_EMBED_OPTS?.search?.accent || '#336699', // title color
      logoLight: cfgAttr('data-search-logo-light') || assetUrl('cc-symbol-light-bg.svg'),
      logoDark: cfgAttr('data-search-logo-dark') || assetUrl('cc-symbol-dark-bg.svg'),
    },

    // Campaign messages
    messages: {
      // Prefer explicit message URLs; else derive from base; else fallback to local origin
      base: cfgAttr('data-campaign-base') || W.CC_EMBED_OPTS?.messages?.base || derive('campaigns') || `${L.origin}/api/campaigns`,
      endpoint: cfgAttr('data-messages-endpoint') || W.CC_EMBED_OPTS?.messages?.endpoint || derive('campaigns/active-messages') || `${L.origin}/api/campaigns/active-messages`,
      // Default to disabled; must be explicitly enabled via data-messages-enabled="true"
      enabled: (cfgAttr('data-messages-enabled') || 'false') === 'true',
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
    state.queue.push(baseEvent(type, payload));
    if (state.queue.length >= cfg.maxBatch) flush();
  }
  function flush(){
    if (!readyToTrack() || state.flushing || !state.queue.length) return;
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
    function onChange(){ touchSession(); trackPageview({ spa:true }); scheduleFlush(); try{ if (cfg.messages?.enabled) pollActiveMessages() }catch{} }
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

  // --- Campaign messages (MVP) ----------------------------------------------
  const shownCampaigns = new Set();
  function injectCampaignStyle(){
    if (D.getElementById('cc-campaign-style')) return;
    const s = D.createElement('style'); s.id='cc-campaign-style'; s.textContent = `
      .cc-cmp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:saturate(180%) blur(4px);z-index:2147483600;display:flex;align-items:center;justify-content:center}
      .cc-cmp-modal{width:min(520px,92vw);background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;border:1px solid #eee;font:500 14px/1.5 system-ui,-apple-system,Segoe UI,Roboto}
      .cc-cmp-hd{padding:14px 16px;font-weight:700;border-bottom:1px solid #f1f1f1}
      .cc-cmp-bd{padding:14px 16px;color:#374151}
      .cc-cmp-ft{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #f1f1f1}
      .cc-cmp-btn{border:1px solid #ddd;border-radius:10px;padding:8px 12px;background:#fff;cursor:pointer}
      .cc-cmp-btn.cta{background:#111;color:#fff;border-color:#111}
      .cc-cmp-toast{position:fixed;right:16px;bottom:16px;z-index:2147483600;background:#111;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    `; D.head.appendChild(s);
  }
  async function pollActiveMessages(){
    try {
      if (!cfg.messages?.enabled) return;
      if (!cfg.messages?.endpoint || !cfg.messages?.base) return;
      const ctx = currentCtx();
      if (!ctx.siteId) return;
      const params = new URLSearchParams();
      params.append('siteId', ctx.siteId);
      params.append('vid', ctx.vid);
      params.append('sid', ctx.sid);
      params.append('path', ctx.path);
      const url = `${cfg.messages.endpoint}?${params.toString()}`;
      const res = await fetch(url, { credentials: 'omit' });
      const json = await res.json();
      const msgs = Array.isArray(json.data) ? json.data : [];
      for (const m of msgs){ if (!shownCampaigns.has(m.campaignId)) showMessage(m) }
    } catch {}
  }
  async function postImpression(id){
    try{
      const ctx = currentCtx();
      if (!ctx.siteId) return; // avoid 400s when siteId missing
      const params = new URLSearchParams({ siteId: ctx.siteId, vid: ctx.vid, sid: ctx.sid, path: ctx.path });
      const url = `${cfg.messages.base}/${id}/impression?${params.toString()}`;
      try { console.log('[CC embed] impression request', { id, url, ctx }); } catch {}
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ctx), credentials:'omit' });
      try {
        let json=null; try{ json = await res.clone().json() }catch{}
        console.log('[CC embed] impression response', { status: res.status, ok: res.ok, json });
      } catch {}
    }catch{}
  }
  async function postInteraction(id, payload){
    try{
      const ctx = currentCtx();
      if (!ctx.siteId) return;
      const body = Object.assign({}, ctx, payload||{});
      const params = new URLSearchParams({ siteId: ctx.siteId, vid: ctx.vid, sid: ctx.sid, path: ctx.path });
      const url = `${cfg.messages.base}/${id}/interaction?${params.toString()}`;
      try { console.log('[CC embed] interaction request', { id, url, body }); } catch {}
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), credentials:'omit' });
      try {
        let json=null; try{ json = await res.clone().json() }catch{}
        console.log('[CC embed] interaction response', { status: res.status, ok: res.ok, json });
      } catch {}
    }catch{}
  }
  function showMessage(m){
    injectCampaignStyle(); shownCampaigns.add(m.campaignId);
    const d = m.delivery || {}; const layout = d.layout || 'modal';
    if (layout === 'toast') return showToast(m);
    const ov = D.createElement('div'); ov.className='cc-cmp-overlay';
    const wrap = D.createElement('div'); wrap.className='cc-cmp-modal';
    const hd = D.createElement('div'); hd.className='cc-cmp-hd'; hd.textContent = String(d.title || '');
    const bd = D.createElement('div'); bd.className='cc-cmp-bd'; bd.textContent = String(d.body || '');
    const ft = D.createElement('div'); ft.className='cc-cmp-ft';
    const closeBtn = D.createElement('button'); closeBtn.className='cc-cmp-btn'; closeBtn.textContent='Close';
    closeBtn.addEventListener('click', ()=>{ ov.remove(); postInteraction(m.campaignId, { action:'dismiss' }) });
    ft.appendChild(closeBtn);
    if (d.cta?.label && d.cta?.href){
      const cta = D.createElement('a'); cta.className='cc-cmp-btn cta'; cta.textContent=String(d.cta.label); cta.href=String(d.cta.href); cta.target='_top';
      cta.addEventListener('click', ()=> postInteraction(m.campaignId, { action:'click', href:String(d.cta.href) }));
      ft.appendChild(cta);
    }
    wrap.appendChild(hd); wrap.appendChild(bd); wrap.appendChild(ft);
    ov.appendChild(wrap); D.body.appendChild(ov);
    postImpression(m.campaignId);
  }
  function showToast(m){
    injectCampaignStyle(); const d = m.delivery || {};
    const t = D.createElement('div'); t.className='cc-cmp-toast'; t.textContent = `${d.title ? d.title + ': ' : ''}${d.body || ''}`;
    D.body.appendChild(t); postImpression(m.campaignId);
    setTimeout(()=>{ t.remove() }, 6000);
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

  // --- Public API (small surface) --------------------------------------------
  const API = {
    track: enqueue,
    consentGranted(){ ls.set('cc_consent_granted', true) },
    pageview: trackPageview
  };
  W.CC = W.CC || {}; W.CC.embed = API;

  // --- Init ------------------------------------------------------------------
  function init(){
    if (!cfg.autoInit) return;
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
