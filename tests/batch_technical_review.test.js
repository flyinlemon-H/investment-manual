'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const Batch=require('../src/batch-technical-review.js');

const stocks=Array.from({length:10},(_,index)=>({
  id:`stock-${index+1}`,
  code:`TEST${index+1}.SS`,
  name:`测试标的 ${index+1}`,
  technicalReview:{finalTechnicalConclusion:`原结论 ${index+1}`}
}));

function loadSingleStockValidator(){
  const context={console,window:{},globalThis:null,setTimeout:()=>0,clearTimeout:()=>{}};
  context.globalThis=context;
  vm.createContext(context);
  const root=path.resolve(__dirname,'..');
  vm.runInContext(fs.readFileSync(path.join(root,'src/state.js'),'utf8'),context,{filename:'state.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'src/ui-render.js'),'utf8'),context,{filename:'ui-render.js'});
  vm.runInContext('globalThis.validator=validateSingleStockTechnicalReview;',context);
  return context.validator;
}

const singleStockValidator=loadSingleStockValidator();
const validReview=index=>({
  inputCoverage:{hasRecentKline:true,hasCycleKline:false},
  shortTermTechnical:{trendStatus:'sideways',technicalSummary:`技术摘要 ${index}`,supportLevels:[index],resistanceLevels:[index+1]},
  finalTechnicalConclusion:`技术结论 ${index}`
});
const envelope=items=>JSON.stringify({technicalReviews:items});
const item=(index,review=validReview(index))=>({symbol:`TEST${index}.SS`,technicalReview:review});

test('accepts a two-item valid batch and builds previews',()=>{
  const result=Batch.process(envelope([item(1),item(2)]),stocks,singleStockValidator);
  assert.equal(result.batchStatus,'valid');
  assert.deepEqual(result.summary,{total:2,valid:2,invalid:0,unknown:0,duplicate:0});
  assert.equal(result.items[0].preview.stockName,'测试标的 1');
  assert.equal(result.items[0].preview.summary,'技术结论 1');
});

test('handles a ten-item valid batch',()=>{
  const result=Batch.process(envelope(Array.from({length:10},(_,index)=>item(index+1))),stocks,singleStockValidator);
  assert.equal(result.batchStatus,'valid');
  assert.equal(result.summary.total,10);
  assert.equal(result.summary.valid,10);
  assert.equal(result.items.length,10);
});

test('rejects malformed and empty JSON without preview items',()=>{
  for(const raw of ['', '{"technicalReviews":[}', 'not json']){
    const result=Batch.process(raw,stocks,singleStockValidator);
    assert.equal(result.batchStatus,'invalid');
    assert.equal(result.error.code,'parse_error');
    assert.deepEqual(result.items,[]);
  }
});

test('rejects invalid top-level shapes',()=>{
  const cases=[
    ['[]','invalid_top_level'],
    ['{}','missing_technical_reviews'],
    ['{"technicalReviews":{}}','invalid_technical_reviews'],
    ['{"reviews":[]}','missing_technical_reviews']
  ];
  for(const [raw,code] of cases)assert.equal(Batch.process(raw,stocks,singleStockValidator).error.code,code);
});

test('uses exact stock symbols and never name or case fallback',()=>{
  const result=Batch.process(envelope([
    item(1),
    {symbol:'test2.ss',technicalReview:validReview(2)},
    {symbol:'测试标的 3',technicalReview:validReview(3)}
  ]),stocks,singleStockValidator);
  assert.deepEqual(result.items.map(entry=>entry.status),['valid','unknown_symbol','unknown_symbol']);
  assert.equal(result.items[0].matchedStock.symbol,'TEST1.SS');
});

test('normalizes only surrounding whitespace for symbol lookup',()=>{
  const result=Batch.process(envelope([{symbol:'  TEST1.SS  ',technicalReview:validReview(1)}]),stocks,singleStockValidator);
  assert.equal(result.items[0].status,'valid');
  assert.equal(result.items[0].symbol,'TEST1.SS');
});

test('uses stock.symbol when the existing stock has no code',()=>{
  const symbolOnly=[{id:'symbol-only',symbol:'ONLY.HK',name:'仅 symbol 标的'}];
  const result=Batch.process(envelope([{symbol:'ONLY.HK',technicalReview:validReview(1)}]),symbolOnly,singleStockValidator);
  assert.equal(result.items[0].status,'valid');
  assert.equal(result.items[0].matchedStock.symbol,'ONLY.HK');
});

test('reports later duplicate symbols without overwriting the first',()=>{
  const result=Batch.process(envelope([item(1),item(1)]),stocks,singleStockValidator);
  assert.deepEqual(result.items.map(entry=>entry.status),['valid','duplicate_symbol']);
  assert.deepEqual(result.summary,{total:2,valid:1,invalid:0,unknown:0,duplicate:1});
  assert.equal(result.batchStatus,'partial');
});

test('retains every invalid item with one stable classification and reason',()=>{
  const result=Batch.process(envelope([
    null,
    {},
    {symbol:'TEST1.SS'},
    {symbol:'UNKNOWN.SS',technicalReview:validReview(1)},
    {symbol:'TEST2.SS',technicalReview:[]}
  ]),stocks,singleStockValidator);
  assert.deepEqual(result.items.map(entry=>entry.status),[
    'invalid_item','missing_symbol','missing_technical_review','unknown_symbol','invalid_schema'
  ]);
  assert(result.items.every(entry=>entry.reason));
  assert.deepEqual(result.summary,{total:5,valid:0,invalid:4,unknown:1,duplicate:0});
});

test('shows mixed batch failures and consistent summary',()=>{
  const result=Batch.process(envelope([
    item(1),
    {symbol:'UNKNOWN.SS',technicalReview:validReview(2)},
    {symbol:'TEST2.SS',technicalReview:[]},
    item(1)
  ]),stocks,singleStockValidator);
  assert.equal(result.batchStatus,'partial');
  assert.deepEqual(result.summary,{total:4,valid:1,invalid:1,unknown:1,duplicate:1});
  assert.equal(result.items.length,4);
});

test('batch validity matches the existing single-stock validator',()=>{
  const accepted=validReview(1);
  const rejected=[];
  const directAccepted=singleStockValidator(accepted,stocks[0]);
  const directRejected=singleStockValidator(rejected,stocks[0]);
  const result=Batch.process(envelope([
    {symbol:'TEST1.SS',technicalReview:accepted},
    {symbol:'TEST2.SS',technicalReview:rejected}
  ]),stocks,singleStockValidator);
  assert.equal(result.items[0].status,directAccepted.valid?'valid':'invalid_schema');
  assert.equal(result.items[1].status,directRejected.valid?'valid':'invalid_schema');
  assert.equal(result.items[0].technicalReview.finalTechnicalConclusion,directAccepted.normalized.finalTechnicalConclusion);
});

test('parse, validation, failures, and preview do not mutate stock state',()=>{
  const before=JSON.stringify(stocks);
  Batch.process(envelope([item(1),{symbol:'UNKNOWN.SS',technicalReview:{}}]),stocks,singleStockValidator);
  Batch.process('{bad json',stocks,singleStockValidator);
  assert.equal(JSON.stringify(stocks),before);
});

test('fails closed when the authoritative validator is unavailable',()=>{
  const result=Batch.process(envelope([item(1)]),stocks,null);
  assert.equal(result.batchStatus,'invalid');
  assert.equal(result.error.code,'validator_unavailable');
});

test('ambiguous existing stock symbols are not auto-selected',()=>{
  const duplicatedStocks=[stocks[0],{...stocks[0],id:'other'}];
  const result=Batch.process(envelope([item(1)]),duplicatedStocks,singleStockValidator);
  assert.equal(result.items[0].status,'unknown_symbol');
  assert.match(result.items[0].reason,/不唯一/);
});

test('rendered preview exposes summary and every failure reason',()=>{
  const result=Batch.process(envelope([item(1),{symbol:'UNKNOWN.SS',technicalReview:{}}]),stocks,singleStockValidator);
  const html=Batch.renderResult(result);
  assert.match(html,/总计 2/);
  assert.match(html,/unknown_symbol/);
  assert.match(html,/未找到 exact symbol/);
  assert.doesNotMatch(html,/保存成功|导入成功/);
});

test('foundation source has no persistence calls and UI exposes preview only',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/batch-technical-review.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  assert.doesNotMatch(source,/saveState\s*\(|localStorage\s*\.|indexedDB\s*\.|criticalSave\s*\(/);
  assert.match(source,/解析并预览/);
  assert.match(html,/batchTechnicalReviewBtn/);
  assert.match(html,/src\/batch-technical-review\.js/);
});
