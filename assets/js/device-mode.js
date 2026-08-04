(()=>{
'use strict';
const KEY='nova-device-mode-v1';
const root=document.documentElement;
function autoMode(){return matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0?'mobile':'mobile'}
function preference(){const v=localStorage.getItem(KEY);return ['mobile','tv'].includes(v)?v:'mobile'}
function apply(mode,{save=true}={}){
  const value=['mobile','tv'].includes(mode)?mode:autoMode();
  root.dataset.deviceMode=value;
  root.dataset.navigationMode=value;
  if(save)localStorage.setItem(KEY,value);
  document.dispatchEvent(new CustomEvent('nova:device-mode',{detail:{mode:value}}));
  requestAnimationFrame(installControls);
  return value;
}
function scrollAmount(el,vertical=false){return Math.max((vertical?el.clientHeight:el.clientWidth)*.82,vertical?320:280)}
function makeButton(cls,label,html,handler){const b=document.createElement('button');b.type='button';b.className=cls;b.setAttribute('aria-label',label);b.innerHTML=html;b.addEventListener('click',handler);return b}
function wrapHorizontal(el){
  if(!el||el.dataset.novaScrollReady)return;
  el.dataset.novaScrollReady='1';
  let shell=el.parentElement;
  if(!shell?.classList.contains('nova-scroll-shell')){
    shell=document.createElement('div');shell.className='nova-scroll-shell';el.parentNode.insertBefore(shell,el);shell.appendChild(el);
  }
  const prev=makeButton('nova-scroll-button nova-prev','Desplazar a la izquierda','&#10094;',()=>el.scrollBy({left:-scrollAmount(el),behavior:'smooth'}));
  const next=makeButton('nova-scroll-button nova-next','Desplazar a la derecha','&#10095;',()=>el.scrollBy({left:scrollAmount(el),behavior:'smooth'}));
  shell.append(prev,next);
}
function installCatalogControls(){
  const grid=document.querySelector('.catalog-grid');
  if(!grid||document.querySelector('.nova-catalog-controls'))return;
  const box=document.createElement('div');box.className='nova-catalog-controls';
  box.append(
    makeButton('nova-page-button','Subir en el catálogo','↑',()=>scrollBy({top:-Math.max(innerHeight*.78,480),behavior:'smooth'})),
    makeButton('nova-page-button','Bajar en el catálogo','↓',()=>scrollBy({top:Math.max(innerHeight*.78,480),behavior:'smooth'}))
  );
  document.body.appendChild(box);
}
function installControls(){
  document.querySelectorAll('.rail,.recommend-rail,.cast-grid,.episode-rail').forEach(wrapHorizontal);
  installCatalogControls();
}
window.NOVA_DEVICE={getMode:()=>root.dataset.deviceMode||preference(),setMode:mode=>apply(mode),installControls};
apply(preference(),{save:false});
addEventListener('DOMContentLoaded',installControls);
new MutationObserver(()=>requestAnimationFrame(installControls)).observe(document.documentElement,{childList:true,subtree:true});
})();