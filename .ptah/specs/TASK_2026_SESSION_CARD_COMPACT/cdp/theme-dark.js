(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Ptah Glass'); b && b.click(); return document.documentElement.dataset.theme; })()
