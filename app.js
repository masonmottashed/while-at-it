(function () {
  'use strict';

  const STORAGE_KEY = 'whileatit-state-v1';
  const LEGACY_STORAGE_KEY = 'rightwindow-state-v1';
  const icons = { Errand: '↗', Call: '☎', Home: '⌂', Money: '$', School: '✎', Health: '+', Other: '•' };
  const placeLabels = { anywhere: 'Anywhere', home: 'At home', nearby: 'Nearby', specific: 'Specific place' };
  const deadlineLabels = { today: 'Due today', tomorrow: 'Due tomorrow', week: 'Due this week', later: 'Due later', none: 'No deadline' };
  const sampleTasks = () => [
    { id: crypto.randomUUID(), title: 'Return Amazon package', duration: 15, deadline: 'tomorrow', importance: 'high', place: 'nearby', category: 'Errand', note: 'Bring the package and QR code', status: 'open', createdAt: Date.now() - 10000 },
    { id: crypto.randomUUID(), title: 'Call the dentist', duration: 10, deadline: 'week', importance: 'medium', place: 'anywhere', category: 'Call', note: 'Schedule a cleaning', status: 'open', createdAt: Date.now() - 9000 },
    { id: crypto.randomUUID(), title: 'Cancel streaming trial', duration: 5, deadline: 'today', importance: 'high', place: 'home', category: 'Money', note: 'Renews tomorrow', status: 'open', createdAt: Date.now() - 8000 },
    { id: crypto.randomUUID(), title: 'Put laundry away', duration: 20, deadline: 'none', importance: 'low', place: 'home', category: 'Home', note: '', status: 'open', createdAt: Date.now() - 7000 }
  ];

  function defaultState() { return { minutes: 20, tasks: sampleTasks(), completions: [], activeView: 'now', filter: 'open' }; }
  function loadState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = JSON.parse(current || legacy);
      if (saved && Array.isArray(saved.tasks)) {
        const migrated = { ...defaultState(), ...saved };
        if (!current && legacy) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return defaultState();
    }
    catch (_) { return defaultState(); }
  }
  let state = loadState();
  let toastTimer;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function showToast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2200); }

  function scoreTask(task, minutes = state.minutes) {
    if (task.status !== 'open' || task.duration > minutes) return -1;
    const urgency = { today: 40, tomorrow: 32, week: 18, later: 8, none: 4 }[task.deadline] || 4;
    const importance = { high: 20, medium: 12, low: 6 }[task.importance] || 6;
    const ratio = task.duration / Math.max(minutes, 1);
    const timeFit = ratio > 1 ? 0 : ratio >= .55 ? 25 : ratio >= .25 ? 20 : 15;
    const convenience = { anywhere: 15, home: 13, nearby: 10, specific: 5 }[task.place] || 5;
    const ageBonus = Math.min(4, Math.floor((Date.now() - task.createdAt) / 86400000));
    return Math.min(100, urgency + importance + timeFit + convenience + ageBonus);
  }

  function rankedOpen() { return state.tasks.filter(t => t.status === 'open').map(t => ({ ...t, score: scoreTask(t) })).filter(t => t.score >= 0).sort((a,b) => b.score - a.score || a.duration - b.duration); }
  function reasonFor(task) {
    const reasons = [];
    if (task.deadline === 'today') reasons.push('it’s due today');
    else if (task.deadline === 'tomorrow') reasons.push('the deadline is tomorrow');
    if (task.duration <= Math.max(10, state.minutes / 2)) reasons.push(`it only needs ${task.duration} minutes`);
    else reasons.push(`it fits inside your ${state.minutes}-minute window`);
    if (task.place === 'anywhere') reasons.push('you can do it from anywhere');
    if (task.place === 'nearby') reasons.push('it can be handled as a nearby stop');
    if (task.importance === 'high') reasons.push('you marked it high priority');
    const sentence = reasons.length > 1 ? `${reasons.slice(0,-1).join(', ')}, and ${reasons.at(-1)}` : reasons[0];
    return `WhileAtIt picked this because ${sentence || 'it is the strongest fit for this window'}.`;
  }

  function renderRecommendation() {
    const area = $('#recommendationArea');
    const ranked = rankedOpen();
    if (!ranked.length) {
      const hasOpen = state.tasks.some(t => t.status === 'open');
      area.innerHTML = `<div class="empty-card"><div class="empty-icon">${hasOpen ? '↗' : '✓'}</div><h2>${hasOpen ? 'Nothing fits this window yet.' : 'Your mind is clear.'}</h2><p>${hasOpen ? 'Choose a longer window or add a quick task that takes just a few minutes.' : 'You closed every open loop. Add the next thing when it appears.'}</p><button class="primary-button" data-empty-action="${hasOpen ? 'longer' : 'add'}">${hasOpen ? 'Try 1 hour' : 'Add an open loop'} <span>→</span></button></div>`;
      $('#otherSection').hidden = true;
      return;
    }
    $('#otherSection').hidden = false;
    const best = ranked[0];
    area.innerHTML = `<article class="opportunity-card">
      <div class="opportunity-main">
        <p class="eyebrow">BEST OPPORTUNITY</p>
        <h2 class="opportunity-title">${escapeHtml(best.title)}</h2>
        <div class="fit-line"><span class="score-pill">${best.score}% fit</span><span class="meta-item"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>${best.duration} min</span><span class="meta-item">${escapeHtml(deadlineLabels[best.deadline])}</span><span class="meta-item">${escapeHtml(placeLabels[best.place])}</span></div>
        <div class="why-box"><strong>Why now?</strong> ${escapeHtml(reasonFor(best))}${best.note ? ` <span>${escapeHtml(best.note)}.</span>` : ''}</div>
        <div class="action-row"><button class="primary-button" data-complete="${best.id}">Do it now <span>→</span></button><button class="ghost-button" data-postpone="${best.id}">Not now</button></div>
      </div>
      <div class="opportunity-side" aria-hidden="true"><div class="window-art"><span></span><span></span><span></span><span></span></div></div>
    </article>`;
    const others = ranked.slice(1,4);
    $('#otherList').innerHTML = others.length ? others.map(task => `<button class="mini-card" data-focus-task="${task.id}"><span class="mini-top"><span class="category-icon">${icons[task.category] || '•'}</span><span class="mini-score">${task.score}% fit</span></span><h3>${escapeHtml(task.title)}</h3><p>${task.duration} min · ${escapeHtml(deadlineLabels[task.deadline])}</p></button>`).join('') : `<div class="mini-card"><h3>No other tasks fit yet</h3><p>Add another quick open loop for this window.</p></div>`;
  }

  function renderLoops() {
    const list = $('#loopsList');
    let tasks = [...state.tasks];
    if (state.filter === 'open') tasks = tasks.filter(t => t.status === 'open');
    if (state.filter === 'done') tasks = tasks.filter(t => t.status === 'done');
    tasks.sort((a,b) => (a.status === b.status ? scoreTask(b, 999) - scoreTask(a, 999) : a.status === 'open' ? -1 : 1));
    if (!tasks.length) { list.innerHTML = `<div class="empty-card"><div class="empty-icon">○</div><h2>Nothing here yet.</h2><p>${state.filter === 'done' ? 'Completed loops will collect here.' : 'Add a task and WhileAtIt will find the best time for it.'}</p></div>`; return; }
    list.innerHTML = tasks.map(task => `<article class="loop-row ${task.status === 'done' ? 'is-done' : ''}">
      <button class="loop-check" data-toggle="${task.id}" aria-label="${task.status === 'done' ? 'Reopen' : 'Complete'} ${escapeHtml(task.title)}">${task.status === 'done' ? '✓' : ''}</button>
      <div class="loop-content"><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.category)} · ${task.duration} min · ${escapeHtml(deadlineLabels[task.deadline])} · ${escapeHtml(placeLabels[task.place])}</p></div>
      <div class="loop-actions">${task.status === 'open' ? `<span class="loop-score">${Math.max(0, scoreTask(task, Math.max(state.minutes, task.duration)))}% fit</span>` : ''}<button class="menu-button" data-delete="${task.id}" aria-label="Delete ${escapeHtml(task.title)}">×</button></div>
    </article>`).join('');
  }

  function renderMomentum() {
    const completed = state.tasks.filter(t => t.status === 'done');
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = state.completions.filter(c => c.at > weekAgo);
    const totalMinutes = completed.reduce((sum,t) => sum + Number(t.duration || 0), 0);
    const uniqueDays = [...new Set(state.completions.map(c => new Date(c.at).toDateString()))];
    $('#completedCount').textContent = thisWeek.length;
    $('#progressHeadline').textContent = thisWeek.length ? `${thisWeek.length} loop${thisWeek.length === 1 ? '' : 's'} lighter this week.` : 'You’re clearing the clutter.';
    $('#progressText').textContent = thisWeek.length ? 'Keep using the small windows already in your day.' : 'Finish one loop and your day gets lighter.';
    $('#statCompleted').textContent = completed.length;
    $('#statMinutes').textContent = totalMinutes >= 60 ? `${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m` : `${totalMinutes}m`;
    $('#statStreak').textContent = Math.min(uniqueDays.length, 7);
    const counts = {};
    state.tasks.filter(t => t.status === 'open').forEach(t => counts[t.category] = (counts[t.category] || 0) + 1);
    const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    const max = Math.max(1, ...entries.map(e => e[1]));
    $('#categoryBars').innerHTML = entries.length ? entries.map(([name,count]) => `<div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%"></div></div><strong>${count}</strong></div>`).join('') : '<p style="color:var(--muted);margin-bottom:0">No open loops right now.</p>';
    if (completed.length) {
      const byCategory = {}; completed.forEach(t => byCategory[t.category] = (byCategory[t.category] || 0) + 1);
      const top = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];
      $('#insightTitle').textContent = `${top[0]} tasks are your easiest wins.`;
      $('#insightCopy').textContent = `You’ve finished ${top[1]} ${top[0].toLowerCase()} loop${top[1] === 1 ? '' : 's'}. WhileAtIt will keep looking for small, well-timed chances to build on that momentum.`;
    }
  }

  function renderTime() { $$('.time-options button').forEach(b => b.classList.toggle('is-selected', Number(b.dataset.minutes) === state.minutes)); }
  function renderView() {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === state.activeView));
    $$('.bottom-nav button').forEach(b => b.classList.toggle('is-active', b.dataset.viewLink === state.activeView));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderAll() { renderTime(); renderRecommendation(); renderLoops(); renderMomentum(); renderView(); save(); }

  function completeTask(id) {
    const task = state.tasks.find(t => t.id === id); if (!task) return;
    if (task.status === 'open') { task.status = 'done'; task.completedAt = Date.now(); state.completions.push({ taskId: id, at: task.completedAt }); showToast(`Nice — “${task.title}” is closed.`); }
    else { task.status = 'open'; delete task.completedAt; state.completions = state.completions.filter(c => c.taskId !== id); showToast('Loop reopened.'); }
    renderAll();
  }

  function postponeTask(id) {
    const task = state.tasks.find(t => t.id === id); if (!task) return;
    task.createdAt = Date.now();
    const index = state.tasks.indexOf(task); state.tasks.push(...state.tasks.splice(index, 1));
    showToast('Skipped for now. We’ll find another window.'); renderAll();
  }

  function openAdd() { $('#addDialog').showModal(); setTimeout(() => $('#taskTitle').focus(), 80); }

  document.addEventListener('click', event => {
    const time = event.target.closest('[data-minutes]');
    if (time) { state.minutes = Number(time.dataset.minutes); renderAll(); }
    const view = event.target.closest('[data-view-link]');
    if (view) { state.activeView = view.dataset.viewLink; renderAll(); }
    const complete = event.target.closest('[data-complete], [data-toggle]');
    if (complete) completeTask(complete.dataset.complete || complete.dataset.toggle);
    const postpone = event.target.closest('[data-postpone]');
    if (postpone) postponeTask(postpone.dataset.postpone);
    const focus = event.target.closest('[data-focus-task]');
    if (focus) { const task = state.tasks.find(t => t.id === focus.dataset.focusTask); if (task) { const idx = state.tasks.indexOf(task); state.tasks.unshift(...state.tasks.splice(idx,1)); renderAll(); } }
    const del = event.target.closest('[data-delete]');
    if (del) { const task = state.tasks.find(t => t.id === del.dataset.delete); if (task && confirm(`Delete “${task.title}”?`)) { state.tasks = state.tasks.filter(t => t.id !== task.id); state.completions = state.completions.filter(c => c.taskId !== task.id); renderAll(); showToast('Open loop deleted.'); } }
    const emptyAction = event.target.closest('[data-empty-action]');
    if (emptyAction) { if (emptyAction.dataset.emptyAction === 'longer') { state.minutes = 60; renderAll(); } else openAdd(); }
  });

  $('#openAdd').addEventListener('click', openAdd);
  $('#openAddFromLoops').addEventListener('click', openAdd);
  $('#openSettings').addEventListener('click', () => $('#settingsDialog').showModal());
  $$('.filter-row button').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; $$('.filter-row button').forEach(b => b.classList.toggle('is-selected', b === button)); renderLoops(); save(); }));

  $('#taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim(); if (!title) return;
    state.tasks.unshift({ id: crypto.randomUUID(), title, duration: Number(data.get('duration')), deadline: String(data.get('deadline')), importance: String(data.get('importance')), place: String(data.get('place')), category: String(data.get('category')), note: String(data.get('note') || '').trim(), status: 'open', createdAt: Date.now() });
    event.currentTarget.reset(); $('#taskDuration').value = '15'; $('#taskDeadline').value = 'tomorrow'; $('#taskImportance').value = 'medium';
    $('#addDialog').close(); state.activeView = 'now'; renderAll(); showToast('Open loop added.');
  });

  $('#resetSamples').addEventListener('click', () => { state.tasks.push(...sampleTasks()); $('#settingsDialog').close(); renderAll(); showToast('Sample tasks restored.'); });
  $('#clearData').addEventListener('click', () => { if (confirm('Clear every task and all momentum data?')) { state = { ...defaultState(), tasks: [], completions: [] }; $('#settingsDialog').close(); renderAll(); showToast('All data cleared.'); } });

  function registerWebMCP() {
    const context = document.modelContext; if (!context?.registerTool) return;
    const addTool = (tool) => { try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} };
    addTool({ name:'get_whileatit_recommendation', title:'Get WhileAtIt recommendation', description:'Return the best open loop for the currently selected time window without changing app state.', inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute(){ const task=rankedOpen()[0]; return task ? {id:task.id,title:task.title,fit_score:task.score,duration_minutes:task.duration,reason:reasonFor(task)} : {recommendation:null}; } });
    addTool({ name:'set_available_minutes', title:'Set available time', description:'Change the available time window and refresh the visible recommendation.', inputSchema:{type:'object',properties:{minutes:{type:'integer',minimum:5,maximum:480}},required:['minutes'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute(input){ if(!Number.isInteger(input?.minutes)||input.minutes<5||input.minutes>480) throw new Error('Minutes must be an integer from 5 to 480.'); state.minutes=input.minutes; renderAll(); return {available_minutes:state.minutes,recommendation:rankedOpen()[0]?.title||null}; } });
    addTool({ name:'add_open_loop', title:'Add open loop', description:'Create a new task in WhileAtIt and update the visible recommendations.', inputSchema:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:80},duration_minutes:{type:'integer',minimum:5,maximum:480},deadline:{type:'string',enum:['today','tomorrow','week','later','none']},importance:{type:'string',enum:['high','medium','low']},place:{type:'string',enum:['anywhere','home','nearby','specific']},category:{type:'string',enum:['Errand','Call','Home','Money','School','Health','Other']},note:{type:'string',maxLength:120}},required:['title','duration_minutes','deadline','importance','place','category'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute(input){ if(!input?.title?.trim()||!Number.isInteger(input.duration_minutes)) throw new Error('Valid title and duration_minutes are required.'); const task={id:crypto.randomUUID(),title:input.title.trim(),duration:input.duration_minutes,deadline:input.deadline,importance:input.importance,place:input.place,category:input.category,note:(input.note||'').trim(),status:'open',createdAt:Date.now()}; state.tasks.unshift(task); renderAll(); return {created:true,id:task.id,title:task.title}; } });
    addTool({ name:'complete_open_loop', title:'Complete open loop', description:'Mark an existing open loop complete and update momentum.', inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute(input){ const task=state.tasks.find(t=>t.id===input?.id&&t.status==='open'); if(!task) throw new Error('Open loop not found.'); completeTask(task.id); return {completed:true,id:task.id,title:task.title}; } });
  }

  $('#todayLabel').textContent = new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric'}).format(new Date()).toUpperCase();
  renderAll(); registerWebMCP();
})();
