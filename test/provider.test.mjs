import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';
import {ROOT, build, manifest} from '../scripts/project.mjs';
const fixture = {"results": [{"id": 11, "title": "Moon & stars", "overview": "A story", "release_date": "2009-07-10", "original_language": "en", "poster_path": "/ExamplePoster123.jpg"}, {"id": 11, "title": "Duplicate"}, {"id": null, "title": "Invalid"}], "total_pages": 2};
const kind = "movie", local = "movie.11", origin = "https://api.themoviedb.org";
const value = await manifest();
const artifact = JSON.parse(await readFile(await build(), 'utf8'));
function invoke(params = {}, options = {}) {
  const calls = [];
  const context = createContext({__hostCall: raw => {
    const request = JSON.parse(raw); calls.push(request);
    if (request.method === 'settings.effective') return JSON.stringify({v:1,id:request.id,result:{value:options.approved !== false,source:null,revision:0}});
    assert.ok(['http.get','http.post'].includes(request.method));
    assert.equal(new URL(request.params.url).origin, origin);
    return JSON.stringify({v:1,id:request.id,...(options.denied ? {error:{code:'permission_denied'}} :
      {result:{status:options.status ?? 200,body:options.body ?? (options.large && !request.params.url.includes('/search/') ? JSON.stringify({credits:{crew:[{job:'Director',name:'Jane Director'}],cast:Array.from({length:500},(_,i)=>({id:i,name:'Actor '+i,character:'A supporting character in the movie'}))},genres:[{name:'Adventure'}],poster_path:'/ExamplePoster123.jpg',backdrop_path:'/ExampleBackdrop.jpg'}) : JSON.stringify(request.params.url.includes('/search/') ? fixture : {genres:[{name:'Science Fiction'},{name:'Drama'}],credits:{crew:[{job:'Director',name:'Jane Director'},{job:'Writer',name:'Someone Else'}]},poster_path:'/ExamplePoster123.jpg',backdrop_path:'/ExampleBackdrop.jpg'}))}})});
  }});
  runInContext(artifact.code, context, {timeout:1000});
  const request = {v:1,id:'search',method:'metadata.search',params:{query:'Moon & stars',kind,...params}};
  return {response:JSON.parse(JSON.stringify(runInContext(`multiplexrEntry(${JSON.stringify(request)})`,context,{timeout:1000}))),calls};
}
test('installed bundle registers a real provider and normalizes bounded unique candidates', () => {
  assert.equal(value.contributions[0].family, 'metadata.provider');
  assert.ok(value.contributions[0].kinds.includes(kind));
  const {response,calls}=invoke();
  assert.equal(response.result.items.length, 1);
  assert.equal(response.result.items[0].id, value.id + ':' + local);
  assert.equal(response.result.items[0].title, 'Moon & stars');
  assert.deepEqual(response.result.items[0].fields.genres, ['Science Fiction', 'Drama']);
  assert.equal(response.result.items[0].fields.director, 'Jane Director');
  assert.equal(calls.filter(c=>c.method.startsWith('http.')).length, 2);
  assert.equal(response.result.nextCursor, "2");
  const http=calls.find(c=>c.method.startsWith('http.'));
  if (kind==='movie' || origin.includes('openlibrary') || origin.includes('audible')) assert.ok(http.params.url.includes('Moon%20%26%20stars'));
  if (origin.includes('themoviedb')) assert.equal(http.params.credential,true);
  if (origin.includes('audiobookdb')) {
    assert.equal(http.method,'http.post'); assert.equal(http.params.credential,'apiKey');
    assert.equal(JSON.parse(http.params.body).q,'Moon & stars');
  }
});
test('unsupported media and invalid cursors never reach the network', () => {
  for (const params of [{kind:'musicTrack'},{cursor:'bad'},{cursor:'-1'},{cursor:'1.5'}]) {
    const {response,calls}=invoke(params); assert.ok(response.error); assert.equal(calls.filter(c=>c.method.startsWith('http.')).length,0);
  }
});
test('denied credentials, service failures and invalid payloads keep stable errors', () => {
  for (const [options,code] of [[{denied:true},'permission_denied'],[{status:401},'permission_denied'],[{status:429},'resource_limit'],[{status:503},'runtime_failure'],[{body:'<html>secret</html>'},'invalid_response'],[{body:'{}'},'invalid_response']]) {
    const {response}=invoke({},options); assert.equal(response.error.code,code); assert.ok(!JSON.stringify(response).includes('secret'));
  }
});

test('movie candidates carry an owned poster handle', () => {
  const {response} = invoke();
  assert.equal(response.result.items[0].artwork, value.id + ':images.ExamplePoster123.ExampleBackdrop');
});
test('poster resolution returns only the approved image URL and never sends credentials', () => {
  let calls = 0;
  const context = createContext({__hostCall: () => { calls++; throw Error('Unexpected network request'); }});
  runInContext(artifact.code, context, {timeout:1000});
  const input = {v:1,id:'poster',method:'artwork.search',params:{title:'opaque',roles:['poster'],artwork:value.id+':poster.ExamplePoster123'}};
  const response = JSON.parse(JSON.stringify(runInContext(`multiplexrEntry(${JSON.stringify(input)})`,context,{timeout:1000})));
  assert.equal(response.result.items[0].url, 'https://image.tmdb.org/t/p/w342/ExamplePoster123.jpg');
  assert.equal(calls, 0);
  input.params.artwork = 'org.foreign:poster.ExamplePoster123';
  const bad = JSON.parse(JSON.stringify(runInContext(`multiplexrEntry(${JSON.stringify(input)})`,context,{timeout:1000})));
  assert.ok(bad.error);
});

 test('combined image handle resolves both roles without network credentials', () => {
  const context = createContext({__hostCall: () => {throw Error('Unexpected network request');}});
  runInContext(artifact.code, context);
  const input = {v:1,id:'images',method:'artwork.search',params:{title:'opaque',roles:['poster','backdrop'],artwork:value.id+':images.ExamplePoster123.ExampleBackdrop'}};
  const response = JSON.parse(JSON.stringify(runInContext(`multiplexrEntry(${JSON.stringify(input)})`,context)));
  assert.deepEqual(response.result.items.map(i=>i.role), ['poster','backdrop']);
  assert.equal(response.result.items[1].url,'https://image.tmdb.org/t/p/w780/ExampleBackdrop.jpg');
});
 test('search pagination bounds detail calls and advances within the TMDB page', () => {
  const body = JSON.stringify({results:Array.from({length:20},(_,i)=>({id:i+1,title:'Film '+i})),total_pages:1});
  const {response,calls}=invoke({cursor:'2'}, {body});
  assert.equal(response.result.items[0].id,value.id+':movie.6');
  assert.equal(response.result.items.length,5);
  assert.equal(response.result.nextCursor,'3');
  assert.equal(calls.filter(c=>c.method.startsWith('http.')).length,6);
});

test('large TMDB credits pass through the signed bundle host transport', () => {
  const {response}=invoke({}, {large:true});
  assert.equal(response.error,undefined);
  assert.equal(response.result.items[0].fields.director,'Jane Director');
  assert.deepEqual(response.result.items[0].fields.genres,['Adventure']);
});
