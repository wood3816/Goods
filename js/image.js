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
function photo(ctx,img,x,y,w,h){
 if(!img)return;
 const scale=Math.min(w/img.width,h/img.height);
 const dw=img.width*scale,dh=img.height*scale;
 ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function imgToBlob(canvas){return new Promise((resolve,reject)=>{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('圖片產生失敗，請檢查裝置儲存空間。')),'image/png');});}
// 每頁不超過 13 項，避免 iOS 長圖像素與記憶體限制。
export async function renderOrderPngPages(order,readImage){
 const perPage=13,groups=[];
 for(let i=0;i<order.items.length;i+=perPage)groups.push(order.items.slice(i,i+perPage));
 const output=[];
 for(let page=0;page<groups.length;page++){
  const items=groups[page],W=1080,rowH=170,headerH=385,footerH=145,H=headerH+items.length*rowH+footerH;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d',{alpha:false});if(!c)throw Error('此瀏覽器不支援圖片輸出');
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.fillStyle=COLOR.navy;c.fillRect(0,0,W,114);
  // 不使用外部圖片或字體：離線也能產生一致的表單。
  c.beginPath();c.strokeStyle='#61d6ff';c.lineWidth=8;c.moveTo(46,68);c.bezierCurveTo(72,32,100,42,120,52);c.bezierCurveTo(148,70,170,68,198,37);c.stroke();
  text(c,'川昇淨水有限公司',224,77,'bold 43px sans-serif','#ffffff');
  text(c,'叫 貨 單',W/2,185,'bold 58px sans-serif',COLOR.navy,'center');
  text(c,'供應商：'+(order.supplier||'未指定'),56,247,'27px sans-serif');
  text(c,'叫貨日期：'+(order.date||''),56,296,'27px sans-serif');
  text(c,'單號：'+order.id,56,343,'23px sans-serif',COLOR.muted);
  if(groups.length>1)text(c,`第 ${page+1} / ${groups.length} 張`,W-56,343,'23px sans-serif',COLOR.muted,'right');
  c.strokeStyle=COLOR.border;c.lineWidth=3;c.beginPath();c.moveTo(40,370);c.lineTo(1040,370);c.stroke();
  for(let i=0;i<items.length;i++){
   const entry=items[i],y=headerH+i*rowH;
   if(i%2===0){c.fillStyle='#f5faff';c.fillRect(40,y,1000,rowH-2);}
   rounded(c,70,y+14,150,140,12,'#eef4f9',COLOR.border);
   let bitmap=null;
   if(entry.imageId){try{bitmap=await bitmapForBlob(await readImage(entry.imageId))}catch{}}
   if(bitmap){photo(c,bitmap,76,y+20,138,128);if(bitmap.close)bitmap.close();}
   else{
    text(c,'尚無商品照片',145,y+80,'bold 20px sans-serif','#aa5d2f','center');
    text(c,entry.code,145,y+112,'bold 24px sans-serif',COLOR.navy,'center');
   }
   // 這裡只顯示商品圖、數量；小字貨號讓供應商可核對／照片缺漏時可辨識。
   text(c,entry.code,258,y+91,'bold 26px sans-serif',COLOR.muted);
   text(c,`${entry.qty} ${entry.unit||'支'}`,1004,y+104,'bold 55px sans-serif',COLOR.navy,'right');
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
