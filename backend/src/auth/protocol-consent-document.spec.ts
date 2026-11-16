import {hasApprovedProtocolConsentDocument} from './protocol-consent-document';

describe('approved separate protocol publication consent',()=>{
 const doc={targetId:'legal-document-officialProtocolConsent-20261116',url:'https://api.example.org/document.docx'};
 it('requires an operator-approved, attached separate publication document',()=>{
  expect(hasApprovedProtocolConsentDocument({legalApproved:true})).toBe(false);
  expect(hasApprovedProtocolConsentDocument({legalApproved:false,documents:{officialProtocolConsent:doc}})).toBe(false);
  expect(hasApprovedProtocolConsentDocument({legalApproved:true,documents:{officialProtocolConsent:doc}})).toBe(true);
 });
 it('rejects wrong category, forged ID, and empty document address',()=>{
  expect(hasApprovedProtocolConsentDocument({legalApproved:true,documents:{photoProfileConsent:doc}})).toBe(false);
  expect(hasApprovedProtocolConsentDocument({legalApproved:true,documents:{officialProtocolConsent:{...doc,targetId:'legal-document-photoProfileConsent-20261116'}}})).toBe(false);
  expect(hasApprovedProtocolConsentDocument({legalApproved:true,documents:{officialProtocolConsent:{...doc,url:''}}})).toBe(false);
 });
});
