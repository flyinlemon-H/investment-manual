(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MultiStockAnalysis=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const OUTPUT_EXAMPLE={
    technicalReviews:[{
      symbol:'EXACT.SYMBOL',
      technicalReview:{
        updatedAt:'YYYY-MM-DD',
        inputCoverage:{hasRecentKline:true,hasCycleKline:false,cycleDataSource:'current_request',warning:''},
        shortTermTechnical:{lookbackDays:120,price:null,priceUpdatedAt:'YYYY-MM-DD',ma5:null,ma10:null,ma20:null,ma60:null,trendStatus:'',supportLevels:[],resistanceLevels:[],technicalSummary:'',riskFlags:[],actionHint:'',confidence:'medium'},
        cycleTechnical:{lookbackDays:500,cyclePosition:'unclear',cycleSummary:'',cycleHigh:null,cycleLow:null,currentPercentile:null,distanceToCycleHighPct:null,distanceToCycleLowPct:null,lastCycleUpdatedAt:'',dataSource:'none',confidence:'medium'},
        priceActionEvent:{detected:false,type:'',changePct:null,volumeStatus:'',needsNewsExplanation:false,eventReason:''},
        finalTechnicalConclusion:'',holdHint:'',addHint:'',reduceHint:''
      }
    }]
  };

  function text(value){return String(value??'').trim()}
  function symbolOf(stock){return text(stock&&(stock.code||stock.symbol))}
  function clone(value){return JSON.parse(JSON.stringify(value))}
  function arr(value){return Array.isArray(value)?value:[]}
  function isCash(stock){return text(stock&&stock.type).toLowerCase()==='cash'||(!symbolOf(stock)&&/现金/.test(text(stock&&stock.name)))}

  function selectableStocks(stocks){
    return arr(stocks).filter(stock=>symbolOf(stock)&&!isCash(stock));
  }

  function recentPriceHistory(stock,limit=120){
    return arr(stock&&stock.priceHistory).map(row=>({
      date:text(row&&row.date),
      close:Number(row&&row.close)
    })).filter(row=>row.date&&Number.isFinite(row.close)&&row.close>0).slice(-Math.max(1,limit));
  }

  function stockContext(stock,helpers={}){
    const symbol=symbolOf(stock);
    if(!symbol)throw new Error('分析股票缺少 exact symbol。');
    const currentPrice=typeof helpers.currentPrice==='function'?helpers.currentPrice(stock):(stock.currentPrice||stock.lastUnitPrice||null);
    const technicalData=typeof helpers.technicalData==='function'?helpers.technicalData(stock):stock.technicalData;
    const technicalReview=typeof helpers.technicalReview==='function'?helpers.technicalReview(stock):stock.technicalReview;
    const freshness=typeof helpers.dataFreshness==='function'?helpers.dataFreshness(stock):stock.dataFreshness;
    return {
      symbol,
      name:text(stock.name),
      type:text(stock.type),
      role:text(stock.role),
      theme:text(stock.theme),
      currentPrice:Number.isFinite(Number(currentPrice))&&Number(currentPrice)>0?Number(currentPrice):null,
      priceUpdatedAt:text(stock.priceUpdatedAt||stock.valueUpdatedAt||(freshness&&freshness.priceUpdatedAt)),
      syncStatus:text(stock.syncStatus)||'unknown',
      lastSyncError:text(stock.lastSyncError),
      dataFreshness:clone(freshness&&typeof freshness==='object'?freshness:{}),
      technicalData:clone(technicalData&&typeof technicalData==='object'?technicalData:{}),
      previousTechnicalReview:clone(technicalReview&&typeof technicalReview==='object'?technicalReview:{}),
      recentPriceHistory:recentPriceHistory(stock)
    };
  }

  function buildRequest(stocks,helpers={}){
    const selected=selectableStocks(stocks);
    if(selected.length<2)throw new Error('请至少选择两只有 exact symbol 的股票。');
    const contexts=selected.map(stock=>stockContext(stock,helpers));
    return [
      '你是一名严谨的股票技术分析助理。请一次完成下面全部股票的技术复核。',
      '',
      '输出要求：',
      '1. 只输出严格 JSON；不要 Markdown、代码围栏或解释。',
      '2. 顶层必须只有 technicalReviews 数组。',
      '3. 每个输入 symbol 必须原样、精确地输出一次；禁止名称匹配、大小写变换、前后缀猜测或新增股票。',
      '4. 每项只能包含 symbol 和 technicalReview。',
      '5. 使用输入中的最新价格、技术数据、近期价格历史与新鲜度；数据不足时在 inputCoverage.warning 明确说明，不要编造。',
      '6. 结论使用简体中文；只给条件化复核，不给确定性买卖指令。',
      '7. 数组字段必须保持数组；未知数字使用 null，未知文本使用空字符串。',
      '',
      '股票上下文：',
      JSON.stringify(contexts,null,2),
      '',
      '严格输出结构示例（用输入股票逐项替换示例项）：',
      JSON.stringify(OUTPUT_EXAMPLE,null,2)
    ].join('\n');
  }

  async function refreshSelectedStocks(stocks,refreshOne,options={}){
    if(typeof refreshOne!=='function')throw new Error('缺少行情刷新函数。');
    const selected=selectableStocks(stocks);
    const results=[];
    const delayMs=Math.max(0,Number(options.delayMs)||0);
    for(let index=0;index<selected.length;index+=1){
      const stock=selected[index];
      let result;
      try{
        const raw=await refreshOne(stock);
        result={
          id:String(stock.id||''),symbol:symbolOf(stock),name:text(stock.name),
          ok:Boolean(raw&&raw.ok),price:raw&&Number.isFinite(Number(raw.price))?Number(raw.price):null,
          source:text(raw&&raw.source),errors:arr(raw&&raw.errors).map(text).filter(Boolean)
        };
        if(!result.ok&&!result.errors.length)result.errors=['刷新失败，已保留原数据'];
      }catch(error){
        result={id:String(stock.id||''),symbol:symbolOf(stock),name:text(stock.name),ok:false,price:null,source:'',errors:[text(error&&error.message)||String(error)]};
      }
      results.push(result);
      if(typeof options.onProgress==='function')options.onProgress({index:index+1,total:selected.length,result,results:results.slice()});
      if(delayMs&&index<selected.length-1)await new Promise(resolve=>setTimeout(resolve,delayMs));
    }
    return {
      total:results.length,
      successCount:results.filter(item=>item.ok).length,
      failureCount:results.filter(item=>!item.ok).length,
      results
    };
  }

  return {OUTPUT_EXAMPLE,selectableStocks,recentPriceHistory,stockContext,buildRequest,refreshSelectedStocks};
});

(function(root){
  'use strict';
  if(!root||!root.document||!root.MultiStockAnalysis)return;

  let selectedIds=new Set();

  function appStocks(){return typeof state==='object'&&state&&Array.isArray(state.stocks)?state.stocks:[]}
  function defaults(){return root.MultiStockAnalysis.selectableStocks(appStocks())}
  function idOf(stock){return String(stock&&(stock.id||stock.code||stock.symbol)||'')}

  function ensureButton(){
    const actions=document.getElementById('globalActions');
    if(!actions||document.getElementById('multiStockAnalysisBtn'))return;
    const button=document.createElement('button');
    button.className='btn small';
    button.id='multiStockAnalysisBtn';
    button.type='button';
    button.textContent='今日分析';
    actions.insertBefore(button,actions.firstChild);
    button.addEventListener('click',openModal);
  }

  function ensureModal(){
    let modal=document.getElementById('multiStockAnalysisModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.className='modal-bg import-layer';
    modal.id='multiStockAnalysisModal';
    modal.innerHTML=`<div class="modal"><h2>今日多股分析</h2><div class="modal-sub">1 选择股票 · 2 刷新并生成 · 3 一次复制 / 粘贴 · 4 预览并一次保存</div><div id="multiStockSelection"></div><div class="form-row"><label>统一分析请求</label><textarea id="multiStockRequestText" readonly style="min-height:220px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px"></textarea></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn ghost" id="multiStockCloseBtn" type="button">关闭</button><button class="btn ghost" id="multiStockRefreshBtn" type="button">刷新并生成请求</button><button class="btn" id="multiStockCopyBtn" type="button">复制统一请求</button></div><div class="form-row" style="margin-top:16px"><label>粘贴 AI 返回的统一 Batch JSON</label><textarea id="multiStockResultText" style="min-height:180px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{"technicalReviews":[...]}'></textarea></div><div class="modal-actions"><button class="btn" id="multiStockPreviewBtn" type="button">查看统一结果</button></div><div class="card-note" id="multiStockStatus" style="white-space:pre-line;margin-top:10px"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
    document.getElementById('multiStockCloseBtn').addEventListener('click',closeModal);
    document.getElementById('multiStockRefreshBtn').addEventListener('click',refreshSelectedData);
    document.getElementById('multiStockCopyBtn').addEventListener('click',copyRequest);
    document.getElementById('multiStockPreviewBtn').addEventListener('click',previewResult);
    return modal;
  }

  function renderSelection(){
    const stocks=defaults();
    const target=document.getElementById('multiStockSelection');
    target.innerHTML=`<div class="form-row"><label>分析股票（已选 ${selectedIds.size} / ${stocks.length}）</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">${stocks.map(stock=>`<label style="display:flex;align-items:center;gap:8px;min-height:42px;border:1px solid var(--line);padding:8px;margin:0"><input type="checkbox" data-multi-stock-id="${idOf(stock).replace(/"/g,'&quot;')}" style="width:auto"${selectedIds.has(idOf(stock))?' checked':''}><span>${String(stock.name||stock.code||stock.symbol).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}<small style="display:block;color:var(--ink3)">${String(stock.code||stock.symbol||'')}</small></span></label>`).join('')}</div></div>`;
    target.querySelectorAll('[data-multi-stock-id]').forEach(input=>input.addEventListener('change',()=>{
      if(input.checked)selectedIds.add(input.dataset.multiStockId);else selectedIds.delete(input.dataset.multiStockId);
      renderSelection();
      generateRequest();
    }));
  }

  function selectedStocks(){return defaults().filter(stock=>selectedIds.has(idOf(stock)))}
  function helpers(){return {
    currentPrice:stock=>typeof getComparablePrice==='function'?(getComparablePrice(stock)||stockCurrentPrice(stock)):stock.currentPrice,
    technicalData:stock=>typeof normalizeTechnicalData==='function'?normalizeTechnicalData(stock.technicalData):stock.technicalData,
    technicalReview:stock=>typeof normalizeTechnicalReview==='function'?normalizeTechnicalReview(stock.technicalReview,stock):stock.technicalReview,
    dataFreshness:stock=>typeof normalizeDataFreshness==='function'?normalizeDataFreshness(stock.dataFreshness):stock.dataFreshness
  }}

  function setStatus(message){document.getElementById('multiStockStatus').textContent=message||''}
  async function refreshSelectedData(){
    const stocks=selectedStocks();
    if(!stocks.length){setStatus('请至少选择一只可刷新的股票。');return null}
    if(typeof refreshOnePrice!=='function'){setStatus('现有行情刷新功能不可用。');return null}
    const button=document.getElementById('multiStockRefreshBtn');
    const controls=['multiStockRefreshBtn','multiStockCopyBtn','multiStockPreviewBtn'].map(id=>document.getElementById(id)).filter(Boolean);
    controls.forEach(control=>{control.disabled=true});
    if(button)button.textContent='刷新中 0 / '+stocks.length;
    try{
      const summary=await root.MultiStockAnalysis.refreshSelectedStocks(
        stocks,
        stock=>refreshOnePrice(stock.id,{silent:true}),
        {delayMs:350,onProgress:progress=>{
          if(button)button.textContent=`刷新中 ${progress.index} / ${progress.total}`;
          const mark=progress.result.ok?'成功':'失败（保留旧数据）';
          setStatus(`${progress.result.name||progress.result.symbol}：${mark}`);
        }}
      );
      generateRequest();
      const failures=summary.results.filter(item=>!item.ok);
      const details=failures.map(item=>`- ${item.name||item.symbol}：${item.errors.join('；')||'刷新失败，已保留旧数据'}`).join('\n');
      setStatus(`批量刷新完成：成功 ${summary.successCount}，失败 ${summary.failureCount}。${details?'\n失败项未覆盖原数据：\n'+details:''}\n统一请求已按最新可用数据重新生成。`);
      return summary;
    }finally{
      controls.forEach(control=>{control.disabled=false});
      if(button)button.textContent='刷新并生成请求';
    }
  }
  function generateRequest(){
    try{
      const request=root.MultiStockAnalysis.buildRequest(selectedStocks(),helpers());
      document.getElementById('multiStockRequestText').value=request;
      setStatus(`已生成 1 个统一请求，包含 ${selectedStocks().length} 只股票。`);
      return request;
    }catch(error){
      document.getElementById('multiStockRequestText').value='';
      setStatus(error&&error.message?error.message:String(error));
      return '';
    }
  }

  function copyRequest(){
    const request=generateRequest();
    if(!request)return;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(request).then(()=>setStatus('统一请求已复制；请粘贴给 AI，并将返回的 Batch JSON 粘贴到下方。')).catch(fallbackCopy);
    }else fallbackCopy();
  }

  function fallbackCopy(){
    const field=document.getElementById('multiStockRequestText');
    field.focus();field.select();
    try{document.execCommand('copy');setStatus('统一请求已复制；请粘贴给 AI，并将返回的 Batch JSON 粘贴到下方。')}catch(_){setStatus('复制失败，请长按请求文本手动复制。')}
  }

  function previewResult(){
    const raw=document.getElementById('multiStockResultText').value.trim();
    if(!raw){setStatus('请先粘贴 AI 返回的 Batch JSON。');return}
    if(!root.BatchTechnicalReviewUI||typeof root.BatchTechnicalReviewUI.openWithInput!=='function'){
      setStatus('批量预览功能不可用。');return;
    }
    closeModal();
    root.BatchTechnicalReviewUI.openWithInput(raw);
  }

  function openModal(){
    const modal=ensureModal();
    const stocks=defaults();
    selectedIds=new Set(stocks.map(idOf));
    document.getElementById('multiStockResultText').value='';
    modal.classList.add('show');
    renderSelection();
    generateRequest();
  }
  function closeModal(){const modal=document.getElementById('multiStockAnalysisModal');if(modal)modal.classList.remove('show')}

  ensureButton();
  root.MultiStockAnalysisUI=Object.freeze({open:openModal,close:closeModal,generateRequest,refreshSelectedData,previewResult});
})(typeof globalThis!=='undefined'?globalThis:this);
