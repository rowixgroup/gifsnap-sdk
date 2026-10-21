import test from 'node:test';
import assert from 'node:assert/strict';
import { createGifSnapClient, gifImageSources, parseAnimatedPreview } from '../dist/index.js';
const small = { url:'https://cdn.example/small.webp', mime_type:'image/webp', width:160, height:120, byte_size:16000, animated:true };
const gif = { id:'one', title:'Hello', url:'https://cdn.example/original.gif?exact=1', preview_url:'https://cdn.example/poster.webp', width:640, height:480, type:'gif' };
test('small animation is first, while the original send URL and optional metadata stay intact', async()=>{
 const item={...gif, animated_preview:small, provider_extra:'kept'};
 const response={data:[item],pagination:{page:1,limit:24,total:1,has_next:false,next_page:null,offset:0}};
 const result=await createGifSnapClient({fetch:async()=>new Response(JSON.stringify(response))}).trending();
 assert.deepEqual(result.data[0],item);
 assert.deepEqual(gifImageSources(result.data[0]),[small.url,gif.url,gif.preview_url]);
 assert.equal(result.data[0].url,gif.url);
});
test('unsafe, static, oversized and mislabeled previews fall back without rejecting a usable GIF',async()=>{
 for(const preview of [null,{}, {...small,animated:false},{...small,width:481},{...small,byte_size:524289},{...small,url:'javascript:alert(1)'},{...small,url:'https://user:pass@cdn.example/s.webp'},{...small,url:'https://cdn.example/static.jpg'}]) {
  assert.equal(parseAnimatedPreview(preview),undefined);
  assert.deepEqual(gifImageSources({...gif,animated_preview:preview}),[gif.url,gif.preview_url]);
  const result=await createGifSnapClient({fetch:async()=>new Response(JSON.stringify({data:[{...gif,animated_preview:preview}],pagination:{page:1,limit:24,total:1,has_next:false,next_page:null,offset:0}}))}).trending();
  assert.equal(result.data[0].animated_preview,undefined); assert.equal(result.data[0].url,gif.url);
 }
});
test('image candidates do not load video into img and do not retry identical URLs',()=>{
 assert.deepEqual(gifImageSources({...gif,animated_preview:{...small,url:'https://cdn.example/small.mp4',mime_type:'video/mp4'}}),[gif.url,gif.preview_url]);
 assert.deepEqual(gifImageSources({...gif,preview_url:gif.url,animated_preview:{...small,url:gif.url,mime_type:'image/gif'}}),[gif.url]);
});
