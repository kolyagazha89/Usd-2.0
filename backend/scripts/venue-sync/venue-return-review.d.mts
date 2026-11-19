/** Typed contract for the read-only, fully verified return conflict candidate parser. */
export type ReviewCandidate={
 id:string;name?:string;city?:string;plate?:string;country?:string;
 brand?:string;model?:string;participantId?:string;
};
export type ReviewConflict={
 key:string;table:'Participant'|'Car';sourceId:string;
 source:ReviewCandidate;candidates:ReviewCandidate[];
};
export type Resolution={
 key:string;table:'Participant'|'Car';sourceId:string;
 action:'LINK'|'NEW'|'DEFER';targetId:string|null;
 candidateIds:string[];reason:string;
};
export declare function conflictKey(table:string,id:string):string;
export declare function participantNamesNeedReview(a:unknown,b:unknown):boolean;
export declare function canonicalVehiclePlate(car:unknown):string;
export declare function collectVenueReturnConflicts(
 snapshot:unknown,central:{participants?:unknown[];cars?:unknown[]}):ReviewConflict[];
export declare function validateVenueReviewDecisions(
 conflicts:unknown,decisions:unknown):Resolution[];
export declare function venueResolutionHash(decisions:unknown[]):string|null;
export declare function venueResolutionMap(decisions:Resolution[]):Record<string,Resolution>;
