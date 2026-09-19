"use strict";
const sb=window.supabase.createClient(window.MUSEUM_SUPABASE_URL,window.MUSEUM_SUPABASE_KEY);

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
let state={periods:[],content:{},director:{bio:"",photo_path:""},meetings:[],students:[]},currentUser=null,currentPeriod=null,activeRecorder=null,recordedAudioBlob=null;
const authOverlay=$("authOverlay"),siteHeader=$("siteHeader"),siteMain=$("siteMain"),siteFooter=$("siteFooter"),loginForm=$("loginForm"),loginError=$("loginError"),registerTab=$("registerTab"),modal=$("modal"),modalTitle=$("modalTitle"),modalForm=$("modalForm");
const isAdmin=()=>!!currentUser&&(currentUser.role==="admin"||currentUser.role==="developer"),isDev=()=>currentUser?.role==="developer";
function url(bucket,path){return path?sb.storage.from(bucket).getPublicUrl(path).data.publicUrl:""}
function media(bucket,path,type){if(!path)return "";let u=url(bucket,path);return type==="photo"?'<img class="media" loading="lazy" src="'+esc(u)+'" alt="Фото" onerror="this.style.display=\'none\'">':type==="video"?'<video class="media" controls preload="metadata" playsinline src="'+esc(u)+'"></video>':'<audio class="media" controls preload="metadata" src="'+esc(u)+'"></audio>'}
async function upload(input,bucket,folder,statusId){
  let f=$(input)?.files?.[0];
  if(!f)return null;
  return uploadBlob(f,bucket,folder,statusId);
}
function setUploadStatus(status,text,percent){
  if(!status)return;
  status.textContent=percent==null?text:(text+" "+percent+"%");
}
async function uploadBlob(f,bucket,folder,statusId){
  let status=statusId?$(statusId):null;
  let ext=(f.name?.split(".").pop()||((f.type||"application/octet-stream").split("/")[1])||"bin").toLowerCase();
  let path=folder+"/"+crypto.randomUUID()+"."+ext;
  const RESUMABLE_LIMIT=6*1024*1024;
  if(f.size>RESUMABLE_LIMIT && window.tus){
    setUploadStatus(status,"Подготовка загрузки…",0);
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw new Error("Сессия пользователя не найдена.");
    const projectRef=(window.MUSEUM_SUPABASE_URL||"").match(/^https?:\\/\\/([^.]+)\\.supabase\\.co/ )?.[1];
    if(!projectRef)throw new Error("Не удалось определить проект Supabase.");
    return await new Promise((resolve,reject)=>{
      const upload=new tus.Upload(f,{
        endpoint:"https://"+projectRef+".storage.supabase.co/storage/v1/upload/resumable",
        retryDelays:[0,3000,5000,10000,20000],
        headers:{authorization:"Bearer "+session.access_token,"x-upsert":"false"},
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        metadata:{
          bucketName:bucket,
          objectName:path,
          contentType:f.type||"application/octet-stream",
          cacheControl:"3600"
        },
        chunkSize:6*1024*1024,
        onError:error=>{
          if(status)status.textContent="";
          reject(new Error("Не удалось загрузить файл: "+(error?.message||error)));
        },
        onProgress:(uploaded,total)=>{
          let pct=Math.min(100,Math.round(uploaded/total*100));
          setUploadStatus(status,"Загрузка файла…",pct);
        },
        onSuccess:()=>{
          if(status)status.textContent="Файл загружен.";
          resolve(path);
        }
      });
      upload.findPreviousUploads().then(previous=>{
        if(previous.length)upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(reject);
    });
  }
  setUploadStatus(status,"Загрузка файла…",0);
  let r=await sb.storage.from(bucket).upload(path,f,{contentType:f.type||"application/octet-stream",cacheControl:"3600",upsert:false});
  if(r.error){if(status)status.textContent="";throw new Error("Не удалось загрузить файл: "+r.error.message);}
  if(status)status.textContent="Файл загружен.";
  return path;
}
function stopRecordingAndWait(){
  if(!activeRecorder)return Promise.resolve(recordedAudioBlob);
  return new Promise(resolve=>{
    let rec=activeRecorder.rec,oldStop=rec.onstop;
    rec.onstop=()=>{if(oldStop)oldStop();resolve(recordedAudioBlob);};
    rec.stop();
  });
}
async function toggleRecording(buttonId,statusId){
  let btn=$(buttonId),status=$(statusId);
  if(activeRecorder){await stopRecordingAndWait();return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){alert("Браузер не поддерживает запись аудио.");return}
  try{
    let stream=await navigator.mediaDevices.getUserMedia({audio:true}),chunks=[],rec=new MediaRecorder(stream);
    activeRecorder={rec,stream};recordedAudioBlob=null;
    status.textContent="Идёт запись… нажмите кнопку ещё раз для остановки.";
    btn.textContent="⏹ Остановить запись";
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    rec.onstop=()=>{
      let type=rec.mimeType||"audio/webm";
      recordedAudioBlob=new Blob(chunks,{type});
      stream.getTracks().forEach(t=>t.stop());
      activeRecorder=null;btn.textContent="🎙 Записать аудио";
      status.textContent=recordedAudioBlob.size?"Запись готова. Нажмите «Сохранить».":"Запись пустая.";
    };
    rec.start();
  }catch(e){status.textContent="Нет доступа к микрофону: "+e.message;activeRecorder=null}
}
async function db(promise,label="Операция") { const r=await promise; if(r.error) throw new Error(label+": "+r.error.message); return r; }
async function load(){let [p,e,v,d,m,s]=await Promise.all([sb.from("periods").select("*").order("sort_order"),sb.from("exhibits").select("*").order("created_at",{ascending:false}),sb.from("veterans").select("*").order("created_at",{ascending:false}),sb.from("director").select("*").eq("id",1).maybeSingle(),sb.from("meetings").select("*").order("created_at",{ascending:false}),sb.from("students").select("*").order("created_at",{ascending:false})]);let err=[p,e,v,d,m,s].map(x=>x.error).find(Boolean);if(err)throw err;state={periods:p.data||[],content:{},director:d.data||{bio:"",photo_path:""},meetings:m.data||[],students:s.data||[]};(e.data||[]).forEach(x=>(state.content[x.period_id]??={exhibits:[],veterans:[]}).exhibits.push(x));(v.data||[]).forEach(x=>(state.content[x.period_id]??={exhibits:[],veterans:[]}).veterans.push(x))}
async function refresh(){await load();renderAll()}
function showSite(){authOverlay.classList.add("hidden");siteHeader.classList.remove("hidden");siteMain.classList.remove("hidden");siteFooter.classList.remove("hidden");$("currentUser").textContent=currentUser.role==="guest"?"Гость — только просмотр":currentUser.email+" — "+(currentUser.role==="developer"?"Разработчик":"Администратор");registerTab.classList.toggle("hidden",!isDev());renderAll()}
loginForm.addEventListener("submit",async e=>{e.preventDefault();let email=$("login").value.trim(),password=$("password").value;loginError.textContent="Проверяем вход…";let btn=loginForm.querySelector("button[type=submit]");if(btn)btn.disabled=true;try{if(!email||!password)throw new Error("Введите email и пароль.");if(!window.MUSEUM_SUPABASE_URL||!window.MUSEUM_SUPABASE_KEY)throw new Error("Supabase не настроен.");console.log("[museum] login start",email);let {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw new Error("Supabase Auth: "+error.message);if(!data?.user)throw new Error("Supabase не вернул пользователя.");console.log("[museum] auth ok",data.user.id);let {data:roleRow,error:roleError}=await sb.from("user_roles").select("role").eq("user_id",data.user.id).maybeSingle();if(roleError)throw new Error("Ошибка user_roles: "+roleError.message);if(!roleRow){await sb.auth.signOut();throw new Error("Пользователь вошёл, но ему не назначена роль developer/admin.");}currentUser={id:data.user.id,email:data.user.email,role:roleRow.role};loginError.textContent="Вход выполнен, загружаем музей…";await refresh();showSite()}catch(x){console.error("[museum] login error",x);loginError.textContent="Ошибка входа: "+(x?.message||String(x))}finally{if(btn)btn.disabled=false}});
$("guestBtn").addEventListener("click",async()=>{currentUser={email:"guest",role:"guest"};try{await refresh();showSite()}catch(x){loginError.textContent="Ошибка подключения к Supabase: "+x.message}});
$("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();location.reload()});
document.querySelectorAll("button[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("button[data-tab]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".section").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.tab).classList.add("active")});
$("backPeriods").onclick=()=>{$("periodDetail").classList.remove("active");$("periodsView").classList.remove("hidden")};
function renderAll(){renderPeriods();renderDirector();renderMeetings();renderStudents();if(isDev())renderAdmins()}
function renderPeriods(){let g=$("periodGrid");g.innerHTML=state.periods.map(p=>'<article class="card period-card" data-id="'+esc(p.id)+'"><div class="period">'+esc(p.title)+'</div><div class="tag">Исторический период</div><h3>Подробнее</h3><p>Открыть экспонаты и ветеранов.</p>'+(isAdmin()?'<div class="actions"><button data-edit-period="'+p.id+'">Редактировать</button><button class="danger" data-del-period="'+p.id+'">Удалить</button></div>':"")+'</article>').join("")+(isAdmin()?'<article class="card"><div class="tag">Управление</div><h3>Добавить период</h3><button id="addPeriod">+ Новый период</button></article>':"");g.querySelectorAll(".period-card").forEach(c=>c.onclick=e=>{if(!e.target.closest("button"))openPeriod(c.dataset.id)});g.querySelectorAll("[data-edit-period]").forEach(b=>b.onclick=()=>periodForm(b.dataset.editPeriod));g.querySelectorAll("[data-del-period]").forEach(b=>b.onclick=async()=>{if(confirm("Удалить период и материалы?")){await db(sb.from("periods").delete().eq("id",b.dataset.delPeriod),"Не удалось удалить период");await refresh()}});$("addPeriod")?.addEventListener("click",()=>periodForm())}
function openPeriod(id){currentPeriod=id;$("periodsView").classList.add("hidden");$("periodDetail").classList.add("active");$("periodTitle").textContent=state.periods.find(p=>p.id===id)?.title||"";renderContent()}
function renderContent(){let g=$("contentGrid"),d=state.content[currentPeriod]||{exhibits:[],veterans:[]};g.innerHTML=["exhibits","veterans"].map(k=>{let title=k==="exhibits"?"Экспонаты":"Ветераны",items=d[k]||[];return '<div><div class="card"><div class="tag">Раздел периода</div><h3>'+title+'</h3><div class="search-row"><input type="search" id="search-'+k+'" placeholder="Поиск по названию..."></div>'+(isAdmin()?'<button data-add="'+k+'">+ Добавить</button>':"")+'</div><div id="list-'+k+'" style="margin-top:14px">'+(items.length?items.map(x=>'<article class="card searchable" data-title="'+esc((x.title||"").toLowerCase())+'"><h3>'+esc(x.title)+'</h3><p>'+esc(x.description)+'</p>'+media("museum-photos",x.photo_path,"photo")+media("museum-videos",x.video_path,"video")+media("museum-audio",x.audio_path,"audio")+(isAdmin()?'<div class="actions"><button data-edit="'+k+'" data-id="'+x.id+'">Редактировать</button><button class="danger" data-del="'+k+'" data-id="'+x.id+'">Удалить</button></div>':"")+'</article>').join(""):'<div class="empty">Пока нет материалов.</div>')+'</div></div>'}).join("");["exhibits","veterans"].forEach(k=>{$("search-"+k).oninput=function(){let q=this.value.toLowerCase();$("list-"+k).querySelectorAll(".searchable").forEach(c=>c.classList.toggle("hidden",q&&!c.dataset.title.includes(q)))}});g.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>contentForm(b.dataset.add));g.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>contentForm(b.dataset.edit,b.dataset.id));g.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Удалить материал?")){await db(sb.from(b.dataset.del).delete().eq("id",b.dataset.id),"Не удалось удалить материал");await refresh();openPeriod(currentPeriod)}})}
function openModal(t,h){modalTitle.textContent=t;modalForm.innerHTML=h;modal.classList.remove("hidden");modalForm.querySelector("[data-close]")?.addEventListener("click",()=>modal.classList.add("hidden"))}
async function contentForm(k,id){
  recordedAudioBlob=null;
  let table=k,o=(state.content[currentPeriod]?.[k]||[]).find(x=>x.id===id)||{};
  openModal(id?"Редактировать материал":"Добавить материал",'<label>Название</label><input id="fTitle" value="'+esc(o.title)+'" required><label>Описание</label><textarea id="fDesc">'+esc(o.description)+'</textarea><label>Фото</label><input id="fPhoto" type="file" accept="image/*"><label>Видео</label><input id="fVideo" type="file" accept="video/*"><label>Аудио</label><input id="fAudio" type="file" accept="audio/*"><div class="actions"><button type="button" id="recordAudio">🎙 Записать аудио</button><span id="recordStatus" class="notice"></span></div><div class="notice" id="uploadStatus"></div><div class="form-actions"><button type="button" data-close>Отмена</button><button id="saveContent" type="submit">Сохранить</button></div>');
  const form=modalForm,q=id=>form.querySelector("#"+id);
  q("recordAudio").onclick=()=>toggleRecording("recordAudio","recordStatus");
  form.onsubmit=async e=>{
    e.preventDefault();
    const save=q("saveContent"),status=q("uploadStatus");
    try{
      save.disabled=true;
      if(activeRecorder)await stopRecordingAndWait();
      let r={period_id:currentPeriod,title:q("fTitle")?.value.trim()||"",description:q("fDesc")?.value||"",photo_path:o.photo_path||null,video_path:o.video_path||null,audio_path:o.audio_path||null};
      if(!r.title)throw new Error("Введите название.");
      if(q("fPhoto")?.files?.[0])r.photo_path=await upload("fPhoto","museum-photos","exhibits/"+currentPeriod,"uploadStatus");
      if(q("fVideo")?.files?.[0])r.video_path=await upload("fVideo","museum-videos","exhibits/"+currentPeriod,"uploadStatus");
      if(q("fAudio")?.files?.[0])r.audio_path=await upload("fAudio","museum-audio","exhibits/"+currentPeriod,"uploadStatus");
      else if(recordedAudioBlob)r.audio_path=await uploadBlob(new File([recordedAudioBlob],"recording.webm",{type:recordedAudioBlob.type}),"museum-audio","exhibits/"+currentPeriod,"uploadStatus");
      status.textContent="Сохранение…";
      if(id)await db(sb.from(table).update(r).eq("id",id),"Не удалось сохранить изменения");
      else await db(sb.from(table).insert(r),"Не удалось добавить материал");
      modal.classList.add("hidden");await refresh();openPeriod(currentPeriod);
    }catch(x){status.textContent="";alert("Ошибка: "+(x?.message||x))}
    finally{save.disabled=false}
  };
}
function periodForm(id){let p=id&&state.periods.find(x=>x.id===id);openModal(id?"Редактировать период":"Новый период",'<label>Период</label><input id="fTitle" value="'+esc(p?.title||"")+'" required><div class="form-actions"><button type="button" data-close>Отмена</button><button>Сохранить</button></div>');modalForm.onsubmit=async e=>{e.preventDefault();let title=$("fTitle").value.trim();if(!title)throw new Error("Введите название периода.");if(p)await db(sb.from("periods").update({title}).eq("id",p.id),"Не удалось обновить период");else await db(sb.from("periods").insert({title,sort_order:state.periods.length}),"Не удалось добавить период");modal.classList.add("hidden");await refresh()}}
function renderDirector(){$("directorContent").innerHTML='<article class="card"><h3>Заведующий музеем</h3><p>'+esc(state.director.bio)+'</p>'+media("museum-photos",state.director.photo_path,"photo")+(isAdmin()?'<div class="actions"><button id="editDirector">Редактировать</button></div>':"")+'</article>';$("editDirector")?.addEventListener("click",directorForm)}
function directorForm(){
  openModal("Биография заведующего музеем",'<label>Биография</label><textarea id="fBio">'+esc(state.director.bio)+'</textarea><label>Фото</label><input id="fPhoto" type="file" accept="image/*"><div class="notice" id="directorStatus"></div><div class="form-actions"><button type="button" data-close>Отмена</button><button id="saveDirector" type="submit">Сохранить</button></div>');
  const form=modalForm,q=id=>form.querySelector("#"+id);
  form.onsubmit=async e=>{
    e.preventDefault();let save=q("saveDirector"),status=q("directorStatus");
    try{
      save.disabled=true;
      let photo=state.director.photo_path||null;
      if(q("fPhoto")?.files?.[0])photo=await upload("fPhoto","museum-photos","director","directorStatus");
      await db(sb.from("director").upsert({id:1,bio:q("fBio")?.value||"",photo_path:photo,updated_at:new Date().toISOString()}),"Не удалось сохранить биографию");
      modal.classList.add("hidden");await refresh();
    }catch(x){status.textContent="";alert("Ошибка: "+(x?.message||x))}
    finally{save.disabled=false}
  };
}
function renderMeetings(){let g=$("meetingsList");g.innerHTML=(isAdmin()?'<div class="toolbar"><button id="addMeeting">+ Добавить встречу</button></div>':"")+'<div class="search-row"><input type="search" id="search-meetings" placeholder="Поиск по названию..."></div>'+(state.meetings.length?state.meetings.map(x=>'<article class="card event searchable" data-title="'+esc(x.title.toLowerCase())+'"><b>'+esc(x.date)+'</b><h3>'+esc(x.title)+'</h3><p>'+esc(x.description)+'</p>'+media("museum-videos",x.video_path,"video")+(isAdmin()?'<div class="actions"><button data-edit-meeting="'+x.id+'">Редактировать</button><button class="danger" data-del-meeting="'+x.id+'">Удалить</button></div>':"")+'</article>').join(""):'<div class="empty">Встреч пока нет.</div>');$("search-meetings").oninput=function(){let q=this.value.toLowerCase();g.querySelectorAll(".searchable").forEach(c=>c.classList.toggle("hidden",q&&!c.dataset.title.includes(q)))};$("addMeeting")?.addEventListener("click",()=>meetingForm());g.querySelectorAll("[data-edit-meeting]").forEach(b=>b.onclick=()=>meetingForm(b.dataset.editMeeting));g.querySelectorAll("[data-del-meeting]").forEach(b=>b.onclick=async()=>{if(confirm("Удалить встречу?")){await db(sb.from("meetings").delete().eq("id",b.dataset.delMeeting),"Не удалось удалить встречу");await refresh()}})}
function meetingForm(id){
  let o=state.meetings.find(x=>x.id===id)||{};
  openModal(id?"Редактировать встречу":"Новая встреча",'<div class="form-row"><div><label>Дата</label><input id="fDate" value="'+esc(o.date)+'"></div><div><label>Название</label><input id="fTitle" value="'+esc(o.title)+'" required></div></div><label>Описание</label><textarea id="fDesc">'+esc(o.description)+'</textarea><label>Видео</label><input id="fVideo" type="file" accept="video/*"><div class="notice" id="meetingStatus"></div><div class="form-actions"><button type="button" data-close>Отмена</button><button id="saveMeeting" type="submit">Сохранить</button></div>');
  const form=modalForm,q=id=>form.querySelector("#"+id);
  form.onsubmit=async e=>{
    e.preventDefault();let save=q("saveMeeting"),status=q("meetingStatus");
    try{
      save.disabled=true;
      let r={date:q("fDate")?.value.trim()||"",title:q("fTitle")?.value.trim()||"",description:q("fDesc")?.value||"",video_path:o.video_path||null};
      if(!r.title)throw new Error("Введите название встречи.");
      if(q("fVideo")?.files?.[0])r.video_path=await upload("fVideo","museum-videos","meetings","meetingStatus");
      status.textContent="Сохранение…";
      if(id)await db(sb.from("meetings").update(r).eq("id",id),"Не удалось сохранить встречу");
      else await db(sb.from("meetings").insert(r),"Не удалось добавить встречу");
      modal.classList.add("hidden");await refresh();
    }catch(x){status.textContent="";alert("Ошибка: "+(x?.message||x))}
    finally{save.disabled=false}
  };
}
function renderStudents(){let g=$("studentsList");g.innerHTML=(isAdmin()?'<div class="toolbar" style="grid-column:1/-1"><button id="addStudent">+ Добавить работу</button></div>':"")+'<div class="search-row" style="grid-column:1/-1"><input type="search" id="search-students" placeholder="Поиск по названию..."></div>'+(state.students.length?state.students.map(x=>'<article class="card searchable"><div class="tag">Работа студента</div><h3>'+esc(x.title)+'</h3><p>'+esc(x.description)+'</p>'+(x.link?'<p><a href="'+esc(x.link)+'" target="_blank" rel="noopener">Открыть работу ↗</a></p>':"")+(isAdmin()?'<div class="actions"><button data-edit-student="'+x.id+'">Редактировать</button><button class="danger" data-del-student="'+x.id+'">Удалить</button></div>':"")+'</article>').join(""):'<div class="empty" style="grid-column:1/-1">Работ пока нет.</div>');$("search-students").oninput=function(){let q=this.value.toLowerCase();g.querySelectorAll(".searchable").forEach(c=>c.classList.toggle("hidden",q&&!c.querySelector("h3").textContent.toLowerCase().includes(q)))};$("addStudent")?.addEventListener("click",()=>studentForm());g.querySelectorAll("[data-edit-student]").forEach(b=>b.onclick=()=>studentForm(b.dataset.editStudent));g.querySelectorAll("[data-del-student]").forEach(b=>b.onclick=async()=>{if(confirm("Удалить работу?")){await db(sb.from("students").delete().eq("id",b.dataset.delStudent),"Не удалось удалить работу");await refresh()}})}
function studentForm(id){let o=state.students.find(x=>x.id===id)||{};openModal(id?"Редактировать работу":"Новая работа",'<label>Название</label><input id="fTitle" value="'+esc(o.title)+'" required><label>Описание</label><textarea id="fDesc">'+esc(o.description)+'</textarea><label>Ссылка на работу</label><input id="fLink" value="'+esc(o.link||"")+'"><div class="form-actions"><button type="button" data-close>Отмена</button><button>Сохранить</button></div>');modalForm.onsubmit=async e=>{e.preventDefault();let r={title:$("fTitle").value,description:$("fDesc").value,link:$("fLink").value||null};if(!r.title)throw new Error("Введите название работы.");if(id)await db(sb.from("students").update(r).eq("id",id),"Не удалось обновить работу");else await db(sb.from("students").insert(r),"Не удалось добавить работу");modal.classList.add("hidden");await refresh()}}
function renderAdmins(){let g=$("adminsList");g.innerHTML='<div class="empty">Новые администраторы создаются через Supabase Auth. Их роль автоматически назначается как admin.</div>'}
$("registerForm").addEventListener("submit",async e=>{e.preventDefault();let msg=$("registerMessage"),email=$("newAdminLogin").value.trim(),password=$("newAdminPassword").value;msg.textContent="Создание администратора…";try{let {data,error}=await sb.functions.invoke("create-admin",{body:{email,password}});if(error)throw error;if(data?.error)throw new Error(data.error);msg.textContent="Администратор создан: "+email+". Он уже может войти на сайт.";e.target.reset()}catch(x){msg.textContent="Ошибка: "+(x.message||"не удалось создать пользователя")}});
modal.onclick=e=>{if(e.target===modal)modal.classList.add("hidden")};
if(window.MUSEUM_SUPABASE_URL?.includes("YOUR-PROJECT")){loginError.textContent="Сначала настройте Supabase: supabase-config.js";$("guestBtn").disabled=true}
