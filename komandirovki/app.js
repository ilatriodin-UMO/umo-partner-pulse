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
  function employeeColorClass(id) { const number = Number(id); return `employee-color-${Number.isFinite(number) ? Math.abs(number - 1) % 8 : String(id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8}`; }
  function tripDates(trip) { return `${shortFormat.format(parseDate(trip.start_date))} — ${dayFormat.format(parseDate(trip.end_date))}`; }
  function overlaps(trip, start, end) { return trip.start_date <= end && trip.end_date >= start; }
  function visibleTrips() { return state.trips.filter(t => !state.employee || String(t.employee_id) === state.employee); }
  function expenseValue(value) { return Number(value) || 0; }
  function tripTotal(trip) {
    const hasBreakdown = ['transport_cost', 'hotel_cost', 'representation_cost'].some(key => trip[key] != null);
    return hasBreakdown ? expenseValue(trip.transport_cost) + expenseValue(trip.hotel_cost) + expenseValue(trip.representation_cost) : expenseValue(trip.cost);
  }
  function expenseSummary(trip) {
    const items = [
      ['Транспорт', expenseValue(trip.transport_cost)],
      ['Гостиница', expenseValue(trip.hotel_cost)],
      ['Представительские', expenseValue(trip.representation_cost)]
    ].filter(([, value]) => value > 0);
    return items.length ? items.map(([name, value]) => `${name}: ${moneyFormat.format(value)}`).join(' · ') : '';
  }
  function tripDealers(trip) { return Array.isArray(trip?.dealers) ? trip.dealers.filter(dealer => dealer?.name) : []; }
  function dealerSummary(trip) { return tripDealers(trip).map(dealer => dealer.name).join(', '); }
  const documentDateFormat = date => {
    const [year, month, day] = String(date || '').split('-');
    return year && month && day ? `${day}.${month}.${year}` : '';
  };
  const documentAmount = value => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  };
  const documentEscape = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r\n?|\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
  function documentDateFields() {
    const date = new Date();
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return { form_day: date.getDate(), form_month: months[date.getMonth()], form_year: date.getFullYear() };
  }
  function decodeBase64(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  async function downloadTripWord(trip) {
    if (!window.JSZip || !window.UMO_TRIP_WORD_TEMPLATE_BASE64) throw new Error('Шаблон Word пока недоступен. Обновите страницу и попробуйте снова.');
    const period = `${documentDateFormat(trip.start_date)}–${documentDateFormat(trip.end_date)}`;
    const fields = {
      ...documentDateFields(),
      employee: employeeName(trip.employee_id),
      trip_period: period,
      city: trip.city || '',
      dealers: dealerSummary(trip),
      purpose: trip.purpose || '',
      transport_name: transportNames[trip.transport] || trip.transport || '',
      transport_cost: documentAmount(trip.transport_cost),
      hotel_cost: documentAmount(trip.hotel_cost),
      transport_details: trip.transport_details || ''
    };
    const zip = await window.JSZip.loadAsync(decodeBase64(window.UMO_TRIP_WORD_TEMPLATE_BASE64));
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('В шаблоне не найдена основная страница документа.');
    let documentXml = await documentFile.async('string');
    documentXml = documentXml.replace(/\{(form_day|form_month|form_year|employee|trip_period|city|dealers|purpose|transport_name|transport_cost|hotel_cost|transport_details)\}/g, (_, key) => documentEscape(fields[key]));
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const fileName = `Заявка на командировку — ${employeeName(trip.employee_id)} — ${documentDateFormat(trip.start_date)}.docx`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = fileName; link.hidden = true;
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const cityInput = $('#trip-form [name="city"]');
  const citySuggestions = $('#city-suggestions');
  const selectedCitiesNode = $('#selected-cities');
  const cityHint = $('#city-hint');
  const cities = Array.isArray(window.RUSSIAN_CITIES) ? window.RUSSIAN_CITIES : [];
  const dealerPicker = $('#dealer-picker');
  const dealerHint = $('#dealer-picker-hint');
  const dealerOptions = $('#dealer-options');
  const dealers = Array.isArray(window.UMO_DEALERS) ? window.UMO_DEALERS : [];
  let cityOptionIndex = -1;
  let selectedDealerIds = new Set();
  let storedDealers = [];
  let selectedCities = [];
  const cityKey = value => String(value || '').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const dealerCityKey = value => cityKey(value).replace(/[^\p{L}\p{N}]+/gu, '');
  function allDealers() { return [...new Map([...storedDealers, ...dealers].map(dealer => [String(dealer.id), dealer])).values()]; }
  function dealersForCity(city) { const key = dealerCityKey(city); return key ? allDealers().filter(dealer => dealerCityKey(dealer.city) === key) : []; }
  function selectedDealers() { const cityKeys = new Set(selectedCities.map(dealerCityKey)); return allDealers().filter(dealer => selectedDealerIds.has(String(dealer.id)) && cityKeys.has(dealerCityKey(dealer.city))).map(dealer => ({ id: String(dealer.id), name: dealer.name, city: dealer.city })); }
  function renderSelectedCities() {
    selectedCitiesNode.innerHTML = selectedCities.map((city, index) => `<span class="selected-city">${esc(city)} <button type="button" class="remove-city" data-city-index="${index}" aria-label="Удалить город ${esc(city)}">×</button></span>`).join('');
    cityHint.textContent = selectedCities.length ? 'Добавьте ещё город или продолжайте заполнение.' : 'Выберите город из подсказок или введите название и нажмите «Добавить город».';
  }
  function renderDealerPicker() {
    dealerPicker.hidden = !selectedCities.length;
    if (dealerPicker.hidden) { dealerOptions.replaceChildren(); dealerHint.textContent = ''; return; }
    const groups = selectedCities.map(city => ({ city, matching: dealersForCity(city) }));
    dealerHint.textContent = 'Выберите одного или нескольких дилеров в каждом городе поездки.';
    dealerOptions.innerHTML = groups.map(({ city, matching }) => `<div class="dealer-city-group"><strong>${esc(city)}</strong>${matching.length ? `<div class="dealer-city-options">${matching.map(dealer => `<button type="button" class="dealer-option" data-dealer-id="${esc(dealer.id)}" aria-pressed="${selectedDealerIds.has(dealer.id)}">${esc(dealer.name)}</button>`).join('')}</div>` : '<span class="dealer-city-empty">В справочнике нет дилеров в этом городе.</span>'}</div>`).join('');
  }
  function closeCitySuggestions() {
    citySuggestions.hidden = true;
    citySuggestions.replaceChildren();
    cityOptionIndex = -1;
    cityInput.setAttribute('aria-expanded', 'false');
    cityInput.removeAttribute('aria-activedescendant');
  }
  function addCity(value) {
    const city = String(value || '').trim().replace(/\s+/g, ' ');
    if (!city) return true;
    if (city.includes(',')) { showError($('#trip-error'), 'Добавляйте города по одному, без запятых в названии.'); return false; }
    if (!dealerCityKey(city)) { showError($('#trip-error'), 'Укажите название города.'); return false; }
    const duplicate = selectedCities.some(item => dealerCityKey(item) === dealerCityKey(city));
    if (!duplicate && (city.length > 120 || [...selectedCities, city].join(', ').length > 200)) { showError($('#trip-error'), 'Список городов слишком длинный. Сократите названия или разделите поездку.'); return false; }
    if (!duplicate) selectedCities.push(city);
    cityInput.value = '';
    showError($('#trip-error'), '');
    closeCitySuggestions();
    renderSelectedCities();
    renderDealerPicker();
    cityInput.focus();
    return true;
  }
  function renderCitySuggestions() {
    const query = cityKey(cityInput.value);
    if (query.length < 3) { closeCitySuggestions(); return; }
    const matches = cities.filter(city => cityKey(city).startsWith(query)).slice(0, 8);
    if (!matches.length) { closeCitySuggestions(); return; }
    cityOptionIndex = -1;
    citySuggestions.innerHTML = matches.map((city, index) => `<button type="button" class="city-suggestion" role="option" id="city-option-${index}" data-city="${esc(city)}" aria-selected="false">${esc(city)}</button>`).join('');
    citySuggestions.hidden = false;
    cityInput.setAttribute('aria-expanded', 'true');
  }
  function setCityOption(index) {
    const options = [...citySuggestions.querySelectorAll('.city-suggestion')];
    if (!options.length) return;
    cityOptionIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === cityOptionIndex)));
    cityInput.setAttribute('aria-activedescendant', options[cityOptionIndex].id);
  }
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
      const key = dateKey(date), dayTrips = trips.filter(t => overlaps(t, key, key)), count = dayTrips.length;
      const employeeIds = [...new Set(dayTrips.map(t => String(t.employee_id)))];
      const dots = employeeIds.map(id => `<i class="day-dot ${employeeColorClass(id)}" title="${esc(employeeName(id))}"></i>`).join('');
      const cls = [date.getMonth() !== month ? 'outside' : '', key === state.selected ? 'selected' : '', key === today() ? 'today' : ''].join(' ');
      cells.push(`<button type="button" class="calendar-day ${cls}" data-date="${key}" aria-label="${esc(dayFormat.format(date))}: поездок ${count}, ${esc(employeeIds.map(employeeName).join(', '))}" aria-pressed="${key === state.selected}"><span class="day-number">${date.getDate()}</span>${count ? `<span class="day-dots">${dots}</span><span class="day-count-small">${count} ${plural(count, 'поездка', 'поездки', 'поездок')}</span>` : ''}</button>`);
    }
    $('#calendar-grid').innerHTML = cells.join('');
    const legendEmployees = state.employee ? state.employees.filter(employee => String(employee.id) === state.employee) : state.employees;
    $('#calendar-legend').innerHTML = legendEmployees.map(employee => `<span><i class="${employeeColorClass(employee.id)}"></i>${esc(employee.full_name)}</span>`).join('') + '<span><i class="legend-today"></i>Сегодня</span>';
    const dayTrips = trips.filter(t => overlaps(t, state.selected, state.selected)).sort((a, b) => employeeName(a.employee_id).localeCompare(employeeName(b.employee_id), 'ru'));
    $('#day-count').textContent = dayTrips.length;
    $('#day-trips').innerHTML = state.loading ? '<div class="empty">Загрузка поездок…</div>' : dayTrips.length ? dayTrips.map(t => `<article class="day-card ${employeeColorClass(t.employee_id)}"><h4>${esc(t.city)}</h4><p>${esc(employeeName(t.employee_id))} · ${esc(tripDates(t))}</p><p>${esc(t.purpose)}</p>${dealerSummary(t) ? `<p class="trip-dealers">Дилеры: ${esc(dealerSummary(t))}</p>` : ''}<div class="day-card-actions"><button class="text-button edit-trip" type="button" data-id="${esc(t.id)}">Подробнее и изменить</button><button class="text-button export-trip-word" type="button" data-id="${esc(t.id)}">Выгрузить Word</button></div></article>`).join('') : '<div class="empty">На эту дату поездок нет.<br>Можно добавить новую командировку.</div>';
    const startMonth = dateKey(new Date(year, month, 1)), endMonth = dateKey(new Date(year, month + 1, 0));
    const inMonth = trips.filter(t => overlaps(t, startMonth, endMonth));
    $('#metric-month').textContent = state.loading ? '—' : inMonth.length;
    $('#metric-active').textContent = state.loading ? '—' : new Set(trips.filter(t => overlaps(t, today(), today())).map(t => String(t.employee_id))).size;
    $('#metric-cost').textContent = state.loading ? '—' : moneyFormat.format(inMonth.reduce((sum, t) => sum + tripTotal(t), 0));
  }
  function plural(n, one, few, many) { const x = n % 100; return x >= 11 && x <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many; }
  function renderTrips() {
    const query = $('#trip-search').value.trim().toLocaleLowerCase('ru');
    const period = $('#trip-period').value;
    const list = visibleTrips().filter(t => (!query || [t.city, t.purpose, t.transport_details, employeeName(t.employee_id), dealerSummary(t)].some(s => String(s || '').toLocaleLowerCase('ru').includes(query))) && (period === 'all' || (period === 'past' ? t.end_date < today() : t.end_date >= today()))).sort((a, b) => b.start_date.localeCompare(a.start_date));
    $('#trip-list').innerHTML = state.loading ? '<div class="empty">Загрузка поездок…</div>' : list.length ? list.map(t => `<article class="trip-row"><div><strong>${esc(t.city)}</strong><span>${esc(tripDates(t))}</span></div><div><strong>${esc(employeeName(t.employee_id))}</strong><span>${esc(transportNames[t.transport] || t.transport)}${t.transport_details ? ' · ' + esc(t.transport_details) : ''}</span></div><div class="trip-purpose">${esc(t.purpose)}${dealerSummary(t) ? `<span class="trip-dealers">Дилеры: ${esc(dealerSummary(t))}</span>` : ''}</div><div class="trip-cost"><strong>${esc(moneyFormat.format(tripTotal(t)))}</strong><span>Всего расходов</span>${expenseSummary(t) ? `<span class="trip-cost-breakdown">${esc(expenseSummary(t))}</span>` : ''}</div><button class="text-button edit-trip" type="button" data-id="${esc(t.id)}">Изменить</button></article>`).join('') : '<div class="empty">Поездок пока нет или они не подходят под выбранные условия.</div>';
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
    $('#cancel-trip').hidden = !trip;
    form.elements.employee_id.value = trip?.employee_id ?? (window.tripApi?.getCurrentEmployee()?.id || state.employee || '');
    form.elements.city.value = '';
    selectedCities = String(trip?.city || '').split(',').map(city => city.trim()).filter(Boolean);
    form.elements.start_date.value = trip?.start_date ?? date;
    form.elements.end_date.value = trip?.end_date ?? date;
    form.elements.purpose.value = trip?.purpose ?? '';
    form.elements.transport.value = trip?.transport ?? 'plane';
    form.elements.transport_details.value = trip?.transport_details ?? '';
    form.elements.transport_cost.value = trip?.transport_cost ?? (trip?.cost ?? '');
    form.elements.hotel_cost.value = trip?.hotel_cost ?? '';
    form.elements.representation_cost.value = trip?.representation_cost ?? '';
    storedDealers = tripDealers(trip).filter(dealer => dealer.id && dealer.city);
    selectedDealerIds = new Set(storedDealers.map(dealer => String(dealer.id)));
    closeCitySuggestions();
    renderSelectedCities();
    renderDealerPicker();
    updateTripTotal();
    $('#trip-dialog').showModal();
  }
  function updateTripTotal() {
    const form = $('#trip-form');
    const total = ['transport_cost', 'hotel_cost', 'representation_cost'].reduce((sum, name) => sum + expenseValue(form.elements[name].value), 0);
    $('#trip-total').innerHTML = `Итого: ${esc(moneyFormat.format(total))}`;
    return total;
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
  ['transport_cost', 'hotel_cost', 'representation_cost'].forEach(name => $('#trip-form').elements[name].addEventListener('input', updateTripTotal));
  cityInput.addEventListener('input', renderCitySuggestions);
  cityInput.addEventListener('focus', renderCitySuggestions);
  cityInput.addEventListener('blur', () => window.setTimeout(closeCitySuggestions, 120));
  $('#city-add').addEventListener('click', () => addCity(cityInput.value));
  selectedCitiesNode.addEventListener('click', event => {
    const button = event.target.closest('[data-city-index]');
    if (!button) return;
    const index = Number(button.dataset.cityIndex);
    if (!Number.isInteger(index) || index < 0 || index >= selectedCities.length) return;
    const removed = selectedCities.splice(index, 1)[0];
    dealersForCity(removed).forEach(dealer => selectedDealerIds.delete(String(dealer.id)));
    renderSelectedCities(); renderDealerPicker(); cityInput.focus();
  });
  cityInput.addEventListener('keydown', event => {
    const options = [...citySuggestions.querySelectorAll('.city-suggestion')];
    if (event.key === 'Escape') { closeCitySuggestions(); return; }
    if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); setCityOption(cityOptionIndex + 1); }
    if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); setCityOption(cityOptionIndex - 1); }
    if (event.key === 'Enter') { event.preventDefault(); addCity(cityOptionIndex >= 0 && options[cityOptionIndex] ? options[cityOptionIndex].dataset.city : cityInput.value); }
  });
  citySuggestions.addEventListener('pointerdown', event => {
    const option = event.target.closest('.city-suggestion');
    if (!option) return;
    event.preventDefault(); addCity(option.dataset.city);
  });
  dealerOptions.addEventListener('click', event => {
    const option = event.target.closest('[data-dealer-id]');
    if (!option) return;
    const id = option.dataset.dealerId;
    if (selectedDealerIds.has(id)) selectedDealerIds.delete(id); else selectedDealerIds.add(id);
    renderDealerPicker();
  });
  document.addEventListener('click', async e => {
    const editButton = e.target.closest('.edit-trip');
    if (editButton) { const trip = state.trips.find(t => String(t.id) === editButton.dataset.id); if (trip) openTrip(trip); return; }
    const exportButton = e.target.closest('.export-trip-word');
    if (!exportButton) return;
    const trip = state.trips.find(t => String(t.id) === exportButton.dataset.id);
    if (!trip) return;
    exportButton.disabled = true; const label = exportButton.textContent; exportButton.textContent = 'Готовим Word…';
    try { await downloadTripWord(trip); showNotice('Печатная форма Word скачана.'); }
    catch (error) { showNotice(`Не удалось сформировать Word. ${errorText(error)}`, true); }
    finally { exportButton.disabled = false; exportButton.textContent = label; }
  });
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active')); link.classList.add('active'); }));
  $('#trip-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, button = $('#save-trip'); showError($('#trip-error'), '');
    if (form.elements.end_date.value < form.elements.start_date.value) { showError($('#trip-error'), 'Дата окончания не может быть раньше даты начала.'); return; }
    if (!addCity(form.elements.city.value)) return;
    const data = { employee_id: form.elements.employee_id.value, city: selectedCities.join(', '), start_date: form.elements.start_date.value, end_date: form.elements.end_date.value, purpose: form.elements.purpose.value.trim(), transport: form.elements.transport.value, transport_details: form.elements.transport_details.value.trim(), transport_cost: expenseValue(form.elements.transport_cost.value), hotel_cost: expenseValue(form.elements.hotel_cost.value), representation_cost: expenseValue(form.elements.representation_cost.value), cost: updateTripTotal(), dealers: selectedDealers() };
    if (!data.city || !data.purpose) { showError($('#trip-error'), 'Укажите хотя бы один город и цель поездки.'); return; }
    button.disabled = true; button.textContent = 'Сохраняем…';
    try { if (state.editing != null) await window.tripApi.updateTrip(state.editing, data); else await window.tripApi.createTrip(data); $('#trip-dialog').close(); state.selected = data.start_date; state.month = firstOfMonth(parseDate(data.start_date)); await load(); }
    catch (error) { showError($('#trip-error'), `Не удалось сохранить поездку. ${errorText(error)}`); }
    finally { button.disabled = false; button.textContent = 'Сохранить поездку'; }
  });
  $('#cancel-trip').addEventListener('click', async () => {
    if (state.editing == null) return;
    if (!window.confirm('Отменить эту поездку? Она исчезнет из календаря, а запись останется в истории изменений.')) return;
    const button = $('#cancel-trip'); showError($('#trip-error'), ''); button.disabled = true; button.textContent = 'Отменяем…';
    try { await window.tripApi.deleteTrip(state.editing); $('#trip-dialog').close(); await load(); }
    catch (error) { showError($('#trip-error'), `Не удалось отменить поездку. ${errorText(error)}`); }
    finally { button.disabled = false; button.textContent = 'Отменить поездку'; }
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

