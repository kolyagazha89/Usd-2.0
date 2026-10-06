import openpyxl,json,time
targets=["квир","йцу","теам","team acv","acv","яквенко","каргополкев","карекких","усолкев"]
out=[]
wb=openpyxl.load_workbook("USD _ Регистрация.xlsx",data_only=True,read_only=True)
for ws in wb.worksheets:
    for i,row in enumerate(ws.iter_rows(values_only=True),1):
        v=list(row)
        if i==1 or not v or not v[1]: continue
        name=str(v[1]); low=name.lower()
        if any(t in low for t in targets):
            out.append({"sheet":ws.title,"row":i,"name":name,"car":str(v[2] or ""),"reg":str(v[3] or ""),"email":str(v[11] or "")})
print(json.dumps(out,ensure_ascii=False,separators=(",",":")),flush=True)
time.sleep(3600)
