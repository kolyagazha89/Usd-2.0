import { jest } from '@jest/globals';
import {ConflictException} from '@nestjs/common';
import {ParticipantsService} from './participants.service';
import {plateAdvisoryKey} from './plate-identity';

describe('Car plate identity under concurrent registrations',()=>{
 const actor:any={user:{sub:'admin-1',role:'ADMIN',participantId:'p1'}};
 const makeDb=()=>{
  const rows:any[]=[];
  let nextId=0,queue=Promise.resolve();
  const tx:any={
   $executeRaw:jest.fn(async()=>0),
   car:{
    findMany:jest.fn(async({where}:any)=>rows.filter(car=>
     car.registrationCountry===where.registrationCountry&&car.id!==where.id?.not
    ).map(car=>({id:car.id,registrationNumber:car.registrationNumber}))),
    findUnique:jest.fn(async({where}:any)=>rows.find(x=>x.id===where.id)??null),
    create:jest.fn(async({data}:any)=>{
     const car={id:'car-'+(++nextId),...data};
     rows.push(car);return car;
    }),
    update:jest.fn(async({where,data}:any)=>{
     const car=rows.find(x=>x.id===where.id);
     if(!car)throw Error('missing car');Object.assign(car,data);return car;
    }),
   },
  };
  const prisma:any={
   participant:{findUnique:jest.fn(async()=>({id:'p1'}))},
   siteSettings:{findUnique:jest.fn(async()=>({catalogs:{}}))},
   user:{findUnique:jest.fn(async()=>({id:'admin-1',role:'ADMIN',isActive:true,participantId:'p1'}))},
   car:{findUnique:jest.fn(async({where}:any)=>rows.find(x=>x.id===where.id)??null)},
   $transaction:jest.fn(async(callback:any)=>{
    // Mimics pg_advisory_xact_lock for competing requests on the same key.
    let release!:()=>void;const prior=queue;
    queue=new Promise<void>(resolve=>{release=resolve});
    await prior;
    try{return await callback(tx)}finally{release()}
   }),
  };
  return {prisma,tx,rows};
 };
 const payload=(registrationNumber:string)=>({
  brand:'Lada',model:'Vesta',registrationCountry:'RU' as const,registrationNumber,
 });
 it('only creates one car if concurrent staff/admin requests use different RU spellings',async()=>{
  const {prisma,tx,rows}=makeDb(),service=new ParticipantsService(prisma);
  const a=(service as any).createCarInternal('p1',payload('A123BC72'));
  const b=(service as any).createCarInternal('p1',payload('А123ВС72'));
  const results=await Promise.allSettled([a,b]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect((results.find(x=>x.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  expect(rows).toHaveLength(1);
  expect(tx.car.create).toHaveBeenCalledTimes(1);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  expect(tx.$executeRaw.mock.calls[0][1]).toBe(plateAdvisoryKey('RU','A123BC72'));
  expect(tx.$executeRaw.mock.calls[1][1]).toBe(plateAdvisoryKey('RU','А123ВС72'));
 });
 it('rejects editing a car to a plate already claimed through another channel',async()=>{
  const {prisma,tx,rows}=makeDb(),service=new ParticipantsService(prisma);
  rows.push({id:'car-A',participantId:'p1',registrationCountry:'RU',registrationNumber:'А555АА72'},
            {id:'car-B',participantId:'p1',registrationCountry:'RU',registrationNumber:'А123ВС72'});
  const rejected=service.updateCar(actor,'car-A',{registrationNumber:'A123BC72'});
  await expect(rejected).rejects.toBeInstanceOf(ConflictException);
  await expect(service.updateCar(actor,'car-A',{registrationNumber:'A123BC72'}))
   .rejects.not.toThrow(/car-B|ID:/);
  expect(rows[0].registrationNumber).toBe('А555АА72');
  expect(tx.car.update).not.toHaveBeenCalled();
 });
 it('allows a legitimate plate edit after checking latest state inside the transaction',async()=>{
  const {prisma,tx,rows}=makeDb(),service=new ParticipantsService(prisma);
  rows.push({id:'car-A',participantId:'p1',registrationCountry:'RU',registrationNumber:'А555АА72'});
  const updated=await service.updateCar(actor,'car-A',{registrationNumber:'A123BC72'});
  expect(updated.registrationNumber).toBe('А123ВС72');
  expect(rows).toHaveLength(1);
  expect(tx.car.update).toHaveBeenCalledTimes(1);
 });
});
