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
let editCenterTypeFilter='';
let editCenterSearch='';
let editModalReturnTab='';
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
const ZH_ENUM_MAP={
  uptrend:'上升趋势',downtrend:'下降趋势',sideways:'震荡整理',rebound:'反弹修复',breakdown:'破位下行',reversal:'反转观察',unknown:'未知',
  low_base:'低位筑底',early_uptrend:'初期上升',mid_uptrend:'中段趋势',high_level_rebreakout:'高位二次上攻',high_level_overextension:'高位过热',distribution_risk:'派发风险',unclear:'待判断',
  observe:'观察',wait:'等待',hold:'持有',review:'复核',add_watch:'加仓观察',add_triggered:'加仓触发',reduce_watch:'减仓观察',reduce_triggered:'减仓触发',breakthrough_watch:'突破观察',rebound_watch:'反弹观察',conditional_wait:'条件等待',conditional_add:'条件加仓',conditional_reduce:'条件减仓',
  macd_bearish_crossover:'MACD死叉风险',macd_bullish_crossover:'MACD金叉修复',momentum_weakening:'动能减弱',momentum_weaking:'动能减弱',near_short_term_resistance:'接近短期压力位',main_fund_outflow:'主力资金流出',price_below_ma20:'跌破MA20',price_below_ma60:'跌破MA60',support_breakdown:'跌破关键支撑',high_volatility:'高位波动加大',valuation_expensive:'估值偏贵',insufficient_data:'数据不足',
  growth:'成长仓',core:'核心仓',watchOnly:'观察仓',core_resource_holding:'核心资源仓',defensive:'防御仓',satellite:'卫星仓',value:'价值仓',cyclical:'周期仓',resource:'资源仓',dividend:'高股息仓',etf:'ETF配置',
  suitable:'适合配置',conditional:'有条件适合',unsuitable:'不适合配置',watch:'观察为主',
  raise:'上调',maintain:'维持',lower:'下调',reduce:'降低',
  low:'低',medium:'中',high:'高',
  technicalDecision:'技术面辅助决策',technicalData:'技术面数据',allocationDecision:'配置决策',financialReview:'财报复核',valuationReview:'估值复核',manual:'手动',strategy:'策略',plan:'计划',
  positive:'偏正面',neutral:'中性',negative:'偏负面',keep:'保留',suspend:'暂停',active:'生效',inactive:'未生效',
  strongBuy:'强烈买入',buy:'买入',sell:'卖出',
  buyNow:'立即执行观察',reduceRisk:'控制风险',noData:'缺少数据',
  fresh:'新鲜',stale:'偏旧',veryStale:'过期'
};
function zhEnum(value){
  if(value===null||value===undefined)return '';
  const raw=String(value).trim();
  if(!raw)return '';
  const key=raw.replace(/\s+/g,'_');
  if(ZH_ENUM_MAP[raw])return ZH_ENUM_MAP[raw];
  if(ZH_ENUM_MAP[key])return ZH_ENUM_MAP[key];
  return raw;
}
function zhTrendStatus(value){return zhEnum(value)}
function zhDecision(value){return zhEnum(value)}
function zhRiskFlag(value){return zhEnum(value)}
function zhStrategyRole(value){return zhEnum(value)}
function zhCapitalView(value){return zhEnum(value)}
function zhTargetAdjustment(value){return zhEnum(value)}
function zhConfidence(value){return zhEnum(value)}
function zhSource(value){return zhEnum(value)}
function zhActionStatus(value){return zhEnum(value)}
function isLikelyEnglishSentence(value){
  const s=String(value||'').trim();
  return /[A-Za-z]{3,}/.test(s)&&!/[一-龥]/.test(s)&&/\s/.test(s);
}
function englishTextHint(value){
  return isLikelyEnglishSentence(value)?'<div class="alert" style="margin-top:6px">该内容为英文原文，建议重新生成中文 JSON。</div>':'';
}
function formatChineseText(value){
  if(value===null||value===undefined)return '';
  if(Array.isArray(value))return value.map(formatChineseText).filter(Boolean).join('、');
  const raw=String(value).trim();
  if(!raw)return '';
  if(raw.includes('_')&&!/\s/.test(raw))return zhEnum(raw);
  return zhEnum(raw);
}
function zhList(values){
  return normalizeStringArray(values).map(formatChineseText).filter(Boolean);
}
function zhBreakList(values,limit=3){
  const arr=Array.isArray(values)?values:[];
  return arr.slice(0,limit).map(x=>`${esc(formatChineseText(x))}${englishTextHint(x)}`).join('<br>')||'—';
}
function chineseOutputPromptRule(){
  return '请使用中文输出所有 summary、actionHint、riskFlags、notes、结论、理由、风险和提示字段；枚举字段可以继续使用英文固定值。';
}
function valuationCompleteness(input){
  const vd=normalizeValuationData(input||{});
  const presentNumber=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number(v)>0;
  const checks=[
    {key:'marketCap',label:'市值',weight:12,present:presentNumber(vd.marketCap)},
    {key:'peTtm',label:'PE TTM',weight:12,present:presentNumber(vd.peTtm)||presentNumber(vd.pe)},
    {key:'pb',label:'PB',weight:12,present:presentNumber(vd.pb)},
    {key:'dividendYield',label:'股息率',weight:12,present:vd.dividendYield!==null&&vd.dividendYield!==undefined&&String(vd.dividendYield).trim()!==''&&Number(vd.dividendYield)>=0},
    {key:'valuationConclusion',label:'估值结论',weight:12,present:Boolean(String(vd.valuationConclusion||'').trim())},
    {key:'forwardPe',label:'Forward PE',weight:8,present:presentNumber(vd.forwardPe)},
    {key:'ps',label:'PS',weight:8,present:presentNumber(vd.ps)},
    {key:'evEbitda',label:'EV/EBITDA',weight:8,present:presentNumber(vd.evEbitda)},
    {key:'historicalPercentile',label:'历史估值分位',weight:8,present:vd.historicalPercentile!==null&&vd.historicalPercentile!==undefined&&String(vd.historicalPercentile).trim()!==''},
    {key:'peerComparison',label:'同行业对比',weight:8,present:Boolean(String(vd.peerComparison||'').trim())}
  ];
  const completedFields=checks.filter(x=>x.present).map(x=>x.label);
  const missingFields=checks.filter(x=>!x.present).map(x=>x.label);
  const score=checks.reduce((sum,x)=>sum+(x.present?x.weight:0),0);
  const requiredMissing=checks.slice(0,5).some(x=>!x.present);
  const level=score<=20?'missing':((score<=70||requiredMissing)?'partial':'complete');
  const levelText=level==='missing'?'缺失':(level==='partial'?'部分完整':'较完整');
  const message=level==='missing'
    ?'估值数据缺失，配置决策置信度需下调。'
    :level==='partial'
      ?'估值数据部分完整，配置结论可参考，但置信度受缺失字段影响。'
      :'估值数据较完整，可支持配置决策。';
  return {
    level,
    status:level,
    completedFields,
    missingFields,
    existing:completedFields,
    missing:missingFields,
    score,
    message,
    summary:`估值数据${levelText} ${score}%${completedFields.length?`，已有字段：${completedFields.join('、')}`:''}${missingFields.length?`；缺失字段：${missingFields.join('、')}`:''}`
  };
}
const getValuationCompleteness=valuationCompleteness;
function getSentimentImportance(stock){
  const strategy=normalizeStrategy(stock.strategy,stock);
  const ad=normalizeAllocationDecision(stock.allocationDecision,stock);
  const haystack=[
    stock.theme,
    stock.role,
    strategy.investmentStyle,
    ad.recommendedRole,
    stock.type,
    stock.name,
    stock.code
  ].map(x=>String(x||'')).join(' ').toLowerCase();
  const text=[stock.theme,stock.role,ad.recommendedRole,stock.name].map(x=>String(x||'')).join(' ');
  const highWords=['AI科技','光模块','算力','半导体','机器人','创新药','港股成长','小盘成长','成长仓','卫星仓','观察仓'];
  const mediumWords=['消费','新能源','有色','行业ETF','主题ETF','行业','主题'];
  const lowWords=['宽基ETF','黄金ETF','资源核心仓','防御仓','现金','货币','核心资源仓'];
  if(lowWords.some(w=>text.includes(w))||/gold|cash|defensive|resource/.test(haystack)&&!/growth|satellite/.test(haystack))return 'low';
  if(highWords.some(w=>text.includes(w))||/growth|satellite|watchonly|ai|semiconductor|robot/.test(haystack))return 'high';
  if(stock.type==='etf')return mediumWords.some(w=>text.includes(w))?'medium':'low';
  if(mediumWords.some(w=>text.includes(w))||/cyclical|value/.test(haystack))return 'medium';
  return 'medium';
}
function sentimentImportanceText(value){
  return value==='high'?'高':value==='low'?'低':'中';
}
function hasSentimentReviewData(review){
  const r=normalizeSentimentReview(review||{});
  return Boolean(r.conclusion||r.newsSummary||r.marketMood||r.institutionalView||r.fundFlowView||r.sectorHeat||r.actionHint||r.positivePoints.length||r.negativePoints.length||r.riskFlags.length);
}
function sentimentMissingHint(importance){
  if(importance==='high')return '情绪/新闻资料缺失，对该类成长或主题标的影响较大，配置结论置信度需下调。';
  if(importance==='low')return '情绪/新闻资料未补充，影响有限，主要参考宏观、基本面、估值和技术面。';
  return '情绪/新闻资料未补充，短期市场反馈判断受限。';
}
function sentimentReviewContext(stock){
  const review=normalizeSentimentReview(stock.sentimentReview,stock);
  const importance=getSentimentImportance(stock);
  return {
    importance,
    hasReview:hasSentimentReviewData(review),
    missingHint:hasSentimentReviewData(review)?'':sentimentMissingHint(importance),
    review
  };
}
function fundamentalAnalysis(stock){
  const fd=normalizeFinancialData(stock.financialData);
  const finSig=calculateFinancialSignal(stock);
  const vd=normalizeValuationData(stock.valuationData);
  const vr=normalizeValuationReview(stock.valuationReview);
  const valSig=calculateValuationSignal(stock);
  const finReview=normalizeAiReviews(stock.aiReviews).financialReview||null;
  const hasFin=hasFinancialData(fd);
  const hasVal=hasValuationData(vd)||hasValuationReview(vr);
  let score=0;
  const missing=[];
  if(hasFin&&hasVal)score=(Number(finSig.financialScore)||0)*0.55+(Number(valSig.valuationScore)||0)*0.45;
  else if(hasFin){score=Number(finSig.financialScore)||0;missing.push('估值资料缺失')}
  else if(hasVal){score=Number(valSig.valuationScore)||0;missing.push('财报资料缺失')}
  else missing.push('财报资料缺失','估值资料缺失');
  const conclusion=!hasFin&&!hasVal?'资料不足':(score>=8?'基本面优秀':score>=6.5?'基本面良好':score>=5?'基本面一般':'基本面偏弱');
  const financialSummary=finReview&&finReview.summary?finReview.summary:finSig.financialSummary;
  const valuationSummary=vr.summary||vd.valuationConclusion||valSig.valuationSummary;
  const scoreSource=`财务 ${Number(finSig.financialScore||0).toFixed(1)}，估值 ${Number(valSig.valuationScore||0).toFixed(1)}，基本面 ${Number(score||0).toFixed(1)}`;
  const finalSummary=hasFin||hasVal?`${conclusion}。评分来源：${scoreSource}。财务质量：${financialSummary||'暂无财务摘要'}；估值水平：${valuationSummary||'暂无估值摘要'}。`:'财报和估值资料不足，暂无法形成可靠基本面判断。';
  return {
    score:Math.max(0,Math.min(10,Number(score)||0)),
    conclusion,
    financialScore:finSig.financialScore,
    valuationScore:valSig.valuationScore,
    financialStatus:finSig.financialStatus,
    valuationStatus:valSig.valuationStatus,
    financialSummary,
    valuationSummary,
    missing,
    finalSummary,
    hasFinancial:hasFin,
    hasValuation:hasVal,
    financialData:fd,
    valuationData:vd,
    financialReview:finReview,
    valuationReview:vr
  };
}
function fundamentalSummaryForPrompt(stock){
  const f=fundamentalAnalysis(stock);
  return {
    score:Number(f.score.toFixed(1)),
    conclusion:f.conclusion,
    missing:f.missing,
    summary:f.finalSummary,
    financial:{score:f.financialScore,status:f.financialStatus,summary:f.financialSummary,data:f.financialData,review:f.financialReview},
    valuation:{score:f.valuationScore,status:f.valuationStatus,summary:f.valuationSummary,data:f.valuationData,review:f.valuationReview,completeness:valuationCompleteness(f.valuationData)}
  };
}
function etfAnalysisSummary(stock){
  const a=normalizeEtfAnalysis(stock.etfAnalysis,stock);
  const has=Boolean(a.conclusion||a.indexName||a.indexValuationLevel||a.industryTrend||a.macroView||a.keyPoints.length||a.riskFlags.length||a.actionHint||a.score!==null);
  return {
    ...a,
    hasData:has,
    score:a.score,
    conclusion:a.conclusion||'暂无指数/行业分析',
    summary:has?`${a.conclusion||'暂无综合结论'}。指数估值：${a.indexValuationLevel||'暂无'}；行业景气：${a.industryTrend||'暂无'}；宏观环境：${a.macroView||'暂无'}。`:'尚未导入 ETF 指数/行业分析。'
  };
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
  return [`请作为投资研究助理，对以下资料做${title}。`,'要求：','1. 只输出严格 JSON，不要输出 Markdown。','2. 同时在 summary/mainConclusion 等字段里给出可读结论。','3. 不构成买卖指令，仅作复核辅助。',`4. ${chineseOutputPromptRule()}`,'','当前上下文：',JSON.stringify(ctx,null,2),'','请按以下 JSON 结构输出：',JSON.stringify(collectionPromptSchema(kind),null,2)].join('\n');
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
  return [`请根据我上传的 K 线图或技术图截图，整理 ${name}（${code}）的技术面摘要。`,'','要求：','1. 只根据截图内容判断，不要使用外部资料。','2. 如果截图中看不清某项信息，请写“无法判断”。','3. 不要给确定性买卖指令，只做技术面辅助分析。',`4. ${chineseOutputPromptRule()}`,'5. 请按以下格式输出，方便我粘贴进投资分析程序的“技术形态资料”：','','股票名称：','股票代码：','截图周期：','当前价格：','当前趋势：','MA20 / MA60 / MA120 相对位置：','成交量变化：','近期支撑位：','近期压力位：','是否放量：','是否跌破关键均线：','风险信号：','短期操作倾向：','需要继续观察的信号：','备注：'].join('\n');
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
  technicalReview:{label:'技术复核',freshnessKey:'technicalUpdatedAt',defaults:{summary:'',trend:'sideways',cyclePosition:'unclear',cycleSummary:'',pricePosition:{lookbackDays:null,high:null,low:null,currentPercentile:null,distanceToCycleHighPct:null,distanceToCycleLowPct:null},supportLevels:[],resistanceLevels:[],supportZones:[],volumeSignal:'',riskSignal:'',holdHint:'',addHint:'',reduceHint:'',operationSuggestion:'',confidence:'medium'}},
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
function normalizeJsonLikeText(text){
  return String(text||'')
    .replace(/[\u201C\u201D\u201E\u201F]/g,'"')
    .replace(/[\u2018\u2019\u201A\u201B]/g,"'")
    .replace(/\u00A0/g,' ')
    .replace(/，(?=\s*[\}\]])/g,',')
    .replace(/,\s*([\}\]])/g,'$1');
}
function extractFirstJsonObject(text){
  const s=normalizeJsonLikeText(stripJsonFence(text));
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
  return `<ul style="margin:6px 0 0;padding-left:18px">${arr.slice(0,4).map(x=>`<li>${esc(formatChineseText(x))}${englishTextHint(x)}</li>`).join('')}</ul>`;
}
function reviewCoreTag(type,review){
  if(!review)return '';
  if(type==='technicalReview')return zhTrendStatus(review.trend)||formatChineseText(review.trend)||'';
  if(type==='comprehensiveReview')return zhDecision(review.actionBias)||formatChineseText(review.actionBias)||'';
  return zhActionStatus(review.sentiment)||formatChineseText(review.sentiment)||'';
}
function aiReviewBlock(stock,type){
  const cfg=AI_REVIEW_TYPES[type];
  const review=normalizeAiReviews(stock.aiReviews)[type];
  if(!review)return `<div class="social-review-block"><div class="card-title">${cfg.label}</div><div class="social-empty">暂无复核</div></div>`;
  const positives=review.positivePoints||review.bullishArguments||review.whatChanged||[];
  const negatives=review.negativePoints||review.bearishArguments||[];
  const risks=review.riskPoints||review.rumorRisks||review.keyRisks||[];
  const extra=type==='technicalReview'?reviewList([review.volumeSignal,review.riskSignal,review.operationSuggestion].filter(Boolean)):(type==='financialReview'?reviewList([review.revenueTrend,review.profitTrend,review.marginTrend,review.cashFlowTrend,review.debtRisk,review.growthQuality].filter(Boolean)):reviewList(review.attentionPoints||review.hotTopics||review.nextUpdateNeeded||[]));
  const summary=review.summary||review.mainConclusion||'—';
  return `<div class="social-review-block"><div class="card-title">${cfg.label}</div><div class="card-note">更新 ${esc(aiReviewUpdatedAt(stock,type)||'—')} · ${esc(reviewCoreTag(type,review)||'—')} · 置信度 ${esc(zhConfidence(review.confidence)||review.confidence||'—')}</div><div class="text" style="max-width:none;margin-top:6px">${esc(formatChineseText(summary))}${englishTextHint(summary)}</div>${positives.length?'<div class="card-note" style="margin-top:6px"><b>利多/变化</b></div>'+reviewList(positives):''}${negatives.length?'<div class="card-note" style="margin-top:6px"><b>利空</b></div>'+reviewList(negatives):''}${risks.length?'<div class="card-note social-risk" style="margin-top:6px"><b>风险</b></div>'+reviewList(risks):''}${extra}</div>`;
}
function aiReviewSummaryPanel(stock){
  const types=Object.keys(AI_REVIEW_TYPES);
  const body=`<div class="modal-actions" style="justify-content:flex-start;margin:0 0 10px;flex-wrap:wrap"><button class="btn ghost small" id="copyAllAiReviewsBtn" type="button">复制全部 AI Review JSON</button><button class="btn ghost small danger" id="clearAllAiReviewsBtn" type="button">清空全部 AI Review</button></div><div class="social-review-note">仅作信息复核，不构成买卖指令；不会自动改变九模块评分或仓位建议。</div><div class="social-review-grid">${types.map(t=>aiReviewBlock(stock,t)).join('')}</div>`;
  return collapsibleCard('AI 复核结论',body,false,'辅助资料，默认折叠。');
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
    promptValuation:{valuationData:{symbol:'',updatedAt:'',currency:'',marketCap:null,peTtm:null,forwardPe:null,pb:null,ps:null,evEbitda:null,dividendYield:null,historicalPercentile:null,peerComparison:'',valuationConclusion:''},valuationReview:{summary:'',positivePoints:[],negativePoints:[],riskFlags:[],actionHint:''}},
    promptNews:{newsReview:{summary:'',positivePoints:[],negativePoints:[],riskPoints:[],attentionPoints:[],sentiment:'positive|neutral|negative',confidence:'high|medium|low'}},
    promptFinancialIntegrated:{financialData:{revenue:0,revenueGrowth:0,netProfit:0,profitGrowth:0,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'',currency:'',financialNote:'',lastUpdated:''},financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'high|medium|low'}},
    promptFinancialData:{financialData:{revenue:0,revenueGrowth:0,netProfit:0,profitGrowth:0,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'',currency:'',financialNote:'',lastUpdated:''}},
    promptFinancial:{financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'high|medium|low'}},
    promptSocial:{socialReview:{summary:'',hotTopics:[],bullishArguments:[],bearishArguments:[],rumorRisks:[],sentiment:'positive|neutral|negative',confidence:'high|medium|low'}},
    promptTechnical:{technicalReview:{updatedAt:'',inputCoverage:{hasRecentKline:false,hasCycleKline:false,cycleDataSource:'none',warning:''},shortTermTechnical:{lookbackDays:120,price:null,priceUpdatedAt:'',ma5:null,ma10:null,ma20:null,ma60:null,trendStatus:'',supportLevels:[],resistanceLevels:[],technicalSummary:'',riskFlags:[],actionHint:''},cycleTechnical:{lookbackDays:500,cyclePosition:'low_base|early_uptrend|mid_uptrend|high_level_rebreakout|high_level_overextension|distribution_risk|downtrend|unclear',cycleSummary:'',cycleHigh:null,cycleLow:null,currentPercentile:null,distanceToCycleHighPct:null,distanceToCycleLowPct:null,lastCycleUpdatedAt:'',dataSource:'none'},priceActionEvent:{detected:false,type:'',changePct:null,volumeStatus:'',needsNewsExplanation:false},finalTechnicalConclusion:'',holdHint:'',addHint:'',reduceHint:''}},
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
    technicalReview:normalizeTechnicalReview(stock.technicalReview,stock),
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
    chineseOutputPromptRule(),
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
    chineseOutputPromptRule(),
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
    `- ${chineseOutputPromptRule()}`,
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
    promptTechnical:'AI助手：技术面判断。若只提供近期60/120日K线，只更新 shortTermTechnical，并保留上次 cycleTechnical；若同时提供500日/近2年K线，才更新完整技术面。必须明确：trendStatus 只代表趋势方向，趋势强 ≠ 低位安全买点。',
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
    `7. ${chineseOutputPromptRule()}`,
    missing?`8. ${missing}`:'',
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
  if(detailStockId&&detailSubView==='allocation')renderAllocationDecisionDetail();
  else if(detailStockId)renderStockDetail();
  else if(currentTab==='dashboard')renderDashboard();
  else if(currentTab==='logs')renderExecutionLog();
  else if(currentTab==='analysis')renderAnalysisOverview();
  else if(currentTab==='edit')renderEditCenter();
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
function editCenterTypeLabel(type){
  return type==='etf'?'ETF':(type==='watching'?'观察':'个股');
}
function editCenterActualWeight(stock,total){
  const info=getPositionInfo(stock,total);
  if(!info||info.actualPct===null||info.actualPct===undefined)return '—';
  return fmt(info.actualPct,1)+'%';
}
function editCenterUpdatedAt(stock){
  return stock.updatedAt?new Date(stock.updatedAt).toLocaleString('zh-CN'):(stock.priceUpdatedAt||stock.valueUpdatedAt||'—');
}
function editCenterCard(stock,total){
  const strategy=normalizeStrategy(stock.strategy,stock);
  const current=stock.type==='etf'
    ? fmtMaybe(stock.lastUnitPrice||((Number(stock.currentValue)>0&&Number(stock.shares)>0)?Number(stock.currentValue)/Number(stock.shares):stock.currentPrice),2)
    : fmtMaybe(stock.currentPrice);
  const infoLine=`持仓 ${fmtInt(stock.shares)} ｜ 成本 ${fmtMaybe(stock.avgCost)} ｜ 现价 ${current}`;
  const weightLine=`目标 ${fmtMaybe(stock.targetPct,1)}% ｜ 实际 ${editCenterActualWeight(stock,total)} ｜ 策略 ${fmtMaybe(strategy.targetWeight,1)}%`;
  return `<div class="entry-card edit-center-card">
    <div class="entry-head"><div><div class="entry-name">${esc(stock.name||'未命名标的')}</div><div class="entry-code">${esc(stock.code||'无代码')} · ${esc(editCenterTypeLabel(stock.type))}</div></div><div class="entry-tags"><span class="chip role">${esc(zhStrategyRole(stock.role||strategy.investmentStyle)||stock.role||strategy.investmentStyle||'—')}</span><span class="chip tag">${esc(stock.theme||'其他')}</span></div></div>
    <div class="entry-line">${esc(infoLine)}</div>
    <div class="entry-line">${esc(weightLine)}</div>
    <div class="entry-hint">最后更新：${esc(editCenterUpdatedAt(stock))}</div>
    <div class="edit-center-actions">
      <button class="btn small" data-edit-center-action="basic" data-id="${esc(stock.id)}" type="button">编辑基础信息</button>
      <button class="btn ghost small" data-edit-center-action="strategy" data-id="${esc(stock.id)}" type="button">编辑策略</button>
      <button class="btn ghost small" data-edit-center-action="plans" data-id="${esc(stock.id)}" type="button">编辑计划</button>
    </div>
  </div>`;
}
function renderEditCenter(){
  const total=getEstimatedTotalAssets();
  let rows=state.stocks.slice();
  if(editCenterTypeFilter)rows=rows.filter(s=>s.type===editCenterTypeFilter);
  const q=String(editCenterSearch||'').trim().toLowerCase();
  if(q)rows=rows.filter(s=>String(s.name||'').toLowerCase().includes(q)||String(s.code||'').toLowerCase().includes(q));
  const typeOptions=[
    ['','全部'],
    ['holding','个股'],
    ['etf','ETF'],
    ['watching','观察']
  ].map(([v,t])=>`<button class="btn ${editCenterTypeFilter===v?'':'ghost'} small" data-edit-filter="${esc(v)}" type="button">${esc(t)}</button>`).join('');
  document.getElementById('summary').innerHTML=`编辑中心 · <strong>${rows.length}</strong> / ${state.stocks.length} 只`;
  document.getElementById('main').innerHTML=`<div class="hint"><b>编辑中心：</b>集中维护持仓、成本、价格、目标仓位、角色主题、策略和加减仓计划。基础信息与计划复用原「编辑标的」弹窗，策略复用原「编辑策略」弹窗。</div>
    <div class="card edit-center-filter"><div class="form-row"><label>搜索标的</label><input id="editCenterSearch" placeholder="输入名称或 symbol" value="${esc(editCenterSearch)}"></div><div class="modal-actions edit-center-filter-actions">${typeOptions}</div></div>
    ${rows.length?`<div class="entry-list edit-center-list">${rows.map(s=>editCenterCard(s,total)).join('')}</div>`:'<div class="empty">没有匹配的标的</div>'}`;
  const search=document.getElementById('editCenterSearch');
  if(search)search.addEventListener('input',e=>{
    editCenterSearch=e.target.value;
    renderEditCenter();
    const next=document.getElementById('editCenterSearch');
    if(next){next.focus();next.setSelectionRange(next.value.length,next.value.length)}
  });
  document.querySelectorAll('[data-edit-filter]').forEach(b=>b.addEventListener('click',()=>{editCenterTypeFilter=b.dataset.editFilter;renderEditCenter()}));
  document.querySelectorAll('[data-edit-center-action]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.id;
    if(b.dataset.editCenterAction==='strategy'){
      detailStockId=id;
      detailSubView='';
      editModalReturnTab='edit';
      openStrategyEditor();
      return;
    }
    openModal(id);
    if(b.dataset.editCenterAction==='plans'){
      const title=document.getElementById('modalTitle');
      if(title)title.textContent='编辑计划';
      setTimeout(()=>{const box=document.querySelector('.plan-editor');if(box)box.scrollIntoView({block:'center'})},80);
    }
  }));
}
function bars(rows){return rows.map(r=>`<div class="bar-row"><div>${esc(r.name)}</div><div class="bar-bg"><div class="bar ${r.name.includes('AI')?'ai':r.name.includes('黄金')?'res':r.name.includes('核心')||r.name.includes('宽基')?'core':r.name.includes('卫星')?'sat':''}" style="width:${Math.min(100,r.p)}%"></div></div><div class="num">${fmt(r.p,1)}%</div></div>`).join('')}
function filtered(){return state.stocks.filter(s=>s.type===currentTab)}
function renderTable(){const raw=filtered();const total=getEstimatedTotalAssets();const withU=raw.map(s=>({s,u:stockUrgency(s),info:getPositionInfo(s,total)}));withU.sort((a,b)=>a.u.score-b.u.score);const arr=withU.map(x=>x.s);const totalTrig=withU.reduce((a,b)=>a+b.u.triggered,0);const tabMv=raw.reduce((a,s)=>a+(getMarketValue(s)||0),0);const overweights=withU.filter(x=>x.info&&x.info.status==='overweight').length;const underweights=withU.filter(x=>x.info&&x.info.status==='underweight').length;const typeName=currentTab==='holding'?'个股':currentTab==='etf'?'ETF':'观察';const trigBadge=totalTrig>0?` · <strong style="color:var(--seal)">⚠ 已触发 ${totalTrig} 条</strong>`:'';const rebalBadge=(overweights+underweights)>0?` · <strong style="color:var(--gold)">⚖ 偏差>5% ${overweights+underweights} 只</strong>`:'';document.getElementById('summary').innerHTML=`${typeName} <strong>${arr.length}</strong> 只 · 目标 <strong>${fmt(arr.reduce((a,b)=>a+(Number(b.targetPct)||0),0),1)}%</strong> · 市值 <strong>${fmtMoney(tabMv)}</strong>${trigBadge}${rebalBadge}`;const main=document.getElementById('main');if(!arr.length){main.innerHTML='<div class="empty">暂无标的</div>';return}const trigAlert=totalTrig>0?`<div class="alert-trig">⚠ 当前有 ${totalTrig} 条价位计划已触发，已置顶显示。</div>`:'';main.innerHTML=`${trigAlert}<div class="table-wrap"><table><colgroup><col style="width:7%"><col style="width:6.5%"><col style="width:9.5%"><col style="width:16%"><col style="width:19%"><col style="width:14.5%"><col style="width:5.5%"><col style="width:9.5%"><col style="width:6%"><col style="width:6.5%"></colgroup><thead><tr><th>名称</th><th>定位/主题</th><th>目标/实际</th><th>为什么持有</th><th>加仓/建仓动作</th><th>卖出/降仓条件</th><th>成本</th><th>${currentTab==='etf'?'当前市值':'当前价格'}</th><th>数量</th><th>操作</th></tr></thead><tbody>${arr.map(s=>row(s,total)+(typeof socialPanel==='function'?socialPanel(s):'')).join('')}</tbody></table></div>`;main.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.action==='detail')openStockDetail(b.dataset.id);if(b.dataset.action==='refresh')refreshOnePrice(b.dataset.id);if(b.dataset.action==='edit')openModal(b.dataset.id);if(b.dataset.action==='delete')del(b.dataset.id)}))}
function row(s,total){const cp=getComparablePrice(s);const buys=(s.plans||[]).filter(p=>(p.action||'buy')==='buy').sort((a,b)=>Number(b.price||0)-Number(a.price||0));const sells=(s.plans||[]).filter(p=>p.action==='sell').sort((a,b)=>Number(b.price||0)-Number(a.price||0));const info=getPositionInfo(s,total);let targetCell='';if(!info)targetCell=`<div class="target-line">${fmtMaybe(s.targetPct,1)}%</div>`;else if(info.status==='no-price')targetCell=`<div class="target-line">${info.target.toFixed(1)}%</div><div class="actual-line">实际：未填${s.type==='etf'?'当前市值':'当前价格'}</div><span class="dev-badge na">无法计算偏差</span>`;else{const sign=info.deviation>=0?'+':'';const cls=info.status==='overweight'?'over':info.status==='underweight'?'under':'ok';const word=info.status==='overweight'?'超配':info.status==='underweight'?'低配':'平衡';targetCell=`<div class="target-line">${info.target.toFixed(1)}%</div><div class="actual-line">实际 ${info.actualPct.toFixed(1)}% · ${fmtMoney(info.mv)}</div><span class="dev-badge ${cls}">${word} ${sign}${info.deviation.toFixed(1)}%</span>`;const _cap=Number(s.capPct);if(_cap>0&&info.actualPct>=_cap)targetCell+=`<span class="dev-badge over">✖ ≥冻结线${_cap}%·禁买</span>`;const _ta=getTrimAction(s,info,total);if(_ta)targetCell+=`<span class="dev-badge over">▼ 削减线${_ta.trim}%→削回${_ta.toPct}%${_ta.sharesTxt?'·'+_ta.sharesTxt:''}</span>`}return `<tr><td class="name cell-name"><button class="link-btn detail-name" data-action="detail" data-id="${s.id}">${esc(s.name)}</button></td><td class="cell-role" data-label="定位/主题"><div class="chips"><span class="chip role">${esc(s.role||'—')}</span><span class="chip tag">${esc(s.theme||'—')}</span></div></td><td class="num cell-target" data-label="目标 / 实际">${targetCell}</td><td class="text cell-thesis" data-label="为什么持有">${esc(s.thesis||s.notes||'')||'<span class="muted">—</span>'}</td><td class="cell-buy" data-label="加仓/建仓">${chips(buys,'buy',cp)||'<div class="text">'+esc(s.buyRule||'—')+'</div>'}</td><td class="cell-sell" data-label="卖出/降仓"><div class="text">${esc(s.sellRule||'—')}</div>${sells.length?chips(sells,'sell',cp):''}</td><td class="num cell-cost" data-label="成本">${fmtMaybe(s.avgCost)}</td><td class="num cell-current" data-label="${s.type==='etf'?'当前市值':'当前价格'}">${currentDisplay(s)}</td><td class="num cell-shares" data-label="数量">${fmtInt(s.shares)}</td><td class="cell-actions"><div class="row-actions"><button class="link-btn" data-action="refresh" data-id="${s.id}">${s.type==='etf'?'刷新市值':'刷新价格'}</button><button class="link-btn" data-action="edit" data-id="${s.id}">编辑</button><button class="link-btn danger" data-action="delete" data-id="${s.id}">删除</button></div></td></tr>`}
function renderTable(){const raw=filtered();const total=getEstimatedTotalAssets();const withU=raw.map(s=>({s,u:stockUrgency(s),info:getPositionInfo(s,total)}));withU.sort((a,b)=>a.u.score-b.u.score);const arr=withU.map(x=>x.s);const totalTrig=withU.reduce((a,b)=>a+b.u.triggered,0);const tabMv=raw.reduce((a,s)=>a+(getMarketValue(s)||0),0);const overweights=withU.filter(x=>x.info&&x.info.status==='overweight').length;const underweights=withU.filter(x=>x.info&&x.info.status==='underweight').length;const typeName=currentTab==='holding'?'个股':currentTab==='etf'?'ETF':'观察';const trigBadge=totalTrig>0?` · <strong style="color:var(--seal)">⚠ 已触发 ${totalTrig} 条</strong>`:'';const rebalBadge=(overweights+underweights)>0?` · <strong style="color:var(--gold)">⚖ 偏差>5% ${overweights+underweights} 只</strong>`:'';document.getElementById('summary').innerHTML=`${typeName} <strong>${arr.length}</strong> 只 · 目标 <strong>${fmt(arr.reduce((a,b)=>a+(Number(b.targetPct)||0),0),1)}%</strong> · 市值 <strong>${fmtMoney(tabMv)}</strong>${trigBadge}${rebalBadge}`;const main=document.getElementById('main');if(!arr.length){main.innerHTML='<div class="empty">暂无标的</div>';return}const trigAlert=totalTrig>0?`<div class="alert-trig">⚠ 当前有 ${totalTrig} 条价位计划已触发。进入详情页可查看并记录执行。</div>`:'';main.innerHTML=`${trigAlert}<div class="entry-list">${arr.map(s=>entryCard(s,total)).join('')}</div>`;main.querySelectorAll('[data-action="detail"]').forEach(b=>b.addEventListener('click',()=>openStockDetail(b.dataset.id)))}
function entryTags(s){
  const f=normalizeDataFreshness(s.dataFreshness);
  const tags=[];
  if(s.type==='watching')tags.push({text:'观察仓',cls:'tag'});
  if(s.role)tags.push({text:s.role,cls:'role'});
  if(isOverdue(priceReferenceDate(s),7))tags.push({text:'价格待更新',cls:'sell'});
  if(!isCashRow(s)&&isOverdue(f.technicalUpdatedAt,3))tags.push({text:'技术面待更新',cls:'sell'});
  if(s.type==='holding'&&isOverdue(f.newsUpdatedAt,30))tags.push({text:'新闻待更新',cls:'tag'});
  if(s.type==='holding'&&isOverdue(f.financialUpdatedAt,30))tags.push({text:'财报待更新',cls:'tag'});
  const info=getPositionInfo(s,getEstimatedTotalAssets());
  if(info&&info.status==='overweight')tags.push({text:'超配复核',cls:'sell'});
  if(info&&info.status==='underweight')tags.push({text:'低配复核',cls:'buy'});
  if(stockUrgency(s).triggered>0)tags.push({text:'价位已触发',cls:'buy'});
  return tags.slice(0,6).map(t=>`<span class="chip ${t.cls}">${esc(t.text)}</span>`).join('');
}
function entryPriceText(s){
  const cp=getComparablePrice(s);
  const date=priceReferenceDate(s);
  if(s.type==='etf'){
    const value=fmtMaybe(s.currentValue,0);
    const unit=cp==null?'—':fmtMaybe(cp);
    return `${unit}<span class="muted"> / 市值 ${value}</span><div class="card-note">${freshnessText(date)}</div>`;
  }
  return `${fmtMaybe(cp)}<div class="card-note">${freshnessText(date)}</div>`;
}
function isGenericPositionHint(text){
  const t=String(text||'');
  return /当前仓位|目标仓位|仓位接近|接近目标|高于目标|低于目标|仓位低于|仓位高于|仓位差距|positionGap|currentWeight|targetWeight/.test(t);
}
function cleanLatestActionText(text){
  const t=String(text||'').trim();
  if(!t||isGenericPositionHint(t))return '';
  return t.replace(/^(强烈买入\/优先加仓|可以买入\/分批加仓|观察等待|持有为主|考虑减仓)[：:]\s*/,'').trim()||t;
}
function manualLatestAction(s){
  const fw=normalizeAnalysisFramework(s.analysisFramework,s);
  const fields=[s.actionHint,s.latestAction,s.actionSuggestion,s.decisionSuggestion,s.operationHint,s.operationSuggestion,fw.conclusion&&fw.conclusion.actionPlan];
  for(const x of fields){const t=cleanLatestActionText(x);if(t)return t}
  return '';
}
function aiComprehensiveLatestAction(s){
  const review=normalizeAiReviews(s.aiReviews).comprehensiveReview||{};
  const fields=[review.actionHint,review.actionSuggestion,review.latestAction,review.suggestedAction,review.operationSuggestion,review.mainConclusion];
  for(const x of fields){const t=cleanLatestActionText(x);if(t)return t}
  return '';
}
function planLatestAction(s){
  const cp=getComparablePrice(s);
  const plans=(s.plans||[]).map(p=>({p,g:planGap(cp,p.price,p.action,p.triggerOn)})).filter(x=>Number(x.p&&x.p.price)>0);
  if(!plans.length)return '';
  plans.sort((a,b)=>{
    const ag=a.g?(a.g.triggered?-1000+a.g.absPct:a.g.absPct):9999;
    const bg=b.g?(b.g.triggered?-1000+b.g.absPct:b.g.absPct):9999;
    return ag-bg;
  });
  const {p,g}=plans[0];
  const action=(p.action||'buy')==='sell'?'减仓':'补仓观察';
  const note=String(p.note||'').trim();
  if(g&&g.triggered)return cleanLatestActionText(note||`已触发${action}，需进入详情确认执行`);
  return cleanLatestActionText(note||`关注 ${fmtMaybe(p.price)} 附近${action}条件`);
}
function tradePlanItemText(item){
  if(!item||typeof item!=='object')return '';
  const action={add:'加仓',reduce:'减仓',observe:'观察',hold:'持有',buy:'加仓',sell:'减仓'}[item.action]||item.action||'观察';
  const zone=item.priceZone||((Number(item.triggerPrice)>0)?`${fmtMaybe(item.triggerPrice)} 附近`:'');
  const qty=Number(item.quantity)>0?`${fmtInt(item.quantity)}股`:'';
  const note=item.note||item.condition||item.technicalCondition||'';
  return [action,zone,qty,note].filter(Boolean).join(' · ');
}
function tradePlanSummaryText(stock){
  const tp=stock&&stock.tradePlan;
  if(!tp||typeof tp!=='object')return '';
  const items=Array.isArray(tp.planItems)?tp.planItems:[];
  const first=items[0];
  const line=tradePlanItemText(first);
  return cleanLatestActionText(tp.planSummary||line||'');
}
function tradePlanLatestAction(s){
  const text=tradePlanSummaryText(s);
  return text?`计划：${text}`:'';
}
function decisionLatestAction(s){
  if(typeof calculateDecision!=='function')return '';
  const d=calculateDecision(s,{totalMarketValue:getTotalInvested()});
  return cleanLatestActionText(d&&d.suggestedAction);
}
function technicalDecisionLabel(decision){
  return zhDecision(decision)||'观察';
}
function technicalDecisionText(td){
  return [td&&td.trendStatus,td&&td.cyclePosition,td&&td.technicalSummary,td&&td.cycleSummary,td&&td.actionHint,td&&td.holdHint,td&&td.addHint,td&&td.reduceHint].concat(Array.isArray(td&&td.riskFlags)?td.riskFlags:[]).filter(Boolean).join(' ');
}
function numericLevels(v){
  return (Array.isArray(v)?v:[]).map(Number).filter(x=>isFinite(x)&&x>0).sort((a,b)=>a-b);
}
function nearestLevel(price,levels,mode){
  if(!(price>0)||!levels.length)return null;
  const usable=mode==='support'?levels.filter(x=>x<=price*1.08):levels.filter(x=>x>=price*.92);
  const arr=usable.length?usable:levels;
  let best=arr[0],gap=Math.abs(price-arr[0])/price*100;
  arr.slice(1).forEach(x=>{const g=Math.abs(price-x)/price*100;if(g<gap){best=x;gap=g}});
  return {price:best,gap:Number(gap.toFixed(1)),near:gap<=3,veryNear:gap<=1.5};
}
function nearestPlanForAction(stock,action){
  const cp=getComparablePrice(stock);
  const rows=(stock.plans||[])
    .filter(p=>(p.action||'buy')===action&&Number(p.price)>0)
    .map(p=>({p,g:planGap(cp,p.price,p.action,p.triggerOn)}));
  if(!rows.length)return null;
  rows.sort((a,b)=>{
    const av=a.g?(a.g.triggered?-1000+a.g.absPct:a.g.absPct):9999;
    const bv=b.g?(b.g.triggered?-1000+b.g.absPct:b.g.absPct):9999;
    return av-bv;
  });
  return rows[0];
}
function planDecisionLine(row,label){
  if(!row)return '';
  const p=row.p||{};
  const g=row.g;
  const state=g?(g.triggered?'已触发':`距触发 ${fmt(g.absPct,1)}%`):'无法判断';
  return `${label} ${fmtMaybe(p.price)} · ${state}${p.note?' · '+p.note:''}`;
}
function planDistanceText(stock,p){
  const cp=getComparablePrice(stock);
  const price=Number(p&&p.price);
  if(!(cp>0)||!(price>0))return '当前价或计划价缺失，无法计算距离';
  const gap=Math.abs(cp-price)/cp*100;
  return `当前价 ${fmtMaybe(cp)}，计划价 ${fmtMaybe(price)}，距离约 ${fmt(gap,1)}%`;
}
function calculateTechnicalDecision(stock){
  const s=stock||{};
  const td=normalizeTechnicalData(s.technicalData);
  const strategy=normalizeStrategy(s.strategy,s);
  const currentPrice=Number(td.price)||Number(getComparablePrice(s))||stockCurrentPrice(s);
  const currentShares=typeof stockCurrentShares==='function'?stockCurrentShares(s):(Number(s.shares)||0);
  const targetShares=Number(strategy.targetShares)||0;
  const isWatchOnly=strategy.investmentStyle==='watchOnly'||s.type==='watching'||(targetShares>0&&currentShares>=targetShares*.95);
  const supports=numericLevels(td.supportLevels);
  const resistances=numericLevels(td.resistanceLevels);
  const support=nearestLevel(currentPrice,supports,'support');
  const resistance=nearestLevel(currentPrice,resistances,'resistance');
  const buyPlan=nearestPlanForAction(s,'buy');
  const sellPlan=nearestPlanForAction(s,'sell');
  const trend=String(td.trendStatus||'').toLowerCase();
  const cycle=String(td.cyclePosition||'').toLowerCase();
  const txt=technicalDecisionText(td);
  const riskText=txt.toLowerCase();
  const explicitBreakdown=/breakdown|downtrend|跌破关键支撑|跌破ma20|跌破ma60|跌破20日|跌破60日|趋势破坏|破位|放量下跌/.test(riskText);
  const weakRisk=/前高压力|套牢压力|反弹持续性|动能.*弱|红柱缩短|波动加大|距离压力|压力位|未站上ma60|未有效站上|中期趋势尚未完全扭转/i.test(txt);
  const belowMa20=currentPrice>0&&Number(td.ma20)>0&&currentPrice<Number(td.ma20);
  const belowMa60=currentPrice>0&&Number(td.ma60)>0&&currentPrice<Number(td.ma60);
  const belowSupport=Boolean(support&&support.price>0&&currentPrice>0&&currentPrice<support.price);
  const trendIsBreakdown=trend==='breakdown'||trend==='downtrend';
  const seriousRisk=trendIsBreakdown||cycle==='distribution_risk'||explicitBreakdown||(belowSupport&&(belowMa20||belowMa60));
  const missingCount=[currentPrice,td.ma20,td.ma60,supports.length,resistances.length,trend].filter(Boolean).length;
  const base={decision:'observe',title:'观察',summary:'技术面仅作辅助复核，不构成买卖指令。',reason:[],triggerMatched:[],riskFlags:[],suggestedQuantity:null,suggestedPriceZone:'',confidence:'medium',source:'technicalDecision'};
  if(missingCount<3){
    return {...base,decision:'review',title:'技术面资料待更新',summary:'当前技术面价格、均线、支撑位或压力位信息不足，建议先更新技术面数据。',reason:['技术面字段缺失较多'],riskFlags:['技术面信息不足'],confidence:'low'};
  }
  const reasons=[];
  const triggers=[];
  const risks=[];
  if(trend)reasons.push(`趋势状态：${zhTrendStatus(td.trendStatus)}`);
  if(cycle&&cycle!=='unclear')reasons.push(`周期位置：${cyclePositionText(td.cyclePosition)}`);
  if(support)reasons.push(`最近支撑：${fmtMaybe(support.price)}，距离 ${fmt(support.gap,1)}%`);
  if(resistance)reasons.push(`最近压力：${fmtMaybe(resistance.price)}，距离 ${fmt(resistance.gap,1)}%`);
  if(buyPlan)triggers.push(planDecisionLine(buyPlan,'加仓计划'));
  if(sellPlan)triggers.push(planDecisionLine(sellPlan,'减仓计划'));
  if(td.actionHint)reasons.push(`技术提示：${formatChineseText(td.actionHint)}`);
  if(support&&support.near)triggers.push(`接近支撑位 ${fmtMaybe(support.price)}`);
  if(resistance&&resistance.near)triggers.push(`接近压力位 ${fmtMaybe(resistance.price)}`);
  if(belowMa20)risks.push('当前价格低于 MA20');
  if(belowMa60)risks.push('当前价格低于 MA60');
  if(cycle==='high_level_overextension')risks.push('大周期位置：高位过热，新增资金不宜追高');
  if(cycle==='high_level_rebreakout')risks.push('大周期位置：高位二次上攻，需确认前高突破或回踩支撑');
  if(weakRisk)risks.push(...zhList(td.riskFlags).slice(0,3));
  const buyTriggered=buyPlan&&buyPlan.g&&buyPlan.g.triggered;
  const buyNear=buyPlan&&buyPlan.g&&buyPlan.g.absPct<=3;
  const sellTriggered=sellPlan&&sellPlan.g&&sellPlan.g.triggered;
  const sellNear=sellPlan&&sellPlan.g&&sellPlan.g.absPct<=3;
  const highPosition=(()=>{try{const d=decisionForStock(s);return d.currentWeight>0&&d.maxWeight>0&&d.currentWeight>=d.maxWeight}catch(e){return false}})();
  if(seriousRisk){
    const triggered=(sellTriggered||highPosition||(trendIsBreakdown&&belowMa60)||explicitBreakdown&&belowSupport);
    return {...base,decision:triggered?'reduce_triggered':'reduce_watch',title:triggered?'减仓风险触发':'减仓风险提示',summary:'技术面出现趋势破坏或关键均线风险，建议优先复核风险和仓位，不自动执行交易。',reason:reasons,triggerMatched:triggers,riskFlags:risks.length?risks:['技术面风险升高'],suggestedQuantity:sellPlan&&sellPlan.p?Number(sellPlan.p.shares)||null:null,suggestedPriceZone:sellPlan&&sellPlan.p?`减仓计划价 ${fmtMaybe(sellPlan.p.price)} 附近`:'等待风险复核确认',confidence:'medium'};
  }
  if(cycle==='high_level_overextension'){
    return {...base,decision:'wait',title:'高位过热 / 等待回踩',summary:'趋势可能仍强，但大周期位置偏高且短期过热，新增资金不宜追高，等待回踩支撑或放量突破后再复核。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedQuantity:null,suggestedPriceZone:support?`等待 ${fmtMaybe(support.price)} 附近支撑确认`:'等待过热降温或突破确认',confidence:'medium'};
  }
  if(cycle==='high_level_rebreakout'&&resistance&&resistance.gap<=10){
    return {...base,decision:'wait',title:'高位二次上攻 / 等待确认',summary:'当前接近大周期前高，趋势仍强但不属于低位安全买点，新增资金宜等待站稳前高或回踩支撑后再分批复核。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedQuantity:null,suggestedPriceZone:`关注 ${fmtMaybe(resistance.price)} 前高/压力突破确认`,confidence:'medium'};
  }
  if(trend==='rebound'){
    const nearMa60=currentPrice>0&&Number(td.ma60)>0&&Math.abs(currentPrice-Number(td.ma60))/currentPrice*100<=3;
    const nearResistance=resistance&&resistance.gap<=3;
    const waitBreak=nearMa60||nearResistance;
    return {...base,decision:waitBreak?'breakthrough_watch':'wait',title:waitBreak?'等待突破确认':'反弹观察 / 等待确认',summary:waitBreak?'技术面处于反弹修复阶段，已站上部分短期均线，但接近关键压力或中期均线，需观察能否有效突破。':'技术面处于反弹修复阶段，需继续观察支撑有效性和反弹持续性，未确认突破前不宜直接判断趋势反转。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedQuantity:null,suggestedPriceZone:resistance?`关注 ${fmtMaybe(resistance.price)} 压力突破确认`:(support?`关注 ${fmtMaybe(support.price)} 支撑有效性`:''),confidence:'medium'};
  }
  if(isWatchOnly){
    if((buyTriggered||buyNear)&&(support&&support.near)&&!weakRisk){
      return {...base,decision:buyTriggered?'add_triggered':'add_watch',title:buyTriggered?'观察仓加仓条件触发':'接近加仓观察',summary:'观察仓不主动扩大仓位；当前接近计划区和支撑位，可进入加仓观察，但仍需人工确认。',reason:reasons.concat(['观察仓需控制主动扩仓']),triggerMatched:triggers,riskFlags:risks,suggestedQuantity:buyPlan&&buyPlan.p?Number(buyPlan.p.shares)||null:null,suggestedPriceZone:buyPlan&&buyPlan.p?`计划价 ${fmtMaybe(buyPlan.p.price)} 附近`:(support?`支撑 ${fmtMaybe(support.price)} 附近`:''),confidence:buyTriggered?'medium':'low'};
    }
    return {...base,decision:'wait',title:'观察 / 等待确认',summary:'当前仍处于观察仓或已接近目标股数，不主动扩大；关注支撑有效性和压力位突破，计划区未触发前以等待复核为主。',reason:reasons.concat(['观察仓不主动扩大仓位',targetShares>0?`当前 ${fmtInt(currentShares)} 股，目标 ${fmtInt(targetShares)} 股`:'']),triggerMatched:triggers,riskFlags:risks,suggestedQuantity:null,suggestedPriceZone:buyPlan&&buyPlan.p?`等待 ${fmtMaybe(buyPlan.p.price)} 附近计划区，或支撑/突破确认`:support?`关注 ${fmtMaybe(support.price)} 支撑有效性`:'等待技术条件更清晰',confidence:'medium'};
  }
  if((buyTriggered||buyNear||support&&support.near)&&trend!=='breakdown'&&trend!=='downtrend'&&!seriousRisk){
    return {...base,decision:buyTriggered?'add_triggered':'add_watch',title:buyTriggered?'加仓条件触发':'接近加仓观察',summary:'价格接近计划区或支撑位，且未出现明显趋势破坏，可作为加仓观察条件。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedQuantity:buyPlan&&buyPlan.p?Number(buyPlan.p.shares)||null:null,suggestedPriceZone:buyPlan&&buyPlan.p?`计划价 ${fmtMaybe(buyPlan.p.price)} 附近`:support?`支撑 ${fmtMaybe(support.price)} 附近`:'',confidence:buyTriggered?'high':'medium'};
  }
  if(trend==='uptrend'&&resistance&&resistance.gap<=8){
    return {...base,decision:'wait',title:'等待突破确认',summary:'技术趋势偏强，但当前接近上方压力位，宜等待突破或回踩确认。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedQuantity:null,suggestedPriceZone:`压力 ${fmtMaybe(resistance.price)} 附近，等待突破或回踩`,confidence:'medium'};
  }
  if(trend==='sideways'){
    return {...base,decision:'wait',title:'震荡观察 / 等待方向',summary:'技术面处于震荡阶段，未出现明确突破或破位信号，宜等待方向确认。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedPriceZone:support&&resistance?`支撑 ${fmtMaybe(support.price)} / 压力 ${fmtMaybe(resistance.price)}`:'等待区间更清晰',confidence:'medium'};
  }
  return {...base,decision:'hold',title:'持有观察',summary:'技术面未触发明确加仓或减仓条件，维持观察并等待更清晰信号。',reason:reasons,triggerMatched:triggers,riskFlags:risks,suggestedPriceZone:support?`支撑 ${fmtMaybe(support.price)} / 压力 ${resistance?fmtMaybe(resistance.price):'—'}`:'',confidence:'medium'};
}
function getLatestActionInfo(s){
  const manual=manualLatestAction(s);
  if(manual)return {text:manual,source:'用户记录 / 九模块结论',updatedAt:normalizeDataFreshness(s.dataFreshness).personalViewUpdatedAt||s.updatedAt||''};
  const td=normalizeTechnicalData(s.technicalData,s);
  const techDecision=calculateTechnicalDecision(s);
  if(techDecision&&techDecision.summary)return {text:techDecision.summary,source:'技术面辅助决策',updatedAt:td.lastUpdated||td.priceUpdatedAt||normalizeDataFreshness(s.dataFreshness).technicalUpdatedAt||'',technicalDecision:techDecision};
  const ai=aiComprehensiveLatestAction(s);
  if(ai)return {text:ai,source:'AI 综合复核',updatedAt:normalizeDataFreshness(s.dataFreshness).comprehensiveReviewUpdatedAt||''};
  const tradePlan=tradePlanLatestAction(s);
  if(tradePlan)return {text:tradePlan,source:'GPT 加仓计划',updatedAt:(s.tradePlan&&s.tradePlan.updatedAt)||s.updatedAt||''};
  const plan=planLatestAction(s);
  if(plan)return {text:plan,source:'持仓计划',updatedAt:s.updatedAt||''};
  const decision=decisionLatestAction(s);
  if(decision)return {text:decision,source:'决策引擎',updatedAt:s.updatedAt||''};
  return {text:'暂无明确操作，进入分析页复核',source:'默认提示',updatedAt:''};
}
function getLatestActionHint(s){
  return getLatestActionInfo(s).text;
}
function entryBaseLine(s){
  const cp=getComparablePrice(s);
  return `持仓 ${fmtInt(s.shares)} ｜ 成本 ${fmtMaybe(s.avgCost)} ｜ 现价 ${cp==null?'—':fmtMaybe(cp)}`;
}
function entryCard(s,total){
  const plan=tradePlanLatestAction(s);
  return `<div class="entry-card"><div class="entry-head"><div><div class="entry-name">${esc(s.name||'—')}</div><div class="entry-code">${esc(s.code||'无代码')}</div></div><div class="entry-tags">${entryTags(s)||'<span class="chip tag">待分析</span>'}</div></div><div class="entry-line">${esc(entryBaseLine(s))}</div>${plan?`<div class="entry-hint">${esc(formatChineseText(plan))}</div>`:''}<div class="entry-hint"><b>最新操作：</b>${esc(formatChineseText(getLatestActionHint(s)))}</div><div class="entry-actions"><button class="btn" data-action="detail" data-id="${esc(s.id)}">进入分析</button></div></div>`;
}
function renderTable(){const raw=filtered();const total=getEstimatedTotalAssets();const withU=raw.map(s=>({s,u:stockUrgency(s),info:getPositionInfo(s,total)}));withU.sort((a,b)=>a.u.score-b.u.score);const arr=withU.map(x=>x.s);const totalTrig=withU.reduce((a,b)=>a+b.u.triggered,0);const tabMv=raw.reduce((a,s)=>a+(getMarketValue(s)||0),0);const overweights=withU.filter(x=>x.info&&x.info.status==='overweight').length;const underweights=withU.filter(x=>x.info&&x.info.status==='underweight').length;const typeName=currentTab==='holding'?'个股':currentTab==='etf'?'ETF':'观察';const trigBadge=totalTrig>0?` · <strong style="color:var(--seal)">⚠ 已触发 ${totalTrig} 条</strong>`:'';const rebalBadge=(overweights+underweights)>0?` · <strong style="color:var(--gold)">⚖ 偏差>5% ${overweights+underweights} 只</strong>`:'';document.getElementById('summary').innerHTML=`${typeName} <strong>${arr.length}</strong> 只 · 目标 <strong>${fmt(arr.reduce((a,b)=>a+(Number(b.targetPct)||0),0),1)}%</strong> · 市值 <strong>${fmtMoney(tabMv)}</strong>${trigBadge}${rebalBadge}`;const main=document.getElementById('main');if(!arr.length){main.innerHTML='<div class="empty">暂无标的</div>';return}const trigAlert=totalTrig>0?`<div class="alert-trig">⚠ 当前有 ${totalTrig} 条价位计划已触发。进入详情页可查看并记录执行。</div>`:'';main.innerHTML=`${trigAlert}<div class="entry-list">${arr.map(s=>entryCard(s,total)).join('')}</div>`;main.querySelectorAll('[data-action="detail"]').forEach(b=>b.addEventListener('click',()=>openStockDetail(b.dataset.id)))}
function chips(ps,type,cp){if(!ps.length)return'';return `<div class="chips">${ps.map(p=>{const g=planGap(cp,p.price,type,p.triggerOn);const trigCls=(g&&g.triggered)?' triggered':'';const arrow=g?(g.direction==='below'?'↓':'↑'):'';const gapHtml=g?(g.triggered?`<span class="gap trig">⚠ 已触发</span>`:`<span class="gap">${arrow}${g.absPct.toFixed(1)}%</span>`):'';return `<span class="chip ${type}${trigCls}"><span>${type==='buy'?'▲':'▼'}</span><span class="price">${fmtMaybe(p.price)}</span><span class="shares">${fmtInt(p.shares)}</span>${gapHtml}${p.note?`<span>· ${esc(p.note)}</span>`:''}</span>`}).join('')}</div>`}
function setType(t){formType=t;document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('active',b.dataset.type===t));document.getElementById('sellBox').style.display=t==='watching'?'none':'block'}
function openModal(id){editModalReturnTab=currentTab;editingId=id||null;const s=state.stocks.find(x=>x.id===id);document.getElementById('modalTitle').textContent=s?'编辑标的':'新增标的';setType(s?s.type:(currentTab==='etf'?'etf':currentTab==='watching'?'watching':'holding'));document.getElementById('fName').value=s?.name||'';document.getElementById('fCode').value=s?.code||'';document.getElementById('fCurrency').value=s?.currency||'';document.getElementById('fShares').value=s?.shares??'';document.getElementById('fCost').value=s?.avgCost??'';document.getElementById('fTarget').value=s?.targetPct??'';document.getElementById('fTrim').value=s?.trimPct??'';document.getElementById('fTrimTo').value=s?.trimToPct??'';document.getElementById('fCap').value=s?.capPct??'';document.getElementById('fCurrentPrice').value=s?.currentPrice??'';document.getElementById('fCurrentValue').value=s?.currentValue??'';document.getElementById('fRole').value=s?.role||'核心仓';document.getElementById('fTheme').value=s?.theme||'其他';document.getElementById('fThesis').value=s?.thesis||s?.notes||'';document.getElementById('fSellRule').value=s?.sellRule||'';document.getElementById('fNotes').value=s?.notes||'';const ps=s?.plans||[];tempBuy=ps.filter(p=>(p.action||'buy')==='buy').map(p=>({...p}));tempSell=ps.filter(p=>p.action==='sell').map(p=>({...p}));renderPlanEditor();document.getElementById('modal').classList.add('show');setTimeout(()=>document.getElementById('fName').focus(),50)}
function closeModal(){document.getElementById('modal').classList.remove('show');editingId=null;editModalReturnTab=''}
function renderPlanEditor(){document.getElementById('buyRows').innerHTML=tempBuy.map((p,i)=>planRow(p,i,'buy')).join('')||'<tr><td colspan="4" class="muted">暂无动作</td></tr>';document.getElementById('sellRows').innerHTML=tempSell.map((p,i)=>planRow(p,i,'sell')).join('')||'<tr><td colspan="4" class="muted">暂无动作</td></tr>';document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.type==='buy'?tempBuy:tempSell;a.splice(Number(b.dataset.remove),1);renderPlanEditor()}));document.querySelectorAll('[data-field]').forEach(inp=>inp.addEventListener('input',()=>{const a=inp.dataset.type==='buy'?tempBuy:tempSell;const p=a[Number(inp.dataset.index)];p[inp.dataset.field]=inp.dataset.field==='note'?inp.value:parseFloat(inp.value)}))}
function planRow(p,i,type){return `<tr><td><input type="number" step="any" value="${esc(p.price??'')}" data-type="${type}" data-index="${i}" data-field="price"></td><td><input type="number" step="any" value="${esc(p.shares??'')}" data-type="${type}" data-index="${i}" data-field="shares"></td><td><input type="text" value="${esc(p.note??'')}" data-type="${type}" data-index="${i}" data-field="note"></td><td><button class="link-btn danger" type="button" data-type="${type}" data-remove="${i}">删除</button></td></tr>`}
function addPlan(type){(type==='buy'?tempBuy:tempSell).push({id:uid(),action:type,price:'',shares:'',note:''});renderPlanEditor()}
function collect(currentPrice){const clean=(a,action)=>a.map(p=>{const price=Number(p.price);const shares=Number(p.shares);return {id:p.id||uid(),action,price,shares,note:String(p.note||'').trim(),triggerOn:p.triggerOn||inferTriggerOn(currentPrice,price,action)}}).filter(p=>!isNaN(p.price)&&p.price>0&&!isNaN(p.shares)&&p.shares>0);return [...clean(tempBuy,'buy'),...(formType==='watching'?[]:clean(tempSell,'sell'))]}
function save(){const name=document.getElementById('fName').value.trim();if(!name)return alert('请填写名称');const costRaw=document.getElementById('fCost').value,targetRaw=document.getElementById('fTarget').value,currentPriceRaw=document.getElementById('fCurrentPrice').value,currentValueRaw=document.getElementById('fCurrentValue').value;const old=editingId?state.stocks.find(x=>x.id===editingId):null;const oldPrice=old?String(old.currentPrice??''):'';const oldValue=old?String(old.currentValue??''):'';const today=todayDate();const nextPrice=currentPriceRaw===''?'':parseFloat(currentPriceRaw);const nextValue=currentValueRaw===''?'':parseFloat(currentValueRaw);const priceChanged=currentPriceRaw!=='' && String(nextPrice)!==oldPrice;const valueChanged=currentValueRaw!=='' && String(nextValue)!==oldValue;const payload={type:formType,name,code:document.getElementById('fCode').value.trim(),currency:document.getElementById('fCurrency').value,shares:parseFloat(document.getElementById('fShares').value)||0,avgCost:costRaw===''?'':parseFloat(costRaw),targetPct:targetRaw===''?'':parseFloat(targetRaw),trimPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fTrim').value),trimToPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fTrimTo').value),capPct:(v=>v===''?'':parseFloat(v))(document.getElementById('fCap').value),currentPrice:nextPrice,currentValue:nextValue,priceUpdatedAt:priceChanged?today:(old?.priceUpdatedAt||''),valueUpdatedAt:valueChanged?today:(old?.valueUpdatedAt||''),role:document.getElementById('fRole').value,theme:document.getElementById('fTheme').value,thesis:document.getElementById('fThesis').value.trim(),sellRule:document.getElementById('fSellRule').value.trim(),notes:document.getElementById('fNotes').value.trim(),plans:collect(formType==='etf'?(Number(old?.lastUnitPrice)||((Number(document.getElementById('fShares').value)>0&&Number(nextValue)>0)?Number(nextValue)/Number(document.getElementById('fShares').value):null)):nextPrice),updatedAt:Date.now()};payload.dataFreshness=normalizeDataFreshness(old&&old.dataFreshness);if(priceChanged||valueChanged)touchDataFreshness(payload,'priceUpdatedAt',today);payload.analysisFramework=normalizeAnalysisFramework(old&&old.analysisFramework,payload);payload.analysisScore=calculateAnalysisScore(payload.analysisFramework);if(editingId){const s=state.stocks.find(x=>x.id===editingId);if(s)Object.assign(s,payload)}else state.stocks.push({id:uid(),...payload,createdAt:Date.now()});const returnTab=editModalReturnTab;currentTab=returnTab==='edit'?'edit':formType;saveState();closeModal();render()}

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
function technicalStatusLabel(v){return zhActionStatus(v==='positive'?'positive':(v==='negative'?'negative':'neutral'))}
function valuationStatusLabel(v){return zhActionStatus(v==='positive'?'positive':(v==='negative'?'negative':'neutral'))}
function financialStatusLabel(v){return zhActionStatus(v==='positive'?'positive':(v==='negative'?'negative':'neutral'))}
function fmtTechnicalNumber(v,d=2){return Number(v)>0?fmtMaybe(v,d):'—'}
function decisionPanel(stock){
  const d=decisionForStock(stock);
  const ex=calculateExecutionPlan(stock,portfolioContext());
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">决策引擎 <button class="link-btn" data-detail-action="edit-strategy" style="float:right">编辑策略</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(d.decisionScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">${esc(decisionActionLabel(d.action))}</div></div><div><div class="card-title">仓位</div><div class="card-note">当前 ${fmtMaybe(d.currentWeight,1)}% · 目标 ${fmtMaybe(d.targetWeight,1)}% · 差距 ${fmtMaybe(d.positionGap,1)}%</div><div class="card-note">${esc(d.positionStatus)}</div></div><div><div class="card-title">建议</div><div class="text" style="max-width:none">${esc(d.suggestedAction)}</div></div><div><div class="card-title">风险提示</div><div class="text" style="max-width:none">${(d.warnings||[]).slice(0,3).map(esc).join('<br>')||'—'}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>理由：</b><br>${(d.reasons||[]).slice(0,3).map(esc).join('<br>')}</div><div class="alert" style="margin-top:12px"><b>执行建议</b><br>建议买入金额：${fmtMoney(ex.suggestedBuyAmount)} · 建议股数：${fmtInt(ex.suggestedShares)} · 剩余目标股数：${fmtInt(ex.remainingTargetShares)} · 剩余目标市值：${fmtMoney(ex.remainingTargetValue)}<br>执行状态：${esc(ex.executionStatus)} · ${esc(ex.priceTiming)}<br>${(ex.executionReasons||[]).slice(0,3).map(esc).join('<br>')}${ex.executionWarnings.length?'<br><b>提醒：</b><br>'+ex.executionWarnings.slice(0,3).map(esc).join('<br>'):''}</div></div>`;
}
function actionKindLabel(text,decisionAction){
  const t=String(text||'');
  if(/减仓|卖出|止盈|降低|控制风险|reduce/i.test(t)||decisionAction==='reduce')return '减仓';
  if(/加仓|买入|补仓|建仓|恢复仓位|buy/i.test(t)||decisionAction==='buy'||decisionAction==='strongBuy')return '加仓';
  if(/等待|回调|观察|确认|watch|observe/i.test(t)||decisionAction==='observe')return '等待 / 观察';
  if(/持有|hold/i.test(t)||decisionAction==='hold')return '持有';
  return '观察';
}
function nearestDetailPlan(stock){
  const cp=getComparablePrice(stock);
  const rows=(stock.plans||[]).map(p=>({p,g:planGap(cp,p.price,p.action,p.triggerOn)})).filter(x=>Number(x.p&&x.p.price)>0);
  if(!rows.length)return null;
  rows.sort((a,b)=>{
    const av=a.g?(a.g.triggered?-1000+a.g.absPct:a.g.absPct):9999;
    const bv=b.g?(b.g.triggered?-1000+b.g.absPct:b.g.absPct):9999;
    return av-bv;
  });
  return rows[0];
}
function currentActionPanel(stock){
  const info=getLatestActionInfo(stock);
  const d=decisionForStock(stock);
  const ex=executionForStock(stock);
  const nearest=nearestDetailPlan(stock);
  const tech=info.technicalDecision||calculateTechnicalDecision(stock);
  const alloc=normalizeAllocationDecision(stock.allocationDecision,stock);
  const action=tech&&tech.title?formatChineseText(tech.title):actionKindLabel(info.text,d.action);
  const importedPlan=tradePlanSummaryText(stock);
  const planText=nearest?`${nearest.p.action==='sell'?'减仓':'加仓'} ${fmtInt(nearest.p.shares)} 股/份 @ ${fmtMaybe(nearest.p.price)}${nearest.g?(nearest.g.triggered?' · 已触发':` · 距触发 ${fmt(nearest.g.absPct,1)}%`):''}`:(importedPlan||'暂无价位计划');
  const trigger=nearest?(nearest.p.note||`${nearest.p.action==='sell'?'达到减仓价':'达到加仓价'} ${fmtMaybe(nearest.p.price)}`):'暂无明确触发条件，需结合技术面和计划复核';
  const range=nearest?`参考价位 ${fmtMaybe(nearest.p.price)} 附近`:(ex.suggestedBuyAmount>0?`建议金额 ${fmtMoney(ex.suggestedBuyAmount)} · 建议股数 ${fmtInt(ex.suggestedShares)}`:'暂无建议区间');
  const allocationWarnings=[];
  if(alloc.capitalAllocationView==='unsuitable')allocationWarnings.push('配置决策提示：新增资金暂不建议配置该标的');
  if(alloc.confidence==='low'&&alloc.conclusion)allocationWarnings.push('配置决策置信度较低，需要补充资料');
  const risk=(tech&&tech.riskFlags&&tech.riskFlags.length?zhList(tech.riskFlags):[]).concat(allocationWarnings,(d.warnings||[]).slice(0,2),ex.executionWarnings||[]).slice(0,5);
  const updated=info.updatedAt?(String(info.updatedAt).length>10?new Date(info.updatedAt).toLocaleString('zh-CN'):String(info.updatedAt)):'—';
  const summary=tech&&tech.summary?formatChineseText(tech.summary):formatChineseText(info.text);
  const matched=tech&&tech.triggerMatched&&tech.triggerMatched.length?tech.triggerMatched.map(formatChineseText):[trigger];
  const reasons=tech&&tech.reason&&tech.reason.length?tech.reason.map(formatChineseText):[formatChineseText(info.text)];
  const zone=tech&&tech.suggestedPriceZone?tech.suggestedPriceZone:range;
  const qty=tech&&tech.suggestedQuantity!==null&&tech.suggestedQuantity!==undefined?fmtInt(tech.suggestedQuantity):(nearest?fmtInt(nearest.p.shares):'—');
  const confidence=tech&&tech.confidence?zhConfidence(tech.confidence):'—';
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--seal)"><div class="card-title">当前操作建议</div><div class="dash" style="margin:0"><div><div class="card-num" style="font-size:22px">${esc(action)}</div><div class="card-note">来源：${esc(zhSource(info.source))} · 更新：${esc(updated)} · 置信度 ${esc(confidence)}</div></div><div><div class="card-title">最近计划</div><div class="card-note">${esc(planText)}</div></div><div><div class="card-title">建议价格区间</div><div class="card-note">${esc(zone||'—')}</div></div><div><div class="card-title">建议数量 / 金额</div><div class="card-note">${esc(qty)}${ex.suggestedBuyAmount>0?' · '+fmtMoney(ex.suggestedBuyAmount):''}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>操作提示：</b>${esc(summary)}${englishTextHint(summary)}<br><b>触发条件：</b>${matched.slice(0,3).map(esc).join('；')||'—'}<br><b>原因：</b>${reasons.slice(0,4).map(esc).join('；')||'—'}${risk.length?'<br><b>风险提醒：</b>'+risk.map(formatChineseText).map(esc).join('；'):''}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="copy-full-add-discussion-prompt">复制完整加仓讨论 Prompt</button><button class="btn ghost small" data-detail-action="copy-trade-plan-prompt">复制加仓计划 Prompt</button><button class="btn ghost small" data-detail-action="import-trade-plan-json">导入加仓计划 JSON</button></div></div>`;
}
function shortTermCatalystPanel(stock){
  const rc=normalizeRecentCatalyst(stock.recentCatalyst,stock);
  const ev=normalizeEventExplanation(stock.eventExplanation,stock);
  const today=todayDate();
  const sourceStale=rc.analysisDate===today&&rc.latestSourceDate&&rc.latestSourceDate!==today;
  const has=Boolean(rc.todayCatalyst||rc.recentEvents.length||rc.latestSourceDate);
  const freshnessLabel={fresh:'新鲜',acceptable:'可用',stale:'偏旧',unknown:'未知'}[rc.freshnessStatus]||rc.freshnessStatus||'未知';
  const explanationLabel=ev.priceActionDetected?(ev.canExplainTodayMove?'充分':'不足'):'无异动';
  const staleWarning=sourceStale?'<div class="alert" style="margin-top:8px">分析日期为今天，但最新新闻来源不是今天。</div>':'';
  const eventWarning=ev.priceActionDetected&&!ev.canExplainTodayMove?`<div class="alert" style="margin-top:8px">${esc(ev.warning||'行情异动缺少新闻解释，新闻结论应降权。')}</div>`:'';
  const body=has
    ?`<div class="dash" style="margin:0"><div><div class="card-title">分析日期</div><div class="card-note">${esc(rc.analysisDate||'—')}</div><div class="card-note">回看 ${fmtInt(rc.lookbackDays)} 天</div></div><div><div class="card-title">最新来源</div><div class="card-note">${esc(rc.latestSourceDate||'—')}</div><div class="card-note">${esc(freshnessLabel)}${rc.freshnessDays!==null?` · ${fmtInt(rc.freshnessDays)}天`:''}</div></div><div><div class="card-title">今日新闻</div><div class="card-note">${rc.hasTodayNews?'有':'无'}</div><div class="card-note">${esc(formatChineseText(rc.todayCatalyst||'—'))}</div></div><div><div class="card-title">新闻解释充分性</div><div class="card-note">${esc(explanationLabel)}</div><div class="card-note">${esc(formatChineseText(ev.priceActionType||'—'))}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>近期事件：</b>${rc.recentEvents.slice(0,5).map(formatChineseText).map(esc).join('；')||'—'}<br><b>缺失信息：</b>${rc.missingData.concat(ev.missingData||[]).slice(0,5).map(formatChineseText).map(esc).join('；')||'—'}<br><b>可信度：</b>${esc(zhConfidence(rc.confidence))}<br><b>操作提示：</b>${esc(formatChineseText(rc.actionHint||'—'))}</div>`
    :'暂无短期新闻催化资料；如出现涨停、跳空、放量异动，建议补充新闻解释。';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">短期新闻催化</div>${body}${staleWarning}${eventWarning}<div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="copy-recent-catalyst-prompt">复制短期新闻催化 Prompt</button><button class="btn ghost small" data-detail-action="import-sentiment-json">导入新闻/催化 JSON</button></div></div>`;
}
function shortTermSentimentPanel(stock){
  const st=normalizeShortTermSentiment(stock.shortTermSentiment,stock);
  const ctx=sentimentReviewContext(stock);
  const has=Boolean(st.marketMood||st.fundFlowView||st.sectorHeat||st.institutionalView||st.actionHint||st.riskFlags.length);
  const missing=ctx.importance==='high'
    ?'情绪/新闻资料缺失，对该类成长或主题标的影响较大，配置结论置信度需下调。'
    :ctx.importance==='low'
      ?'情绪/新闻资料未补充，影响有限，主要参考宏观、基本面、估值和技术面。'
      :'情绪/新闻资料未补充，短期市场反馈判断受限。';
  const body=has
    ?`<div class="dash" style="margin:0"><div><div class="card-title">情绪重要性</div><div class="card-num" style="font-size:20px">${sentimentImportanceText(ctx.importance)}</div><div class="card-note">动态判断</div></div><div><div class="card-title">市场情绪</div><div class="card-note">${esc(formatChineseText(st.marketMood||'—'))}</div></div><div><div class="card-title">板块热度</div><div class="card-note">${esc(formatChineseText(st.sectorHeat||'—'))}</div></div><div><div class="card-title">资金流 / 机构</div><div class="card-note">${esc(formatChineseText(st.fundFlowView||'—'))}</div><div class="card-note">${esc(formatChineseText(st.institutionalView||'—'))}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>风险：</b>${zhList(st.riskFlags).slice(0,5).map(esc).join('；')||'—'}<br><b>置信度：</b>${esc(zhConfidence(st.confidence))}<br><b>操作提示：</b>${esc(formatChineseText(st.actionHint||'—'))}</div>`
    :`<div class="alert">${esc(missing)}</div>`;
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">短期情绪 / 资金</div>${body}<div class="card-note" style="margin-top:8px">更新时间：${esc(st.updatedAt||'未更新')}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="copy-short-term-sentiment-prompt">复制短期情绪资金 Prompt</button><button class="btn ghost small" data-detail-action="import-sentiment-json">导入情绪资金 JSON</button></div></div>`;
}
function informationCompletenessPanel(stock){
  const info=normalizeInformationCompleteness(stock.informationCompleteness,stock);
  const label={high:'高',medium:'中',low:'低',unknown:'未知'};
  const chip=(name,value)=>`<span class="chip ${value==='low'?'warn':(value==='high'?'role':'tag')}">${esc(name)} ${esc(label[value]||value||'未知')}</span>`;
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">信息完整度</div><div class="chips">${chip('新闻',info.news)}${chip('资金流',info.fundFlow)}${chip('技术',info.technical)}${chip('估值',info.valuation)}${chip('整体',info.overall)}</div><div class="text" style="max-width:none;margin-top:10px"><b>缺失项：</b>${info.missingItems.slice(0,8).map(formatChineseText).map(esc).join('；')||'—'}${info.warning?`<br><b>提醒：</b>${esc(formatChineseText(info.warning))}`:''}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-sentiment-json">导入信息完整度 JSON</button></div></div>`;
}
function positionPlanPanel(stock){
  const nearest=nearestDetailPlan(stock);
  const planSummary=tradePlanSummaryText(stock);
  const rows=(stock.plans||[]).slice(0,4).map(p=>`${p.action==='sell'?'减仓':'加仓'} ${fmtInt(p.shares)} @ ${fmtMaybe(p.price)} · ${p.note||'—'}`);
  const main=nearest?`${nearest.p.action==='sell'?'减仓':'加仓'} ${fmtInt(nearest.p.shares)} @ ${fmtMaybe(nearest.p.price)}${nearest.g?(nearest.g.triggered?' · 已触发':` · 距触发 ${fmt(nearest.g.absPct,1)}%`):''}`:(planSummary||'暂无明确仓位计划');
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">仓位与加减仓计划</div><div class="text" style="max-width:none"><b>最近计划：</b>${esc(main)}<br><b>计划摘要：</b>${rows.map(esc).join('；')||esc(planSummary||'—')}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="copy-trade-plan-prompt">复制加仓计划 Prompt</button><button class="btn ghost small" data-detail-action="import-trade-plan-json">导入加仓计划 JSON</button></div></div>`;
}
function workflowDateText(dateStr){
  const d=normalizeDateOnly(dateStr);
  if(!d)return '未更新';
  const days=freshnessDays(d);
  return days===null?d:`${d} · ${days}天前`;
}
function workflowCard(title,question,summary,meta,buttons,accent='var(--line)'){
  return `<div class="card" style="border-left:4px solid ${accent}"><div class="card-title">${esc(title)}</div><div class="card-note">${esc(question)}</div><div class="text" style="max-width:none;margin-top:8px">${summary}</div><div class="card-note" style="margin-top:8px">${esc(meta||'')}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap">${buttons}</div></div>`;
}
function decisionWorkflowPanel(stock){
  normalizeStockAnalysis(stock);
  const td=normalizeTechnicalData(stock.technicalData);
  const techDecision=calculateTechnicalDecision(stock);
  const fd=normalizeFinancialData(stock.financialData);
  const fundamental=fundamentalAnalysis(stock);
  const etfAnalysis=etfAnalysisSummary(stock);
  const isEtf=stock.type==='etf';
  const valuationData=normalizeValuationData(stock.valuationData);
  const valuationReview=normalizeValuationReview(stock.valuationReview);
  const reviews=normalizeAiReviews(stock.aiReviews);
  const finReview=reviews.financialReview||null;
  const ad=normalizeAllocationDecision(stock.allocationDecision,stock);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const actionInfo=getLatestActionInfo(stock);
  const nearest=nearestDetailPlan(stock);
  const planSummary=tradePlanSummaryText(stock);
  const techText=formatChineseText(techDecision.summary||td.actionHint||td.technicalSummary||'导入技术面 JSON 后生成短期辅助决策。');
  const techSummary=`<b>${esc(formatChineseText(techDecision.title||'观察'))}</b><br>${esc(techText)}${englishTextHint(techText)}<br><span class="muted">支撑：${(td.supportLevels||[]).slice(0,3).map(esc).join('、')||'—'} · 压力：${(td.resistanceLevels||[]).slice(0,3).map(esc).join('、')||'—'}</span>`;
  const fundamentalSummary=`<b>${fmtMaybe(fundamental.score,1)} / 10 · ${esc(fundamental.conclusion)}</b><br>${esc(formatChineseText(fundamental.finalSummary))}<br><span class="muted">财务 ${fmtMaybe(fundamental.financialScore,1)} · 估值 ${fmtMaybe(fundamental.valuationScore,1)}${fundamental.missing.length?' · '+fundamental.missing.map(esc).join('、'):''}</span>`;
  const etfLayerSummary=`<b>${etfAnalysis.score===null?'—':fmtMaybe(etfAnalysis.score,1)+' / 10'} · ${esc(formatChineseText(etfAnalysis.conclusion))}</b><br>${esc(formatChineseText(etfAnalysis.summary))}<br><span class="muted">指数：${esc(etfAnalysis.indexName||'—')} · 估值：${esc(formatChineseText(etfAnalysis.indexValuationLevel||'—'))} · 分位：${etfAnalysis.historicalPercentile===null?'—':fmtMaybe(etfAnalysis.historicalPercentile,1)+'%'}</span>`;
  const valuationConclusion=String(valuationData.valuationConclusion||valuationReview.summary||'');
  const valuationState=valuationCompleteness(valuationData);
  const valuationHint=valuationState.status==='missing'
    ?valuationState.message
    :valuationState.status==='partial'
      ?valuationState.message
      :(/[偏贵高估]/.test(valuationConclusion)?'估值偏贵，新增资金配置需更谨慎。':'');
  const sentiment=sentimentReviewContext(stock);
  const sentimentHint=sentiment.hasReview?'':sentiment.missingHint;
  const sentimentReview=sentiment.review;
  const sentimentSummary=sentiment.hasReview
    ?`<b>${esc(formatChineseText(sentimentReview.conclusion||'暂无情绪结论'))}</b><br>重要性：${sentimentImportanceText(sentiment.importance)} · 市场情绪：${esc(formatChineseText(sentimentReview.marketMood||'—'))} · 板块热度：${esc(formatChineseText(sentimentReview.sectorHeat||'—'))}<br><span class="muted">机构观点：${esc(formatChineseText(sentimentReview.institutionalView||'—'))} · 资金流：${esc(formatChineseText(sentimentReview.fundFlowView||'—'))}</span>${sentimentReview.riskFlags.length?`<br><span class="muted">风险：${zhList(sentimentReview.riskFlags).slice(0,3).map(esc).join('；')}</span>`:''}`
    :`<b>${sentimentImportanceText(sentiment.importance)}重要性 · 暂无情绪/新闻复核</b><br>${esc(sentiment.missingHint)}`;
  const sentimentButtons=`<button class="btn small" data-detail-action="copy-sentiment-prompt">复制情绪/新闻搜索 Prompt</button><button class="btn ghost small" data-detail-action="import-sentiment-json">导入情绪 Review JSON</button>`;
  const sentimentMeta=sentiment.hasReview?`更新：${workflowDateText(sentimentReview.updatedAt)} · 来源质量 ${zhConfidence(sentimentReview.sourceQuality)} · 置信度 ${zhConfidence(sentimentReview.confidence)}`:`情绪重要性：${sentimentImportanceText(sentiment.importance)} · 未更新`;
  const sentimentWeightHint=sentiment.importance==='high'
    ?'情绪/新闻对该标的影响较高，已纳入配置判断。'
    :sentiment.importance==='low'
      ?'情绪/新闻为辅助参考，主要依据基本面、宏观和估值。'
      :'情绪/新闻对短期市场反馈有中等参考价值。';
  const allocSummary=`<b>${esc(formatChineseText(ad.conclusion||'暂无配置结论'))}</b><br>建议区间：${esc(ad.recommendedWeightRange||'—')} · 目标：${allocationPercentText(ad.recommendedTargetWeight)} · 最大：${allocationPercentText(ad.recommendedMaxWeight)}<br><span class="muted">新增资金：${esc(zhCapitalView(ad.capitalAllocationView))} · 目标调整：${esc(zhTargetAdjustment(ad.targetAdjustment))}</span>${valuationHint?`<br><span class="muted">${esc(valuationHint)}</span>`:''}${sentimentHint?`<br><span class="muted">情绪重要性：${sentimentImportanceText(sentiment.importance)} · ${esc(sentimentHint)}</span>`:''}`;
  const capitalSummary=`<b>${esc(formatChineseText(actionInfo.text||'暂无明确操作，进入分析页复核'))}</b><br>${nearest?`最近计划：${nearest.p.action==='sell'?'减仓':'加仓'} ${fmtInt(nearest.p.shares)} @ ${fmtMaybe(nearest.p.price)}${nearest.g?(nearest.g.triggered?' · 已触发':` · 距触发 ${fmt(nearest.g.absPct,1)}%`):''}`:(formatChineseText(planSummary)||'暂无可执行资金计划')}<br><span class="muted">策略：${esc(zhStrategyRole(strategy.investmentStyle))} · 目标股数 ${fmtInt(strategy.targetShares)} · 偏好金额 ${fmtMoney(strategy.preferredBuyAmount)}</span>`;
  const techButtons=`<button class="btn small" data-detail-action="copy-technical-prompt">复制技术面 Prompt</button><button class="btn ghost small" data-detail-action="import-technical-json">导入技术面 JSON</button>`;
  const fundamentalButtons=`<button class="btn small" data-detail-action="copy-fundamental-prompt">复制基本面分析 Prompt</button><button class="btn ghost small" data-detail-action="import-fundamental-json">导入基本面 JSON</button>`;
  const etfButtons=`<button class="btn small" data-detail-action="copy-etf-analysis-prompt">复制 ETF 分析 Prompt</button><button class="btn ghost small" data-detail-action="import-etf-analysis-json">导入 ETF 分析 JSON</button>`;
  const allocButtons=`<button class="btn small" data-detail-action="view-allocation-detail">查看完整配置分析</button><button class="btn ghost small" data-detail-action="copy-allocation-prompt">复制配置决策 Prompt</button><button class="btn ghost small" data-detail-action="import-allocation-json">导入配置决策 JSON</button>`;
  const capitalButtons=`<button class="btn small" data-detail-action="copy-full-add-discussion-prompt">复制完整加仓讨论 Prompt</button><button class="btn ghost small" data-detail-action="import-trade-plan-json">导入加仓计划 JSON</button>`;
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--seal)"><div class="card-title">五层决策流程</div><div class="card-note">日常按顺序走：技术面 → ${isEtf?'指数行业':'基本面'} → 情绪/新闻 → 配置决策 → 新增资金讨论。其余深度分析和旧工具已折叠到后面。</div><div class="dash" style="margin-top:12px">${workflowCard('1. 技术面','回答：现在是不是买点 / 卖点 / 等待？',techSummary,`技术更新时间：${workflowDateText(td.priceUpdatedAt||td.lastUpdated||normalizeDataFreshness(stock.dataFreshness).technicalUpdatedAt)}`,techButtons,'#3b82f6')}${isEtf?workflowCard('2. 指数行业','回答：指数、行业和宏观是否支持配置？',etfLayerSummary,`ETF分析更新时间：${workflowDateText(etfAnalysis.updatedAt||normalizeDataFreshness(stock.dataFreshness).etfAnalysisUpdatedAt)}`,etfButtons,'#10b981'):workflowCard('2. 基本面','回答：公司好不好，当前价格贵不贵？',fundamentalSummary,`财报 ${workflowDateText(normalizeDataFreshness(stock.dataFreshness).financialUpdatedAt||fd.lastUpdated)} · 估值 ${workflowDateText(normalizeDataFreshness(stock.dataFreshness).valuationUpdatedAt||valuationData.updatedAt||valuationData.lastUpdated)}`,fundamentalButtons,'#10b981')}${workflowCard('3. 情绪/新闻','回答：市场预期、板块热度、新闻和资金流是否支持？',sentimentSummary,sentimentMeta,sentimentButtons,'#8b5cf6')}${workflowCard('4. 策略配置','回答：这只标的值得配置多少？',`${allocSummary}<br><span class="muted">${esc(sentimentWeightHint)}</span>`,`配置更新时间：${ad.updatedAt?workflowDateText(ad.updatedAt):'未更新'} · 置信度 ${zhConfidence(ad.confidence)}`,allocButtons,'#d4a72c')}${workflowCard('5. 资金讨论','回答：今天这笔新增资金给不给它？',capitalSummary,`当前提示来源：${zhSource(actionInfo.source)||'—'}`,capitalButtons,'#ef4444')}</div></div>`;
}
const ALLOCATION_DIMENSION_LABELS={macro:'宏观',industry:'行业',company:'公司',financials:'财报',valuation:'估值',sentiment:'情绪',technical:'技术面'};
const ALLOCATION_TARGET_LABELS={raise:'上调',maintain:'维持',lower:'下调',watch:'观察',reduce:'降低/收缩',unknown:'未知'};
const ALLOCATION_CAPITAL_LABELS={suitable:'适合',conditional:'有条件适合',unsuitable:'不适合',watch:'观察',unknown:'未知'};
function allocationPercentText(v){return v===null||v===undefined||v===''?'—':`${fmtMaybe(v,1)}%`}
function allocationDimensionHtml(key,dim){
  const label=ALLOCATION_DIMENSION_LABELS[key]||key;
  const score=dim.score===null?'—':`${fmtMaybe(dim.score,1)} / 10`;
  return `<details class="card" style="margin:8px 0"><summary class="card-title" style="cursor:pointer">${esc(label)} <span class="muted" style="font-weight:400">· ${esc(score)}</span></summary><div class="text" style="max-width:none;margin-top:8px"><b>结论：</b>${esc(formatChineseText(dim.conclusion||'暂无配置分析'))}<br><b>主要理由：</b>${dim.keyPoints.length?dim.keyPoints.map(formatChineseText).map(esc).join('；'):'—'}<br><b>主要风险：</b>${dim.risks.length?dim.risks.map(formatChineseText).map(esc).join('；'):'—'}</div></details>`;
}
function allocationDimensionDone(dim){
  return Boolean((dim&&dim.conclusion&&String(dim.conclusion).trim())||(dim&&dim.score!==null&&dim.score!==undefined));
}
function allocationCompleteness(ad){
  const done=ALLOCATION_DIMENSIONS.filter(k=>allocationDimensionDone(ad.dimensions[k]));
  const count=done.length;
  const pct=Math.round(count/ALLOCATION_DIMENSIONS.length*100);
  const level=count<=2?'low':(count<=5?'medium':'high');
  return {count,total:ALLOCATION_DIMENSIONS.length,pct,level,done};
}
function allocationList(title,items){
  const arr=Array.isArray(items)?items.filter(Boolean):[];
  return `<div class="card" style="margin-bottom:12px"><div class="card-title">${esc(title)}</div>${arr.length?`<ul class="text" style="max-width:none;margin-top:8px">${arr.map(formatChineseText).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="card-note">暂无内容</div>'}</div>`;
}
function allocationDetailDimensionCard(key,dim){
  const label=ALLOCATION_DIMENSION_LABELS[key]||key;
  const score=dim.score===null?'—':fmtMaybe(dim.score,1);
  return `<details class="card" style="margin-bottom:10px"><summary class="card-title" style="cursor:pointer">${esc(label)} <span class="muted" style="font-weight:400">· 评分 ${esc(score)}</span></summary><div class="text" style="max-width:none;margin-top:10px"><b>结论：</b>${esc(formatChineseText(dim.conclusion||'暂无结论'))}<br><br><b>主要理由：</b>${dim.keyPoints.length?'<ul>'+dim.keyPoints.map(formatChineseText).map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'—'}<b>主要风险：</b>${dim.risks.length?'<ul>'+dim.risks.map(formatChineseText).map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'—'}<b>辅助评分：</b>${esc(score)}</div></details>`;
}
function openAllocationDecisionDetail(){
  if(!detailStockId)return;
  detailSubView='allocation';
  render();
}
function closeAllocationDecisionDetail(){
  detailSubView='';
  render();
}
function renderAllocationDecisionDetail(){
  const s=state.stocks.find(x=>x.id===detailStockId);
  if(!s){detailStockId=null;detailSubView='';render();return}
  normalizeStockAnalysis(s);
  const ad=normalizeAllocationDecision(s.allocationDecision,s);
  const comp=allocationCompleteness(ad);
  const doneSet=new Set(comp.done);
  const dimStatus=ALLOCATION_DIMENSIONS.map(k=>{
    const done=doneSet.has(k);
    return `<span class="chip ${done?'role':'tag'}">${esc(ALLOCATION_DIMENSION_LABELS[k]||k)} ${done?'√':'×'}</span>`;
  }).join('');
  const conclusion=`<div class="card" style="margin-bottom:14px;border-left:4px solid var(--gold)"><div class="entry-head"><div><div class="entry-name">配置决策分析</div><div class="entry-code">${esc(s.name||'未命名标的')} · ${esc(s.code||'无代码')}</div></div><button class="btn ghost small" id="backToStockDetailBtn" type="button">返回标的详情</button></div><div class="dash" style="margin-top:12px"><div><div class="card-title">配置结论</div><div class="text" style="max-width:none">${esc(formatChineseText(ad.conclusion||'暂无配置结论'))}</div></div><div><div class="card-title">建议配置区间</div><div class="card-num" style="font-size:20px">${esc(ad.recommendedWeightRange||'—')}</div><div class="card-note">目标 ${allocationPercentText(ad.recommendedTargetWeight)} · 最大 ${allocationPercentText(ad.recommendedMaxWeight)}</div></div><div><div class="card-title">建议角色</div><div class="card-note">${esc(zhStrategyRole(ad.recommendedRole)||'—')}</div><div class="card-note">目标调整：${esc(zhTargetAdjustment(ad.targetAdjustment||'unknown'))}</div></div><div><div class="card-title">新增资金观点</div><div class="card-note">${esc(zhCapitalView(ad.capitalAllocationView||'unknown'))}</div><div class="card-note">置信度：${esc(zhConfidence(ad.confidence||'low'))}</div></div></div><div class="card-note" style="margin-top:10px">配置更新时间：${esc(ad.updatedAt||'—')}</div></div>`;
  const completeness=`<div class="card" style="margin-bottom:14px"><div class="card-title">数据完整度</div><div class="dash" style="margin:0"><div><div class="card-num">${comp.count} / ${comp.total}</div><div class="card-note">${comp.pct}% · ${esc(zhConfidence(comp.level))}</div></div><div style="grid-column:span 3"><div class="chips">${dimStatus}</div></div></div></div>`;
  const dimensions=`<details class="card" style="margin-bottom:14px"><summary class="card-title" style="cursor:pointer">七个维度分析</summary><div class="card-note" style="margin-top:8px">默认折叠，适合手机端逐项查看。</div><div style="margin-top:10px">${ALLOCATION_DIMENSIONS.map(k=>allocationDetailDimensionCard(k,ad.dimensions[k])).join('')}</div></details>`;
  const valuationDim=ad.dimensions.valuation||{};
  const valuationReview=normalizeValuationReview(s.valuationReview);
  const valuationState=valuationCompleteness(s.valuationData);
  const valuationCompletenessNotice=s.type==='etf'?'':(
    valuationState.status==='partial'
      ?`<div class="alert" style="margin-bottom:14px">估值数据部分完整 ${valuationState.score}%。已有字段：${esc(valuationState.completedFields.join('、')||'无')}；缺失字段：${esc(valuationState.missingFields.join('、')||'无')}。配置决策可基于已有字段判断，但应注明置信度限制。</div>`
      :valuationState.status==='missing'
        ?'<div class="alert" style="margin-bottom:14px">估值数据缺失，配置决策置信度需下调。</div>'
        :''
  );
  const valuationNotice=(!allocationDimensionDone(valuationDim)&&hasValuationReview(valuationReview))?'<div class="alert" style="margin-bottom:14px">已有估值复核数据，但配置决策尚未重新生成，建议重新复制配置决策 Prompt。</div>':'';
  const notes=`<div class="card" style="margin-bottom:12px"><div class="card-title">分析备注</div><div class="text" style="max-width:none;margin-top:8px">${esc(formatChineseText(ad.notes||'暂无备注'))}</div></div>`;
  document.getElementById('summary').innerHTML=`配置决策分析 · <strong>${esc(s.name||'未命名标的')}</strong> · ${esc(s.code||'无代码')}`;
  document.getElementById('main').innerHTML=`${conclusion}${allocationList('配置理由',ad.allocationReasons)}${allocationList('核心风险',ad.keyRisks)}${allocationList('建议动作',ad.suggestedActions)}${notes}${completeness}${valuationCompletenessNotice}${valuationNotice}${dimensions}`;
  document.getElementById('backToStockDetailBtn').addEventListener('click',closeAllocationDecisionDetail);
}
function allocationPromptSchema(){
  const dim={conclusion:'',keyPoints:[],risks:[],score:null};
  return {
    allocationDecision:{
      symbol:'',
      updatedAt:'',
      conclusion:'',
      recommendedWeightRange:'',
      recommendedTargetWeight:null,
      recommendedMaxWeight:null,
      recommendedRole:'',
      targetAdjustment:'raise | maintain | lower | watch | reduce | unknown',
      capitalAllocationView:'suitable | conditional | unsuitable | watch | unknown',
      confidence:'low | medium | high',
      dimensions:{macro:dim,industry:dim,company:dim,financials:dim,valuation:dim,sentiment:dim,technical:dim},
      allocationReasons:[],
      keyRisks:[],
      suggestedActions:[],
      notes:''
    }
  };
}
function allocationDecisionContext(stock){
  normalizeStockAnalysis(stock);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const total=getEstimatedTotalAssets();
  const position=getPositionInfo(stock,total);
  const td=normalizeTechnicalData(stock.technicalData);
  const reviews=normalizeAiReviews(stock.aiReviews);
  const currentAction=getLatestActionInfo(stock);
  const sentiment=sentimentReviewContext(stock);
  return {
    stock:{
      name:stock.name||'',
      symbol:stock.code||stock.symbol||'',
      type:stock.type||'',
      marketType:stockMarketTypeLabel(stock),
      shares:Number(stock.shares)||0,
      avgCost:stock.avgCost||'',
      currentPrice:getComparablePrice(stock)||stock.currentPrice||td.price||'',
      marketValue:getMarketValue(stock)||0,
      currentWeight:position&&position.actualPct!==null?Number(position.actualPct.toFixed(2)):null,
      targetWeight:strategy.targetWeight,
      maxWeight:strategy.maxWeight,
      role:stock.role||'',
      theme:stock.theme||'',
      strategyNotes:strategy.notes||'',
      isWatchOnly:stock.type==='watching'||strategy.investmentStyle==='watchOnly'||/观察/.test(String(stock.role||''))
    },
    currentAction:{text:currentAction.text||'',source:currentAction.source||'',updatedAt:currentAction.updatedAt||''},
    technicalData:td,
    technicalDecision:calculateTechnicalDecision(stock),
    fundamental:stock.type==='etf'?null:fundamentalSummaryForPrompt(stock),
    valuationCompleteness:stock.type==='etf'?null:valuationCompleteness(stock.valuationData),
    etfAnalysis:stock.type==='etf'?etfAnalysisSummary(stock):null,
    sentimentImportance:sentiment.importance,
    sentimentReview:sentiment.review,
    sentimentMissingHint:sentiment.missingHint,
    sourceQuality:sentiment.review.sourceQuality,
    sentimentConfidence:sentiment.review.confidence,
    socialReview:reviews.socialReview||null,
    newsReview:reviews.newsReview||null,
    comprehensiveReview:reviews.comprehensiveReview||null,
    buyPlans:(stock.plans||[]).filter(p=>(p.action||'buy')==='buy'),
    sellPlans:(stock.plans||[]).filter(p=>p.action==='sell'),
    tradePlan:stock.tradePlan||null,
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
}
function allocationDecisionPromptText(stock){
  const ctx=allocationDecisionContext(stock);
  return [
    '你是一名谨慎的投资组合配置决策复核助手。',
    '',
    '请注意：配置决策回答“这只标的值得配置多少”，不是回答“现在是否行动”。',
    '请不要输出确定性买卖指令，不要替我自动调整仓位，只做配置区间、目标仓位和新增资金适配度复核。',
    '',
    '请只基于我提供的资料分析；资料不足时请明确写 confidence low，不要编造缺失数据。',
    chineseOutputPromptRule(),
    '',
    '【当前标的信息与已有分析】',
    JSON.stringify(ctx,null,2),
    '',
    '【分析要求】',
    '主流程已包含五层：技术面、基本面/指数行业、情绪/新闻、配置决策、新增资金讨论。',
    '情绪/新闻层已经进入主流程，请结合 sentimentImportance 和 sentimentReview 动态判断权重。',
    stock.type==='etf'?'请使用 ETF 配置框架分析：宏观、指数/行业、指数估值、成分质量、技术面、情绪/资金流、组合配置价值。不要要求分析基金公司财报、现金流、ROE 或扣非净利润。':'请从七个维度进行配置分析：宏观、行业、公司、基本面中的财务质量、基本面中的估值水平、情绪、技术面。',
    '每个维度必须输出：结论、主要理由、主要风险、辅助评分。评分仅作为辅助，文字分析优先。',
    stock.type==='etf'?'':'估值完整度规则：如果 valuationData 中至少已有 PE TTM、PB、PS、EV/EBITDA、历史估值分位任一字段，不得写“估值数据缺失”。应写“估值数据不完整，已有字段为：xxx；缺失字段为：xxx”。',
    stock.type==='etf'?'':'请读取 valuationCompleteness：如果 level=partial，必须写“估值数据部分完整”，列出 completedFields 和 missingFields；根据已有字段给出估值判断，但降低置信度。',
    stock.type==='etf'?'':'如果 valuationCompleteness.level=complete，可写“估值数据较完整，可支持配置决策”；如果 level=missing，才允许写“估值数据缺失”。',
    stock.type==='etf'?'':'估值维度 conclusion 应基于已有字段判断，但必须注明置信度限制。例如：已有 PE TTM，缺少 PB、PS、EV/EBITDA 和历史分位，因此估值结论为合理偏贵，但置信度中等偏低。',
    '情绪维度采用动态权重，不要固定同等权重。请根据 sentimentImportance、标的类型、主题、角色和投资风格判断情绪/新闻的重要性。',
    '如果 sentimentImportance = high 且 sentimentReview 缺失，必须提示“情绪资料缺失对该标的影响较大，置信度下调”。',
    '如果 sentimentImportance = low 且 sentimentReview 缺失，不得过度惩罚，应提示“情绪资料缺失，影响有限”。',
    '',
    '最终请判断：',
    '- 是否值得配置',
    '- 建议配置区间',
    '- 建议目标仓位',
    '- 建议最大仓位',
    '- 建议角色',
    '- 是否适合新增资金',
    '- 是否建议上调/维持/下调目标',
    '- 主要配置理由',
    '- 核心风险',
    '- 建议动作',
    '- 置信度',
    '',
    '输出要求：',
    '- 先给简短可读结论。',
    '- 最后输出一个可导入投资手册的 allocationDecision JSON。',
    '- JSON 必须使用英文半角双引号，不要使用中文弯引号。',
    '- 不要自动修改 targetWeight / maxWeight，只给 recommendedTargetWeight / recommendedMaxWeight 建议。',
    '',
    '请严格使用以下 JSON 结构：',
    JSON.stringify(allocationPromptSchema(),null,2)
  ].join('\n');
}
function copyAllocationDecisionPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(allocationDecisionPromptText(stock),'配置决策 Prompt 已复制。');
}
function allocationDecisionPanel(stock){
  const ad=normalizeAllocationDecision(stock.allocationDecision,stock);
  const empty=!(ad.conclusion||ad.recommendedWeightRange||ad.recommendedTargetWeight!==null||ad.recommendedMaxWeight!==null);
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--gold)"><div class="card-title">配置决策</div><div class="dash" style="margin:0"><div><div class="card-title">配置结论</div><div class="text" style="max-width:none">${esc(formatChineseText(ad.conclusion||'暂无配置决策'))}</div><div class="card-note">更新：${esc(ad.updatedAt||'—')} · 置信度 ${esc(zhConfidence(ad.confidence||'low'))}</div></div><div><div class="card-title">配置区间</div><div class="card-num" style="font-size:20px">${esc(ad.recommendedWeightRange||'—')}</div><div class="card-note">建议目标 ${allocationPercentText(ad.recommendedTargetWeight)} · 最大 ${allocationPercentText(ad.recommendedMaxWeight)}</div></div><div><div class="card-title">目标调整</div><div class="card-note">${esc(zhTargetAdjustment(ad.targetAdjustment||'unknown'))}</div></div><div><div class="card-title">新增资金观点</div><div class="card-note">${esc(zhCapitalView(ad.capitalAllocationView||'unknown'))}</div></div></div>${empty?'<div class="card-note" style="margin-top:10px">尚未导入配置决策。可复制 Prompt 给 GPT 复核后导入 JSON。</div>':''}<div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="view-allocation-detail">查看完整配置分析</button><button class="btn ghost small" data-detail-action="copy-allocation-prompt">复制配置决策 Prompt</button><button class="btn ghost small" data-detail-action="import-allocation-json">导入配置决策 JSON</button></div></div>`;
}
function detailHeroPanel(s,mv,actual,deviation){
  const category=s.type==='etf'?'ETF':(s.type==='watching'?'观察标的':'个股');
  const current=s.type==='etf'?fmtMaybe(s.lastUnitPrice||((Number(s.currentValue)>0&&Number(s.shares)>0)?Number(s.currentValue)/Number(s.shares):s.currentPrice),2):fmtMaybe(s.currentPrice);
  const date=s.type==='etf'?(s.valueUpdatedAt||s.priceUpdatedAt):(s.priceUpdatedAt||s.valueUpdatedAt);
  const chg=(typeof s.dailyChange==='number'&&!isNaN(s.dailyChange))?`${s.dailyChange>=0?'+':''}${s.dailyChange.toFixed(2)}%`:'—';
  const currency=getCurrency(s)||'—';
  const actualText=actual===null?'—':actual.toFixed(1)+'%';
  return `<div class="card detail-title-card"><div class="entry-head"><div><div class="entry-name">${esc(s.name||'未命名标的')}</div><div class="entry-code">${esc(s.code||'无代码')} · ${esc(category)}</div></div><div class="detail-title-actions"><button class="btn ghost small" data-detail-action="long-logic" type="button">长期逻辑</button><button class="btn small" data-detail-action="refresh" type="button">${s.type==='etf'?'刷新市值':'刷新价格'}</button><button class="btn ghost small" id="backToListBtn" type="button">返回列表</button></div></div></div><div class="card core-summary-card"><div class="card-title">核心数据摘要</div><div class="core-summary-grid"><div class="core-summary-item"><span>成本</span><strong>${fmtMaybe(s.avgCost)}</strong></div><div class="core-summary-item"><span>现价</span><strong>${current}</strong></div><div class="core-summary-item"><span>持仓</span><strong>${fmtInt(s.shares)}</strong></div><div class="core-summary-item"><span>市值</span><strong>${fmtMoney(mv)}</strong></div><div class="core-summary-item"><span>目标</span><strong>${fmtMaybe(s.targetPct,1)}%</strong></div><div class="core-summary-item"><span>实际</span><strong>${actualText}</strong></div></div><div class="core-summary-meta">更新 ${esc(date||'—')} · ${esc(s.code||'无代码')} · ${esc(currency)} · ${esc(chg)} · 偏差 ${esc(deviation)}</div></div>`;
}
function detailToolsPanel(s){
  return `<details class="card" style="margin-top:14px;margin-bottom:14px"><summary class="card-title" style="cursor:pointer">详情工具</summary><div class="card-note" style="margin:8px 0 12px">这些是维护、导入和生成提示词工具，已从首屏下移，避免干扰日常分析。</div><div class="actions"><button class="btn small" data-detail-action="ai-assistant">AI助手</button><button class="btn ghost small" data-detail-action="financial-source">财报助手</button><button class="btn ghost small" data-detail-action="valuation-source">估值助手</button><button class="btn ghost small" data-detail-action="template">套用分析模板</button><button class="btn ghost small" data-detail-action="ai-prompt">生成分析提示词</button><button class="btn ghost small" data-detail-action="ai-import">导入AI分析JSON</button><button class="btn ghost small" data-detail-action="ai-strategy-import">导入AI策略JSON</button><button class="btn ghost small" data-detail-action="refresh">${s.type==='etf'?'刷新市值':'刷新价格'}</button><button class="btn ghost small" data-detail-action="edit">编辑标的</button></div></details>`;
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
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">技术面自动评分 <button class="link-btn" data-detail-action="edit-technical" style="float:right">编辑技术数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.technicalScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(technicalStatusLabel(sig.technicalStatus))}</div></div><div><div class="card-title">历史价格</div><div class="card-note">${history.length} 条 · 最近 ${esc(last)}</div></div><div><div class="card-title">均线</div><div class="card-note">MA20 ${fmtTechnicalNumber(td.ma20,2)} · MA60 ${fmtTechnicalNumber(td.ma60,2)} · MA120 ${fmtTechnicalNumber(td.ma120,2)}</div></div><div><div class="card-title">支撑 / 压力</div><div class="card-note">${fmtTechnicalNumber(td.supportPrice,2)} / ${fmtTechnicalNumber(td.resistancePrice,2)} · ${esc(td.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(formatChineseText(sig.technicalSummary))}<br><b>信号：</b><br>${zhBreakList(sig.signals)}<br><b>提醒：</b><br>${zhBreakList(sig.warnings)}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-history">导入历史价格CSV</button><button class="btn ghost small" data-detail-action="update-technical-history">从历史价格更新技术数据</button><button class="btn ghost small" data-detail-action="apply-technical">应用到九模块技术评分</button></div></div>`;
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
function cyclePositionText(value){return zhEnum(value)||'待判断'}
function fmtPctMaybe(v,d=1){
  const n=Number(v);
  return isFinite(n)?`${fmt(n,d)}%`:'待补充';
}
function pricePositionText(pp){
  const p=pp||{};
  const parts=[];
  if(p.lookbackDays)parts.push(`${fmtInt(p.lookbackDays)}日`);
  if(p.currentPercentile!==null&&p.currentPercentile!==undefined)parts.push(`分位 ${fmtPctMaybe(p.currentPercentile)}`);
  if(p.distanceToCycleHighPct!==null&&p.distanceToCycleHighPct!==undefined)parts.push(`距高点 ${fmtPctMaybe(p.distanceToCycleHighPct)}`);
  if(p.distanceToCycleLowPct!==null&&p.distanceToCycleLowPct!==undefined)parts.push(`距低点 ${fmtPctMaybe(p.distanceToCycleLowPct)}`);
  if(p.high>0||p.low>0)parts.push(`区间 ${p.low>0?fmtMaybe(p.low,2):'—'} - ${p.high>0?fmtMaybe(p.high,2):'—'}`);
  return parts.length?parts.join(' · '):'待补充';
}
function cycleTechnicalPriceText(cy){
  const pp={
    lookbackDays:cy&&cy.lookbackDays,
    high:cy&&cy.cycleHigh,
    low:cy&&cy.cycleLow,
    currentPercentile:cy&&cy.currentPercentile,
    distanceToCycleHighPct:cy&&cy.distanceToCycleHighPct,
    distanceToCycleLowPct:cy&&cy.distanceToCycleLowPct
  };
  return pricePositionText(pp);
}
function supportZonesText(zones){
  const arr=Array.isArray(zones)?zones:[];
  if(!arr.length)return '待补充';
  return arr.map(z=>{
    const range=Array.isArray(z.range)?z.range:[];
    const rangeText=range.length===2?`${fmtMaybe(range[0],2)}-${fmtMaybe(range[1],2)}`:(range.length===1?fmtMaybe(range[0],2):'—');
    const type=formatChineseText(z.type||'');
    const hint=formatChineseText(z.actionHint||'');
    return `<span class="pill">${esc([rangeText,type,hint].filter(Boolean).join(' · '))}</span>`;
  }).join(' ');
}
function technicalAnalysisPromptText(stock){
  normalizeStockAnalysis(stock);
  const td=normalizeTechnicalData(stock.technicalData);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const schema={technicalReview:{updatedAt:'',inputCoverage:{hasRecentKline:false,hasCycleKline:false,cycleDataSource:'none',warning:''},shortTermTechnical:{lookbackDays:120,price:null,priceUpdatedAt:'',ma5:null,ma10:null,ma20:null,ma60:null,trendStatus:'',supportLevels:[],resistanceLevels:[],technicalSummary:'',riskFlags:[],actionHint:''},cycleTechnical:{lookbackDays:500,cyclePosition:'unclear',cycleSummary:'',cycleHigh:null,cycleLow:null,currentPercentile:null,distanceToCycleHighPct:null,distanceToCycleLowPct:null,lastCycleUpdatedAt:'',dataSource:'none'},priceActionEvent:{detected:false,type:'',changePct:null,volumeStatus:'',needsNewsExplanation:false},finalTechnicalConclusion:'',holdHint:'',addHint:'',reduceHint:''}};
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
    '',
    '更新模式：',
    'A. 完整技术面更新：如果我同时提供最近60/120日K线和最近500日/近2年K线，请同时更新 shortTermTechnical、cycleTechnical、finalTechnicalConclusion、holdHint、addHint、reduceHint。',
    'B. 日常技术面更新：如果我只提供最近60/120日K线，请只更新 shortTermTechnical；不要重新判断500日周期位置；inputCoverage.hasCycleKline=false；cycleDataSource="previous_saved"；warning="本次未提供500日K线，周期位置沿用上次结果。"',
    '',
    '请参考最近 120 日 K 线做短中期交易判断，并且只有在提供最近 500 日或近 2 年日线图时，才做大周期位置判断。',
    '请重点识别 MA5、MA10、MA20、MA60、MACD、成交量、前高、前低和近期平台区间。',
    '不要联网，不要编造截图里看不见的数据；看不清或无法判断的字段请填 null、空字符串或空数组。',
    '不要给确定性买卖指令，只输出技术面辅助判断。',
    '重要原则：趋势强 ≠ 低位安全买点。trendStatus=uptrend 只代表趋势方向，不代表适合追高。',
    '只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
    chineseOutputPromptRule(),
    'JSON 必须可以直接粘贴进程序导入：',
    '- 所有 key 和字符串必须使用英文半角双引号 "，禁止使用中文弯引号 “ ” 或 ‘ ’。',
    '- 不要在 JSON 前后添加任何说明文字。',
    '- 不要使用尾逗号、注释、人民币/港币等单位后缀。',
    '- 无法判断的数字字段填 null，不要填“未知”“无法判断”等文字。',
    '- 顶层只能是一个 JSON 对象，且必须包含 technicalReview，不要包在 markdown 或代码块里。',
    '',
    '当前股票上下文：',
    JSON.stringify(ctx,null,2),
    '',
    '输出字段要求：',
    '- shortTermTechnical：近期60/120日技术面，包含价格、MA5/MA10/MA20/MA60、趋势、支撑压力、摘要、风险和 actionHint。',
    '- cycleTechnical：500日/近2年周期位置。只有提供大周期图时才更新；否则沿用 previous_saved。',
    '- priceActionEvent：如果出现涨停、跳空、放量大涨、大跌、冲高回落等事件，请标记 detected=true，并说明是否需要新闻解释。',
    '- finalTechnicalConclusion：综合短期技术和周期位置的一句话结论。',
    '- holdHint：核心仓如何处理。',
    '- addHint：新增资金如何处理。',
    '- reduceHint：是否需要兑现利润或减仓。',
    '',
    '大周期判断规则：',
    '- 如果当前价格处于近 500 日区间 80% 以上，并且距离近 500 日高点小于 10%，不得判断为 low_base 或 early_uptrend。',
    '- 如果股价曾从前高回调超过 15%-25%，随后重新接近前高，优先判断为 high_level_rebreakout。',
    '- 如果短期涨幅过快、远离 MA20、接近前高，同时量能异常放大，标记 high_level_overextension。',
    '- 如果放量冲高回落、跌破 MA20 或关键平台，并伴随 MACD 走弱，可标记 distribution_risk。',
    '- 对高位二次上攻，应明确提示“趋势仍强，但不属于低位安全买点”。',
    '- 工业富联这类当前价接近前高、近两年低点大幅抬升后的标的，不应输出 low_base 或 early_uptrend。',
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
function tradePlanPromptText(stock){
  const strategy=normalizeStrategy(stock.strategy,stock);
  const td=normalizeTechnicalData(stock.technicalData);
  const techDecision=calculateTechnicalDecision(stock);
  const review=normalizeAiReviews(stock.aiReviews).comprehensiveReview||null;
  const fundamental=fundamentalSummaryForPrompt(stock);
  const etfAnalysis=etfAnalysisSummary(stock);
  const ctx={
    stockName:stock.name||'',
    symbol:stock.code||stock.symbol||'',
    shares:Number(stock.shares)||0,
    avgCost:stock.avgCost||'',
    currentPrice:getComparablePrice(stock)||stock.currentPrice||td.price||'',
    marketValue:getMarketValue(stock)||0,
    strategy:{
      targetWeight:strategy.targetWeight,
      maxWeight:strategy.maxWeight,
      minWeight:strategy.minWeight,
      targetShares:strategy.targetShares,
      minTradeUnit:strategy.minTradeUnit,
      preferredBuyAmount:strategy.preferredBuyAmount,
      maxSingleBuyAmount:strategy.maxSingleBuyAmount,
      buyAggressiveness:strategy.buyAggressiveness,
      investmentStyle:strategy.investmentStyle,
      convictionLevel:strategy.convictionLevel,
      notes:strategy.notes
    },
    technicalData:td,
    technicalDecision:techDecision,
    existingPlans:stock.plans||[],
    existingTradePlan:stock.tradePlan||null,
    aiComprehensiveReview:review
  };
  const schema={
    symbol:'',
    planType:'add | reduce | hold | observe',
    planSummary:'',
    validUntil:'',
    planItems:[{
      action:'add | reduce | observe | hold',
      triggerPrice:null,
      priceZone:'',
      quantity:null,
      amountEstimate:null,
      condition:'',
      technicalCondition:'',
      riskControl:'',
      priority:1,
      note:''
    }],
    riskFlags:[],
    invalidConditions:[],
    reviewRequired:true
  };
  return [
    '你是一名谨慎的交易计划整理助手。',
    '',
    '当前任务：根据我提供的持仓、策略、技术面、现有计划和用户偏好，生成“加仓/减仓/观察计划”。',
    '这不是买卖指令，不要替我自动拍板；只生成供人工确认的结构化计划。',
    '',
    '重要约束：',
    '- 如果是观察仓、watchOnly、或当前 shares 已接近 targetShares，默认不要主动扩大仓位。',
    '- 技术面 uptrend 也不等于立即加仓；必须结合支撑位、压力位、计划价和风险。',
    '- 如果价格未到计划区，请写 observe 或 hold，并说明“未触发”。',
    '- 不要输出确定性买卖命令，只输出辅助决策计划。',
    '- 数量必须尊重 minTradeUnit；如果不确定，quantity 填 null。',
    '- triggerPrice 只能填明确价位，无法确定填 null。',
    '- 只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
    `- ${chineseOutputPromptRule()}`,
    '- 所有 key 和字符串必须使用英文半角双引号 "，禁止中文弯引号。',
    '',
    '当前上下文：',
    JSON.stringify(ctx,null,2),
    '',
    '请严格输出以下 JSON 结构，顶层只能包含这些字段：',
    JSON.stringify(schema,null,2),
    '',
    '示例偏好：如果当前是观察仓、持仓100、targetShares=100、技术面提示关注445支撑、现有420附近加仓计划，则更合理的 planType 是 observe；planSummary 应表达“420附近仅观察加仓，未跌到计划区不主动扩大，跌破关键支撑重新评估”。'
  ].join('\n');
}
function copyTradePlanPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(tradePlanPromptText(stock),'加仓计划 Prompt 已复制。');
}
function formatPlanForDiscussion(stock,p){
  const action=(p.action||'buy')==='sell'?'减仓':'加仓';
  return `- ${action}：触发价 ${fmtMaybe(p.price)}，数量 ${fmtInt(p.shares)}，${planDistanceText(stock,p)}，备注：${p.note||'未填写'}`;
}
function fullAddDiscussionPromptText(stock){
  const strategy=normalizeStrategy(stock.strategy,stock);
  const td=normalizeTechnicalData(stock.technicalData);
  const techDecision=calculateTechnicalDecision(stock);
  const info=getLatestActionInfo(stock);
  const total=getEstimatedTotalAssets();
  const pos=getPositionInfo(stock,total);
  const cp=getComparablePrice(stock)||stock.currentPrice||td.price||null;
  const mv=getMarketValue(stock);
  const currentShares=stockCurrentShares(stock);
  const buyPlans=(stock.plans||[]).filter(p=>(p.action||'buy')==='buy');
  const sellPlans=(stock.plans||[]).filter(p=>p.action==='sell');
  const review=normalizeAiReviews(stock.aiReviews).comprehensiveReview||null;
  const sentiment=sentimentReviewContext(stock);
  const fundamental=stock.type==='etf'?null:fundamentalSummaryForPrompt(stock);
  const etfAnalysis=stock.type==='etf'?etfAnalysisSummary(stock):null;
  const isWatchOnly=strategy.investmentStyle==='watchOnly'||stock.type==='watching'||/观察/.test(String(stock.role||''));
  const targetFull=Number(strategy.targetShares)>0&&currentShares>=Number(strategy.targetShares)*.95;
  const constraints=[];
  if(isWatchOnly)constraints.push('当前为观察仓 / watchOnly，默认不主动扩大仓位，需要条件触发后再考虑加仓。');
  if(targetFull)constraints.push(`当前持仓 ${fmtInt(currentShares)} 股，已接近或达到目标股数 ${fmtInt(strategy.targetShares)} 股。`);
  if(buyPlans.length)constraints.push('存在已有加仓计划，新增资金应优先复核原计划是否仍有效。');
  const planLines=[...buyPlans,...sellPlans].map(p=>formatPlanForDiscussion(stock,p));
  const outputJson={
    latestAction:'',
    actionHint:'',
    buyPlans:[],
    sellPlans:[],
    riskFlags:[],
    notes:''
  };
  return [
    `你是一名谨慎的投资决策复核助手。`,
    '',
    stock.type==='etf'?`我想讨论是否可以用新增资金配置【${stock.name||'未填写'}】。请不要直接给确定性买卖指令，只做条件化分析和配置计划复核。`:`我想讨论是否可以用新增资金加仓【${stock.name||'未填写'}】。请不要直接给确定性买卖指令，只做条件化分析和加仓计划复核。`,
    '',
    '【股票信息】',
    `- 股票名称：${stock.name||'未填写'}`,
    `- symbol：${stock.code||stock.symbol||'未填写'}`,
    `- 当前持仓：${fmtInt(currentShares)} 股/份`,
    `- 成本价：${stock.avgCost!==''&&stock.avgCost!==undefined?stock.avgCost:'未填写'}`,
    `- 当前价格：${cp!==null&&cp!==undefined?fmtMaybe(cp):'暂无数据'}`,
    `- 当前市值：${mv!==null&&mv!==undefined?fmtMoney(mv):'暂无数据'}`,
    `- 当前角色：${stock.role||'未填写'}`,
    `- 行业/主题：${stock.theme||'未填写'}`,
    `- 当前实际仓位：${pos&&pos.actualPct!==null?fmt(pos.actualPct,1)+'%':'暂无数据'}`,
    '',
    '【我的策略约束】',
    `- 目标仓位：${fmtMaybe(strategy.targetWeight,1)}%`,
    `- 最大仓位：${fmtMaybe(strategy.maxWeight,1)}%`,
    `- 最小仓位：${fmtMaybe(strategy.minWeight,1)}%`,
    `- 目标股数：${fmtInt(strategy.targetShares)}`,
    `- 最低交易单位：${fmtInt(strategy.minTradeUnit)}`,
    `- 单次偏好加仓金额：${fmtMoney(strategy.preferredBuyAmount)}`,
    `- 最大单次加仓金额：${fmtMoney(strategy.maxSingleBuyAmount)}`,
    `- 加仓风格：${strategy.buyAggressiveness||'未填写'}`,
    `- 投资风格：${strategy.investmentStyle||'未填写'}`,
    `- 信心等级：${fmtMaybe(strategy.convictionLevel,1)}/10`,
    `- 策略备注：${strategy.notes||'未填写'}`,
    `- 关键约束：${constraints.length?constraints.join('；'):'暂无特殊约束'}`,
    '',
    '【新增资金背景】',
    '- 本次讨论假设有新增资金可用，但是否用于该股票需要结合仓位、技术面、计划价和风险复核。',
    '- 新增资金判断需按五层流程复核：技术面、基本面/指数行业、情绪/新闻、配置决策、当前仓位。',
    '- 请优先判断“是否应该现在用新增资金加仓”，而不是默认一定要买。',
    '- 如果资料不足，请明确写“仅观察”或“条件触发后再考虑”。',
    '',
    '【当前技术面】',
    `- trendStatus：${td.trendStatus||'暂无数据'}`,
    `- 当前技术价格：${td.price!==null&&td.price!==undefined?fmtMaybe(td.price):'暂无数据'}`,
    `- MA5 / MA10 / MA20 / MA60：${fmtMaybe(td.ma5)} / ${fmtMaybe(td.ma10)} / ${fmtMaybe(td.ma20)} / ${fmtMaybe(td.ma60)}`,
    `- 支撑位：${(td.supportLevels||[]).length?td.supportLevels.join('、'):'暂无数据'}`,
    `- 压力位：${(td.resistanceLevels||[]).length?td.resistanceLevels.join('、'):'暂无数据'}`,
    `- 技术摘要：${td.technicalSummary||'暂无数据'}`,
    `- 技术风险：${(td.riskFlags||[]).length?td.riskFlags.join('；'):'暂无数据'}`,
    `- 技术 actionHint：${td.actionHint||'暂无数据'}`,
    '',
    '【当前系统自动操作建议】',
    `- 当前操作建议来源：${info.source||'暂无数据'}`,
    `- 当前操作建议：${info.text||'暂无数据'}`,
    `- technicalDecision.decision：${techDecision.decision}`,
    `- technicalDecision.title：${techDecision.title}`,
    `- technicalDecision.summary：${techDecision.summary}`,
    `- technicalDecision.reason：${(techDecision.reason||[]).join('；')||'暂无数据'}`,
    `- technicalDecision.triggerMatched：${(techDecision.triggerMatched||[]).join('；')||'暂无数据'}`,
    `- technicalDecision.riskFlags：${(techDecision.riskFlags||[]).join('；')||'暂无数据'}`,
    `- technicalDecision.suggestedPriceZone：${techDecision.suggestedPriceZone||'暂无数据'}`,
    `- AI 综合复核：${review?JSON.stringify(review,null,2):'暂无数据'}`,
    '',
    '【情绪 / 新闻复核】',
    `- 情绪重要性：${sentimentImportanceText(sentiment.importance)}（${sentiment.importance}）`,
    `- 情绪缺失提示：${sentiment.missingHint||'已有情绪资料'}`,
    `- sentimentReview：${sentiment.hasReview?JSON.stringify(sentiment.review,null,2):'暂无数据'}`,
    stock.type==='etf'||sentiment.importance==='low'
      ?'- 对资源/宽基ETF等标的：情绪缺失不作为主要否决项，重点看宏观、商品价格、指数估值和技术面。'
      :'- 对 AI科技/成长/主题标的：如果缺少情绪和资金流资料，不建议仅因主题热度直接加仓。',
    '',
    stock.type==='etf'?'【当前指数/行业分析】':'【当前基本面】',
    ...(stock.type==='etf'?[
      `- ETF配置结论：${etfAnalysis.conclusion}`,
      `- ETF分析评分：${etfAnalysis.score===null?'暂无数据':etfAnalysis.score+'/10'}`,
      `- 跟踪指数：${etfAnalysis.indexName||'暂无数据'}`,
      `- 指数估值：${etfAnalysis.indexValuationLevel||'暂无数据'}`,
      `- 历史分位：${etfAnalysis.historicalPercentile===null?'暂无数据':etfAnalysis.historicalPercentile+'%'}`,
      `- 行业/宏观：${etfAnalysis.industryTrend||'暂无数据'} / ${etfAnalysis.macroView||'暂无数据'}`,
      `- 成分质量：${etfAnalysis.constituentQuality||'暂无数据'}`,
      `- 流动性与跟踪风险：${etfAnalysis.liquidityView||'暂无数据'} / ${etfAnalysis.trackingRisk||'暂无数据'}`,
      `- 操作提示：${etfAnalysis.actionHint||'暂无数据'}`,
      '- 请重点讨论新增资金是否适合配置该 ETF、该 ETF 是否比个股更适合作为组合配置工具、当前指数/行业估值是否支持配置。'
    ]:[
      `- 基本面结论：${fundamental.conclusion}`,
      `- 基本面评分：${fundamental.score}/10`,
      `- 缺失提示：${fundamental.missing&&fundamental.missing.length?fundamental.missing.join('；'):'暂无'}`,
      `- 基本面摘要：${fundamental.summary||'暂无数据'}`,
      `- 财务质量：${fundamental.financial?JSON.stringify(fundamental.financial,null,2):'暂无数据'}`,
      `- 估值水平：${fundamental.valuation?JSON.stringify(fundamental.valuation,null,2):'暂无数据'}`
    ]),
    '',
    '【已有加仓/减仓计划】',
    planLines.length?planLines.join('\n'):'- 暂无已有加仓/减仓计划',
    '',
    '【我希望你输出】',
    '请按以下结构输出：',
    '',
    '1. 是否建议现在用新增资金加仓该股票：',
    '   - 可以 / 不建议 / 仅观察 / 条件触发后再考虑',
    '',
    '2. 主要理由：',
    '   - 技术面',
    '   - 仓位',
    '   - 风险',
    '   - 策略一致性',
    '',
    '3. 如果不现在加仓：',
    '   - 应该观察哪些价格或信号',
    '',
    '4. 如果未来加仓：',
    '   - 第一档价格区间',
    '   - 建议数量',
    '   - 是否维持现有加仓计划',
    '   - 是否可以新增支撑确认后的轻仓试探条件',
    '',
    '5. 风险提示：',
    '   - 哪些情况下应该放弃加仓',
    '   - 哪些情况下应该重新评估',
    '',
    '6. 最后输出一个可导入投资手册的 JSON：',
    JSON.stringify(outputJson,null,2),
    '',
    `注意：JSON 必须使用英文半角双引号，不要使用中文弯引号；不要输出确定性买卖命令。${chineseOutputPromptRule()}`
  ].join('\n');
}
function copyFullAddDiscussionPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(fullAddDiscussionPromptText(stock),'完整加仓讨论 Prompt 已复制。');
}
function normalizeImportedTradePlan(parsed,stock){
  const src=(parsed&&typeof parsed==='object'&&(parsed.plan||parsed.tradePlan||parsed.positionPlan))||(parsed&&typeof parsed==='object'?parsed:null);
  if(!src||typeof src!=='object'||Array.isArray(src))throw new Error('JSON 必须是计划对象，或顶层包含 plan / tradePlan / positionPlan。');
  const items=Array.isArray(src.planItems)?src.planItems:[];
  const now=new Date().toISOString();
  return {
    symbol:String(src.symbol||stock.code||stock.symbol||''),
    planType:['add','reduce','hold','observe'].includes(src.planType)?src.planType:'observe',
    planSummary:String(src.planSummary||''),
    validUntil:String(src.validUntil||''),
    planItems:items.map((it,i)=>({
      action:['add','reduce','observe','hold','buy','sell'].includes(it&&it.action)?it.action:'observe',
      triggerPrice:(it&&it.triggerPrice!==null&&it.triggerPrice!==undefined&&it.triggerPrice!=='')?Number(it.triggerPrice):null,
      priceZone:String((it&&it.priceZone)||''),
      quantity:(it&&it.quantity!==null&&it.quantity!==undefined&&it.quantity!=='')?Number(it.quantity):null,
      amountEstimate:(it&&it.amountEstimate!==null&&it.amountEstimate!==undefined&&it.amountEstimate!=='')?Number(it.amountEstimate):null,
      condition:String((it&&it.condition)||''),
      technicalCondition:String((it&&it.technicalCondition)||''),
      riskControl:String((it&&it.riskControl)||''),
      priority:Math.max(1,Math.min(10,Number((it&&it.priority)||i+1)||i+1)),
      note:String((it&&it.note)||'')
    })),
    riskFlags:normalizeStringArray(src.riskFlags),
    invalidConditions:normalizeStringArray(src.invalidConditions),
    reviewRequired:src.reviewRequired!==false,
    source:'GPT/manual import',
    updatedAt:now
  };
}
function tradePlanToPlans(tradePlan,stock){
  const cp=getComparablePrice(stock);
  return (tradePlan.planItems||[]).map(item=>{
    const action=item.action==='reduce'||item.action==='sell'?'sell':(item.action==='add'||item.action==='buy'?'buy':'');
    const price=Number(item.triggerPrice);
    const shares=Number(item.quantity);
    if(!action||!(price>0)||!(shares>0))return null;
    const note=[item.priceZone,item.condition,item.technicalCondition,item.riskControl,item.note].filter(Boolean).join('；');
    return {id:uid(),action,price,shares,note:note||tradePlan.planSummary||'GPT 导入计划',triggerOn:inferTriggerOn(cp,price,action),source:'GPT/manual import',updatedAt:Date.now()};
  }).filter(Boolean);
}
function ensureTradePlanImportModal(){
  let el=document.getElementById('tradePlanImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg import-layer';
  el.id='tradePlanImportModal';
  el.innerHTML=`<div class="modal"><h2>导入加仓计划 JSON</h2><div class="modal-sub">导入后只保存计划，不修改持仓数量、成本价，也不会自动执行交易。可触发条目会转换为现有价位计划。</div><div class="form-row"><label>粘贴 GPT 返回 JSON</label><textarea id="tradePlanImportText" style="min-height:300px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"symbol\":\"601869.SS\",\"planType\":\"observe\",\"planSummary\":\"...\",\"planItems\":[{\"action\":\"add\",\"triggerPrice\":420,\"quantity\":100,\"note\":\"仅观察加仓\"}]}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="tradePlanImportCancelBtn" type="button">取消</button><button class="btn" id="tradePlanImportSaveBtn" type="button">导入计划</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='tradePlanImportModal')closeTradePlanImportModal()});
  document.getElementById('tradePlanImportCancelBtn').addEventListener('click',closeTradePlanImportModal);
  document.getElementById('tradePlanImportSaveBtn').addEventListener('click',importTradePlanJson);
  return el;
}
function openTradePlanImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureTradePlanImportModal();
  document.getElementById('tradePlanImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('tradePlanImportText').focus(),50);
}
function closeTradePlanImportModal(){
  const modal=document.getElementById('tradePlanImportModal');
  if(modal)modal.classList.remove('show');
}
function importTradePlanJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={plans:JSON.parse(JSON.stringify(stock.plans||[])),tradePlan:JSON.parse(JSON.stringify(stock.tradePlan||null))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('tradePlanImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    const tradePlan=normalizeImportedTradePlan(parsed,stock);
    const mapped=tradePlanToPlans(tradePlan,stock);
    stock.tradePlan=tradePlan;
    const oldPlans=(stock.plans||[]).filter(p=>p.source!=='GPT/manual import');
    stock.plans=oldPlans.concat(mapped);
    stock.updatedAt=Date.now();
    saveState();
    closeTradePlanImportModal();
    render();
    alert(`加仓/减仓计划已导入。已保存 ${tradePlan.planItems.length} 条计划项，其中 ${mapped.length} 条可跟踪触发价。不会自动修改持仓或成本。`);
  }catch(err){
    stock.plans=original.plans;
    stock.tradePlan=original.tradePlan;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function technicalAnalysisPanel(stock){
  const review=normalizeTechnicalReview(stock.technicalReview,stock);
  const st=review.shortTermTechnical;
  const cy=review.cycleTechnical;
  const td=technicalDataFromReview(review,stock);
  const maText=`MA5 ${fmtTechnicalNumber(st.ma5,2)} · MA10 ${fmtTechnicalNumber(st.ma10,2)} · MA20 ${fmtTechnicalNumber(st.ma20,2)} · MA60 ${fmtTechnicalNumber(st.ma60,2)}`;
  const updated=st.priceUpdatedAt||review.updatedAt||'—';
  const actionHint=formatChineseText(st.actionHint||'—');
  const summary=formatChineseText(st.technicalSummary||review.finalTechnicalConclusion||'—');
  const cycleSummary=formatChineseText(cy.cycleSummary||'待补充');
  const holdHint=formatChineseText(review.holdHint||'待补充');
  const addHint=formatChineseText(review.addHint||'待补充');
  const reduceHint=formatChineseText(review.reduceHint||'待补充');
  const coverageWarning=review.inputCoverage.warning||(!review.inputCoverage.hasCycleKline&&cy.cyclePosition&&cy.cyclePosition!=='unclear'?'本次未提供500日K线，周期位置可能沿用上次结果。':'');
  const event=review.priceActionEvent&&review.priceActionEvent.detected?`<div class="alert">价格行为事件：${esc(formatChineseText(review.priceActionEvent.type||'已检测'))} · 涨跌 ${review.priceActionEvent.changePct===null?'—':fmtPctMaybe(review.priceActionEvent.changePct)} · 量能 ${esc(formatChineseText(review.priceActionEvent.volumeStatus||'—'))}${review.priceActionEvent.needsNewsExplanation?' · 需要新闻解释':''}</div>`:'';
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--teal)"><div class="card-title">技术面 / 位置判断</div>${coverageWarning?`<div class="alert">${esc(coverageWarning)}</div>`:''}${event}<div class="dash" style="margin:0"><div><div class="card-title">短期价格</div><div class="card-num">${fmtMaybe(st.price!==null?st.price:stockCurrentPrice(stock),2)}</div><div class="card-note">最近 ${esc(st.lookbackDays||120)} 日 · ${esc(updated)}</div></div><div><div class="card-title">短期趋势</div><div class="card-note">${esc(zhTrendStatus(st.trendStatus)||'—')}</div><div class="card-note">${maText}</div></div><div><div class="card-title">周期位置</div><div class="card-note">${esc(cyclePositionText(cy.cyclePosition))}</div><div class="card-note">${esc(cycleTechnicalPriceText(cy))}</div></div><div><div class="card-title">综合结论</div><div class="card-note">${esc(formatChineseText(review.finalTechnicalConclusion||summary||'待补充'))}</div></div></div><div class="dash" style="margin-top:10px"><div><div class="card-title">核心仓提示</div><div class="card-note">${esc(holdHint)}</div></div><div><div class="card-title">新增资金提示</div><div class="card-note">${esc(addHint)}</div></div><div><div class="card-title">减仓/兑现提示</div><div class="card-note">${esc(reduceHint)}</div></div><div><div class="card-title">周期数据来源</div><div class="card-note">${esc(formatChineseText(cy.dataSource||review.inputCoverage.cycleDataSource||'none'))} · ${esc(cy.lastCycleUpdatedAt||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>短期摘要：</b>${esc(summary)}${englishTextHint(summary)}<br><b>周期说明：</b>${esc(cycleSummary)}${englishTextHint(cycleSummary)}<br><b>支撑位：</b>${technicalLevelList(st.supportLevels)}<br><b>支撑区间：</b>${supportZonesText(td.supportZones)}<br><b>压力位：</b>${technicalLevelList(st.resistanceLevels)}<br><b>短期风险：</b>${st.riskFlags.length?zhList(st.riskFlags).map(esc).join('；'):'—'}<br><b>操作提示：</b>${esc(actionHint)}${englishTextHint(actionHint)}<div class="card-note" style="margin-top:8px">提示：趋势强 ≠ 低位安全买点；近期 K 线负责短期操作，500 日周期位置负责判断是否处于低位、中段、高位二次上攻或派发风险。</div></div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="copy-technical-prompt">复制技术面判断 Prompt</button><button class="btn ghost small" data-detail-action="import-technical-json">导入技术面 JSON</button></div></div>`;
}
function valuationSignalPanel(stock){
  const vd=normalizeValuationData(stock.valuationData);
  const sig=calculateValuationSignal(stock);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">估值自动评分 <button class="link-btn" data-detail-action="edit-valuation" style="float:right">编辑估值数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.valuationScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(valuationStatusLabel(sig.valuationStatus))}</div></div><div><div class="card-title">当前估值</div><div class="card-note">PE ${fmtMaybe(vd.pe,2)} · PB ${fmtMaybe(vd.pb,2)} · PS ${fmtMaybe(vd.ps,2)}</div></div><div><div class="card-title">增长 / 股息</div><div class="card-note">收入 ${fmtMaybe(vd.revenueGrowth,1)}% · 利润 ${fmtMaybe(vd.profitGrowth,1)}% · 股息 ${fmtMaybe(vd.dividendYield,1)}%</div></div><div><div class="card-title">更新时间</div><div class="card-note">${esc(vd.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(formatChineseText(sig.valuationSummary))}<br><b>信号：</b><br>${zhBreakList(sig.signals)}<br><b>提醒：</b><br>${zhBreakList(sig.warnings)}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px"><button class="btn ghost small" data-detail-action="apply-valuation">应用到九模块估值评分</button></div></div>`;
}
function hasValuationData(vd){
  return Boolean(vd&&((vd.marketCap>0)||(vd.peTtm>0)||(vd.pe>0)||(vd.forwardPe>0)||(vd.pb>0)||(vd.evEbitda>0)||(vd.dividendYield>0)||(vd.historicalPercentile!==null&&vd.historicalPercentile!==undefined)||String(vd.peerComparison||vd.valuationConclusion||'').trim()));
}
function hasValuationReview(vr){
  return Boolean(vr&&String(vr.summary||vr.actionHint||'').trim()||(vr&&((vr.positivePoints||[]).length||(vr.negativePoints||[]).length||(vr.riskFlags||[]).length)));
}
function valuationAnalysisPanel(stock){
  const vd=normalizeValuationData(stock.valuationData);
  const vr=normalizeValuationReview(stock.valuationReview);
  const risks=zhList(vr.riskFlags||[]).slice(0,4).map(esc).join('；')||'—';
  const completeness=getValuationCompleteness(vd);
  const valNum=(v,d=2)=>v===null||v===undefined||v===''||!(Number(v)>0)?'—':fmtMaybe(v,d);
  const levelText=completeness.level==='complete'?'较完整':(completeness.level==='partial'?'部分完整':'缺失');
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">估值分析</div><div class="dash" style="margin:0"><div><div class="card-title">估值结论</div><div class="text" style="max-width:none">${esc(formatChineseText(vd.valuationConclusion||'暂无估值结论'))}</div><div class="card-note">更新：${esc(vd.updatedAt||vd.lastUpdated||'—')} · ${esc(vd.currency||'—')}</div></div><div><div class="card-title">当前市值</div><div class="card-num" style="font-size:20px">${vd.marketCap===null?'—':fmtMoney(vd.marketCap)}</div><div class="card-note">历史分位 ${vd.historicalPercentile===null?'—':fmtMaybe(vd.historicalPercentile,1)+'%'}</div></div><div><div class="card-title">估值指标</div><div class="card-note">PE TTM ${vd.peTtm===null?valNum(vd.pe,2):valNum(vd.peTtm,2)} · Forward PE ${valNum(vd.forwardPe,2)}</div><div class="card-note">PB ${valNum(vd.pb,2)} · PS ${valNum(vd.ps,2)} · EV/EBITDA ${valNum(vd.evEbitda,2)} · 股息率 ${vd.dividendYield===null||vd.dividendYield===undefined?'—':fmtMaybe(vd.dividendYield,2)+'%'}</div></div><div><div class="card-title">完整度</div><div class="card-note">${esc(levelText)} ${completeness.score}%</div><div class="card-note">缺失：${esc(completeness.missingFields.join('、')||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>已有字段：</b>${esc(completeness.completedFields.join('、')||'—')}<br><b>同行业对比：</b>${esc(vd.peerComparison||'—')}<br><b>估值摘要：</b>${esc(formatChineseText(vr.summary||vd.valuationNote||'—'))}<br><b>估值风险：</b>${risks}<br><b>操作提示：</b>${esc(formatChineseText(vr.actionHint||'—'))}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-valuation-json">导入估值 JSON</button></div></div>`;
}
function fundamentalAnalysisPanel(stock){
  const f=fundamentalAnalysis(stock);
  const fd=f.financialData;
  const vd=f.valuationData;
  const valuationRisks=zhList((f.valuationReview&&f.valuationReview.riskFlags)||[]).slice(0,3).map(esc).join('；')||'—';
  const financialRisks=zhList((f.financialReview&&(f.financialReview.riskPoints||f.financialReview.riskFlags))||[]).slice(0,3).map(esc).join('；')||'—';
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--teal)"><div class="card-title">基本面分析</div><div class="dash" style="margin:0"><div><div class="card-title">基本面评分</div><div class="card-num">${fmtMaybe(f.score,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">${esc(f.conclusion)}${f.missing.length?' · '+f.missing.map(esc).join('、'):''}</div></div><div><div class="card-title">财务质量</div><div class="card-note">收入 ${fmtMaybe(fd.revenueGrowth,1)}% · 利润 ${fmtMaybe(fd.profitGrowth,1)}% · 现金流 ${fmtMoney(fd.operatingCashFlow)}</div><div class="card-note">评分 ${fmtMaybe(f.financialScore,1)} · ${esc(zhActionStatus(f.financialStatus))}</div></div><div><div class="card-title">估值水平</div><div class="card-note">PE ${vd.peTtm===null?fmtMaybe(vd.pe,2):fmtMaybe(vd.peTtm,2)} · PB ${fmtMaybe(vd.pb,2)} · 分位 ${vd.historicalPercentile===null?'—':fmtMaybe(vd.historicalPercentile,1)+'%'}</div><div class="card-note">评分 ${fmtMaybe(f.valuationScore,1)} · ${esc(formatChineseText(vd.valuationConclusion||f.valuationSummary||'—'))}</div></div><div><div class="card-title">更新时间</div><div class="card-note">财报 ${esc(fd.lastUpdated||'—')}</div><div class="card-note">估值 ${esc(vd.updatedAt||vd.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>一句话：</b>${esc(formatChineseText(f.finalSummary))}<br><b>财务风险：</b>${financialRisks}<br><b>估值风险：</b>${valuationRisks}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="copy-fundamental-prompt">复制基本面分析 Prompt</button><button class="btn ghost small" data-detail-action="import-fundamental-json">导入基本面 JSON</button></div></div>`;
}
function etfIndexAnalysisPanel(stock){
  const a=etfAnalysisSummary(stock);
  const keyPoints=(a.keyPoints||[]).slice(0,4).map(formatChineseText).map(esc).join('；')||'—';
  const risks=zhList(a.riskFlags||[]).slice(0,4).map(esc).join('；')||'—';
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--teal)"><div class="card-title">指数/行业分析</div><div class="dash" style="margin:0"><div><div class="card-title">综合结论</div><div class="card-num">${a.score===null?'—':fmtMaybe(a.score,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">置信度 ${esc(zhConfidence(a.confidence))} · 更新 ${esc(a.updatedAt||'—')}</div></div><div><div class="card-title">跟踪指数</div><div class="card-note">${esc(a.indexName||'—')}</div><div class="card-note">估值：${esc(formatChineseText(a.indexValuationLevel||'—'))} · 分位 ${a.historicalPercentile===null?'—':fmtMaybe(a.historicalPercentile,1)+'%'}</div></div><div><div class="card-title">行业 / 宏观</div><div class="card-note">行业：${esc(formatChineseText(a.industryTrend||'—'))}</div><div class="card-note">宏观：${esc(formatChineseText(a.macroView||'—'))}</div></div><div><div class="card-title">成分 / 流动性</div><div class="card-note">成分：${esc(formatChineseText(a.constituentQuality||'—'))}</div><div class="card-note">流动性：${esc(formatChineseText(a.liquidityView||'—'))}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>综合结论：</b>${esc(formatChineseText(a.conclusion||'—'))}<br><b>跟踪误差/折溢价：</b>${esc(formatChineseText(a.trackingRisk||'—'))}<br><b>关键理由：</b>${keyPoints}<br><b>风险提示：</b>${risks}<br><b>操作提示：</b>${esc(formatChineseText(a.actionHint||'—'))}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="copy-etf-analysis-prompt">复制 ETF 分析 Prompt</button><button class="btn ghost small" data-detail-action="import-etf-analysis-json">导入 ETF 分析 JSON</button></div></div>`;
}
function valuationLookupPromptText(stock){
  normalizeStockAnalysis(stock);
  const total=getEstimatedTotalAssets();
  const info=getPositionInfo(stock,total);
  const vd=normalizeValuationData(stock.valuationData);
  const vr=normalizeValuationReview(stock.valuationReview);
  const ctx={
    name:stock.name||'',
    symbol:stock.code||stock.symbol||'',
    marketType:stockMarketTypeLabel(stock),
    currentPrice:getComparablePrice(stock)||stock.currentPrice||'',
    marketValue:getMarketValue(stock)||0,
    shares:Number(stock.shares)||0,
    avgCost:stock.avgCost||'',
    theme:stock.theme||'',
    role:stock.role||'',
    targetWeight:normalizeStrategy(stock.strategy,stock).targetWeight,
    currentWeight:info&&info.actualPct!==null?Number(info.actualPct.toFixed(2)):null,
    financialData:normalizeFinancialData(stock.financialData),
    financialReview:normalizeAiReviews(stock.aiReviews).financialReview||null,
    technicalData:normalizeTechnicalData(stock.technicalData),
    technicalDecision:calculateTechnicalDecision(stock),
    allocationDecision:normalizeAllocationDecision(stock.allocationDecision,stock),
    valuationData:hasValuationData(vd)?vd:'暂无数据',
    valuationReview:hasValuationReview(vr)?vr:'暂无复核',
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={valuationData:{symbol:'',updatedAt:'',currency:'',marketCap:null,peTtm:null,forwardPe:null,pb:null,evEbitda:null,dividendYield:null,historicalPercentile:null,peerComparison:'',valuationConclusion:''},valuationReview:{summary:'',positivePoints:[],negativePoints:[],riskFlags:[],actionHint:''},sources:[{title:'',url:'',dataCovered:[]}]};
  return [
    '你是一名谨慎的上市公司估值分析助手。',
    '',
    `请帮我查找并整理【${stock.name||'公司名称'}】（股票代码：【${stock.code||stock.symbol||'股票代码'}】）的最新估值数据。`,
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '请优先使用：',
    '- 交易所/公司公告',
    '- 公司官网投资者关系',
    '- Yahoo Finance',
    '- TradingView',
    '- Macrotrends / CompaniesMarketCap / 财经网站估值页',
    '- 同行业可比公司数据',
    '',
    '请提取：当前市值、PE TTM、Forward PE、PB、EV/EBITDA、股息率、近 3-5 年 PE/PB 历史区间或分位、同行业估值对比、估值是否受周期利润影响、当前估值结论：低估 / 合理 / 偏贵 / 高估 / 无法判断。',
    '',
    '特别注意：',
    '如果是资源股、周期股或商品价格敏感型公司，请不要只用 PE 判断便宜或贵。需要结合金价、铜价、盈利周期、现金流和资本开支判断。',
    '如果是高成长科技股，请不要只用 PE 判断，需要结合收入增速、利润弹性、订单趋势、行业景气度和 PEG。',
    '如果是 ETF，请重点分析指数估值、历史分位、成分行业、股息率和宏观周期，而不是个股 PE。',
    '',
    '要求：',
    '- 不要编造缺失数据。',
    '- 无法找到的数据填 null。',
    '- 每个关键估值数据尽量注明来源。',
    '- 请明确估值数据日期。',
    '- 请说明估值结论的置信度。',
    `- ${chineseOutputPromptRule()}`,
    '- 只输出可读结论和最后的严格 JSON，JSON 使用英文半角双引号。',
    '',
    '最后输出可导入投资手册的 JSON：',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function copyValuationLookupPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(valuationLookupPromptText(stock),'估值查找 Prompt 已复制');
}
function stockMarketTypeLabel(stock){
  const code=String((stock&&stock.code)||'').toUpperCase();
  if(stock&&stock.type==='etf')return 'ETF';
  if(code.endsWith('.HK'))return '港股';
  if(code.endsWith('.SS')||code.endsWith('.SZ'))return 'A股';
  return '未知';
}
function jsonOrNoData(value,hasData=true){
  if(!hasData)return '暂无数据';
  if(value===null||value===undefined)return '暂无数据';
  if(typeof value==='string'&&!value.trim())return '暂无数据';
  try{return JSON.stringify(value,null,2)}catch(e){return String(value)}
}
function financialSearchPromptText(stock){
  normalizeStockAnalysis(stock);
  const fd=normalizeFinancialData(stock.financialData);
  const reviews=normalizeAiReviews(stock.aiReviews);
  const review=reviews.financialReview;
  const strategy=normalizeStrategy(stock.strategy,stock);
  const freshness=normalizeDataFreshness(stock.dataFreshness);
  const symbol=stock.code||stock.symbol||'';
  const name=stock.name||'公司名称';
  const theme=stock.theme||stock.industry||stock.sector||stock.role||'未填写';
  const schema={
    symbol:'',
    companyName:'',
    reportType:'',
    reportPeriod:'',
    announcementDate:'',
    currency:'',
    financialData:{
      revenue:null,
      revenueGrowth:null,
      netProfit:null,
      profitGrowth:null,
      nonRecurringNetProfit:null,
      nonRecurringProfitGrowth:null,
      grossMargin:null,
      netMargin:null,
      roe:null,
      operatingCashFlow:null,
      freeCashFlow:null,
      debtRatio:null,
      eps:null,
      dividendPlan:null
    },
    financialReview:{
      summary:'',
      positivePoints:[],
      negativePoints:[],
      cashFlowQuality:'',
      profitQuality:'',
      riskFlags:[],
      actionHint:''
    },
    sources:[{
      title:'',
      url:'',
      sectionOrPage:'',
      dataCovered:[]
    }]
  };
  const systemInfo=[
    '【当前系统已有信息】',
    `股票名称：${name||'暂无数据'}`,
    `代码：${symbol||'暂无数据'}`,
    `市场类型：${stockMarketTypeLabel(stock)}`,
    `当前持仓：${stock.shares||stock.quantity||0}`,
    `成本价：${stock.avgCost||stock.cost||'暂无数据'}`,
    `当前价格：${stockCurrentPrice(stock)||getComparablePrice(stock)||'暂无数据'}`,
    `行业/主题：${theme}`,
    `策略备注：${strategy.notes||'暂无数据'}`,
    `上次财报更新时间：${freshness.financialUpdatedAt||fd.lastUpdated||'暂无数据'}`,
    '已有财务数据：',
    jsonOrNoData(fd,hasFinancialData(fd)),
    '已有财报复核：',
    jsonOrNoData(review,Boolean(review))
  ].join('\n');
  return [
    '你是一名严谨的上市公司财报数据整理助手。',
    '',
    `请帮我查找并整理【${name}】（股票代码：【${symbol||'股票代码'}】）的最新财报数据。`,
    '',
    systemInfo,
    '',
    '要求：',
    '',
    '1. 优先查找官方来源：',
    '   - A股：交易所公告、巨潮资讯、公司公告、年度报告/季度报告原文',
    '   - 港股：港交所披露易、公司公告、年度报告/中期报告原文',
    '   - 如官方公告不可直接读取，再使用公司官网投资者关系页面',
    '   - 最后才参考财经网站摘要',
    '',
    '2. 请明确报告期：',
    '   - 年报 / 半年报 / 一季报 / 三季报',
    '   - 报告期截止日期',
    '   - 公告发布日期',
    '',
    '3. 请提取以下数据：',
    '   - 营业收入',
    '   - 营收同比增速',
    '   - 归母净利润',
    '   - 净利润同比增速',
    '   - 扣非净利润',
    '   - 扣非净利润同比增速',
    '   - 毛利率',
    '   - 净利率',
    '   - ROE',
    '   - 经营活动现金流净额',
    '   - 自由现金流，如公告未披露可填 null',
    '   - 资产负债率',
    '   - EPS',
    '   - 分红方案，如无则填 null',
    '',
    '4. 每个关键数据必须注明来源：',
    '   - 来源公告名称',
    '   - 报告页码或章节，如能找到',
    '   - 原文链接或公告来源',
    '',
    '5. 不要编造缺失数据。',
    '   如果公告中没有明确披露，请填 null，并说明“公告未直接披露”。',
    '',
    '6. 请额外总结：',
    '   - 本期财报最重要的 3 个利多点',
    '   - 本期财报最重要的 3 个利空或风险点',
    '   - 是否存在收入增长但利润/现金流恶化的情况',
    '   - 是否存在一次性收益、资产减值、汇兑损益等影响利润质量的因素',
    '   - 财报是否支持继续持有、观察、加仓或减仓复核',
    '',
    '7. 最后输出一个可导入投资手册的 JSON，格式如下：',
    '',
    JSON.stringify(schema,null,2),
    '',
    chineseOutputPromptRule(),
    '请优先保证来源可核验；缺失字段使用 null，不要根据行业经验或外部猜测补全。'
  ].join('\n');
}
function copyFinancialSearchPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(financialSearchPromptText(stock),'财报查找 Prompt 已复制');
}
function fundamentalPromptText(stock){
  normalizeStockAnalysis(stock);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const freshness=normalizeDataFreshness(stock.dataFreshness);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||stock.symbol||'',marketType:stockMarketTypeLabel(stock),shares:Number(stock.shares)||0,avgCost:stock.avgCost||'',currentPrice:getComparablePrice(stock)||stock.currentPrice||'',marketValue:getMarketValue(stock)||0,role:stock.role||'',theme:stock.theme||'',strategyNotes:strategy.notes||''},
    technicalData:normalizeTechnicalData(stock.technicalData),
    technicalDecision:calculateTechnicalDecision(stock),
    allocationDecision:normalizeAllocationDecision(stock.allocationDecision,stock),
    existingFundamental:fundamentalSummaryForPrompt(stock),
    dataFreshness:freshness
  };
  const schema={
    financialData:{revenue:0,revenueGrowth:0,netProfit:0,profitGrowth:0,grossMargin:0,netMargin:0,roe:0,operatingCashFlow:0,freeCashFlow:0,debtRatio:0,eps:0,reportPeriod:'',currency:'',financialNote:'',lastUpdated:''},
    financialReview:{summary:'',revenueTrend:'',profitTrend:'',marginTrend:'',cashFlowTrend:'',debtRisk:'',growthQuality:'',positivePoints:[],negativePoints:[],riskPoints:[],confidence:'high|medium|low'},
    valuationData:{symbol:'',updatedAt:'',currency:'',marketCap:null,peTtm:null,forwardPe:null,pb:null,ps:null,evEbitda:null,dividendYield:null,historicalPercentile:null,peerComparison:'',valuationConclusion:''},
    valuationReview:{summary:'',positivePoints:[],negativePoints:[],riskFlags:[],actionHint:''},
    sources:[{title:'',url:'',dataCovered:[]}]
  };
  return [
    '你是一名严谨的基本面分析助手。',
    '',
    '当前任务：同时完成财务质量和估值水平分析，回答两个问题：公司好不好？当前价格贵不贵？',
    '',
    '请基于我提供的资料和你能查到的公开来源，优先使用官方公告、交易所披露、公司投资者关系、Yahoo Finance、TradingView、财经网站估值页和可比公司数据。',
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '【分析要求】',
    '- 提取或更新 financialData。',
    '- 生成 financialReview，判断收入、利润、利润率、现金流、债务风险和增长质量。',
    '- 提取或更新 valuationData，关注 PE TTM、Forward PE、PB、PS、EV/EBITDA、股息率、当前市值、历史估值分位、同行业对比和估值结论。',
    '- 请逐项查找以下估值字段：1. 市值 marketCap；2. PE TTM peTtm；3. Forward PE forwardPe；4. PB pb；5. PS ps；6. EV/EBITDA evEbitda；7. 股息率 dividendYield；8. 历史估值分位 historicalPercentile；9. 同行业对比 peerComparison；10. 估值结论 valuationConclusion。',
    '- 每个估值字段必须出现在 valuationData 中：找到就填写数值或文字；找不到就填 null；不要因为找不到某些字段就省略字段。',
    '- 对找不到的估值字段，必须在 valuationReview.riskFlags 中说明缺失原因，例如“缺少 PB，公开资料未找到可核验数据”。',
    '- 估值字段强制检查：请尽量查找并提取 PE TTM、Forward PE、PB、PS（如适用）、EV/EBITDA（如适用）、股息率、市值、历史估值分位、同行业对比、估值结论。',
    '- 如果无法获取某个估值字段，必须在 valuationData 中填 null 或空字符串，并在 valuationReview.riskFlags 中明确写出缺失字段。',
    '- 不要只输出 PE。如果只能找到 PE，也要在 valuationReview.summary 或 valuationReview.riskFlags 中说明“估值判断仅基于 PE，置信度较低”。',
    '- 生成 valuationReview，判断当前估值低估 / 合理 / 偏贵 / 高估 / 无法判断。',
    '- 如果是周期股或资源股，不要只看 PE；要结合商品周期、现金流和资本开支。',
    '- 如果是科技成长股，不要只看 PE；要结合收入增速、利润弹性、订单趋势、行业景气和 PEG。',
    '- 如果是 ETF，重点分析指数估值、历史分位、成分行业、股息率和宏观周期。',
    '- 不要编造缺失数据；找不到的数值填 null 或 0，并在 review 中说明缺失。',
    `- ${chineseOutputPromptRule()}`,
    '',
    '请先给简短可读结论，再输出可导入投资手册的 JSON。',
    'JSON 顶层可以包含 financialData、financialReview、valuationData、valuationReview、sources。允许某些部分为空，但不要输出九模块评分，不要输出操作指令。',
    '',
    '请严格使用以下 JSON 结构：',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function copyFundamentalPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(fundamentalPromptText(stock),'基本面分析 Prompt 已复制');
}
function etfAnalysisPromptText(stock){
  normalizeStockAnalysis(stock);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const ctx={
    etf:{name:stock.name||'',symbol:stock.code||stock.symbol||'',marketType:stockMarketTypeLabel(stock),shares:Number(stock.shares)||0,avgCost:stock.avgCost||'',currentPrice:getComparablePrice(stock)||stock.currentPrice||'',marketValue:getMarketValue(stock)||0,role:stock.role||'',theme:stock.theme||'',strategyNotes:strategy.notes||''},
    technicalData:normalizeTechnicalData(stock.technicalData),
    technicalDecision:calculateTechnicalDecision(stock),
    existingEtfAnalysis:normalizeEtfAnalysis(stock.etfAnalysis,stock),
    allocationDecision:normalizeAllocationDecision(stock.allocationDecision,stock),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={etfAnalysis:{symbol:'',updatedAt:'',indexName:'',indexValuationLevel:'',historicalPercentile:null,industryTrend:'',macroView:'',constituentQuality:'',liquidityView:'',trackingRisk:'',conclusion:'',keyPoints:[],riskFlags:[],actionHint:'',score:null,confidence:'low | medium | high'}};
  return [
    '你是一名谨慎的 ETF 配置分析助手。',
    '',
    '请不要分析基金公司的经营财报。',
    '请重点分析该 ETF 跟踪的指数、行业、宏观环境、估值水平、历史分位、成分结构、流动性和跟踪风险。',
    '',
    `请帮我分析【${stock.name||'ETF名称'}】（代码：【${stock.code||stock.symbol||'symbol'}】）是否值得配置，以及当前是否适合新增资金。`,
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '请重点输出：',
    '- 跟踪指数',
    '- 指数估值水平',
    '- 历史估值分位',
    '- 行业景气度',
    '- 宏观环境',
    '- 成分股质量',
    '- 流动性/成交活跃度',
    '- 跟踪误差或折溢价风险',
    '- 配置价值',
    '- 当前风险',
    '- 操作提示',
    '',
    '要求：',
    '- 不要编造缺失数据。',
    '- 不确定就填 null 或空字符串。',
    '- 请使用中文输出自然语言字段。',
    '- 枚举字段可以使用英文固定值。',
    '- 不构成买卖指令。',
    '- 只输出可读结论和最后的严格 JSON，JSON 使用英文半角双引号。',
    '',
    '最后输出可导入投资手册的 JSON：',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function copyEtfAnalysisPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(etfAnalysisPromptText(stock),'ETF 分析 Prompt 已复制');
}
function financialSignalPanel(stock){
  const fd=normalizeFinancialData(stock.financialData);
  const sig=calculateFinancialSignal(stock);
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">财务自动评分 <button class="link-btn" data-detail-action="edit-financial" style="float:right">编辑财务数据</button></div><div class="dash" style="margin:0"><div><div class="card-num">${fmtMaybe(sig.financialScore,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(financialStatusLabel(sig.financialStatus))}</div></div><div><div class="card-title">报告期</div><div class="card-note">${esc(fd.reportPeriod||'—')} · ${esc(fd.currency||'—')}</div></div><div><div class="card-title">增长 / 利润率</div><div class="card-note">收入 ${fmtMaybe(fd.revenueGrowth,1)}% · 利润 ${fmtMaybe(fd.profitGrowth,1)}% · 净利率 ${fmtMaybe(fd.netMargin,1)}%</div></div><div><div class="card-title">更新时间</div><div class="card-note">${esc(fd.lastUpdated||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>摘要：</b>${esc(formatChineseText(sig.financialSummary))}<br><b>信号：</b><br>${zhBreakList(sig.signals)}<br><b>提醒：</b><br>${zhBreakList(sig.warnings)}</div><div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="import-financial">导入财报/财务JSON</button><button class="btn ghost small" data-detail-action="apply-financial">应用到九模块财务评分</button></div></div>`;
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
  const statusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisStatusFilter===x?' selected':''}>${x?zhActionStatus(x):'全部状态'}</option>`).join('');
  const riskOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisRiskFilter===x?' selected':''}>${x?zhActionStatus(x):'全部风险'}</option>`).join('');
  const scoreOptions=[['','全部分数'],['gte8','8分以上'],['6to8','6-8分'],['lt6','6分以下']].map(x=>`<option value="${x[0]}"${analysisScoreFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const actionOptions=['','strongBuy','buy','observe','hold','reduce'].map(x=>`<option value="${esc(x)}"${analysisActionFilter===x?' selected':''}>${x?decisionActionLabel(x):'全部动作'}</option>`).join('');
  const capitalOptions=[['','全部分配'],['true','参与分配'],['false','不参与分配']].map(x=>`<option value="${x[0]}"${analysisCapitalFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const executionOptions=['','buyNow','wait','hold','reduceRisk','noData'].map(x=>`<option value="${esc(x)}"${analysisExecutionFilter===x?' selected':''}>${x?zhActionStatus(x):'全部执行状态'}</option>`).join('');
  const freshnessOptions=[['','全部新鲜度'],['staleOnly','只看过期'],['stale',zhActionStatus('stale')],['veryStale',zhActionStatus('veryStale')],['unknown',zhActionStatus('unknown')]].map(x=>`<option value="${x[0]}"${analysisFreshnessFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const techStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisTechnicalStatusFilter===x?' selected':''}>${x?zhActionStatus(x):'全部技术状态'}</option>`).join('');
  const valuationStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisValuationStatusFilter===x?' selected':''}>${x?zhActionStatus(x):'全部估值状态'}</option>`).join('');
  const valuationMissingOptions=[['','全部估值数据'],['missing','只看缺少估值数据']].map(x=>`<option value="${x[0]}"${analysisValuationMissingFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const financialStatusOptions=['','positive','neutral','negative'].map(x=>`<option value="${esc(x)}"${analysisFinancialStatusFilter===x?' selected':''}>${x?zhActionStatus(x):'全部财务状态'}</option>`).join('');
  const financialMissingOptions=[['','全部财务数据'],['missing','只看缺少财务数据']].map(x=>`<option value="${x[0]}"${analysisFinancialMissingFilter===x[0]?' selected':''}>${x[1]}</option>`).join('');
  const sortOptions=[['score_desc','总分高到低'],['score_asc','总分低到高'],['risk_asc','风险分低到高'],['valuation_desc','九模块估值分高到低'],['technical_desc','九模块技术分高到低'],['decision_desc','决策分高到低'],['gap_desc','仓位缺口高到低'],['priority_asc','priority高到低'],['buy_amount_desc','建议金额高到低'],['buy_shares_desc','建议股数高到低'],['auto_technical_desc','自动技术分高到低'],['freshness_days_desc','分析过期天数高到低'],['auto_valuation_desc','自动估值分高到低'],['valuation_updated_desc','估值更新时间新到旧'],['auto_financial_desc','自动财务分高到低'],['financial_updated_desc','财务更新时间新到旧']].map(x=>`<option value="${x[0]}"${analysisSortMode===x[0]?' selected':''}>${x[1]}</option>`).join('');
  if(!state.stocks.length){main.innerHTML='<div class="empty">暂无股票数据，导入或新增标的后可查看九模块分析总览。</div>';return}
  const filters=`<div class="toolbar"><div class="actions"><select id="analysisSort">${sortOptions}</select><select id="analysisRole">${roleOptions}</select><select id="analysisStatus">${statusOptions}</select><select id="analysisRisk">${riskOptions}</select><select id="analysisScoreRange">${scoreOptions}</select><select id="analysisAction">${actionOptions}</select><select id="analysisCapital">${capitalOptions}</select><select id="analysisExecution">${executionOptions}</select><select id="analysisFreshness">${freshnessOptions}</select><select id="analysisTechnicalStatus">${techStatusOptions}</select><select id="analysisValuationStatus">${valuationStatusOptions}</select><select id="analysisValuationMissing">${valuationMissingOptions}</select><select id="analysisFinancialStatus">${financialStatusOptions}</select><select id="analysisFinancialMissing">${financialMissingOptions}</select></div></div>`;
  const empty='<div class="empty">当前筛选条件下没有匹配标的。</div>';
  const table=rows.length?`<div class="table-wrap"><table><thead><tr><th>名称</th><th>代码</th><th>总分</th><th>决策分</th><th>动作</th><th>建议金额</th><th>建议股数</th><th>执行状态</th><th>目标</th><th>当前</th><th>缺口</th><th>优先级</th><th>新鲜度</th><th>自动技术</th><th>自动估值</th><th>自动财务</th><th>风险</th><th>操作计划</th></tr></thead><tbody>${rows.map(s=>{const d=decisionForStock(s);const ex=executionForStock(s);const f=getAnalysisFreshness(s);const ts=calculateTechnicalSignal(s);const vs=calculateValuationSignal(s);const vd=normalizeValuationData(s.valuationData);const fs=calculateFinancialSignal(s);const fd=normalizeFinancialData(s.financialData);return `<tr class="analysis-row" data-analysis-stock="${esc(s.id)}" style="cursor:pointer"><td class="name" data-label="名称">${esc(s.name||'—')}</td><td class="num" data-label="代码">${esc(s.code||'—')}</td><td data-label="总分">${analysisScoreCell(s.analysisScore)}</td><td data-label="决策分">${analysisScoreCell(d.decisionScore)}</td><td data-label="动作">${esc(decisionActionLabel(d.action))}</td><td data-label="建议金额">${fmtMoney(ex.suggestedBuyAmount)}</td><td data-label="建议股数">${fmtInt(ex.suggestedShares)}</td><td data-label="执行状态">${esc(zhActionStatus(ex.executionStatus))}</td><td data-label="目标">${fmtMaybe(d.targetWeight,1)}%</td><td data-label="当前">${fmtMaybe(d.currentWeight,1)}%</td><td data-label="缺口">${fmtMaybe(d.positionGap,1)}%</td><td data-label="优先级">${fmtMaybe(d.priority,0)}</td><td data-label="新鲜度">${esc(zhActionStatus(f.staleLevel))}<div class="card-note">${f.daysSinceUpdate===null?'—':f.daysSinceUpdate+'天'}</div></td><td data-label="自动技术">${analysisScoreCell(ts.technicalScore)}<div class="card-note">${esc(zhActionStatus(ts.technicalStatus))}</div></td><td data-label="自动估值">${analysisScoreCell(vs.valuationScore)}<div class="card-note">${esc(zhActionStatus(vs.valuationStatus))} · ${esc(vd.lastUpdated||'—')}</div></td><td data-label="自动财务">${analysisScoreCell(fs.financialScore)}<div class="card-note">${esc(zhActionStatus(fs.financialStatus))} · ${esc(fd.reportPeriod||fd.lastUpdated||'—')}</div></td><td data-label="风险">${analysisScoreCell(analysisModuleScore(s,'risks'))}<div class="card-note">${esc(zhActionStatus(analysisModuleStatus(s,'risks')))}</div></td><td class="text" data-label="操作计划">${esc(formatChineseText(analysisActionPlan(s)||d.suggestedAction||'—'))}</td></tr>`}).join('')}</tbody></table></div>`:empty;
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
  detailSubView='';
  render();
}
function closeStockDetail(){
  detailStockId=null;
  detailSubView='';
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
  return `<ul style="margin:4px 0 0;padding-left:18px">${arr.map(x=>`<li>${esc(formatChineseText(x))}${englishTextHint(x)}</li>`).join('')}</ul>`;
}
function analysisModuleCard(stock,key){
  const fw=normalizeAnalysisFramework(stock.analysisFramework,stock);
  const m=fw[key];
  const conclusion=key==='conclusion';
  const extra=conclusion?`<div class="text" style="max-width:none;margin-top:6px"><b>角色：</b>${esc(zhStrategyRole(m.positionRole)||m.positionRole||'—')}<br><b>操作：</b>${esc(formatChineseText(m.actionPlan||'—'))}${englishTextHint(m.actionPlan)}</div>`:'';
  return `<div class="card"><div class="card-title">${esc(ANALYSIS_MODULE_LABELS[key]||key)} <button class="link-btn" data-analysis-edit="${key}" style="float:right">编辑</button></div><div class="card-num">${fmtMaybe(m.score,1)}<span style="font-size:13px;color:var(--ink3)"> / 10</span></div><div class="card-note">状态 ${esc(zhActionStatus(analysisStatusText(m.status)))}</div><div class="text" style="max-width:none;margin-top:8px">${esc(formatChineseText(m.summary||'—'))}${englishTextHint(m.summary)}</div>${extra}<div class="text" style="max-width:none;margin-top:8px"><b>要点：</b>${analysisListHtml(m.keyPoints)}<b>观察：</b>${analysisListHtml(m.watchItems)}</div></div>`;
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
    `4. ${chineseOutputPromptRule()}`,
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
    valuation:{score:valuation.valuationScore,status:valuation.valuationStatus,summary:valuation.valuationSummary,signals:valuation.signals,warnings:valuation.warnings,valuationData:normalizeValuationData(stock.valuationData),valuationReview:normalizeValuationReview(stock.valuationReview),valuationRawText:inputs.valuationRawText},
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
    valuation:['更新估值判断。','结合当前 valuationData、valuationReview、九模块 valuation 和 analysisInputs.valuationRawText。','优先返回 valuationData + valuationReview；如果只做九模块估值判断，也可以返回 analysisFramework.valuation。','如果不确定，请保留无法判断的数据为 null 或空字符串。','只输出严格 JSON。'],
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
    `4. ${chineseOutputPromptRule()}`,
    '5. 该结果仅作为投资复核辅助，不构成买卖指令，最终由用户确认。',
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
  if(parsed.valuationData&&typeof parsed.valuationData==='object'&&parsed.valuationReview&&typeof parsed.valuationReview==='object'){
    stock.valuationData=normalizeValuationData({...parsed.valuationData,lastUpdated:parsed.valuationData.lastUpdated||new Date().toISOString()});
    if(!stock.valuationData.symbol)stock.valuationData.symbol=stock.code||stock.symbol||'';
    stock.valuationReview=normalizeValuationReview(parsed.valuationReview);
    touchDataFreshness(stock,'valuationUpdatedAt');
    return {ok:true,message:'已导入估值数据和估值复核。'};
  }
  if(parsed.valuationData&&typeof parsed.valuationData==='object'){
    stock.valuationData=normalizeValuationData({...parsed.valuationData,lastUpdated:parsed.valuationData.lastUpdated||new Date().toISOString()});
    if(!stock.valuationData.symbol)stock.valuationData.symbol=stock.code||stock.symbol||'';
    touchDataFreshness(stock,'valuationUpdatedAt');
    return {ok:true,message:'已导入估值数据。'};
  }
  if(parsed.valuationReview&&typeof parsed.valuationReview==='object'){
    stock.valuationReview=normalizeValuationReview(parsed.valuationReview);
    touchDataFreshness(stock,'valuationUpdatedAt');
    return {ok:true,message:'已导入估值复核。'};
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
  return {ok:false,message:'未识别可导入字段：需要 analysisFramework、strategy、valuationData、valuationReview 或 financialData。'};
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
  el.innerHTML=`<div class="modal"><h2>导入技术面 JSON</h2><div class="modal-sub">支持 V12 technicalReview 或旧版 technicalData。日常只导入近期K线时，会保留上次500日周期位置。</div><div class="form-row"><label>粘贴 JSON</label><textarea id="technicalJsonImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"technicalReview\":{\"inputCoverage\":{\"hasRecentKline\":true,\"hasCycleKline\":false},\"shortTermTechnical\":{\"price\":26,\"ma5\":25.8,\"supportLevels\":[25]},\"finalTechnicalConclusion\":\"...\"}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="technicalJsonImportCancelBtn" type="button">取消</button><button class="btn" id="technicalJsonImportSaveBtn" type="button">导入技术面数据</button></div></div>`;
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
function normalizeImportedTechnicalReview(parsed,stock){
  const current=normalizeTechnicalReview(stock.technicalReview,stock);
  const isWrapped=parsed&&typeof parsed==='object'&&parsed.technicalReview&&typeof parsed.technicalReview==='object';
  const source=isWrapped?parsed.technicalReview:parsed;
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('JSON 必须是技术面对象，或顶层包含 technicalReview / technicalData 对象。');
  if(source.technicalData&&typeof source.technicalData==='object')return normalizeImportedTechnicalReview(source.technicalData,stock);
  const hasV12=Boolean(source.shortTermTechnical||source.cycleTechnical||source.inputCoverage||source.finalTechnicalConclusion);
  if(hasV12){
    const incoming=normalizeTechnicalReview(source,stock);
    const hasCycle=Boolean(incoming.inputCoverage.hasCycleKline||source.cycleTechnical&&Object.keys(source.cycleTechnical).length);
    const preservedCycle=hasCycle?incoming.cycleTechnical:current.cycleTechnical;
    return normalizeTechnicalReview({
      ...incoming,
      inputCoverage:{
        ...incoming.inputCoverage,
        hasRecentKline:true,
        hasCycleKline:hasCycle,
        cycleDataSource:hasCycle?(incoming.inputCoverage.cycleDataSource||incoming.cycleTechnical.dataSource||'current_import'):'previous_saved',
        warning:hasCycle?(incoming.inputCoverage.warning||''):'本次未提供500日K线，周期位置沿用上次结果。'
      },
      cycleTechnical:preservedCycle,
      updatedAt:incoming.updatedAt||new Date().toISOString()
    },stock);
  }
  const mergedTd={...normalizeTechnicalData(stock.technicalData),...source};
  const hasFlatCycle=Boolean(source.cyclePosition||source.cycleSummary||source.pricePosition);
  const flatReview=normalizeTechnicalReview({
    updatedAt:new Date().toISOString(),
    inputCoverage:{
      hasRecentKline:true,
      hasCycleKline:hasFlatCycle,
      cycleDataSource:hasFlatCycle?'current_import':'previous_saved',
      warning:hasFlatCycle?'':'本次未提供500日K线，周期位置沿用上次结果。'
    },
    shortTermTechnical:{
      lookbackDays:120,
      price:mergedTd.price,
      priceUpdatedAt:mergedTd.priceUpdatedAt||todayDate(),
      ma5:mergedTd.ma5,
      ma10:mergedTd.ma10,
      ma20:mergedTd.ma20||null,
      ma60:mergedTd.ma60||null,
      trendStatus:mergedTd.trendStatus,
      supportLevels:mergedTd.supportLevels,
      resistanceLevels:mergedTd.resistanceLevels,
      technicalSummary:mergedTd.technicalSummary,
      riskFlags:mergedTd.riskFlags,
      actionHint:mergedTd.actionHint
    },
    cycleTechnical:hasFlatCycle?{
      lookbackDays:mergedTd.pricePosition.lookbackDays||500,
      cyclePosition:mergedTd.cyclePosition,
      cycleSummary:mergedTd.cycleSummary,
      cycleHigh:mergedTd.pricePosition.high,
      cycleLow:mergedTd.pricePosition.low,
      currentPercentile:mergedTd.pricePosition.currentPercentile,
      distanceToCycleHighPct:mergedTd.pricePosition.distanceToCycleHighPct,
      distanceToCycleLowPct:mergedTd.pricePosition.distanceToCycleLowPct,
      lastCycleUpdatedAt:todayDate(),
      dataSource:'current_import'
    }:current.cycleTechnical,
    finalTechnicalConclusion:mergedTd.technicalSummary,
    holdHint:mergedTd.holdHint,
    addHint:mergedTd.addHint,
    reduceHint:mergedTd.reduceHint
  },stock);
  return flatReview;
}
function importTechnicalJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={technicalData:JSON.parse(JSON.stringify(stock.technicalData||{})),technicalReview:JSON.parse(JSON.stringify(stock.technicalReview||{})),dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('technicalJsonImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    const payload=(parsed&&typeof parsed==='object'&&parsed.technicalData&&typeof parsed.technicalData==='object')?parsed.technicalData:parsed;
    stock.technicalReview=normalizeImportedTechnicalReview(payload,stock);
    stock.technicalData=technicalDataFromReview(stock.technicalReview,stock);
    if(!stock.technicalData.symbol)stock.technicalData.symbol=stock.code||stock.symbol||'';
    touchDataFreshness(stock,'technicalUpdatedAt',stock.technicalReview.shortTermTechnical.priceUpdatedAt||todayDate());
    saveState();
    closeTechnicalJsonImportModal();
    render();
    alert('技术面 JSON 已导入。九模块技术评分和操作建议未自动修改。');
  }catch(err){
    stock.technicalData=original.technicalData;
    stock.technicalReview=original.technicalReview;
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
function ensureValuationImportModal(){
  let el=document.getElementById('valuationImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='valuationImportModal';
  el.innerHTML=`<div class="modal"><h2>导入估值 JSON</h2><div class="modal-sub">支持 valuationData、valuationReview 或估值查找 Prompt 返回的完整 JSON。不会自动修改配置决策、目标仓位或当前操作建议。</div><div class="form-row"><label>粘贴估值 JSON</label><textarea id="valuationImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"valuationData\":{\"peTtm\":12,\"pb\":1.8},\"valuationReview\":{\"summary\":\"...\"},\"sources\":[]}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="valuationImportCancelBtn" type="button">取消</button><button class="btn" id="valuationImportSaveBtn" type="button">导入估值 JSON</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='valuationImportModal')closeValuationImportModal()});
  document.getElementById('valuationImportCancelBtn').addEventListener('click',closeValuationImportModal);
  document.getElementById('valuationImportSaveBtn').addEventListener('click',importValuationJson);
  return el;
}
function openValuationImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureValuationImportModal();
  document.getElementById('valuationImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('valuationImportText').focus(),50);
}
function closeValuationImportModal(){
  const modal=document.getElementById('valuationImportModal');
  if(modal)modal.classList.remove('show');
}
function importValuationJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={valuationData:JSON.parse(JSON.stringify(stock.valuationData||{})),valuationReview:JSON.parse(JSON.stringify(stock.valuationReview||{})),dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('valuationImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON 必须是对象。');
    const hasData=parsed.valuationData&&typeof parsed.valuationData==='object';
    const hasReview=parsed.valuationReview&&typeof parsed.valuationReview==='object';
    const looksLikeData=!hasData&&!hasReview&&('peTtm' in parsed||'forwardPe' in parsed||'marketCap' in parsed||'valuationConclusion' in parsed||'historicalPercentile' in parsed||'pb' in parsed);
    if(hasData||looksLikeData){
      const src=hasData?parsed.valuationData:parsed;
      stock.valuationData=normalizeValuationData({...src,updatedAt:src.updatedAt||src.lastUpdated||todayDate(),lastUpdated:src.lastUpdated||src.updatedAt||todayDate()});
      if(!stock.valuationData.symbol)stock.valuationData.symbol=stock.code||stock.symbol||'';
    }
    if(hasReview){
      stock.valuationReview=normalizeValuationReview(parsed.valuationReview);
    }
    if(!hasData&&!hasReview&&!looksLikeData)throw new Error('未识别 valuationData 或 valuationReview。');
    touchDataFreshness(stock,'valuationUpdatedAt');
    saveState();
    closeValuationImportModal();
    render();
    alert(hasData&&hasReview?'估值 JSON 已导入':(hasReview?'估值复核已导入；如需估值指标，请继续导入 valuationData。':'估值 JSON 已导入'));
  }catch(err){
    stock.valuationData=original.valuationData;
    stock.valuationReview=original.valuationReview;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
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
function ensureAllocationDecisionImportModal(){
  let el=document.getElementById('allocationDecisionImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='allocationDecisionImportModal';
  el.innerHTML=`<div class="modal"><h2>导入配置决策 JSON</h2><div class="modal-sub">导入后只写入 allocationDecision，不会自动修改持仓、成本、目标仓位或最大仓位。</div><div class="form-row"><label>粘贴 allocationDecision JSON</label><textarea id="allocationDecisionImportText" style="min-height:300px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"allocationDecision\":{\"conclusion\":\"...\",\"recommendedTargetWeight\":5,\"capitalAllocationView\":\"conditional\"}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="allocationDecisionCancelBtn" type="button">取消</button><button class="btn" id="allocationDecisionSaveBtn" type="button">导入配置决策</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='allocationDecisionImportModal')closeAllocationDecisionImportModal()});
  document.getElementById('allocationDecisionCancelBtn').addEventListener('click',closeAllocationDecisionImportModal);
  document.getElementById('allocationDecisionSaveBtn').addEventListener('click',importAllocationDecisionJson);
  return el;
}
function openAllocationDecisionImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureAllocationDecisionImportModal();
  document.getElementById('allocationDecisionImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('allocationDecisionImportText').focus(),50);
}
function closeAllocationDecisionImportModal(){
  const modal=document.getElementById('allocationDecisionImportModal');
  if(modal)modal.classList.remove('show');
}
function importAllocationDecisionJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const beforeStrategy=JSON.stringify(normalizeStrategy(stock.strategy,stock));
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('allocationDecisionImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  const payload=parsed&&parsed.allocationDecision?parsed.allocationDecision:parsed;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)){alert('导入失败：JSON 必须是 allocationDecision 对象，或顶层包含 allocationDecision。');return}
  const next=normalizeAllocationDecision({...payload,symbol:payload.symbol||stock.code||stock.symbol||'',updatedAt:payload.updatedAt||new Date().toISOString()},stock);
  stock.allocationDecision=next;
  stock.strategy=normalizeStrategy(JSON.parse(beforeStrategy),stock);
  saveState();
  closeAllocationDecisionImportModal();
  render();
  alert('配置决策已导入。如需调整目标仓位，请人工确认。');
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
  el.innerHTML=`<div class="modal"><h2>导入财报/财务 JSON</h2><div class="modal-sub">支持 financialData、financialReview，或“财报查找 Prompt”返回的完整 JSON。不会覆盖九模块 financials，应用到九模块需另点按钮确认。</div><div class="form-row"><label>粘贴 JSON</label><textarea id="financialImportText" style="min-height:260px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"financialData\":{\"revenue\":0,\"revenueGrowth\":0},\"financialReview\":{\"summary\":\"...\"},\"sources\":[]}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="financialImportCancelBtn" type="button">取消</button><button class="btn" id="financialImportSaveBtn" type="button">导入财报/财务数据</button></div></div>`;
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
function ensureFundamentalImportModal(){
  let el=document.getElementById('fundamentalImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='fundamentalImportModal';
  el.innerHTML=`<div class="modal"><h2>导入基本面 JSON</h2><div class="modal-sub">支持只含财报、只含估值，或同时包含 financialData / financialReview / valuationData / valuationReview 的 JSON。不会覆盖九模块评分、配置决策或操作建议。</div><div class="form-row"><label>粘贴基本面 JSON</label><textarea id="fundamentalImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"financialData\":{},\"financialReview\":{},\"valuationData\":{},\"valuationReview\":{}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="fundamentalImportCancelBtn" type="button">取消</button><button class="btn" id="fundamentalImportSaveBtn" type="button">导入基本面数据</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='fundamentalImportModal')closeFundamentalImportModal()});
  document.getElementById('fundamentalImportCancelBtn').addEventListener('click',closeFundamentalImportModal);
  document.getElementById('fundamentalImportSaveBtn').addEventListener('click',importFundamentalJson);
  return el;
}
function openFundamentalImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureFundamentalImportModal();
  document.getElementById('fundamentalImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('fundamentalImportText').focus(),50);
}
function closeFundamentalImportModal(){
  const modal=document.getElementById('fundamentalImportModal');
  if(modal)modal.classList.remove('show');
}
function applyFundamentalPayload(stock,parsed){
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON 必须是对象。');
  const hasFinancialData=parsed.financialData&&typeof parsed.financialData==='object'&&!Array.isArray(parsed.financialData);
  const hasFinancialReview=parsed.financialReview&&typeof parsed.financialReview==='object'&&!Array.isArray(parsed.financialReview);
  const hasValuationData=parsed.valuationData&&typeof parsed.valuationData==='object'&&!Array.isArray(parsed.valuationData);
  const hasValuationReview=parsed.valuationReview&&typeof parsed.valuationReview==='object'&&!Array.isArray(parsed.valuationReview);
  if(!hasFinancialData&&!hasFinancialReview&&!hasValuationData&&!hasValuationReview)throw new Error('未识别 financialData、financialReview、valuationData 或 valuationReview。');
  if(hasFinancialData)stock.financialData=normalizeFinancialDataImportPayload(parsed);
  if(hasFinancialReview){
    stock.aiReviews=normalizeAiReviews(stock.aiReviews);
    const review=normalizeFinancialReviewImportPayload(parsed);
    if(!review)throw new Error('financialReview 格式不正确。');
    stock.aiReviews.financialReview=review;
  }
  if(hasValuationData){
    const src=parsed.valuationData;
    stock.valuationData=normalizeValuationData({...src,updatedAt:src.updatedAt||src.lastUpdated||todayDate(),lastUpdated:src.lastUpdated||src.updatedAt||todayDate()});
    if(!stock.valuationData.symbol)stock.valuationData.symbol=stock.code||stock.symbol||'';
  }
  if(hasValuationReview)stock.valuationReview=normalizeValuationReview(parsed.valuationReview);
  if(hasFinancialData||hasFinancialReview)touchDataFreshness(stock,'financialUpdatedAt');
  if(hasValuationData||hasValuationReview)touchDataFreshness(stock,'valuationUpdatedAt');
  return {hasFinancialData,hasFinancialReview,hasValuationData,hasValuationReview};
}
function importFundamentalJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={
    financialData:JSON.parse(JSON.stringify(stock.financialData||{})),
    aiReviews:JSON.parse(JSON.stringify(stock.aiReviews||{})),
    valuationData:JSON.parse(JSON.stringify(stock.valuationData||{})),
    valuationReview:JSON.parse(JSON.stringify(stock.valuationReview||{})),
    dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))
  };
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('fundamentalImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    const flags=applyFundamentalPayload(stock,parsed);
    saveState();
    closeFundamentalImportModal();
    render();
    const parts=[];
    if(flags.hasFinancialData)parts.push('financialData');
    if(flags.hasFinancialReview)parts.push('financialReview');
    if(flags.hasValuationData)parts.push('valuationData');
    if(flags.hasValuationReview)parts.push('valuationReview');
    alert(`基本面 JSON 已导入：${parts.join('、')} 已更新。九模块评分、配置决策和操作建议未自动修改。`);
  }catch(err){
    stock.financialData=original.financialData;
    stock.aiReviews=original.aiReviews;
    stock.valuationData=original.valuationData;
    stock.valuationReview=original.valuationReview;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function ensureEtfAnalysisImportModal(){
  let el=document.getElementById('etfAnalysisImportModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg';
  el.id='etfAnalysisImportModal';
  el.innerHTML=`<div class="modal"><h2>导入 ETF 分析 JSON</h2><div class="modal-sub">支持 {"etfAnalysis": {...}} 或 etfAnalysis 对象本体。只写入当前 ETF 的 etfAnalysis，不会修改目标仓位、配置决策或当前操作建议。</div><div class="form-row"><label>粘贴 ETF 分析 JSON</label><textarea id="etfAnalysisImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"etfAnalysis\":{\"indexName\":\"\",\"conclusion\":\"\"}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="etfAnalysisImportCancelBtn" type="button">取消</button><button class="btn" id="etfAnalysisImportSaveBtn" type="button">导入 ETF 分析</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='etfAnalysisImportModal')closeEtfAnalysisImportModal()});
  document.getElementById('etfAnalysisImportCancelBtn').addEventListener('click',closeEtfAnalysisImportModal);
  document.getElementById('etfAnalysisImportSaveBtn').addEventListener('click',importEtfAnalysisJson);
  return el;
}
function openEtfAnalysisImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureEtfAnalysisImportModal();
  document.getElementById('etfAnalysisImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('etfAnalysisImportText').focus(),50);
}
function closeEtfAnalysisImportModal(){
  const modal=document.getElementById('etfAnalysisImportModal');
  if(modal)modal.classList.remove('show');
}
function importEtfAnalysisJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={etfAnalysis:JSON.parse(JSON.stringify(stock.etfAnalysis||{})),dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))};
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('etfAnalysisImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    const payload=parsed&&parsed.etfAnalysis?parsed.etfAnalysis:parsed;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('JSON 必须是 etfAnalysis 对象，或顶层包含 etfAnalysis。');
    stock.etfAnalysis=normalizeEtfAnalysis({...payload,symbol:payload.symbol||stock.code||stock.symbol||'',updatedAt:payload.updatedAt||todayDate()},stock);
    touchDataFreshness(stock,'etfAnalysisUpdatedAt');
    saveState();
    closeEtfAnalysisImportModal();
    render();
    alert('ETF 分析 JSON 已导入。不会自动修改目标仓位、配置决策或当前操作建议。');
  }catch(err){
    stock.etfAnalysis=original.etfAnalysis;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function normalizeFinancialDataImportPayload(parsed){
  const src=(parsed&&parsed.financialData&&typeof parsed.financialData==='object')?parsed.financialData:{};
  return normalizeFinancialData({
    ...src,
    reportPeriod:src.reportPeriod||parsed.reportPeriod||'',
    currency:src.currency||parsed.currency||'',
    financialNote:src.financialNote||[parsed.reportType,parsed.announcementDate,parsed.companyName].filter(Boolean).join(' · '),
    lastUpdated:src.lastUpdated||new Date().toISOString()
  });
}
function normalizeFinancialReviewImportPayload(parsed){
  const src=(parsed&&parsed.financialReview&&typeof parsed.financialReview==='object')?parsed.financialReview:null;
  if(!src)return null;
  const review={...src};
  if(!Array.isArray(review.riskPoints)&&Array.isArray(review.riskFlags))review.riskPoints=review.riskFlags;
  if(!Array.isArray(review.negativePoints)&&Array.isArray(review.riskFlags))review.negativePoints=review.riskFlags;
  if(Array.isArray(parsed.sources))review.sources=parsed.sources;
  if(parsed.reportType||parsed.reportPeriod||parsed.announcementDate){
    review.reportMeta={reportType:parsed.reportType||'',reportPeriod:parsed.reportPeriod||'',announcementDate:parsed.announcementDate||''};
  }
  return normalizeAiReviewPayload('financialReview',{financialReview:review});
}
function importFinancialJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={
    financialData:JSON.parse(JSON.stringify(stock.financialData||{})),
    aiReviews:JSON.parse(JSON.stringify(stock.aiReviews||{})),
    dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))
  };
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('financialImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON 必须是对象。');
    const hasData=parsed.financialData&&typeof parsed.financialData==='object'&&!Array.isArray(parsed.financialData);
    const hasReview=parsed.financialReview&&typeof parsed.financialReview==='object'&&!Array.isArray(parsed.financialReview);
    if(!hasData&&!hasReview)throw new Error('未识别 financialData 或 financialReview。请粘贴财务数据提取、财报复核，或财报查找 Prompt 返回的 JSON。');
    if(hasData)stock.financialData=normalizeFinancialDataImportPayload(parsed);
    if(hasReview){
      stock.aiReviews=normalizeAiReviews(stock.aiReviews);
      const review=normalizeFinancialReviewImportPayload(parsed);
      if(!review)throw new Error('financialReview 格式不正确。');
      stock.aiReviews.financialReview=review;
    }
    touchDataFreshness(stock,'financialUpdatedAt');
    saveState();
    closeFinancialImportModal();
    render();
    if(hasData&&hasReview)alert('财报查找 JSON 已导入：financialData 与 financialReview 已更新。九模块评分未自动修改。');
    else if(hasData)alert('financialData 已导入。九模块评分未自动修改。');
    else alert('financialReview 已导入。未包含 financialData，财务自动评分不会变化；如需评分，请再导入 financialData。');
  }catch(err){
    stock.financialData=original.financialData;
    stock.aiReviews=original.aiReviews;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
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
function closeStrategyModal(){const modal=document.getElementById('strategyModal');if(modal)modal.classList.remove('show');if(editModalReturnTab==='edit'){detailStockId=null;editModalReturnTab=''}}
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
  const returnTab=editModalReturnTab;
  saveState();
  closeStrategyModal();
  if(returnTab==='edit'){currentTab='edit';detailStockId=null}
  render();
}
function sentimentSearchPromptText(stock){
  normalizeStockAnalysis(stock);
  const sentiment=sentimentReviewContext(stock);
  const strategy=normalizeStrategy(stock.strategy,stock);
  const reviews=normalizeAiReviews(stock.aiReviews);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||stock.symbol||'',type:stock.type||'',marketType:stockMarketTypeLabel(stock),role:stock.role||'',theme:stock.theme||'',investmentStyle:strategy.investmentStyle},
    sentimentImportance:sentiment.importance,
    existingSentimentReview:sentiment.hasReview?sentiment.review:null,
    newsReview:reviews.newsReview||null,
    socialReview:reviews.socialReview||null,
    allocationDecision:normalizeAllocationDecision(stock.allocationDecision,stock),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={sentimentReview:{symbol:'',updatedAt:'',importance:'low | medium | high',conclusion:'',newsSummary:'',marketMood:'',institutionalView:'',fundFlowView:'',sectorHeat:'',positivePoints:[],negativePoints:[],riskFlags:[],sourceQuality:'low | medium | high',confidence:'low | medium | high',actionHint:''},sources:[{title:'',url:'',type:'news | announcement | research | social | fund_flow | other',date:'',keyPoint:''}]};
  return [
    '你是一名谨慎的市场情绪与新闻复核助手。',
    '',
    `请帮我搜索并整理【${stock.name||'标的名称'}】（代码：【${stock.code||stock.symbol||'symbol'}】）近期的新闻、公告、市场情绪、机构观点、板块热度和资金流线索。`,
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '要求：',
    '1. 请优先区分事实新闻、机构观点、市场传闻和社媒情绪。',
    '2. 不要把传闻当成事实。',
    '3. 每条重要结论尽量注明来源。',
    '4. 如果缺少可靠来源，请降低 confidence。',
    '5. 请关注最近 30-90 天信息。',
    '6. 对 AI科技、成长股、主题股，请重点关注市场预期、板块热度、资金流和情绪变化。',
    '7. 对资源股和宽基ETF，请重点关注宏观、商品价格、指数情绪和资金流，不要过度解读社媒讨论。',
    '8. 不构成买卖指令。',
    `9. ${chineseOutputPromptRule()}`,
    '',
    '请先给简短可读结论，最后输出可导入投资手册的 JSON：',
    JSON.stringify(schema,null,2),
    '',
    'JSON 必须使用英文半角双引号，不要使用中文弯引号。'
  ].join('\n');
}
function longTermLogicPromptText(stock){
  normalizeStockAnalysis(stock);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||stock.symbol||'',type:stock.type||'',role:stock.role||'',theme:stock.theme||''},
    existingLongTermLogic:normalizeLongTermLogic(stock.longTermLogic,stock),
    financialData:normalizeFinancialData(stock.financialData),
    valuationData:normalizeValuationData(stock.valuationData),
    allocationDecision:normalizeAllocationDecision(stock.allocationDecision,stock),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={longTermLogic:{updatedAt:todayDate(),validUntil:'',investmentThesis:'',coreDrivers:[],fundamentalSupport:'',longTermRisks:[],logicStatus:'valid | weakening | broken | unclear',confidence:'high | medium | low',nextReviewDate:'',sourceSummary:''}};
  return [
    '你是一名谨慎的长期投资逻辑整理助手。',
    '',
    `请整理【${stock.name||'标的名称'}】（代码：【${stock.code||stock.symbol||'symbol'}】）的长期逻辑。`,
    '',
    '本任务用于月度、季度或财报后低频更新，不关注单日涨跌。',
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '请重点整理：投资主线、核心驱动、财务验证、长期风险、逻辑有效性、下次复核日期。',
    '请使用中文输出自然语言字段；枚举字段可以使用英文固定值。',
    '只输出严格 JSON，不要 Markdown，不要解释文字。',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function recentCatalystPromptText(stock){
  normalizeStockAnalysis(stock);
  const tech=normalizeTechnicalReview(stock.technicalReview,stock);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||stock.symbol||'',type:stock.type||'',role:stock.role||'',theme:stock.theme||''},
    today:todayDate(),
    technicalPriceActionEvent:tech.priceActionEvent,
    recentCatalyst:normalizeRecentCatalyst(stock.recentCatalyst,stock),
    eventExplanation:normalizeEventExplanation(stock.eventExplanation,stock),
    collectionInputs:normalizeCollectionInputs(stock.collectionInputs),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={recentCatalyst:{analysisDate:todayDate(),lookbackDays:7,latestSourceDate:'',hasTodayNews:false,todayCatalyst:'',recentEvents:[],freshnessStatus:'fresh | acceptable | stale | unknown',freshnessDays:null,missingData:[],confidence:'high | medium | low',actionHint:''},eventExplanation:{priceActionDetected:false,priceActionType:'',canExplainTodayMove:false,explanationConfidence:'high | medium | low',explanation:'',missingData:[],warning:''}};
  return [
    '你是一名谨慎的短期新闻催化复核助手。',
    '',
    `请复核【${stock.name||'标的名称'}】（代码：【${stock.code||stock.symbol||'symbol'}】）最近 7 天的新闻、公告、板块异动和资金线索。`,
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '要求：',
    '1. 重点关注当天/本周新闻、公告、涨停/跌停原因、板块异动、资金流、龙虎榜和缺失信息。',
    '2. 必须判断新闻是否足以解释当日行情。',
    '3. 如果 analysisDate 是今天但 latestSourceDate 不是今天，必须明确提示新闻未覆盖今天。',
    '4. 如果涨停/跌停或单日涨跌幅超过 7%，但没有当天新闻解释，eventExplanation.canExplainTodayMove 必须为 false。',
    '5. 操作提示避免追涨，应使用条件化表达。',
    '6. 请使用中文输出自然语言字段；枚举字段可以使用英文固定值。',
    '7. 只输出严格 JSON，不要 Markdown，不要解释文字。',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function shortTermSentimentPromptText(stock){
  normalizeStockAnalysis(stock);
  const ctx={
    stock:{name:stock.name||'',symbol:stock.code||stock.symbol||'',type:stock.type||'',role:stock.role||'',theme:stock.theme||''},
    sentimentImportance:getSentimentImportance(stock),
    sentimentReview:normalizeSentimentReview(stock.sentimentReview,stock),
    shortTermSentiment:normalizeShortTermSentiment(stock.shortTermSentiment,stock),
    dataFreshness:normalizeDataFreshness(stock.dataFreshness)
  };
  const schema={shortTermSentiment:{updatedAt:todayDate(),marketMood:'',fundFlowView:'',sectorHeat:'',institutionalView:'',riskFlags:[],confidence:'high | medium | low',actionHint:''}};
  return [
    '你是一名谨慎的短期情绪与资金复核助手。',
    '',
    `请整理【${stock.name||'标的名称'}】（代码：【${stock.code||stock.symbol||'symbol'}】）近期市场情绪、主力资金、板块热度和机构观点。`,
    '',
    '【当前系统已有信息】',
    JSON.stringify(ctx,null,2),
    '',
    '要求：',
    '1. 区分事实新闻、资金流、机构观点、社媒情绪和市场传闻。',
    '2. 对成长股和主题股重点关注预期变化、板块热度和资金流；对资源股/宽基 ETF 不要过度解读社媒。',
    '3. 不确定时降低 confidence。',
    '4. 请使用中文输出自然语言字段；枚举字段可以使用英文固定值。',
    '5. 只输出严格 JSON，不要 Markdown，不要解释文字。',
    JSON.stringify(schema,null,2)
  ].join('\n');
}
function copyLongTermLogicPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(stock)copyText(longTermLogicPromptText(stock),'长期逻辑整理 Prompt 已复制');
}
function copyRecentCatalystPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(stock)copyText(recentCatalystPromptText(stock),'短期新闻催化 Prompt 已复制');
}
function copyShortTermSentimentPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(stock)copyText(shortTermSentimentPromptText(stock),'短期情绪资金 Prompt 已复制');
}
function copySentimentSearchPrompt(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  copyText(sentimentSearchPromptText(stock),'情绪/新闻搜索 Prompt 已复制');
}
function sentimentReviewPanel(stock){
  const sentiment=sentimentReviewContext(stock);
  const r=sentiment.review;
  const body=!sentiment.hasReview
    ?`<div class="alert">${esc(sentiment.missingHint)}</div>`
    :`<div class="dash" style="margin:0"><div><div class="card-title">情绪重要性</div><div class="card-num" style="font-size:20px">${sentimentImportanceText(sentiment.importance)}</div><div class="card-note">Review importance：${esc(r.importance)}</div></div><div><div class="card-title">情绪结论</div><div class="text" style="max-width:none">${esc(formatChineseText(r.conclusion||'—'))}</div><div class="card-note">更新：${esc(r.updatedAt||'—')}</div></div><div><div class="card-title">市场情绪 / 板块热度</div><div class="card-note">${esc(formatChineseText(r.marketMood||'—'))}</div><div class="card-note">${esc(formatChineseText(r.sectorHeat||'—'))}</div></div><div><div class="card-title">来源质量 / 置信度</div><div class="card-note">${esc(zhConfidence(r.sourceQuality))} / ${esc(zhConfidence(r.confidence))}</div></div></div><div class="text" style="max-width:none;margin-top:10px"><b>新闻摘要：</b>${esc(formatChineseText(r.newsSummary||'—'))}<br><b>机构观点：</b>${esc(formatChineseText(r.institutionalView||'—'))}<br><b>资金流：</b>${esc(formatChineseText(r.fundFlowView||'—'))}<br><b>利多：</b>${zhList(r.positivePoints).slice(0,4).map(esc).join('；')||'—'}<br><b>利空：</b>${zhList(r.negativePoints).slice(0,4).map(esc).join('；')||'—'}<br><b>风险：</b>${zhList(r.riskFlags).slice(0,4).map(esc).join('；')||'—'}<br><b>操作提示：</b>${esc(formatChineseText(r.actionHint||'—'))}</div>`;
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">情绪/新闻复核</div>${body}<div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn ghost small" data-detail-action="copy-sentiment-prompt">复制情绪/新闻搜索 Prompt</button><button class="btn ghost small" data-detail-action="import-sentiment-json">导入情绪 Review JSON</button></div></div>`;
}
function ensureSentimentImportModal(){
  let el=document.getElementById('sentimentImportModal');
  if(el){
    el.classList.add('import-layer');
    return el;
  }
  el=document.createElement('div');
  el.className='modal-bg import-layer';
  el.id='sentimentImportModal';
  el.innerHTML=`<div class="modal"><h2>导入新闻 / 情绪 JSON</h2><div class="modal-sub">支持 sentimentReview、shortTermSentiment、recentCatalyst、eventExplanation、longTermLogic 或 informationCompleteness。导入后不会自动修改配置决策或当前操作建议。</div><div class="form-row"><label>粘贴 JSON</label><textarea id="sentimentImportText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px" placeholder='{\"recentCatalyst\":{\"todayCatalyst\":\"...\"},\"eventExplanation\":{\"canExplainTodayMove\":false}}'></textarea></div><div class="modal-actions"><button class="btn ghost" id="sentimentImportCancelBtn" type="button">取消</button><button class="btn" id="sentimentImportSaveBtn" type="button">导入</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='sentimentImportModal')closeSentimentImportModal()});
  document.getElementById('sentimentImportCancelBtn').addEventListener('click',closeSentimentImportModal);
  document.getElementById('sentimentImportSaveBtn').addEventListener('click',importSentimentReviewJson);
  return el;
}
function openSentimentImportModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const modal=ensureSentimentImportModal();
  document.getElementById('sentimentImportText').value='';
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('sentimentImportText').focus(),50);
}
function closeSentimentImportModal(){
  const modal=document.getElementById('sentimentImportModal');
  if(modal)modal.classList.remove('show');
}
function importSentimentReviewJson(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const original={
    sentimentReview:JSON.parse(JSON.stringify(stock.sentimentReview||{})),
    shortTermSentiment:JSON.parse(JSON.stringify(stock.shortTermSentiment||{})),
    recentCatalyst:JSON.parse(JSON.stringify(stock.recentCatalyst||{})),
    eventExplanation:JSON.parse(JSON.stringify(stock.eventExplanation||{})),
    longTermLogic:JSON.parse(JSON.stringify(stock.longTermLogic||{})),
    informationCompleteness:JSON.parse(JSON.stringify(stock.informationCompleteness||{})),
    dataFreshness:JSON.parse(JSON.stringify(stock.dataFreshness||{}))
  };
  let parsed;
  try{parsed=extractFirstJsonObject(document.getElementById('sentimentImportText').value)}catch(e){alert('导入失败：JSON 无法解析。');return}
  try{
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON 必须是对象。');
    let changed=false;
    const looksLikeLongTerm=Boolean(parsed.longTermLogic||parsed.logicStatus||parsed.investmentThesis||parsed.fundamentalSupport||parsed.coreDrivers||parsed.longTermRisks);
    const looksLikeRecentCatalyst=Boolean(parsed.recentCatalyst||parsed.analysisDate||parsed.todayCatalyst||parsed.recentEvents||parsed.latestSourceDate||parsed.freshnessStatus);
    const looksLikeEventExplanation=Boolean(parsed.eventExplanation||parsed.priceActionDetected!==undefined||parsed.canExplainTodayMove!==undefined||parsed.explanationConfidence||parsed.explanation);
    const looksLikeShortTermSentiment=Boolean(parsed.shortTermSentiment||parsed.fundFlowView||parsed.sectorHeat||parsed.institutionalView);
    const looksLikeInformationCompleteness=Boolean(parsed.informationCompleteness||parsed.missingItems||parsed.overall||parsed.news&&parsed.fundFlow);
    if(parsed.sentimentReview||(!looksLikeShortTermSentiment&&!looksLikeLongTerm&&!looksLikeRecentCatalyst&&!looksLikeInformationCompleteness&&(parsed.conclusion||parsed.marketMood||parsed.newsSummary||parsed.positivePoints))){
      const payload=parsed.sentimentReview||parsed;
      stock.sentimentReview=normalizeSentimentReview({...payload,symbol:payload.symbol||stock.code||stock.symbol||'',updatedAt:payload.updatedAt||todayDate()},stock);
      changed=true;
      touchDataFreshness(stock,'newsUpdatedAt');
      touchDataFreshness(stock,'socialUpdatedAt');
    }
    if(parsed.shortTermSentiment||looksLikeShortTermSentiment){
      const payload=parsed.shortTermSentiment||parsed;
      stock.shortTermSentiment=normalizeShortTermSentiment({...payload,updatedAt:payload.updatedAt||todayDate()},stock);
      changed=true;
      touchDataFreshness(stock,'socialUpdatedAt');
    }
    if(parsed.recentCatalyst||looksLikeRecentCatalyst){
      const payload=parsed.recentCatalyst||parsed;
      stock.recentCatalyst=normalizeRecentCatalyst({...payload,analysisDate:payload.analysisDate||todayDate()},stock);
      changed=true;
      touchDataFreshness(stock,'newsUpdatedAt');
    }
    if(parsed.eventExplanation||looksLikeEventExplanation){
      stock.eventExplanation=normalizeEventExplanation(parsed.eventExplanation||parsed,stock);
      changed=true;
    }
    if(parsed.longTermLogic||looksLikeLongTerm){
      const payload=parsed.longTermLogic||parsed;
      stock.longTermLogic=normalizeLongTermLogic({...payload,updatedAt:payload.updatedAt||todayDate()},stock);
      changed=true;
      touchDataFreshness(stock,'personalViewUpdatedAt');
    }
    if(parsed.informationCompleteness||looksLikeInformationCompleteness){
      stock.informationCompleteness=normalizeInformationCompleteness(parsed.informationCompleteness||parsed,stock);
      changed=true;
    }
    if(!changed)throw new Error('未识别到可导入字段。请粘贴包含 sentimentReview、shortTermSentiment、recentCatalyst、eventExplanation、longTermLogic 或 informationCompleteness 的 JSON。');
    normalizeStockAnalysis(stock);
    saveState();
    closeSentimentImportModal();
    refreshLongLogicModalIfOpen();
    render();
    alert('新闻/情绪资料已导入。建议重新生成配置决策。');
  }catch(err){
    stock.sentimentReview=original.sentimentReview;
    stock.shortTermSentiment=original.shortTermSentiment;
    stock.recentCatalyst=original.recentCatalyst;
    stock.eventExplanation=original.eventExplanation;
    stock.longTermLogic=original.longTermLogic;
    stock.informationCompleteness=original.informationCompleteness;
    stock.dataFreshness=original.dataFreshness;
    alert('导入失败：'+(err&&err.message?err.message:String(err)));
  }
}
function detailResultsArchivePanel(s,cp){
  const fundamentalDiagnostics=s.type==='etf'?etfIndexAnalysisPanel(s):`${financialSignalPanel(s)}${valuationAnalysisPanel(s)}${valuationSignalPanel(s)}`;
  const body=`${technicalAnalysisPanel(s)}${fundamentalDiagnostics}${sentimentReviewPanel(s)}${allocationDecisionPanel(s)}${aiReviewSummaryPanel(s)}${decisionPanel(s)}${technicalSignalPanel(s)}${freshnessPanel(s)}${dataFreshnessPanel(s)}`;
  return collapsibleCard('数据与评分诊断',body,false,s.type==='etf'?'这里保留技术、指数/行业、配置、决策引擎和数据更新时间的原始结果，用于排查数据和评分，不作为主决策入口。':'这里保留技术、财报、配置、估值、决策引擎和数据更新时间的原始结果，用于排查数据和评分，不作为主决策入口。');
}
function detailResearchArchivePanel(s,cp){
  const discipline=`<div class="dash"><div class="card" style="grid-column:span 2"><div class="card-title">纪律规则</div><div class="text" style="max-width:none"><b>持有逻辑：</b>${esc(s.thesis||s.notes||'—')}<br><br><b>卖出/降仓：</b>${esc(s.sellRule||'—')}<br><br><b>加仓规则：</b>${esc(s.buyRule||'—')}</div></div><div class="card" style="grid-column:span 2"><div class="card-title">社媒舆情</div>${stockSocialSummary(s)}</div></div>`;
  const plans=`<div class="dash"><div class="card" style="grid-column:span 2"><div class="card-title">加仓计划</div>${planListHtml(s.plans,'buy',cp)}</div><div class="card" style="grid-column:span 2"><div class="card-title">减仓计划</div>${planListHtml(s.plans,'sell',cp)}</div></div><div class="card"><div class="card-title">操作记录</div>${stockExecutionRows(s.name)}</div>`;
  return collapsibleCard('深度资料、规则与记录',`${discipline}${analysisInputsPanel(s)}${analysisFrameworkPanel(s)}${plans}`,false,'默认折叠。这里保留九模块、原始分析资料、纪律规则、完整计划表和操作记录。');
}
function detailAdvancedToolsArchivePanel(s){
  const body=`${collectionPanel(s)}${technicalAnalysisFlowPanel()}${financialAnalysisFlowPanel()}${unifiedPromptPanel(s)}${comprehensivePackagePanel(s)}${aiReviewImportPanel(s)}${detailToolsPanel(s)}`;
  return collapsibleCard('高级工具与旧流程',body,false,'默认折叠。旧版 Prompt、信息采集、AI Review 导入和维护工具都保留在这里。');
}
function longTermLogicPanel(stock){
  const l=normalizeLongTermLogic(stock.longTermLogic,stock);
  const has=Boolean(l.investmentThesis||l.coreDrivers.length||l.fundamentalSupport||l.longTermRisks.length);
  const status={valid:'有效',weakening:'减弱',broken:'破坏',unclear:'不明确'}[l.logicStatus]||l.logicStatus||'不明确';
  const body=has
    ?`<div class="dash" style="margin:0"><div><div class="card-title">逻辑状态</div><div class="card-num" style="font-size:20px">${esc(status)}</div><div class="card-note">置信度 ${esc(zhConfidence(l.confidence))}</div></div><div><div class="card-title">更新时间</div><div class="card-note">${esc(l.updatedAt||'—')}</div><div class="card-note">有效至 ${esc(l.validUntil||'—')}</div></div><div><div class="card-title">下次复核</div><div class="card-note">${esc(l.nextReviewDate||'—')}</div></div></div><div class="text" style="max-width:none;margin-top:12px"><b>投资主线：</b>${esc(formatChineseText(l.investmentThesis||'—'))}<br><br><b>核心驱动：</b>${l.coreDrivers.map(formatChineseText).map(esc).join('；')||'—'}<br><br><b>财务验证：</b>${esc(formatChineseText(l.fundamentalSupport||'—'))}<br><br><b>长期风险：</b>${l.longTermRisks.map(formatChineseText).map(esc).join('；')||'—'}<br><br><b>来源摘要：</b>${esc(formatChineseText(l.sourceSummary||'—'))}</div>`
    :'<div class="alert">待补充长期逻辑。</div>';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">长期逻辑</div>${body}<div class="modal-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-detail-action="copy-long-term-logic-prompt">复制长期逻辑整理 Prompt</button><button class="btn ghost small" data-detail-action="import-sentiment-json">导入长期逻辑 JSON</button></div></div>`;
}
function ensureLongLogicModal(){
  let el=document.getElementById('longLogicModal');
  if(el)return el;
  el=document.createElement('div');
  el.className='modal-bg long-logic-bg';
  el.id='longLogicModal';
  el.innerHTML=`<div class="long-logic-layer"><div class="long-logic-header"><button class="link-btn long-logic-back" id="longLogicCloseBtn" type="button">← 返回</button><div class="long-logic-title" id="longLogicTitle">长期逻辑</div><div class="long-logic-spacer"></div></div><div class="long-logic-body"><div class="modal-sub">低频研究内容：基本面/指数行业、配置决策、估值财报和深度复核。本阶段作为伪页面，不占用详情页顶部。</div><div id="longLogicBody"></div></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target.id==='longLogicModal')closeLongLogicModal()});
  el.addEventListener('click',e=>{
    const btn=e.target.closest&&e.target.closest('[data-detail-action]');
    if(!btn)return;
    if(btn.dataset.detailAction==='copy-long-term-logic-prompt')copyLongTermLogicPrompt();
    if(btn.dataset.detailAction==='import-sentiment-json')openSentimentImportModal();
  });
  document.getElementById('longLogicCloseBtn').addEventListener('click',closeLongLogicModal);
  return el;
}
function openLongLogicModal(){
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  const el=ensureLongLogicModal();
  const title=document.getElementById('longLogicTitle');
  if(title)title.textContent=`${stock.name||'标的'} · 长期逻辑`;
  document.getElementById('longLogicBody').innerHTML=`${longTermLogicPanel(stock)}${stock.type==='etf'?etfIndexAnalysisPanel(stock):fundamentalAnalysisPanel(stock)}${allocationDecisionPanel(stock)}${valuationAnalysisPanel(stock)}${aiReviewSummaryPanel(stock)}`;
  el.classList.add('show');
}
function refreshLongLogicModalIfOpen(){
  const modal=document.getElementById('longLogicModal');
  if(!modal||!modal.classList.contains('show'))return;
  const stock=state.stocks.find(x=>x.id===detailStockId);
  if(!stock)return;
  normalizeStockAnalysis(stock);
  const title=document.getElementById('longLogicTitle');
  if(title)title.textContent=`${stock.name||'标的'} · 长期逻辑`;
  const body=document.getElementById('longLogicBody');
  if(body)body.innerHTML=`${longTermLogicPanel(stock)}${stock.type==='etf'?etfIndexAnalysisPanel(stock):fundamentalAnalysisPanel(stock)}${allocationDecisionPanel(stock)}${valuationAnalysisPanel(stock)}${aiReviewSummaryPanel(stock)}`;
}
function closeLongLogicModal(){
  const modal=document.getElementById('longLogicModal');
  if(modal)modal.classList.remove('show');
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
  document.getElementById('main').innerHTML=`${detailHeroPanel(s,mv,actual,deviation)}${currentActionPanel(s)}${technicalAnalysisPanel(s)}${shortTermCatalystPanel(s)}${shortTermSentimentPanel(s)}${informationCompletenessPanel(s)}${positionPlanPanel(s)}${decisionWorkflowPanel(s)}${detailResultsArchivePanel(s,cp)}${detailResearchArchivePanel(s,cp)}${detailAdvancedToolsArchivePanel(s)}`;
  document.getElementById('backToListBtn').addEventListener('click',closeStockDetail);
  document.querySelectorAll('[data-detail-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.detailAction==='refresh')refreshOnePrice(s.id);if(b.dataset.detailAction==='long-logic')openLongLogicModal();if(b.dataset.detailAction==='edit')openModal(s.id);if(b.dataset.detailAction==='ai-assistant')openAiAssistant();if(b.dataset.detailAction==='financial-source')openFinancialSourceAssistant();if(b.dataset.detailAction==='valuation-source')openValuationSourceAssistant();if(b.dataset.detailAction==='ai-prompt')openAiAnalysisPrompt();if(b.dataset.detailAction==='ai-import')openAiAnalysisImport();if(b.dataset.detailAction==='ai-strategy-import')openAiAssistantTask('strategy');if(b.dataset.detailAction==='edit-inputs')openAnalysisInputsEditor();if(b.dataset.detailAction==='template')openAnalysisTemplateModal();if(b.dataset.detailAction==='edit-strategy')openStrategyEditor();if(b.dataset.detailAction==='view-allocation-detail')openAllocationDecisionDetail();if(b.dataset.detailAction==='copy-allocation-prompt')copyAllocationDecisionPrompt();if(b.dataset.detailAction==='import-allocation-json')openAllocationDecisionImportModal();if(b.dataset.detailAction==='copy-technical-prompt')copyTechnicalAnalysisPrompt();if(b.dataset.detailAction==='import-technical-json')openTechnicalJsonImportModal();if(b.dataset.detailAction==='copy-full-add-discussion-prompt')copyFullAddDiscussionPrompt();if(b.dataset.detailAction==='copy-trade-plan-prompt')copyTradePlanPrompt();if(b.dataset.detailAction==='import-trade-plan-json')openTradePlanImportModal();if(b.dataset.detailAction==='copy-fundamental-prompt')copyFundamentalPrompt();if(b.dataset.detailAction==='import-fundamental-json')openFundamentalImportModal();if(b.dataset.detailAction==='copy-etf-analysis-prompt')copyEtfAnalysisPrompt();if(b.dataset.detailAction==='import-etf-analysis-json')openEtfAnalysisImportModal();if(b.dataset.detailAction==='copy-sentiment-prompt')copySentimentSearchPrompt();if(b.dataset.detailAction==='copy-recent-catalyst-prompt')copyRecentCatalystPrompt();if(b.dataset.detailAction==='copy-short-term-sentiment-prompt')copyShortTermSentimentPrompt();if(b.dataset.detailAction==='copy-long-term-logic-prompt')copyLongTermLogicPrompt();if(b.dataset.detailAction==='import-sentiment-json')openSentimentImportModal();if(b.dataset.detailAction==='edit-technical')openTechnicalDataEditor();if(b.dataset.detailAction==='import-history')importPriceHistoryCsv();if(b.dataset.detailAction==='update-technical-history')updateTechnicalFromHistoryForDetail();if(b.dataset.detailAction==='apply-technical')applyTechnicalSignalToAnalysis();if(b.dataset.detailAction==='edit-valuation')openValuationDataEditor();if(b.dataset.detailAction==='copy-valuation-lookup-prompt')copyValuationLookupPrompt();if(b.dataset.detailAction==='import-valuation-json')openValuationImportModal();if(b.dataset.detailAction==='apply-valuation')applyValuationSignalToAnalysis();if(b.dataset.detailAction==='edit-financial')openFinancialDataEditor();if(b.dataset.detailAction==='copy-financial-search-prompt')copyFinancialSearchPrompt();if(b.dataset.detailAction==='import-financial')openFinancialImportModal();if(b.dataset.detailAction==='apply-financial')applyFinancialSignalToAnalysis()}));
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


