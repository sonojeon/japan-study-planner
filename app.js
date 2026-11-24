const DB_NAME = "japan-study-planner";
const DB_VERSION = 1;
let db;
let calendarDate = new Date();
let toastTimer;

const $ = (id) => document.getElementById(id);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("universities")) database.createObjectStore("universities", { keyPath: "id" });
      if (!database.objectStoreNames.contains("events")) database.createObjectStore("events", { keyPath: "id" });
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function store(name, mode="readonly") { return db.transaction(name, mode).objectStore(name); }
function getAll(name) {
  return new Promise((resolve, reject) => {
    const req = store(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function getValue(name, key) {
  return new Promise((resolve, reject) => {
    const req = store(name).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function put(name, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    tx.objectStore(name).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function remove(name, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    tx.objectStore(name).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function clearStore(name) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    tx.objectStore(name).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function showToast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function escapeHTML(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function formatDate(date) {
  if (!date) return "";
  const [y,m,d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}
function monthTitle(date) { return `${date.getFullYear()}년 ${date.getMonth()+1}월`; }
async function allData() {
  const [universities, events, note] = await Promise.all([getAll("universities"), getAll("events"), getValue("settings","globalNote")]);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), universities, events, globalNote: note?.value || "" };
}
async function refresh() {
  const [universities, events, note] = await Promise.all([getAll("universities"), getAll("events"), getValue("settings","globalNote")]);
  renderStats(universities, events);
  renderCalendar(events);
  renderUpcoming(events, universities);
  renderDashboardUniversities(universities);
  renderUniversities(universities);
  renderEvents(events, universities);
  updateUniversityOptions(universities);
  if (document.activeElement !== $("globalNote")) $("globalNote").value = note?.value || "";
}
function renderStats(universities, events) {
  $("statUniversities").textContent = universities.length;
  $("statEvents").textContent = events.length;
  $("statUpcoming").textContent = events.filter(e => e.date >= todayISO()).length;
}
function renderCalendar(events) {
  const year=calendarDate.getFullYear(), month=calendarDate.getMonth();
  $("monthLabel").textContent=monthTitle(calendarDate);
  const first=new Date(year,month,1), start=(first.getDay());
  const days=new Date(year,month+1,0).getDate();
  const prevDays=new Date(year,month,0).getDate();
  const names=["일","월","화","수","목","금","토"];
  let html=names.map(n=>`<div class="day-name">${n}</div>`).join("");
  for(let i=0;i<42;i++){
    let day, date, other=false;
    if(i<start){day=prevDays-start+i+1;date=new Date(year,month-1,day);other=true;}
    else if(i>=start+days){day=i-(start+days)+1;date=new Date(year,month+1,day);other=true;}
    else{day=i-start+1;date=new Date(year,month,day);}
    const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dayEvents=events.filter(e=>e.date===iso).slice(0,2);
    html+=`<div class="day-cell ${other?"other":""} ${iso===todayISO()?"today":""}" data-date="${iso}"><span class="day-num">${day}</span>${dayEvents.map(e=>`<span class="day-event">${escapeHTML(e.title)}</span>`).join("")}</div>`;
  }
  $("calendar").innerHTML=html;
  $("calendar").querySelectorAll(".day-cell").forEach(cell=>cell.addEventListener("click",()=>openEventDialog(null,cell.dataset.date)));
}
function renderUpcoming(events, universities) {
  const list=events.filter(e=>e.date>=todayISO()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  $("upcomingList").classList.toggle("empty",!list.length);
  $("upcomingList").innerHTML=list.length?list.map(e=>{
    const uni=universities.find(u=>u.id===e.universityId);
    return `<div class="compact-item"><div class="date-box">${formatDate(e.date)}</div><div><strong>${escapeHTML(e.title)}</strong><small>${escapeHTML(uni?.name||e.type||"일정")}</small></div></div>`;
  }).join(""):"등록된 일정이 없어요.";
}
function renderDashboardUniversities(universities) {
  $("dashboardUniversities").classList.toggle("empty",!universities.length);
  $("dashboardUniversities").innerHTML=universities.length?universities.slice(0,12).map(u=>`<span class="chip">${escapeHTML(u.name)}</span>`).join(""):"아직 추가한 대학이 없어요.";
}
function renderUniversities(universities) {
  const el=$("universityList");
  el.classList.toggle("empty-state",!universities.length);
  if(!universities.length){el.textContent="아직 등록한 대학이 없어요.";return;}
  el.innerHTML=universities.sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(u=>`
    <article class="university-card">
      <div class="card-top"><div><h3>${escapeHTML(u.name)}</h3><div class="subline">${escapeHTML(u.department||"학과 미입력")}</div></div><span class="status">${escapeHTML(u.status||"관심")}</span></div>
      <div class="memo-preview">${escapeHTML(u.memo||"대학별 메모가 없습니다.")}</div>
      <div class="card-actions"><button class="small-btn" data-edit-uni="${u.id}">수정</button><button class="small-btn delete" data-delete-uni="${u.id}">삭제</button></div>
    </article>`).join("");
  el.querySelectorAll("[data-edit-uni]").forEach(b=>b.onclick=()=>editUniversity(b.dataset.editUni));
  el.querySelectorAll("[data-delete-uni]").forEach(b=>b.onclick=()=>deleteUniversity(b.dataset.deleteUni));
}
function renderEvents(events, universities) {
  const uniFilter=$("eventUniversityFilter").value, typeFilter=$("eventTypeFilter").value;
  const filtered=events.filter(e=>(!uniFilter||e.universityId===uniFilter)&&(!typeFilter||e.type===typeFilter)).sort((a,b)=>a.date.localeCompare(b.date));
  const el=$("eventList");el.classList.toggle("empty-state",!filtered.length);
  if(!filtered.length){el.textContent="조건에 맞는 일정이 없어요.";return;}
  el.innerHTML=filtered.map(e=>{
    const uni=universities.find(u=>u.id===e.universityId);
    return `<article class="event-card"><div><h3>${escapeHTML(e.title)}</h3><div class="subline">${formatDate(e.date)} ${e.time?`· ${escapeHTML(e.time)}`:""}</div><div class="event-meta"><span class="tag">${escapeHTML(e.type||"기타")}</span>${uni?`<span class="tag">${escapeHTML(uni.name)}</span>`:""}</div>${e.memo?`<p>${escapeHTML(e.memo)}</p>`:""}</div><div class="card-actions"><button class="small-btn" data-edit-event="${e.id}">수정</button><button class="small-btn delete" data-delete-event="${e.id}">삭제</button></div></article>`;
  }).join("");
  el.querySelectorAll("[data-edit-event]").forEach(b=>b.onclick=()=>editEvent(b.dataset.editEvent));
  el.querySelectorAll("[data-delete-event]").forEach(b=>b.onclick=()=>deleteEvent(b.dataset.deleteEvent));
}
function updateUniversityOptions(universities) {
  const options=universities.map(u=>`<option value="${u.id}">${escapeHTML(u.name)}</option>`).join("");
  $("eventUniversity").innerHTML=`<option value="">선택 안 함</option>${options}`;
  const old=$("eventUniversityFilter").value;
  $("eventUniversityFilter").innerHTML=`<option value="">전체 대학</option>${options}`;
  $("eventUniversityFilter").value=old;
}
function showView(name) {
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===name));
  if(name==="dashboard") refresh();
}
function openUniversityDialog() {
  $("universityForm").reset();$("universityId").value="";$("universityDialogTitle").textContent="대학 추가";$("universityDialog").showModal();
}
async function editUniversity(id) {
  const u=(await getAll("universities")).find(x=>x.id===id);if(!u)return;
  $("universityId").value=u.id;$("universityName").value=u.name;$("universityDepartment").value=u.department||"";$("universityStatus").value=u.status||"관심";$("universityMemo").value=u.memo||"";
  $("universityDialogTitle").textContent="대학 수정";$("universityDialog").showModal();
}
async function saveUniversity(ev) {
  ev.preventDefault();
  const name=$("universityName").value.trim();if(!name){showToast("대학명을 입력해 주세요.");return;}
  const id=$("universityId").value||makeId();
  await put("universities",{id,name,department:$("universityDepartment").value.trim(),status:$("universityStatus").value,memo:$("universityMemo").value.trim(),updatedAt:new Date().toISOString()});
  $("universityDialog").close();await refresh();showToast("대학 정보가 저장됐어요.");
}
async function deleteUniversity(id) {
  if(!confirm("이 대학을 삭제할까요? 연결된 일정은 삭제되지 않고 대학 연결만 유지되지 않을 수 있습니다."))return;
  await remove("universities",id);await refresh();showToast("대학을 삭제했어요.");
}
function openEventDialog(id=null,date=todayISO()) {
  $("eventForm").reset();$("eventId").value="";$("eventDate").value=date;$("eventDialogTitle").textContent="일정 추가";
  if(id) editEvent(id); else $("eventDialog").showModal();
}
async function editEvent(id) {
  const e=(await getAll("events")).find(x=>x.id===id);if(!e)return;
  $("eventId").value=e.id;$("eventTitle").value=e.title;$("eventDate").value=e.date;$("eventTime").value=e.time||"";$("eventType").value=e.type||"기타";$("eventUniversity").value=e.universityId||"";$("eventMemo").value=e.memo||"";
  $("eventDialogTitle").textContent="일정 수정";$("eventDialog").showModal();
}
async function saveEvent(ev) {
  ev.preventDefault();
  const title=$("eventTitle").value.trim(),date=$("eventDate").value;if(!title||!date){showToast("일정명과 날짜를 입력해 주세요.");return;}
  const id=$("eventId").value||makeId();
  await put("events",{id,title,date,time:$("eventTime").value,type:$("eventType").value,universityId:$("eventUniversity").value,memo:$("eventMemo").value.trim(),updatedAt:new Date().toISOString()});
  $("eventDialog").close();await refresh();showToast("일정이 저장됐어요.");
}
async function deleteEvent(id) {
  if(!confirm("이 일정을 삭제할까요?"))return;
  await remove("events",id);await refresh();showToast("일정을 삭제했어요.");
}
async function saveGlobalNote() {
  $("noteSaveState").textContent="저장 중…";
  await put("settings",{key:"globalNote",value:$("globalNote").value,updatedAt:new Date().toISOString()});
  $("noteSaveState").textContent="저장됨";
}
let noteDebounce;
function downloadJSON(data,filename) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
async function exportData() {
  const data=await allData();downloadJSON(data,`japan-planner-backup-${todayISO()}.json`);showToast("백업 파일을 만들었어요.");
}
async function restoreData(file) {
  try {
    const data=JSON.parse(await file.text());
    if(data.schemaVersion!==1||!Array.isArray(data.universities)||!Array.isArray(data.events)||typeof data.globalNote!=="string")throw new Error("백업 파일 형식이 올바르지 않습니다.");
    if(!confirm(`대학 ${data.universities.length}개, 일정 ${data.events.length}개를 복원합니다.\n현재 저장된 데이터는 백업 파일의 내용으로 교체됩니다. 계속할까요?`))return;
    await clearStore("universities");await clearStore("events");
    for(const u of data.universities)await put("universities",u);
    for(const e of data.events)await put("events",e);
    await put("settings",{key:"globalNote",value:data.globalNote});
    await refresh();showToast("백업 데이터를 복원했어요.");
  } catch(err){alert(`복원 실패: ${err.message}`);}
  finally{$("restoreInput").value="";}
}
async function clearAll() {
  if(!confirm("정말 모든 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다."))return;
  if(!confirm("마지막 확인입니다. 삭제 전에 백업 파일을 저장했나요?"))return;
  await Promise.all([clearStore("universities"),clearStore("events"),clearStore("settings")]);await refresh();showToast("모든 데이터를 삭제했어요.");
}
function bindEvents() {
  // Closing a dialog must NEVER submit its enclosing form or trigger required-field validation.
  document.querySelectorAll("[data-close-dialog]").forEach(button=>{
    button.type = "button";
    button.addEventListener("click",(event)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const dialog=$(button.dataset.closeDialog);
      if(dialog?.open) dialog.close();
    }, true);
  });
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showView(t.dataset.view));
  document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>showView(b.dataset.goto));
  $("addUniversityBtn").onclick=openUniversityDialog;
  $("addEventBtn").onclick=()=>openEventDialog();
  $("addEventTop").onclick=()=>openEventDialog();
  $("universityForm").addEventListener("submit",saveUniversity);
  $("eventForm").addEventListener("submit",saveEvent);
  $("prevMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);getAll("events").then(renderCalendar);};
  $("nextMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);getAll("events").then(renderCalendar);};
  $("todayBtn").onclick=()=>{calendarDate=new Date();getAll("events").then(renderCalendar);};
  $("eventUniversityFilter").onchange=()=>Promise.all([getAll("events"),getAll("universities")]).then(([e,u])=>renderEvents(e,u));
  $("eventTypeFilter").onchange=()=>Promise.all([getAll("events"),getAll("universities")]).then(([e,u])=>renderEvents(e,u));
  $("globalNote").addEventListener("input",()=>{clearTimeout(noteDebounce);noteDebounce=setTimeout(saveGlobalNote,350);});
  $("backupBtn").onclick=exportData;$("exportBtn").onclick=exportData;
  $("restoreInput").onchange=e=>{if(e.target.files[0])restoreData(e.target.files[0]);};
  $("clearBtn").onclick=clearAll;
}
async function init() {
  try {
    db=await openDB();
    bindEvents();
    await refresh();
    $("storageStatus").textContent="IndexedDB 저장소 사용 가능 · 현재 기기에 로컬 저장 중";
    if("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    }
  } catch(err) {
    console.error(err);
    alert("로컬 데이터 저장소를 열지 못했습니다. Safari에서 최신 버전으로 다시 접속해 주세요.");
  }
}
init();
