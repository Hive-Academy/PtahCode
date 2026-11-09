(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(t));
  if (!btn('Create')) { (btn('New session') || [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New')).click(); await sleep(1500); }
  btn('Create').click();
  await sleep(2500);
  const ta = document.querySelector('textarea[role=combobox]');
  ta.focus();
  ta.value = 'Without using any tools, write a 2500-word short story about a lighthouse keeper. Plain prose only.';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Send message').click();
  await sleep(7000);
  document.activeElement && document.activeElement.blur();
  return 'sent';
})()
