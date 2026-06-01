// EasyLang Extension
console.log('EasyLang extension loaded');

// ── Are we in a top-level frame or an iframe? ────────────────────────
const IS_TOP = (window === window.top);

// ── postMessage protocol ─────────────────────────────────────────────
// TOP → IFRAME:  { type: 'EASYLANG_FIND' }
// IFRAME → TOP:  { type: 'EASYLANG_RESULT', javaCode: '...' }
//                { type: 'EASYLANG_NONE' }   (no block found in this frame)

// ── Top frame: receive results from iframes ──────────────────────────
let iframeResultTimer = null;

if (IS_TOP) {
  window.addEventListener('message', function (e) {
    if (e.data?.type === 'EASYLANG_RESULT') {
      clearTimeout(iframeResultTimer);
      showOverlay(e.data.javaCode, null, false);
    }
  });
}

// ── All frames: receive FIND requests from top ───────────────────────
window.addEventListener('message', function (e) {
  if (e.data?.type !== 'EASYLANG_FIND') return;

  const result = findEditor();
  if (!result) { e.source?.postMessage({ type: 'EASYLANG_NONE' }, '*'); return; }

  const blocks = findBlocks(result.text);
  if (blocks.length === 0) { e.source?.postMessage({ type: 'EASYLANG_NONE' }, '*'); return; }

  const javaCode = blocks
    .map(b => window.EasyLangConvert.generate(window.EasyLangConvert.parse(b.code)))
    .join('\n\n');

  // Send result up to the top frame (or show locally if we ARE top)
  if (IS_TOP) {
    showOverlay(javaCode, result.editorEl, false);
  } else {
    // Show in our own document too (iframe might cover whole screen)
    showOverlay(javaCode, result.editorEl, false);
    // Also notify the top frame
    window.top.postMessage({ type: 'EASYLANG_RESULT', javaCode }, '*');
  }
});

// ── Keyboard shortcut ────────────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'j')) return;
  e.preventDefault();

  console.log('EasyLang shortcut pressed in', IS_TOP ? 'top frame' : 'iframe');

  // ── Step 1: try to find a COMPLETE block in this frame ──────────
  const result = findEditor();

  if (result) {
    console.log('EasyLang: editor found via', result.type, '— text length:', result.text.length);
    console.log('EasyLang: first 200 chars:', result.text.slice(0, 200));

    const blocks = findBlocks(result.text);

    if (blocks.length > 0) {
      const javaCode = blocks
        .map(b => window.EasyLangConvert.generate(window.EasyLangConvert.parse(b.code)))
        .join('\n\n');
      showOverlay(javaCode, result.editorEl, false);

      // Also notify top frame (in case we're in an iframe)
      if (!IS_TOP) {
        window.top.postMessage({ type: 'EASYLANG_RESULT', javaCode }, '*');
      }
      return;
    }
  }

  // ── Step 2 (top frame only): ask all iframes to look ────────────
  if (IS_TOP) {
    console.log('EasyLang: no complete block in top frame — polling iframes...');

    const iframes = document.querySelectorAll('iframe');

    if (iframes.length === 0) {
      showNoBlockError();
      return;
    }

    let responded = 0;
    const total = iframes.length;

    // Set a timeout — if no iframe responds with a result, show the error
    iframeResultTimer = setTimeout(() => {
      console.log('EasyLang: iframes did not respond in time');
      showNoBlockError();
    }, 800);

    // Override: if any iframe sends EASYLANG_RESULT, the message listener above
    // will clear the timer and show the result. We just need to broadcast.
    for (const iframe of iframes) {
      try {
        iframe.contentWindow.postMessage({ type: 'EASYLANG_FIND' }, '*');
      } catch (err) {}
    }
  }
});

// ── Show the "no block found" error ──────────────────────────────────
function showNoBlockError() {
  showOverlay(
`ERROR: No EasyLang block found.

Wrap your code like:

import easylang {
    ...
}

TIP: Click inside the code editor once,
then press Ctrl+Shift+J again.`,
    null, true
  );
}

// ── Collect ALL candidate editors in this frame's document ───────────
function collectAllEditors() {
  const candidates = [];

  // ── CodeMirror 6 ──────────────────────────────────────────────────
  for (const el of document.querySelectorAll('.cm-editor')) {
    const text = getCM6Text(el);
    if (text && text.trim()) candidates.push({ type: 'codemirror6', text, editorEl: el });
  }

  // ── CodeMirror 5 ──────────────────────────────────────────────────
  for (const el of document.querySelectorAll('.CodeMirror')) {
    const cm = el.CodeMirror;
    if (cm && typeof cm.getValue === 'function') {
      const text = cm.getValue();
      if (text.trim()) candidates.push({ type: 'codemirror5', text, editorEl: el, cmInstance: cm });
    }
  }

  // ── Monaco (window.monaco) ────────────────────────────────────────
  try {
    if (window.monaco?.editor) {
      for (const model of (window.monaco.editor.getModels?.() ?? [])) {
        const text = model.getValue();
        if (text.trim()) {
          candidates.push({
            type: 'monaco',
            text,
            editorEl: document.querySelector('.monaco-editor') || document.body
          });
        }
      }
    }
  } catch (e) {}

  // ── Monaco DOM fallback (.view-lines) ─────────────────────────────
  if (!candidates.some(c => c.type === 'monaco')) {
    for (const el of document.querySelectorAll('.monaco-editor')) {
      if (el.closest('.monaco-editor') !== el) continue;
      const lines = Array.from(el.querySelectorAll('.view-lines .view-line'))
        .map(l => {
          const c = l.cloneNode(true);
          c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
          return c.textContent || '';
        });
      const text = lines.join('\n');
      if (text.trim()) candidates.push({ type: 'monaco-dom', text, editorEl: el });
    }
  }

  // ── Ace ───────────────────────────────────────────────────────────
  const aceGlobals = [
    () => window.ace,
    () => { const e = window.env?.editor; return e && { edit: () => e }; },
    () => { const e = window.jDoodle?.editor; return e && { edit: () => e }; },
    () => { const e = window.editor; return e && typeof e.getValue === 'function' && { edit: () => e }; },
  ];
  for (const getAce of aceGlobals) {
    try {
      const aceObj = getAce();
      if (!aceObj) continue;
      if (typeof aceObj.edit === 'function') {
        for (const root of document.querySelectorAll('.ace_editor')) {
          try {
            const text = aceObj.edit(root).getValue();
            if (text.trim()) candidates.push({ type: 'ace', text, editorEl: root });
          } catch (e) {}
        }
      } else if (typeof aceObj.getValue === 'function') {
        const text = aceObj.getValue();
        if (text.trim()) candidates.push({
          type: 'ace', text,
          editorEl: document.querySelector('.ace_editor') || document.body
        });
      }
    } catch (e) {}
  }

  // ── Active element ────────────────────────────────────────────────
  const active = document.activeElement;
  if (active) {
    if (active.tagName === 'TEXTAREA' ||
        (active.tagName === 'INPUT' && active.type === 'text')) {
      if (active.value.trim())
        candidates.push({ type: 'textarea', text: active.value, editorEl: active });
    } else if (active.isContentEditable && active.innerText.trim()) {
      candidates.push({ type: 'contenteditable', text: active.innerText, editorEl: active });
    }
  }

  // ── Generic textarea scan ─────────────────────────────────────────
  for (const ta of document.querySelectorAll('textarea')) {
    if (ta.value && ta.value.trim())
      candidates.push({ type: 'textarea', text: ta.value, editorEl: ta });
  }

  return candidates;
}

// ── Pick the best editor ─────────────────────────────────────────────
// FIX: must have a COMPLETE block (opening + closing brace).
// Skips candidates that only have "import easylang {" with no "}" —
// e.g. Programiz's hidden 19-char textarea.
function findEditor() {
  const candidates = collectAllEditors();
  if (candidates.length === 0) return null;

  // Priority 1: has a COMPLETE easylang block
  const withCompleteBlock = candidates.find(c => findBlocks(c.text).length > 0);
  if (withCompleteBlock) return withCompleteBlock;

  // Priority 2: has the opening at least (incomplete due to virtual rendering?)
  const withOpening = candidates.find(c => /import\s+easylang\s*\{/i.test(c.text));
  if (withOpening) return withOpening;

  // Priority 3: mentions easylang
  const withKeyword = candidates.find(c => /easylang/i.test(c.text));
  if (withKeyword) return withKeyword;

  return candidates[0];
}

function findEditorElement() {
  return findEditor()?.editorEl ?? null;
}

// ── Read full text from a CodeMirror 6 editor element ────────────────
// IMPORTANT: CM6 uses virtual rendering — only VISIBLE lines are in the
// DOM. If "import easylang {" is off-screen, the DOM fallback misses it.
// We MUST use the internal EditorView state for the full document.
function getCM6Text(cm6El) {
  // Path 1: .cm-content → cmView.editorView (standard CM6, Programiz)
  try {
    const t = cm6El.querySelector('.cm-content')?.cmView?.editorView?.state?.doc?.toString();
    if (t != null) { console.log('CM6 path 1 ✓'); return t; }
  } catch (e) {}

  // Path 2: .cm-editor → cmView.view (some custom setups)
  try {
    const t = cm6El.cmView?.view?.state?.doc?.toString();
    if (t != null) { console.log('CM6 path 2 ✓'); return t; }
  } catch (e) {}

  // Path 3: scan own properties of .cm-editor for EditorView
  try {
    for (const k of Object.getOwnPropertyNames(cm6El)) {
      const v = cm6El[k];
      if (v?.state?.doc?.toString) {
        const t = v.state.doc.toString();
        if (t) { console.log('CM6 path 3 ✓ key=' + k); return t; }
      }
    }
  } catch (e) {}

  // Path 4: scan own properties of .cm-content for EditorView
  try {
    const content = cm6El.querySelector('.cm-content');
    if (content) {
      for (const k of Object.getOwnPropertyNames(content)) {
        const v = content[k];
        if (v && typeof v === 'object') {
          const ev = v.editorView ?? v.view;
          const t = ev?.state?.doc?.toString();
          if (t) { console.log('CM6 path 4 ✓ key=' + k); return t; }
        }
      }
    }
  } catch (e) {}

  // Last resort: DOM .cm-line (may miss off-screen lines due to virtual rendering)
  const lines = Array.from(cm6El.querySelectorAll('.cm-line')).map(l => {
    const c = l.cloneNode(true);
    c.querySelectorAll('.cm-widgetBuffer,.cm-placeholder,[aria-hidden="true"]')
     .forEach(n => n.remove());
    return c.textContent || '';
  });
  const domText = lines.join('\n');
  if (domText.trim()) {
    console.warn('CM6: using DOM fallback — virtual rendering may hide off-screen lines');
    return domText;
  }
  return null;
}

// ── Insert Java back into the editor ─────────────────────────────────
function insertIntoEditor(text, editorEl) {
  try {
    if (editorEl?.classList?.contains('cm-editor')) {
      editorEl.focus(); document.execCommand('insertText', false, text);
      return { success: true };
    }
    const cm5 = editorEl?.CodeMirror ?? editorEl?.closest?.('.CodeMirror')?.CodeMirror;
    if (cm5?.setValue) { cm5.setValue(cm5.getValue() + '\n\n' + text); return { success: true }; }
    if (window.ace && editorEl) {
      try { const a = window.ace.edit(editorEl); a.insert(text); return { success: true }; } catch (e) {}
    }
    if (editorEl?.getValue && editorEl?.setValue) {
      editorEl.setValue(editorEl.getValue() + '\n\n' + text); return { success: true };
    }
    if (editorEl?.tagName === 'TEXTAREA' || editorEl?.tagName === 'INPUT') {
      editorEl.focus(); editorEl.value += '\n\n' + text;
      editorEl.dispatchEvent(new Event('input', { bubbles: true })); return { success: true };
    }
    if (editorEl?.isContentEditable) {
      editorEl.focus(); document.execCommand('insertText', false, text); return { success: true };
    }
    return { success: false, reason: 'No writable editor' };
  } catch (err) { return { success: false, reason: err.message }; }
}

// ── Block parser — case-insensitive, tolerates spaces before '{' ──────
function findBlocks(src) {
  const norm = src.replace(/\r/g, '');
  const blocks = [];
  const re = /import\s+easylang\s*\{/gi;
  let m;
  while ((m = re.exec(norm)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 1, i = open + 1;
    while (i < norm.length && depth > 0) {
      if (norm[i] === '{') depth++;
      else if (norm[i] === '}') depth--;
      i++;
    }
    if (depth === 0) blocks.push({ code: norm.substring(open + 1, i - 1).trim() });
  }
  return blocks;
}

// ── Overlay ───────────────────────────────────────────────────────────
function showOverlay(text, editorEl, isError) {
  document.getElementById('easylang-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'easylang-overlay';
  overlay.style.cssText = `
    position:fixed; right:16px; bottom:16px; width:430px; max-height:78vh;
    display:flex; flex-direction:column; background:#1e1e1e; color:#d4d4d4;
    border:1.5px solid ${isError ? '#f44747' : '#4ec9b0'}; border-radius:10px;
    z-index:2147483647; font-family:Consolas,monospace; font-size:13px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6); overflow:hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; background:${isError ? '#3a1515' : '#1a2e2b'};
  `;

  const title = document.createElement('span');
  title.style.cssText = 'font-weight:bold; color:' + (isError ? '#f44747' : '#4ec9b0');
  title.textContent = isError ? '⚠ EasyLang Error' : '✓ EasyLang → Java';
  header.appendChild(title);

  if (!isError) {
    const btn = document.createElement('button');
    btn.textContent = '▶ Insert into Editor';
    btn.style.cssText = `background:#4ec9b0;color:#000;border:none;border-radius:4px;
      padding:4px 10px;cursor:pointer;font-family:inherit;font-size:12px;margin-right:8px;`;
    btn.onclick = () => {
      const r = findEditor();
      if (insertIntoEditor(text, r?.editorEl ?? editorEl).success)
        btn.textContent = '✓ Inserted!';
    };
    header.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `background:transparent;color:#d4d4d4;border:none;
    cursor:pointer;font-size:16px;padding:0 4px;font-family:inherit;`;
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });

  const pre = document.createElement('pre');
  pre.style.cssText = `margin:0;padding:14px;overflow-y:auto;white-space:pre-wrap;
    line-height:1.6;flex:1;color:${isError ? '#f44747' : '#d4d4d4'};`;
  pre.textContent = text;

  const footer = document.createElement('div');
  footer.style.cssText = 'padding:6px 14px;font-size:11px;color:#555;border-top:1px solid #333;';
  footer.textContent = 'Press ESC to close.';

  overlay.appendChild(header);
  overlay.appendChild(pre);
  overlay.appendChild(footer);
  document.body.appendChild(overlay);
}

// ── MutationObserver (keep editor reference fresh) ───────────────────
let lastDetectedEditorEl = null;
const observer = new MutationObserver(() => {
  const el = findEditorElement();
  if (el) lastDetectedEditorEl = el;
});
observer.observe(document.body, { childList: true, subtree: true });
lastDetectedEditorEl = findEditorElement();