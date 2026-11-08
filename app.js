const form=document.getElementById('chatForm');
const input=document.getElementById('prompt');
const messages=document.getElementById('messages');
const welcome=document.getElementById('welcome');
function addBubble(text,who){const el=document.createElement('div');el.className='bubble '+who;el.textContent=text;messages.appendChild(el);el.scrollIntoView({behavior:'smooth',block:'end'});}
form.addEventListener('submit',e=>{e.preventDefault();const value=input.value.trim();if(!value)return;welcome.style.display='none';addBubble(value,'user');input.value='';addBubble('پیامت رو دریافت کردم. در این نسخه هنوز به مدل هوش مصنوعی متصل نیستم؛ مرحلهٔ بعد اتصال امن مغز رهاست.','assistant');});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
