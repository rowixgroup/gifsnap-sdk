import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://consumer.example' });
for (const key of ['window','document','HTMLElement','HTMLImageElement','Node','Event','MouseEvent']) globalThis[key] = dom.window[key];
await import('@angular/compiler');
const { TestBed } = await import('@angular/core/testing');
const { BrowserTestingModule, platformBrowserTesting } = await import('@angular/platform-browser/testing');
const { PLATFORM_ID, provideZonelessChangeDetection } = await import('@angular/core');
const { GifSnapPicker, GifSnapError } = await import('../dist/fesm2022/rowix-gifsnap-angular.mjs');
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterEach(() => { TestBed.resetTestingModule(); document.body.innerHTML = ''; });
const gif = (id='one', overrides={}) => ({ id, title:`Title ${id}`, url:`https://media.example/${id}.webp?animation=full`, preview_url:`https://media.example/${id}-preview.webp`, width:200, height:160, type:'gif', source:'Provider', ...overrides });
const body = (items=[gif()], page=1, next=null) => ({ data:items, pagination:{page,limit:24,total:50,has_next:next!==null,next_page:next,offset:(page-1)*24} });
const deferred = () => { let resolve,reject; const promise=new Promise((r,j)=>{resolve=r;reject=j}); return {promise,resolve,reject}; };
const client = overrides => ({search:async()=>body(),trending:async()=>body(),searchStickers:async()=>body([gif('sticker',{type:'sticker'})]),trendingStickers:async()=>body([gif('sticker',{type:'sticker'})]),...overrides});
async function setup(api=client(), inputs={}, server=false) {
 TestBed.configureTestingModule({imports:[GifSnapPicker], providers:[provideZonelessChangeDetection(),...(server?[{provide:PLATFORM_ID,useValue:'server'}]:[])]});
 const fixture=TestBed.createComponent(GifSnapPicker);
 fixture.componentRef.setInput('client',api);
 for(const [key,value] of Object.entries(inputs)) fixture.componentRef.setInput(key,value);
 fixture.detectChanges(); await settle(fixture); return fixture;
}
async function settle(fixture) { await new Promise(resolve=>setImmediate(resolve)); fixture.detectChanges(); }
function search(fixture,query) {
 const input=fixture.nativeElement.querySelector('input'); input.value=query; input.dispatchEvent(new Event('input',{bubbles:true}));
 fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
}
const cards=f=>[...f.nativeElement.querySelectorAll('.gifsnap-picker__card')];

test('renders animated full URL, accessible controls and GifSnap link without provider labels while retaining selection metadata',async()=>{
 const item=gif('one',{content_id:'provider:1',provider_url:'https://provider.example/1'});
 const f=await setup(client({trending:async()=>body([item])}),{theme:'dark'});
 const input=f.nativeElement.querySelector('input'); assert.equal(input.closest('label').textContent.trim(),'Search GIFs');
 assert.equal(f.nativeElement.querySelector('section').dataset.theme,'dark');
 assert.equal(f.nativeElement.querySelector('img').getAttribute('src'),item.url);
 assert.doesNotMatch(f.nativeElement.textContent,/Source:|Provider attribution|Provider/);
 assert.equal(f.nativeElement.querySelector('.gifsnap-picker__source'),null);
 assert.match(f.nativeElement.querySelector('a').textContent,/Powered by GifSnap/);
 assert.equal(f.nativeElement.querySelector('a').href,'https://gifsnap.com/');
 let selected; f.componentInstance.gifSelect.subscribe(value=>selected=value); cards(f)[0].click(); assert.equal(selected,item); assert.equal(selected.source,'Provider');
 assert.equal(f.nativeElement.querySelector('[role="status"]').textContent.trim(),'1 GIFs ready to select');
});

test('full media errors try distinct preview once then stop; changed result resets attempts',async()=>{
 const f=await setup();
 f.nativeElement.querySelector('img').dispatchEvent(new Event('error')); await settle(f);
 assert.equal(f.nativeElement.querySelector('img').getAttribute('src'),gif().preview_url);
 f.nativeElement.querySelector('img').dispatchEvent(new Event('error')); await settle(f);
 assert.equal(f.nativeElement.querySelector('img'),null); assert.match(f.nativeElement.textContent,/Preview unavailable/);
 search(f,'fresh'); await settle(f); assert.equal(f.nativeElement.querySelector('img').getAttribute('src'),gif().url);
});

test('identical full/preview URLs have only one bounded image attempt',async()=>{
 const item=gif(); item.preview_url=item.url;
 const f=await setup(client({trending:async()=>body([item])}));
 f.nativeElement.querySelector('img').dispatchEvent(new Event('error')); await settle(f);
 assert.equal(f.nativeElement.querySelector('img'),null);
});

test('append keeps first records and DOM, deduplicates id/full URL/content_id, preserves meaningful URL queries',async()=>{
 const first=gif('a',{content_id:'verified:a'}), distinct=gif('b');
 const requests=[];
 const f=await setup(client({trending:async args=>{requests.push(args.page); return args.page===1 ? body([first,distinct],1,2) : body([gif('alias',{content_id:'verified:a'}),gif('same-url',{url:distinct.url}),gif('c',{url:distinct.url+'&different=1'})],2,null);}}));
 const firstNode=cards(f)[0]; f.nativeElement.querySelector('.gifsnap-picker__more').click(); await settle(f);
 assert.deepEqual(requests,[1,2]); assert.equal(cards(f).length,3); assert.equal(cards(f)[0],firstNode); assert.equal(f.componentInstance.state().items[0],first);
 assert.equal(f.nativeElement.querySelector('.gifsnap-picker__more'),null);
});

test('optimistic empty or duplicate-only pages stop pagination',async()=>{
 for(const empty of [true,false]) {
  const f=await setup(client({trending:async args=>args.page===1?body([gif()],1,2):body(empty?[]:[gif()],2,3)}));
  f.nativeElement.querySelector('.gifsnap-picker__more').click(); await settle(f);
  assert.equal(cards(f).length,1); assert.equal(f.nativeElement.querySelector('.gifsnap-picker__more'),null);
  f.destroy(); TestBed.resetTestingModule();
 }
});

test('new search aborts pending request and ignores stale custom client result',async()=>{
 const old=deferred(); let oldSignal;
 const f=await setup(client({trending:args=>{oldSignal=args.signal;return old.promise;},search:async args=>body([gif(args.query)])}));
 search(f,'fresh'); await settle(f); assert.equal(oldSignal.aborted,true); assert.match(cards(f)[0].textContent,/Title fresh/);
 old.resolve(body([gif('stale')])); await settle(f); assert.equal(cards(f).length,1); assert.match(cards(f)[0].textContent,/Title fresh/);
});

test('429 retry repeats failed page; duplicate clicks cannot start parallel pagination',async()=>{
 let calls=0; const pending=deferred();
 const f=await setup(client({trending:async args=>{
  calls++; if(calls===1)return body([gif()],1,2);
  if(calls===2)throw new GifSnapError('Limited',{code:'http',status:429,retryAfterSeconds:12});
  return pending.promise;
 }}));
 f.nativeElement.querySelector('.gifsnap-picker__more').click(); await settle(f);
 assert.match(f.nativeElement.querySelector('[role="alert"]').textContent,/12 seconds/); assert.equal(cards(f).length,1);
 f.nativeElement.querySelector('[role="alert"] button').click(); f.componentInstance.more(); await settle(f); assert.equal(calls,3);
 pending.resolve(body([gif('two')],2,null)); await settle(f); assert.equal(cards(f).length,2);
});

test('sticker mode chooses sticker endpoints and reset returns to sticker trending',async()=>{
 const calls=[]; const f=await setup(client({trendingStickers:async()=>{calls.push('trending');return body([gif('s',{type:'sticker'})]);},searchStickers:async args=>{calls.push(args.query);return body([gif('search',{type:'sticker'})]);}}),{mediaType:'sticker',theme:'system'});
 search(f,' hi '); await settle(f); f.nativeElement.querySelector('.gifsnap-picker__reset').click(); await settle(f);
 assert.deepEqual(calls,['trending','hi','trending']); assert.match(f.nativeElement.querySelector('label').textContent,/Search stickers/);
});

test('changed client/media inputs reset pagination; invalid page size uses safe default',async()=>{
 let options;
 const f=await setup(client({trending:async args=>{options=args;return body([gif()],1,2);}}),{pageSize:500});
 assert.equal(options.limit,24);
 f.componentRef.setInput('client',client({trending:async args=>{options=args;return body([gif('new')]);}}));
 f.detectChanges(); await settle(f); assert.equal(options.page,1); assert.match(cards(f)[0].textContent,/Title new/);
});

test('destroy aborts active work and server rendering never requests media',async()=>{
 let calls=0,signal; const api=client({trending:args=>{calls++;signal=args.signal;return new Promise(()=>{});}});
 const f=await setup(api); f.destroy(); assert.equal(signal.aborted,true);
 TestBed.resetTestingModule(); const server=await setup(api,{},true); assert.equal(calls,1); assert.equal(cards(server).length,0);
});
