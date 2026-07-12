(function(){
  function arr(value){
    return Array.isArray(value)?value:[];
  }

  function obj(value){
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }

  function text(value,fallback){
    const s=String(value===undefined||value===null?'':value).trim();
    return s||fallback||'';
  }

  function sourceData(){
    const bridged=obj(window.AI_DECISION_REVIEW_DATA);
    const appState=typeof state==='object'&&state?state:{};
    const nested=obj(appState.aiDecisionReview);
    return {
      aiDrafts:arr(bridged.aiDrafts).concat(arr(appState.aiDrafts),arr(nested.aiDrafts)),
      reviewTasks:arr(bridged.reviewTasks).concat(arr(appState.reviewTasks),arr(nested.reviewTasks)),
      decisionOutcomes:arr(bridged.decisionOutcomes).concat(arr(appState.decisionOutcomes),arr(nested.decisionOutcomes)),
      discussionRecords:arr(bridged.discussionRecords).concat(arr(appState.discussionRecords),arr(nested.discussionRecords))
    };
  }

  function resultOf(draft,task){
    const d=obj(draft);
    const payload=obj(task&&task.payload);
    return obj(d.result&&Object.keys(obj(d.result)).length?d.result:(d.draft&&Object.keys(obj(d.draft)).length?d.draft:(payload.result||{})));
  }

  function dateValue(record){
    return text(record&&(
      record.created_at||
      record.createdAt||
      record.generatedAt||
      record.updatedAt
    ),'');
  }

  function stockKey(value){
    return text(value,'').toUpperCase();
  }

  function matchesStock(stock,symbol){
    const key=stockKey(symbol);
    if(!key)return false;
    return [stock&&stock.code,stock&&stock.symbol,stock&&stock.id,stock&&stock.name]
      .map(stockKey)
      .some(v=>v&&v===key);
  }

  function outcomeMessage(type){
    return {
      no_change:'当前策略无需调整',
      plan_update:'需要更新计划',
      operation_request:'进入操作流程'
    }[text(type,'')]||'等待讨论确认';
  }

  function taskTypeLabel(type){
    return {
      long_term_logic_review:'长期逻辑复核'
    }[text(type,'')]||text(type,'AI复核');
  }

  function businessStatusLabel(status){
    return {
      valid:'长期逻辑有效',
      weakened:'长期逻辑转弱',
      invalid:'长期逻辑失效',
      insufficient_information:'信息不足',
      needs_review:'需要复核'
    }[text(status,'')]||text(status,'未形成业务状态');
  }

  function reviewStatusLabel(status){
    return {
      pending:'待复核',
      pending_review:'待复核',
      reviewing:'复核中',
      approved:'已批准',
      rejected:'已拒绝',
      deferred:'已暂缓'
    }[text(status,'')]||text(status,'待复核');
  }

  function normalizeRecordFromDraft(draft,tasksByDraft,outcomesByReview){
    const d=obj(draft);
    const draftId=text(d.draft_id||d.id,'');
    const task=obj(tasksByDraft[draftId]);
    const reviewId=text(task.review_id||d.source_review_id||draftId,'');
    const outcome=obj(outcomesByReview[reviewId]);
    const result=resultOf(d,task);
    const outcomeType=text(outcome.outcome_type,'');
    return {
      source:'ai_draft',
      draftId,
      reviewId,
      symbol:text(d.symbol||result.symbol||task.symbol,''),
      taskType:text(d.task_type||task.task_type,''),
      taskTypeLabel:taskTypeLabel(d.task_type||task.task_type),
      aiConclusion:text(result.summary||d.summary||task.summary,'暂无 AI 结论'),
      businessStatus:text(result.logic_status||d.logic_status,''),
      businessStatusLabel:businessStatusLabel(result.logic_status||d.logic_status),
      reviewStatus:text(task.status||d.review_status||'pending','pending'),
      reviewStatusLabel:reviewStatusLabel(task.status||d.review_status||'pending'),
      outcomeType,
      outcomeLabel:outcomeMessage(outcomeType),
      outcomeConclusion:text(outcome.conclusion,''),
      provider:text(d.provider,''),
      model:text(d.model,''),
      createdAt:dateValue(task)||dateValue(d)||dateValue(outcome),
      result,
      raw:{draft:d,reviewTask:task,decisionOutcome:outcome}
    };
  }

  function normalizeRecordFromTask(task,outcomesByReview){
    const t=obj(task);
    const reviewId=text(t.review_id,'');
    const outcome=obj(outcomesByReview[reviewId]);
    const result=resultOf({},t);
    const outcomeType=text(outcome.outcome_type,'');
    return {
      source:'review_task',
      draftId:text(t.source_input_id,''),
      reviewId,
      symbol:text(t.symbol||result.symbol,''),
      taskType:text(t.task_type,''),
      taskTypeLabel:taskTypeLabel(t.task_type),
      aiConclusion:text(result.summary||t.summary,'暂无 AI 结论'),
      businessStatus:text(result.logic_status,''),
      businessStatusLabel:businessStatusLabel(result.logic_status),
      reviewStatus:text(t.status,'pending'),
      reviewStatusLabel:reviewStatusLabel(t.status),
      outcomeType,
      outcomeLabel:outcomeMessage(outcomeType),
      outcomeConclusion:text(outcome.conclusion,''),
      provider:'',
      model:'',
      createdAt:dateValue(t)||dateValue(outcome),
      result,
      raw:{draft:{},reviewTask:t,decisionOutcome:outcome}
    };
  }

  function attachDiscussion(record,discussionsByReview){
    const discussion=obj(discussionsByReview[record.reviewId]);
    record.discussionId=text(discussion.discussion_id,'');
    record.discussionPrompt=text(discussion.prompt,'');
    record.raw.discussionRecord=discussion;
    return record;
  }

  function isAiDecisionRecord(record){
    const raw=obj(record&&record.raw);
    const reviewTask=obj(raw.reviewTask);
    const payload=obj(reviewTask.payload);
    const taskType=text(record&&record.taskType,'');
    const draftId=text(record&&record.draftId,'');
    return record&&record.source==='ai_draft'
      || taskType==='long_term_logic_review'
      || draftId.indexOf('draft_')===0
      || Boolean(payload.ai_draft_path||payload.draft_id);
  }

  function records(){
    const data=sourceData();
    const tasksByDraft={};
    const outcomesByReview={};
    const discussionsByReview={};
    data.reviewTasks.forEach(task=>{
      const t=obj(task);
      const sourceId=text(t.source_input_id,'');
      if(sourceId&&!tasksByDraft[sourceId])tasksByDraft[sourceId]=t;
    });
    data.decisionOutcomes.forEach(outcome=>{
      const o=obj(outcome);
      const reviewId=text(o.source_review_id,'');
      if(reviewId&&!outcomesByReview[reviewId])outcomesByReview[reviewId]=o;
    });
    data.discussionRecords.forEach(discussion=>{
      const d=obj(discussion);
      const reviewId=text(d.source_review_id,'');
      if(reviewId&&!discussionsByReview[reviewId])discussionsByReview[reviewId]=d;
    });
    const seenTasks=new Set();
    const output=data.aiDrafts.map(draft=>{
      const rec=normalizeRecordFromDraft(draft,tasksByDraft,outcomesByReview);
      if(rec.reviewId)seenTasks.add(rec.reviewId);
      return attachDiscussion(rec,discussionsByReview);
    });
    data.reviewTasks.forEach(task=>{
      const reviewId=text(task&&task.review_id,'');
      if(reviewId&&seenTasks.has(reviewId))return;
      output.push(attachDiscussion(normalizeRecordFromTask(task,outcomesByReview),discussionsByReview));
    });
    return output
      .filter(record=>record.symbol||record.reviewId||record.draftId)
      .filter(isAiDecisionRecord)
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }

  function pendingRecords(){
    return records().filter(record=>!['approved','rejected'].includes(record.reviewStatus));
  }

  function recordsForStock(stock){
    return records().filter(record=>matchesStock(stock,record.symbol));
  }

  window.AiDecisionReviewReader={
    records,
    pendingRecords,
    recordsForStock,
    outcomeMessage,
    businessStatusLabel,
    reviewStatusLabel,
    taskTypeLabel,
    discussionPromptForReview:function(reviewId){
      const match=records().find(record=>record.reviewId===reviewId);
      return match?match.discussionPrompt:'';
    }
  };
})();
