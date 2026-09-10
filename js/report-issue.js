// "Something about this book is wrong."
//
// Readers cannot edit catalogue books any more — the record is shared, so one
// library's correction would contradict every other. This is what replaced that
// edit box: say what is wrong, and it lands in a queue an admin works through.
//
// Deliberately just a text box. A set of "wrong country / wrong year" buttons
// would only capture the problems already thought of, and the interesting
// reports are the ones nobody predicted.

import { esc } from './utils.js';
import { reportBookIssue } from './firebase.js';

const MAX = 1000;

export function openReportDialog(book, { user, profile, onDone } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'cover-picker-overlay';

  const modal = document.createElement('div');
  modal.className = 'cover-picker-modal';
  modal.style.maxWidth = '30rem';
  modal.innerHTML = `
    <div style="font-weight:600;margin-bottom:.2rem">Report an issue</div>
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">${esc(book.title || 'this book')}${book.author ? ` - ${esc(book.author)}` : ''}</div>
    <textarea id="ri-text" class="join-club-input" rows="4" maxlength="${MAX}"
      placeholder="What's wrong with this entry?"
      style="width:100%;box-sizing:border-box;font-size:.9rem;font-family:inherit;resize:vertical;text-align:left"></textarea>
    <div id="ri-status" style="display:none;font-size:.82rem;margin-top:.5rem"></div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.75rem">
      <button type="button" id="ri-cancel" class="btn-update" style="background:none;border:1px solid var(--border);color:var(--text-muted)">Cancel</button>
      <button type="button" id="ri-send" class="btn-update">Send report</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const textEl   = modal.querySelector('#ri-text');
  const statusEl = modal.querySelector('#ri-status');
  const sendBtn  = modal.querySelector('#ri-send');

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#ri-cancel').addEventListener('click', close);
  // Escape closes, and the listener goes with the overlay so it cannot pile up
  // across repeated opens.
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  sendBtn.addEventListener('click', async () => {
    const text = textEl.value.trim();
    if (!text) {
      statusEl.textContent = 'Describe the problem first.';
      statusEl.style.color = 'var(--danger,#d44)';
      statusEl.style.display = '';
      textEl.focus();
      return;
    }
    sendBtn.disabled = true;
    statusEl.textContent = 'Sending…';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.display = '';
    try {
      await reportBookIssue({ gbid: book.gbid, title: book.title, author: book.author, text }, user, profile);
      document.removeEventListener('keydown', onKey);
      close();
      onDone?.();
    } catch (err) {
      console.error('Report failed:', err);
      statusEl.textContent = 'Could not send that. Try again in a moment.';
      statusEl.style.color = 'var(--danger,#d44)';
      sendBtn.disabled = false;
    }
  });

  textEl.focus();
}
