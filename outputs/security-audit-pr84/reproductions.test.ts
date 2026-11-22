import { expect, it } from 'vitest';
import { createFinancialAccount, createFinancialTransaction, replaceTransactionAllocations } from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { createFinanceBudget, linkFinanceBudgetAccount, addFinanceBudgetItem, getFinanceBudget } from '../../apps/api/src/finance/budget-service.js';
import { reconcileFinanceBudget } from '../../apps/api/src/finance/reconciliation-service.js';
import { FinanceRouteRegistry, registerUserStory1FinanceRoutes } from '../../apps/api/src/finance/handlers.js';
import { createManualTransaction } from '../../apps/api/src/finance/transaction-service.js';
const ids = {group:'01J00000000000000000000301',budget:'01J00000000000000000000302',account:'01J00000000000000000000303',item:'01J00000000000000000000304',category:'01J00000000000000000000305',allocation:'01J00000000000000000000306',transaction:'01J00000000000000000000307',link:'01J00000000000000000000308'};
const owner = {id:'owner',role:'user' as const,active:true,groupMemberships:[{groupId:ids.group,role:'owner' as const}]};
const member = {id:'member',role:'user' as const,active:true,groupMemberships:[{groupId:ids.group,role:'member' as const}]};
async function setup() {
 const r=new FinanceMemoryRepository();
 r.accounts.set(ids.account,createFinancialAccount({id:ids.account,scope:{type:'owner',ownerId:owner.id},sourceName:'Private',organizationName:'Private bank',accountType:'checking',currency:'USD',openingBalanceMinor:0,balanceAt:'2026-04-01T00:00:00.000Z'}));
 await createFinanceBudget(r,owner,{id:ids.budget,groupId:ids.group,name:'Shared',budgetDate:'2026-04-01',startDate:'2026-04-01',status:'active'},'budget');
 await linkFinanceBudgetAccount(r,owner,ids.budget,{id:ids.link,accountId:ids.account,expectedBudgetVersion:1},'link');
 await addFinanceBudgetItem(r,owner,ids.budget,{id:ids.item,description:'Private medical expense',financeCategoryId:ids.category,plannedAmountMinor:-12345,currency:'USD',relatedAccountIds:[ids.account],expectedBudgetVersion:2},'item');
 const t=createFinancialTransaction({id:ids.transaction,accountId:ids.account,origin:'manual',amountMinor:-12345,currency:'USD',transactedAt:'2026-04-02T00:00:00.000Z',description:'Private',pending:false,connectedAccount:false});
 r.transactions.push(replaceTransactionAllocations(t,[{id:ids.allocation,amountMinor:-12345,financeCategoryId:ids.category,budgetItemId:ids.item}],owner.id));
 return r;
}
it('reproduces private totals exposed through shared reconciliation history',async()=>{
 const r=await setup();
 await reconcileFinanceBudget(r,owner,ids.budget,{id:'recon',expectedVersion:3},'recon');
 const view=getFinanceBudget(r,member,ids.budget);
 expect(view.items).toHaveLength(0); expect(view.totals).toHaveLength(0);
 expect(view.reconciliations[0].totalsByCurrency[0].actualMinor).toBe(-12345);
});
it('reproduces private account identity and item content in group feed',async()=>{
 const r=await setup();
 expect(getFinanceBudget(r,member,ids.budget).items).toHaveLength(0);
 const change=r.feedChanges.find(c=>c.entityType==='financeBudgetItem'&&c.audience==='GROUP#'+ids.group)!;
 expect(change.payload).toMatchObject({relatedAccountIds:[ids.account],description:'Private medical expense',plannedAmountMinor:-12345});
});
it('reproduces stale permanent-delete preview removing an account with new transactions',async()=>{
 const r=new FinanceMemoryRepository();
 const a=createFinancialAccount({id:ids.account,scope:{type:'owner',ownerId:owner.id},sourceName:'Manual',organizationName:'Bank',accountType:'checking',currency:'USD',openingBalanceMinor:0,balanceAt:'2026-04-01T00:00:00.000Z'});r.accounts.set(a.id,a);
 const registry=registerUserStory1FinanceRoutes(new FinanceRouteRegistry(),{repository:r,actorFor:()=>owner,deletionSigningSecret:'test',allowedSimplefinHosts:[],now:()=>new Date('2026-04-01T00:00:00.000Z')});
 const previewResponse:any=await registry.resolve('GET','/api/v1/finance/records/{recordType}/{recordId}/deletion-preview')!({pathParameters:{recordType:'account',recordId:a.id}} as any);
 const preview=JSON.parse(previewResponse.body);expect(preview.outcome).toBe('permanent-delete');
 await createManualTransaction(r,owner,a.id,{id:ids.transaction,amountMinor:100,transactedAt:'2026-04-02T00:00:00.000Z',description:'New transaction'},'new');
 expect(r.accounts.get(a.id)!.version).toBeGreaterThan(preview.expectedVersion);
 await registry.resolve('POST','/api/v1/finance/records/{recordType}/{recordId}/deletion')!({pathParameters:{recordType:'account',recordId:a.id},body:JSON.stringify({expectedVersion:preview.expectedVersion,confirmationToken:preview.confirmationToken})} as any);
 expect(r.accounts.has(a.id)).toBe(false);expect(r.transactions).toHaveLength(1);
});
