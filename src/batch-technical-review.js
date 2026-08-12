(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BatchTechnicalReview=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STATUS=Object.freeze({
    VALID:'valid',
    INVALID_SCHEMA:'invalid_schema',
    UNKNOWN_SYMBOL:'unknown_symbol',
    DUPLICATE_SYMBOL:'duplicate_symbol',
    INVALID_ITEM:'invalid_item',
    MISSING_SYMBOL:'missing_symbol',
    MISSING_TECHNICAL_REVIEW:'missing_technical_review'
  });

  function emptySummary(){
    return {total:0,valid:0,invalid:0,unknown:0,duplicate:0};
  }

  function invalidBatch(code,reason){
    return {batchStatus:'invalid',summary:emptySummary(),items:[],error:{code,reason}};
  }

  function stockSymbol(stock){
    return String(stock&&(stock.code||stock.symbol)||'').trim();
  }

  function buildStockIndex(stocks){
    const index=new Map();
    const ambiguous=new Set();
    (Array.isArray(stocks)?stocks:[]).forEach(stock=>{
      const symbol=stockSymbol(stock);
      if(!symbol)return;
      if(index.has(symbol))ambiguous.add(symbol);
      else index.set(symbol,stock);
    });
    ambiguous.forEach(symbol=>index.delete(symbol));
    return {index,ambiguous};
  }

  function previewFor(stock,symbol,review){
    const shortTerm=review&&review.shortTermTechnical&&typeof review.shortTermTechnical==='object'?review.shortTermTechnical:{};
    const cycle=review&&review.cycleTechnical&&typeof review.cycleTechnical==='object'?review.cycleTechnical:{};
    return {
      symbol,
      stockName:String(stock&&(stock.name||stock.code||stock.symbol)||symbol),
      validationStatus:STATUS.VALID,
      batchStatus:'pending',
      summary:String(review&&(review.finalTechnicalConclusion||shortTerm.technicalSummary)||''),
      trendStatus:String(shortTerm.trendStatus||''),
      cyclePosition:String(cycle.cyclePosition||''),
      supportLevels:Array.isArray(shortTerm.supportLevels)?shortTerm.supportLevels.slice():[],
      resistanceLevels:Array.isArray(shortTerm.resistanceLevels)?shortTerm.resistanceLevels.slice():[]
    };
  }

  function classifyItem(item,index,stockLookup,seen,validateTechnicalReview){
    const base={index,symbol:'',matchedStock:null,status:STATUS.INVALID_ITEM,reason:'',technicalReview:null,preview:null};
    if(!item||typeof item!=='object'||Array.isArray(item)){
      return {...base,reason:'Item 必须是对象。'};
    }
    if(typeof item.symbol!=='string'||!item.symbol.trim()){
      return {...base,status:STATUS.MISSING_SYMBOL,reason:'缺少非空字符串 symbol。',technicalReview:item.technicalReview??null};
    }
    const symbol=item.symbol.trim();
    base.symbol=symbol;
    base.technicalReview=item.technicalReview??null;
    if(!Object.prototype.hasOwnProperty.call(item,'technicalReview')){
      return {...base,status:STATUS.MISSING_TECHNICAL_REVIEW,reason:'缺少 technicalReview。'};
    }
    if(seen.has(symbol)){
      return {...base,status:STATUS.DUPLICATE_SYMBOL,reason:`symbol ${symbol} 在本批次中重复。`};
    }
    seen.add(symbol);
    if(stockLookup.ambiguous.has(symbol)){
      return {...base,status:STATUS.UNKNOWN_SYMBOL,reason:`现有股票中 symbol ${symbol} 不唯一，无法安全匹配。`};
    }
    const stock=stockLookup.index.get(symbol);
    if(!stock){
      return {...base,status:STATUS.UNKNOWN_SYMBOL,reason:`未找到 exact symbol：${symbol}。`};
    }
    const matchedStock={id:stock.id??null,symbol:stockSymbol(stock),name:String(stock.name||'')};
    let validation;
    try{
      validation=validateTechnicalReview(item.technicalReview,stock);
    }catch(error){
      validation={valid:false,error:error&&error.message?error.message:String(error)};
    }
    if(!validation||validation.valid!==true){
      return {...base,matchedStock,status:STATUS.INVALID_SCHEMA,reason:String(validation&&validation.error||'technicalReview 未通过单股校验。')};
    }
    const normalized=validation.normalized;
    return {...base,matchedStock,status:STATUS.VALID,reason:'已通过单股 technicalReview 校验。',technicalReview:normalized,preview:previewFor(stock,symbol,normalized)};
  }

  function summarize(items){
    const summary=emptySummary();
    summary.total=items.length;
    items.forEach(item=>{
      if(item.status===STATUS.VALID)summary.valid++;
      else if(item.status===STATUS.UNKNOWN_SYMBOL)summary.unknown++;
      else if(item.status===STATUS.DUPLICATE_SYMBOL)summary.duplicate++;
      else summary.invalid++;
    });
    return summary;
  }

  function process(rawJson,stocks,validateTechnicalReview){
    if(typeof validateTechnicalReview!=='function')return invalidBatch('validator_unavailable','单股 technicalReview validator 不可用。');
    let envelope;
    try{
      const text=String(rawJson??'').trim();
      if(!text)throw new Error('输入为空。');
      envelope=JSON.parse(text);
    }catch(error){
      return invalidBatch('parse_error',`JSON 解析失败：${error&&error.message?error.message:String(error)}`);
    }
    if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)){
      return invalidBatch('invalid_top_level','顶层必须是包含 technicalReviews 数组的对象。');
    }
    if(!Object.prototype.hasOwnProperty.call(envelope,'technicalReviews')){
      return invalidBatch('missing_technical_reviews','顶层缺少 technicalReviews。');
    }
    if(!Array.isArray(envelope.technicalReviews)){
      return invalidBatch('invalid_technical_reviews','technicalReviews 必须是数组。');
    }
    const stockLookup=buildStockIndex(stocks);
    const seen=new Set();
    const items=envelope.technicalReviews.map((item,index)=>classifyItem(item,index,stockLookup,seen,validateTechnicalReview));
    const summary=summarize(items);
    const batchStatus=summary.total>0&&summary.valid===summary.total?'valid':(summary.valid>0?'partial':'invalid');
    items.forEach(item=>{if(item.preview)item.preview.batchStatus=batchStatus});
    return {batchStatus,summary,items,error:null};
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function renderResult(result){
    if(!result)return '';
    if(result.error)return `<div class="hint"><b>批次无效</b><div class="card-note">${escapeHtml(result.error.reason)}</div></div>`;
    const s=result.summary;
    const summary=`<div class="hint"><b>批次状态：${escapeHtml(result.batchStatus)}</b><div class="card-note">总计 ${s.total} · 有效 ${s.valid} · 无效 ${s.invalid} · 未知 ${s.unknown} · 重复 ${s.duplicate}</div></div>`;
    const items=result.items.map(item=>{
      const title=item.matchedStock&&item.matchedStock.name?`${item.matchedStock.name} · ${item.symbol}`:(item.symbol||`第 ${item.index+1} 项`);
      const preview=item.preview?`<div class="card-note">${escapeHtml(item.preview.summary||'暂无结论摘要')}</div><div class="card-note">趋势 ${escapeHtml(item.preview.trendStatus||'—')} · 周期 ${escapeHtml(item.preview.cyclePosition||'—')}</div>`:'';
      return `<div class="card" style="margin:10px 0"><div class="card-title">${escapeHtml(title)} · ${escapeHtml(item.status)}</div><div class="card-note">${escapeHtml(item.reason)}</div>${preview}</div>`;
    }).join('');
    return summary+items;
  }

  return {STATUS,process,renderResult,buildStockIndex};
});

(function(root){
  'use strict';
  if(!root||!root.document)return;

  function ensureModal(){
    let modal=document.getElementById('batchTechnicalReviewModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.className='modal-bg import-layer';
    modal.id='batchTechnicalReviewModal';
    modal.innerHTML=`<div class="modal"><h2>批量技术复核预览</h2><div class="modal-sub">仅解析、严格匹配、校验和预览；不会修改或保存任何投资数据。</div><div class="form-row"><label>批量 JSON</label><textarea id="batchTechnicalReviewText" style="min-height:260px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{"technicalReviews":[{"symbol":"601138.SS","technicalReview":{}}]}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="batchTechnicalReviewCloseBtn" type="button">关闭</button><button class="btn" id="batchTechnicalReviewPreviewBtn" type="button">解析并预览</button></div><div id="batchTechnicalReviewResult" style="margin-top:14px"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
    document.getElementById('batchTechnicalReviewCloseBtn').addEventListener('click',closeModal);
    document.getElementById('batchTechnicalReviewPreviewBtn').addEventListener('click',previewBatch);
    return modal;
  }

  function openModal(){
    const modal=ensureModal();
    document.getElementById('batchTechnicalReviewResult').innerHTML='';
    modal.classList.add('show');
    setTimeout(()=>document.getElementById('batchTechnicalReviewText').focus(),50);
  }

  function closeModal(){
    const modal=document.getElementById('batchTechnicalReviewModal');
    if(modal)modal.classList.remove('show');
  }

  function previewBatch(){
    const raw=document.getElementById('batchTechnicalReviewText').value;
    const stocks=(typeof state!=='undefined'&&state&&Array.isArray(state.stocks))?state.stocks:[];
    const validator=typeof validateSingleStockTechnicalReview==='function'?validateSingleStockTechnicalReview:null;
    const result=root.BatchTechnicalReview.process(raw,stocks,validator);
    document.getElementById('batchTechnicalReviewResult').innerHTML=root.BatchTechnicalReview.renderResult(result);
  }

  const button=document.getElementById('batchTechnicalReviewBtn');
  if(button)button.addEventListener('click',openModal);
})(typeof globalThis!=='undefined'?globalThis:this);
