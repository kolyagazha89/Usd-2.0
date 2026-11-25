import {useEffect,useState} from 'react';
import {apiGet,listData} from '../api';

export function useParticipantStatisticsSearch(query:string){
 const [participants,setParticipants]=useState<any[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(''),[searched,setSearched]=useState(false),[attempt,setAttempt]=useState(0);
 const term=query.trim();
 useEffect(()=>{
  let current=true;
  setParticipants([]);setSearchError('');setSearched(false);setSearching(Boolean(term));
  if(!term)return;
  const timer=setTimeout(()=>{
   apiGet<any>('/statistics/participants?search='+encodeURIComponent(term)+'&limit=20')
    .then(response=>{if(current){setParticipants(listData(response));setSearched(true)}})
    .catch(error=>{if(current)setSearchError(error instanceof Error?error.message:'Ошибка поиска участника')})
    .finally(()=>{if(current)setSearching(false)});
  },300);
  return()=>{current=false;clearTimeout(timer)};
 },[term,attempt]);
 return {participants,searching,searchError,searched,retrySearch:()=>setAttempt(value=>value+1)};
}
