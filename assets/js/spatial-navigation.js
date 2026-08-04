(()=>{
'use strict';
const STORAGE_PREFIX='nova-focus:';
const REMOTE_KEYS=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','Backspace','GoBack','BrowserBack']);
const INTERACTIVE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),.channel-row,.channel-item';
const isEditable=el=>el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable);
const visible=el=>{if(!el||!el.isConnected)return false;const st=getComputedStyle(el);if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>1&&r.height>1};
const list=()=>[...document.querySelectorAll(INTERACTIVE)].filter(visible);
const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
function keyFor(el,index){if(!el)return'';return el.dataset.focusKey||el.id||el.getAttribute('href')||el.getAttribute('data-id')||el.getAttribute('aria-label')||`${el.tagName}:${index}`}
function prepare(){list().forEach((el,i)=>{if(!el.hasAttribute('tabindex')&&!['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(el.tagName))el.tabIndex=0;if(!el.dataset.focusKey)el.dataset.focusKey=keyFor(el,i)})}
function saveFocus(el=document.activeElement){if(!el||el===document.body)return;sessionStorage.setItem(STORAGE_PREFIX+location.pathname+location.search,el.dataset.focusKey||'')}
function restore(){prepare();const saved=sessionStorage.getItem(STORAGE_PREFIX+location.pathname+location.search);let target=saved?[...document.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===saved&&visible(el)):null;if(!target)target=list()[0];if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'})}}
function candidate(direction,current){const els=list().filter(el=>el!==current);if(!current||!visible(current))return els[0];const cr=current.getBoundingClientRect(),c=center(cr);let best=null,bestScore=Infinity;for(const el of els){const r=el.getBoundingClientRect(),p=center(r),dx=p.x-c.x,dy=p.y-c.y;let primary,secondary,valid=false;if(direction==='ArrowRight'){valid=dx>8;primary=dx;secondary=Math.abs(dy)}else if(direction==='ArrowLeft'){valid=dx<-8;primary=-dx;secondary=Math.abs(dy)}else if(direction==='ArrowDown'){valid=dy>8;primary=dy;secondary=Math.abs(dx)}else{valid=dy<-8;primary=-dy;secondary=Math.abs(dx)}if(!valid)continue;const overlap=direction==='ArrowLeft'||direction==='ArrowRight'?Math.max(0,Math.min(cr.bottom,r.bottom)-Math.max(cr.top,r.top)):Math.max(0,Math.min(cr.right,r.right)-Math.max(cr.left,r.left));const score=primary+(secondary*2.35)-(overlap*.55);if(score<bestScore){bestScore=score;best=el}}return best}
function move(direction){prepare();const current=document.activeElement;const next=candidate(direction,current);if(!next)return;next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});saveFocus(next)}
function tvDetected(){const ua=navigator.userAgent||'';return /Android TV|Google TV|AFT|Fire TV|Roku|Tizen|Web0S|WebOS|NetCast|HbbTV|VIDAA|BRAVIA|SmartTV|SMART-TV|TV Safari/i.test(ua)}
function setMode(mode){document.documentElement.dataset.navigationMode=mode;localStorage.setItem('nova-navigation-mode',mode)}
const requested=localStorage.getItem('nova-navigation-mode')||'mobile';document.documentElement.dataset.deviceClass=tvDetected()?'tv':(matchMedia('(pointer:coarse)').matches?'touch':'desktop');if(!document.documentElement.dataset.navigationMode)document.documentElement.dataset.navigationMode=requested;
window.NOVA_NAV={setMode,prepare,restore,move};
addEventListener('keydown',e=>{if(document.documentElement.dataset.navigationMode!=='focus')return;if(!REMOTE_KEYS.has(e.key))return;document.documentElement.classList.add('remote-navigation');if(isEditable(document.activeElement)&&!['Escape','GoBack','BrowserBack'].includes(e.key))return;if(e.key.startsWith('Arrow')){e.preventDefault();move(e.key);return}if(['GoBack','BrowserBack'].includes(e.key)||(e.key==='Backspace'&&!isEditable(document.activeElement))){e.preventDefault();history.length>1?history.back():location.assign(location.pathname.includes('/tv/')?'../index.html':'index.html');return}if(e.key==='Escape'){const close=[...document.querySelectorAll('.open [aria-label="Cerrar"],.open .dialog-close,.open .modal-close,.player-close')].find(visible);if(close){e.preventDefault();close.click()}}},true);
addEventListener('focusin',e=>{if(e.target.matches?.(INTERACTIVE)){saveFocus(e.target);e.target.scrollIntoView({block:'nearest',inline:'nearest'})}});
addEventListener('click',e=>{const t=e.target.closest?.(INTERACTIVE);if(t)saveFocus(t)},true);
addEventListener('beforeunload',()=>saveFocus());
new MutationObserver(()=>prepare()).observe(document.documentElement,{childList:true,subtree:true});
addEventListener('DOMContentLoaded',()=>setTimeout(restore,120));
})();