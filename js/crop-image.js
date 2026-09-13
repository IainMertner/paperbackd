// Crop a square out of an image the reader chose, and hand back a data URL.
//
// Shared by the profile avatar and the club icon, which are the same job: pan
// and zoom inside a fixed viewport, then draw the visible square to a canvas.
// The output is a 256px JPEG at 0.85, which lands around 30KB as base64 - small
// enough to keep in the document that references it, which is where both an
// avatar and a club icon live.
//
// Resolves with the data URL, or null if the reader backs out.

export function openCropModal(img) {
  return new Promise(resolve => {
    const DISPLAY = 220, OUT = 256;
    const minScale = Math.max(DISPLAY / img.naturalWidth, DISPLAY / img.naturalHeight);
    const maxScale = minScale * 10;
    let scale = minScale;
    let cx = img.naturalWidth / 2;
    let cy = img.naturalHeight / 2;

    // Build DOM first so render() can reference all elements safely
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1200;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box';
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-card);border-radius:var(--radius);padding:1.25rem;width:100%;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.3);display:flex;flex-direction:column;align-items:center;gap:.9rem';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:700;font-size:.95rem;align-self:flex-start';
    heading.textContent = 'Crop photo';

    const viewport = document.createElement('div');
    viewport.style.cssText = `position:relative;width:${DISPLAY}px;height:${DISPLAY}px;border-radius:50%;overflow:hidden;cursor:grab;touch-action:none;background:var(--bg-alt);border:1px solid var(--border)`;

    const imgEl = document.createElement('img');
    imgEl.src = img.src;
    imgEl.style.cssText = 'position:absolute;max-width:none;pointer-events:none;user-select:none';
    viewport.appendChild(imgEl);

    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = 0;
    slider.style.cssText = 'flex:1;cursor:pointer;accent-color:var(--accent)';

    function clamp() {
      const hw = DISPLAY / (2 * scale), hh = DISPLAY / (2 * scale);
      cx = Math.max(hw, Math.min(img.naturalWidth  - hw, cx));
      cy = Math.max(hh, Math.min(img.naturalHeight - hh, cy));
    }
    function render() {
      imgEl.style.width  = img.naturalWidth  * scale + 'px';
      imgEl.style.height = img.naturalHeight * scale + 'px';
      imgEl.style.left   = DISPLAY / 2 - cx * scale + 'px';
      imgEl.style.top    = DISPLAY / 2 - cy * scale + 'px';
      slider.value = ((scale - minScale) / (maxScale - minScale)) * 100;
    }
    clamp(); render();

    // Drag
    let dragging = false, lastX = 0, lastY = 0;
    viewport.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; viewport.style.cursor = 'grabbing'; e.preventDefault(); });
    document.addEventListener('mousemove', e => { if (!dragging) return; cx -= (e.clientX - lastX) / scale; cy -= (e.clientY - lastY) / scale; lastX = e.clientX; lastY = e.clientY; clamp(); render(); });
    document.addEventListener('mouseup', () => { dragging = false; viewport.style.cursor = 'grab'; });

    // Scroll zoom
    viewport.addEventListener('wheel', e => { e.preventDefault(); scale = Math.max(minScale, Math.min(scale * (e.deltaY < 0 ? 1.08 : 0.93), maxScale)); clamp(); render(); }, { passive: false });

    // Touch
    let lastDist = null;
    viewport.addEventListener('touchstart', e => { if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; lastDist = null; } else if (e.touches.length === 2) { lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } e.preventDefault(); }, { passive: false });
    viewport.addEventListener('touchmove', e => { if (e.touches.length === 1 && lastDist === null) { cx -= (e.touches[0].clientX - lastX) / scale; cy -= (e.touches[0].clientY - lastY) / scale; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; } else if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (lastDist) scale = Math.max(minScale, Math.min(scale * d / lastDist, maxScale)); lastDist = d; } clamp(); render(); e.preventDefault(); }, { passive: false });
    viewport.addEventListener('touchend', e => { if (e.touches.length < 2) lastDist = null; });

    // Slider
    slider.addEventListener('input', () => {
      scale = minScale + (slider.value / 100) * (maxScale - minScale);
      clamp(); render();
    });

    const sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = 'display:flex;align-items:center;gap:.5rem;width:100%';
    const zoomOut = document.createElement('span');
    zoomOut.style.cssText = 'font-size:.8rem;color:var(--text-muted);flex-shrink:0;line-height:1';
    zoomOut.textContent = '−';
    const zoomIn = document.createElement('span');
    zoomIn.style.cssText = 'font-size:.8rem;color:var(--text-muted);flex-shrink:0;line-height:1';
    zoomIn.textContent = '+';
    sliderWrap.append(zoomOut, slider, zoomIn);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:.75rem;width:100%;justify-content:flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:.4rem .9rem;border-radius:var(--radius);border:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:.85rem';
    cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = 'padding:.4rem .9rem;border-radius:var(--radius);border:none;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;font-size:.85rem;font-weight:600';
    applyBtn.addEventListener('click', () => {
      const srcX = cx - DISPLAY / (2 * scale);
      const srcY = cy - DISPLAY / (2 * scale);
      const srcSize = DISPLAY / scale;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      canvas.getContext('2d').drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
      overlay.remove();
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    });

    btnRow.append(cancelBtn, applyBtn);
    modal.append(heading, viewport, sliderWrap, btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}
