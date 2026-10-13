const express=require('express'),fs=require('fs'),path=require('path');
const app=express();app.use(express.json({limit:'50kb'}));
const PASS=process.env.OFFICE_PASSWORD||'changeme';
let store;
if(process.env.DATABASE_URL){
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:/render\.com/.test(process.env.DATABASE_URL)?{rejectUnauthorized:false}:false});
  store={init:()=>pool.query('create table if not exists bookings(id bigint primary key,data jsonb not null)'),
    all:async()=>(await pool.query('select data from bookings order by id desc')).rows.map(r=>r.data),
    put:b=>pool.query('insert into bookings(id,data) values($1,$2) on conflict(id) do update set data=$2',[b.id,b]),
    del:id=>pool.query('delete from bookings where id=$1',[id])};
}else{ // local testing without a database: saves to data.json
  const f='data.json';let d=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):{};const w=()=>fs.writeFileSync(f,JSON.stringify(d));
  store={init:async()=>{},all:async()=>Object.values(d).sort((a,b)=>b.id-a.id),put:async b=>{d[b.id]=b;w()},del:async id=>{delete d[id];w()}};
}
function auth(req,res,next){
  const h=req.headers.authorization||'';
  if(h.startsWith('Basic ')){const s=Buffer.from(h.slice(6),'base64').toString();if(s.slice(s.indexOf(':')+1)===PASS)return next();}
  res.set('WWW-Authenticate','Basic realm="PR Tire Office"').status(401).send('Login required');
}
const clean=(v,n=200)=>String(v||'').slice(0,n);
// PUBLIC: customer booking request
app.post('/api/book',async(req,res)=>{
  const r=req.body||{},qty=parseInt(r.qty);
  if(!clean(r.phone)||!(qty>0&&qty<=500))return res.status(400).json({error:'Phone and number of tyres required'});
  const b={id:Date.now(),name:clean(r.name),phone:clean(r.phone,30),type:r.type=='Fleet'?'Fleet':'Retail',company:clean(r.company),vehicle:clean(r.vehicle),size:clean(r.size),qty,loc:clean(r.loc),date:clean(r.date,50),time:clean(r.time,20),status:'New',paid:false,created:new Date().toISOString().slice(0,10)};
  await store.put(b);res.json({ok:true});
});
// PRIVATE: office dashboard + data (password protected)
app.get('/office',auth,(q,s)=>s.sendFile(path.join(__dirname,'private','office.html')));
app.get('/api/bookings',auth,async(q,s)=>s.json(await store.all()));
app.put('/api/bookings/:id',auth,async(q,s)=>{const b=q.body;b.id=+q.params.id;await store.put(b);s.json({ok:true})});
app.delete('/api/bookings/:id',auth,async(q,s)=>{await store.del(+q.params.id);s.json({ok:true})});
app.use(express.static('public')); // customer page only
store.init().then(()=>app.listen(process.env.PORT||3000,()=>console.log('PR Tire running')));
