// 川昇叫貨系統 v1.0.7：PNG 叫貨單固定 2 行 × 3 列；頁首公司 LOGO 水平置中。
// 每個圖片顯示框維持 v1.0.4 的 450 × 420 px，大圖不裁切、不拉伸。
const COLOR={navy:'#0a3560',blue:'#0e74cc',light:'#f1f7fc',border:'#d7e6f2',muted:'#58728a'};
export const ORDER_ITEMS_PER_PAGE=6;
export function paginateOrderItems(items){
 if(!Array.isArray(items))return [];
 const pages=[];
 for(let i=0;i<items.length;i+=ORDER_ITEMS_PER_PAGE)pages.push(items.slice(i,i+ORDER_ITEMS_PER_PAGE));
 return pages;
}
function text(ctx,str,x,y,font,color=COLOR.navy,align='left',maxWidth){
 ctx.save();ctx.fillStyle=color;ctx.font=font;ctx.textAlign=align;
 ctx.fillText(String(str??''),x,y,...(maxWidth?[maxWidth]:[]));ctx.restore();
}
function rounded(ctx,x,y,w,h,r,fill,stroke){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);
 if(fill){ctx.fillStyle=fill;ctx.fill();}
 if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
async function bitmapForBlob(blob){
 if(!blob)return null;
 if(typeof createImageBitmap==='function'){
  try{return await createImageBitmap(blob);}catch{}
 }
 return new Promise(resolve=>{
  const url=URL.createObjectURL(blob),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
  img.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};img.src=url;
 });
}
// 將照片依原始比例完整置入顯示區，不進行裁切。
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
 if(rect)ctx.drawImage(img,rect.x,rect.y,rect.width,rect.height);
}
function imgToBlob(canvas){return new Promise((resolve,reject)=>{
 canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('圖片產生失敗，請檢查裝置儲存空間。')),'image/png');
});}
const logoURL=new URL('../assets/company-logo-export.png',import.meta.url).href;
async function loadCompanyLogo(){
 return new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=logoURL;});
}
// 中英文品名自動斷行：至多兩行，超長以省略號顯示，不讓文字超出商品格。
function productNameLines(ctx,name,maxWidth,maxLines=2){
 ctx.save();ctx.font='bold 30px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
 const result=[];let line='';
 for(const char of String(name||'')){
  if(ctx.measureText(line+char).width<=maxWidth){line+=char;continue;}
  if(line){result.push(line);line=char;}else{result.push(char);line='';}
  if(result.length===maxLines){
   // 經過截斷的內容一律以省略號標示。
   let last=result[maxLines-1];while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);
   result[maxLines-1]=last+'…';ctx.restore();return result;
  }
 }
 if(line)result.push(line);
 ctx.restore();return result.length?result:['未命名商品'];
}
function drawCard(c,entry,x,y,w,h,bitmap){
 rounded(c,x,y,w,h,16,'#ffffff',COLOR.border);
 const imgW=450,imgH=420,imgX=x+(w-imgW)/2,imgY=y+21;
 rounded(c,imgX,imgY,imgW,imgH,12,'#ffffff','#deebf5');
 if(bitmap)photo(c,bitmap,imgX,imgY,imgW,imgH,18);
 else{
  text(c,'圖片待上傳',x+w/2,imgY+198,'bold 32px sans-serif','#a15b34','center');
  text(c,String(entry.code||''),x+w/2,imgY+252,'bold 32px sans-serif',COLOR.navy,'center',imgW-30);
 }
 text(c,String(entry.code||''),x+w/2,y+485,'bold 31px sans-serif',COLOR.navy,'center',w-34);
 const lines=productNameLines(c,entry.name||'',w-38);
 lines.forEach((line,i)=>text(c,line,x+w/2,y+532+i*37,'bold 30px sans-serif',COLOR.navy,'center',w-38));
 text(c,`${entry.qty} ${entry.unit||'支'}`,x+w/2,y+h-34,'bold 68px sans-serif',COLOR.navy,'center',w-40);
}
// 為避免 iOS 對超長 Canvas 的記憶體限制，每頁固定最多六項、輸出獨立 PNG。
export async function renderOrderPngPages(order,readImage){
 const groups=paginateOrderItems(order.items),output=[];
 const companyLogo=await loadCompanyLogo();
 for(let page=0;page<groups.length;page++){
  const items=groups[page];
  // 1800 px 讓三欄各保留原版的 450 × 420 px 照片顯示框。
  const W=1800,margin=55,gapX=22,headerH=360,rowH=688,rowGap=22,footerH=110;
  const cardW=(W-margin*2-gapX*2)/3,H=headerH+rowH*2+rowGap+footerH;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d',{alpha:false});if(!c)throw Error('此瀏覽器不支援圖片輸出');
  c.fillStyle='#ffffff';c.fillRect(0,0,W,H);
  c.fillStyle=COLOR.navy;c.fillRect(0,0,W,148);
  // v1.0.7：LOGO 保持透明與原圖比例，在 1800px 輸出頁面中精確水平置中。
  // 不重繪、不裁切、不填白底；日期、單號與頁碼維持原位置。
  if(companyLogo){
   const logoHeight=122;
   const logoWidth=logoHeight*(companyLogo.naturalWidth||companyLogo.width)/(companyLogo.naturalHeight||companyLogo.height);
   c.drawImage(companyLogo,(W-logoWidth)/2,12,logoWidth,logoHeight);
  }else text(c,'川昇淨水',W/2,98,'bold 66px sans-serif','#ffffff','center');
  // 按需求移除右上角「叫貨單」標題；日期、單號與頁碼沿用原位置。
  text(c,`供應商：${order.supplier||'未指定'}`,margin,219,'bold 38px sans-serif',COLOR.navy,'left',W-110);
  text(c,`叫貨日期：${order.date||''}`,margin,273,'32px sans-serif',COLOR.navy);
  text(c,`單號：${order.id||''}`,margin,320,'30px sans-serif',COLOR.muted,'left',W-450);
  text(c,`第 ${page+1} / ${groups.length} 張`,W-margin,320,'bold 30px sans-serif',COLOR.muted,'right');
  for(let i=0;i<items.length;i++){
   const entry=items[i],col=i%3,row=Math.floor(i/3);
   const x=margin+col*(cardW+gapX),y=headerH+row*(rowH+rowGap);
   let bitmap=null;
   if(entry.imageId){try{bitmap=await bitmapForBlob(await readImage(entry.imageId));}catch{}}
   try{drawCard(c,entry,x,y,cardW,rowH,bitmap);}finally{if(bitmap?.close)bitmap.close();}
  }
  const footerY=H-footerH+19;
  c.strokeStyle=COLOR.border;c.lineWidth=3;c.beginPath();c.moveTo(margin,footerY);c.lineTo(W-margin,footerY);c.stroke();
  text(c,`本張 ${items.length} 項 / ${items.reduce((s,x)=>s+Number(x.qty||0),0)} 件`,margin,footerY+48,'bold 30px sans-serif',COLOR.navy);
  text(c,'川昇淨水・請依圖片、貨號與數量備貨',W-margin,footerY+48,'28px sans-serif',COLOR.muted,'right');
  output.push({name:`叫貨單_${order.id}${groups.length>1?`_第${page+1}張`:''}.png`,blob:await imgToBlob(canvas)});
 }
 return output;
}
export function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
