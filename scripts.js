// Estado em memória do aplicativo
let certs = [];
let deletedCerts = [];
let showingTrash = false;
let dbDirHandle = null;

// Estado de ordenação alfabética: '' | 'az' | 'za'
let sortAlpha = '';

// Chaves de armazenamento local do navegador
const STORAGE_KEY = 'certificados_escritorio';
const TRASH_KEY = 'certificados_lixeira';
const DIR_HANDLE_KEY = 'certificados_dir_handle';

// Carrega o estado salvo no browser ao iniciar
function loadLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    certs = raw ? JSON.parse(raw) : [];
  }catch(e){ certs = []; }
}

function loadTrash(){
  try{
    const raw = localStorage.getItem(TRASH_KEY);
    deletedCerts = raw ? JSON.parse(raw) : [];
  }catch(e){ deletedCerts = []; }
}

// Persiste os dados em localStorage
async function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(certs));
}

async function persistTrash(){
  localStorage.setItem(TRASH_KEY, JSON.stringify(deletedCerts));
}

// Gera um identificador único para cada certificado salvo
function uid(){ return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }

// Remove pontuação de CPF/CNPJ (pontos, traços, barras, espaços) para facilitar a busca
function onlyDigits(str){
  return (str||'').replace(/[^\d]/g, '');
}

// Calcula quantos dias faltam até a data de vencimento
function daysUntil(dateStr){
  if(!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// Converte o número de dias em um status de vencimento
function statusOf(dateStr){
  const d = daysUntil(dateStr);
  if(d === null) return {key:'ok', label:'EM DIA'};
  if(d < 0) return {key:'vencido', label:'VENCIDO', dias:d};
  if(d <= 15) return {key:'urgente', label:'URGENTE', dias:d};
  if(d <= 30) return {key:'atencao', label:'ATENÇÃO', dias:d};
  if(d <= 60) return {key:'proximo', label:'PRÓXIMO', dias:d};
  return {key:'ok', label:'EM DIA', dias:d};
}

// Formata datas ISO em formato de exibição brasileiro
function fmtDate(dateStr){
  if(!dateStr) return '—';
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Define o texto exibido no selo de dias restantes
function sealText(status){
  if(status.key === 'vencido') return {n: Math.abs(status.dias), u:'DIAS VENC.'};
  return {n: status.dias, u:'DIAS'};
}

// Comparador de ordenação: alfabética (se ativa) senão por vencimento
function sortRows(a,b){
  if(sortAlpha === 'az'){
    return (a.nome||'').localeCompare(b.nome||'', 'pt-BR', {sensitivity:'base'});
  }
  if(sortAlpha === 'za'){
    return (b.nome||'').localeCompare(a.nome||'', 'pt-BR', {sensitivity:'base'});
  }
  return (a.vencimento||'9999-99-99').localeCompare(b.vencimento||'9999-99-99');
}

// Re-renderiza a lista de certificados aplicando busca e filtros
function render(){
  const listContainer = document.getElementById('listContainer');
  const trashContainer = document.getElementById('trashContainer');

  if(showingTrash){
    listContainer.style.display = 'none';
    trashContainer.style.display = 'flex';
    renderTrash();
    updateTrashStats();
    return;
  }

  listContainer.style.display = 'flex';
  trashContainer.style.display = 'none';

  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const fStatus = document.getElementById('filterStatus').value;
  const fTipo = document.getElementById('filterTipo').value;

  let rows = certs.map(c => ({...c, status: statusOf(c.vencimento)}));

  if(search){
    const searchDigits = onlyDigits(search);
    rows = rows.filter(c =>
      (c.nome||'').toLowerCase().includes(search) ||
      (c.titular||'').toLowerCase().includes(search) ||
      (c.documento||'').toLowerCase().includes(search) ||
      (searchDigits && onlyDigits(c.documento).includes(searchDigits))
    );
  }
  if(fStatus){
    if(fStatus === 'vencendo30'){
      rows = rows.filter(c => ['urgente','atencao'].includes(c.status.key));
    } else {
      rows = rows.filter(c => c.status.key === fStatus);
    }
  }
  if(fTipo) rows = rows.filter(c => c.tipo === fTipo);

  rows.sort((a,b) => sortRows(a,b));

  listContainer.innerHTML = '';

  if(rows.length === 0){
    listContainer.innerHTML = `<div class="empty">
      <div class="big">Nenhum certificado encontrado</div>
      <div>Cadastre o primeiro certificado do escritório para começar a acompanhar os vencimentos.</div>
    </div>`;
  } else {
    rows.forEach(c => {
      const seal = sealText(c.status);
      const wrapper = document.createElement('div');
      wrapper.className = 'cert-wrapper';
      const row = document.createElement('div');
      row.className = 'cert-row';
      row.innerHTML = `
        <div class="seal st-${c.status.key}">
          <div class="n">${seal.n}</div>
          <div class="u">${seal.u}</div>
        </div>
        <div class="cert-info">
          <p class="nome">${escapeHtml(c.nome)}</p>
          <div class="meta">
            <span>${escapeHtml(c.titular||'—')}</span>
            <span class="tag">${escapeHtml(c.tipo||'—')}</span>
            <span class="tag">${escapeHtml(c.modelo||'—')}</span>
            <span class="tag">${escapeHtml(c.emissora||'—')}</span>
            <span class="tag" style="color:var(--${c.status.key==='vencido'||c.status.key==='urgente' ? 'oxblood':'ink-soft'})">${c.status.label}</span>
          </div>
        </div>
        <div class="cert-dates">
          Emissão: <b>${fmtDate(c.emissao)}</b><br>
          Vencimento: <b>${fmtDate(c.vencimento)}</b>
        </div>
        <div class="cert-actions">
          <button class="btn ghost small" data-edit="${c.id}">Editar</button>
          ${ c.tipo === 'e-CNPJ' ? `<button class="btn ghost small" data-socios="${c.id}" title="Consultar sócios via BrasilAPI">Sócios</button>` : '' }
        </div>
      `;
      const delBtn = document.createElement('button');
      delBtn.className = 'quick-del';
      delBtn.setAttribute('data-quickdel', c.id);
      delBtn.setAttribute('title', 'Enviar para a lixeira');
      delBtn.innerHTML = '&#128465;';
      wrapper.appendChild(row);
      wrapper.appendChild(delBtn);
      listContainer.appendChild(wrapper);
    });
  }

  listContainer.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=> openModal(btn.getAttribute('data-edit')));
  });
  listContainer.querySelectorAll('[data-socios]').forEach(btn=>{
    btn.addEventListener('click', ()=> openSocios(btn.getAttribute('data-socios')));
  });
  listContainer.querySelectorAll('[data-quickdel]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-quickdel');
      const cert = certs.find(c=>c.id===id);
      if(!cert) return;
      if(confirm(`Enviar "${cert.nome||cert.titular||'este certificado'}" para a lixeira?`)){
        await moveToTrash(id);
      }
    });
  });

  updateStats();
  updateAlertBanner();
  document.getElementById('footerCount').textContent =
    `${certs.length} certificado${certs.length===1?'':'s'} cadastrado${certs.length===1?'':'s'}`;
}

function renderTrash(){
  const container = document.getElementById('trashContainer');
  container.innerHTML = '';

  if(deletedCerts.length === 0){
    container.innerHTML = `<div class="empty">
      <div class="big">Lixeira vazia</div>
      <div>Certificados excluídos da relação TOTAL aparecem aqui. Você pode restaurá-los a qualquer momento.</div>
    </div>`;
    return;
  }

  deletedCerts.slice().sort((a,b) => sortRows(a,b)).forEach(c => {
    const row = document.createElement('div');
    row.className = 'cert-row trash-row';
    const dt = c.deleted_at ? new Date(c.deleted_at).toLocaleString('pt-BR') : '';
    row.innerHTML = `
      <div class="seal st-vencido">
        <div class="n">&#128465;</div>
        <div class="u">EXCLUÍDO</div>
      </div>
      <div class="cert-info">
        <p class="nome">${escapeHtml(c.nome)}</p>
        <div class="meta">
          <span>${escapeHtml(c.titular||'—')}</span>
          <span class="tag">${escapeHtml(c.tipo||'—')}</span>
          <span class="tag">${escapeHtml(c.modelo||'—')}</span>
          <span class="tag">${escapeHtml(c.documento||'—')}</span>
          <span class="tag">Excluído em ${escapeHtml(dt)}</span>
        </div>
      </div>
      <div class="cert-dates">
        Emissão: <b>${fmtDate(c.emissao)}</b><br>
        Vencimento: <b>${fmtDate(c.vencimento)}</b>
      </div>
      <div class="cert-actions">
        <button class="btn ghost small" data-restore="${c.id}">Restaurar</button>
        <button class="btn danger small" data-permdel="${c.id}">Excluir perm.</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-restore]').forEach(btn=>{
    btn.addEventListener('click', ()=> restoreFromTrash(btn.getAttribute('data-restore')));
  });
  container.querySelectorAll('[data-permdel]').forEach(btn=>{
    btn.addEventListener('click', ()=> permanentDelete(btn.getAttribute('data-permdel')));
  });
}

function updateTrashStats(){
  document.getElementById('footerCount').textContent =
    `${deletedCerts.length} certificado${deletedCerts.length===1?'':'s'} na lixeira`;
}

function escapeHtml(str){
  const map = {38:'amp',60:'lt',62:'gt',34:'quot',39:'#39'};
  return (str||'').replace(/[&<>"']/g, m => '&' + map[m.charCodeAt(0)] + ';');
}

function updateStats(){
  const all = certs.map(c => statusOf(c.vencimento));
  document.getElementById('statTotal').textContent = certs.length;
  document.getElementById('statVencido').textContent = all.filter(s=>s.key==='vencido').length;
  document.getElementById('statProximo').textContent = all.filter(s=>['urgente','atencao'].includes(s.key)).length;
  document.getElementById('statOk').textContent = all.filter(s=>['ok','proximo'].includes(s.key)).length;
}

function updateAlertBanner(){
  const urgent = certs.filter(c => ['vencido','urgente'].includes(statusOf(c.vencimento).key));
  const banner = document.getElementById('alertBanner');
  if(urgent.length === 0){ banner.classList.remove('show'); return; }
  const names = urgent.slice(0,3).map(c=>c.nome).join(', ');
  const extra = urgent.length > 3 ? ` e mais ${urgent.length-3}` : '';
  document.getElementById('alertText').textContent =
    `${urgent.length} certificado${urgent.length===1?'':'s'} vencido${urgent.length===1?'':'s'} ou vencendo em breve: ${names}${extra}.`;
  banner.classList.add('show');
}

// ===== Modal =====
let formFieldsBound = false;

function openModal(id){
  const overlay = document.getElementById('overlay');
  const form = document.getElementById('certForm');
  form.reset();
  document.getElementById('certId').value = '';
  document.getElementById('btnDelete').style.display = 'none';
  document.getElementById('btnRestore').style.display = 'none';
  document.getElementById('btnDeletePermanent').style.display = 'none';
  document.getElementById('autoSaveIndicator').classList.remove('show');

  if(id){
    const c = certs.find(x=>x.id===id);
    if(c){
      document.getElementById('modalTitle').textContent = 'Editar certificado';
      document.getElementById('certId').value = c.id;
      document.getElementById('f_nome').value = c.nome||'';
      document.getElementById('f_titular').value = c.titular||'';
      document.getElementById('f_documento').value = c.documento||'';
      document.getElementById('f_tipo').value = c.tipo||'e-CPF';
      document.getElementById('f_modelo').value = c.modelo||'A1';
      document.getElementById('f_emissao').value = c.emissao||'';
      document.getElementById('f_vencimento').value = c.vencimento||'';
      document.getElementById('f_emissora').value = c.emissora||'';
      document.getElementById('f_responsavel').value = c.responsavel||'';
      document.getElementById('f_obs').value = c.obs||'';
      document.getElementById('btnDelete').style.display = 'inline-block';
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Novo certificado';
  }
  overlay.classList.add('show');
  bindAutoSave();
}

function closeModal(){
  document.getElementById('overlay').classList.remove('show');
}

function getFormData(){
  const idField = document.getElementById('certId');
  let id = idField.value;
  const nome = document.getElementById('f_nome').value.trim();
  const vencimento = document.getElementById('f_vencimento').value;
  if(!nome || !vencimento) return null;
  if(!id) id = uid();
  idField.value = id;
  return {
    id,
    nome,
    titular: document.getElementById('f_titular').value.trim(),
    documento: document.getElementById('f_documento').value.trim(),
    tipo: document.getElementById('f_tipo').value,
    modelo: document.getElementById('f_modelo').value,
    emissao: document.getElementById('f_emissao').value,
    vencimento,
    emissora: document.getElementById('f_emissora').value.trim(),
    responsavel: document.getElementById('f_responsavel').value.trim(),
    obs: document.getElementById('f_obs').value.trim(),
  };
}

let autoSaveTimer = null;
function bindAutoSave(){
  if(formFieldsBound) return;
  const fields = ['f_nome','f_titular','f_documento','f_tipo','f_modelo','f_emissao','f_vencimento','f_emissora','f_responsavel','f_obs'];
  fields.forEach(fid => {
    const el = document.getElementById(fid);
    if(!el) return;
    el.addEventListener('input', scheduleAutoSave);
    el.addEventListener('change', scheduleAutoSave);
  });
  formFieldsBound = true;
}

function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(autoSave, 500);
}

async function autoSave(){
  const data = getFormData();
  if(!data) return;
  const idx = certs.findIndex(c=>c.id===data.id);
  if(idx >= 0) certs[idx] = data; else certs.push(data);
  await persist();
  render();
  const indicator = document.getElementById('autoSaveIndicator');
  indicator.classList.add('show');
  clearTimeout(indicator._timer);
  indicator._timer = setTimeout(()=> indicator.classList.remove('show'), 1500);
}

document.getElementById('certForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const data = getFormData();
  if(!data){ alert('Preencha pelo menos o nome e a data de vencimento.'); return; }
  const idx = certs.findIndex(c=>c.id===data.id);
  if(idx >= 0) certs[idx] = data; else certs.push(data);
  closeModal();
  render();
  await persist();
});

document.getElementById('btnDelete').addEventListener('click', async function(){
  const id = document.getElementById('certId').value;
  if(id && confirm('Enviar este certificado para a lixeira?')){
    moveToTrash(id);
  }
});

document.getElementById('btnRestore').addEventListener('click', async function(){
  const id = document.getElementById('certId').value;
  if(id) await restoreFromTrash(id);
  closeModal();
});

document.getElementById('btnDeletePermanent').addEventListener('click', async function(){
  const id = document.getElementById('certId').value;
  if(id && confirm('Excluir PERMANENTEMENTE? Esta ação não pode ser desfeita.')){
    await permanentDelete(id);
    closeModal();
  }
});

async function moveToTrash(id){
  const idx = certs.findIndex(c=>c.id===id);
  if(idx < 0) return;
  const cert = certs[idx];
  cert.deleted_at = new Date().toISOString();
  deletedCerts.push(cert);
  certs.splice(idx, 1);
  closeModal();
  render();
  await persist();
  await persistTrash();
}

async function restoreFromTrash(id){
  const idx = deletedCerts.findIndex(c=>c.id===id);
  if(idx < 0) return;
  const cert = deletedCerts[idx];
  delete cert.deleted_at;
  certs.push(cert);
  deletedCerts.splice(idx, 1);
  render();
  await persist();
  await persistTrash();
}

async function permanentDelete(id){
  deletedCerts = deletedCerts.filter(c=>c.id!==id);
  render();
  await persistTrash();
}

document.getElementById('btnNew').addEventListener('click', ()=>openModal(null));
document.getElementById('btnCancel').addEventListener('click', closeModal);
const btnCloseTop = document.getElementById('btnCloseTop');
if(btnCloseTop) btnCloseTop.addEventListener('click', closeModal);
document.getElementById('overlay').addEventListener('click', (e)=>{
  if(e.target.id === 'overlay') closeModal();
});

// ===== Lixeira toggle =====
document.getElementById('btnTrash').addEventListener('click', ()=>{
  showingTrash = !showingTrash;
  const btn = document.getElementById('btnTrash');
  if(showingTrash){
    btn.textContent = '\u25C0 Voltar';
    btn.classList.remove('ghost');
  } else {
    btn.innerHTML = '\uD83D\uDDD1 Lixeira';
    btn.classList.add('ghost');
  }
  render();
});

// ===== Filtros =====
function setStatusFilter(value){
  const filter = document.getElementById('filterStatus');
  filter.value = value;
  render();
}

function updateClearButton(){
  const input = document.getElementById('searchInput');
  const btn = document.getElementById('btnClearSearch');
  btn.classList.toggle('show', input.value.length > 0);
}

document.getElementById('searchInput').addEventListener('input', ()=>{ updateClearButton(); render(); });
document.getElementById('btnClearSearch').addEventListener('click', ()=>{
  const input = document.getElementById('searchInput');
  input.value = '';
  updateClearButton();
  input.focus();
  render();
});
updateClearButton();
document.getElementById('filterStatus').addEventListener('change', render);
document.getElementById('filterTipo').addEventListener('change', render);

// ===== Ordenação alfabética opcional =====
const btnSortAlpha = document.getElementById('btnSortAlpha');
btnSortAlpha.addEventListener('click', ()=>{
  // ciclo: '' -> 'az' -> 'za' -> ''
  sortAlpha = sortAlpha === '' ? 'az' : (sortAlpha === 'az' ? 'za' : '');
  updateSortButton();
  render();
});
function updateSortButton(){
  btnSortAlpha.classList.toggle('active', sortAlpha !== '');
  if(sortAlpha === 'az'){ btnSortAlpha.textContent = 'A-Z'; btnSortAlpha.title = 'Ordenação alfabética crescente (clique para Z-A)'; }
  else if(sortAlpha === 'za'){ btnSortAlpha.textContent = 'Z-A'; btnSortAlpha.title = 'Ordenação alfabética decrescente (clique para padrão)'; }
  else { btnSortAlpha.textContent = 'A-Z'; btnSortAlpha.title = 'Ordenar alfabeticamente por nome'; }
}
updateSortButton();
document.querySelector('.stat.total.clickable').addEventListener('click', ()=> setStatusFilter(''));
document.querySelector('.stat.vencido.clickable').addEventListener('click', ()=> setStatusFilter('vencido'));
document.querySelector('.stat.proximo.clickable').addEventListener('click', ()=> setStatusFilter('vencendo30'));

// ===== Exportar backup =====
document.getElementById('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(certs, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `backup-certificados-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnImport').addEventListener('click', ()=>{
  document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev){
    try{
      const imported = JSON.parse(ev.target.result);
      if(!Array.isArray(imported)) throw new Error('Formato inválido');

      // Pergunta se deve limpar o cache do navegador antes de importar
      const limparCache = confirm(
        'Deseja LIMPAR o cache de armazenamento do navegador antes de importar?\n\n' +
        'Isso apaga:\n' +
        '  \u2022 localStorage (certificados antigos, lixeira, configs)\n' +
        '  \u2022 sessionStorage\n' +
        '  \u2022 Cache de rede (service workers / caches API)\n\n' +
        'Recomendado ao restaurar um backup limpo. Clique em Cancelar para apenas mesclar/substituir os dados.'
      );

      if(limparCache){
        try{
          sessionStorage.clear();
          // Limpa caches API (service worker caches) se existirem
          if(window.caches){
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          // Limpa localStorage mantendo somente a importação atual
          // (vamos persistir os dados importados logo abaixo)
          localStorage.clear();
          // Reseta arrays em memória
          deletedCerts = [];
          showingTrash = false;
          const btnT = document.getElementById('btnTrash');
          if(btnT){ btnT.innerHTML = '\uD83D\uDDD1 Lixeira'; btnT.classList.add('ghost'); }
          sortAlpha = '';
          const btnS = document.getElementById('btnSortAlpha');
          if(btnS){ updateSortButton && updateSortButton(); }
        }catch(errCache){
          console.warn('Limpeza parcial do cache:', errCache);
        }
        certs = imported;
      } else {
        const merge = confirm('Clique OK para mesclar com os dados atuais, ou Cancelar para substituir tudo.');
        if(merge){
          const ids = new Set(certs.map(c=>c.id));
          imported.forEach(c=>{ if(!ids.has(c.id)) certs.push(c); });
        } else {
          certs = imported;
        }
      }

      render();
      await persist();
      await persistTrash();
      alert(
        'Backup importado com sucesso.\n\n' +
        (limparCache ? 'Cache do navegador foi limpo antes da importação.' : 'Dados substituídos/mesclados.')
      );
    }catch(err){
      alert('Não foi possível importar este arquivo. Verifique se é um backup válido gerado por este sistema.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ===== Bkp automático: puxar BKP.json da pasta test/ =====
const BKP_FILENAME = 'BKP.json';

async function bkpAutoImport(){
  // Estratégia 1: fetch relativo (funciona se servido via http://)
  try{
    const res = await fetch('test/' + BKP_FILENAME, { cache: 'no-store' });
    if(res.ok){
      const text = await res.text();
      await applyImportedBkp(text, `test/${BKP_FILENAME} (servidor local)`);
      return;
    }
  }catch(fetchErr){
    // provavelmente file:// — cai para o input
  }

  // Estratégia 2: File System Access API (exige https://, memoriza a pasta)
  if(window.showDirectoryPicker){
    try{
      if(!dbDirHandle){
        alert('Na primeira vez, selecione a pasta "test" onde o BKP.json está localizado.');
        dbDirHandle = await window.showDirectoryPicker({ id: 'certDB', mode: 'readwrite' });
        localStorage.setItem(DIR_HANDLE_KEY, 'picked');
      }
      let fileHandle;
      try{
        fileHandle = await dbDirHandle.getFileHandle(BKP_FILENAME, { create: false });
      }catch(missing){
        alert(`Arquivo "${BKP_FILENAME}" não encontrado em "${dbDirHandle.name}".\nVerifique se o arquivo existe na pasta selecionada.`);
        return;
      }
      const file = await fileHandle.getFile();
      const text = await file.text();
      await applyImportedBkp(text, `${dbDirHandle.name}/${BKP_FILENAME}`);
      return;
    }catch(err){
      if(err.name === 'AbortError') return;
      console.warn('File System Access falhou, usando input de arquivo.', err);
    }
  }

  // Estratégia 3 (fallback): input de arquivo pedindo o BKP.json
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async (ev) => {
    const f = ev.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      await applyImportedBkp(e.target.result, f.name);
    };
    reader.readAsText(f);
  };
  alert(
    'Não foi possível acessar a pasta "test" automaticamente.\n\n' +
    'Isto ocorre porque a página está aberta via file:// (protocolo local).\n\n' +
    'Para permitir acesso automático_no futuro:\n' +
    '  \u2022 Abra a pasta do projeto no PowerShell e rode:\n' +
    '    python -m http.server 8000\n' +
    '  \u2022 Acesse http://localhost:8000\n\n' +
    'Por enquanto, selecione manualmente o arquivo BKP.json da pasta test/.'
  );
  input.click();
}

async function applyImportedBkp(text, fonte){
  try{
    const imported = JSON.parse(text);
    let lista;
    // Aceita tanto array direto quanto objeto com { certificados, lixeira }
    if(Array.isArray(imported)){
      lista = imported;
    } else if(Array.isArray(imported.certificados)){
      lista = imported.certificados;
      if(Array.isArray(imported.lixeira)){
        deletedCerts = imported.lixeira;
        await persistTrash();
      }
    } else {
      throw new Error('Formato inválido');
    }

    const limpar = confirm(
      `Backup carregado de:\n${fonte}\n\n` +
      `Total de certificados: ${lista.length}\n\n` +
      `Deseja LIMPAR o cache do navegador antes de aplicar o backup?\n` +
      `(Recomendado para restauração limpa)`
    );

    if(limpar){
      try{
        sessionStorage.clear();
        if(window.caches){
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TRASH_KEY);
        deletedCerts = [];
        showingTrash = false;
        const btnT = document.getElementById('btnTrash');
        if(btnT){ btnT.innerHTML = '\uD83D\uDDD1 Lixeira'; btnT.classList.add('ghost'); }
      }catch(errCache){
        console.warn('Limpeza parcial do cache:', errCache);
      }
      certs = lista;
    } else {
      const merge = confirm('Clique OK para mesclar com os dados atuais, ou Cancelar para substituir tudo.');
      if(merge){
        const ids = new Set(certs.map(c=>c.id));
        lista.forEach(c=>{ if(!ids.has(c.id)) certs.push(c); });
      } else {
        certs = lista;
      }
    }

    render();
    await persist();
    await persistTrash();
    alert(`Backup aplicado com sucesso.\n\nFonte: ${fonte}\nCertificados carregados: ${certs.length}`);
  }catch(err){
    alert('Não foi possível importar o BKP.json. Verifique se o arquivo é um backup válido.\n\nDetalhe: ' + err.message);
  }
}

document.getElementById('btnBkpAuto').addEventListener('click', bkpAutoImport);

// ===== Salvar BD na pasta /test =====
async function saveDbToTest(){
  const data = {
    exportado_em: new Date().toISOString(),
    certificados: certs,
    lixeira: deletedCerts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});

  // Cenário ideal: File System Access API para salvar direto na pasta
  if(window.showDirectoryPicker){
    try{
      if(!dbDirHandle){
        dbDirHandle = await window.showDirectoryPicker({ id: 'certDB', mode: 'readwrite' });
        localStorage.setItem(DIR_HANDLE_KEY, 'picked');
      }
      const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'-');
      const fname = `backup-certificados-${stamp}.json`;
      const fileHandle = await dbDirHandle.getFileHandle(fname, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      alert(`Banco de dados salvo em:\n${dbDirHandle.name}\\${fname}`);
      return;
    }catch(err){
      if(err.name === 'AbortError') return;
      console.warn('File System Access falhou, usando download.', err);
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `backup-certificados-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('Banco salvo (download). Mova o arquivo para a pasta \\test se necessário.');
}

// Botão "Salvar BD" dinâmico no footer
const btnDbSave = document.createElement('button');
btnDbSave.type = 'button';
btnDbSave.className = 'btn ghost small';
btnDbSave.id = 'btnSaveDb';
btnDbSave.textContent = 'Salvar BD (.json)';
btnDbSave.addEventListener('click', saveDbToTest);
document.querySelector('footer span:last-child').appendChild(btnDbSave);

document.getElementById('todayLabel').textContent =
  new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});

loadLocal();
loadTrash();
document.getElementById('filterStatus').value = 'vencendo30';

// Auto-load: se estiver rodando via Django e o localStorage estiver vazio, puxa da API
(function autoLoadFromDjango(){
  if(!window.__DJFALLBACK__) return; // so executa se Django injetar a flag
  var existing = localStorage.getItem('certificados_escritorio');
  if(existing && existing !== '[]' && existing !== 'null') return; // ja tem dados
  fetch('/api/certificados/', {headers:{Accept:'application/json'}, cache:'no-store'})
    .then(function(r){ if(!r.ok) throw new Error('API retornou '+r.status); return r.json(); })
    .then(function(data){
      var lista = Array.isArray(data) ? data : (Array.isArray(data.certificados) ? data.certificados : (Array.isArray(data.results) ? data.results : []));
      certs = lista;
      persist();
      render();
    })
    .catch(function(err){ console.warn('Auto-load Django falhou:', err); });
})();

render();

// ===== Tema claro/escuro =====
const THEME_KEY = 'certs_theme';
function getCurrentTheme(){ return localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function applyTheme(theme){
  if(theme === 'dark') document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
}
function toggleTheme(){
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
applyTheme(getCurrentTheme());
const btnTheme = document.getElementById('btnTheme');
if(btnTheme) btnTheme.addEventListener('click', toggleTheme);
// Atualiza automaticamente se o sistema mudar e o usuário ainda não escolheu
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e)=>{
  if(!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light');
});

// ===== Sócios (BrasilAPI - gratuita, sem token) =====
const API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';
let sociosCurrentCnpj = '';
let sociosCurrentCertId = '';

async function openSocios(id){
  const cert = certs.find(c=>c.id===id);
  if(!cert) return;
  const cnpjDigits = onlyDigits(cert.documento);
  if(cnpjDigits.length !== 14){
    alert('Este certificado não possui um CNPJ válido (14 dígitos) para consulta.');
    return;
  }
  sociosCurrentCnpj = cnpjDigits;
  document.getElementById('sociosTitle').textContent =
    'Sócios — ' + (cert.nome || cert.titular || 'CNPJ ' + cnpjDigits);
  document.getElementById('sociosBody').innerHTML =
    '<div class="socios-loading">Consultando BrasilAPI...</div>';
  document.getElementById('sociosOverlay').classList.add('show');

  try{
    const res = await fetch(API_BASE + '/' + cnpjDigits, {
      headers: { 'Accept': 'application/json' }
    });
    if(!res.ok){
      let msg = 'HTTP ' + res.status;
      try{
        const ej = await res.json();
        if(ej && (ej.message || ej.error)) msg += ' — ' + (ej.message || ej.error);
      }catch(e){}
      throw new Error(msg);
    }
    const data = await res.json();
    renderSocios(data, cert);
  }catch(err){
    document.getElementById('sociosBody').innerHTML =
      '<div class="socios-error">&#9888; Falha ao consultar: ' + escapeHtml(err.message) + '<br>Verifique sua conexão e tente novamente.</div>';
  }
}

function renderSocios(data, cert){
  const body = document.getElementById('sociosBody');
  const socios = Array.isArray(data.qsa) ? data.qsa : [];
  const razao = data.razao_social || cert.titular || '—';
  const fantasia = data.nome_fantasia || '';
  const situacao = data.descricao_situacao_cadastral || data.situacao_cadastral || '—';
  const abertura = data.data_inicio_atividade || '—';
  const natureza = data.natureza_juridica || '—';
  const capital = data.capital_social || '';

  let html = '';
  html += '<div class="socios-header">';
  html += '<div><span>Razão social:</span> <b>' + escapeHtml(razao) + '</b></div>';
  html += '<div><span>CNPJ:</span> <b>' + escapeHtml(sociosCurrentCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) + '</b></div>';
  html += '<div><span>Abertura:</span> <b>' + escapeHtml(fmtDateISO(abertura)) + '</b></div>';
  html += '<div><span>Situação:</span> <b>' + escapeHtml(situacao) + '</b></div>';
  if(fantasia) html += '<div><span>Nome fantasia:</span> <b>' + escapeHtml(fantasia) + '</b></div>';
  if(natureza) html += '<div><span>Natureza jurídica:</span> <b>' + escapeHtml(natureza) + '</b></div>';
  if(capital) html += '<div><span>Capital social:</span> <b>R$ ' + escapeHtml(String(capital)) + '</b></div>';
  html += '</div>';

  if(socios.length === 0){
    html += '<div class="socios-empty">Nenhum sócio retornado pela API.</div>';
    body.innerHTML = html;
    return;
  }

  html += '<div class="socios-list"><div class="socios-list-title">Quadro societário (' + socios.length + ')</div>';
  socios.forEach((s) => {
    const nome = s.nome_socio || s.nome || '—';
    const qual = s.qualificacao_socio || s.qualificacao || '—';
    const faixa = s.faixa_etaria || '';
    const entrada = s.data_entrada_sociedade || '';
    const doc = s.cnpj_cpf_do_socio || '';
    const rep = s.nome_representante_legal || '';
    const repQual = s.qualificacao_representante_legal || '';
    html += '<div class="socio-row">';
    html += '<div class="socio-n">' + escapeHtml(nome) + '</div>';
    html += '<div class="socio-meta">';
    html += '<span class="tag">' + escapeHtml(String(qual)) + '</span>';
    if(entrada) html += '<span class="tag">Entrou: ' + escapeHtml(fmtDateISO(entrada)) + '</span>';
    if(faixa && faixa !== 'null') html += '<span class="tag">' + escapeHtml(String(faixa)) + '</span>';
    if(doc && doc !== '***000000**') html += '<span class="tag">' + escapeHtml(String(doc)) + '</span>';
    html += '</div>';
    if(rep && rep !== '' && rep !== 'null'){
      html += '<div class="socio-rep">Rep. legal: ' + escapeHtml(rep);
      if(repQual && repQual !== 'Não informada') html += ' (' + escapeHtml(repQual) + ')';
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  body.innerHTML = html;
}

function fmtDateISO(s){
  if(!s || s === 'null') return '—';
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s.slice(0,10));
  return String(s);
}

document.getElementById('btnSociosClose').addEventListener('click', ()=>{
  document.getElementById('sociosOverlay').classList.remove('show');
});
const btnSociosCloseTop = document.getElementById('btnSociosCloseTop');
if(btnSociosCloseTop) btnSociosCloseTop.addEventListener('click', ()=>{
  document.getElementById('sociosOverlay').classList.remove('show');
});
document.getElementById('sociosOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'sociosOverlay') document.getElementById('sociosOverlay').classList.remove('show');
});
document.getElementById('btnSociosOpen').addEventListener('click', ()=>{
  if(!sociosCurrentCnpj) return;
  window.open('https://cnpja.com/' + sociosCurrentCnpj, '_blank', 'noopener');
});
