type PastRegistration = {
  id?: string;
  stageId?: string;
  status?: string;
  stage?: { id?: string; date?: string | Date | null; isDeleted?: boolean } | null;
  carId?: string;
  configurationSnapshot?: {
    configurationPending?: boolean;
    postStageCompletion?: { versionId?: string | null } | null;
  } | null;
};

/** Mirror the backend's fail-closed documentary status for arbitrary JSON snapshots. */
export function isUndocumentedEquipment(snapshot:unknown):boolean {
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return false;
 const data=snapshot as Record<string,unknown>;
 if(data.configurationPending!==true)return false;
 const completion=data.postStageCompletion;
 if(!completion||typeof completion!=='object'||Array.isArray(completion))return true;
 const version=(completion as Record<string,unknown>).versionId;
 return typeof version!=='string'||!version.trim();
}

/** The server is authoritative. This mirrors its guard only to guide the participant. */
export function overdueEquipment(registrations: PastRegistration[], nextStageId?: string | null, now: Date = new Date()): PastRegistration | null {
  const nowMs = now.getTime();
  return registrations.find(registration => {
    if (registration.status !== 'ACTIVE' || !isUndocumentedEquipment(registration.configurationSnapshot)) return false;
    if (registration.stage?.isDeleted || !registration.stage?.date) return false;
    const stageId = registration.stageId ?? registration.stage.id;
    if (nextStageId && stageId === nextStageId) return false;
    const stageDate = new Date(registration.stage.date).getTime();
    return Number.isFinite(stageDate) && stageDate < nowMs;
  }) ?? null;
}
