const DB_NAME='chuansheng-orders-v1',DB_VERSION=1;
let dbPromise;
const now=()=>new Date().toISOString();
const startingProducts=[
 ['G001','PP 棉1u-PP-04B',2,'2026-07-13','2026-07-14'],
 ['G002','CTO活性碳-CC-05',2,'2026-07-13','2026-07-14'],
 ['G003','GAC活性碳-CC-08',2,'2026-07-13','2026-07-14'],
 ['G004','RO膜100G-RM-03C',0,'',''],
 ['G005','麥飯石-JE47062快接',0,'',''],
 ['G006','麥飯石-4合1遠紅外線礦物能量濾心-CC16',0,'',''],
 ['G007','鹼性分子-PP-18',0,'',''],
 ['G008','氫分子-HE-100',0,'',''],
 ['G011','RO膜600G-RM15',0,'','']
];
const seedSupplier='泰普樂國際有限公司';
export function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   for(const [name,key] of [['products','code'],['images','id'],['orders','id'],['kv','key'],['suppliers','name']]){
    if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:key});
   }
   const products=req.transaction.objectStore('products');
   for(const [code,name,stock,lastIn,lastOut] of startingProducts){
    products.put({code,name,unit:'支',stock,supplier:seedSupplier,lastIn,lastOut,imageId:null,enabled:true,updatedAt:now()});
   }
   req.transaction.objectStore('suppliers').put({name:seedSupplier,note:''});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>{dbPromise=null;reject(req.error)};
  req.onblocked=()=>console.warn('資料庫升級遭其他頁面阻擋');
 });return dbPromise;
}
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
export async function all(store){const db=await openDB();return request(db.transaction(store,'readonly').objectStore(store).getAll());}
export async function get(store,key){const db=await openDB();return request(db.transaction(store,'readonly').objectStore(store).get(key));}
export async function put(store,value){const db=await openDB();return request(db.transaction(store,'readwrite').objectStore(store).put(value));}
export async function remove(store,key){const db=await openDB();return request(db.transaction(store,'readwrite').objectStore(store).delete(key));}
export async function getKV(key,fallback=null){return (await get('kv',key))?.value??fallback;}
export async function setKV(key,value){return put('kv',{key,value});}
export async function replaceBackup(payload){
 const db=await openDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['products','images','orders','kv','suppliers'],'readwrite');
  for(const table of ['products','images','orders','kv','suppliers']){
   const store=tx.objectStore(table);store.clear();for(const obj of payload[table])store.put(obj);
  }
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('交易中止'));
 });
}
// 照片與貨號關聯以單一交易儲存；寫入失敗時保留既有照片及商品資料。
export async function saveProductPhoto(code,blob){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['products','images'],'readwrite');
  const products=tx.objectStore('products'),images=tx.objectStore('images');
  let imageId=null,problem=null;
  const query=products.get(code);
  query.onsuccess=()=>{
   try{
    const rec=query.result;
    if(!rec)throw new Error('貨品已不存在，無法儲存照片');
    imageId=rec.imageId||`img_${globalThis.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2)}`;
    const updatedAt=now();
    images.put({id:imageId,blob,updatedAt});
    products.put({...rec,imageId,updatedAt});
   }catch(e){problem=e;tx.abort();}
  };
  tx.oncomplete=()=>resolve(imageId);
  tx.onabort=()=>reject(problem||tx.error||new Error('照片儲存失敗，舊照片未變更'));
 });
}
export const supplierDefault=seedSupplier;
