(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(t));
  if (!btn('Create')) { ([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New') || btn('New session')).click(); await sleep(1500); }
  btn('Create').click();
  await sleep(2500);
  const ta = document.querySelector('textarea[role=combobox]');
  ta.focus();
  ta.value = 'Start the shell command sleep 180 as a background task (run_in_background: true). Then wait for that background task to finish before you reply with one word: done.';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Send message').click();
  await sleep(7000);
  document.activeElement && document.activeElement.blur();
  return 'sent';
})()
