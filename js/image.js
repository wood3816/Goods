// 圖片式叫貨單：圖片 + 數量為每項唯一主要內容；沒有照片時醒目提示，不能誤當成實物照。
const COLOR={navy:'#0a3560',blue:'#0e74cc',light:'#f1f7fc',border:'#d7e6f2',muted:'#58728a'};
function text(ctx,str,x,y,font,color=COLOR.navy,align='left'){
 ctx.save();ctx.fillStyle=color;ctx.font=font;ctx.textAlign=align;ctx.fillText(String(str),x,y);ctx.restore();
}
function rounded(ctx,x,y,w,h,r,fill,stroke){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
async function bitmapForBlob(blob){
 if(!blob)return null;
 if(typeof createImageBitmap==='function'){
  try{return await createImageBitmap(blob)}catch{}
 }
 return new Promise((resolve)=>{
  const u=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(u);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(u);resolve(null)};img.src=u;
 });
}
// 將來源照片等比例置入固定區域，完整顯示四邊；絕不採用 cover 或來源裁切。
// 同一算法支援直式、橫式、正方形，也用於最終輸出的 PNG（不是只改網頁 CSS）。
export function containedRect(sourceWidth,sourceHeight,x,y,width,height,inset=0){
 const values=[sourceWidth,sourceHeight,x,y,width,height,inset];
 if(values.some(v=>!Number.isFinite(v))||sourceWidth<=0||sourceHeight<=0||width<=0||height<=0)return null;
 const padding=Math.max(0,Math.min(inset,(Math.min(width,height)-1)/2));
 const availableWidth=width-padding*2,availableHeight=height-padding*2;
 const scale=Math.min(availableWidth/sourceWidth,availableHeight/sourceHeight);
 const drawWidth=sourceWidth*scale,drawHeight=sourceHeight*scale;
 return {x:x+(width-drawWidth)/2,y:y+(height-drawHeight)/2,width:drawWidth,height:drawHeight};
}
function photo(ctx,img,x,y,w,h,inset=6){
 if(!img)return;
 const rect=containedRect(img.width||img.naturalWidth,img.height||img.naturalHeight,x,y,w,h,inset);
 if(!rect)return;
 ctx.drawImage(img,rect.x,rect.y,rect.width,rect.height);
}
function imgToBlob(canvas){return new Promise((resolve,reject)=>{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('圖片產生失敗，請檢查裝置儲存空間。')),'image/png');});}
// 公司原版 LOGO 經透明邊緣裁整後的影像（仍是使用者提供的同一張原始圖）。
const logoURL = new URL('../assets/company-logo.png', import.meta.url).href;
async function loadCompanyLogo(){
 return new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=logoURL;});
}
// 每頁不超過 13 項，避免 iOS 長圖像素與記憶體限制。
export async function renderOrderPngPages(order,readImage){
 const perPage=13,groups=[];
 for(let i=0;i<order.items.length;i+=perPage)groups.push(order.items.slice(i,i+perPage));
 const output=[];
 const companyLogo=await loadCompanyLogo();
 for(let page=0;page<groups.length;page++){
  const items=groups[page],W=1080,rowH=458,headerH=385,footerH=145,H=headerH+items.length*rowH+footerH;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d',{alpha:false});if(!c)throw Error('此瀏覽器不支援圖片輸出');
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.fillStyle=COLOR.navy;c.fillRect(0,0,W,114);
  // 公司原始 LOGO 由同站 assets 載入（亦列入離線快取），完整顯示於頁首。
  if(companyLogo){photo(c,companyLogo,45,15,550,99);}
  else text(c,'川昇淨水',58,78,'bold 45px sans-serif','#ffffff');
  text(c,'叫貨單',1015,77,'bold 44px sans-serif','#ffffff','right');
  text(c,'叫 貨 單',W/2,185,'bold 58px sans-serif',COLOR.navy,'center');
  text(c,'供應商：'+(order.supplier||'未指定'),56,247,'27px sans-serif');
  text(c,'叫貨日期：'+(order.date||''),56,296,'27px sans-serif');
  text(c,'單號：'+order.id,56,343,'23px sans-serif',COLOR.muted);
  if(groups.length>1)text(c,`第 ${page+1} / ${groups.length} 張`,W-56,343,'23px sans-serif',COLOR.muted,'right');
  c.strokeStyle=COLOR.border;c.lineWidth=3;c.beginPath();c.moveTo(40,370);c.lineTo(1040,370);c.stroke();
  for(let i=0;i<items.length;i++){
   const entry=items[i],y=headerH+i*rowH;
   if(i%2===0){c.fillStyle='#f5faff';c.fillRect(40,y,1000,rowH-2);}
   // v1.0.2 商品圖片顯示區：原 150×140 -> 450×420（寬高各 3 倍）
   rounded(c,70,y+14,450,420,16,'#ffffff',COLOR.border);
   let bitmap=null;
   if(entry.imageId){try{bitmap=await bitmapForBlob(await readImage(entry.imageId))}catch{}}
   if(bitmap){photo(c,bitmap,88,y+32,414,384,18);if(bitmap.close)bitmap.close();}
   else{
    text(c,'尚無商品照片',295,y+208,'bold 32px sans-serif','#aa5d2f','center');
    text(c,entry.code,295,y+260,'bold 36px sans-serif',COLOR.navy,'center');
   }
   // 單個商品列只顯示完整圖片與大字數量；缺圖時於佔位框顯示貨號以免認錯。
   text(c,`${entry.qty} ${entry.unit||'支'}`,1004,y+258,'bold 83px sans-serif',COLOR.navy,'right');
  }
  const footY=headerH+items.length*rowH+18;
  c.strokeStyle=COLOR.border;c.beginPath();c.moveTo(40,footY);c.lineTo(1040,footY);c.stroke();
  text(c,`合計：${items.reduce((s,x)=>s+Number(x.qty||0),0)} 件`,1005,footY+53,'bold 30px sans-serif',COLOR.navy,'right');
  text(c,'川昇淨水・請依商品圖片與數量備貨',W/2,H-32,'22px sans-serif',COLOR.muted,'center');
  output.push({name:`叫貨單_${order.id}${groups.length>1?`_第${page+1}張`:''}.png`,blob:await imgToBlob(canvas)});
 }
 return output;
}
export function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
