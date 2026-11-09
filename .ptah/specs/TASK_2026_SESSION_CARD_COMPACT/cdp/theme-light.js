(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Ptah Glass Light'); b && b.click(); return document.documentElement.dataset.theme; })()
