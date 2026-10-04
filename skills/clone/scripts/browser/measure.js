/*
 * Remaster page measurement. Runs inside a browser tab and returns one JSON
 * object: the page's design system as rendered (colors by use, type, spacing,
 * corners, shadows, motion), its skeleton (landmarks, headings and controls
 * with their positions), its visible text, its head tags and a few tech
 * signals.
 *
 * It reads what the page renders, never its source files, so it works on any
 * framework and copies nothing. The same file is run by `remaster measure`
 * under Playwright and by hand through any agent's browser tool. If your tool
 * prints [object Object], wrap the whole file in JSON.stringify( ... ).
 */
(() => {
  const MAX_ELEMENTS = 12000;
  const MAX_NODES = 1500;
  const MAX_TEXT = 60000;
  const doc = document;
  const root = doc.documentElement;
  const W = innerWidth;
  const H = innerHeight;
  const pageW = Math.max(root.scrollWidth, doc.body ? doc.body.scrollWidth : 0);
  const pageH = Math.max(root.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
  const sx = scrollX;
  const sy = scrollY;
  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // Every color through a 1x1 canvas, so oklch(), color(), hsl() and named
  // colors all come back as the same sRGB hex the screen shows.
  const cv = doc.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const hexCache = new Map();
  const toHex = (c) => {
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || c === 'none') return null;
    if (hexCache.has(c)) return hexCache.get(c);
    let out = null;
    try {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      if (d[3] > 0) {
        const h = (v) => v.toString(16).padStart(2, '0');
        out = '#' + h(d[0]) + h(d[1]) + h(d[2]) + (d[3] < 255 ? h(d[3]) : '');
      }
    } catch (e) {
      out = null;
    }
    hexCache.set(c, out);
    return out;
  };

  // A background's color: the fill, else the first stop of a gradient, which
  // is how many buttons and bands are painted.
  const fillOf = (s) => {
    const solid = toHex(s.backgroundColor);
    if (solid) return solid;
    if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
      const m = s.backgroundImage.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|oklch\([^)]*\)|oklab\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\))/i);
      if (m) return toHex(m[1]);
    }
    return null;
  };

  const colors = new Map();
  const color = (hex) => {
    if (!colors.has(hex)) colors.set(hex, { hex, text: 0, bg: 0, border: 0, icon: 0, action: 0, label: 0 });
    return colors.get(hex);
  };
  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
  const fonts = new Map();
  const type = new Map();
  const spacing = new Map();
  const radius = new Map();
  const shadows = new Map();
  const durations = new Map();
  const easings = new Map();
  const containers = new Map();
  const gradients = [];
  let animations = 0;

  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'meta', 'link', 'br', 'head', 'title', 'source', 'track', 'wbr']);
  const ICON_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'use']);

  const visible = (el, cs, r) => {
    if (r.width < 1 || r.height < 1) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    if (r.bottom + sy < 0 || r.right + sx < 0 || r.left + sx > pageW + 1) return false;
    return true;
  };

  const nameOf = (el, role) => {
    const label = el.getAttribute('aria-label');
    if (label) return squash(label).slice(0, 80);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => doc.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(' ');
      if (squash(t)) return squash(t).slice(0, 80);
    }
    if (['header', 'nav', 'main', 'aside', 'footer', 'form', 'list', 'table'].includes(role)) return '';
    const alt = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder');
    if (alt) return squash(alt).slice(0, 80);
    if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type)) return squash(el.value).slice(0, 80);
    return squash(el.innerText || el.textContent).slice(0, 80);
  };

  // The fill or outline that makes something look like a button. Site
  // builders often put it on an inner element, so look a few levels down for
  // one that covers most of the element.
  const lookOf = (s) => {
    const bg = fillOf(s);
    const border = (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') || (s.boxShadow && s.boxShadow !== 'none');
    return bg || border ? { bg, border: !!border } : null;
  };
  const buttonLook = (el, cs, r) => {
    const own = lookOf(cs);
    if (own) return own;
    const kids = el.querySelectorAll('*');
    for (let k = 0; k < kids.length && k < 8; k++) {
      const kr = kids[k].getBoundingClientRect();
      if (kr.width * kr.height < r.width * r.height * 0.8) continue;
      const look = lookOf(getComputedStyle(kids[k]));
      if (look) return look;
    }
    return null;
  };

  // The color a control's label renders in, which is the first text inside
  // it, not the element itself (a link's own color is often the browser
  // default while its text sits in a styled child).
  const labelColor = (el) => {
    const tw = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(), i = 0; n && i < 20; n = tw.nextNode(), i++) {
      if (n.nodeValue && n.nodeValue.trim() && n.parentElement) return toHex(getComputedStyle(n.parentElement).color);
    }
    return null;
  };

  const roleOf = (el, tag, cs, r) => {
    const ar = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'header' || ar === 'banner') return 'header';
    if (tag === 'nav' || ar === 'navigation') return 'nav';
    if (tag === 'main' || ar === 'main') return 'main';
    if (tag === 'aside' || ar === 'complementary') return 'aside';
    if (tag === 'footer' || ar === 'contentinfo') return 'footer';
    if (tag === 'dialog' || ar === 'dialog' || ar === 'alertdialog') return 'dialog';
    if (/^h[1-6]$/.test(tag)) return tag;
    if (ar === 'heading') return 'h' + Math.min(6, Math.max(1, Number(el.getAttribute('aria-level')) || 2));
    if (tag === 'form' || tag === 'search' || ar === 'search' || ar === 'form') return 'form';
    if (tag === 'button' || ar === 'button' || (tag === 'input' && /^(submit|button|reset)$/i.test(el.type))) return 'button';
    if (tag === 'a' && el.hasAttribute('href')) {
      const shaped = r.height >= 28 && r.height <= 80 && r.width <= 420;
      return shaped && buttonLook(el, cs, r) ? 'button' : 'link';
    }
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || ['textbox', 'combobox', 'searchbox', 'switch', 'checkbox', 'radio', 'slider', 'spinbutton'].includes(ar)) return 'input';
    if (el.isContentEditable && !(el.parentElement && el.parentElement.isContentEditable)) return 'input';
    if (ar === 'tab') return 'tab';
    if (tag === 'img' || ar === 'img' || tag === 'picture') return r.width >= 24 && r.height >= 24 ? 'image' : null;
    if (tag === 'svg') return r.width >= 48 && r.height >= 48 ? 'image' : null;
    if (tag === 'video') return 'video';
    if (tag === 'canvas') return 'canvas';
    if (tag === 'iframe') return 'embed';
    if (tag === 'table' || ar === 'grid' || ar === 'table') return 'table';
    if ((tag === 'ul' || tag === 'ol') && el.children.length >= 2) return 'list';
    return null;
  };

  const nodes = [];
  let headerGuess = null;
  let footerGuess = null;
  const all = doc.body ? doc.body.getElementsByTagName('*') : [];
  const limit = Math.min(all.length, MAX_ELEMENTS);
  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;

    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = squash(own);
    if (own) {
      const chars = own.length;
      const t = toHex(cs.color);
      if (t) color(t).text += chars;
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (!fonts.has(family)) fonts.set(family, { family, chars: 0, weights: {} });
      const f = fonts.get(family);
      f.chars += chars;
      f.weights[cs.fontWeight] = (f.weights[cs.fontWeight] || 0) + chars;
      const key = [cs.fontSize, cs.lineHeight, cs.fontWeight, family, cs.letterSpacing].join('|');
      if (!type.has(key)) type.set(key, { size: cs.fontSize, lineHeight: cs.lineHeight, weight: cs.fontWeight, family, letterSpacing: cs.letterSpacing, count: 0, chars: 0, tags: {} });
      const ty = type.get(key);
      ty.count++;
      ty.chars += chars;
      ty.tags[tag] = (ty.tags[tag] || 0) + 1;
    }

    const bgHex = fillOf(cs);
    if (bgHex) color(bgHex).bg += Math.round((Math.min(r.width, W) * Math.min(r.height, H)) / 100);
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient') && gradients.length < 20) gradients.push(cs.backgroundImage.slice(0, 160));
    const bw = Math.max(parseFloat(cs.borderTopWidth), parseFloat(cs.borderRightWidth), parseFloat(cs.borderBottomWidth), parseFloat(cs.borderLeftWidth));
    if (bw > 0 && cs.borderTopStyle !== 'none') {
      const b = toHex(cs.borderTopColor) || toHex(cs.borderBottomColor);
      if (b) color(b).border++;
    }
    if (ICON_TAGS.has(tag)) {
      const fill = toHex(cs.fill);
      const stroke = toHex(cs.stroke);
      if (fill) color(fill).icon++;
      if (stroke) color(stroke).icon++;
    }

    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap']) {
      const v = parseFloat(cs[p]);
      if (v > 0 && v <= 240) bump(spacing, Math.round(v));
    }
    for (const p of ['marginTop', 'marginBottom']) {
      const v = parseFloat(cs[p]);
      if (v > 0 && v <= 160) bump(spacing, Math.round(v));
    }
    const rad = cs.borderTopLeftRadius;
    if (rad && rad !== '0px') bump(radius, rad.includes('%') ? rad : Math.round(parseFloat(rad)) + 'px');
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, cs.boxShadow.slice(0, 140));
    const durs = cs.transitionDuration.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000));
    if (durs.some((d) => d > 0)) {
      durs.filter((d) => d > 0).forEach((d) => bump(durations, Math.round(d)));
      cs.transitionTimingFunction.split(/,(?![^(]*\))/).forEach((e) => bump(easings, e.trim()));
    }
    if (cs.animationName && cs.animationName !== 'none') animations++;
    if (cs.maxWidth !== 'none' && r.width >= 320 && r.width < pageW - 8 && Math.abs(r.left - (pageW - r.right)) < 4) bump(containers, Math.round(r.width));

    // Candidates for a header and footer on pages built from plain divs, which
    // have no <header> or <footer> to find.
    const top = r.top + sy;
    if (!headerGuess && r.width >= pageW * 0.6 && top < 30 && r.height >= 36 && r.height <= 160 && el.getElementsByTagName('a').length >= 3) headerGuess = { el, r: { x: r.left + sx, y: top, w: r.width, h: r.height } };
    if (r.width >= pageW * 0.9 && r.bottom + sy >= pageH - 12 && r.height >= 100 && r.height <= pageH * 0.6) {
      if (!footerGuess || top > footerGuess.r.y) footerGuess = { el, r: { x: r.left + sx, y: top, w: r.width, h: r.height } };
    }

    const role = roleOf(el, tag, cs, r);
    if (role) {
      if (role === 'button' || role === 'link') {
        const fg = labelColor(el);
        if (fg) color(fg).label++;
        if (role === 'button') {
          const look = buttonLook(el, cs, r);
          if (look && look.bg) color(look.bg).action++;
        }
      }
      const node = {
        role,
        tag,
        x: Math.round(r.left + sx),
        y: Math.round(r.top + sy),
        w: Math.round(r.width),
        h: Math.round(r.height),
        name: nameOf(el, role),
      };
      if (cs.position === 'fixed' || cs.position === 'sticky') node.fixed = true;
      if (role === 'input') node.type = (el.getAttribute('type') || tag).toLowerCase();
      nodes.push(node);
    }
  }

  const round = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  if (!nodes.some((n) => n.role === 'header') && headerGuess) nodes.unshift({ role: 'header', tag: headerGuess.el.tagName.toLowerCase(), ...round(headerGuess.r), name: '', guessed: true });
  if (!nodes.some((n) => n.role === 'footer') && footerGuess) nodes.push({ role: 'footer', tag: footerGuess.el.tagName.toLowerCase(), ...round(footerGuess.r), name: '', guessed: true });

  // Visible text, grouped by the block that holds it, so a sentence with a
  // link in the middle comes back as one sentence.
  const displayOf = new WeakMap();
  const isInline = (el) => {
    if (!displayOf.has(el)) displayOf.set(el, getComputedStyle(el).display);
    const d = displayOf.get(el);
    return d === 'inline' || d === 'contents' || d === 'inline-block';
  };
  const blocks = new Map();
  const walker = doc.createTreeWalker(doc.body || root, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n && total < MAX_TEXT; n = walker.nextNode()) {
    const v = n.nodeValue;
    if (!v || !v.trim()) continue;
    let el = n.parentElement;
    if (!el || SKIP.has(el.tagName.toLowerCase())) continue;
    if (el.closest('script,style,noscript,template,[aria-hidden="true"]')) continue;
    while (el.parentElement && isInline(el) && el !== doc.body) el = el.parentElement;
    if (!blocks.has(el)) blocks.set(el, '');
    blocks.set(el, blocks.get(el) + ' ' + v);
    total += v.length;
  }
  const seen = new Set();
  const text = [];
  for (const [el, raw] of blocks) {
    const t = squash(raw);
    if (!t || seen.has(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    seen.add(t);
    const tag = el.tagName.toLowerCase();
    const kind = /^h[1-6]$/.test(tag) ? 'heading' : el.closest('button,[role="button"]') ? 'button' : el.closest('nav') ? 'nav' : el.closest('footer') ? 'footer' : 'text';
    text.push({ kind, tag, t: t.slice(0, 400) });
  }

  const meta = (name) => {
    const m = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return m ? squash(m.getAttribute('content')) : '';
  };
  const jsonLd = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (o['@type']) [].concat(o['@type']).forEach((t) => jsonLd.push(String(t)));
        if (o['@graph']) walk(o['@graph']);
      };
      walk(JSON.parse(s.textContent));
    } catch (e) {
      /* not valid JSON-LD */
    }
  });

  const internal = new Set();
  const external = new Set();
  doc.querySelectorAll('a[href]').forEach((a) => {
    try {
      const u = new URL(a.getAttribute('href'), location.href);
      if (!/^https?:$/.test(u.protocol)) return;
      if (u.origin === location.origin) {
        if (internal.size < 400) internal.add(u.pathname);
      } else if (external.size < 100) external.add(u.hostname);
    } catch (e) {
      /* not a URL */
    }
  });

  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
  let skips = 0;
  for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips++;
  const unlabeled = [...doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')].filter((el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
    if (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    return !el.closest('label');
  }).length;

  const priority = { header: 0, nav: 0, main: 0, footer: 0, aside: 0, dialog: 0, form: 1, h1: 1, h2: 1, h3: 2, button: 2, input: 2, tab: 2, table: 2, image: 3, video: 3, canvas: 3, embed: 3, list: 3, h4: 3, h5: 4, h6: 4, link: 4 };
  const kept = nodes.length <= MAX_NODES ? nodes : nodes.map((n, i) => ({ n, i })).sort((a, b) => (priority[a.n.role] ?? 5) - (priority[b.n.role] ?? 5) || a.i - b.i).slice(0, MAX_NODES).sort((a, b) => a.i - b.i).map((x) => x.n);

  const canvasBg = toHex(getComputedStyle(root).backgroundColor) || (doc.body && toHex(getComputedStyle(doc.body).backgroundColor)) || '#ffffff';
  const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));

  // Breakpoints, from every stylesheet the page lets us read. Sheets served
  // from another origin without CORS refuse, and are counted, not guessed.
  const breakpoints = new Map();
  let unreadableSheets = 0;
  const readRules = (rules) => {
    for (const r of rules) {
      const cond = r.conditionText || (r.media && r.media.mediaText) || '';
      if (cond && typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule) {
        for (const m of cond.matchAll(/(?:min|max)-width:\s*([\d.]+)(px|em|rem)|width\s*[<>]=?\s*([\d.]+)(px|em|rem)/g)) {
          const v = parseFloat(m[1] || m[3]) * ((m[2] || m[4]) === 'px' ? 1 : 16);
          if (v >= 240 && v <= 3000) bump(breakpoints, Math.round(v));
        }
      }
      if (r.cssRules) {
        try {
          readRules(r.cssRules);
        } catch (e) {
          /* a nested sheet that refuses */
        }
      }
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      readRules(sheet.cssRules);
    } catch (e) {
      unreadableSheets++;
    }
  }

  // The logo: the image or SVG in the link home near the top, else anything
  // labelled as a logo. Kept as research so the sweep can recognize it.
  const logo = (() => {
    const homes = [...doc.querySelectorAll('a[href]')].filter((a) => {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        return u.origin === location.origin && (u.pathname === '/' || u.pathname === '') && a.getBoundingClientRect().top + sy < 200;
      } catch (e) {
        return false;
      }
    });
    let el = null;
    for (const a of homes) {
      el = a.querySelector('img, svg');
      if (el) break;
    }
    el = el || doc.querySelector('img[alt*="logo" i], svg[aria-label*="logo" i], [class*="logo" i] img, [class*="logo" i] svg');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      src: el.tagName === 'IMG' ? el.currentSrc || el.src : '',
      alt: el.getAttribute('alt') || el.getAttribute('aria-label') || '',
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  })();

  // Every substantial SVG path on the page: icons, logos, illustrations. The
  // sweep fingerprints them, so a pasted copy of one is caught.
  const svgPaths = [];
  const seenPaths = new Set();
  let pathChars = 0;
  for (const p of doc.querySelectorAll('svg path[d]')) {
    const d = squash(p.getAttribute('d'));
    if (d.length < 80 || d.length > 20000 || seenPaths.has(d)) continue;
    if (svgPaths.length >= 150 || pathChars + d.length > 400000) break;
    seenPaths.add(d);
    svgPaths.push(d);
    pathChars += d.length;
  }

  return {
    v: 1,
    url: location.href,
    title: doc.title,
    lang: root.getAttribute('lang') || '',
    measuredAt: new Date().toISOString(),
    viewport: { w: W, h: H, dpr: devicePixelRatio },
    page: { w: pageW, h: pageH },
    canvas: canvasBg,
    meta: {
      description: meta('description'),
      canonical: (doc.querySelector('link[rel="canonical"]') || {}).href || '',
      robots: meta('robots'),
      ogTitle: meta('og:title'),
      ogImage: meta('og:image'),
      generator: meta('generator'),
      jsonLd: [...new Set(jsonLd)],
    },
    tech: {
      next: !!(window.__NEXT_DATA__ || doc.querySelector('script[src*="/_next/"]')),
      astro: !!doc.querySelector('astro-island, [data-astro-cid], [data-astro-source-file]'),
      vue: !!(window.__VUE__ || doc.querySelector('[data-v-app]')),
      svelte: !!doc.querySelector('[class*="svelte-"]'),
      webflow: !!root.getAttribute('data-wf-page'),
      framer: !!doc.querySelector('[data-framer-name]'),
      wordpress: !!doc.querySelector('link[href*="wp-content"], script[src*="wp-includes"]'),
      shopify: !!window.Shopify,
      smoothScroll: root.classList.contains('lenis') || !!doc.querySelector('[data-scroll-container]'),
      gsap: !!window.gsap,
      three: !!window.THREE,
      canvas: doc.querySelectorAll('canvas').length,
      video: doc.querySelectorAll('video').length,
      iframes: doc.querySelectorAll('iframe').length,
      lottie: !!doc.querySelector('lottie-player, dotlottie-player, dotlottie-wc'),
    },
    colors: [...colors.values()].sort((a, b) => b.text + b.bg + b.border * 10 + b.icon * 5 + b.action * 40 + b.label * 10 - (a.text + a.bg + a.border * 10 + a.icon * 5 + a.action * 40 + a.label * 10)),
    fonts: [...fonts.values()].sort((a, b) => b.chars - a.chars),
    type: [...type.values()].sort((a, b) => b.chars - a.chars).slice(0, 60),
    spacing: sortMap(spacing).slice(0, 40),
    radius: sortMap(radius).slice(0, 12),
    shadows: sortMap(shadows).slice(0, 12),
    motion: { durations: sortMap(durations).slice(0, 12), easings: sortMap(easings).slice(0, 8), animations },
    containers: sortMap(containers).slice(0, 8),
    breakpoints: { values: sortMap(breakpoints).slice(0, 12), unreadableSheets },
    logo,
    svgPaths,
    gradients: [...new Set(gradients)],
    nodes: kept,
    text,
    links: { internal: [...internal], external: [...external] },
    a11y: {
      lang: !!root.getAttribute('lang'),
      h1: headings.filter((h) => h === 1).length,
      headingSkips: skips,
      imagesNoAlt: [...doc.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      buttonsNoName: nodes.filter((n) => n.role === 'button' && !n.name).length,
      inputsNoLabel: unlabeled,
    },
  };
})();
