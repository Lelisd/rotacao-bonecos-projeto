// ---------- estado (tudo em memória) ----------
let nextId = 1;
function mkChar(name, lastRotation){
  return { id: nextId++, name, lastRotation };
}

// lista padrão: usada só quando não existe nada salvo ainda
const DEFAULT_CHARACTER_NAMES = [
  'Baby 5','Bartolomeo','Basil Hawkins','Bastille','Bellamy','Blueno','Brook',
  'Capone Gang Bege','Carrot','Chopper','Crocodile','Dalmatian','Eustass Kid',
  'Franky','Gecko Moria','Hina','Jabra','Jesus Burgess','Jewelry Bonney','Kaku',
  'Kalifa','Killer','Koala','Leo & Mansherry','Marco','Marguerite','Monkey D. Luffy',
  'Nami','Perona','Rebecca','Rob Lucci','Robin','Roronoa Zoro','Ryuma',
  'Scratchmen Apoo','Smoker','Trafalgar Law','Urouge','Usopp','Uta','Van Augur',
  'Vinsmoke Ichiji','Vinsmoke Niji','Vinsmoke Reiju','Vinsmoke Sanji','Vinsmoke Yonji',
  'X Drake','Yamato'
];
function defaultCharacters(){
  return DEFAULT_CHARACTER_NAMES.map(name => mkChar(name, null));
}

let characters = [];

let currentWeek = { bau1: [null,null,null], bau2: [null,null,null] };
let nextWeek    = { bau1: [null,null,null], bau2: [null,null,null] };
let history = []; // [{ date:'YYYY-MM-DD', bau1:[ids], bau2:[ids] }]
let lastConfirmedDate = null;

let slotBeingEdited = null; // { week:'current'|'next', bau:'bau1'|'bau2', idx:0 }

// ---------- salvar/carregar (funciona dentro do chat e como arquivo aberto direto no navegador) ----------
const STORAGE_KEY = 'rotacao-personagens-estado';

async function storageGet(){
  if(window.storage){
    try{
      const res = await window.storage.get(STORAGE_KEY, false);
      return res ? JSON.parse(res.value) : null;
    }catch(e){ return null; }
  }
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

async function storageSet(data){
  const json = JSON.stringify(data);
  if(window.storage){
    try{ await window.storage.set(STORAGE_KEY, json, false); }catch(e){ console.error(e); }
    return;
  }
  try{ localStorage.setItem(STORAGE_KEY, json); }catch(e){ console.error(e); }
}

async function storageClear(){
  if(window.storage){
    try{ await window.storage.delete(STORAGE_KEY, false); }catch(e){}
    return;
  }
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
}

function saveState(){
  storageSet({ characters, nextId, currentWeek, nextWeek, history, lastConfirmedDate });
}

// ---------- helpers ----------
function charById(id){ return characters.find(c=>c.id===id); }
function initials(name){ return name.trim().slice(0,2).toUpperCase(); }

function statusOf(char){
  const idsInCurrent = [...currentWeek.bau1, ...currentWeek.bau2];
  if(idsInCurrent.includes(char.id)) return {label:'current', color:'var(--c-current)'};
  if(!char.lastRotation) return {label:'old', color:'var(--c-old)'};

  const diffDays = Math.floor((Date.now() - new Date(char.lastRotation)) / 86400000);
  if(diffDays <= 7) return {label:'current', color:'var(--c-current)'};
  if(diffDays <= 30) return {label:'month', color:'var(--c-month)'};
  if(diffDays <= 60) return {label:'2months', color:'var(--c-2months)'};
  return {label:'old', color:'var(--c-old)'};
}

function formatDate(iso){
  if(!iso) return '--/--';
  const d = new Date(iso);
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
}

// ---------- render: painéis de semana ----------
function renderWeekPanel(containerId, weekObj){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  ['bau1','bau2'].forEach((bauKey, bIdx)=>{
    const row = document.createElement('div');
    row.className = 'bau-row';
    const label = document.createElement('div');
    label.className = 'bau-label';
    label.textContent = 'Baú ' + (bIdx+1);
    row.appendChild(label);

    const slots = document.createElement('div');
    slots.className = 'slots';
    weekObj[bauKey].forEach((id, idx)=>{
      const s = document.createElement('div');
      const char = id ? charById(id) : null;
      s.className = 'slot' + (char ? '' : ' empty');
      if(char){
        const st = statusOf(char);
        const av = document.createElement('div');
        av.className = 'avatar';
        av.style.background = st.color;
        av.textContent = initials(char.name);
        const nm = document.createElement('div');
        nm.className = 'name';
        nm.textContent = char.name;
        s.appendChild(av); s.appendChild(nm);
      } else {
        s.innerHTML = '<div class="name">+</div>';
      }
      s.onclick = () => openSlotDialog(containerId==='current-baus' ? 'current':'next', bauKey, idx);
      slots.appendChild(s);
    });
    row.appendChild(slots);
    el.appendChild(row);
  });
}

function openSlotDialog(week, bau, idx){
  slotBeingEdited = {week, bau, idx};
  const sel = document.getElementById('slot-select');
  sel.innerHTML = '<option value="">-- vazio --</option>' +
    characters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const weekObj = week==='current' ? currentWeek : nextWeek;
  const currentVal = weekObj[bau][idx];
  if(currentVal) sel.value = currentVal;
  document.getElementById('slot-dialog').showModal();
}

document.getElementById('slot-confirm').onclick = () => {
  const val = document.getElementById('slot-select').value;
  const {week, bau, idx} = slotBeingEdited;
  const weekObj = week==='current' ? currentWeek : nextWeek;
  weekObj[bau][idx] = val ? Number(val) : null;
  document.getElementById('slot-dialog').close();
  saveState();
  renderAll();
};
document.getElementById('slot-clear').onclick = () => {
  const {week, bau, idx} = slotBeingEdited;
  const weekObj = week==='current' ? currentWeek : nextWeek;
  weekObj[bau][idx] = null;
  document.getElementById('slot-dialog').close();
  saveState();
  renderAll();
};

// ---------- avançar semana ----------
// ---------- confirmar semana (grava data + histórico) ----------
const HISTORY_LIMIT = 10;

function confirmWeek(){
  const today = new Date().toISOString().slice(0,10);
  [...currentWeek.bau1, ...currentWeek.bau2].forEach(id=>{
    if(!id) return;
    const c = charById(id);
    c.lastRotation = today;
  });
  const entry = { date: today, bau1:[...currentWeek.bau1], bau2:[...currentWeek.bau2] };
  if(history.length && history[history.length-1].date === today){
    history[history.length-1] = entry; // já confirmou hoje, atualiza em vez de duplicar
  } else {
    history.push(entry);
  }
  while(history.length > HISTORY_LIMIT){
    history.shift(); // tira a rotação mais antiga quando passa do limite
  }
  lastConfirmedDate = today;
  document.getElementById('friday-banner').style.display = 'none';
  saveState();
  renderAll();
}

// ---------- avançar semana (só move próxima -> atual) ----------
function advanceWeek(){
  currentWeek = nextWeek;
  nextWeek = { bau1:[null,null,null], bau2:[null,null,null] };
  saveState();
  renderAll();
}

document.getElementById('confirm-btn').onclick = confirmWeek;
document.getElementById('advance-btn').onclick = advanceWeek;
document.getElementById('banner-confirm-btn').onclick = confirmWeek;

// ---------- filtros / grid ----------

function renderGrid(){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  const search = document.getElementById('search').value.trim().toLowerCase();
  const sortMode = document.getElementById('sort').value;

  let list = characters.filter(c=>{
    if(search && !c.name.toLowerCase().includes(search)) return false;
    return true;
  });

  list.sort((a,b)=>{
    if(sortMode==='name-asc') return a.name.localeCompare(b.name);
    if(sortMode==='name-desc') return b.name.localeCompare(a.name);
    const da = a.lastRotation ? new Date(a.lastRotation) : new Date(0);
    const db = b.lastRotation ? new Date(b.lastRotation) : new Date(0);
    if(sortMode==='recent') return db - da;
    if(sortMode==='oldest') return da - db;
    return 0;
  });

  list.forEach(c=>{
    const st = statusOf(c);
    const card = document.createElement('div');
    card.className = 'card';
    card.style.borderColor = st.color;
    card.innerHTML = `
      <div class="avatar" style="background:${st.color}">${initials(c.name)}</div>
      <div class="badge" style="background:${st.color}">${formatDate(c.lastRotation)}</div>
      <div class="cname">${c.name}</div>
    `;
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'card add-card';
  addCard.textContent = '+';
  addCard.onclick = () => document.getElementById('add-dialog').showModal();
  grid.appendChild(addCard);
}

// ---------- adicionar boneco ----------
document.getElementById('cancel-add').onclick = () => document.getElementById('add-dialog').close();

function addCharacterFromDialog(){
  const name = document.getElementById('new-name').value.trim();
  if(!name) return;
  characters.push(mkChar(name, null));
  document.getElementById('new-name').value = '';
  document.getElementById('add-dialog').close();
  saveState();
  renderAll();
}

document.getElementById('confirm-add').onclick = addCharacterFromDialog;
document.getElementById('new-name').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){
    e.preventDefault();
    addCharacterFromDialog();
  }
});

// ---------- eventos ----------
document.getElementById('search').oninput = renderGrid;
document.getElementById('sort').onchange = renderGrid;

document.getElementById('clear-data-btn').onclick = () => {
  if(!confirm('Isso vai apagar as vagas e o histórico, e voltar a lista de personagens pro padrão. Confirmar?')) return;
  characters = defaultCharacters();
  currentWeek = { bau1:[null,null,null], bau2:[null,null,null] };
  nextWeek = { bau1:[null,null,null], bau2:[null,null,null] };
  history = [];
  lastConfirmedDate = null;
  saveState();
  document.getElementById('friday-banner').style.display = 'none';
  renderAll();
};

function renderHistory(){
  const titleEl = document.getElementById('history-title');
  if(titleEl) titleEl.textContent = `Histórico de rotações (${history.length}/${HISTORY_LIMIT})`;

  const el = document.getElementById('history-list');
  el.innerHTML = '';
  if(!history.length){
    el.innerHTML = '<div class="history-empty">Nenhuma rotação confirmada ainda.</div>';
    return;
  }
  [...history].reverse().forEach(entry=>{
    const item = document.createElement('div');
    item.className = 'history-item';

    const dateEl = document.createElement('div');
    dateEl.className = 'history-date';
    dateEl.textContent = formatDate(entry.date);
    item.appendChild(dateEl);

    const bausEl = document.createElement('div');
    bausEl.className = 'history-baus';
    ['bau1','bau2'].forEach((bauKey, i)=>{
      const bauEl = document.createElement('div');
      bauEl.className = 'history-bau';
      const label = document.createElement('span');
      label.className = 'history-bau-label';
      label.textContent = 'Baú ' + (i+1) + ':';
      bauEl.appendChild(label);
      entry[bauKey].forEach(id=>{
        if(!id) return;
        const c = charById(id);
        if(!c) return;
        const av = document.createElement('div');
        av.className = 'history-avatar';
        av.title = c.name;
        av.textContent = initials(c.name);
        bauEl.appendChild(av);
      });
      bausEl.appendChild(bauEl);
    });
    item.appendChild(bausEl);
    el.appendChild(item);
  });
}

function renderAll(){
  renderWeekPanel('current-baus', currentWeek);
  renderWeekPanel('next-baus', nextWeek);
  renderGrid();
  renderHistory();
}
(async function init(){
  const saved = await storageGet();
  if(saved){
    characters = saved.characters || [];
    nextId = saved.nextId || 1;
    currentWeek = saved.currentWeek || { bau1:[null,null,null], bau2:[null,null,null] };
    nextWeek = saved.nextWeek || { bau1:[null,null,null], bau2:[null,null,null] };
    history = saved.history || [];
    lastConfirmedDate = saved.lastConfirmedDate || null;
  } else {
    characters = defaultCharacters();
    saveState();
  }
  renderAll();

  // checa se hoje é sexta (dia 5) e a semana ainda não foi confirmada hoje
  const today = new Date();
  const todayISO = today.toISOString().slice(0,10);
  if(today.getDay() === 5 && lastConfirmedDate !== todayISO){
    document.getElementById('friday-banner').style.display = 'flex';
  }
})();
