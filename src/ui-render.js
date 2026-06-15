let logStockFilter='';
let analysisSortMode='score_desc';
let analysisRoleFilter='';
let analysisStatusFilter='';
let analysisRiskFilter='';
let analysisScoreFilter='';
let analysisActionFilter='';
let analysisCapitalFilter='';
let analysisExecutionFilter='';
let analysisFreshnessFilter='';
let analysisTechnicalStatusFilter='';
let analysisValuationStatusFilter='';
let analysisValuationMissingFilter='';
let analysisFinancialStatusFilter='';
let analysisFinancialMissingFilter='';
function backupReminderText(){
  const t=Number(state.lastBackupAt);
  if(!t)return ' · 建议导出备份';
  const days=Math.floor((Date.now()-t)/86400000);
  return days>7?` · 建议导出备份（上次 ${days} 天前）`:'';
}
function isDefaultFx(){const f=(state&&state.fx)||{};return !f.updatedAt||f.source==='默认'}
function priceReferenceDate(s){const f=normalizeDataFreshness(s.dataFreshness);return f.priceUpdatedAt||(s.type==='etf'?s.valueUpdatedAt:s.priceUpdatedAt)||''}
function priceRiskWarnings(s){
  const out=[];
  const d=freshnessDays(priceReferenceDate(s));
  if(d===null)out.push('价格未更新');
  else if(d>7)out.push('价格可能过期');
  if(getCurrency(s)==='HKD'&&isDefaultFx())out.push('汇率使用默认值，港股市值和仓位占比可能有偏差');
  if(s.syncStatus==='failed')out.push('刷新失败，当前仍使用旧价格');
  return out;
}
function currentDisplay(s){const isEtf=s.type==='etf';const val=isEtf?fmtMaybe(s.currentValue,0):fmtMaybe(s.currentPrice);const curTag=(getCurrency(s)==='HKD'&&val!=='—')?' <span class="muted" style="font-size:11px;font-weight:400">HKD</span>':'';const date=isEtf?s.valueUpdatedAt:s.priceUpdatedAt;const code=s.code?` · ${esc(s.code)}`:'';const source=s.priceSource?` · ${esc(s.priceSource)}`:'';const status=s.syncStatus==='failed'?' · 刷新失败，仍使用旧价格':(s.syncStatus==='updating'?' · 刷新中':'');const chg=s.dailyChange;const chgHtml=(typeof chg==='number'&&!isNaN(chg))?` <span class="daily-chg ${chg>=0?'up':'down'}">${chg>=0?'+':''}${chg.toFixed(2)}%</span>`:'';const comparable=isEtf?`<div class="text">ETF比较单价：${fmtMaybe(getComparablePrice(s))} · 价位计划按单位净值/单价判断</div>`:'';const risks=priceRiskWarnings(s);const riskHtml=risks.length?`<div class="alert" style="margin-top:6px">${risks.map(esc).join('；')}</div>`:'';return `${val}${curTag}${chgHtml}<div class="text">${freshnessText(date)}${code}${source}${status}</div>${comparable}${riskHtml}`}
function stalePanel(){const items=state.stocks.map(s=>{const date=s.type==='etf'?s.valueUpdatedAt:s.priceUpdatedAt;const val=s.type==='etf'?s.currentValue:s.currentPrice;return {s,date,val,days:daysSince(date)}}).filter(x=>x.val!==''&&x.val!==undefined&&x.val!==null&&(x.days===null||x.days>30));if(!items.length)return '<div class="card" style="margin-bottom:14px"><div class="card-title">数据更新提醒</div><div class="card-note">当前没有超过30天的价格/市值数据。</div></div>';return `<div class="card" style="margin-bottom:14px"><div class="card-title">数据更新提醒（${items.length} 项）</div><div class="stale-list">${items.map(x=>{const days=x.days;const urgent=days===null||days>60;const meta=days===null?'未记录更新时间':`已 ${days} 天未更新`;return `<div class="stale-row"><div class="stale-name">${esc(x.s.name)} <span class="muted" style="font-weight:400">· ${x.s.type==='etf'?'市值':'价格'}</span></div><div class="stale-meta${urgent?' urgent':''}">${meta}</div></div>`}).join('')}</div><div class="alert" style="margin-top:10px">这些数据可能已经不适合直接用于决策。建议按月更新ETF市值，按需更新重点个股价格。</div></div>`}
function freshnessDays(dateStr){const d=normalizeDateOnly(dateStr);if(!d)return null;const t=new Date(d+'T00:00:00').getTime();if(isNaN(t))return null;return Math.floor((Date.now()-t)/86400000)}
function dataFreshnessStatus(dateStr){
  const d=freshnessDays(dateStr);
  if(d===null)return {label:'未更新',cls:'urgent',days:null};
  if(d<=3)return {label:'新鲜',cls:'ok',days:d};
  if(d<=7)return {label:'可用',cls:'ok',days:d};
  if(d<=30)return {label:'偏旧',cls:'warn',days:d};
  return {label:'过期',cls:'urgent',days:d};
}
function dataFreshnessItem(label,dateStr){
  const st=dataFreshnessStatus(dateStr);
  const meta=st.days===null?'—':`${esc(normalizeDateOnly(dateStr))} · ${st.days}天`;
  return `<div class="stale-row"><div class="stale-name">${esc(label)}</div><div class="stale-meta ${st.cls==='urgent'?'urgent':''}">${meta} · ${esc(st.label)}</div></div>`;
}
function isOverdue(dateStr,limitDays){
  const d=freshnessDays(dateStr);
  return d===null||d>limitDays;
}
function dataFreshnessPanel(stock){
  const f=normalizeDataFreshness(stock.dataFreshness);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">数据更新时间</div><div class="stale-list">${dataFreshnessItem('价格',f.priceUpdatedAt)}${dataFreshnessItem('估值',f.valuationUpdatedAt)}${dataFreshnessItem('新闻',f.newsUpdatedAt)}${dataFreshnessItem('社媒',f.socialUpdatedAt)}${dataFreshnessItem('财报',f.financialUpdatedAt)}${dataFreshnessItem('技术',f.technicalUpdatedAt)}${dataFreshnessItem('个人观点',f.personalViewUpdatedAt)}${dataFreshnessItem('综合复核',f.comprehensiveReviewUpdatedAt)}</div></div>`;
}
function isFocusStockForUpdate(stock){
  const strategy=normalizeStrategy(stock.strategy,stock);
  return stock.type==='holding'&&((Number(stock.targetPct)||0)>=8||(Number(stock.capPct)||0)>=10||['核心仓','成长仓'].includes(stock.role)||Number(strategy.priority)<=3);
}
function updateChecklistRows(){
  const rows=[];
  state.stocks.forEach(s=>{
    normalizeStockAnalysis(s);
    const f=normalizeDataFreshness(s.dataFreshness);
    const items=[];
    const dates=[];
    const add=(name,date)=>{items.push(name);if(normalizeDateOnly(date))dates.push(normalizeDateOnly(date))};
    const priceDays=freshnessDays(priceReferenceDate(s));
    const valuationDays=freshnessDays(f.valuationUpdatedAt);
    const viewDays=freshnessDays(f.personalViewUpdatedAt);
    if(s.type==='holding'){
      if(priceDays===null)add('价格未更新','');
      else if(priceDays>7)add('价格超过 7 天未更新',priceReferenceDate(s));
      if(valuationDays===null||valuationDays>30)add('估值',f.valuationUpdatedAt);
      if(isOverdue(f.financialUpdatedAt,30))add('财报资料需更新：建议使用“财报一体化解析”一次更新 financialData 和 financialReview',f.financialUpdatedAt);
      if(viewDays===null||viewDays>30)add('个人观点',f.personalViewUpdatedAt);
      if(isFocusStockForUpdate(s)&&!String(normalizeAnalysisInputs(s.analysisInputs).valuationRawText||'').trim())add('估值资料','');
    }else if(s.type==='etf'){
      if(priceDays===null)add('价格未更新','');
      else if(priceDays>7)add('价格超过 7 天未更新',priceReferenceDate(s));
    }else if(s.type==='watching'){
      if(viewDays===null||viewDays>30)add('个人观点',f.personalViewUpdatedAt);
    }
    if(!isCashRow(s)&&isOverdue(f.technicalUpdatedAt,3))add('技术面待更新：可进入详情页查看“技术面分析流程”',f.technicalUpdatedAt);
    const ci=normalizeCollectionInputs(s.collectionInputs);
    const reviews=normalizeAiReviews(s.aiReviews);
    if(String(ci.newsRawText||'').trim()&&!reviews.newsReview)add('新闻资料待复核','');
    if(String(ci.financialRawText||'').trim()&&!reviews.financialReview)add('财报资料待复核：建议使用“财报一体化解析”一次更新 financialData 和 financialReview','');
    if(String(ci.socialRawText||'').trim()&&!reviews.socialReview)add('社媒资料待复核','');
    if(String(ci.technicalRawText||'').trim()&&!reviews.technicalReview)add('技术资料待复核','');
    if(getCurrency(s)==='HKD'&&isDefaultFx())add('汇率为默认值，港股仓位占比需复核','');
    if(items.length){
      const oldest=dates.length?dates.sort()[0]:'未更新';
      rows.push({s,items:[...new Set(items)],oldest,isHolding:s.type==='holding',focus:isFocusStockForUpdate(s),count:items.length,oldestDays:dates.length?(freshnessDays(oldest)??9999):9999});
    }
  });
  rows.sort((a,b)=>(Number(b.isHolding)-Number(a.isHolding))||(Number(b.focus)-Number(a.focus))||(b.count-a.count)||(b.oldestDays-a.oldestDays)||String(a.s.name||'').localeCompare(String(b.s.name||''),'zh-CN'));
  return rows;
}
function updateChecklistPanel(){
  const rows=updateChecklistRows();
  if(!rows.length)return '<div class="card" style="margin-bottom:14px"><div class="card-title">待更新清单</div><div class="card-note">当前没有需要优先更新的股票资料。</div></div>';
  return `<div class="card" style="margin-bottom:14px;border-left:3px solid var(--gold)"><div class="card-title">待更新清单（${rows.length} 只）</div><div class="modal-actions" style="justify-content:flex-start;margin:0 0 10px;flex-wrap:wrap"><button class="btn ghost small" id="copyUpdateCodesBtn" type="button">复制待更新股票代码</button><button class="btn ghost small" id="copyUpdatePromptBtn" type="button">复制待更新任务提示词</button></div><div class="trig-list">${rows.map(x=>`<div class="trig-row ${x.isHolding?'buy':''}" data-update-stock="${esc(x.s.id)}" style="cursor:pointer"><div class="trig-name">${esc(x.s.name||'—')} <span class="muted" style="font-weight:400">· ${esc(x.s.code||'无代码')} · ${x.isHolding?'持仓':'观察'}</span></div><div class="trig-dist">${esc(x.oldest)}</div><div class="trig-desc">需要更新：${x.items.map(esc).join('、')}${x.focus?' · 重点关注':''}</div></div>`).join('')}</div></div>`;
}
function copyText(text,okMsg){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>alert(okMsg)).catch(()=>fallbackCopyText(text,okMsg));
  else fallbackCopyText(text,okMsg);
}
function fallbackCopyText(text,okMsg){
  const ta=document.createElement('textarea');
  ta.value=text;document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');alert(okMsg)}catch(e){alert('复制失败，请手动复制。')}
  ta.remove();
}
function copyUpdateCodes(){
  const codes=[...new Set(updateChecklistRows().map(x=>x.s.code).filter(Boolean))];
  copyText(codes.join('\n'),'待更新股票代码已复制。');
}
function updateTaskPromptText(){
  const rows=updateChecklistRows();
  return ['请协助整理以下股票的待更新资料，优先补充价格、估值、财报、新闻和个人观点所需信息。','建议逐只打开投资手册详情页的“信息采集面板”，补充新闻、财报、社媒、技术和综合资料。','也可进入详情页使用“统一 Prompt 生成器”或“综合复核自动组包”复制复核资料。','',...rows.map(x=>`- ${x.s.name||'—'} (${x.s.code||'无代码'})：需要更新 ${x.items.join('、')}；最旧更新时间：${x.oldest}；建议进入详情页生成综合复核包`)].join('\n');
}
function copyUpdatePrompt(){copyText(updateTaskPromptText(),'待更新任务提示词已复制。')}
function stockSearchBase(stock){return [stock.name,stock.code].filter(Boolean).join(' ').trim()||'stock'}
function collectionSourceLinks(stock){
  const code=String(stock.code||'').trim().toUpperCase();
  const name=String(stock.name||'').trim();
  const symbol=code||name||'stock';
  const q=stockSearchBase(stock);
  const google=s=>`https://www.google.com/search?q=${encodeURIComponent(s)}`;
  return [
    {label:'行情',url:code?`https://finance.yahoo.com/quote/${encodeURIComponent(code)}`:google(`${q} stock quote`)},
    {label:'估值',url:code?`https://finance.yahoo.com/quote/${encodeURIComponent(code)}/key-statistics`:google(`${q} valuation PE PB PS`)},
    {label:'分析师预期',url:code?`https://finance.yahoo.com/quote/${encodeURIComponent(code)}/analysis`:google(`${q} analyst estimates`)},
    {label:'技术图表',url:`https://www.tradingview.com/search/?query=${encodeURIComponent(symbol)}`},
    {label:'新闻',url:google(`${q} news`)},
    {label:'财报公告',url:google(`${q} annual report interim report announcement`)},
    {label:'估值数据',url:google(`${q} historical valuation PE PB PS`)},
    {label:'社媒讨论',url:google(`${q} forum discussion sentiment`)}
  ];
}
function collectionPromptSchema(kind){
  const schemas={
    news:{newsReview:{summary:'',positivePoints:[],negativePoints:[],riskPoints:[],attentionPoints:[],sentiment:'neutral',confidence:'medium'}},
    financial:{financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'medium'}},
    social:{socialReview:{summary:'',hotTopics:[],bullishArguments:[],bearishArguments:[],rumorRisks:[],sentiment:'neutral',confidence:'medium'}},
    technical:{technicalReview:{summary:'',trend:'sideways',supportLevels:[],resistanceLevels:[],volumeSignal:'',riskSignal:'',operationSuggestion:'',confidence:'medium'}},
    comprehensive:{comprehensiveReview:{summary:'',mainConclusion:'',whatChanged:[],actionBias:'watch',keyRisks:[],nextUpdateNeeded:[],confidence:'medium'}}
  };
  return schemas[kind]||schemas.comprehensive;
}
function collectionPromptText(stock,kind){
  normalizeStockAnalysis(stock);
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const raw={news:ci.newsRawText,financial:ci.financialRawText,social:ci.socialRawText,technical:ci.technicalRawText,comprehensive:ci.generalRawText}[kind]||'';
  const ctx={
    stock:{name:stock.name||'',code:stock.code||'',type:stock.type||'',role:stock.role||'',shares:stock.shares||0,avgCost:stock.avgCost||'',currentPrice:stock.currentPrice||stock.currentValue||''},
    valuationData:normalizeValuationData(stock.valuationData),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness),
    personalView:normalizeAnalysisInputs(stock.analysisInputs).personalView,
    collectionInputs:ci,
    rawText:raw
  };
  const title={news:'新闻整理',financial:'财报整理',social:'社媒整理',technical:'技术分析',comprehensive:'综合复核'}[kind]||'综合复核';
  return [`请作为投资研究助理，对以下资料做${title}。`,'要求：','1. 只输出严格 JSON，不要输出 Markdown。','2. 同时在 summary/mainConclusion 等字段里给出可读结论。','3. 不构成买卖指令，仅作复核辅助。','','当前上下文：',JSON.stringify(ctx,null,2),'','请按以下 JSON 结构输出：',JSON.stringify(collectionPromptSchema(kind),null,2)].join('\n');
}
function collapsibleCard(title,body,open=false,note=''){
  return `<details class="card" style="margin-bottom:14px"${open?' open':''}><summary class="card-title" style="cursor:pointer">${esc(title)}</summary><div style="margin-top:12px">${note?`<div class="card-note" style="margin-bottom:10px">${esc(note)}</div>`:''}${body}</div></details>`;
}
function collectionPanel(stock){
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const links=collectionSourceLinks(stock).map(x=>`<a class="chip tag" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a>`).join('');
  const area=(key,label)=>`<div class="form-row"><label>${esc(label)}</label>${key==='financialRawText'?'<div class="card-note" style="margin-bottom:6px">建议粘贴：营收、净利润、同比增速、毛利率、现金流、负债率、EPS、管理层说明、主要风险。快速更新可粘贴财经网站业绩摘要；重仓股建议粘贴公司公告或年报关键段落。</div>':''}${key==='technicalRawText'?'<div class="card-note" style="margin-bottom:6px">建议粘贴：K线趋势、MA20/MA60/MA120、成交量变化、支撑位、压力位、是否放量、是否跌破关键均线、风险信号。可先复制“技术面截图摘要 Prompt”，让 GPT 根据截图整理后再粘贴。</div>':''}<textarea id="ci_${key}" style="min-height:82px">${esc(ci[key])}</textarea></div>`;
  const body=`<div class="form-row"><label>资料入口</label><div class="chips">${links}</div></div><div class="form-row"><label>粘贴资料</label></div>${area('newsRawText','新闻资料')}${area('financialRawText','财报/业绩资料')}${area('socialRawText','社媒讨论资料')}${area('technicalRawText','技术形态资料')}${area('generalRawText','综合资料')}<div class="modal-actions" style="justify-content:flex-start;margin-top:8px;flex-wrap:wrap"><button class="btn ghost small" data-collection-action="save">保存采集资料</button><button class="btn ghost small" id="copyFinancialIntegratedPromptFromCollectionBtn" type="button">复制财报一体化解析 Prompt</button><button class="btn ghost small" data-collection-prompt="news">复制新闻整理提示词</button><button class="btn ghost small" data-collection-prompt="financial">复制财报整理提示词</button><button class="btn ghost small" data-collection-prompt="social">复制社媒整理提示词</button><button class="btn ghost small" data-collection-prompt="technical">复制技术分析提示词</button><button class="btn ghost small" data-collection-prompt="comprehensive">复制综合复核提示词</button></div>`;
  return collapsibleCard('信息采集面板',body,false,'默认折叠，展开后可粘贴资料或复制整理提示词。');
}
function financialReportTemplateText(){
  return ['报告期：','营业收入：','营收同比：','归母净利润：','净利润同比：','毛利率：','净利率：','ROE：','经营现金流：','自由现金流：','资产负债率：','EPS：','管理层对业务变化的说明：','主要风险：','资料来源：','备注：'].join('\n');
}
function financialAnalysisFlowText(){
  return ['1. 复制财报关键段落','2. 粘贴到信息采集面板的财报/业绩资料','3. 使用“财务数据提取”Prompt 生成 financialData','4. 导入 financialData','5. 使用“财报复核分析”Prompt 生成 financialReview','6. 到 AI 复核导入区导入 financialReview','7. 最后人工决定是否应用到九模块财务评分'].join('\n');
}
function copyFinancialReportTemplate(){copyText(financialReportTemplateText(),'财报资料采集模板已复制。')}
function copyFinancialAnalysisFlow(){copyText(financialAnalysisFlowText(),'财报分析流程说明已复制。')}
function copyFinancialIntegratedPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(buildUnifiedPrompt(stock,'promptFinancialIntegrated'),'财报一体化解析 Prompt 已复制。');
}
function focusFinancialIntegratedImport(){
  const el=document.getElementById('financialIntegratedImportText');
  if(el){el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});}
}
function financialAnalysisFlowPanel(){
  const checklist=['报告期','营业收入','营收同比','归母净利润','净利润同比','毛利率','净利率','ROE','经营现金流','自由现金流','资产负债率','EPS','管理层对业务变化的说明','主要风险'];
  const body=`<div class="modal-actions" style="justify-content:flex-start;margin:0 0 12px;flex-wrap:wrap"><button class="btn ghost small" id="copyFinancialReportTemplateBtn" type="button">复制财报资料采集模板</button><button class="btn ghost small" id="copyFinancialFlowBtn" type="button">复制财报分析流程说明</button><button class="btn ghost small" id="copyFinancialIntegratedPromptBtn" type="button">复制财报一体化解析 Prompt</button><button class="btn ghost small" id="focusFinancialIntegratedImportBtn" type="button">打开/定位到财报一体化 JSON 导入</button></div><div class="dash" style="grid-template-columns:1fr 1fr;margin-bottom:12px"><div class="card"><div class="card-title">推荐快捷流程</div><div class="text" style="max-width:none">1. 粘贴财报/业绩资料<br>2. 使用“财报一体化解析” Prompt<br>3. 导入一体化 JSON<br>4. 人工决定是否应用到九模块财务评分</div></div><div class="card"><div class="card-title">备用拆分流程</div><div class="text" style="max-width:none">1. 财务数据提取<br>2. 导入 financialData<br>3. 财报复核分析<br>4. 导入 financialReview</div></div></div><div class="dash" style="grid-template-columns:1fr 1fr;margin-bottom:12px"><div class="card"><div class="card-title">步骤 1：获取财报原文</div><div class="text" style="max-width:none">点击信息采集面板中的“财报公告”入口，也可以从公司公告、交易所公告、财经网站、券商研报摘要复制。日常更新不需要复制整份财报，优先复制关键财务段落。</div><div class="card-note" style="margin-top:8px"><b>建议复制内容：</b>${checklist.map(esc).join('、')}</div></div><div class="card"><div class="card-title">步骤 2：粘贴财报资料</div><div class="text" style="max-width:none">将财报原文粘贴到“信息采集面板 → 财报/业绩资料”。保存后会更新 financialUpdatedAt。</div></div><div class="card"><div class="card-title">步骤 3：一体化解析</div><div class="text" style="max-width:none">打开“统一 Prompt 生成器”，选择“财报一体化解析”，复制 Prompt 发给 GPT。将返回的 JSON 粘贴到下方“一体化 JSON 导入”。</div></div><div class="card"><div class="card-title">步骤 4：人工确认应用</div><div class="text" style="max-width:none">一体化导入只写入 financialData 和 aiReviews.financialReview，不会覆盖九模块评分。是否点击“应用到九模块财务评分”仍由你人工决定。</div></div></div><div class="form-row"><label>财报一体化 JSON 导入</label><textarea id="financialIntegratedImportText" style="min-height:170px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='可粘贴纯 JSON、Markdown json 代码块，或前后带说明文字的 AI 返回内容。要求顶层包含 {"financialData":{...},"financialReview":{...}}'></textarea></div><div class="modal-actions" style="justify-content:flex-start;margin-top:8px"><button class="btn ghost small" id="importFinancialIntegratedBtn" type="button">导入一体化 JSON</button></div>`;
  return collapsibleCard('财报分析流程',body,false,'默认折叠，按 4 步完成财报原文采集、financialData 提取和 financialReview 导入。');
}
function technicalScreenshotPromptText(stock){
  const name=stock&&stock.name?stock.name:'当前股票';
  const code=stock&&stock.code?stock.code:'无代码';
  return [`请根据我上传的 K 线图或技术图截图，整理 ${name}（${code}）的技术面摘要。`,'','要求：','1. 只根据截图内容判断，不要使用外部资料。','2. 如果截图中看不清某项信息，请写“无法判断”。','3. 不要给确定性买卖指令，只做技术面辅助分析。','4. 请按以下格式输出，方便我粘贴进投资分析程序的“技术形态资料”：','','股票名称：','股票代码：','截图周期：','当前价格：','当前趋势：','MA20 / MA60 / MA120 相对位置：','成交量变化：','近期支撑位：','近期压力位：','是否放量：','是否跌破关键均线：','风险信号：','短期操作倾向：','需要继续观察的信号：','备注：'].join('\n');
}
function copyTechnicalScreenshotPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(technicalScreenshotPromptText(stock),'技术面截图摘要 Prompt 已复制。');
}
function technicalAnalysisFlowPanel(){
  const body=`<div class="modal-actions" style="justify-content:flex-start;margin:0 0 12px;flex-wrap:wrap"><button class="btn ghost small" id="copyTechnicalScreenshotPromptBtn" type="button">复制技术面截图摘要 Prompt</button></div><div class="dash" style="grid-template-columns:1fr 1fr;margin-bottom:0"><div class="card"><div class="card-title">步骤 1：获取技术面资料</div><div class="text" style="max-width:none">可以使用历史价格 CSV 导入，让程序自动计算 MA20 / MA60 / MA120、支撑位、压力位。也可以从富途、东方财富、同花顺、TradingView 截图 K 线图。截图建议包含日K、周K、成交量、均线。</div></div><div class="card"><div class="card-title">步骤 2：让 GPT 整理截图摘要</div><div class="text" style="max-width:none">复制“技术面截图摘要 Prompt”，把 K 线截图发给 GPT，让 GPT 按固定格式整理技术面摘要。</div></div><div class="card"><div class="card-title">步骤 3：粘贴技术形态资料</div><div class="text" style="max-width:none">将 GPT 整理后的摘要粘贴到“信息采集面板 → 技术形态资料”。保存后会更新 technicalUpdatedAt。</div></div><div class="card"><div class="card-title">步骤 4：生成技术复核</div><div class="text" style="max-width:none">打开“统一 Prompt 生成器”，选择“技术复核”，复制 Prompt 发给 GPT。将返回的 technicalReview JSON 粘贴到“AI 复核导入”，类型选择“技术复核 technicalReview”。</div></div></div>`;
  return collapsibleCard('技术面分析流程',body,false,'默认折叠，截图或历史价格导入后，用于整理技术形态资料和 technicalReview。');
}
function saveCollectionInputs(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const prev=normalizeCollectionInputs(stock.collectionInputs);
  const next=normalizeCollectionInputs({
    newsRawText:document.getElementById('ci_newsRawText').value,
    financialRawText:document.getElementById('ci_financialRawText').value,
    socialRawText:document.getElementById('ci_socialRawText').value,
    technicalRawText:document.getElementById('ci_technicalRawText').value,
    generalRawText:document.getElementById('ci_generalRawText').value
  });
  stock.collectionInputs=next;
  if(next.newsRawText!==prev.newsRawText)touchDataFreshness(stock,'newsUpdatedAt');
  if(next.financialRawText!==prev.financialRawText)touchDataFreshness(stock,'financialUpdatedAt');
  if(next.socialRawText!==prev.socialRawText)touchDataFreshness(stock,'socialUpdatedAt');
  if(next.technicalRawText!==prev.technicalRawText)touchDataFreshness(stock,'technicalUpdatedAt');
  saveState();
  render();
  alert('采集资料已保存。');
}
function copyCollectionPrompt(kind){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(collectionPromptText(stock,kind),'AI整理提示词已复制。');
}
const AI_REVIEW_TYPES={
  newsReview:{label:'新闻复核',freshnessKey:'newsUpdatedAt',defaults:{summary:'',positivePoints:[],negativePoints:[],riskPoints:[],attentionPoints:[],sentiment:'neutral',confidence:'medium'}},
  financialReview:{label:'财报复核',freshnessKey:'financialUpdatedAt',defaults:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'medium'}},
  socialReview:{label:'社媒复核',freshnessKey:'socialUpdatedAt',defaults:{summary:'',hotTopics:[],bullishArguments:[],bearishArguments:[],rumorRisks:[],sentiment:'neutral',confidence:'medium'}},
  technicalReview:{label:'技术复核',freshnessKey:'technicalUpdatedAt',defaults:{summary:'',trend:'sideways',supportLevels:[],resistanceLevels:[],volumeSignal:'',riskSignal:'',operationSuggestion:'',confidence:'medium'}},
  comprehensiveReview:{label:'综合复核',freshnessKey:'comprehensiveReviewUpdatedAt',defaults:{summary:'',mainConclusion:'',whatChanged:[],actionBias:'watch',keyRisks:[],nextUpdateNeeded:[],confidence:'medium'}}
};
function aiReviewTypeOptions(selected='newsReview'){
  return Object.keys(AI_REVIEW_TYPES).map(k=>`<option value="${k}"${k===selected?' selected':''}>${AI_REVIEW_TYPES[k].label} ${k}</option>`).join('');
}
function normalizeAiReviewPayload(type,payload){
  const cfg=AI_REVIEW_TYPES[type];
  if(!cfg||!payload||typeof payload!=='object'||Array.isArray(payload))return null;
  const source=(payload[type]&&typeof payload[type]==='object'&&!Array.isArray(payload[type]))?payload[type]:payload;
  const out={...source};
  Object.entries(cfg.defaults).forEach(([k,v])=>{
    if(out[k]===undefined)out[k]=Array.isArray(v)?[]:v;
    else if(Array.isArray(v)&&!Array.isArray(out[k]))out[k]=String(out[k]||'').trim()?[String(out[k])]:[];
    else if(!Array.isArray(v)&&out[k]===null)out[k]='';
  });
  return out;
}
function stripJsonFence(text){
  const s=String(text||'').trim();
  const m=s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m?m[1].trim():s;
}
function extractFirstJsonObject(text){
  const s=stripJsonFence(text);
  try{return JSON.parse(s)}catch(e){}
  let start=-1,depth=0,inString=false,escape=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(inString){
      if(escape)escape=false;
      else if(ch==='\\')escape=true;
      else if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue}
    if(ch==='{'){
      if(depth===0)start=i;
      depth++;
    }else if(ch==='}'&&depth>0){
      depth--;
      if(depth===0&&start>=0){
        const candidate=s.slice(start,i+1);
        try{return JSON.parse(candidate)}catch(e){}
      }
    }
  }
  throw new Error('未找到合法 JSON 对象');
}
function aiReviewUpdatedAt(stock,type){
  const f=normalizeDataFreshness(stock.dataFreshness);
  const key=AI_REVIEW_TYPES[type]&&AI_REVIEW_TYPES[type].freshnessKey;
  return key?f[key]:'';
}
function currentAiReviewType(){
  const el=document.getElementById('aiReviewType');
  return (el&&AI_REVIEW_TYPES[el.value])?el.value:'newsReview';
}
function aiReviewImportPanel(stock){
  const reviews=normalizeAiReviews(stock.aiReviews);
  const body=`<div class="form-row two"><div><label>Review 类型</label><select id="aiReviewType">${aiReviewTypeOptions()}</select></div><div><label>当前状态</label><div class="card-note" id="aiReviewCurrentStatus">选择类型后显示</div></div></div><div class="form-row"><label>JSON 粘贴框</label><textarea id="aiReviewJsonText" style="min-height:150px" placeholder="可粘贴纯 JSON、Markdown json 代码块，或前后带说明文字的 AI 返回内容。">${esc(JSON.stringify(reviews.newsReview||{},null,2))}</textarea></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn ghost small" id="importAiReviewBtn" type="button">导入 AI Review</button><button class="btn ghost small" id="clearAiReviewBtn" type="button">清空当前 Review</button><button class="btn ghost small" id="copyAiReviewBtn" type="button">复制当前 Review JSON</button></div><div class="card-note" style="margin-top:8px">AI Review 只写入 aiReviews，不会覆盖九模块评分、估值数据或决策建议。</div>`;
  return collapsibleCard('AI 复核导入',body,false,'默认折叠，展开后粘贴 AI 返回 JSON。');
}
function refreshAiReviewImportBox(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const type=currentAiReviewType();
  const reviews=normalizeAiReviews(stock.aiReviews);
  const current=reviews[type];
  const text=document.getElementById('aiReviewJsonText');
  if(text)text.value=current?JSON.stringify(current,null,2):'';
  const status=document.getElementById('aiReviewCurrentStatus');
  if(status)status.textContent=`${current?'已导入':'暂无复核'} · 更新 ${aiReviewUpdatedAt(stock,type)||'—'}`;
}
function importAiReview(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const type=currentAiReviewType();
  const original=JSON.parse(JSON.stringify(normalizeAiReviews(stock.aiReviews)));
  let parsed,review;
  try{
    parsed=extractFirstJsonObject(document.getElementById('aiReviewJsonText').value);
    review=normalizeAiReviewPayload(type,parsed);
    if(!review)throw new Error('JSON 对象为空或类型不匹配');
  }catch(e){
    stock.aiReviews=original;
    alert('导入失败：'+e.message);
    return;
  }
  stock.aiReviews=normalizeAiReviews(stock.aiReviews);
  stock.aiReviews[type]=review;
  touchDataFreshness(stock,AI_REVIEW_TYPES[type].freshnessKey);
  saveState();
  render();
  alert(`${AI_REVIEW_TYPES[type].label}已导入。`);
}
function clearAiReview(type=currentAiReviewType(),silent=false){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock||!AI_REVIEW_TYPES[type])return;
  if(!silent&&!confirm(`确认清空当前股票的${AI_REVIEW_TYPES[type].label}？`))return;
  stock.aiReviews=normalizeAiReviews(stock.aiReviews);
  stock.aiReviews[type]=null;
  saveState();
  render();
  if(!silent)alert(`${AI_REVIEW_TYPES[type].label}已清空。`);
}
function copyCurrentAiReview(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const type=currentAiReviewType();
  const reviews=normalizeAiReviews(stock.aiReviews);
  copyText(JSON.stringify(reviews[type]||{},null,2),'当前 AI Review JSON 已复制。');
}
function copyAllAiReviews(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(JSON.stringify(normalizeAiReviews(stock.aiReviews),null,2),'全部 AI Review JSON 已复制。');
}
function clearAllAiReviews(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  if(!confirm('确认清空当前股票的全部 AI Review？'))return;
  stock.aiReviews=defaultAiReviews();
  saveState();
  render();
  alert('全部 AI Review 已清空。');
}
function reviewList(values){
  const arr=Array.isArray(values)?values.filter(x=>String(x||'').trim()):[];
  if(!arr.length)return '';
  return `<ul style="margin:6px 0 0;padding-left:18px">${arr.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}
function reviewCoreTag(type,review){
  if(!review)return '';
  if(type==='technicalReview')return review.trend||'';
  if(type==='comprehensiveReview')return review.actionBias||'';
  return review.sentiment||'';
}
function aiReviewBlock(stock,type){
  const cfg=AI_REVIEW_TYPES[type];
  const review=normalizeAiReviews(stock.aiReviews)[type];
  if(!review)return `<div class="social-review-block"><div class="card-title">${cfg.label}</div><div class="social-empty">暂无复核</div></div>`;
  const positives=review.positivePoints||review.bullishArguments||review.whatChanged||[];
  const negatives=review.negativePoints||review.bearishArguments||[];
  const risks=review.riskPoints||review.rumorRisks||review.keyRisks||[];
  const extra=type==='technicalReview'?reviewList([review.volumeSignal,review.riskSignal,review.operationSuggestion].filter(Boolean)):(type==='financialReview'?reviewList([review.revenueTrend,review.profitTrend,review.marginTrend,review.cashFlowTrend,review.debtRisk,review.growthQuality].filter(Boolean)):reviewList(review.attentionPoints||review.hotTopics||review.nextUpdateNeeded||[]));
  return `<div class="social-review-block"><div class="card-title">${cfg.label}</div><div class="card-note">更新 ${esc(aiReviewUpdatedAt(stock,type)||'—')} · ${esc(reviewCoreTag(type,review)||'—')} · 置信度 ${esc(review.confidence||'—')}</div><div class="text" style="max-width:none;margin-top:6px">${esc(review.summary||review.mainConclusion||'—')}</div>${positives.length?'<div class="card-note" style="margin-top:6px"><b>利多/变化</b></div>'+reviewList(positives):''}${negatives.length?'<div class="card-note" style="margin-top:6px"><b>利空</b></div>'+reviewList(negatives):''}${risks.length?'<div class="card-note social-risk" style="margin-top:6px"><b>风险</b></div>'+reviewList(risks):''}${extra}</div>`;
}
function aiReviewSummaryPanel(stock){
  const types=Object.keys(AI_REVIEW_TYPES);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">AI 复核结论 <button class="link-btn" id="copyAllAiReviewsBtn" type="button" style="float:right;margin-left:10px">复制全部 AI Review JSON</button><button class="link-btn danger" id="clearAllAiReviewsBtn" type="button" style="float:right">清空全部 AI Review</button></div><div class="social-review-note">仅作信息复核，不构成买卖指令；不会自动改变九模块评分或仓位建议。</div><div class="social-review-grid">${types.map(t=>aiReviewBlock(stock,t)).join('')}</div></div>`;
}
const UNIFIED_PROMPT_TYPES={
  promptValuation:'估值判断',
  promptNews:'新闻复核',
  promptFinancialIntegrated:'财报一体化解析',
  promptFinancialData:'财务数据提取',
  promptFinancial:'财报复核分析',
  promptSocial:'社媒复核',
  promptTechnical:'技术复核',
  promptComprehensive:'综合复核',
  promptScoreSuggestion:'九模块评分建议',
  promptActionReview:'操作建议复核'
};
function unifiedPromptTypeOptions(selected='promptComprehensive'){
  return Object.keys(UNIFIED_PROMPT_TYPES).map(k=>`<option value="${k}"${k===selected?' selected':''}>${UNIFIED_PROMPT_TYPES[k]}</option>`).join('');
}
function promptOutputSchema(type){
  const schemas={
    promptValuation:{valuationData:{pe:null,forwardPe:null,pb:null,ps:null,evEbitda:null,peg:null,analystTargetPrice:null,analystRating:'',valuationSummary:'',valuationRisk:'',valuationConclusion:'cheap|fair|expensive|unclear',confidence:'high|medium|low'}},
    promptNews:{newsReview:{summary:'',positivePoints:[],negativePoints:[],riskPoints:[],attentionPoints:[],sentiment:'positive|neutral|negative',confidence:'high|medium|low'}},
    promptFinancialIntegrated:{financialData:{revenue:0,revenueGrowth:0,netProfit:0,profitGrowth:0,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'',currency:'',financialNote:'',lastUpdated:''},financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'high|medium|low'}},
    promptFinancialData:{financialData:{revenue:0,revenueGrowth:0,netProfit:0,profitGrowth:0,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'',currency:'',financialNote:'',lastUpdated:''}},
    promptFinancial:{financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'high|medium|low'}},
    promptSocial:{socialReview:{summary:'',hotTopics:[],bullishArguments:[],bearishArguments:[],rumorRisks:[],sentiment:'positive|neutral|negative',confidence:'high|medium|low'}},
    promptTechnical:{technicalReview:{summary:'',trend:'up|sideways|down',supportLevels:[],resistanceLevels:[],volumeSignal:'',riskSignal:'',operationSuggestion:'',confidence:'high|medium|low'}},
    promptComprehensive:{comprehensiveReview:{summary:'',mainConclusion:'',whatChanged:[],actionBias:'buy|hold|reduce|watch',keyRisks:[],nextUpdateNeeded:[],confidence:'high|medium|low'}},
    promptScoreSuggestion:{scoreSuggestion:{business:{score:null,reason:''},industry:{score:null,reason:''},financial:{score:null,reason:''},valuation:{score:null,reason:''},growth:{score:null,reason:''},management:{score:null,reason:''},technical:{score:null,reason:''},risk:{score:null,reason:''},position:{score:null,reason:''},overallComment:'',confidence:'high|medium|low'}},
    promptActionReview:{actionReview:{currentBias:'buy|hold|reduce|watch',suggestedAction:'',buyConditions:[],holdConditions:[],reduceConditions:[],stopLossOrRiskLine:'',positionAdvice:'',reason:'',confidence:'high|medium|low'}}
  };
  return schemas[type]||schemas.promptComprehensive;
}
function promptRawTextForType(stock,type){
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  if(type==='promptValuation')return {valuationRawText:inputs.valuationRawText};
  if(type==='promptNews')return {newsRawText:ci.newsRawText};
  if(type==='promptFinancialIntegrated'||type==='promptFinancialData'||type==='promptFinancial')return {financialReport:inputs.financialReport,financialRawText:ci.financialRawText};
  if(type==='promptSocial')return {socialRawText:ci.socialRawText};
  if(type==='promptTechnical')return {technicalRawText:ci.technicalRawText};
  return {collectionInputs:ci,valuationRawText:inputs.valuationRawText};
}
function promptMissingRawTextHint(stock,type){
  const raw=promptRawTextForType(stock,type);
  const has=Object.values(raw).some(v=>typeof v==='string'?String(v).trim():Object.values(v||{}).some(x=>String(x||'').trim()));
  if(has||['promptScoreSuggestion','promptActionReview'].includes(type))return '';
  return '提示：当前缺少对应原始资料，请先在信息采集面板或估值助手中粘贴资料。';
}
function promptFreshnessHints(stock){
  const f=normalizeDataFreshness(stock.dataFreshness);
  const labels={priceUpdatedAt:'价格',valuationUpdatedAt:'估值',newsUpdatedAt:'新闻',socialUpdatedAt:'社媒',financialUpdatedAt:'财报',technicalUpdatedAt:'技术',personalViewUpdatedAt:'个人观点',comprehensiveReviewUpdatedAt:'综合复核'};
  return Object.keys(labels).map(k=>{
    const st=dataFreshnessStatus(f[k]);
    return {field:k,label:labels[k],date:f[k]||'',status:st.label,days:st.days};
  });
}
function promptBaseContext(stock,type){
  normalizeStockAnalysis(stock);
  const total=getEstimatedTotalAssets();
  const mv=getMarketValue(stock);
  const decision=calculateDecision(stock,{totalMarketValue:total});
  const execution=calculateExecutionPlan(stock,{totalMarketValue:total});
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  return {
    stock:{
      name:stock.name||'',
      symbol:stock.code||'',
      market:getCurrency(stock)||'',
      status:stock.type==='watching'?'观察':'持仓',
      role:stock.role||'',
      theme:stock.theme||'',
      shares:Number(stock.shares)||0,
      cost:stock.avgCost||'',
      currentPrice:stock.currentPrice||stock.currentValue||'',
      holdingValue:mv,
      targetPct:stock.targetPct||''
    },
    dataFreshness:normalizeDataFreshness(stock.dataFreshness),
    freshnessHints:promptFreshnessHints(stock),
    personalView:inputs.personalView,
    valuationData:normalizeValuationData(stock.valuationData),
    aiReviews:normalizeAiReviews(stock.aiReviews),
    analysisInputs:{valuationRawText:inputs.valuationRawText},
    rawMaterials:promptRawTextForType(stock,type),
    analysisScore:stock.analysisScore,
    analysisFramework:normalizeAnalysisFramework(stock.analysisFramework,stock),
    strategy:normalizeStrategy(stock.strategy,stock),
    decision:{decisionScore:decision.decisionScore,action:decision.action,suggestedAction:decision.suggestedAction,warnings:decision.warnings},
    executionPlan:{suggestedBuyAmount:execution.suggestedBuyAmount,suggestedShares:execution.suggestedShares,executionStatus:execution.executionStatus,priceTiming:execution.priceTiming}
  };
}
function buildFinancialDataExtractionPrompt(stock,missing=''){
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const today=typeof todayDate==='function'?todayDate():new Date().toISOString().slice(0,10);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||'',market:getCurrency(stock)||''},
    currentFinancialData:normalizeFinancialData(stock.financialData),
    financialReport:inputs.financialReport||'',
    supplementalFinancialRawText:ci.financialRawText||''
  };
  const schema=promptOutputSchema('promptFinancialData');
  const example={financialData:{revenue:208.75,revenueGrowth:31.8,netProfit:44.15,profitGrowth:32.72,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'2025',currency:'CNY',financialNote:'原文披露营收、净利润及同比增速；毛利率、ROE、现金流等未披露。',lastUpdated:today}};
  return [
    '你是一名严谨的财务数据提取助手。',
    '',
    '当前任务只做“财务数据提取”，不是投资建议，不做评分，不做综合分析。',
    '请只根据我提供的 financialReport 原文提取明确出现的数据。',
    'analysisInputs.financialReport 是主要可信来源；supplementalFinancialRawText 仅作补充参考。',
    'financialData 中已有的 0 值代表缺失，不代表真实为 0。',
    'valuationData 中的 0 代表缺失，不作为财务数据来源。',
    '如果原文没有明确披露某项指标，必须保留为 0 或空字符串。',
    '严禁根据行业经验、估算、反推或外部资料补全字段。',
    '严禁推测 ROE、毛利率、净利率、现金流、负债率、EPS。',
    '只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
    '输出顶层只能包含 financialData。',
    '禁止输出 financialReview。',
    '禁止输出 analysisFramework。',
    '禁止输出 scoreSuggestion。',
    '禁止输出文字说明。',
    missing?`提示：${missing}`:'',
    '',
    '字段规则：',
    '- revenue：营业收入，单位按“亿元”转换为数字，不写单位。例如 208.75 亿元 -> 208.75。',
    '- revenueGrowth：营收同比增速，百分比只写数字。例如 31.80% -> 31.8。',
    '- netProfit：归母净利润或净利润，单位按“亿元”转换为数字。',
    '- profitGrowth：归母净利润同比增速，百分比只写数字。',
    '- grossMargin：毛利率，原文没有则 0。',
    '- netMargin：净利率，原文没有则 0。',
    '- roe：ROE，原文没有则 0。',
    '- operatingCashFlow：经营现金流，原文没有则 0。',
    '- freeCashFlow：自由现金流，原文没有则 0。',
    '- debtRatio：资产负债率或有息负债率，原文没有则 0。',
    '- eps：每股收益，原文没有则 0。',
    '- reportPeriod：报告期，例如 "2025"、"2025Q3"、"2025A"。',
    '- currency：人民币填 "CNY"；港币填 "HKD"；美元填 "USD"；无法判断填 ""。',
    '- financialNote：用一句话说明数据来源和缺失项，不超过 80 字。',
    `- lastUpdated：填今天日期 "${today}"。`,
    '',
    '当前输入：',
    JSON.stringify(ctx,null,2),
    '',
    '固定输出结构：',
    JSON.stringify(schema,null,2),
    '',
    '示例：',
    '如果 financialReport 为：',
    '“公司2025年实现营业收入208.75亿元，同比增长31.80%；归母净利润44.15亿元，同比增长32.72%。”',
    '',
    '正确输出：',
    JSON.stringify(example,null,2)
  ].filter(x=>x!==undefined&&x!==null&&x!=='').join('\n');
}
function buildFinancialReviewPrompt(stock,missing=''){
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||'',market:getCurrency(stock)||''},
    financialReport:inputs.financialReport||'',
    supplementalFinancialRawText:ci.financialRawText||'',
    existingFinancialReview:(normalizeAiReviews(stock.aiReviews)||{}).financialReview||null
  };
  return [
    '你是一名严谨的财报分析复核助手。',
    '',
    '当前任务只做“财报复核分析”，输出 aiReviews.financialReview。',
    '可以基于 financialReport 原文做定性分析，但不要提取或导入 financialData。',
    '如果缺少毛利率、现金流、负债率等信息，请在 riskPoints 或 confidence 中体现。',
    '不要输出九模块评分，不要输出操作建议，不要输出 analysisFramework。',
    '只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
    '输出顶层只能包含 financialReview。',
    missing?`提示：${missing}`:'',
    '',
    '当前输入：',
    JSON.stringify(ctx,null,2),
    '',
    '固定输出结构：',
    JSON.stringify(promptOutputSchema('promptFinancial'),null,2)
  ].filter(x=>x!==undefined&&x!==null&&x!=='').join('\n');
}
function buildFinancialIntegratedPrompt(stock,missing=''){
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const today=typeof todayDate==='function'?todayDate():new Date().toISOString().slice(0,10);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||'',market:getCurrency(stock)||''},
    currentFinancialData:normalizeFinancialData(stock.financialData),
    financialReport:inputs.financialReport||'',
    supplementalFinancialRawText:ci.financialRawText||''
  };
  const example={
    financialData:{revenue:208.75,revenueGrowth:31.8,netProfit:44.15,profitGrowth:32.72,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'2025',currency:'CNY',financialNote:'原文披露营收、净利润及同比增速；毛利率、ROE、现金流等未披露。',lastUpdated:today},
    financialReview:{summary:'营收和归母净利润均实现约三成增长，成长表现较强，但现金流、利润率和负债数据缺失。',revenueTrend:'营业收入同比增长31.8%，收入增长较快。',profitTrend:'归母净利润同比增长32.72%，利润增速略高于收入增速。',marginTrend:'原文未披露毛利率和净利率，无法判断利润率趋势。',cashFlowTrend:'原文未披露经营现金流和自由现金流。',debtRisk:'原文未披露资产负债率或有息负债情况。',growthQuality:'收入和利润同步增长，初步显示成长质量较好，但仍需现金流和利润率数据验证。',positivePoints:['收入同比增长31.8%','归母净利润同比增长32.72%'],negativePoints:[],riskPoints:['缺少现金流数据','缺少利润率数据','缺少负债数据'],confidence:'medium'}
  };
  return [
    '你是一名严谨的财报解析与投资复核助手。',
    '',
    '当前任务是基于用户提供的财报/业绩资料，同时完成两件事：',
    '1. 提取结构化财务数据 financialData。',
    '2. 生成财报复核分析 financialReview。',
    '',
    '重要规则：',
    '- 只根据用户提供的 financialReport / 财报资料判断。',
    '- financialData 中已有的 0 代表缺失，不代表真实为 0。',
    '- 未明确披露的数据必须保持 0 或空字符串。',
    '- 严禁根据行业经验、估算、反推或外部资料补全 ROE、毛利率、现金流、负债率、EPS。',
    '- financialReview 可以做定性分析，但必须明确哪些结论来自已披露数据，哪些信息缺失。',
    '- 不输出九模块评分。',
    '- 不输出操作建议。',
    '- 不输出 Markdown。',
    '- 不输出解释文字。',
    '- 只输出严格 JSON。',
    '- 顶层只能包含 financialData 和 financialReview。',
    missing?`- ${missing}`:'',
    '',
    'financialData 字段规则：',
    '- revenue：营业收入，单位按“亿元”转换为数字，不写单位。',
    '- revenueGrowth：营收同比增速，百分比只写数字。',
    '- netProfit：归母净利润或净利润，单位按“亿元”转换为数字。',
    '- profitGrowth：归母净利润同比增速，百分比只写数字。',
    '- grossMargin：毛利率，原文没有则 0。',
    '- netMargin：净利率，原文没有则 0。',
    '- roe：ROE，原文没有则 0。',
    '- operatingCashFlow：经营现金流，原文没有则 0。',
    '- freeCashFlow：自由现金流，原文没有则 0。',
    '- debtRatio：资产负债率或有息负债率，原文没有则 0。',
    '- eps：每股收益，原文没有则 0。',
    '- reportPeriod：报告期，例如 "2025"、"2025Q3"、"2025A"。',
    '- currency：人民币 CNY，港币 HKD，美元 USD，无法判断填 ""。',
    '- financialNote：一句话说明数据来源和缺失项，不超过 100 字。',
    `- lastUpdated：今天日期 "${today}"。`,
    '',
    'financialReview 字段规则：',
    '- summary：一句话总结财报质量。',
    '- revenueTrend：收入趋势。',
    '- profitTrend：利润趋势。',
    '- marginTrend：毛利率/净利率趋势；缺失则说明未披露。',
    '- cashFlowTrend：现金流趋势；缺失则说明未披露。',
    '- debtRisk：债务风险；缺失则说明未披露。',
    '- growthQuality：增长质量判断。',
    '- positivePoints：利好点数组。',
    '- negativePoints：利空点数组。',
    '- riskPoints：风险点数组。',
    '- confidence：high / medium / low。',
    '',
    '当前输入：',
    JSON.stringify(ctx,null,2),
    '',
    '固定输出结构：',
    JSON.stringify(promptOutputSchema('promptFinancialIntegrated'),null,2),
    '',
    '示例：',
    '如果财报资料为：',
    '“公司2025年实现营业收入208.75亿元，同比增长31.80%；归母净利润44.15亿元，同比增长32.72%。”',
    '',
    '正确输出：',
    JSON.stringify(example,null,2)
  ].filter(x=>x!==undefined&&x!==null&&x!=='').join('\n');
}
function buildUnifiedPrompt(stock,type){
  const label=UNIFIED_PROMPT_TYPES[type]||UNIFIED_PROMPT_TYPES.promptComprehensive;
  const missing=promptMissingRawTextHint(stock,type);
  if(type==='promptFinancialIntegrated')return buildFinancialIntegratedPrompt(stock,missing);
  if(type==='promptFinancialData')return buildFinancialDataExtractionPrompt(stock,missing);
  if(type==='promptFinancial')return buildFinancialReviewPrompt(stock,missing);
  const taskMap={
    promptValuation:'根据估值资料提取估值数据并判断估值水平；不要输出九模块 valuation 评分，不要覆盖 personalView。',
    promptNews:'根据新闻资料做新闻复核，提取利多、利空、风险和关注点。',
    promptFinancial:'根据财报/业绩资料做财报复核分析，输出 financialReview。该 Prompt 不是 financialData 导入入口，不输出 financialData、九模块评分或操作建议。缺少毛利率、现金流、负债率等信息时，请在 riskPoints 或 confidence 中体现。',
    promptSocial:'根据社媒讨论资料做舆情复核，区分事实、观点和传闻风险。',
    promptTechnical:'技术复核：用于根据 technicalData 和技术形态资料生成 aiReviews.technicalReview，不会自动修改技术评分；重点识别趋势、支撑、压力、成交量和风险信号。',
    promptComprehensive:'结合估值、AI Review、采集资料、个人观点、持仓和更新时间做综合复核。',
    promptScoreSuggestion:'基于已有资料给出九模块评分建议。只做建议，不要求程序自动导入，程序不会自动写入评分，资料不足时 score 为 null。',
    promptActionReview:'基于已有资料复核当前操作倾向。只做辅助判断，程序不会自动修改操作建议。'
  };
  return [
    `任务：${label}`,
    '',
    '通用要求：',
    '1. 请只基于我提供的资料判断。',
    '2. 不确定就标记 confidence low。',
    '3. 不要编造缺失数据。',
    '4. 输出先给可读结论，再给 JSON。',
    '5. JSON 必须能直接导入或复制进投资手册。',
    '6. 不构成买卖指令，仅作信息复核和决策辅助。',
    missing?`7. ${missing}`:'',
    '',
    '具体任务说明：',
    taskMap[type]||taskMap.promptComprehensive,
    '',
    '当前上下文：',
    JSON.stringify(promptBaseContext(stock,type),null,2),
    '',
    '请输出以下 JSON 结构：',
    JSON.stringify(promptOutputSchema(type),null,2)
  ].filter(x=>x!==undefined&&x!==null&&x!=='').join('\n');
}
function unifiedPromptPanel(stock){
  const body=`<div class="form-row two"><div><label>Prompt 类型</label><select id="unifiedPromptType">${unifiedPromptTypeOptions()}</select></div><div><label>操作</label><div class="modal-actions" style="justify-content:flex-start;margin:0;flex-wrap:wrap"><button class="btn ghost small" id="generateUnifiedPromptBtn" type="button">生成 Prompt</button><button class="btn ghost small" id="copyUnifiedPromptBtn" type="button">复制当前 Prompt</button><button class="btn ghost small" id="clearUnifiedPromptBtn" type="button">清空预览</button></div></div></div><div class="form-row"><label>Prompt 预览</label><textarea id="unifiedPromptPreview" style="min-height:220px" placeholder="选择类型后点击“生成 Prompt”。"></textarea></div><div class="card-note">本区域只生成和复制 Prompt，不会调用 AI，不会写入评分，也不会修改操作建议。</div>`;
  return collapsibleCard('统一 Prompt 生成器',body,false,'默认折叠，展开后生成单项 Prompt。');
}
function generateUnifiedPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const type=document.getElementById('unifiedPromptType').value||'promptComprehensive';
  document.getElementById('unifiedPromptPreview').value=buildUnifiedPrompt(stock,type);
}
function copyUnifiedPrompt(){
  const el=document.getElementById('unifiedPromptPreview');
  if(!el)return;
  if(!String(el.value||'').trim())generateUnifiedPrompt();
  copyText(document.getElementById('unifiedPromptPreview').value,'Prompt 已复制。');
}
function clearUnifiedPrompt(){
  const el=document.getElementById('unifiedPromptPreview');
  if(el)el.value='';
}
function shortenPackageText(value,limit=900){
  const s=String(value||'').trim();
  if(!s)return '';
  return s.length>limit?s.slice(0,limit)+`\n...[已截断 ${s.length-limit} 字]`:s;
}
function reviewPackageFreshnessNotes(stock){
  const f=normalizeDataFreshness(stock.dataFreshness);
  const labels={priceUpdatedAt:'价格',valuationUpdatedAt:'估值',newsUpdatedAt:'新闻',socialUpdatedAt:'社媒',financialUpdatedAt:'财报',technicalUpdatedAt:'技术',personalViewUpdatedAt:'个人观点',comprehensiveReviewUpdatedAt:'综合复核'};
  return Object.keys(labels).map(k=>{
    const st=dataFreshnessStatus(f[k]);
    let note=st.label;
    if(st.days===null)note='未更新';
    else if(st.days>30)note='超过30天';
    else if(st.days>7)note='超过7天';
    return {field:k,label:labels[k],date:f[k]||'',days:st.days,note};
  });
}
function buildReviewPackageContext(stock,mode='standard'){
  normalizeStockAnalysis(stock);
  const total=getEstimatedTotalAssets();
  const mv=getMarketValue(stock);
  const currentPrice=Number(stock.currentPrice||stock.currentValue||0);
  const cost=Number(stock.avgCost||0);
  const shares=Number(stock.shares)||0;
  const pnl=(currentPrice>0&&cost>0&&shares>0)?{amount:(currentPrice-cost)*shares,percent:(currentPrice-cost)/cost*100}:null;
  const decision=calculateDecision(stock,{totalMarketValue:total});
  const execution=calculateExecutionPlan(stock,{totalMarketValue:total});
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  const ci=normalizeCollectionInputs(stock.collectionInputs);
  const rawMode=mode==='full'?'full':(mode==='standard'?'summary':'none');
  const rawText=rawMode==='none'?{}:{
    valuationRawText:rawMode==='full'?inputs.valuationRawText:shortenPackageText(inputs.valuationRawText),
    newsRawText:rawMode==='full'?ci.newsRawText:shortenPackageText(ci.newsRawText),
    financialRawText:rawMode==='full'?ci.financialRawText:shortenPackageText(ci.financialRawText),
    socialRawText:rawMode==='full'?ci.socialRawText:shortenPackageText(ci.socialRawText),
    technicalRawText:rawMode==='full'?ci.technicalRawText:shortenPackageText(ci.technicalRawText),
    generalRawText:rawMode==='full'?ci.generalRawText:shortenPackageText(ci.generalRawText)
  };
  return {
    packageMode:mode,
    stock:{
      name:stock.name||'',
      symbol:stock.code||'',
      market:getCurrency(stock)||'',
      status:stock.type==='watching'?'观察':'持仓',
      role:stock.role||'',
      theme:stock.theme||'',
      shares,
      cost:stock.avgCost||'',
      currentPrice:stock.currentPrice||stock.currentValue||'',
      holdingValue:mv,
      unrealizedPnl:pnl,
      focus:isFocusStockForUpdate(stock)
    },
    systemJudgement:{
      analysisScore:stock.analysisScore,
      analysisFramework:normalizeAnalysisFramework(stock.analysisFramework,stock),
      strategy:normalizeStrategy(stock.strategy,stock),
      decision,
      executionPlan:execution
    },
    dataFreshness:mode==='compact'?undefined:normalizeDataFreshness(stock.dataFreshness),
    freshnessNotes:reviewPackageFreshnessNotes(stock),
    valuation:{
      valuationData:normalizeValuationData(stock.valuationData),
      valuationRawText:mode==='compact'?undefined:rawText.valuationRawText
    },
    aiReviews:normalizeAiReviews(stock.aiReviews),
    collectionInputs:mode==='compact'?undefined:{
      newsRawText:rawText.newsRawText,
      financialRawText:rawText.financialRawText,
      socialRawText:rawText.socialRawText,
      technicalRawText:rawText.technicalRawText,
      generalRawText:rawText.generalRawText
    },
    personalView:inputs.personalView,
    notes:stock.notes||stock.thesis||'',
    executionLogs:typeof getExecutionLogRows==='function'?getExecutionLogRows(stock.name).slice(0,8):[]
  };
}
function buildComprehensiveReviewPackage(stock,mode='standard'){
  const modeName={compact:'精简模式',standard:'标准模式',full:'完整模式'}[mode]||'标准模式';
  const longNote=mode==='full'?'注意：完整模式包含原始资料全文，内容可能较长。':'';
  return [
    `任务：综合复核自动组包（${modeName}）`,
    longNote,
    '',
    '请作为投资研究助理，基于以下综合复核包进行分析。',
    '',
    '约束：',
    '1. 只基于提供资料分析。',
    '2. 不确定就写 confidence low。',
    '3. 不要编造缺失财务或估值数据。',
    '4. 不直接修改九模块评分。',
    '5. 不直接替用户做交易决定。',
    '6. 如果资料过期或缺失，要在 nextUpdateNeeded 中指出。',
    '',
    '请先给可读结论：',
    '- 当前结论',
    '- 和之前相比主要变化',
    '- 当前最关键风险',
    '- 操作倾向',
    '- 下一步需要更新什么',
    '',
    '然后输出可导入 JSON：',
    JSON.stringify(promptOutputSchema('promptComprehensive'),null,2),
    '',
    '综合复核包：',
    JSON.stringify(buildReviewPackageContext(stock,mode),null,2)
  ].filter(Boolean).join('\n');
}
function comprehensivePackagePanel(stock){
  const body=`<div class="form-row two"><div><label>组包模式</label><select id="reviewPackageMode"><option value="compact">精简</option><option value="standard" selected>标准</option><option value="full">完整</option></select></div><div><label>操作</label><div class="modal-actions" style="justify-content:flex-start;margin:0;flex-wrap:wrap"><button class="btn ghost small" id="generateReviewPackageBtn" type="button">生成综合复核包</button><button class="btn ghost small" id="copyReviewPackageBtn" type="button">复制当前综合复核包</button><button class="btn ghost small" id="clearReviewPackageBtn" type="button">清空预览</button></div></div></div><div class="form-row"><label>复核包预览 <span class="muted" id="reviewPackageCount">0 字符</span></label><textarea id="reviewPackagePreview" style="min-height:240px" placeholder="选择模式后点击“生成综合复核包”。完整模式可能较长。"></textarea></div><div class="card-note">本区域只组包和复制，不调用 AI，不导入结果，不修改评分或操作建议。</div>`;
  return collapsibleCard('综合复核自动组包',body,false,'默认折叠，展开后一键生成综合复核包。');
}
function updateReviewPackageCount(){
  const el=document.getElementById('reviewPackagePreview');
  const count=document.getElementById('reviewPackageCount');
  if(el&&count)count.textContent=`${String(el.value||'').length} 字符`;
}
function generateReviewPackage(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const mode=document.getElementById('reviewPackageMode').value||'standard';
  document.getElementById('reviewPackagePreview').value=buildComprehensiveReviewPackage(stock,mode);
  updateReviewPackageCount();
}
function copyReviewPackage(){
  const el=document.getElementById('reviewPackagePreview');
  if(!el)return;
  if(!String(el.value||'').trim())generateReviewPackage();
  copyText(document.getElementById('reviewPackagePreview').value,'综合复核包已复制。');
}
function clearReviewPackage(){
  const el=document.getElementById('reviewPackagePreview');
  if(el)el.value='';
  updateReviewPackageCount();
}

function render(){
  const d=new Date();
  document.getElementById('dateStamp').textContent=d.toISOString().slice(0,10).replace(/-/g,'.')+' · '+d.toLocaleDateString('zh-CN',{weekday:'long'});
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===currentTab));
  document.getElementById('countHolding').textContent=state.stocks.filter(s=>s.type==='holding').length;
  document.getElementById('countEtf').textContent=state.stocks.filter(s=>s.type==='etf').length;
  document.getElementById('countWatching').textContent=state.stocks.filter(s=>s.type==='watching').length;
  document.getElementById('syncHint').textContent=(state.updatedAt?'最后修改 · '+new Date(state.updatedAt).toLocaleString('zh-CN'):'')+backupReminderText();
  const fxBtn=document.getElementById('fxBtn');
  if(fxBtn)fxBtn.textContent=fxLabel();
  const actions=document.getElementById('globalActions');
  if(actions)actions.style.display=currentTab==='tools'&&!detailStockId?'':'none';
  const socialStatus=document.getElementById('socialDataStatus');
  if(socialStatus)socialStatus.style.display=currentTab==='tools'&&!detailStockId?'':'none';
  if(detailStockId)renderStockDetail();
  else if(currentTab==='dashboard')renderDashboard();
  else if(currentTab==='logs')renderExecutionLog();
  else if(currentTab==='analysis')renderAnalysisOverview();
  else if(currentTab==='tools')renderTools();
  else renderTable();
}
function renderDashboard(){
  const summary=document.getElementById('summary');
  const main=document.getElementById('main');
  if(!state.stocks.length){
    summary.innerHTML='暂无数据 · 请到「工具」页导入 JSON';
    main.innerHTML='<div class="hint"><b>尚未导入组合数据。</b> 请进入「工具」页点击「导入JSON」选择之前导出的投资作战手册 JSON；程序不会再内置或自动恢复默认组合。</div><div class="empty">导入后这里会显示总览、触发计划、再平衡提示和待更新清单。</div>';
    return;
  }
  const themeOrder=['宽基指数','黄金资源','AI科技','消费','防御','其他'];
  const themes={};
  state.stocks.forEach(s=>{
    if(isCashRow(s))return;
    const k=s.theme||'其他';
    themes[k]=(themes[k]||0)+(getMarketValue(s)||0);
  });
  const totalMv=getTotalInvested();
  const estAssets=getEstimatedTotalAssets();
  const denominator=estAssets||totalMv||1;
  const reserve=Math.max(0,100-state.stocks.reduce((a,b)=>a+(Number(b.targetPct)||0),0));
  const themeRows=themeOrder
    .filter(k=>themes[k]!==undefined||k==='其他')
    .map(k=>({name:k,p:(themes[k]||0)/denominator*100}))
    .filter(x=>x.p>0||x.name==='其他');
  const roleMap={};
  state.stocks.forEach(s=>{
    if(isCashRow(s))return;
    const k=s.role||'未分类';
    roleMap[k]=(roleMap[k]||0)+(getMarketValue(s)||0);
  });
  const roleRows=Object.keys(roleMap).sort((a,b)=>String(a).localeCompare(String(b),'zh-CN')).map(k=>({name:k,p:roleMap[k]/denominator*100}));
  const planRows=state.stocks.map(s=>({s,u:stockUrgency(s)})).filter(x=>x.u.triggered>0).sort((a,b)=>a.u.score-b.u.score);
  const triggeredCount=planRows.reduce((sum,x)=>sum+x.u.triggered,0);
  const positionRows=state.stocks.map(s=>({s,info:getPositionInfo(s,denominator)}));
  const rebalRows=positionRows.map(x=>({s:x.s,info:x.info,action:getRebalanceAction(x.s,x.info,denominator)})).filter(x=>x.action).sort((a,b)=>Math.abs(b.info.deviation||0)-Math.abs(a.info.deviation||0));
  const noPriceRows=positionRows.filter(x=>x.info&&x.info.status==='no-price');
  const aiPct=(themeRows.find(x=>x.name==='AI科技')||{p:0}).p;
  const resPct=(themeRows.find(x=>x.name==='黄金资源')||{p:0}).p;
  summary.innerHTML=`总资产 <strong>${fmtMoney(estAssets||totalMv)}</strong> · 已投资 <strong>${fmtMoney(totalMv)}</strong> · 现金/预留 <strong>${fmt(reserve,1)}%</strong> · AI <strong>${fmt(aiPct,1)}%</strong> · 黄金资源 <strong>${fmt(resPct,1)}%</strong>`;

  const triggeredPanel=planRows.length?`<div class="card" style="margin-bottom:14px;border-left:3px solid var(--seal)"><div class="card-title">已触发价位计划（${triggeredCount} 条）</div><div class="trig-list">${planRows.map(({s})=>{const cp=getComparablePrice(s);const rows=(s.plans||[]).map(p=>({p,g:planGap(cp,p.price,p.action,p.triggerOn)})).filter(x=>x.g&&x.g.triggered);return rows.map(({p,g})=>`<div class="trig-row ${p.action==='sell'?'sell':'buy'}"><div class="trig-name">${esc(s.name)} <span class="muted">· ${p.action==='sell'?'减仓':'加仓'} · 触发价 ${fmtMaybe(p.price)}</span></div><div class="trig-dist">${fmtMaybe(cp)} / ${fmt(g.absPct,1)}%</div><div class="trig-desc">${esc(p.note||'已到达计划价位')} <button class="link-btn" data-execute-stock="${esc(s.id)}" data-execute-plan="${esc(p.id)}">记录执行</button></div></div>`).join('')}).join('')}</div></div>`:'<div class="card" style="margin-bottom:14px"><div class="card-title">触发提醒</div><div class="card-note">当前没有已触发的价位计划。</div></div>';

  const rebalPanel=rebalRows.length?`<div class="card" style="margin-bottom:14px"><div class="card-title">再平衡提示（${rebalRows.length} 只）</div><div class="trig-list">${rebalRows.slice(0,8).map(x=>{const cls=x.info.status==='overweight'?'sell':'buy';const word=x.info.status==='overweight'?'超配':'低配';return `<div class="trig-row ${cls}"><div class="trig-name">${esc(x.s.name)} <span class="muted">· ${word} ${x.info.deviation>0?'+':''}${fmt(x.info.deviation,1)}%</span></div><div class="trig-dist">${fmtMoney(Math.abs(x.action.amount||0))}</div><div class="trig-desc">${esc(x.action.text||x.action.desc||'按目标仓位复核')}</div></div>`}).join('')}</div></div>`:'<div class="card" style="margin-bottom:14px"><div class="card-title">再平衡提示</div><div class="card-note">当前没有明显偏离目标仓位的标的。</div></div>';

  const trimAlerts=positionRows.map(x=>({s:x.s,info:x.info,trim:getTrimAction(x.s,x.info,denominator)})).filter(x=>x.trim);
  const capAlerts=positionRows.filter(x=>x.info&&x.info.actualPct!==null&&Number(x.s.capPct)>0&&x.info.actualPct>=Number(x.s.capPct));
  const themeAlerts=themeBreaches(denominator);
  const disciplineRows=[
    ...capAlerts.map(x=>`<div class="trig-row sell"><div class="trig-name">${esc(x.s.name)} <span class="muted">· 冻结线</span></div><div class="trig-dist">${fmt(x.info.actualPct,1)}%</div><div class="trig-desc">已达到或超过 ${fmt(Number(x.s.capPct),1)}%，按纪律不应继续加仓。</div></div>`),
    ...trimAlerts.map(x=>`<div class="trig-row sell"><div class="trig-name">${esc(x.s.name)} <span class="muted">· 削减线</span></div><div class="trig-dist">${fmt(x.info.actualPct,1)}%</div><div class="trig-desc">建议复核削减到 ${fmt(x.trim.toPct,1)}%。${x.trim.sharesTxt?esc(x.trim.sharesTxt):''}</div></div>`),
    ...themeAlerts.map(x=>`<div class="trig-row sell"><div class="trig-name">${esc(x.name)} <span class="muted">· 主题上限</span></div><div class="trig-dist">${fmt(x.a,1)}%</div><div class="trig-desc">${x.level==='hard'?'已达硬上限':'已达软上限'}，需控制新增仓位。</div></div>`)
  ];
  const disciplinePanel=disciplineRows.length?`<div class="card" style="margin-bottom:14px;border-left:3px solid var(--gold)"><div class="card-title">纪律规则提醒（${disciplineRows.length} 项）</div><div class="trig-list">${disciplineRows.join('')}</div></div>`:'';
  const noPriceHint=noPriceRows.length?`<div class="alert" style="margin-bottom:14px">有 ${noPriceRows.length} 只标的缺少有效价格/市值，仓位和再平衡计算可能不完整。</div>`:'';
  const fxRiskHint=isDefaultFx()?'<div class="alert" style="margin-bottom:14px">汇率使用默认值，港股市值和仓位占比可能有偏差。可到「工具」页更新 HKD→CNY 汇率。</div>':'';
  main.innerHTML=`${updateChecklistPanel()}${triggeredPanel}${disciplinePanel}${rebalPanel}${stalePanel()}${noPriceHint}${fxRiskHint}<div class="hint"><b>关键摘要：</b>系统工具已迁移到「工具」页；总览页只保留资产结构、触发提醒、再平衡提示和待更新清单。</div><div class="dash"><div class="card"><div class="card-title">按主题分布</div>${bars(themeRows)}</div><div class="card"><div class="card-title">按仓位角色分布</div>${bars(roleRows)}</div></div>`;
  document.querySelectorAll('[data-execute-stock]').forEach(b=>b.addEventListener('click',()=>executePlan(b.dataset.executeStock,b.dataset.executePlan)));
  document.querySelectorAll('[data-update-stock]').forEach(el=>el.addEventListener('click',()=>openStockDetail(el.dataset.updateStock)));
  const copyCodes=document.getElementById('copyUpdateCodesBtn');
  if(copyCodes)copyCodes.addEventListener('click',copyUpdateCodes);
  const copyPrompt=document.getElementById('copyUpdatePromptBtn');
  if(copyPrompt)copyPrompt.addEventListener('click',copyUpdatePrompt);
}
function renderTools(){
  const last=state.updatedAt?new Date(state.updatedAt).toLocaleString('zh-CN'):'—';
  const count=state.stocks.length;
  document.getElementById('summary').innerHTML=`工具 · 标的 <strong>${count}</strong> 只 · 本地最后修改 <strong>${esc(last)}</strong>`;
  document.getElementById('main').innerHTML=`<div class="hint"><b>系统工具集中区：</b>导入、导出、汇率、价格刷新、新增标的和清空本地数据已集中到这里。总览、个股、ETF、观察和分析总览页面只保留分析内容。</div><div class="dash"><div class="card"><div class="card-title">数据导入 / 备份</div><div class="text" style="max-width:none">使用上方按钮导入旧版 JSON、导出当前完整数据，或导入同目录社媒数据。导入前程序仍会按原逻辑提示备份。</div></div><div class="card"><div class="card-title">行情 / 汇率</div><div class="text" style="max-width:none">使用上方「汇率」设置 HKD→CNY，或「刷新全部价格」更新价格。刷新失败时仍保留旧价格。</div></div><div class="card"><div class="card-title">标的维护</div><div class="text" style="max-width:none">新增标的、清空本地数据等低频管理操作统一放在工具页，避免干扰个股分析。</div></div><div class="card"><div class="card-title">远程控制预留</div><div class="text" style="max-width:none">手机远程触发仍使用 <code>docs/remote_control.html</code> 和 <code>remote_commands/command.json</code>。未来云端/远程入口也建议集中放在本页。</div></div></div>`;
}
function bars(rows){return rows.map(r=>`<div class="bar-row"><div>${esc(r.name)}</div><div class="bar-bg"><div class="bar ${r.name.includes('AI')?'ai':r.name.includes('黄金')?'res':r.name.includes('核心')||r.name.includes('宽基')?'core':r.name.includes('卫星')?'sat':''}" style="width:${Math.min(100,r.p)}%"></div></div><div class="num">${fmt(r.p,1)}%</div></div>`).join('')}
function filtered(){return state.stocks.filter(s=>s.type===currentTab)}
function renderTable(){const raw=filtered();const total=getEstimatedTotalAssets();const withU=raw.map(s=>({s,u:stockUrgency(s),info:getPositionInfo(s,total)}));withU.sort((a,b)=>a.u.score-b.u.score);const arr=withU.map(x=>x.s);const totalTrig=withU.reduce((a,b)=>a+b.u.triggered,0);const tabMv=raw.reduce((a,s)=>a+(getMarketValue(s)||0),0);const overweights=withU.filter(x=>x.info&&x.info.status==='overweight').length;const underweights=withU.filter(x=>x.info&&x.info.status==='underweight').length;const typeName=currentTab==='holding'?'个股':currentTab==='etf'?'ETF':'观察';const trigBadge=totalTrig>0?` · <strong style="color:var(--seal)">⚠ 已触发 ${totalTrig} 条</strong>`:'';const rebalBadge=(overweights+underweights)>0?` · <strong style="color:var(--gold)">⚖ 偏差>5% ${overweights+underweights} 只</strong>`:'';document.getElementById('summary').innerHTML=`${typeName} <strong>${arr.length}</strong> 只 · 目标 <strong>${fmt(arr.reduce((a,b)=>a+(Number(b.targetPct)||0),0),1)}%</strong> · 市值 <strong>${fmtMoney(tabMv)}</strong>${trigBadge}${rebalBadge}`;const main=document.getElementById('main');if(!arr.length){main.innerHTML='<div class="empty">暂无标的</div>';return}const trigAlert=totalTrig>0?`<div class="alert-trig">⚠ 当前有 ${totalTrig} 条价位计划已触发，已置顶显示。</div>`:'';main.innerHTML=`${trigAlert}<div class="table-wrap"><table><colgroup><col style="width:7%"><col style="width:6.5%"><col style="width:9.5%"><col style="width:16%"><col style="width:19%"><col style="width:14.5%"><col style="width:5.5%"><col style="width:9.5%"><col style="width:6%"><col style="width:6.5%"></colgroup><thead><tr><th>名称</th><th>定位/主题</th><th>目标/实际</th><th>为什么持有</th><th>加仓/建仓动作</th><th>卖出/降仓条件</th><th>成本</th><th>${currentTab==='etf'?'当前市值':'当前价格'}</th><th>数量</th><th>操作</th></tr></thead><tbody>${arr.map(s=>row(s,total)+(typeof socialPanel==='function'?socialPanel(s):'')).join('')}</tbody></table></div>`;main.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.action==='detail')openStockDetail(b.dataset.id);if(b.dataset.action==='refresh')refreshOnePrice(b.dataset.id);if(b.dataset.action==='edit')openModal(b.dataset.id);if(b.dataset.action==='delete')del(b.dataset.id)}))}
function row(s,total){const cp=getComparablePrice(s);const buys=(s.plans||[]).filter(p=>(p.action||'buy')==='buy').sort((a,b)=>Number(b.price||0)-Number(a.price||0));const sells=(s.plans||[]).filter(p=>p.action==='sell').sort((a,b)=>Number(b.price||0)-Number(a.price||0));const info=getPositionInfo(s,total);let targetCell='';if(!info)targetCell=`<div class="target-line">${fmtMaybe(s.targetPct,1)}%</div>`;else if(info.status==='no-price')targetCell=`<div class="target-line">${info.target.toFixed(1)}%</div><div class="actual-line">实际：未填${s.type==='etf'?'当前市值':'当前价格'}</div><span class="dev-badge na">无法计算偏差</span>`;else{const sign=info.deviation>=0?'+':'';const cls=info.status==='overweight'?'over':info.status==='underweight'?'under':'ok';const word=info.status==='overweight'?'超配':info.status==='underweight'?'低配':'平衡';targetCell=`<div class="target-line">${info.target.toFixed(1)}%</div><div class="actual-line">实际 ${info.actualPct.toFixed(1)}% · ${fmtMoney(info.mv)}</div><span class="dev-badge ${cls}">${word} ${sign}${info.deviation.toFixed(1)}%</span>`;const _cap=Number(s.capPct);if(_cap>0&&info.actualPct>=_cap)targetCell+=`<span class="dev-badge over">✖ ≥冻结线${_cap}%·禁买</span>`;const _ta=getTrimAction(s,info,total);if(_ta)targetCell+=`<span class="dev-badge over">▼ 削减线${_ta.trim}%→削回${_ta.toPct}%${_ta.sharesTxt?'·'+_ta.sharesTxt:''}</span>`}return `<tr><td class="name cell-name"><button class="link-btn detail-name" data-action="detail" data-id="${s.id}">${esc(s.name)}</button></td><td class="cell-role" data-label="定位/主题"><div class="chips"><span class="chip role">${esc(s.role||'—')}</span><span class="chip tag">${esc(s.theme||'—')}</span></div></td><td class="num cell-target" data-label="目标 / 实际">${targetCell}</td><td class="text cell-thesis" data-label="为什么持有">${esc(s.thesis||s.notes||'')||'<span class="muted">—</span>'}</td><td class="cell-buy" data-label="加仓/建仓">${chips(buys,'buy',cp)||'<div class="text">'+esc(s.buyRule||'—')+'</div>'}</td><td class="cell-sell" data-label="卖出/降仓"><div class="text">${esc(s.sellRule||'—')}</div>${sells.length?chips(sells,'sell',cp):''}</td><td class="num cell-cost" data-label="成本">${fmtMaybe(s.avgCost)}</td><td class="num cell-current" data-label="${s.type==='etf'?'当前市值':'当前价格'}">${currentDisplay(s)}</td><td class="num cell-shares" data-label="数量">${fmtInt(s.shares)}</td><td class="cell-actions"><div class="row-actions"><button class="link-btn" data-action="refresh" data-id="${s.id}">${s.type==='etf'?'刷新市值':'刷新价格'}</button><button class="link-btn" data-action="edit" data-id="${s.id}">编辑</button><button class="link-btn danger" data-action="delete" data-id="${s.id}">删除</button></div></td></tr>`}
function chips(ps,type,cp){if(!ps.length)return'';return `<div class="chips">${ps.map(p=>{const g=planGap(cp,p.price,type,p.triggerOn);const trigCls=(g&&g.triggered)?' triggered':'';const arrow=g?(g.direction==='below'?'↓':'↑'):'';const gapHtml=g?(g.triggered?`<span class="gap trig">⚠ 已触发</span>`:`<span class="gap">${arrow}${g.absPct.toFixed(1)}%</span>`):'';return `<span class="chip ${type}${trigCls}"><span>${type==='buy'?'▲':'▼'}</span><span class="price">${fmtMaybe(p.price)}</span><span class="shares">${fmtInt(p.shares)}</span>${gapHtml}${p.note?`<span>· ${esc(p.note)}</span>`:''}</span>`}).join('')}</div>`}
function setType(t){formType=t;document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('active',b.dataset.type===t));document.getElementById('sellBox').style.display=t==='watching'?'none':'block'}
function openModal(id){editingId=id||null;const s=state.stocks.find(x=>x.id===id);document.getElementById('modalTitle').textContent=s?'编辑标的':'新增标的';setType(s?s.type:(currentTab==='etf'?'etf':currentTab==='watching'?'watching':'holding'));document.getElementById('fName').value=s?.name||'';document.getElementById('fCode').value=s?.code||'';document.getElementById('fCurrency').value=s?.currency||'';document.getElementById('fShares').value=s?.shares??'';document.getElementById('fCost').value=s?.avgCost??'';document.getElementById('fTarget').value=s?.targetPct??'';document.getElementById('fTrim').value=s?.trimPct??'';document.getElementById('fTrimTo').value=s?.trimToPct??'';document.getElementById('fCap').value=s?.capPct??'';document.getElementById('fCurrentPrice').value=s?.currentPrice??'';document.getElementById('fCurrentValue').value=s?.currentValue??'';document.getElementById('fRole').value=s?.role||'核心仓';document.getElementById('fTheme').value=s?.theme||'其他';document.getElementById('fThesis').value=s?.thesis||s?.notes||'';document.getElementById('fSellRule').value=s?.sellRule||'';document.getElementById('fNotes').value=s?.notes||'';const ps=s?.plans||[];tempBuy=ps.filter(p=>(p.action||'buy')==='buy').map(p=>({...p}));tempSell=ps.filter(p=>p.action==='sell').map(p=>({...p}));renderPlanEditor();document.getElementById('modal').classList.add('show');setTimeout(()=>document.getElementById('fName').focus(),50)}
function closeModal(){document.getElementById('modal').classList.remove('show');editingId=null}
function renderPlanEditor(){document.getElementById('buyRows').innerHTML=tempBuy.map((p,i)=>planRow(p,i,'buy')).join('')||'<tr><td colspan="4" class="muted">暂无动作</td></tr>';document.getElementById('sellRows').innerHTML=tempSell.map((p,i)=>planRow(p,i,'sell')).join('')||'<tr><td colspan="4" class="muted">暂无动作</td></tr>';document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.type==='buy'?tempBuy:tempSell;a.splice(Number(b.dataset.remove),1);renderPlanEditor()}));document.querySelectorAll('[data-field]').forEach(inp=>inp.addEventListener('input',()=>{const a=inp.dataset.type==='buy'?tempBuy:tempSell;const p=a[Number(inp.dataset.index)];p[inp.dataset.field]=inp.dataset.field==='note'?inp.value:parseFloat(inp.value)}))}
function planRow(p,i,type){return `<tr><td><input type="number" step="any" value="${esc(p.price??'')}" data-type="${type}" data-index="${i}" data-field="price"></td><td><input type="number" step="any" value="${esc(p.shares??'')}" data-type="${type}" data-index="${i}" data-field="shares"></td><td><input type="text" value="${esc(p.note??'')}" data-type="${type}" data-index="${i}" data-field="note"></td><td><button class="link-btn danger" type="button" data-type="${type}" data-remove="${i}">删除</button></td></tr>`}
function addPlan(type){(type==='buy'?tempBuy:tempSell).push({id:uid(),action:type,price:'',shares:'',note:''});renderPlanEditor()}
function collect(currentPrice){const clean=(a,action)=>a.map(p=>{const price=Number(p.price);const shares=Number(p.shares);return {id:p.id||uid(),action,price,shares,note:String(p.note||'').trim(),triggerOn:p.triggerOn||inferTriggerOn(currentPrice,price,action)}}).filter(p=>!isNaN(p.price)&&p.price>0&&!isNaN(p.shares)&&p.shares>0);return [...clean(tempBuy,'buy'),...(formType==='watching'?[]:clean(tempSell,'sell'))]}
function save(){const name=document.getElementById('fName').value.trim();if(!name)return alert('请填写名称');const costRaw=document.getElementById('fCost').value,targetRaw=document.getElementById('fTarget').value,currentPriceRaw=document.getElementById('fCurrentPrice').value,currentValueRaw=document.getElementById('fCurrentValue').value;const old=editingId?state.stocks.find(x=>x.id===editingId):null;const oldPrice=old?String(old.currentPrice??''):'';const oldValue=old?String(old.currentValue??''):'';const today=todayDate();const nextPrice=currentPriceRaw===''?'':parseFloat(currentPriceRaw);const nextValue=currentValueRaw===''?'':parseFloat(currentValueRaw);const priceChanged=currentPriceRaw!=='' && String(nextPrice)!==oldPrice;const valueChanged=currentValueRaw!=='' && String(nextValue)!==oldValue;const payload={type:formType,name,code:document.getElementById('fCode').value.trim(),currency:document.getElementById('fCurrency').value,shares:parseFloat(document.getElementById('fShares').value)||0,avgCost:costRaw===''?'':parseFloat(costRaw),targetPct:targetRaw===''?'':parseFloat(targetRaw),trimPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fTrim').value),trimToPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fTrimTo').value),capPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fCap').value),currentPrice:nextPrice,currentValue:nextValue,priceUpdatedAt:priceChanged?today:(old?.priceUpdatedAt||''),valueUpdatedAt:valueChanged?today:(old?.valueUpdatedAt||''),role:document.getElementById('fRole').value,theme:document.getElementById('fTheme').value,thesis:document.getElementById('fThesis').value.trim(),sellRule:document.getElementById('fSellRule').value.trim(),notes:document.getElementById('fNotes').value.trim(),plans:collect(formType==='etf'?(Number(old?.lastUnitPrice)||((Number(document.getElementById('fShares').value)>0&&Number(nextValue)>0)?Number(nextValue)/Number(document.getElementById('fShares').value):null)):nextPrice),updatedAt:Date.now()};payload.dataFreshness=normalizeDataFreshness(old&&old.dataFreshness);if(priceChanged||valueChanged)touchDataFreshness(payload,'priceUpdatedAt',today);payload.analysisFramework=normalizeAnalysisFramework(old&&old.analysisFramework,payload);payload.analysisScore=calculateAnalysisScore(payload.analysisFramework);if(editingId){const s=state.stocks.find(x=>x.id===editingId);if(s)Object.assign(s,payload)}else state.stocks.push({id:uid(),...payload,createdAt:Date.now()});currentTab=formType;saveState();closeModal();render()}

function del(id){const s=state.stocks.find(x=>x.id===id);if(!s)return;if(!confirm(`确认删除「${s.name}」？`))return;state.stocks=state.stocks.filter(x=>x.id!==id);saveState();render()}

function getExecutionLogRows(stockName=logStockFilter){
  const logs=Array.isArray(state.executionLog)?state.executionLog:[];
  return logs
    .filter(x=>!stockName||x.stock===stockName)
    .slice()
    .sort((a,b)=>(Number(b.t)||0)-(Number(a.t)||0));
}
function executionLogAmount(x){
  const amount=Number(x.amount);
  if(!isNaN(amount)&&amount>0)return amount;
  const price=Number(x.price),shares=Number(x.shares);
  if(isNaN(price)||isNaN(shares))return null;
  return price*shares;
}
function executionLogTime(x){
  const t=Number(x.t);
  if(!t)return '—';
  return new Date(t).toLocaleString('zh-CN');
}
function executionLogAction(x){
  return x.action==='sell'?'卖出':'买入';
}
function renderExecutionLog(){
  const logs=Array.isArray(state.executionLog)?state.executionLog:[];
  const names=[...new Set(logs.map(x=>x.stock).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'zh-CN'));
  const rows=getExecutionLogRows();
  const totalAmount=rows.reduce((sum,x)=>sum+(executionLogAmount(x)||0),0);
  document.getElementById('summary').innerHTML=`操作记录 <strong>${rows.length}</strong> 条${logStockFilter?' · 标的 <strong>'+esc(logStockFilter)+'</strong>':''} · 金额 <strong>${fmtMoney(totalAmount)}</strong>`;
  const options=['<option value="">全部标的</option>'].concat(names.map(n=>`<option value="${esc(n)}"${n===logStockFilter?' selected':''}>${esc(n)}</option>`)).join('');
  const empty=logs.length?'<div class="empty">当前筛选下暂无操作记录</div>':'<div class="empty">暂无操作记录。执行价位计划后会自动写入这里。</div>';
  const table=rows.length?`<div class="table-wrap"><table><colgroup><col style="width:16%"><col style="width:15%"><col style="width:8%"><col style="width:10%"><col style="width:10%"><col style="width:12%"><col style="width:9%"><col style="width:20%"></colgroup><thead><tr><th>时间</th><th>标的</th><th>买/卖</th><th>价格</th><th>数量</th><th>金额</th><th>自动更新</th><th>备注</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="num" data-label="时间">${esc(executionLogTime(x))}</td><td class="name" data-label="标的">${esc(x.stock||'—')}</td><td data-label="买/卖"><span class="chip ${x.action==='sell'?'sell':'buy'}">${executionLogAction(x)}</span></td><td class="num" data-label="价格">${fmtMaybe(x.price)}</td><td class="num" data-label="数量">${fmtInt(x.shares)}</td><td class="num" data-label="金额">${fmtMaybe(executionLogAmount(x))}</td><td data-label="自动更新">${x.autoUpdated?'是':'否'}</td><td class="text" data-label="备注">${esc(x.note||'')||'<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`:empty;
  document.getElementById('main').innerHTML=`<div class="toolbar"><div class="actions"><select id="logStockFilter" style="width:auto;min-width:180px">${options}</select><button class="btn ghost small" id="exportLogCsvBtn">导出CSV</button></div></div>${table}`;
  document.getElementById('logStockFilter').addEventListener('change',e=>{logStockFilter=e.target.value;renderExecutionLog()});
  document.getElementById('exportLogCsvBtn').addEventListener('click',exportExecutionLogCsv);
}

function analysisModuleScore(stock,key){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  return normalizeAnalysisScoreValue(fw[key]&&fw[key].score);
}
function analysisModuleStatus(stock,key){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  return analysisStatusText(fw[key]&&fw[key].status);
}
function analysisPositionRole(stock){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  return fw.conclusion.positionRole||stock.role||'';
}
function analysisActionPlan(stock){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  return fw.conclusion.actionPlan||'';
}
function analysisStatusForFilter(stock){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const statuses=ANALYSIS_MODULES.map(k=>analysisStatusText(fw[k]&&fw[k].status));
  if(statuses.includes('negative'))return 'negative';
  if(statuses.includes('positive'))return 'positive';
  return 'neutral';
}
function analysisScoreInRange(score,range){
  if(!range)return true;
  if(range==='gte8')return score>=8;
  if(range==='6to8')return score>=6&&score<8;
  if(range==='lt6')return score<6;
  return true;
}
function analysisSortRows(rows){
  const score=(x,k)=>analysisModuleScore(x,k);
  const byName=(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN');
  rows.sort((a,b)=>{
    if(analysisSortMode==='score_asc')return (a.analysisScore-b.analysisScore)||byName(a,b);
    if(analysisSortMode==='risk_asc')return (score(a,'risks')-score(b,'risks'))||byName(a,b);
    if(analysisSortMode==='valuation_desc')return (score(b,'valuation')-score(a,'valuation'))||byName(a,b);
    if(analysisSortMode==='technical_desc')return (score(b,'technical')-score(a,'technical'))||byName(a,b);
    if(analysisSortMode==='decision_desc')return (decisionForStock(b).decisionScore-decisionForStock(a).decisionScore)||byName(a,b);
    if(analysisSortMode==='gap_desc')return (decisionForStock(b).positionGap-decisionForStock(a).positionGap)||byName(a,b);
    if(analysisSortMode==='priority_asc')return (normalizeStrategy(a.strategy,a).priority-normalizeStrategy(b.strategy,b).priority)||byName(a,b);
    if(analysisSortMode==='buy_amount_desc')return (executionForStock(b).suggestedBuyAmount-executionForStock(a).suggestedBuyAmount)||byName(a,b);
    if(analysisSortMode==='buy_shares_desc')return (executionForStock(b).suggestedShares-executionForStock(a).suggestedShares)||byName(a,b);
    if(analysisSortMode==='auto_technical_desc')return (calculateTechnicalSignal(b).technicalScore-calculateTechnicalSignal(a).technicalScore)||byName(a,b);
    if(analysisSortMode==='freshness_days_desc')return ((getAnalysisFreshness(b).daysSinceUpdate??-1)-(getAnalysisFreshness(a).daysSinceUpdate??-1))||byName(a,b);
    if(analysisSortMode==='auto_valuation_desc')return (calculateValuationSignal(b).valuationScore-calculateValuationSignal(a).valuationScore)||byName(a,b);
    if(analysisSortMode==='valuation_updated_desc')return (String(normalizeValuationData(b.valuationData).lastUpdated||'').localeCompare(String(normalizeValuationData(a.valuationData).lastUpdated||'')))||byName(a,b);
    if(analysisSortMode==='auto_financial_desc')return (calculateFinancialSignal(b).financialScore-calculateFinancialSignal(a).financialScore)||byName(a,b);
    if(analysisSortMode==='financial_updated_desc')return (String(normalizeFinancialData(b.financialData).lastUpdated||'').localeCompare(String(normalizeFinancialData(a.financialData).lastUpdated||'')))||byName(a,b);
    return (b.analysisScore-a.analysisScore)||byName(a,b);
  });
  return rows;
}
function analysisScoreCell(v){return `<span class="num">${fmtMaybe(v,1)}</span>`}
function portfolioContext(){return {totalMarketValue:typeof getTotalInvested==='function'?getTotalInvested():state.stocks.reduce((sum,s)=>sum+(Number(s.marketValue||s.currentValue)||((Number(s.currentPrice)>0&&Number(s.shares)>0)?Number(s.currentPrice)*Number(s.shares):0)),0)}}
function decisionForStock(s){return calculateDecision(s,portfolioContext())}
function executionForStock(s){return calculateExecutionPlan(s,portfolioContext())}
function freshnessTextLabel(level){return {fresh:'新鲜',stale:'过期',veryStale:'严重过期',unknown:'未知'}[level]||'未知'}
function technicalStatusLabel(v){return v==='positive'?'positive':(v==='negative'?'negative':'neutral')}
function valuationStatusLabel(v){return v==='positive'?'positive':(v==='negative'?'negative':'neutral')}
function financialStatusLabel(v){return v==='positive'?'positive':(v==='negative'?'negative':'neutral')}
function decisionPanel(stock){
  const d=decisionForStock(stock);
  const ex=calculateExecutionPlan(stock,portfolioContext());
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">决策引擎 <button class="link-btn" data-detail-action="edit-strategy" style="float:right">编辑策略</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(d.decisionScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">${esc(decisionActionLabel(d.action))}</div></div><div><div class="card-title">仓位</div><div class="card-note">当前 ${fmtMaybe(d.currentWeight,1)}% · 目标 ${fmtMaybe(d.targetWeight,1)}% · 差距 ${fmtMaybe(d.positionGap,1)}%</div><div class="card-note">${esc(d.positionStatus)}</div></div><div><div class="card-title">建议</div><div class="text" style="max-width:none">${esc(d.suggestedAction)}</div></div><div><div class="card-title">风险提示</div><div class="text" style="max-width:none">${(d.warnings||[]).slice(0,3).map(esc).join('<br>')||'—'}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>理由：</b><br>${(d.reasons||[]).slice(0,3).map(esc).join('<br>')}</div><div class="alert" style="margin-top:12px"><b>执行建议</b><br>建议买入金额：${fmtMoney(ex.suggestedBuyAmount)} · 建议股数：${fmtInt(ex.suggestedShares)} · 剩余目标股数：${fmtInt(ex.remainingTargetShares)} · 剩余目标市值：${fmtMoney(ex.remainingTargetValue)}<br>执行状态：${esc(ex.executionStatus)} · ${esc(ex.priceTiming)}<br>${(ex.executionReasons||[]).slice(0,3).map(esc).join('<br>')}${ex.executionWarnings.length?'<br><b>提醒：</b><br>'+ex.executionWarnings.slice(0,3).map(esc).join('<br>'):''}</div></div>`;
}
function freshnessPanel(stock){
  const f=getAnalysisFreshness(stock);
  const warnings=(f.freshnessWarnings||[]).slice(0,3).map(esc).join('<br>')||'—';
  const suggestions=(f.freshnessSuggestions||[]).slice(0,3).map(esc).join('<br>')||'—';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">分析新鲜度</div><div class="card-num">${esc(freshnessTextLabel(f.staleLevel))}</div><div class="card-note">距上次更新：${f.daysSinceUpdate===null?'—':f.daysSinceUpdate+' 天'}</div><div class="text" style="max-width:none;margin-top:8px"><b>提醒：</b><br>${warnings}<br><b>建议：</b><br>${suggestions}</div></div>`;
}
function technicalSignalPanel(stock){
  const td=normalizeTechnicalData(stock.technicalData);
  const sig=calculateTechnicalSignal(stock);
  const history=normalizePriceHistory(stock);
  const last=history.length?history[history.length-1].date:'—';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">技术面自动评分 <button class="link-btn" data-detail-action="edit-technical" style="float:right">编辑技术数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.technicalScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(technicalStatusLabel(sig.technicalStatus))}</div></div><div><div class="card-title">历史价格</div><div class="card-note">${history.length} 条 · 最近 ${esc(last)}</div></div><div><div class="card-title">均线</div><div class="card-note">MA20 ${fmtMaybe(td.ma20,2)} · MA60 ${fmtMaybe(td.ma60,2)} · MA120 ${fmtMaybe(td.ma120,2)}</div></div><div><div class="card-title">支撑 / 压力</div><div class="card-note">${fmtMaybe(td.supportPrice,2)} / ${fmtMaybe(td.resistancePrice,2)} · ${esc(td.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(sig.technicalSummary)}<br><b>信号：</b><br>${(sig.signals||[]).slice(0,3).map(esc).join('<br>')||'—'}<br><b>提醒：</b><br>${(sig.warnings||[]).slice(0,3).map(esc).join('<br>')||'—'}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-history">导入历史价格CSV</button><button class="btn ghost small" data-detail-action="update-technical-history">从历史价格更新技术数据</button><button class="btn ghost small" data-detail-action="apply-technical">应用到九模块技术评分</button></div></div>`;
}
function technicalLevelList(items){
  const arr=Array.isArray(items)?items:[];
  return arr.length?arr.map(x=>`<span class="pill">${esc(x)}</span>`).join(' '):'—';
}
function technicalVolumeStatus(td){
  if(!(td.volume>0))return '—';
  if(td.volumeAvg20>0){
    const ratio=td.volume/td.volumeAvg20;
    if(ratio>=1.5)return `放量 · 当前/20日均量 ${ratio.toFixed(2)}x`;
    if(ratio<=.7)return `缩量 · 当前/20日均量 ${ratio.toFixed(2)}x`;
    return `量能接近均量 · ${ratio.toFixed(2)}x`;
  }
  return fmtInt(td.volume);
}
function technicalAnalysisPromptText(stock){
  normalizeStockAnalysis(stock);
  const td=normalizeTechnicalData(stock.technicalData);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const schema={symbol:'',timeframe:'daily',price:null,priceUpdatedAt:'',ma5:null,ma10:null,ma20:null,ma60:null,volume:null,volumeAvg20:null,trendStatus:'',supportLevels:[],resistanceLevels:[],technicalSummary:'',riskFlags:[],actionHint:''};
  const ctx={
    stockName:stock.name||'',
    symbol:stock.code||td.symbol||'',
    shares:Number(stock.shares)||0,
    avgCost:stock.avgCost||'',
    currentPrice:stock.currentPrice||td.price||'',
    strategy,
    existingTechnicalData:td
  };
  return [
    '你是一名严谨的技术面分析助手。',
    '',
    '请根据我提供的 K 线截图、行情数据或文字资料，整理当前股票的技术面结构化 JSON。',
    '不要联网，不要编造截图里看不见的数据；看不清或无法判断的字段请填 null、空字符串或空数组。',
    '不要给确定性买卖指令，只输出技术面辅助判断。',
    '只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
    '',
    '当前股票上下文：',
    JSON.stringify(ctx,null,2),
    '',
    '输出字段要求：',
    '- symbol：股票代码。',
    '- timeframe：daily / weekly / monthly / intraday。',
    '- price：当前截图或行情中的价格，无法判断填 null。',
    '- priceUpdatedAt：行情日期，格式 YYYY-MM-DD。',
    '- ma5 / ma10 / ma20 / ma60：均线数值，无法判断填 null。',
    '- volume / volumeAvg20：成交量和20日均量，无法判断填 null。',
    '- trendStatus：趋势判断，例如 uptrend / sideways / downtrend / rebound / breakdown。',
    '- supportLevels：支撑位数组。',
    '- resistanceLevels：压力位数组。',
    '- technicalSummary：一句话技术面摘要。',
    '- riskFlags：技术面风险数组。',
    '- actionHint：操作提示，例如“等待突破确认”“接近支撑位观察”“跌破均线需谨慎”。',
    '',
    '请严格按以下 JSON 结构输出：',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function copyTechnicalAnalysisPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(technicalAnalysisPromptText(stock),'技术面分析 Prompt 已复制。');
}
function technicalAnalysisPanel(stock){
  const td=normalizeTechnicalData(stock.technicalData);
  const maText=`MA5 ${fmtMaybe(td.ma5,2)} · MA10 ${fmtMaybe(td.ma10,2)} · MA20 ${fmtMaybe(td.ma20,2)} · MA60 ${fmtMaybe(td.ma60,2)}`;
  const updated=td.priceUpdatedAt||td.lastUpdated||'—';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">技术面分析</div><div class="dash" style="margin:0"><div><div class="card-title">当前价格</div><div class="card-num">${fmtMaybe(td.price!==null?td.price:stockCurrentPrice(stock),2)}</div><div class="card-note">${esc(td.timeframe||'daily')} · ${esc(updated)}</div></div><div><div class="card-title">均线状态</div><div class="card-note">${maText}</div></div><div><div class="card-title">成交量状态</div><div class="card-note">${esc(technicalVolumeStatus(td))}</div></div><div><div class="card-title">趋势判断</div><div class="card-note">${esc(td.trendStatus||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>支撑位：</b>${technicalLevelList(td.supportLevels)}<br><b>压力位：</b>${technicalLevelList(td.resistanceLevels)}<br><b>技术面风险：</b>${td.riskFlags.length?td.riskFlags.map(esc).join('；'):'—'}<br><b>操作提示：</b>${esc(td.actionHint||'—')}<br><b>摘要：</b>${esc(td.technicalSummary||td.trendNote||'—')}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="copy-technical-prompt">复制技术面分析 Prompt</button><button class="btn ghost small" data-detail-action="import-technical-json">导入技术面 JSON</button></div></div>`;
}
function valuationSignalPanel(stock){
  const vd=normalizeValuationData(stock.valuationData);
  const sig=calculateValuationSignal(stock);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">估值自动评分 <button class="link-btn" data-detail-action="edit-valuation" style="float:right">编辑估值数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.valuationScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(valuationStatusLabel(sig.valuationStatus))}</div></div><div><div class="card-title">当前估值</div><div class="card-note">PE ${fmtMaybe(vd.pe,2)} · PB ${fmtMaybe(vd.pb,2)} · PS ${fmtMaybe(vd.ps,2)}</div></div><div><div class="card-title">增长 / 股息</div><div class="card-note">收入 ${fmtMaybe(vd.revenueGrowth,1)}% · 利润 ${fmtMaybe(vd.profitGrowth,1)}% · 股息 ${fmtMaybe(vd.dividendYield,1)}%</div></div><div><div class="card-title">更新时间</div><div class="card-note">${esc(vd.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(sig.valuationSummary)}<br><b>信号：</b><br>${(sig.signals||[]).slice(0,3).map(esc).join('<br>')||'—'}<br><b>提醒：</b><br>${(sig.warnings||[]).slice(0,3).map(esc).join('<br>')||'—'}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px"><button class="btn ghost small" data-detail-action="apply-valuation">应用到九模块估值评分</button></div></div>`;
}
function financialSignalPanel(stock){
  const fd=normalizeFinancialData(stock.financialData);
  const sig=calculateFinancialSignal(stock);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">财务自动评分 <button class="link-btn" data-detail-action="edit-financial" style="float:right">编辑财务数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.financialScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(financialStatusLabel(sig.financialStatus))}</div></div><div><div class="card-title">报告期</div><div class="card-note">${esc(fd.reportPeriod||'—')} · ${esc(fd.currency||'—')}</div></div><div><div class="card-title">增长 / 利润率</div><div class="card-note">收入 ${fmtMaybe(fd.revenueGrowth,1)}% · 利润 ${fmtMaybe(fd.profitGrowth,1)}% · 净利率 ${fmtMaybe(fd.netMargin,1)}%</div></div><div><div class="card-title">更新时间</div><div class="card-note">${esc(fd.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(sig.financialSummary)}<br><b>信号：</b><br>${(sig.signals||[]).slice(0,3).map(esc).join('<br>')||'—'}<br><b>提醒：</b><br>${(sig.warnings||[]).slice(0,3).map(esc).join('<br>')||'—'}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-financial">导入财务JSON</button><button class="btn ghost small" data-detail-action="apply-financial">应用到九模块财务评分</button></div></div>`;
}
function renderAnalysisOverview(){
  state.stocks.forEach(normalizeStockAnalysis);
  let rows=state.stocks.slice();
  if(analysisRoleFilter)rows=rows.filter(s=>analysisPositionRole(s)===analysisRoleFilter);
  if(analysisStatusFilter)rows=rows.filter(s=>analysisStatusForFilter(s)===analysisStatusFilter);
  if(analysisRiskFilter)rows=rows.filter(s=>analysisModuleStatus(s,'risks')===analysisRiskFilter);
  if(analysisActionFilter)rows=rows.filter(s=>decisionForStock(s).action===analysisActionFilter);
  if(analysisCapitalFilter)rows=rows.filter(s=>String(normalizeStrategy(s.strategy,s).capitalAllocationEnabled)===analysisCapitalFilter);
  if(analysisExecutionFilter)rows=rows.filter(s=>executionForStock(s).executionStatus===analysisExecutionFilter);
  if(analysisFreshnessFilter)rows=rows.filter(s=>{const l=getAnalysisFreshness(s).staleLevel;return analysisFreshnessFilter==='staleOnly'?(l==='stale'||l==='veryStale'):l===analysisFreshnessFilter});
  if(analysisTechnicalStatusFilter)rows=rows.filter(s=>calculateTechnicalSignal(s).technicalStatus===analysisTechnicalStatusFilter);
  if(analysisValuationStatusFilter)rows=rows.filter(s=>calculateValuationSignal(s).valuationStatus===analysisValuationStatusFilter);
  if(analysisValuationMissingFilter==='missing')rows=rows.filter(s=>calculateValuationSignal(s).valuationScore<=0);
  if(analysisFinancialStatusFilter)rows=rows.filter(s=>calculateFinancialSignal(s).financialStatus===analysisFinancialStatusFilter);
  if(analysisFinancialMissingFilter==='missing')rows=rows.filter(s=>!hasFinancialData(s.financialData));
  rows=rows.filter(s=>analysisScoreInRange(Number(s.analysisScore)||0,analysisScoreFilter));
  analysisSortRows(rows);
  document.getElementById('summary').innerHTML=`分析总览 <strong>${rows.length}</strong> / ${state.stocks.length} 只 · 平均分 <strong>${rows.length?fmt(rows.reduce((sum,s)=>sum+(Number(s.analysisScore)||0),0)/rows.length,1):'—'}</strong>`;
  const main=document.getElementById('main');
  const roleOptions=['','核心仓','成长仓','卫星仓','观察仓'].map(x=>`<option value="${esc(x)}"${analysisRoleFilter===x?' selected':''}>${x||'全部角色'}</option>`).join('');
  const statusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisStatusFilter===x?' selected':''}>${x||'全部状态'}</option>`).join('');
  const riskOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisRiskFilter===x?' selected':''}>${x||'全部风险'}</option>`).join('');
  const scoreOptions=[['','全部分数'],['gte8','8分以上'],['6to8','6-8分'],['lt6','6分以下']].map(x=>`<option value="${x[0]}"${analysisScoreFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const actionOptions=['','strongBuy','buy','observe','hold','reduce'].map(x=>`<option value="${esc(x)}"${analysisActionFilter===x?' selected':''}>${x?decisionActionLabel(x):'全部动作'}</option>`).join('');
  const capitalOptions=[['','全部分配'],['true','参与分配'],['false','不参与分配']].map(x=>`<option value="${x[0]}"${analysisCapitalFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const executionOptions=['','buyNow','wait','hold','reduceRisk','noData'].map(x=>`<option value="${esc(x)}"${analysisExecutionFilter===x?' selected':''}>${x||'全部执行状态'}</option>`).join('');
  const freshnessOptions=[['','全部新鲜度'],['staleOnly','只看过期'],['stale','stale'],['veryStale','veryStale'],['unknown','unknown']].map(x=>`<option value="${x[0]}"${analysisFreshnessFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const techStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisTechnicalStatusFilter===x?' selected':''}>${x||'全部技术状态'}</option>`).join('');
  const valuationStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisValuationStatusFilter===x?' selected':''}>${x||'全部估值状态'}</option>`).join('');
  const valuationMissingOptions=[['','全部估值数据'],['missing','只看缺少估值数据']].map(x=>`<option value="${x[0]}"${analysisValuationMissingFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const financialStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisFinancialStatusFilter===x?' selected':''}>${x||'全部财务状态'}</option>`).join('');
  const financialMissingOptions=[['','全部财务数据'],['missing','只看缺少财务数据']].map(x=>`<option value="${x[0]}"${analysisFinancialMissingFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const sortOptions=[['score_desc','总分高到低'],['score_asc','总分低到高'],['risk_asc','风险分低到高'],['valuation_desc','九模块估值分高到低'],['technical_desc','九模块技术分高到低'],['decision_desc','决策分高到低'],['gap_desc','仓位缺口高到低'],['priority_asc','priority高到低'],['buy_amount_desc','建议金额高到低'],['buy_shares_desc','建议股数高到低'],['auto_technical_desc','自动技术分高到低'],['freshness_days_desc','分析过期天数高到低'],['auto_valuation_desc','自动估值分高到低'],['valuation_updated_desc','估值更新时间新到旧'],['auto_financial_desc','自动财务分高到低'],['financial_updated_desc','财务更新时间新到旧']].map(x=>`<option value="${x[0]}"${analysisSortMode===x[0]?' selected':''}>${x[1]}</option>`).join('');
  if(!state.stocks.length){main.innerHTML='<div class="empty">暂无股票数据，导入或新增标的后可查看九模块分析总览。</div>';return}
  const filters=`<div class="toolbar"><div class="actions"><select id="analysisSort">${sortOptions}</select><select id="analysisRole">${roleOptions}</select><select id="analysisStatus">${statusOptions}</select><select id="analysisRisk">${riskOptions}</select><select id="analysisScoreRange">${scoreOptions}</select><select id="analysisAction">${actionOptions}</select><select id="analysisCapital">${capitalOptions}</select><select id="analysisExecution">${executionOptions}</select><select id="analysisFreshness">${freshnessOptions}</select><select id="analysisTechnicalStatus">${techStatusOptions}</select><select id="analysisValuationStatus">${valuationStatusOptions}</select><select id="analysisValuationMissing">${valuationMissingOptions}</select><select id="analysisFinancialStatus">${financialStatusOptions}</select><select id="analysisFinancialMissing">${financialMissingOptions}</select></div></div>`;
  const empty='<div class="empty">当前筛选条件下没有匹配标的。</div>';
  const table=rows.length?`<div class="table-wrap"><table><thead><tr><th>名称</th><th>代码</th><th>总分</th><th>决策分</th><th>动作</th><th>建议金额</th><th>建议股数</th><th>执行状态</th><th>目标</th><th>当前</th><th>缺口</th><th>优先级</th><th>新鲜度</th><th>自动技术</th><th>自动估值</th><th>自动财务</th><th>风险</th><th>操作计划</th></tr></thead><tbody>${rows.map(s=>{const d=decisionForStock(s);const ex=executionForStock(s);const f=getAnalysisFreshness(s);const ts=calculateTechnicalSignal(s);const vs=calculateValuationSignal(s);const vd=normalizeValuationData(s.valuationData);const fs=calculateFinancialSignal(s);const fd=normalizeFinancialData(s.financialData);return `<tr class="analysis-row" data-analysis-stock="${esc(s.id)}" style="cursor:pointer"><td class="name" data-label="名称">${esc(s.name||'—')}</td><td class="num" data-label="代码">${esc(s.code||'—')}</td><td data-label="总分">${analysisScoreCell(s.analysisScore)}</td><td data-label="决策分">${analysisScoreCell(d.decisionScore)}</td><td data-label="动作">${esc(decisionActionLabel(d.action))}</td><td data-label="建议金额">${fmtMoney(ex.suggestedBuyAmount)}</td><td data-label="建议股数">${fmtInt(ex.suggestedShares)}</td><td data-label="执行状态">${esc(ex.executionStatus)}</td><td data-label="目标">${fmtMaybe(d.targetWeight,1)}%</td><td data-label="当前">${fmtMaybe(d.currentWeight,1)}%</td><td data-label="缺口">${fmtMaybe(d.positionGap,1)}%</td><td data-label="优先级">${fmtMaybe(d.priority,0)}</td><td data-label="新鲜度">${esc(f.staleLevel)}<div class="card-note">${f.daysSinceUpdate===null?'—':f.daysSinceUpdate+'天'}</div></td><td data-label="自动技术">${analysisScoreCell(ts.technicalScore)}<div class="card-note">${esc(ts.technicalStatus)}</div></td><td data-label="自动估值">${analysisScoreCell(vs.valuationScore)}<div class="card-note">${esc(vs.valuationStatus)} · ${esc(vd.lastUpdated||'—')}</div></td><td data-label="自动财务">${analysisScoreCell(fs.financialScore)}<div class="card-note">${esc(fs.financialStatus)} · ${esc(fd.reportPeriod||fd.lastUpdated||'—')}</div></td><td data-label="风险">${analysisScoreCell(analysisModuleScore(s,'risks'))}<div class="card-note">${esc(analysisModuleStatus(s,'risks'))}</div></td><td class="text" data-label="操作计划">${esc(analysisActionPlan(s)||d.suggestedAction||'—')}</td></tr>`}).join('')}</tbody></table></div>`:empty;
  main.innerHTML=filters+table;
  document.getElementById('analysisSort').addEventListener('change',e=>{analysisSortMode=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisRole').addEventListener('change',e=>{analysisRoleFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisStatus').addEventListener('change',e=>{analysisStatusFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisRisk').addEventListener('change',e=>{analysisRiskFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisScoreRange').addEventListener('change',e=>{analysisScoreFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisAction').addEventListener('change',e=>{analysisActionFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisCapital').addEventListener('change',e=>{analysisCapitalFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisExecution').addEventListener('change',e=>{analysisExecutionFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisFreshness').addEventListener('change',e=>{analysisFreshnessFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisTechnicalStatus').addEventListener('change',e=>{analysisTechnicalStatusFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisValuationStatus').addEventListener('change',e=>{analysisValuationStatusFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisValuationMissing').addEventListener('change',e=>{analysisValuationMissingFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisFinancialStatus').addEventListener('change',e=>{analysisFinancialStatusFilter=e.target.value;renderAnalysisOverview()});
  document.getElementById('analysisFinancialMissing').addEventListener('change',e=>{analysisFinancialMissingFilter=e.target.value;renderAnalysisOverview()});
  document.querySelectorAll('[data-analysis-stock]').forEach(row=>row.addEventListener('click',()=>openStockDetail(row.dataset.analysisStock)));
}

function openStockDetail(id){
  detailStockId=id;
  render();
}
function closeStockDetail(){
  detailStockId=null;
  render();
}
function planListHtml(plans,type,cp){
  const arr=(plans||[]).filter(p=>type==='buy'?(p.action||'buy')==='buy':p.action==='sell').sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  if(!arr.length)return '<div class="empty" style="padding:18px 0">暂无计划</div>';
  return `<div class="trig-list">${arr.map(p=>{const g=planGap(cp,p.price,p.action,p.triggerOn);const tag=type==='buy'?'加仓':'减仓';const gap=g?(g.triggered?'已触发':`${g.direction==='below'?'低于':'高于'}目标 ${g.absPct.toFixed(1)}%`):'未计算';return `<div class="trig-row ${type==='sell'?'sell':'buy'}"><div class="trig-name">${tag} · ${fmtMaybe(p.price)}</div><div class="trig-dist">${gap}</div><div class="trig-desc">数量 ${fmtInt(p.shares)}${p.note?' · '+esc(p.note):''}</div></div>`}).join('')}</div>`;
}
function stockExecutionRows(name){
  const rows=(Array.isArray(state.executionLog)?state.executionLog:[]).filter(x=>x.stock===name).sort((a,b)=>(Number(b.t)||0)-(Number(a.t)||0));
  if(!rows.length)return '<div class="empty" style="padding:18px 0">暂无操作记录</div>';
  return `<div class="table-wrap"><table><thead><tr><th>时间</th><th>买/卖</th><th>价格</th><th>数量</th><th>金额</th><th>备注</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="num">${esc(executionLogTime(x))}</td><td><span class="chip ${x.action==='sell'?'sell':'buy'}">${executionLogAction(x)}</span></td><td class="num">${fmtMaybe(x.price)}</td><td class="num">${fmtInt(x.shares)}</td><td class="num">${fmtMaybe(executionLogAmount(x))}</td><td class="text">${esc(x.note||'')||'<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function stockSocialSummary(s){
  if(typeof socialDetailPanel!=='function')return '<details class="social-panel"><summary>社媒舆情</summary><div class="social-empty">社媒模块未加载</div></details>';
  return socialDetailPanel(s);
}
const ANALYSIS_MODULE_LABELS={
  macro:'宏观环境',
  industry:'行业分析',
  company:'公司竞争力',
  financials:'财务质量',
  valuation:'估值分析',
  technical:'技术趋势',
  capitalFlow:'资金面',
  risks:'风险分析',
  conclusion:'投资结论'
};
function analysisStatusText(v){return v==='positive'?'positive':(v==='negative'?'negative':'neutral')}
function analysisListHtml(items){
  const arr=Array.isArray(items)?items.slice(0,3):[];
  if(!arr.length)return '<div class="muted" style="font-size:12px">—</div>';
  return `<ul style="margin:4px 0 0;padding-left:18px">${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}
function analysisModuleCard(stock,key){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const m=fw[key];
  const conclusion=key==='conclusion';
  const extra=conclusion?`<div class="text" style="max-width:none;margin-top:6px"><b>角色：</b>${esc(m.positionRole||'—')}<br><b>操作：</b>${esc(m.actionPlan||'—')}</div>`:'';
  return `<div class="card"><div class="card-title">${esc(ANALYSIS_MODULE_LABELS[key]||key)} <button class="link-btn" data-analysis-edit="${key}" style="float:right">编辑</button></div><div class="card-num">${fmtMaybe(m.score,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(analysisStatusText(m.status))}</div><div class="text" style="max-width:none;margin-top:8px">${esc(m.summary||'—')}</div>${extra}<div class="text" style="max-width:none;margin-top:8px"><b>要点：</b>${analysisListHtml(m.keyPoints)}<b>观察：</b>${analysisListHtml(m.watchItems)}</div></div>`;
}
function analysisFrameworkPanel(stock){
  normalizeStockAnalysis(stock);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">九模块分析</div><div class="card-num">${fmtMaybe(stock.analysisScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">按宏观、行业、公司、财务、估值、技术、资金、风险、结论加权计算。</div></div><div class="dash">${ANALYSIS_MODULES.map(key=>analysisModuleCard(stock,key)).join('')}</div>`;
}
function ensureAnalysisModal(){
  let el=document.getElementById('analysisModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='analysisModal';
  el.innerHTML=`<div class="modal"><h2 id="analysisModalTitle">编辑分析模块</h2><div class="modal-sub">多行文本每行保存为一条。</div><div class="form-row two"><div><label>score（0-10）</label><input id="afScore" type="number" min="0" max="10" step="0.1"></div><div><label>status</label><select id="afStatus"><option value="positive">positive</option><option value="neutral">neutral</option><option value="negative">negative</option></select></div></div><div class="form-row"><label>summary</label><textarea id="afSummary"></textarea></div><div id="analysisCommonFields"><div class="form-row two"><div><label>keyPoints（每行一条）</label><textarea id="afKeyPoints"></textarea></div><div><label>watchItems（每行一条）</label><textarea id="afWatchItems"></textarea></div></div></div><div id="analysisConclusionFields" style="display:none"><div class="form-row two"><div><label>positionRole</label><input id="afPositionRole"></div><div><label>actionPlan</label><input id="afActionPlan"></div></div><div class="form-row two"><div><label>buyRules（每行一条）</label><textarea id="afBuyRules"></textarea></div><div><label>sellRules（每行一条）</label><textarea id="afSellRules"></textarea></div></div><div class="form-row"><label>invalidationConditions（每行一条）</label><textarea id="afInvalidationConditions"></textarea></div></div><div class="modal-actions"><button class="btn ghost" id="analysisCancelBtn" type="button">取消</button><button class="btn" id="analysisSaveBtn" type="button">保存分析</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='analysisModal')closeAnalysisModal()});
  document.getElementById('analysisCancelBtn').addEventListener('click',closeAnalysisModal);
  document.getElementById('analysisSaveBtn').addEventListener('click',saveAnalysisModule);
  return el;
}
function analysisLines(v){return Array.isArray(v)?v.join('\n'):''}
function parseAnalysisLines(v){return String(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
function openAnalysisEditor(key){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const modal=ensureAnalysisModal();
  const isConclusion=key==='conclusion';
  const m=stock.analysisFramework[key]||defaultAnalysisFramework(stock)[key];
  modal.dataset.stockId=stock.id;
  modal.dataset.moduleKey=key;
  document.getElementById('analysisModalTitle').textContent=`编辑${ANALYSIS_MODULE_LABELS[key]||key}`;
  document.getElementById('afScore').value=m.score??0;
  document.getElementById('afStatus').value=analysisStatusText(m.status);
  document.getElementById('afSummary').value=m.summary||'';
  document.getElementById('analysisCommonFields').style.display=isConclusion?'none':'block';
  document.getElementById('analysisConclusionFields').style.display=isConclusion?'block':'none';
  document.getElementById('afKeyPoints').value=analysisLines(m.keyPoints);
  document.getElementById('afWatchItems').value=analysisLines(m.watchItems);
  document.getElementById('afPositionRole').value=m.positionRole||stock.role||'';
  document.getElementById('afActionPlan').value=m.actionPlan||'';
  document.getElementById('afBuyRules').value=analysisLines(m.buyRules);
  document.getElementById('afSellRules').value=analysisLines(m.sellRules);
  document.getElementById('afInvalidationConditions').value=analysisLines(m.invalidationConditions);
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('afSummary').focus(),50);
}
function closeAnalysisModal(){
  const modal=document.getElementById('analysisModal');
  if(modal)modal.classList.remove('show');
}
function saveAnalysisModule(){
  const modal=document.getElementById('analysisModal');
  const stock=state.stocks.find(x=>x.id===modal?.dataset.stockId);
  const key=modal?.dataset.moduleKey;
  if(!stock||!key)return;
  const base={summary:document.getElementById('afSummary').value.trim(),score:normalizeAnalysisScoreValue(document.getElementById('afScore').value),status:document.getElementById('afStatus').value};
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  if(key==='conclusion'){
    fw.conclusion=normalizeConclusionModule({...fw.conclusion,...base,positionRole:document.getElementById('afPositionRole').value.trim(),actionPlan:document.getElementById('afActionPlan').value.trim(),buyRules:parseAnalysisLines(document.getElementById('afBuyRules').value),sellRules:parseAnalysisLines(document.getElementById('afSellRules').value),invalidationConditions:parseAnalysisLines(document.getElementById('afInvalidationConditions').value)},stock);
  }else{
    fw[key]=normalizeAnalysisModule({...fw[key],...base,keyPoints:parseAnalysisLines(document.getElementById('afKeyPoints').value),watchItems:parseAnalysisLines(document.getElementById('afWatchItems').value)});
  }
  stock.analysisFramework=fw;
  stock.analysisScore=calculateAnalysisScore(fw);
  saveState();
  closeAnalysisModal();
  render();
}
function planPromptList(plans,type){
  return (plans||[]).filter(p=>type==='buy'?(p.action||'buy')==='buy':p.action==='sell').map(p=>({price:p.price||'',shares:p.shares||'',note:p.note||'',triggerOn:p.triggerOn||''}));
}
function buildAnalysisPrompt(stock){
  normalizeStockAnalysis(stock);
  const payload={
    stock:{
      name:stock.name||'',
      code:stock.code||'',
      shares:stock.shares||0,
      avgCost:stock.avgCost||'',
      currentPrice:stock.type==='etf'?(stock.currentValue||''):(stock.currentPrice||''),
      positionRole:analysisPositionRole(stock)||stock.role||'',
      buyPlans:planPromptList(stock.plans,'buy'),
      sellPlans:planPromptList(stock.plans,'sell'),
      analysisInputs:normalizeAnalysisInputs(stock.analysisInputs),
      currentAnalysisFramework:stock.analysisFramework
    },
    outputSchema:{analysisFramework:defaultAnalysisFramework(stock)}
  };
  return [
    '你是一名严谨的投资研究助理。请基于以下股票资料，按照九模块股票分析框架更新 analysisFramework。',
    '',
    '要求：',
    '1. 只输出严格 JSON，不要输出 Markdown，不要解释。',
    '2. JSON 顶层必须只有 analysisFramework。',
    '3. score 必须是 0-10 数字，status 只能是 positive / neutral / negative。',
    '4. keyPoints、watchItems、buyRules、sellRules、invalidationConditions 必须是数组。',
    '5. 不要给出确定性买卖指令，只给复核型 actionPlan 和规则。',
    '6. 保留无法判断的信息为空字符串或空数组。',
    '',
    '股票资料：',
    JSON.stringify(payload.stock,null,2),
    '',
    '请严格按以下 JSON 结构输出：',
    JSON.stringify(payload.outputSchema,null,2)
  ].join('\n');
}
function ensureAiAnalysisPromptModal(){
  let el=document.getElementById('aiAnalysisPromptModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='aiAnalysisPromptModal';
  el.innerHTML=`<div class="modal"><h2>生成分析提示词</h2><div class="modal-sub">复制后粘贴给你使用的 AI 工具，返回 JSON 后再导入。</div><div class="form-row"><label>提示词</label><textarea id="aiAnalysisPromptText" style="min-height:360px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px"></textarea></div><div class="modal-actions"><button class="btn ghost" id="aiPromptCloseBtn" type="button">关闭</button><button class="btn" id="aiPromptCopyBtn" type="button">复制提示词</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='aiAnalysisPromptModal')closeAiAnalysisPromptModal()});
  document.getElementById('aiPromptCloseBtn').addEventListener('click',closeAiAnalysisPromptModal);
  document.getElementById('aiPromptCopyBtn').addEventListener('click',copyAiAnalysisPrompt);
  return el;
}
function openAiAnalysisPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureAiAnalysisPromptModal();
  document.getElementById('aiAnalysisPromptText').value=buildAnalysisPrompt(stock);
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('aiAnalysisPromptText').focus(),50);
}
function closeAiAnalysisPromptModal(){
  const modal=document.getElementById('aiAnalysisPromptModal');
  if(modal)modal.classList.remove('show');
}
function copyAiAnalysisPrompt(){
  const text=document.getElementById('aiAnalysisPromptText').value;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>alert('提示词已复制。')).catch(()=>fallbackCopyAnalysisPrompt());
  }else fallbackCopyAnalysisPrompt();
}
function fallbackCopyAnalysisPrompt(){
  const ta=document.getElementById('aiAnalysisPromptText');
  ta.focus();
  ta.select();
  try{document.execCommand('copy');alert('提示词已复制。')}catch(e){alert('复制失败，请手动全选复制。')}
}
function ensureAiAnalysisImportModal(){
  let el=document.getElementById('aiAnalysisImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='aiAnalysisImportModal';
  el.innerHTML=`<div class="modal"><h2>导入AI分析JSON</h2><div class="modal-sub">只会写入当前股票的 analysisFramework，不会覆盖持仓、价格、计划、操作记录或社媒数据。</div><div class="form-row"><label>AI 返回 JSON</label><textarea id="aiAnalysisJsonText" style="min-height:320px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"analysisFramework\":{...}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="aiImportCloseBtn" type="button">取消</button><button class="btn" id="aiImportSaveBtn" type="button">导入分析</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='aiAnalysisImportModal')closeAiAnalysisImportModal()});
  document.getElementById('aiImportCloseBtn').addEventListener('click',closeAiAnalysisImportModal);
  document.getElementById('aiImportSaveBtn').addEventListener('click',importAiAnalysisJson);
  return el;
}
function openAiAnalysisImport(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureAiAnalysisImportModal();
  document.getElementById('aiAnalysisJsonText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('aiAnalysisJsonText').focus(),50);
}
function closeAiAnalysisImportModal(){
  const modal=document.getElementById('aiAnalysisImportModal');
  if(modal)modal.classList.remove('show');
}
function importAiAnalysisJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  let parsed;
  try{parsed=JSON.parse(document.getElementById('aiAnalysisJsonText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  if(!parsed||typeof parsed!=='object'||!parsed.analysisFramework||typeof parsed.analysisFramework!=='object'){alert('导入失败：JSON 必须包含 analysisFramework 对象。');return}
  const nextFramework=normalizeAnalysisFramework(parsed.analysisFramework,stock);
  stock.analysisFramework=nextFramework;
  stock.analysisScore=calculateAnalysisScore(nextFramework);
  saveState();
  closeAiAnalysisImportModal();
  render();
  alert(`AI分析导入成功，当前分析评分 ${fmtMaybe(stock.analysisScore,1)}/10。`);
}
const AI_ASSISTANT_TASKS={
  analysis:{label:'生成九模块分析'},
  strategy:{label:'生成策略建议'},
  valuation:{label:'更新估值判断'},
  financial:{label:'财务数据提取'},
  conclusion:{label:'更新投资结论'}
};
function stockOperationSummary(stock){
  const rows=(Array.isArray(state.executionLog)?state.executionLog:[]).filter(x=>x.stock===stock.name).sort((a,b)=>(Number(b.t)||0)-(Number(a.t)||0)).slice(0,8);
  return rows.map(x=>({time:typeof executionLogTime==='function'?executionLogTime(x):(x.t?new Date(Number(x.t)).toLocaleString('zh-CN'):''),action:x.action||'',price:x.price||'',shares:x.shares||'',amount:typeof executionLogAmount==='function'?executionLogAmount(x):'',note:x.note||'',autoUpdated:!!x.autoUpdated}));
}
function analysisSummaryPayload(stock){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const out={};
  ANALYSIS_MODULES.forEach(k=>{out[k]={score:fw[k].score,status:fw[k].status,summary:fw[k].summary,keyPoints:(fw[k].keyPoints||[]).slice(0,3),watchItems:(fw[k].watchItems||[]).slice(0,3)}});
  return out;
}
function aiAssistantContext(stock){
  normalizeStockAnalysis(stock);
  const total=portfolioContext();
  const decision=calculateDecision(stock,total);
  const execution=calculateExecutionPlan(stock,total);
  const technical=calculateTechnicalSignal(stock);
  const valuation=calculateValuationSignal(stock);
  const financial=calculateFinancialSignal(stock);
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  return {
    stock:{
      name:stock.name||'',
      code:stock.code||'',
      type:stock.type||'',
      shares:stock.shares||0,
      avgCost:stock.avgCost||'',
      currentPrice:stock.type==='etf'?(stock.currentValue||''):(stock.currentPrice||''),
      marketValue:getMarketValue(stock)||0,
      currentWeight:decision.currentWeight,
      targetPct:stock.targetPct||'',
      role:stock.role||'',
      theme:stock.theme||''
    },
    strategy:normalizeStrategy(stock.strategy,stock),
    analysisInputs:inputs,
    currentAnalysisFramework:fw,
    analysisScore:stock.analysisScore,
    analysisSummary:analysisSummaryPayload(stock),
    technicalData:normalizeTechnicalData(stock.technicalData),
    technical:{score:technical.technicalScore,status:technical.technicalStatus,summary:technical.technicalSummary,signals:technical.signals,warnings:technical.warnings},
    valuation:{score:valuation.valuationScore,status:valuation.valuationStatus,summary:valuation.valuationSummary,signals:valuation.signals,warnings:valuation.warnings,valuationData:normalizeValuationData(stock.valuationData),valuationRawText:inputs.valuationRawText},
    financial:{score:financial.financialScore,status:financial.financialStatus,summary:financial.financialSummary,signals:financial.signals,warnings:financial.warnings,financialData:normalizeFinancialData(stock.financialData),currentFinancialsModule:fw.financials,financialReport:inputs.financialReport},
    decision:{action:decision.action,decisionScore:decision.decisionScore,positionGap:decision.positionGap,positionStatus:decision.positionStatus,warnings:decision.warnings,suggestedAction:decision.suggestedAction},
    execution:{suggestedBuyAmount:execution.suggestedBuyAmount,suggestedShares:execution.suggestedShares,executionStatus:execution.executionStatus,priceTiming:execution.priceTiming,warnings:execution.executionWarnings},
    plans:{buy:planPromptList(stock.plans,'buy'),sell:planPromptList(stock.plans,'sell')},
    operationLog:stockOperationSummary(stock)
  };
}
function aiAssistantSchema(task){
  if(task==='strategy')return {strategy:defaultStrategy({})};
  if(task==='valuation')return {valuationData:defaultValuationData({})};
  if(task==='financial')return {financialData:defaultFinancialData({})};
  if(task==='conclusion')return {analysisFramework:{conclusion:defaultConclusionModule({})}};
  return {analysisFramework:defaultAnalysisFramework({})};
}
function buildAiAssistantPrompt(stock,task){
  if(task==='financial')return buildFinancialDataExtractionPrompt(stock,promptMissingRawTextHint(stock,'promptFinancialData'));
  const ctx=aiAssistantContext(stock);
  const label=(AI_ASSISTANT_TASKS[task]||AI_ASSISTANT_TASKS.analysis).label;
  const taskRules={
    analysis:['更新完整九模块 analysisFramework。','不要覆盖 strategy、priceHistory、technicalData、valuationData、financialData。','只输出顶层包含 analysisFramework 的严格 JSON。'],
    strategy:['生成 strategy 策略建议。','targetWeight / targetShares 可同时给；如能基于用户目标推断目标股数，优先给 targetShares。','maxWeight 必须 >= targetWeight；minWeight 不得高于 targetWeight。','priority 1 最高、10 最低；convictionLevel 0-10。','buyAggressiveness 只能是 conservative / normal / aggressive。','不要给出过度激进策略，策略仅为辅助建议，最终由用户确认。','只输出顶层包含 strategy 的严格 JSON。'],
    valuation:['更新估值判断。','结合当前 valuationData、九模块 valuation 和 analysisInputs.valuationRawText。','优先返回 valuationData；如果只做九模块估值判断，也可以返回 analysisFramework.valuation。','如果不确定，请优先返回 valuationData 并保留无法判断的字段为 0 或空字符串。','只输出严格 JSON。'],
    financial:['财务数据提取。','只根据 analysisInputs.financialReport 原文提取明确披露的数据。','financialData 中的 0 代表缺失，不代表真实为 0。','未披露字段必须保持 0 或空字符串。','严禁推测 ROE、毛利率、现金流、负债率、EPS。','只返回顶层包含 financialData 的严格 JSON。','不要覆盖 analysisFramework.financials，用户会在本地点击“应用到九模块财务评分”。'],
    conclusion:['只更新 investment conclusion，即 analysisFramework.conclusion。','结合九模块评分、策略、决策分、执行建议和风险提示，给出复核型结论。','不要输出确定性买卖指令。','只输出顶层包含 analysisFramework.conclusion 的严格 JSON。']
  }[task]||[];
  return [
    `你是一名严谨的投资研究助理。当前任务：${label}。`,
    '',
    '通用要求：',
    '1. 只输出严格 JSON，不要输出 Markdown，不要解释。',
    '2. score 必须是 0-10 数字，status 只能是 positive / neutral / negative。',
    '3. 数组字段必须输出数组；无法判断的信息保留为空字符串、0 或空数组。',
    '4. 该结果仅作为投资复核辅助，不构成买卖指令，最终由用户确认。',
    '',
    '任务要求：',
    ...taskRules.map((x,i)=>`${i+1}. ${x}`),
    '',
    '当前股票上下文：',
    JSON.stringify(ctx,null,2),
    '',
    '请严格按以下 JSON 结构输出：',
    JSON.stringify(aiAssistantSchema(task),null,2)
  ].join('\n');
}
function applyAiAssistantResult(stock,parsed,task){
  if(!stock||!parsed||typeof parsed!=='object')return {ok:false,message:'JSON 必须是对象。'};
  if(task==='financial'&&parsed.financialReview)return {ok:false,message:'当前 JSON 是 financialReview。请使用“财务数据提取” Prompt 生成 financialData；financialReview 请到 AI Review 导入区导入。'};
  if(parsed.strategy&&typeof parsed.strategy==='object'){
    stock.strategy=normalizeStrategy(parsed.strategy,stock);
    return {ok:true,message:'已导入策略建议。'};
  }
  if(parsed.valuationData&&typeof parsed.valuationData==='object'){
    stock.valuationData=normalizeValuationData({...parsed.valuationData,lastUpdated:parsed.valuationData.lastUpdated||new Date().toISOString()});
    touchDataFreshness(stock,'valuationUpdatedAt');
    return {ok:true,message:'已导入估值数据。'};
  }
  if(parsed.financialData&&typeof parsed.financialData==='object'){
    stock.financialData=normalizeFinancialData({...parsed.financialData,lastUpdated:parsed.financialData.lastUpdated||new Date().toISOString()});
    touchDataFreshness(stock,'financialUpdatedAt');
    return {ok:true,message:'已导入财务数据。'};
  }
  if(parsed.analysisFramework&&typeof parsed.analysisFramework==='object'){
    const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
    const frameworkKeys=Object.keys(parsed.analysisFramework);
    if((task==='conclusion'&&parsed.analysisFramework.conclusion)||(parsed.analysisFramework.conclusion&&frameworkKeys.length===1)){
      fw.conclusion=normalizeConclusionModule(parsed.analysisFramework.conclusion,stock);
      stock.analysisFramework=fw;
      stock.analysisScore=calculateAnalysisScore(fw);
      return {ok:true,message:'已导入投资结论。'};
    }
    if((task==='valuation'&&parsed.analysisFramework.valuation)||(parsed.analysisFramework.valuation&&frameworkKeys.length===1)){
      fw.valuation=normalizeAnalysisModule(parsed.analysisFramework.valuation);
      stock.analysisFramework=fw;
      stock.analysisScore=calculateAnalysisScore(fw);
      return {ok:true,message:'已导入九模块估值判断。'};
    }
    stock.analysisFramework=normalizeAnalysisFramework(parsed.analysisFramework,stock);
    stock.analysisScore=calculateAnalysisScore(stock.analysisFramework);
    return {ok:true,message:'已导入九模块分析。'};
  }
  return {ok:false,message:'未识别可导入字段：需要 analysisFramework、strategy、valuationData 或 financialData。'};
}
function ensureAiAssistantModal(){
  let el=document.getElementById('aiAssistantModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='aiAssistantModal';
  const options=Object.keys(AI_ASSISTANT_TASKS).map(k=>`<option value="${k}">${AI_ASSISTANT_TASKS[k].label}</option>`).join('');
  el.innerHTML=`<div class="modal"><h2>AI助手</h2><div class="modal-sub">本功能只生成提示词和导入 JSON，不联网、不直接调用 AI。</div><div class="form-row"><label>步骤一：选择任务</label><select id="aiAssistantTask">${options}</select></div><div class="form-row"><label>步骤二：生成提示词</label><textarea id="aiAssistantPrompt" style="min-height:260px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px"></textarea><div class="modal-actions" style="justify-content:flex-start;margin-top:8px"><button class="btn ghost small" id="aiAssistantRefreshPrompt" type="button">重新生成提示词</button><button class="btn ghost small" id="aiAssistantCopyPrompt" type="button">复制提示词</button></div><div class="card-note">复制后发送给 ChatGPT，再把返回的严格 JSON 粘贴到下一步。</div></div><div class="form-row"><label>步骤三：导入AI结果</label><textarea id="aiAssistantJson" style="min-height:220px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"strategy\":{...}} / {\"analysisFramework\":{...}} / {\"valuationData\":{...}} / {\"financialData\":{...}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="aiAssistantCloseBtn" type="button">关闭</button><button class="btn" id="aiAssistantImportBtn" type="button">导入AI结果</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='aiAssistantModal')closeAiAssistantModal()});
  document.getElementById('aiAssistantTask').addEventListener('change',refreshAiAssistantPrompt);
  document.getElementById('aiAssistantRefreshPrompt').addEventListener('click',refreshAiAssistantPrompt);
  document.getElementById('aiAssistantCopyPrompt').addEventListener('click',copyAiAssistantPrompt);
  document.getElementById('aiAssistantCloseBtn').addEventListener('click',closeAiAssistantModal);
  document.getElementById('aiAssistantImportBtn').addEventListener('click',importAiAssistantJson);
  return el;
}
function openAiAssistant(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  ensureAiAssistantModal().classList.add('show');
  document.getElementById('aiAssistantJson').value='';
  refreshAiAssistantPrompt();
}
function openAiAssistantTask(task){
  openAiAssistant();
  const sel=document.getElementById('aiAssistantTask');
  if(sel&&AI_ASSISTANT_TASKS[task]){
    sel.value=task;
    refreshAiAssistantPrompt();
  }
}
function closeAiAssistantModal(){
  const modal=document.getElementById('aiAssistantModal');
  if(modal)modal.classList.remove('show');
}
function refreshAiAssistantPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const task=document.getElementById('aiAssistantTask').value||'analysis';
  document.getElementById('aiAssistantPrompt').value=buildAiAssistantPrompt(stock,task);
}
function copyAiAssistantPrompt(){
  const text=document.getElementById('aiAssistantPrompt').value;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>alert('提示词已复制。')).catch(()=>fallbackCopyAiAssistantPrompt());
  }else fallbackCopyAiAssistantPrompt();
}
function fallbackCopyAiAssistantPrompt(){
  const ta=document.getElementById('aiAssistantPrompt');
  ta.focus();
  ta.select();
  try{document.execCommand('copy');alert('提示词已复制。')}catch(e){alert('复制失败，请手动全选复制。')}
}
function importAiAssistantJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={strategy:JSON.parse(JSON.stringify(stock.strategy||{})),analysisFramework:JSON.parse(JSON.stringify(stock.analysisFramework||{})),valuationData:JSON.parse(JSON.stringify(stock.valuationData||{})),financialData:JSON.parse(JSON.stringify(stock.financialData||{}))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('aiAssistantJson').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  const task=document.getElementById('aiAssistantTask').value||'analysis';
  const result=applyAiAssistantResult(stock,parsed,task);
  if(!result.ok){
    stock.strategy=original.strategy;
    stock.analysisFramework=original.analysisFramework;
    stock.valuationData=original.valuationData;
    stock.financialData=original.financialData;
    alert('导入失败：'+result.message);
    return;
  }
  normalizeStockAnalysis(stock);
  saveState();
  closeAiAssistantModal();
  render();
  alert(`${result.message} 当前分析评分 ${fmtMaybe(stock.analysisScore,1)}/10。`);
}
function analysisInputSnippet(v){
  const s=String(v||'').trim();
  if(!s)return '—';
  return s.length>80?s.slice(0,80)+'...':s;
}
function analysisInputsPanel(stock){
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  const filled=['financialReport','news','technicalObservation','capitalFlowObservation','personalView','valuationRawText'].filter(k=>String(inputs[k]||'').trim()).length;
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">分析资料 <button class="link-btn" data-detail-action="edit-inputs" style="float:right">编辑分析资料</button></div><div class="card-note">已填写 ${filled}/6 · 更新时间 ${esc(inputs.lastUpdated||'—')}</div><div class="text" style="max-width:none;margin-top:8px"><b>财报/业绩：</b>${esc(analysisInputSnippet(inputs.financialReport))}<br><b>估值资料：</b>${esc(analysisInputSnippet(inputs.valuationRawText))}<br><b>新闻/公告：</b>${esc(analysisInputSnippet(inputs.news))}<br><b>技术观察：</b>${esc(analysisInputSnippet(inputs.technicalObservation))}<br><b>资金流：</b>${esc(analysisInputSnippet(inputs.capitalFlowObservation))}<br><b>主观判断：</b>${esc(analysisInputSnippet(inputs.personalView))}</div></div>`;
}
function ensureAnalysisInputsModal(){
  let el=document.getElementById('analysisInputsModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='analysisInputsModal';
  el.innerHTML=`<div class="modal"><h2>编辑分析资料</h2><div class="modal-sub">这些资料只用于生成分析提示词，不会覆盖九模块分析结论。</div><div class="form-row"><label>最新财报 / 业绩信息</label><textarea id="aiFinancialReport"></textarea></div><div class="form-row"><label>估值资料</label><textarea id="aiValuationRawText"></textarea></div><div class="form-row"><label>最新新闻 / 公告</label><textarea id="aiNews"></textarea></div><div class="form-row"><label>技术面观察</label><textarea id="aiTechnicalObservation"></textarea></div><div class="form-row"><label>资金流观察</label><textarea id="aiCapitalFlowObservation"></textarea></div><div class="form-row"><label>我的主观判断</label><textarea id="aiPersonalView"></textarea></div><div class="modal-actions"><button class="btn ghost" id="analysisInputsCancelBtn" type="button">取消</button><button class="btn" id="analysisInputsSaveBtn" type="button">保存资料</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='analysisInputsModal')closeAnalysisInputsModal()});
  document.getElementById('analysisInputsCancelBtn').addEventListener('click',closeAnalysisInputsModal);
  document.getElementById('analysisInputsSaveBtn').addEventListener('click',saveAnalysisInputs);
  return el;
}
function openAnalysisInputsEditor(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureAnalysisInputsModal();
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  document.getElementById('aiFinancialReport').value=inputs.financialReport;
  document.getElementById('aiValuationRawText').value=inputs.valuationRawText;
  document.getElementById('aiNews').value=inputs.news;
  document.getElementById('aiTechnicalObservation').value=inputs.technicalObservation;
  document.getElementById('aiCapitalFlowObservation').value=inputs.capitalFlowObservation;
  document.getElementById('aiPersonalView').value=inputs.personalView;
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('aiFinancialReport').focus(),50);
}
function closeAnalysisInputsModal(){
  const modal=document.getElementById('analysisInputsModal');
  if(modal)modal.classList.remove('show');
}
function saveAnalysisInputs(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const prev=normalizeAnalysisInputs(stock.analysisInputs);
  const next={
    financialReport:document.getElementById('aiFinancialReport').value,
    valuationRawText:document.getElementById('aiValuationRawText').value,
    news:document.getElementById('aiNews').value,
    technicalObservation:document.getElementById('aiTechnicalObservation').value,
    capitalFlowObservation:document.getElementById('aiCapitalFlowObservation').value,
    personalView:document.getElementById('aiPersonalView').value,
    lastUpdated:new Date().toISOString()
  };
  stock.analysisInputs=normalizeAnalysisInputs({
    ...next
  });
  if(next.financialReport!==prev.financialReport)touchDataFreshness(stock,'financialUpdatedAt');
  if(next.valuationRawText!==prev.valuationRawText)touchDataFreshness(stock,'valuationUpdatedAt');
  if(next.news!==prev.news)touchDataFreshness(stock,'newsUpdatedAt');
  if(next.technicalObservation!==prev.technicalObservation)touchDataFreshness(stock,'technicalUpdatedAt');
  if(next.personalView!==prev.personalView)touchDataFreshness(stock,'personalViewUpdatedAt');
  saveState();
  closeAnalysisInputsModal();
  render();
}
function financialSourceLinks(stock){
  const code=String((stock&&stock.code)||'').trim().toUpperCase();
  const name=String((stock&&stock.name)||'').trim();
  const qBase=[name,code].filter(Boolean).join(' ');
  const yahooCode=code||encodeURIComponent(name||'stock');
  const google=q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const bing=q=>`https://www.bing.com/search?q=${encodeURIComponent(q)}`;
  return [
    {label:'HKEXnews 搜索',url:code.endsWith('.HK')?google(`${qBase} site:hkexnews.hk annual report interim report`):google(`${qBase} HKEXnews annual report interim report`)},
    {label:'Yahoo Finance Financials',url:`https://finance.yahoo.com/quote/${encodeURIComponent(yahooCode)}/financials`},
    {label:'公司 IR · Annual report',url:google(`${qBase} Investor Relations annual report`)},
    {label:'公司 IR · Interim report',url:bing(`${qBase} interim report Investor Relations`)}
  ];
}
function ensureFinancialSourceModal(){
  let el=document.getElementById('financialSourceModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='financialSourceModal';
  el.innerHTML=`<div class="modal"><h2>财报助手</h2><div class="modal-sub">只生成常用来源链接并保存财报文本；不联网抓取、不调用 AI。</div><div class="dash" style="grid-template-columns:1fr 1fr;margin-bottom:12px"><div class="card"><div class="card-title">标的</div><div class="card-note" id="financialSourceStock">—</div></div><div class="card"><div class="card-title">当前财务数据</div><div class="card-note" id="financialSourceMeta">—</div></div></div><div class="form-row"><label>常用财报来源</label><div id="financialSourceLinks" class="chips"></div></div><div class="form-row"><label>粘贴财报文本</label><textarea id="financialSourceText" style="min-height:220px" placeholder="可粘贴年报、季报、业绩公告、管理层指引等原文或摘要。保存后会写入分析资料里的“最新财报 / 业绩信息”。"></textarea></div><div class="modal-actions"><button class="btn ghost" id="financialSourceCancelBtn" type="button">取消</button><button class="btn ghost" id="financialSourceSaveBtn" type="button">保存</button><button class="btn" id="financialSourceAiBtn" type="button">保存并打开 AI助手：财务数据提取</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='financialSourceModal')closeFinancialSourceModal()});
  document.getElementById('financialSourceCancelBtn').addEventListener('click',closeFinancialSourceModal);
  document.getElementById('financialSourceSaveBtn').addEventListener('click',()=>saveFinancialSourceText(false));
  document.getElementById('financialSourceAiBtn').addEventListener('click',()=>saveFinancialSourceText(true));
  return el;
}
function openFinancialSourceAssistant(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const modal=ensureFinancialSourceModal();
  const fd=normalizeFinancialData(stock.financialData);
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  document.getElementById('financialSourceStock').textContent=`${stock.name||'—'} · ${stock.code||'无代码'}`;
  document.getElementById('financialSourceMeta').textContent=`报告期 ${fd.reportPeriod||'—'} · 更新 ${fd.lastUpdated||'—'}`;
  document.getElementById('financialSourceText').value=inputs.financialReport;
  document.getElementById('financialSourceLinks').innerHTML=financialSourceLinks(stock).map(x=>`<a class="chip tag" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a>`).join('');
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('financialSourceText').focus(),50);
}
function closeFinancialSourceModal(){
  const modal=document.getElementById('financialSourceModal');
  if(modal)modal.classList.remove('show');
}
function saveFinancialSourceText(openAi=false){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  stock.analysisInputs=normalizeAnalysisInputs({
    ...inputs,
    financialReport:document.getElementById('financialSourceText').value,
    lastUpdated:new Date().toISOString()
  });
  touchDataFreshness(stock,'financialUpdatedAt');
  saveState();
  closeFinancialSourceModal();
  render();
  if(openAi)openAiAssistantTask('financial');
}
function valuationSourceLinks(stock){
  const code=String((stock&&stock.code)||'').trim().toUpperCase();
  const name=String((stock&&stock.name)||'').trim();
  const qBase=[name,code].filter(Boolean).join(' ');
  const symbol=code||name||'stock';
  const google=q=>`https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return [
    {label:'Yahoo Finance Statistics',url:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/key-statistics`},
    {label:'Yahoo Finance Analysis',url:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis`},
    {label:'TradingView Symbol 搜索',url:`https://www.tradingview.com/search/?query=${encodeURIComponent(symbol)}`},
    {label:'公司估值数据搜索',url:google(`${qBase} valuation PE PB PS historical valuation`)}
  ];
}
function ensureValuationSourceModal(){
  let el=document.getElementById('valuationSourceModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='valuationSourceModal';
  el.innerHTML=`<div class="modal"><h2>估值助手</h2><div class="modal-sub">只生成常用估值来源链接并保存估值资料；不联网抓取、不调用 AI。</div><div class="dash" style="grid-template-columns:1fr 1fr;margin-bottom:12px"><div class="card"><div class="card-title">标的</div><div class="card-note" id="valuationSourceStock">—</div></div><div class="card"><div class="card-title">当前估值数据</div><div class="card-note" id="valuationSourceMeta">—</div></div></div><div class="form-row"><label>常用估值来源</label><div id="valuationSourceLinks" class="chips"></div></div><div class="form-row"><label>粘贴估值资料</label><textarea id="valuationSourceText" style="min-height:220px" placeholder="可粘贴 PE/PB/PS、历史估值区间、成长假设、同业比较、券商估值表等原文或摘要。"></textarea></div><div class="modal-actions"><button class="btn ghost" id="valuationSourceCancelBtn" type="button">取消</button><button class="btn ghost" id="valuationSourceSaveBtn" type="button">保存</button><button class="btn" id="valuationSourceAiBtn" type="button">保存并打开 AI助手：估值判断</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='valuationSourceModal')closeValuationSourceModal()});
  document.getElementById('valuationSourceCancelBtn').addEventListener('click',closeValuationSourceModal);
  document.getElementById('valuationSourceSaveBtn').addEventListener('click',()=>saveValuationSourceText(false));
  document.getElementById('valuationSourceAiBtn').addEventListener('click',()=>saveValuationSourceText(true));
  return el;
}
function openValuationSourceAssistant(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const modal=ensureValuationSourceModal();
  const vd=normalizeValuationData(stock.valuationData);
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  document.getElementById('valuationSourceStock').textContent=`${stock.name||'—'} · ${stock.code||'无代码'}`;
  document.getElementById('valuationSourceMeta').textContent=`PE ${fmtMaybe(vd.pe,2)} · PB ${fmtMaybe(vd.pb,2)} · PS ${fmtMaybe(vd.ps,2)} · 更新 ${vd.lastUpdated||'—'}`;
  document.getElementById('valuationSourceText').value=inputs.valuationRawText;
  document.getElementById('valuationSourceLinks').innerHTML=valuationSourceLinks(stock).map(x=>`<a class="chip tag" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a>`).join('');
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('valuationSourceText').focus(),50);
}
function closeValuationSourceModal(){
  const modal=document.getElementById('valuationSourceModal');
  if(modal)modal.classList.remove('show');
}
function saveValuationSourceText(openAi=false){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const inputs=normalizeAnalysisInputs(stock.analysisInputs);
  stock.analysisInputs=normalizeAnalysisInputs({
    ...inputs,
    valuationRawText:document.getElementById('valuationSourceText').value,
    lastUpdated:new Date().toISOString()
  });
  touchDataFreshness(stock,'valuationUpdatedAt');
  saveState();
  closeValuationSourceModal();
  render();
  if(openAi)openAiAssistantTask('valuation');
}
function ensureTechnicalDataModal(){
  let el=document.getElementById('technicalDataModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='technicalDataModal';
  el.innerHTML=`<div class="modal"><h2>编辑技术数据</h2><div class="modal-sub">这些数据只用于本地技术面自动评分，默认不会覆盖九模块技术评分。</div><div class="form-row three"><div><label>MA20</label><input id="tdMa20" type="number" step="any"></div><div><label>MA60</label><input id="tdMa60" type="number" step="any"></div><div><label>MA120</label><input id="tdMa120" type="number" step="any"></div></div><div class="form-row two"><div><label>支撑位</label><input id="tdSupportPrice" type="number" step="any"></div><div><label>压力位</label><input id="tdResistancePrice" type="number" step="any"></div></div><div class="form-row"><label>趋势备注</label><textarea id="tdTrendNote"></textarea></div><div class="modal-actions"><button class="btn ghost" id="technicalCancelBtn" type="button">取消</button><button class="btn" id="technicalSaveBtn" type="button">保存技术数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='technicalDataModal')closeTechnicalDataModal()});
  document.getElementById('technicalCancelBtn').addEventListener('click',closeTechnicalDataModal);
  document.getElementById('technicalSaveBtn').addEventListener('click',saveTechnicalData);
  return el;
}
function openTechnicalDataEditor(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureTechnicalDataModal();
  const td=normalizeTechnicalData(stock.technicalData);
  document.getElementById('tdMa20').value=td.ma20;
  document.getElementById('tdMa60').value=td.ma60;
  document.getElementById('tdMa120').value=td.ma120;
  document.getElementById('tdSupportPrice').value=td.supportPrice;
  document.getElementById('tdResistancePrice').value=td.resistancePrice;
  document.getElementById('tdTrendNote').value=td.trendNote;
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('tdMa20').focus(),50);
}
function closeTechnicalDataModal(){
  const modal=document.getElementById('technicalDataModal');
  if(modal)modal.classList.remove('show');
}
function saveTechnicalData(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const current=normalizeTechnicalData(stock.technicalData);
  stock.technicalData=normalizeTechnicalData({
    ...current,
    ma20:document.getElementById('tdMa20').value,
    ma60:document.getElementById('tdMa60').value,
    ma120:document.getElementById('tdMa120').value,
    supportPrice:document.getElementById('tdSupportPrice').value,
    resistancePrice:document.getElementById('tdResistancePrice').value,
    trendNote:document.getElementById('tdTrendNote').value,
    lastUpdated:new Date().toISOString()
  });
  touchDataFreshness(stock,'technicalUpdatedAt');
  saveState();
  closeTechnicalDataModal();
  render();
}
function ensureTechnicalJsonImportModal(){
  let el=document.getElementById('technicalJsonImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='technicalJsonImportModal';
  el.innerHTML=`<div class="modal"><h2>导入技术面 JSON</h2><div class="modal-sub">仅写入当前股票 technicalData，不覆盖九模块评分、价格刷新结果或操作建议。</div><div class="form-row"><label>粘贴 JSON</label><textarea id="technicalJsonImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"symbol\":\"1810.HK\",\"timeframe\":\"daily\",\"price\":26,\"ma5\":25.8,\"supportLevels\":[25],\"resistanceLevels\":[28],\"technicalSummary\":\"...\"}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="technicalJsonImportCancelBtn" type="button">取消</button><button class="btn" id="technicalJsonImportSaveBtn" type="button">导入技术面数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='technicalJsonImportModal')closeTechnicalJsonImportModal()});
  document.getElementById('technicalJsonImportCancelBtn').addEventListener('click',closeTechnicalJsonImportModal);
  document.getElementById('technicalJsonImportSaveBtn').addEventListener('click',importTechnicalJson);
  return el;
}
function openTechnicalJsonImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureTechnicalJsonImportModal();
  document.getElementById('technicalJsonImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('technicalJsonImportText').focus(),50);
}
function closeTechnicalJsonImportModal(){
  const modal=document.getElementById('technicalJsonImportModal');
  if(modal)modal.classList.remove('show');
}
function importTechnicalJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={technicalData:JSON.parse(JSON.stringify(stock.technicalData||{})),dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('technicalJsonImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    const payload=(parsed&&typeof parsed==='object'&&parsed.technicalData&&typeof parsed.technicalData==='object')?parsed.technicalData:parsed;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('JSON 必须是技术面对象，或顶层包含 technicalData 对象。');
    const merged={...normalizeTechnicalData(stock.technicalData),...payload};
    if(!merged.symbol)merged.symbol=stock.code||stock.symbol||'';
    if(!merged.priceUpdatedAt)merged.priceUpdatedAt=todayDate();
    if(!merged.lastUpdated)merged.lastUpdated=new Date().toISOString();
    stock.technicalData=normalizeTechnicalData(merged);
    touchDataFreshness(stock,'technicalUpdatedAt',stock.technicalData.priceUpdatedAt||todayDate());
    saveState();
    closeTechnicalJsonImportModal();
    render();
    alert('技术面 JSON 已导入。九模块技术评分和操作建议未自动修改。');
  }catch(err){
    stock.technicalData=original.technicalData;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function csvRows(text){
  const rows=[];
  let row=[],cell='',q=false;
  const s=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++){
    const ch=s[i],next=s[i+1];
    if(q){
      if(ch==='"'&&next==='"'){cell+='"';i++}
      else if(ch==='"')q=false;
      else cell+=ch;
    }else if(ch==='"')q=true;
    else if(ch===','){row.push(cell);cell=''}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
    else if(ch==='\r'){}
    else cell+=ch;
  }
  row.push(cell);
  if(row.some(x=>String(x).trim()!==''))rows.push(row);
  return rows.filter(r=>r.some(x=>String(x).trim()!==''));
}
function normalizedHeader(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function pickCsvColumn(headers,names){
  const set=names.map(normalizedHeader);
  return headers.findIndex(h=>set.includes(normalizedHeader(h)));
}
function parsePriceHistoryCsv(text){
  const rows=csvRows(text);
  if(rows.length<2)return {records:[],invalidCount:rows.length,warnings:['CSV 没有可解析的数据行']};
  const headers=rows[0].map(x=>String(x||'').trim());
  let dateIdx=pickCsvColumn(headers,['date','日期']);
  let closeIdx=pickCsvColumn(headers,['close','adj close','price','收盘价','收盘','价格']);
  if(dateIdx<0)dateIdx=0;
  if(closeIdx<0)closeIdx=1;
  const records=[];
  let invalidCount=0;
  rows.slice(1).forEach(r=>{
    const date=normalizePriceDate(r[dateIdx]);
    const close=normalizeClosePrice(r[closeIdx]);
    if(date&&close>0)records.push({date,close});
    else invalidCount++;
  });
  const normalized=normalizePriceHistory(records);
  const duplicateCount=records.length-normalized.length;
  return {records:normalized,invalidCount,duplicateCount,warnings:[]};
}
function ensureHistoryImportInput(){
  let input=document.getElementById('priceHistoryCsvFile');
  if(input)return input;
  input=document.createElement('input');
  input.type='file';
  input.id='priceHistoryCsvFile';
  input.accept='.csv,text/csv';
  input.style.display='none';
  document.body.appendChild(input);
  input.addEventListener('change',handlePriceHistoryCsvImport);
  return input;
}
function importPriceHistoryCsv(){
  if(!state.stocks.find(x=>x.id===detailStockId))return;
  const input=ensureHistoryImportInput();
  input.value='';
  input.click();
}
function handlePriceHistoryCsvImport(e){
  const file=e.target.files&&e.target.files[0];
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!file||!stock)return;
  const reader=new FileReader();
  reader.onload=()=>{
    const parsed=parsePriceHistoryCsv(reader.result);
    stock.priceHistory=normalizePriceHistory(parsed.records);
    const result=updateTechnicalDataFromPriceHistory(stock);
    touchDataFreshness(stock,'technicalUpdatedAt');
    saveState();
    render();
    const warnings=[...(parsed.warnings||[]),...(result.warnings||[])];
    alert(`历史价格导入完成：成功 ${stock.priceHistory.length} 条，过滤 ${parsed.invalidCount||0} 条，重复日期覆盖 ${parsed.duplicateCount||0} 条。${warnings.length?'\n提醒：'+warnings.slice(0,4).join('；'):''}`);
  };
  reader.onerror=()=>alert('CSV 读取失败，请确认文件可访问。');
  reader.readAsText(file,'UTF-8');
}
function updateTechnicalFromHistoryForDetail(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const result=updateTechnicalDataFromPriceHistory(stock);
  touchDataFreshness(stock,'technicalUpdatedAt');
  saveState();
  render();
  alert(`技术数据已从历史价格更新。${result.warnings.length?'\n提醒：'+result.warnings.slice(0,4).join('；'):''}`);
}
function applyTechnicalSignalToAnalysis(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const sig=calculateTechnicalSignal(stock);
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  fw.technical=normalizeAnalysisModule({
    ...fw.technical,
    score:sig.technicalScore,
    status:sig.technicalStatus,
    summary:sig.technicalSummary,
    keyPoints:sig.signals,
    watchItems:sig.warnings
  });
  stock.analysisFramework=fw;
  stock.analysisScore=calculateAnalysisScore(fw);
  saveState();
  render();
}
function ensureValuationDataModal(){
  let el=document.getElementById('valuationDataModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='valuationDataModal';
  el.innerHTML=`<div class="modal"><h2>编辑估值数据</h2><div class="modal-sub">这些数据只用于本地估值自动评分，默认不会覆盖九模块估值评分。</div><div class="form-row three"><div><label>PE</label><input id="vdPe" type="number" step="any"></div><div><label>PB</label><input id="vdPb" type="number" step="any"></div><div><label>PS</label><input id="vdPs" type="number" step="any"></div></div><div class="form-row three"><div><label>股息率%</label><input id="vdDividendYield" type="number" step="any"></div><div><label>收入增速%</label><input id="vdRevenueGrowth" type="number" step="any"></div><div><label>利润增速%</label><input id="vdProfitGrowth" type="number" step="any"></div></div><div class="form-row three"><div><label>历史PE低位</label><input id="vdHistoricalPeLow" type="number" step="any"></div><div><label>历史PE中位</label><input id="vdHistoricalPeMid" type="number" step="any"></div><div><label>历史PE高位</label><input id="vdHistoricalPeHigh" type="number" step="any"></div></div><div class="form-row three"><div><label>历史PB低位</label><input id="vdHistoricalPbLow" type="number" step="any"></div><div><label>历史PB中位</label><input id="vdHistoricalPbMid" type="number" step="any"></div><div><label>历史PB高位</label><input id="vdHistoricalPbHigh" type="number" step="any"></div></div><div class="form-row three"><div><label>历史PS低位</label><input id="vdHistoricalPsLow" type="number" step="any"></div><div><label>历史PS中位</label><input id="vdHistoricalPsMid" type="number" step="any"></div><div><label>历史PS高位</label><input id="vdHistoricalPsHigh" type="number" step="any"></div></div><div class="form-row"><label>估值备注</label><textarea id="vdValuationNote"></textarea></div><div class="modal-actions"><button class="btn ghost" id="valuationCancelBtn" type="button">取消</button><button class="btn" id="valuationSaveBtn" type="button">保存估值数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='valuationDataModal')closeValuationDataModal()});
  document.getElementById('valuationCancelBtn').addEventListener('click',closeValuationDataModal);
  document.getElementById('valuationSaveBtn').addEventListener('click',saveValuationData);
  return el;
}
function valuationInputId(key){return 'vd'+key.charAt(0).toUpperCase()+key.slice(1)}
function openValuationDataEditor(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureValuationDataModal();
  const vd=normalizeValuationData(stock.valuationData);
  VALUATION_FIELDS.forEach(k=>{const el=document.getElementById(valuationInputId(k));if(el)el.value=vd[k]});
  document.getElementById('vdValuationNote').value=vd.valuationNote;
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('vdPe').focus(),50);
}
function closeValuationDataModal(){
  const modal=document.getElementById('valuationDataModal');
  if(modal)modal.classList.remove('show');
}
function saveValuationData(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const payload={};
  VALUATION_FIELDS.forEach(k=>{const el=document.getElementById(valuationInputId(k));payload[k]=el?el.value:0});
  payload.valuationNote=document.getElementById('vdValuationNote').value;
  payload.lastUpdated=new Date().toISOString();
  stock.valuationData=normalizeValuationData(payload);
  touchDataFreshness(stock,'valuationUpdatedAt');
  saveState();
  closeValuationDataModal();
  render();
}
function applyValuationSignalToAnalysis(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const sig=calculateValuationSignal(stock);
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  fw.valuation=normalizeAnalysisModule({
    ...fw.valuation,
    score:sig.valuationScore,
    status:sig.valuationStatus,
    summary:sig.valuationSummary,
    keyPoints:sig.signals,
    watchItems:sig.warnings
  });
  stock.analysisFramework=fw;
  stock.analysisScore=calculateAnalysisScore(fw);
  saveState();
  render();
}
function ensureFinancialDataModal(){
  let el=document.getElementById('financialDataModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='financialDataModal';
  el.innerHTML=`<div class="modal"><h2>编辑财务数据</h2><div class="modal-sub">这些数据只用于本地财务自动评分，默认不会覆盖九模块财务评分。</div><div class="form-row three"><div><label>收入</label><input id="fdRevenue" type="number" step="any"></div><div><label>收入增速%</label><input id="fdRevenueGrowth" type="number" step="any"></div><div><label>净利润</label><input id="fdNetProfit" type="number" step="any"></div></div><div class="form-row three"><div><label>利润增速%</label><input id="fdProfitGrowth" type="number" step="any"></div><div><label>毛利率%</label><input id="fdGrossMargin" type="number" step="any"></div><div><label>净利率%</label><input id="fdNetMargin" type="number" step="any"></div></div><div class="form-row three"><div><label>ROE%</label><input id="fdRoe" type="number" step="any"></div><div><label>经营现金流</label><input id="fdOperatingCashFlow" type="number" step="any"></div><div><label>自由现金流</label><input id="fdFreeCashFlow" type="number" step="any"></div></div><div class="form-row three"><div><label>资产负债率%</label><input id="fdDebtRatio" type="number" step="any"></div><div><label>EPS</label><input id="fdEps" type="number" step="any"></div><div><label>币种</label><input id="fdCurrency" placeholder="CNY / HKD / USD"></div></div><div class="form-row"><label>报告期</label><input id="fdReportPeriod" placeholder="2026Q1 / 2025年报"></div><div class="form-row"><label>财务备注</label><textarea id="fdFinancialNote"></textarea></div><div class="modal-actions"><button class="btn ghost" id="financialCancelBtn" type="button">取消</button><button class="btn" id="financialSaveBtn" type="button">保存财务数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='financialDataModal')closeFinancialDataModal()});
  document.getElementById('financialCancelBtn').addEventListener('click',closeFinancialDataModal);
  document.getElementById('financialSaveBtn').addEventListener('click',saveFinancialData);
  return el;
}
function financialInputId(key){return 'fd'+key.charAt(0).toUpperCase()+key.slice(1)}
function openFinancialDataEditor(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureFinancialDataModal();
  const fd=normalizeFinancialData(stock.financialData);
  FINANCIAL_FIELDS.forEach(k=>{const el=document.getElementById(financialInputId(k));if(el)el.value=fd[k]});
  document.getElementById('fdReportPeriod').value=fd.reportPeriod;
  document.getElementById('fdCurrency').value=fd.currency;
  document.getElementById('fdFinancialNote').value=fd.financialNote;
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('fdRevenue').focus(),50);
}
function closeFinancialDataModal(){
  const modal=document.getElementById('financialDataModal');
  if(modal)modal.classList.remove('show');
}
function saveFinancialData(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const payload={};
  FINANCIAL_FIELDS.forEach(k=>{const el=document.getElementById(financialInputId(k));payload[k]=el?el.value:0});
  payload.reportPeriod=document.getElementById('fdReportPeriod').value;
  payload.currency=document.getElementById('fdCurrency').value;
  payload.financialNote=document.getElementById('fdFinancialNote').value;
  payload.lastUpdated=new Date().toISOString();
  stock.financialData=normalizeFinancialData(payload);
  touchDataFreshness(stock,'financialUpdatedAt');
  saveState();
  closeFinancialDataModal();
  render();
}
function ensureFinancialImportModal(){
  let el=document.getElementById('financialImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='financialImportModal';
  el.innerHTML=`<div class="modal"><h2>导入财务JSON</h2><div class="modal-sub">仅导入 financialData，不覆盖九模块 financials。应用到九模块需另点按钮确认。</div><div class="form-row"><label>粘贴 JSON</label><textarea id="financialImportText" style="min-height:240px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"financialData\":{\"revenue\":0,\"revenueGrowth\":0}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="financialImportCancelBtn" type="button">取消</button><button class="btn" id="financialImportSaveBtn" type="button">导入财务数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='financialImportModal')closeFinancialImportModal()});
  document.getElementById('financialImportCancelBtn').addEventListener('click',closeFinancialImportModal);
  document.getElementById('financialImportSaveBtn').addEventListener('click',importFinancialJson);
  return el;
}
function openFinancialImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureFinancialImportModal();
  document.getElementById('financialImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('financialImportText').focus(),50);
}
function closeFinancialImportModal(){
  const modal=document.getElementById('financialImportModal');
  if(modal)modal.classList.remove('show');
}
function importFinancialJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('financialImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  if(parsed&&typeof parsed==='object'&&parsed.financialReview){alert('导入失败：当前内容是 financialReview。请使用“财务数据提取” Prompt 生成 financialData，或在 AI Review 导入区选择“财报复核”导入。');return}
  if(!parsed||typeof parsed!=='object'||!parsed.financialData||typeof parsed.financialData!=='object'){alert('导入失败：必须包含顶层 financialData 对象。请确认使用的是“财务数据提取” Prompt，而不是“财报复核分析” Prompt。');return}
  stock.financialData=normalizeFinancialData({...parsed.financialData,lastUpdated:parsed.financialData.lastUpdated||new Date().toISOString()});
  touchDataFreshness(stock,'financialUpdatedAt');
  saveState();
  closeFinancialImportModal();
  render();
}
function importFinancialIntegratedJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={
    financialData:JSON.parse(JSON.stringify(stock.financialData||{})),
    aiReviews:JSON.parse(JSON.stringify(stock.aiReviews||{})),
    dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{})),
    analysisFramework:JSON.parse(JSON.stringify(stock.analysisFramework||{})),
    analysisScore:stock.analysisScore
  };
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('financialIntegratedImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    if(!parsed||typeof parsed!=='object')throw new Error('JSON 必须是对象。');
    const hasData=parsed.financialData&&typeof parsed.financialData==='object'&&!Array.isArray(parsed.financialData);
    const hasReview=parsed.financialReview&&typeof parsed.financialReview==='object'&&!Array.isArray(parsed.financialReview);
    if(hasData&&!hasReview)throw new Error('只识别到 financialData。请使用“导入财务JSON”单独导入，或使用“财报一体化解析” Prompt 重新生成同时包含 financialData 和 financialReview 的 JSON。');
    if(!hasData&&hasReview)throw new Error('只识别到 financialReview。请到“AI 复核导入”区域选择“财报复核 financialReview”导入，或使用“财报一体化解析” Prompt 重新生成。');
    if(!hasData||!hasReview)throw new Error('必须同时包含顶层 financialData 和 financialReview。');
    stock.financialData=normalizeFinancialData({...parsed.financialData,lastUpdated:parsed.financialData.lastUpdated||new Date().toISOString()});
    stock.aiReviews=normalizeAiReviews(stock.aiReviews);
    const review=normalizeAiReviewPayload('financialReview',{financialReview:parsed.financialReview});
    if(!review)throw new Error('financialReview 格式不正确。');
    stock.aiReviews.financialReview=review;
    touchDataFreshness(stock,'financialUpdatedAt');
    saveState();
    render();
    alert('财报一体化 JSON 已导入：financialData 与 financialReview 已更新。九模块评分和操作建议未自动修改。');
  }catch(err){
    stock.financialData=original.financialData;
    stock.aiReviews=original.aiReviews;
    stock.dataFreshness=original.dataFreshness;
    stock.analysisFramework=original.analysisFramework;
    stock.analysisScore=original.analysisScore;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function applyFinancialSignalToAnalysis(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const sig=calculateFinancialSignal(stock);
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  fw.financials=normalizeAnalysisModule({
    ...fw.financials,
    score:sig.financialScore,
    status:sig.financialStatus,
    summary:sig.financialSummary,
    keyPoints:sig.signals,
    watchItems:sig.warnings
  });
  stock.analysisFramework=fw;
  stock.analysisScore=calculateAnalysisScore(fw);
  saveState();
  render();
}
function isEmptyAnalysisValue(v){return v===undefined||v===null||String(v).trim()===''}
function mergeAnalysisModule(current,template,overwrite){
  const cur=normalizeAnalysisModule(current);
  const src=normalizeAnalysisModule(template);
  return {
    summary:overwrite||isEmptyAnalysisValue(cur.summary)?src.summary:cur.summary,
    score:overwrite||Number(cur.score)===0?src.score:cur.score,
    status:overwrite||cur.status==='neutral'?src.status:cur.status,
    keyPoints:overwrite||!cur.keyPoints.length?src.keyPoints:cur.keyPoints,
    watchItems:overwrite||!cur.watchItems.length?src.watchItems:cur.watchItems
  };
}
function mergeConclusionModule(current,template,stock,overwrite){
  const cur=normalizeConclusionModule(current,stock);
  const src=normalizeConclusionModule(template,stock);
  return {
    ...mergeAnalysisModule(cur,src,overwrite),
    positionRole:overwrite||isEmptyAnalysisValue(cur.positionRole)?src.positionRole:cur.positionRole,
    actionPlan:overwrite||isEmptyAnalysisValue(cur.actionPlan)?src.actionPlan:cur.actionPlan,
    buyRules:overwrite||!cur.buyRules.length?src.buyRules:cur.buyRules,
    sellRules:overwrite||!cur.sellRules.length?src.sellRules:cur.sellRules,
    invalidationConditions:overwrite||!cur.invalidationConditions.length?src.invalidationConditions:cur.invalidationConditions
  };
}
function mergeAnalysisInputs(current,template,overwrite){
  const cur=normalizeAnalysisInputs(current);
  const src=normalizeAnalysisInputs(template);
  return {
    financialReport:overwrite||isEmptyAnalysisValue(cur.financialReport)?src.financialReport:cur.financialReport,
    news:overwrite||isEmptyAnalysisValue(cur.news)?src.news:cur.news,
    technicalObservation:overwrite||isEmptyAnalysisValue(cur.technicalObservation)?src.technicalObservation:cur.technicalObservation,
    capitalFlowObservation:overwrite||isEmptyAnalysisValue(cur.capitalFlowObservation)?src.capitalFlowObservation:cur.capitalFlowObservation,
    personalView:overwrite||isEmptyAnalysisValue(cur.personalView)?src.personalView:cur.personalView,
    valuationRawText:overwrite||isEmptyAnalysisValue(cur.valuationRawText)?src.valuationRawText:cur.valuationRawText,
    lastUpdated:new Date().toISOString()
  };
}
function applyAnalysisTemplate(stock,templateKey,overwrite=false){
  const tpl=ANALYSIS_TEMPLATES[templateKey];
  if(!stock||!tpl)return false;
  normalizeStockAnalysis(stock);
  const current=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const source=normalizeAnalysisFramework(tpl.analysisFramework,stock);
  const hadConclusionContent=Boolean(current.conclusion.summary||current.conclusion.actionPlan||current.conclusion.score||current.conclusion.buyRules.length||current.conclusion.sellRules.length||current.conclusion.invalidationConditions.length);
  const next={};
  ANALYSIS_MODULES.forEach(key=>{
    next[key]=key==='conclusion'?mergeConclusionModule(current[key],source[key],stock,overwrite):mergeAnalysisModule(current[key],source[key],overwrite);
  });
  next.risks.keyPoints=overwrite||!next.risks.keyPoints.length?normalizeStringArray(tpl.risks):next.risks.keyPoints;
  ANALYSIS_MODULES.forEach(key=>{
    if(overwrite||!next[key].watchItems.length)next[key].watchItems=normalizeStringArray(tpl.watchItems);
  });
  if(overwrite||isEmptyAnalysisValue(next.conclusion.positionRole)||!hadConclusionContent)next.conclusion.positionRole=tpl.positionRole||next.conclusion.positionRole;
  stock.analysisFramework=normalizeAnalysisFramework(next,stock);
  stock.analysisInputs=mergeAnalysisInputs(stock.analysisInputs,tpl.analysisInputs,overwrite);
  stock.analysisScore=calculateAnalysisScore(stock.analysisFramework);
  return true;
}
function ensureAnalysisTemplateModal(){
  let el=document.getElementById('analysisTemplateModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='analysisTemplateModal';
  const options=Object.keys(ANALYSIS_TEMPLATES).map(k=>`<option value="${k}">${esc(ANALYSIS_TEMPLATES[k].label)}</option>`).join('');
  el.innerHTML=`<div class="modal"><h2>套用分析模板</h2><div class="modal-sub">默认只填充空字段，不覆盖已有分析内容。</div><div class="form-row"><label>模板类型</label><select id="analysisTemplateType">${options}</select></div><div class="form-row"><label>套用方式</label><select id="analysisTemplateMode"><option value="fill">仅填充空字段</option><option value="overwrite">覆盖当前分析内容</option></select></div><div class="modal-actions"><button class="btn ghost" id="analysisTemplateCancelBtn" type="button">取消</button><button class="btn" id="analysisTemplateApplyBtn" type="button">套用模板</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='analysisTemplateModal')closeAnalysisTemplateModal()});
  document.getElementById('analysisTemplateCancelBtn').addEventListener('click',closeAnalysisTemplateModal);
  document.getElementById('analysisTemplateApplyBtn').addEventListener('click',saveAnalysisTemplateApply);
  return el;
}
function openAnalysisTemplateModal(){
  if(!state.stocks.find(x=>x.id===detailStockId))return;
  ensureAnalysisTemplateModal().classList.add('show');
}
function closeAnalysisTemplateModal(){
  const modal=document.getElementById('analysisTemplateModal');
  if(modal)modal.classList.remove('show');
}
function saveAnalysisTemplateApply(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  const templateKey=document.getElementById('analysisTemplateType').value;
  const overwrite=document.getElementById('analysisTemplateMode').value==='overwrite';
  if(!applyAnalysisTemplate(stock,templateKey,overwrite))return alert('套用失败：模板不存在或标的无效。');
  saveState();
  closeAnalysisTemplateModal();
  render();
}
function ensureStrategyModal(){
  let el=document.getElementById('strategyModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='strategyModal';
  const styles=INVESTMENT_STYLES.map(x=>`<option value="${x}">${x}</option>`).join('');
  const aggs=BUY_AGGRESSIVENESS.map(x=>`<option value="${x}">${x}</option>`).join('');
  el.innerHTML=`<div class="modal"><h2>编辑策略</h2><div class="modal-sub">策略只用于本地决策计算，不会改变持仓或交易记录。</div><div class="form-row three"><div><label>目标仓位%</label><input id="stTargetWeight" type="number" step="any"></div><div><label>最大仓位%</label><input id="stMaxWeight" type="number" step="any"></div><div><label>最低保留%</label><input id="stMinWeight" type="number" step="any"></div></div><div class="form-row three"><div><label>资金优先级 1-10</label><input id="stPriority" type="number" step="1"></div><div><label>投资风格</label><select id="stInvestmentStyle">${styles}</select></div><div><label>信心等级 0-10</label><input id="stConvictionLevel" type="number" step="any"></div></div><div class="form-row three"><div><label>目标股数</label><input id="stTargetShares" type="number" step="1"></div><div><label>最小交易单位</label><input id="stMinTradeUnit" type="number" step="1"></div><div><label>买入积极度</label><select id="stBuyAggressiveness">${aggs}</select></div></div><div class="form-row two"><div><label>单次偏好买入金额</label><input id="stPreferredBuyAmount" type="number" step="any"></div><div><label>单次最大买入金额</label><input id="stMaxSingleBuyAmount" type="number" step="any"></div></div><div class="form-row"><label><input id="stCapitalAllocationEnabled" type="checkbox" style="width:auto;margin-right:6px">参与资金分配</label></div><div class="form-row"><label>策略备注</label><textarea id="stNotes"></textarea></div><div class="modal-actions"><button class="btn ghost" id="strategyCancelBtn" type="button">取消</button><button class="btn" id="strategySaveBtn" type="button">保存策略</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='strategyModal')closeStrategyModal()});
  document.getElementById('strategyCancelBtn').addEventListener('click',closeStrategyModal);
  document.getElementById('strategySaveBtn').addEventListener('click',saveStrategy);
  return el;
}
function openStrategyEditor(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureStrategyModal();
  const st=normalizeStrategy(stock.strategy,stock);
  document.getElementById('stTargetWeight').value=st.targetWeight;
  document.getElementById('stMaxWeight').value=st.maxWeight;
  document.getElementById('stMinWeight').value=st.minWeight;
  document.getElementById('stPriority').value=st.priority;
  document.getElementById('stInvestmentStyle').value=st.investmentStyle;
  document.getElementById('stConvictionLevel').value=st.convictionLevel;
  document.getElementById('stTargetShares').value=st.targetShares;
  document.getElementById('stMinTradeUnit').value=st.minTradeUnit;
  document.getElementById('stPreferredBuyAmount').value=st.preferredBuyAmount;
  document.getElementById('stMaxSingleBuyAmount').value=st.maxSingleBuyAmount;
  document.getElementById('stBuyAggressiveness').value=st.buyAggressiveness;
  document.getElementById('stCapitalAllocationEnabled').checked=st.capitalAllocationEnabled;
  document.getElementById('stNotes').value=st.notes;
  modal.classList.add('show');
}
function closeStrategyModal(){const modal=document.getElementById('strategyModal');if(modal)modal.classList.remove('show')}
function saveStrategy(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  stock.strategy=normalizeStrategy({
    targetWeight:document.getElementById('stTargetWeight').value,
    maxWeight:document.getElementById('stMaxWeight').value,
    minWeight:document.getElementById('stMinWeight').value,
    priority:document.getElementById('stPriority').value,
    investmentStyle:document.getElementById('stInvestmentStyle').value,
    convictionLevel:document.getElementById('stConvictionLevel').value,
    targetShares:document.getElementById('stTargetShares').value,
    minTradeUnit:document.getElementById('stMinTradeUnit').value,
    preferredBuyAmount:document.getElementById('stPreferredBuyAmount').value,
    maxSingleBuyAmount:document.getElementById('stMaxSingleBuyAmount').value,
    buyAggressiveness:document.getElementById('stBuyAggressiveness').value,
    capitalAllocationEnabled:document.getElementById('stCapitalAllocationEnabled').checked,
    notes:document.getElementById('stNotes').value
  },stock);
  saveState();
  closeStrategyModal();
  render();
}
function renderStockDetail(){
  const s=state.stocks.find(x=>x.id===detailStockId);
  if(!s){detailStockId=null;render();return}
  normalizeStockAnalysis(s);
  const total=getEstimatedTotalAssets();
  const info=getPositionInfo(s,total);
  const cp=getComparablePrice(s);
  const mv=getMarketValue(s);
  const actual=info&&info.actualPct!==null?info.actualPct:null;
  const deviation=info&&info.deviation!==null?`${info.deviation>=0?'+':''}${info.deviation.toFixed(1)}%`:'—';
  document.getElementById('summary').innerHTML=`标的详情 · <strong>${esc(s.name)}</strong> · ${esc(s.role||'—')} · ${esc(s.theme||'—')}`;
  document.getElementById('main').innerHTML=`<div class="toolbar"><button class="btn ghost small" id="backToListBtn">返回列表</button><div class="actions"><button class="btn small" data-detail-action="ai-assistant">AI助手</button><button class="btn ghost small" data-detail-action="financial-source">财报助手</button><button class="btn ghost small" data-detail-action="valuation-source">估值助手</button><button class="btn ghost small" data-detail-action="template">套用分析模板</button><button class="btn ghost small" data-detail-action="ai-prompt">生成分析提示词</button><button class="btn ghost small" data-detail-action="ai-import">导入AI分析JSON</button><button class="btn ghost small" data-detail-action="ai-strategy-import">导入AI策略JSON</button><button class="btn ghost small" data-detail-action="refresh">${s.type==='etf'?'刷新市值':'刷新价格'}</button><button class="btn ghost small" data-detail-action="edit">编辑</button></div></div><div class="dash"><div class="card"><div class="card-title">持仓</div><div class="card-num">${fmtInt(s.shares)}</div><div class="card-note">市值 ${fmtMoney(mv)}</div></div><div class="card"><div class="card-title">成本 / 当前价</div><div class="card-num">${fmtMaybe(s.avgCost)} / ${s.type==='etf'?fmtMaybe(s.currentValue,0):fmtMaybe(s.currentPrice)}</div><div class="card-note">${currentDisplay(s)}</div></div><div class="card"><div class="card-title">目标 / 实际仓位</div><div class="card-num">${fmtMaybe(s.targetPct,1)}% / ${actual===null?'—':actual.toFixed(1)+'%'}</div><div class="card-note">偏差 ${deviation}</div></div><div class="card"><div class="card-title">纪律状态 / 分析评分</div><div class="card-num">${info?info.status:'—'}</div><div class="card-note">分析评分 ${fmtMaybe(s.analysisScore,1)}/10 · 削减线 ${fmtMaybe(s.trimPct,1)}% · 冻结线 ${fmtMaybe(s.capPct,1)}%</div></div></div>${decisionPanel(s)}${freshnessPanel(s)}${dataFreshnessPanel(s)}${collectionPanel(s)}${technicalAnalysisFlowPanel()}${financialAnalysisFlowPanel()}${unifiedPromptPanel(s)}${comprehensivePackagePanel(s)}${aiReviewImportPanel(s)}${aiReviewSummaryPanel(s)}${technicalAnalysisPanel(s)}${technicalSignalPanel(s)}${valuationSignalPanel(s)}${financialSignalPanel(s)}<div class="dash"><div class="card" style="grid-column:span 2"><div class="card-title">纪律规则</div><div class="text" style="max-width:none"><b>持有逻辑：</b>${esc(s.thesis||s.notes||'—')}<br><br><b>卖出/降仓：</b>${esc(s.sellRule||'—')}<br><br><b>加仓规则：</b>${esc(s.buyRule||'—')}</div></div><div class="card" style="grid-column:span 2"><div class="card-title">社媒舆情</div>${stockSocialSummary(s)}</div></div>${analysisInputsPanel(s)}${analysisFrameworkPanel(s)}<div class="dash"><div class="card" style="grid-column:span 2"><div class="card-title">加仓计划</div>${planListHtml(s.plans,'buy',cp)}</div><div class="card" style="grid-column:span 2"><div class="card-title">减仓计划</div>${planListHtml(s.plans,'sell',cp)}</div></div><div class="card"><div class="card-title">操作记录</div>${stockExecutionRows(s.name)}</div>`;
  document.getElementById('backToListBtn').addEventListener('click',closeStockDetail);
  document.querySelectorAll('[data-detail-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.detailAction==='refresh')refreshOnePrice(s.id);if(b.dataset.detailAction==='edit')openModal(s.id);if(b.dataset.detailAction==='ai-assistant')openAiAssistant();if(b.dataset.detailAction==='financial-source')openFinancialSourceAssistant();if(b.dataset.detailAction==='valuation-source')openValuationSourceAssistant();if(b.dataset.detailAction==='ai-prompt')openAiAnalysisPrompt();if(b.dataset.detailAction==='ai-import')openAiAnalysisImport();if(b.dataset.detailAction==='ai-strategy-import')openAiAssistantTask('strategy');if(b.dataset.detailAction==='edit-inputs')openAnalysisInputsEditor();if(b.dataset.detailAction==='template')openAnalysisTemplateModal();if(b.dataset.detailAction==='edit-strategy')openStrategyEditor();if(b.dataset.detailAction==='copy-technical-prompt')copyTechnicalAnalysisPrompt();if(b.dataset.detailAction==='import-technical-json')openTechnicalJsonImportModal();if(b.dataset.detailAction==='edit-technical')openTechnicalDataEditor();if(b.dataset.detailAction==='import-history')importPriceHistoryCsv();if(b.dataset.detailAction==='update-technical-history')updateTechnicalFromHistoryForDetail();if(b.dataset.detailAction==='apply-technical')applyTechnicalSignalToAnalysis();if(b.dataset.detailAction==='edit-valuation')openValuationDataEditor();if(b.dataset.detailAction==='apply-valuation')applyValuationSignalToAnalysis();if(b.dataset.detailAction==='edit-financial')openFinancialDataEditor();if(b.dataset.detailAction==='import-financial')openFinancialImportModal();if(b.dataset.detailAction==='apply-financial')applyFinancialSignalToAnalysis()}));
  document.querySelectorAll('[data-collection-action="save"]').forEach(b=>b.addEventListener('click',saveCollectionInputs));
  document.querySelectorAll('[data-collection-prompt]').forEach(b=>b.addEventListener('click',()=>copyCollectionPrompt(b.dataset.collectionPrompt)));
  const copyFinancialIntegratedFromCollection=document.getElementById('copyFinancialIntegratedPromptFromCollectionBtn');
  if(copyFinancialIntegratedFromCollection)copyFinancialIntegratedFromCollection.addEventListener('click',copyFinancialIntegratedPrompt);
  const copyTechnicalScreenshotPromptBtn=document.getElementById('copyTechnicalScreenshotPromptBtn');
  if(copyTechnicalScreenshotPromptBtn)copyTechnicalScreenshotPromptBtn.addEventListener('click',copyTechnicalScreenshotPrompt);
  const copyFinancialTemplateBtn=document.getElementById('copyFinancialReportTemplateBtn');
  if(copyFinancialTemplateBtn)copyFinancialTemplateBtn.addEventListener('click',copyFinancialReportTemplate);
  const copyFinancialFlowBtn=document.getElementById('copyFinancialFlowBtn');
  if(copyFinancialFlowBtn)copyFinancialFlowBtn.addEventListener('click',copyFinancialAnalysisFlow);
  const copyFinancialIntegratedBtn=document.getElementById('copyFinancialIntegratedPromptBtn');
  if(copyFinancialIntegratedBtn)copyFinancialIntegratedBtn.addEventListener('click',copyFinancialIntegratedPrompt);
  const focusFinancialIntegratedBtn=document.getElementById('focusFinancialIntegratedImportBtn');
  if(focusFinancialIntegratedBtn)focusFinancialIntegratedBtn.addEventListener('click',focusFinancialIntegratedImport);
  const importFinancialIntegratedBtn=document.getElementById('importFinancialIntegratedBtn');
  if(importFinancialIntegratedBtn)importFinancialIntegratedBtn.addEventListener('click',importFinancialIntegratedJson);
  const genPrompt=document.getElementById('generateUnifiedPromptBtn');
  if(genPrompt)genPrompt.addEventListener('click',generateUnifiedPrompt);
  const copyPromptBtn=document.getElementById('copyUnifiedPromptBtn');
  if(copyPromptBtn)copyPromptBtn.addEventListener('click',copyUnifiedPrompt);
  const clearPromptBtn=document.getElementById('clearUnifiedPromptBtn');
  if(clearPromptBtn)clearPromptBtn.addEventListener('click',clearUnifiedPrompt);
  const genPackage=document.getElementById('generateReviewPackageBtn');
  if(genPackage)genPackage.addEventListener('click',generateReviewPackage);
  const copyPackage=document.getElementById('copyReviewPackageBtn');
  if(copyPackage)copyPackage.addEventListener('click',copyReviewPackage);
  const clearPackage=document.getElementById('clearReviewPackageBtn');
  if(clearPackage)clearPackage.addEventListener('click',clearReviewPackage);
  const packagePreview=document.getElementById('reviewPackagePreview');
  if(packagePreview)packagePreview.addEventListener('input',updateReviewPackageCount);
  const aiReviewType=document.getElementById('aiReviewType');
  if(aiReviewType){aiReviewType.addEventListener('change',refreshAiReviewImportBox);refreshAiReviewImportBox()}
  const importReview=document.getElementById('importAiReviewBtn');
  if(importReview)importReview.addEventListener('click',importAiReview);
  const clearReview=document.getElementById('clearAiReviewBtn');
  if(clearReview)clearReview.addEventListener('click',()=>clearAiReview());
  const copyReview=document.getElementById('copyAiReviewBtn');
  if(copyReview)copyReview.addEventListener('click',copyCurrentAiReview);
  const copyAll=document.getElementById('copyAllAiReviewsBtn');
  if(copyAll)copyAll.addEventListener('click',copyAllAiReviews);
  const clearAll=document.getElementById('clearAllAiReviewsBtn');
  if(clearAll)clearAll.addEventListener('click',clearAllAiReviews);
  document.querySelectorAll('[data-analysis-edit]').forEach(b=>b.addEventListener('click',()=>openAnalysisEditor(b.dataset.analysisEdit)));
}


