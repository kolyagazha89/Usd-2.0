import {canonicalPlateIdentity,normalizePlateNumber,plateAdvisoryKey} from './plate-identity';

describe('registration plate identity shared by event gate and participant cars',()=>{
 it('maps historic Latin lookalikes to the one Russian plate identity',()=>{
  const plates=['A123BC77','А123ВС77','а 123 в-с 77','А123ВС-77','А123ВС/77'];
  expect(new Set(plates.map(plate=>canonicalPlateIdentity('RU',plate))).size).toBe(1);
  expect(normalizePlateNumber('RU','A123BC77')).toBe('А123ВС77');
 });
 it('uses the same advisory lock for different equivalent spellings and input sources',()=>{
  expect(plateAdvisoryKey('RU','A123BC77')).toBe(plateAdvisoryKey('RU','А 123 ВС-77'));
  expect(plateAdvisoryKey('RU','A123BC77')).toBe('vehicle-plate:RU:А123ВС77');
  expect(plateAdvisoryKey('BY','A123BC77')).not.toBe(plateAdvisoryKey('RU','A123BC77'));
 });
 it('normalizes foreign plates without rewriting Latin characters',()=>{
  expect(normalizePlateNumber('BY','a 123   bc 77')).toBe('A 123 BC 77');
  expect(canonicalPlateIdentity('BY','A 123-BC 77')).toBe('A123BC77');
 });
 it('does not permit invisible formatting chars to bypass duplicate detection',()=>{
  expect(canonicalPlateIdentity('RU','А123ВС77\u200B')).toBe('А123ВС77');
  expect(plateAdvisoryKey('RU','А123ВС77\uFEFF')).toBe(plateAdvisoryKey('RU','A123BC77'));
 });
});
