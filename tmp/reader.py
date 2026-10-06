import openpyxl,json,time,re
targets=["каргопол","карек","кашап","квир","кияк","косолап","краснов","низафар","низаф","усол","усоль","яквен","яковен","витал","шамил","валер","теам акв","цйуй","мурзил","герасим","сма","колен","колес"]
out=[]
wb=openpyxl.load_workbook("USD _ Регистрация.xlsx",data_only=True,read_only=True)
for ws in wb.worksheets:
    for i,row in enumerate(ws.iter_rows(values_only=True),1):
        vals=list(row)
        if i==1 or not vals or not vals[1]: continue
        name=str(vals[1])
        low=name.lower()
        if any(t in low for t in targets):
            out.append({"sheet":ws.title,"row":i,"name":name,"car":str(vals[2] or ""),"reg":str(vals[3] or ""),"email":str(vals[11] or "")})
print(json.dumps(out,ensure_ascii=False,separators=(",",":")),flush=True)
time.sleep(3600)
