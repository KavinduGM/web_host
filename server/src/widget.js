// Self-contained "Claim This Website" widget.  Served verbatim as a static
// JS file from /__widget__/widget.js and injected by demoServer into every
// served template / tenant page.  Context (slug, source_kind, source_name)
// is provided via `window.__CLAIM_WIDGET_CTX__` written inline just before
// this script tag.
//
// All UI lives inside a Shadow DOM so the host site's CSS can't bleed in.
// No external dependencies — copy/pasteable into any page.

(function () {
  if (window.__CLAIM_WIDGET_LOADED__) return;
  window.__CLAIM_WIDGET_LOADED__ = true;

  const CTX = window.__CLAIM_WIDGET_CTX__ || {};
  if (!CTX.source_slug || !CTX.source_kind) return; // safety: no context, no widget

  const OFFER_PRICE = (CTX.offer_price && String(CTX.offer_price).trim()) || '$800';

  // Tiny HTML-escape helper for safely interpolating the price into innerHTML.
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mount() {
    if (!document.body) return setTimeout(mount, 50);

    const host = document.createElement('div');
    host.id = '__claim_widget__';
    host.setAttribute('aria-label', 'Claim this website widget');
    Object.assign(host.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: '2147483647', // max safe z-index
      pointerEvents: 'auto',
    });
    document.body.appendChild(host);

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE_HTML;

    // ---- elements ----
    const fab        = root.getElementById('fab');
    const card       = root.getElementById('card');
    const closeBtn   = root.getElementById('close');
    const form       = root.getElementById('form');
    const submitBtn  = root.getElementById('submit');
    const errBox     = root.getElementById('err');
    const successBox = root.getElementById('success');
    const ackName    = root.getElementById('ackname');

    function openCard() {
      card.classList.add('open');
      fab.classList.add('hidden');
      const nameInput = root.getElementById('f-name');
      setTimeout(() => nameInput && nameInput.focus(), 200);
    }
    function closeCard() {
      card.classList.remove('open');
      fab.classList.remove('hidden');
    }

    fab.addEventListener('click', openCard);
    closeBtn.addEventListener('click', closeCard);

    // Escape key closes the card
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card.classList.contains('open')) closeCard();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      const data = {
        source_kind: CTX.source_kind,
        source_id:   CTX.source_id || null,
        source_slug: CTX.source_slug,
        source_name: CTX.source_name,
        name:    root.getElementById('f-name').value.trim(),
        email:   root.getElementById('f-email').value.trim(),
        phone:   root.getElementById('f-phone').value.trim(),
        message: root.getElementById('f-message').value.trim(),
      };

      try {
        const res = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not submit — please try again.');

        // Success state
        form.style.display = 'none';
        successBox.style.display = 'block';
        ackName.textContent = data.name.split(' ')[0] || data.name;
      } catch (err) {
        errBox.textContent = err.message || 'Could not submit — please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Claim Now →';
      }
    });
  }

  // ---- HTML + CSS ---- (declared BEFORE mount() runs — when this script is
  // loaded with `async` and the DOM is already parsed, mount() executes
  // synchronously and would otherwise hit `TEMPLATE_HTML` in its temporal
  // dead zone, crashing the widget before it ever renders.)
  const TEMPLATE_HTML = `
    <style>
      :host, * { box-sizing: border-box; }
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                     "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a1a;
      }

      /* ---- FAB ---- */
      #fab {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 18px 26px;
        border: none;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
        background-size: 200% 200%;
        cursor: pointer;
        box-shadow:
          0 14px 36px -8px rgba(139, 92, 246, 0.6),
          0 6px 16px -2px rgba(0, 0, 0, 0.18);
        transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        animation: bgshift 8s ease-in-out infinite, pulse 2.5s ease-in-out infinite;
        font-family: inherit;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
      #fab .icon { font-size: 20px; }
      #fab:hover {
        transform: translateY(-2px);
        box-shadow:
          0 14px 36px -8px rgba(139, 92, 246, 0.65),
          0 6px 16px -2px rgba(0, 0, 0, 0.2);
        animation-play-state: paused;
      }
      #fab:active { transform: translateY(0); }
      #fab.hidden { opacity: 0; pointer-events: none; transform: scale(0.9); }
      #fab .dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: #fbbf24;
        box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.7);
        animation: dot-pulse 1.5s ease-out infinite;
      }

      @keyframes bgshift {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
      }
      @keyframes pulse {
        0%, 100% { box-shadow: 0 10px 30px -8px rgba(139, 92, 246, 0.55), 0 4px 12px -2px rgba(0, 0, 0, 0.15); }
        50%      { box-shadow: 0 10px 30px -8px rgba(139, 92, 246, 0.8), 0 4px 18px -2px rgba(139, 92, 246, 0.4); }
      }
      @keyframes dot-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6); }
        100% { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
      }

      /* ---- Card ---- */
      #card {
        position: absolute;
        bottom: 0; right: 0;
        width: 360px;
        max-width: calc(100vw - 40px);
        background: #fff;
        border-radius: 16px;
        box-shadow:
          0 25px 50px -12px rgba(0, 0, 0, 0.25),
          0 0 0 1px rgba(0, 0, 0, 0.05);
        overflow: hidden;
        opacity: 0;
        transform: translateY(20px) scale(0.96);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #card.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      /* ---- Card header ---- */
      .hdr {
        position: relative;
        padding: 22px 22px 18px;
        color: #fff;
        background:
          radial-gradient(120% 100% at 0% 0%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%),
          linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
      }
      .hdr .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(6px);
        margin-bottom: 10px;
      }
      .hdr .badge .pulse-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #fbbf24;
        animation: dot-pulse 1.5s ease-out infinite;
      }
      .hdr h2 {
        margin: 0 0 4px;
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .hdr .price {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-top: 8px;
      }
      .hdr .price .amount {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1;
      }
      .hdr .price .sub {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.85;
      }
      #close {
        position: absolute;
        top: 12px; right: 12px;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        border-radius: 50%;
        color: #fff;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        transition: background 0.15s ease;
        font-family: inherit;
      }
      #close:hover { background: rgba(255, 255, 255, 0.3); }

      /* ---- Card body ---- */
      .body {
        padding: 18px 22px 22px;
      }
      .pitch {
        color: #4b5563;
        font-size: 13px;
        line-height: 1.55;
        margin: 0 0 14px;
      }
      .pitch strong { color: #111827; font-weight: 600; }

      .features {
        display: grid;
        gap: 6px;
        margin: 0 0 16px;
        padding: 0;
        list-style: none;
        font-size: 12.5px;
        color: #374151;
      }
      .features li {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .features .check {
        flex: 0 0 16px;
        width: 16px; height: 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        display: flex; align-items: center; justify-content: center;
      }

      /* ---- Form ---- */
      .field {
        margin-bottom: 10px;
      }
      .field label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        margin-bottom: 4px;
      }
      .field input,
      .field textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        color: #111827;
        background: #f9fafb;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        outline: none;
      }
      .field input:focus,
      .field textarea:focus {
        border-color: #8b5cf6;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
      }
      .field textarea {
        resize: vertical;
        min-height: 60px;
        max-height: 120px;
      }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

      #submit {
        width: 100%;
        margin-top: 6px;
        padding: 12px 18px;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
        cursor: pointer;
        font-family: inherit;
        transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        box-shadow: 0 6px 18px -4px rgba(139, 92, 246, 0.45);
        letter-spacing: 0.01em;
      }
      #submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px -4px rgba(139, 92, 246, 0.6);
      }
      #submit:disabled { opacity: 0.6; cursor: wait; }

      #err {
        margin-top: 10px;
        font-size: 12.5px;
        color: #dc2626;
        background: #fee2e2;
        padding: 8px 12px;
        border-radius: 8px;
        min-height: 0;
      }
      #err:empty { display: none; }

      .foot {
        margin-top: 12px;
        font-size: 11px;
        color: #9ca3af;
        text-align: center;
      }

      /* ---- Success state ---- */
      #success {
        display: none;
        text-align: center;
        padding: 12px 4px 6px;
      }
      #success .check-big {
        width: 56px; height: 56px;
        margin: 0 auto 14px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        font-size: 28px;
        font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 8px 24px -4px rgba(16, 185, 129, 0.45);
        animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes pop {
        0%   { transform: scale(0.3); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      #success h3 {
        margin: 0 0 6px;
        font-size: 17px;
        font-weight: 700;
        color: #111827;
      }
      #success p {
        margin: 0;
        color: #6b7280;
        font-size: 13px;
        line-height: 1.55;
      }

      /* Small-screen tweaks */
      @media (max-width: 420px) {
        :host { /* host wrapper handles position */ }
        #card { width: calc(100vw - 32px); }
        .row2 { grid-template-columns: 1fr; }
      }
    </style>

    <button id="fab" type="button" aria-label="Open claim offer">
      <span class="dot"></span>
      <span class="icon">🎁</span>
      <span>Claim This Site • ${esc(OFFER_PRICE)}</span>
    </button>

    <div id="card" role="dialog" aria-labelledby="card-title" aria-modal="false">
      <div class="hdr">
        <button id="close" type="button" aria-label="Close">×</button>
        <span class="badge"><span class="pulse-dot"></span>Limited Time Offer</span>
        <h2 id="card-title">Claim This Website</h2>
        <div class="price">
          <span class="amount">${esc(OFFER_PRICE)}</span>
          <span class="sub">one-time · all-in</span>
        </div>
      </div>

      <div class="body">
        <form id="form" novalidate>
          <p class="pitch">
            Get <strong>this exact website</strong> branded for your business — your logo,
            colors, content, and contact info. Live in 48 hours.
          </p>
          <ul class="features">
            <li><span class="check">✓</span> Full custom branding</li>
            <li><span class="check">✓</span> Domain &amp; free hosting with SSL included</li>
            <li><span class="check">✓</span> 2 revisions round included</li>
            <li><span class="check">✓</span> Lifetime bug-free guarantee</li>
            <li><span class="check">✓</span> 24/7 customer support</li>
            <li><span class="check">✓</span> Free on-site SEO &amp; Google Search Console setup</li>
          </ul>

          <div class="field">
            <label for="f-name">Your name</label>
            <input id="f-name" name="name" type="text" autocomplete="name" required />
          </div>
          <div class="row2">
            <div class="field">
              <label for="f-email">Email</label>
              <input id="f-email" name="email" type="email" autocomplete="email" required />
            </div>
            <div class="field">
              <label for="f-phone">Phone</label>
              <input id="f-phone" name="phone" type="tel" autocomplete="tel" />
            </div>
          </div>
          <div class="field">
            <label for="f-message">Anything we should know? (optional)</label>
            <textarea id="f-message" name="message" rows="2"></textarea>
          </div>

          <button id="submit" type="submit">Claim Now →</button>
          <div id="err" role="alert"></div>
          <div class="foot">We'll reply within a few hours · No spam, ever.</div>
        </form>

        <div id="success">
          <div class="check-big">✓</div>
          <h3>Got it, <span id="ackname">there</span>!</h3>
          <p>We'll reach out shortly to lock in your ${esc(OFFER_PRICE)} offer. Check your inbox.</p>
        </div>
      </div>
    </div>
  `;

  // Now that TEMPLATE_HTML is initialized, kick off mount.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
