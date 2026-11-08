/**
 * ADMIN read-only explanation of why historical self-link is available or blocked.
 * Never return the archived/account email, token, personal name, or database ID.
 * No historic contact value is promoted to a verified ownership proof by this diagnostic.
 */
export type LinkDiagnosisCode =
 | 'PROFILE_NOT_FOUND' | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_INACTIVE'
 | 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_ALREADY_LINKED' | 'PROFILE_ALREADY_LINKED'
 | 'ALREADY_LINKED' | 'LEGACY_EMAIL_MISSING' | 'LEGACY_EMAIL_DIFFERENT'
 | 'SELF_LINK_AVAILABLE';

export function normalizeHistoricalLinkEmail(email:string):string{
 return email.trim().toLowerCase();
}

export function classifyHistoricalLink(
 user:{id:string;email:string;participantId:string|null;emailVerifiedAt:Date|null;isActive:boolean}|null,
 participant:{id:string;user:{id:string}|null}|null,
 legacy:{email:string|null}|null,
):{code:LinkDiagnosisCode;canSelfLink:boolean}{
 const blocked=(code:LinkDiagnosisCode)=>({code,canSelfLink:false});
 if(!participant)return blocked('PROFILE_NOT_FOUND');
 if(!user)return blocked('ACCOUNT_NOT_FOUND');
 if(!user.isActive)return blocked('ACCOUNT_INACTIVE');
 if(!user.emailVerifiedAt)return blocked('EMAIL_NOT_VERIFIED');
 if(user.participantId===participant.id && participant.user?.id===user.id)return blocked('ALREADY_LINKED');
 if(user.participantId)return blocked('ACCOUNT_ALREADY_LINKED');
 if(participant.user)return blocked('PROFILE_ALREADY_LINKED');
 if(!legacy?.email?.trim())return blocked('LEGACY_EMAIL_MISSING');
 if(normalizeHistoricalLinkEmail(legacy.email)!==normalizeHistoricalLinkEmail(user.email))return blocked('LEGACY_EMAIL_DIFFERENT');
 return {code:'SELF_LINK_AVAILABLE',canSelfLink:true};
}
