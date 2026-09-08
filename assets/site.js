const toggle=document.querySelector('.menu-toggle');
const menu=document.querySelector('#main-nav');
function closeMenu(){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Menüyü aç')}
toggle.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Menüyü kapat':'Menüyü aç')});
menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.classList.contains('open')){closeMenu();toggle.focus()}});
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el))}else{document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))}

const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-carousel]').forEach(carousel=>{
  const slides=[...carousel.querySelectorAll('.carousel-slide')];
  const dots=carousel.querySelector('.carousel-dots');
  let active=0;
  let timer=null;
  let touchStart=null;
  function show(index,userAction=false){
    active=(index+slides.length)%slides.length;
    slides.forEach((slide,i)=>{const selected=i===active;slide.hidden=!selected;slide.classList.toggle('is-active',selected);slide.setAttribute('aria-hidden',String(!selected))});
    dots.querySelectorAll('button').forEach((dot,i)=>{dot.setAttribute('aria-selected',String(i===active));dot.tabIndex=i===active?0:-1});
    if(userAction)stop();
  }
  function stop(){if(timer){clearInterval(timer);timer=null}carousel.dataset.paused='true'}
  slides.forEach((slide,i)=>{slide.setAttribute('role','group');slide.setAttribute('aria-label',`${i+1} / ${slides.length}`);const dot=document.createElement('button');dot.type='button';dot.className='carousel-dot';dot.setAttribute('role','tab');dot.setAttribute('aria-label',`${i+1}. ekranı göster`);dot.addEventListener('click',()=>show(i,true));dots.appendChild(dot)});
  carousel.querySelector('[data-carousel-prev]').addEventListener('click',()=>show(active-1,true));
  carousel.querySelector('[data-carousel-next]').addEventListener('click',()=>show(active+1,true));
  carousel.addEventListener('pointerdown',()=>stop(),{once:true});
  carousel.addEventListener('touchstart',event=>{touchStart=event.changedTouches[0].clientX;stop()},{passive:true});
  carousel.addEventListener('touchend',event=>{if(touchStart===null)return;const delta=event.changedTouches[0].clientX-touchStart;if(Math.abs(delta)>42)show(active+(delta<0?1:-1),true);touchStart=null},{passive:true});
  show(0);
  if(!reduceMotion)timer=setInterval(()=>show(active+1),4500);
});
