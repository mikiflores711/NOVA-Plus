(()=>{
'use strict';
const cfg=window.NOVA_ADS_CONFIG||{};
const bannerCfg=cfg.banners||{};
const prerollCfg=cfg.preroll||{};

function recreateScripts(root){
  root.querySelectorAll('script').forEach(old=>{
    const s=document.createElement('script');
    [...old.attributes].forEach(a=>s.setAttribute(a.name,a.value));
    s.text=old.textContent;
    old.replaceWith(s);
  });
}

function renderBanner(container){
  if(!cfg.enabled||!bannerCfg.enabled||!bannerCfg.html||!container||container.dataset.adRendered==='1')return false;
  container.dataset.adRendered='1';
  container.classList.add('nova-ad-slot');
  container.innerHTML='<div class="nova-ad-label-inline">Publicidad</div><div class="nova-ad-content"></div>';
  const content=container.querySelector('.nova-ad-content');
  content.innerHTML=bannerCfg.html;
  recreateScripts(content);
  return true;
}

function removeGeneratedBanners(scope=document){
  scope.querySelectorAll('[data-nova-generated-ad="1"]').forEach(el=>el.remove());
}

function placeHomeBanners(){
  if(!document.querySelector('.hero'))return;
  removeGeneratedBanners(document);
  const every=Math.max(1,Number(bannerCfg.homeEverySections)||1);
  [...document.querySelectorAll('.section')].forEach((section,i)=>{
    if((i+1)%every!==0)return;
    const slot=document.createElement('div');
    slot.dataset.novaGeneratedAd='1';
    slot.dataset.adPlacement=`home-${i+1}`;
    if(renderBanner(slot))section.after(slot);
  });
}

function placeCatalogBanners(){
  const grid=document.getElementById('catalogGrid');
  if(!grid)return;
  grid.querySelectorAll('[data-nova-generated-ad="1"]').forEach(el=>el.remove());
  const cards=[...grid.children].filter(el=>!el.matches('[data-nova-generated-ad]'));
  const every=Math.max(1,Number(bannerCfg.catalogEveryCards)||20);
  cards.forEach((card,i)=>{
    if((i+1)%every!==0)return;
    const slot=document.createElement('div');
    slot.className='catalog-ad';
    slot.dataset.novaGeneratedAd='1';
    slot.dataset.adPlacement=`catalog-${i+1}`;
    if(renderBanner(slot))card.after(slot);
  });
}

function placeDetailBanners(){
  const isMovie=document.body.classList.contains('detail-movie');
  const isSeries=document.body.classList.contains('detail-series');
  document.querySelectorAll('[data-ad-for]').forEach(slot=>{
    const forType=slot.dataset.adFor;
    const show=(forType==='all')||(forType==='movie'&&isMovie)||(forType==='series'&&isSeries);
    slot.hidden=!show;
    if(show)renderBanner(slot);
  });
}

function placeBanners(){
  if(!cfg.enabled||!bannerCfg.enabled)return;
  placeHomeBanners();
  placeCatalogBanners();
  placeDetailBanners();
}

function loadIma(){
  return new Promise((resolve,reject)=>{
    if(window.google?.ima)return resolve();
    const existing=document.querySelector('script[data-nova-ima]');
    if(existing){
      if(existing.dataset.loaded==='1')return resolve();
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src='https://imasdk.googleapis.com/js/sdkloader/ima3.js';
    s.async=true;
    s.dataset.novaIma='1';
    s.onload=()=>{s.dataset.loaded='1';resolve()};
    s.onerror=reject;
    document.head.appendChild(s);
  });
}

let prerollPromise=null;
async function playPreroll(){
  if(!cfg.enabled||!prerollCfg.enabled||!prerollCfg.vastTagUrl)return {shown:false};
  if(prerollPromise)return prerollPromise;
  prerollPromise=new Promise(async resolve=>{
    const overlay=document.createElement('div');
    overlay.className='nova-preroll';
    overlay.innerHTML='<div class="nova-preroll-stage"><video playsinline muted></video><div class="nova-ima-container"></div><div class="nova-ad-label">Publicidad</div><div class="nova-ad-wait">El contenido comenzará al finalizar el anuncio</div></div>';
    document.body.appendChild(overlay);
    const video=overlay.querySelector('video');
    const adContainer=overlay.querySelector('.nova-ima-container');
    let done=false,adsManager=null;
    const finish=result=>{
      if(done)return;
      done=true;
      try{adsManager?.destroy()}catch{}
      overlay.remove();
      prerollPromise=null;
      resolve(result);
    };
    const timeout=setTimeout(()=>finish({shown:true,timeout:true}),Math.max(8,Number(prerollCfg.maxWaitSeconds)||25)*1000);
    try{
      await loadIma();
      const display=new google.ima.AdDisplayContainer(adContainer,video);
      display.initialize();
      const loader=new google.ima.AdsLoader(display);
      loader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR,e=>{
        clearTimeout(timeout);
        console.warn('VAST:',e.getError());
        finish({shown:true,error:true});
      },false);
      loader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,e=>{
        adsManager=e.getAdsManager(video);
        const end=()=>{clearTimeout(timeout);finish({shown:true})};
        [google.ima.AdEvent.Type.ALL_ADS_COMPLETED,google.ima.AdEvent.Type.COMPLETE,google.ima.AdEvent.Type.SKIPPED].forEach(type=>adsManager.addEventListener(type,end));
        try{
          adsManager.init(Math.max(320,window.innerWidth),Math.max(180,window.innerHeight),google.ima.ViewMode.NORMAL);
          adsManager.start();
        }catch(err){clearTimeout(timeout);console.warn('VAST start:',err);finish({shown:true,error:true})}
      },false);
      const request=new google.ima.AdsRequest();
      request.adTagUrl=prerollCfg.vastTagUrl;
      request.linearAdSlotWidth=Math.max(320,window.innerWidth);
      request.linearAdSlotHeight=Math.max(180,window.innerHeight);
      request.nonLinearAdSlotWidth=Math.max(320,window.innerWidth);
      request.nonLinearAdSlotHeight=Math.max(90,Math.round(window.innerHeight/3));
      loader.requestAds(request);
    }catch(err){
      clearTimeout(timeout);
      console.warn('IMA:',err);
      finish({shown:true,error:true});
    }
  });
  return prerollPromise;
}

window.NOVA_ADS={renderBanner,placeBanners,refresh:placeBanners,playPreroll};
window.addEventListener('DOMContentLoaded',()=>setTimeout(placeBanners,900));

const catalog=document.getElementById('catalogGrid');
if(catalog){
  let timer;
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(placeCatalogBanners,120)}).observe(catalog,{childList:true});
}
})();
