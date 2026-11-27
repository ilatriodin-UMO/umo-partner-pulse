(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { trips: [], employees: [], selected: dateKey(new Date()), month: firstOfMonth(new Date()), employee: '', editing: null, loading: true, hasLoaded: false };
  const transportNames = { plane: 'Самолёт', train: 'Поезд', car: 'Автомобиль' };
  const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
  const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const shortFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  const moneyFormat = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  const today = () => dateKey(new Date());
  function firstOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function parseDate(value) { const [y, m, d] = String(value).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function employeeName(id) { return state.employees.find(e => String(e.id) === String(id))?.full_name || 'Сотрудник'; }
  function tripDates(trip) { return `${shortFormat.format(parseDate(trip.start_date))} — ${dayFormat.format(parseDate(trip.end_date))}`; }
  function overlaps(trip, start, end) { return trip.start_date <= end && trip.end_date >= start; }
  function visibleTrips() { return state.trips.filter(t => !state.employee || String(t.employee_id) === state.employee); }
  function showNotice(message, error = false) { const node = $('#notice'); node.textContent = message; node.classList.toggle('error', error); node.hidden = !message; }
  function showError(node, message) { node.textContent = message; node.hidden = !message; }
  function errorText(error) { return error?.message || 'Попробуйте ещё раз.'; }
  function renderEmployees() {
    const filter = $('#employee-filter');
    const formSelect = $('#trip-form [name="employee_id"]');
    const current = filter.value;
    const options = state.employees.map(e => `<option value="${esc(e.id)}">${esc(e.full_name)}</option>`).join('');
    filter.innerHTML = '<option value="">Все сотрудники</option>' + options;
    filter.value = current;
    formSelect.innerHTML = '<option value="">Выберите сотрудника</option>' + options;
    $('#employees-list').innerHTML = state.loading ? '<div class="empty">Загрузка сотрудников…</div>' : state.employees.length ? state.employees.map(e => `<div class="employee-chip">${esc(e.full_name)}</div>`).join('') : '<div class="empty">Сотрудников пока нет. Добавьте первого сотрудника.</div>';
  }
  function renderCalendar() {
    $('#month-label').textContent = monthFormat.format(state.month);
    $('#selected-date').textContent = dayFormat.format(parseDate(state.selected));
    const year = state.month.getFullYear(), month = state.month.getMonth();
    const start = new Date(year, month, 1 - ((new Date(year, month, 1).getDay() + 6) % 7));
    const trips = visibleTrips();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = dateKey(date), count = trips.filter(t => overlaps(t, key, key)).length;
      const cls = [date.getMonth() !== month ? 'outside' : '', key === state.selected ? 'selected' : '', key === today() ? 'today' : ''].join(' ');
      cells.push(`<button type="button" class="calendar-day ${cls}" data-date="${key}" aria-label="${esc(dayFormat.format(date))}: поездок ${count}" aria-pressed="${key === state.selected}"><span class="day-number">${date.getDate()}</span>${count ? `<span class="day-dot"></span><span class="day-count-small">${count} ${plural(count, 'поездка', 'поездки', 'поездок')}</span>` : ''}</button>`);
    }
    $('#calendar-grid').innerHTML = cells.join('');
    const dayTrips = trips.filter(t => overlaps(t, state.selected, state.selected)).sort((a, b) => employeeName(a.employee_id).localeCompare(employeeName(b.employee_id), 'ru'));
    $('#day-count').textContent = dayTrips.length;
    $('#day-trips').innerHTML = state.loading ? '<div class="empty">Загрузка поездок…</div>' : dayTrips.length ? dayTrips.map(t => `<article class="day-card"><h4>${esc(t.city)}</h4><p>${esc(employeeName(t.employee_id))} · ${esc(tripDates(t))}</p><p>${esc(t.purpose)}</p><button class="text-button edit-trip" type="button" data-id="${esc(t.id)}">Подробнее и изменить</button></article>`).join('') : '<div class="empty">На эту дату поездок нет.<br>Можно добавить новую командировку.</div>';
    const startMonth = dateKey(new Date(year, month, 1)), endMonth = dateKey(new Date(year, month + 1, 0));
    const inMonth = trips.filter(t => overlaps(t, startMonth, endMonth));
    $('#metric-month').textContent = state.loading ? '—' : inMonth.length;
    $('#metric-active').textContent = state.loading ? '—' : new Set(trips.filter(t => overlaps(t, today(), today())).map(t => String(t.employee_id))).size;
    $('#metric-cost').textContent = state.loading ? '—' : moneyFormat.format(inMonth.reduce((sum, t) => sum + (Number(t.cost) || 0), 0));
  }
  function plural(n, one, few, many) { const x = n % 100; return x >= 11 && x <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many; }
  function renderTrips() {
    const query = $('#trip-search').value.trim().toLocaleLowerCase('ru');
    const period = $('#trip-period').value;
    const list = visibleTrips().filter(t => (!query || [t.city, t.purpose, t.transport_details, employeeName(t.employee_id)].some(s => String(s || '').toLocaleLowerCase('ru').includes(query))) && (period === 'all' || (period === 'past' ? t.end_date < today() : t.end_date >= today()))).sort((a, b) => b.start_date.localeCompare(a.start_date));
    $('#trip-list').innerHTML = state.loading ? '<div class="empty">Загрузка поездок…</div>' : list.length ? list.map(t => `<article class="trip-row"><div><strong>${esc(t.city)}</strong><span>${esc(tripDates(t))}</span></div><div><strong>${esc(employeeName(t.employee_id))}</strong><span>${esc(transportNames[t.transport] || t.transport)}${t.transport_details ? ' · ' + esc(t.transport_details) : ''}</span></div><div class="trip-purpose">${esc(t.purpose)}</div><div class="trip-cost"><strong>${t.cost == null || t.cost === '' ? 'Не указана' : esc(moneyFormat.format(Number(t.cost)))}</strong><span>Стоимость</span></div><button class="text-button edit-trip" type="button" data-id="${esc(t.id)}">Изменить</button></article>`).join('') : '<div class="empty">Поездок пока нет или они не подходят под выбранные условия.</div>';
  }
  function render() { renderEmployees(); renderCalendar(); renderTrips(); }
  async function load() {
    state.loading = true; render();
    try {
      if (!window.tripApi) throw new Error('Не удалось подключиться к сервису данных.');
      const [employees, trips] = await Promise.all([window.tripApi.listEmployees(), window.tripApi.listTrips()]);
      state.employees = employees || []; state.trips = trips || []; state.hasLoaded = true; showNotice('');
    } catch (error) { showNotice(state.hasLoaded ? `Не удалось обновить данные. Показаны ранее загруженные данные, они могут быть неактуальны. ${errorText(error)}` : `Не удалось загрузить данные. ${errorText(error)}`, true); }
    finally { state.loading = false; render(); }
  }
  function openTrip(trip = null, date = state.selected) {
    const form = $('#trip-form'); form.reset(); showError($('#trip-error'), ''); state.editing = trip?.id ?? null;
    $('#trip-dialog-title').textContent = trip ? 'Изменить поездку' : 'Новая поездка';
    form.elements.employee_id.value = trip?.employee_id ?? (window.tripApi?.getCurrentEmployee()?.id || state.employee || '');
    form.elements.city.value = trip?.city ?? '';
    form.elements.start_date.value = trip?.start_date ?? date;
    form.elements.end_date.value = trip?.end_date ?? date;
    form.elements.purpose.value = trip?.purpose ?? '';
    form.elements.transport.value = trip?.transport ?? 'plane';
    form.elements.transport_details.value = trip?.transport_details ?? '';
    form.elements.cost.value = trip?.cost ?? '';
    $('#trip-dialog').showModal();
  }
  $('#new-trip').addEventListener('click', () => openTrip());
  $('#add-on-day').addEventListener('click', () => openTrip());
  $('#new-employee').addEventListener('click', () => { $('#employee-form').reset(); showError($('#employee-error'), ''); $('#employee-dialog').showModal(); });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
  $('#calendar-grid').addEventListener('click', e => { const button = e.target.closest('[data-date]'); if (!button) return; state.selected = button.dataset.date; state.month = firstOfMonth(parseDate(state.selected)); renderCalendar(); });
  $('#prev-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); state.selected = dateKey(state.month); renderCalendar(); });
  $('#next-month').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); state.selected = dateKey(state.month); renderCalendar(); });
  $('#go-today').addEventListener('click', () => { state.selected = today(); state.month = firstOfMonth(new Date()); renderCalendar(); });
  $('#employee-filter').addEventListener('change', e => { state.employee = e.target.value; renderCalendar(); renderTrips(); });
  $('#trip-search').addEventListener('input', renderTrips); $('#trip-period').addEventListener('change', renderTrips);
  document.addEventListener('click', e => { const button = e.target.closest('.edit-trip'); if (!button) return; const trip = state.trips.find(t => String(t.id) === button.dataset.id); if (trip) openTrip(trip); });
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active')); link.classList.add('active'); }));
  $('#trip-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, button = $('#save-trip'); showError($('#trip-error'), '');
    if (form.elements.end_date.value < form.elements.start_date.value) { showError($('#trip-error'), 'Дата окончания не может быть раньше даты начала.'); return; }
    const data = { employee_id: form.elements.employee_id.value, city: form.elements.city.value.trim(), start_date: form.elements.start_date.value, end_date: form.elements.end_date.value, purpose: form.elements.purpose.value.trim(), transport: form.elements.transport.value, transport_details: form.elements.transport_details.value.trim(), cost: Number(form.elements.cost.value) };
    if (!data.city || !data.purpose) { showError($('#trip-error'), 'Укажите город и цель поездки.'); return; }
    button.disabled = true; button.textContent = 'Сохраняем…';
    try { if (state.editing != null) await window.tripApi.updateTrip(state.editing, data); else await window.tripApi.createTrip(data); $('#trip-dialog').close(); state.selected = data.start_date; state.month = firstOfMonth(parseDate(data.start_date)); await load(); }
    catch (error) { showError($('#trip-error'), `Не удалось сохранить поездку. ${errorText(error)}`); }
    finally { button.disabled = false; button.textContent = 'Сохранить поездку'; }
  });
  $('#employee-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, button = $('button[type="submit"]', form), name = form.elements.full_name.value.trim(); showError($('#employee-error'), '');
    if (name.length < 2) { showError($('#employee-error'), 'Укажите имя сотрудника: не менее двух символов.'); return; }
    if (state.employees.some(person => person.full_name.trim().toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) { showError($('#employee-error'), 'Такой сотрудник уже есть в списке.'); return; }
    button.disabled = true; button.textContent = 'Добавляем…';
    try { await window.tripApi.createEmployee({ full_name: name }); $('#employee-dialog').close(); await load(); }
    catch (error) { showError($('#employee-error'), `Не удалось добавить сотрудника. ${errorText(error)}`); }
    finally { button.disabled = false; button.textContent = 'Добавить'; }
  });
  $('#today-label').textContent = dayFormat.format(new Date());
  load();
})();

