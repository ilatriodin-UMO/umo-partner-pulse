/* Общая база командировок. Выбор сотрудника не является проверкой личности. */
(() => {
  const url = 'https://xufsoxmcsvxqujgijtqx.supabase.co';
  const publicKey = 'sb_publishable_16g5md6y-0BWFC_cjEppqQ_O_bgZb0S';
  const client = window.supabase?.createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const selectionKey = 'umo-trip-selected-employee';
  let currentEmployee = null;
  let allowRequests;
  const ready = new Promise(resolve => { allowRequests = resolve; });
  const friendly = error => {
    console.error(error);
    if (error?.code === '42P01' || error?.code === 'PGRST202' || error?.code === 'PGRST205') return new Error('База командировок ещё не настроена. Обратитесь к администратору.');
    if (error?.code === '23505') return new Error('Сотрудник с таким именем уже существует.');
    return new Error('Не удалось выполнить запрос. Проверьте подключение и попробуйте ещё раз.');
  };
  const unwrap = ({ data, error }) => { if (error) throw friendly(error); return data; };
  const requireClient = () => { if (!client) throw new Error('Не удалось загрузить подключение к базе. Проверьте интернет и обновите страницу.'); };
  const selectedEmployeeId = () => { if (!currentEmployee) throw new Error('Выберите сотрудника, чтобы сохранить поездку.'); return Number(currentEmployee.id); };
  const fields = x => ({ employee_id: Number(x.employee_id), city: x.city, start_date: x.start_date, end_date: x.end_date, purpose: x.purpose, transport: x.transport, transport_details: x.transport_details || '', transport_cost: Number(x.transport_cost) || 0, hotel_cost: Number(x.hotel_cost) || 0, representation_cost: Number(x.representation_cost) || 0, cost: Number(x.cost) || 0, dealers: Array.isArray(x.dealers) ? x.dealers.filter(dealer => dealer && dealer.id && dealer.name && dealer.city).map(dealer => ({ id: String(dealer.id), name: String(dealer.name), city: String(dealer.city) })) : [] });
  window.tripApi = {
    getCurrentEmployee() { return currentEmployee; },
    async listEmployees() { await ready; requireClient(); return unwrap(await client.from('trip_employees').select('id,full_name').order('full_name')); },
    async createEmployee(value) { await ready; requireClient(); return unwrap(await client.from('trip_employees').insert({full_name: value.full_name.trim()}).select().single()); },
    async listTrips() {
      await ready; requireClient();
      const all = [], pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const page = unwrap(await client.from('trip_records').select('*').order('start_date', {ascending: false}).order('id', {ascending: false}).range(from, from + pageSize - 1));
        all.push(...page);
        if (page.length < pageSize) return all;
      }
    },
    async createTrip(value) { await ready; requireClient(); const employeeId = selectedEmployeeId(); return unwrap(await client.from('trip_records').insert({ ...fields(value), created_by_employee_id: employeeId, updated_by_employee_id: employeeId }).select().single()); },
    async updateTrip(id, value) { await ready; requireClient(); return unwrap(await client.from('trip_records').update({ ...fields(value), updated_by_employee_id: selectedEmployeeId() }).eq('id', id).select().single()); },
    async deleteTrip(id) { await ready; requireClient(); return unwrap(await client.from('trip_records').delete().eq('id', id)); }
  };

  const readSelection = () => { try { return localStorage.getItem(selectionKey); } catch { return null; } };
  const saveSelection = value => { try { if (value == null) localStorage.removeItem(selectionKey); else localStorage.setItem(selectionKey, value); } catch { /* Выбор действует до закрытия страницы. */ } };
  document.addEventListener('DOMContentLoaded', async () => {
    const gate = document.createElement('div');
    gate.id = 'access-gate';
    gate.innerHTML = '<div class="access-card"><div class="access-mark">UMO <span>КОМАНДИРОВКИ</span></div><h1>Выберите себя</h1><p>Укажите своё имя, чтобы перейти к календарю командировок.</p><form hidden><label for="access-employee">Сотрудник</label><select id="access-employee" required><option value="">Выберите сотрудника</option></select><button type="submit">Продолжить</button></form><div class="access-note" role="status" aria-live="polite">Загружаем список сотрудников…</div><button type="button" class="access-retry" hidden>Попробовать снова</button><button type="button" class="access-cancel" hidden>Отмена</button><p class="access-privacy">Выбор имени не подтверждает личность. Любой посетитель сайта сможет выбрать любое имя и просматривать и изменять поездки.</p></div>';
    document.body.append(gate);
    const form = gate.querySelector('form'), select = gate.querySelector('select'), note = gate.querySelector('.access-note'), retry = gate.querySelector('.access-retry'), cancel = gate.querySelector('.access-cancel');
    const switcher = document.createElement('button');
    switcher.type = 'button'; switcher.className = 'session-signout';
    let employees = [], allowed = false;
    const enter = employee => {
      currentEmployee = employee;
      saveSelection(String(employee.id));
      switcher.textContent = `${employee.full_name} · Сменить`;
      if (!switcher.isConnected) document.body.append(switcher);
      gate.hidden = true;
      if (!allowed) { allowed = true; allowRequests(); }
      window.dispatchEvent(new CustomEvent('trip-employee-change', { detail: employee }));
    };
    switcher.addEventListener('click', () => { gate.hidden = false; cancel.hidden = false; loadEmployees(false); });
    cancel.addEventListener('click', () => { gate.hidden = true; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const employee = employees.find(item => String(item.id) === select.value);
      if (employee) enter(employee);
      else note.textContent = 'Выберите сотрудника из списка.';
    });
    const loadEmployees = async (restoreSelection = true) => {
      retry.hidden = true; form.hidden = true; note.textContent = 'Загружаем список сотрудников…';
      try {
        requireClient();
        employees = unwrap(await client.from('trip_employees').select('id,full_name').order('full_name')) || [];
        select.replaceChildren(new Option('Выберите сотрудника', ''));
        employees.forEach(employee => select.add(new Option(employee.full_name, String(employee.id))));
        if (!employees.length) { note.textContent = 'Список сотрудников пуст. Попросите администратора добавить сотрудников в базу.'; retry.hidden = false; return; }
        note.textContent = ''; form.hidden = false;
        if (restoreSelection) {
          const saved = employees.find(employee => String(employee.id) === readSelection());
          if (saved) enter(saved);
        } else {
          select.value = String(currentEmployee?.id ?? '');
          select.focus();
        }
      } catch (error) {
        console.error(error);
        note.textContent = error.message || 'Не удалось загрузить список сотрудников. Проверьте подключение и попробуйте снова.';
        retry.hidden = false;
      }
    };
    retry.addEventListener('click', () => loadEmployees(!currentEmployee));
    await loadEmployees();
  });
})();

