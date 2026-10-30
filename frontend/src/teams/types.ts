export type TeamPerson = {id:string;firstName:string;lastName:string;city?:string|null;photoUrl?:string|null};
export type TeamPost = {id:string;kind:'NEWS'|'ACHIEVEMENT';title:string;body:string;status:'DRAFT'|'IN_REVIEW'|'PUBLISHED';publishedAt?:string|null};
export type Team = {id:string;name:string;description:string;isActive:boolean;commanderUserId?:string|null;memberships?:{id:string;status:string;participant:TeamPerson}[];posts?:TeamPost[]};
export type PublicTeam = Omit<Team,'id'|'posts'> & {id:string|null;members:TeamPerson[];historicalMembers:TeamPerson[];posts:TeamPost[]};
export type TeamUser = {id:string;name?:string|null;email:string};
