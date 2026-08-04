(()=>{
  'use strict';
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;document.documentElement.classList.add('pwa-installable');window.dispatchEvent(new CustomEvent('nova:pwa-installable'));});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;document.documentElement.classList.remove('pwa-installable');localStorage.setItem('nova-pwa-installed','1');});
  window.NOVA_PWA={
    canInstall:()=>Boolean(deferredPrompt),
    install:async()=>{if(!deferredPrompt)return {available:false};deferredPrompt.prompt();const choice=await deferredPrompt.userChoice;deferredPrompt=null;document.documentElement.classList.remove('pwa-installable');return {available:true,outcome:choice.outcome};},
    isStandalone:()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true
  };
  if('serviceWorker' in navigator && location.protocol==='https:') window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(err=>console.warn('Service worker:',err)));
})();
