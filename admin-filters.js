(() => {
  const cards = document.querySelector('#cards');
  const tableRows = document.querySelector('#rows');
  if (!cards || !tableRows) return;

  let activeFilter = 'all';
  let enhancingCards = false;

  const filters = new Map([
    ['Pessoas', 'all'],
    ['Confirmados', 'confirmed'],
    ['Não vão', 'declined'],
    ['Pendentes', 'pending'],
  ]);

  function rowFilter(row) {
    const label = row.querySelector('.pill')?.textContent.trim();
    if (activeFilter === 'confirmed') return label === 'Confirmado';
    if (activeFilter === 'declined') return label === 'Não comparece';
    if (activeFilter === 'pending') return label === 'Pendente';
    return true;
  }

  function applyFilter() {
    tableRows.querySelectorAll('tr').forEach((row) => {
      if (row.querySelector('.empty')) return;
      row.hidden = !rowFilter(row);
    });

    cards.querySelectorAll('[data-filter]').forEach((card) => {
      const selected = card.dataset.filter === activeFilter;
      card.classList.toggle('active', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function enhanceCards() {
    if (enhancingCards) return;
    enhancingCards = true;

    cards.querySelectorAll('.metric').forEach((card) => {
      const label = card.querySelector('span')?.textContent.trim();
      const filter = filters.get(label);
      if (!filter || card.dataset.filter) return;

      card.dataset.filter = filter;
      card.classList.add('filterable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Filtrar por ${label}`);
      card.addEventListener('click', () => {
        activeFilter = activeFilter === filter && filter !== 'all' ? 'all' : filter;
        applyFilter();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.click();
        }
      });
    });

    enhancingCards = false;
    applyFilter();
  }

  new MutationObserver(enhanceCards).observe(cards, { childList: true });
  new MutationObserver(applyFilter).observe(tableRows, { childList: true });
  enhanceCards();
})();
