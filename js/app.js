import {openDB,all,get,put,remove,getKV,setKV,replaceBackup,saveProductPhoto,supplierDefault} from './db.js';
import {renderOrderPngPages,saveBlob} from './image.js';
const VERSION='1.0.3';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateStr=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateView=s=>(s||'').replaceAll('-','/');
const fmtDateTime=s=>s?new Date(s).toLocaleString('zh-TW',{hour12:false}):'—';
const safeQty=n=>Number.isInteger(+n)&&+n>0&&+n<=99999;
const state={page:'quick',products:[],orders:[],suppliers:[],cart:[],supplier:supplierDefault,query:'',code:'',qty:1,detailCode:null,editCode:null,photoUrls:new Map(),previewOrder:null,previewBlobs:[],previewSource:'cart',draftDate:dateStr(),remark:'',busy:false,online:navigator.onLine,versionStatus:'',photoTargetCode:null,photoBusy:false};
let swReg=null,toastTimer=null;
function notice(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3400);}
function errorMessage(e){console.error(e);notice('操作失敗：'+(e?.message||e));}
const total=items=>items.reduce((a,x)=>a+Number(x.qty||0),0);
const product=code=>state.products.find(p=>p.code===code);
const stockLabel=p=>`庫存：${p.stock} ${p.unit||'支'}`;
const canUse=p=>p&&p.enabled!==false;
function iconImage(p,cl='photo'){
 const id=p?.imageId,src=id?state.photoUrls.get(id):null;
 if(src)return `<div class="${cl}"><img src="${esc(src)}" alt="${esc(p.name||p.code||'商品照片')}" loading="lazy"></div>`;
 return `<div class="${cl} is-empty"><div class="photo-placeholder"><span>▤</span>圖片待上傳${p?.code?`<div>${esc(p.code)}</div>`:''}</div></div>`;
}
function btn(text,action,css='small-button',attrs=''){return `<button type="button" class="${css}" data-action="${action}" ${attrs}>${text}</button>`;}
function appFrame(pageHtml){
 $('#app').className='app-shell';
 $('#app').innerHTML=`<header class="topbar"><div class="brand"><img class="company-logo" src="./assets/company-logo.png" alt="川昇淨水公司 LOGO"><div><strong>叫貨系統</strong><small>離線 PWA・v${VERSION}</small></div></div><button class="icon-btn" data-action="go-settings" aria-label="系統設定">⚙</button></header><main class="main">${pageHtml}</main><nav class="bottom-nav" aria-label="主要功能">${[['quick','⌂','快速叫貨'],['products','▣','商品庫'],['cart','▤','叫貨清單'],['history','◷','歷史記錄']].map(([key,i,title])=>`<button class="tab ${(['detail','edit'].includes(state.page)&&key==='products')||(state.page==='preview'&&key==='cart')||state.page===key?'active':''}" data-action="nav" data-page="${key}"><span class="tab-icon">${i}</span>${title}</button>`).join('')}</nav>`;
}
function heading(title,sub='',extra=''){return `<div class="page-heading"><div><h1>${title}</h1>${sub?`<div class="subtitle">${sub}</div>`:''}</div>${extra}</div>`;}
function summary(p){return `<div class="product-focus">${iconImage(p)}<div class="product-info"><span class="code">${esc(p.code)}</span><strong>${esc(p.name)}</strong><div class="subline">單位：${esc(p.unit||'支')}</div><div class="subline">${esc(stockLabel(p))}</div><div class="subline">供應商：${esc(p.supplier)}</div></div></div>`;}
function quantityBox(value,kind,code=null){const attr=code?` data-code="${esc(code)}"`:'';return `<div class="qty-control"><button data-action="qty-minus" data-kind="${kind}"${attr} aria-label="減少數量">−</button><input class="qty-display" inputmode="numeric" type="number" min="1" max="99999" value="${esc(value)}" data-qty-input="${kind}"${attr} aria-label="叫貨數量"><button data-action="qty-plus" data-kind="${kind}"${attr} aria-label="增加數量">＋</button></div>`;}
function quickPage(){const exact=state.products.find(p=>p.code===state.code.trim().toUpperCase()&&canUse(p));const match=state.code.trim()&&!exact?state.products.filter(p=>canUse(p)&&(p.code.toLowerCase().includes(state.code.trim().toLowerCase())||p.name.toLowerCase().includes(state.code.trim().toLowerCase()))).slice(0,5):[];
 return `${heading('快速叫貨','輸入貨品編號，自動帶出商品與圖片',`<span class="pill">${state.cart.length} 項商品</span>`)}<section class="card"><div class="field"><label for="sku">貨品編號</label><div class="searchrow"><input id="sku" class="input" placeholder="例如 G001、G011" value="${esc(state.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="primary" data-action="lookup">查詢</button></div></div>${exact?summary(exact):state.code.trim()?`<div class="notice warning">${match.length?'找到可能符合的商品，請選擇貨號。':'找不到商品，請到商品資料庫新增或檢查貨號。'}</div>${match.map(p=>`<button class="small-button mt8" data-action="choose-code" data-code="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</button>`).join(' ')}`:`<div class="notice">已建立 ${state.products.length} 筆範例商品。首次使用請到「商品庫」補上實際照片。</div>`}${exact?`<div class="field"><label>叫貨數量（${esc(exact.unit||'支')}）</label>${quantityBox(state.qty,'quick')}</div><button class="primary wide" data-action="add-cart">＋ 加入叫貨清單</button>`:`<button class="secondary wide" data-action="nav" data-page="products">查看商品資料庫</button>`}</section><section class="card"><div class="block-row"><h2>目前叫貨進度</h2><span class="pill">${total(state.cart)} 件</span></div><div class="muted">本機暫存：${state.cart.length} 項；同貨號會自動合併數量。</div><div class="mt12">${btn('前往叫貨清單 →','nav','primary wide','data-page="cart"')}</div></section>`;
}
function productListPage(){const q=state.query.trim().toLowerCase(),listed=state.products.filter(p=>(!q||p.code.toLowerCase().includes(q)||p.name.toLowerCase().includes(q)||p.supplier.toLowerCase().includes(q))).sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}));return `${heading('商品資料庫','點選商品圖片即可上傳或更換；可查詢、新增、編輯貨品',btn('＋ 新增商品','new-product','primary'))}<div class="field"><input id="catalog-search" class="input" placeholder="搜尋貨號、品名、供應商" value="${esc(state.query)}"></div><div class="muted" style="margin-bottom:12px">共 ${listed.length} 筆商品・點圖片可直接上傳；上傳後可離線查看</div>${listed.map(p=>`<article class="catalog-item"><button type="button" class="catalog-photo-upload" data-action="quick-upload-photo" data-code="${esc(p.code)}" aria-label="為 ${esc(p.code)} 上傳或更換商品照片" title="點圖片立即上傳／更換照片">${iconImage(p)}<span class="camera-corner" aria-hidden="true">📷</span></button><div class="product-info"><span class="code">${esc(p.code)}</span><strong>${esc(p.name)}</strong><span class="tag ${p.stock<=0?'zero':''}">${esc(stockLabel(p))}</span>${p.enabled===false?'<span class="tag zero">停用</span>':''}</div>${btn('查看 ›','view-product','small-button',`data-code="${esc(p.code)}"`)}</article>`).join('')||`<div class="empty-state">找不到符合條件的商品</div>`}`;}
function detailPage(){const p=product(state.detailCode);if(!p)return `<div class="empty-state">商品不存在</div>`;return `${btn('← 返回商品資料庫','nav','back','data-page="products"')}${heading('商品詳細資料','貨號 '+esc(p.code),btn('編輯商品','edit-product','secondary',`data-code="${esc(p.code)}"`))}<article class="card"><button type="button" class="detail-photo detail-photo-upload" data-action="quick-upload-photo" data-code="${esc(p.code)}" aria-label="為 ${esc(p.code)} 上傳或更換商品照片" title="點圖片立即上傳／更換照片">${iconImage(p)}<span class="camera-corner" aria-hidden="true">📷</span></button><div class="muted center photo-hint">點圖片即可直接上傳或更換，無須進入編輯模式</div><h2>${esc(p.name)}</h2><dl class="detail-list"><dt>貨品編號</dt><dd>${esc(p.code)}</dd><dt>單位</dt><dd>${esc(p.unit||'支')}</dd><dt>目前庫存</dt><dd>${esc(p.stock)}</dd><dt>供應商</dt><dd>${esc(p.supplier)}</dd><dt>最近進貨</dt><dd>${esc(p.lastIn||'未提供')}</dd><dt>最近出貨</dt><dd>${esc(p.lastOut||'未提供')}</dd><dt>狀態</dt><dd>${p.enabled===false?'停用':'啟用'}</dd></dl><div class="form-actions">${btn('加入叫貨','choose-code','primary',`data-code="${esc(p.code)}"`)}${btn('編輯照片／資料','edit-product','quiet',`data-code="${esc(p.code)}"`)}</div></article>`;}
function editPage(){const p=state.editCode?product(state.editCode):null;const current=p||{code:'',name:'',unit:'支',stock:0,supplier:state.suppliers[0]?.name||supplierDefault,lastIn:'',lastOut:'',enabled:true};return `${btn('← 返回商品資料庫','nav','back','data-page="products"')}${heading(p?'編輯商品':'新增商品','商品照片保存在本機，不會上傳雲端')}<form id="product-form" class="card"><div class="field"><label for="edit-code">貨品編號 *</label><input class="input" id="edit-code" name="code" value="${esc(current.code)}" maxlength="32" required ${p?'readonly':''}></div><div class="field"><label for="edit-name">商品名稱 *</label><input class="input" id="edit-name" name="name" value="${esc(current.name)}" required maxlength="150"></div><div class="grid2"><div class="field"><label>計量單位</label><input class="input" name="unit" value="${esc(current.unit)}" maxlength="12"></div><div class="field"><label>現有庫存</label><input class="input" name="stock" value="${esc(current.stock)}" inputmode="numeric" type="number" min="0" max="999999"></div></div><div class="field"><label>供應商</label><select class="select" name="supplier">${state.suppliers.map(s=>`<option value="${esc(s.name)}" ${s.name===current.supplier?'selected':''}>${esc(s.name)}</option>`).join('')}${!state.suppliers.some(s=>s.name===current.supplier)?`<option selected value="${esc(current.supplier)}">${esc(current.supplier)}</option>`:''}</select></div><div class="grid2"><div class="field"><label>最近進貨日</label><input class="input" type="date" name="lastIn" value="${esc(current.lastIn)}"></div><div class="field"><label>最近出貨日</label><input class="input" type="date" name="lastOut" value="${esc(current.lastOut)}"></div></div><div class="field"><label>商品圖片（JPG / PNG / WEBP，最大 8MB）</label><div class="row-between">${iconImage(p||current,'photo upload-preview')}${btn('上傳／更換圖片','upload-photo','secondary')}</div><small class="muted">圖片會依原比例自動完整顯示（不裁切、不拉伸）；請上傳實際商品圖片。</small>${p?.imageId?btn('移除目前照片','remove-photo','danger mt8',`data-code="${esc(p.code)}"`):''}</div><label class="small"><input type="checkbox" name="enabled" ${current.enabled!==false?'checked':''}> 啟用商品</label><div class="form-actions"><button class="primary" type="submit">儲存商品</button>${btn('取消','nav','quiet','data-page="products"')}</div></form>`;}
function cartPage(){return `${heading('叫貨清單','每個品項以商品圖片及數量為主',`<span class="pill">${state.cart.length} 項</span>`)}${state.cart.length?`<div class="card"><div class="notice">叫貨單內不顯示庫存等多餘欄位。輸出 PNG 頁首保留供應商、日期及單號，品項僅顯示商品圖片與叫貨數量。</div>${state.cart.map(it=>{const p=product(it.code)||it;return `<div class="cart-item">${iconImage(p)}<div class="cart-center"><div class="muted">${esc(it.code)}</div>${quantityBox(it.qty,'cart',it.code)}</div><div class="cart-controls">${btn('✕','remove-cart','danger',`data-code="${esc(it.code)}"`)}</div></div>`;}).join('')}<div class="total"><span>總叫貨數量</span><strong class="counter">${total(state.cart)} 件</strong></div></div><div class="card"><div class="field"><label>供應商</label><select id="order-supplier" class="select">${state.suppliers.map(s=>`<option value="${esc(s.name)}" ${s.name===state.supplier?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>叫貨日期</label><input id="order-date" type="date" class="input" value="${esc(state.draftDate)}"></div><div class="field"><label>備註（內部留存，不印在圖片）</label><textarea id="order-remark" class="textarea" placeholder="例如：希望到貨時間">${esc(state.remark)}</textarea></div><div class="stack"><button class="primary wide" data-action="prepare-preview">▧ 產生叫貨圖片預覽</button><div class="split">${btn('繼續加商品','nav','quiet','data-page="quick"')}${btn('清空清單','clear-cart','danger')}</div></div></div>`:`<div class="empty-state"><span class="big">▤</span>叫貨清單尚無商品<div class="mt12">${btn('開始叫貨','nav','primary','data-page="quick"')}</div></div>`}`;}
function previewPage(){const order=state.previewOrder;if(!order)return cartPage();const missing=order.items.filter(x=>!x.imageId||!state.photoUrls.has(x.imageId));return `${btn('← 返回','preview-back','back')}${heading('叫貨圖片預覽','確認後可下載 PNG 或分享給供應商')}<div class="notice ${missing.length?'warning':''}">${missing.length?`有 ${missing.length} 項沒有商品實際照片！請先在商品庫上傳，否則 PNG 將顯示「尚無商品照片」與貨號。`:'圖片使用商品庫中已上傳的實際商品照片。'} PNG 每張最多 13 項商品，超過會自動分頁。商品圖片顯示區放大為原版 3 倍，會產生較長的圖片。</div><div class="preview-paper"><div class="preview-title"><img class="preview-company-logo" src="./assets/company-logo.png" alt="川昇淨水公司 LOGO"><strong>叫貨單</strong></div><div class="preview-meta"><div>供應商：${esc(order.supplier)}</div><div>叫貨日期：${esc(dateView(order.date))}</div><div>單號：${esc(order.id)}</div></div>${order.items.map(it=>{const p={...(product(it.code)||it),imageId:it.imageId||product(it.code)?.imageId||null};return `<div class="preview-item">${iconImage(p)}<div class="bigqty">${esc(it.qty)} <span class="small">${esc(it.unit||'支')}</span></div></div>`;}).join('')}<div class="preview-foot">總數量：${total(order.items)} 件</div><div class="brand-preview">川昇淨水・請依商品圖片與數量備貨</div></div><div class="card mt20 actions-only"><div class="stack">${state.previewSource==='cart'?btn('✓ 儲存叫貨單至歷史紀錄','save-order','secondary wide'):''}<button class="primary wide" data-action="download-image">▧ 下載 PNG 圖片</button><button class="secondary wide" data-action="share-image">↗ 分享圖片給供應商</button></div><div class="muted mt12">「分享圖片」會呼叫裝置的分享選單（例如 LINE）；不會自動幫你傳送。如果瀏覽器不支援，可先下載 PNG 再自行傳送。</div></div>`;}
function historyPage(){const q=state.query.trim().toLowerCase();const orders=state.orders.filter(o=>!q||[o.id,o.supplier,o.date,...o.items.map(i=>i.code)].some(s=>String(s).toLowerCase().includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return `${heading('歷史叫貨','已儲存在本機的叫貨單',`<span class="pill">${state.orders.length} 張</span>`)}<div class="field"><input id="history-search" class="input" placeholder="搜尋日期、單號、供應商、貨號" value="${esc(state.query)}"></div>${orders.length?orders.map(o=>`<article class="history-item"><div class="history-icon">▤</div><div class="data"><strong>${esc(o.id)}</strong><small>${esc(dateView(o.date))}・${o.items.length} 項／${total(o.items)} 件</small><small>${esc(o.supplier)}</small></div><div class="actions-vertical">${btn('查看','view-order','small-button',`data-id="${esc(o.id)}"`)}${btn('再叫貨','reorder','small-button',`data-id="${esc(o.id)}"`)}</div></article>`).join(''):`<div class="empty-state">尚無歷史叫貨單，或找不到符合條件的紀錄。</div>`}`;}
function settingsPage(){const photos=state.products.filter(p=>p.imageId).length;return `${btn('← 返回快速叫貨','nav','back','data-page="quick"')}${heading('系統設定','本機儲存・資料備份與版本管理')}<div class="stat-grid"><div class="stat"><strong>${state.products.length}</strong><small>商品筆數</small></div><div class="stat"><strong>${photos}</strong><small>已上傳照片</small></div><div class="stat"><strong>${state.orders.length}</strong><small>歷史叫貨</small></div></div><section class="card"><h2>資料備份與還原</h2><div class="notice warning">資料只存於目前瀏覽器。換機、清除網站資料、重裝或移除網站資料之前，務必匯出備份。備份包包含商品照片，請妥善保管。</div><div class="stack">${btn('⬇ 匯出完整備份（JSON）','backup-export','primary wide')}${btn('⬆ 匯入備份並還原','backup-import','secondary wide')}</div><div class="muted mt12">還原會先驗證檔案並請你確認是否覆蓋原資料。</div></section><section class="card"><h2>供應商管理</h2><div class="field"><label>新增供應商</label><div class="searchrow"><input id="supplier-name" class="input" placeholder="供應商名稱" maxlength="80">${btn('新增','add-supplier','primary')}</div></div>${state.suppliers.map(s=>`<div class="settings-item"><span class="title">${esc(s.name)}</span>${state.suppliers.length>1?btn('刪除','delete-supplier','small-button',`data-name="${esc(s.name)}"`):''}</div>`).join('')}</section><section class="card"><h2>應用程式版本</h2><div class="settings-item"><div><div class="title">目前版本 v${VERSION}</div><small>${state.online?'網路已連線':'目前離線'}・GitHub Pages 部署</small></div>${btn('檢查版本','check-version','small-button')}</div>${state.versionStatus?`<div class="notice mt12">${esc(state.versionStatus)}</div>`:''}${swReg?.waiting?btn('套用已下載新版','apply-update','primary wide'):''}<div class="muted mt12">僅手動檢查與套用，不會強制重新整理。</div></section><div class="version">川昇叫貨系統 v${VERSION}｜單機離線版</div>`;}
function render(){let out;switch(state.page){case 'quick':out=quickPage();break;case 'products':out=productListPage();break;case 'detail':out=detailPage();break;case 'edit':out=editPage();break;case 'cart':out=cartPage();break;case 'preview':out=previewPage();break;case 'history':out=historyPage();break;case 'settings':out=settingsPage();break;default:state.page='quick';out=quickPage();}appFrame(out);}
function go(page){state.query='';state.page=page;render();window.scrollTo(0,0);}
async function refreshPhotos(){const urls=new Map();for(const id of [...state.products.map(p=>p.imageId),...state.orders.flatMap(o=>o.items.map(i=>i.imageId))]){if(!id||urls.has(id))continue;const photo=await get('images',id);if(photo?.blob)urls.set(id,URL.createObjectURL(photo.blob));}for(const url of state.photoUrls.values())URL.revokeObjectURL(url);state.photoUrls=urls;}
async function reloadData(){state.products=await all('products');state.orders=await all('orders');state.suppliers=await all('suppliers');await refreshPhotos();}
async function saveDraft(){await setKV('draft',{items:state.cart,supplier:state.supplier,date:state.draftDate,remark:state.remark});}
function getOrderSnapshot(order){return {...order,items:order.items.map(it=>({...it,imageId:it.imageId||product(it.code)?.imageId||null}))};}
function validateCart(){if(!state.cart.length){notice('請先加入商品');return false;}const bad=state.cart.filter(it=>!safeQty(it.qty));if(bad.length){notice('數量需為 1 至 99999 的整數');return false;}return true;}
async function nextOrderNumber(){const d=dateStr().replaceAll('-','');const prefix=`PO${d}-`;const existing=state.orders.map(o=>o.id).filter(id=>id.startsWith(prefix)).map(id=>Number(id.slice(prefix.length))).filter(Number.isFinite);return prefix+String(Math.max(0,...existing)+1).padStart(3,'0');}
async function preparePreview(){if(!validateCart())return;const mismatched=state.cart.filter(it=>product(it.code)?.supplier!==state.supplier);if(mismatched.length){notice('清單內含不同供應商商品，請分開建立叫貨單。');return;}
 state.previewOrder={id:await nextOrderNumber(),date:state.draftDate,supplier:state.supplier,remark:state.remark,items:state.cart.map(it=>{const p=product(it.code);return {code:it.code,name:p?.name||it.name,unit:p?.unit||it.unit,qty:it.qty,imageId:p?.imageId||null};}),createdAt:new Date().toISOString(),status:'已儲存'};state.previewSource='cart';go('preview');}
async function imagePages(){if(!state.previewOrder)throw Error('尚未建立叫貨單');return renderOrderPngPages(getOrderSnapshot(state.previewOrder),async id=>(await get('images',id))?.blob||null);}
async function exportBackup(){
 const data={format:'chuansheng-order-pwa',schema:1,exportedAt:new Date().toISOString(),products:await all('products'),orders:await all('orders'),suppliers:await all('suppliers'),kv:await all('kv'),images:[]};
 for(const x of await all('images')){
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(x.blob)});
  data.images.push({id:x.id,type:x.blob.type,dataUrl,updatedAt:x.updatedAt});
 }
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 saveBlob(blob,`川昇叫貨完整備份_${dateStr().replaceAll('-','')}.json`);notice(`備份已產生：${data.products.length} 商品、${data.images.length} 照片、${data.orders.length} 訂單`);
}
async function restoreBackup(file){if(!file)return;if(file.size>120*1024*1024)throw Error('備份檔超過 120MB，請拆分資料。');
 const raw=JSON.parse(await file.text());
 if(raw.format!=='chuansheng-order-pwa'||raw.schema!==1||!Array.isArray(raw.products)||!Array.isArray(raw.orders)||!Array.isArray(raw.suppliers)||!Array.isArray(raw.images)||!Array.isArray(raw.kv))throw Error('不是有效的川昇叫貨備份檔（格式版本 1）。');
 const codes=new Set();for(const p of raw.products){if(!p||typeof p.code!=='string'||!p.code.trim()||typeof p.name!=='string'||codes.has(p.code))throw Error('商品資料有空值或重複貨號');codes.add(p.code);}
 for(const o of raw.orders){if(!o||typeof o.id!=='string'||!Array.isArray(o.items)||!o.items.every(it=>typeof it.code==='string'&&safeQty(it.qty)))throw Error('歷史訂單格式不正確');}
 const backup={products:raw.products,orders:raw.orders,kv:raw.kv,suppliers:raw.suppliers,images:[]};
 for(const x of raw.images){if(!x||typeof x.id!=='string'||typeof x.dataUrl!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(x.dataUrl))throw Error('圖片資料無法辨識');const blob=await (await fetch(x.dataUrl)).blob();backup.images.push({id:x.id,blob,updatedAt:x.updatedAt||new Date().toISOString()});}
 if(!confirm(`確定還原備份？\n商品 ${backup.products.length} 筆、照片 ${backup.images.length} 張、歷史訂單 ${backup.orders.length} 筆。\n\n注意：將「覆蓋目前全部資料」，無法復原。請先匯出目前資料。`))return;
 await replaceBackup(backup);await reloadData();
 const draft=await getKV('draft',{});state.cart=Array.isArray(draft.items)?draft.items:[];state.supplier=draft.supplier||supplierDefault;state.draftDate=draft.date||dateStr();state.remark=draft.remark||'';notice('還原成功，商品／圖片／歷史單已載入');go('quick');
}
async function handleProductForm(form){
 const data=new FormData(form),code=String(data.get('code')||'').trim().toUpperCase(),name=String(data.get('name')||'').trim(),stock=Number(data.get('stock'));
 if(!/^[A-Z0-9_-]{1,32}$/.test(code))throw Error('貨品編號只能使用英數、底線及減號');
 if(!name)throw Error('請輸入品名');if(!Number.isInteger(stock)||stock<0)throw Error('庫存必須是零或正整數');
 const old=state.editCode?product(state.editCode):null;
 if(!old&&product(code))throw Error('貨品編號已存在，請更換貨號');
 const rec={...(old||{}),code,name,unit:String(data.get('unit')||'支').trim()||'支',stock,supplier:String(data.get('supplier')||supplierDefault),lastIn:String(data.get('lastIn')||''),lastOut:String(data.get('lastOut')||''),enabled:data.has('enabled'),imageId:old?.imageId||null,updatedAt:new Date().toISOString()};
 if(!state.suppliers.some(s=>s.name===rec.supplier))throw Error('供應商不在清單，請先到設定新增');
 await put('products',rec);await reloadData();state.detailCode=rec.code;state.editCode=null;notice('商品已儲存');go('detail');
}
function compressImage(file){return new Promise(async(resolve,reject)=>{
 if(!file.type.startsWith('image/'))return reject(Error('請選擇圖片檔案'));
 if(file.size>8*1024*1024)return reject(Error('單張照片不得超過 8MB'));
 const temp=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{
  URL.revokeObjectURL(temp);
  // 僅依最長邊等比例縮小，保留整張來源照片；不使用裁切方框。
  const sourceWidth=img.naturalWidth,sourceHeight=img.naturalHeight;
  if(!sourceWidth||!sourceHeight){reject(Error('無法辨識圖片尺寸'));return;}
  const max=1400,scale=Math.min(1,max/Math.max(sourceWidth,sourceHeight)),can=document.createElement('canvas');
  can.width=Math.max(1,Math.round(sourceWidth*scale));can.height=Math.max(1,Math.round(sourceHeight*scale));
  const ctx=can.getContext('2d');if(!ctx){reject(Error('無法處理商品照片'));return;}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff';ctx.fillRect(0,0,can.width,can.height);
  ctx.drawImage(img,0,0,sourceWidth,sourceHeight,0,0,can.width,can.height);
  can.toBlob(b=>b?resolve(b):reject(Error('照片處理失敗')),'image/jpeg',.86);
 };
 img.onerror=()=>{URL.revokeObjectURL(temp);reject(Error('無法讀取照片，可改用 JPG 或 PNG'))};img.src=temp;
});}
// 直接從商品庫縮圖、詳情大圖或原有編輯頁上傳；三者共用同一個貨號選圖流程。
// 寫入照片及商品對應使用同一個 IndexedDB 交易，任一步驟失敗即回復原狀。
async function uploadPhoto(file,code){
 if(!file)return;
 if(state.photoBusy){notice('正在處理上一張照片，請稍候');return;}
 const p=product(code);if(!p)throw Error('找不到要上傳照片的商品，請重新選擇');
 state.photoBusy=true;
 try{
  const blob=await compressImage(file);
  await saveProductPhoto(code,blob);
  await reloadData();
  notice(`${p.code} 照片已自動儲存，無須再按儲存，可離線查看`);
  render();
 }finally{state.photoBusy=false;}
}
function syncInputValues(){if(state.page==='cart'){state.draftDate=$('#order-date')?.value||dateStr();state.supplier=$('#order-supplier')?.value||state.supplier;state.remark=$('#order-remark')?.value||'';}}
async function handleAction(btn){const action=btn.dataset.action,code=btn.dataset.code,id=btn.dataset.id;
 switch(action){
  case 'nav':syncInputValues();if(state.page==='cart')await saveDraft();go(btn.dataset.page);break;
  case 'go-settings':syncInputValues();if(state.page==='cart')await saveDraft();go('settings');break;
  case 'lookup':state.code=$('#sku')?.value.trim().toUpperCase()||'';render();break;
  case 'choose-code':state.code=code;state.qty=1;go('quick');break;
  case 'qty-plus':case 'qty-minus':{
   const delta=action==='qty-plus'?1:-1,kind=btn.dataset.kind;
   if(kind==='quick')state.qty=Math.max(1,Math.min(99999,Number(state.qty||1)+delta));
   if(kind==='cart'){const item=state.cart.find(p=>p.code===code);if(item){item.qty=Math.max(1,Math.min(99999,Number(item.qty||1)+delta));await saveDraft();}}
   render();break;
  }
  case 'add-cart':{
   const p=product(state.code.trim().toUpperCase());if(!canUse(p))throw Error('找不到可用商品');if(!safeQty(state.qty))throw Error('數量必須為 1 至 99999');
   if(state.cart.length&&p.supplier!==state.supplier){notice(`此商品屬於「${p.supplier}」，請先完成目前供應商叫貨單。`);break;}
   if(!state.cart.length)state.supplier=p.supplier;
   const existing=state.cart.find(x=>x.code===p.code);
   if(existing){if(existing.qty+Number(state.qty)>99999)throw Error('單品項數量超過上限');existing.qty+=Number(state.qty);}
   else state.cart.push({code:p.code,name:p.name,unit:p.unit,qty:Number(state.qty)});
   state.code='';state.qty=1;await saveDraft();notice(`${p.code} 已加入叫貨清單`);render();break;
  }
  case 'remove-cart':{state.cart=state.cart.filter(x=>x.code!==code);await saveDraft();render();break;}
  case 'clear-cart':if(confirm('確定清空目前所有叫貨明細？')){state.cart=[];await saveDraft();render();}break;
  case 'view-product':state.detailCode=code;go('detail');break;
  case 'edit-product':state.editCode=code;go('edit');break;
  case 'new-product':state.editCode=null;go('edit');break;
  case 'quick-upload-photo':case 'upload-photo':{
   const targetCode=action==='quick-upload-photo'?code:state.editCode;
   if(!targetCode||!product(targetCode)){notice('請先儲存商品，才能上傳照片');break;}
   if(state.photoBusy){notice('正在儲存照片，請稍候');break;}
   state.photoTargetCode=targetCode;
   const picker=$('#product-photo');picker.value='';picker.click();break;
  }
  case 'remove-photo':{
   const p=product(code);if(!p?.imageId)break;if(confirm('確定移除此商品照片？')){const imageId=p.imageId;await put('products',{...p,imageId:null});if(!state.products.some(x=>x.code!==p.code&&x.imageId===imageId)&&!state.orders.some(o=>o.items.some(i=>i.imageId===imageId)))await remove('images',imageId);await reloadData();render();}break;
  }
  case 'prepare-preview':syncInputValues();await saveDraft();await preparePreview();break;
  case 'preview-back':go(state.previewSource==='history'?'history':'cart');break;
  case 'save-order':{
   if(!state.previewOrder)break;
   if(!state.orders.some(o=>o.id===state.previewOrder.id))await put('orders',getOrderSnapshot(state.previewOrder));
   await reloadData();state.cart=[];state.remark='';state.draftDate=dateStr();await saveDraft();state.previewSource='history';notice('已儲存至歷史叫貨單');render();break;
  }
  case 'view-order':state.previewOrder=state.orders.find(x=>x.id===id);state.previewSource='history';go('preview');break;
  case 'reorder':{
   const o=state.orders.find(x=>x.id===id);if(!o)throw Error('找不到歷史單');if(state.cart.length&&!confirm('目前有未完成的叫貨清單。要用歷史單取代嗎？'))break;
   const valid=o.items.filter(x=>canUse(product(x.code)));if(valid.length!==o.items.length)notice('部分原商品已停用或不存在，請手動確認');
   state.cart=valid.map(x=>({code:x.code,qty:x.qty,name:x.name,unit:x.unit}));state.supplier=o.supplier;state.draftDate=dateStr();state.remark='';await saveDraft();go('cart');break;
  }
  case 'download-image':{
   const arr=await imagePages();for(const item of arr)saveBlob(item.blob,item.name);
   notice(`已產生 ${arr.length} 張 PNG（依瀏覽器下載設定保存）`);break;
  }
  case 'share-image':{
   const arr=await imagePages(),files=arr.map(x=>new File([x.blob],x.name,{type:'image/png'}));
   if(navigator.share&&navigator.canShare?.({files})){
    try{await navigator.share({files,title:'川昇叫貨單'});notice('分享畫面已開啟，請自行確認傳送');}catch(e){if(e.name==='NotAllowedError'||e.name==='NotSupportedError'){saveBlob(arr[0].blob,arr[0].name);notice('裝置未允許直接分享，已下載首張 PNG。可按下載按鈕保存全部圖片。');}else if(e.name!=='AbortError')throw e;}
   }else{saveBlob(arr[0].blob,arr[0].name);notice(arr.length>1?'此瀏覽器不支援多圖分享，請改按「下載 PNG」保存全部圖片。':'此瀏覽器不支援直接分享，已下載 PNG，請從 LINE 附加圖片。');}
   break;
  }
  case 'backup-export':await exportBackup();break;
  case 'backup-import':$('#backup-import').value='';$('#backup-import').click();break;
  case 'add-supplier':{
   const n=$('#supplier-name')?.value.trim();if(!n)throw Error('請輸入供應商名稱');if(state.suppliers.some(s=>s.name===n))throw Error('供應商已存在');await put('suppliers',{name:n,note:''});await reloadData();render();notice('已新增供應商');break;
  }
  case 'delete-supplier':{
   const name=btn.dataset.name;if(state.suppliers.length<2)throw Error('必須保留至少一個供應商');if(state.products.some(p=>p.supplier===name)||state.orders.some(o=>o.supplier===name))throw Error('此供應商已有商品或訂單，不能刪除');if(confirm(`確定刪除供應商「${name}」？`)){await remove('suppliers',name);await reloadData();if(state.supplier===name)state.supplier=state.suppliers[0].name;render();}break;
  }
  case 'check-version':{
   if(!navigator.onLine){state.versionStatus='目前離線，無法查詢遠端版本。';render();break;}
   try{const resp=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});if(!resp.ok)throw Error('伺服器無回應');const remote=await resp.json();
    if(remote.version===VERSION)state.versionStatus=`已查詢：目前是 v${VERSION}。`;
    else state.versionStatus=`遠端提供 v${remote.version}（本機 v${VERSION}），可關閉其他分頁後套用更新。`;
    if(swReg)await swReg.update();
    if(swReg?.waiting)state.versionStatus+=' 新版已準備完成，請按「套用已下載新版」。';
   }catch(e){state.versionStatus=`檢查失敗：${e.message}`;}render();break;
  }
  case 'apply-update':{
   if(!swReg?.waiting){notice('目前沒有等待套用的新版');break;}
   if(!confirm('確定現在套用新版並重新載入？請先完成正在編輯的內容。'))break;
   const requested=sessionStorage.getItem('manual-update-requested');if(requested==='1'){notice('已提出更新要求，請關閉其他已開啟分頁');break;}
   sessionStorage.setItem('manual-update-requested','1');swReg.waiting.postMessage({type:'APPLY_UPDATE'});notice('已要求套用新版；請關閉其他舊版分頁，再重新開啟');break;
  }
  default:break;
 }
}
async function init(){
 try{
  await openDB();await reloadData();const draft=await getKV('draft',{});
  state.cart=Array.isArray(draft.items)?draft.items:[];state.supplier=draft.supplier||supplierDefault;state.draftDate=draft.date||dateStr();state.remark=draft.remark||'';
  render();
  if('serviceWorker'in navigator&&location.protocol!=='file:'){
   try{swReg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});}
   catch(e){console.warn('Service Worker 未能註冊：',e);}
  }
 }catch(e){console.error(e);$('#app').innerHTML=`<div class="card" style="margin:20px"><h2>無法啟動本機資料庫</h2><p>${esc(e.message)}</p><p>請使用 HTTPS 或 localhost；若使用無痕模式，請切換一般瀏覽模式。</p></div>`;}
}
document.addEventListener('click',async e=>{const btn=e.target.closest('[data-action]');if(!btn||state.busy)return;e.preventDefault();state.busy=true;btn.disabled=true;try{await handleAction(btn)}catch(err){errorMessage(err)}finally{state.busy=false;if(btn.isConnected)btn.disabled=false;}});
document.addEventListener('input',e=>{
 if(e.target.id==='sku'){state.code=e.target.value.toUpperCase();const input=e.target,cursor=input.selectionStart;render();const replacement=$('#sku');replacement?.focus();if(replacement)replacement.setSelectionRange(cursor,cursor);}
 if(e.target.id==='catalog-search'||e.target.id==='history-search'){
  state.query=e.target.value;const id=e.target.id,cursor=e.target.selectionStart;render();const replacement=$('#'+id);replacement?.focus();if(replacement)replacement.setSelectionRange(cursor,cursor);
 }
 if(e.target.dataset.qtyInput==='quick')state.qty=Number(e.target.value);
 if(e.target.dataset.qtyInput==='cart'){
  const item=state.cart.find(x=>x.code===e.target.dataset.code);if(item)item.qty=Number(e.target.value);
 }
});
document.addEventListener('change',async e=>{
 try{
  if(e.target.id==='product-photo'){const code=state.photoTargetCode;state.photoTargetCode=null;await uploadPhoto(e.target.files?.[0],code);return;}
  if(e.target.id==='backup-import'){await restoreBackup(e.target.files?.[0]);return;}
  if(e.target.dataset.qtyInput==='cart'){
   const item=state.cart.find(x=>x.code===e.target.dataset.code);if(!item)return;
   if(!safeQty(item.qty)){item.qty=1;notice('數量需為 1 至 99999 的整數');}
   await saveDraft();render();
  }
  if(e.target.dataset.qtyInput==='quick'){if(!safeQty(state.qty)){state.qty=1;notice('數量需為 1 至 99999 的整數');render();}}
  if(['order-supplier','order-date','order-remark'].includes(e.target.id)){syncInputValues();await saveDraft();}
 }catch(error){errorMessage(error)}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='product-form')return;e.preventDefault();try{await handleProductForm(e.target)}catch(err){errorMessage(err)};});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='sku'){e.preventDefault();document.activeElement.blur();}});
window.addEventListener('online',()=>{state.online=true;if(state.page==='settings')render();});window.addEventListener('offline',()=>{state.online=false;if(state.page==='settings')render();});
init();
