(()=>{
'use strict';
const cfg=window.NOVA_ADS_CONFIG||{};
const bannerCfg=cfg.banners||{};
const prerollCfg=cfg.preroll||{};

function createBannerFrame(){
  const frame=document.createElement('iframe');
  frame.className='nova-ad-frame';
  frame.width='300';
  frame.height='250';
  frame.setAttribute('title','Publicidad');
  frame.setAttribute('scrolling','no');
  frame.setAttribute('frameborder','0');
  frame.setAttribute('loading','lazy');
  frame.setAttribute('referrerpolicy','no-referrer-when-downgrade');
  frame.setAttribute('sandbox','allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
  const adHtml=String(bannerCfg.html||'');
  frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer-when-downgrade"><style>html,body{margin:0;width:300px;height:250px;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}iframe,img,video{max-width:300px!important;max-height:250px!important}</style></head><body>${adHtml}</body></html>`;
  return frame;
}

function renderBanner(container){
  if(!cfg.enabled||!bannerCfg.enabled||!bannerCfg.html||!container||container.dataset.adRendered==='1')return false;
  container.dataset.adRendered='1';
  container.classList.add('nova-ad-slot');
  container.replaceChildren();
  const label=document.createElement('div');
  label.className='nova-ad-label-inline';
  label.textContent='Publicidad';
  const content=document.createElement('div');
  content.className='nova-ad-content';
  content.appendChild(createBannerFrame());
  container.append(label,content);
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

// Precarga el SDK para que la inicialización ocurra dentro del clic del usuario.
if(cfg.enabled&&prerollCfg.enabled&&(prerollCfg.imaTagUrl||prerollCfg.vastTagUrl)){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>loadIma().catch(()=>{}),{once:true});
  }else{
    loadIma().catch(()=>{});
  }
}

let prerollPromise=null;
async function playPreroll(){
  const adTag=String(prerollCfg.imaTagUrl||prerollCfg.vastTagUrl||'').trim();
  if(!cfg.enabled||!prerollCfg.enabled||!adTag)return {shown:false,reason:'disabled'};
  if(prerollPromise)return prerollPromise;

  prerollPromise=new Promise(async resolve=>{
    let overlay=null;
    let adsManager=null;
    let adsLoader=null;
    let done=false;
    let visible=false;
    let startTimer=null;
    let hardTimer=null;

    const finish=result=>{
      if(done)return;
      done=true;
      clearTimeout(startTimer);
      clearTimeout(hardTimer);
      try{adsManager?.destroy()}catch{}
      try{adsLoader?.destroy?.()}catch{}
      overlay?.remove();
      prerollPromise=null;
      resolve(result);
    };

    const showOverlay=()=>{
      if(visible||!overlay)return;
      visible=true;
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden','false');
    };

    try{
      await loadIma();
      if(!window.google?.ima)throw new Error('Google IMA no disponible');

      overlay=document.createElement('div');
      overlay.className='nova-preroll';
      overlay.setAttribute('aria-hidden','true');
      overlay.innerHTML='<div class="nova-preroll-stage"><video class="nova-ad-content-video" playsinline></video><div class="nova-ima-container"></div><div class="nova-ad-label">Publicidad</div><div class="nova-ad-wait">El contenido comenzará al finalizar el anuncio</div></div>';
      document.body.appendChild(overlay);

      const contentVideo=overlay.querySelector('.nova-ad-content-video');
      const adContainer=overlay.querySelector('.nova-ima-container');
      const display=new google.ima.AdDisplayContainer(adContainer,contentVideo);

      // Debe ejecutarse como consecuencia directa del clic del usuario.
      display.initialize();
      adsLoader=new google.ima.AdsLoader(display);

      adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR,event=>{
        console.warn('HilltopAds VAST:',event.getError());
        finish({shown:false,error:true,code:event.getError()?.getErrorCode?.()});
      },false);

      adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,event=>{
        try{
          const settings=new google.ima.AdsRenderingSettings();
          settings.restoreCustomPlaybackStateOnAdBreakComplete=true;
          adsManager=event.getAdsManager(contentVideo,settings);

          const complete=()=>finish({shown:visible,completed:true});
          const failed=event=>{
            console.warn('HilltopAds VAST manager:',event.getError?.()||event);
            finish({shown:visible,error:true});
          };

          adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR,failed);
          [
            google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
            google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
            google.ima.AdEvent.Type.COMPLETE,
            google.ima.AdEvent.Type.SKIPPED
          ].forEach(type=>adsManager.addEventListener(type,complete));

          [google.ima.AdEvent.Type.LOADED,google.ima.AdEvent.Type.STARTED].forEach(type=>{
            adsManager.addEventListener(type,showOverlay);
          });

          const width=Math.max(320,window.innerWidth||320);
          const height=Math.max(180,window.innerHeight||180);
          adsManager.init(width,height,google.ima.ViewMode.NORMAL);
          adsManager.start();
        }catch(error){
          console.warn('HilltopAds VAST start:',error);
          finish({shown:false,error:true});
        }
      },false);

      const request=new google.ima.AdsRequest();
      request.adTagUrl=adTag;
      request.linearAdSlotWidth=Math.max(320,window.innerWidth||320);
      request.linearAdSlotHeight=Math.max(180,window.innerHeight||180);
      request.nonLinearAdSlotWidth=Math.max(320,window.innerWidth||320);
      request.nonLinearAdSlotHeight=Math.max(90,Math.round((window.innerHeight||540)/3));
      try{request.setAdWillAutoPlay(true)}catch{}
      try{request.setAdWillPlayMuted(false)}catch{}
      try{request.setContinuousPlayback(false)}catch{}

      // Si no hay inventario, continúa sin mostrar pantalla negra.
      startTimer=setTimeout(()=>finish({shown:false,timeout:true}),Math.max(8,Number(prerollCfg.initialWaitSeconds)||15)*1000);
      hardTimer=setTimeout(()=>finish({shown:visible,timeout:true}),Math.max(12,Number(prerollCfg.maxWaitSeconds)||25)*1000);
      adsLoader.requestAds(request);
    }catch(error){
      console.warn('Google IMA:',error);
      finish({shown:false,error:true});
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
