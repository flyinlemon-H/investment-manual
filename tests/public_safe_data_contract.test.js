'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const ROOT=path.resolve(__dirname,'..');
const AI_COLLECTIONS=[
  'aiDrafts','reviewTasks','decisionOutcomes','discussionRecords',
  'planUpdateRequests','operationRequests','planApplicationAudits',
  'operationApplicationAudits','taskResolutions','taskProjections',
  'homeTaskProjections','historyProjections','systemIssues'
];

function createContext(windowValues={}){
  const storage=new Map();
  const window={...windowValues};
  const context={
    console,
    window,
    state:{},
    localStorage:{
      getItem:key=>storage.has(key)?storage.get(key):null,
      setItem:(key,value)=>storage.set(key,String(value))
    },
    crypto:globalThis.crypto,
    TextEncoder:globalThis.TextEncoder,
    setTimeout:()=>0,
    clearTimeout:()=>{}
  };
  context.globalThis=context;
  vm.createContext(context);
  return context;
}

function load(context,relativePath){
  const filename=path.join(ROOT,relativePath);
  vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename:relativePath});
}

function ownKeys(value){
  return Array.from(Object.keys(value)).sort();
}

function assertUnavailableMetadata(value,reason='private_runtime_unavailable'){
  assert.equal(value.schemaVersion,'1.0');
  assert.equal(value.status,'UNAVAILABLE');
  assert.equal(value.reason,reason);
  assert.equal(Object.isFrozen(value),true);
}

test('backend safe template loads and API remains explicitly unconfigured',async()=>{
  const context=createContext();
  load(context,'data/backend_config.js');
  load(context,'src/api/api-errors.js');
  load(context,'src/api/api-client.js');
  load(context,'src/api/health-api.js');

  const config=context.window.BACKEND_CONFIG;
  assertUnavailableMetadata(config,'backend_not_configured');
  assert.deepEqual(ownKeys(config),['baseUrl','reason','schemaVersion','status']);
  assert.equal(config.baseUrl,'');
  assert.throws(
    ()=>context.window.InvestmentApi.client.configuredBaseUrl(),
    error=>error&&error.type==='configuration_error'
  );
  await assert.rejects(
    ()=>context.window.InvestmentApi.health.check(),
    error=>error&&error.type==='configuration_error'
  );
});

test('missing backend config also fails closed without a false healthy response',async()=>{
  const context=createContext();
  load(context,'src/api/api-errors.js');
  load(context,'src/api/api-client.js');
  load(context,'src/api/health-api.js');

  assert.throws(
    ()=>context.window.InvestmentApi.client.configuredBaseUrl(),
    error=>error&&error.type==='configuration_error'
  );
  await assert.rejects(
    ()=>context.window.InvestmentApi.health.check(),
    error=>error&&error.type==='configuration_error'
  );
});

test('AI public template is unavailable, frozen, and carries no runtime payload',()=>{
  const context=createContext();
  load(context,'templates/public/data/ai_decision_review_data.js');
  const payload=context.window.AI_DECISION_REVIEW_DATA;

  assertUnavailableMetadata(payload);
  assert.deepEqual(
    ownKeys(payload),
    ['schemaVersion','status','reason',...AI_COLLECTIONS].sort()
  );
  for(const key of AI_COLLECTIONS){
    assert.equal(Array.isArray(payload[key]),true,`${key} must be an array`);
    assert.equal(payload[key].length,0,`${key} must not carry records`);
    assert.equal(Object.isFrozen(payload[key]),true,`${key} must be frozen`);
  }
  assert.equal(Object.values(payload).some(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)),false);
});

test('AI reader distinguishes unavailable, empty, and loaded projections',()=>{
  const unavailable=createContext();
  load(unavailable,'templates/public/data/ai_decision_review_data.js');
  load(unavailable,'src/ai-decision-review.js');
  assert.equal(unavailable.window.AiDecisionReviewReader.projectionState().status,'UNAVAILABLE');
  assert.deepEqual(Array.from(unavailable.window.AiDecisionReviewReader.records()),[]);

  const empty=createContext({AI_DECISION_REVIEW_DATA:{}});
  load(empty,'src/ai-decision-review.js');
  assert.equal(empty.window.AiDecisionReviewReader.projectionState().status,'EMPTY');
  assert.deepEqual(Array.from(empty.window.AiDecisionReviewReader.records()),[]);

  const loaded=createContext({AI_DECISION_REVIEW_DATA:{aiDrafts:[{
    draft_id:'draft_fixture',
    symbol:'FIXTURE.SS',
    task_type:'long_term_logic_review',
    validation_status:'passed',
    provider:'fixture',
    model:'fixture-model',
    created_at:'2026-01-01T00:00:00Z',
    result:{summary:'fixture result'}
  }]}});
  load(loaded,'src/ai-decision-review.js');
  assert.equal(loaded.window.AiDecisionReviewReader.projectionState().status,'LOADED');
  assert.equal(loaded.window.AiDecisionReviewReader.projectionState().recordCount,1);
  assert.equal(loaded.window.AiDecisionReviewReader.records().length,1);
  assert.equal(loaded.window.AiDecisionReviewReader.records()[0].symbol,'FIXTURE.SS');
});

test('missing AI and operation globals are unavailable rather than empty',()=>{
  const ai=createContext();
  load(ai,'src/ai-decision-review.js');
  assert.equal(ai.window.AiDecisionReviewReader.projectionState().status,'UNAVAILABLE');
  assert.deepEqual(Array.from(ai.window.AiDecisionReviewReader.records()),[]);

  const operation=createContext();
  load(operation,'src/operation-entry.js');
  const stock={code:'FIXTURE.SS',shares:1,avgCost:1};
  const manual=operation.window.OperationEntry.manualContext(stock);
  assert.equal(operation.window.OperationEntry.projectionState().status,'UNAVAILABLE');
  assert.equal(operation.window.OperationEntry.appliedStatus(manual).status,'UNAVAILABLE');
});

test('AI public template never overwrites an existing private runtime projection',()=>{
  const runtime={aiDrafts:[{id:'runtime-record'}]};
  const context=createContext({AI_DECISION_REVIEW_DATA:runtime});
  load(context,'templates/public/data/ai_decision_review_data.js');
  assert.equal(context.window.AI_DECISION_REVIEW_DATA,runtime);
});

test('operation public template is unavailable, frozen, and carries no applications',()=>{
  const context=createContext();
  load(context,'templates/public/data/operation_application_status_bridge.js');
  const payload=context.window.OPERATION_APPLICATION_STATUS;

  assertUnavailableMetadata(payload);
  assert.deepEqual(ownKeys(payload),['applications','reason','schemaVersion','status']);
  assert.equal(Array.isArray(payload.applications),true);
  assert.equal(payload.applications.length,0);
  assert.equal(Object.isFrozen(payload.applications),true);
});

test('Operation Entry distinguishes unavailable, empty, and loaded status projections',()=>{
  const stock={code:'FIXTURE.SS',shares:1,avgCost:1};

  const unavailable=createContext();
  load(unavailable,'templates/public/data/operation_application_status_bridge.js');
  load(unavailable,'src/operation-entry.js');
  const unavailableContext=unavailable.window.OperationEntry.manualContext(stock);
  assert.equal(unavailable.window.OperationEntry.eligible(unavailableContext),true);
  assert.equal(unavailable.window.OperationEntry.projectionState().status,'UNAVAILABLE');
  assert.equal(unavailable.window.OperationEntry.appliedStatus(unavailableContext).status,'UNAVAILABLE');

  const empty=createContext({OPERATION_APPLICATION_STATUS:{applications:[],error:''}});
  load(empty,'src/operation-entry.js');
  const emptyContext=empty.window.OperationEntry.manualContext(stock);
  assert.equal(empty.window.OperationEntry.projectionState().status,'EMPTY');
  assert.equal(empty.window.OperationEntry.appliedStatus(emptyContext),null);

  const loaded=createContext({OPERATION_APPLICATION_STATUS:{applications:[{
    application_id:'application-fixture',
    symbol:'FIXTURE.SS',
    status:'applied'
  }]}});
  load(loaded,'src/operation-entry.js');
  const loadedContext=loaded.window.OperationEntry.manualContext(stock);
  assert.equal(loaded.window.OperationEntry.projectionState().status,'LOADED');
  assert.equal(loaded.window.OperationEntry.appliedStatus(loadedContext).source,'bridge');
});

test('operation public template never overwrites an existing private runtime projection',()=>{
  const runtime={applications:[{status:'applied'}]};
  const context=createContext({OPERATION_APPLICATION_STATUS:runtime});
  load(context,'templates/public/data/operation_application_status_bridge.js');
  assert.equal(context.window.OPERATION_APPLICATION_STATUS,runtime);
});

test('public templates use exact allowlists and contain no nested private payload objects',()=>{
  const ai=createContext();
  load(ai,'templates/public/data/ai_decision_review_data.js');
  for(const key of AI_COLLECTIONS)assert.equal(ai.window.AI_DECISION_REVIEW_DATA[key].length,0);

  const operation=createContext();
  load(operation,'templates/public/data/operation_application_status_bridge.js');
  assert.equal(operation.window.OPERATION_APPLICATION_STATUS.applications.length,0);

  const backend=createContext();
  load(backend,'data/backend_config.js');
  assert.deepEqual(ownKeys(backend.window.BACKEND_CONFIG),['baseUrl','reason','schemaVersion','status']);
  assert.equal(backend.window.BACKEND_CONFIG.baseUrl,'');
});
