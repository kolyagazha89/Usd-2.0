import { jest } from '@jest/globals';
import { PushService } from './push.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushTransport } from './push.transport';
import type { AuditService } from '../common/audit/audit.service';

const registrationId = 'faef004b-d2db-40b5-827b-6b05cfd896a0';
const stage = { id: 'stage-1', name: 'USD Воронеж', date: new Date('2026-10-29T14:00:00Z') };
const now = new Date('2026-10-30T14:00:00Z');

describe('post-stage equipment push', () => {
  it('creates one opt-in reminder for the linked participant and deduplicates re-runs', async () => {
    const messages = new Map<string, any>();
    const create = jest.fn<(...args:any[])=>Promise<any>>(async ({data}:any)=>{
      const message = { id: 'message-1', ...data };messages.set(data.eventKey,message);return message;
    });
    const db: any = {
      stage: { findMany: jest.fn<(...args:any[])=>Promise<any>>(async ({where}:any)=>
        where.status === 'PUBLISHED' ? [] : [stage]) },
      registration: { findMany: jest.fn<(...args:any[])=>Promise<any>>(async()=>[
        { id: registrationId, carId: 'car-1', configurationSnapshot: { configurationPending: true },
          participant: { user: { id: 'user-1' } } },
      ]) },
      $transaction: jest.fn<(...args:any[])=>Promise<any>>(async (fn:any)=>fn({
        pushMessage: { findUnique: async ({where}:any)=>messages.get(where.eventKey),create },
        pushSubscription: { findMany: async()=>[{ id: 'subscription-1' }] },
      })),
    };
    const service = new PushService(db as PrismaService, { configured:()=>true } as PushTransport, {} as AuditService);
    await service.schedule(now);
    await service.schedule(now);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
      eventKey: 'configuration-pending:'+registrationId+':1',
      category: 'reminders', path: '/participant?tab=registrations', stageId: stage.id,
      deliveries: { create: [{ subscriptionId: 'subscription-1' }] },
    })}));
    expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        stageId: stage.id, status: 'ACTIVE', source: 'ON_SITE',
        participant: { user: { isActive: true, emailVerifiedAt: { not: null } } },
      }),
    }));
  });

  it('never queues a reminder for resolved post-stage equipment or an unlinked profile', async () => {
    const create = jest.fn();
    const db: any = {
      stage:{findMany: async ({where}:any)=>where.status==='PUBLISHED'?[]:[stage]},
      registration:{findMany:async()=>[
        {id:registrationId,carId:'car-1',configurationSnapshot:{
          configurationPending:true,postStageCompletion:{versionId:'real-version'},
        },participant:{user:{id:'user-1'}}},
        {id:'other',carId:'car-2',configurationSnapshot:{configurationPending:true},participant:{user:null}},
      ]},
      $transaction:create,
    };
    const service = new PushService(db as PrismaService,{configured:()=>true} as PushTransport,{} as AuditService);
    await service.schedule(now);
    expect(create).not.toHaveBeenCalled();
  });

  it('skips a queued notification if the participant filled the configuration before delivery', async () => {
    jest.useFakeTimers();jest.setSystemTime(now);
    try {
      const send = jest.fn<(...args:any[])=>Promise<number>>().mockResolvedValue(201);
      const update = jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({});
      const db: any = {
        pushDelivery:{
          findMany: async()=>[{
            id:'delivery-1',subscriptionId:'subscription-1',status:'PENDING',attempts:0,
            message:{id:'msg',stageId:stage.id,category:'reminders',
              eventKey:'configuration-pending:'+registrationId+':1',createdAt:new Date(now.getTime()-1000),
              path:'/participant?tab=registrations',title:'USD',body:'Заполните оборудование'},
          }],
          updateMany:async()=>({count:1}),update,
        },
        pushSubscription:{findUnique:async()=>({
          id:'subscription-1',userId:'user-1',reminders:true,
          user:{isActive:true,emailVerifiedAt:new Date()},endpoint:'https://push.invalid/test',
          p256dh:'key',auth:'secret',
        })},
        stage:{findFirst:async()=>({...stage,status:'COMPLETED',isDeleted:false})},
        registration:{findFirst:async()=>({
          configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'version-1'}},
        })},
      };
      const service = new PushService(db as PrismaService,{configured:()=>true,send} as PushTransport,{} as AuditService);
      await service.processQueue();
      expect(send).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        data:expect.objectContaining({status:'SKIPPED'}),
      }));
    } finally { jest.useRealTimers(); }
  });
});
