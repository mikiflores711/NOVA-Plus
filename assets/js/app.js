(async()=>{
'use strict';
const API=String(window.WMP_CONFIG?.reportApiUrl||'https://watch-movies-plus-api.mikimc-business.workers.dev').replace(/\/$/,'');
async function getContent(){try{const r=await fetch(API+'/api/content',{cache:'no-store'});const j=await r.json();if(r.ok&&j.ok&&Array.isArray(j.items))return j.items}catch(e){console.warn('Catálogo Cloudflare no disponible; se usa respaldo local.',e)}return window.WMP_CONTENT||[]}
const all=(await getContent()).filter(x=>x&&x.published!==false);window.WMP_RUNTIME_CONTENT=all;
const favKey='wmp_favorites_v3';
const favs=()=>{try{return new Set(JSON.parse(localStorage.getItem(favKey)||'[]'))}catch{return new Set()}};
const save=s=>localStorage.setItem(favKey,JSON.stringify([...s]));
const href=x=>`detalle.html?id=${encodeURIComponent(x.id)}`;
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const releaseDate=x=>String(x.releaseDate||x.release_date||x.firstAirDate||x.first_air_date||x.date||'').slice(0,10);
const dateValue=x=>{const d=releaseDate(x);if(/^\d{4}-\d{2}-\d{2}$/.test(d)){const t=Date.parse(d+'T00:00:00Z');if(Number.isFinite(t))return t}return Number(x.year||0)*31557600000};
const sortNewest=list=>[...list].sort((a,b)=>dateValue(b)-dateValue(a)||Number(b.sortOrder||0)-Number(a.sortOrder||0)||String(a.title||'').localeCompare(String(b.title||''),'es'));
const formatDate=x=>{const d=releaseDate(x);if(/^\d{4}-\d{2}-\d{2}$/.test(d)){const [y,m,day]=d.split('-');return `${day}/${m}/${y}`}return x.year?String(x.year):''};
const hasGenre=(x,g)=>normalize(x.genre).includes(normalize(g));
const typeLabel=x=>x.type==='tv'?'Serie':'Película';
function displayYear(x){const d=releaseDate(x);return /^\d{4}-/.test(d)?d.slice(0,4):String(x.year||'')}
function card(x){const a=document.createElement('article');a.className='card';const active=favs().has(x.id);const year=displayYear(x);a.innerHTML=`<a class="card-link" href="${href(x)}" data-focus-label="${String(x.title||'').replace(/"/g,'&quot;')}"><div class="poster"><img src="${x.poster||''}" alt="${x.title||''}" loading="lazy">${year?`<span class="poster-year">${year}</span>`:''}</div><h3 title="${String(x.title||'').replace(/"/g,'&quot;')}">${x.title||''}</h3></a><button class="card-favorite ${active?'active':''}" aria-label="${active?'Quitar de favoritos':'Agregar a favoritos'}"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"></path></svg></button>`;a.querySelector('button').onclick=e=>{e.preventDefault();const s=favs();s.has(x.id)?s.delete(x.id):s.add(x.id);save(s);renderFavorites();renderHomeRails();renderCatalog()};return a}
function fill(el,list,limit=Infinity){if(!el)return;el.innerHTML='';list.slice(0,limit).forEach(x=>el.appendChild(card(x)))}
const movies=sortNewest(all.filter(x=>x.type==='movie'));
const series=sortNewest(all.filter(x=>x.type==='tv'));
const genreSections=[['accion','Acción'],['ciencia-ficcion','Ciencia ficción'],['comedia','Comedia'],['drama','Drama'],['terror','Terror']];
function renderHomeRails(){fill(document.getElementById('movieRail'),movies,15);fill(document.getElementById('seriesRail'),series,15);for(const [slug,label] of genreSections){fill(document.getElementById(`movie-${slug}`),movies.filter(x=>hasGenre(x,label)),15);fill(document.getElementById(`series-${slug}`),series.filter(x=>hasGenre(x,label)),15)}}
let query='';
function renderCatalog(){const grid=document.getElementById('catalogGrid');if(!grid)return;const type=document.body.dataset.catalog==='tv'?'tv':'movie';let list=type==='tv'?series:movies;const params=new URLSearchParams(location.search);const category=params.get('categoria')||'';if(category)list=list.filter(x=>hasGenre(x,category.replace(/-/g,' ')));list=list.filter(x=>`${x.title} ${x.year} ${releaseDate(x)} ${x.genre}`.toLowerCase().includes(query.toLowerCase()));fill(grid,list);setTimeout(()=>window.NOVA_ADS?.refresh?.(),80);document.getElementById('empty')?.classList.toggle('hidden',list.length>0);const heading=document.getElementById('catalogTitle');if(heading)heading.textContent=category?`${type==='tv'?'Series':'Películas'} de ${category.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}`:(type==='tv'?'Series':'Películas')}
function renderFavorites(){const fg=document.getElementById('favoritesGrid');if(!fg)return;const s=favs();const list=sortNewest(all.filter(x=>s.has(x.id)));fill(fg,list);document.getElementById('favoritesEmpty')?.classList.toggle('hidden',list.length>0)}
renderHomeRails();renderCatalog();renderFavorites();setTimeout(()=>window.NOVA_ADS?.placeBanners?.(),900);
function setupHero(){const hero=document.querySelector('.hero');if(!hero)return;let featured=sortNewest(all.filter(x=>x.featured)).slice(0,7);if(featured.length<7){for(const x of sortNewest(all)){if(featured.length>=7)break;if(!featured.some(y=>y.id===x.id))featured.push(x)}}if(!featured.length)return;let index=0,timer;const bg=document.querySelector('.hero-bg'),title=document.getElementById('heroTitle'),desc=document.getElementById('heroDesc'),meta=document.getElementById('heroMeta'),play=document.getElementById('heroPlay'),info=document.getElementById('heroInfo'),dots=document.getElementById('heroDots');
const show=i=>{index=(i+featured.length)%featured.length;const x=featured[index];bg?.style.setProperty('background-image',`url("${x.backdrop||x.poster||''}")`);if(title)title.textContent=x.title||'';if(desc)desc.textContent=x.description||'';if(meta)meta.textContent=`${typeLabel(x)} · ${formatDate(x)}${x.genre?' · '+x.genre:''}`;if(play)play.href=href(x);if(info)info.href=href(x);dots?.querySelectorAll('button').forEach((b,n)=>b.classList.toggle('active',n===index))};
if(dots){dots.innerHTML=featured.map((_,i)=>`<button type="button" aria-label="Recomendación ${i+1}"></button>`).join('');dots.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{show(i);restart()})}
const restart=()=>{clearInterval(timer);timer=setInterval(()=>show(index+1),6500)};document.getElementById('heroPrev')?.addEventListener('click',()=>{show(index-1);restart()});document.getElementById('heroNext')?.addEventListener('click',()=>{show(index+1);restart()});hero.addEventListener('mouseenter',()=>clearInterval(timer));hero.addEventListener('mouseleave',restart);show(0);restart()}
setupHero();


document.getElementById('catalogSearch')?.addEventListener('input',e=>{query=e.target.value;renderCatalog()});
document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():location.assign('index.html'));
function dialog(){let o=document.getElementById('appDialog');if(o)return o;o=document.createElement('div');o.id='appDialog';o.className='app-dialog';o.innerHTML='<section class="app-dialog-card"><button class="dialog-close">×</button><div id="dialogBody"></div></section>';document.body.appendChild(o);const close=()=>o.classList.remove('open');o.querySelector('.dialog-close').onclick=close;o.onclick=e=>{if(e.target===o)close()};return o}
function settings(){
 const o=dialog();
 const current=window.NOVA_DEVICE?.getMode?.()||localStorage.getItem('nova-device-mode-v1')||'mobile';
 o.querySelector('#dialogBody').innerHTML=`<h2>Ajustes</h2>
 <div class="device-mode-panel"><h3>Modo de navegación</h3><p>Selecciona cómo vas a utilizar NOVA+.</p>
 <div class="device-mode-options">
 <button data-device-mode="mobile" class="${current==='mobile'?'active':''}"><strong>📱 Móvil / Tablet / PC</strong><small>Control táctil o mouse, sin botones de desplazamiento.</small></button>
 <button data-device-mode="tv" class="${current==='tv'?'active':''}"><strong>📺 Smart TV</strong><small>Botones grandes para desplazar carruseles, catálogos y listas.</small></button>
 </div></div>
 <div class="settings-menu"><button id="installNovaApp" type="button"><strong>Instalar NOVA+</strong><small>Agregar el icono a la pantalla de inicio.</small></button><button data-info="about">Quiénes somos</button><button data-info="legal">Aviso legal</button><button data-info="terms">Términos y condiciones</button></div><div id="settingsText" class="settings-text hidden"></div>`;
 o.classList.add('open');
 o.querySelectorAll('[data-device-mode]').forEach(b=>b.onclick=()=>{window.NOVA_DEVICE?.setMode?.(b.dataset.deviceMode);o.querySelectorAll('[data-device-mode]').forEach(x=>x.classList.toggle('active',x===b));});
 const installButton=o.querySelector('#installNovaApp');
 if(installButton){
  const standalone=window.NOVA_PWA?.isStandalone?.();
  if(standalone){installButton.disabled=true;installButton.innerHTML='<strong>NOVA+ instalada</strong><small>Ya se está ejecutando como aplicación.</small>';}
  installButton.onclick=async()=>{
   const result=await window.NOVA_PWA?.install?.();
   if(!result?.available){
    const box=o.querySelector('#settingsText');
    box.innerHTML='<h3>Instalar NOVA+</h3><p>En Android usa el menú del navegador y elige <b>Instalar aplicación</b> o <b>Agregar a pantalla de inicio</b>. En iPhone o iPad pulsa <b>Compartir</b> y después <b>Agregar a inicio</b>.</p>';box.classList.remove('hidden');
   }
  };
 }
 const texts={about:'<h3>Quiénes somos</h3><p>NOVA+ es un sitio de entretenimiento pensado para organizar y presentar películas, series y TV en vivo en una interfaz adaptable.</p>',legal:'<h3>Aviso legal</h3><p>Los nombres, imágenes, personajes y obras pertenecen a sus respectivos titulares. Si consideras que algún contenido debe revisarse, utiliza el botón de reporte disponible en cada ficha.</p>',terms:'<h3>Términos y condiciones</h3><p>Al utilizar este sitio aceptas hacerlo responsablemente y conforme a las leyes aplicables. La disponibilidad del contenido puede cambiar sin previo aviso.</p>'};
 o.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>{const box=o.querySelector('#settingsText');box.innerHTML=texts[b.dataset.info];box.classList.remove('hidden');o.querySelectorAll('[data-info]').forEach(x=>x.classList.toggle('active',x===b))})
}
document.querySelectorAll('[data-settings]').forEach(b=>b.onclick=settings);
})();
